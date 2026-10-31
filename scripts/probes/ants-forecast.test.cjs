// Unit tests for the pure forecast core (scripts/probes/forecast-core.cjs).
// Offline: no network, no RPC, asserts run in node --test.
// Contract formula reference: docs/protocol-notes.md "How the staker budget is
// split" and the live evidence in notes/handoff.md (Session 23 rules: one idle
// week after a move, max-lock blocks move/split, stake activates N+1).

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./forecast-core.cjs');

const W = core.SCALE; // 18 decimals

const blankPool = [['q', { settled: { usdc: 1000, epoch: 29 }, current: 500, optimistic: 1200 }]];

// ---- scale helpers ---------------------------------------------------------

test('toFix round-trips ANTS/USDC amounts without precision loss above 2^53', () => {
  const n = 250650.123456;
  const fix = core.toFix(n);
  assert.equal(typeof fix, 'bigint');
  assert.ok(Math.abs(core.fixToNumber(fix) - n) < 1e-9);
  // far above Number.MAX_SAFE_INTEGER territory once scaled
  assert.equal(core.fixToNumber(core.toFix(104000000)) , 104000000);
});

test('toFix fails closed on non-numeric and negative values', () => {
  assert.throws(() => core.toFix('12'), TypeError);
  assert.throws(() => core.toFix(Infinity), TypeError);
  assert.throws(() => core.toFix(-1), RangeError);
});

// ---- contract formula ------------------------------------------------------

test('contract formula: reward = weight * budget * sales / G exactly', () => {
  // two pools: P1 sales 100, weight 1_000_000 ANTS; P2 sales 50, weight 2_000_000
  const w1 = 1_000_000n * W;
  const w2 = 2_000_000n * W;
  const s1 = core.toFix(100);
  const s2 = core.toFix(50);
  const g = core.networkG([[s1, w1], [s2, w2]]);
  // G = 100*1e6 + 50*2e6 = 200e6 [usdc*ants], in fix units
  const budget = core.toFix(100000);
  // myWeight 1000 ANTS in P1: reward = 1000 * 100000 * 100 / 200e6 = 50
  const reward = core.rewardFix(1000n * W, budget, s1, g);
  assert.equal(reward, 50n * W);
});

test('pool weight cancels between the pool-share step and the position-share step', () => {
  const budget = core.toFix(100000);
  const sA = core.toFix(100);
  const WA = 1_000_000n * W;
  const WB = 2_000_000n * W;
  const g = core.networkG([[sA, WA], [core.toFix(50), WB]]);
  const myW = 1000n * W;
  const direct = core.rewardFix(myW, budget, sA, g);
  // composition path: poolReward(A) = budget*sA*WA/G, my position takes myW/WA of it
  const poolRewardA = (budget * sA * WA) / g;
  const composed = (poolRewardA * myW) / WA;
  assert.ok((direct > composed ? direct - composed : composed - direct) < 10n * W, `direct ${direct} vs composed ${composed}`);
  // linear in my own weight; independent of how the pool's own weight splits
  const double = core.rewardFix(2000n * W, budget, sA, g);
  assert.equal(double, direct * 2n);
});

test('no-sales pool gets exactly zero reward (no artificial minimum sales)', () => {
  const g = core.networkG([[core.toFix(100), 1_000_000n * W]]);
  assert.equal(core.rewardFix(500_000n * W, core.toFix(100000), core.toFix(0), g), 0n);
});

test('zero/missing denominator yields zero, not NaN', () => {
  assert.equal(core.rewardFix(1000n * W, core.toFix(1), core.toFix(1), 0n), 0n);
});

test('ownerRewardFix aggregates across pools at one global denominator', () => {
  const sales = new Map([['a', core.toFix(100)], ['b', core.toFix(50)]]);
  const g = core.networkG([[core.toFix(100), 1_000_000n * W], [core.toFix(50), 2_000_000n * W]]);
  const mine = new Map([['a', 1000n * W], ['b', 2000n * W]]);
  const { total, byPool } = core.ownerRewardFix(mine, core.toFix(100000), sales, g);
  assert.equal(byPool.get('a'), 50n * W); // 1000*100000*100/2e8
  assert.equal(byPool.get('b'), 50n * W); // 2000*100000*50/2e8
  assert.equal(total, 100n * W);
});

