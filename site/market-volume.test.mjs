// site/market-volume.test.mjs - all-time USDC volume from the competitor's
// public trades feed (pagination + USDC-only filtering).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllTimeUsdcVolume } from './market-volume.mjs';

function jsonResponse(json) {
  return { ok: true, json: async () => json };
}

test('fetchAllTimeUsdcVolume: sums USDC priceWei and ignores other currencies', async () => {
  const fetchImpl = async () => jsonResponse({
    trades: [
      { currency: 'USDC', priceWei: '2000000' },
      { currency: 'USDC', priceWei: '1500000' },
      { currency: 'WETH', priceWei: '999999999' },
      { currency: 'ETH', priceWei: '123456789' },
    ],
    total: 4,
  });
  const r = await fetchAllTimeUsdcVolume({ fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.usd, 3.5);
  assert.equal(r.tradeCount, 2);
});

test('fetchAllTimeUsdcVolume: pages until the short final page', async () => {
  const pages = [
    { trades: [{ currency: 'USDC', priceWei: '2000000' }, { currency: 'USDC', priceWei: '1500000' }], total: 4 },
    { trades: [{ currency: 'USDC', priceWei: '500000' }, { currency: 'USDC', priceWei: '2500000' }], total: 4 },
    { trades: [], total: 4 },
  ];
  let calls = 0;
  const fetchImpl = async () => jsonResponse(pages[calls++]);
  const r = await fetchAllTimeUsdcVolume({ fetchImpl, pageSize: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.usd, 6.5);
  assert.equal(r.tradeCount, 4);
  assert.equal(calls, 2); // short page on page 3 stops before fetching it
});

test('fetchAllTimeUsdcVolume: a malformed price is skipped, not fatal', async () => {
  const fetchImpl = async () => jsonResponse({
    trades: [
      { currency: 'USDC', priceWei: '1000000' },
      { currency: 'USDC', priceWei: 'not-a-number' },
      { currency: 'USDC' },
    ],
  });
  const r = await fetchAllTimeUsdcVolume({ fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.usd, 1);
  assert.equal(r.tradeCount, 1);
});

test('fetchAllTimeUsdcVolume: schema and http failures are ok:false', async () => {
  assert.equal((await fetchAllTimeUsdcVolume({ fetchImpl: async () => jsonResponse({}) })).ok, false);
  assert.equal((await fetchAllTimeUsdcVolume({ fetchImpl: async () => ({ ok: false }) })).ok, false);
});

test('fetchAllTimeUsdcVolume: missing fetch is ok:false', async () => {
  assert.equal((await fetchAllTimeUsdcVolume({ fetchImpl: null })).ok, false);
});

console.log('market_volume_ok=1');
