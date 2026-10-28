// site/incentives.test.mjs - incentives pure helpers (offer validation, cashback,
// countdown/utc formatting, network metrics, pool model) + the snapshot-e23 fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setupDom, teardown } from './dom-test-helper.mjs';

const SNAPSHOT = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/snapshot-e23.full.json', import.meta.url)), 'utf8'));
const OFFERS = JSON.parse(readFileSync(fileURLToPath(new URL('./offers.json', import.meta.url)), 'utf8'));

let inc;

test.before(async () => {
  setupDom();
  inc = await import('./incentives.mjs');
});
test.after(() => teardown());

// A valid stake offer matching the offers.json shape.
const stakeOffer = {
  pool: '44694',
  epochs: [25],
  usdcPer1k: 1,
  capAnts: 10000,
  payer: '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B',
  pays: 'new',
};

const rebateOffer = {
  type: 'rebate',
  pool: '52894',
  epochs: [28],
  pctBps: 100,
  capUsdc: 1,
  capPerBuyerUsdc: 0.2,
  payer: '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B',
};

test('isValidOffer: accepts a well-formed stake offer for the right epoch', () => {
  assert.equal(inc.isValidOffer(stakeOffer, 25), true);
  assert.equal(inc.isValidOffer(OFFERS[0], 25), true);
});

test('isValidOffer: rejects wrong epoch, bad pool, non-positive rates, bad payer', () => {
  assert.equal(inc.isValidOffer(stakeOffer, 26), false); // epoch mismatch
  assert.equal(inc.isValidOffer({ ...stakeOffer, pool: 'abc' }, 25), false);
  assert.equal(inc.isValidOffer({ ...stakeOffer, usdcPer1k: 0 }, 25), false);
  assert.equal(inc.isValidOffer({ ...stakeOffer, capAnts: -1 }, 25), false);
  assert.equal(inc.isValidOffer({ ...stakeOffer, payer: '0x1234' }, 25), false);
  assert.equal(inc.isValidOffer({ ...stakeOffer, epochs: [25, 26] }, 25), false); // one epoch only
  assert.equal(inc.isValidOffer({ ...stakeOffer, pays: 'sometimes' }, 25), false);
  assert.equal(inc.isValidOffer(null, 25), false);
});

test('isValidOffer: a rebate-shaped offer is not a stake offer', () => {
  assert.equal(inc.isValidOffer(rebateOffer, 28), false);
});

test('offerLine: includes pool name, rate, rule and payer short form', () => {
  const { line, note } = inc.offerLine(stakeOffer, 25, {});
  assert.match(line, /Pool 44694/);
  assert.match(line, /1 USDC per 1,000 ANTS at max lock/);
  assert.match(line, /epoch 25/);
  assert.match(line, /new stakes only/);
  assert.match(line, /max 10 USDC for the first 10,000 ANTS/);
  assert.match(line, /paid by 0x3d4C…ef1B/);
  assert.equal(note, '');
  const named = inc.offerLine({ ...stakeOffer, pool: '52894' }, 25, { 52894: 'Apex' });
  assert.match(named.line, /Apex \(pool 52894\)/);
});

test('buildOfferRows: valid offers get offer lines, rebates get rebate lines', () => {
  const source = [stakeOffer, rebateOffer, { ...stakeOffer, pool: 'bad' }];
  // At display epoch 25 the stake offer is valid; the epoch-28 rebate is a valid
  // schema so it renders as an upcoming rebate line too.
  const rows = inc.buildOfferRows(source, 25, {});
  assert.equal(rows.length, 2);
  assert.match(rows[0].line, /Pool 44694/);
  assert.match(rows[1].line, /1% back, up to \$1/);
  // At its own epoch the rebate shows a line; the stale stake offer is skipped.
  const rebateRows = inc.buildOfferRows(source, 28, {});
  assert.equal(rebateRows.length, 1);
  assert.match(rebateRows[0].line, /1% back, up to \$1/);
});

test('nextBudget: honors the stakerBudgetNextEpoch window', () => {
  const snap = { stakerBudgetNext: '5000000000000000000000', stakerBudgetNextEpoch: '25' };
  assert.equal(inc.nextBudget(snap, 25), 5000);
  assert.equal(inc.nextBudget(snap, 26), null);
  assert.equal(inc.nextBudget(SNAPSHOT, 25), null); // fixture has no next budget
});

test('formatCountdown: days, hours and minutes with zero padding', () => {
  assert.equal(inc.formatCountdown(0), '0d 00h 00m');
  assert.equal(inc.formatCountdown(86400000 + 3600000 + 2 * 60000 + 1000), '1d 01h 02m');
  assert.equal(inc.formatCountdown(-5000), '0d 00h 00m');
});

test('formatUtc: weekday, month, day, year and HH:MM UTC', () => {
  const d = new Date('2026-10-28T14:05:00Z');
  assert.equal(inc.formatUtc(d), 'Wed Oct 28, 2026 14:05 UTC');
  const late = new Date('2026-01-01T23:59:00Z');
  assert.equal(inc.formatUtc(late), 'Thu Jan 1, 2026 23:59 UTC');
});