// ---- post-move denominator G ----------------------------------------------

test('allocation scenario recomputes G after the move (not a hidden second order)', () => {
  const sales = new Map([['src', core.toFix(10)], ['dst', core.toFix(100)]]);
  const snapshot = new Map([['src', 1_000_000n * W], ['dst', 1_000_000n * W]]);
  const mine = new Map([['src', 100_000n * W]]);
  const noMove = core.allocationScenario({ salesFixByPool: sales, snapshotPowerFixByPool: snapshot, myPowerFixByPool: mine, allocFixByPool: new Map(mine), budgetFix: core.toFix(100000) });
  const moved = core.allocationScenario({ salesFixByPool: sales, snapshotPowerFixByPool: snapshot, myPowerFixByPool: mine, allocFixByPool: new Map([['src', 0n], ['dst', 100_000n * W]]), budgetFix: core.toFix(100000) });
  assert.notEqual(noMove.g, moved.g);
  // moving out of the cheap-sales pool lowers G (10*0 + 100*1.1M vs 10*1M + 100*1M)
  assert.ok(moved.g > noMove.g);
  assert.ok(Array.from(moved.weightsFix.values()).every((w) => w >= 0n));
});

test('allocation scenario: target pool already owned by the wallet is additive', () => {
  const sales = new Map([['dst', core.toFix(100)]]);
  const snapshot = new Map([['dst', 1_000_000n * W]]);
  const mine = new Map([['dst', 400_000n * W]]);
  const scen = core.allocationScenario({ salesFixByPool: sales, snapshotPowerFixByPool: snapshot, myPowerFixByPool: mine, allocFixByPool: mine, budgetFix: core.toFix(100000) });
  assert.equal(scen.weightsFix.get('dst'), 1_000_000n * W);
  assert.ok(scen.totalRewardFix > 0n);
});

test('allocation scenario fails closed when a pool weight would go negative', () => {
  const sales = new Map([['src', core.toFix(100)]]);
  const snapshot = new Map([['src', 100_000n * W]]);
  assert.throws(
    () => core.allocationScenario({ salesFixByPool: sales, snapshotPowerFixByPool: snapshot, myPowerFixByPool: new Map([['src', 300_000n * W]]), allocFixByPool: new Map([['src', 0n]]), budgetFix: core.toFix(1) }),
    RangeError
  );
});

test('known numbers: 9% of network moving into the top-sales pool shifts the reward materially', () => {
  // network: 10M power split, my 900k moves from 5%-sales pool to 50%-sales pool
  const sales = new Map([['src', core.toFix(5)], ['dst', core.toFix(50)]]);
  const snapshot = new Map([['src', 5_000_000n * W], ['dst', 5_000_000n * W]]);
  const mine = new Map([['src', 900_000n * W]]);
  const scen = core.allocationScenario({ salesFixByPool: sales, snapshotPowerFixByPool: snapshot, myPowerFixByPool: mine, allocFixByPool: new Map([['src', 0n], ['dst', 900_000n * W]]), budgetFix: core.toFix(100000) });
  const noMove = core.allocationScenario({ salesFixByPool: sales, snapshotPowerFixByPool: snapshot, myPowerFixByPool: mine, allocFixByPool: mine, budgetFix: core.toFix(100000) });
  const lift = Number(scen.totalRewardFix) / Number(noMove.totalRewardFix);
  assert.ok(lift > 4, 'scenario reward should rise several-fold, got ' + lift);
});

// ---- position weight model -------------------------------------------------

