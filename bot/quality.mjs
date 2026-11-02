// Publication gate for @sxsiant. A post is bought (one paid X API call) only
// when it tells a story a buyer can act on: a link back to the market, a real
// number, a sentence (not an emoji-led data dump), inside the posting window,
// and only if its archetype's slot is free.
//
// Pure function: the caller passes the persisted slots and the clock.

import { familyDue, isFamily } from './state.mjs';

export const MAX_POST_LEN = 280; // must match xapi.mjs MAX_TWEET_LEN

// Publishing window: 14:00–17:00 UTC (morning US + evening EU). Outside it,
// events wait in the queue instead of posting into a dead hour.
export const WINDOW_START_HOUR_UTC = 14;
export const WINDOW_END_HOUR_UTC = 17;

export function isWindowOpen(nowMs) {
  const hour = new Date(nowMs).getUTCHours();
  return hour >= WINDOW_START_HOUR_UTC && hour < WINDOW_END_HOUR_UTC;
}

// A first line that is really a label — at most four words before a colon —
// is the ticker format the gate exists to stop ("AntSeed 24h: …"). A full
// sentence that happens to contain a colon ("Cheapest way into … today: …")
// is prose and passes.
const LABEL_OPENER = /^[^A-Za-z0-9]*[A-Za-z0-9'&-]*(?:\s+[A-Za-z0-9'&-]*){0,3}:\s/;

/**
 * @param {object} args
 * @param {string} args.text          final tweet text
 * @param {string} args.family        epoch | board | lot | network | edu
 * @param {object} [args.slots]       state.slots (family -> last publish ms)
 * @param {number} [args.nowMs]
 * @param {boolean} [args.windowOpen] isWindowOpen(nowMs), passed by the caller
 * @returns {{ok:boolean, reason:string|null}}
 */
export function gatePost({ text, family, slots = {}, nowMs = Date.now(), windowOpen = true } = {}) {
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, reason: 'empty' };
  const firstLine = text.split('\n')[0].trim();

  if (!text.includes('lants.eth.limo')) return { ok: false, reason: 'no-link' };
  if (!/\d/.test(text)) return { ok: false, reason: 'no-number' };
  // The story must open with a sentence: no leading emoji, no middle-dot dump,
  // no short "Label:" opener.
  if (!/^[A-Za-z0-9]/.test(firstLine)) return { ok: false, reason: 'first-line' };
  if (firstLine.includes('\u00b7')) return { ok: false, reason: 'first-line' };
  if (LABEL_OPENER.test(firstLine)) return { ok: false, reason: 'first-line' };
  if (text.length > MAX_POST_LEN) return { ok: false, reason: 'too-long' };
  if (!isFamily(family)) return { ok: false, reason: 'family' };
  if (!familyDue(slots, family, nowMs)) return { ok: false, reason: 'family-gap' };
  if (windowOpen !== true) return { ok: false, reason: 'window-closed' };
  return { ok: true, reason: null };
}
