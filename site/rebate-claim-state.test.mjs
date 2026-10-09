import test from 'node:test';
import assert from 'node:assert/strict';
import { claimState, statusText } from './rebate-claim-state.mjs';

const ROOT = '0x' + 'ab'.repeat(32);
const OTHER = '0x' + 'cd'.repeat(32);
const ZERO = '0x' + '00'.repeat(32);

// epochStart 1000, epochEnd 2000 -> objections end 174800, finalizeDeadline 261200.
const EPOCH_START = 1000;
const EPOCH_END = 2000;
const baseCampaign = (over = {}) => ({
  owner: '0x1111111111111111111111111111111111111111',
  pendingOwner: '0x0000000000000000000000000000000000000000',
  cancelDeadline: 1000n,
  finalizeDeadline: 261200n,
  claimWindow: 1209600n,
  epochId: 27n,
  poolId: '52894',
  root: ZERO,
  total: 0n,
  funded: 20000000n,
  claimed: 0n,
  sweepAfter: 0n,
  ...over
});

const call = (now, campaign, tree) => claimState({ now, epochStart: EPOCH_START, epochEnd: EPOCH_END, campaign, tree });

test('no campaign: launch before the epoch, expired after it starts', () => {
  assert.equal(call(500, null, null).state, 'awaiting_launch');
  assert.equal(call(500, null, null).actions.launch, true);
  assert.equal(call(1500, null, null).state, 'not_funded_expired');
  assert.equal(call(1500, null, null).actions.launch, undefined);
});

test('funded campaign: cancel and transfer before the cancel deadline', () => {
  const r = call(500, baseCampaign(), null);
  assert.equal(r.state, 'funded');
  assert.deepEqual(r.actions, { cancel: true, transfer: true });
  assert.equal(r.info.funded, '20000000');
  assert.equal(r.info.remaining, '20000000');
});

test('awaiting finalize: before the objections end; finalize opens after', () => {
  const early = call(170000, baseCampaign(), { root: ROOT });
  assert.equal(early.state, 'awaiting_finalize');
  assert.equal(early.actions.finalize, false, 'finalize is gated on the objections window');
  const ready = call(180000, baseCampaign(), { root: ROOT });
  assert.equal(ready.state, 'awaiting_finalize');
  assert.equal(ready.actions.finalize, true);
  const noTree = call(180000, baseCampaign(), null);
  assert.equal(noTree.actions.finalize, false, 'no tree -> nothing to finalize');
});

test('past finalizeDeadline: sweep, with and without a published tree', () => {
  const empty = call(300000, baseCampaign(), null);
  assert.equal(empty.state, 'no_eligible_buyers');
  assert.deepEqual(empty.actions, { sweep: true });
  const withTree = call(300000, baseCampaign(), { root: ROOT });
  assert.equal(withTree.state, 'not_finalized_expired');
});

test('finalized: no tree or a mismatched root disables the claim', () => {
  const noTree = call(280000, baseCampaign({ root: ROOT, total: 500n, sweepAfter: 500000n }), null);
  assert.equal(noTree.state, 'no_tree');
  const mismatch = call(280000, baseCampaign({ root: ROOT, total: 500n, sweepAfter: 500000n }), { root: OTHER });
  assert.equal(mismatch.state, 'root_mismatch');
  assert.equal(mismatch.actions.claim, undefined);
});

test('finalized with a matching root: claims open, then sweepable', () => {
  const open = call(280000, baseCampaign({ root: ROOT, total: 500n, sweepAfter: 500000n }), { root: ROOT.toUpperCase().replace('0X', '0x') });
  assert.equal(open.state, 'claims_open');
  assert.equal(open.actions.claim, true);
  const done = call(600000, baseCampaign({ root: ROOT, total: 500n, sweepAfter: 500000n }), { root: ROOT });
  assert.equal(done.state, 'sweepable');
  assert.deepEqual(done.actions, { sweep: true });
});

test('statusText carries the words the board shows', () => {
  assert.match(statusText('awaiting_launch', null), /awaiting launch/);
  assert.match(statusText('not_funded_expired', null), /not funded — expired/);
  assert.match(statusText('funded', { funded: '20000000', total: '0', cancelDeadline: 1792058061 }), /funded \$20\.00/);
  assert.match(statusText('awaiting_finalize', { finalizeDeadline: 1792662861, objectionsEnd: 1792317261 }), /awaiting finalize/);
  assert.match(statusText('root_mismatch', null), /root mismatch/);
  assert.match(statusText('claims_open', { sweepAfter: 1792662861 }), /claims open · claim by 2026-10-22/);
  assert.match(statusText('sweepable', { remaining: '1000000' }), /unclaimed \$1\.00/);
});
