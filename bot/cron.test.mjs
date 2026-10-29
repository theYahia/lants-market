// bot/cron.test.mjs - the tick's IO glue, exercised offline with injected deps.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { rpc, fetchJson, deliver, ensureWelcomePin } from './cron.mjs';
import { makeThrottledReader } from './cron-helpers.mjs';
import { defaultState } from './state.mjs';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function collector() {
  const calls = [];
  return { calls, log: (line) => calls.push(line) };
}

test('rpc returns result from the first healthy endpoint', async () => {
  const urls = [];
  const result = await rpc('eth_blockNumber', [], {
    urls: ['u1'],
    timeoutMs: 1000,
    fetch: async (url) => {
      urls.push(url);
      return jsonResponse({ result: '0x10' });
    },
  });
  assert.equal(result, '0x10');
  assert.deepEqual(urls, ['u1']);
});

test('rpc falls through a non-ok response to the next URL', async () => {
  const seen = [];
  const result = await rpc('eth_call', [], {
    urls: ['a', 'b'],
    timeoutMs: 1000,
    fetch: async (url) => {
      seen.push(url);
      return url === 'a' ? jsonResponse({}, { ok: false, status: 502 }) : jsonResponse({ result: 'ok' });
    },
  });
  assert.equal(result, 'ok');
  assert.deepEqual(seen, ['a', 'b']);
});

test('rpc throws the last error when every endpoint fails', async () => {
  await assert.rejects(
    rpc('eth_call', [], {
      urls: ['a', 'b'],
      timeoutMs: 1000,
      fetch: async () => jsonResponse({}, { ok: false, status: 503 }),
    }),
    /rpc HTTP 503/
  );
});

test('rpc turns a JSON-RPC error into a thrown error', async () => {
  await assert.rejects(
    rpc('bad_method', [], {
      urls: ['a'],
      timeoutMs: 1000,
      fetch: async () => jsonResponse({ error: { message: 'method not found' } }),
    }),
    /method not found/
  );
});

test('fetchJson returns JSON from the first ok URL', async () => {
  const body = await fetchJson(['u1'], {
    timeoutMs: 1000,
    fetch: async () => jsonResponse({ hello: 'world' }),
  });
  assert.deepEqual(body, { hello: 'world' });
});

test('fetchJson falls back when a URL is not ok', async () => {
  const seen = [];
  const body = await fetchJson(['a', 'b'], {
    timeoutMs: 1000,
    fetch: async (url) => {
      seen.push(url);
      return url === 'a' ? jsonResponse({}, { ok: false, status: 500 }) : jsonResponse({ ok: 1 });
    },
  });
  assert.deepEqual(body, { ok: 1 });
  assert.deepEqual(seen, ['a', 'b']);
});

test('fetchJson throws the last error when every URL fails', async () => {
  await assert.rejects(
    fetchJson(['a'], { timeoutMs: 1000, fetch: async () => jsonResponse({}, { ok: false, status: 503 }) }),
    /HTTP 503/
  );
});

test('deliver dry-run logs and never calls Telegram', async () => {
  const { calls, log } = collector();
  let sent = 0;
  const ok = await deliver({ text: 'hello' }, true, { log, sendMessage: async () => { sent++; } });
  assert.equal(ok, true);
  assert.equal(sent, 0);
  assert.ok(calls.some((l) => l.includes('DRY-RUN would send')));
});

test('deliver live sends the post with the site link', async () => {
  const { log } = collector();
  const sent = [];
  const ok = await deliver({ text: 'hello' }, false, {
    log,
    sendMessage: async (text, options) => {
      sent.push({ text, options });
    },
  });
  assert.equal(ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, 'hello');
  assert.equal(sent[0].options.replyMarkup[0].url, 'https://lants.eth.limo');
});

test('deliver reports a failed send without throwing', async () => {
  const { calls, log } = collector();
  const ok = await deliver({ text: 'hello' }, false, {
    log,
    sendMessage: async () => {
      throw new Error('telegram down');
    },
  });
  assert.equal(ok, false);
  assert.ok(calls.some((l) => l.includes('telegram delivery failed')));
});

function welcomeDeps(overrides = {}) {
  const events = [];
  return {
    events,
    deps: {
      log: () => {},
      welcomeText: () => 'HELLO',
      stateFile: 'unused.json',
      saveState: () => events.push('save'),
      sendMessage: async () => {
        events.push('send');
        return { result: { message_id: 5 } };
      },
      editMessageText: async () => events.push('edit'),
      pinMessage: async () => events.push('pin'),
      ...overrides,
    },
  };
}

test('ensureWelcomePin sends, saves and pins the welcome post once', async () => {
  const { events, deps } = welcomeDeps();
  const state = defaultState();
  await ensureWelcomePin(state, deps);
  assert.deepEqual(events, ['send', 'save', 'pin', 'save']);
  assert.equal(state.welcomeMessageId, 5);
  assert.equal(state.welcomePinned, 5);
  assert.equal(state.welcomeTextHash.length, 16);
});

test('ensureWelcomePin edits in place when the text hash changed', async () => {
  const { events, deps } = welcomeDeps();
  const state = defaultState();
  state.welcomeMessageId = 7;
  state.welcomePinned = 7;
  state.welcomeTextHash = 'stale';
  await ensureWelcomePin(state, deps);
  assert.deepEqual(events, ['edit', 'save']);
  const hash = crypto.createHash('sha256').update('HELLO').digest('hex').slice(0, 16);
  assert.equal(state.welcomeTextHash, hash);
});

test('ensureWelcomePin pins an existing unpinned message', async () => {
  const { events, deps } = welcomeDeps();
  const state = defaultState();
  state.welcomeMessageId = 8;
  state.welcomePinned = null;
  state.welcomeTextHash = crypto.createHash('sha256').update('HELLO').digest('hex').slice(0, 16);
  await ensureWelcomePin(state, deps);
  assert.deepEqual(events, ['pin', 'save']);
  assert.equal(state.welcomePinned, 8);
});

test('ensureWelcomePin dry-run only logs the send', async () => {
  const { calls, log } = collector();
  const { deps } = welcomeDeps({
    log,
    dryRun: true,
    sendMessage: async () => {
      throw new Error('must not send');
    },
  });
  const state = defaultState();
  await ensureWelcomePin(state, deps);
  assert.ok(calls.some((l) => l.includes('DRY-RUN would send welcome')));
  assert.equal(state.welcomeMessageId, null);
});

test('makeThrottledReader reuses the result inside the interval', async () => {
  let now = 1000;
  let reads = 0;
  const read = makeThrottledReader(async () => {
    reads++;
    return { ok: true, n: reads };
  }, 60_000, () => now);
  const first = await read();
  now += 30_000;
  assert.equal(await read(), first);
  assert.equal(reads, 1);
  now += 31_000;
  assert.equal((await read()).n, 2);
  assert.equal(reads, 2);
});

test('makeThrottledReader caches a failed read too', async () => {
  let now = 0;
  let reads = 0;
  const read = makeThrottledReader(async () => {
    reads++;
    return { ok: false, reason: 'rpc' };
  }, 60_000, () => now);
  await read();
  now += 1_000;
  assert.deepEqual(await read(), { ok: false, reason: 'rpc' });
  assert.equal(reads, 1);
});

