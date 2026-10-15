// Chain access for the rebate claim UI: public-RPC reads only (no wallet), so
// statuses and trust checks work before connecting. Browser + Node (fetch).
// Everything is pinned to the canonical USDC on Base 8453.

import { SEL, TOPIC, decodeAddress, decodeCampaign, encCampaignData, parseCampaignCreated } from './rebate-claims-abi.mjs';
import { keccak256 } from './keccak.mjs';

// --- Constants ---------------------------------------------------------------

export const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const CHAIN_ID = 8453;
const RPC_URLS = ['https://mainnet.base.org', 'https://base-mainnet.public.blastapi.io'];

// nextCampaignId() — public state counter (selector precomputed with viem).
const NEXT_CAMPAIGN_ID_SELECTOR = '0x7903a756';
// Public RPCs now cap eth_getLogs ranges hard (blastapi: 10 blocks), so the
// primary campaign lookup enumerates ids through eth_call; the event scan
// stays as a fallback for deployments where the counter read fails.
const MAX_ENUM_CAMPAIGNS = 64;

const hex = (n) => '0x' + BigInt(n).toString(16);

// --- Low-level RPC -----------------------------------------------------------

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

// --- Trust check -------------------------------------------------------------

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

// --- Campaign lookup ---------------------------------------------------------

// Results — including an empty list — are cached per session and per
// (epoch, pool), so a page render pays for at most one lookup per offer
// instead of one per refresh.
const campaignCache = new Map();

// Primary: walk ids from the nextCampaignId counter and read each campaign.
// Returns candidates for the (epoch, pool) pair, oldest-first, or throws when
// the counter read fails or grows past the enumeration bound.
async function enumerateCampaigns({ address, epochId, poolId }) {
  const next = BigInt(await ethCall(address, NEXT_CAMPAIGN_ID_SELECTOR));
  if (next > BigInt(MAX_ENUM_CAMPAIGNS)) {
    throw new Error('campaign counter above the enumeration bound');
  }
  const found = [];
  for (let id = 0n; id < next; id++) {
    const c = decodeCampaign(await ethCall(address, encCampaignData(id)));
    if (c.epochId === BigInt(epochId) && String(c.poolId) === String(poolId)) {
      found.push({ id, owner: c.owner, epochId: c.epochId, poolId: c.poolId });
    }
  }
  return found;
}

// Fallback: CampaignCreated events, newest-first in 2,000-block windows.
// Returns the same candidate shape as enumerateCampaigns, oldest-first.
async function scanCampaignCreated({ address, deployBlock, epochId, poolId, maxWindows }) {
  const found = [];
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
      if (p && p.epochId === BigInt(epochId) && p.poolId === String(poolId)) found.push(p);
    }
    if (from === from0) break;
    to = from - 1;
  }
  found.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return found;
}

export async function findCampaigns({ address, deployBlock, epochId, poolId, maxWindows = 400 }) {
  const key = `${String(address).toLowerCase()}:${epochId}:${poolId}`;
  if (campaignCache.has(key)) return campaignCache.get(key);

  let found;
  try {
    found = await enumerateCampaigns({ address, epochId, poolId });
  } catch {
    found = await scanCampaignCreated({ address, deployBlock, epochId, poolId, maxWindows });
  }
  campaignCache.set(key, found);
  return found;
}

// --- Simulation --------------------------------------------------------------

// Simulate a transaction from `from` via eth_call; throws with the revert data
// on failure so the UI can refuse to open the wallet.
export async function simulate(from, to, data) {
  return rpc('eth_call', [{ from, to, data }, 'latest']);
}
