// Deep page #position/{id}: one position with its lots, yield, boost, owner,
// implied valuation and sale history. Pure view-model building is separated so
// it can be tested without a DOM.

import { loadSnapshot } from './market-view.mjs';
import { readListings, getMinted, getMaxSupply, ethCallTo } from './own-listings.mjs';
import { fetchSeaportMarket } from './seaport-feed.mjs';
import { buildLots, isActivePosition } from './listing-model.mjs';
import { aprPct, antsPerEpoch, poolShare, unlockDate, lockWeeks, formatUnlock } from './position-yield.mjs';
import { buildCard, formatPerAnt } from './storefront-card.mjs';
import { initCardActions } from './card-actions.mjs';
import { SEAPORT_BUY_ENABLED, MARKET, SEL, encUint, decodeWords, wordToAddr } from './market-config.mjs';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const amountFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function activePosition(snapshot, tokenId, curEpoch) {
  const hit = (snapshot?.positions || []).find((p) => String(p.id) === String(tokenId));
  return hit && isActivePosition(hit, curEpoch) ? hit : null;
}

function shortAddress(a) {
  return a ? a.slice(0, 6) + '…' + a.slice(-4) : '—';
}

/**
 * Build everything the page renders from plain data.
 *
 * @param {Object} input - { tokenId, snapshot, lots, sales, trades, minted, maxSupply }
 */
