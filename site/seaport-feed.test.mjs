import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parseSeaportMarket,
  fetchSeaportMarket,
  normalizeSeaportItem,
  SEAPORT_MARKET_ORIGIN,
} from './seaport-feed.mjs';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/seaport/lants-market-2026-10-28.json', import.meta.url)), 'utf8')
);

test('parse the captured live feed: only executable lots survive', () => {
  const res = parseSeaportMarket(fixture);
  assert.equal(res.ok, true);
  assert.equal(res.listedCount, 15);
  assert.equal(res.items.length, 15);
  assert.equal(res.dropped, 9);
  assert.equal(res.price.floorAsk, 0.14);
  assert.equal(res.price.avgPrice24h, 0.101931);
  for (const item of res.items) {
    assert.equal(Number.isInteger(item.id), true);
    assert.equal(item.priceUsdc > 0, true);
    assert.equal(item.amount > 0, true);
  }
  assert.equal(res.items[0].id, 205);
  assert.equal(res.items[0].priceUsdc, 106.746148);
  assert.equal(res.items[0].agentId, 45869);
});

test('parse exposes market-wide fields and per-lot economics for data consumers', () => {
  const res = parseSeaportMarket(fixture, { includeNonFulfillable: true });
  assert.equal(res.ok, true);
  assert.equal(res.currentEpoch, 28);
  assert.equal(res.offeredCount, 0);
  assert.equal(res.antsTotalSupply, 129929424.0681841);
  assert.equal(res.items.length, 15);
  const lot = res.items.find((it) => it.id === 205);
  assert.equal(lot.listed, true);
  assert.equal(lot.fulfillableHere, true);
  assert.equal(lot.lockDays, 126);
  assert.ok(Math.abs(lot.perAntUsd - 0.14) < 1e-9);
});

test('includeNonFulfillable keeps priced listings the storefront would drop', () => {
  const listed = { id: 1, listed: true, fulfillableHere: false, amount: 10, listing: { usd: 2 } };
  assert.equal(normalizeSeaportItem(listed), null);
  const kept = normalizeSeaportItem(listed, { includeNonFulfillable: true });
  assert.equal(kept.id, 1);
  assert.equal(kept.fulfillableHere, false);
  assert.equal(kept.perAntUsd, 0.2);
});

test('item validation rejects unlisted, non-fulfillable and malformed lots', () => {
  const base = {
    id: 1,
    listed: true,
    fulfillableHere: true,
    amount: 10,
    agentId: 7,
    listing: { usd: 2.5 },
  };
  assert.equal(normalizeSeaportItem(base).priceUsdc, 2.5);
  assert.equal(normalizeSeaportItem({ ...base, listed: false }), null);
  assert.equal(normalizeSeaportItem({ ...base, fulfillableHere: false }), null);
  assert.equal(normalizeSeaportItem({ ...base, id: '1' }), null);
  assert.equal(normalizeSeaportItem({ ...base, id: -1 }), null);
  assert.equal(normalizeSeaportItem({ ...base, listing: { usd: 0 } }), null);
  assert.equal(normalizeSeaportItem({ ...base, listing: { usd: 'x' } }), null);
  assert.equal(normalizeSeaportItem({ ...base, listing: null }), null);
});

test('a renamed or missing schema fails the feed instead of half-rendering it', () => {
  assert.deepEqual(parseSeaportMarket(null), { ok: false, reason: 'schema' });
  assert.deepEqual(parseSeaportMarket({}), { ok: false, reason: 'schema' });
  assert.deepEqual(parseSeaportMarket({ items: [], listedCount: '15' }), { ok: false, reason: 'schema' });
});

test('invalid items are dropped individually and counted', () => {
  const json = {
    items: [
      { id: 1, listed: true, fulfillableHere: true, amount: 10, agentId: 7, listing: { usd: 2 } },
      { id: 2, listed: true, fulfillableHere: true, amount: 10, agentId: 7, listing: { usd: 0 } },
    ],
    listedCount: 2,
    price: { floorAsk: '2.0' },
  };
  const res = parseSeaportMarket(json);
  assert.equal(res.ok, true);
  assert.equal(res.items.length, 1);
  assert.equal(res.dropped, 1);
  assert.equal(res.price.floorAsk, 2);
});

test('fetchSeaportMarket follows the feed and stops at listedCount', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return { ok: true, json: async () => fixture };
  };
  const res = await fetchSeaportMarket({ fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.items.length, 15);
  assert.equal(urls.length, 1);
  assert.ok(urls[0].startsWith(SEAPORT_MARKET_ORIGIN + '/api/lants-market?page=1'));
});

test('timeout and network failures are reported as ok:false', async () => {
  const hang = () => new Promise(() => {});
  const timedOut = await fetchSeaportMarket({ fetchImpl: hang, timeoutMs: 10 });
  assert.deepEqual(timedOut, { ok: false, reason: 'timeout' });

  const refused = await fetchSeaportMarket({
    fetchImpl: async () => {
      throw new Error('boom');
    },
  });
  assert.deepEqual(refused, { ok: false, reason: 'network' });

  const http = await fetchSeaportMarket({ fetchImpl: async () => ({ ok: false, status: 502 }) });
  assert.deepEqual(http, { ok: false, reason: 'http' });
});
