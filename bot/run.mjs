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
import { readOwnListings } from './read-own-listings.mjs';
import { diffFeed, diffAntseedStats } from './diff.mjs';
import { readAntseedStats } from './read-antseedstats.mjs';
import { toAntseedSnapshot, toAntseedState } from './antseed-snapshot.mjs';
import { loadState, saveState, enqueue, dropStale, markEmitted, orderEvents, capStats, withinCooldown } from './state.mjs';
import { digestText } from './format.mjs';
import { saveRotatedToken } from './token-store.mjs';
import { refreshAccessToken, postTweet, getMe, scopeAllowsWrite } from './xapi.mjs';

const BOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATE = path.join(BOT_DIR, 'state.json');
// Posting limits. Owner request 29.10: lift them while watching what the bot
// produces. STATS_PER_RUN 0 = no per-run stats cap; STATS_THROTTLE false =
// ignore the per-metric cooldown windows. Restore 1/true to throttle again.
const STATS_PER_RUN = 0;
const STATS_THROTTLE = false;
const DIGEST_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

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

  const own = await readOwnListings();
  if (!own.ok) log(`own listings unavailable (${own.reason}); listing posts skipped`);

  const curr = {
    avg24h: feed.market.avg24h,
    epoch: feed.market.epoch,
    // On an own-listings outage reuse the previous listing set unchanged, so an
    // outage never reads as "everything delisted".
    listings: own.ok ? own.listings : (state.last ? state.last.listings : []),
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

  // On a cold start there is no completed-epoch baseline: skip the epoch-detail
  // fetch (the diff discards it anyway until the first baseline is written).
  const prevMaxCompletedEpoch = state.antseed ? state.antseed.maxCompletedEpoch ?? 0 : Number.MAX_SAFE_INTEGER;
  const astats = await readAntseedStats({ prevMaxCompletedEpoch });
  let antseedEvents = [];
  let antseedSnapshot = null;
  let restakeBonusPct = null;
  if (!astats.ok) {
    log(`antseedstats unavailable (${astats.reason}); antseedstats posts skipped`);
  } else {
    antseedSnapshot = toAntseedSnapshot(astats);
    restakeBonusPct = antseedSnapshot.restakeBonusPct;
    for (const [section, reason] of Object.entries(astats.reasons)) {
      if (reason) log(`antseedstats ${section} unavailable (${reason}); ${section} posts skipped`);
    }
    antseedEvents = diffAntseedStats(state.antseed, antseedSnapshot, { nowMs });
  }

  const feedEvents = diffFeed(state.last, curr, { emission, restakeBonusPct });

  if (STATS_THROTTLE) {
    antseedEvents = antseedEvents.filter((e) => !withinCooldown(e, state.antseed, nowMs));
  }

  let digestEvent = null;
  if (!state.lastDigestAt || nowMs - state.lastDigestAt >= DIGEST_INTERVAL_MS) {
    state.lastDigestAt = nowMs;
    digestEvent = {
      type: 'digest',
      key: `digest:${new Date(nowMs).toISOString().slice(0, 10)}`,
      text: digestText({
        floorAsk: feed.market.floorAsk,
        avg24h: feed.market.avg24h,
        listedCount: feed.market.listedCount,
        settled7d: antseedSnapshot ? antseedSnapshot.settled7d : null,
        sellers7d: antseedSnapshot ? antseedSnapshot.sellers7d : null,
        stakedAnts: antseedSnapshot ? antseedSnapshot.stakedAnts : null,
        stakedPct: antseedSnapshot ? antseedSnapshot.stakedPct : null,
        usage: antseedSnapshot ? { requests: antseedSnapshot.requests24h, tokens: antseedSnapshot.tokens24h } : null,
        generative: antseedSnapshot ? { videos: antseedSnapshot.generativeVideos7d, spendUsd: antseedSnapshot.generativeSpendUsd7d } : null,
      }),
      meta: null,
    };
  }

  const events = [...feedEvents, ...antseedEvents, ...(digestEvent ? [digestEvent] : [])];
  const pending = orderEvents(dropStale(enqueue(state.pending || [], events, state.emitted || [], nowMs), nowMs));

  if (dryRun) {
    log(`dry-run: ${events.length} new event(s), ${pending.length} pending post(s)`);
    if (maxPosts > 0) log(`max-posts cap: ${maxPosts}`);
    if (pending.length === 0) log('nothing to post');
    pending.forEach((e, i) => log(`[${i}] ${e.type}: ${e.text}`));
    return 0;
  }

  // Advance the snapshot regardless of whether we post, so events are never
  // re-detected and never lost.
  state.last = toState(curr);
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
    const cidFp = creds.clientId ? creds.clientId.slice(0, 8) : 'null';
    log(`token refresh failed: ${token.reason}${token.status ? ` (HTTP ${token.status})` : ''}; client_id=${cidFp}… refresh_token=${rtFp}…`);
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

  const sliced = maxPosts > 0 ? pending.slice(0, maxPosts) : pending;
  const toPost = STATS_PER_RUN > 0 ? capStats(sliced, STATS_PER_RUN) : sliced;
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
      const { field, value } = post.meta;
      if (field === 'max7d') {
        state.antseed.max7d = value;
      } else if (field === 'countdown') {
        state.antseed.countdownPosted = state.antseed.countdownPosted || {};
        state.antseed.countdownPosted[String(value.epoch)] = value.bucket;
      } else if (field === 'lastTopModelsAt') {
        state.antseed.lastTopModelsAt = value;
      } else {
        state.antseed.posted[field] = value;
        state.antseed.postedAt[field] = nowMs;
      }
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
