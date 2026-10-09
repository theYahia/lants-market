import test from 'node:test';
import assert from 'node:assert/strict';
import { claimState, statusText, pickCanonical, isCanonicalCampaign } from './rebate-claim-state.mjs';
import { campaignParams } from './rebate-campaign.mjs';

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
  // The contract rejects claim at exactly sweepAfter (>=), so the UI must not
  // offer a claim in that second.
  const boundary = call(500000, baseCampaign({ root: ROOT, total: 500n, sweepAfter: 500000n }), { root: ROOT });
  assert.equal(boundary.state, 'sweepable');
  assert.deepEqual(boundary.actions, { sweep: true });
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

// --- canonical campaign selection (F1): a foreign campaign on the same
// (epoch, pool) must never be shown or hide the seller's launch button ---

const PAYER = '0x3d4cccfaa3b25997f4ab33f838558521259eef1b';
const CAMPAIGN_WALLET = '0x2222222222222222222222222222222222222222';
const ATTACKER = '0x9999999999999999999999999999999999999999';
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

const CANON_OFFER = { type: 'rebate', pool: '11111', epochs: [28], pctBps: 300, capUsdc: 10, payer: PAYER };
const CANON_PARAMS = campaignParams(CANON_OFFER, 28);

const canonicalCampaign = (owner, over = {}) => ({
  owner,
  pendingOwner: ZERO_ADDR,
  cancelDeadline: BigInt(CANON_PARAMS.cancelDeadline),
  finalizeDeadline: BigInt(CANON_PARAMS.finalizeDeadline),
  claimWindow: BigInt(CANON_PARAMS.claimWindow),
  epochId: 28n,
  poolId: '11111',
  root: ZERO,
  total: 0n,
  funded: 10000000n,
  claimed: 0n,
  sweepAfter: 0n,
  ...over
});

const authorization = (over = {}) => ({
  payer: PAYER,
  campaignWallet: CAMPAIGN_WALLET,
  epochId: 28,
  poolId: '11111',
  cancelDeadline: CANON_PARAMS.cancelDeadline,
  finalizeDeadline: CANON_PARAMS.finalizeDeadline,
  claimWindow: CANON_PARAMS.claimWindow,
  signature: '0x' + 'ab'.repeat(65),
  ...over
});

test('canonical: a lone squatter is not canonical, so launch stays visible', () => {
  const candidates = [{ id: 9n, owner: ATTACKER }];
  const campaigns = { 9: canonicalCampaign(ATTACKER) };
  assert.equal(pickCanonical(candidates, campaigns, CANON_OFFER, null), null);
  // What the UI does with the null: no campaign block, the state machine shows launch.
  const state = call(500, null, null);
  assert.equal(state.state, 'awaiting_launch');
  assert.equal(state.actions.launch, true);
});

test('canonical: a squatter newer than the payer campaign loses', () => {
  const candidates = [
    { id: 7n, owner: ATTACKER },
    { id: 3n, owner: PAYER }
  ];
  const campaigns = { 7: canonicalCampaign(ATTACKER), 3: canonicalCampaign(PAYER) };
  assert.equal(pickCanonical(candidates, campaigns, CANON_OFFER, null), 3n);
});

test('canonical: the authorized campaign wallet of the payer is accepted', () => {
  const candidates = [{ id: 4n, owner: CAMPAIGN_WALLET }];
  const campaigns = { 4: canonicalCampaign(CAMPAIGN_WALLET) };
  assert.equal(pickCanonical(candidates, campaigns, CANON_OFFER, authorization()), 4n);
  assert.equal(pickCanonical(candidates, campaigns, CANON_OFFER, null), null, 'same wallet without an authorization');
});

test('canonical: an authorization with different deadlines does not match', () => {
  const candidates = [{ id: 4n, owner: CAMPAIGN_WALLET }];
  const campaigns = { 4: canonicalCampaign(CAMPAIGN_WALLET) };
  const stale = authorization({ cancelDeadline: CANON_PARAMS.cancelDeadline - 1 });
  assert.equal(pickCanonical(candidates, campaigns, CANON_OFFER, stale), null);
  const wrongPay = authorization({ payer: ATTACKER });
  assert.equal(pickCanonical(candidates, campaigns, CANON_OFFER, wrongPay), null);
});

test('canonical: deadlines that do not match the epoch-derived params are rejected', () => {
  const skewed = canonicalCampaign(PAYER, { finalizeDeadline: BigInt(CANON_PARAMS.finalizeDeadline + 3600) });
  assert.equal(isCanonicalCampaign(skewed, CANON_OFFER, null), false);
  const wrongPool = canonicalCampaign(PAYER, { poolId: '44694' });
  assert.equal(isCanonicalCampaign(wrongPool, CANON_OFFER, null), false);
  assert.equal(isCanonicalCampaign(canonicalCampaign(PAYER), CANON_OFFER, null), true);
});
