import { test } from 'node:test';
import * as assert from 'node:assert';
import metrics from './metrics.mjs';
import snapshotData from './fixtures/snapshot-e23.full.json' with { type: 'json' };

// -----------------------------------------------------------------------------
// Test 1 – keep original behaviour for isMaxLock and exitSlash on fixture #27
// -----------------------------------------------------------------------------
test('isMaxLock and exitSlash on fixture position #27', () => {
  const snapshot = snapshotData;
  const pos = snapshot.positions.find(x => String(x.id) === '27');

  if (!pos) throw new Error('Position #27 not found');

  // original contract‑based checks
  assert.strictEqual(metrics.isMaxLock(pos, '24'), true, 'isMaxLock should be true for position #27 at epoch 24');
  assert.strictEqual(metrics.exitSlash(pos), 50, 'exitSlash should be 50 for position #27');
});

// -----------------------------------------------------------------------------
// Helper: build a synthetic snapshot for reward tests
// -----------------------------------------------------------------------------
function makeSyntheticSnapshot(positions, epoch = 24) {
  return {
    // the contract uses `epoch` (current epoch) to decide live/prev mode
    epoch,
    positions,
    // other fields are irrelevant for the reward calculations
  };
}

// -----------------------------------------------------------------------------
// Test 2 – live mode: reward present for current epoch
// -----------------------------------------------------------------------------
test('expectedReward – live mode (epoch 24)', () => {
  const posA = {
    id: '1',
    rewardByEpoch: {
      '23': '0',
      '24': '22584972753113873327919',
    },
  };
  const posB = {
    id: '2',
    rewardByEpoch: {
      '23': '5000000000000000000',
      '24': '0',
    },
  };

  const snap = makeSyntheticSnapshot([posA, posB]);

  // rewardMode should report live, epoch 24
  const mode = metrics.rewardMode(snap);
  assert.deepStrictEqual(mode, { mode: 'live', epoch: '24' }, 'rewardMode should be live for epoch 24');

  // A gets ~22584.97 ANTS
  const rewardA = metrics.expectedReward(snap, posA, 'any');
  const expectedA = Number('22584972753113873327919') / 1e18; // 22584.972753113873...
  assert.ok(Math.abs(rewardA - expectedA) < 0.01, `expectedReward(A) ≈ ${expectedA}, got ${rewardA}`);

  // B gets 0 because its 24‑epoch reward is zero
  const rewardB = metrics.expectedReward(snap, posB, 'any');
  assert.strictEqual(rewardB, 0, 'expectedReward(B) should be 0 in live mode');
});

// -----------------------------------------------------------------------------
// Test 3 – fallback to previous epoch when current epoch rewards are zero
// -----------------------------------------------------------------------------
test('expectedReward – prev fallback (epoch 23)', () => {
  const posA = {
    id: '1',
    rewardByEpoch: {
      '23': '0',
      '24': '0',
    },
  };
  const posB = {
    id: '2',
    rewardByEpoch: {
      '23': '5000000000000000000',
      '24': '0',
    },
  };

  const snap = makeSyntheticSnapshot([posA, posB]);

  // No reward for epoch 24 → mode should be prev, epoch 23
  const mode = metrics.rewardMode(snap);
  assert.deepStrictEqual(mode, { mode: 'prev', epoch: '23' }, 'rewardMode should fallback to prev epoch 23');

  // B receives 5 ANTS from epoch 23
  const rewardB = metrics.expectedReward(snap, posB, 'any');
  assert.strictEqual(rewardB, 5, 'expectedReward(B) should be 5 in prev mode');
});

// -----------------------------------------------------------------------------
// Test 4 – third argument is ignored
// -----------------------------------------------------------------------------
test('expectedReward – third argument ignored', () => {
  const posA = {
    id: '1',
    rewardByEpoch: {
      '23': '0',
      '24': '22584972753113873327919',
    },
  };
  const snap = makeSyntheticSnapshot([posA]);

  const r1 = metrics.expectedReward(snap, posA, '24');
  const r2 = metrics.expectedReward(snap, posA, '99'); // arbitrary value
  assert.strictEqual(r1, r2, 'expectedReward should ignore the third argument');
});

// -----------------------------------------------------------------------------
// Test 5 – missing data yields zero reward
// -----------------------------------------------------------------------------
test('expectedReward – missing data returns 0', () => {
  const posNoReward = { id: '3' }; // no rewardByEpoch field
  const snap = makeSyntheticSnapshot([posNoReward]);

  // snapshot present but position lacks reward data
  const r1 = metrics.expectedReward(snap, posNoReward, 'any');
  assert.strictEqual(r1, 0, 'expectedReward should be 0 when rewardByEpoch is missing');

  // completely missing snapshot
  const r2 = metrics.expectedReward(null, posNoReward, 'any');
  assert.strictEqual(r2, 0, 'expectedReward should be 0 when snapshot is null');
});

test('unknown slash (PositionChangePending) returns null, not a free exit', () => {
  const nullPos = { amount: '27065300000000000000000', slashBps: null, stakeStartEpoch: 25, stakeEndEpoch: 40 };
  assert.strictEqual(metrics.floorPrice(nullPos), null);
  assert.ok(Number.isNaN(metrics.exitBurn(nullPos)), 'unknown slash: exitBurn is NaN, never a number (no free-exit lie), and never null (legacy .toFixed must not crash)');
  assert.strictEqual(metrics.exitSlash(nullPos), null);

  // control: a normal position is still computed
  const okPos = { amount: '27065300000000000000000', slashBps: 5000 };
  assert.strictEqual(metrics.floorPrice(okPos), 13532.65);
  assert.ok(Math.abs(metrics.exitBurn(okPos) - 13532.65) < 1e-6);
});