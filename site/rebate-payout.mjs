// Rebate payout for one offer and epoch: buyers from logs, spends from buyerAgentEpochUsage at a pinned block,
// the formula from site/rebate.mjs. Node only. Spec: scripts/site/check_rebate.py (rebate_view, rebate_files).
// Usage: node site/rebate-payout.mjs --epoch N --pool ID [--from B] [--to B] [--pin B] [--dry] [--offer file] [--out dir] [--snapshot file|url]
// Without --from/--to/--pin the epoch blocks are derived from epochBoundary(N) with blockAtOrBefore.

import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { scanPool } from './rebate-scan.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { writeRebateFiles } from './rebate-files.mjs';
import { epochBoundary } from './epochs.mjs';
import { blockAtOrBefore } from './stake-positions.mjs';

const CONTRACT = '0xAdd2D85316153D7bfaF7921EE9Bf1Bb6c7A1cBc9';
const RPC_PRIMARY = 'https://mainnet.base.org';
const RPC_FALLBACK = 'https://base-mainnet.public.blastapi.io';
const BATCH = 20;

const buyerAbi = parseAbi([
  'function buyerAgentEpochUsage(uint256 epoch, address buyer, uint256 agentId) view returns ((uint256 points, uint256 weightedPoints))'
]);
const poolAbi = parseAbi([
  'function poolPointsByEpoch(uint256 epoch, address seller) view returns (uint256)'
]);

function parseArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--epoch') opts.epoch = Number(args[++i]);
    else if (a === '--pool') opts.pool = args[++i];
    else if (a === '--from') opts.from = Number(args[++i]);
    else if (a === '--to') opts.to = Number(args[++i]);
    else if (a === '--pin') opts.pin = Number(args[++i]);
    else if (a === '--dry') opts.dry = true;
    else if (a === '--offer') opts.offer = args[++i];
    else if (a === '--out') opts.out = args[++i];
    else if (a === '--snapshot') opts.snapshot = args[++i];
    else {
      console.error('rebate-payout: unknown argument ' + a);
      process.exit(2);
    }
  }
  return opts;
}

function makeClient(url) {
  return createPublicClient({
    chain: base,
    transport: http(url, { timeout: 30000 })
  });
}

async function multicallBatches(client, calls, blockNumber) {
  const results = [];
  for (let i = 0; i < calls.length; i += BATCH) {
    const batch = calls.slice(i, i + BATCH);
    let r;
    try {
      r = await client.multicall({
        contracts: batch,
        blockNumber: BigInt(blockNumber),
        allowFailure: false
      });
    } catch (e) {
      // Try fallback RPC
      const fb = makeClient(RPC_FALLBACK);
      try {
        r = await fb.multicall({
          contracts: batch,
          blockNumber: BigInt(blockNumber),
          allowFailure: false
        });
      } catch (e2) {
        throw e2;
      }
    }
    results.push(...r);
  }
  return results;
}

// Try primary first, fall back to fallback on network errors
async function callWithFallback(fn) {
  try {
    return await fn(makeClient(RPC_PRIMARY));
  } catch (e) {
    return await fn(makeClient(RPC_FALLBACK));
  }
}

const isEntry = import.meta.url === new URL(import.meta.url).pathname.endsWith('/rebate-payout.mjs') ? true : false;

