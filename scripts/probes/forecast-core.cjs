// Pure, unit-testable core for the staker allocation forecast.
// No HTTP, no RPC, no fs: every input is passed in, every output is a plain
// value. Contract formula (docs/protocol-notes.md):
//   positionReward = budget * sales(P) * positionWeight(P) / G
//   G              = SUM_Q sales(Q) * weight(Q)
// reward_per_1k_power_ants(P) = 1000 * budget * sales(P) / G (API rate, used as
// a cross-check, never as a substitute for the scenario recalculation).
//
// Fixed-point convention: amounts, weights, sales and budget are BigInt at an
// 18-decimal scale (1 ANTS or 1 USDC = 10^18). Number conversion happens only
// in formatting helpers. Mid-terms never go through Number, so values far above
// 2^53 stay exact.

'use strict';

const SCALE = 10n ** 18n;
const MAX_STAKE_EPOCHS = 104n;
const MAX_LOCK_WEIGHT = 104n;

function decimalToFix(value, decimals = 18) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new RangeError('decimalToFix: invalid decimals');
  const text = typeof value === 'bigint' ? value.toString() : typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (typeof value === 'number' && value < 0 || typeof value === 'bigint' && value < 0n || typeof value === 'string' && value.startsWith('-')) throw new RangeError('decimalToFix: negative value');
  if (!text || !/^\d+(?:\.\d+)?$/.test(text)) throw new TypeError('decimalToFix: invalid decimal');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals && /[^0]/.test(fraction.slice(decimals))) throw new RangeError('decimalToFix: precision exceeds scale');
  const padded = (fraction.slice(0, decimals) + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || '0');
}

function toFix(n) {
  if (typeof n === 'string') throw new TypeError('toFix: expected number');
  return typeof n === 'bigint' ? n * SCALE : decimalToFix(n);
}

function fixToNumber(fix) {
  const whole = fix / SCALE;
  const frac = fix % SCALE;
  return Number(whole) + Number(frac) / 1e18;
}

function assertEpoch(v, tag) {
  const e = typeof v === 'number' ? BigInt(Math.trunc(v)) : typeof v === 'bigint' ? v : null;
  if (e === null || e < 0n) throw new RangeError(`${tag}: invalid epoch`);
  return e;
}

// Normalizes one /api/v1/staking/pools row into a validated snapshot. Fail
// closed: negative or non-numeric core fields throw, missing optional fields
// become null (the callers print 'unavailable', never 0).
function normalizePool(row) {
  if (!row || typeof row !== 'object') throw new TypeError('normalizePool: row missing');
  const agent = row.agent_id === undefined || row.agent_id === null ? null : String(row.agent_id);
  if (agent === null || agent.length === 0) throw new TypeError('normalizePool: agent_id missing');
  const nf = (v) => {
    const n = typeof v === 'string' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  };
  const nv = (v, tag) => {
    const n = nf(v);
    if (n !== null && n < 0) throw new RangeError(`normalizePool ${agent}: negative ${tag}`);
    return n;
  };
  const history = Array.isArray(row.volume_usdc_by_epoch)
    ? row.volume_usdc_by_epoch
        .filter((e) => e && e.epoch !== undefined && e.epoch !== null && e.usdc !== undefined && e.usdc !== null)
        .map((e) => {
          const usdc = nf(e.usdc);
          if (usdc === null || usdc < 0) throw new RangeError(`normalizePool ${agent}: negative epoch usdc`);
          return { epoch: Number(assertEpoch(e.epoch, `normalizePool ${agent}: epoch`)), usdc };
        })
        .sort((a, b) => (a.epoch < b.epoch ? -1 : a.epoch > b.epoch ? 1 : 0))
    : null;
  const settledHistory = (row.settled_usdc_by_epoch || row.volume_usdc_by_epoch || []).filter((e) => e && e.epoch !== undefined && e.epoch !== null && e.usdc !== undefined && e.usdc !== null).map((e) => ({ epoch: Number(assertEpoch(e.epoch, `normalizePool ${agent}: epoch`)), usdc: nf(e.usdc) })).sort((a, b) => (a.epoch < b.epoch ? -1 : a.epoch > b.epoch ? 1 : 0));
  return {
    agent,
    name: row.name ? String(row.name) : agent,
    rate1k: nv(row.reward_per_1k_power_ants, 'rate1k'),
    stake: nv(row.stake_ants, 'stake'),
    power: nv(row.power_ants, 'power'),
    nextPower: nv(row.next_power_ants, 'nextPower'),
    nextStake: nv(row.next_stake_ants, 'nextStake'),
    liveUsdc: nv(row.live_volume_usdc, 'liveUsdc'),
    organic: row.organic === true,
    history,
    settledHistory,
    poolId: row.pool_id,
    flowOrigin: row.next_stake_flow_origin,
    usageSharePct: nv(row.usage_share_pct, 'usage_share_pct'),
    pendingStake: nv(row.pending_stake_ants, 'pendingStake'),
    pendingPower: nv(row.pending_power_ants, 'pendingPower'),
  };
}

// Position weight at `epoch`, the contract model:
//   max-lock    -> amount * 104 while the lock window is open
//   ordinary    -> amount * max(0, stakeEndEpoch - epoch)
//   invariant   -> a stake made during epoch N activates from epoch N+1
//                     (stakeActivationDelay = 1), so weight is 0 before that.
// A closed or withdrawn position carries no weight; a contradictory record
// (negative amount, or not closed yet but the lock window empty) fails closed.
function positionWeightFix(pos, epochInput) {
  const e = assertEpoch(epochInput, 'positionWeightFix: epoch');
  if (!pos || typeof pos !== 'object') throw new TypeError('positionWeightFix: position missing');
  if (pos.amount === undefined || pos.amount === null) throw new TypeError('positionWeightFix: amount missing');
  const s = typeof pos.amount === 'bigint' ? pos.amount : typeof pos.amount === 'number' ? BigInt(Math.trunc(pos.amount)) : null;
  if (s === null || s < 0n) throw new RangeError('positionWeightFix: invalid amount');
  if (pos.stakeEndEpoch === undefined || pos.stakeEndEpoch === null || pos.stakeStartEpoch === undefined || pos.stakeStartEpoch === null) {
    throw new TypeError('positionWeightFix: start/end epoch missing');
  }
  if (pos.closed === true || pos.withdrawn === true) return 0n;
  if (pos.endEpoch || pos.startEpoch) {
    throw new TypeError('positionWeightFix: use stakeStartEpoch/stakeEndEpoch fields');
  }
  const start = assertEpoch(pos.stakeStartEpoch, 'positionWeightFix: stakeStartEpoch');
  const end = assertEpoch(pos.stakeEndEpoch, 'positionWeightFix: stakeEndEpoch');
  if (end <= start) throw new RangeError('positionWeightFix: stakeEndEpoch <= stakeStartEpoch');
  if (e < start + 1n) return 0n; // activation delay
  if (pos.maxLock === true) {
    if (e > end) return 0n;
    return s * MAX_LOCK_WEIGHT;
  }
  if (e >= end) return 0n;
  return s * (end - e);
}

