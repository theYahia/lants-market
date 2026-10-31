// Browser-safe fixed-point forecast adapter. It mirrors the contract formula used by
// scripts/probes/forecast-core.cjs without importing Node-only modules.
const SCALE = 10n ** 18n;
const MAX_HORIZON = 104;

function integer(value, label) {
  if (typeof value === 'bigint') return value >= 0n ? value : (() => { throw new RangeError(`${label}: negative`); })();
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  throw new TypeError(`${label}: expected non-negative integer`);
}

export function decimalToFix(value, decimals = 18) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new TypeError('invalid decimal');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals && /[^0]/.test(fraction.slice(decimals))) throw new RangeError('decimal precision exceeds scale');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction.slice(0, decimals) + '0'.repeat(decimals)).slice(0, decimals) || '0');
}

function reward(weight, budget, sales, g) {
  if (g <= 0n) return null;
  return weight * budget * sales / g;
}

export function forecastEpoch({ salesByPool, weightsByPool, ownerWeights, budget }) {
  if (!(salesByPool instanceof Map) || !(weightsByPool instanceof Map) || !(ownerWeights instanceof Map)) throw new TypeError('forecastEpoch maps required');
  const b = integer(budget, 'budget');
  let g = 0n;
  for (const [pool, sales] of salesByPool) {
    const weight = weightsByPool.get(pool);
    if (typeof weight !== 'bigint') return { unavailable: true, reason: `missing on-chain weight for ${pool}` };
    g += integer(sales, `${pool}.sales`) * weight;
  }
  if (g === 0n) return { unavailable: true, reason: 'empty recognized denominator G' };
  let total = 0n;
  const byPool = new Map();
  for (const [pool, weight] of ownerWeights) {
    const sales = salesByPool.get(pool);
    if (typeof sales !== 'bigint') return { unavailable: true, reason: `missing recognized sales for ${pool}` };
    const value = reward(integer(weight, `${pool}.ownerWeight`), b, sales, g);
    if (value === null) return { unavailable: true, reason: 'empty recognized denominator G' };
    byPool.set(pool, value); total += value;
  }
  return { unavailable: false, g, totalRewardFix: total, rewardByPool: byPool };
}

export function forecastHorizon({ epochs, currentEpoch, stakeEndEpoch, discountRateBps = 0, activationDelay = 1 }) {
  if (!Array.isArray(epochs)) throw new TypeError('epochs must be an array');
  const start = integer(currentEpoch, 'currentEpoch');
  const end = integer(stakeEndEpoch, 'stakeEndEpoch');
  const horizon = Math.min(MAX_HORIZON, Number(end > start ? end - start : 0n));
  const rate = integer(discountRateBps, 'discountRateBps');
  const base = 10000n;
  let undiscounted = 0n; let discounted = 0n; let compoundable = 0n;
  const rows = [];
  for (let i = 0; i < horizon; i += 1) {
    const epoch = epochs[i];
    if (!epoch || epoch.unavailable) { rows.push({ epoch: start + BigInt(i + 1), unavailable: true, reason: epoch?.reason || 'missing future inputs' }); continue; }
    const result = forecastEpoch(epoch);
    if (result.unavailable) { rows.push({ epoch: start + BigInt(i + 1), ...result }); continue; }
    const n = BigInt(i + 1);
    const pv = result.totalRewardFix * base ** n / (base + rate) ** n;
    undiscounted += result.totalRewardFix; discounted += pv;
    if (i + 1 > activationDelay) compoundable += result.totalRewardFix;
    rows.push({ epoch: start + n, ...result, discountedPvFix: pv });
  }
  const available = rows.filter((row) => !row.unavailable).length;
  return { horizon, rows, nextEpochRewardFix: rows[0]?.totalRewardFix ?? null, undiscountedRewardTotalFix: undiscounted, discountedPvRewardFix: discounted, compoundableLantsFix: compoundable, discountRateBps: rate, coverage: horizon === 0 ? 1 : available / horizon, unavailable: rows.filter((row) => row.unavailable).map((row) => row.reason), formula: 'reward / (1 + discountRateBps / 10000)^n' };
}

export function snapshotEpochInputs(snapshot, epoch, ownerWeights = new Map()) {
  const sales = new Map(Object.entries(snapshot.recognizedSalesByEpoch?.[String(epoch)] || snapshot.salesByPool || {}).map(([pool, value]) => [pool, typeof value === 'bigint' ? value : decimalToFix(value)]));
  const weights = new Map(Object.entries(snapshot.poolWeightByEpoch?.[String(epoch)] || {}).map(([pool, value]) => [pool, integer(value, `${pool}.weight`)]));
  const budget = snapshot.stakerBudgetByEpoch?.[String(epoch)] ?? snapshot.stakerBudgetNext;
  if (budget === undefined) return { unavailable: true, reason: 'missing staker budget' };
  return { salesByPool: sales, weightsByPool: weights, ownerWeights, budget: integer(budget, 'budget') };
}
