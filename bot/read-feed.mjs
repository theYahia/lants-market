// Read-only data layer for the @sxsiant bot.
//
// One live source: the ecosystem market feed (parsed by the shared
// site/seaport-feed.mjs parser with includeNonFulfillable). It supplies the
// context the bot needs — floor ask, 24h average, active epoch, listed/total
// positions, open bids and ANTS supply — for the market board and the lot
// highlight. Listing/trade events are deliberately NOT derived from this feed:
// the competitor's Seaport orders are theirs to post, and trades (Sold) and
// floor moves are no longer posted at all (see docs/twitter-content-plan.md
// "Removed post types").
//
// Our OWN marketplace listings (VexyMarketplace, the 1% seller fee) are read
// on-chain in bot/read-own-listings.mjs, now by the Telegram bot (bot/tg-run.mjs)
// rather than @sxsiant. The position snapshot lives in bot/read-snapshot.mjs.

import { fetchSeaportMarket } from '../site/seaport-feed.mjs';

// Re-exported so existing callers of read-feed keep working (the loader moved
// to read-snapshot.mjs when the epoch post started using full positions).
export { fetchEmission } from './read-snapshot.mjs';

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function finiteNumber(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// Market feed -> typed bot state. Floor and 24h average may be null (empty
// market), but the shape must be sane: a bad shape fails the run instead of
// feeding the diff a misleading snapshot.
export function toMarket(feed) {
  if (!isObject(feed) || !Array.isArray(feed.items)) return null;
  const listedCount = Number.isInteger(feed.listedCount) ? feed.listedCount : null;
  if (listedCount === null || listedCount < 0) return null;
  const listings = [];
  for (const it of feed.items) {
    const amount = finiteNumber(it.amount);
    const perAntUsd = finiteNumber(it.perAntUsd);
    if (!(amount > 0) || !(perAntUsd > 0)) continue;
    if (!Number.isInteger(it.id)) continue;
    listings.push({
      id: it.id,
      amount,
      lockDays: finiteNumber(it.lockDays),
      perAntUsd,
      usd: finiteNumber(it.priceUsdc),
      sellerName: typeof it.sellerName === 'string' ? it.sellerName : null,
      agentId: Number.isInteger(it.agentId) ? it.agentId : null,
    });
  }
  if (listedCount > 0 && listings.length === 0) return null;
  return {
    floorAsk: finiteNumber(feed.price?.floorAsk),
    avg24h: finiteNumber(feed.price?.avgPrice24h),
    epoch: Number.isInteger(feed.currentEpoch) ? feed.currentEpoch : null,
    listedCount,
    // `totalNfts` is the live position count (LISTED/SUPPLY denominator);
    // `offeredCount` is how many of those have an open bid; `antsTotalSupply`
    // is ANTS minted, which prices implied MC. Never substitute ask VWAP here.
    totalNfts: finiteNumber(feed.totalNfts),
    offeredCount: Number.isInteger(feed.offeredCount) ? feed.offeredCount : null,
    antsTotalSupply: finiteNumber(feed.antsTotalSupply),
    minted: finiteNumber(feed.minted) ?? finiteNumber(feed.antsTotalSupply),
    listings,
  };
}

// Compact state persisted between runs: just the active epoch. Listing/trade
// events are no longer derived from the feed (see docs/twitter-content-plan.md
// "Removed post types"), so there is no listing set to persist.
export function toState(curr) {
  return { epoch: curr.epoch };
}

/**
 * Fetch the market feed. A failure is fatal (ok:false): without the feed the
 * board, the lot highlight and the epoch advance are all unavailable, so the
 * run must not advance.
 */
export async function readFeed({ fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const feed = await fetchSeaportMarket({ fetchImpl, timeoutMs, includeNonFulfillable: true });
  if (!feed.ok) return { ok: false, reason: feed.reason };
  const market = toMarket(feed);
  if (!market) return { ok: false, reason: 'market-shape' };
  return { ok: true, market };
}
