// Persisted bot state: last feed snapshot, last antseedstats snapshot, pending
// post queue, emitted dedup keys and a rotated refresh token. The file is
// gitignored and, in CI, carried between runs through the Actions cache.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_EMITTED = 200;
const STALE_MS = 48 * 60 * 60 * 1000;

export const EMPTY_STATE = {
  last: null,
  antseed: null,
  pending: [],
  emitted: [],
  lastPostKey: null,
  lastPostAt: null,
  lastDigestAt: null,
  refreshToken: null,
};

export function loadState(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function saveState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

// Append new events, skipping keys already posted or already queued.
export function enqueue(pending, events, emitted, nowMs = Date.now()) {
  const have = new Set(pending.map((e) => e.key));
  const done = new Set(emitted);
  const createdAt = new Date(nowMs).toISOString();
  const next = pending.slice();
  for (const e of events) {
    if (done.has(e.key) || have.has(e.key)) continue;
    have.add(e.key);
    next.push({ type: e.type, key: e.key, text: e.text, createdAt, meta: e.meta ?? null });
  }
  return next;
}

// Drop queued events older than 48h: too stale to report as news.
export function dropStale(pending, nowMs = Date.now(), maxAgeMs = STALE_MS) {
  return pending.filter((e) => {
    const t = Date.parse(e.createdAt);
    return Number.isFinite(t) && nowMs - t <= maxAgeMs;
  });
}

export function markEmitted(emitted, key) {
  return [...emitted, key].slice(-MAX_EMITTED);
}

// Post-priority and rate-limit helpers shared with run.mjs. Market events
// (lants.eth.limo) always precede antseedstats events in a run's posting slice;
// continuous antseedstats metrics are capped per run and cooled down per metric.

export const MARKET_EVENT_TYPES = new Set(['epoch']);

export const STAT_COOLDOWN_HOURS = { settled7d: 24, settled30d: 24, stakedAnts: 48, requests24h: 24, diemStake: 24 };

export function isMarketEvent(type) {
  return MARKET_EVENT_TYPES.has(type);
}

// Stable priority sort: market events first, then stats, each in creation order.
export function orderEvents(pending) {
  return pending.slice().sort((a, b) => {
    const pa = isMarketEvent(a.type) ? 0 : 1;
    const pb = isMarketEvent(b.type) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;
    return 0;
  });
}

// Cap the number of stats events posted in one run. Filtered events stay in the
// queue for the next run (they are not dropped).
export function capStats(events, maxStats) {
  const out = [];
  let stats = 0;
  for (const e of events) {
    if (isMarketEvent(e.type)) {
      out.push(e);
      continue;
    }
    if (stats >= maxStats) continue;
    stats += 1;
    out.push(e);
  }
  return out;
}

// A continuous antseedstats metric is still inside its per-metric cooldown
// window when its last successful post is too recent.
export function withinCooldown(event, antseed, nowMs) {
  const field = event && event.meta ? event.meta.field : null;
  const hours = field ? STAT_COOLDOWN_HOURS[field] : null;
  if (!hours) return false;
  const last = antseed && antseed.postedAt ? antseed.postedAt[field] : null;
  return typeof last === 'number' && nowMs - last < hours * 3600 * 1000;
}
