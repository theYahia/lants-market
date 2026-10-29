// Read-only data layer for the @sxsiant bot.
//
// One live source: the ecosystem market feed (parsed by the shared
// site/seaport-feed.mjs parser with includeNonFulfillable). It supplies the
// header context the bot still needs — floor ask, 24h average, active epoch and
// the listed count — for the epoch post and the weekly digest. Listing/trade
// events are deliberately NOT derived from this feed: the competitor's Seaport
// orders are theirs to post, and trades (Sold) and floor moves are no longer
// posted at all (see docs/twitter-content-plan.md "Removed post types").
//
// Our OWN marketplace listings (VexyMarketplace, the 1% seller fee) are read
// on-chain in bot/read-own-listings.mjs, now by the Telegram bot (bot/tg-run.mjs)
// rather than @sxsiant. An optional source supplies the closed-epoch emission
// for the epoch post only (see fetchEmission).

import { fetchSeaportMarket } from '../site/seaport-feed.mjs';

// Same live snapshot URLs the site header uses (market-view.mjs LIVE_URLS).
const SNAPSHOT_URLS = [
  'https://raw.githubusercontent.com/theYahia/lants-market/data/live.json',
  'https://ipfs.filebase.io/ipns/k51qzi5uqu5di86efhnadxw0k1sxnuo2tkcmegxcn2ra2r3exyfpv9htxhit6b/fixtures/snapshot-e23.live.json',
];

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function finiteNumber(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// Decimal/hex string, number or bigint -> BigInt; anything odd becomes 0n so a
// single malformed reward never aborts the whole emission sum.
function parseWei(v) {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? BigInt(Math.trunc(v)) : 0n;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return 0n;
    if (/^0x[0-9a-fA-F]+$/.test(s)) return BigInt(s);
    if (/^\d+$/.test(s)) return BigInt(s);
    const n = Number(s);
    return Number.isFinite(n) ? BigInt(Math.trunc(n)) : 0n;
  }
  return 0n;
}

async function getJson(fetchImpl, url, timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (controller) controller.abort();
      reject(new Error('timeout'));
    }, timeoutMs);
  });
  try {
    const request = fetchImpl(url, {
      signal: controller ? controller.signal : undefined,
      headers: { accept: 'application/json' },
    });
    const res = await Promise.race([request, timeout]);
    if (!res || res.ok !== true) return { ok: false, reason: 'http' };
    const json = await Promise.race([res.json(), timeout]);
    return { ok: true, json };
  } catch (e) {
    return { ok: false, reason: e && e.message === 'timeout' ? 'timeout' : 'network' };
  } finally {
    if (timer) clearTimeout(timer);
  }
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
    });
  }
  if (listedCount > 0 && listings.length === 0) return null;
  return {
    floorAsk: finiteNumber(feed.price?.floorAsk),
    avg24h: finiteNumber(feed.price?.avgPrice24h),
    epoch: Number.isInteger(feed.currentEpoch) ? feed.currentEpoch : null,
    listedCount,
    listings,
  };
}

// Sum of staking reward accrued in `epoch` across all snapshot positions = the
// ANTS emitted to stakers that epoch. Optional: only the epoch post uses it.
export async function fetchEmission({ fetchImpl = globalThis.fetch, timeoutMs = 20000, epoch } = {}) {
  if (!Number.isInteger(epoch) || epoch < 0) return { ok: false, reason: 'epoch' };
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'no-fetch' };
  for (const url of SNAPSHOT_URLS) {
    const res = await getJson(fetchImpl, url, timeoutMs);
    if (!res.ok) continue;
    const snap = res.json;
    const snapEpoch = Number(snap?.epoch);
    if (!Number.isFinite(snapEpoch) || snapEpoch < epoch) return { ok: false, reason: 'stale' };
    if (!Array.isArray(snap.positions)) return { ok: false, reason: 'schema' };
    const key = String(epoch);
    let sum = 0n;
    for (const pos of snap.positions) sum += parseWei(pos?.rewardByEpoch?.[key]);
    return { ok: true, ants: Number(sum) / 1e18, epoch, snapshotEpoch: snapEpoch };
  }
  return { ok: false, reason: 'network' };
}

// Compact state persisted between runs: just the active epoch. Listing/trade
// events are no longer derived from the feed (see docs/twitter-content-plan.md
// "Removed post types"), so there is no listing set to persist.
export function toState(curr) {
  return { epoch: curr.epoch };
}

/**
 * Fetch the market feed. A failure is fatal (ok:false): without the feed the
 * epoch and digest context is unavailable and the run must not advance.
 */
export async function readFeed({ fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const feed = await fetchSeaportMarket({ fetchImpl, timeoutMs, includeNonFulfillable: true });
  if (!feed.ok) return { ok: false, reason: feed.reason };
  const market = toMarket(feed);
  if (!market) return { ok: false, reason: 'market-shape' };
  return { ok: true, market };
}