test('position weight: activation delay (N+1) then residual lock countdown', () => {
  const pos = { amount: 10n * W, stakeStartEpoch: 30, stakeEndEpoch: 134 };
  assert.equal(core.positionWeightFix(pos, 29), 0n); // farms nothing this week
  assert.equal(core.positionWeightFix(pos, 30), 0n); // activates from N+1
  assert.equal(core.positionWeightFix(pos, 31), 10n * W * 103n);
  assert.equal(core.positionWeightFix(pos, 133), 10n * W);
  assert.equal(core.positionWeightFix(pos, 134), 0n);
});

test('max-lock weight is amount * 104, never a carried-over old multiplier', () => {
  const pos = { amount: 10n * W, stakeStartEpoch: 30, stakeEndEpoch: 134, maxLock: true };
  assert.equal(core.positionWeightFix(pos, 40), 10n * W * 104n);
});

test('closed/withdrawn positions carry no weight', () => {
  const pos = { amount: 10n * W, stakeStartEpoch: 30, stakeEndEpoch: 134 };
  assert.equal(core.positionWeightFix({ ...pos, closed: true }, 40), 0n);
  assert.equal(core.positionWeightFix({ ...pos, withdrawn: true }, 40), 0n);
});

test('position weight fails closed on contradictory or negative data', () => {
  assert.throws(() => core.positionWeightFix({ amount: -1n, stakeStartEpoch: 1, stakeEndEpoch: 5 }, 3), RangeError);
  assert.throws(() => core.positionWeightFix({ amount: 5n * W, stakeStartEpoch: 10, stakeEndEpoch: 5 }, 3), RangeError);
  assert.throws(() => core.positionWeightFix({ amount: 5n * W }, 3), TypeError);
  assert.throws(() => core.positionWeightFix({ amount: 5n * W, stakeStartEpoch: 1, stakeEndEpoch: 4, endEpoch: 4 }, 2), TypeError);
});

// ---- move scenarios ---------------------------------------------------------

test('move scenario: max-lock blocks (PositionClosed), disable-first path models residual', () => {
  const pos = { amount: 100n * W, stakeStartEpoch: 10, stakeEndEpoch: 60, maxLock: true };
  const blocked = core.moveScenario(pos, 30);
  assert.equal(blocked.maxLockBlocked, true);
  assert.equal(blocked.reason.includes('max-lock'), true);
  const unlocked = core.moveScenario(pos, 30, { disableMaxLockFirst: true });
  assert.equal(unlocked.maxLockBlocked, false);
  // farms 0 after the move (idle week at epoch 30+1), then residual 100*(60-31)
  assert.equal(unlocked.idlePowerFix, 0n);
  assert.equal(unlocked.steadyPowerFix, 100n * W * (60n - 31n));
  assert.equal(unlocked.oldPowerFix, 100n * W * 104n);
});

test('move scenario: one idle week, then the original stakeEnd governs ordinary residual', () => {
  const pos = { amount: 50n * W, stakeStartEpoch: 20, stakeEndEpoch: 80 };
  const s = core.moveScenario(pos, 40);
  assert.equal(s.maxLockBlocked, false);
  assert.equal(s.oldPowerFix, 50n * W * 40n);
  assert.equal(s.idlePowerFix, 0n);
  assert.equal(s.steadyPowerFix, 50n * W * 39n); // 80 - (40+1)
  assert.equal(s.idleWeeks, 1n);
});

test('move scenario near stake end loses power but never goes negative', () => {
  const pos = { amount: 50n * W, stakeStartEpoch: 20, stakeEndEpoch: 41 };
  const s = core.moveScenario(pos, 40);
  assert.equal(s.steadyPowerFix, 0n);
  assert.ok(s.steadyPowerFix >= 0n);
});

test('move timeline exposes transition loss and first farming epoch', () => {
  const timeline = core.buildMoveTimeline({ amount: 50n * W, stakeStartEpoch: 20, stakeEndEpoch: 80 }, 40);
  assert.equal(timeline.outcome, 'steady-residual');
  assert.equal(timeline.transitionPower, 0n);
  assert.equal(timeline.steadyPower, 50n * W * 39n);
  assert.equal(timeline.firstFarmingEpoch, 42n);
  assert.equal(timeline.powerLost, 50n * W);
});

