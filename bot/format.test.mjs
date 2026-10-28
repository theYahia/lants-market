// bot/format.test.mjs - tweet text builders, pure string formatting.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtAmount,
  fmtEmission,
  fmtCompact,
  floorText,
  tradeText,
  newListingText,
  newFloorListingText,
  delistText,
  digestText,
  epochText,
  burnText,
  settledText,
  stakedText,
  epochStatsText,
  recordText,
  usdWhole,
  pct,
} from './format.mjs';

const DOT = '\u00b7'; // middle dot separator used by the templates
const ARROW = '\u2192';

test('fmtAmount: trims trailing zeros, keeps meaningful cents', () => {
  assert.equal(fmtAmount(400), '400');
  assert.equal(fmtAmount(762.4724), '762.47');
  assert.equal(fmtAmount(1512.7), '1512.7');
  assert.equal(fmtAmount(100.05), '100.05');
  assert.equal(fmtAmount(62.5), '62.5');
  assert.equal(fmtAmount(5.001), '5');
});

test('fmtAmount: zero, negative and non-finite input', () => {
  assert.equal(fmtAmount(0), '0');
  assert.equal(fmtAmount(-3), '0');
  assert.equal(fmtAmount(NaN), '0');
  assert.equal(fmtAmount(Infinity), '0');
});

test('fmtEmission: rounds and groups with en-US separators', () => {
  assert.equal(fmtEmission(1500000), '1,500,000');
  assert.equal(fmtEmission(1234567.4), '1,234,567');
  assert.equal(fmtEmission(0), '0');
});

test('fmtCompact: K/M/B notation with trimming', () => {
  assert.equal(fmtCompact(1500000), '1.5M');
  assert.equal(fmtCompact(6000000), '6M');
  assert.equal(fmtCompact(1535689.21), '1.54M');
  assert.equal(fmtCompact(1000), '1K');
  assert.equal(fmtCompact(1250000000), '1.25B');
  assert.equal(fmtCompact(999), '999');
  assert.equal(fmtCompact(550.7), '551');
  assert.equal(fmtCompact(0), '0');
  assert.equal(fmtCompact(-5), '0');
  assert.equal(fmtCompact(NaN), '0');
});

test('floorText: price changes with sign and site link', () => {
  const t = floorText(0.101931, 0.094);
  assert.match(t, /^Floor: \$0\.102/);
  assert.match(t, /\$0\.094/);
  assert.match(t, /\(-\d+\.\d%\)/);
  assert.ok(t.includes(DOT));
  assert.ok(t.includes('lants.eth.limo'));
  assert.ok(t.includes(ARROW));
  assert.match(floorText(0.09, 0.12), /\(\+33\.3%\)/);
});

test('tradeText: full trade line with per-ANT price and USDC total', () => {
  const t = tradeText({ tokenId: 205, amount: 42.5, perAntUsd: 0.0025, usdTotal: 0.10625 });
  assert.equal(t, 'Sold: #205 ' + DOT + ' 42.5 ANTS @ $0.0025 ($0.11 USDC) ' + DOT + ' lants.eth.limo/#position/205');
});

test('newListingText: with and without a lock', () => {
  const t = newListingText({ id: 7, amount: 100, perAntUsd: 0.101, lockDays: 14 });
  assert.equal(t, 'New listing: #7 ' + DOT + ' 100 ANTS @ $0.101 ' + DOT + ' lock 2w ' + DOT + ' lants.eth.limo/#position/7');
  const s = newListingText({ id: 8, amount: 100, perAntUsd: 0.101, lockDays: 0 });
  assert.ok(!s.includes('lock'));
  assert.ok(s.startsWith('New listing: #8'));
});

test('newFloorListingText: same detail as a listing, new-floor prefix', () => {
  const t = newFloorListingText({ id: 7, amount: 100, perAntUsd: 0.101, lockDays: 14 });
  assert.equal(t, 'New floor listing: #7 ' + DOT + ' 100 ANTS @ $0.101 ' + DOT + ' lock 2w ' + DOT + ' lants.eth.limo/#position/7');
  assert.ok(newFloorListingText({ id: 8, amount: 100, perAntUsd: 0.09, lockDays: 0 }).startsWith('New floor listing: #8'));
});

test('delistText: plain id line with deep link', () => {
  assert.equal(delistText(12), 'Delisted: #12 ' + DOT + ' lants.eth.limo/#position/12');
});

