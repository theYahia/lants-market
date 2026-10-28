import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  amountAnts,
  antsPerEpoch,
  aprPct,
  poolShare,
  poolWeight,
  unlockDate,
  lockWeeks,
  formatUnlock,
} from './position-yield.mjs';

const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/snapshot-e24.live.json', import.meta.url)), 'utf8')
);

const pos = (id) => snapshot.positions.find((p) => String(p.id) === id);

test('staking reward only: ANTS per epoch and APR', () => {
  const p = pos('2');
  assert.equal(amountAnts(p), 1);
  assert.ok(Math.abs(antsPerEpoch(snapshot, p) - 0.9122183678142946) < 1e-15);
  assert.ok(Math.abs(aprPct(snapshot, p) - 4743.535512634332) < 1e-9);
});

test('zero reward means no yield rather than zero APR', () => {
  const p = pos('1'); // rewardByEpoch[24] = 0
  assert.equal(antsPerEpoch(snapshot, p), null);
  assert.equal(aprPct(snapshot, p), null);
  assert.equal(aprPct(snapshot, null), null);
});

test('pool share and pool weight come from position weights', () => {
  assert.ok(Math.abs(poolShare(snapshot, 45869, '25') - 0.065218) < 1e-9);
  assert.ok(Math.abs(poolWeight(snapshot, 45869, '25') - 1208078.8504779613) < 1e-6);
  assert.equal(poolShare(snapshot, 45869, '99'), null);
});

test('unlock date uses the epoch boundary; max lock never counts down', () => {
  assert.equal(unlockDate(pos('2'), '24').toISOString(), '2028-09-07T09:54:21.000Z');
  assert.equal(formatUnlock(unlockDate(pos('2'), '24')), '07 Sep 2028');
  assert.equal(unlockDate(pos('9'), '24'), 'max');
  assert.equal(formatUnlock('max'), 'max lock');
  assert.equal(lockWeeks(pos('2'), '25'), 101);
  assert.equal(lockWeeks(pos('9'), '24'), 'max');
  assert.equal(lockWeeks(pos('2'), '126'), 0);
});
