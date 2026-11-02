import test from 'node:test';
import assert from 'node:assert/strict';
import { diffFeed } from './diff.mjs';
import { boardChanged, diffNetwork, changedBy, dateKey } from './diff-live.mjs';

test('diffFeed: no epoch advance, no candidate', () => {
  assert.deepEqual(diffFeed({ epoch: 28 }, { epoch: 28 }), []);
});

test('diffFeed: a cold start (no baseline) invents no events', () => {
  assert.deepEqual(diffFeed(null, { epoch: 28 }), []);
});

test('diffFeed: epoch advance reports the closed epoch with its numbers', () => {
  const events = diffFeed({ epoch: 28 }, { epoch: 29 }, {
    emission: 5000000,
    sellerPointsUsd: 13145,
    restakeBonusPct: 5,
  });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    type: 'epoch',
    family: 'epoch',
    key: 'epoch:28',
    data: { epoch: 28, emissionAnts: 5000000, sellerPointsUsd: 13145, restakeBonusPct: 5 },
  });
});

test('diffFeed: missing measures stay null instead of being invented', () => {
  const events = diffFeed({ epoch: 28 }, { epoch: 29 });
  assert.equal(events[0].data.emissionAnts, null);
  assert.equal(events[0].data.sellerPointsUsd, null);
  assert.equal(events[0].data.restakeBonusPct, null);
});

test('diffFeed: skipped epochs report only the last closed one', () => {
  const events = diffFeed({ epoch: 28 }, { epoch: 31 });
  assert.equal(events.length, 1);
  assert.equal(events[0].key, 'epoch:30');
});

test('boardChanged: any listing or bid change counts, floor past ±2%', () => {
  const base = { floorAsk: 0.14, listedCount: 15, offeredCount: 0 };
  assert.equal(boardChanged(base, { ...base }), false);
  assert.equal(boardChanged(base, { ...base, floorAsk: 0.142 }), false);
  assert.equal(boardChanged(base, { ...base, floorAsk: 0.145 }), true);
  assert.equal(boardChanged(base, { ...base, floorAsk: 0.136 }), true);
  assert.equal(boardChanged(base, { ...base, listedCount: 16 }), true);
  assert.equal(boardChanged(base, { ...base, offeredCount: 1 }), true);
  assert.equal(boardChanged(null, base), false);
  assert.equal(boardChanged(base, null), false);
});

test('changedBy compares against a relative threshold', () => {
  assert.equal(changedBy(100, 104, 0.05), false);
  assert.equal(changedBy(100, 105, 0.05), true);
  assert.equal(changedBy(0, 50, 0.05), false);
});

test('diffNetwork: no baseline seeds instead of posting', () => {
  const res = diffNetwork({}, { settled7d: 13772, buyers7d: 307, sellers7d: 72 });
  assert.equal(res.event, null);
  assert.equal(res.reseed, true);
});

test('diffNetwork: nothing until a real week has passed', () => {
  const nowMs = Date.parse('2026-10-29T12:00:00Z');
  const prev = { networkBaseline: { at: '2026-10-24T12:00:00.000Z', settled7d: 13000 } };
  const res = diffNetwork(prev, { settled7d: 13772, buyers7d: 307, sellers7d: 72 }, { nowMs });
  assert.equal(res.event, null);
  assert.equal(res.reseed, false);
});

test('diffNetwork: a week-old baseline yields the w/w comparison', () => {
  const nowMs = Date.parse('2026-10-29T12:00:00Z');
  const prev = { networkBaseline: { at: '2026-10-22T12:00:00.000Z', settled7d: 13000 } };
  const res = diffNetwork(prev, { settled7d: 13772, buyers7d: 307, sellers7d: 72 }, { nowMs });
  assert.equal(res.reseed, false);
  assert.equal(res.event.type, 'network');
  assert.equal(res.event.family, 'network');
  assert.equal(res.event.key, 'network:2026-10-29');
  assert.deepEqual(res.event.data, { buyers: 307, sellers: 72, settled7d: 13772, pctChange: '+5.9%' });
});

test('diffNetwork: a baseline older than two weeks is re-seeded, not quoted', () => {
  const nowMs = Date.parse('2026-10-29T12:00:00Z');
  const prev = { networkBaseline: { at: '2026-10-10T12:00:00.000Z', settled7d: 9000 } };
  const res = diffNetwork(prev, { settled7d: 13772, buyers7d: 307, sellers7d: 72 }, { nowMs });
  assert.equal(res.event, null);
  assert.equal(res.reseed, true);
});

test('diffNetwork: buyers/sellers are required for the story', () => {
  const nowMs = Date.parse('2026-10-29T12:00:00Z');
  const prev = { networkBaseline: { at: '2026-10-22T12:00:00.000Z', settled7d: 13000 } };
  const res = diffNetwork(prev, { settled7d: 13772, buyers7d: null, sellers7d: 72 }, { nowMs });
  assert.equal(res.event, null);
  assert.equal(res.reseed, false);
});

test('dateKey is the UTC calendar day', () => {
  assert.equal(dateKey(Date.parse('2026-10-29T23:59:00Z')), '2026-10-29');
});
