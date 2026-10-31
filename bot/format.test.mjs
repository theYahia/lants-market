// bot/format.test.mjs - tweet text builders, pure string formatting.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtAmount,
  fmtEmission,
  fmtCompact,
  newListingText,
  newFloorListingText,
  digestText,
  epochText,
  burnText,
  settledText,
  stakedText,
  epochStatsText,
  recordText,
  usageText,
  countdownText,
  allocText,
  topModelsText,
  modalityText,
  videoText,
  lifetimeText,
  leadersText,
  dailyText,
  diemText,
  usageTargetText,
  usdWhole,
  pct,
} from './format.mjs';

const DOT = '\u00b7'; // middle dot separator used by the templates

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

test('newListingText: with and without a lock', () => {
  const t = newListingText({ id: 7, amount: 100, perAntUsd: 0.101, lockDays: 14 });
  assert.equal(t, '\u{1F195} New listing: #7 ' + DOT + ' \u{1F41C} 100 ANTS @ $0.101 ' + DOT + ' lock 2w ' + DOT + ' lants.eth.limo/#position/7');
  const s = newListingText({ id: 8, amount: 100, perAntUsd: 0.101, lockDays: 0 });
  assert.ok(!s.includes('lock'));
  assert.ok(s.startsWith('\u{1F195} New listing: #8'));
});

test('newFloorListingText: same detail as a listing, new-floor prefix', () => {
  const t = newFloorListingText({ id: 7, amount: 100, perAntUsd: 0.101, lockDays: 14 });
  assert.equal(t, '\u{1F3AF} New floor listing: #7 ' + DOT + ' \u{1F41C} 100 ANTS @ $0.101 ' + DOT + ' lock 2w ' + DOT + ' lants.eth.limo/#position/7');
  assert.ok(newFloorListingText({ id: 8, amount: 100, perAntUsd: 0.09, lockDays: 0 }).startsWith('\u{1F3AF} New floor listing: #8'));
});

test('epochText: claim/restake call to action with optional measures', () => {
  const both = epochText(23, 1500000, 0.101931);
  assert.equal(
    both,
    [
      '\u{1F3C1} Epoch 23 has ended ' + DOT + ' \u{1F41C} 1,500,000 ANTS emitted ' + DOT + ' 24h avg $0.102',
      '',
      'Staker rewards for epoch 23 are claimable now:',
      '\u2022 Claim \u2014 ANTS to your wallet',
      '\u2022 Restake \u2014 compound into a new position \u{1F331}',
      '',
      'Buyer rewards for epoch 23 can be staked into a seller pool.',
      '',
      'https://lants.eth.limo',
    ].join('\n')
  );
  assert.ok(both.length <= 280);
  const em = epochText(23, 1500000);
  assert.ok(em.startsWith('\u{1F3C1} Epoch 23 has ended ' + DOT + ' \u{1F41C} 1,500,000 ANTS emitted'));
  assert.ok(!em.includes('24h avg'));
  const avg = epochText(23, null, 0.101931);
  assert.ok(avg.startsWith('\u{1F3C1} Epoch 23 has ended ' + DOT + ' 24h avg $0.102'));
  assert.ok(!avg.includes('emitted'));
  const bare = epochText(23, undefined, undefined);
  assert.equal(bare.split('\n')[0], '\u{1F3C1} Epoch 23 has ended');
  assert.ok(bare.endsWith('\n\nhttps://lants.eth.limo'));
  assert.ok(bare.length <= 280);
});

test('epochText: drops the measures instead of exceeding the tweet limit', () => {
  const t = epochText(23, 999999999999, 1234.5678);
  assert.ok(t.length <= 280);
  assert.equal(t.split('\n')[0], '\u{1F3C1} Epoch 23 has ended');
  assert.ok(!t.includes('emitted'));
});

test('epochText: restake bullet gains the power bonus when known', () => {
  const t = epochText(23, 1500000, 0.101931, { restakeBonusPct: 5 });
  assert.ok(t.includes('\u2022 Restake \u2014 compound into a new position \u{1F331} (+5% power bonus)'));
  assert.ok(t.length <= 280);
  const noBonus = epochText(23, 1500000, 0.101931);
  assert.ok(noBonus.includes('\u2022 Restake \u2014 compound into a new position \u{1F331}'));
  assert.ok(!noBonus.includes('power bonus'));
});

test('burnText: total burned and attribution pinned', () => {
  assert.equal(
    burnText({ ants: 1500000, epoch: 21 }, 6000000),
    '\u{1F525} ANTS burn: \u{1F41C} 1.5M (epoch 21) ' + DOT + ' total 6M ' + DOT + ' data: antseedstats.com'
  );
});

