// bot/own-listings.test.mjs - the marketplace struct decoder and the failover
// eth_call used by the own-listing reader.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeListing, ethCallTo } from './own-listings.mjs';

const SELLER = '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B';
const CURRENCY = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const COLLECTION = '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652';

function word(v) {
  return '0x' + BigInt(v).toString(16).padStart(64, '0');
}

function addrWord(address) {
  return '0x' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

function listingWords(overrides = {}) {
  const w = Array.from({ length: 11 }, () => word(0));
  w[0] = addrWord(SELLER);
  w[3] = word(77);
  w[4] = addrWord(CURRENCY);
  w[5] = word(123);
  w[7] = word(456);
  w[9] = word(1700000000);
  if (overrides.sold !== undefined) w[10] = word(overrides.sold);
  return w;
}

test('decodeListing maps the 11-word struct', () => {
  const listing = decodeListing(listingWords({ sold: 1700000001 }), { listingId: 12 });
  assert.equal(listing.listingId, 12);
  assert.equal(listing.seller, SELLER.toLowerCase());
  assert.equal(listing.currency, CURRENCY.toLowerCase());
  assert.equal(listing.nftId, 77n);
  assert.equal(listing.endTime, 1700000000n);
  assert.equal(listing.soldTime, 1700000001n);
  assert.equal(listing.slopeMax, 123n);
  assert.equal(listing.slopeDuration, 456n);
  assert.equal(listing.priceEstimated, true);
  assert.equal(listing.isLive, false);
  assert.equal(listing.chainAmount, null);
});

test('decodeListing marks a sold lot without a slope as exact price', () => {
  const words = listingWords({ sold: 42 });
  words[5] = word(0);
  words[7] = word(0);
  assert.equal(decodeListing(words, { listingId: 1 }).priceEstimated, false);
});

test('decodeListing returns null for a truncated struct', () => {
  assert.equal(decodeListing(listingWords().slice(0, 10), { listingId: 1 }), null);
  assert.equal(decodeListing(null, { listingId: 1 }), null);
});

test('ethCallTo returns the result from the first healthy RPC', async () => {
  const seen = [];
  const result = await ethCallTo(COLLECTION, '0x1234', async (url) => {
    seen.push(url);
    return { ok: true, status: 200, json: async () => ({ result: '0xbeef' }) };
  });
  assert.equal(result, '0xbeef');
  assert.equal(seen.length, 1);
});

test('ethCallTo skips non-ok responses and falls through the RPC list', async () => {
  let calls = 0;
  const result = await ethCallTo(COLLECTION, '0x1234', async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ result: '0xnext' }) };
  });
  assert.equal(result, '0xnext');
  assert.equal(calls, 2);
});

test('ethCallTo throws when every public RPC fails', async () => {
  await assert.rejects(
    ethCallTo(COLLECTION, '0x1234', async () => {
      throw new Error('offline');
    }),
    /all public RPCs failed/
  );
});
