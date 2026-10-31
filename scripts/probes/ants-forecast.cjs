// Staker allocation forecast. Read-only, never sends a transaction.
//
// Pure math lives in scripts/probes/forecast-core.cjs (unit-tested); this CLI
// only fetches inputs, replaces Number arithmetic with the BigInt/fixed-point
// core and prints the report. Four outputs, kept separate:
//   1. Diagnostic - a price-elasticity model of each pool's usage share
//      (lambda fit vs realised usage_share_pct; price alone under-explains).
//   2. Contract forecast - positionReward = budget*sales*weight/G, computed in
//      fixed point for each scenario, with the real transition week, the
//      post-move global denominator G and a settled/current/optimistic range.
//      reward_per_1k_power_ants is kept as a cross-check rate, not a substitute.
//   3. Structural signal + guardrails - settled rank trend (a change is only a
//      signal after it holds 2+ settled epochs), powFlow context, live momentum
//      as a warning. Portfolio = risk-adjusted heuristic score with an explicit
//      cap per new target and a preserved anchor pool (GesundAI).
//   4. Buyer-node diagnostics - separate block, never mixed with reward math:
//      model in the feed, peer pin, live price (or 'price unavailable'), stake
//      as buyer-points proxy.
//
// Usage: node scripts/probes/ants-forecast.cjs [--rpc <url>]

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ProxyAgent, fetch: proxyFetch } = require('undici');
const { createPublicClient, http, fallback, parseAbi } = require('viem');
const { base } = require('viem/chains');
const core = require('./forecast-core.cjs');

const ORIGIN = 'https://antseedstats.com';
const OPERATOR = '0x3d4cccfaa3b25997f4ab33f838558521259eef1b';
const POOLS = '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652';
const OUR = ['52894', '87124', '44694']; // Apex, GesundAI (anchor), Open Forge
const BUYER_MODEL_DEFAULT = 'qwen/qwen3.5-397b-a17b';

const SECRETS = path.join(os.homedir(), '.config', 'kilo', 'secrets');
const args = process.argv.slice(2);
const rpcIdx = args.indexOf('--rpc');
const rpcOverride = rpcIdx >= 0 ? args[rpcIdx + 1] : null;

const ABI = parseAbi([
  'function currentEpoch() view returns (uint256)',
  'function stakerEpochBudget(uint256) view returns (uint256)',
  'function stakerPositionCount(address) view returns (uint256)',
  'function stakerPositionIds(address,uint256,uint256) view returns (uint256[])',
  'function positions(uint256) view returns (address,uint256,uint256,uint256,uint64,uint64,uint64,bool)',
  'function positionWeightAtEpoch(uint256,uint256) view returns (uint256)',
  'function positionMaxLockPowerAtEpoch(uint256,uint256) view returns (uint256)',
  'function earlyExitSlashBps(uint256) view returns (uint256)',
  'function positionWithdrawableEpoch(uint256) view returns (uint256)',
]);

function readSecret(n) { try { return fs.readFileSync(path.join(SECRETS, n), 'utf8').trim(); } catch { return null; } }
const statProxyUrl = process.env.ANTS_PROXY || readSecret('proxies-ru.txt');

async function fetchOnce(url) {
  if (statProxyUrl) {
    try {
      const a = new ProxyAgent({ uri: statProxyUrl });
      const r = await proxyFetch(url, { headers: { accept: 'application/json' }, dispatcher: a });
      if (r && r.ok) return r.json();
      throw new Error('proxy http ' + (r && r.status));
    } catch (e) { /* fall through to direct */ }
  }
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (r && r.ok) return r.json();
  throw new Error('http ' + (r && r.status));
}

async function fetchJson(url) {
  let last;
  for (let i = 0; i < 5; i++) {
    try { return await fetchOnce(url); } catch (e) { last = e; }
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  throw last;
}

async function paginate(pathName, page, key) {
  const out = [];
  for (let off = 0; off < 50000; off += page) {
    const j = await fetchJson(`${ORIGIN}${pathName}?limit=${page}&offset=${off}`);
    const list = (j.data && j.data[key]) || [];
    out.push(...list);
    if (list.length < page) break;
  }
  return out;
}

const num = (v) => { const n = typeof v === 'string' ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) ? n : null; };
const fmt = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });
const ants = (fix) => Number(fix / core.SCALE) + Number(fix % core.SCALE) / 1e18;
const fmtAnts = (fix) => fmt(ants(fix));
const pctFix = (a, b) => (b > 0n ? ((Number(a) - Number(b)) / Number(b)) * 100 : 0);
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const powFlowContextFor = (pool, origin) => core.powFlowContext({ power: pool.power || 0, nextPower: pool.nextPower, flowOrigin: origin || null });

