import test from 'node:test';
import assert from 'node:assert/strict';
import { diffFeed, diffAntseedStats } from './diff.mjs';

const MID = '\u00b7';

test('no change yields no events', () => {
  const prev = { epoch: 28 };
  const curr = { avg24h: 0.1, epoch: 28 };
  assert.deepEqual(diffFeed(prev, curr), []);
});

test('epoch advance reports the closed epoch, with optional emission', () => {
  const prev = { epoch: 28 };
  const curr = { avg24h: 0.101939, epoch: 29 };
  const withEmission = diffFeed(prev, curr, { emission: 104500 });
  assert.equal(withEmission.length, 1);
  assert.equal(withEmission[0].key, 'epoch:28');
  assert.ok(
    withEmission[0].text.startsWith(
      `\u{1F3C1} Epoch 28 has ended ${MID} \u{1F41C} 104,500 ANTS emitted ${MID} 24h avg $0.102`
    )
  );
  assert.ok(withEmission[0].text.includes('Staker rewards for epoch 28 are claimable now:'));
  assert.ok(withEmission[0].text.endsWith('https://lants.eth.limo'));
  const without = diffFeed(prev, curr);
  assert.ok(without[0].text.startsWith(`\u{1F3C1} Epoch 28 has ended ${MID} 24h avg $0.102`));
});

test('a cold start (no baseline) invents no events', () => {
  const curr = { avg24h: 0.1, epoch: 28 };
  assert.deepEqual(diffFeed(null, curr), []);
});

test('diffAntseedStats reports new burn epochs with the running total', () => {
  const prev = {
    settled7d: 100,
    settled30d: 100,
    stakedAnts: 100,
    stakedPct: 50,
    burns: [{ epoch: 25, ants: 1500000 }],
  };
  const curr = {
    settled7d: 100,
    settled30d: 100,
    stakedAnts: 100,
    stakedPct: 50,
    burnedAnts: 7500000,
    burns: [{ epoch: 25, ants: 1500000 }, { epoch: 26, ants: 1500000 }],
  };
  const events = diffAntseedStats(prev, curr);
  const burn = events.find((e) => e.type === 'burn');
  assert.equal(burn.key, 'burn:26');
  assert.equal(burn.text, `\u{1F525} ANTS burn: \u{1F41C} 1.5M (epoch 26) ${MID} total 7.5M ${MID} data: antseedstats.com`);
  assert.equal(events.length, 1);
});

test('diffAntseedStats posts settled/staked past a move from the last posted value', () => {
  const base = { settled30d: 30000, stakedPct: 73, burns: [] };
  const prev = {
    ...base,
    settled7d: 12000,
    stakedAnts: 1500000,
    posted: { settled7d: 12000, settled30d: 30000, stakedAnts: 1500000 },
  };
  const curr = {
    ...base,
    settled7d: 12804.23,
    settles7d: 27841,
    sellers7d: 70,
    stakedAnts: 1600000,
    stakedPct: 74,
  };
  const events = diffAntseedStats(prev, curr);
  const settled = events.find((e) => e.type === 'settled');
  const staked = events.find((e) => e.type === 'staked');
  assert.equal(settled.key, 'settled:settled7d:12804.23');
  assert.equal(settled.text, `\u{1F4B0} AntSeed 7d settled: $12,804 (+6.7%) ${MID} 27,841 settlements ${MID} 70 sellers ${MID} data: antseedstats.com`);
  assert.strictEqual(settled.field, 'settled7d');
  assert.strictEqual(settled.value, 12804.23);
  assert.equal(staked.text, `\u{1F331} Staked: 1.6M ANTS (+6.7%) ${MID} 74% of stakable ${MID} data: antseedstats.com`);
  assert.strictEqual(staked.field, 'stakedAnts');
  assert.equal(staked.value, 1600000);
  assert.equal(events.length, 2);
});

