import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRebateTree } from './rebate-tree.mjs';
import { leafHash, rootFromProof, verifyTree } from './rebate-claim.mjs';

const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C = '0xcccccccccccccccccccccccccccccccccccccccc';

test('verifyTree accepts the tree built by site/rebate-tree.mjs (odd leaf included)', () => {
  const t = buildRebateTree({ [A]: '1250000', [B]: '2500000', [C]: '3750000' });
  assert.equal(verifyTree(t), true);
});

test('verifyTree rejects a tampered proof or a tampered root', () => {
  const t = buildRebateTree({ [A]: '1250000', [B]: '2500000' });
  const bad = JSON.parse(JSON.stringify(t));
  bad.leaves[0].proof = ['0x' + 'ab'.repeat(32)];
  assert.equal(verifyTree(bad), false);
  const wrongRoot = JSON.parse(JSON.stringify(t));
  wrongRoot.root = '0x' + 'cd'.repeat(32);
  assert.equal(verifyTree(wrongRoot), false);
  assert.equal(verifyTree({ root: t.root, leaves: [] }), false);
});

test('leafHash and rootFromProof follow the canonical convention', () => {
  const t = buildRebateTree({ [A]: '1000000' });
  const leaf = leafHash(0, A, '1000000');
  assert.equal(leaf, t.root, 'a single leaf is its own root');
  assert.equal(rootFromProof(leaf, []), t.root);
  const two = buildRebateTree({ [A]: '1000000', [B]: '2000000' });
  assert.equal(rootFromProof(leafHash(0, A, '1000000'), two.leaves[0].proof), two.root);
  assert.equal(rootFromProof(leafHash(1, B, '2000000'), two.leaves[1].proof), two.root);
});
