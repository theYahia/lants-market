// site/storefront.test.mjs - storefront pure helpers (sortLots, matches, enrich).
// The module runs a top-level init() that needs jsdom globals first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardown } from './dom-test-helper.mjs';

let storefront;

test.before(async () => {
  setupDom();
  storefront = await import('./storefront.mjs');
});
test.after(() => teardown());

const W18 = (n) => (BigInt(Math.round(n * 1e6)) * 10n ** 12n).toString();

const listed = (over = {}) => ({
  tokenId: 1,
  priceUsdc: 10,
  perAntUsd: 0.5,
  amountAnts: 100,
  aprPct: 5,
  unlock: new Date('2027-01-01T00:00:00Z'),
  ...over,
});
const unlisted = (over = {}) => ({ tokenId: 2, priceUsdc: null, perAntUsd: null, amountAnts: 50, aprPct: null, unlock: null, ...over });

test('sortLots: default sort is price per ANTS, unlisted last', () => {
  const lots = [
    listed({ tokenId: 3, perAntUsd: 0.8 }),
    unlisted(),
    listed({ tokenId: 1, perAntUsd: 0.2 }),
    listed({ tokenId: 2, perAntUsd: 0.5 }),
  ];
  const out = storefront.sortLots(lots);
  assert.deepEqual(out.map((l) => l.tokenId), [1, 2, 3, 2]); // the second 2 is the unlisted
  assert.equal(out[3].priceUsdc, null);
});

test('sortLots: amount sorts by staked amount descending', () => {
  const out = storefront.sortLots([
    listed({ tokenId: 1, amountAnts: 100 }),
    listed({ tokenId: 2, amountAnts: 500 }),
    listed({ tokenId: 3, amountAnts: 50 }),
  ], 'amount', 'desc');
  assert.deepEqual(out.map((l) => l.tokenId), [2, 1, 3]);
});

test('sortLots: amount ascending reverses the order', () => {
  const out = storefront.sortLots([
    listed({ tokenId: 1, amountAnts: 100 }),
    listed({ tokenId: 2, amountAnts: 500 }),
    listed({ tokenId: 3, amountAnts: 50 }),
  ], 'amount', 'asc');
  assert.deepEqual(out.map((l) => l.tokenId), [3, 1, 2]);
});

test('sortLots: apr sorts by APR descending with nulls last', () => {
  const out = storefront.sortLots([
    listed({ tokenId: 1, aprPct: null }),
    listed({ tokenId: 2, aprPct: 8 }),
    listed({ tokenId: 3, aprPct: 2.5 }),
  ], 'apr', 'desc');
  assert.deepEqual(out.map((l) => l.tokenId), [2, 3, 1]);
});

test('sortLots: id sorts by token id ascending', () => {
  const out = storefront.sortLots([
    listed({ tokenId: 3 }),
    listed({ tokenId: 1 }),
    listed({ tokenId: 2 }),
  ], 'id', 'asc');
  assert.deepEqual(out.map((l) => l.tokenId), [1, 2, 3]);
});

test('sortLots: unlock sorts by date, max always last', () => {
  const out = storefront.sortLots([
    listed({ tokenId: 1, unlock: new Date('2027-03-01T00:00:00Z') }),
    listed({ tokenId: 2, unlock: 'max' }),
    listed({ tokenId: 3, unlock: new Date('2027-01-01T00:00:00Z') }),
  ], 'unlock');
  assert.deepEqual(out.map((l) => l.tokenId), [3, 1, 2]);
});

test('sortLots: does not mutate the input array', () => {
  const lots = [listed({ tokenId: 2 }), listed({ tokenId: 1 })];
  const before = lots.map((l) => l.tokenId);
  storefront.sortLots(lots);
  assert.deepEqual(lots.map((l) => l.tokenId), before);
});

test('matches: listedOnly hides unlisted by default', () => {
  assert.equal(storefront.matches(listed()), true);
  assert.equal(storefront.matches(unlisted()), false);
});

test('matches: listing every position when listedOnly is off', () => {
  assert.equal(storefront.matches(unlisted(), false), true);
  assert.equal(storefront.matches(listed(), false), true);
});

test('visibleLots: listedOnly keeps only listed lots regardless of position in the array', () => {
  // Regression: .filter(matches) passed the array index as `listedOnly`,
  // silently dropping every unlisted lot after index 0.
  const lots = [listed({ tokenId: 1 }), unlisted({ tokenId: 2 }), listed({ tokenId: 3 }), unlisted({ tokenId: 4 })];
  assert.deepEqual(storefront.visibleLots(lots, true).map((l) => l.tokenId), [1, 3]);
  assert.deepEqual(storefront.visibleLots(lots, false).map((l) => l.tokenId), [1, 2, 3, 4]);
});

test('visibleLots: an unlisted lot at index 1 is not dropped when listedOnly is on', () => {
  const lots = [unlisted({ tokenId: 2 }), listed({ tokenId: 1 })];
  assert.deepEqual(storefront.visibleLots(lots, true).map((l) => l.tokenId), [1]);
});

test('enrich: adds apr, ants per epoch, pool share, unlock and lock weeks', () => {
  const snapshot = {
    epoch: '28',
    positions: [
      {
        id: '1',
        agentId: '52894',
        amount: W18(100),
        stakeStartEpoch: '20',
        stakeEndEpoch: '40',
        rewardByEpoch: { 28: W18(1.5) },
        weightsByEpoch: { 28: W18(100), 29: W18(100) },
      },
    ],
  };
  const shares = new Map([['52894', 0.25]]);
  const lot = {
    tokenId: 1,
    position: snapshot.positions[0],
    amountAnts: 100,
  };
  const out = storefront.enrich(lot, snapshot, shares);
  assert.equal(out.poolSharePct, 0.25);
  // 1.5 ANTS reward on 100 ANTS -> APR = 1.5/100 * 52 * 100 = 78
  assert.equal(out.aprPct, 78);
  assert.equal(out.antsPerEpoch, 1.5);
  assert.ok(out.unlock instanceof Date);
  assert.equal(out.lockWeeks, 11); // stakeEnd 40 - next epoch 29
});

test('enrich: null yields propagate through the helpers', () => {
  const out = storefront.enrich({ position: null, amountAnts: 0 }, { epoch: '28', positions: [] }, new Map());
  assert.equal(out.aprPct, null);
  assert.equal(out.antsPerEpoch, null);
  assert.equal(out.poolSharePct, null);
  assert.equal(out.unlock, null);
  assert.equal(out.lockWeeks, null);
});

console.log('storefront_ok=1');