test('diffAntseedStats: a move under ±5% from the last posted value posts nothing', () => {
  const prev = {
    settled7d: 12000,
    settled30d: 30000,
    stakedAnts: 1500000,
    posted: { settled7d: 12000, settled30d: 30000, stakedAnts: 1500000 },
  };
  const curr = {
    settled7d: 12200,
    settled30d: 30200,
    stakedAnts: 1510000,
    burns: [],
  };
  assert.equal(diffAntseedStats(prev, curr).length, 0);
});

test('diffAntseedStats drops settled24h posts entirely', () => {
  const prev = {
    settled7d: 12000,
    settled30d: 30000,
    stakedAnts: 1500000,
    posted: { settled7d: 12000, settled30d: 30000, stakedAnts: 1500000 },
  };
  const curr = {
    ...prev,
    settled24h: 2600,
  };
  const events = diffAntseedStats(prev, curr);
  assert.equal(events.find((e) => e.type === 'settled'), undefined);
  assert.equal(events.length, 0);
});

test('diffAntseedStats: missing posted baseline is seeded and posts nothing', () => {
  const prev = { settled7d: 100, settled30d: 100, stakedAnts: 100, burns: [] };
  const curr = {
    settled7d: 12804.23,
    settled30d: 30000,
    stakedAnts: 1600000,
    burns: [],
  };
  assert.equal(diffAntseedStats(prev, curr).length, 0);
});

test('diffAntseedStats: a new settled7d high posts a record regardless of ±5%', () => {
  const prev = {
    settled7d: 12000,
    settled30d: 30000,
    stakedAnts: 1500000,
    posted: { settled7d: 12000, settled30d: 30000, stakedAnts: 1500000 },
    max7d: 12000,
  };
  const curr = {
    settled7d: 12400,
    settles7d: 26000,
    sellers7d: 68,
    settled30d: 30000,
    stakedAnts: 1500000,
    burns: [],
  };
  const events = diffAntseedStats(prev, curr);
  const rec = events.find((e) => e.type === 'record7d');
  assert.equal(rec.key, 'record7d:12400');
  assert.equal(rec.text, `\u{1F3C6} AntSeed 7d settled hit a record: $12,400 ${MID} data: antseedstats.com`);
  assert.strictEqual(rec.field, 'max7d');
  assert.equal(rec.value, 12400);
  assert.equal(events.filter((e) => e.type === 'settled').length, 0);
});

test('diffAntseedStats: a new high suppresses the plain 7d settled post', () => {
  const prev = {
    settled7d: 12000,
    settled30d: 30000,
    stakedAnts: 1500000,
    posted: { settled7d: 12000, settled30d: 30000, stakedAnts: 1500000 },
    max7d: 12000,
  };
  const curr = {
    settled7d: 13772,
    settles7d: 29664,
    sellers7d: 72,
    buyers7d: 307,
    settled30d: 30000,
    stakedAnts: 1500000,
    stakedPct: 73,
    burns: [],
  };
  const events = diffAntseedStats(prev, curr);
  assert.ok(events.find((e) => e.type === 'record7d'));
  assert.equal(events.filter((e) => e.type === 'settled').length, 0);
});

test('diffAntseedStats: no record when the high equals the stored max7d', () => {
  const prev = {
    settled7d: 12000,
    settled30d: 30000,
    stakedAnts: 1500000,
    posted: { settled7d: 12000, settled30d: 30000, stakedAnts: 1500000 },
    max7d: 13000,
  };
  const curr = { settled7d: 12500, settled30d: 30000, stakedAnts: 1500000 };
  assert.equal(diffAntseedStats(prev, curr).find((e) => e.type === 'record7d'), undefined);
});

test('diffAntseedStats cold start invents no events', () => {
  const curr = {
    settled24h: 100,
    stakedAnts: 100,
    burns: [{ epoch: 25, ants: 1 }],
  };
  assert.deepEqual(diffAntseedStats(null, curr), []);
});

