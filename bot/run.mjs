#!/usr/bin/env node
// @sxsiant bot entry point.
//
//   node bot/run.mjs --dry-run       print pending posts, post nothing, no state write
//   node bot/run.mjs                 post every pending change (change-only + dedup)
//   node bot/run.mjs --max-posts 3   cap this run at N posts (burst guard after a feed outage)
//   node bot/run.mjs --state <p>     alternate state file
//
// Exit codes: 0 = nothing to do or a retryable failure (next cron retries);
// 1 = human-actionable failure (missing credentials, expired refresh token,
// billing/scope rejection). See plan section 8.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFeed, fetchEmission, toState } from './read-feed.mjs';
import { diffFeed, diffAntseedStats } from './diff.mjs';
import { readAntseedStats, toAntseedSnapshot, toAntseedState } from './read-antseedstats.mjs';
import { loadState, saveState, enqueue, dropStale, markEmitted } from './state.mjs';
import { saveRotatedToken } from './token-store.mjs';
import { refreshAccessToken, postTweet, getMe, scopeAllowsWrite } from './xapi.mjs';

const BOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATE = path.join(BOT_DIR, 'state.json');

function log(msg) {
  console.log(`[bot] ${msg}`);
}

function loadEnvFile(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

// 0 = no cap (post everything pending); N > 0 = at most N posts this run.
function parseMaxPosts(argv) {
  const raw = argValue(argv, '--max-posts') ?? process.env.MAX_POSTS_PER_RUN;
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function readCreds(state) {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  // A rotated token persisted in state wins over the (possibly stale) secret.
  const refreshToken = state.refreshToken || process.env.X_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

async function main(argv) {
  loadEnvFile(path.join(BOT_DIR, '.env'));

  const dryRun = argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const maxPosts = parseMaxPosts(argv);
  const statePath = argValue(argv, '--state') || DEFAULT_STATE;
  const state = loadState(statePath);
  const nowMs = Date.now();

  const feed = await readFeed();
  if (!feed.ok) {
    log(`feed unavailable (${feed.reason}); skipping run, no post`);
    return 0;
  }
  if (feed.tradesReason) log(`trades unavailable (${feed.tradesReason}); trade posts skipped`);

  const curr = {
    floorAsk: feed.market.floorAsk,
    avg24h: feed.market.avg24h,
    epoch: feed.market.epoch,
    listings: feed.market.listings,
    trades: feed.trades || [],
  };

  let emission = null;
  const advanced = state.last
    && Number.isInteger(state.last.epoch)
    && Number.isInteger(curr.epoch)
    && curr.epoch > state.last.epoch;
  if (advanced) {
    const res = await fetchEmission({ epoch: curr.epoch - 1 });
    if (res.ok) emission = res.ants;
    else log(`epoch emission unavailable (${res.reason}); epoch post omits it`);
  }

  const feedEvents = diffFeed(state.last, curr, { emission });

  const astats = await readAntseedStats();
  let antseedEvents = [];
  let antseedSnapshot = null;
  if (!astats.ok) {
    log(`antseedstats unavailable (${astats.reason}); antseedstats posts skipped`);
  } else {
    antseedSnapshot = toAntseedSnapshot(astats);
    for (const [section, reason] of Object.entries(astats.reasons)) {
      if (reason) log(`antseedstats ${section} unavailable (${reason}); ${section} posts skipped`);
    }
    antseedEvents = diffAntseedStats(state.antseed, antseedSnapshot);
  }

  const events = [...feedEvents, ...antseedEvents];
  const pending = dropStale(enqueue(state.pending || [], events, state.emitted || [], nowMs), nowMs);

  if (dryRun) {
    log(`dry-run: ${events.length} new event(s), ${pending.length} pending post(s)`);
    if (maxPosts > 0) log(`max-posts cap: ${maxPosts}`);
    if (pending.length === 0) log('nothing to post');
    pending.forEach((e, i) => log(`[${i}] ${e.type}: ${e.text}`));
    return 0;
  }

  // Advance both snapshots and queue regardless of whether we post, so events
  // are never re-detected and never lost. A trades outage must not erase the
  // known trade ids, or the next successful run reposts the whole history.
  state.last = toState(feed, state.last ? state.last.tradeIds : null);
  if (antseedSnapshot) state.antseed = toAntseedState(antseedSnapshot, state.antseed);
  state.pending = pending;

  if (pending.length === 0) {
    saveState(statePath, state);
    log('no pending posts');
    return 0;
  }

  const creds = readCreds(state);
  if (!creds) {
    saveState(statePath, state);
    log('missing X credentials (X_CLIENT_ID / X_CLIENT_SECRET / X_REFRESH_TOKEN)');
    return 1;
  }

  const token = await refreshAccessToken(creds);
  if (!token.ok) {
    saveState(statePath, state);
    const rtFp = creds.refreshToken ? creds.refreshToken.slice(0, 12) : 'null';
    log(`token refresh failed: ${token.reason}${token.status ? ` (HTTP ${token.status})` : ''}; client_id=${creds.clientId} refresh_token=${rtFp}…`);
    return token.retryable ? 0 : 1;
  }
  // X rotates the refresh token; persist it write-ahead so the live token is
  // never lost between refresh and the end-of-run save (and the workflow can
  // update the GitHub secret from bot/.rotated-token).
  if (token.refreshToken) saveRotatedToken(statePath, state, token.refreshToken);
  log(`token refresh ok (scope: ${token.scope ?? 'unknown'})`);

  if (token.scope && !scopeAllowsWrite(token.scope)) {
    saveState(statePath, state);
    log('token lacks tweet.write scope — re-mint under Read and Write');
    return 1;
  }

  const me = await getMe({ accessToken: token.accessToken });
  if (!me.ok) {
    saveState(statePath, state);
    log(`token cannot authenticate (HTTP ${me.status ?? 0}${me.reason ? `: ${me.reason}` : ''}): wrong app/account or revoked`);
    return 1;
  }
  if (me.username !== 'sxsiant') {
    saveState(statePath, state);
    log(`token belongs to @${me.username ?? 'unknown'}, expected @sxsiant — minted against the wrong app/account`);
    return 1;
  }
  log(`authenticated as @${me.username} (id ${me.userId})`);

  const toPost = maxPosts > 0 ? pending.slice(0, maxPosts) : pending;
  let posted = 0;
  for (const post of toPost) {
    const res = await postTweet({ accessToken: token.accessToken, text: post.text });
    if (!res.ok) {
      saveState(statePath, state);
      if (res.body) log(`X response: ${JSON.stringify(res.body)}`);
      if (res.headers && Object.keys(res.headers).length > 0) log(`X headers: ${JSON.stringify(res.headers)}`);
      log(`post failed: ${res.reason}${res.status ? ` (HTTP ${res.status})` : ''}; will retry next run`);
      return res.retryable ? 0 : 1;
    }
    state.pending = state.pending.filter((e) => e.key !== post.key);
    state.emitted = markEmitted(state.emitted || [], post.key);
    state.lastPostKey = post.key;
    // Advance the antseedstats post-baseline only for the events that actually
    // went out; a capped run leaves the baseline untouched for the queue.
    if (state.antseed && post.meta?.field) {
      if (post.meta.field === 'max7d') state.antseed.max7d = post.meta.value;
      else state.antseed.posted[post.meta.field] = post.meta.value;
    }
    posted += 1;
    log(`posted ${res.id}: ${post.text}`);
  }
  if (posted > 0) state.lastPostAt = new Date().toISOString();
  saveState(statePath, state);
  return 0;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error('[bot] fatal: ' + ((e && e.stack) || e));
    process.exitCode = 1;
  });
