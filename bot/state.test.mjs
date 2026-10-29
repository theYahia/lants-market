import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { enqueue, dropStale, markEmitted, loadState, saveState, EMPTY_STATE, isMarketEvent, orderEvents, capStats, withinCooldown, STAT_COOLDOWN_HOURS } from './state.mjs';

test('enqueue skips already emitted and already queued keys', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const events = [
    { type: 'floor', key: 'floor:0.13', text: 'a' },
    { type: 'trade', key: 'trade:1', text: 'b' },
  ];
  const first = enqueue([], events, [], now);
  assert.equal(first.length, 2);
  assert.equal(first[0].createdAt, '2026-10-28T12:00:00.000Z');
  assert.equal(enqueue(first, events, [], now).length, 2);
  const withEmitted = enqueue([], events, ['trade:1'], now);
  assert.equal(withEmitted.length, 1);
  assert.equal(withEmitted[0].key, 'floor:0.13');
});

test('enqueue carries the meta field used to advance post baselines', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const events = [
    { type: 'settled', key: 'settled:settled7d:12804.23', text: 't', meta: { field: 'settled7d', value: 12804.23 } },
    { type: 'record7d', key: 'record7d:12800', text: 'r', meta: { field: 'max7d', value: 13000 } },
    { type: 'floor', key: 'floor:0.12', text: 'f' },
  ];
  const queued = enqueue([], events, [], now);
  assert.deepEqual(queued[0].meta, { field: 'settled7d', value: 12804.23 });
  assert.deepEqual(queued[1].meta, { field: 'max7d', value: 13000 });
  assert.equal(queued[2].meta, null);
});

test('dropStale removes events older than 48h', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  const pending = [
    { key: 'a', createdAt: '2026-10-28T12:00:00.000Z' },
    { key: 'b', createdAt: '2026-10-27T12:00:00.000Z' },
  ];
  assert.deepEqual(dropStale(pending, now).map((e) => e.key), ['a']);
});

test('markEmitted caps the history', () => {
  let keys = [];
  for (let i = 0; i < 205; i += 1) keys = markEmitted(keys, `k${i}`);
  assert.equal(keys.length, 200);
  assert.equal(keys[keys.length - 1], 'k204');
});

test('loadState tolerates a missing file and round-trips', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bot-state-'));
  const file = path.join(dir, 'state.json');
  assert.deepEqual(loadState(file), EMPTY_STATE);
  saveState(file, { ...loadState(file), lastPostKey: 'floor:0.13' });
  assert.equal(loadState(file).lastPostKey, 'floor:0.13');
  rmSync(dir, { recursive: true, force: true });
});

test('isMarketEvent classifies market vs stats types', () => {
  for (const t of ['listing', 'floor-listing', 'delist', 'epoch']) {
    assert.equal(isMarketEvent(t), true, t);
  }
  for (const t of ['settled', 'staked', 'burn', 'record7d', 'epochstats', 'digest']) {
    assert.equal(isMarketEvent(t), false, t);
  }
});

test('orderEvents puts market events first and is stable', () => {
  const a = { type: 'settled', key: 's1', createdAt: '2026-10-28T10:00:00.000Z' };
  const b = { type: 'listing', key: 'l1', createdAt: '2026-10-28T11:00:00.000Z' };
  const c = { type: 'delist', key: 'd1', createdAt: '2026-10-28T09:00:00.000Z' };
  const d = { type: 'burn', key: 'b1', createdAt: '2026-10-28T08:00:00.000Z' };
  assert.deepEqual(orderEvents([a, b, c, d]).map((e) => e.key), ['d1', 'l1', 'b1', 's1']);
});

test('capStats keeps market events and limits stats', () => {
  const events = [
    { type: 'listing', key: 'l1' },
    { type: 'settled', key: 's1' },
    { type: 'settled', key: 's2' },
    { type: 'burn', key: 'b1' },
  ];
  assert.deepEqual(capStats(events, 1).map((e) => e.key), ['l1', 's1']);
  assert.deepEqual(capStats(events, 0).map((e) => e.key), ['l1']);
  assert.deepEqual(capStats(events, 2).map((e) => e.key), ['l1', 's1', 's2']);
});

test('withinCooldown enforces per-metric cooldown windows', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const antseed = { postedAt: { settled7d: now - 23 * 3600 * 1000, stakedAnts: now - 47 * 3600 * 1000 } };
  const settled = { meta: { field: 'settled7d', value: 1 } };
  const staked = { meta: { field: 'stakedAnts', value: 1 } };
  assert.equal(withinCooldown(settled, antseed, now), true);
  assert.equal(withinCooldown(staked, antseed, now), true);
  assert.equal(withinCooldown({ meta: { field: null, value: null } }, antseed, now), false);
  assert.equal(withinCooldown(settled, { postedAt: {} }, now), false);
  assert.equal(withinCooldown({ meta: { field: 'settled7d' } }, null, now), false);
});

test('STAT_COOLDOWN_HOURS includes the new usage cooldown', () => {
  assert.equal(STAT_COOLDOWN_HOURS.requests24h, 24);
  const now = Date.parse('2026-10-28T12:00:00Z');
  const antseed = { postedAt: { requests24h: now - 12 * 3600 * 1000 } };
  assert.equal(withinCooldown({ meta: { field: 'requests24h', value: 1 } }, antseed, now), true);
});