export function positionViewModel({ tokenId, snapshot, lots = [], sales = [], trades = [], minted = null, maxSupply = null }) {
  const curEpoch = Number(snapshot?.epoch || 0);
  const epoch = curEpoch + 1;
  const pos = activePosition(snapshot, tokenId, curEpoch);
  const tokenLots = (lots || []).filter((l) => String(l.tokenId) === String(tokenId));

  if (!pos) {
    return { found: false, tokenId: String(tokenId) };
  }

  const best = tokenLots.reduce((acc, lot) => {
    if (lot.perAntUsd == null) return acc;
    if (acc == null || lot.perAntUsd < acc.perAntUsd) return lot;
    return acc;
  }, null);

  const enrichedLots = tokenLots.map((lot) => {
    const lotPos = lot.position ?? null;
    return {
      ...lot,
      aprPct: aprPct(snapshot, lotPos),
      antsPerEpoch: antsPerEpoch(snapshot, lotPos),
      poolSharePct: poolShare(snapshot, lotPos?.agentId, epoch),
      unlock: unlockDate(lotPos, epoch),
      lockWeeks: lockWeeks(lotPos, epoch),
    };
  });

  const history = [];
  const seen = new Set();
  const push = (entry) => {
    const key = entry.txHash || `${entry.kind}-${entry.when}-${entry.priceUsdc}`;
    if (seen.has(key)) return;
    seen.add(key);
    history.push(entry);
  };

  for (const sale of sales || []) {
    if (!sale.soldTime || String(sale.nftId) !== String(tokenId)) continue;
    push({
      kind: 'lants',
      priceUsdc: Number(sale.price) / 1e6,
      when: new Date(Number(sale.soldTime) * 1000),
      txHash: null,
      buyer: null,
    });
  }
  for (const trade of trades || []) {
    if (String(trade.tokenId) !== String(tokenId)) continue;
    push({
      kind: 'seaport',
      priceUsdc: Number(trade.priceWei) / 1e6,
      when: new Date(Number(trade.createdAt)),
      txHash: typeof trade.txHash === 'string' ? trade.txHash : null,
      buyer: typeof trade.buyer === 'string' ? trade.buyer : null,
    });
  }
  history.sort((a, b) => b.when.getTime() - a.when.getTime());

  return {
    found: true,
    tokenId: String(tokenId),
    provider: tokenLots[0]?.provider || (pos?.agentId != null ? '#' + pos.agentId : 'unknown provider'),
    agentId: pos?.agentId ?? null,
    amountAnts: Number(pos?.amount || 0) / 1e18,
    lockWeeks: lockWeeks(pos, epoch),
    unlock: unlockDate(pos, epoch),
    aprPct: aprPct(snapshot, pos),
    antsPerEpoch: antsPerEpoch(snapshot, pos),
    poolSharePct: poolShare(snapshot, pos?.agentId, epoch),
    owner: typeof pos?.owner === 'string' ? pos.owner : null,
    lots: enrichedLots,
    history,
    perAntUsd: best?.perAntUsd ?? null,
    impliedMcUsd: best?.perAntUsd != null && minted != null ? best.perAntUsd * minted : null,
    impliedFdvUsd: best?.perAntUsd != null && maxSupply != null ? best.perAntUsd * maxSupply : null,
  };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function cell(label, value) {
  const box = el('div', 'pp-cell');
  box.appendChild(el('div', 'pp-label', label));
  box.appendChild(el('div', 'pp-value', value));
  return box;
}

function renderMissing(panel, tokenId) {
  panel.textContent = '';
  const back = el('a', 'pp-back', '← Back to all positions');
  back.href = '#market';
  panel.appendChild(back);
  const box = el('div', 'pp-missing');
  box.appendChild(el('h2', null, 'Position not found'));
  box.appendChild(el('p', 'pp-sub', `Token #${tokenId} is not an active lANTS position.`));
  const link = el('a', null, 'Browse all positions');
  link.href = '#market';
  box.appendChild(link);
  panel.appendChild(box);
}

function historySection(vm) {
  const section = el('section', 'pp-section');
  section.appendChild(el('h3', null, 'History'));
  if (!vm.history.length) {
    section.appendChild(el('div', 'pp-empty', 'No recorded sales for this position.'));
    return section;
  }
  const list = el('div', 'pp-history');
  for (const row of vm.history) {
    const line = el('div', 'pp-history-row');
    line.appendChild(el('span', null, row.when.toISOString().slice(0, 10)));
    const right = el('span');
    right.textContent = usd.format(row.priceUsdc);
    if (row.txHash) {
      const link = el('a', null, ' tx');
      link.href = 'https://basescan.org/tx/' + row.txHash;
      link.target = '_blank';
      link.rel = 'noopener';
      right.appendChild(link);
    }
    line.appendChild(right);
    list.appendChild(line);
  }
  section.appendChild(list);
  return section;
}

function renderPosition(panel, vm) {
  panel.textContent = '';

  const back = el('a', 'pp-back', '← Back to all positions');
  back.href = '#market';
  panel.appendChild(back);

  const head = el('div', 'pp-head');
  const titleBox = el('div');
  titleBox.appendChild(el('div', 'pp-title', '#' + vm.tokenId));
  const agent = vm.agentId != null ? el('a', 'pp-sub', vm.provider) : el('div', 'pp-sub', vm.provider);
  if (vm.agentId != null) {
    agent.href = 'https://antseedpoints.com/sellers/' + encodeURIComponent(String(vm.agentId));
    agent.target = '_blank';
    agent.rel = 'noopener';
  }
  titleBox.appendChild(agent);
  head.appendChild(titleBox);
  const owner = el('div', 'pp-sub');
  owner.appendChild(document.createTextNode('Owner '));
  const ownerAddr = el('span', null, shortAddress(vm.owner));
  ownerAddr.id = 'pp-owner';
  ownerAddr.title = vm.owner || 'owner unknown';
  owner.appendChild(ownerAddr);
  head.appendChild(owner);
  panel.appendChild(head);

  const grid = el('div', 'pp-grid');
  grid.appendChild(cell('Amount', amountFmt.format(vm.amountAnts) + ' ANTS'));
  grid.appendChild(cell('Lock', vm.lockWeeks === 'max' ? 'max lock' : `${vm.lockWeeks ?? '—'}w · ${formatUnlock(vm.unlock)}`));
  grid.appendChild(cell('APR', vm.aprPct == null ? '—' : vm.aprPct.toFixed(1) + '%'));
  grid.appendChild(cell('Reward', vm.antsPerEpoch == null ? '—' : `≈${vm.antsPerEpoch.toFixed(2)} ANTS/epoch`));
  grid.appendChild(cell('Boost', vm.poolSharePct == null ? '—' : `${(vm.poolSharePct * 100).toFixed(2)}% of next-epoch weight`));
  grid.appendChild(cell('Price/ANTS', formatPerAnt(vm.perAntUsd)));
  grid.appendChild(cell('Implied MC', vm.impliedMcUsd == null ? '—' : usd.format(vm.impliedMcUsd)));
  grid.appendChild(cell('Implied FDV', vm.impliedFdvUsd == null ? '—' : usd.format(vm.impliedFdvUsd)));
  panel.appendChild(grid);

  const lots = el('section', 'pp-section');
  lots.appendChild(el('h3', null, 'Lots'));
  if (!vm.lots.length) {
    lots.appendChild(el('div', 'pp-empty', 'Not listed. Make an offer below.'));
  } else {
    const grid2 = el('div', 'sf-grid');
    for (const lot of vm.lots) {
      const lotEl = buildCard(lot, { seaportBuyEnabled: SEAPORT_BUY_ENABLED });
      grid2.appendChild(lotEl);
    }
    lots.appendChild(grid2);
  }
  panel.appendChild(lots);
  panel.appendChild(historySection(vm));
}

async function liveOwner(tokenId) {
  try {
    const raw = await ethCallTo(MARKET.nft, SEL.ownerOf + encUint(tokenId));
    return wordToAddr(decodeWords(raw)[0]);
  } catch (e) {
    return null;
  }
}

async function fetchTrades() {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller && controller.abort(), 8000);
  try {
    const res = await fetch('https://antseedmarkets.com/api/lants/trades?limit=200', {
      signal: controller ? controller.signal : undefined,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.trades) ? json.trades : [];
  } catch (e) {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

let currentId = null;
let renderToken = 0;

async function openPosition(tokenId) {
  const panel = document.getElementById('position-panel');
  if (!panel) return;
  currentId = String(tokenId);
  const myToken = ++renderToken;

  const [snapshot, own, feed, trades, poolNames] = await Promise.allSettled([
    loadSnapshot(),
    readListings(),
    fetchSeaportMarket(),
    fetchTrades(),
    fetch('./pool-names.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})),
  ]);
  if (myToken !== renderToken) return;

  const snap = snapshot.status === 'fulfilled' ? snapshot.value : null;
  if (!snap) {
    renderMissing(panel, tokenId);
    return;
  }
  const ownItems = own.status === 'fulfilled' ? own.value : [];
  const feedItems = feed.status === 'fulfilled' && feed.value.ok ? feed.value.items : [];
  const names = poolNames.status === 'fulfilled' ? poolNames.value : {};

  const allLots = buildLots(ownItems, feedItems, snap, names);
  const vm = positionViewModel({
    tokenId,
    snapshot: snap,
    lots: allLots,
    sales: ownItems,
    trades: trades.status === 'fulfilled' ? trades.value : [],
    minted: getMinted(),
    maxSupply: getMaxSupply(),
  });

  if (myToken !== renderToken) return;
  if (!vm.found) {
    renderMissing(panel, tokenId);
    return;
  }

  renderPosition(panel, vm);

  if (!vm.owner) {
    const owner = await liveOwner(tokenId);
    if (owner && myToken === renderToken) {
      const node = document.getElementById('pp-owner');
      if (node) {
        node.textContent = shortAddress(owner);
        node.title = owner;
      }
    }
  }
}

function idFromHash() {
  const m = String(location.hash || '').match(/^#position\/(\d+)$/);
  return m ? m[1] : null;
}

function init() {
  const panel = document.getElementById('position-panel');
  if (!panel) return;

  initCardActions(panel, {
    onRefresh: () => (currentId ? openPosition(currentId) : undefined),
  });

  document.addEventListener('position:open', (ev) => {
    const id = ev.detail && ev.detail.id;
    if (id != null) openPosition(String(id));
  });

  window.addEventListener('popstate', () => {
    const id = idFromHash();
    if (id) openPosition(id);
  });

  window.addEventListener('market:refresh', () => {
    if (currentId) openPosition(currentId);
  });

  const initial = idFromHash();
  if (initial) openPosition(initial);
}

if (typeof document !== 'undefined') init();
