import test from 'node:test';
import assert from 'node:assert/strict';
import { diffFeed, diffAntseedStats } from './diff.mjs';

const MID = '\u00b7';
const ARROW = '\u2192';

test('floor move produces one event with percent change', () => {
  const events = diffFeed(
    { floorAsk: 0.14, epoch: 28, listings: [], tradeIds: [] },
    { floorAsk: 0.132, avg24h: 0.1, epoch: 28, listings: [], trades: [] }
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'floor');
  assert.equal(events[0].key, 'floor:0.132');
  assert.equal(events[0].text, `Floor: $0.140 ${ARROW} $0.132 (-5.7%) ${MID} lants.eth.limo`);
});

test('no change yields no events', () => {
  const prev = { floorAsk: 0.14, epoch: 28, listings: [1, 2], tradeIds: ['a'] };
  const curr = {
    floorAsk: 0.14,
    avg24h: 0.1,
    epoch: 28,
    listings: [
      { id: 1, amount: 1, lockDays: 7, perAntUsd: 0.1 },
      { id: 2, amount: 1, lockDays: 7, perAntUsd: 0.1 },
    ],
    trades: [{ id: 'a', tradeType: 'listing' }],
  };
  assert.deepEqual(diffFeed(prev, curr), []);
});

test('new listing and delist are keyed by token id, price and listed flag', () => {
  const prev = { floorAsk: 0.14, epoch: 28, listings: [1, 2], tradeIds: [] };
  const curr = {
    floorAsk: 0.14,
    avg24h: 0.1,
    epoch: 28,
    listings: [
      { id: 2, amount: 1, lockDays: 7, perAntUsd: 0.1 },
      { id: 3, amount: 400, lockDays: 56, perAntUsd: 0.15 },
    ],
    trades: [],
  };
  const events = diffFeed(prev, curr);
  const listing = events.find((e) => e.type === 'listing');
  const delist = events.find((e) => e.type === 'delist');
  assert.equal(listing.key, 'listing:3:listed:0.15');
  assert.equal(listing.text, `New listing: #3 ${MID} 400 ANTS @ $0.150 ${MID} lock 8w ${MID} lants.eth.limo`);
  assert.equal(delist.key, 'listing:1:unlisted');
  assert.equal(delist.text, `Delisted: #1 ${MID} lants.eth.limo`);
});

test('a relist at a new price is not swallowed (unlisted old + listed new)', () => {
  const prev = { floorAsk: 0.14, epoch: 28, listings: [{ id: 5, perAntUsd: 0.14 }], tradeIds: [] };
  const curr = {
    floorAsk: 0.14,
    avg24h: 0.1,
    epoch: 28,
    listings: [{ id: 5, amount: 400, lockDays: 56, perAntUsd: 0.12 }],
    trades: [],
  };
  const events = diffFeed(prev, curr);
  assert.equal(events.length, 2);
  const delist = events.find((e) => e.type === 'delist');
  const listing = events.find((e) => e.type === 'listing');
  assert.equal(delist.key, 'listing:5:unlisted:0.14');
  assert.equal(listing.key, 'listing:5:listed:0.12');
  assert.equal(listing.text, `New listing: #5 ${MID} 400 ANTS @ $0.120 ${MID} lock 8w ${MID} lants.eth.limo`);
});

test('price float noise does not fake a relist', () => {
  const prev = { floorAsk: 0.14, epoch: 28, listings: [{ id: 5, perAntUsd: 0.1399999993 }], tradeIds: [] };
  const curr = {
    floorAsk: 0.14,
    avg24h: 0.1,
    epoch: 28,
    listings: [{ id: 5, amount: 400, lockDays: 56, perAntUsd: 0.14 }],
    trades: [],
  };
  assert.deepEqual(diffFeed(prev, curr), []);
});

test('a sold position is not posted as Delisted too', () => {
  const prev = { floorAsk: 0.14, epoch: 28, listings: [7, 9], tradeIds: ['t0'] };
  const curr = {
    floorAsk: 0.14,
    avg24h: 0.1,
    epoch: 28,
    listings: [{ id: 9, amount: 100, lockDays: 0, perAntUsd: 0.15 }],
    trades: [{ id: 't1', tokenId: 7, amount: 10, usdTotal: 1.4, perAntUsd: 0.14, tradeType: 'listing' }],
  };
  const events = diffFeed(prev, curr);
  const delists = events.filter((e) => e.type === 'delist');
  const trade = events.find((e) => e.type === 'trade');
  assert.equal(delists.length, 0);
  assert.equal(trade.key, 'trade:t1');
  assert.equal(events.length, 1);
});

test('an old id without a new trade still delists normally', () => {
  const prev = { floorAsk: 0.14, epoch: 28, listings: [7, 9], tradeIds: [] };
  const curr = {
    floorAsk: 0.14,
    avg24h: 0.1,
    epoch: 28,
    listings: [{ id: 9, amount: 100, lockDays: 0, perAntUsd: 0.15 }],
    trades: [],
  };
  const events = diffFeed(prev, curr);
  const delist = events.find((e) => e.type === 'delist');
  assert.equal(delist.key, 'listing:7:unlisted');
});

