// Storefront for the "Listings" tab: our own lots and aggregated Seaport orders
// in one veXy-style listing table, plus unlisted positions. Holds view state
// (sort, listed-only) and wires row actions.

import { buildLots, buildUnlistedLots } from './listing-model.mjs';
import { buildTableHead, buildRow } from './storefront-table.mjs';
import { aprPct, antsPerEpoch, poolShares, unlockDate, lockWeeks } from './position-yield.mjs';
import { fetchSeaportMarket } from './seaport-feed.mjs';
import { readListings } from './own-listings.mjs';
import { loadSnapshot } from './market-view.mjs';
import { initCardActions } from './card-actions.mjs';
import { SEAPORT_BUY_ENABLED } from './market-config.mjs';

const state = {
  sort: 'perAnt',
  dir: 'asc',
  listedOnly: true,
};

// Sensible first-click direction per column: prices and unlock ascend (cheapest
// and soonest first), staked and reward descend (largest first).
const DEFAULT_DIR = {
  id: 'asc',
  perAnt: 'asc',
  amount: 'desc',
  apr: 'desc',
  unlock: 'asc',
};

let ctx = { snapshot: null, lots: [], feedOk: true };
let loading = false;

const q = (sel) => document.querySelector(sel);

function setBanner(text) {
  const banner = q('#sf-banner');
  if (!banner) return;
  if (!text) {
    banner.hidden = true;
    banner.textContent = '';
    return;
  }
  banner.hidden = false;
  banner.textContent = text;
}

async function loadPoolNames() {
  try {
    const res = await fetch('./pool-names.json', { cache: 'no-store' });
    return res.ok ? await res.json() : {};
  } catch (e) {
    return {};
  }
}

export function enrich(lot, snapshot, shares) {
  const nextEpoch = Number(snapshot?.epoch || 0) + 1;
  const pos = lot.position;
  return {
    ...lot,
    aprPct: aprPct(snapshot, pos),
    antsPerEpoch: antsPerEpoch(snapshot, pos),
    poolSharePct: shares.get(String(pos?.agentId)) ?? null,
    unlock: unlockDate(pos, nextEpoch),
    lockWeeks: lockWeeks(pos, nextEpoch),
  };
}

export function sortLots(lots, sort = state.sort, dir = state.dir) {
  const out = [...lots];
  const unlisted = (lot) => (lot.priceUsdc == null ? 1 : 0);
  const sign = dir === 'desc' ? -1 : 1;

  const val = (lot) => {
    if (sort === 'amount') return lot.amountAnts;
    if (sort === 'apr') return lot.aprPct;
    if (sort === 'unlock') return lot.unlock === 'max' || lot.unlock == null ? null : (lot.unlock.getTime?.() ?? null);
    if (sort === 'id') return lot.tokenId;
    return lot.perAntUsd; // default: price per ANTS
  };

  out.sort((a, b) => {
    const u = unlisted(a) - unlisted(b);
    if (u !== 0) return u;
    const av = val(a);
    const bv = val(b);
    const aMiss = av == null;
    const bMiss = bv == null;
    if (aMiss && bMiss) return 0;
    if (aMiss) return 1; // missing values always last, regardless of direction
    if (bMiss) return -1;
    if (av === bv) return a.tokenId - b.tokenId;
    return (av < bv ? -1 : 1) * sign;
  });

  return out;
}

export function matches(lot, listedOnly = state.listedOnly) {
  if (lot.status === 'pending') return false;
  if (listedOnly && lot.priceUsdc == null) return false;
  return true;
}

export function visibleLots(lots, listedOnly) {
  return lots.filter((lot) => matches(lot, listedOnly));
}

function applySortHeaders(table) {
  for (const th of table.querySelectorAll('th[data-sort]')) {
    const key = th.dataset.sort;
    const active = key === state.sort;
    th.classList.toggle('sort-asc', active && state.dir === 'asc');
    th.classList.toggle('sort-desc', active && state.dir === 'desc');
    let arrow = th.querySelector('.sort-arrow');
    if (active) {
      if (!arrow) {
        arrow = document.createElement('span');
        arrow.className = 'sort-arrow';
        th.appendChild(arrow);
      }
      arrow.textContent = state.dir === 'asc' ? ' ▲' : ' ▼';
    } else if (arrow) {
      arrow.remove();
    }
    th.addEventListener('click', () => {
      if (state.sort === key) {
        state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort = key;
        state.dir = DEFAULT_DIR[key] || 'asc';
      }
      renderTable();
    });
  }
}

function renderTable() {
  const container = q('#sf-grid');
  const empty = q('#sf-empty');
  if (!container || !ctx.snapshot) return;

  const lots = sortLots(visibleLots(ctx.lots, state.listedOnly), state.sort, state.dir);
  container.textContent = '';
  const table = document.createElement('table');
  table.className = 'sf-table';
  table.appendChild(buildTableHead());
  const tbody = document.createElement('tbody');
  for (const lot of lots) tbody.appendChild(buildRow(lot, { seaportBuyEnabled: SEAPORT_BUY_ENABLED }));
  table.appendChild(tbody);
  container.appendChild(table);
  applySortHeaders(table);
  if (empty) empty.hidden = lots.length > 0;
}

async function loadStorefront() {
  if (loading) return;
  loading = true;
  setBanner('');

  try {
    const [snapshotRes, namesRes] = await Promise.allSettled([loadSnapshot(), loadPoolNames()]);
    const snapshot = snapshotRes.status === 'fulfilled' ? snapshotRes.value : null;
    const names = namesRes.status === 'fulfilled' ? namesRes.value : {};

    if (!snapshot) {
      setBanner('Could not load the position snapshot. Refresh the page.');
      ctx = { snapshot: null, lots: [], feedOk: false };
      return;
    }

    // First paint: every active position as an unlisted row, without waiting
    // on the Base RPC reads or the Seaport feed.
    const shares = poolShares(snapshot, Number(snapshot.epoch || 0) + 1);
    ctx = {
      snapshot,
      lots: buildUnlistedLots(snapshot, [], names).map((lot) => enrich(lot, snapshot, shares)),
      feedOk: true,
    };
    renderTable();

    // Then fold in our live listings and the Seaport feed.
    const [ownRes, feedRes] = await Promise.allSettled([readListings(), fetchSeaportMarket()]);
    const own = ownRes.status === 'fulfilled' ? ownRes.value : [];
    const feed = feedRes.status === 'fulfilled' ? feedRes.value : { ok: false, reason: 'network' };

    if (!feed.ok || ownRes.status === 'rejected') {
      setBanner('Some listings are temporarily unavailable.');
    }

    const listed = buildLots(own, feed.ok ? feed.items : [], snapshot, names);
    const unlisted = buildUnlistedLots(snapshot, listed, names);
    ctx = {
      snapshot,
      lots: [...listed, ...unlisted].map((lot) => enrich(lot, snapshot, shares)),
      feedOk: feed.ok,
    };
    renderTable();
  } catch (e) {
    console.warn('storefront load failed', e);
    setBanner('Could not build the position list. Refresh the page.');
  } finally {
    loading = false;
  }
}

function initToolbar() {
  const listed = q('#sf-listed');
  if (listed) {
    listed.checked = state.listedOnly;
    listed.addEventListener('change', () => {
      state.listedOnly = listed.checked;
      renderTable();
    });
  }
}

function init() {
  const grid = q('#sf-grid');
  if (!grid) return;
  initToolbar();
  initCardActions(grid, { onRefresh: loadStorefront });
  window.addEventListener('market:refresh', () => {
    loadStorefront();
  });
  loadStorefront();
}

init();
