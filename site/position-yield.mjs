// Yield and boost helpers for cards and the position page.
//
// Two separate numbers, never folded together:
//   - APR / ANTS per epoch: the holder's staking reward only.
//   - pool share: the provider's share of next-epoch weight (buyer points
//     boost), summed from position weights exactly like incentives.mjs.

import { expectedReward, isMaxLock } from './metrics.mjs';
import { epochBoundary } from './epochs.mjs';

export function amountAnts(pos) {
  const n = Number(pos?.amount);
  return Number.isFinite(n) ? n / 1e18 : 0;
}

/** ANTS earned by this position in one epoch, staking reward only. */
export function antsPerEpoch(snapshot, pos) {
  if (!pos) return null;
  const reward = expectedReward(snapshot, pos);
  return reward > 0 ? reward : null;
}

/** Annualised staking reward in percent: weekly yield x 52. */
export function aprPct(snapshot, pos) {
  const reward = antsPerEpoch(snapshot, pos);
  const amount = amountAnts(pos);
  if (reward === null || !(amount > 0)) return null;
  return (reward / amount) * 52 * 100;
}

/**
 * Per-provider shares of all position weight at an epoch (agentId -> 0..1).
 * One pass over positions, so the storefront can render hundreds of cards
 * without rescanning the snapshot per card.
 */
export function poolShares(snapshot, epoch) {
  const key = String(epoch);
  let total = 0n;
  const byAgent = new Map();
  for (const pos of snapshot?.positions || []) {
    const w = BigInt(String(pos.weightsByEpoch?.[key] ?? '0'));
    total += w;
    const agent = String(pos.agentId);
    byAgent.set(agent, (byAgent.get(agent) || 0n) + w);
  }
  const shares = new Map();
  if (total === 0n) return shares;
  for (const [agent, weight] of byAgent) {
    shares.set(agent, Number((weight * 10n ** 6n) / total) / 1e6);
  }
  return shares;
}

/**
 * Provider pool's share of all position weight at an epoch (0..1).
 * Returns null when the epoch has no weight at all.
 */
export function poolShare(snapshot, agentId, epoch) {
  const share = poolShares(snapshot, epoch).get(String(agentId));
  return share === undefined ? null : share;
}

/** Total weight in the pool at an epoch, in ANTS-equivalent units. */
export function poolWeight(snapshot, agentId, epoch) {
  const key = String(epoch);
  let mine = 0n;
  for (const pos of snapshot?.positions || []) {
    if (String(pos.agentId) === String(agentId)) {
      mine += BigInt(String(pos.weightsByEpoch?.[key] ?? '0'));
    }
  }
  return Number(mine) / 1e18;
}

/**
 * Unlock date: the epoch boundary after the last epoch with power.
 * Max-locked positions return the string 'max' (they never count down).
 */
export function unlockDate(pos, epoch) {
  if (!pos) return null;
  if (isMaxLock(pos, epoch)) return 'max';
  if (pos.stakeEndEpoch == null) return null;
  return epochBoundary(pos.stakeEndEpoch);
}

/** Remaining full weeks, or 'max'. */
export function lockWeeks(pos, epoch) {
  if (!pos) return null;
  if (isMaxLock(pos, epoch)) return 'max';
  if (pos.stakeEndEpoch == null) return null;
  return Math.max(0, Number(pos.stakeEndEpoch) - Number(epoch));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatUnlock(value) {
  if (value === 'max') return 'max lock';
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '—';
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTHS[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}
