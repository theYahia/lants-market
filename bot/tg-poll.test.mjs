// bot/tg-poll.test.mjs - the DM poller must never break the daemon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pollTelegram } from './tg-poll.mjs';
import { defaultState } from './state.mjs';

test('pollTelegram is a no-op without TG_BOT_TOKEN', async () => {
  const prev = process.env.TG_BOT_TOKEN;
  delete process.env.TG_BOT_TOKEN;
  const logs = [];
  const state = defaultState();
  await pollTelegram({ state, log: (m) => logs.push(m) });
  assert.ok(logs.some((l) => l.includes('TG_BOT_TOKEN')));
  assert.equal(state.offset, 0);
  if (prev !== undefined) process.env.TG_BOT_TOKEN = prev;
});

test('defaultState carries the DM fields', () => {
  const s = defaultState();
  assert.equal(s.offset, 0);
  assert.deepEqual(s.subscribers, {});
  assert.equal(s.lastEpoch, null);
});
