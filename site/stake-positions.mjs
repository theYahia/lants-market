// Stake positions from a published lANTS snapshot, with owners resolved from the ERC-721.
// Shared by the stake and rebate payout scripts. Node only.

import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import fs from 'node:fs';

const POOLS = '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652';
const RPC = 'https://mainnet.base.org';
const abi = parseAbi(['function ownerOf(uint256) view returns (address)']);

export async function loadStakeSnapshot(src) {
  if (!/^https?:/.test(src)) return JSON.parse(fs.readFileSync(src, 'utf-8'));
  const res = await fetch(src);
  if (!res.ok) throw new Error('snapshot http ' + res.status);
  return res.json();
}

export function positionsForPool(snapshot, pool) {
  return (snapshot.positions || []).filter((p) => String(p.agentId) === String(pool));
}

export async function resolvePositionOwners(ids, block) {
  const client = createPublicClient({ chain: base, transport: http(RPC, { timeout: 30000 }) });
  const owners = {};
  for (const id of ids) {
    try {
      owners[String(id)] = (await client.readContract({
        address: POOLS, abi, functionName: 'ownerOf', args: [BigInt(id)], blockNumber: BigInt(block)
      })).toLowerCase();
    } catch {
      owners[String(id)] = '';
    }
  }
  return owners;
}

export async function positionsWithOwners(snapshot, pool) {
  const positions = positionsForPool(snapshot, pool);
  const owners = await resolvePositionOwners(positions.map((p) => String(p.id)), BigInt(snapshot.snapshotBlock));
  return positions.map((p) => ({ ...p, owner: owners[String(p.id)] || '' }));
}
