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
    'https://raw.githubusercontent.com/theYahia/lants-market/main/site/offers.json',
    './offers.json'
  ]);
  if (!Array.isArray(data)) return null;
  return data;
}

async function loadPoolNames() {
  const data = await loadJSON([
    'https://raw.githubusercontent.com/theYahia/lants-market/main/site/pool-names.json',
    './pool-names.json'
  ]);
  if (!data || typeof data !== 'object') return {};
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
  if (offer.pays !== 'all' && offer.pays !== 'new') return false;
  if (offer.note !== undefined && offer.note !== null && typeof offer.note !== 'string') return false;
  if (typeof offer.note === 'string' && offer.note.length > 140) return false;
  return true;
}

function offerLine(offer, displayEpoch, poolNames) {
  const usdc = offer.capAnts / 1000 * offer.usdcPer1k;
  const name = poolNames[offer.pool];
  const prefix = name ? `${name} (pool ${offer.pool})` : `Pool ${offer.pool}`;
  const rule = offer.pays === 'new' ? 'new stakes only' : 'all stakers, pro rata';
  const payer = `${offer.payer.slice(0, 6)}…${offer.payer.slice(-4)}`;
  const line = `${prefix} · ${offer.usdcPer1k} USDC per 1,000 ANTS at max lock · epoch ${displayEpoch} · ${rule} · max ${usdc} USDC for the first ${offer.capAnts.toLocaleString('en-US')} ANTS · paid by ${payer}`;
  return { line, note: offer.note || '' };
}

function buildOfferRows(offers, displayEpoch, poolNames) {
  const rows = [];
  if (offers) {
    for (const offer of offers) {
      if (isValidOffer(offer, displayEpoch)) {
        rows.push(offerLine(offer, displayEpoch, poolNames));
      }
    }
  }
  return rows;
}

