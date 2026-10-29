import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSeaportMarket } from '../site/seaport-feed.mjs';
import {
  toMarket,
  fetchEmission,
  toState,
  readFeed,
} from './read-feed.mjs';

const marketFixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/lants-market-2026-10-28.json', import.meta.url)), 'utf8')
);

test('toMarket turns the parsed feed into typed state', () => {
  const parsed = parseSeaportMarket(marketFixture, { includeNonFulfillable: true });
  const market = toMarket(parsed);
  assert.equal(market.floorAsk, 0.14);
  assert.equal(market.avg24h, 0.101931);
  assert.equal(market.epoch, 28);
  assert.equal(market.listedCount, 15);
  assert.equal(market.listings.length, 15);
  const lot = market.listings.find((l) => l.id === 205);
  assert.equal(lot.amount, 762.4724892065126);
  assert.equal(lot.lockDays, 126);
  assert.ok(Math.abs(lot.perAntUsd - 0.14) < 1e-9);
});

test('toMarket rejects a bad shape instead of inventing a market', () => {
  assert.equal(toMarket(null), null);
  assert.equal(toMarket({ items: [], listedCount: '15' }), null);
  assert.equal(toMarket({ items: [{ id: 1, amount: 0 }], listedCount: 1 }), null);
});

test('fetchEmission sums staking reward for the closed epoch', async () => {
  const snapshot = {
    epoch: 29,
    positions: [
      { rewardByEpoch: { 28: '1000000000000000000' } },
      { rewardByEpoch: { 28: '2500000000000000000' } },
      { rewardByEpoch: { 29: '99' } },
    ],
  };
  const fetchImpl = async () => ({ ok: true, json: async () => snapshot });
  const res = await fetchEmission({ fetchImpl, epoch: 28 });
  assert.equal(res.ok, true);
  assert.equal(res.ants, 3.5);
});

test('fetchEmission refuses a stale snapshot', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ epoch: 27, positions: [] }) });
  const res = await fetchEmission({ fetchImpl, epoch: 28 });
  assert.deepEqual(res, { ok: false, reason: 'stale' });
});

test('readFeed parses the market feed', async () => {
  const fetchImpl = async (url) =>
    url.includes('/api/lants-market')
      ? { ok: true, json: async () => marketFixture }
      : { ok: false, status: 500 };
  const res = await readFeed({ fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.market.floorAsk, 0.14);
  assert.equal(res.market.avg24h, 0.101931);
  assert.equal(res.market.epoch, 28);
});

test('readFeed treats a market failure as fatal', async () => {
  const down = await readFeed({ fetchImpl: async () => ({ ok: false, status: 502 }) });
  assert.deepEqual(down, { ok: false, reason: 'http' });
});

test('toState persists epoch and own listings compactly', () => {
  const curr = {
    avg24h: 0.1,
    epoch: 28,
    listings: [
      { id: 7, amount: 400, lockDays: 56, perAntUsd: 0.15, usd: 60 },
      { id: 9, amount: 100, lockDays: 0, perAntUsd: 0.1, usd: 10 },
    ],
  };
  const state = toState(curr);
  assert.equal(state.epoch, 28);
  assert.deepEqual(state.listings, [{ id: 7, perAntUsd: 0.15 }, { id: 9, perAntUsd: 0.1 }]);
});

test('toState tolerates a missing listing list', () => {
  assert.deepEqual(toState({ epoch: 28, listings: null }), { epoch: 28, listings: [] });
});