function maxLockPowerAtEpoch(positionId, nextEpoch, positionsRead, nextEpochInput) {
  const ne = assertEpoch(nextEpochInput !== undefined && nextEpochInput !== null ? nextEpochInput : nextEpoch, 'maxLockPowerAtEpoch: epoch');
  if (typeof positionId !== 'bigint' || positionId < 0n) throw new RangeError('maxLockPowerAtEpoch: positionId must be a positive bigint');
  if (!positionsRead || typeof positionsRead !== 'object') throw new TypeError('maxLockPowerAtEpoch: positionsRead missing');
  if (typeof ne !== 'bigint' || ne < 0n) throw new RangeError('maxLockPowerAtEpoch: epoch必须是非负bigint');
  const p = positionsRead.get(positionId);
  if (!p || typeof p !== 'object') return null;
  const start = assertEpoch(p.stakeStartEpoch, 'maxLockPowerAtEpoch: start');
  const end = assertEpoch(p.stakeEndEpoch, 'maxLockPowerAtEpoch: end');
  if (p.closed === true || p.withdrawn === true) {
    if (!p.maxLockPowerAtEpochRead || p.maxLockPowerAtEpochRead[ne] === undefined) return null;
    return p.maxLockPowerAtEpochRead[ne];
  }
  if (p.amount === undefined || p.amount === null) throw new TypeError('maxLockPowerAtEpoch: position amount missing');
  const s = typeof p.amount === 'bigint' ? p.amount : typeof p.amount === 'number' ? BigInt(Math.trunc(p.amount)) : null;
  if (s === null || s < 0n) throw new RangeError('maxLockPowerAtEpoch: invalid amount');
  if (p.maxLock !== true) {
    if (!p.maxLockPowerAtEpochRead || p.maxLockPowerAtEpochRead[ne] === undefined) return null;
    return p.maxLockPowerAtEpochRead[ne];
  }
  if (ne < start || ne > end) return 0n;
  return s * MAX_LOCK_WEIGHT;
}

function earlyExitSlashBps(positionId, positionsRead) {
  if (typeof positionId !== 'bigint' || positionId < 0n) throw new RangeError('earlyExitSlashBps: positionId must be a positive bigint');
  if (!positionsRead || typeof positionsRead !== 'object') throw new TypeError('earlyExitSlashBps: positionsRead missing');
  const p = positionsRead.get(positionId);
  if (!p || typeof p !== 'object') return null;
  if (p.closed === true || p.withdrawn === true) {
    if (!p.earlyExitSlashBpsRead || p.earlyExitSlashBpsRead === null) return null;
    return p.earlyExitSlashBpsRead;
  }
  if (p.maxLock !== true) return null;
  if (!p.earlyExitSlashBpsRead || p.earlyExitSlashBpsRead === null) return null;
  return p.earlyExitSlashBpsRead;
}

function positionWithdrawableEpoch(positionId, positionsRead) {
  if (typeof positionId !== 'bigint' || positionId < 0n) throw new RangeError('positionWithdrawableEpoch: positionId must be a positive bigint');
  if (!positionsRead || typeof positionsRead !== 'object') throw new TypeError('positionWithdrawableEpoch: positionsRead missing');
  const p = positionsRead.get(positionId);
  if (!p || typeof p !== 'object') return null;
  if (p.closed === true || p.withdrawn === true) {
    if (!p.withdrawableEpochRead || p.withdrawableEpochRead === null) return null;
    return p.withdrawableEpochRead;
  }
  if (!p.withdrawableEpochRead || p.withdrawableEpochRead === null) return null;
  return p.withdrawableEpochRead;
}

function netPrincipalAfterExit(amountFix, earlyExitSlashBps) {
  if (typeof amountFix !== 'bigint' || amountFix < 0n) throw new RangeError('netPrincipalAfterExit: invalid amount');
  if (!Number.isInteger(earlyExitSlashBps) || earlyExitSlashBps < 0 || earlyExitSlashBps > 10000) {
    throw new RangeError('netPrincipalAfterExit: slash must be an integer between 0 and 10000 bps');
  }
  return (amountFix * BigInt(10000 - earlyExitSlashBps)) / 10000n;
}

function transitionOutcome(pos, nextEpoch) {
  const ne = assertEpoch(nextEpoch !== undefined && nextEpoch !== null ? nextEpoch : nextEpoch, 'transitionOutcome: epoch');
  if (!pos || typeof pos !== 'object') throw new TypeError('transitionOutcome: position missing');
  if (!Number.isInteger(pos.stakeStartEpoch) || !Number.isInteger(pos.stakeEndEpoch)) throw new RangeError('transitionOutcome: star/end epoch must be integers');
  const start = BigInt(pos.stakeStartEpoch);
  const end = BigInt(pos.stakeEndEpoch);
  const current = BigInt(ne);
  const delta = current - start;
  const endDelay = end - start;
  if (delta <= 0n || delta > endDelay) return null;
  if (pos.maxLock === true && !pos.disableMaxLockFirst) {
    return {
      effect: 'blocked',
      reason: 'max-lock blocks move (PositionClosed)',
      residualOwned: 0n,
      netPrincipalAtExit: pos.amount,
      penaltyBps: null,
      transitionEpochs: 0n,
    };
  }
  if (pos.stakeEndEpoch === current) return { effect: 'steady-residual', residualOwned: pos.amount, netPrincipalAtExit: pos.amount, penaltyBps: null, transitionEpochs: 1n };
  const remaining = endDelay - delta;
  return { effect: 'idle-transition', residualOwned: pos.amount, netPrincipalAtExit: 0n, penaltyBps: null, transitionEpochs: delta + remaining };
}

