// Card storefront for "All positions": our own lots and aggregated Seaport
// orders in one grid, plus unlisted positions. Holds view state (sort, source,
// listed-only, grid/list) and wires card actions.

import { buildLots, buildUnlistedLots } from './listing-model.mjs';
import { buildCard } from './storefront-card.mjs';
import { aprPct, antsPerEpoch, poolShare, unlockDate, lockWeeks } from './position-yield.mjs';
import { fetchSeaportMarket } from './seaport-feed.mjs';
import { readListings } from './own-listings.mjs';
import { loadSnapshot } from './market-view.mjs';
import { buyListing } from './market-buy.mjs';

const SHARE_BASE = 'https://lants.eth.limo/';

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

function enrich(lot, snapshot) {
  const nextEpoch = Number(snapshot?.epoch || 0) + 1;
  const pos = lot.position;
  return {
    ...lot,
    aprPct: aprPct(snapshot, pos),
    antsPerEpoch: antsPerEpoch(snapshot, pos),
    poolSharePct: poolShare(snapshot, pos?.agentId, nextEpoch),
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
  for (const lot of lots) frag.appendChild(buildCard(lot, { seaportBuyEnabled: false }));
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
    loading = false;
    return;
  }

  if (!feed.ok) {
    setBanner('Seaport listings unavailable — showing lANTS listings only.');
  } else if (ownRes.status === 'rejected') {
    setBanner('Could not read lANTS listings from Base — showing Seaport lots only.');
  }

  const listed = buildLots(own, feed.ok ? feed.items : [], snapshot, names);
  const unlisted = buildUnlistedLots(snapshot, listed, names);
  const all = [...listed, ...unlisted].map((lot) => enrich(lot, snapshot));

  all.sort((a, b) => (a.perAntUsd == null) - (b.perAntUsd == null));
  ctx = { snapshot, lots: all, feedOk: feed.ok };
  renderGrid();
  loading = false;
}

function report(card, text, isError) {
  const msg = card?.querySelector('.sf-msg');
  if (!msg) return;
  msg.textContent = text;
  msg.classList.toggle('is-error', !!isError);
}

async function copyShare(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (e) {
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch (e2) {
      return false;
    }
  }
}

async function onGridClick(ev) {
  const card = ev.target.closest('.sf-card');
  if (!card) return;

  const offer = ev.target.closest('.sf-offer');
  if (offer) {
    ev.preventDefault();
    const modal = document.querySelector('.offer-modal');
    if (modal) modal.dataset.tokenId = offer.dataset.tokenId || '';
    const opener = document.querySelector('.ms-offer');
    if (opener) opener.click();
    return;
  }

  const share = ev.target.closest('.sf-share');
  if (share) {
    ev.preventDefault();
    const id = share.dataset.tokenId;
    const url = SHARE_BASE + '#position/' + id;
    const ok = await copyShare(url);
    const original = share.textContent;
    share.textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(() => {
      share.textContent = original;
    }, 1500);
    return;
  }

  const buy = ev.target.closest('.sf-buy');
  if (!buy) return;
  ev.preventDefault();

  if (buy.dataset.source === 'lants') {
    buy.disabled = true;
    const res = await buyListing(
      {
        id: Number(buy.dataset.listingId),
        price: BigInt(buy.dataset.price),
        currency: buy.dataset.currency,
      },
      (text, isError) => report(card, text, isError)
    );
    buy.disabled = false;
    if (res.ok) await loadStorefront();
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

export function refreshStorefront() {
  return loadStorefront();
}

function init() {
  const grid = q('#sf-grid');
  if (!grid) return;
  initToolbar();
  grid.addEventListener('click', onGridClick);
  window.addEventListener('market:refresh', () => {
    loadStorefront();
  });
  loadStorefront();
}

init();
