// site/incentives-points.test.mjs - AntSeed points helpers: buyer spend, buyer
// cap, provider (seller) reward, boost and the seller-ledger epoch window.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  sellerPointsUsage,
  sellerRewardCell,
  buyerAntsForSpend,
  buyerCapSpend,
  poolBoost,
  listPools,
} from './incentives-points.mjs';

const SNAPSHOT = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/snapshot-e23.full.json', import.meta.url)), 'utf8'));
const ANTS = 10n ** 18n;

const buyerSnap = {
  epoch: '23',
  maxRewardShareBps: '500',
  usageByEpoch: {
    23: {
      buyerBudget: String(1000n * ANTS),
      totalWeightedBuyerPoints: '1000000000',
      poolWeights: { 44694: '1' },
    },
  },
};

const sellerSnap = {
  epoch: '23',
  maxRewardShareBps: '500',
  usageByEpoch: {
    23: {
      sellerBudget: String(1000n * ANTS),
      totalWeightedPoolPoints: '10000',
      weightedPoolPoints: { 44694: '100', 52894: '4000' },
    },
  },
};

test('sellerPointsUsage: prefers the current epoch unless it collapsed 20x', () => {
  const snap = {
    epoch: '23',
    usageByEpoch: {
      23: { totalWeightedPoolPoints: '1000' },
      22: { totalWeightedPoolPoints: '900' },
    },
  };
  const su = sellerPointsUsage(snap);
  assert.equal(su.epoch, 23);
  assert.match(su.heading, /epoch 23 so far/);

  const collapsed = {
    epoch: '23',
    usageByEpoch: {
      23: { totalWeightedPoolPoints: '10' },
      22: { totalWeightedPoolPoints: '1000' },
    },
  };
  const su2 = sellerPointsUsage(collapsed);
  assert.equal(su2.epoch, 22);
  assert.match(su2.heading, /final, epoch 22/);
});

test('sellerPointsUsage: missing ledger or usage returns null', () => {
  assert.equal(sellerPointsUsage(SNAPSHOT), null);
  assert.equal(sellerPointsUsage({ epoch: '23', usageByEpoch: {} }), null);
  assert.equal(sellerPointsUsage({ epoch: '23', usageByEpoch: { 23: { totalWeightedBuyerPoints: '1' } } }), null);
});

test('sellerRewardCell: budget x pool share, capped at 5% of the budget', () => {
  const small = sellerRewardCell(sellerSnap, '44694');
  assert.equal(small.wei, 10n * ANTS); // 1000 * 100 / 10000 = 10 ANTS
  assert.equal(small.text, '10');

  const capped = sellerRewardCell(sellerSnap, '52894');
  assert.equal(capped.wei, 50n * ANTS); // 4000/10000 -> 400 ANTS, cap 5% = 50
  assert.equal(capped.text, '50');

  assert.equal(sellerRewardCell(sellerSnap, '99999').text, '0');
});

test('sellerRewardCell: old snapshot without the seller ledger renders an em dash', () => {
  const cell = sellerRewardCell(SNAPSHOT, '44694');
  assert.equal(cell.wei, null);
  assert.equal(cell.text, '\u2014');
});

test('buyerAntsForSpend: scales with spend and caps at 5% of the buyer budget', () => {
  assert.equal(buyerAntsForSpend(buyerSnap, '44694', 10), 10n * ANTS);
  assert.equal(buyerAntsForSpend(buyerSnap, '44694', 100), 50n * ANTS); // cap 5% of 1000
  assert.equal(buyerAntsForSpend(buyerSnap, '44694', 0), 0n);
  assert.equal(buyerAntsForSpend(buyerSnap, '99999', 100), 0n); // no weight
});

test('buyerAntsForSpend: no ledger returns null', () => {
  assert.equal(buyerAntsForSpend(SNAPSHOT, '44694', 100), null);
});

test('buyerCapSpend: spend at which one buyer hits the cap', () => {
  assert.equal(buyerCapSpend(buyerSnap, '44694'), 50);
  assert.equal(buyerCapSpend(buyerSnap, '99999'), null);
  assert.equal(buyerCapSpend(SNAPSHOT, '44694'), null);
});

test('poolBoost: weight in wei and ANTS at max lock', () => {
  const snap = {
    epoch: '23',
    poolWeightByEpoch: { 44694: { 24: String(104n * ANTS) } },
  };
  const boost = poolBoost(snap, '44694');
  assert.equal(boost.weightWei, 104n * ANTS);
  assert.equal(boost.stakedAnts, 1);
  assert.equal(poolBoost(snap, '52894').weightWei, 0n);
});

test('poolBoost: reads the fixture weight for the next epoch', () => {
  const raw = BigInt(SNAPSHOT.poolWeightByEpoch['44694']['24']);
  const boost = poolBoost(SNAPSHOT, '44694');
  assert.equal(boost.weightWei, raw);
  assert.ok(boost.stakedAnts > 20000);
});

test('listPools: snapshot order, deduplicated', () => {
  const snap = { positions: [{ agentId: '1' }, { agentId: '1' }, { agentId: '2' }] };
  assert.deepEqual(listPools(snap), ['1', '2']);
});

console.log('incentives_points_ok=1');