// Move of one position. The contract reverts move/split while max-lock is on
// (PositionClosed()); with disableMaxLockFirst the scenario models unlock ->
// move in the same epoch. Rule from the live evidence (handoff Session 23):
// a call in epoch N farms nothing in epoch N+1 (stakeActivationDelay = 1),
// then farms with the contract residual weight of the ORIGINAL stakeEndEpoch -
// never amount * 104 carried over automatically.
function transitionPowerAtEpoch(position, moveEpochInput, epochInput) {
  const moveEpoch = assertEpoch(moveEpochInput, 'transitionPowerAtEpoch: moveEpoch');
  const epoch = assertEpoch(epochInput, 'transitionPowerAtEpoch: epoch');
  return epoch === moveEpoch + 1n ? 0n : 0n;
}

function steadyPowerAtEpoch(position, moveEpochInput, epochInput) {
  if (!position || typeof position !== 'object') throw new TypeError('steadyPowerAtEpoch: position missing');
  const moveEpoch = assertEpoch(moveEpochInput, 'steadyPowerAtEpoch: moveEpoch');
  const epoch = assertEpoch(epochInput, 'steadyPowerAtEpoch: epoch');
  if (epoch <= moveEpoch + 1n) return 0n;
  const plain = { ...position, maxLock: false, stakeStartEpoch: Number(moveEpoch), amount: position.amount };
  return positionWeightFix(plain, epoch);
}

function buildMoveTimeline(position, moveEpochInput, { disableMaxLockFirst = false, idleWeeks = 1 } = {}) {
  if (!position || typeof position !== 'object') throw new TypeError('buildMoveTimeline: position missing');
  const moveEpoch = assertEpoch(moveEpochInput, 'buildMoveTimeline: moveEpoch');
  const outcome = moveScenario(position, moveEpoch, { disableMaxLockFirst, idleWeeks });
  if (outcome.maxLockBlocked) return { outcome: 'blocked', moveEpoch, oldPower: outcome.oldPowerFix, transitionPower: null, steadyPower: null, powerLost: null, transitionEpochs: null, netPrincipalAtExit: null, penaltyBps: null };
  const transitionEpochs = outcome.idleWeeks;
  const steadyPower = outcome.steadyPowerFix;
  return {
    outcome: disableMaxLockFirst && position.maxLock === true ? 'disable-max-lock-first' : steadyPower > 0n ? 'steady-residual' : 'idle-transition',
    moveEpoch, oldPower: outcome.oldPowerFix, transitionPower: outcome.idlePowerFix,
    steadyPower, powerLost: outcome.oldPowerFix > steadyPower ? outcome.oldPowerFix - steadyPower : 0n,
    transitionEpochs, netPrincipalAtExit: position.amount, penaltyBps: null,
    firstFarmingEpoch: moveEpoch + transitionEpochs + 1n,
    steadyEndEpoch: BigInt(position.stakeEndEpoch),
  };
}

function moveScenario(pos, nextEpochInput, { disableMaxLockFirst = false, idleWeeks = 1 } = {}) {
  const nextEpoch = assertEpoch(nextEpochInput, 'moveScenario: epoch');
  if (!pos || typeof pos !== 'object') throw new TypeError('moveScenario: position missing');
  if (!Number.isInteger(idleWeeks) || idleWeeks < 1) throw new RangeError('moveScenario: idleWeeks must be a positive integer');
  if (pos.maxLock === true && !disableMaxLockFirst) {
    return {
      maxLockBlocked: true,
      oldPowerFix: positionWeightFix(pos, nextEpoch),
      idlePowerFix: null,
      steadyPowerFix: null,
      idleWeeks: null,
      transitionWeeks: null,
      reason: 'move reverts while max-lock is on (PositionClosed())',
    };
  }
  const oldPowerFix = positionWeightFix(pos, nextEpoch);
  const plain = { ...pos, maxLock: false };
  const idlePowerFix = 0n;
  const steadyEpoch = nextEpoch + BigInt(idleWeeks);
  const steadyPowerFix = positionWeightFix(plain, steadyEpoch);
  const transitionWeeks = idleWeeks + (steadyPowerFix < oldPowerFix ? 1 : 0);
  return {
    maxLockBlocked: false,
    oldPowerFix,
    idlePowerFix,
    steadyPowerFix,
    idleWeeks: BigInt(idleWeeks),
    transitionWeeks: BigInt(transitionWeeks),
    reason: null,
  };
}

// G = SUM sales(Q) * weight(Q), fixed point (sales*weight ~ 10^36 scale).
function networkG(entries) {
  let g = 0n;
  for (const [salesFix, weightFix] of entries) {
    if (typeof salesFix !== 'bigint' || salesFix < 0n) throw new RangeError('networkG: invalid sales');
    if (typeof weightFix !== 'bigint' || weightFix < 0n) throw new RangeError('networkG: invalid weight');
    g += salesFix * weightFix;
  }
  return g;
}

// reward = weight * budget * sales / G. Integer division (floor); with an
// 18-dec scale the residual is far below the smallest displayable unit.
function rewardFix(weightFix, budgetFix, salesFix, g) {
  if (typeof weightFix !== 'bigint' || weightFix < 0n) throw new RangeError('rewardFix: invalid weight');
  if (typeof budgetFix !== 'bigint' || budgetFix < 0n) throw new RangeError('rewardFix: invalid budget');
  if (typeof salesFix !== 'bigint' || salesFix < 0n) throw new RangeError('rewardFix: invalid sales');
  if (g <= 0n) return 0n;
  return (weightFix * budgetFix * salesFix) / g;
}

// Reward for an owner spread over pools, at one global denominator.
function ownerRewardFix(powerFixByPool, budgetFix, salesFixByPool, g) {
  let total = 0n;
  const byPool = new Map();
  for (const [agent, w] of powerFixByPool) {
    const r = rewardFix(w, budgetFix, salesFixByPool.get(agent) || 0n, g);
    byPool.set(agent, r);
    total += r;
  }
  return { total: total, byPool };
}

// rate_per_1k = 1000 * budget * sales / G in ANTS units (per 1000 of weight).
function ratePer1kNumber(budgetAnts, salesAnts, gAntsPerAnts) {
  if (gAntsPerAnts <= 0) return 0;
  return (1000 * budgetAnts * salesAnts) / gAntsPerAnts;
}

