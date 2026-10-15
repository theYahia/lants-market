// lANTS alerts bot — entrypoint. Two modes:
//   node bot/cron.mjs          daemon: tick every TICK_MS, graceful SIGTERM/SIGINT
//   node bot/cron.mjs --once   single tick, then exit (for external cron systems)
// Flags: --once, --dry-run (decide and print, never send), --state <file>.
//
// A tick does two things: the weekly epoch reminder (pure time math, cheap)
// and the rebate watch (RPC + site files, throttled to REBATE_INTERVAL_MS).

import process from 'node:process';
import http from 'node:http';
import { decideEpochPost } from './epoch-check.mjs';
import { checkRebates, loadLocalConfig, loadVerifiedConfig, OFFERS_URLS } from './rebate-check.mjs';
import { loadState, saveState } from './state.mjs';
import { sendMessage, sleep } from './telegram.mjs';

const TICK_MS = Number(process.env.TICK_MS || 10 * 60 * 1000);
const REBATE_INTERVAL_MS = Number(process.env.REBATE_INTERVAL_MS || 6 * 60 * 60 * 1000);
const HEALTH_PORT = Number(process.env.HEALTH_PORT || 0);
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
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
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
    }
  }
  throw last;
}

async function fetchJson(urls) {
  let last = new Error('fetchJson: no urls');
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return await res.json();
      last = new Error('HTTP ' + res.status + ' for ' + url);
    } catch (e) {
      last = e;
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

  // 2. Rebate watch — throttled; only a successful run advances the timer.
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

async function main() {
  const state = loadState(STATE_FILE);
  log(
    `start (${ONCE ? 'once' : 'daemon'}, ${DRY_RUN ? 'dry-run' : 'live'}, state=${STATE_FILE}, ` +
      `rpc=${RPC_URLS.join('|')})`
  );

  await tick(state);
  if (ONCE) return;

  startHealthServer();

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

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