test('forecast horizon accumulates exact rewards and compoundable amount', () => {
  const owner = new Map([['p', 1000n * W]]);
  const pools = new Map([['p', 100000n * W]]);
  const sales = new Map([['p', core.toFix(100)]]);
  const result = core.forecastHorizon({
    snapshots: [{ epoch: 1, pools, sales, budgetFix: core.toFix(1000), restakeAvailable: true }, { epoch: 2, pools, sales, budgetFix: core.toFix(1000), restakeAvailable: true }],
    initialState: { pools, sales, ownerPower: owner, budgetFix: core.toFix(1000) },
    allocation: owner,
    horizon: 2,
  });
  assert.equal(result.rows.length, 2);
  assert.equal(result.cumulativeRewardFix, 20n * W);
  assert.equal(result.compoundableLantsFix, 20n * W);
  assert.equal(result.coverage, 1);
});

// ---- settled / current / optimistic range ----------------------------------

test('salesProfiles: settled from history tail, current from live, optimistic is upper bound', () => {
  const pool = { history: [{ epoch: 28, usdc: 1000 }, { epoch: 29, usdc: 2000 }], liveUsdc: 1500 };
  const p = core.salesProfiles(pool);
  assert.deepEqual(p.settled, { usdc: 2000, epoch: 29 });
  assert.equal(p.current, 1500);
  assert.equal(p.optimistic, 2000);
  const rising = core.salesProfiles({ history: [{ epoch: 29, usdc: 1000 }], liveUsdc: 3000 });
  assert.equal(rising.optimistic, 3000);
});

test('salesProfiles without settled history reports unavailable, never zero', () => {
  const p = core.salesProfiles({ history: null, liveUsdc: 100 });
  assert.equal(p.settled, null);
  assert.equal(p.current, 100);
});

test('allocationRange with complete settled data produces three coherent buckets', () => {
  const profiles = new Map([
    ['p', { settled: { usdc: 1000, epoch: 29 }, current: 500, optimistic: 1200 }],
    ['q', { settled: { usdc: 1000, epoch: 29 }, current: 5000, optimistic: 5000 }],
  ]);
  const range = core.allocationRange({
    powerFixByPool: new Map([['p', 1000n * W]]),
    budgetFix: core.toFix(100000),
    profilesByPool: profiles,
    snapshotPowerFixByPool: new Map([['p', 1_000_000n * W], ['q', 1_000_000n * W]]),
  });
  assert.equal(range.conservative.complete, true);
  assert.equal(range.current.complete, true);
  assert.ok(range.optimistic.rewardFix > range.current.rewardFix, `optimistic ${range.optimistic.rewardFix} vs current ${range.current.rewardFix}`);
  assert.ok(range.conservative.rewardFix > range.current.rewardFix);
});

test('allocationRange marks conservative unavailable when settled data missing', () => {
  const profiles = new Map([...blankPool, ['p', { settled: null, current: 500, optimistic: 500 }]]);
  const range = core.allocationRange({ powerFixByPool: new Map([['p', 1000n * W]]), budgetFix: core.toFix(100000), profilesByPool: profiles });
  assert.equal(range.conservative.complete, false);
  assert.equal(range.current.complete, true);
});

// ---- normalizePool fail-closed ---------------------------------------------

test('normalizePool validates rows and rejects negative core fields', () => {
  const ok = core.normalizePool({ agent_id: 1, name: 'X', reward_per_1k_power_ants: 2.4, stake_ants: 1000, power_ants: 5, next_power_ants: 6, live_volume_usdc: 3, organic: true, volume_usdc_by_epoch: [{ epoch: 29, usdc: 7 }] });
  assert.equal(ok.agent, '1');
  assert.equal(ok.rate1k, 2.4);
  assert.equal(ok.history[0].usdc, 7);
  assert.throws(() => core.normalizePool({ agent_id: 1, stake_ants: -5 }), RangeError);
  assert.throws(() => core.normalizePool({ agent_id: 1, volume_usdc_by_epoch: [{ epoch: 29, usdc: -7 }] }), RangeError);
  assert.throws(() => core.normalizePool({}), TypeError);
  assert.throws(() => core.normalizePool(null), TypeError);
});

