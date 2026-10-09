// Chain access for the rebate claim UI: public-RPC reads only (no wallet), so
// statuses and trust checks work before connecting. Browser + Node (fetch).
// Everything is pinned to the canonical USDC on Base 8453.

import { SEL, TOPIC, decodeAddress, parseCampaignCreated } from './rebate-claims-abi.mjs';
import { keccak256 } from './keccak.mjs';

export const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const CHAIN_ID = 8453;
const RPC_URLS = ['https://mainnet.base.org', 'https://base-mainnet.public.blastapi.io'];

const hex = (n) => '0x' + BigInt(n).toString(16);

export async function rpc(method, params) {
  let last = new Error('rpc: no endpoint');
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      });
      if (!res.ok) {
        last = new Error('rpc HTTP ' + res.status);
        continue;
      }
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || 'rpc error');
      return j.result;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

export async function ethCall(to, data) {
  return rpc('eth_call', [{ to, data }, 'latest']);
}

// The published rebate-claims.json (dist), re-checked against the chain:
// chainId, code presence, keccak(runtime code), USDC(). Returns null when the
// file is absent (contract not deployed yet) and throws on a mismatch.
export async function loadClaimsConfig(url = './rebate-claims.json') {
  let j = null;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) j = await res.json();
  } catch {
    return null;
  }
  if (!j || !/^0x[0-9a-fA-F]{40}$/.test(String(j.address))) return null;
  if (j.chainId !== CHAIN_ID) throw new Error('rebate-claims.json: wrong chainId');
  const code = await rpc('eth_getCode', [j.address, 'latest']);
  if (!code || code === '0x') throw new Error('rebate-claims.json: no code at ' + j.address);
  if (keccak256(code) !== String(j.runtimeCodeHash).toLowerCase()) {
    throw new Error('rebate-claims.json: runtime code hash mismatch (refusing to use this address)');
  }
  const usdc = decodeAddress(await ethCall(j.address, SEL.usdc));
  if (usdc !== USDC.toLowerCase()) throw new Error('rebate-claims.json: USDC() is not the canonical token');
  return j;
}

// CampaignCreated scan (fallback when rebates/<N>-<pool>.campaign.json is not
// published). Newest-first in 2,000-block windows, capped. Results — including
// a negative one — are cached per session and per (epoch, pool), so a page
// render pays for at most one scan per offer instead of one per refresh.
const campaignCache = new Map();

export async function findCampaignId({ address, deployBlock, epochId, poolId, maxWindows = 400 }) {
  const key = `${String(address).toLowerCase()}:${epochId}:${poolId}`;
  if (campaignCache.has(key)) return campaignCache.get(key);

  let found = null;
  const latest = Number(BigInt(await rpc('eth_blockNumber', [])));
  const from0 = deployBlock ? Number(deployBlock) : 0;
  let to = latest;
  for (let w = 0; w < maxWindows && to >= from0; w++) {
    const from = Math.max(from0, to - 1999);
    const logs = await rpc('eth_getLogs', [
      { address, fromBlock: hex(from), toBlock: hex(to), topics: [TOPIC.CampaignCreated] }
    ]);
    for (const l of logs) {
      const p = parseCampaignCreated(l);
      if (p && p.epochId === BigInt(epochId) && p.poolId === String(poolId)) {
        found = p;
        break;
      }
    }
    if (found || from === from0) break;
    to = from - 1;
  }
  campaignCache.set(key, found);
  return found;
}

// Simulate a transaction from `from` via eth_call; throws with the revert data
// on failure so the UI can refuse to open the wallet.
export async function simulate(from, to, data) {
  const res = await rpc('eth_call', [{ from, to, data }, 'latest']);
  return res;
}
