// Persistent state of the alert bot: what was already posted, when the rebate
// watch last ran. One JSON file on a volume, written atomically (tmp + rename)
// so a kill mid-write never leaves a truncated file behind.

import fs from 'node:fs';
import path from 'node:path';

// v2 adds the Seaport feed to the new-listing alerts, so a v1 state must run one
// silent baseline (it never saw those lots) instead of announcing them all.
export const STATE_VERSION = 2;

export function defaultState() {
  return {
    version: STATE_VERSION,
    epochPost: null, // epoch number of the last "epoch ended" post
    rebates: {}, // "<epoch>-<pool>" -> { open: bool, warn48: bool }
    lastRebateCheck: 0, // epoch ms of the last successful rebate watch run
    welcomeMessageId: null, // message_id of the pinned welcome post
    welcomePinned: null, // message_id the welcome post is confirmed pinned as
    welcomeTextHash: null, // sha256 prefix of the welcome text last applied
    // Telegram DM layer (commands + personal alerts).
    offset: 0, // getUpdates offset
    subscribers: {}, // chat_id -> { subscribedAt, floorThreshold, floorArmedDown }
    listingsSeen: [], // token ids already announced as new own listings
    lastEpoch: null, // last epoch seen for the DM "epoch ended" alert
    // Set after the first successful own-listing read. Until then that first
    // read is a silent baseline; afterwards any new listing id alerts.
    listingsBaselineDone: false
  };
}

export function loadState(file) {
  let raw = null;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch {
    return defaultState();
  }
  try {
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (!parsed || typeof parsed !== 'object') return defaultState();
    const base = defaultState();
    const parsedVersion = Number.isInteger(parsed.version) ? parsed.version : 0;
    return {
      ...base,
      ...parsed,
      version: STATE_VERSION,
      rebates:
        parsed.rebates && typeof parsed.rebates === 'object' ? parsed.rebates : {},
      subscribers:
        parsed.subscribers && typeof parsed.subscribers === 'object' && !Array.isArray(parsed.subscribers)
          ? parsed.subscribers
          : {},
      listingsSeen: Array.isArray(parsed.listingsSeen) ? parsed.listingsSeen : [],
      // Only a state written by this version has a complete baseline (own +
      // Seaport lots). Anything older re-baselines silently once, so the first
      // run after the upgrade does not burst existing listings to subscribers.
      listingsBaselineDone:
        parsedVersion === STATE_VERSION && parsed.listingsBaselineDone === true,
      lastEpoch: Number.isInteger(parsed.lastEpoch) ? parsed.lastEpoch : base.lastEpoch,
      offset: Number.isInteger(parsed.offset) && parsed.offset >= 0 ? parsed.offset : base.offset
    };
  } catch {
    return defaultState();
  }
}

export function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export function rebateKey(epoch, pool) {
  return `${epoch}-${pool}`;
}
