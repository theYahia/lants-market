import test from 'node:test';
import assert from 'node:assert/strict';
import { diffFeed, diffAntseedStats } from './diff.mjs';

const MID = '\u00b7';

test('no change yields no events', () => {
  const prev = { epoch: 28, listings: [1, 2] };
  const curr = {
    avg24h: 0.1,
    epoch: 28,
    listings: [
      { id: 1, amount: 1, lockDays: 7, perAntUsd: 0.1 },
      { id: 2, amount: 1, lockDays: 7, perAntUsd: 0.1 },
    ],
  };
  assert.deepEqual(diffFeed(prev, curr), []);
});

test('new listing and delist are keyed by token id, price and listed flag', () => {
  const prev = { epoch: 28, listings: [1, 2] };
  const curr = {
    avg24h: 0.1,
    epoch: 28,
    listings: [
      { id: 2, amount: 1, lockDays: 7, perAntUsd: 0.1 },
      { id: 3, amount: 400, lockDays: 56, perAntUsd: 0.15 },
    ],
  };
  const events = diffFeed(prev, curr);
  const listing = events.find((e) => e.type === 'listing');
  const delist = events.find((e) => e.type === 'delist');
  assert.equal(listing.key, 'listing:3:listed:0.15');
  assert.equal(listing.text, `\u{1F195} New listing: #3 ${MID} \u{1F41C} 400 ANTS @ $0.150 ${MID} lock 8w ${MID} lants.eth.limo/#position/3`);
  assert.equal(delist.key, 'listing:1:unlisted');
  assert.equal(delist.text, `\u{1F5D1}\uFE0F Delisted: #1 ${MID} lants.eth.limo/#position/1`);
});

test('a relist at a new price is not swallowed (unlisted old + listed new)', () => {
  const prev = { epoch: 28, listings: [{ id: 5, perAntUsd: 0.14 }] };
  const curr = {
    avg24h: 0.1,
    epoch: 28,
    listings: [{ id: 5, amount: 400, lockDays: 56, perAntUsd: 0.12 }],
  };
  const events = diffFeed(prev, curr);
  assert.equal(events.length, 2);
  const delist = events.find((e) => e.type === 'delist');
  const listing = events.find((e) => e.type === 'listing');
  assert.equal(delist.key, 'listing:5:unlisted:0.14');
  assert.equal(listing.key, 'listing:5:listed:0.12');
  assert.equal(listing.text, `\u{1F195} New listing: #5 ${MID} \u{1F41C} 400 ANTS @ $0.120 ${MID} lock 8w ${MID} lants.eth.limo/#position/5`);
});

test('price float noise does not fake a relist', () => {
  const prev = { epoch: 28, listings: [{ id: 5, perAntUsd: 0.1399999993 }] };
  const curr = {
    avg24h: 0.1,
    epoch: 28,
    listings: [{ id: 5, amount: 400, lockDays: 56, perAntUsd: 0.14 }],
  };
  assert.deepEqual(diffFeed(prev, curr), []);
});

test('a vanished own listing delists normally', () => {
  const prev = { epoch: 28, listings: [7, 9] };
  const curr = {
    avg24h: 0.1,
    epoch: 28,
    listings: [{ id: 9, amount: 100, lockDays: 0, perAntUsd: 0.15 }],
  };
  const events = diffFeed(prev, curr);
  const delist = events.find((e) => e.type === 'delist');
  assert.equal(delist.key, 'listing:7:unlisted');
});