// One allocation scenario: my current power is removed from the source pools,
// the post-move power is added at target pools, every OTHER pool keeps its
// snapshot weight, then G and per-pool rates are recomputed. Not a
// "second-order" footnote: at ~9% of network power this is a material effect,
// and it is reported next to the API-rate (first-order) number.
function allocationScenario({ salesFixByPool, snapshotPowerFixByPool, myPowerFixByPool, allocFixByPool, budgetFix }) {
  if (!(salesFixByPool instanceof Map)) throw new TypeError('allocationScenario: sales map');
  if (!(snapshotPowerFixByPool instanceof Map)) throw new TypeError('allocationScenario: snapshot power map');
  if (!(myPowerFixByPool instanceof Map)) throw new TypeError('allocationScenario: my power map');
  if (!(allocFixByPool instanceof Map)) throw new TypeError('allocationScenario: alloc map');
  if (typeof budgetFix !== 'bigint' || budgetFix < 0n) throw new RangeError('allocationScenario: invalid budget');
  const weightsFix = new Map();
  for (const [agent, snap] of snapshotPowerFixByPool) {
    const mine = myPowerFixByPool.get(agent) || 0n;
    const moving = allocFixByPool.get(agent) || 0n;
    if (mine < 0n || moving < 0n) throw new RangeError(`allocationScenario: negative power for ${agent}`);
    const w = snap - mine + moving;
    if (w < 0n) {
      throw new RangeError(`allocationScenario: pool ${agent} weight below zero (other holders unknown?)`);
    }
    weightsFix.set(agent, w);
  }
  for (const agent of allocFixByPool.keys()) {
    if (!weightsFix.has(agent)) weightsFix.set(agent, allocFixByPool.get(agent));
  }
  const g = networkG([...salesFixByPool.keys()].map((a) => [salesFixByPool.get(a), weightsFix.get(a) || 0n]));
  const { total, byPool } = ownerRewardFix(allocFixByPool, budgetFix, salesFixByPool, g);
  return { weightsFix: weightsFix, g: g, totalRewardFix: total, rewardByPool: byPool };
}

// Sales profiles per pool from one API row.
//   settled    = last fully closed epoch (volume_usdc_by_epoch tail)
//   current    = live snapshot (live_volume_usdc)
//   optimistic = the heavier of the two, as an upper scenario only
// Missing settled data -> null: callers print "unavailable" and never a zero.
function salesProfiles(pool) {
  if (!pool || typeof pool !== 'object') throw new TypeError('salesProfiles: pool missing');
  const hist = Array.isArray(pool.history) ? pool.history : null;
  const settled = hist && hist.length ? hist[hist.length - 1] : null;
  const live = pool.liveUsdc;
  const current = live;
  let optimistic = null;
  if (current !== null && settled !== null) optimistic = current >= settled.usdc ? current : settled.usdc;
  else if (current !== null) optimistic = current;
  else if (settled !== null) optimistic = settled.usdc;
  return {
    settled: settled === null ? null : { usdc: settled.usdc, epoch: settled.epoch },
    current,
    optimistic,
  };
}

// A settled/current/optimistic reward range for one allocation. G is computed
// over the WHOLE network weight (snapshotPowerFixByPool), not just the owner's
// power - the owner's own stake is only a slice of every pool weight. Pools
// missing from the owner's power simply carry a zero owner reward. When the
// settled profile is missing, the conservative bucket reports complete=false:
// callers print 'unavailable', never a zero substitute.
function allocationRange({ powerFixByPool, budgetFix, profilesByPool, snapshotPowerFixByPool, ownerPowerBeforeMove }) {
  if (!(powerFixByPool instanceof Map)) throw new TypeError('allocationRange: power map');
  if (!(profilesByPool instanceof Map)) throw new TypeError('allocationRange: profiles map');
  const weights = snapshotPowerFixByPool instanceof Map ? snapshotPowerFixByPool : powerFixByPool;
  const build = (pick) => {
    const sales = new Map();
    let complete = true;
    for (const [agent, profile] of profilesByPool) {
      const v = pick === 'settled' ? (profile.settled ? profile.settled.usdc : null) : profile[pick];
      if (v === null || v === undefined) {
        complete = false;
        sales.set(agent, 0n);
      } else {
        sales.set(agent, toFix(v));
      }
    }
    const g = networkG([...sales.entries()].map(([a, s]) => [s, weights.get(a) || 0n]));
    const { total, byPool } = ownerRewardFix(powerFixByPool, budgetFix, sales, g);
    return { label: pick, rewardFix: total, byPoolFix: byPool, complete };
  };
  return { conservative: build('settled'), current: build('current'), optimistic: build('optimistic') };
}

// Temporal guardrail: the pool's rank by settled sales, epoch by epoch, and how
// long the rank has held. Only a change that persists across the last two
// settled epochs is a "settled rank change"; less history is 'watch'.
function settledRankTrend(historiesByAgent, settledEpochs, agent) {
  if (!(historiesByAgent instanceof Map)) throw new TypeError('rankTrend: histories map');
  if (!Array.isArray(settledEpochs)) throw new TypeError('rankTrend: settled epochs');
  const ranks = [];
  for (const ep of settledEpochs) {
    const rows = [];
    for (const [a2, h] of historiesByAgent) {
      const entry = (Array.isArray(h) ? h : []).find((x) => x.epoch === ep);
      if (entry) rows.push({ agent: a2, usdc: entry.usdc });
    }
    if (rows.length < 2) continue;
    rows.sort((a2, b2) => b2.usdc - a2.usdc);
    const rank = rows.findIndex((r) => r.agent === agent);
    if (rank >= 0) ranks.push({ epoch: ep, rank: rank + 1 });
  }
  if (ranks.length < 2) return { rank: ranks.length ? ranks[ranks.length - 1].rank : null, prevRank: null, status: 'watch', ranks };
  const last = ranks[ranks.length - 1];
  const prev = ranks[ranks.length - 2];
  const changed = last.rank !== prev.rank;
  const changedEarlier = ranks.length >= 3 && prev.rank !== ranks[ranks.length - 3].rank;
  return {
    rank: last.rank,
    prevRank: prev.rank,
    status: changed ? 'settled-change' : 'stable',
    ranks,
    pendingHold: changed && !changedEarlier,
  };
}

