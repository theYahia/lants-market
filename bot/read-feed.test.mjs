// bot/read-feed.test.mjs - shaping and fail-closed behavior of the feed reader.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toMarket, readFeed, fetchEmission } from './read-feed.mjs';

function feedItem(overrides = {}) {
  return { id: 206, amount: '400', perAntUsd: '0.102', priceUsdc: '40.8', lockDays: 56, ...overrides };
}

test('toMarket maps the feed into typed measures', () => {
  const market = toMarket({
    listedCount: 2,
    currentEpoch: 28,
    price: { floorAsk: '0.11', avgPrice24h: 0.1019 },
    items: [feedItem(), feedItem({ id: 207, amount: 100, perAntUsd: 0.101, priceUsdc: 10.1, lockDays: null })],
  });
  assert.equal(market.floorAsk, 0.11);
  assert.equal(market.avg24h, 0.1019);
  assert.equal(market.epoch, 28);
  assert.equal(market.listedCount, 2);
  assert.deepEqual(market.listings[0], {
    id: 206,
    amount: 400,
    lockDays: 56,
    perAntUsd: 0.102,
    usd: 40.8,
  });
});

test('toMarket rejects a broken shape', () => {
  assert.equal(toMarket(null), null);
  assert.equal(toMarket({}), null);
  assert.equal(toMarket({ items: 'nope', listedCount: 0 }), null);
  assert.equal(toMarket({ items: [], listedCount: -1 }), null);
});

test('toMarket rejects a non-empty market with no usable listings', () => {
  const market = toMarket({ listedCount: 1, items: [feedItem({ amount: 0 })] });
  assert.equal(market, null);
});

test('toMarket skips malformed rows but keeps the valid ones', () => {
  const market = toMarket({
    listedCount: 3,
    items: [
      feedItem({ id: 206 }),
      feedItem({ id: 207, amount: 0 }),
      feedItem({ id: 208, perAntUsd: -1 }),
      feedItem({ id: 1.5 }),
    ],
  });
  assert.deepEqual(market.listings.map((l) => l.id), [206]);
});

test('readFeed returns the market on success and the reason on failure', async () => {
  const ok = await readFeed({
    parser: async (options) => {
      assert.equal(options.includeNonFulfillable, true);
      return { ok: true, listedCount: 1, currentEpoch: 28, items: [feedItem()] };
    },
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.market.epoch, 28);

  const failed = await readFeed({ parser: async () => ({ ok: false, reason: 'network' }) });
  assert.deepEqual(failed, { ok: false, reason: 'network' });

  const shaped = await readFeed({ parser: async () => ({ ok: true, items: null }) });
  assert.deepEqual(shaped, { ok: false, reason: 'market-shape' });
});

function snapshot(epoch, positions) {
  return { ok: true, json: async () => ({ epoch, positions }) };
}

test('fetchEmission sums the reward accrued in the requested epoch', async () => {
  const res = await fetchEmission({
    epoch: 27,
    timeoutMs: 1000,
    fetchImpl: async () =>
      snapshot(27, [
        { rewardByEpoch: { 27: '1000000000000000000' } },
        { rewardByEpoch: { 27: '500000000000000000', 26: '9' } },
      ]),
  });
  assert.equal(res.ok, true);
  assert.equal(res.ants, 1.5);
  assert.equal(res.snapshotEpoch, 27);
});

test('fetchEmission fails closed on a stale snapshot', async () => {
  const res = await fetchEmission({
    epoch: 28,
    timeoutMs: 1000,
    fetchImpl: async () => snapshot(27, []),
  });
  assert.deepEqual(res, { ok: false, reason: 'stale' });
});

test('fetchEmission fails closed on a bad positions schema', async () => {
  const res = await fetchEmission({
    epoch: 27,
    timeoutMs: 1000,
    fetchImpl: async () => ({ ok: true, json: async () => ({ epoch: 27, positions: 'nope' }) }),
  });
  assert.deepEqual(res, { ok: false, reason: 'schema' });
});

test('fetchEmission reports network when every snapshot URL fails', async () => {
  let calls = 0;
  const res = await fetchEmission({
    epoch: 27,
    timeoutMs: 1000,
    fetchImpl: async () => {
      calls++;
      throw new Error('offline');
    },
  });
  assert.equal(res.reason, 'network');
  assert.ok(calls > 1);
});