test('a brand-new lot that undercuts the previous floor posts once as New floor listing', () => {
  const prev = { epoch: 28, listings: [{ id: 1, perAntUsd: 0.15 }, { id: 2, perAntUsd: 0.14 }] };
  const curr = {
    avg24h: 0.1,
    epoch: 28,
    listings: [
      { id: 1, amount: 100, lockDays: 0, perAntUsd: 0.15 },
      { id: 2, amount: 100, lockDays: 0, perAntUsd: 0.14 },
      { id: 3, amount: 400, lockDays: 56, perAntUsd: 0.12 },
    ],
  };
  const events = diffFeed(prev, curr);
  const floorListing = events.find((e) => e.type === 'floor-listing');
  const listing = events.find((e) => e.type === 'listing');
  assert.equal(floorListing.key, 'listing:3:listed:0.12');
  assert.equal(floorListing.text, `\u{1F3AF} New floor listing: #3 ${MID} \u{1F41C} 400 ANTS @ $0.120 ${MID} lock 8w ${MID} lants.eth.limo/#position/3`);
  assert.equal(listing, undefined);
  assert.equal(events.length, 1);
});

test('a brand-new lot above the floor posts a plain listing', () => {
  const prev = { epoch: 28, listings: [{ id: 1, perAntUsd: 0.12 }] };
  const curr = {
    avg24h: 0.1,
    epoch: 28,
    listings: [
      { id: 1, amount: 100, lockDays: 0, perAntUsd: 0.12 },
      { id: 2, amount: 400, lockDays: 56, perAntUsd: 0.15 },
    ],
  };
  const events = diffFeed(prev, curr);
  const listing = events.find((e) => e.type === 'listing');
  assert.equal(listing.key, 'listing:2:listed:0.15');
  assert.equal(events.find((e) => e.type === 'floor-listing'), undefined);
});

test('two new lots undercutting the floor post one New floor listing', () => {
  const prev = { epoch: 28, listings: [{ id: 1, perAntUsd: 0.15 }] };
  const curr = {
    avg24h: 0.1,
    epoch: 28,
    listings: [
      { id: 1, amount: 100, lockDays: 0, perAntUsd: 0.15 },
      { id: 2, amount: 100, lockDays: 0, perAntUsd: 0.13 },
      { id: 3, amount: 100, lockDays: 0, perAntUsd: 0.12 },
    ],
  };
  const events = diffFeed(prev, curr);
  const floors = events.filter((e) => e.type === 'floor-listing');
  assert.equal(floors.length, 1);
  assert.equal(floors[0].key, 'listing:3:listed:0.12');
  const plain = events.find((e) => e.type === 'listing');
  assert.equal(plain.key, 'listing:2:listed:0.13');
  assert.equal(events.length, 2);
});

test('a floor change caused by a delist posts only the delist (no floor event)', () => {
  const prev = { epoch: 28, listings: [{ id: 3, perAntUsd: 0.12 }, { id: 4, perAntUsd: 0.15 }] };
  const curr = {
    avg24h: 0.1,
    epoch: 28,
    listings: [{ id: 4, amount: 100, lockDays: 0, perAntUsd: 0.15 }],
  };
  const events = diffFeed(prev, curr);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'delist');
  assert.equal(events[0].key, 'listing:3:unlisted:0.12');
  assert.equal(events.find((e) => e.type === 'floor'), undefined);
});

test('epoch advance reports the closed epoch, with optional emission', () => {
  const prev = { epoch: 28, listings: [] };
  const curr = { avg24h: 0.101939, epoch: 29, listings: [] };
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
  const curr = {
    avg24h: 0.1,
    epoch: 28,
    listings: [{ id: 1, amount: 1, lockDays: 7, perAntUsd: 0.1 }],
  };
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

test('diffAntseedStats gates topmodels off by default', () => {
  const base = { settled7d: 1, settled30d: 1, stakedAnts: 1, burns: [] };
  const posted = { settled7d: 1, settled30d: 1, stakedAnts: 1, requests24h: null };
  const prev = { ...base, posted, lastTopModelsAt: null };
  const curr = { ...base, topModels: ['Claude Opus 5.5', 'GPT-6 Astra', 'Kimi K3'] };
  assert.equal(diffAntseedStats(prev, curr).find((e) => e.type === 'topmodels'), undefined);
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
