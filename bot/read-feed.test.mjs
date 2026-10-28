import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSeaportMarket } from '../site/seaport-feed.mjs';
import {
  parseTrades,
  normalizeTrade,
  toMarket,
  fetchTrades,
  fetchEmission,
  toState,
  readFeed,
} from './read-feed.mjs';

const marketFixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/lants-market-2026-10-28.json', import.meta.url)), 'utf8')
);
const tradesFixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/lants-trades-2026-10-28.json', import.meta.url)), 'utf8')
);

test('parseTrades normalizes the captured trade history (USDC fills only)', () => {
  const res = parseTrades(tradesFixture);
  assert.equal(res.ok, true);
  assert.equal(res.trades.length, 32);
  assert.equal(tradesFixture.trades.length, 34);
  const t = res.trades[0];
  assert.equal(t.tokenId, 469);
  assert.equal(t.tradeType, 'listing');
  assert.equal(t.currency, 'USDC');
  assert.ok(Math.abs(t.usdTotal - 12.832376) < 1e-9);
  assert.ok(Math.abs(t.perAntUsd - 0.133) < 1e-3);
  for (const trade of res.trades) assert.equal(trade.currency, 'USDC');
});

test('normalizeTrade rejects malformed, non-USDC and zero-value trades', () => {
  const base = { id: 'x', tokenId: 1, amount: 10, priceWei: '1000000', currency: 'USDC', tradeType: 'listing' };
  assert.ok(normalizeTrade(base));
  assert.equal(normalizeTrade({ ...base, id: '' }), null);
  assert.equal(normalizeTrade({ ...base, tokenId: '1' }), null);
  assert.equal(normalizeTrade({ ...base, amount: 0 }), null);
  assert.equal(normalizeTrade({ ...base, priceWei: '0' }), null);
  assert.equal(normalizeTrade({ ...base, tradeType: 'weird' }), null);
  assert.equal(normalizeTrade({ ...base, currency: 'WETH' }), null);
  assert.equal(normalizeTrade(null), null);
});

test('parseTrades fails closed on a bad top-level shape', () => {
  assert.deepEqual(parseTrades(null), { ok: false, reason: 'schema' });
  assert.deepEqual(parseTrades({ trades: 'x' }), { ok: false, reason: 'schema' });
});

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

test('fetchTrades stops after one page when total is covered', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return { ok: true, json: async () => tradesFixture };
  };
  const res = await fetchTrades({ fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.trades.length, 32);
  assert.equal(urls.length, 1);
  assert.ok(urls[0].includes('/api/lants/trades?page=1'));
});

test('fetchTrades keeps paginating past a page that contains non-USDC trades', async () => {
  const usdc = (id) => ({ id, tokenId: 1, amount: 10, priceWei: '1000000', currency: 'USDC', tradeType: 'listing' });
  const weth = (id) => ({ id, tokenId: 1, amount: null, priceWei: '1000000000000000', currency: 'WETH', tradeType: 'offer' });
  const pages = {
    1: { trades: [usdc('a'), weth('x')], total: 3 },
    2: { trades: [usdc('b')], total: 3 },
  };
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    const page = Number(new URL(url).searchParams.get('page'));
    return { ok: true, json: async () => pages[page] };
  };
  const res = await fetchTrades({ fetchImpl, pageSize: 2 });
  assert.equal(res.ok, true);
  assert.deepEqual(res.trades.map((t) => t.id), ['a', 'b']);
  assert.equal(urls.length, 2);
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

test('readFeed treats a market failure as fatal and a trades failure as soft', async () => {
  const marketOnly = async (url) =>
    url.includes('/api/lants-market')
      ? { ok: true, json: async () => marketFixture }
      : { ok: false, status: 500 };
  const soft = await readFeed({ fetchImpl: marketOnly });
  assert.equal(soft.ok, true);
  assert.equal(soft.trades, null);
  assert.equal(soft.tradesReason, 'http');

  const down = await readFeed({ fetchImpl: async () => ({ ok: false, status: 502 }) });
  assert.deepEqual(down, { ok: false, reason: 'http' });
});

test('toState keeps ids + price for compact persistence', () => {
  const parsed = parseSeaportMarket(marketFixture, { includeNonFulfillable: true });
  const market = toMarket(parsed);
  const state = toState({ market, trades: parseTrades(tradesFixture).trades });
  assert.equal(state.epoch, 28);
  assert.equal(state.listings.length, 15);
  assert.equal(state.tradeIds.length, 32);
  assert.equal(typeof state.listings[0], 'object');
  assert.equal(typeof state.listings[0].id, 'number');
  assert.equal(typeof state.listings[0].perAntUsd, 'number');
});

test('toState preserves known trade ids when the trades feed was down', () => {
  const parsed = parseSeaportMarket(marketFixture, { includeNonFulfillable: true });
  const market = toMarket(parsed);
  const kept = toState({ market, trades: null }, ['t1', 't2']);
  assert.deepEqual(kept.tradeIds, ['t1', 't2']);
  // A genuinely empty feed (not a failure) still clears the set.
  const empty = toState({ market, trades: [] }, ['t1', 't2']);
  assert.deepEqual(empty.tradeIds, []);
});
