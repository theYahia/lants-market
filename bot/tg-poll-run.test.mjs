// bot/tg-poll-run.test.mjs - the poll and alert runs against injected readers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pollCommands, runDmAlerts } from './tg-poll.mjs';
import { defaultState } from './state.mjs';
import { withToken, privateChat, readerSet } from './tg-poll-fixtures.mjs';

function floorState() {
  const state = defaultState();
  state.subscribers['42'] = { subscribedAt: 'x', floorThreshold: 0.2, floorArmedDown: true };
  return state;
}

test('pollCommands advances the offset and replies through the injected api', async () => {
  await withToken(async () => {
    const state = defaultState();
    const sent = [];
    const r = await pollCommands({
      state,
      log: () => {},
      readers: readerSet(),
      api: {
        getUpdates: async () => ({
          ok: true,
          updates: [
            { update_id: 7, message: { text: '/start', chat: privateChat() } },
            { update_id: 9, message: { text: 'hi', chat: privateChat() } },
          ],
        }),
        sendMessage: async (args) => {
          sent.push(args);
          return { ok: true };
        },
      },
    });
    assert.equal(r.ok, true);
    assert.equal(r.handled, 2);
    assert.equal(state.offset, 10);
    assert.equal(sent.length, 2);
  });
});

test('pollCommands dry-run logs replies and does not send', async () => {
  await withToken(async () => {
    const logs = [];
    let sent = 0;
    const r = await pollCommands({
      state: defaultState(),
      dryRun: true,
      log: (l) => logs.push(l),
      readers: readerSet(),
      api: {
        getUpdates: async () => ({ ok: true, updates: [{ update_id: 1, message: { text: '/floor', chat: privateChat() } }] }),
        sendMessage: async () => {
          sent++;
          return { ok: true };
        },
      },
    });
    assert.equal(r.handled, 1);
    assert.equal(sent, 0);
    assert.ok(logs.some((l) => /^tg dry-run: 1 update\(s\), 1 reply\(ies\)$/.test(l)));
  });
});

test('pollCommands is disabled without a token', async () => {
  const prev = process.env.TG_BOT_TOKEN;
  delete process.env.TG_BOT_TOKEN;
  let polled = 0;
  const r = await pollCommands({
    state: defaultState(),
    log: () => {},
    api: { getUpdates: async () => { polled++; return { ok: true, updates: [] }; } },
  });
  assert.deepEqual(r, { ok: false, handled: 0 });
  assert.equal(polled, 0);
  if (prev !== undefined) process.env.TG_BOT_TOKEN = prev;
});

test('runDmAlerts dry-run logs the alert count', async () => {
  await withToken(async () => {
    const logs = [];
    await runDmAlerts({
      state: floorState(),
      dryRun: true,
      log: (l) => logs.push(l),
      readers: readerSet(),
    });
    assert.ok(logs.some((l) => l === 'tg dry-run: 1 alert(s)'));
  });
});

test('runDmAlerts skips own-listing alerts when that read fails', async () => {
  await withToken(async () => {
    const state = floorState();
    state.listingsBaselineDone = true;
    state.lastEpoch = 28;
    const logs = [];
    await runDmAlerts({
      state,
      dryRun: true,
      log: (l) => logs.push(l),
      readers: readerSet({ readOwnListings: async () => ({ ok: false, reason: 'rpc' }) }),
    });
    assert.ok(logs.some((l) => l.includes('own listings unavailable')));
    assert.ok(logs.some((l) => l === 'tg dry-run: 1 alert(s)'));
  });
});

test('runDmAlerts evaluates no floor or epoch alert without a feed', async () => {
  await withToken(async () => {
    const state = floorState();
    state.listingsBaselineDone = true;
    state.lastEpoch = 28;
    const logs = [];
    await runDmAlerts({
      state,
      dryRun: true,
      log: (l) => logs.push(l),
      readers: readerSet({ readFeed: async () => ({ ok: false, reason: 'network' }) }),
    });
    assert.ok(logs.some((l) => l === 'tg dry-run: 0 alert(s)'));
  });
});
