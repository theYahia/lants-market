// lANTS alerts bot — entrypoint. Two modes:
//   node bot/cron.mjs          daemon: tick every TICK_MS, graceful SIGTERM/SIGINT
//   node bot/cron.mjs --once   single tick, then exit (for external cron systems)
// Flags: --once, --dry-run (decide and print, never send), --state <file>.
//
// A tick does three things: the weekly epoch reminder (pure time math, cheap),
// the Telegram DM alerts (personal floor/epoch alerts + new listings), and the
// rebate watch (RPC + site files, throttled to REBATE_INTERVAL_MS). The tick is
// short (default 60 s) so a new listing is announced within about a minute; the
// on-chain own-listing read is throttled separately (OWN_LISTINGS_INTERVAL_MS)
// so free public RPCs are not hammered on every tick.

import process from 'node:process';
import http from 'node:http';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decideEpochPost } from './epoch-check.mjs';
import { checkRebates, loadLocalConfig, loadVerifiedConfig, OFFERS_URLS } from './rebate-check.mjs';
import { loadState, saveState } from './state.mjs';
import { sleep } from './telegram.mjs';
import { readOwnListings } from './read-own-listings.mjs';
import { rpc, fetchJson, deliver, ensureWelcomePin, makeThrottledReader, RPC_URLS } from './cron-helpers.mjs';
import { pollCommands, runDmAlerts } from './tg-poll.mjs';

export { rpc, fetchJson, deliver, ensureWelcomePin } from './cron-helpers.mjs';

const TICK_MS = Number(process.env.TICK_MS || 60 * 1000);
const REBATE_INTERVAL_MS = Number(process.env.REBATE_INTERVAL_MS || 6 * 60 * 60 * 1000);
const OWN_LISTINGS_INTERVAL_MS = Number(process.env.OWN_LISTINGS_INTERVAL_MS || 5 * 60 * 1000);
const HEALTH_PORT = Number(process.env.HEALTH_PORT || 0);

const ownListingsReader = makeThrottledReader(readOwnListings, OWN_LISTINGS_INTERVAL_MS);

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const DRY_RUN = args.includes('--dry-run');
const stateArgIdx = args.indexOf('--state');
const STATE_FILE =
  (stateArgIdx !== -1 && args[stateArgIdx + 1]) ||
  process.env.STATE_FILE ||
  fileURLToPath(new URL('./data/state.json', import.meta.url));

function log(line) {
  console.error(`[${new Date().toISOString()}] ${line}`);
}

function buildDeps() {
  return {
    ethCall: (to, data) => rpc('eth_call', [{ to, data }, 'latest']),
    ethGetCode: (addr) => rpc('eth_getCode', [addr, 'latest']),
    fetchJson
  };
}

export async function tick(state, deps = {}) {
  const nowMs = deps.nowMs ?? Date.now();
  const dryRun = deps.dryRun ?? DRY_RUN;
  const logFn = deps.log ?? log;
  const deliverFn = deps.deliver ?? deliver;
  const runDmAlertsFn = deps.runDmAlerts ?? runDmAlerts;
  const saveStateFn = deps.saveState ?? saveState;
  const stateFile = deps.stateFile ?? STATE_FILE;
  const rebateIntervalMs = deps.rebateIntervalMs ?? REBATE_INTERVAL_MS;

  // 1. Weekly epoch reminder — pure, no network.
  const decided = decideEpochPost({ now: new Date(nowMs), state });
  if (decided.post) {
    const sent = await deliverFn({ text: decided.post }, dryRun);
    if (sent && !dryRun) {
      state.epochPost = decided.epoch;
      saveStateFn(stateFile, state);
    }
  }

  // 2. Telegram DM alerts (floor threshold, new own listing, epoch end).
  // Commands are answered instantly by the long-poll loop in main(); the tick
  // only evaluates alerts. The feed is read every tick, the on-chain own
  // listings at most once per OWN_LISTINGS_INTERVAL_MS. Runs before the rebate
  // throttle's early return.
  const readOwnListingsFn = deps.readOwnListings ?? ownListingsReader;
  await runDmAlertsFn({ state, dryRun, log: logFn, readers: { readOwnListings: readOwnListingsFn } });
  if (!dryRun) saveStateFn(stateFile, state);

  // 3. Rebate watch — throttled; only a successful run advances the timer.
  if (nowMs - state.lastRebateCheck < rebateIntervalMs) return;
  try {
    const rebateDeps = (deps.buildDeps ?? buildDeps)();
    const localConfig = (deps.loadLocalConfig ?? loadLocalConfig)();
    const config = await (deps.loadVerifiedConfig ?? loadVerifiedConfig)(rebateDeps, localConfig);
    const offers = await rebateDeps.fetchJson(OFFERS_URLS);
    const posts = await (deps.checkRebates ?? checkRebates)({
      deps: rebateDeps,
      state,
      config,
      offers,
      nowMs
    });
    let delivered = 0;
    for (const post of posts) {
      if (await deliverFn(post, dryRun)) {
        if (!dryRun) post.apply(state);
        delivered++;
      }
    }
    if (!dryRun) {
      state.lastRebateCheck = nowMs;
      saveStateFn(stateFile, state);
    }
    logFn(`rebate watch: ${posts.length} due, ${delivered} sent, ${config ? 'config ok' : 'config FAILED'}`);
  } catch (e) {
    logFn('rebate watch failed (will retry next tick): ' + e.message);
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
  await ensureWelcomePin(state, { dryRun: DRY_RUN, stateFile: STATE_FILE, log });

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

// Compare real paths so a symlinked entrypoint still starts the bot instead of
// silently exiting without an error (import.meta.url is already resolved).
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  main().catch((e) => {
    log('fatal: ' + (e && e.stack ? e.stack : e));
    process.exit(1);
  });
}
