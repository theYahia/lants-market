// site/market-stats.test.mjs
import { computeMarketStats } from './market-stats.mjs';
import assert from 'node:assert';

const now = 1_000_000_000;
const day = 86_400;

// Test 1
const items1 = [
  { listingId: 1, nftId: 'a', price: 100e6, soldTime: now - 1 * day, amount: 1e18 },
  { listingId: 2, nftId: 'b', price: 200e6, soldTime: now - 2 * day, amount: 2e18 },
  { listingId: 3, nftId: 'c', price: 999e6, soldTime: now - 1 * day, amount: 1e18 },
];
const internalIds1 = [3];
const stats1 = computeMarketStats(items1, null, internalIds1, now);
assert.strictEqual(stats1.volumeUsd, 300);
assert.strictEqual(stats1.fdvUsd, null);

// Test 2
const items2 = [
  { listingId: 10, nftId: 'a', price: 1e6, soldTime: now - 1 * day, amount: 1e18 },
  { listingId: 11, nftId: 'b', price: 2e6, soldTime: now - 2 * day, amount: 1e18 },
  { listingId: 12, nftId: 'c', price: 3e6, soldTime: now - 3 * day, amount: 1e18 },
];
const internalIds2 = [];
const stats2 = computeMarketStats(items2, null, internalIds2, now);
assert.strictEqual(stats2.volumeUsd, 6);
assert.strictEqual(stats2.fdvUsd, 2080000000);

// Test 3
const items3 = [
  { listingId: 5n, nftId: 'x', price: 50e6, soldTime: now - day, amount: 1e18 },
  { listingId: 6, nftId: 'y', price: 7e6, soldTime: now - day },
];
const internalIds3 = [5];
const stats3 = computeMarketStats(items3, null, internalIds3, now);
assert.strictEqual(stats3.volumeUsd, 7);
assert.strictEqual(stats3.fdvUsd, null);

console.log('stats_ok=1');