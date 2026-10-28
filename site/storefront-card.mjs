// Pure DOM builder for one storefront card. All values come precomputed on
// the lot; this module never fetches, reads the wallet or decides validity.

import { formatUnlock } from './position-yield.mjs';

export const PROVIDER_URL = 'https://antseedpoints.com/sellers/';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd4 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
const amountFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function stat(dt, dd, tip) {
  const row = el('div', 'sf-stat');
  const label = el('dt', null, dt);
  if (tip) {
    const info = el('span', 'info', 'ⓘ');
    info.dataset.tip = tip;
    label.appendChild(info);
  }
  row.appendChild(label);
  const value = el('dd', null);
  if (dd instanceof Node) value.appendChild(dd);
  else value.textContent = dd;
  row.appendChild(value);
  return row;
}

export function badge(text, kind) {
  return el('span', `sf-badge sf-badge-${kind}`, text);
}

export function formatPrice(priceUsdc) {
  return priceUsdc == null ? '—' : `${usd.format(priceUsdc)}`;
}

export function formatPerAnt(perAntUsd) {
  return perAntUsd == null ? '—' : `${usd4.format(perAntUsd)} /ANTS`;
}

export function providerNode(lot) {
  const name = lot.provider || 'unknown provider';
  if (lot.agentId == null) return el('span', 'sf-provider', name);
  const a = el('a', 'sf-provider', name);
  a.href = PROVIDER_URL + encodeURIComponent(String(lot.agentId));
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

// Buy button with our brand mark inline, used for our own lots and Seaport
// orders alike so the action reads as ours everywhere.
function makeBuy(text) {
  const btn = el('button', 'sf-btn sf-buy');
  const mark = el('img', 'sf-buy-logo');
  mark.src = './antseed-mark.png';
  mark.alt = '';
  mark.setAttribute('aria-hidden', 'true');
  btn.appendChild(mark);
  btn.appendChild(document.createTextNode(text));
  return btn;
}

export function buyNode(lot, opts) {
  if (lot.priceUsdc == null) return null;

  if (lot.source === 'lants' && lot.listingId != null) {
    const btn = makeBuy('Buy');
    btn.type = 'button';
    btn.dataset.source = 'lants';
    btn.dataset.listingId = String(lot.listingId);
    btn.dataset.price = String(lot.priceMicro ?? Math.round(lot.priceUsdc * 1e6));
    btn.dataset.currency = lot.currency || '';
    return btn;
  }

  if (lot.source === 'seaport' && opts.seaportBuyEnabled) {
    const btn = makeBuy('Buy');
    btn.type = 'button';
    btn.dataset.source = 'seaport';
    btn.dataset.tokenId = String(lot.tokenId);
    btn.dataset.price = String(Math.round(lot.priceUsdc * 1e6));
    return btn;
  }

  return null;
}

/**
 * Build one card.
 *
 * @param {Object} lot - enriched lot (amountAnts, perAntUsd, provider, status,
 *   aprPct, antsPerEpoch, poolSharePct, unlock, lockWeeks).
 * @param {Object} [opts] - { seaportBuyEnabled }
 */
export function buildCard(lot, opts = {}) {
  const card = el('article', 'sf-card');
  card.dataset.tokenId = String(lot.tokenId);
  card.dataset.source = lot.source;
  if (lot.status === 'pending') card.classList.add('is-pending');
  if (lot.priceUsdc == null) card.classList.add('is-unlisted');

  const head = el('div', 'sf-card-head');
  head.appendChild(providerNode(lot));

  const badges = el('div', 'sf-badges');
  const statusText = lot.status === 'unlisted' ? 'Not listed' : lot.status === 'pending' ? 'Pending' : 'Listed';
  badges.appendChild(badge(statusText, lot.status === 'listed' ? 'ok' : 'muted'));
  head.appendChild(badges);
  card.appendChild(head);

  const idRow = el('div', 'sf-card-id');
  const idLink = el('a', 'sf-id-link', '#' + lot.tokenId);
  idLink.href = '#position/' + lot.tokenId;
  idRow.appendChild(idLink);
  card.appendChild(idRow);

  const stats = el('dl', 'sf-stats');
  stats.appendChild(stat('Amount', amountFmt.format(lot.amountAnts) + ' ANTS', 'ANTS locked in this position.'));
  stats.appendChild(stat(
    'Lock',
    lot.lockWeeks === 'max' ? 'max lock' : `${lot.lockWeeks ?? '—'}w · unlocks ${formatUnlock(lot.unlock)}`,
    "Weeks left in the lock; 'max' keeps constant weight that never counts down."
  ));
  stats.appendChild(stat('APR', lot.aprPct == null ? '—' : lot.aprPct.toFixed(1) + '%', 'Annualised staker reward on this position. Boost is a separate badge.'));
  stats.appendChild(stat('Reward', lot.antsPerEpoch == null ? '—' : `≈${lot.antsPerEpoch.toFixed(2)} ANTS/epoch`, 'Estimated staker reward for the current epoch, in ANTS. Boost is separate.'));
  stats.appendChild(stat(
    'Boost',
    lot.poolSharePct == null ? '—' : `${(lot.poolSharePct * 100).toFixed(2)}% of next-epoch weight`,
    'Share of the provider pool weight; raises buyer points, not holder ANTS.'
  ));
  card.appendChild(stats);

  const priceRow = el('div', 'sf-price-row');
  priceRow.appendChild(el('span', 'sf-price', formatPrice(lot.priceUsdc)));
  priceRow.appendChild(el('span', 'sf-unit', formatPerAnt(lot.perAntUsd)));
  if (lot.priceUsdc == null) priceRow.classList.add('is-empty');
  card.appendChild(priceRow);

  const actions = el('div', 'sf-actions');
  const buy = buyNode(lot, opts);
  if (buy) actions.appendChild(buy);

  if (lot.priceUsdc == null) {
    const offer = el('button', 'sf-btn sf-offer', 'Make offer');
    offer.type = 'button';
    offer.dataset.tokenId = String(lot.tokenId);
    actions.appendChild(offer);
  }

  card.appendChild(actions);
  card.appendChild(el('div', 'sf-msg'));
  return card;
}