test('settledText: whole dollars, change percent, settles and sellers', () => {
  const t = settledText('7d', 12804.23, '+6.1%', 27841, 70);
  assert.equal(t, '\u{1F4B0} AntSeed 7d settled: $12,804 (+6.1%) ' + DOT + ' 27,841 settlements ' + DOT + ' 70 sellers ' + DOT + ' data: antseedstats.com');
  assert.equal(settledText('30d', 30411.16, '-3.0%', 78141, 88), '\u{1F4B0} AntSeed 30d settled: $30,411 (-3.0%) ' + DOT + ' 78,141 settlements ' + DOT + ' 88 sellers ' + DOT + ' data: antseedstats.com');
});

test('settledText: appends buyers only when supplied', () => {
  assert.equal(
    settledText('7d', 12804.23, '+6.1%', 27841, 70, 306),
    '\u{1F4B0} AntSeed 7d settled: $12,804 (+6.1%) ' + DOT + ' 27,841 settlements ' + DOT + ' 70 sellers ' + DOT + ' 306 buyers ' + DOT + ' data: antseedstats.com'
  );
  assert.ok(!settledText('7d', 12804.23, '+6.1%', 27841, 70).includes('buyers'));
  assert.ok(!settledText('7d', 12804.23, '+6.1%', 27841, 70, 0).includes('buyers'));
});

test('stakedText: compact value, change percent and share of stakable', () => {
  assert.equal(stakedText(1535689.21, '+5.2%', 73.2107), '\u{1F331} Staked: 1.54M ANTS (+5.2%) ' + DOT + ' 73% of stakable ' + DOT + ' data: antseedstats.com');
  assert.equal(stakedText(1500000, '-2.0%', 71.5), '\u{1F331} Staked: 1.5M ANTS (-2.0%) ' + DOT + ' 72% of stakable ' + DOT + ' data: antseedstats.com');
});