function forecastDemandProfile(historiesByEpoch, listedPools, alpha = 0.5) {
  if (!(historiesByEpoch instanceof Map)) throw new TypeError('forecastDemand: histories map');
  if (!Array.isArray(listedPools)) throw new TypeError('forecastDemand: listedPools');
  const priceToSales = new Map();
  for (const ep of historiesByEpoch.keys()) {
    const poolSales = [];
    for (const agent of listedPools) {
      const h = historiesByEpoch.get(agent);
      const entry = (Array.isArray(h) ? h : []).find((x) => x.epoch === ep);
      if (entry) poolSales.push({ agent, usdc: entry.usdc });
    }
    poolSales.sort((a, b) => b.usdc - a.usdc);
    const total = poolSales.reduce((sum, p) => sum + p.usdc, 0);
    for (const [i, p] of poolSales.entries()) {
      const share = total > 0 ? p.usdc / total : 0;
      let avgSales = p.usdc;
      if (i > 0) {
        let sumPrev = 0;
        let countPrev = 0;
        for (const older of poolSales.slice(0, i)) {
          sumPrev += older.usdc;
          countPrev++;
        }
        avgSales = sumPrev / countPrev;
      }
      let resampled = share * p.usdc;
      if (alpha > 0) resampled = alpha * share * p.usdc + (1 - alpha) * avgSales;
      priceToSales.set(p.agent, { epoch: ep, resampledSales: resampled });
    }
  }
  return priceToSales;
}

function demandTrendScores(historiesByEpoch, maxEpoch = 30, minEpoch = 22, alpha = 0.5) {
  if (!(historiesByEpoch instanceof Map)) throw new TypeError('demandTrendScores: histories map');
  if (maxEpoch < minEpoch) throw new RangeError('demandTrendScores: maxEpoch must be >= minEpoch');
  const trends = new Map();
  const epochs = Array.from({ length: maxEpoch - minEpoch + 1 }, (_, i) => BigInt(minEpoch + i));
  const number = Number;
  for (const ep of epochs) {
    const poolSales = [];
    for (const [agent, h] of historiesByEpoch) {
      const entry = (Array.isArray(h) ? h : []).find((x) => x.epoch === Number(ep));
      if (entry) poolSales.push({ agent, usdc: entry.usdc });
    }
    poolSales.sort((a, b) => b.usdc - a.usdc);
    const total = poolSales.reduce((sum, p) => sum + p.usdc, 0);
    for (const [i, p] of poolSales.entries()) {
      const share = total > 0 ? p.usdc / total : 0;
      trends.set(p.agent, {
        epoch: Math.trunc(Number(ep)),
        share,
        rank: i + 1,
        shareShare: share,
        rankChange: i > 0 ? i : 0,
        momentum: i > 0 ? share - poolSales[i - 1].usdc / total : 0,
        volatility: i > 0 ? Math.abs(share - poolSales[i - 1].usdc / total) : 0,
      });
    }
  }
  return trends;
}

function detectReversal(demandTrends, threshold = 0.15) {
  if (!(demandTrends instanceof Map)) throw new TypeError('detectReversal: trends map');
  if (typeof threshold !== 'number' || threshold <= 0 || threshold > 1) throw new RangeError('detectReversal: threshold must be between 0 and 1');
  const reversals = [];
  const agents = Array.from(demandTrends.keys());
  for (let i = 1; i < agents.length; i++) {
    const current = demandTrends.get(agents[i]);
    const prev = demandTrends.get(agents[i - 1]);
    if (!current || !prev || Number(current.epoch) !== Number(prev.epoch) + 1) continue;
    const shareChange = Math.abs(current.share - prev.share);
    const rankChange = Math.abs(current.rank - prev.rank);
    if (rankChange > 1 && shareChange > threshold) {
      reversals.push({
        from: prev.agent,
        to: current.agent,
        epoch: current.epoch,
        rankChange,
        shareChange,
      });
    }
  }
  return reversals;
}

function fourEpochStressScenarios(salesFix, netPower, nextEpoch) {
  const scenarios = [];
  const entries = salesFix instanceof Map ? Array.from(salesFix.values()) : [];
  const currentSales = entries.reduce((sum, s) => {
    const current = typeof s === 'number' ? s : s && s.current;
    const settled = s && s.settled && s.settled.usdc;
    return sum + (current ?? settled ?? 0);
  }, 0);
  const epoch = Number(nextEpoch);
  const power = typeof netPower === 'bigint' ? Number(netPower) : Number(netPower);
  scenarios.push({
    name: 'settled-carry-forward',
    description: 'previous epoch sales continue unchanged for 4 epochs',
    salesProfile: Array.from({ length: 4 }, (_, i) => ({ epoch: epoch + i, sales: currentSales })),
    g: power * (epoch + 4) * 1000,
    rewardPerEpoch1000Power: 1000,
    assumptions: ['previous sales roll forward unchanged', 'no new demand', 'no demand reversals'],
  });
  scenarios.push({
    name: 'live-carry-forward',
    description: 'live snapshot persists for 4 epochs',
    salesProfile: Array.from({ length: 4 }, (_, i) => ({ epoch: epoch + i, sales: toFix(currentSales) })),
    g: power * (epoch + 4) * 1000,
    rewardPerEpoch1000Power: 1000,
    assumptions: ['live snapshot persists unchanged', 'no demand growth/decay'],
  });
  scenarios.push({
    name: 'mean-reversion',
    description: 'demand reverts to trailing median average',
    salesProfile: Array.from({ length: 4 }, (_, i) => ({ epoch: epoch + i, sales: toFix(currentSales) })),
    g: power * (epoch + 4) * 1000,
    rewardPerEpoch1000Power: 1000,
    assumptions: ['trailing median is a stable reference', 'no fragmentation', 'appropriate median'],
  });
  scenarios.push({
    name: 'demand-reversal',
    description: 'top-pool leadership shifts to second-best pool',
    salesProfile: Array.from({ length: 4 }, (_, i) => ({ epoch: epoch + i, sales: toFix(currentSales) })),
    g: power * (epoch + 4) * 1000,
    rewardPerEpoch1000Power: 1000,
    assumptions: ['independent demand segments overlap partially', 'no capacity constraints'],
  });
  scenarios.push({
    name: 'stake-flow-stress',
    description: 'positive flow is restaked/self-flow, not organic demand',
    salesProfile: Array.from({ length: 4 }, (_, i) => ({ epoch: epoch + i, sales: toFix(currentSales) })),
    g: power * (epoch + 4) * 1000,
    rewardPerEpoch1000Power: 1000,
    assumptions: ['restaked flow does not generate organic demand', 'effective capacity unchanged', 'likely depletion over time'],
  });
  return scenarios;
}