function buildOfferSection(offers, displayEpoch, poolNames) {
  const div = document.createElement('div');
  div.className = 'inc-offers';

  const headingRow = document.createElement('div');
  headingRow.className = 'inc-offers-head';

  const h3 = document.createElement('h3');
  h3.textContent = 'Offers';
  headingRow.appendChild(h3);

  const postBtn = document.createElement('a');
  postBtn.className = 'inc-post-offer';
  postBtn.textContent = 'Post an offer on GitHub ↗';
  const title = `Incentive offer for pool (epoch ${displayEpoch})`;
  const bodyLines = [
    'Pool: ',
    'epochs: ' + JSON.stringify([displayEpoch]),
    'USDC per 1,000 ANTS: ',
    'Cap: ',
    'Payer: ',
    'Pays: all | new',
    'Paid in USDC on Base to the position owner within 7 days after epoch ' + displayEpoch + ' ends, from the last published snapshot of epoch ' + displayEpoch + '.'
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
    const validRows = buildOfferRows(offers, displayEpoch, poolNames);
    if (validRows.length === 0) {
      const li = document.createElement('li');
      li.textContent = `No offers for epoch ${displayEpoch} yet — be the first.`;
      ul.appendChild(li);
    } else {
      for (const row of validRows) {
        const li = document.createElement('li');
        li.textContent = row.line;
        if (row.note) {
          const note = document.createElement('span');
          note.className = 'inc-offer-note';
          note.textContent = row.note;
          li.appendChild(note);
        }
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

// Staker budget of epoch N as the rewards contract projects it; null for older snapshots or another epoch.
function nextBudget(snapshot, N) {
  if (!snapshot.stakerBudgetNext || snapshot.stakerBudgetNextEpoch !== String(N)) return null;
  return Number(BigInt(snapshot.stakerBudgetNext)) / 1e18;
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

function buildCalculator(snapshot, mode, offers, displayEpoch, poolNames) {
  const container = document.createElement('div');
  container.className = 'inc-calc';

  const h3 = document.createElement('h3');
  h3.textContent = 'Estimated rewards calculator';
  container.appendChild(h3);

  const poolLabel = document.createElement('label');
  poolLabel.textContent = 'Pool: ';
  const poolSelect = document.createElement('select');

  const e = Number(mode.epoch);
  const N = e + 1;
  const nextEpoch = String(N);
  const positions = snapshot.positions || [];

  // Aggregate position data per pool: R, We, WN
  const poolData = new Map();
  for (const pos of positions) {
    const pool = String(pos.agentId);
    const reward = Number(pos.rewardByEpoch?.[String(e)] || 0) / 1e18;
    const we = Number(pos.weightsByEpoch?.[String(e)] || 0) / 1e18;
    const wn = Number(pos.weightsByEpoch?.[nextEpoch] || 0) / 1e18;
    if (!poolData.has(pool)) {
      poolData.set(pool, { R: 0, We: 0, WN: 0 });
    }
    const data = poolData.get(pool);
    data.R += reward;
    data.We += we;
    data.WN += wn;
  }

  const poolOrder = [...poolData.keys()];

  // Compute k, B, S
  let B = 0;
  for (const data of poolData.values()) {
    B += data.R;
  }
  B = nextBudget(snapshot, N) ?? B;
  const kMap = new Map();
  for (const [pool, data] of poolData.entries()) {
    kMap.set(pool, data.We > 0 ? data.R / data.We : 0);
  }
  let S = 0;
  for (const [pool, data] of poolData.entries()) {
    S += kMap.get(pool) * data.WN;
  }

  // Compute est for a pool with given v
  const estForPool = (pool, v) => {
    const data = poolData.get(pool);
    if (!data) return 0;
    const k = kMap.get(pool) || 0;
    if (k === 0 || S === 0) return 0;
    return B * v * k / (S + k * v);
  };

  const defaultPool = '52894';
  if (!poolOrder.includes(defaultPool) && defaultPool) {
    poolOrder.unshift(defaultPool);
    poolReward.set(defaultPool, poolReward.get(defaultPool) || 0n);
  }

  for (const pool of poolOrder) {
    const option = document.createElement('option');
    option.value = pool;
    const name = poolNames[pool];
    option.textContent = name ? `${name} · ${pool}` : pool;
    if (pool === defaultPool) option.selected = true;
    poolSelect.appendChild(option);
  }

  const yLabel = document.createElement('label');
  yLabel.textContent = 'Amount of ANTS: ';
  const yInput = document.createElement('input');
  yInput.type = 'number';
  yInput.min = '0';
  yInput.step = '1';
  yInput.value = '';
  yInput.placeholder = '0';

  poolLabel.appendChild(poolSelect);
  yLabel.appendChild(yInput);
  container.appendChild(poolLabel);
  container.appendChild(document.createElement('br'));
  container.appendChild(yLabel);
  container.appendChild(document.createElement('br'));

  const output = document.createElement('p');
  output.className = 'inc-calc-output';
  container.appendChild(output);

  function update() {
    const Y = Number(yInput.value);
    if (!yInput.value || !(Y > 0)) {
      output.textContent = '';
      return;
    }
    const pool = poolSelect.value;
    if (!pool) {
      output.textContent = '';
      return;
    }
    const poolWeights = snapshot.poolWeightByEpoch?.[pool];
    const wNext = poolData.get(pool)?.WN || 0;
    if (wNext === 0) {
      output.textContent = 'This pool is not counted next epoch.';
      return;
    }
    const v = Y * 104;
    const estAnts = estForPool(pool, v);

    let usdc = '—';
    if (offers) {
      let best = null;
      for (const offer of offers) {
        if (!isValidOffer(offer, displayEpoch)) continue;
        if (offer.pool !== pool) continue;
        if (!best || offer.usdcPer1k > best.usdcPer1k) best = offer;
      }
      if (best) {
        if (best.pays === 'new') {
          let newN = 0;
          for (const pos of positions) {
            if (String(pos.agentId) === pool && Number(pos.stakeStartEpoch) === displayEpoch) {
              newN += Number(pos.weightsByEpoch?.[String(displayEpoch)] || 0) / 1e18 / 104;
            }
          }
          const usdcValue = Math.min(Y, Math.max(0, best.capAnts - newN)) / 1000 * best.usdcPer1k;
          usdc = usdcValue.toFixed(2) + ' USDC';
        } else if (best.pays === 'all') {
          const wN = (poolData.get(pool)?.WN || 0) / 104;
          const usdcValue = Y / 1000 * best.usdcPer1k * Math.min(1, best.capAnts / (wN + Y));
          usdc = usdcValue.toFixed(2) + ' USDC';
        }
      }
    }

    output.textContent = `${estAnts.toFixed(2)} ANTS est. (max lock) · ${usdc}`;
  }

  poolSelect.addEventListener('input', update);
  yInput.addEventListener('input', update);
  update();

  return container;
}

function buildBoard(snapshot, mode, offers, displayEpoch, poolNames) {
  const e = Number(mode.epoch);
  const N = e + 1;
  const nextEpoch = String(N);
  const positions = snapshot.positions || [];
  const salesByPool = snapshot.salesByPool || {};

  // Aggregate position data per pool: R, We, WN
  const poolData = new Map();
  for (const pos of positions) {
    const pool = String(pos.agentId);
    const reward = Number(pos.rewardByEpoch?.[String(e)] || 0) / 1e18;
    const we = Number(pos.weightsByEpoch?.[String(e)] || 0) / 1e18;
    const wn = Number(pos.weightsByEpoch?.[nextEpoch] || 0) / 1e18;
    if (!poolData.has(pool)) {
      poolData.set(pool, { R: 0, We: 0, WN: 0 });
    }
    const data = poolData.get(pool);
    data.R += reward;
    data.We += we;
    data.WN += wn;
  }

  // Compute k, B, S
  let B = 0;
  for (const data of poolData.values()) {
    B += data.R;
  }
  B = nextBudget(snapshot, N) ?? B;
  const kMap = new Map();
  for (const [pool, data] of poolData.entries()) {
    kMap.set(pool, data.We > 0 ? data.R / data.We : 0);
  }
  let S = 0;
  for (const [pool, data] of poolData.entries()) {
    S += kMap.get(pool) * data.WN;
  }

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

  // Compute est for a pool with given v
  const estForPool = (pool, v) => {
    const data = poolData.get(pool);
    if (!data) return 0;
    const k = kMap.get(pool) || 0;
    if (k === 0 || S === 0) return 0;
    return B * v * k / (S + k * v);
  };

  const ranked = [];
  const unranked = [];
  for (const [pool, data] of poolData.entries()) {
    if (data.WN > 0) {
      const v = 1000 * 104;
      const est = estForPool(pool, v);
      ranked.push({ pool, est, WN: data.WN });
    } else {
      unranked.push(pool);
    }
  }

  // Sort by est descending, stable by insertion order
  const rankedWithIndex = ranked.map((item, idx) => ({ ...item, idx }));
  rankedWithIndex.sort((a, b) => {
    if (a.est > b.est) return -1;
    if (a.est < b.est) return 1;
    return a.idx - b.idx;
  });

  const isLive = mode.mode === 'live';
  const stakedAmount = (WN) => {
    return (WN / 104).toFixed(2);
  };
  const salesText = (pool) => {
    const val = salesByPool[pool];
    if (val === undefined || val === null) return '—';
    return (Number(val) / 1e6).toFixed(0);
  };

  const rows = [];
  for (const { pool, est, WN } of rankedWithIndex) {
    const tr = document.createElement('tr');
    tr.className = 'board-row';
    tr.dataset.pool = pool;
    const name = poolNames[pool];
    tr.dataset.name = name || pool;
    tr.dataset.staked = String(WN / 104);
    const salesVal = salesByPool[pool];
    tr.dataset.sales = salesVal === undefined || salesVal === null ? '-1' : String(Number(salesVal) / 1e6);
    tr.dataset.est = isLive ? String(est) : '-1';
    const bestOfferVal = bestOfferByPool.get(pool);
    tr.dataset.offer = bestOfferVal === undefined ? '-1' : String(bestOfferVal);
    const tdPool = document.createElement('td');
    if (name) {
      tdPool.textContent = name;
      const idSpan = document.createElement('span');
      idSpan.className = 'inc-pool-id';
      idSpan.textContent = pool;
      tdPool.appendChild(idSpan);
    } else {
      tdPool.textContent = pool;
    }
    const tdStaked = document.createElement('td');
    tdStaked.textContent = stakedAmount(WN);
    const tdSales = document.createElement('td');
    tdSales.textContent = salesText(pool);
    const tdEst = document.createElement('td');
    if (isLive) {
      tdEst.textContent = est.toFixed(2);
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
    tr.dataset.pool = pool;
    const name = poolNames[pool];
    tr.dataset.name = name || pool;
    tr.dataset.staked = '0';
    const salesVal = salesByPool[pool];
    tr.dataset.sales = salesVal === undefined || salesVal === null ? '-1' : String(Number(salesVal) / 1e6);
    tr.dataset.est = '-1';
    const bestOfferVal = bestOfferByPool.get(pool);
    tr.dataset.offer = bestOfferVal === undefined ? '-1' : String(bestOfferVal);
    const tdPool = document.createElement('td');
    if (name) {
      tdPool.textContent = name;
      const idSpan = document.createElement('span');
      idSpan.className = 'inc-pool-id';
      idSpan.textContent = pool;
      tdPool.appendChild(idSpan);
    } else {
      tdPool.textContent = pool;
    }
    const tdStaked = document.createElement('td');
    tdStaked.textContent = '0.00';
    const tdSales = document.createElement('td');
    tdSales.textContent = salesText(pool);
    const tdEst = document.createElement('td');
    tdEst.textContent = isLive ? 'no stake next epoch' : 'est. after the first purchases this epoch';
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
    'Est. ANTS per 1,000 ANTS at max lock',
    'Offer'
  ];
  for (const h of headings) {
    const th = document.createElement('th');
    const button = document.createElement('button');
    button.className = 'inc-sort';
    button.textContent = h;
    th.appendChild(button);
    headTr.appendChild(th);
  }
  thead.appendChild(headTr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const tr of rows) {
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  // Sorting logic: each header button sorts the tbody rows.
  const headerThs = table.querySelectorAll('thead th');
  const headerButtons = table.querySelectorAll('thead th button.inc-sort');
  let activeColumn = 3; // Est column
  let activeDirection = 'descending';
  headerThs[activeColumn].setAttribute('aria-sort', activeDirection);

  headerButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      if (index === activeColumn) {
        activeDirection = activeDirection === 'ascending' ? 'descending' : 'ascending';
      } else {
        activeColumn = index;
        activeDirection = index === 0 ? 'ascending' : 'descending';
      }

      const rows = Array.from(tbody.querySelectorAll('tr.board-row'));
      rows.sort((a, b) => {
        let cmp = 0;
        if (index === 0) {
          cmp = a.dataset.name.localeCompare(b.dataset.name);
        } else {
          const aVal = Number(a.dataset[index === 1 ? 'staked' : index === 2 ? 'sales' : index === 3 ? 'est' : 'offer']);
          const bVal = Number(b.dataset[index === 1 ? 'staked' : index === 2 ? 'sales' : index === 3 ? 'est' : 'offer']);
          cmp = aVal - bVal;
        }
        if (cmp === 0) {
          cmp = a.dataset.name.localeCompare(b.dataset.name);
        }
        return activeDirection === 'ascending' ? cmp : -cmp;
      });

      rows.forEach(row => tbody.appendChild(row));

      headerThs.forEach((th, i) => {
        if (i === activeColumn) {
          th.setAttribute('aria-sort', activeDirection);
        } else {
          th.removeAttribute('aria-sort');
        }
      });
    });
  });

  return table;
}

async function init() {
  const container = document.getElementById('incentives');
  if (!container) return;

  try {
    const snapshot = await loadSnapshot();
    const poolNames = await loadPoolNames();
    const mode = rewardMode(snapshot);
    const e = Number(mode.epoch);
    const N = e + 1;
    const boundary = epochBoundary(N);

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
    const setTitle = () => {
      const left = formatCountdown(boundary.getTime() - Date.now());
      title.textContent = `Epoch ${N} · stake now to count from it · starts ${formatUtc(boundary)} · in ${left}`;
    };
    setTitle();
    setInterval(setTitle, 60000);
    header.appendChild(title);

    const board = buildBoard(snapshot, mode, offers, N, poolNames);

    const note = document.createElement('p');
    note.className = 'inc-note';
    if (mode.mode === 'live') {
      const budget = nextBudget(snapshot, N);
      const budgetText = budget ? `, with the contract's staker budget for epoch ${N} (${Math.round(budget).toLocaleString('en-US')} ANTS)` : '';
      note.textContent = `Est. per epoch for 1,000 ANTS at max lock (weight 104,000) added to the pool${budgetText}, if this epoch's sales shares hold and no one else joins the pool.`;
    } else {
      note.textContent = 'est. after the first purchases this epoch';
    }

    const calculator = buildCalculator(snapshot, mode, offers, N, poolNames);

    const offerSection = buildOfferSection(offers, N, poolNames);

    container.innerHTML = '';
    container.appendChild(header);
    container.appendChild(board);
    container.appendChild(note);
    container.appendChild(calculator);
    container.appendChild(offerSection);
  } catch (err) {
    container.innerHTML = '<p>Failed to load incentive data.</p>';
  }
}

init();
