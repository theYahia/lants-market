// Persisted bot state: last feed snapshot, last market board, last antseedstats
// snapshot, the candidate queue, emitted dedup keys, per-family publish slots,
// the published-post ledger (used by metrics.mjs) and a rotated refresh token.
// The file is gitignored and, in CI, carried between runs through the Actions
// cache.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const MAX_EMITTED = 200;
export const MAX_PUBLISHED = 200;
const DEFAULT_STALE_MS = 48 * HOUR_MS;

// One post per family per gap. This is not a volume cap: it stops the same
// audience being told the same story twice inside one news cycle.
export const FAMILY_GAP_MS = {
  epoch: 5 * DAY_MS,
  board: 5 * DAY_MS,
  lot: 5 * DAY_MS,
  network: 5 * DAY_MS,
  edu: 10 * DAY_MS,
};

// How long a candidate may wait for its window/slot before it is no longer
// news. Per family, so waiting for a slot never loses the number.
export const FAMILY_TTL_MS = {
  epoch: 36 * HOUR_MS,
  board: 48 * HOUR_MS,
  lot: 48 * HOUR_MS,
  network: 48 * HOUR_MS,
  edu: 10 * DAY_MS,
};

export const FAMILIES = Object.freeze(Object.keys(FAMILY_GAP_MS));

export function isFamily(family) {
  return typeof family === 'string' && Object.hasOwn(FAMILY_GAP_MS, family);
}

export const EMPTY_STATE = {
  last: null,
  lastBoard: null,
  antseed: null,
  pending: [],
  emitted: [],
  slots: {},
  published: [],
  lastPostKey: null,
  lastPostAt: null,
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

// Append new candidates, skipping keys already published or already queued.
// A candidate carries its archetype family and the structured data the text and
// card are built from at post time (numbers stay fresh while it waits).
export function enqueue(pending, events, emitted, nowMs = Date.now()) {
  const have = new Set(pending.map((e) => e.key));
  const done = new Set(emitted);
  const createdAt = new Date(nowMs).toISOString();
  const next = pending.slice();
  for (const e of events) {
    if (done.has(e.key) || have.has(e.key)) continue;
    have.add(e.key);
    next.push({
      type: e.type,
      family: e.family,
      key: e.key,
      data: e.data ?? null,
      createdAt,
    });
  }
  return next;
}

// Drop queued candidates past their family TTL: too stale to report as news.
// `ttl` may be a number, a `(event) => ms` function, or omitted (per family).
export function dropStale(pending, nowMs = Date.now(), ttl = null) {
  return pending.filter((e) => {
    const t = Date.parse(e.createdAt);
    if (!Number.isFinite(t)) return false;
    const budget = typeof ttl === 'function'
      ? ttl(e)
      : typeof ttl === 'number'
        ? ttl
        : FAMILY_TTL_MS[e.family] ?? DEFAULT_STALE_MS;
    return nowMs - t <= budget;
  });
}

export function markEmitted(emitted, key) {
  return [...emitted, key].slice(-MAX_EMITTED);
}

// Publish ledger for metrics.mjs: one row per tweet the bot actually posted.
export function markPublished(published, entry) {
  return [...published, entry].slice(-MAX_PUBLISHED);
}

// A family's slot is free when it has never posted or its last post is older
// than the family gap. An unknown family is never due.
export function familyDue(slots, family, nowMs = Date.now()) {
  if (!isFamily(family)) return false;
  const last = slots ? slots[family] : null;
  if (typeof last !== 'number' || !Number.isFinite(last)) return true;
  return nowMs - last >= FAMILY_GAP_MS[family];
}

// Posts published in the last seven days (the run log's posts_this_week).
export function postsThisWeek(published, nowMs = Date.now()) {
  const weekMs = 7 * DAY_MS;
  return (published || []).filter((p) => typeof p.at === 'number' && nowMs - p.at <= weekMs).length;
}