test('cashbackUsage: prefers the current epoch unless it collapsed 20x', () => {
  const snap = {
    epoch: '23',
    usageByEpoch: {
      23: { totalWeightedBuyerPoints: '1000' },
      22: { totalWeightedBuyerPoints: '900' },
    },
  };
  const cb = inc.cashbackUsage(snap);
  assert.equal(cb.epoch, 23);
  assert.equal(cb.heading, 'Buyer ANTS per $1, epoch 23 so far');

  // current < prev / 20 -> falls back to the previous final epoch
  const collapsed = { ...snap, usageByEpoch: { 23: { totalWeightedBuyerPoints: '10' }, 22: { totalWeightedBuyerPoints: '1000' } } };
  const cb2 = inc.cashbackUsage(collapsed);
  assert.equal(cb2.epoch, 22);
  assert.match(cb2.heading, /final, epoch 22/);
});

test('cashbackUsage: absent usage returns null', () => {
  assert.equal(inc.cashbackUsage(SNAPSHOT), null);
  assert.equal(inc.cashbackUsage({ epoch: '23', usageByEpoch: {} }), null);
});

test('cashbackCell: computes wei and text for a weighted pool', () => {
  const snap = {
    epoch: '23',
    usageByEpoch: {
      23: {
        totalWeightedBuyerPoints: '1000',
        buyerBudget: '5000000000000000000', // 5 ANTS
        poolWeights: { '44694': '400' },
      },
    },
  };
  const cell = inc.cashbackCell(snap, '44694');
  // 5e18 * 400 * 1e6 / 1000 = 2e24 (buyerBudget is snapshot ANTS-micro scale)
  assert.equal(cell.wei, 2000000000000000000000000n);
  assert.equal(cell.text, '2,000,000');
});

test('cashbackCell: zero budget with next-epoch weight shows the future epoch', () => {
  const snap = {
    epoch: '23',
    usageByEpoch: {
      23: {
        totalWeightedBuyerPoints: '1000',
        buyerBudget: '0',
        poolWeights: { '44694': '400' },
      },
    },
    poolWeightByEpoch: { '44694': { 24: '1000000000000000000' } },
  };
  const cell = inc.cashbackCell(snap, '44694');
  assert.equal(cell.wei, 0n);
  assert.equal(cell.text, 'from epoch 24');
});

test('networkMetrics: derives B, S, A from the snapshot, not duplicated constants', () => {
  const snap = {
    stakerBudgetNext: '7000000000000000000000', // 7000 ANTS
    stakerBudgetNextEpoch: '24',
    positions: [
      { agentId: '1', weightsByEpoch: { '24': String(250n * 104n * 10n ** 18n) } },
      { agentId: '2', weightsByEpoch: { '24': String(750n * 104n * 10n ** 18n) } },
    ],
  };
  const m = inc.networkMetrics(snap, 24);
  assert.equal(m.B, 7000);
  assert.equal(m.S, 1000); // (250 + 750) * 104 * 1e18 / 1e18 / 104
  assert.equal(m.A, 7000); // round(7000 / 1000 * 1000)
  // A different budget changes the result: nothing is a hardcoded constant.
  assert.equal(inc.networkMetrics({ ...snap, stakerBudgetNext: '1000000000000000000000' }, 24).B, 1000);
});

test('networkMetrics: budget for another epoch yields null B and A', () => {
  const snap = {
    stakerBudgetNext: '7000000000000000000000',
    stakerBudgetNextEpoch: '25', // mismatched: target is 24
    positions: [
      { agentId: '1', weightsByEpoch: { '24': String(1000n * 104n * 10n ** 18n) } },
    ],
  };
  const m = inc.networkMetrics(snap, 24);
  assert.equal(m.B, null);
  assert.equal(m.A, null);
  assert.equal(m.S, 1000);
});

test('networkMetrics: missing budget yields null B and A', () => {
  const snap = {
    positions: [
      { agentId: '1', weightsByEpoch: { '24': String(1000n * 104n * 10n ** 18n) } },
    ],
  };
  const m = inc.networkMetrics(snap, 24);
  assert.equal(m.B, null);
  assert.equal(m.A, null);
  assert.equal(m.S, 1000);
});

test('poolModel: aggregates R/We/WN and derives B, S, k and est', () => {
  const snap = {
    stakerBudgetNext: '2000000000000000000000', // 2000 ANTS, overrides the reward-sum B
    stakerBudgetNextEpoch: '24',
    positions: [
      { agentId: '1', rewardByEpoch: { '23': String(5n * 10n ** 18n) }, weightsByEpoch: { '23': String(104n * 10n ** 18n), '24': String(104n * 10n ** 18n) } },
      { agentId: '2', rewardByEpoch: { '23': String(3n * 10n ** 18n) }, weightsByEpoch: { '23': String(104n * 10n ** 18n), '24': '0' } },
    ],
  };
  const m = inc.poolModel(snap, { mode: 'live', epoch: '23' });
  assert.equal(m.B, 2000);
  assert.equal(m.poolData.get('1').WN, 104); // 104 = 1 ANTS at max lock
  assert.equal(m.poolData.get('2').WN, 0);
  assert.equal(m.kMap.get('1'), 5 / 104);
  // S = (5/104)*104 + (3/104)*0 = 5; est(1 ANTS) = 2000*5/(5+5).
  assert.equal(m.estForPool('1', 104), 1000);
});

console.log('incentives_ok=1');
