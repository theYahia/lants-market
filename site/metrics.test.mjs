import { test } from 'node:test';
import * as assert from 'node:assert';
import metrics from './metrics.mjs';
import snapshotData from './fixtures/snapshot-e23.full.json' with { type: 'json' };

test('site/metrics.test.mjs', () => {
  const snapshot = snapshotData;
  const pos = snapshot.positions.find(x => String(x.id) === '27');

  if (!pos) throw new Error('Position #27 not found');

  // Test 1: isMaxLock and exitSlash old behavior preserved
  assert.equal(metrics.isMaxLock(pos, '24'), true);
  assert.equal(metrics.exitSlash(pos), 50);

  // Test 2: reward > 0
  const r = metrics.expectedReward(snapshot, pos, '24');
  assert.ok(r > 0, 'expectedReward for position #27 must be > 0');

  // Test 3: sum of all rewards ~ stakerBudget (error < 1%)
  const sum = snapshot.positions.reduce((acc, q) => acc + metrics.expectedReward(snapshot, q, '24'), 0);
  const budget = Number(snapshot.stakerBudget);
  const diff = Math.abs(sum - budget) / budget;
  assert.ok(diff < 0.01, `sum of rewards ${sum} differs from budget ${budget} by more than 1% (diff=${diff})`);

  // Test 4: position without weight for epoch '24' yields 0
  const posNoWeight = { id: '100', agentId: 'agentX', weightsByEpoch: {} };
  const rNoWeight = metrics.expectedReward(snapshot, posNoWeight, '24');
  assert.equal(rNoWeight, 0);
});