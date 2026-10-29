// Pure alert logic for @lantsalerts_bot: floor threshold (one-shot), new
// listing (dedup by token id; our VexyMarketplace plus the competitor Seaport
// feed), epoch end (dedup by lastEpoch). No IO: takes the persisted state plus
// the current readers and returns the alerts to deliver and the next state to
// persist. The input state is never mutated.

import { markListingsSeen, advanceEpoch } from './tg-state.mjs';

// 4-decimal rounding (same as diff.mjs approxPrice): a flickering float never
// reads as a threshold crossing.
function approxPrice(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null;
}

function minPrice(listings) {
  let min = null;
  for (const l of listings || []) {
    const p = approxPrice(l.perAntUsd);
    if (p === null) continue;
    if (min === null || p < min) min = p;
  }
  return min;
}

function cloneState(state) {
  const subscribers = {};
  for (const [key, sub] of Object.entries(state.subscribers || {})) subscribers[key] = { ...sub };
  return {
    offset: state.offset,
    subscribers,
    listingsSeen: (state.listingsSeen || []).slice(),
    lastEpoch: state.lastEpoch,
    listingsBaselineDone: state.listingsBaselineDone === true,
  };
}

// own: array of live own listings, or null when the on-chain read failed.
// market: readFeed().market, or null when the feed is unavailable.
export function computeAlerts({ state, market, own }) {
  const next = cloneState(state);
  const alerts = [];

  // 1) New listings (broadcast). Two sources, deduped by token id: our own
  // VexyMarketplace listings (own) and the competitor Seaport feed
  // (market.listings). Both link to our position page, which can fill either
  // order. The first successful own-listing read is a silent baseline; every
  // later read alerts on ids that are new since then (an empty listingsSeen is
  // not a cold start, so the first listing after an empty baseline alerts).
  const seaport = market && Array.isArray(market.listings) ? market.listings : null;
  if (own !== null || seaport !== null) {
    const merged = [];
    const seenId = new Set();
    for (const l of [...(own || []), ...(seaport || [])]) {
      if (!l || !Number.isInteger(l.id) || seenId.has(l.id)) continue;
      seenId.add(l.id);
      merged.push(l);
    }
    const coldStart = next.listingsBaselineDone !== true;
    const freshIds = markListingsSeen(next, merged.map((l) => l.id));
    if (own !== null) next.listingsBaselineDone = true;
    if (!coldStart) {
      const floor = minPrice(merged);
      const fresh = new Set(freshIds);
      for (const lot of merged) {
        if (!fresh.has(lot.id)) continue;
        const price = approxPrice(lot.perAntUsd);
        const isFloor = price !== null && price === floor;
        alerts.push({ type: 'listing', lot, isFloor });
      }
    }
  }

  // 2) Epoch end (broadcast). The newly closed epoch is current - 1; a null
  // baseline records the current epoch without announcing a random close, and
  // an epoch regression (feed glitch) never resets the dedup cursor.
  if (market && Number.isInteger(market.epoch)) {
    const prev = Number.isInteger(next.lastEpoch) ? next.lastEpoch : null;
    if (prev === null) {
      advanceEpoch(next, market.epoch);
    } else if (market.epoch > prev) {
      alerts.push({ type: 'epoch', closedEpoch: market.epoch - 1 });
      advanceEpoch(next, market.epoch);
    }
  }

  // 3) Floor below a personal threshold (one-shot). When the floor drops below
  // the subscriber's price the alert fires once and the threshold is cleared
  // (the alert switches itself off); the subscriber arms it again by setting a
  // new price. A missing floor never fires: no false "floor dropped" on a feed
  // hiccup.
  if (market && Number.isFinite(market.floorAsk)) {
    const floor = approxPrice(market.floorAsk);
    if (floor !== null) {
      for (const [chatId, sub] of Object.entries(next.subscribers)) {
        if (!Number.isFinite(sub.floorThreshold)) continue;
        if (floor >= sub.floorThreshold) continue;
        alerts.push({ type: 'floor', chatId, floor, threshold: sub.floorThreshold });
        sub.floorThreshold = null;
        sub.floorArmedDown = false;
      }
    }
  }

  return { alerts, state: next };
}