function priceIn(l) { const p = num(l.input_usd_per_m) ?? num(l.cached_input_usd_per_m); return p !== null && p > 0 ? p : null; }

function buildTrust(listings) {
  const f = new Map();
  for (const l of listings) {
    if (l.live !== true) continue;
    const a = String(l.agent_id);
    const x = f.get(a) || { t: 0, v: 0 };
    if (l.trusted === true) x.t++;
    if (l.verified === true) x.v++;
    f.set(a, x);
  }
  return new Map([...f].map(([a, x]) => [a, x.t + x.v > 0 ? 1 : 0.1]));
}

function predictShares(demand, listings, lambda, trust) {
  const offers = new Map();
  for (const l of listings) {
    if (l.live !== true) continue;
    const p = priceIn(l);
    if (p === null) continue;
    const o = offers.get(l.model) || [];
    o.push({ agent: String(l.agent_id), price: p });
    offers.set(l.model, o);
  }
  const captured = new Map();
  for (const [model, meta] of demand) {
    const o = offers.get(model);
    if (!o || !o.length) continue;
    const w = o.map((x) => (trust ? (trust.get(x.agent) ?? 0.1) : 1) * Math.pow(x.price, -lambda));
    const s = w.reduce((a, b) => a + b, 0);
    if (!(s > 0)) continue;
    o.forEach((x, i) => captured.set(x.agent, (captured.get(x.agent) || 0) + meta.usd * (w[i] / s)));
  }
  let total = 0;
  for (const v of captured.values()) total += v;
  const shares = new Map();
  for (const [a, v] of captured) shares.set(a, total > 0 ? v / total : 0);
  return { shares, captured, total };
}

function rmseAgainst(poolMeta, shares) {
  let err = 0, n = 0;
  for (const [a, r] of poolMeta) {
    const t = num(r.usage_share_pct);
    if (t === null || t <= 0) continue;
    err += t / 100 * Math.pow((shares.get(a) || 0) - t / 100, 2);
    n++;
  }
  return Math.sqrt(err / (n || 1));
}

function fitLambda(demand, listings, poolMeta, trust) {
  let best = { lambda: 3, err: Infinity };
  for (const lambda of [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 7, 10]) {
    const { shares } = predictShares(demand, listings, lambda, trust);
    const err = rmseAgainst(poolMeta, shares);
    if (err < best.err) best = { lambda, err };
  }
  return best;
}

function rpcTransport(rpcUrl) {
  const candidates = ['https://base-rpc.publicnode.com', 'https://base.drpc.org', 'https://mainnet.base.org'];
  if (rpcUrl && !/publicnode\\.com|drpc\\.org|mainnet\\.base\\.org/.test(rpcUrl)) candidates.unshift(rpcUrl);
  return fallback(candidates.map((u) => http(u)));
}

const ANCILLARY_ABI = parseAbi([
  'function positionMaxLockPowerAtEpoch(uint256,uint256) view returns (uint256)',
  'function earlyExitSlashBps(uint256) view returns (uint256)',
  'function positionWithdrawableEpoch(uint256) view returns (uint256)',
]);

