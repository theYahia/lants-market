// Buyer personas for the rebate stake gate. A buyer's persona is the operator
// of its deposit (AntseedDeposits.getOperator) when the operator is the same
// non-zero address at the first block of the epoch and at the payout block;
// otherwise the buyer itself ("renting" an operator mid-epoch does not carry
// the operator's stake over). Node only; the pure rule is exported for tests.

import { parseAbi } from 'viem';
import { multicallResilient } from './rpc-multicall.mjs';

const DEPOSITS = '0x0F7a3a8f4Da01637d1202bb5443fcF7F88F99fD2';
const BATCH = 20;
const ZERO = '0x0000000000000000000000000000000000000000';
const abi = parseAbi(['function getOperator(address) view returns (address)']);

// buyer -> persona (lowercase). Same non-zero operator on both blocks wins.
export function personaOf(buyers, atStart, atEnd) {
  const out = {};
  for (const b of buyers) {
    const addr = String(b).toLowerCase();
    const s = String(atStart[addr] || atStart[b] || '').toLowerCase();
    const e = String(atEnd[addr] || atEnd[b] || '').toLowerCase();
    out[addr] = s !== '' && s === e && s !== ZERO ? s : addr;
  }
  return out;
}

// getOperator for many addresses at one block. A failing call is an RPC/state
// problem, not "no operator" (getOperator returns zero for unknown deposits),
// so this throws instead of silently degrading the persona map. `client`
// overrides the default RPC pair (tests).
export async function resolveOperatorsAt(addresses, block, client) {
  if (addresses.length === 0) return {};
  const calls = addresses.map((a) => ({
    address: DEPOSITS,
    abi,
    functionName: 'getOperator',
    args: [a]
  }));
  const out = {};
  for (let i = 0; i < calls.length; i += BATCH) {
    const batch = calls.slice(i, i + BATCH);
    const results = await multicallResilient({
      contracts: batch,
      blockNumber: block,
      client,
      ok: (rs) => rs.length === batch.length && rs.every((r) => r && r.status === 'success')
    });
    for (let j = 0; j < batch.length; j++) {
      const a = String(addresses[i + j]).toLowerCase();
      const op = results[j].result ? String(results[j].result).toLowerCase() : '';
      out[a] = op === ZERO ? '' : op;
    }
  }
  return out;
}
