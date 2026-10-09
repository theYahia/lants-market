// Resilient read-only multicall over the two public Base RPCs. Node only.
// Mainnet.base.org rate-limits under load; the blastapi fallback may be pruned
// for old blocks and then returns per-call failures. Neither is trusted blindly:
// the caller passes an `ok` predicate for acceptable results, and we retry the
// primary with a backoff, then the fallback.

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

export const RPC_PRIMARY = 'https://mainnet.base.org';
export const RPC_FALLBACK = 'https://base-mainnet.public.blastapi.io';

export function makeClient(url) {
  return createPublicClient({ chain: base, transport: http(url, { timeout: 30000 }) });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `client` (tests) bypasses the RPC pair and is called once. Without it the
// primary is tried twice, then the fallback twice, with a small backoff.
export async function multicallResilient({ contracts, blockNumber, client, ok }) {
  const attempts = client ? [client] : [RPC_PRIMARY, RPC_PRIMARY, RPC_FALLBACK, RPC_FALLBACK];
  let last = new Error('multicall: no attempt succeeded');
  for (let i = 0; i < attempts.length; i++) {
    const c = client || makeClient(attempts[i]);
    try {
      const results = await c.multicall({ contracts, blockNumber: BigInt(blockNumber), allowFailure: true });
      if (ok(results)) return results;
      last = new Error('multicall: results rejected by the caller check');
    } catch (e) {
      last = e;
    }
    if (!client && i < attempts.length - 1) await sleep(700 + Math.random() * 800);
  }
  throw last;
}