async function readMyPositionsExtended(rpcUrl) {
  const c = createPublicClient({ chain: base, transport: rpcTransport(rpcUrl), batch: { multicall: true } });
  const read = (f, x = []) => c.readContract({ address: POOLS, abi: ABI, functionName: f, args: x }).catch(() => null);
  const readAncillary = (f, x = []) => c.readContract({ address: POOLS, abi: ANCILLARY_ABI, functionName: f, args: x }).catch(() => null);
  const epoch = await read('currentEpoch');
  const count = await read('stakerPositionCount', [OPERATOR]);
  if (epoch === null || count === null) return null;
  const ids = await read('stakerPositionIds', [OPERATOR, 0n, count]);
  if (!Array.isArray(ids)) return null;
  const next = Number(epoch) + 1;
  const maxLockReads = new Map();
  const earlyExitReads = new Map();
  const withdrawableReads = new Map();
  for (const id of ids) {
    const p = await read('positions', [id]);
    if (!p) continue;
    const active = Number(p[4]) <= next && Number(p[6]) === 0 && !p[7] && Number(p[5]) >= next;
    const maxLockPower = active ? await readAncillary('positionMaxLockPowerAtEpoch', [id, BigInt(next)]).catch(() => null) : null;
    const earlyExitSlashBps = await readAncillary('earlyExitSlashBps', [id]).catch(() => null);
    const withdrawableEpoch = await readAncillary('positionWithdrawableEpoch', [id]).catch(() => null);
    if (maxLockPower !== null) maxLockReads.set(Number(id), maxLockPower);
    if (earlyExitSlashBps !== null) earlyExitReads.set(Number(id), Number(earlyExitSlashBps));
    if (withdrawableEpoch !== null) withdrawableReads.set(Number(id), Number(withdrawableEpoch));
  }
  return { maxLockReads, earlyExitReads, withdrawableReads };
}

async function readMyPositions(rpcUrl) {
  const c = createPublicClient({ chain: base, transport: rpcTransport(rpcUrl), batch: { multicall: true } });
  const read = (f, x = []) => c.readContract({ address: POOLS, abi: ABI, functionName: f, args: x }).catch(() => null);
  const epoch = await read('currentEpoch');
  const count = await read('stakerPositionCount', [OPERATOR]);
  if (epoch === null || count === null) return null;
  const ids = await read('stakerPositionIds', [OPERATOR, 0n, count]);
  if (!Array.isArray(ids)) return null;
  const next = Number(epoch) + 1;
  const rows = [];
  const maxLockReads = new Map();
  const earlyExitReads = new Map();
  const withdrawableReads = new Map();
  for (const id of ids) {
    const p = await read('positions', [id]);
    if (!p) continue;
    const active = Number(p[4]) <= next && Number(p[6]) === 0 && !p[7] && Number(p[5]) >= next;
    const weight = active ? await read('positionWeightAtEpoch', [id, BigInt(next)]) : null;
    const maxLockPower = active ? await read('positionMaxLockPowerAtEpoch', [id, BigInt(next)]).catch(() => null) : null;
    const earlyExitSlashBps = await read('earlyExitSlashBps', [id]).catch(() => null);
    const withdrawableEpoch = await read('positionWithdrawableEpoch', [id]).catch(() => null);
    if (maxLockPower !== null) maxLockReads.set(Number(id), maxLockPower);
    if (earlyExitSlashBps !== null) earlyExitReads.set(Number(id), earlyExitSlashBps);
    if (withdrawableEpoch !== null) withdrawableReads.set(Number(id), withdrawableEpoch);
    rows.push({
      id: Number(id),
      agent: String(p[1]),
      amountWei: p[2],
      weightWei: weight ?? null,
      stakeStartEpoch: Number(p[4]),
      stakeEndEpoch: Number(p[5]),
      closedEpoch: Number(p[6]),
      withdrawn: !!p[7],
      maxLock: active && maxLockPower !== null && maxLockPower > 0n,
      maxLockPowerAtEpochRead: maxLockReads,
      earlyExitSlashBpsRead: earlyExitReads,
      withdrawableEpochRead: withdrawableReads,
    });
  }
  return { epoch: Number(epoch), next, rows };
}

