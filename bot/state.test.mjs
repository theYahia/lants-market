import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { enqueue, dropStale, markEmitted, loadState, saveState, EMPTY_STATE } from './state.mjs';

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
