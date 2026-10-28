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

test('new listing and delist are keyed by token id and listed flag', () => {
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
  assert.equal(listing.key, 'listing:3:listed');
  assert.equal(listing.text, `New listing: #3 ${MID} 400 ANTS @ $0.150 ${MID} lock 8w ${MID} lants.eth.limo`);
  assert.equal(delist.key, 'listing:1:unlisted');
  assert.equal(delist.text, `Delisted: #1 ${MID} lants.eth.limo`);
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

test('diffAntseedStats reports new burn epochs', () => {
  const prev = {
    settled24h: 100,
    settled7d: 100,
    settled30d: 100,
    stakedAnts: 100,
    stakedPct: 50,
    burns: [{ epoch: 25, ants: 1500000 }],
  };
  const curr = {
    settled24h: 100,
    settled7d: 100,
    settled30d: 100,
    stakedAnts: 100,
    stakedPct: 50,
    burns: [{ epoch: 25, ants: 1500000 }, { epoch: 26, ants: 1500000 }],
  };
  const events = diffAntseedStats(prev, curr);
  const burn = events.find((e) => e.type === 'burn');
  assert.equal(burn.key, 'burn:26');
  assert.equal(burn.text, `Burned: 1.5M ANTS (epoch 26) ${MID} data: antseedstats.com`);
  assert.equal(events.length, 1);
});

test('diffAntseedStats posts settled/staked only past a ±5% move', () => {
  const base = { settled7d: 12000, settled30d: 30000, stakedPct: 73, burns: [] };
  const prev = { ...base, settled24h: 2398.58, stakedAnts: 1500000 };
  const curr = { ...base, settled24h: 2600, stakedAnts: 1600000 };
  const events = diffAntseedStats(prev, curr);
  const settled = events.find((e) => e.type === 'settled');
  const staked = events.find((e) => e.type === 'staked');
  assert.equal(settled.key, 'settled:settled24h:2600');
  assert.equal(settled.text, `Settled 24h: $2398.58 ${ARROW} $2600.00 (+8.4%) ${MID} data: antseedstats.com`);
  assert.equal(staked.text, `Staked: 1.5M ${ARROW} 1.6M ANTS (+6.7%) ${MID} data: antseedstats.com`);
  assert.equal(events.length, 2);

  const small = diffAntseedStats(prev, { ...base, settled24h: 2400, stakedAnts: 1510000 });
  assert.equal(small.length, 0);
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
