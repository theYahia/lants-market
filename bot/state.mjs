// Persistent state of the alert bot: what was already posted, when the rebate
// watch last ran. One JSON file on a volume, written atomically (tmp + rename)
// so a kill mid-write never leaves a truncated file behind.

import fs from 'node:fs';
import path from 'node:path';

export const STATE_VERSION = 1;

export function defaultState() {
  return {
    version: STATE_VERSION,
    epochPost: null, // epoch number of the last "epoch ended" post
    rebates: {}, // "<epoch>-<pool>" -> { open: bool, warn48: bool }
    lastRebateCheck: 0, // epoch ms of the last successful rebate watch run
    welcomeMessageId: null, // message_id of the pinned welcome post
    welcomePinned: null, // message_id the welcome post is confirmed pinned as
    welcomeTextHash: null // sha256 prefix of the welcome text last applied
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
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultState();
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      rebates:
        parsed.rebates && typeof parsed.rebates === 'object' ? parsed.rebates : {}
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
