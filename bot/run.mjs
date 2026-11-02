#!/usr/bin/env node
// @sxsiant bot entry point.
//
//   node bot/run.mjs --dry-run       print candidates with family, slot, window,
//                                    image and gate reason; write nothing
//   node bot/run.mjs                 post at most ONE candidate this run
//   node bot/run.mjs --state <p>     alternate state file
//
// The bot posts five archetypes only (epoch close, market board, lot highlight,
// network story, education). A candidate must pass the quality gate and its
// family slot, and the posting window must be open; otherwise it waits in the
// queue until its family TTL expires. Every post carries a link, a number and a
// card when the family has one (docs/twitter-content-plan.md Phase 3).
//
// Exit codes: 0 = nothing to do or a retryable failure (next cron retries);
// 1 = human-actionable failure (missing credentials, expired refresh token,
// billing/scope rejection).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFeed, toState } from './read-feed.mjs';
import { readSnapshot, emissionFromSnapshot } from './read-snapshot.mjs';
import { diffFeed } from './diff.mjs';
import { boardChanged, diffNetwork, dateKey } from './diff-live.mjs';
import { buildBoard, pickLot } from './aggregate.mjs';
import { readAntseedStats } from './read-antseedstats.mjs';
import { toAntseedSnapshot, toAntseedState } from './antseed-snapshot.mjs';
import {
  loadState,
  saveState,
  enqueue,
  dropStale,
  markEmitted,
  markPublished,
  familyDue,
  postsThisWeek,
  isFamily,
} from './state.mjs';
import { epochCloseText, boardText, lotText, networkText, eduText } from './format.mjs';
import { gatePost, isWindowOpen, WINDOW_START_HOUR_UTC, WINDOW_END_HOUR_UTC } from './quality.mjs';
import { cardFor } from './card.mjs';
import { attachCard } from './media.mjs';
import { loadEnvFile } from './env.mjs';
import { saveRotatedToken } from './token-store.mjs';
import { refreshAccessToken, postTweet, getMe, scopeAllowsWrite } from './xapi.mjs';

const BOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATE = path.join(BOT_DIR, 'state.json');
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Families whose post carries a card. network/edu are text-only on purpose:
// they are stories, not boards.
const IMAGE_FAMILIES = new Set(['epoch', 'board', 'lot']);

// Which candidate wins when several are ready: the time-critical epoch close
// first, then the market board, then the lot, then the softer stories.
const RANK = { epoch: 5, board: 4, lot: 3, network: 2, edu: 1 };

const BUILDERS = {
  epoch: epochCloseText,
  board: boardText,
  lot: lotText,
  network: networkText,
  edu: eduText,
};

function log(msg) {
  console.log(`[bot] ${msg}`);
}

