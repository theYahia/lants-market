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
  assert.equal(lot.sellerName, 'Venice.ai Proxy');
  assert.equal(lot.agentId, 45869);
});

test('toMarket keeps the board denominators and the ANTS supply', () => {
  const market = toMarket(parseSeaportMarket(marketFixture, { includeNonFulfillable: true }));
  assert.equal(market.totalNfts, 483);
  assert.equal(market.offeredCount, 0);
  assert.equal(market.antsTotalSupply, 129929424.0681841);
  // minted is the ANTS total supply: the MC/FDV multiplier, never an ask VWAP.
  assert.equal(market.minted, 129929424.0681841);
});

test('toMarket leaves board fields null when the feed omits them', () => {
  const market = toMarket({ items: [{ id: 1, amount: 100, perAntUsd: 0.1, priceUsdc: 10 }], listedCount: 1 });
  assert.equal(market.totalNfts, null);
  assert.equal(market.offeredCount, null);
  assert.equal(market.antsTotalSupply, null);
  assert.equal(market.minted, null);
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

test('toState persists the active epoch only (no listings)', () => {
  const curr = { avg24h: 0.1, epoch: 28 };
  assert.deepEqual(toState(curr), { epoch: 28 });
});

test('toState tolerates a missing listing list', () => {
  assert.deepEqual(toState({ epoch: 28 }), { epoch: 28 });
});
