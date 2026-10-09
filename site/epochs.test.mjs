import test from 'node:test';
import assert from 'node:assert/strict';
import { epochBoundary, EPOCH_BASE, EPOCH_BASE_NUM } from './epochs.mjs';

test('epoch base is epoch 25', () => {
  assert.equal(EPOCH_BASE_NUM, 25);
  assert.equal(epochBoundary(25).toISOString(), EPOCH_BASE.toISOString());
  assert.equal(EPOCH_BASE.toISOString(), '2026-10-01T09:54:21.000Z');
});

test('epoch boundaries are weekly (7 days)', () => {
  const e = (n) => epochBoundary(n).getTime();
  assert.equal(e(27) - e(26), 7 * 24 * 60 * 60 * 1000);
  assert.equal(e(26) - e(25), 7 * 24 * 60 * 60 * 1000);
});

test('epoch 26 and 27 dates match the plan', () => {
  assert.equal(epochBoundary(26).toISOString(), '2026-10-08T09:54:21.000Z');
  assert.equal(epochBoundary(27).toISOString(), '2026-10-15T09:54:21.000Z');
});
