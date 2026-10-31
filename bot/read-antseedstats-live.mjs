// Read-only reader for the antseedstats.com endpoints the core reader does not
// cover: the 24h leaders, the per-UTC-day network series, the DIEM capacity
// pool and the current-epoch reward budgets. A soft dependency like the core
// reader: a failure here only drops these post types, never the run.

import { ANTSEEDSTATS_ORIGIN, getJson, finiteNumber, isObject, isInt } from './read-antseedstats.mjs';

async function getSection(fetchImpl, path, timeoutMs, parse) {
  const res = await getJson(fetchImpl, `${ANTSEEDSTATS_ORIGIN}${path}`, timeoutMs);
  if (!res.ok) return { ok: false, reason: res.reason };
  return parse(res.json);
}

function displayOf(node) {
  if (!isObject(node)) return null;
  if (typeof node.display === 'string' && node.display !== '') return node.display;
  return typeof node.model === 'string' ? node.model : null;
}

export function parseLeaders(json) {
  if (!isObject(json) || !isObject(json.data)) return { ok: false, reason: 'schema' };
  const d = json.data;
  const seller = isObject(d.seller) ? d.seller : null;
  const sales = isObject(d.top_model_by_sales) ? d.top_model_by_sales : null;
  const tokens = isObject(d.top_model_by_tokens) ? d.top_model_by_tokens : null;
  const free = isObject(d.top_free_model) ? d.top_free_model : null;
  return {
    ok: true,
    leaders: {
      sellerName: seller && typeof seller.name === 'string' ? seller.name : null,
      sellerUsd: seller ? finiteNumber(seller.settled_usd) : null,
      sellerBuyers: seller ? finiteNumber(seller.buyers) : null,
      topModelSales: {
        display: displayOf(sales),
        usd: sales ? finiteNumber(sales.settled_usd) : null,
        requests: sales ? finiteNumber(sales.requests) : null,
        buyers: sales ? finiteNumber(sales.buyers) : null,
      },
      topModelTokens: {
        display: displayOf(tokens),
        tokens: tokens ? finiteNumber(tokens.tokens) : null,
      },
      topFreeModel: {
        display: displayOf(free),
        buyers: free ? finiteNumber(free.buyers) : null,
      },
      excludedSellers: isInt(d.excluded_sellers) ? d.excluded_sellers : null,
    },
  };
}

export function parseDaily(json) {
  if (!isObject(json) || !isObject(json.data) || !Array.isArray(json.data.days)) {
    return { ok: false, reason: 'schema' };
  }
  const days = [];
  for (const r of json.data.days) {
    if (!isObject(r) || typeof r.day !== 'string') continue;
    days.push({
      day: r.day,
      settledUsd: finiteNumber(r.settled_usd),
      feesUsd: finiteNumber(r.fees_usd),
      settles: finiteNumber(r.settles),
      users: finiteNumber(r.users),
      newUsers: finiteNumber(r.new_users),
      buyers: finiteNumber(r.buyers),
      sellers: finiteNumber(r.sellers),
      requests: finiteNumber(r.requests),
      videoSeconds: finiteNumber(r.video_seconds),
      videos: finiteNumber(r.videos),
      videoSpendUsd: finiteNumber(r.video_spend_usd),
    });
  }
  days.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  return { ok: true, days };
}

// The latest fully-closed UTC day (yesterday or earlier). Today's row is a
// partial day and would under-report, so it is never chosen.
export function latestCompleteDay(days, nowMs = Date.now()) {
  if (!Array.isArray(days) || days.length === 0) return null;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  let best = null;
  for (const d of days) {
    if (d.day >= today) continue;
    if (!best || d.day > best.day) best = d;
  }
  return best;
}

