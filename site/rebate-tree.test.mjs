import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, encodePacked, concat } from 'viem';
import { buildRebateTree, leafFor } from './rebate-tree.mjs';

// Mirror of Solidity MerkleProof.processProof/_hashPair (sorted pair) used to
// independently re-derive the root from a leaf + proof. The authoritative check
// against the live contract is the forge cross-test in contracts/test/fixtures.
function hashPair(a, b) {
  return a < b ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

function processProof(proof, leaf) {
  let h = leaf;
  for (const p of proof) h = hashPair(h, p);
  return h;
}

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const C = '0x3333333333333333333333333333333333333333';
const D = '0x4444444444444444444444444444444444444444';

test('empty tree throws', () => {
  assert.throws(() => buildRebateTree({}), /empty tree/);
  assert.throws(() => buildRebateTree({ [A]: '0' }), /empty tree/);
});

test('single leaf: root is the leaf, proof empty, total correct', () => {
  const t = buildRebateTree({ [A]: '1000000' });
  assert.equal(t.total, '1000000');
  assert.equal(t.leaves.length, 1);
  assert.deepEqual(t.leaves[0].proof, []);
  assert.equal(t.root, keccak256(encodePacked(['uint256', 'address', 'uint256'], [0, A.toLowerCase(), 1000000n])));
});

test('leaves are sorted by lowercase address', () => {
  const t = buildRebateTree({
    [B]: '1000000',
    [A]: '2000000',
    [D]: '4000000',
    [C]: '3000000',
  });
  assert.deepEqual(
    t.leaves.map((l) => l.account),
    [A, B, C, D].map((a) => a.toLowerCase()),
  );
  assert.equal(t.leaves[0].index, 0);
  assert.equal(t.leaves[3].index, 3);
  assert.equal(t.leaves[0].amount, '2000000');
});

test('total is the sum of all leaves', () => {
  const t = buildRebateTree({ [A]: '1000000', [B]: '2000000', [C]: '3000000', [D]: '4000000' });
  assert.equal(t.total, '10000000');
  assert.equal(String([1000000, 2000000, 3000000, 4000000].reduce((a, b) => a + b, 0)), '10000000');
});

test('every leaf proof reconstructs the root (power of two)', () => {
  const t = buildRebateTree({ [A]: '1000000', [B]: '2000000', [C]: '3000000', [D]: '4000000' });
  for (const leaf of t.leaves) {
    const node = keccak256(encodePacked(['uint256', 'address', 'uint256'], [leaf.index, leaf.account, BigInt(leaf.amount)]));
    assert.equal(processProof(leaf.proof, node), t.root, `leaf ${leaf.index} proof`);
  }
});

test('every leaf proof reconstructs the root (odd count, lifted node)', () => {
  const t = buildRebateTree({ [A]: '1000000', [B]: '2000000', [C]: '3000000' });
  assert.equal(t.leaves.length, 3);
  for (const leaf of t.leaves) {
    const node = keccak256(encodePacked(['uint256', 'address', 'uint256'], [leaf.index, leaf.account, BigInt(leaf.amount)]));
    assert.equal(processProof(leaf.proof, node), t.root, `leaf ${leaf.index} proof`);
  }
});

test('buildRebateTree is deterministic', () => {
  const payout = { [B]: '5000000', [A]: '7000000', [C]: '9000000' };
  const t1 = buildRebateTree(payout);
  const t2 = buildRebateTree(payout);
  assert.equal(t1.root, t2.root);
});

test('fixed vector: known payout set has a stable root', () => {
  // Cross-validated against the RebateClaims contract in the forge cross-test
  // (contracts/test/fixtures/). Any change to this expectation must also change
  // that fixture.
  const t = buildRebateTree({
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': '1250000',
    '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb': '2500000',
    '0xcccccccccccccccccccccccccccccccccccccccc': '3750000',
  });
  assert.equal(t.total, '7500000');
  assert.equal(t.root, '0x5a1ebceeca0a7be01d190b120c2d2bfbe1a79b8260b97aeccf41d8f605a8013a');
  // odd leaf (last) is lifted -> single-element proof
  assert.equal(t.leaves[2].proof.length, 1);
  assert.equal(t.leaves[0].proof.length, 2);
});

test('leafFor: finds a leaf case-insensitively, null otherwise', () => {
  const t = buildRebateTree({
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': '1250000',
    '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb': '2500000'
  });
  const leaf = leafFor(t, '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  assert.equal(leaf.index, 0);
  assert.equal(leaf.amount, '1250000');
  assert.equal(leafFor(t, '0xcccccccccccccccccccccccccccccccccccccccc'), null);
  assert.equal(leafFor(null, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), null);
});