test('diffAntseedStats posts an enriched epoch close on completed-epoch advance', () => {
  const base = { settled24h: 1, settled7d: 1, settled30d: 1, stakedAnts: 1, stakedPct: 1, burns: [] };
  const prev = { ...base, maxCompletedEpoch: 27 };
  const curr = {
    ...base,
    epochs: [
      { epoch: 27, status: 'complete', emissionAnts: 5000000, burnAnts: 1500000, sellerPointsUsd: 6524.06 },
      { epoch: 28, status: 'complete', emissionAnts: 5000000, burnAnts: null, sellerPointsUsd: 10735.66 },
      { epoch: 29, status: 'current' },
    ],
  };
  const events = diffAntseedStats(prev, curr);
  const e = events.find((x) => x.type === 'epochstats');
  assert.equal(e.key, 'epochstats:28');
  assert.equal(e.text, `\u{1F381} Epoch 28 rewards ${MID} \u{1F41C} 5M ANTS emission ${MID} $10,735.66 seller points ${MID} data: antseedstats.com`);
  assert.equal(events.length, 1);
});

test('diffAntseedStats posts usage past a ±5% move in requests24h', () => {
  const base = { settled7d: 100, settled30d: 100, stakedAnts: 100, stakedPct: 50, burns: [] };
  const prev = { ...base, posted: { settled7d: 100, settled30d: 100, stakedAnts: 100, requests24h: 200000 } };
  const curr = {
    ...base,
    requests24h: 230000,
    tokens24h: 9768431978,
    videos24h: 600,
    coverage24h: 0.946880907,
  };
  const events = diffAntseedStats(prev, curr);
  const usage = events.find((e) => e.type === 'usage');
  assert.equal(usage.key, 'usage:230000');
  assert.equal(usage.text, `\u{1F4E1} AntSeed 24h ${MID} 230K requests ${MID} 9.77B tokens ${MID} 600 videos ${MID} 95% attributed ${MID} data: antseedstats.com`);
  assert.strictEqual(usage.field, 'requests24h');
  assert.strictEqual(usage.value, 230000);
});

test('diffAntseedStats stays silent on usage without a seeded baseline', () => {
  const base = { settled7d: 100, settled30d: 100, stakedAnts: 100, burns: [] };
  const prev = { ...base, posted: { settled7d: 100, settled30d: 100, stakedAnts: 100 } };
  const curr = { ...base, requests24h: 230000, tokens24h: 1, videos24h: 1, coverage24h: 0.5 };
  assert.equal(diffAntseedStats(prev, curr).find((e) => e.type === 'usage'), undefined);
});

test('diffAntseedStats emits countdown once per epoch per bucket', () => {
  const base = { settled7d: 100, settled30d: 100, stakedAnts: 100, stakedPct: 50, burns: [] };
  const posted = { settled7d: 100, settled30d: 100, stakedAnts: 100, requests24h: null };
  const prev = { ...base, epoch: 28, secondsLeft: 7200, countdownPosted: {}, posted };
  const curr = { ...base, epoch: 28, secondsLeft: 7200, restakeBonusPct: 5 };
  const first = diffAntseedStats(prev, curr);
  const cd = first.find((e) => e.type === 'countdown');
  assert.equal(cd.key, 'countdown:28:6h');
  assert.ok(cd.text.startsWith('\u{23F3}\uFE0F Epoch 28 ends in ~2h'));
  assert.ok(cd.text.includes('+5% power bonus'));
  assert.deepEqual(cd.meta, { field: 'countdown', value: { epoch: 28, bucket: '6h' } });
  assert.equal(first.length, 1);
  // Same bucket does not re-emit.
  const prevSame = { ...prev, countdownPosted: { 28: '6h' } };
  assert.equal(diffAntseedStats(prevSame, curr).find((e) => e.type === 'countdown'), undefined);
  // Crossing into the 1h bucket emits the next boundary.
  const curr1h = { ...curr, secondsLeft: 1800 };
  const oneHr = diffAntseedStats(prevSame, curr1h).find((e) => e.type === 'countdown');
  assert.equal(oneHr.key, 'countdown:28:1h');
  assert.ok(oneHr.text.startsWith('\u{23F3}\uFE0F Epoch 28 ends in ~1h'));
});

