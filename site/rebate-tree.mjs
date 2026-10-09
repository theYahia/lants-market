// Rebate merkle tree: pure module (Node + browser via viem), shared by the
// payout pipeline, the publish step and the claim UI/CLI. Convention matches
// the canonical Uniswap merkle-distributor tree (src/merkle-tree.ts):
//   - leaves sorted by fixed-width lowercase hex address (byte order for 20B)
//   - leaf = keccak256(abi.encodePacked(uint256 index, address, uint256 amount))
//   - interior nodes = keccak256(concat(min(a,b), max(a,b))) (sorted pair)
//   - a single odd node is lifted unhashed
//   - an empty tree is an error (same as merkle-tree.ts).
// Leaf is 84 bytes vs a 64-byte node, so a second-preimage attack is not possible.
import { keccak256, encodePacked, concat } from 'viem';

function addrKey(addr) {
  return addr.toLowerCase().replace(/^0x/, '');
}

function leafAt(index, account, amountMicro) {
  return keccak256(encodePacked(['uint256', 'address', 'uint256'], [index, account, amountMicro]));
}

function hashPair(a, b) {
  return a < b ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

// Standard library "MerkleTree" computation over a full balanced level set.
// `level` holds 32-byte hashes; while more than one, pair sorted neighbours and
// lift an odd tail without hashing (matches combinedHash(single, undefined) -> el).
function rootOf(level) {
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(hashPair(level[i], level[i + 1]));
      } else {
        next.push(level[i]);
      }
    }
    level = next;
  }
  return level[0];
}

// Canonical getPairElement: a pair that would fall off an odd level is omitted
// (null), never zero-padded, so the proof length equals the number of real
// levels from the leaf to the root.
function proofOf(allLeaves, index) {
  const proof = [];
  let idx = index;
  let level = allLeaves;
  while (level.length > 1) {
    const peerIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    if (peerIdx < level.length) {
      proof.push(level[peerIdx]);
    }
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(hashPair(level[i], level[i + 1]));
      } else {
        next.push(level[i]);
      }
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return proof;
}

// Build the rebate claim tree for a payout map { address -> micro-USDC }.
// Returns { root, total (string micro-USDC), leaves: [{index, account, amount, proof}] }.
export function buildRebateTree(payouts) {  if (!payouts || typeof payouts !== 'object') throw new Error('rebate-tree: payouts required');
  const entries = Object.entries(payouts)
    .filter(([addr, micro]) => /^0x[0-9a-fA-F]{40}$/.test(addr) && BigInt(micro) > 0n)
    .sort((a, b) => (addrKey(a[0]) < addrKey(b[0]) ? -1 : 1));

  if (entries.length === 0) {
    throw new Error('rebate-tree: empty tree (no eligible buyers)');
  }

  const leaves = [];
  const raw = [];
  let total = 0n;
  for (let i = 0; i < entries.length; i++) {
    const [addr, micro] = entries[i];
    const account = addr.toLowerCase();
    const amount = BigInt(micro);
    raw.push(leafAt(i, account, amount));
    leaves.push({ index: i, account, amount: String(amount) });
    total += amount;
  }

  const root = rootOf(raw);
  for (const leaf of leaves) {
    leaf.proof = proofOf(raw, leaf.index);
  }

  return { root, total: String(total), leaves };
}

// The leaf of `account` in a published tree, or null.
export function leafFor(tree, account) {
  const a = String(account).toLowerCase();
  for (const leaf of (tree && tree.leaves) || []) {
    if (String(leaf.account).toLowerCase() === a) return leaf;
  }
  return null;
}
