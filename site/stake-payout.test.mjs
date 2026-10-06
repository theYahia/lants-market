import test from 'node:test';
import assert from 'node:assert/strict';
import { stakePayout, validStakeOffer } from './stake-payout.mjs';

const E = 10n ** 18n;
const w = (ants) => String(BigInt(ants) * 104n * E);
const offer = { pool: '44694', epochs: [25], usdcPer1k: 1, capAnts: 10000, pays: 'new', payer: '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B' };
const pos = (id, agentId, start, ants) => ({ id: String(id), agentId: String(agentId), stakeStartEpoch: String(start), weightsByEpoch: { 25: w(ants) } });

test('new: only stakeStartEpoch == N in the pool are paid', () => {
  const r = stakePayout([pos(1, 44694, 24, 5000), pos(2, 44694, 25, 2000), pos(3, 52894, 25, 9000)], offer, 25, { 1: '0xA', 2: '0xB', 3: '0xC' }, {});
  assert.deepEqual(r.payouts, { '0xb': '2000000' });
  assert.equal(r.total, '2000000');
});

test('new: creation order until capAnts, total never above cap budget', () => {
  const r = stakePayout([pos(5, 44694, 25, 8000), pos(4, 44694, 25, 6000)], offer, 25, { 4: '0xA', 5: '0xB' }, {});
  assert.deepEqual(r.payouts, { '0xa': '6000000', '0xb': '4000000' });
  assert.equal(r.total, '10000000');
});

test('no new stakes: zero recipients, zero total', () => {
  const r = stakePayout([pos(41, 44694, 24, 19795)], offer, 25, { 41: '0x1d90' }, {});
  assert.deepEqual(r.payouts, {});
  assert.equal(r.total, '0');
});

test('payer and own addresses are excluded with a reason', () => {
  const r = stakePayout([pos(7, 44694, 25, 1000)], offer, 25, { 7: offer.payer }, { [offer.payer]: 'payer' });
  assert.deepEqual(r.payouts, {});
  assert.equal(r.excluded[offer.payer.toLowerCase()], 'payer');
});

test('all: pro rata over the cap', () => {
  const all = { ...offer, pays: 'all' };
  const r = stakePayout([pos(1, 44694, 20, 15000), pos(2, 44694, 20, 5000)], all, 25, { 1: '0xA', 2: '0xB' }, {});
  assert.deepEqual(r.payouts, { '0xa': '7500000', '0xb': '2500000' });
});

test('validStakeOffer: rebate entries and bad pays are rejected', () => {
  assert.equal(validStakeOffer(offer), true);
  assert.equal(validStakeOffer({ ...offer, type: 'rebate' }), false);
  assert.equal(validStakeOffer({ ...offer, pays: 'some' }), false);
});