test('diffAntseedStats posts alloc on completed-epoch advance with economics', () => {
  const base = { settled24h: 1, settled7d: 1, settled30d: 1, stakedAnts: 1, stakedPct: 1, burns: [] };
  const prev = { ...base, maxCompletedEpoch: 27 };
  const curr = {
    ...base,
    epochs: [
      { epoch: 27, status: 'complete' },
      { epoch: 28, status: 'complete', emissionAnts: 5000000, burnAnts: null, sellerPointsUsd: 10735.66 },
      { epoch: 29, status: 'current' },
    ],
    epochDetail: { epoch: 28, economics: { buckets: [{ key: 'sellerPools', capPct: 40 }, { key: 'usage', capPct: 20 }] } },
  };
  const events = diffAntseedStats(prev, curr);
  const alloc = events.find((e) => e.type === 'alloc');
  assert.equal(alloc.key, 'alloc:28');
  assert.equal(alloc.text, `\u{1F9EE} Epoch 28 emission ${MID} 40% seller pools ${MID} 20% usage ${MID} data: antseedstats.com`);
});

test('diffAntseedStats emits topmodels by default (enabled)', () => {
  const base = { settled7d: 1, settled30d: 1, stakedAnts: 1, burns: [] };
  const posted = { settled7d: 1, settled30d: 1, stakedAnts: 1, requests24h: null };
  const prev = { ...base, posted, lastTopModelsAt: null };
  const curr = { ...base, topModels: ['Claude Opus 5.5', 'GPT-6 Astra', 'Kimi K3'] };
  const ev = diffAntseedStats(prev, curr).find((e) => e.type === 'topmodels');
  assert.ok(ev);
  assert.ok(ev.text.includes('Claude Opus 5.5'));
});

test('diffAntseedStats emits topmodels weekly when enabled', () => {
  const base = { settled7d: 1, settled30d: 1, stakedAnts: 1, burns: [] };
  const posted = { settled7d: 1, settled30d: 1, stakedAnts: 1, requests24h: null };
  const curr = { ...base, topModels: ['Claude Opus 5.5', 'GPT-6 Astra', 'Kimi K3'] };
  const nowMs = Date.parse('2026-10-28T12:00:00Z');
  const prevOld = { ...base, posted, lastTopModelsAt: nowMs - 8 * 24 * 3600 * 1000 };
  const ev = diffAntseedStats(prevOld, curr, { nowMs, topModelsEnabled: true }).find((e) => e.type === 'topmodels');
  assert.equal(ev.key, 'topmodels:2026-10-28');
  assert.equal(ev.text, `\u{1F3C5} Most-used AI on AntSeed (7d): Claude Opus 5.5 ${MID} GPT-6 Astra ${MID} Kimi K3 ${MID} data: antseedstats.com`);
  assert.deepEqual(ev.meta, { field: 'lastTopModelsAt', value: nowMs });
  const prevRecent = { ...base, posted, lastTopModelsAt: nowMs - 1 * 24 * 3600 * 1000 };
  assert.equal(diffAntseedStats(prevRecent, curr, { nowMs, topModelsEnabled: true }).find((e) => e.type === 'topmodels'), undefined);
});

