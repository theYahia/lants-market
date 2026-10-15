import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { sendMessage } from './telegram.mjs';

const calls = [];
const originalFetch = globalThis.fetch;
const originalToken = process.env.TG_BOT_TOKEN;
const originalChat = process.env.TG_CHAT_ID;
const originalApi = process.env.TG_API_URL;

beforeEach(() => {
  calls.length = 0;
  delete process.env.TG_BOT_TOKEN;
  delete process.env.TG_CHAT_ID;
  delete process.env.TG_API_URL;
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.TG_BOT_TOKEN;
  else process.env.TG_BOT_TOKEN = originalToken;
  if (originalChat === undefined) delete process.env.TG_CHAT_ID;
  else process.env.TG_CHAT_ID = originalChat;
  if (originalApi === undefined) delete process.env.TG_API_URL;
  else process.env.TG_API_URL = originalApi;
});

function okFetch(handler) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler ? handler(url, init) : { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  };
}

test('sendMessage: posts text to the right endpoint with token and chat id', async () => {
  okFetch();
  const res = await sendMessage('hello', { token: '123:ABC', chatId: '@lants_alerts' });
  assert.ok(res.ok);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.telegram.org/bot123:ABC/sendMessage');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.chat_id, '@lants_alerts');
  assert.equal(body.text, 'hello');
  assert.equal(body.reply_markup, undefined);
});

test('sendMessage: inline keyboard buttons land in reply_markup', async () => {
  okFetch();
  await sendMessage('hi', {
    token: 't',
    chatId: 'c',
    replyMarkup: [{ text: 'Open site', url: 'https://lants.eth.limo' }]
  });
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.reply_markup, {
    inline_keyboard: [[{ text: 'Open site', url: 'https://lants.eth.limo' }]]
  });
});

test('sendMessage: retries on HTTP 500, succeeds on the third try', async () => {
  let n = 0;
  okFetch(() => {
    n++;
    if (n < 3) return { ok: false, status: 500, text: async () => 'boom' };
    return { ok: true, json: async () => ({ ok: true }) };
  });
  const res = await sendMessage('retry me', { token: 't', chatId: 'c' });
  assert.ok(res.ok);
  assert.equal(calls.length, 3);
});

test('sendMessage: throws when the API rejects the message', async () => {
  okFetch(() => ({ ok: true, json: async () => ({ ok: false, description: 'chat not found' }) }));
  await assert.rejects(() => sendMessage('x', { token: 't', chatId: 'c' }), /chat not found/);
});

test('sendMessage: throws without a token or chat id', async () => {
  await assert.rejects(() => sendMessage('x'), /TG_BOT_TOKEN/);
  await assert.rejects(() => sendMessage('x', { token: 't' }), /TG_CHAT_ID/);
  await assert.rejects(() => sendMessage('   ', { token: 't', chatId: 'c' }), /empty/);
});

test('sendMessage: TG_API_URL override routes through a relay', async () => {
  okFetch();
  await sendMessage('hi', { token: 't', chatId: 'c', apiUrl: 'https://relay.example/' });
  assert.ok(calls[0].url.startsWith('https://relay.example/bott/'));
});
