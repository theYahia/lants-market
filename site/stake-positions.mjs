// Stake positions from a published lANTS snapshot, with owners resolved from the ERC-721.
// Shared by the stake and rebate payout scripts. Node only.
//
// Rebate persona gate needs the owner per position on TWO blocks (first block of
// the epoch and the payout block) plus a Transfer scan over (startBlock, payoutBlock]:
// a position "sticks" for the whole epoch only if the owner is the same on both
// blocks and no Transfer moved it in between.

import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import fs from 'node:fs';
import { scanLogs } from './rebate-scan.mjs';
import { multicallResilient } from './rpc-multicall.mjs';

const POOLS = '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652';
const RPC_PRIMARY = 'https://mainnet.base.org';
const RPC_FALLBACK = 'https://base-mainnet.public.blastapi.io';
const BATCH = 20;
// keccak256('Transfer(address,address,uint256)'), the universal ERC-20/721 topic.
const TRANSFER_TOPIC0 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const abi = parseAbi(['function ownerOf(uint256) view returns (address)']);

function makeClient(url) {
  return createPublicClient({ chain: base, transport: http(url, { timeout: 30000 }) });
}

async function callWithFallback(fn) {
  try {
    return await fn(makeClient(RPC_PRIMARY));
  } catch (e) {
    return await fn(makeClient(RPC_FALLBACK));
  }
}

export async function loadStakeSnapshot(src) {
  if (!/^https?:/.test(src)) return JSON.parse(fs.readFileSync(src, 'utf-8'));
  const res = await fetch(src);
  if (!res.ok) throw new Error('snapshot http ' + res.status);
  return res.json();
}

export function positionsForPool(snapshot, pool) {
  return (snapshot.positions || []).filter((p) => String(p.agentId) === String(pool));
}

// Resolve ownerOf for many ids at one block via multicall, keeping the "unknown
// token -> ''" behaviour (a failed call must never fail the whole batch).
// `client` overrides the default RPC pair (tests).
export async function resolveOwnersAt(ids, block, client) {
  if (ids.length === 0) return {};
  const calls = ids.map((id) => ({
    address: POOLS,
    abi,
    functionName: 'ownerOf',
    args: [BigInt(id)]
  }));
  const owners = {};
  for (let i = 0; i < calls.length; i += BATCH) {
    const batch = calls.slice(i, i + BATCH);
    // A per-id revert (burned/unknown token) is ''; every call failing at one
    // block is an RPC/state problem, not "every token is gone" — refuse it.
    const results = await multicallResilient({
      contracts: batch,
      blockNumber: block,
      client,
      ok: (rs) => rs.some((r) => r && r.status === 'success')
    });
    for (let j = 0; j < batch.length; j++) {
      const id = ids[i + j];
      const r = results[j];
      owners[String(id)] = r && r.status === 'success' && r.result ? String(r.result).toLowerCase() : '';
    }
  }
  return owners;
}

// Owner of record per position: the same non-empty owner on both blocks and no
// Transfer in between; otherwise '' (the position does not stick all epoch).
export function mergePositionOwners(positions, atStart, atEnd, moved) {
  return positions.map((p) => {
    const id = String(p.id);
    const ownerAtStart = atStart[id] || '';
    const ownerAtEnd = atEnd[id] || '';
    const owner = ownerAtStart === ownerAtEnd && ownerAtStart !== '' && !moved.has(id) ? ownerAtEnd : '';
    return { ...p, ownerAtStart, ownerAtEnd, owner };
  });
}

// Token ids among `tokenIds` moved between fromBlock and toBlock (inclusive).
// One resilient range scan (windows/split/retry, see rebate-scan.scanLogs);
// `opts.client` (viem-style getLogs) or `opts.rpcUrl` override the default RPC.
export async function scanTransfers(tokenIds, fromBlock, toBlock, opts = {}) {
  if (tokenIds.length === 0) return new Set();
  const wanted = new Set(tokenIds.map((x) => String(x)));
  const logs = opts.client
    ? await opts.client.getLogs({
        address: POOLS,
        topics: [TRANSFER_TOPIC0],
        fromBlock: BigInt(fromBlock),
        toBlock: BigInt(toBlock)
      })
    : await scanLogs({
        address: POOLS,
        topics: [TRANSFER_TOPIC0],
        from: fromBlock,
        to: toBlock,
        rpcUrl: opts.rpcUrl
      });
  const moved = new Set();
  for (const l of logs || []) {
    const topics = l.topics || [];
    let id;
    if (topics.length >= 4) {
      id = BigInt(topics[3]).toString();
    } else if (l.data && l.data !== '0x') {
      // ERC-721 without an indexed tokenId: third word of data.
      const word = l.data.slice(2 + 128, 2 + 192);
      if (word.length === 64) id = BigInt('0x' + word).toString();
    }
    if (id && wanted.has(id)) moved.add(id);
  }
  return moved;
}

// Owners on two blocks + Transfer scan over (startBlock, endBlock].
// `deps` (tests): { client, rpcUrl, resolveOwnersAt, scanTransfers }.
export async function positionsWithOwnersAt(snapshot, pool, startBlock, endBlock, deps = {}) {
  const positions = positionsForPool(snapshot, pool);
  const ids = positions.map((p) => String(p.id));
  const resolve = deps.resolveOwnersAt || resolveOwnersAt;
  const scan = deps.scanTransfers || scanTransfers;
  const [atStart, atEnd] = await Promise.all([
    resolve(ids, startBlock, deps.client),
    resolve(ids, endBlock, deps.client)
  ]);
  // A Transfer in the start block itself does not break "held at the start".
  const moved = await scan(ids, Number(startBlock) + 1, endBlock, deps);
  return mergePositionOwners(positions, atStart, atEnd, moved);
}

// Highest block whose timestamp is <= timestampMs (unix milliseconds). Binary
// search over eth_getBlockByNumber. Returns a plain number. `client` overrides
// the default RPC pair (tests).
export async function blockAtOrBefore(timestampMs, client) {
  const target = Math.floor(Number(timestampMs) / 1000);

  async function search(c) {
    const latest = BigInt(await c.getBlockNumber());
    const latestTime = (await c.getBlock({ blockNumber: latest })).timestamp;
    if (latestTime <= BigInt(target)) return Number(latest);
    let lo = 0n;
    let hi = latest;
    while (lo < hi) {
      const mid = (lo + hi + 1n) / 2n;
      const t = (await c.getBlock({ blockNumber: mid })).timestamp;
      if (t <= BigInt(target)) lo = mid;
      else hi = mid - 1n;
    }
    return Number(lo);
  }

  if (client) return search(client);
  return callWithFallback(search);
}