test('diffAntseedStats folds buyers into the settled post', () => {
  const base = { settled30d: 30000, stakedPct: 73, burns: [] };
  const prev = { ...base, settled7d: 12000, stakedAnts: 1500000, posted: { settled7d: 12000, settled30d: 30000, stakedAnts: 1500000 } };
  const curr = { ...base, settled7d: 12804.23, settles7d: 27841, sellers7d: 70, buyers7d: 309, stakedAnts: 1500000, stakedPct: 73 };
  const events = diffAntseedStats(prev, curr);
  const settled = events.find((e) => e.type === 'settled');
  assert.ok(settled.text.includes('70 sellers'));
  assert.ok(settled.text.includes('309 buyers'));
});

test('diffAntseedStats posts modality weekly', () => {
  const base = { settled7d: 1, settled30d: 1, stakedAnts: 1, burns: [] };
  const posted = { settled7d: 1, settled30d: 1, stakedAnts: 1, requests24h: null };
  const nowMs = Date.parse('2026-10-28T12:00:00Z');
  const curr = { ...base, modalityTextUsd: 10233.61, modalityVideoUsd: 2337.98, modalityImagesUsd: 172.17 };
  const prev = { ...base, posted, lastModalityAt: null };
  const ev = diffAntseedStats(prev, curr, { nowMs }).find((e) => e.type === 'modality');
  assert.ok(ev);
  assert.equal(ev.key, 'modality:2026-10-28');
  assert.ok(ev.text.startsWith(`\u{1F9EC} AntSeed 7d spend: text $10.23K`));
  assert.deepEqual(ev.meta, { field: 'lastModalityAt', value: nowMs });
  const prevRecent = { ...base, posted, lastModalityAt: nowMs - 3 * 24 * 3600 * 1000 };
  assert.equal(diffAntseedStats(prevRecent, curr, { nowMs }).find((e) => e.type === 'modality'), undefined);
});

test('diffAntseedStats posts a video milestone on a round bucket', () => {
  const base = { settled7d: 1, settled30d: 1, stakedAnts: 1, burns: [] };
  const posted = { settled7d: 1, settled30d: 1, stakedAnts: 1, requests24h: null, videoMilestone: 3000 };
  const prev = { ...base, posted };
  const curr = { ...base, generativeVideos7d: 5000, generativeSpendUsd7d: 2510.15 };
  const ev = diffAntseedStats(prev, curr).find((e) => e.type === 'video');
  assert.equal(ev.key, 'video:5000');
  assert.ok(ev.text.startsWith(`\u{1F39E}\uFE0F Native video inference: 5K videos`));
  assert.deepEqual(ev.meta, { field: 'videoMilestone', value: 5000 });
});

test('diffAntseedStats posts lifetime milestones on round buckets', () => {
  const base = { settled7d: 1, settled30d: 1, stakedAnts: 1, burns: [] };
  const posted = { settled7d: 1, settled30d: 1, stakedAnts: 1, requests24h: null, lifetimeSettles: 600000 };
  const prev = { ...base, posted };
  const curr = { ...base, lifetimeSettles: 700123 };
  const ev = diffAntseedStats(prev, curr).find((e) => e.type === 'lifetime');
  assert.equal(ev.key, 'lifetime:lifetimeSettles:700000');
  assert.equal(ev.text, `\u{1F6F0}\uFE0F AntSeed passed 700,000 settlements ${MID} data: antseedstats.com`);
  assert.deepEqual(ev.meta, { field: 'lifetimeSettles', value: 700000 });
});

