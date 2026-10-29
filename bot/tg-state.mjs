// Persisted state for @lantsalerts_bot: bot/tg-state.json (gitignored, carried
// through the Actions cache like bot/state.json). Stores only chat_id -> alert
// preferences. NO wallet addresses and NO usernames are ever persisted
// (privacy hard rule): identity stays client-side.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_LISTINGS_SEEN = 500;

export const EMPTY_TG_STATE = {
  offset: 0,
  subscribers: {},
  listingsSeen: [],
  lastEpoch: null,
};

function normalizeSubscriber(sub) {
  const out = {};
  out.subscribedAt = typeof sub.subscribedAt === 'string' && sub.subscribedAt !== '' ? sub.subscribedAt : new Date().toISOString();
  const t = Number(sub.floorThreshold);
  out.floorThreshold = Number.isFinite(t) && t > 0 ? t : null;
  out.floorArmedDown = sub.floorArmedDown === true;
  return out;
}

// Defensive normalization: a corrupt state file must never crash the run. Junk
// subscribers are dropped, out-of-range numbers reset to defaults.
export function normalizeTgState(raw) {
  const out = { ...EMPTY_TG_STATE };
  if (raw && Number.isInteger(raw.offset) && raw.offset >= 0) out.offset = raw.offset;
  out.subscribers = {};
  if (raw && raw.subscribers && typeof raw.subscribers === 'object' && !Array.isArray(raw.subscribers)) {
    for (const [id, sub] of Object.entries(raw.subscribers)) {
      if (!sub || typeof sub !== 'object') continue;
      out.subscribers[id] = normalizeSubscriber(sub);
    }
  }
  if (raw && Array.isArray(raw.listingsSeen)) {
    out.listingsSeen = raw.listingsSeen.filter((v) => Number.isInteger(v)).slice(-MAX_LISTINGS_SEEN);
  }
  if (raw && Number.isInteger(raw.lastEpoch) && raw.lastEpoch >= 0) out.lastEpoch = raw.lastEpoch;
  return out;
}

export function loadTgState(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return normalizeTgState(parsed);
  } catch {
    return { ...EMPTY_TG_STATE };
  }
}

export function saveTgState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

// Ensure a subscriber row exists; returns the row (mutates state).
export function upsertSubscriber(state, chatId, nowIso = new Date().toISOString()) {
  const key = String(chatId);
  if (!state.subscribers[key]) {
    state.subscribers[key] = { subscribedAt: nowIso, floorThreshold: null, floorArmedDown: false };
  }
  return state.subscribers[key];
}

// Set (or clear with null) the personal floor threshold. A fresh threshold is
// armed to detect a drop: an already-below floor alerts once on the next run,
// then disarms until the floor recovers at or above the threshold.
export function setFloorThreshold(state, chatId, threshold) {
  const sub = upsertSubscriber(state, chatId);
  const t = Number(threshold);
  sub.floorThreshold = Number.isFinite(t) && t > 0 ? t : null;
  sub.floorArmedDown = sub.floorThreshold !== null;
  return sub;
}

export function disableFloorAlert(state, chatId) {
  const sub = upsertSubscriber(state, chatId);
  sub.floorThreshold = null;
  sub.floorArmedDown = false;
  return sub;
}

// Record newly seen own-listing ids; returns the fresh ids (dedup by token id).
export function markListingsSeen(state, ids) {
  const seen = new Set(state.listingsSeen);
  const fresh = [];
  for (const id of ids) {
    if (!Number.isInteger(id) || seen.has(id)) continue;
    seen.add(id);
    fresh.push(id);
  }
  state.listingsSeen = [...state.listingsSeen, ...fresh].slice(-MAX_LISTINGS_SEEN);
  return fresh;
}

// Advance the recorded epoch; returns the previous epoch (or null).
export function advanceEpoch(state, epoch) {
  const prev = Number.isInteger(state.lastEpoch) ? state.lastEpoch : null;
  if (Number.isInteger(epoch) && epoch >= 0) state.lastEpoch = epoch;
  return prev;
}
