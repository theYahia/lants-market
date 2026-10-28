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
    next.push({ type: e.type, key: e.key, text: e.text, createdAt });
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