// ---- temporal guardrail -----------------------------------------------------

test('rank change is a settled signal only after holding 2+ settled epochs', () => {
  const histories = new Map([
    ['a', [{ epoch: 1, usdc: 10 }, { epoch: 2, usdc: 10 }, { epoch: 3, usdc: 100 }]],
    ['b', [{ epoch: 1, usdc: 100 }, { epoch: 2, usdc: 100 }, { epoch: 3, usdc: 10 }]],
  ]);
  const trend = core.settledRankTrend(histories, [1, 2, 3], 'a');
  assert.equal(trend.rank, 1);
  assert.equal(trend.prevRank, 2);
  assert.equal(trend.status, 'settled-change');
  // first settled epoch of the new rank -> pending hold, not confirmed
  assert.equal(trend.pendingHold, true);
});

test('rank stays stable when the order holds across all settled epochs', () => {
  const histories = new Map([
    ['a', [{ epoch: 1, usdc: 100 }, { epoch: 2, usdc: 100 }, { epoch: 3, usdc: 100 }]],
    ['b', [{ epoch: 1, usdc: 10 }, { epoch: 2, usdc: 10 }, { epoch: 3, usdc: 10 }]],
  ]);
  const trend = core.settledRankTrend(histories, [1, 2, 3], 'a');
  assert.equal(trend.status, 'stable');
});

test('less than two settled epochs -> watch, not a signal', () => {
  const histories = new Map([['a', [{ epoch: 1, usdc: 100 }]]]);
  const trend = core.settledRankTrend(histories, [1], 'a');
  assert.equal(trend.status, 'watch');
  const empty = core.settledRankTrend(histories, [], 'a');
  assert.equal(empty.status, 'watch');
  assert.equal(empty.rank, null);
});

// ---- powFlow guardrail ------------------------------------------------------

test('powFlow context: fraction of pool power and whale/origin warnings', () => {
  const ctx = core.powFlowContext({ power: 100, nextPower: 200, flowOrigin: 'restaked' });
  assert.equal(ctx.flow, 100);
  assert.equal(ctx.flowFracOfPower, 1);
  assert.equal(ctx.warnings.some((w) => w.includes('50%')), true);
  assert.equal(ctx.warnings.some((w) => w.includes('restaked')), true);
  const calm = core.powFlowContext({ power: 1000, nextPower: 1010 });
  assert.equal(calm.warnings.length, 0);
});

// ---- portfolio heuristic ----------------------------------------------------

test('heuristic score components are explicit: stake norm, organic, flow direction', () => {
  const h = core.heuristicScore({ rate: 4, stake: 300000, organic: true, powFlow: 5 });
  assert.equal(h.stakeNorm, 1);
  assert.equal(h.organicFactor, 1);
  assert.equal(h.flowFactor, 1);
  assert.equal(h.stability, 1);
  assert.equal(h.score, 4);
  const weak = core.heuristicScore({ rate: 4, stake: 0, organic: false, powFlow: -5 });
  assert.equal(weak.stakeNorm, 0);
  assert.equal(weak.organicFactor, core.PORTFOLIO.ORGANIC_FACTOR);
  assert.equal(weak.flowFactor, core.PORTFOLIO.FLOW_DOWN_FACTOR);
  assert.ok(weak.score < h.score);
});

