// Read-only reader for the antseedstats.com public API (handoff "NEXT" step 1).
//
// Free, keyless, 60 req/min, CC BY 4.0 -> every posted number carries the
// "data: antseedstats.com" attribution. This module is a soft dependency:
// a failure here only drops antseedstats posts, never the market-feed posts.

export const ANTSEEDSTATS_ORIGIN = 'https://antseedstats.com';

const ENDPOINTS = {
  summary: '/api/v1/network/summary',
  supply: '/api/v1/ants/supply',
  staking: '/api/v1/staking/pools',
  epochs: '/api/v1/epochs',
  models: '/api/v1/models',
  prices: '/api/v1/prices',
};

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isInt(v) {
  return typeof v === 'number' && Number.isInteger(v);
}

// Number or numeric string -> number; anything odd becomes null so a single
// malformed value never aborts the whole section.
function finiteNumber(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
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

async function getSection(fetchImpl, path, timeoutMs, parse) {
  const res = await getJson(fetchImpl, `${ANTSEEDSTATS_ORIGIN}${path}`, timeoutMs);
  if (!res.ok) return { ok: false, reason: res.reason };
  return parse(res.json);
}

export function parseNetworkSummary(json) {
  if (!isObject(json) || !isObject(json.data)) return { ok: false, reason: 'schema' };
  const windows = isObject(json.data.windows) ? json.data.windows : null;
  const epoch = isObject(json.data.epoch) && isInt(json.data.epoch.number) ? json.data.epoch.number : null;
  if (windows === null || epoch === null) return { ok: false, reason: 'schema' };
  const usd = (key) => (isObject(windows[key]) ? finiteNumber(windows[key].settled_usd) : null);
  const count = (key, field) => (isObject(windows[key]) ? finiteNumber(windows[key][field]) : null);
  return {
    ok: true,
    network: {
      settled24h: usd('24h'),
      settled7d: usd('7d'),
      settled30d: usd('30d'),
      settles24h: count('24h', 'settles'),
      settles7d: count('7d', 'settles'),
      settles30d: count('30d', 'settles'),
      sellers24h: count('24h', 'sellers'),
      sellers7d: count('7d', 'sellers'),
      sellers30d: count('30d', 'sellers'),
      epoch,
    },
  };
}

export function parseSupply(json) {
  if (!isObject(json) || !isObject(json.data) || !Array.isArray(json.data.burns)) {
    return { ok: false, reason: 'schema' };
  }
  const d = json.data;
  const partition = isObject(d.partition) ? d.partition : null;
  const burns = [];
  for (const b of d.burns) {
    if (!isObject(b) || !isInt(b.epoch)) continue;
    const ants = finiteNumber(b.ants);
    if (!(ants > 0)) continue;
    burns.push({ epoch: b.epoch, ants });
  }
  burns.sort((a, b) => a.epoch - b.epoch);
  return {
    ok: true,
    supply: {
      totalSupplyAnts: finiteNumber(d.total_supply_ants),
      burnedAnts: finiteNumber(d.burned_ants),
      stakedAnts: partition ? finiteNumber(partition.staked_ants) : null,
      stakedPct: partition ? finiteNumber(partition.staked_pct) : null,
      burns,
    },
  };
}

export function parseStaking(json) {
  if (!isObject(json) || !isObject(json.data)) return { ok: false, reason: 'schema' };
  const d = json.data;
  return {
    ok: true,
    staking: {
      totalStakeAnts: finiteNumber(d.total_stake_ants),
      budgetAnts: finiteNumber(d.budget_ants),
      rewardEpoch: isInt(d.reward_epoch) ? d.reward_epoch : null,
    },
  };
}

export function parseEpochs(json) {
  if (!isObject(json) || !isObject(json.data) || !Array.isArray(json.data.epochs)) {
    return { ok: false, reason: 'schema' };
  }
  const epochs = [];
  for (const e of json.data.epochs) {
    if (!isObject(e) || !isInt(e.epoch)) continue;
    epochs.push({
      epoch: e.epoch,
      status: typeof e.status === 'string' ? e.status : null,
      emissionAnts: finiteNumber(e.emission_ants),
      model: typeof e.model === 'string' ? e.model : null,
      burnAnts: finiteNumber(e.burn_ants),
      sellerPointsUsd: finiteNumber(e.seller_points_usd),
    });
  }
  epochs.sort((a, b) => a.epoch - b.epoch);
  return { ok: true, epochs };
}

export function parseEpochDetail(json) {
  if (!isObject(json) || !isObject(json.data) || !isInt(json.data.epoch)) {
    return { ok: false, reason: 'schema' };
  }
  const d = json.data;
  return {
    ok: true,
    epoch: {
      epoch: d.epoch,
      status: typeof d.status === 'string' ? d.status : null,
      emissionAnts: finiteNumber(d.emission_ants),
      model: typeof d.model === 'string' ? d.model : null,
      burnAnts: finiteNumber(d.burn_ants),
      sellerPointsUsd: finiteNumber(d.seller_points_usd),
      buyerPointsUsd: finiteNumber(d.buyer_points_usd),
    },
  };
}

export function parseModels(json) {
  if (!isObject(json) || !isObject(json.data) || !Array.isArray(json.data.models)) {
    return { ok: false, reason: 'schema' };
  }
  const models = [];
  for (const m of json.data.models) {
    if (!isObject(m) || typeof m.model !== 'string' || m.model === '') continue;
    models.push({
      model: m.model,
      display: typeof m.display === 'string' && m.display !== '' ? m.display : m.model,
    });
  }
  return { ok: true, models };
}

export function parsePrices(json) {
  if (!isObject(json) || !isObject(json.data) || !Array.isArray(json.data.listings)) {
    return { ok: false, reason: 'schema' };
  }
  const listings = [];
  for (const l of json.data.listings) {
    if (!isObject(l) || typeof l.model !== 'string' || l.model === '') continue;
    listings.push({
      model: l.model,
      display: typeof l.model_display === 'string' && l.model_display !== '' ? l.model_display : l.model,
      inputUsdPerM: finiteNumber(l.input_usd_per_m),
      outputUsdPerM: finiteNumber(l.output_usd_per_m),
      live: l.live === true,
    });
  }
  return { ok: true, listings };
}

// Highest epoch number marked "complete" (the epoch stats list keeps the
// active epoch as "current").
export function maxCompletedEpoch(epochs) {
  let max = 0;
  for (const e of epochs) {
    if (e.status === 'complete' && e.epoch > max) max = e.epoch;
  }
  return max;
}

// Read the sections the current post types need: settled windows (network),
// burn + staked (supply) and the epoch list (enriched close). The models /
// prices / staking / epoch-detail parsers are kept (tested) but not fetched:
// their endpoints paginate at 100 and full pages (limit=1000) time out on the
// free tier, so new-model and price-change posts are deferred until pagination
// is worth the reliability cost.
export async function readAntseedStats({ fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'no-fetch' };
  const network = await getSection(fetchImpl, ENDPOINTS.summary, timeoutMs, parseNetworkSummary);
  const supply = await getSection(fetchImpl, ENDPOINTS.supply, timeoutMs, parseSupply);
  const epochs = await getSection(fetchImpl, ENDPOINTS.epochs, timeoutMs, parseEpochs);
  return {
    ok: true,
    network: network.ok ? network.network : null,
    supply: supply.ok ? supply.supply : null,
    epochs: epochs.ok ? epochs.epochs : null,
    reasons: {
      network: network.ok ? null : network.reason,
      supply: supply.ok ? null : supply.reason,
      epochs: epochs.ok ? null : epochs.reason,
    },
  };
}

// Full snapshot for diffing.
export function toAntseedSnapshot(result) {
  return {
    settled24h: result.network ? result.network.settled24h : null,
    settled7d: result.network ? result.network.settled7d : null,
    settled30d: result.network ? result.network.settled30d : null,
    settles24h: result.network ? result.network.settles24h : null,
    settles7d: result.network ? result.network.settles7d : null,
    settles30d: result.network ? result.network.settles30d : null,
    sellers24h: result.network ? result.network.sellers24h : null,
    sellers7d: result.network ? result.network.sellers7d : null,
    sellers30d: result.network ? result.network.sellers30d : null,
    stakedAnts: result.supply ? result.supply.stakedAnts : null,
    stakedPct: result.supply ? result.supply.stakedPct : null,
    burnedAnts: result.supply ? result.supply.burnedAnts : null,
    burns: result.supply ? result.supply.burns : [],
    epochs: result.epochs ? result.epochs : [],
  };
}

// Compact form persisted in state.json. `prev` carries the run-dependent
// post-baselines (posted, max7d) that a fresh snapshot does not know about.
export function toAntseedState(snapshot, prev = null) {
  return {
    settled24h: snapshot.settled24h,
    settled7d: snapshot.settled7d,
    settled30d: snapshot.settled30d,
    settles7d: snapshot.settles7d,
    sellers7d: snapshot.sellers7d,
    settles30d: snapshot.settles30d,
    sellers30d: snapshot.sellers30d,
    stakedAnts: snapshot.stakedAnts,
    stakedPct: snapshot.stakedPct,
    burnedAnts: snapshot.burnedAnts,
    burns: snapshot.burns,
    maxCompletedEpoch: maxCompletedEpoch(snapshot.epochs),
    // Continuous metrics post only past a move from the last POSTED value; a
    // state without posted (old state / cold start) is seeded from the current
    // snapshot with no post.
    posted: prev?.posted ?? {
      settled7d: snapshot.settled7d,
      settled30d: snapshot.settled30d,
      stakedAnts: snapshot.stakedAnts,
    },
    // All-time high of settled7d; a new high always posts (record key).
    max7d: prev?.max7d ?? snapshot.settled7d,
    // Timestamps of the last successful post per continuous metric, used for
    // the per-metric cooldown (24h settled, 48h staked).
    postedAt: prev?.postedAt ?? {},
  };
}