test('diffAntseedStats posts leaders once per day', () => {
  const base = { settled7d: 1, settled30d: 1, stakedAnts: 1, burns: [] };
  const posted = { settled7d: 1, settled30d: 1, stakedAnts: 1, requests24h: null };
  const nowMs = Date.parse('2026-10-28T12:00:00Z');
  const leaders = {
    sellerName: 'Open Forge',
    sellerUsd: 645.38,
    topModelSales: { display: 'GPT-6 Astra', usd: 410.19, requests: 6585, buyers: 23 },
    topModelTokens: { display: 'DeepSeek V4.1 Flash', tokens: 5713003154 },
  };
  const prev = { ...base, posted, lastLeadersDay: null };
  const ev = diffAntseedStats(prev, { ...base, leaders }, { nowMs }).find((e) => e.type === 'leaders');
  assert.ok(ev);
  assert.equal(ev.key, 'leaders:2026-10-28');
  assert.ok(ev.text.includes('Open Forge $645'));
  assert.ok(ev.text.includes('GPT-6 Astra $410'));
  assert.deepEqual(ev.meta, { field: 'lastLeadersDay', value: '2026-10-28' });
  const prevSameDay = { ...base, posted, lastLeadersDay: '2026-10-28' };
  assert.equal(diffAntseedStats(prevSameDay, { ...base, leaders }, { nowMs }).find((e) => e.type === 'leaders'), undefined);
});

test("diffAntseedStats posts yesterday's network day once per day", () => {
  const base = { settled7d: 1, settled30d: 1, stakedAnts: 1, burns: [] };
  const posted = { settled7d: 1, settled30d: 1, stakedAnts: 1, requests24h: null };
  const nowMs = Date.parse('2026-10-29T12:00:00Z');
  const daily = [
    { day: '2026-10-28', settledUsd: 2738.72, requests: 210696, newUsers: 18 },
    { day: '2026-10-29', settledUsd: 1017.52, requests: 104978, newUsers: 4 },
  ];
  const prev = { ...base, posted, lastDailyDay: null };
  const ev = diffAntseedStats(prev, { ...base, daily }, { nowMs }).find((e) => e.type === 'daily');
  assert.ok(ev);
  assert.equal(ev.key, 'daily:2026-10-29');
  assert.ok(ev.text.includes('settled $2,739'));
  assert.ok(ev.text.includes('210.7K requests'));
  assert.ok(ev.text.includes('18 new paid users'));
  assert.ok(!ev.text.includes('1017'));
  assert.deepEqual(ev.meta, { field: 'lastDailyDay', value: '2026-10-29' });
});

test('diffAntseedStats posts DIEM capacity past a ±5% move', () => {
  const base = { settled7d: 1, settled30d: 1, stakedAnts: 1, burns: [] };
  const posted = { settled7d: 1, settled30d: 1, stakedAnts: 1, requests24h: null, diemStake: 600000 };
  const prev = { ...base, posted };
  const diem = { stakeValueUsd: 690694.85, stakers: 82, usdcDistributedUsd: 7647.37 };
  const ev = diffAntseedStats(prev, { ...base, diem }, {}).find((e) => e.type === 'diem');
  assert.equal(ev.key, 'diem:690695');
  assert.ok(ev.text.includes('$690,695 backing capacity'));
  assert.ok(ev.text.includes('82 stakers'));
  assert.strictEqual(ev.field, 'diemStake');
  assert.strictEqual(ev.value, 690694.85);
});

test('diffAntseedStats posts reward budgets vs targets weekly', () => {
  const base = { settled7d: 1, settled30d: 1, stakedAnts: 1, burns: [] };
  const posted = { settled7d: 1, settled30d: 1, stakedAnts: 1, requests24h: null };
  const nowMs = Date.parse('2026-10-28T12:00:00Z');
  const rewards = { epoch: 29, usagePctOfTarget: 0.006031, stakePctOfTarget: 0.392649 };
  const prev = { ...base, posted, lastUsageTargetAt: null };
  const ev = diffAntseedStats(prev, { ...base, rewards }, { nowMs }).find((e) => e.type === 'usagetarget');
  assert.ok(ev);
  assert.equal(ev.key, 'usagetarget:2026-10-28');
  assert.ok(ev.text.includes('usage 0.006% of target'));
  assert.ok(ev.text.includes('stake 0.39% of target'));
  assert.deepEqual(ev.meta, { field: 'lastUsageTargetAt', value: nowMs });
});