test('recordText: settled7d all-time high with attribution', () => {
  assert.equal(recordText(13400.5), '\u{1F3C6} AntSeed 7d settled hit a record: $13,401 ' + DOT + ' data: antseedstats.com');
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
  assert.equal(full, '\u{1F381} Epoch 21 rewards ' + DOT + ' \u{1F41C} 1.5M ANTS emission ' + DOT + ' $4,200.5 seller points ' + DOT + ' 300K burned ' + DOT + ' data: antseedstats.com');
  const bare = epochStatsText({ epoch: 21 });
  assert.equal(bare, '\u{1F381} Epoch 21 rewards ' + DOT + ' data: antseedstats.com');
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
  assert.ok(t.startsWith('\u{1F4CA} lANTS weekly\n'));
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

test('digestText: appends usage and generative lines when supplied', () => {
  const t = digestText({
    floorAsk: 0.13,
    avg24h: 0.102,
    listedCount: 16,
    usage: { requests: 193584, tokens: 9768431978 },
    generative: { videos: 3017, spendUsd: 2368.63 },
  });
  assert.ok(t.includes('24h 193.58K requests ' + DOT + ' 9.77B tokens'));
  assert.ok(t.includes('7d generative $2,369 ' + DOT + ' 3.02K videos'));
});

test('digestText: omits demand lines when usage/generative absent', () => {
  const t = digestText({ floorAsk: 0.13, avg24h: 0.102, listedCount: 16 });
  assert.ok(!t.includes('requests'));
  assert.ok(!t.includes('generative'));
});

test('usageText: 24h demand with attribution', () => {
  const t = usageText({ requests: 193584, tokens: 9768431978, videos: 600, coverage: 0.946880907 });
  assert.equal(t, '\u{1F4E1} AntSeed 24h ' + DOT + ' 193.58K requests ' + DOT + ' 9.77B tokens ' + DOT + ' 600 videos ' + DOT + ' 95% attributed ' + DOT + ' data: antseedstats.com');
});

test('countdownText: epoch countdown with optional bonus', () => {
  const withBonus = countdownText({ epoch: 28, hoursLeft: 3, bonusPct: 5 });
  assert.equal(
    withBonus,
    '\u{23F3}\uFE0F Epoch 28 ends in ~3h \u2014 claim staker rewards or restake with a +5% power bonus \u{1F331}\n\nhttps://lants.eth.limo'
  );
  assert.ok(withBonus.length <= 280);
  const noBonus = countdownText({ epoch: 28, hoursLeft: 1 });
  assert.equal(
    noBonus,
    '\u{23F3}\uFE0F Epoch 28 ends in ~1h \u2014 claim staker rewards or restake \u{1F331}\n\nhttps://lants.eth.limo'
  );
});

test('allocText: emission buckets in cap-pct order with labels', () => {
  const t = allocText({
    epoch: 28,
    buckets: [
      { key: 'sellerPools', capPct: 40 },
      { key: 'usage', capPct: 20 },
      { key: 'team', capPct: 15 },
      { key: 'reserve', capPct: 15 },
      { key: 'verification', capPct: 10 },
    ],
  });
  assert.equal(
    t,
    '\u{1F9EE} Epoch 28 emission ' + DOT + ' 40% seller pools ' + DOT + ' 20% usage ' + DOT + ' 15% team ' + DOT + ' 15% reserve ' + DOT + ' 10% verification ' + DOT + ' data: antseedstats.com'
  );
  assert.ok(t.length <= 280);
});

test('topModelsText: joins display names with attribution', () => {
  const t = topModelsText({ models: ['Claude Opus 5.5', 'GPT-6 Astra', 'Kimi K3'] });
  assert.equal(t, '\u{1F3C5} Most-used AI on AntSeed (7d): Claude Opus 5.5 ' + DOT + ' GPT-6 Astra ' + DOT + ' Kimi K3 ' + DOT + ' data: antseedstats.com');
});

test('modalityText: 7d spend by modality', () => {
  const t = modalityText({ textUsd: 10233.61, videoUsd: 2337.98, imagesUsd: 172.17 });
  assert.equal(t, '\u{1F9EC} AntSeed 7d spend: text $10.23K ' + DOT + ' video $2.34K ' + DOT + ' images $172 ' + DOT + ' data: antseedstats.com');
});

test('videoText: native video-inference milestone', () => {
  const t = videoText({ videos: 5000, spendUsd: 2510.15 });
  assert.equal(t, '\u{1F39E}\uFE0F Native video inference: 5K videos ' + DOT + ' $2.51K in 7d ' + DOT + ' data: antseedstats.com');
});

test('lifetimeText: milestones for counts and volume', () => {
  assert.equal(lifetimeText('settles', 700000), '\u{1F6F0}\uFE0F AntSeed passed 700,000 settlements ' + DOT + ' data: antseedstats.com');
  assert.equal(lifetimeText('settledUsd', 400000), '\u{1F6F0}\uFE0F AntSeed passed $400,000 settled volume ' + DOT + ' data: antseedstats.com');
  assert.equal(lifetimeText('buyers', 1500), '\u{1F6F0}\uFE0F AntSeed passed 1,500 buyers ' + DOT + ' data: antseedstats.com');
  assert.equal(lifetimeText('sellers', 300), '\u{1F6F0}\uFE0F AntSeed passed 300 sellers ' + DOT + ' data: antseedstats.com');
});

test('leadersText: 24h leaders with attribution', () => {
  const t = leadersText({
    sellerName: 'Open Forge',
    sellerUsd: 645.38,
    topModelSales: { display: 'GPT-6 Astra', usd: 410.19 },
    topModelTokens: { display: 'DeepSeek V4.1 Flash', tokens: 5713003154 },
  });
  assert.equal(t, '\u{1F947} AntSeed 24h ' + DOT + ' top seller Open Forge $645 ' + DOT + ' most revenue GPT-6 Astra $410 ' + DOT + ' most tokens DeepSeek V4.1 Flash 5.71B ' + DOT + ' data: antseedstats.com');
});

test('dailyText: yesterday summary', () => {
  const t = dailyText({ settledUsd: 2738.72, requests: 210696, newUsers: 18 });
  assert.equal(t, '\u{1F4C8} Yesterday on AntSeed ' + DOT + ' settled $2,739 ' + DOT + ' 210.7K requests ' + DOT + ' 18 new paid users ' + DOT + ' data: antseedstats.com');
});

test('diemText: capacity pool with optional change and payouts', () => {
  const t = diemText({ stakeValueUsd: 690694.85, stakers: 82, usdcDistributedUsd: 7647.37, pctChange: '+15.1%' });
  assert.equal(t, '\u{1F50B} DIEM pool: $690,695 backing capacity (+15.1%) ' + DOT + ' 82 stakers ' + DOT + ' $7,647 USDC paid out ' + DOT + ' data: antseedstats.com');
  assert.ok(!diemText({ stakeValueUsd: 690694.85, stakers: 82 }).includes('(+'));
});

test('usageTargetText: budget vs target percentages', () => {
  const t = usageTargetText({ epoch: 29, usagePctOfTarget: 0.006031, stakePctOfTarget: 0.392649 });
  assert.equal(t, '\u{1F3AF} Epoch 29 targets ' + DOT + ' usage 0.006% of target ' + DOT + ' stake 0.39% of target ' + DOT + ' data: antseedstats.com');
});

console.log('format_ok=1');
