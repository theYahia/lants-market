// bot/tg-poll.test.mjs - the DM poller must never break the daemon, and its
// handoff glue is covered offline with injected readers/api.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pollTelegram, dispatch, readContext, deliverOutbox, deliverAlerts } from './tg-poll.mjs';
import { defaultState } from './state.mjs';
import { helpText, floorAlertText } from './tg-format.mjs';
import { TEST_TOKEN, privateChat, readerSet } from './tg-poll-fixtures.mjs';

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

test('dispatch /start upserts the subscriber and queues the welcome', () => {
  const state = defaultState();
  const outbox = [];
  dispatch([{ update_id: 1, message: { text: '/start', chat: privateChat() } }], state, { market: null, epochData: {} }, outbox);
  assert.ok(state.subscribers['42']);
  assert.equal(outbox.length, 1);
  assert.ok(outbox[0].text.includes('Welcome'));
});

test('dispatch non-command text answers with the help text', () => {
  const outbox = [];
  dispatch([{ update_id: 2, message: { text: 'hello', chat: privateChat() } }], defaultState(), { market: null, epochData: {} }, outbox);
  assert.equal(outbox[0].text, helpText());
});

test('dispatch ignores group messages', () => {
  const state = defaultState();
  const outbox = [];
  dispatch([{ update_id: 3, message: { text: '/start', chat: { id: -100, type: 'group' } } }], state, { market: null, epochData: {} }, outbox);
  assert.equal(outbox.length, 0);
  assert.deepEqual(state.subscribers, {});
});

test('dispatch answers callbacks with data and acks empty ones', () => {
  const state = defaultState();
  const outbox = [];
  dispatch([
    { update_id: 4, callback_query: { id: 'cb1', data: 'setfloor:0.10', message: { chat: privateChat() } } },
    { update_id: 5, callback_query: { id: 'cb2', data: null, message: { chat: privateChat() } } },
  ], state, { market: null, epochData: {} }, outbox);
  assert.equal(outbox[0].kind, 'callback');
  assert.ok(outbox[0].text.includes('$0.10'));
  assert.equal(outbox[1].kind, 'callback');
  assert.equal(outbox[1].text, null);
});

test('readContext takes the epoch from antseedstats and falls back to the feed', async () => {
  const logs = [];
  const a = await readContext((l) => logs.push(l), readerSet());
  assert.equal(a.market.epoch, 28);
  assert.equal(a.epochData.epoch, 28);
  assert.equal(a.epochData.secondsLeft, 3600);

  const fallback = await readContext((l) => logs.push(l), readerSet({
    readAntseedStats: async () => ({ ok: true, network: null, staking: null }),
  }));
  assert.equal(fallback.epochData.epoch, 28);
  assert.equal(fallback.epochData.secondsLeft, null);
});

test('readContext logs an unavailable feed and a soft antseedstats failure', async () => {
  const logs = [];
  const noFeed = await readContext((l) => logs.push(l), readerSet({
    readFeed: async () => ({ ok: false, reason: 'network' }),
    readAntseedStats: async () => ({ ok: true, network: null, staking: null }),
  }));
  assert.equal(noFeed.market, null);
  assert.equal(noFeed.epochData.epoch, null);
  assert.ok(logs.some((l) => l.includes('feed unavailable')));

  const noStats = await readContext((l) => logs.push(l), readerSet({
    readAntseedStats: async () => ({ ok: false, reason: 'http' }),
  }));
  assert.equal(noStats.market.epoch, 28);
  assert.equal(noStats.epochData.secondsLeft, null);
  assert.equal(noStats.epochData.restakeBonusPct, null);
  assert.ok(logs.some((l) => l.includes('antseedstats unavailable')));
});

test('deliverOutbox acks callbacks, sends messages and logs failures', async () => {
  const calls = [];
  const logs = [];
  const api = {
    answerCallbackQuery: async (args) => {
      calls.push(['ack', args]);
      return { ok: true };
    },
    sendMessage: async (args) => {
      calls.push(['send', args]);
      return args.chatId === 1 ? { ok: false, reason: 'http' } : { ok: true };
    },
  };
  await deliverOutbox(TEST_TOKEN, [
    { kind: 'callback', callbackQueryId: 'cb1', text: 'done' },
    { kind: 'message', chatId: 1, text: 'one', replyMarkup: null },
    { kind: 'message', chatId: 2, text: 'two', replyMarkup: { inline_keyboard: [] } },
  ], (l) => logs.push(l), api);
  assert.equal(calls.length, 3);
  assert.equal(calls[0][1].text, 'done');
  assert.deepEqual(calls[2][1].replyMarkup, { inline_keyboard: [] });
  assert.ok(logs.some((l) => l.includes('sendMessage -> 1 failed')));
});

test('deliverAlerts sends floor alerts and re-arms a failed threshold', async () => {
  const state = defaultState();
  state.subscribers['42'] = { subscribedAt: 'x', floorThreshold: null, floorArmedDown: false };
  const sent = [];
  await deliverAlerts(TEST_TOKEN, state, [{ type: 'floor', chatId: '42', floor: 0.1, threshold: 0.2 }], {}, () => {}, {
    sendMessage: async (args) => {
      sent.push(args);
      return { ok: false, reason: 'http' };
    },
  });
  assert.equal(sent[0].text, floorAlertText(0.1, 0.2));
  assert.equal(state.subscribers['42'].floorThreshold, 0.2);
  assert.equal(state.subscribers['42'].floorArmedDown, true);
});

test('deliverAlerts broadcasts listings to every subscriber with the Buy button', async () => {
  const state = defaultState();
  state.subscribers['1'] = { subscribedAt: 'x' };
  state.subscribers['2'] = { subscribedAt: 'x' };
  const sent = [];
  await deliverAlerts(TEST_TOKEN, state, [
    { type: 'listing', lot: { id: 5, amount: 100, perAntUsd: 0.1, usd: 10, lockDays: null }, isFloor: true },
  ], {}, () => {}, {
    sendMessage: async (args) => {
      sent.push(args);
      return { ok: true };
    },
  });
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map((s) => s.chatId), ['1', '2']);
  assert.ok(sent[0].replyMarkup.inline_keyboard[0][0].text.startsWith('Buy'));
});

test('deliverAlerts broadcasts the epoch close with the bonus', async () => {
  const state = defaultState();
  state.subscribers['1'] = { subscribedAt: 'x' };
  const sent = [];
  await deliverAlerts(TEST_TOKEN, state, [{ type: 'epoch', closedEpoch: 27 }], { restakeBonusPct: 5 }, () => {}, {
    sendMessage: async (args) => {
      sent.push(args);
      return { ok: true };
    },
  });
  assert.equal(sent.length, 1);
  assert.ok(sent[0].text.includes('Epoch 27'));
  assert.ok(sent[0].text.includes('+5%'));
});