function indent(text) {
  return text.split('\n').map((line) => `    | ${line}`).join('\n');
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

function readCreds(state) {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  // A rotated token persisted in state wins over the (possibly stale) secret.
  const refreshToken = state.refreshToken || process.env.X_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

function buildText(event) {
  const build = BUILDERS[event.type];
  if (typeof build !== 'function') return '';
  const text = build(event.data || {});
  return typeof text === 'string' ? text : '';
}

// One queued candidate per family: the newest data supersedes an older candidate
// for the same story (a board from three days ago is not news once today's exists).
function latestPerFamily(pending) {
  const byFamily = new Map();
  for (const e of pending) byFamily.set(e.family, e);
  return [...byFamily.values()];
}

function rankCandidates(candidates) {
  return candidates.slice().sort((a, b) => {
    const ra = RANK[a.event.family] ?? 0;
    const rb = RANK[b.event.family] ?? 0;
    if (ra !== rb) return rb - ra;
    if (a.event.createdAt < b.event.createdAt) return -1;
    if (a.event.createdAt > b.event.createdAt) return 1;
    return 0;
  });
}

function findEpochRecord(antseed, epoch) {
  const list = antseed && Array.isArray(antseed.epochs) ? antseed.epochs : [];
  return list.find((e) => e.epoch === epoch && e.status === 'complete')
    || list.find((e) => e.epoch === epoch)
    || null;
}

async function main(argv) {
  loadEnvFile(path.join(BOT_DIR, '.env'));

  const dryRun = argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const statePath = argValue(argv, '--state') || DEFAULT_STATE;
  const state = loadState(statePath);
  const nowMs = Date.now();
  const windowOpen = isWindowOpen(nowMs);

  const feed = await readFeed();
  if (!feed.ok) {
    log(`feed unavailable (${feed.reason}); skipping run, no post`);
    return 0;
  }
  const market = feed.market;
  const epoch = market.epoch;

  // The snapshot is a soft dependency: without it the epoch post omits the
  // emission and the lot highlight is skipped, but the run continues.
  const snapshot = await readSnapshot({ minEpoch: epoch });
  if (!snapshot.ok) log(`snapshot unavailable (${snapshot.reason}); emission and lot highlight skipped`);

  const prevMaxCompletedEpoch = state.antseed ? state.antseed.maxCompletedEpoch ?? 0 : Number.MAX_SAFE_INTEGER;
  const astats = await readAntseedStats({ prevMaxCompletedEpoch });

  let antseed = null;
  if (!astats.ok) {
    log(`antseedstats unavailable (${astats.reason}); board network numbers skipped`);
  } else {
    // The live/demand endpoints (leaders, daily, diem, rewards, models) no
    // longer feed any post; the network story and board read only the core
    // summary + supply + epochs. Passing null stops the extra API calls.
    antseed = toAntseedSnapshot(astats, null);
    for (const [section, reason] of Object.entries(astats.reasons)) {
      if (reason) log(`antseedstats ${section} unavailable (${reason})`);
    }
  }

  const board = buildBoard({ market, antseed, epoch });

  // --- Candidates ----------------------------------------------------------
  const events = [];

  if (state.last && Number.isInteger(epoch) && Number.isInteger(state.last.epoch) && epoch > state.last.epoch) {
    const closed = epoch - 1;
    const record = findEpochRecord(antseed, closed);
    const emission = emissionFromSnapshot(snapshot, closed)
      ?? (record && Number.isFinite(record.emissionAnts) ? record.emissionAnts : null);
    events.push(...diffFeed(state.last, { epoch }, {
      emission,
      sellerPointsUsd: record ? record.sellerPointsUsd : null,
      restakeBonusPct: antseed ? antseed.restakeBonusPct : null,
    }));
  }

  const boardSlotFree = familyDue(state.slots, 'board', nowMs);
  const weekSinceBoard = !state.slots.board || nowMs - state.slots.board >= WEEK_MS;
  if (state.lastBoard && (boardChanged(state.lastBoard, board) || (boardSlotFree && weekSinceBoard))) {
    events.push({ type: 'board', family: 'board', key: `board:${dateKey(nowMs)}`, data: board });
  }

  if (familyDue(state.slots, 'lot', nowMs)) {
    const lot = pickLot({ market, snapshot, epoch, nowMs });
    if (lot) {
      events.push({ type: 'lot', family: 'lot', key: `lot:${lot.id}:${Number(lot.usd).toFixed(2)}`, data: lot });
    }
  }

  const net = antseed ? diffNetwork(state.antseed, antseed, { nowMs }) : { event: null, reseed: false };
  if (net.event) events.push(net.event);

  if (familyDue(state.slots, 'edu', nowMs)) {
    events.push({
      type: 'edu',
      family: 'edu',
      key: `edu:${dateKey(nowMs)}`,
      data: { totalNfts: board ? board.totalNfts : null, listedCount: board ? board.listedCount : null },
    });
  }

  // Old-format queue entries (no family/data) cannot be rebuilt into a post.
  const known = (state.pending || []).filter((e) => e && isFamily(e.family) && e.data);
  let pending = enqueue(known, events, state.emitted || [], nowMs);
  pending = latestPerFamily(dropStale(pending, nowMs));

  const candidates = rankCandidates(pending.map((event) => {
    const text = buildText(event);
    return {
      event,
      text,
      gate: gatePost({ text, family: event.family, slots: state.slots, nowMs, windowOpen }),
    };
  }));

  if (dryRun) {
    log(`dry-run: ${events.length} new candidate(s), ${candidates.length} queued; `
      + `window=${windowOpen ? 'open' : 'closed'} (${WINDOW_START_HOUR_UTC}:00-${WINDOW_END_HOUR_UTC}:00 UTC)`);
    if (candidates.length === 0) log('nothing to post');
    for (const c of candidates) {
      const slot = familyDue(state.slots, c.event.family, nowMs) ? 'free' : 'blocked';
      const image = IMAGE_FAMILIES.has(c.event.family) ? c.event.family : 'none';
      log(`[${c.event.family}] slot=${slot} window=${windowOpen ? 'open' : 'closed'} image=${image} gate=${c.gate.ok ? 'ok' : c.gate.reason}`);
      log(indent(c.text));
    }
    const passing = candidates.filter((c) => c.gate.ok).length;
    log(`would_post=${passing > 0 ? 1 : 0} posts_this_week=${postsThisWeek(state.published, nowMs)}`);
    return 0;
  }

  // Advance the observed snapshot whatever happens, so the same change is never
  // re-detected; queued candidates keep the waiting ones alive.
  state.last = toState({ epoch });
  if (board) {
    state.lastBoard = {
      floorAsk: board.floorAsk,
      listedCount: board.listedCount,
      offeredCount: board.offeredCount,
    };
  }
  if (antseed) state.antseed = toAntseedState(antseed, state.antseed);
  if (net.reseed && antseed && Number.isFinite(antseed.settled7d)) {
    state.antseed = {
      ...(state.antseed || {}),
      networkBaseline: { at: new Date(nowMs).toISOString(), settled7d: antseed.settled7d },
    };
  }
  state.pending = pending;

  const chosen = candidates.find((c) => c.gate.ok) || null;
  if (!chosen) {
    saveState(statePath, state);
    const blocked = candidates[0];
    log(blocked
      ? `no post: ${blocked.event.family} held (${blocked.gate.reason})`
      : 'no candidates');
    log(`posts_this_run=0 posts_this_week=${postsThisWeek(state.published, nowMs)} window=${windowOpen ? 'open' : 'closed'}`);
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

  // Cards are optional: a missing media.write scope, a render failure or an
  // upload rejection must never cost the post itself.
  let mediaId = null;
  let hasImage = false;
  const svg = cardFor(chosen.event.family, chosen.event.data);
  if (svg) {
    const card = await attachCard({ accessToken: token.accessToken, scope: token.scope, svg });
    if (card.ok) {
      mediaId = card.mediaId;
      hasImage = true;
      log(`card attached (${mediaId})`);
    } else {
      log(`card skipped (${card.reason}${card.detail ? `: ${card.detail}` : ''}); posting text only`);
    }
  }

  const res = await postTweet({
    accessToken: token.accessToken,
    text: chosen.text,
    mediaIds: mediaId ? [mediaId] : null,
  });
  if (!res.ok) {
    saveState(statePath, state);
    if (res.body) log(`X response: ${JSON.stringify(res.body)}`);
    if (res.headers && Object.keys(res.headers).length > 0) log(`X headers: ${JSON.stringify(res.headers)}`);
    log(`post failed: ${res.reason}${res.status ? ` (HTTP ${res.status})` : ''}; will retry next run`);
    return res.retryable ? 0 : 1;
  }

  state.pending = state.pending.filter((e) => e.key !== chosen.event.key);
  state.emitted = markEmitted(state.emitted || [], chosen.event.key);
  state.slots = { ...(state.slots || {}), [chosen.event.family]: nowMs };
  state.published = markPublished(state.published || [], {
    key: chosen.event.key,
    type: chosen.event.type,
    family: chosen.event.family,
    id: res.id,
    at: nowMs,
    hasImage,
  });
  if (chosen.event.family === 'network' && antseed && Number.isFinite(antseed.settled7d)) {
    state.antseed = {
      ...(state.antseed || {}),
      networkBaseline: { at: new Date(nowMs).toISOString(), settled7d: antseed.settled7d },
    };
  }
  state.lastPostKey = chosen.event.key;
  state.lastPostAt = new Date(nowMs).toISOString();
  saveState(statePath, state);

  log(`posted ${res.id} [${chosen.event.family}${hasImage ? '+card' : ''}]: ${chosen.text}`);
  log(`posts_this_run=1 posts_this_week=${postsThisWeek(state.published, nowMs)} window=${windowOpen ? 'open' : 'closed'}`);
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
