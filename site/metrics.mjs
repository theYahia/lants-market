// Helper function: convert wei (string) to BigInt
function weiToBigInt(weiStr) {
  if (!weiStr) return 0n;
  try {
    return BigInt(weiStr);
  } catch {
    return 0n;
  }
}

/**
 * Determine which epoch should be used for reward calculations.
 *
 * - `cur`  – the current epoch as a string.
 * - `prev` – the previous epoch as a string.
 *
 * If any position already has a non‑zero reward for the current epoch,
 * we are in “live” mode and use the current epoch.
 * Otherwise we fall back to the previous epoch (all current values are still 0).
 *
 * Guard: if the snapshot or its positions are missing we default to live mode.
 *
 * @param {object} snapshot – the snapshot object containing `epoch` and `positions`.
 * @returns {{mode: 'live'|'prev', epoch: string}}
 */
export function rewardMode(snapshot) {
  const cur = String(Number(snapshot?.epoch ?? 0));
  const prev = String(Number(snapshot?.epoch ?? 0) - 1);

  if (!snapshot || !Array.isArray(snapshot.positions)) {
    return { mode: 'live', epoch: cur };
  }

  for (const pos of snapshot.positions) {
    const val = BigInt(pos.rewardByEpoch?.[cur] ?? 0);
    if (val > 0n) {
      return { mode: 'live', epoch: cur };
    }
  }

  return { mode: 'prev', epoch: prev };
}

/**
 * Contract truth: pendingStakerReward for the current epoch (live share
 * of the staker budget by actual purchases so far). Falls back to the previous
 * epoch while every current value is 0.
 *
 * @param {object} snapshot – the snapshot containing positions.
 * @param {object} pos      – a single position.
 * @param {any}    epoch    – (ignored) kept for backward compatibility.
 * @returns {number} reward in ANTS (human readable).
 */
export function expectedReward(snapshot, pos, epoch) {
  if (!snapshot || !pos) return 0;
  const modeInfo = rewardMode(snapshot);
  const rewardWei = BigInt(pos.rewardByEpoch?.[modeInfo.epoch] ?? 0);
  return Number(rewardWei) / 1e18;
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
  rewardMode,
  startEpoch,
  isMaxLock,
  fadingCount,
  exitSlash,
  floorPrice,
  yieldPerEpoch,
  payback,
  lockLabel,
};