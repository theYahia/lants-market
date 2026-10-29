// AntSeed points accounting: buyer, provider (seller) and boost numbers derived
// from the incentives snapshot. Pure module (no DOM, no network). Buyer usage
// selection is reused from incentives-data so the board, buyer column and the
// calculators always pick the same epoch.
import { cashbackUsage } from './incentives-data.mjs';

// Buyer cap math lives in incentives-data (the buyer formula stays there); the
// points module re-exports it so callers use one import surface.
export { buyerCapSpend } from './incentives-data.mjs';

const WEI = 10n ** 18n;
const BPS = 10000n;

// Human ANTS from wei: "—" when unavailable, "<1" below one ANTS.
export function formatAntsWei(wei) {
  if (wei === null || wei === undefined) return '\u2014';
  if (wei === 0n) return '0';
  if (wei < WEI) return '<1';
  return (wei / WEI).toLocaleString('en-US');
}

// Seller points pick the current epoch unless it collapsed 20x, mirroring
// cashbackUsage for buyers. A snapshot without the seller ledger returns null.
export function sellerPointsUsage(snapshot) {
  const se = Number(snapshot.epoch);
  const byEpoch = snapshot.usageByEpoch;
  if (!byEpoch || !byEpoch[String(se)]) return null;
  const cur = byEpoch[String(se)];
  if (cur.totalWeightedPoolPoints === undefined) return null;
  const prev = byEpoch[String(se - 1)];
  if (prev && prev.totalWeightedPoolPoints !== undefined &&
      BigInt(cur.totalWeightedPoolPoints || '0') * 20n < BigInt(prev.totalWeightedPoolPoints || '0')) {
    return { usage: prev, epoch: se - 1, heading: `Provider ANTS per epoch, final, epoch ${se - 1}` };
  }
  return { usage: cur, epoch: se, heading: `Provider ANTS per epoch, epoch ${se} so far` };
}

// Provider (seller) reward for a pool: sellerBudget x the pool's share of
// weighted seller points, capped at MAX_REWARD_SHARE_BPS of the budget.
export function sellerRewardCell(snapshot, pool) {
  const su = sellerPointsUsage(snapshot);
  if (!su) return { wei: null, text: '\u2014' };
  const u = su.usage;
  if (u.weightedPoolPoints === undefined || u.sellerBudget === undefined) {
    return { wei: null, text: '\u2014' };
  }
  const t = BigInt(u.totalWeightedPoolPoints || '0');
  if (t === 0n) return { wei: 0n, text: '0' };
  const budget = BigInt(u.sellerBudget || '0');
  const w = BigInt((u.weightedPoolPoints || {})[pool] || '0');
  let wei = budget * w / t;
  const bps = BigInt(snapshot.maxRewardShareBps ?? 0);
  if (bps > 0n) {
    const cap = budget * bps / BPS;
    if (wei > cap) wei = cap;
  }
  return { wei, text: formatAntsWei(wei) };
}

// ANTS wei a buyer earns for spending `usd` dollars with this seller, capped at
// MAX_REWARD_SHARE_BPS of the buyer budget. null when the snapshot has no ledger.
export function buyerAntsForSpend(snapshot, pool, usd) {
  const cb = cashbackUsage(snapshot);
  if (!cb) return null;
  const u = cb.usage;
  const t = BigInt(u.totalWeightedBuyerPoints || '0');
  if (t === 0n) return 0n;
  const amount = Math.round(Number(usd) * 1e6);
  if (!Number.isFinite(amount) || amount <= 0) return 0n;
  const budget = BigInt(u.buyerBudget || '0');
  const w = BigInt((u.poolWeights || {})[pool] || '0');
  let wei = budget * BigInt(amount) * w / t;
  const bps = BigInt(snapshot.maxRewardShareBps ?? 0);
  if (bps > 0n) {
    const cap = budget * bps / BPS;
    if (wei > cap) wei = cap;
  }
  return wei;
}

// Boost is the pool weight (the points multiplier per $1) and its human form,
// ANTS staked at max lock (weight / 104). Zero when the pool has no weight next epoch.
export function poolBoost(snapshot, pool) {
  const e = Number(snapshot.epoch);
  const next = String(e + 1);
  const weightWei = BigInt(String(snapshot.poolWeightByEpoch?.[pool]?.[next] || '0'));
  return { weightWei, stakedAnts: Number(weightWei) / 1e18 / 104 };
}

// Pool ids in snapshot order, deduplicated. Shared by the buyer/provider tables.
export function listPools(snapshot) {
  const seen = new Set();
  const pools = [];
  for (const pos of snapshot.positions || []) {
    const id = String(pos.agentId);
    if (seen.has(id)) continue;
    seen.add(id);
    pools.push(id);
  }
  return pools;
}