async function main() {
  const rpcUrl = rpcOverride || process.env.ANTS_RPC || 'https://base-rpc.publicnode.com';
  const [poolsJson, models, listings] = await Promise.all([
    fetchJson(`${ORIGIN}/api/v1/staking/pools`),
    paginate('/api/v1/models', 200, 'models'),
    paginate('/api/v1/prices', 500, 'listings'),
  ]);
  const demand = new Map();
  for (const m of models) {
    const usd = num(m.usage && m.usage.settled_usd);
    if (usd !== null && usd >= 0) demand.set(m.model, { usd, video: m.video_generation === true });
  }
  const rowsRaw = (poolsJson.data && poolsJson.data.rows) || [];
  let poolMeta = new Map();
  for (const r of rowsRaw) {
    try { poolMeta.set(String(r.agent_id), core.normalizePool(r)); } catch (e) { console.error('pool skipped (fail-closed):', String(e.message)); }
  }
  console.log('(snapshot schema/v1 normalized; settled history and pending metadata included)');
  const head = poolsJson.data || {};
  const budgetRaw = num(head.projection && head.projection.budget_ants) ?? num(head.budget_ants);
  const rpcBudgetClient = createPublicClient({ chain: base, transport: rpcTransport(rpcOverride || process.env.ANTS_RPC || 'https://base-rpc.publicnode.com') });
  const onchainBudget = await rpcBudgetClient.readContract({ address: POOLS, abi: ABI, functionName: 'stakerEpochBudget', args: [BigInt(num(head.current_epoch) ?? 0) + 1n] }).catch(() => null);
  const apiBudgetFix = budgetRaw !== null && budgetRaw > 0 ? core.toFix(budgetRaw) : null;
  const budgetMismatch = apiBudgetFix !== null && onchainBudget !== null && apiBudgetFix !== onchainBudget;
  const budgetFix = budgetMismatch || (apiBudgetFix === null && onchainBudget === null) ? 0n : (onchainBudget ?? apiBudgetFix);
  const budget = budgetFix > 0n ? core.fixToNumber(budgetFix) : 0;
  if (budgetMismatch) console.log('budget unavailable: API and on-chain stakerEpochBudget mismatch');
  else if (budgetFix === 0n) console.log('budget unavailable from API/RPC - scenario rewards need it, diagnostic output only.');

  const trust = buildTrust(listings);
  const fitPrice = fitLambda(demand, listings, poolMeta, null);
  const fitTrust = fitLambda(demand, listings, poolMeta, trust);
  const pred = predictShares(demand, listings, fitTrust.lambda, trust);

  console.log(`models ${demand.size} | listings ${listings.length} | pools ${poolMeta.size} | budget ${budget ? fmt(budget) : '?'}`);
  console.log(`price-only lambda=${fitPrice.lambda} RMSE=${fitPrice.err.toFixed(3)} | price*trust lambda=${fitTrust.lambda} RMSE=${fitTrust.err.toFixed(3)}  (vs realised usage_share; lower = better)`);
  console.log('price alone under-explains usage share (RMSE high, big pools mis-ranked): list price is endogenous.\n');

  console.log('pool      settled(last)  formula(trust)   reward/1kPower  nextPower');
  for (const [a, r] of [...poolMeta.entries()].sort((x, y) => (num(rowsRaw.find((q) => String(q.agent_id) === x[0])?.usage_share_pct) || 0) - (num(rowsRaw.find((q) => String(q.agent_id) === y[0])?.usage_share_pct) || 0))) {
    const raw = rowsRaw.find((q) => String(q.agent_id) === a);
    const live = num(raw && raw.usage_share_pct);
    if ((live ?? 0) <= 0) continue;
    console.log(
      pad(a, 9),
      padL(((live ?? 0).toFixed(1) + '%'), 17),
      padL((((pred.shares.get(a) || 0) * 100).toFixed(1) + '%'), 17),
      padL(String(r.rate1k ?? 0), 12),
      padL(String(fmt(r.nextPower ?? 0)), 12)
    );
  }

  // ---- structural signal + guardrails -------------------------------------
  let settledEp = 0;
  for (const p of poolMeta.values()) for (const e of p.history || []) settledEp = Math.max(settledEp, Number(e.epoch));
  const liveTot = [...poolMeta.values()].reduce((s, r) => s + (r.liveUsdc || 0), 0) || 1;
  const settledTot = [...poolMeta.values()].reduce((s, r) => {
    const h = r.history || [];
    const e = h.length ? h[h.length - 1] : null;
    return s + (e ? e.usdc : 0);
  }, 0) || 1;
  console.log('\nstructural signal (settled vs live momentum vs stake flow vs powFlow guardrail):');
  console.log(pad('pool', 20) + padL('settled%', 8) + padL('live%', 7) + padL('mom', 7) + padL('rank', 9) + padL('stkFlow', 10) + padL('powFlow', 11) + '  rate/1k  guardrail');
  const struct = [];
  for (const [a, r] of poolMeta) {
    const h = r.history || [];
    const settledEntry = h.length ? h[h.length - 1] : null;
    const settled = (settledEntry ? settledEntry.usdc : 0) / settledTot * 100;
    const live = ((r.liveUsdc || 0) / liveTot) * 100;
    const stake = r.stake || 0;
    const flow = (r.nextStake === null ? stake : r.nextStake) - stake;
    const flowCtx = { flow, flowPct: r.power > 0 ? (flow / r.power) * 100 : null, origin: rowsRaw.find((q) => String(q.agent_id) === a)?.next_stake_flow_origin || null };
    if (stake <= 0 && settled <= 0) continue;
    struct.push({
      agent: a, name: r.name, settled, live, mom: live - settled,
      h, settledEntry, rate: r.rate1k || 0, organic: r.organic, stake, flow, flowCtx,
      pool: r,
    });
  }
  struct.sort((x, y) => y.rate - x.rate);
  const settledEpochsAsc = [...new Set(struct.flatMap((s) => (s.h || []).map((e) => Number(e.epoch))))].sort((a, b) => a - b);
  const histories = new Map([...poolMeta].map(([a, r]) => [a, r.history || []]));
  for (const s of struct) {
    const trend = core.settledRankTrend(histories, settledEpochsAsc, s.agent);
    const powCtx = powFlowContextFor(s.pool, null);
    s.rankTrend = trend;
    s.powCtx = powCtx;
    const mom = (s.mom >= 0 ? '+' : '') + s.mom.toFixed(1);
    const flowStr = s.flow >= 0 ? '+' + fmt(s.flow) : fmt(s.flow);
    const powF = (powCtx.flow >= 0 ? '+' : '') + fmt(Math.round(powCtx.flow));
    const rank = trend.rank === null ? '-' : trend.prevRank === null ? '' + trend.rank : `${trend.prevRank}>${trend.rank}`;
    const guard = trend.status === 'watch' ? 'watch(<2 settled)' : trend.status === 'settled-change' ? `settled-change${trend.pendingHold ? ' (1st epoch)' : ' (holds 2+)'}` : 'stable';
    console.log(
      pad(String(s.name).slice(0, 20), 20) +
      s.settled.toFixed(1).padStart(7) + '%' +
      s.live.toFixed(1).padStart(6) + '%' +
      mom.padStart(7) +
      padL(rank, 9) +
      padL(flowStr, 10) +
      padL(powF, 11) +
      '  ' + s.rate.toFixed(2) +
      (s.organic ? '' : '  !org') +
      ('  ' + guard + (powCtx.warnings.length ? ' | ' + powCtx.warnings.join('; ') : ''))
    );
  }

  // ---- chain positions -----------------------------------------------------
  const ancillary = await readMyPositionsExtended(rpcUrl);
  const pos = await readMyPositions(rpcUrl);
  if (!pos) { console.log('\n(chain read failed - no reward forecast)'); return; }
  const myPowerWei = new Map();
  const amtWei = new Map();
  const netPrincipalByAgent = new Map();
  for (const r of pos.rows) {
    if (r.withdrawn || r.closedEpoch !== 0) continue;
    if (r.weightWei === null) continue;
    const a = r.agent;
    myPowerWei.set(a, (myPowerWei.get(a) || 0n) + r.weightWei);
    amtWei.set(a, (amtWei.get(a) || 0n) + r.amountWei);
    const amountFix = r.amountWei;
    const slashBps = Number.isInteger(r.earlyExitSlashBpsRead) ? r.earlyExitSlashBpsRead : 0;
    const netPred = core.netPrincipalAfterExit(amountFix, slashBps);
    netPrincipalByAgent.set(a, netPred);
  }

  console.log(`\nmy active positions @epoch ${pos.next}:`);
  console.log(pad('  id', 8) + pad('pool', 9) + pad('name', 24) + padL('stake', 10) + padL('power', 12) + padL('net principal', 15) + '  move-scenario');
  for (const r of pos.rows) {
    const info = poolMeta.get(r.agent);
    const scenario = !r.withdrawn && r.closedEpoch === 0 && r.weightWei !== null
      ? core.moveScenario(
        {
          amount: r.amountWei,
          stakeStartEpoch: r.stakeStartEpoch,
          stakeEndEpoch: r.stakeEndEpoch,
          maxLock: r.maxLock,
          closed: false, withdrawn: false,
        },
        pos.next
      )
      : null;
    const netPrincipal = netPrincipalByAgent.get(r.agent);
    const netPrincipalStr = netPrincipal !== null ? fmtAnts(netPrincipal) : '-';
    const note = scenario
      ? scenario.maxLockBlocked ? 'max-lock ON: move reverts (PositionClosed())'
        : `idle week power 0, steady ${fmtAnts(scenario.steadyPowerFix)} (now ${fmtAnts(scenario.oldPowerFix)}) after ${scenario.transitionWeeks} ep`
      : 'inactive/closed';
    console.log(
      pad(' #' + String(r.id), 7) + pad(r.agent, 9) + pad(info ? String(info.name).slice(0, 23) : '?', 24) +
      padL(fmt(core.fixToNumber(r.amountWei)), 10) + padL(r.weightWei === null ? '-' : fmtAnts(r.weightWei), 12) + padL(netPrincipalStr, 15) + '  ' + note
    );
  }

  const apex = myPowerWei.get('52894') || 0n;
  const gai = myPowerWei.get('87124') || 0n;
  const forge = myPowerWei.get('44694') || 0n;

  // pool sales profiles + snapshot weights in fixed point
  const salesFix = new Map();
  const snapshotPowerFix = new Map();
  for (const [a, r] of poolMeta) {
    const profiles = core.salesProfiles(r);
    salesFix.set(a, { profiles });
    const snap = r.nextPower === null ? (r.power === null ? 0 : r.power) : r.nextPower;
    let w = snap > 0 ? core.toFix(snap) : 0n;
    const mine = myPowerWei.get(a) || 0n;
    if (mine > w) { w = mine; console.log(`note: pool ${a} chain power exceeds snapshot nextPower; using chain value for the floor`); }
    snapshotPowerFix.set(a, w);
  }

  const movableAntsFix = amtWei.get('52894') || 0n;
  const movableAnts = core.fixToNumber(movableAntsFix);
  const movablePowerWei = apex;
  const movFix = (pct) => (movablePowerWei * BigInt(Math.round(pct * 100))) / 100n;
  const allocs = [
    ['no change', new Map(myPowerWei)],
    ['all Apex -> GesundAI', new Map([['52894', 0n], ['87124', gai + apex], ['44694', forge]])],
    ['all Apex -> Open Forge', new Map([['52894', 0n], ['87124', gai], ['44694', forge + apex]])],
    ['60/40 GesundAI/Forge', new Map([['52894', 0n], ['87124', gai + movFix(0.6)], ['44694', forge + movFix(0.4)]])],
    ['46/31/23 A/G/F', new Map([['52894', movFix(0.46)], ['87124', gai + movFix(0.31)], ['44694', forge + movFix(0.23)]])],
  ];

  const profilesByPool = new Map();
  for (const [a, s] of salesFix) profilesByPool.set(a, s.profiles);

  console.log(`\nscenario forecast (fixed point; budget ${fmt(budget)} ANTS/epoch):`);
  console.log(pad('scenario', 27) + padL('settled', 13) + padL('current', 13) + padL('optimistic', 13) + padL('first-order(API)', 17) + padL('post-move G, dG%', 16));
  const firstOrderReward = (alloc) => {
    let t = 0;
    for (const [a, w] of alloc) {
      const r = poolMeta.get(a);
      t += (Number(w / core.SCALE) / 1000) * (r && r.rate1k ? r.rate1k : 0);
    }
    return t;
  };
  for (const [name, aalloc] of allocs) {
    const range = core.allocationRange({ powerFixByPool: aalloc, budgetFix: budgetFix, profilesByPool: profilesByPool, snapshotPowerFixByPool: snapshotPowerFix });
    const scen = core.allocationScenario({
      salesFixByPool: new Map([...profilesByPool].map(([a, p]) => [a, core.toFix(p.current ?? 0)])),
      snapshotPowerFixByPool: snapshotPowerFix,
      myPowerFixByPool: myPowerWei,
      allocFixByPool: aalloc,
      budgetFix: budgetFix,
    });
    const firstOrder = firstOrderReward(aalloc);
    const g0cur = core.networkG([...snapshotPowerFix].map(([a, w]) => [core.toFix(profilesByPool.get(a).current ?? 0), w]));
    const dG = pctFix(scen.g, g0cur);
    console.log(
      pad('  ' + name, 27) +
      padL(String(range.conservative.complete ? fmtAnts(range.conservative.rewardFix) : 'unavail'), 13) +
      padL(fmtAnts(range.current.rewardFix), 13) +
      padL(fmtAnts(range.optimistic.rewardFix), 13) +
      padL(fmt(firstOrder), 17) +
      padL(fmt(dG) + '%', 16)
    );
  }
  console.log('settled = last closed epoch sales; current = live snapshot; optimistic = upper scenario only.');
  console.log('post-move G % is relative to the unchanged-allocation G at current sales - a material effect at ~9% of network power.');

  // ---- risk-adjusted heuristic portfolio (capped) --------------------------
  const cands = core.candidatePools(struct.map((s) => ({
    agent: s.agent, name: s.name, rate: s.rate,
    settledUsdc: s.settledEntry ? s.settledEntry.usdc : 0,
    currentUsdc: s.pool.liveUsdc,
    nextPower: s.pool.nextPower,
    power: s.pool.power,
    hasWeight: (s.pool.nextPower || s.pool.power || 0) > 0,
    organic: s.organic,
    stake: s.stake,
    powFlow: s.powCtx.flow,
    rankStatus: s.rankTrend.status,
    rankHolds: s.rankTrend.status === 'stable',
  })));
  console.log('\ncandidate pools (single source of metadata; inSnapshot = real pool weight in the API snapshot):');
  console.log(pad('agent', 9) + pad('name', 22) + padL('rate', 7) + padL('inSnap', 8) + padL('salesOK', 9) + padL('weight>=1', 11) + '  eligible');
  for (const c of cands.filter((c) => c.eligible || c.inSnapshot)) {
    console.log(pad(c.agent, 9) + pad(String(c.name).slice(0, 21), 22) + padL(String(fmt(num(struct.find((s) => s.agent === c.agent)?.rate ?? 0))), 7) +
      padL(String(c.inSnapshot), 8) + padL(String(c.salesPositive), 9) + padL(String(c.weightOk), 11) + '  ' + String(c.eligible));
  }

  const stats = struct.map((s) => ({
    agent: s.agent, name: s.name, rate: s.rate, organic: s.organic, stake: s.stake, powFlow: s.powCtx.flow,
    settledRateBase: num(head.reward_per_1k_power_ants) === null ? s.rate : s.rate,
    rankStatus: s.rankTrend.status,
  }));
  const portfolio = core.portfolioSplit(stats, movableAnts);
  if (movableAnts > 0 && portfolio.split.size) {
    console.log(`\nrisk-adjusted heuristic split of movable ${fmt(movableAnts)} ANTS (${fmtAnts(movablePowerWei)} power; cap ${(core.PORTFOLIO.CAP_NEW_TARGET_PCT * 100).toFixed(0)}% per new target, anchor GesundAI 87124):`);
    console.log(pad('candidate', 16) + padL('score', 9) + padL('stability', 10) + padL('share%', 8) + padL('ANTS', 12));
    for (const s of portfolio.scored) {
      const w = portfolio.split.get(s.agent) || 0;
      if (w <= 0) continue;      console.log(pad(String(s.name).slice(0, 15), 16) + padL(s.heuristic.score.toFixed(3), 9) + padL(s.heuristic.stability.toFixed(2), 10) +
        padL(((w / movableAnts) * 100).toFixed(0) + '%', 8) + padL(fmt(w), 12) +
        (s.agent === core.PORTFOLIO.ANCHOR_AGENT ? '  [anchor]' : s.rankStatus === 'watch' ? '  [watch, eligible only while organic]' : ''));
    }
    const palloc = new Map();
    for (const [a, w] of myPowerWei) palloc.set(a, a === '52894' ? 0n : w);
    for (const [a, w] of portfolio.split) {
      palloc.set(a, (palloc.get(a) || 0n) + (movablePowerWei * BigInt(Math.round((w / movableAnts) * 100))) / 100n);
    }
    console.log('heuristic split is a decision aid (score components printed above), not a statistical forecast.');
  }

  // ---- buyer-node diagnostics (separate block) -----------------------------
  const buyerKey = process.env.ANTS_BUYER_MODEL || BUYER_MODEL_DEFAULT;
  const diag = core.buyerDiagnostics({ modelKey: buyerKey, models, listings });
  console.log('\nbuyer-node diagnostics (separate from staker forecast):');
  for (const m of diag.messages) console.log('  - ' + m);
  console.log('staker budget/projection and buyer routing stay independent decisions; no config pins changed here.');
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
