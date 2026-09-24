// Helper function: convert wei (string) to BigInt
function weiToBigInt(weiStr) {
  if (!weiStr) return 0n;
  try {
    return BigInt(weiStr);
  } catch {
    return 0n;
  }
}

export function expectedReward(snapshot, pos, epoch) {
  if (!snapshot || !pos) return 0;
  const epochStr = String(epoch);

  // Unique pools: take agentId from positions
  const poolMap = new Map();
  for (const p of snapshot.positions) {
    poolMap.set(p.agentId, true);
  }

  let totalWeightedPoints = 0n;
  const poolWeightedPoints = new Map();

  // Compute the denominator and weighted points across all pools
  for (const [agentId, _] of poolMap) {
    const salesVal = snapshot.salesByPool?.[agentId];
    const weightVal = snapshot.poolWeightByEpoch?.[agentId]?.[epochStr];

    if (salesVal == null || weightVal == null) continue;

    const sales = Number(salesVal);
    const weight = weiToBigInt(weightVal);
    const weightedPoints = BigInt(sales) * weight;
    totalWeightedPoints += weightedPoints;
    poolWeightedPoints.set(agentId, weightedPoints);
  }

  if (totalWeightedPoints === 0n) return 0;

  const agentId = pos.agentId;
  const poolWeight = snapshot.poolWeightByEpoch?.[agentId]?.[epochStr];

  if (!poolWeight) return 0; // No weight for the epoch
  if (!snapshot.salesByPool?.[agentId]) return 0; // No sales for the pool

  const poolWeightedPoint = poolWeightedPoints.get(agentId) || 0n;
  const stakerBudget = BigInt(snapshot.stakerBudget);

  // poolReward (in the same units as the staker budget)
  // Formula: poolReward = stakerBudget * poolWeightedPoints / SUM_j
  const poolReward = (stakerBudget * poolWeightedPoint) / totalWeightedPoints;

  const positionWeight = pos.weightsByEpoch?.[epochStr];
  if (!positionWeight) return 0;

  const posWeightVal = weiToBigInt(positionWeight);
  const poolWeightVal = weiToBigInt(poolWeight);

  // positionReward = poolReward * positionWeight / poolWeight
  const reward = (poolReward * posWeightVal) / poolWeightVal;

  // Return a plain number
  return Number(reward);
}

export function startEpoch(pos) {
  if (!pos) return 0;
  return Number(pos.stakeStartEpoch) + 1;
}

export function isMaxLock(pos, epoch) {
  if (!pos) return false;
  return pos.weightsByEpoch[epoch] === pos.maxLockPowerByEpoch[epoch];
}

export function fadingCount(pos) {
  if (!pos || !pos.weightsByEpoch) return 0;
  const keys = Object.keys(pos.weightsByEpoch).map(Number).sort((a, b) => a - b);
  if (keys.length === 0) return 0;
  let count = 1;
  for (let i = keys.length - 1; i > 0; i--) {
    const currentKey = keys[i];
    const prevKey = keys[i - 1];
    if (pos.weightsByEpoch[currentKey] >= pos.weightsByEpoch[prevKey]) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export function exitSlash(pos) {
  if (!pos || pos.slashBps == null) return null;
  return Number(pos.slashBps) / 100;
}

/**
 * Calculate the floor price for a position.
 * Formula: amount * (1 - slashBps / 10000)
 * `amount` is stored as a wei‑string, we convert it to ANTS (1 ANTS = 1e18 wei).
 * Returns a number rounded to two decimal places, or null if data is missing.
 */
export function floorPrice(pos) {
  if (!pos || pos.amount == null) return null;
  const amountWei = weiToBigInt(pos.amount);
  // Convert wei to ANTS
  const amount = Number(amountWei) / 1e18;
  if (isNaN(amount)) return null;

  const slashBps = Number(pos.slashBps);
  if (isNaN(slashBps)) return null;

  const floor = amount * (1 - slashBps / 10000);
  // Round to 2 decimal places
  return Math.round(floor * 100) / 100;
}

/**
 * Yield per epoch = expectedReward / amountInAnts
 * Returns a number rounded to three decimal places, or null if data is missing.
 */
export function yieldPerEpoch(snapshot, pos, epoch) {
  if (!snapshot || !pos) return null;

  const reward = expectedReward(snapshot, pos, epoch);
  if (!reward) return null; // zero reward → no meaningful yield

  const amountWei = weiToBigInt(pos.amount);
  const amount = Number(amountWei) / 1e18;
  if (!amount) return null;

  const y = reward / amount;
  // Round to 3 decimal places
  return Math.round(y * 1000) / 1000;
}

/**
 * Payback = floorPrice / expectedReward
 * Returns a number rounded to three decimal places, or null if reward is zero or data missing.
 */
export function payback(snapshot, pos, epoch) {
  const floor = floorPrice(pos);
  const reward = expectedReward(snapshot, pos, epoch);
  if (floor == null || !reward) return null; // reward == 0 → undefined payback
  const val = floor / reward;
  // Round to 3 decimal places
  return Math.round(val * 1000) / 1000;
}

/**
 * Return remaining lock in weeks as `${weeks}w`, where
 * weeks = max(0, stakeEndEpoch - max(currentEpoch, stakeStartEpoch)).
 * If isMaxLock(pos, currentEpoch) is true, append " · max".
 */
export function lockLabel(pos, currentEpoch) {
  if (!pos) return '0w';
  const start = Number(pos.stakeStartEpoch) || 0;
  const end = Number(pos.stakeEndEpoch) || 0;
  const current = Number(currentEpoch) || 0;
  const weeks = Math.max(0, end - Math.max(current, start));
  const label = `${weeks}w`;
  if (isMaxLock(pos, currentEpoch)) {
    return `${label} · max`;
  }
  return label;
}

export default {
  expectedReward,
  startEpoch,
  isMaxLock,
  fadingCount,
  exitSlash,
  floorPrice,
  yieldPerEpoch,
  payback,
  lockLabel,
};