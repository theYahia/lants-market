// site/market-volume.mjs
// All-time USDC volume from the competitor's public trades feed, summed over
// every page. Read-only; extends the native marketplace's all-time volume tile.
// Pure fetch + math, no DOM.

const TRADES_URL = 'https://antseedmarkets.com/api/lants/trades';

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
    const request = fetchImpl(url, { signal: controller ? controller.signal : undefined });
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

/**
 * Sum the USDC-denominated trades of the competitor feed into an all-time USD
 * figure. Non-USDC trades and malformed prices are skipped.
 *
 * @param {Object} [opts]
 * @param {Function} [opts.fetchImpl] - fetch-compatible function (defaults to fetch).
 * @param {number} [opts.timeoutMs=8000] - per-page wall-clock cap.
 * @param {number} [opts.pageSize=100] - page size for the API.
 * @returns {Promise<{ok:true, usd:number, tradeCount:number}|{ok:false, reason:string}>}
 */
export async function fetchAllTimeUsdcVolume({ fetchImpl = fetch, timeoutMs = 8000, pageSize = 100 } = {}) {
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'no-fetch' };

  let usd = 0;
  let tradeCount = 0;
  let apiTotal = null;
  let page = 1;
  while (page <= 1000) {
    const res = await fetchJson(fetchImpl, `${TRADES_URL}?page=${page}&pageSize=${pageSize}`, timeoutMs);
    if (!res.ok) return { ok: false, reason: res.reason };

    const json = res.json;
    if (!Array.isArray(json.trades)) return { ok: false, reason: 'schema' };
    if (Number.isInteger(json.total)) apiTotal = json.total;

    for (const t of json.trades) {
      if (!t || t.currency !== 'USDC') continue;
      const priceWei = Number(t.priceWei);
      if (!Number.isFinite(priceWei) || priceWei <= 0) continue;
      usd += priceWei / 1e6; // priceWei is in micro-USDC
      tradeCount += 1;
    }

    if (json.trades.length < pageSize) break;
    if (apiTotal != null && tradeCount >= apiTotal) break;
    page += 1;
  }

  return { ok: true, usd, tradeCount };
}
