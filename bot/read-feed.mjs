// Read-only data layer for the @sxsiant bot.
//
// Two live sources (plan section 5): the competitor market feed and its trade
// history. The market feed is parsed by the shared site/seaport-feed.mjs parser
// (D5) with includeNonFulfillable, so the bot sees every priced listing, not
// just the lots this site can execute. A third, optional source supplies the
// closed-epoch emission for the epoch post only (see fetchEmission).

import { fetchSeaportMarket, SEAPORT_MARKET_ORIGIN } from '../site/seaport-feed.mjs';

const TRADES_PATH = '/api/lants/trades';
const MAX_TRADE_PAGES = 5;

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

// One trade -> normalized sale, or null when it cannot be reported honestly.
// Only USDC fills are reported: priceWei is atomic USDC (6 decimals) and the
// tweet template quotes USDC. ETH/WETH offers have no ANTS amount to show.
export function normalizeTrade(raw) {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id === '') return null;
  if (!Number.isInteger(raw.tokenId) || raw.tokenId < 0) return null;
  const currency = typeof raw.currency === 'string' ? raw.currency.toUpperCase() : null;
  if (currency !== 'USDC') return null;
  const amount = finiteNumber(raw.amount);
  if (!(amount > 0)) return null;
  const priceWei = parseWei(raw.priceWei);
  if (priceWei <= 0n) return null;
  const usdTotal = Number(priceWei) / 1e6;
  if (!(usdTotal > 0)) return null;
  const tradeType = raw.tradeType === 'listing' || raw.tradeType === 'offer' ? raw.tradeType : null;
  if (tradeType === null) return null;
  return {
    id: raw.id,
    tokenId: raw.tokenId,
    amount,
    usdTotal,
    perAntUsd: usdTotal / amount,
    tradeType,
    currency,
  };
}

export function parseTrades(json) {
  if (!isObject(json) || !Array.isArray(json.trades)) return { ok: false, reason: 'schema' };
  const trades = [];
  for (const raw of json.trades) {
    const t = normalizeTrade(raw);
    if (t) trades.push(t);
  }
  return { ok: true, trades };
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

export async function fetchTrades({ fetchImpl = globalThis.fetch, timeoutMs = 8000, pageSize = 100 } = {}) {
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'no-fetch' };
  const seen = new Set();
  const rawSeen = new Set();
  const trades = [];
  for (let page = 1; page <= MAX_TRADE_PAGES; page += 1) {
    const url = `${SEAPORT_MARKET_ORIGIN}${TRADES_PATH}?page=${page}&pageSize=${pageSize}`;
    const res = await getJson(fetchImpl, url, timeoutMs);
    if (!res.ok) return { ok: false, reason: res.reason };
    const parsed = parseTrades(res.json);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    for (const t of parsed.trades) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      trades.push(t);
    }
    // Count every raw trade id (kept or dropped) so pagination is driven by the
    // feed's real totals, not by how many USDC fills survived normalization.
    for (const raw of res.json.trades) {
      if (raw && typeof raw.id === 'string') rawSeen.add(raw.id);
    }
    const total = Number.isInteger(res.json.total) ? res.json.total : null;
    const reachedTotal = total !== null && rawSeen.size >= total;
    if (reachedTotal || res.json.trades.length < pageSize) break;
  }
  return { ok: true, trades };
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

// Compact state persisted between runs (ids + price; curr carries full objects).
// When the trades feed was down, keep the previously known ids instead of
// resetting to [] (otherwise the next successful run reposts the whole history).
export function toState(feed, prevTradeIds = null) {
  const tradeIds = feed.trades == null
    ? (Array.isArray(prevTradeIds) ? prevTradeIds : [])
    : feed.trades.map((t) => t.id);
  return {
    floorAsk: feed.market.floorAsk,
    avg24h: feed.market.avg24h,
    epoch: feed.market.epoch,
    listings: feed.market.listings.map((l) => ({ id: l.id, perAntUsd: l.perAntUsd })),
    tradeIds,
  };
}

/**
 * Fetch both feeds. Market feed failure is fatal (ok:false) per plan section 8;
 * a trades failure only drops trade posts.
 */
export async function readFeed({ fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const feed = await fetchSeaportMarket({ fetchImpl, timeoutMs, includeNonFulfillable: true });
  if (!feed.ok) return { ok: false, reason: feed.reason };
  const market = toMarket(feed);
  if (!market) return { ok: false, reason: 'market-shape' };
  const tradesRes = await fetchTrades({ fetchImpl, timeoutMs });
  if (!tradesRes.ok) return { ok: true, market, trades: null, tradesReason: tradesRes.reason };
  return { ok: true, market, trades: tradesRes.trades };
}
