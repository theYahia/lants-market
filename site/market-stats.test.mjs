// site/market-stats.test.mjs
import { computeMarketStats, computeImpliedFromAsks, buyListingPriceFromData, seaportAsAskItems, ANTS_MAX_SUPPLY } from './market-stats.mjs';
import assert from 'node:assert';

const now = 1_000_000_000;
const day = 86_400;

// Test 1: volume is 24h-windowed; fewer than 3 sales no longer yields a dash;
// VWAP over the 30d external sales.
const items1 = [
  { listingId: 1, nftId: 'a', price: 100e6, soldTime: now - 1 * day, amount: 1e18 },
  { listingId: 2, nftId: 'b', price: 200e6, soldTime: now - 2 * day, amount: 2e18 },
  { listingId: 3, nftId: 'c', price: 999e6, soldTime: now - 1 * day, amount: 1e18 },
];
const internalIds1 = [3];
const stats1 = computeMarketStats(items1, null, internalIds1, now);
// 1 and 2 are within 24h (ages 1d and 2d -> both >1 day? day = 1 day. age 1d <= 1d yes, 2d <= 1d no)
assert.strictEqual(stats1.volumeUsd, 100); // only listing 1 within 24h
assert.strictEqual(stats1.volume7dUsd, 300); // 1 and 2 within 7d
assert.strictEqual(stats1.totalVolumeUsd, 300); // 1 and 2 all-time (3 is internal)
assert.strictEqual(stats1.externalSales30, 2); // 1 and 2 (3 is internal)
assert.strictEqual(stats1.n, 2);
// VWAP = (100 + 200) / (1 + 2) = 100 USDC per ANTS -> FDV = 100 * 1.04B
assert.strictEqual(stats1.fdvUsd, 100 * ANTS_MAX_SUPPLY);
assert.notStrictEqual(stats1.fdvText, '—'); // < 3 sales no longer yields a dash

// Test 2: VWAP with equal amounts is the plain mean.
const items2 = [
  { listingId: 10, nftId: 'a', price: 1e6, soldTime: now - 1 * day, amount: 1e18 },
  { listingId: 11, nftId: 'b', price: 2e6, soldTime: now - 2 * day, amount: 1e18 },
  { listingId: 12, nftId: 'c', price: 3e6, soldTime: now - 3 * day, amount: 1e18 },
];
const internalIds2 = [];
const stats2 = computeMarketStats(items2, null, internalIds2, now);
// all three within 24h? ages 1d,2d,3d -> only 1d within 24h
assert.strictEqual(stats2.volumeUsd, 1);
assert.strictEqual(stats2.volume7dUsd, 6);
assert.strictEqual(stats2.fdvUsd, 2 * ANTS_MAX_SUPPLY); // (1+2+3)/3 = 2
assert.strictEqual(stats2.n, 3);

// Test 3: chainAmount is preferred over the snapshot amount.
const items3 = [
  { listingId: 5n, nftId: 'x', price: 50e6, soldTime: now - day, amount: 1e18, chainAmount: 2e18 },
  { listingId: 6, nftId: 'y', price: 7e6, soldTime: now - day },
];
const internalIds3 = [5];
const snapshot3 = { positions: [{ id: 'y', amount: 10e18 }] };
const stats3 = computeMarketStats(items3, snapshot3, internalIds3, now);
assert.strictEqual(stats3.volumeUsd, 7);
assert.strictEqual(stats3.totalVolumeUsd, 7); // internal #5 excluded, all-time = 24h here
// chainAmount 2e18 used for #5 is internal; #6 has no amount on-chain -> snapshot 10e18
assert.strictEqual(stats3.fdvUsd, (7e6 / 1e6) / 10 * ANTS_MAX_SUPPLY);
assert.strictEqual(stats3.n, 1);

