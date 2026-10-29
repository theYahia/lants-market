// Seaport listing feed of the ecosystem front (antseedmarkets.com).
// Read-only aggregation: the feed is the only discovery source for Seaport
// orders (they are signed off-chain), so a failure is a hard failure and the
// caller hides Seaport lots. Pure parsing lives in parseSeaportMarket(); the
// network call is a thin paginator around it.

export const SEAPORT_MARKET_ORIGIN = 'https://antseedmarkets.com';
export const SEAPORT_MARKET_PATH = '/api/lants-market';

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGES = 20;

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function finiteNumber(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// One feed item -> normalized lot, or null when it cannot be executed from
// this site. The feed's mcUsd/fdvUsd are deliberately ignored: we recompute
// implied values from the ask and the position amount.
export function normalizeSeaportItem(item, { includeNonFulfillable = false } = {}) {
  if (!isObject(item)) return null;
  if (item.listed !== true) return null;
  // The storefront only wants lots it can fill itself; the data consumer (bot)
  // wants every priced listing, whether or not this site can execute it.
  if (!includeNonFulfillable && item.fulfillableHere !== true) return null;
  if (!Number.isInteger(item.id) || item.id < 0) return null;
  if (!isObject(item.listing)) return null;
  const priceUsdc = finiteNumber(item.listing.usd);
  if (priceUsdc === null || !(priceUsdc > 0)) return null;
  const amount = finiteNumber(item.amount);
  const agentId = Number.isInteger(item.agentId) ? item.agentId : null;
  const perAntUsd = finiteNumber(item.listing.perAntUsd)
    ?? (amount > 0 ? priceUsdc / amount : null);
  return {
    id: item.id,
    agentId,
    sellerName: typeof item.sellerName === 'string' ? item.sellerName : null,
    owner: typeof item.owner === 'string' ? item.owner.toLowerCase() : null,
    amount: amount !== null && amount > 0 ? amount : null,
    priceUsdc,
    listed: true,
    fulfillableHere: item.fulfillableHere === true,
    lockDays: finiteNumber(item.lockDays),
    perAntUsd,
    stakeStartEpoch: finiteNumber(item.stakeStartEpoch),
    stakeEndEpoch: finiteNumber(item.stakeEndEpoch),
    epochYield: isObject(item.epochYield)
      ? {
          rewardAnts: finiteNumber(item.epochYield.rewardAnts),
          apr: finiteNumber(item.epochYield.apr),
        }
      : null,
  };
}

// Parse one API page. A missing/renamed shape fails the whole feed instead of
// rendering a misleading partial market; individual bad lots are dropped.
export function parseSeaportMarket(json, { includeNonFulfillable = false } = {}) {
  if (!isObject(json)) return { ok: false, reason: 'schema' };
  if (!Array.isArray(json.items)) return { ok: false, reason: 'schema' };

  const listedCount = Number.isInteger(json.listedCount) ? json.listedCount : null;
  if (listedCount === null || listedCount < 0) return { ok: false, reason: 'schema' };

  const items = [];
  let dropped = 0;
  for (const raw of json.items) {
    const item = normalizeSeaportItem(raw, { includeNonFulfillable });
    if (item) items.push(item);
    else dropped += 1;
  }

  const price = isObject(json.price)
    ? {
        avgPrice24h: finiteNumber(json.price.avgPrice24h),
        floorAsk: finiteNumber(json.price.floorAsk),
        lastPrice: finiteNumber(json.price.lastPrice),
      }
    : { avgPrice24h: null, floorAsk: null, lastPrice: null };

  return {
    ok: true,
    listedCount,
    items,
    dropped,
    price,
    fetchedAt: finiteNumber(json.fetchedAt),
    totalNfts: finiteNumber(json.totalNfts),
    offeredCount: Number.isInteger(json.offeredCount) ? json.offeredCount : null,
    currentEpoch: Number.isInteger(json.currentEpoch) ? json.currentEpoch : null,
    antsTotalSupply: finiteNumber(json.antsTotalSupply),
  };
}

// Fetch one JSON page with a wall-clock cap. AbortController is used when the
// caller passed a real fetch; the race also covers mock fetches in tests.
async function fetchJson(fetchImpl, url, timeoutMs) {
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

function pageUrl(page, pageSize) {
  return `${SEAPORT_MARKET_ORIGIN}${SEAPORT_MARKET_PATH}?page=${page}&pageSize=${pageSize}&sort=listedFirst`;
}

/**
 * Read the whole active-listing feed.
 *
 * @returns {Promise<{ok:true, items:Array, price:Object, fetchedAt:number, listedCount:number} |
 *                   {ok:false, reason:string}>}
 */
export async function fetchSeaportMarket({ fetchImpl = globalThis.fetch, timeoutMs = 8000, pageSize = DEFAULT_PAGE_SIZE, includeNonFulfillable = false } = {}) {
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'no-fetch' };

  const seen = new Set();
  const items = [];
  let listedCount = null;
  let price = { avgPrice24h: null, floorAsk: null, lastPrice: null };
  let fetchedAt = null;
  let totalNfts = null;
  let offeredCount = null;
  let currentEpoch = null;
  let antsTotalSupply = null;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await fetchJson(fetchImpl, pageUrl(page, pageSize), timeoutMs);
    if (!res.ok) return { ok: false, reason: res.reason };

    const parsed = parseSeaportMarket(res.json, { includeNonFulfillable });
    if (!parsed.ok) return { ok: false, reason: parsed.reason };

    if (listedCount === null) {
      listedCount = parsed.listedCount;
      price = parsed.price;
      fetchedAt = parsed.fetchedAt;
      totalNfts = parsed.totalNfts;
      offeredCount = parsed.offeredCount;
      currentEpoch = parsed.currentEpoch;
      antsTotalSupply = parsed.antsTotalSupply;
    }

    for (const item of parsed.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }

    const rawCount = res.json.items.length;
    if (items.length >= listedCount || rawCount < pageSize) break;
  }

  if (listedCount > 0 && items.length === 0) return { ok: false, reason: 'no-valid-items' };

  return {
    ok: true,
    items,
    price,
    fetchedAt: fetchedAt ?? Date.now(),
    listedCount,
    totalNfts,
    offeredCount,
    currentEpoch,
    antsTotalSupply,
  };
}
