// Pure change-only diff: previous feed state + current feed state -> posts.
// Dedup keys follow plan section 6:
//   listing -> (token id + listed flag)
//   epoch   -> (closed epoch number)
// antseedstats types (diffAntseedStats):
//   burn -> (epoch), settled -> (window + value), staked -> (value),
//   epochstats -> (epoch)
// No IO here; state.mjs applies the persisted dedup/queue.

import { newListingText, newFloorListingText, delistText, epochText, burnText, settledText, stakedText, epochStatsText, recordText, usageText, countdownText, allocText, topModelsText, pct } from './format.mjs';
import { maxCompletedEpoch } from './read-antseedstats.mjs';

// Top-models post is gated off until the models first-page sort semantics are
// verified against the glossary (open question 1 in the plan). Flip to true
// only after confirming `usage` windowing; until then curr.topModels stays null.
const TOP_MODELS_ENABLED = false;
const TOP_MODELS_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// Prices are keyed at 4-decimal precision: the feed's floats flicker at the
// last digit (0.1399999993 vs 0.14) and a raw key would spray fake relists.
function approxPrice(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null;
}

// Normalize the persisted listing list — new shape {id, perAntUsd}, legacy
// plain ids — into Map<id, approxPrice|null>.
function listingMap(listings) {
  const map = new Map();
  for (const l of listings || []) {
    if (l && typeof l === 'object') map.set(String(l.id), approxPrice(l.perAntUsd));
    else map.set(String(l), null);
  }
  return map;
}

// Continuous antseedstats metrics post only past this relative change, so a
// run never spams one tweet per drifting number (handoff: "record / ±5%").
const CHANGE_THRESHOLD = 0.05;

function changedBy(prevValue, currValue) {
  return prevValue > 0 && currValue > 0 && Math.abs(currValue - prevValue) / prevValue >= CHANGE_THRESHOLD;
}

// Lowest approx price among a listing map's values, or null when empty/unknown.
function minPrice(map) {
  let min = null;
  for (const v of map.values()) {
    if (v === null) continue;
    if (min === null || v < min) min = v;
  }
  return min;
}

/**
 * Change-only diff over our OWN marketplace listings (see read-own-listings.mjs).
 *
 * @param {object|null} prev  { epoch, listings:[{id,perAntUsd}|id] }
 * @param {object} curr       { avg24h, epoch, listings:[lot] }
 * @param {{emission?:(number|null), restakeBonusPct?:(number|null)}} opts
 * @returns {Array<{type:string,key:string,text:string}>}
 */
export function diffFeed(prev, curr, { emission = null, restakeBonusPct = null } = {}) {
  const events = [];
  // No baseline yet: a first run records state only, it does not announce the
  // whole current market as "new".
  if (!prev || !curr) return events;
  const p = prev;

  const prevMap = listingMap(p.listings);
  const currMap = listingMap(curr.listings || []);
  const prevFloor = minPrice(prevMap);
  const currFloor = minPrice(currMap);

  // Brand-new lots, and the single deepest one that undercuts the previous
  // floor. Two new lots in one run must not both claim "New floor listing":
  // only the lowest one actually sets the floor, the rest are plain listings.
  const newLots = [];
  for (const lot of curr.listings || []) {
    const id = String(lot.id);
    if (prevMap.has(id)) continue;
    newLots.push({ id, price: approxPrice(lot.perAntUsd) });
  }
  let floorLotId = null;
  let floorPrice = null;
  for (const n of newLots) {
    if (n.price === null) continue;
    const setsNewFloor = prevFloor === null ? n.price === currFloor : n.price < prevFloor;
    if (!setsNewFloor) continue;
    if (floorPrice === null || n.price < floorPrice) {
      floorPrice = n.price;
      floorLotId = n.id;
    }
  }

  for (const lot of curr.listings || []) {
    const id = String(lot.id);
    const keyPrice = approxPrice(lot.perAntUsd);
    const prevPrice = prevMap.has(id) ? approxPrice(prevMap.get(id)) : undefined;
    if (prevPrice === undefined) {
      const setsNewFloor = id === floorLotId;
      events.push({
        type: setsNewFloor ? 'floor-listing' : 'listing',
        key: `listing:${id}:listed:${keyPrice}`,
        text: setsNewFloor ? newFloorListingText(lot) : newListingText(lot),
      });
    } else if (prevPrice !== null && keyPrice !== null && prevPrice !== keyPrice) {
      // Relisted at a new price: the old key is unlisted, the new key listed,
      // so a price change is never swallowed by the id-only diff.
      events.push({
        type: 'delist',
        key: `listing:${id}:unlisted:${prevPrice}`,
        text: delistText(id),
      });
      events.push({
        type: 'listing',
        key: `listing:${id}:listed:${keyPrice}`,
        text: newListingText(lot),
      });
    }
  }

  // Delists: an own listing that disappeared (sold, cancelled or expired).
  for (const id of prevMap.keys()) {
    if (currMap.has(id)) continue;
    const prevPrice = approxPrice(prevMap.get(id));
    const key = prevPrice === null ? `listing:${id}:unlisted` : `listing:${id}:unlisted:${prevPrice}`;
    events.push({ type: 'delist', key, text: delistText(id) });
  }

  if (p.epoch != null && curr.epoch != null && curr.epoch > p.epoch) {
    const closed = curr.epoch - 1;
    events.push({
      type: 'epoch',
      key: `epoch:${closed}`,
      text: epochText(closed, emission, curr.avg24h, { restakeBonusPct }),
    });
  }

  return events;
}

