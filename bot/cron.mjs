// lANTS alerts bot — entrypoint. Two modes:
//   node bot/cron.mjs          daemon: tick every TICK_MS, graceful SIGTERM/SIGINT
//   node bot/cron.mjs --once   single tick, then exit (for external cron systems)
// Flags: --once, --dry-run (decide and print, never send), --state <file>.
//
// A tick does three things: the weekly epoch reminder (pure time math, cheap),
// the Telegram DM poll (commands + personal floor/epoch alerts), and the rebate
// watch (RPC + site files, throttled to REBATE_INTERVAL_MS).

import process from 'node:process';
import http from 'node:http';
import crypto from 'node:crypto';
import { decideEpochPost } from './epoch-check.mjs';
import { checkRebates, loadLocalConfig, loadVerifiedConfig, OFFERS_URLS } from './rebate-check.mjs';
import { loadState, saveState } from './state.mjs';
import { sendMessage, editMessageText, pinMessage, sleep } from './telegram.mjs';
import { welcomeText } from './welcome.mjs';
import { pollCommands, runDmAlerts } from './tg-poll.mjs';

const TICK_MS = Number(process.env.TICK_MS || 10 * 60 * 1000);
const REBATE_INTERVAL_MS = Number(process.env.REBATE_INTERVAL_MS || 6 * 60 * 60 * 1000);
const HEALTH_PORT = Number(process.env.HEALTH_PORT || 0);
// Wall-clock cap for every RPC / JSON fetch the tick performs. Without it a
// hung public RPC blocks the tick (and, before the fix, the very first command
// reply) indefinitely; with it the tick degrades to a logged failure instead.
const RPC_TIMEOUT_MS = 20000;
const RPC_URLS = (process.env.RPC_URLS || 'https://mainnet.base.org,https://base-mainnet.public.blastapi.io')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const DRY_RUN = args.includes('--dry-run');
const stateArgIdx = args.indexOf('--state');
const STATE_FILE =
  (stateArgIdx !== -1 && args[stateArgIdx + 1]) ||
  process.env.STATE_FILE ||
  new URL('./data/state.json', import.meta.url).pathname;

function log(line) {
  console.error(`[${new Date().toISOString()}] ${line}`);
}

async function rpc(method, params) {
  let last = new Error('rpc: no endpoint');
  for (const url of RPC_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: controller.signal
      });
      if (!res.ok) {
        last = new Error('rpc HTTP ' + res.status);
        continue;
      }
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || 'rpc error');
      return j.result;
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