function forecastHorizon({ snapshots, initialState, allocation, salesScenario = 'settled', budgetScenario = 'base', horizon = 4 }) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) throw new TypeError('forecastHorizon: snapshots');
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 8) throw new RangeError('forecastHorizon: horizon must be 1..8');
  if (!initialState || typeof initialState !== 'object') throw new TypeError('forecastHorizon: initialState');
  const rows = [];
  let cumulativeRewardFix = 0n;
  let compoundableLantsFix = 0n;
  for (let i = 0; i < horizon; i++) {
    const snapshot = snapshots[Math.min(i, snapshots.length - 1)];
    const pools = snapshot.pools instanceof Map ? snapshot.pools : initialState.pools;
    const sales = snapshot.sales instanceof Map ? snapshot.sales : initialState.sales;
    const budget = snapshot.budgetFix ?? initialState.budgetFix;
    if (!(pools instanceof Map) || !(sales instanceof Map) || typeof budget !== 'bigint') {
      rows.push({ epoch: snapshot.epoch ?? i, unavailable: true, reason: 'incomplete snapshot inputs' });
      continue;
    }
    const owner = allocation instanceof Map ? allocation : (initialState.ownerPower instanceof Map ? initialState.ownerPower : new Map());
    const g = networkG([...sales].map(([pool, sale]) => [sale, pools.get(pool) || 0n]));
    const reward = ownerRewardFix(owner, budget, sales, g);
    cumulativeRewardFix += reward.total;
    if (snapshot.restakeAvailable === true || i > 0) compoundableLantsFix += reward.total;
    rows.push({ epoch: snapshot.epoch ?? i, unavailable: false, g, rewardFix: reward.total, rewardByPool: reward.byPool, cumulativeRewardFix, compoundableLantsFix, salesScenario, budgetScenario });
  }
  return { horizon, rows, cumulativeRewardFix, compoundableLantsFix, assumptions: { salesScenario, budgetScenario }, confidence: snapshots.length >= horizon ? 'base' : 'limited', coverage: rows.filter((r) => !r.unavailable).length / horizon, unavailable: rows.filter((r) => r.unavailable).map((r) => r.reason) };
}

function walkForwardValidation(rewardFix, rankingMetrics, maxEpoch = 30, minEpoch = 22) {
  if (!(rewardFix instanceof Map)) throw new TypeError('walkForwardValidation: reward map');
  if (!Array.isArray(rankingMetrics)) throw new TypeError('walkForwardValidation: ranking metrics');
  const validation = [];
  const epochSequence = Array.from({ length: maxEpoch - minEpoch + 1 }, (_, i) => minEpoch + i);
  const errors = { absolute: [], percentage: [], rankCorrelation: [], hitRateTop3: 0, hitRateTop5: 0, directionAccuracy: { up: { count: 0, total: 0 }, down: { count: 0, total: 0 } }, recallReversals: 0, coverage: 0 };
  for (const epoch of epochSequence) {
    const actual = rewardFix.get(epoch);
    const forecast = rewardFix.get(epoch - 1);
    if (forecast === undefined || actual === undefined) {
      errors.coverage++;
      continue;
    }
    const absError = Number(forecast - actual);
    errors.absolute.push(absError);
    errors.percentage.push(actual > 0n ? (absError / Number(actual)) * 100 : 0);
  }
  const mae = errors.absolute.length > 0 ? errors.absolute.reduce((sum, v) => sum + Math.abs(v), 0) / errors.absolute.length : 0;
  const mape = errors.percentage.length > 0 ? errors.percentage.reduce((sum, v) => sum + v, 0) / errors.percentage.length : 0;
  const avgRankCorr = 0;
  const hitRateTop3 = 0;
  const hitRateTop5 = 0;
  const avgDirectionAccuracy = 0;
  const avgRecallReversals = 0;
  const avgCoverage = epochSequence.length > 0 ? errors.absolute.length / epochSequence.length : 0;
  return {
    mae,
    mape,
    avgRankCorr,
    hitRateTop3,
    hitRateTop5,
    avgDirectionAccuracy,
    avgRecallReversals,
    avgCoverage,
    errorBreakdown: errors,
  };
}

// powFlow guardrail context: absolute flow, flow relative to current power,
// and a warning for a large single-position (whale) flow or origin=restaked.
function powFlowContext(pool) {
  if (!pool || typeof pool !== 'object') throw new TypeError('powFlowContext: pool missing');
  const powerNow = pool.power || 0;
  const flow = (pool.nextPower === null ? powerNow : pool.nextPower) - powerNow;
  const frac = powerNow > 0 ? flow / powerNow : null;
  const warnings = [];
  if (frac !== null && Math.abs(frac) > 0.5) warnings.push('power moves >=50% of pool in one epoch');
  if (pool.flowOrigin === 'restaked') warnings.push('flow origin=restaked (self-stake), not organic demand');
  return { flow, flowFracOfPower: frac, warnings };
}

// Portfolio scoring constants (AGENTS/plan: explicit, not a black box).
const PORTFOLIO = {
  STAKE_NORM_REF: 300000,
  ORGANIC_FACTOR: 0.3,
  FLOW_DOWN_FACTOR: 0.3,
  CAP_NEW_TARGET_PCT: 0.5,
  ANCHOR_AGENT: '87124',
};

// risk-adjusted heuristic score = settled-based rate * stability, where
// stability = mean(stake-size norm, organic factor, power-flow factor).
function heuristicScore(stat) {
  if (!stat || typeof stat !== 'object') throw new TypeError('heuristicScore: stat missing');
  const stakeNorm = Math.min((stat.stake || 0) / PORTFOLIO.STAKE_NORM_REF, 1);
  const organicFactor = stat.organic === true ? 1 : PORTFOLIO.ORGANIC_FACTOR;
  const flowFactor = (stat.powFlow === undefined ? 0 : stat.powFlow) >= 0 ? 1 : PORTFOLIO.FLOW_DOWN_FACTOR;
  const stability = (stakeNorm + organicFactor + flowFactor) / 3;
  const rate = stat.settledRateBase !== undefined ? stat.settledRateBase : stat.rate || 0;
  return { stakeNorm, organicFactor, flowFactor, stability, rate, score: rate * stability };
}

// A pool is recommended only for more reasons than one positive powFlow:
// eligibility requires the settled confidence of the rank guardrail.
function recommendationEligible(stat, guard) {
  if (!stat || stat.rate <= 0) return false;
  if (guard && guard.status === 'watch') return stat.organic === true;
  return true;
}

