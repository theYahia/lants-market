import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSeaportMarket } from '../site/seaport-feed.mjs';
import { ANTS_MAX_SUPPLY } from '../site/market-stats.mjs';
import { toMarket } from './read-feed.mjs';
import { buildBoard, pickLot, MIN_LOT_ANTS } from './aggregate.mjs';

const raw = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/lants-market-2026-10-28.json', import.meta.url)), 'utf8')
);
const market = toMarket(parseSeaportMarket(raw, { includeNonFulfillable: true }));

// The snapshot as read-snapshot.mjs shapes it: one position per fixture item,
// each with a lock end epoch and a recorded reward for epoch 28.
function snapshotFromFixture({ rewardAnts = '1500000000000000000', skipRewardFor = [] } = {}) {
  const positions = raw.items.map((it) => ({
    id: String(it.id),
    amount: Number(it.amount),
    agentId: it.agentId,
    stakeEndEpoch: Number.isInteger(it.stakeEndEpoch) ? it.stakeEndEpoch : null,
    rewardByEpoch: skipRewardFor.includes(it.id) ? {} : { 28: Number(rewardAnts) / 1e18 },
  }));
  return { ok: true, epoch: 28, positions };
}

const antseed = {
  settled7d: 13772.4,
  buyers7d: 307,
  sellers7d: 72,
  stakedPct: 73.2107,
};

test('buildBoard carries the market, supply and network numbers', () => {
  const board = buildBoard({ market, antseed, epoch: 28 });
  assert.equal(board.epoch, 28);
  assert.equal(board.listedCount, 15);
  assert.equal(board.totalNfts, 483);
  assert.equal(board.offeredCount, 0);
  assert.equal(board.floorAsk, 0.14);
  assert.equal(board.avg24h, 0.101931);
  assert.equal(board.minted, 129929424.0681841);
  assert.equal(board.maxSupply, ANTS_MAX_SUPPLY);
  assert.equal(board.settled7d, 13772.4);
  assert.equal(board.buyers7d, 307);
  assert.equal(board.sellers7d, 72);
  assert.equal(board.stakedPct, 73.2107);
});

test('buildBoard prices MC/FDV from the 24h average sale, never the ask VWAP', () => {
  const board = buildBoard({ market, antseed, epoch: 28 });
  const expectedMc = board.avg24h * board.minted;
  const expectedFdv = board.avg24h * board.maxSupply;
  assert.ok(Math.abs(board.mcUsd - expectedMc) / expectedMc < 1e-9, `mc ${board.mcUsd} vs ${expectedMc}`);
  assert.ok(Math.abs(board.fdvUsd - expectedFdv) / expectedFdv < 1e-9, `fdv ${board.fdvUsd} vs ${expectedFdv}`);
  // The ask VWAP is a different number and must not move the headline.
  assert.ok(Number.isFinite(board.askVwap));
  assert.ok(Math.abs(board.askVwap - board.avg24h) > 1e-6);
  assert.ok(Math.abs(board.mcUsd - board.askVwap * board.minted) > 1);
});

test('buildBoard degrades to nulls without antseedstats', () => {
  const board = buildBoard({ market, antseed: null, epoch: 28 });
  assert.equal(board.settled7d, null);
  assert.equal(board.stakedPct, null);
  assert.ok(Number.isFinite(board.mcUsd));
});

test('buildBoard returns null without a market', () => {
  assert.equal(buildBoard({ market: null }), null);
});

test('pickLot picks the cheapest lot worth highlighting', () => {
  const nowMs = Date.parse('2026-10-28T10:28:48Z');
  const lot = pickLot({ market, snapshot: snapshotFromFixture(), epoch: 28, nowMs });
  assert.ok(lot);
  assert.equal(lot.id, 205);
  assert.ok(Math.abs(lot.perAntUsd - 0.13999999935878113) < 1e-12);
  assert.ok(Math.abs(lot.usd - 106.746148) < 1e-6);
  assert.ok(Math.abs(lot.amount - 762.4724892065126) < 1e-9);
  assert.equal(lot.stakeEndEpoch, 44);
  assert.equal(lot.unlockAt, '2027-02-11');
  assert.equal(lot.daysRemaining, 106);
  assert.equal(lot.provider, 'Venice.ai Proxy');
  assert.equal(lot.agentId, 45869);
  assert.equal(lot.rewardAnts, 1.5);
});

test('pickLot returns null without a snapshot', () => {
  assert.equal(pickLot({ market, snapshot: null, epoch: 28 }), null);
  assert.equal(pickLot({ market, snapshot: { ok: false, reason: 'network' }, epoch: 28 }), null);
  assert.equal(pickLot({ market, snapshot: { ok: true, positions: [] }, epoch: 28 }), null);
});

test('pickLot returns null when no lot reaches the dust floor', () => {
  const tiny = { ...market, listings: market.listings.map((l) => ({ ...l, amount: MIN_LOT_ANTS - 0.01 })) };
  assert.equal(pickLot({ market: tiny, snapshot: snapshotFromFixture(), epoch: 28 }), null);
});

test('pickLot skips a position with no reward recorded for the epoch', () => {
  const snapshot = snapshotFromFixture({ skipRewardFor: [205] });
  const lot = pickLot({ market, snapshot, epoch: 28, nowMs: Date.parse('2026-10-28T10:28:48Z') });
  assert.ok(lot);
  assert.notEqual(lot.id, 205);
});

test('pickLot returns null when the position is missing from the snapshot', () => {
  const snapshot = { ok: true, epoch: 28, positions: [] };
  assert.equal(pickLot({ market, snapshot, epoch: 28 }), null);
});

test('pickLot needs an integer epoch', () => {
  assert.equal(pickLot({ market, snapshot: snapshotFromFixture(), epoch: null }), null);
});
