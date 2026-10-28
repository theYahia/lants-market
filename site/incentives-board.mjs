// The pool board: seller rows with next-epoch staked ANTS, estimated reward,
// cashback and the best offer. Returns a horizontally-scrollable wrapper around
// the sortable table.
import { nextBudget, cashbackCell, cashbackHead, sellerDetailText } from './incentives-data.mjs';
import { poolModel } from './incentives-pool-model.mjs';
import { isValidOffer } from './incentives-offers.mjs';
import { validRebate, rebateLabel } from './rebate.mjs';
import { infoIcon } from './incentives-hero.mjs';

export function buildBoard(snapshot, mode, offers, displayEpoch, poolNames) {
  const { poolData, estForPool } = poolModel(snapshot, mode);
  const N = Number(mode.epoch) + 1;
  const salesByPool = snapshot.salesByPool || {};
  const histEpochs = (snapshot.poolHistoryEpochs || []).slice().reverse();
  const hasHistory = histEpochs.length > 0 && !!snapshot.poolRewardByEpoch;
  const paidList = (pool) => histEpochs.map((h) => Number(BigInt(snapshot.poolRewardByEpoch?.[pool]?.[h] || '0')) / 1e18);
  const shortAnts = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0));
  const THIN_ANTS = 100; // ponytail: fixed cut for 'almost nothing staked'; move to a share of the median pool once stakes grow

  // Best offer per pool: highest usdcPer1k among valid offers; rebate map for the offer column.
  const bestOfferByPool = new Map();
  if (offers) {
    for (const offer of offers) {
      if (!isValidOffer(offer, displayEpoch)) continue;
      const prev = bestOfferByPool.get(offer.pool);
      if (!prev || offer.usdcPer1k > prev) bestOfferByPool.set(offer.pool, offer.usdcPer1k);
    }
  }
  const rebateByPool = new Map();
  if (offers) {
    for (const offer of offers) {
      if (isValidOffer(offer, displayEpoch) || !validRebate(offer)) continue;
      if (!rebateByPool.has(offer.pool)) rebateByPool.set(offer.pool, offer);
    }
  }
  const offerTextFor = (pool) => {
    const rebateOffer = rebateByPool.get(pool);
    if (rebateOffer) return rebateLabel(rebateOffer, displayEpoch);
    const best = bestOfferByPool.get(pool);
    return best !== undefined ? `${best} USDC per 1,000 ANTS` : '—';
  };

  // Pool name cell tags: new (paid nothing in completed epochs) and thin (almost nothing staked next epoch).
  const tagPool = (td, pool) => {
    if (!hasHistory) return;
    const tags = [];
    if (paidList(pool).every((v) => v === 0)) tags.push(['new', 'No rewards in completed epochs yet: a new seller or no sales so far.']);
    if ((poolData.get(pool)?.WN || 0) / 104 < THIN_ANTS) tags.push(['thin', 'Almost nothing staked here: the network has not backed this seller yet. Check it before staking.']);
    for (const [label, why] of tags) {
      const tag = document.createElement('span');
      tag.className = 'inc-tag';
      tag.textContent = label;
      tag.title = why;
      td.appendChild(tag);
    }
  };

  const addExpand = (td, tr, pool) => {
    const btn = document.createElement('button');
    btn.className = 'inc-expand';
    btn.type = 'button';
    btn.textContent = '▾';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Show seller details');
    btn.addEventListener('click', () => {
      const next = tr.nextElementSibling;
      if (next && next.classList.contains('inc-detail')) {
        next.remove();
        btn.setAttribute('aria-expanded', 'false');
        return;
      }
      const detail = document.createElement('tr');
      detail.className = 'inc-detail';
      const cell = document.createElement('td');
      cell.colSpan = tr.children.length;
      cell.textContent = sellerDetailText(snapshot, pool, offerTextFor(pool));
      const calcBtn = document.createElement('button');
      calcBtn.className = 'inc-calc-btn';
      calcBtn.type = 'button';
      calcBtn.textContent = 'Calculate';
      calcBtn.addEventListener('click', () => {
        const select = document.querySelector('.inc-calc select');
        const amount = document.querySelector('#inc-calc-amount');
        const calc = document.querySelector('.inc-calc');
        if (select) {
          select.value = pool;
          select.dispatchEvent(new CustomEvent('input', { bubbles: true }));
        }
        if (amount) amount.focus();
        if (calc && typeof calc.scrollIntoView === 'function') {
          calc.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      cell.appendChild(calcBtn);
      detail.appendChild(cell);
      tr.insertAdjacentElement('afterend', detail);
      btn.setAttribute('aria-expanded', 'true');
    });
    td.appendChild(btn);
  };

  const isLive = mode.mode === 'live';
  const salesVal = (pool) => {
    const val = salesByPool[pool];
    return val === undefined || val === null ? '-1' : String(Number(val) / 1e6);
  };

  // Ranked and unranked rows share one builder; est is null for unranked pools.
  const buildRow = (pool, est) => {
    const ranked = est !== null;
    const wn = poolData.get(pool)?.WN || 0;
    const tr = document.createElement('tr');
    tr.className = 'board-row';
    tr.dataset.pool = pool;
    const name = poolNames[pool];
    tr.dataset.name = name || pool;
    tr.dataset.staked = String(wn / 104);
    tr.dataset.sales = salesVal(pool);
    tr.dataset.est = ranked && isLive ? String(est) : '-1';
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
    tagPool(tdPool, pool);
    addExpand(tdPool, tr, pool);
    const stakedLine = document.createElement('span');
    stakedLine.className = 'inc-staked';
    const stakedValue = wn / 104;
    stakedLine.textContent = stakedValue > 0 ? `${shortAnts(stakedValue)} staked` : 'no stake next epoch';
    tdPool.appendChild(document.createElement('br'));
    tdPool.appendChild(stakedLine);

    const tdEst = document.createElement('td');
    if (!isLive) {
      tdEst.textContent = 'est. after the first purchases this epoch';
    } else if (ranked) {
      tdEst.textContent = Math.round(est).toLocaleString('en-US');
      tdEst.className = 'inc-est';
    } else {
      tdEst.textContent = 'no stake next epoch';
    }

    const tdPaid = document.createElement('td');
    if (hasHistory) {
      const list = paidList(pool);
      tdPaid.textContent = list.every((v) => v === 0) ? '—' : list.map(shortAnts).join(' · ');
      tr.dataset.paid = String(list.reduce((s, v) => s + v, 0));
    } else {
      tdPaid.textContent = '—';
      tr.dataset.paid = '-1';
    }

    const tdOffer = document.createElement('td');
    tdOffer.textContent = offerTextFor(pool);

    tr.appendChild(tdPool);
    tr.appendChild(tdEst);
    tr.appendChild(tdPaid);
    tr.appendChild(tdOffer);
    return tr;
  };

  const ranked = [];
  const unranked = [];
  for (const [pool, data] of poolData.entries()) {
    if (data.WN > 0) ranked.push({ pool, est: estForPool(pool, 1000 * 104) });
    else unranked.push(pool);
  }

  // Sort by est descending, stable by insertion order
  const rankedWithIndex = ranked.map((item, idx) => ({ ...item, idx }));
  rankedWithIndex.sort((a, b) => {
    if (a.est > b.est) return -1;
    if (a.est < b.est) return 1;
    return a.idx - b.idx;
  });

  const rows = [];
  for (const { pool, est } of rankedWithIndex) rows.push(buildRow(pool, est));
  for (const pool of unranked) rows.push(buildRow(pool, null));

  for (const tr of rows) {
    const cb = cashbackCell(snapshot, tr.dataset.pool);
    const tdCb = document.createElement('td');
    tdCb.className = 'inc-cb-col';
    tdCb.textContent = cb.text;
    tr.dataset.cashback = String(cb.wei);
    tr.insertBefore(tdCb, tr.lastElementChild);
  }

  const table = document.createElement('table');
  table.className = 'inc-board-table';
  const thead = document.createElement('thead');
  const headTr = document.createElement('tr');
  const paidHeading = hasHistory
    ? `Paid to stakers (ANTS), epoch ${histEpochs.join(' · ')}`
    : 'Paid to stakers';
  const headings = [
    'Seller',
    'ANTS per 1,000 ANTS next epoch',
    paidHeading,
    'Offer'
  ];
  const tips = [
    'Seller and the ANTS staked in its pool for next epoch, a sign of trust. Tags: new = paid nothing in completed epochs yet; thin = under 100 ANTS staked, check the seller first.',
    `Estimated ANTS reward per epoch for each 1,000 ANTS staked at max lock (104 epochs), if this epoch's sales shares hold and no one else joins the pool. Uses the projected staker budget of ${nextBudget(snapshot, N)?.toLocaleString('en-US', { maximumFractionDigits: 0 }) ?? 'the current'} ANTS for the next epoch.`,
    'What this pool paid its stakers in the completed epochs shown, newest first.',
    'Best USDC offer per 1,000 ANTS for this pool in the next epoch.'
  ];
  const cbHead = cashbackHead(snapshot);
  headings.splice(3, 0, cbHead.heading);
  tips.splice(3, 0, cbHead.tip);
  const sortKeys = ['name', 'est', 'paid', 'cashback', 'offer'];
  for (let i = 0; i < headings.length; i++) {
    const th = document.createElement('th');
    if (i === 3) th.className = 'inc-cb-col';
    const button = document.createElement('button');
    button.className = 'inc-sort';
    button.textContent = headings[i];
    th.appendChild(button);
    th.appendChild(infoIcon(tips[i]));
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
  let activeColumn = hasHistory ? 2 : 1;
  let activeDirection = 'descending';
  headerThs[activeColumn].setAttribute('aria-sort', activeDirection);

  const sortRows = (index) => {
    const trows = Array.from(tbody.querySelectorAll('tr.board-row'));
    trows.sort((a, b) => {
      let cmp = 0;
      if (index === 0) {
        cmp = a.dataset.name.localeCompare(b.dataset.name);
      } else {
        const aVal = Number(a.dataset[sortKeys[index]]);
        const bVal = Number(b.dataset[sortKeys[index]]);
        cmp = aVal - bVal;
      }
      if (cmp === 0) {
        cmp = a.dataset.name.localeCompare(b.dataset.name);
      }
      return activeDirection === 'ascending' ? cmp : -cmp;
    });

    trows.forEach((row) => {
      const detail = row.nextElementSibling;
      tbody.appendChild(row);
      if (detail && detail.classList.contains('inc-detail')) {
        tbody.appendChild(detail);
      }
    });
    headerThs.forEach((th, i) => {
      if (i === activeColumn) {
        th.setAttribute('aria-sort', activeDirection);
      } else {
        th.removeAttribute('aria-sort');
      }
    });
  };
  sortRows(activeColumn);

  headerButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      if (index === activeColumn) {
        activeDirection = activeDirection === 'ascending' ? 'descending' : 'ascending';
      } else {
        activeColumn = index;
        activeDirection = index === 0 ? 'ascending' : 'descending';
      }
      sortRows(index);
    });
  });

  const wrap = document.createElement('div');
  wrap.className = 'inc-board-scroll';
  wrap.appendChild(table);
  return wrap;
}
