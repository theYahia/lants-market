import { rewardMode } from './metrics.mjs';

async function loadJSON(urls) {
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {
      // try next URL
    }
  }
  return null;
}

async function loadSnapshot() {
  const urls = [
    'https://raw.githubusercontent.com/theYahia/lants-market/data/live.json',
    'https://ipfs.filebase.io/ipns/k51qzi5uqu5di86efhnadxw0k1sxnuo2tkcmegxcn2ra2r3exyfpv9htxhit6b/fixtures/snapshot-e23.live.json',
    './fixtures/snapshot-e23.live.json'
  ];
  const data = await loadJSON(urls);
  if (!data) throw new Error('Failed to load incentive data.');
  return data;
}

async function loadOffers() {
  const data = await loadJSON([
    'https://raw.githubusercontent.com/theYahia/lants-market/data/offers.json',
    './offers.json'
  ]);
  if (!Array.isArray(data)) return null;
  return data;
}

function isValidOffer(offer, displayEpoch) {
  if (!offer || typeof offer !== 'object') return false;
  if (typeof offer.pool !== 'string' || !/^\d+$/.test(offer.pool)) return false;
  if (typeof offer.usdcPer1k !== 'number' || !(offer.usdcPer1k > 0)) return false;
  if (typeof offer.capAnts !== 'number' || !(offer.capAnts > 0)) return false;
  if (typeof offer.payer !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(offer.payer)) return false;
  if (!Array.isArray(offer.epochs)) return false;
  for (const ep of offer.epochs) {
    if (typeof ep !== 'number' || !Number.isInteger(ep)) return false;
    if (ep !== displayEpoch) return false;
  }
  if (offer.note !== undefined && offer.note !== null && typeof offer.note !== 'string') return false;
  if (typeof offer.note === 'string' && offer.note.length > 140) return false;
  return true;
}

function offerLine(offer, displayEpoch) {
  const usdc = offer.capAnts / 1000 * offer.usdcPer1k;
  let line = `${offer.usdcPer1k} USDC per 1,000 ANTS · Pool ${offer.pool} · epoch ${displayEpoch} · up to ${offer.capAnts} ANTS · max ${usdc} USDC`;
  if (offer.note) line += ` · ${offer.note}`;
  return line;
}

function buildOfferRows(offers, displayEpoch) {
  const rows = [];
  if (offers) {
    for (const offer of offers) {
      if (isValidOffer(offer, displayEpoch)) {
        rows.push(offerLine(offer, displayEpoch));
      }
    }
  }
  return rows;
}

function buildOfferSection(offers, displayEpoch) {
  const div = document.createElement('div');
  div.className = 'inc-offers';

  const headingRow = document.createElement('div');
  headingRow.className = 'inc-offers-head';

  const h3 = document.createElement('h3');
  h3.textContent = 'Offers';
  headingRow.appendChild(h3);

  const postBtn = document.createElement('a');
  postBtn.className = 'inc-post-offer';
  postBtn.textContent = 'Post an offer';
  const title = `Incentive offer for pool (epoch ${displayEpoch})`;
  const bodyLines = [
    'Pool: ',
    'epochs: ' + JSON.stringify([displayEpoch]),
    'USDC per 1,000 ANTS: ',
    'Cap: ',
    'Payer: '
  ];
  const body = bodyLines.join('\n');
  postBtn.href = 'https://github.com/theYahia/lants-market/issues/new?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
  postBtn.target = '_blank';
  postBtn.rel = 'noopener noreferrer';
  headingRow.appendChild(postBtn);

  div.appendChild(headingRow);

  const ul = document.createElement('ul');
  ul.className = 'inc-offers-list';

  if (offers === null) {
    const li = document.createElement('li');
    li.textContent = 'Offers unavailable';
    ul.appendChild(li);
  } else {
    const validRows = buildOfferRows(offers, displayEpoch);
    if (validRows.length === 0) {
      const li = document.createElement('li');
      li.textContent = `No offers for epoch ${displayEpoch} yet — be the first.`;
      ul.appendChild(li);
    } else {
      for (const row of validRows) {
        const li = document.createElement('li');
        li.textContent = row;
        ul.appendChild(li);
      }
    }
  }

  div.appendChild(ul);
  return div;
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

function buildBoard(snapshot, mode, offers, displayEpoch) {
  const e = Number(mode.epoch);
  const nextEpoch = String(e + 1);
  const vWei = BigInt(1000 * 104) * 10n ** 18n;
  const positions = snapshot.positions || [];
  const salesByPool = snapshot.salesByPool || {};
  const poolWeightByEpoch = snapshot.poolWeightByEpoch || {};

  // Best offer per pool: highest usdcPer1k among valid offers.
  const bestOfferByPool = new Map();
  if (offers) {
    for (const offer of offers) {
      if (!isValidOffer(offer, displayEpoch)) continue;
      const pool = offer.pool;
      const prev = bestOfferByPool.get(pool);
      if (!prev || offer.usdcPer1k > prev) {
        bestOfferByPool.set(pool, offer.usdcPer1k);
      }
    }
  }

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
    const tdOffer = document.createElement('td');
    const best = bestOfferByPool.get(pool);
    tdOffer.textContent = best !== undefined ? `${best} USDC per 1,000 ANTS` : '—';
    tr.appendChild(tdPool);
    tr.appendChild(tdStaked);
    tr.appendChild(tdSales);
    tr.appendChild(tdEst);
    tr.appendChild(tdOffer);
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
    const tdOffer = document.createElement('td');
    const best = bestOfferByPool.get(pool);
    tdOffer.textContent = best !== undefined ? `${best} USDC per 1,000 ANTS` : '—';
    tr.appendChild(tdPool);
    tr.appendChild(tdStaked);
    tr.appendChild(tdSales);
    tr.appendChild(tdEst);
    tr.appendChild(tdOffer);
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
    'Est. ANTS for 1,000 staked',
    'Offer'
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

    let offers = null;
    try {
      offers = await loadOffers();
    } catch {
      offers = null;
    }

    const header = document.createElement('div');
    header.className = 'inc-header';
    header.innerHTML = '';
    const title = document.createElement('h2');
    title.textContent = `Epoch ${N} · starts ${formatUtc(boundary)} · ${countdown}`;
    header.appendChild(title);

    const board = buildBoard(snapshot, mode, offers, N);

    const note = document.createElement('p');
    note.className = 'inc-note';
    if (mode.mode === 'live') {
      note.textContent = 'est., if this epoch\'s sales repeat';
    } else {
      note.textContent = 'est. after the first purchases this epoch';
    }

    const offerSection = buildOfferSection(offers, N);

    container.innerHTML = '';
    container.appendChild(header);
    container.appendChild(board);
    container.appendChild(note);
    container.appendChild(offerSection);
  } catch (err) {
    container.innerHTML = '<p>Failed to load incentive data.</p>';
  }
}

init();
