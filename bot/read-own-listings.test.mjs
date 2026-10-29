import test from 'node:test';
import assert from 'node:assert/strict';
import { toOwnListing, readOwnListings, hasIncompleteRows } from './read-own-listings.mjs';

const NOW = 1800000000;

const base = {
  listingId: 10n,
  nftId: 205n,
  price: 106746148n,
  chainAmount: 762472489206512500000n,
  chainStakeEnd: BigInt(NOW) + 126n * 86400n,
  isLive: true,
  ownerMismatch: false,
  chainClosed: false,
};

test('toOwnListing normalizes a live own listing', () => {
  const lot = toOwnListing(base, NOW);
  assert.equal(lot.id, 205);
  assert.ok(Math.abs(lot.perAntUsd - 0.14) < 1e-9);
  assert.equal(lot.usd, 106.746148);
  assert.equal(lot.lockDays, 126);
});

test('toOwnListing rejects non-live, mis-owned and closed rows', () => {
  assert.equal(toOwnListing({ ...base, isLive: false }, NOW), null);
  assert.equal(toOwnListing({ ...base, ownerMismatch: true }, NOW), null);
  assert.equal(toOwnListing({ ...base, chainClosed: true }, NOW), null);
  assert.equal(toOwnListing(null, NOW), null);
});

test('toOwnListing rejects internal wallet listings and non-positive values', () => {
  assert.equal(toOwnListing({ ...base, listingId: 3n }, NOW), null);
  assert.equal(toOwnListing({ ...base, price: 0n }, NOW), null);
  assert.equal(toOwnListing({ ...base, chainAmount: 0n }, NOW), null);
  assert.equal(toOwnListing({ ...base, nftId: -1n }, NOW), null);
});

test('toOwnListing drops an expired or missing stake lock', () => {
  const expired = toOwnListing({ ...base, chainStakeEnd: BigInt(NOW) - 1n }, NOW);
  assert.equal(expired.lockDays, null);
  const missing = toOwnListing({ ...base, chainStakeEnd: null }, NOW);
  assert.equal(missing.lockDays, null);
});

test('readOwnListings returns ok:false when the chain read fails', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500 });
  const res = await readOwnListings({ fetchImpl });
  assert.equal(res.ok, false);
});

test('hasIncompleteRows flags a live row whose position read failed', () => {
  assert.equal(hasIncompleteRows([{ isLive: true, chainAmount: null }]), true);
  assert.equal(hasIncompleteRows([{ isLive: true, chainAmount: 1n }]), false);
  assert.equal(hasIncompleteRows([{ isLive: false, chainAmount: null }]), false);
  assert.equal(hasIncompleteRows([]), false);
  assert.equal(hasIncompleteRows(null), false);
});