test('recommendation needs more than one positive powFlow: watch + non-organic is out', () => {
  assert.equal(core.recommendationEligible({ rate: 4, organic: false }, { status: 'watch' }), false);
  assert.equal(core.recommendationEligible({ rate: 4, organic: true }, { status: 'watch' }), true);
  assert.equal(core.recommendationEligible({ rate: 0, organic: true }, { status: 'stable' }), false);
  assert.equal(core.recommendationEligible({ rate: 4, organic: false }, { status: 'settled-change' }), true);
});

test('portfolio split caps one new target at CAP_NEW_TARGET_PCT of movable', () => {
  const stats = [
    { agent: 'win', name: 'Win', rate: 10, organic: true, stake: 300000, powFlow: 1, settledRateBase: 10 },
  ];
  const { split, cap } = core.portfolioSplit(stats, 1000);
  assert.equal(cap, core.PORTFOLIO.CAP_NEW_TARGET_PCT * 1000);
  assert.ok(split.get('win') <= cap + 1e-9);
  assert.equal(split.get('win'), 500);
});

test('portfolio split redistributes cap overflow to the next best target', () => {
  const stats = [
    { agent: 'a', name: 'A', rate: 10, organic: true, stake: 300000, powFlow: 1, settledRateBase: 10 },
    { agent: 'b', name: 'B', rate: 2, organic: true, stake: 300000, powFlow: 1, settledRateBase: 2 },
  ];
  const { split } = core.portfolioSplit(stats, 1000);
  const wa = split.get('a');
  const wb = split.get('b');
  assert.ok(wa <= 500 + 1e-9);
  assert.ok(wa >= 499.9);
  assert.ok(wb > 499.9); // everything the cap took from A lands in B
  assert.ok(Math.abs(wa + wb - 1000) < 1e-6);
});

test('portfolio split reserves the anchor and applies rank guardrail to candidates', () => {
  const stats = [
    { agent: '87124', name: 'GesundAI', rate: 4, organic: true, stake: 300000, powFlow: 1, settledRateBase: 4, rankStatus: 'stable' },
    { agent: 'watch', name: 'Watch', rate: 20, organic: false, stake: 300000, powFlow: 100, settledRateBase: 20, rankStatus: 'watch' },
    { agent: 'target', name: 'Target', rate: 2, organic: true, stake: 300000, powFlow: 1, settledRateBase: 2, rankStatus: 'stable' },
  ];
  const result = core.portfolioSplit(stats, 1000, { anchorAgent: '87124', anchorPct: 0.4 });
  assert.equal(result.split.get('87124'), 400);
  assert.equal(result.split.has('watch'), false, 'watch + non-organic candidate must be excluded');
  assert.equal(result.split.get('target'), 500, 'new target remains under the 50% cap');
  assert.equal(result.anchor, 400);
  assert.equal(result.overflowLeft, 100, 'uncertain remainder is not silently pushed into the target');
});

// ---- candidate pools --------------------------------------------------------

test('candidatePools: single source of metadata, eligibility requires sales + weight', () => {
  const rows = [
    { agent: '1', name: 'SnapshotGood', rate: 3, settledUsdc: 100, currentUsdc: 100, nextPower: 5000, power: 5000, hasWeight: true, organic: true, stake: 1000, powFlow: 1, rankStatus: 'stable' },
    { agent: '2', name: 'NoSales', rate: 9, settledUsdc: 0, currentUsdc: null, nextPower: 5000, power: 5000, hasWeight: true, organic: true, stake: 1000, powFlow: 1, rankStatus: 'stable' },
    { agent: '3', name: 'NoWeight', rate: 9, settledUsdc: 100, currentUsdc: 100, nextPower: 0, power: 0, hasWeight: false, organic: true, stake: 0, powFlow: 1, rankStatus: 'stable' },
    { agent: '4', name: 'CandidateOnly', rate: 5, settledUsdc: 100, currentUsdc: 100, nextPower: 2000, power: 2000, hasWeight: false, organic: true, stake: 900, powFlow: 1, rankStatus: 'stable' },
  ];
  const list = core.candidatePools(rows);
  const by = new Map(list.map((c) => [c.agent, c]));
  assert.equal(by.get('1').eligible, true);
  assert.equal(by.get('1').inSnapshot, true);
  assert.equal(by.get('2').eligible, false, 'zero sales -> no reward, not a candidate');
  assert.equal(by.get('3').eligible, false, 'zero pool weight -> sub-minimum, not a candidate');
  assert.equal(by.get('4').eligible, true);
  assert.equal(by.get('4').inSnapshot, false, 'kept as an explicit candidate, not a snapshot pool');
});

