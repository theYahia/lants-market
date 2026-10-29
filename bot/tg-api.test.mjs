// bot/tg-api.test.mjs - Telegram Bot API client, fake fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getUpdates, getMe, sendMessage, answerCallbackQuery } from './tg-api.mjs';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('getMe resolves the bot identity for the startup check', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return jsonResponse(200, { ok: true, result: { id: 123456, is_bot: true, username: 'lantsalerts_bot' } });
  };
  const res = await getMe({ token: 'tok', fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.username, 'lantsalerts_bot');
  assert.equal(res.id, 123456);
  assert.ok(seen.url.endsWith('/getMe'));
});

test('getMe maps a 401 to a non-retryable failure without leaking the token', async () => {
  const res = await getMe({
    token: 'secret-token',
    fetchImpl: async () => jsonResponse(401, { ok: false, description: 'Unauthorized' }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, 401);
  assert.equal(res.retryable, false);
  assert.equal(res.description, 'Unauthorized');
  assert.ok(JSON.stringify(res).includes('secret-token') === false);
});

test('getMe surfaces a result without a username as non-ok', async () => {
  const res = await getMe({ token: 'tok', fetchImpl: async () => jsonResponse(200, { ok: true, result: { id: 1 } }) });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no-result');
});

test('getUpdates posts offset and allowed_updates, returns the update list', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return jsonResponse(200, { ok: true, result: [{ update_id: 5, message: {} }] });
  };
  const res = await getUpdates({ token: 'tok', offset: 4, timeout: 0, fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.updates.length, 1);
  assert.equal(res.updates[0].update_id, 5);
  assert.ok(seen.url.endsWith('/getUpdates'));
  assert.equal(seen.opts.method, 'POST');
  const body = JSON.parse(seen.opts.body);
  assert.equal(body.offset, 4);
  assert.equal(body.timeout, 0);
  assert.deepEqual(body.allowed_updates, ['message', 'callback_query']);
});

test('getUpdates maps a 429 to a retryable failure without leaking the token', async () => {
  const fetchImpl = async () => jsonResponse(429, { ok: false, description: 'Too Many Requests' });
  const res = await getUpdates({ token: 'secret-token', offset: 0, fetchImpl });
  assert.equal(res.ok, false);
  assert.equal(res.status, 429);
  assert.equal(res.retryable, true);
  assert.equal(res.description, 'Too Many Requests');
  assert.ok(JSON.stringify(res).includes('secret-token') === false);
});

test('getUpdates surfaces a malformed result as non-ok', async () => {
  const fetchImpl = async () => jsonResponse(200, { ok: true });
  const res = await getUpdates({ token: 'tok', offset: 0, fetchImpl });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no-result');
});

test('sendMessage posts chat_id/text and optional reply_markup', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return jsonResponse(200, { ok: true, result: { message_id: 42 } });
  };
  const markup = { inline_keyboard: [[{ text: 'View ->', url: 'https://lants.eth.limo/#position/7' }]] };
  const res = await sendMessage({ token: 'tok', chatId: 123, text: 'hi', replyMarkup: markup, fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.messageId, 42);
  const body = JSON.parse(seen.opts.body);
  assert.equal(body.chat_id, 123);
  assert.equal(body.text, 'hi');
  assert.deepEqual(body.reply_markup, markup);
});

test('sendMessage omits reply_markup when none given', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = opts;
    return jsonResponse(200, { ok: true, result: { message_id: 1 } });
  };
  await sendMessage({ token: 'tok', chatId: 1, text: 'hi', fetchImpl });
  const body = JSON.parse(seen.body);
  assert.equal('reply_markup' in body, false);
});

test('sendMessage rejects empty text without calling the API', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return jsonResponse(200, { ok: true, result: { message_id: 1 } });
  };
  const res = await sendMessage({ token: 'tok', chatId: 1, text: '   ', fetchImpl });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'text');
  assert.equal(called, false);
});

test('sendMessage maps network and timeout failures to retryable non-ok', async () => {
  const timedOut = await sendMessage({
    token: 'tok', chatId: 1, text: 'hi',
    fetchImpl: async () => { throw new Error('timeout'); },
  });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.reason, 'timeout');
  assert.equal(timedOut.retryable, true);

  const offline = await sendMessage({
    token: 'tok', chatId: 1, text: 'hi',
    fetchImpl: async () => { throw new Error('boom'); },
  });
  assert.equal(offline.ok, false);
  assert.equal(offline.reason, 'network');
  assert.equal(offline.retryable, true);
});

test('answerCallbackQuery posts the callback id and optional text', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return jsonResponse(200, { ok: true, result: true });
  };
  const res = await answerCallbackQuery({ token: 'tok', callbackQueryId: 'cq1', text: 'done', fetchImpl });
  assert.equal(res.ok, true);
  assert.ok(seen.url.endsWith('/answerCallbackQuery'));
  const body = JSON.parse(seen.opts.body);
  assert.equal(body.callback_query_id, 'cq1');
  assert.equal(body.text, 'done');
});

test('answerCallbackQuery rejects a missing callback id', async () => {
  const res = await answerCallbackQuery({ token: 'tok', callbackQueryId: '', fetchImpl: async () => ({ ok: true }) });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'callback-id');
});