// Test 4: maxSupply fallback / override.
const items4 = [
  { listingId: 20, nftId: 'a', price: 10e6, soldTime: now - day, amount: 1e18 },
];
const stats4 = computeMarketStats(items4, null, [], now, 2e9);
assert.strictEqual(stats4.fdvUsd, 10 * 2e9); // 10 USDC per ANTS * 2B override

// Test 5: no sales -> volume 0, fdv dash, n 0.
const stats5 = computeMarketStats([], null, [], now);
assert.strictEqual(stats5.volumeUsd, 0);
assert.strictEqual(stats5.totalVolumeUsd, 0);
assert.strictEqual(stats5.volumeText, '$0');
assert.strictEqual(stats5.fdvUsd, null);
assert.strictEqual(stats5.fdvText, '—');
assert.strictEqual(stats5.n, 0);

// computeImpliedFromAsks ----------------------------------------------------

// Test 6: live external asks -> VWAP, floor, MC, FDV.
const asks6 = [
  { listingId: 100, nftId: 'a', price: 10e6, isLive: true, chainAmount: 1e18 }, // 10 USDC / 1 ANTS
  { listingId: 101, nftId: 'b', price: 50e6, isLive: true, chainAmount: 10e18 }, // 5 USDC / 1 ANTS
];
const impl6 = computeImpliedFromAsks(asks6, [], { minted: 130e6, maxSupply: ANTS_MAX_SUPPLY });
assert.strictEqual(impl6.listedCount, 2);
assert.strictEqual(impl6.supplyCount, 130e6);
assert.strictEqual(impl6.impliedPricePerAnts, 60 / 11); // (10+50)/(1+10)
assert.strictEqual(impl6.floorAskPerAnts, 5);
assert.ok(Math.abs(impl6.mcUsd - impl6.impliedPricePerAnts * 130e6) < 1e-6);
assert.strictEqual(impl6.fdvUsd, impl6.impliedPricePerAnts * ANTS_MAX_SUPPLY);

// Test 7: sold/expired/cancelled and internal and zero-amount rows are excluded.
const asks7 = [
  { listingId: 200, nftId: 'a', price: 10e6, isLive: true, chainAmount: 1e18 }, // live external
  { listingId: 201, nftId: 'b', price: 99e6, isLive: false, chainAmount: 1e18 }, // sold
  { listingId: 202, nftId: 'c', price: 99e6, isLive: true, chainAmount: 1e18 }, // internal
  { listingId: 203, nftId: 'd', price: 99e6, isLive: true, chainAmount: 0n }, // dust
  { listingId: 204, nftId: 'e', price: 99e6, isLive: true }, // unknown amount
];
const impl7 = computeImpliedFromAsks(asks7, [202]);
assert.strictEqual(impl7.listedCount, 1);
assert.strictEqual(impl7.impliedPricePerAnts, 10);
assert.strictEqual(impl7.floorAskPerAnts, 10);

// Test 8: no live asks -> null metrics, not "n/a".
const impl8 = computeImpliedFromAsks([], []);
assert.strictEqual(impl8.listedCount, 0);
assert.strictEqual(impl8.impliedPricePerAnts, null);
assert.strictEqual(impl8.floorAskPerAnts, null);
assert.strictEqual(impl8.mcUsd, null);
assert.strictEqual(impl8.fdvUsd, null);

// Test 9: minted unknown -> mcUsd null but fdvUsd computed.
const asks9 = [{ listingId: 300, nftId: 'a', price: 10e6, isLive: true, chainAmount: 1e18 }];
const impl9 = computeImpliedFromAsks(asks9, [], { minted: null });
assert.strictEqual(impl9.mcUsd, null);
assert.strictEqual(impl9.fdvUsd, 10 * ANTS_MAX_SUPPLY);
assert.strictEqual(impl9.supplyCount, null);

