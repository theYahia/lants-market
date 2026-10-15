import test from 'node:test';
import assert from 'node:assert/strict';
import { currentEpochAt, decideEpochPost, epochPostText, POST_WINDOW_MS } from './epoch-check.mjs';
import { defaultState } from './state.mjs';

const B27 = new Date('2026-10-15T09:54:21.000Z');

test('currentEpochAt: 27 after the 15.10 boundary', () => {
  assert.equal(currentEpochAt(new Date('2026-10-15T09:54:21.000Z')), 27);
  assert.equal(currentEpochAt(new Date('2026-10-15T10:00:00.000Z')), 27);
  assert.equal(currentEpochAt(new Date('2026-10-22T09:54:20.999Z')), 27);
});

test('currentEpochAt: 26 before the boundary', () => {
  assert.equal(currentEpochAt(new Date('2026-10-15T09:54:20.999Z')), 26);
  assert.equal(currentEpochAt(new Date('2026-10-08T10:00:00.000Z')), 26);
});

test('currentEpochAt: throws before the epoch base', () => {
  assert.throws(() => currentEpochAt(new Date('2026-09-01T00:00:00.000Z')));
});

test('decideEpochPost: posts for the finished epoch right after the boundary', () => {
  const now = new Date(B27.getTime() + 60 * 60 * 1000);
  const { post, epoch } = decideEpochPost({ now, state: defaultState() });
  assert.equal(epoch, 26);
  assert.ok(post.includes('Epoch 26 has ended'));
  assert.ok(post.includes('lants.eth.limo'));
});

test('decideEpochPost: silent inside the running epoch', () => {
  const now = new Date(B27.getTime() - 60 * 60 * 1000);
  const { post } = decideEpochPost({ now, state: defaultState() });
  assert.equal(post, null);
});

test('decideEpochPost: silent when the window is missed (beyond 48h)', () => {
  const now = new Date(B27.getTime() + POST_WINDOW_MS + 1000);
  const { post } = decideEpochPost({ now, state: defaultState() });
  assert.equal(post, null);
});

test('decideEpochPost: silent when already posted', () => {
  const state = defaultState();
  state.epochPost = 26;
  const now = new Date(B27.getTime() + 60 * 60 * 1000);
  const { post } = decideEpochPost({ now, state });
  assert.equal(post, null);
});

test('epochPostText: mentions claim and restake', () => {
  const text = epochPostText(26);
  assert.ok(text.includes('Claim'));
  assert.ok(text.includes('Restake'));
});