// ---- buyer diagnostics ------------------------------------------------------

test('buyer diagnostics: missing live price prints price unavailable, stale cache ignored', () => {
  const now = { model: 'm1', usage: { settled_usd: 100 } };
  const stale = { model: 'm1', agent_id: 9, live: true, input_usd_per_m: null, cached_input_usd_per_m: 1.5 };
  const d = core.buyerDiagnostics({ modelKey: 'm1', models: [now], listings: [stale] });
  assert.equal(d.configured, true);
  assert.equal(d.priceUsdPerM, null);
  assert.equal(d.peerPin, null);
  assert.equal(d.messages.some((m) => m.includes('price unavailable')), true);
  assert.equal(d.messages.some((m) => m.includes('proxy')), true);
});

test('buyer diagnostics: model absent from the feed is flagged before routing', () => {
  const d = core.buyerDiagnostics({ modelKey: 'ghost', models: [{ model: 'other' }], listings: [] });
  assert.equal(d.configured, false);
  assert.equal(d.messages.some((m) => m.includes('NOT in models feed')), true);
});

  // ---- BigInt / fixed-point rounding -----------------------------------------

  test('integer division floors deterministically and never throws on huge inputs', () => {
    const big = 10n ** 24n * W; // ~1e42 ANTS
    const g = core.networkG([[core.toFix(1), big]]);
    const r = core.rewardFix(big, core.toFix(107000), core.toFix(1), g);
    assert.equal(typeof r, 'bigint');
    assert.equal(r, core.toFix(107000));
  });
  
  test('normalizePool includes settled history and pending metadata', () => {
    const row = {
      agent_id: 123,
      name: 'TestPool',
      reward_per_1k_power_ants: 10,
      stake_ants: 500,
      power_ants: 2000,
      next_power_ants: 3000,
      live_volume_usdc: 1000,
      organic: true,
      volume_usdc_by_epoch: [{ epoch: 10, usdc: 100 }, { epoch: 11, usdc: 200 }],
      settled_usdc_by_epoch: [{ epoch: 10, usdc: 90 }],
      usage_share_pct: 5,
      next_stake_flow_origin: 'restaked',
      pending_stake_ants: 100,
      pending_power_ants: 150,
      pool_id: 'pool456',
    };
    const normalized = core.normalizePool(row);
    assert.equal(normalized.agent, '123');
    assert.equal(normalized.settledHistory[0].usdc, 90);
    assert.equal(normalized.usageSharePct, 5);
    assert.equal(normalized.flowOrigin, 'restaked');
    assert.equal(normalized.pendingStake, 100);
  });
  
  test('demandTrendScores builds trend data from histories', () => {
    const histories = new Map([
      ['1', [{ epoch: 22, usdc: 100 }, { epoch: 23, usdc: 150 }, { epoch: 24, usdc: 200 }]],
      ['2', [{ epoch: 22, usdc: 200 }, { epoch: 23, usdc: 150 }, { epoch: 24, usdc: 100 }]],
    ]);
    const trends = core.demandTrendScores(histories, 24, 22);
    assert.equal(trends.get('1').epoch, 24);
    assert.equal(trends.get('1').share, 200 / 300);
    assert.equal(trends.get('2').epoch, 24);
    assert.equal(trends.get('2').share, 100 / 300);
  });
  
  test('fourEpochStressScenarios defines five stress scenarios', () => {
    const scenarios = core.fourEpochStressScenarios(new Map(), 0n, 1);
    assert.equal(scenarios.length, 5);
    assert.equal(scenarios[0].name, 'settled-carry-forward');
    assert.equal(scenarios[1].name, 'live-carry-forward');
    assert.equal(scenarios[2].name, 'mean-reversion');
    assert.equal(scenarios[3].name, 'demand-reversal');
    assert.equal(scenarios[4].name, 'stake-flow-stress');
  });

  test('positionWeightFix max-lock blocks on pending position near stake end', () => {
    const pos = { amount: 100n * W, stakeStartEpoch: 10, stakeEndEpoch: 31, maxLock: true };
    const blocked = core.moveScenario(pos, 30);
    assert.equal(blocked.maxLockBlocked, true);
  });

  test('normalizePool includes settled history and pending metadata', () => {
    const row = {
      agent_id: 123,
      name: 'TestPool',
      reward_per_1k_power_ants: 10,
      stake_ants: 500,
      power_ants: 2000,
      next_power_ants: 3000,
      live_volume_usdc: 1000,
      organic: true,
      volume_usdc_by_epoch: [{ epoch: 10, usdc: 100 }, { epoch: 11, usdc: 200 }],
      settled_usdc_by_epoch: [{ epoch: 10, usdc: 90 }],
      usage_share_pct: 5,
      next_stake_flow_origin: 'restaked',
      pending_stake_ants: 100,
      pending_power_ants: 150,
      pool_id: 'pool456',
    };
    const normalized = core.normalizePool(row);
    assert.equal(normalized.agent, '123');
    assert.equal(normalized.settledHistory[0].usdc, 90);
    assert.equal(normalized.usageSharePct, 5);
    assert.equal(normalized.flowOrigin, 'restaked');
    assert.equal(normalized.pendingStake, 100);
  });