// DIEM capacity pool. The `apy_*` fields are deliberately not read: yields are
// banned by the invariants, so only the capacity and payout totals are surfaced.
export function parseDiem(json) {
  if (!isObject(json) || !isObject(json.data)) return { ok: false, reason: 'schema' };
  const d = json.data;
  return {
    ok: true,
    diem: {
      totalStakedDiem: finiteNumber(d.total_staked_diem),
      stakers: finiteNumber(d.stakers),
      stakeValueUsd: finiteNumber(d.stake_value_usd),
      usdcDistributedUsd: finiteNumber(d.usdc_distributed_usd),
      usdcReservedUsd: finiteNumber(d.usdc_reserved_usd),
      antsDistributed: finiteNumber(d.ants_distributed),
    },
  };
}

export function parseRewardsCurrent(json) {
  if (!isObject(json) || !isObject(json.data)) return { ok: false, reason: 'schema' };
  const d = json.data;
  const epoch = isObject(d.epoch) && isInt(d.epoch.number) ? d.epoch.number : null;
  const budgets = isObject(d.budgets) ? d.budgets : null;
  return {
    ok: true,
    rewards: {
      epoch,
      emissionAnts: isObject(d.epoch) ? finiteNumber(d.epoch.emission_ants) : null,
      usageInputUsd: budgets ? finiteNumber(budgets.usage_input_usd) : null,
      usageTargetUsd: budgets ? finiteNumber(budgets.usage_target_usd) : null,
      usagePctOfTarget: budgets ? finiteNumber(budgets.usage_pct_of_target) : null,
      stakeActiveAnts: budgets ? finiteNumber(budgets.stake_active_ants) : null,
      stakeTargetAnts: budgets ? finiteNumber(budgets.stake_target_ants) : null,
      stakePctOfTarget: budgets ? finiteNumber(budgets.stake_pct_of_target) : null,
      poolsAnts: budgets ? finiteNumber(budgets.pools_ants) : null,
    },
  };
}

// Top-3 models by recent settled USDC, as display names. The /models first page
// is already sorted by `usage.settled_usd` descending, but we sort again
// defensively so an upstream sort change cannot reorder the headline.
export function parseModelsTop3(json) {
  if (!isObject(json) || !isObject(json.data) || !Array.isArray(json.data.models)) {
    return { ok: false, reason: 'schema' };
  }
  const rows = [];
  for (const m of json.data.models) {
    if (!isObject(m)) continue;
    const display = typeof m.display === 'string' && m.display !== '' ? m.display : m.model;
    if (typeof display !== 'string' || display === '') continue;
    const usd = isObject(m.usage) ? finiteNumber(m.usage.settled_usd) : null;
    rows.push({ display, usd: usd ?? 0 });
  }
  rows.sort((a, b) => b.usd - a.usd);
  return { ok: true, models: rows.slice(0, 3).map((m) => m.display) };
}

export async function readAntseedStatsLive({ fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'no-fetch' };
  const leaders = await getSection(fetchImpl, '/api/v1/leaders', timeoutMs, parseLeaders);
  const daily = await getSection(fetchImpl, '/api/v1/network/daily', timeoutMs, parseDaily);
  const diem = await getSection(fetchImpl, '/api/v1/diem', timeoutMs, parseDiem);
  const rewards = await getSection(fetchImpl, '/api/v1/rewards/current', timeoutMs, parseRewardsCurrent);
  // /models is the slowest endpoint (968 rows of nested usage); the first page
  // is sorted by recent settled USDC, so a small limit already returns the top 3.
  const models = await getSection(fetchImpl, '/api/v1/models?limit=3', timeoutMs, parseModelsTop3);
  return {
    ok: true,
    leaders: leaders.ok ? leaders.leaders : null,
    daily: daily.ok ? daily.days : null,
    diem: diem.ok ? diem.diem : null,
    rewards: rewards.ok ? rewards.rewards : null,
    topModels: models.ok && models.models.length > 0 ? models.models : null,
    reasons: {
      leaders: leaders.ok ? null : leaders.reason,
      daily: daily.ok ? null : daily.reason,
      diem: diem.ok ? null : diem.reason,
      rewards: rewards.ok ? null : rewards.reason,
      models: models.ok ? null : models.reason,
    },
  };
}