// Test 9b: a live ask with no on-chain amount falls back to the snapshot position.
const asks9b = [{ listingId: 301, nftId: 'x', price: 20e6, isLive: true }];
const snap9b = { positions: [{ id: 'x', amount: 2e18 }] };
const impl9b = computeImpliedFromAsks(asks9b, [], { snapshot: snap9b });
assert.strictEqual(impl9b.listedCount, 1);
assert.strictEqual(impl9b.impliedPricePerAnts, 10); // 20 USDC / 2 ANTS
assert.strictEqual(impl9b.floorAskPerAnts, 10);

// buyListingPriceFromData ---------------------------------------------------

// Test 10: parses the paid price from a BuyListing event payload
// (buyer, currency, price, fee), the price being the third 32-byte word.
const pad = (hex) => hex.replace(/^0x/, '').padStart(64, '0');
const buyData = '0x' + [
  pad('0x1234567890123456789012345678901234567890'),
  pad('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
  pad((1234567890n).toString(16)),
  pad((12345678n).toString(16)),
].join('');
assert.strictEqual(buyListingPriceFromData(buyData), 1234567890n);

// Test 11: too-short / malformed payloads return null (not a wrong word).
assert.strictEqual(buyListingPriceFromData('0x' + '00'.repeat(64)), null);
assert.strictEqual(buyListingPriceFromData('0x'), null);
assert.strictEqual(buyListingPriceFromData(null), null);

// Test 12: Seaport asks feed the same implied-price math, mixed with ours.
const ourAsk = { listingId: 400, nftId: 'a', price: 10e6, isLive: true, chainAmount: 10n ** 18n };
const seaAsks = seaportAsAskItems([
  { id: 1, priceUsdc: 20, amount: 10 },
  { id: 2, priceUsdc: 0, amount: 10 }, // dropped by validation earlier; defensive here
  { id: 3, priceUsdc: 5, amount: 0 },
]);
assert.strictEqual(seaAsks.length, 1);
const impl12 = computeImpliedFromAsks([ourAsk, ...seaAsks], [], { minted: 100 });
assert.strictEqual(impl12.listedCount, 2);
assert.strictEqual(impl12.impliedPricePerAnts, 30 / 11); // (10 + 20) / (1 + 10)
assert.strictEqual(impl12.floorAskPerAnts, 2); // Seaport 20 USDC / 10 ANTS
assert.ok(Math.abs(impl12.fdvUsd - (30 / 11) * ANTS_MAX_SUPPLY) < 1e-6);

// Test 13: a native-market reference price (24h avg) drives MC/FDV, not the
// ask VWAP, so an inflated ask cannot move the headline valuation.
const asks13 = [
  { listingId: 500, nftId: 'a', price: 10e6, isLive: true, chainAmount: 1e18 }, // 10 USDC / 1 ANTS
  { listingId: 501, nftId: 'b', price: 400e6, isLive: true, chainAmount: 1e18 }, // 400 USDC / 1 ANTS
];
const impl13 = computeImpliedFromAsks(asks13, [], {
  minted: 130e6,
  maxSupply: ANTS_MAX_SUPPLY,
  referencePrice: 0.101931,
});
assert.strictEqual(impl13.impliedPricePerAnts, 205); // VWAP still (10+400)/2
assert.strictEqual(impl13.referencePrice, 0.101931);
assert.ok(Math.abs(impl13.mcUsd - 0.101931 * 130e6) < 1e-6);
assert.ok(Math.abs(impl13.fdvUsd - 0.101931 * ANTS_MAX_SUPPLY) < 1e-6);

// Test 14: referencePrice still yields MC/FDV with an empty order book.
const impl14 = computeImpliedFromAsks([], [], {
  minted: 130e6,
  maxSupply: ANTS_MAX_SUPPLY,
  referencePrice: 0.101931,
});
assert.strictEqual(impl14.listedCount, 0);
assert.strictEqual(impl14.impliedPricePerAnts, null);
assert.ok(Math.abs(impl14.fdvUsd - 0.101931 * ANTS_MAX_SUPPLY) < 1e-6);

console.log('stats_ok=1');