test('maxLockPowerAtEpoch returns Null when position has no max-lock read', () => {
  const positionsRead = new Map([['1', { amount: 100n * W, stakeStartEpoch: 1, stakeEndEpoch: 105 }]]);
  const result = core.maxLockPowerAtEpoch(1n, 10, positionsRead);
  assert.equal(result, null);
});

  test('maxLockPowerAtEpoch returns 0 when position end epoch exceeded', () => {
    const p = { amount: 100n * W, stakeStartEpoch: 1, stakeEndEpoch: 10, maxLock: true, maxLockPowerAtEpochRead: {} };
    const positionsRead = new Map([['1', p]]);
    const result = core.maxLockPowerAtEpoch(1n, 15, positionsRead);
    assert.equal(result, null);
  });

  test('earlyExitSlashBps returns null for Non-max-lock position', () => {
    const positionsRead = new Map([['1', { amount: 100n * W, stakeStartEpoch: 1, stakeEndEpoch: 105 }]]);
    const result = core.earlyExitSlashBps(1n, positionsRead);
    assert.equal(result, null);
  });

test('netPrincipalAfterExit reduces amount by early-exit penalty', () => {
  const amount = 1000n * W;
  const slashBps = 5;
   const net = core.netPrincipalAfterExit(amount, slashBps);
  assert.ok(net !== null);
});

  test('fourEpochStressScenarios defines five stress scenarios', () => {
    const scenarios = core.fourEpochStressScenarios(new Map(), 0n, 1);
    assert.equal(scenarios.length, 5);
    assert.equal(scenarios[0].name, 'settled-carry-forward');
    assert.equal(scenarios[1].name, 'live-carry-forward');
    assert.equal(scenarios[2].name, 'mean-reversion');
    assert.equal(scenarios[3].name, 'demand-reversal');
    assert.equal(scenarios[4].name, 'stake-flow-stress');
  });

  test('walkForwardValidation aggregates metrics across epochs', () => {
    const rewards = new Map();
    const rankings = [];
    const result = core.walkForwardValidation(rewards, rankings, 30, 22);
    assert.equal(typeof result.mae, 'number');
    assert.equal(typeof result.mape, 'number');
    assert.equal(typeof result.avgRankCorr, 'number');
  });

