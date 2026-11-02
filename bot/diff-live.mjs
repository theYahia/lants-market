// Secondary triggers for the remaining archetypes: the market board (B) fires
// when a headline number moved, and the network story (D) fires once a real
// week-over-week comparison exists. Both are pure; run.mjs owns slots, windows
// and posting.
//
// Long-form post types of the previous version (settled 7d/30d, staked, usage,
// leaders, daily, diem, modality, video, lifetime, usagetarget, topmodels,
// countdown, alloc, epochstats, record7d) no longer emit anything: their data
// lives inside the epoch and board cards (docs/twitter-content-plan.md).

import { pct } from './format.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

// Two weeks of slack before a stored weekly baseline is too old to call a
// comparison "w/w"; past it the baseline is re-seeded instead of posting.
const MAX_BASELINE_AGE_MS = 2 * WEEK_MS;

// A floor move this small is noise, not a story.
export const BOARD_FLOOR_THRESHOLD = 0.02;

export function dateKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function changedBy(prevValue, currValue, threshold = 0.05) {
  return prevValue > 0 && currValue > 0 && Math.abs(currValue - prevValue) / prevValue >= threshold;
}

/**
 * Did a board headline number move enough to tell the story again?
 * Listing count and open bids are discrete: any change counts. Floor is
 * relative: ±2%.
 */
export function boardChanged(prevBoard, currBoard) {
  if (!prevBoard || !currBoard) return false;
  if (prevBoard.listedCount !== currBoard.listedCount) return true;
  if (prevBoard.offeredCount !== currBoard.offeredCount) return true;
  return changedBy(prevBoard.floorAsk, currBoard.floorAsk, BOARD_FLOOR_THRESHOLD);
}

function parseTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return Date.parse(value);
  return NaN;
}

/**
 * Network story candidate: only with a genuine week-over-week comparison.
 *
 * `prev.networkBaseline` is `{ at, settled7d }` — the settled 7d value observed
 * about a week ago. Without it the diff asks the caller to seed the baseline and
 * posts nothing; past two weeks it asks for a re-seed rather than quoting a
 * stale comparison.
 *
 * @returns {{event:(object|null), reseed:boolean}}
 */
export function diffNetwork(prev, curr, { nowMs = Date.now() } = {}) {
  const settled = curr ? curr.settled7d : null;
  const buyers = curr ? curr.buyers7d : null;
  const sellers = curr ? curr.sellers7d : null;
  if (!Number.isFinite(settled) || settled <= 0) return { event: null, reseed: false };
  if (!Number.isFinite(buyers) || !Number.isFinite(sellers)) return { event: null, reseed: false };

  const base = prev ? prev.networkBaseline : null;
  const baseAt = base ? parseTime(base.at) : NaN;
  if (!base || !Number.isFinite(baseAt) || !Number.isFinite(base.settled7d)) {
    return { event: null, reseed: true };
  }
  const age = nowMs - baseAt;
  if (!(age >= WEEK_MS)) return { event: null, reseed: false };
  if (age > MAX_BASELINE_AGE_MS) return { event: null, reseed: true };

  return {
    event: {
      type: 'network',
      family: 'network',
      key: `network:${dateKey(nowMs)}`,
      data: {
        buyers,
        sellers,
        settled7d: settled,
        pctChange: pct(base.settled7d, settled),
      },
    },
    reseed: false,
  };
}
