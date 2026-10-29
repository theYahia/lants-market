// bot/cron-tick.test.mjs - the tick orchestration, offline with injected deps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { currentEpochAt } from './epoch-check.mjs';
import { epochBoundary } from '../site/epochs.mjs';
import { tick } from './cron.mjs';
import { defaultState } from './state.mjs';

function quietTick(overrides = {}) {
  const calls = [];
  const deps = {
    dryRun: false,
    log: (line) => calls.push(line),
    saveState: () => {},
    stateFile: 'unused.json',
    runDmAlerts: async () => calls.push('dm-alerts'),
    deliver: async () => true,
    buildDeps: () => ({ fetchJson: async () => [] }),
    loadLocalConfig: () => null,
    loadVerifiedConfig: async () => null,
    checkRebates: async () => [],
    rebateIntervalMs: 6 * 60 * 60 * 1000,
    ...overrides,
  };
  return { calls, deps };
}

// One minute after an epoch boundary: the weekly reminder window is open and
// not yet posted.
function epochBoundaryNow() {
  const running = currentEpochAt(new Date('2026-10-08T10:00:00Z'));
  const nowMs = epochBoundary(running).getTime() + 60 * 1000;
  return { nowMs, finished: currentEpochAt(new Date(nowMs)) - 1 };
}

test('tick posts the weekly epoch reminder once and records it', async () => {
  const { nowMs, finished } = epochBoundaryNow();
  const delivered = [];
  const { deps } = quietTick({
    nowMs,
    deliver: async (post) => {
      delivered.push(post);
      return true;
    },
  });
  const state = defaultState();
  state.lastRebateCheck = nowMs;
  await tick(state, deps);
  assert.equal(delivered.length, 1);
  assert.ok(delivered[0].text.includes('has ended'));
  assert.equal(state.epochPost, finished);
});

test('tick skips the rebate watch inside the interval and still runs DM alerts', async () => {
  const nowMs = Date.parse('2026-10-12T00:00:00Z');
  let rebateCalls = 0;
  const { calls, deps } = quietTick({
    nowMs,
    rebateIntervalMs: 10_000,
    checkRebates: async () => {
      rebateCalls++;
      return [];
    },
  });
  const state = defaultState();
  state.lastRebateCheck = nowMs - 1_000;
  await tick(state, deps);
  assert.equal(rebateCalls, 0);
  assert.ok(calls.includes('dm-alerts'));
});

test('tick logs a failed rebate watch and keeps running', async () => {
  const nowMs = Date.parse('2026-10-12T00:00:00Z');
  const { calls, deps } = quietTick({
    nowMs,
    checkRebates: async () => {
      throw new Error('boom');
    },
  });
  const state = defaultState();
  await tick(state, deps);
  assert.ok(calls.some((l) => l.includes('rebate watch failed') && l.includes('boom')));
  assert.ok(calls.includes('dm-alerts'));
});

test('tick applies a delivered rebate post and advances the timer', async () => {
  const nowMs = Date.parse('2026-10-12T00:00:00Z');
  const applied = [];
  const { deps } = quietTick({
    nowMs,
    checkRebates: async () => [{ text: 'post', apply: () => applied.push('applied') }],
  });
  const state = defaultState();
  await tick(state, deps);
  assert.deepEqual(applied, ['applied']);
  assert.equal(state.lastRebateCheck, nowMs);
});

test('tick hands the own-listing reader to the alert run', async () => {
  const nowMs = Date.parse('2026-10-12T00:00:00Z');
  const fakeOwn = async () => ({ ok: true, listings: [] });
  let seen = null;
  const { deps } = quietTick({
    nowMs,
    readOwnListings: fakeOwn,
    runDmAlerts: async (args) => {
      seen = args;
    },
  });
  await tick(defaultState(), deps);
  assert.equal(seen.readers.readOwnListings, fakeOwn);
});
