import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshTip, FRESH_TIP_TIMES } from './portfolio-fresh.mjs';

test('freshTip names the snapshot epoch in words', () => {
  assert.equal(
    freshTip(26),
    'Staked after the last snapshot (epoch 26). Max lock, reward and exit appear after the next snapshot (~06:15 / 14:15 / 22:15 UTC).'
  );
});

test('freshTip accepts a string epoch from the snapshot', () => {
  assert.equal(freshTip('24'), freshTip(24));
});

test('freshTip drops the epoch when the snapshot is unknown', () => {
  assert.equal(
    freshTip(null),
    'Staked after the last snapshot. Max lock, reward and exit appear after the next snapshot (~06:15 / 14:15 / 22:15 UTC).'
  );
  assert.equal(freshTip(undefined), freshTip(''));
  assert.equal(freshTip('n/a'), freshTip(null));
});

test('the tip always states the refresh slots', () => {
  assert.ok(freshTip(1).includes(FRESH_TIP_TIMES));
});
