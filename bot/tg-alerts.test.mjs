// bot/tg-alerts.test.mjs - pure alert logic (floor hysteresis, listing dedup,
// epoch dedup). Verifies the input state is never mutated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAlerts } from './tg-alerts.mjs';
import { EMPTY_TG_STATE } from './tg-state.mjs';

function freshState(overrides = {}) {
  return { ...EMPTY_TG_STATE, subscribers: {}, listingsSeen: [], lastEpoch: null, ...overrides };
}

function lot(id, perAntUsd) {
  return { id, amount: 100, perAntUsd, usd: 100 * perAntUsd, lockDays: 14 };
}

test('cold start records own listings and epoch silently', () => {
  const state = freshState();
  const { alerts, state: next } = computeAlerts({
    state,
    market: { floorAsk: 0.11, epoch: 28 },
    own: [lot(1, 0.12), lot(2, 0.11)],
  });
  assert.deepEqual(alerts, []);
  assert.deepEqual(next.listingsSeen, [1, 2]);
  assert.equal(next.lastEpoch, 28);
});

test('new own listings alert once and dedup by token id', () => {
  const state = freshState({ listingsSeen: [1], lastEpoch: 28 });
  const first = computeAlerts({
    state,
    market: { floorAsk: 0.11, epoch: 28 },
    own: [lot(1, 0.12), lot(2, 0.11)],
  });
  assert.equal(first.alerts.length, 1);
  assert.equal(first.alerts[0].type, 'listing');
  assert.equal(first.alerts[0].lot.id, 2);
  assert.equal(first.alerts[0].isFloor, true);
  assert.deepEqual(first.state.listingsSeen, [1, 2]);

  const second = computeAlerts({
    state: first.state,
    market: { floorAsk: 0.11, epoch: 28 },
    own: [lot(1, 0.12), lot(2, 0.11)],
  });
  assert.deepEqual(second.alerts, []);
});

test('a non-floor new listing is not flagged as the floor', () => {
  const state = freshState({ listingsSeen: [1], lastEpoch: 28 });
  const { alerts } = computeAlerts({
    state,
    market: { floorAsk: 0.14, epoch: 28 },
    own: [lot(1, 0.12), lot(2, 0.14)],
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].isFloor, false);
});

test('a failed own-listing read leaves listingsSeen untouched and alerts nothing', () => {
  const state = freshState({ listingsSeen: [1] });
  const { alerts, state: next } = computeAlerts({ state, market: { floorAsk: 0.11, epoch: 28 }, own: null });
  assert.deepEqual(alerts, []);
  assert.deepEqual(next.listingsSeen, [1]);
});

test('epoch advance broadcasts the closed epoch once', () => {
  const state = freshState({ lastEpoch: 27 });
  const first = computeAlerts({ state, market: { epoch: 28 }, own: null });
  assert.deepEqual(first.alerts, [{ type: 'epoch', closedEpoch: 27 }]);
  assert.equal(first.state.lastEpoch, 28);
  const second = computeAlerts({ state: first.state, market: { epoch: 28 }, own: null });
  assert.deepEqual(second.alerts, []);
});

test('epoch regression never resets the cursor', () => {
  const state = freshState({ lastEpoch: 28 });
  const { alerts, state: next } = computeAlerts({ state, market: { epoch: 27 }, own: null });
  assert.deepEqual(alerts, []);
  assert.equal(next.lastEpoch, 28);
});

test('floor alert fires once below the threshold then switches itself off', () => {
  const state = freshState({
    subscribers: { '42': { subscribedAt: 'x', floorThreshold: 0.12, floorArmedDown: true } },
  });
  const first = computeAlerts({ state, market: { floorAsk: 0.11 }, own: null });
  assert.deepEqual(first.alerts, [{ type: 'floor', chatId: '42', floor: 0.11, threshold: 0.12 }]);
  assert.equal(first.state.subscribers['42'].floorThreshold, null);

  // Alert is off now: a still-low floor must not repeat.
  const second = computeAlerts({ state: first.state, market: { floorAsk: 0.11 }, own: null });
  assert.deepEqual(second.alerts, []);

  // Floor recovers: still off, no alert.
  const third = computeAlerts({ state: second.state, market: { floorAsk: 0.20 }, own: null });
  assert.deepEqual(third.alerts, []);

  // User sets a new price: fires again below it.
  const rearmed = {
    ...third.state,
    subscribers: { '42': { subscribedAt: 'x', floorThreshold: 0.12, floorArmedDown: true } },
  };
  const fourth = computeAlerts({ state: rearmed, market: { floorAsk: 0.105 }, own: null });
  assert.deepEqual(fourth.alerts, [{ type: 'floor', chatId: '42', floor: 0.105, threshold: 0.12 }]);
});

test('floor rounding prevents flicker around the threshold', () => {
  const state = freshState({
    subscribers: { '42': { subscribedAt: 'x', floorThreshold: 0.12, floorArmedDown: true } },
  });
  // 0.11999 rounds to 0.12 -> not below, no alert, threshold kept.
  const { alerts, state: next } = computeAlerts({ state, market: { floorAsk: 0.11999 }, own: null });
  assert.deepEqual(alerts, []);
  assert.equal(next.subscribers['42'].floorThreshold, 0.12);
});

test('a missing floor never fires and never clears the threshold', () => {
  const state = freshState({
    subscribers: { '42': { subscribedAt: 'x', floorThreshold: 0.12, floorArmedDown: true } },
  });
  const { alerts, state: next } = computeAlerts({ state, market: { floorAsk: null }, own: null });
  assert.deepEqual(alerts, []);
  assert.equal(next.subscribers['42'].floorThreshold, 0.12);
});

test('subscribers without a threshold are skipped', () => {
  const state = freshState({
    subscribers: { '42': { subscribedAt: 'x', floorThreshold: null, floorArmedDown: false } },
  });
  const { alerts } = computeAlerts({ state, market: { floorAsk: 0.01 }, own: null });
  assert.deepEqual(alerts, []);
});

test('the input state is never mutated', () => {
  const state = freshState({
    listingsSeen: [1],
    lastEpoch: 27,
    subscribers: { '42': { subscribedAt: 'x', floorThreshold: 0.12, floorArmedDown: true } },
  });
  const snapshot = JSON.stringify(state);
  computeAlerts({
    state,
    market: { floorAsk: 0.11, epoch: 28 },
    own: [lot(1, 0.12), lot(9, 0.13)],
  });
  assert.equal(JSON.stringify(state), snapshot);
});