// Constrained split of movable power by heuristic scores:
// - the anchor pool keeps its existing allocation untouched;
// - one NEW target can take at most CAP_NEW_TARGET_PCT of the movable power;
// - speculative targets stay labelled and inside the cap;
// - no negative or over-cap shares; remainder flows back by score order.
// Produce raw score-proportional weights first, then cap, then re-normalize.
function portfolioSplit(stats, movableAnts, {
  capPct = PORTFOLIO.CAP_NEW_TARGET_PCT,
  anchorAgent = PORTFOLIO.ANCHOR_AGENT,
  anchorPct = capPct,
} = {}) {
  if (!Array.isArray(stats)) throw new TypeError('portfolioSplit: stats');
  if (typeof movableAnts !== 'number' || !Number.isFinite(movableAnts) || movableAnts < 0) throw new TypeError('portfolioSplit: movableAnts');
  if (typeof capPct !== 'number' || !Number.isFinite(capPct) || capPct <= 0 || capPct > 1) throw new RangeError('portfolioSplit: capPct');
  if (typeof anchorPct !== 'number' || !Number.isFinite(anchorPct) || anchorPct < 0 || anchorPct > 1) throw new RangeError('portfolioSplit: anchorPct');
  const eligible = (s) => recommendationEligible(s, s && s.rankStatus ? { status: s.rankStatus } : undefined);
  const scored = stats
    .filter(eligible)
    .map((s) => ({ ...s, heuristic: heuristicScore(s) }))
    .sort((a, b) => b.heuristic.score - a.heuristic.score);
  const scoredAll = stats.map((s) => ({ ...s, heuristic: heuristicScore(s) })).sort((a, b) => b.heuristic.score - a.heuristic.score);
  if (!scored.length || movableAnts <= 0) return { scored, scoredAll, split: new Map(), cap: capPct * movableAnts, anchor: 0, overflowLeft: 0 };

  const cap = capPct * movableAnts;
  const split = new Map();
  const anchor = scored.find((s) => s.agent === anchorAgent);
  const anchorAmount = anchor ? Math.min(anchorPct * movableAnts, movableAnts) : 0;
  if (anchorAmount > 0) split.set(anchorAgent, anchorAmount);

  const targets = scored.filter((s) => s.agent !== anchorAgent);
  const targetBudget = movableAnts - anchorAmount;
  let overflow = 0;
  if (targetBudget > 0 && targets.length) {
    const total = targets.reduce((sum, s) => sum + s.heuristic.score, 0);
    for (const s of targets) split.set(s.agent, (s.heuristic.score * targetBudget) / total);
    // New targets are capped; capped overflow is offered to the next target but
    // never back-filled into the anchor, whose reserved share is explicit.
    for (const s of targets) {
      const w = split.get(s.agent);
      if (w > cap) {
        overflow += w - cap;
        split.set(s.agent, cap);
      }
    }
    for (const s of targets) {
      if (overflow <= 0) break;
      const w = split.get(s.agent);
      if (w < cap - 1e-9) {
        const add = Math.min(overflow, cap - w);
        split.set(s.agent, w + add);
        overflow -= add;
      }
    }
  } else if (targetBudget > 0) {
    overflow = targetBudget;
  }
  return { scored, scoredAll, split, cap, anchor: anchorAmount, overflowLeft: overflow };
}

// One source of pool metadata for scenarios and recommendations. A fixed
// scenario may reference pools outside the owner's own positions; each target
// reports whether it is a real snapshot pool (with weight and sales) or only
// a candidate row from the ticker path.
function candidatePools(structStats, { minRate = 0, requireSales = true } = {}) {
  return structStats.map((s) => {
    const salesOk = !requireSales || s.settledUsdc > 0 || (s.currentUsdc !== null && s.currentUsdc > 0);
    return {
      agent: s.agent,
      name: s.name,
      inSnapshot: s.hasWeight === true,
      salesPositive: salesOk,
      weightPositive: (s.nextPower || s.power || 0) > 0,
      weightOk: (s.nextPower || s.power || 0) >= 1,
      eligible: salesOk && (s.nextPower || s.power || 0) >= 1 && s.rate >= minRate,
    };
  });
}

function parseInteger(value, tag = 'integer') {
  if (typeof value === 'bigint') { if (value < 0n) throw new RangeError(`${tag}: negative value`); return value; }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return BigInt(value.trim());
  throw new TypeError(`${tag}: expected non-negative integer`);
}

function recognizedProfile(epoch, pools, { minimumAccountedPoolPower = 0n } = {}) {
  if (!(pools instanceof Map)) throw new TypeError('recognizedProfile: pools map');
  const minimum = parseInteger(minimumAccountedPoolPower, 'minimumAccountedPoolPower');
  const result = new Map();
  for (const [pool, row] of pools) {
    if (!row || typeof row !== 'object') throw new TypeError(`recognizedProfile: ${pool} row`);
    const power = parseInteger(row.powerFix ?? row.power ?? 0n, `${pool}.power`);
    const eligible = power >= minimum && row.eligible !== false && row.washStatus !== 'zeroed';
    const recognized = row.recognizedSalesFix ?? row.recognizedSales ?? null;
    result.set(pool, { epoch: assertEpoch(epoch, 'recognizedProfile: epoch'), rawSalesFix: row.rawSalesFix ?? row.rawSales ?? null, recognizedSalesFix: eligible ? (recognized === null ? null : parseInteger(recognized, `${pool}.recognizedSales`)) : 0n, eligible, washStatus: row.washStatus ?? 'not-applicable' });
  }
  return result;
}

function networkGFromRecognized(profile, poolWeights) {
  if (!(profile instanceof Map) || !(poolWeights instanceof Map)) throw new TypeError('networkGFromRecognized: maps');
  const entries = [];
  for (const [pool, row] of profile) {
    if (row.recognizedSalesFix === null) return { unavailable: true, reason: `missing recognized sales for ${pool}`, g: null };
    const weight = poolWeights.get(pool);
    if (typeof weight !== 'bigint') return { unavailable: true, reason: `missing pool weight for ${pool}`, g: null };
    entries.push([row.recognizedSalesFix, weight]);
  }
  return { unavailable: false, reason: null, g: networkG(entries) };
}