test('a brand-new lot that sets the new floor posts once as New floor listing', () => {
  const prev = { floorAsk: 0.14, epoch: 28, listings: [1, 2], tradeIds: [] };
  const curr = {
    floorAsk: 0.12,
    avg24h: 0.1,
    epoch: 28,
    listings: [
      { id: 1, amount: 100, lockDays: 0, perAntUsd: 0.15 },
      { id: 2, amount: 100, lockDays: 0, perAntUsd: 0.14 },
      { id: 3, amount: 400, lockDays: 56, perAntUsd: 0.12 },
    ],
    trades: [],
  };
  const events = diffFeed(prev, curr);
  const floor = events.filter((e) => e.type === 'floor');
  const listing = events.filter((e) => e.type === 'listing');
  const floorListing = events.find((e) => e.type === 'floor-listing');
  assert.equal(floor.length, 0);
  assert.equal(listing.length, 0);
  assert.equal(floorListing.key, 'listing:3:listed:0.12');
  assert.equal(floorListing.text, `New floor listing: #3 ${MID} 400 ANTS @ $0.120 ${MID} lock 8w ${MID} lants.eth.limo`);
  assert.equal(events.length, 1);
});

test('a floor move caused by a delist still posts the floor event', () => {
  const prev = { floorAsk: 0.12, epoch: 28, listings: [{ id: 3, perAntUsd: 0.12 }, { id: 4, perAntUsd: 0.15 }], tradeIds: [] };
  const curr = {
    floorAsk: 0.15,
    avg24h: 0.1,
    epoch: 28,
    listings: [{ id: 4, amount: 100, lockDays: 0, perAntUsd: 0.15 }],
    trades: [],
  };
  const events = diffFeed(prev, curr);
  const floor = events.find((e) => e.type === 'floor');
  const delist = events.find((e) => e.type === 'delist');
  assert.ok(floor);
  assert.equal(floor.key, 'floor:0.15');
  assert.equal(delist.key, 'listing:3:unlisted:0.12');
  assert.equal(events.length, 2);
});

test('only listing fills are reported as sales, not offers', () => {
  const prev = { floorAsk: 0.14, epoch: 28, listings: [], tradeIds: [] };
  const curr = {
    floorAsk: 0.14,
    avg24h: 0.1,
    epoch: 28,
    listings: [],
    trades: [
      { id: 't1', tokenId: 205, amount: 762.47, usdTotal: 106.746148, perAntUsd: 0.14, tradeType: 'listing' },
      { id: 't2', tokenId: 206, amount: 10, usdTotal: 1, perAntUsd: 0.1, tradeType: 'offer' },
    ],
  };
  const events = diffFeed(prev, curr);
  assert.equal(events.length, 1);
  assert.equal(events[0].key, 'trade:t1');
  assert.equal(events[0].text, `Sold: #205 ${MID} 762.47 ANTS @ $0.1400 ($106.75 USDC) ${MID} lants.eth.limo`);
});

test('epoch advance reports the closed epoch, with optional emission', () => {
  const prev = { floorAsk: 0.14, epoch: 28, listings: [], tradeIds: [] };
  const curr = { floorAsk: 0.14, avg24h: 0.101939, epoch: 29, listings: [], trades: [] };
  const withEmission = diffFeed(prev, curr, { emission: 104500 });
  assert.equal(withEmission.length, 1);
  assert.equal(withEmission[0].key, 'epoch:28');
  assert.equal(
    withEmission[0].text,
    `Epoch 28 closed ${MID} 104,500 ANTS emitted ${MID} 24h avg $0.102 ${MID} lants.eth.limo`
  );
  const without = diffFeed(prev, curr);
  assert.equal(without[0].text, `Epoch 28 closed ${MID} 24h avg $0.102 ${MID} lants.eth.limo`);
});

test('a cold start (no baseline) invents no events', () => {
  const curr = {
    floorAsk: 0.14,
    avg24h: 0.1,
    epoch: 28,
    listings: [{ id: 1, amount: 1, lockDays: 7, perAntUsd: 0.1 }],
    trades: [{ id: 'a', tokenId: 1, amount: 1, usdTotal: 1, perAntUsd: 1, tradeType: 'listing' }],
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
  assert.equal(burn.text, `ANTS burn: 1.5M (epoch 26) ${MID} total 7.5M ${MID} data: antseedstats.com`);
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
  assert.equal(settled.text, `AntSeed 7d settled: $12,804 (+6.7%) ${MID} 27,841 settlements ${MID} 70 sellers ${MID} data: antseedstats.com`);
  assert.strictEqual(settled.field, 'settled7d');
  assert.strictEqual(settled.value, 12804.23);
  assert.equal(staked.text, `Staked: 1.6M ANTS (+6.7%) ${MID} 74% of stakable ${MID} data: antseedstats.com`);
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
  assert.equal(rec.text, `AntSeed 7d settled hit a record: $12,400 ${MID} data: antseedstats.com`);
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
  assert.equal(e.text, `Epoch 28 rewards ${MID} 5M ANTS emission ${MID} $10,735.66 seller points ${MID} data: antseedstats.com`);
  assert.equal(events.length, 1);
});
