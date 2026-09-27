import { rewardMode } from './metrics.mjs';

async function loadSnapshot() {
  const urls = [
    'https://raw.githubusercontent.com/theYahia/lants-market/data/live.json',
    'https://ipfs.filebase.io/ipns/k51qzi5uqu5di86efhnadxw0k1sxnuo2tkcmegxcn2ra2r3exyfpv9htxhit6b/fixtures/snapshot-e23.live.json',
    './fixtures/snapshot-e23.live.json'
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {
      // try next URL
    }
  }
  throw new Error('Failed to load incentive data.');
}

// Epoch boundary base: epoch 25 starts 2026-10-01T09:54:21Z, each next +7 days.
const EPOCH_BASE = new Date('2026-10-01T09:54:21Z');
const EPOCH_BASE_NUM = 25;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function epochBoundary(epochNum) {
  return new Date(EPOCH_BASE.getTime() + (epochNum - EPOCH_BASE_NUM) * WEEK_MS);
}

function formatCountdown(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}

function formatUtc(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const pad = (n) => String(n).padStart(2, '0');
  return `${weekdays[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function buildBoard(snapshot, mode) {
  const e = Number(mode.epoch);
  const nextEpoch = String(e + 1);
  const vWei = BigInt(1000 * 104) * 10n ** 18n;
  const positions = snapshot.positions || [];
  const salesByPool = snapshot.salesByPool || {};
  const poolWeightByEpoch = snapshot.poolWeightByEpoch || {};

  // Aggregate rewards and register pools in order of first appearance
  const poolReward = new Map();
  const poolOrder = [];
  for (const pos of positions) {
    const pool = String(pos.agentId);
    const reward = BigInt(pos.rewardByEpoch?.[String(e)] || 0);
    if (!poolReward.has(pool)) {
      poolReward.set(pool, 0n);
      poolOrder.push(pool);
    }
    poolReward.set(pool, poolReward.get(pool) + reward);
  }

  const ranked = [];
  const unranked = [];
  for (const pool of poolOrder) {
    const wNext = BigInt(poolWeightByEpoch?.[pool]?.[nextEpoch] || 0);
    if (wNext === 0n) {
      unranked.push(pool);
      continue;
    }
    const rE = poolReward.get(pool);
    const estWei = rE * vWei / (wNext + vWei);
    ranked.push({ pool, estWei, wNext, rE });
  }

  // Sort strictly by estWei descending using BigInt comparison;
  // stable for identical estWei (preserve poolOrder).
  const rankedWithIndex = ranked.map((item, idx) => ({ ...item, idx }));
  rankedWithIndex.sort((a, b) => {
    if (a.estWei > b.estWei) return -1;
    if (a.estWei < b.estWei) return 1;
    return a.idx - b.idx;
  });

  const isLive = mode.mode === 'live';
  const stakedAmount = (wNext) => {
    const ants = Number(wNext) / 1e18 / 104;
    return ants.toFixed(2);
  };
  const salesText = (pool) => {
    const val = salesByPool[pool];
    if (val === undefined || val === null) return '—';
    return (Number(val) / 1e6).toFixed(0);
  };

  const rows = [];
  for (const { pool, estWei, wNext } of rankedWithIndex) {
    const tr = document.createElement('tr');
    tr.className = 'board-row';
    const tdPool = document.createElement('td');
    tdPool.textContent = pool;
    const tdStaked = document.createElement('td');
    tdStaked.textContent = stakedAmount(wNext);
    const tdSales = document.createElement('td');
    tdSales.textContent = salesText(pool);
    const tdEst = document.createElement('td');
    if (isLive) {
      tdEst.textContent = (Number(estWei) / 1e18).toFixed(2);
    } else {
      tdEst.textContent = 'est. after the first purchases this epoch';
    }
    tr.appendChild(tdPool);
    tr.appendChild(tdStaked);
    tr.appendChild(tdSales);
    tr.appendChild(tdEst);
    rows.push(tr);
  }

  for (const pool of unranked) {
    const tr = document.createElement('tr');
    tr.className = 'board-row';
    const tdPool = document.createElement('td');
    tdPool.textContent = pool;
    const tdStaked = document.createElement('td');
    const wNext = BigInt(poolWeightByEpoch?.[pool]?.[nextEpoch] || 0);
    tdStaked.textContent = wNext === 0n ? '0.00' : stakedAmount(wNext);
    const tdSales = document.createElement('td');
    tdSales.textContent = salesText(pool);
    const tdEst = document.createElement('td');
    tdEst.textContent = 'not counted next epoch';
    tr.appendChild(tdPool);
    tr.appendChild(tdStaked);
    tr.appendChild(tdSales);
    tr.appendChild(tdEst);
    rows.push(tr);
  }

  const table = document.createElement('table');
  table.className = 'inc-board-table';
  const thead = document.createElement('thead');
  const headTr = document.createElement('tr');
  const headings = [
    'Pool',
    'Staked (ANTS, max-lock eq.)',
    'Sales, lifetime (USDC)',
    'Est. ANTS for 1,000 staked'
  ];
  for (const h of headings) {
    const th = document.createElement('th');
    th.textContent = h;
    headTr.appendChild(th);
  }
  thead.appendChild(headTr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const tr of rows) {
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

async function init() {
  const container = document.getElementById('incentives');
  if (!container) return;

  try {
    const snapshot = await loadSnapshot();
    const mode = rewardMode(snapshot);
    const e = Number(mode.epoch);
    const N = e + 1;
    const boundary = epochBoundary(N);
    const now = new Date();
    const countdownMs = boundary.getTime() - now.getTime();
    const countdown = formatCountdown(countdownMs);

    const header = document.createElement('div');
    header.className = 'inc-header';
    header.innerHTML = '';
    const title = document.createElement('h2');
    title.textContent = `Epoch ${N} · starts ${formatUtc(boundary)} · ${countdown}`;
    header.appendChild(title);

    const board = buildBoard(snapshot, mode);

    const note = document.createElement('p');
    note.className = 'inc-note';
    if (mode.mode === 'live') {
      note.textContent = 'est., if this epoch\'s sales repeat';
    } else {
      note.textContent = 'est. after the first purchases this epoch';
    }

    container.innerHTML = '';
    container.appendChild(header);
    container.appendChild(board);
    container.appendChild(note);
  } catch (err) {
    container.innerHTML = '<p>Failed to load incentive data.</p>';
  }
}

init();