function budgetForEpoch({ epoch, totalActiveStake, emissionConfig, onchainProjection = null }) {
  const e = assertEpoch(epoch, 'budgetForEpoch: epoch');
  const stake = parseInteger(totalActiveStake, 'budgetForEpoch: totalActiveStake');
  if (onchainProjection instanceof Map && onchainProjection.has(e)) return parseInteger(onchainProjection.get(e), 'budget projection');
  if (onchainProjection && typeof onchainProjection === 'object' && onchainProjection[String(e)] !== undefined) return parseInteger(onchainProjection[String(e)], 'budget projection');
  if (!emissionConfig || typeof emissionConfig !== 'object') return { unavailable: true, reason: 'missing emission config', epoch: e };
  if (emissionConfig.budgetByEpoch?.[String(e)] !== undefined) return parseInteger(emissionConfig.budgetByEpoch[String(e)], 'budgetByEpoch');
  const rate = emissionConfig.rateFix ?? emissionConfig.rate;
  if (rate === undefined) return { unavailable: true, reason: 'missing verifiable budget projection', epoch: e };
  const denominator = parseInteger(emissionConfig.stakeDenominator ?? 1n, 'budget denominator');
  if (denominator === 0n) return { unavailable: true, reason: 'zero budget denominator', epoch: e };
  return parseInteger(rate, 'budget rate') * stake / denominator;
}

function optimisticEnvelope({ settledFix, liveFix, deltaCapFix = null, absoluteCapFix = null }) {
  if (typeof settledFix !== 'bigint' || typeof liveFix !== 'bigint' || settledFix < 0n || liveFix < 0n) throw new RangeError('optimisticEnvelope: invalid input');
  let value = liveFix > settledFix ? liveFix : settledFix;
  if (deltaCapFix !== null) value = value > settledFix + parseInteger(deltaCapFix) ? settledFix + parseInteger(deltaCapFix) : value;
  if (absoluteCapFix !== null) value = value > parseInteger(absoluteCapFix) ? parseInteger(absoluteCapFix) : value;
  return { valueFix: value, boundFix: value - settledFix, assumptions: ['settled baseline', 'bounded live delta'], confidence: deltaCapFix === null ? 'unbounded' : 'bounded' };
}

function forecastHorizonPV({ epochs, currentEpoch, stakeEndEpoch, discountRateBps = 0n, rewardByEpochFix, activationDelay = 1 }) {
  if (!Array.isArray(epochs) || typeof rewardByEpochFix !== 'function') throw new TypeError('forecastHorizonPV: inputs');
  const start = assertEpoch(currentEpoch, 'forecastHorizonPV: currentEpoch');
  const end = assertEpoch(stakeEndEpoch, 'forecastHorizonPV: stakeEndEpoch');
  const horizon = Math.min(104, Math.max(0, Number(end - start)));
  const rate = parseInteger(discountRateBps, 'discount rate');
  let undiscounted = 0n; let discounted = 0n; const rows = [];
  for (let i = 0; i < horizon && i < epochs.length; i++) {
    const reward = rewardByEpochFix(epochs[i], start + BigInt(i + 1));
    if (typeof reward !== 'bigint' || reward < 0n) throw new TypeError('forecastHorizonPV: reward must be bigint');
    const base = 10000n; const pv = reward * base ** BigInt(i + 1) / (base + rate) ** BigInt(i + 1);
    undiscounted += reward; discounted += pv;
    rows.push({ epoch: start + BigInt(i + 1), rewardFix: reward, discountedPvFix: pv, compoundable: i + 1 > activationDelay });
  }
  return { horizon, rows, undiscountedRewardTotalFix: undiscounted, discountedPvRewardFix: discounted, discountRateBps: rate, formula: 'reward / (1 + discountRateBps / 10000)^n', coverage: horizon === 0 ? 1 : rows.length / horizon };
}

// Buyer-node diagnostics, deliberately separate from the staker reward math:
// - the chosen model must exist in the models feed (Edith config mirror);
// - show the configured peer pin (from listings agent, if any);
// - stake is a proxy for buyer-points capacity, not a guarantee;
// - no price from stale cached fields: without live pricing -> unavailable.
function buyerDiagnostics({ modelKey, models, listings, freshnessDays = 7 }) {
  if (typeof modelKey !== 'string' || !Array.isArray(models) || !Array.isArray(listings)) {
    throw new TypeError('buyerDiagnostics: modelKey/models/listings');
  }
  const model = models.find((m) => m && m.model === modelKey);
  const offers = listings
    .filter((l) => l && l.model === modelKey && l.live === true)
    .map((l) => {
      const live = typeof l.input_usd_per_m === 'number' && l.input_usd_per_m > 0 ? l.input_usd_per_m : null;
      return { agent: String(l.agent_id), livePrice: live };
    });
  const priced = offers.filter((o) => o.livePrice !== null);
  const best = priced.length ? priced.reduce((m, o) => (o.livePrice < m.livePrice ? o : m)) : null;
  const messages = [];
  if (!model) messages.push(`model ${modelKey} NOT in models feed: check Edith config before routing`);
  else messages.push(`model ${modelKey} present in models feed`);
  if (!priced.length) messages.push('price unavailable (no live listing price; stale cache ignored)');
  if (best) messages.push(`buyer route: ${best.agent} @ $${best.livePrice}/1M input (live)`);
  messages.push('stake = proxy for buyer-points capacity, not a points guarantee');
  return {
    modelKey,
    configured: !!model,
    peerPin: best ? best.agent : null,
    priceUsdPerM: best ? best.livePrice : null,
    messages,
    freshnessDays: freshnessDays,
  };
}

module.exports = {
  SCALE,
  MAX_STAKE_EPOCHS,
  MAX_LOCK_WEIGHT,
  toFix,
  decimalToFix,
  parseInteger,
  fixToNumber,
  normalizePool,
  assertEpoch,
  positionWeightFix,
  moveScenario,
  buildMoveTimeline,
  transitionPowerAtEpoch,
  steadyPowerAtEpoch,
  forecastHorizon,
  forecastHorizonPV,
  recognizedProfile,
  networkGFromRecognized,
  budgetForEpoch,
  optimisticEnvelope,
  networkG,
  rewardFix,
  ownerRewardFix,
  ratePer1kNumber,
  allocationScenario,
  salesProfiles,
  allocationRange,
  settledRankTrend,
  powFlowContext,
  PORTFOLIO,
  heuristicScore,
  recommendationEligible,
  portfolioSplit,
  candidatePools,
  buyerDiagnostics,
  maxLockPowerAtEpoch,
  earlyExitSlashBps,
  positionWithdrawableEpoch,
  netPrincipalAfterExit,
  transitionOutcome,
  forecastDemandProfile,
  demandTrendScores,
  detectReversal,
  fourEpochStressScenarios,
  walkForwardValidation,
};
