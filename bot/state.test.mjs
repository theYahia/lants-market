import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  enqueue,
  dropStale,
  markEmitted,
  markPublished,
  familyDue,
  postsThisWeek,
  isFamily,
  loadState,
  saveState,
  EMPTY_STATE,
  FAMILY_GAP_MS,
  FAMILY_TTL_MS,
  MAX_PUBLISHED,
} from './state.mjs';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

test('enqueue skips already emitted and already queued keys, keeping family and data', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const events = [
    { type: 'board', family: 'board', key: 'board:2026-10-28', data: { listedCount: 15 } },
    { type: 'lot', family: 'lot', key: 'lot:205:106.75', data: { id: 205 } },
  ];
  const first = enqueue([], events, [], now);
  assert.equal(first.length, 2);
  assert.equal(first[0].createdAt, '2026-10-28T12:00:00.000Z');
  assert.equal(first[0].family, 'board');
  assert.deepEqual(first[0].data, { listedCount: 15 });
  assert.equal(enqueue(first, events, [], now).length, 2);
  const withEmitted = enqueue([], events, ['lot:205:106.75'], now);
  assert.equal(withEmitted.length, 1);
  assert.equal(withEmitted[0].key, 'board:2026-10-28');
});

test('dropStale applies the family TTL when none is passed', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  const pending = [
    { family: 'epoch', key: 'e', createdAt: '2026-10-28T18:00:00.000Z' }, // 42h
    { family: 'board', key: 'b', createdAt: '2026-10-29T06:00:00.000Z' }, // 30h
    { family: 'epoch', key: 'old', createdAt: '2026-10-28T06:00:00.000Z' }, // 54h
    { family: 'edu', key: 'edu', createdAt: '2026-10-25T06:00:00.000Z' }, // 5d
    { key: 'legacy', createdAt: '2026-10-29T06:00:00.000Z' }, // no family -> 48h
  ];
  assert.deepEqual(dropStale(pending, now).map((e) => e.key), ['b', 'edu', 'legacy']);
});

test('dropStale accepts an explicit numeric or functional TTL', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  const pending = [
    { family: 'board', key: 'a', createdAt: '2026-10-28T06:00:00.000Z' }, // 54h
    { family: 'board', key: 'b', createdAt: '2026-10-30T06:00:00.000Z' }, // 6h
  ];
  assert.deepEqual(dropStale(pending, now, 48 * HOUR).map((e) => e.key), ['b']);
  assert.deepEqual(dropStale(pending, now, () => 5 * HOUR).map((e) => e.key), []);
});

test('markEmitted caps the history', () => {
  let keys = [];
  for (let i = 0; i < 205; i += 1) keys = markEmitted(keys, `k${i}`);
  assert.equal(keys.length, 200);
  assert.equal(keys[keys.length - 1], 'k204');
});

test('markPublished caps the ledger at 200 rows', () => {
  let rows = [];
  for (let i = 0; i < MAX_PUBLISHED + 5; i += 1) {
    rows = markPublished(rows, { key: `k${i}`, type: 'board', family: 'board', id: String(i), at: i, hasImage: false });
  }
  assert.equal(rows.length, MAX_PUBLISHED);
  assert.equal(rows[rows.length - 1].id, String(MAX_PUBLISHED + 4));
});

test('familyDue respects the per-family gap and unknown families', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  assert.equal(familyDue({}, 'epoch', now), true);
  assert.equal(familyDue({ epoch: now - 4 * DAY }, 'epoch', now), false);
  assert.equal(familyDue({ epoch: now - 5 * DAY }, 'epoch', now), true);
  assert.equal(familyDue({ board: now - 6 * DAY }, 'board', now), true);
  assert.equal(familyDue({ edu: now - 9 * DAY }, 'edu', now), false);
  assert.equal(familyDue({ edu: now - 10 * DAY }, 'edu', now), true);
  assert.equal(familyDue({}, 'digest', now), false);
  assert.equal(FAMILY_GAP_MS.edu, 10 * DAY);
  assert.equal(FAMILY_TTL_MS.epoch, 36 * HOUR);
});

test('isFamily knows exactly the five archetypes', () => {
  for (const f of ['epoch', 'board', 'lot', 'network', 'edu']) assert.equal(isFamily(f), true, f);
  for (const f of ['digest', 'settled', '', null, undefined, 'toString']) assert.equal(isFamily(f), false, String(f));
});

test('postsThisWeek counts the ledger rows inside seven days', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  const published = [
    { at: now - 1 * DAY },
    { at: now - 6 * DAY },
    { at: now - 9 * DAY },
    { at: 'nope' },
  ];
  assert.equal(postsThisWeek(published, now), 2);
  assert.equal(postsThisWeek([], now), 0);
});

test('loadState tolerates a missing file and round-trips slots and published', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bot-state-'));
  const file = path.join(dir, 'state.json');
  assert.deepEqual(loadState(file), EMPTY_STATE);
  assert.deepEqual(EMPTY_STATE.slots, {});
  assert.deepEqual(EMPTY_STATE.published, []);
  saveState(file, { ...loadState(file), slots: { board: 1 }, published: [{ id: '1' }] });
  const loaded = loadState(file);
  assert.deepEqual(loaded.slots, { board: 1 });
  assert.deepEqual(loaded.published, [{ id: '1' }]);
  rmSync(dir, { recursive: true, force: true });
});
