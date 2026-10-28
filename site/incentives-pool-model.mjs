// A single pool model shared by the board and the calculator, so the aggregation
// (R, We, WN per pool) and the derived k/B/S/estimate are computed in exactly one
// place. Pure: no DOM, no network.
import { nextBudget } from './incentives-data.mjs';

export function poolModel(snapshot, mode) {
  const e = Number(mode.epoch);
  const N = e + 1;
  const nextEpoch = String(N);
  const positions = snapshot.positions || [];

  const poolData = new Map();
  for (const pos of positions) {
    const pool = String(pos.agentId);
    const reward = Number(pos.rewardByEpoch?.[String(e)] || 0) / 1e18;
    const we = Number(pos.weightsByEpoch?.[String(e)] || 0) / 1e18;
    const wn = Number(pos.weightsByEpoch?.[nextEpoch] || 0) / 1e18;
    if (!poolData.has(pool)) poolData.set(pool, { R: 0, We: 0, WN: 0 });
    const data = poolData.get(pool);
    data.R += reward;
    data.We += we;
    data.WN += wn;
  }

  let B = 0;
  for (const data of poolData.values()) B += data.R;
  B = nextBudget(snapshot, N) ?? B;

  const kMap = new Map();
  for (const [pool, data] of poolData.entries()) {
    kMap.set(pool, data.We > 0 ? data.R / data.We : 0);
  }

  let S = 0;
  for (const [pool, data] of poolData.entries()) {
    S += kMap.get(pool) * data.WN;
  }

  const estForPool = (pool, v) => {
    const data = poolData.get(pool);
    if (!data) return 0;
    const k = kMap.get(pool) || 0;
    if (k === 0 || S === 0) return 0;
    return B * v * k / (S + k * v);
  };

  return { poolData, kMap, B, S, estForPool, N, nextEpoch, positions };
}