/**
 * antseedstats.com change-only diff. Discrete events (burn, enriched epoch
 * close) post as soon as they appear; continuous ones (settled 7d/30d, staked)
 * post past a ±5% move from the last POSTED value (prev.posted) — never from
 * the last run, so a failed post cannot swallow a real move. The 24h window is
 * kept in the snapshot but never posted. A new settled7d all-time high always
 * posts (record key), independently of the ±5% threshold. prev is the compact
 * persisted state (toAntseedState shape); curr is the full snapshot.
 * @param {object|null} prev  toAntseedState shape
 * @param {object|null} curr  toAntseedSnapshot shape
 * @param {{nowMs?:number, topModelsEnabled?:boolean}} opts
 * @returns {Array<{type:string,key:string,text:string,meta?:{field:string,value:number}}>}
 */
export function diffAntseedStats(prev, curr, opts = {}) {
  if (!prev || !curr) return [];
  const nowMs = opts.nowMs ?? Date.now();
  const topModelsEnabled = opts.topModelsEnabled ?? TOP_MODELS_ENABLED;
  const events = [];

  const prevBurns = new Set((prev.burns || []).map((b) => String(b.epoch)));
  for (const b of curr.burns || []) {
    if (prevBurns.has(String(b.epoch))) continue;
    events.push({
      type: 'burn',
      key: `burn:${b.epoch}`,
      text: burnText(b, curr.burnedAnts),
      meta: { field: null, value: null },
    });
  }

  // Continuous baseline: the last POSTED values. A state without `posted` is
  // seeded from the current snapshot so the upgrade run never announces a move
  // from an unknown baseline.
  const posted = prev.posted ?? {
    settled7d: curr.settled7d,
    settled30d: curr.settled30d,
    stakedAnts: curr.stakedAnts,
    requests24h: curr.requests24h,
  };

  // All-time high of settled7d posts regardless of ±5%. When a record fires it
  // already announces the new value, so the plain 7d settled post is skipped in
  // the same run (never post the same number twice).
  const max7d = prev.max7d ?? curr.settled7d;
  const record7dDue = curr.settled7d > max7d;

  for (const [field, label, settlesField, sellersField, buyersField] of [
    ['settled7d', '7d', 'settles7d', 'sellers7d', 'buyers7d'],
    ['settled30d', '30d', 'settles30d', 'sellers30d', 'buyers30d'],
  ]) {
    if (field === 'settled7d' && record7dDue) continue;
    if (!changedBy(posted[field], curr[field])) continue;
    events.push({
      type: 'settled',
      field,
      value: curr[field],
      key: `settled:${field}:${curr[field]}`,
      text: settledText(label, curr[field], pct(posted[field], curr[field]), curr[settlesField], curr[sellersField], curr[buyersField]),
      meta: { field, value: curr[field] },
    });
  }

  if (changedBy(posted.stakedAnts, curr.stakedAnts)) {
    events.push({
      type: 'staked',
      field: 'stakedAnts',
      value: curr.stakedAnts,
      key: `staked:${curr.stakedAnts}`,
      text: stakedText(curr.stakedAnts, pct(posted.stakedAnts, curr.stakedAnts), curr.stakedPct),
      meta: { field: 'stakedAnts', value: curr.stakedAnts },
    });
  }

  // 24h network usage (requests) posts past a ±5% move from the last POSTED
  // value, rounded to 1000 requests for a stable dedup key.
  if (changedBy(posted.requests24h, curr.requests24h)) {
    events.push({
      type: 'usage',
      field: 'requests24h',
      value: curr.requests24h,
      key: `usage:${Math.round(curr.requests24h / 1000) * 1000}`,
      text: usageText({ requests: curr.requests24h, tokens: curr.tokens24h, videos: curr.videos24h, coverage: curr.coverage24h }),
      meta: { field: 'requests24h', value: curr.requests24h },
    });
  }

  // Epoch countdown: once per epoch per bucket (6h, 1h), keyed by the epoch.
  const secondsLeft = curr.secondsLeft;
  const bucket = Number.isFinite(secondsLeft)
    ? (secondsLeft <= 3600 ? '1h' : secondsLeft <= 21600 ? '6h' : null)
    : null;
  if (bucket && Number.isInteger(curr.epoch)) {
    const last = prev.countdownPosted ? prev.countdownPosted[String(curr.epoch)] : null;
    const rank = { '6h': 1, '1h': 2 };
    if (!last || rank[bucket] > (rank[last] || 0)) {
      events.push({
        type: 'countdown',
        key: `countdown:${curr.epoch}:${bucket}`,
        text: countdownText({
          epoch: curr.epoch,
          hoursLeft: Math.max(1, Math.round(secondsLeft / 3600)),
          bonusPct: curr.restakeBonusPct,
        }),
        meta: { field: 'countdown', value: { epoch: curr.epoch, bucket } },
      });
    }
  }

  // Top models, weekly, gated off until the models sort semantics are verified.
  if (topModelsEnabled && Array.isArray(curr.topModels) && curr.topModels.length > 0) {
    const last = prev.lastTopModelsAt;
    if (!last || nowMs - last >= TOP_MODELS_INTERVAL_MS) {
      events.push({
        type: 'topmodels',
        key: `topmodels:${new Date(nowMs).toISOString().slice(0, 10)}`,
        text: topModelsText({ models: curr.topModels }),
        meta: { field: 'lastTopModelsAt', value: nowMs },
      });
    }
  }

  // All-time high of settled7d (see record7dDue above). Rounded to $100 for a
  // stable dedup key across runs.
  if (record7dDue) {
    events.push({
      type: 'record7d',
      field: 'max7d',
      value: curr.settled7d,
      key: `record7d:${Math.round(curr.settled7d / 100) * 100}`,
      text: recordText(curr.settled7d),
      meta: { field: 'max7d', value: curr.settled7d },
    });
  }

  const currMax = maxCompletedEpoch(curr.epochs || []);
  const prevMax = prev.maxCompletedEpoch || 0;
  if (currMax > prevMax) {
    for (const e of curr.epochs || []) {
      if (e.status === 'complete' && e.epoch > prevMax) {
        events.push({ type: 'epochstats', key: `epochstats:${e.epoch}`, text: epochStatsText(e) });
      }
    }
    const detail = curr.epochDetail;
    if (detail && detail.epoch === currMax && Array.isArray(detail.economics?.buckets) && detail.economics.buckets.length > 0) {
      events.push({ type: 'alloc', key: `alloc:${currMax}`, text: allocText({ epoch: currMax, buckets: detail.economics.buckets }) });
    }
  }

  return events;
}