async function fetchJson(urls) {
  let last = new Error('fetchJson: no urls');
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (res.ok) return await res.json();
      last = new Error('HTTP ' + res.status + ' for ' + url);
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

function buildDeps() {
  return {
    ethCall: (to, data) => rpc('eth_call', [{ to, data }, 'latest']),
    ethGetCode: (addr) => rpc('eth_getCode', [addr, 'latest']),
    fetchJson
  };
}

const SITE_LINK = [{ text: 'Open lants.eth.limo', url: 'https://lants.eth.limo' }];

async function deliver(post, dryRun) {
  if (dryRun) {
    log('DRY-RUN would send:\n' + post.text);
    return true;
  }
  try {
    await sendMessage(post.text, { replyMarkup: SITE_LINK });
    log('sent post (' + post.text.split('\n')[0].slice(0, 60) + ')');
    return true;
  } catch (e) {
    log('telegram delivery failed: ' + e.message);
    return false;
  }
}

async function tick(state) {
  const nowMs = Date.now();

  // 1. Weekly epoch reminder — pure, no network.
  const decided = decideEpochPost({ now: new Date(nowMs), state });
  if (decided.post) {
    const sent = await deliver({ text: decided.post }, DRY_RUN);
    if (sent && !DRY_RUN) {
      state.epochPost = decided.epoch;
      saveState(STATE_FILE, state);
    }
  }

  // 2. Telegram DM alerts (floor threshold, new own listing, epoch end).
  // Commands are answered instantly by the long-poll loop in main(); the tick
  // only evaluates alerts. Runs before the rebate throttle's early return.
  await runDmAlerts({ state, dryRun: DRY_RUN, log });
  if (!DRY_RUN) saveState(STATE_FILE, state);

  // 3. Rebate watch — throttled; only a successful run advances the timer.
  if (nowMs - state.lastRebateCheck < REBATE_INTERVAL_MS) return;
  try {
    const deps = buildDeps();
    const config = await loadVerifiedConfig(deps, loadLocalConfig());
    const offers = await deps.fetchJson(OFFERS_URLS);
    const posts = await checkRebates({ deps, state, config, offers, nowMs });
    let delivered = 0;
    for (const post of posts) {
      if (await deliver(post, DRY_RUN)) {
        if (!DRY_RUN) post.apply(state);
        delivered++;
      }
    }
    if (!DRY_RUN) {
      state.lastRebateCheck = nowMs;
      saveState(STATE_FILE, state);
    }
    log(`rebate watch: ${posts.length} due, ${delivered} sent, ${config ? 'config ok' : 'config FAILED'}`);
  } catch (e) {
    log('rebate watch failed (will retry next tick): ' + e.message);
  }
}

// Minimal liveness endpoint for the container healthcheck (HEALTH_PORT env).
function startHealthServer() {
  if (!HEALTH_PORT) return;
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.on('error', (e) => log('health server error: ' + e.message));
  server.listen(HEALTH_PORT, '127.0.0.1', () => log(`health server on 127.0.0.1:${HEALTH_PORT}`));
}

// Sends the welcome post once, keeps it pinned, and refreshes its text in
// place when the welcome text changes. Idempotent across restarts: ids and
// the text hash survive in state, the pin is retried if it failed.
function welcomeHash() {
  return crypto.createHash('sha256').update(welcomeText()).digest('hex').slice(0, 16);
}

async function ensureWelcomePin(state) {
  const hash = welcomeHash();
  if (DRY_RUN) {
    if (!state.welcomeMessageId) log('DRY-RUN would send welcome:\n' + welcomeText());
    else if (state.welcomeTextHash !== hash) log('DRY-RUN would edit welcome:\n' + welcomeText());
    return;
  }
  if (!state.welcomeMessageId) {
    try {
      const res = await sendMessage(welcomeText());
      state.welcomeMessageId = res.result.message_id;
      state.welcomeTextHash = hash;
      saveState(STATE_FILE, state);
      log('sent welcome post (message_id ' + state.welcomeMessageId + ')');
    } catch (e) {
      log('welcome delivery failed: ' + e.message);
      return;
    }
  } else if (state.welcomeTextHash !== hash) {
    try {
      await editMessageText(state.welcomeMessageId, welcomeText());
      state.welcomeTextHash = hash;
      saveState(STATE_FILE, state);
      log('edited welcome post (message_id ' + state.welcomeMessageId + ')');
    } catch (e) {
      log('welcome edit failed (will retry on next restart): ' + e.message);
      return;
    }
  }
  if (state.welcomePinned === state.welcomeMessageId) return;
  try {
    await pinMessage(state.welcomeMessageId);
    state.welcomePinned = state.welcomeMessageId;
    saveState(STATE_FILE, state);
    log('welcome post pinned');
  } catch (e) {
    log('pin failed (will retry on next restart): ' + e.message);
  }
}

// Long-poll loop: answer DM commands instantly. Runs alongside the tick loop;
// both share the in-memory state and persist after they change something. On a
// transient getUpdates error it backs off briefly instead of spinning.
function startDmCommandsLoop(state, shouldStop) {
  log('tg: command long-poll loop started');
  (async () => {
    while (!shouldStop()) {
      const r = await pollCommands({ state, longPoll: true, log });
      if (r.handled > 0) saveState(STATE_FILE, state);
      if (!r.ok) await sleep(3000);
    }
  })().catch((e) => log('tg command loop crashed: ' + (e && e.message ? e.message : e)));
}

async function main() {
  const state = loadState(STATE_FILE);
  log(
    `start (${ONCE ? 'once' : 'daemon'}, ${DRY_RUN ? 'dry-run' : 'live'}, state=${STATE_FILE}, ` +
      `rpc=${RPC_URLS.join('|')})`
  );

  startHealthServer();

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  // Instant replies: start the long-poll loop BEFORE the first tick, so a
  // command is answered immediately even while the tick is still reading the
  // feed / RPC (which can take seconds). Skipped in --once (one explicit poll
  // below) and --dry-run (never consumes real updates).
  if (!ONCE && !DRY_RUN) startDmCommandsLoop(state, () => stopping);

  await tick(state);
  await ensureWelcomePin(state);

  if (ONCE) {
    // External-cron mode: one short command poll, then exit.
    await pollCommands({ state, longPoll: false, dryRun: DRY_RUN, log });
    if (!DRY_RUN) saveState(STATE_FILE, state);
    return;
  }

  while (!stopping) {
    await sleep(TICK_MS);
    try {
      await tick(state);
    } catch (e) {
      log('tick failed: ' + e.message);
    }
  }
  log('stopped');
}

main().catch((e) => {
  log('fatal: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