test('epochText: emission only, avg only, neither and both', () => {
  const both = epochText(23, 1500000, 0.101931);
  assert.equal(both, 'Epoch 23 closed ' + DOT + ' 1,500,000 ANTS emitted ' + DOT + ' 24h avg $0.102 ' + DOT + ' lants.eth.limo');
  const em = epochText(23, 1500000);
  assert.ok(em.includes('1,500,000 ANTS emitted'));
  assert.ok(!em.includes('24h avg'));
  const avg = epochText(23, null, 0.101931);
  assert.ok(avg.includes('24h avg $0.102'));
  assert.ok(!avg.includes('emitted'));
  const bare = epochText(23, undefined, undefined);
  assert.equal(bare, 'Epoch 23 closed ' + DOT + ' lants.eth.limo');
});

test('burnText: total burned and attribution pinned', () => {
  assert.equal(
    burnText({ ants: 1500000, epoch: 21 }, 6000000),
    'ANTS burn: 1.5M (epoch 21) ' + DOT + ' total 6M ' + DOT + ' data: antseedstats.com'
  );
});

test('settledText: whole dollars, change percent, settles and sellers', () => {
  const t = settledText('7d', 12804.23, '+6.1%', 27841, 70);
  assert.equal(t, 'AntSeed 7d settled: $12,804 (+6.1%) ' + DOT + ' 27,841 settlements ' + DOT + ' 70 sellers ' + DOT + ' data: antseedstats.com');
  assert.equal(settledText('30d', 30411.16, '-3.0%', 78141, 88), 'AntSeed 30d settled: $30,411 (-3.0%) ' + DOT + ' 78,141 settlements ' + DOT + ' 88 sellers ' + DOT + ' data: antseedstats.com');
});

test('stakedText: compact value, change percent and share of stakable', () => {
  assert.equal(stakedText(1535689.21, '+5.2%', 73.2107), 'Staked: 1.54M ANTS (+5.2%) ' + DOT + ' 73% of stakable ' + DOT + ' data: antseedstats.com');
  assert.equal(stakedText(1500000, '-2.0%', 71.5), 'Staked: 1.5M ANTS (-2.0%) ' + DOT + ' 72% of stakable ' + DOT + ' data: antseedstats.com');
});

test('recordText: settled7d all-time high with attribution', () => {
  assert.equal(recordText(13400.5), 'AntSeed 7d settled hit a record: $13,401 ' + DOT + ' data: antseedstats.com');
});

test('usdWhole: whole dollars with thousands separators', () => {
  assert.equal(usdWhole(12804.23), '$12,804');
  assert.equal(usdWhole(12804.5), '$12,805');
  assert.equal(usdWhole(0), '$0');
  assert.equal(usdWhole(NaN), '$0');
  assert.equal(usdWhole(994.4), '$994');
});

test('pct: signed percent strings', () => {
  assert.equal(pct(12000, 12804.23), '+6.7%');
  assert.equal(pct(12804.23, 12000), '-6.3%');
  assert.equal(pct(100, 100), '+0.0%');
});

test('epochStatsText: optional measures included only when supplied', () => {
  const full = epochStatsText({ epoch: 21, emissionAnts: 1500000, sellerPointsUsd: 4200.5, burnAnts: 300000 });
  assert.equal(full, 'Epoch 21 rewards ' + DOT + ' 1.5M ANTS emission ' + DOT + ' $4,200.5 seller points ' + DOT + ' 300K burned ' + DOT + ' data: antseedstats.com');
  const bare = epochStatsText({ epoch: 21 });
  assert.equal(bare, 'Epoch 21 rewards ' + DOT + ' data: antseedstats.com');
  const zero = epochStatsText({ epoch: 21, emissionAnts: 0, sellerPointsUsd: 0, burnAnts: 0 });
  assert.ok(!zero.includes('ANTS emission'));
});

test('digestText: market plus optional antseedstats measures', () => {
  const t = digestText({
    floorAsk: 0.13,
    avg24h: 0.102,
    listedCount: 16,
    settled7d: 12804.23,
    sellers7d: 70,
    stakedAnts: 1535689.21,
    stakedPct: 73.2107,
  });
  assert.ok(t.startsWith('lANTS weekly\n'));
  assert.ok(t.includes('Floor $0.130 ' + DOT + ' 24h avg $0.102 ' + DOT + ' 16 listed'));
  assert.ok(t.includes('7d settled $12,804 ' + DOT + ' 70 sellers'));
  assert.ok(t.includes('1.54M ANTS staked ' + DOT + ' 73% of stakable'));
  assert.ok(t.includes('lants.eth.limo ' + DOT + ' data: antseedstats.com'));
});

test('digestText: market only when antseedstats is absent', () => {
  const t = digestText({ floorAsk: 0.14, avg24h: 0.101931, listedCount: 15 });
  assert.ok(t.includes('Floor $0.140'));
  assert.ok(t.includes('24h avg $0.102'));
  assert.ok(t.includes('15 listed'));
  assert.ok(!t.includes('7d settled'));
  assert.ok(!t.includes('staked'));
});

console.log('format_ok=1');