async function main() {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  if (opts.epoch === undefined || opts.pool === undefined) {
    console.error('usage: node site/rebate-payout.mjs --epoch N --pool P [--from B] [--to B] [--pin B] [--dry] [--offer file --out dir --snapshot file|url]');
    process.exit(2);
  }
  if (!Number.isInteger(opts.epoch)) {
    console.error('rebate-payout: epoch must be an integer');
    process.exit(2);
  }
  for (const k of ['from', 'to', 'pin']) {
    if (opts[k] !== undefined && !Number.isInteger(opts[k])) {
      console.error(`rebate-payout: --${k} must be an integer`);
      process.exit(2);
    }
  }

  // Derive the epoch blocks deterministically when not passed: the epoch starts
  // at epochBoundary(N), ends at epochBoundary(N+1), and the payout pin is the
  // first block of N+1 plus 100.
  if (opts.from === undefined || opts.to === undefined || opts.pin === undefined) {
    const startTs = epochBoundary(opts.epoch).getTime();
    const endTs = epochBoundary(opts.epoch + 1).getTime();
    if (Date.now() < endTs) {
      console.error('rebate-payout: epoch not finished yet; pass --from/--to/--pin explicitly');
      process.exit(1);
    }
    const lastBeforeStart = await blockAtOrBefore(startTs);
    const lastBeforeEnd = await blockAtOrBefore(endTs);
    if (opts.from === undefined) opts.from = lastBeforeStart + 1;
    if (opts.to === undefined) opts.to = lastBeforeEnd;
    if (opts.pin === undefined) opts.pin = lastBeforeEnd + 100;
  }

  // 1) Scan logs for buyers and sellers of this pool in the epoch
  const scan = await scanPool({ epoch: opts.epoch, pool: opts.pool, from: opts.from, to: opts.to });
  const buyers = scan.buyers || [];
  const sellers = scan.sellers || [];

  if (sellers.length !== 1) {
    console.error(`rebate-payout: expected exactly one seller, got ${sellers.length}`);
    process.exit(1);
  }
  const seller = sellers[0];

  // 2) Get spend for each buyer via buyerAgentEpochUsage
  const agentId = BigInt(opts.pool);
  const blockNumber = BigInt(opts.pin);
  let client = makeClient(RPC_PRIMARY);

  const buyerCalls = buyers.map(buyer => ({
    address: CONTRACT,
    abi: buyerAbi,
    functionName: 'buyerAgentEpochUsage',
    args: [BigInt(opts.epoch), buyer, agentId]
  }));
  const buyerResults = await multicallBatches(client, buyerCalls, blockNumber);

  const spends = {};
  let total = 0n;
  for (let i = 0; i < buyers.length; i++) {
    let points;
    const data = buyerResults[i];
    if (Array.isArray(data)) {
      points = data[0];
    } else if (data && typeof data === 'object') {
      points = data.points;
    }
    if (points === undefined || points === null) {
      console.error(`rebate-payout: buyerAgentEpochUsage returned no points field for buyer ${buyers[i]}`);
      process.exit(1);
    }
    const p = BigInt(points);
    spends[buyers[i]] = p;
    total += p;
  }

  // 3) Aggregate from poolPointsByEpoch(epoch, seller) — the argument is the seller address
  let aggregate;
  try {
    const poolResult = await client.readContract({
      address: CONTRACT,
      abi: poolAbi,
      functionName: 'poolPointsByEpoch',
      args: [BigInt(opts.epoch), seller]
    }, { blockNumber });
    aggregate = BigInt(poolResult);
  } catch (e) {
    try {
      const fb = makeClient(RPC_FALLBACK);
      const poolResult = await fb.readContract({
        address: CONTRACT,
        abi: poolAbi,
        functionName: 'poolPointsByEpoch',
        args: [BigInt(opts.epoch), seller]
      }, { blockNumber });
      aggregate = BigInt(poolResult);
    } catch (e2) {
      throw e2;
    }
  }

  // 4) Assert Σ spend_i = aggregate over ALL buyers (including zero spends)
  if (total !== aggregate) {
    console.error(`rebate-payout: sum of spends ${total} does not equal aggregate ${aggregate}`);
    process.exit(1);
  }

  // FILES: --offer/--out (stage 4b)
  if (opts.offer) {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = fileURLToPath(new URL('..', import.meta.url));
    if (!opts.out) {
      opts.out = 'rebates';
    }
    await writeRebateFiles({ opts, spends, seller, aggregate, moduleDir, repoRoot });
  }

  // --dry prints one JSON
  if (opts.dry) {
    const out = {
      epoch: opts.epoch,
      pool: String(opts.pool),
      pinBlock: String(opts.pin),
      seller,
      buyers: buyers.length,
      totalSpend: String(total),
      aggregate: String(aggregate),
      spends: Object.fromEntries(Object.entries(spends).map(([a, v]) => [a, String(v)]))
    };
    console.log(JSON.stringify(out));
  }
}

main().catch(e => {
  console.error('rebate-payout failed: ' + (e && e.message || e));
  process.exit(1);
});
