import test from 'node:test';
import assert from 'node:assert/strict';
import { validRebate, rebatePayout, rebateLabel } from './rebate.mjs';

const E = 10n ** 18n;
const w = (ants) => String(BigInt(ants) * 104n * E);
const PAYER = '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B';
const offer = { type: 'rebate', pool: '52894', epochs: [23], pctBps: 300, capUsdc: 10, payer: PAYER };
const gated = { ...offer, stakeGate: { minStakeAnts: 50 } };
const pos = (id, agentId, ants, owner) => ({ id: String(id), agentId: String(agentId), owner, weightsByEpoch: { 23: w(ants) } });

test('validRebate accepts an optional stakeGate', () => {
  assert.equal(validRebate(offer), true);
  assert.equal(validRebate({ ...offer, stakeGate: { minStakeAnts: 1 } }), true);
  assert.equal(validRebate({ ...offer, stakeGate: {} }), true);
});

test('validRebate rejects a malformed stakeGate', () => {
  for (const bad of [0, -1, 1.5, '100', null]) {
    assert.equal(validRebate({ ...offer, stakeGate: { minStakeAnts: bad } }), false, String(bad));
  }
  assert.equal(validRebate({ ...offer, stakeGate: 100 }), false);
  assert.equal(validRebate({ ...offer, stakeGate: { minStakeAnts: 50, extra: 1 } }), false);
});

test('stakeGate: a buyer with enough stake gets the rebate', () => {
  const r = rebatePayout({ '0xAA': '100000000' }, gated, {}, [pos(1, 52894, 100, '0xAA')]);
  assert.deepEqual(r.payouts, { '0xaa': 3000000n });
  assert.equal(r.total, 3000000n);
});

test('stakeGate: no stake or below the minimum pays nothing', () => {
  const spends = { '0xAA': '100000000', '0xBB': '100000000', '0xCC': '100000000' };
  const positions = [pos(1, 52894, 10, '0xAA'), pos(2, 52894, 100, '0xBB')];
  const r = rebatePayout(spends, gated, {}, positions);
  assert.deepEqual(r.payouts, { '0xbb': 3000000n });
  assert.equal(r.excluded['0xaa'], 'stake_gate');
  assert.equal(r.excluded['0xcc'], 'stake_gate');
});

test('stakeGate: stake in another pool does not count', () => {
  const r = rebatePayout({ '0xAA': '100000000' }, gated, {}, [pos(1, 44694, 100, '0xAA')]);
  assert.deepEqual(r.payouts, {});
  assert.equal(r.excluded['0xaa'], 'stake_gate');
});

test('stakeGate: stakes of one owner add up', () => {
  const r = rebatePayout({ '0xAA': '100000000' }, gated, {}, [pos(1, 52894, 30, '0xAA'), pos(2, 52894, 30, '0xAA')]);
  assert.deepEqual(r.payouts, { '0xaa': 3000000n });
});

test('without stakeGate positions are ignored', () => {
  const r = rebatePayout({ '0xAA': '100000000' }, offer, {}, []);
  assert.deepEqual(r.payouts, { '0xaa': 3000000n });
});

test('rebateLabel names the stake-gated discount', () => {
  assert.match(rebateLabel(gated, 23), /stake-gated discount/);
  assert.match(rebateLabel(gated, 23), /50 ANTS/);
  assert.doesNotMatch(rebateLabel(offer, 23), /stake-gated/);
});
