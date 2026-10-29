// bot/tg-state.test.mjs - tg-state load/save normalization and helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EMPTY_TG_STATE,
  normalizeTgState,
  loadTgState,
  saveTgState,
  upsertSubscriber,
  setFloorThreshold,
  disableFloorAlert,
  markListingsSeen,
  advanceEpoch,
} from './tg-state.mjs';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'tg-state-'));
}

test('loadTgState returns empty state for a missing file', () => {
  const dir = tempDir();
  const state = loadTgState(join(dir, 'missing.json'));
  assert.deepEqual(state, EMPTY_TG_STATE);
});

test('saveTgState writes JSON and loadTgState round-trips it', () => {
  const dir = tempDir();
  const path = join(dir, 'tg-state.json');
  const state = {
    offset: 7,
    subscribers: { '123': { subscribedAt: '2026-01-01T00:00:00.000Z', floorThreshold: 0.12, floorArmedDown: true } },
    listingsSeen: [1, 2],
    lastEpoch: 27,
    listingsBaselineDone: true,
  };
  saveTgState(path, state);
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  assert.deepEqual(raw, state);
  assert.deepEqual(loadTgState(path), state);
});

test('normalizeTgState drops junk subscribers and clamps out-of-range numbers', () => {
  const state = normalizeTgState({
    offset: -3,
    subscribers: {
      '1': { subscribedAt: 'x', floorThreshold: 0.12, floorArmedDown: false },
      '2': null,
      '3': { subscribedAt: '', floorThreshold: -1, floorArmedDown: 'yes' },
      '4': { subscribedAt: '2026-01-01T00:00:00.000Z', floorThreshold: 0.2, floorArmedDown: true },
    },
    listingsSeen: [1, 'x', 2.5, 3],
    lastEpoch: 'nope',
  });
  assert.equal(state.offset, 0);
  assert.deepEqual(Object.keys(state.subscribers).sort(), ['1', '3', '4']);
  assert.equal(state.subscribers['1'].floorThreshold, 0.12);
  assert.equal(state.subscribers['3'].floorThreshold, null);
  assert.equal(state.subscribers['3'].floorArmedDown, false);
  assert.equal(state.subscribers['4'].floorArmedDown, true);
  assert.deepEqual(state.listingsSeen, [1, 3]);
  assert.equal(state.lastEpoch, null);
});

test('upsertSubscriber creates a row once and keeps an existing one', () => {
  const state = { ...EMPTY_TG_STATE };
  const a = upsertSubscriber(state, '42', '2026-01-01T00:00:00.000Z');
  assert.equal(a.subscribedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(a.floorThreshold, null);
  const b = upsertSubscriber(state, '42', '2026-02-01T00:00:00.000Z');
  assert.equal(b.subscribedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(Object.keys(state.subscribers).length, 1);
});

test('setFloorThreshold sets a value, arms it, and clears with null', () => {
  const state = { ...EMPTY_TG_STATE };
  const sub = setFloorThreshold(state, '42', 0.12);
  assert.equal(sub.floorThreshold, 0.12);
  assert.equal(sub.floorArmedDown, true);
  const cleared = setFloorThreshold(state, '42', null);
  assert.equal(cleared.floorThreshold, null);
  assert.equal(cleared.floorArmedDown, false);
});

test('disableFloorAlert resets the threshold and disarms', () => {
  const state = { ...EMPTY_TG_STATE };
  setFloorThreshold(state, '42', 0.12);
  state.subscribers['42'].floorArmedDown = false;
  const sub = disableFloorAlert(state, '42');
  assert.equal(sub.floorThreshold, null);
  assert.equal(sub.floorArmedDown, false);
});

test('markListingsSeen returns only fresh ids and caps the list', () => {
  const state = { ...EMPTY_TG_STATE, listingsSeen: [1, 2] };
  const fresh = markListingsSeen(state, [2, 3, 4]);
  assert.deepEqual(fresh, [3, 4]);
  assert.deepEqual(state.listingsSeen, [1, 2, 3, 4]);
  assert.deepEqual(markListingsSeen(state, [1, 5]), [5]);
});

test('advanceEpoch returns the previous epoch and records the new one', () => {
  const state = { ...EMPTY_TG_STATE, lastEpoch: 26 };
  assert.equal(advanceEpoch(state, 27), 26);
  assert.equal(state.lastEpoch, 27);
  const fresh = { ...EMPTY_TG_STATE };
  assert.equal(advanceEpoch(fresh, 27), null);
  assert.equal(fresh.lastEpoch, 27);
});

test('temp files are cleaned up after tests', () => {
  const dir = tempDir();
  const path = join(dir, 'a.json');
  saveTgState(path, { ...EMPTY_TG_STATE });
  assert.ok(readFileSync(path, 'utf8').length > 0);
  rmSync(dir, { recursive: true, force: true });
});
