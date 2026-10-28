// Card storefront for "All positions": our own lots and aggregated Seaport
// orders in one grid, plus unlisted positions. Holds view state (sort, source,
// listed-only, grid/list) and wires card actions.

import { buildLots, buildUnlistedLots } from './listing-model.mjs';
import { buildCard } from './storefront-card.mjs';
import { aprPct, antsPerEpoch, poolShares, unlockDate, lockWeeks } from './position-yield.mjs';
import { fetchSeaportMarket } from './seaport-feed.mjs';
import { readListings } from './own-listings.mjs';
import { loadSnapshot } from './market-view.mjs';
import { initCardActions } from './card-actions.mjs';
import { SEAPORT_BUY_ENABLED } from './market-config.mjs';

const state = {
  sort: 'perAnt',
  source: 'all',
  listedOnly: false,
  view: 'grid',
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

function enrich(lot, snapshot, shares) {
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

function sortLots(lots) {
  const out = [...lots];
  const unlisted = (lot) => (lot.priceUsdc == null ? 1 : 0);
  let cmp;
  if (state.sort === 'amount') {
    cmp = (a, b) => b.amountAnts - a.amountAnts;
  } else if (state.sort === 'apr') {
    cmp = (a, b) => (b.aprPct ?? -Infinity) - (a.aprPct ?? -Infinity);
  } else if (state.sort === 'unlock') {
    cmp = (a, b) => {
      const am = a.unlock === 'max';
      const bm = b.unlock === 'max';
      if (am !== bm) return am ? 1 : -1;
      return (a.unlock?.getTime?.() ?? Infinity) - (b.unlock?.getTime?.() ?? Infinity);
    };
  } else {
    cmp = (a, b) => {
      const ap = a.perAntUsd == null ? Infinity : a.perAntUsd;
      const bp = b.perAntUsd == null ? Infinity : b.perAntUsd;
      if (ap !== bp) return ap < bp ? -1 : 1;
      return a.tokenId - b.tokenId;
    };
  }
  out.sort((a, b) => unlisted(a) - unlisted(b) || cmp(a, b));
  return out;
}

function matches(lot) {
  if (state.listedOnly && lot.priceUsdc == null) return false;
  if (state.source !== 'all') {
    const sources = new Set([lot.source, ...(lot.alsoOn || [])]);
    if (!sources.has(state.source)) return false;
  }
  return true;
}

function renderGrid() {
  const grid = q('#sf-grid');
  const empty = q('#sf-empty');
  if (!grid || !ctx.snapshot) return;

  const lots = sortLots(ctx.lots.filter(matches));
  grid.textContent = '';
  const frag = document.createDocumentFragment();
  for (const lot of lots) frag.appendChild(buildCard(lot, { seaportBuyEnabled: SEAPORT_BUY_ENABLED }));
  grid.appendChild(frag);
  if (empty) empty.hidden = lots.length > 0;
}

function setView(view) {
  state.view = view;
  const grid = q('#sf-grid');
  const list = q('#all-list-view');
  const toolbar = q('#sf-toolbar');
  if (grid) grid.hidden = view !== 'grid';
  if (list) list.hidden = view !== 'list';
  if (toolbar) toolbar.classList.toggle('is-list', view === 'list');
  document.querySelectorAll('.sf-view-btn').forEach((btn) => {
    const on = btn.dataset.view === view;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

async function loadStorefront() {
  if (loading) return;
  loading = true;
  setBanner('');

  try {
    const [snapshotRes, ownRes, feedRes, poolNames] = await Promise.allSettled([
      loadSnapshot(),
      readListings(),
      fetchSeaportMarket(),
      loadPoolNames(),
    ]);

    const snapshot = snapshotRes.status === 'fulfilled' ? snapshotRes.value : null;
    const own = ownRes.status === 'fulfilled' ? ownRes.value : [];
    const feed = feedRes.status === 'fulfilled' ? feedRes.value : { ok: false, reason: 'network' };
    const names = poolNames.status === 'fulfilled' ? poolNames.value : {};

    if (!snapshot) {
      setBanner('Could not load the position snapshot. Refresh the page.');
      ctx = { snapshot: null, lots: [], feedOk: false };
      return;
    }

    if (!feed.ok) {
      setBanner('Seaport listings unavailable — showing lANTS listings only.');
    } else if (ownRes.status === 'rejected') {
      setBanner('Could not read lANTS listings from Base — showing Seaport lots only.');
    }

    const listed = buildLots(own, feed.ok ? feed.items : [], snapshot, names);
    const unlisted = buildUnlistedLots(snapshot, listed, names);
    const shares = poolShares(snapshot, Number(snapshot.epoch || 0) + 1);
    ctx = {
      snapshot,
      lots: [...listed, ...unlisted].map((lot) => enrich(lot, snapshot, shares)),
      feedOk: feed.ok,
    };
    renderGrid();
  } catch (e) {
    console.warn('storefront load failed', e);
    setBanner('Could not build the position list. Refresh the page.');
  } finally {
    loading = false;
  }
}

function initToolbar() {
  const sort = q('#sf-sort');
  const source = q('#sf-source');
  const listed = q('#sf-listed');
  if (sort) {
    sort.value = state.sort;
    sort.addEventListener('change', () => {
      state.sort = sort.value;
      renderGrid();
    });
  }
  if (source) {
    source.value = state.source;
    source.addEventListener('change', () => {
      state.source = source.value;
      renderGrid();
    });
  }
  if (listed) {
    listed.checked = state.listedOnly;
    listed.addEventListener('change', () => {
      state.listedOnly = listed.checked;
      renderGrid();
    });
  }
  document.querySelectorAll('.sf-view-btn').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view === 'list' ? 'list' : 'grid'));
  });
  setView(state.view);
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
