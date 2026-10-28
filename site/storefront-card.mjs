// Pure DOM builder for one storefront card. All values come precomputed on
// the lot; this module never fetches, reads the wallet or decides validity.

import { formatUnlock } from './position-yield.mjs';

export const SEAPORT_MARKET_URL = 'https://antseedmarkets.com/markets';
export const PROVIDER_URL = 'https://antseedpoints.com/sellers/';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd4 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
const amountFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function stat(dt, dd, title) {
  const row = el('div', 'sf-stat');
  row.appendChild(el('dt', null, dt));
  const value = el('dd', null);
  if (dd instanceof Node) value.appendChild(dd);
  else value.textContent = dd;
  if (title) row.title = title;
  row.appendChild(value);
  return row;
}

function badge(text, kind) {
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

function buyNode(lot, opts) {
  if (lot.priceUsdc == null) return null;

  if (lot.source === 'lants' && lot.listingId != null) {
    const btn = el('button', 'sf-btn sf-buy', 'Buy');
    btn.type = 'button';
    btn.dataset.source = 'lants';
    btn.dataset.listingId = String(lot.listingId);
    btn.dataset.price = String(lot.priceMicro ?? Math.round(lot.priceUsdc * 1e6));
    btn.dataset.currency = lot.currency || '';
    return btn;
  }

  if (lot.source === 'seaport') {
    if (opts.seaportBuyEnabled) {
      const btn = el('button', 'sf-btn sf-buy', 'Buy');
      btn.type = 'button';
      btn.dataset.source = 'seaport';
      btn.dataset.tokenId = String(lot.tokenId);
      btn.dataset.price = String(Math.round(lot.priceUsdc * 1e6));
      return btn;
    }
    const a = el('a', 'sf-btn sf-btn-link', 'Buy on antseedmarkets.com');
    a.href = SEAPORT_MARKET_URL;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
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
  badges.appendChild(badge(lot.source === 'seaport' ? 'Seaport' : 'lants', lot.source));
  for (const other of lot.alsoOn || []) {
    badges.appendChild(badge(other === 'seaport' ? 'also on Seaport' : 'also on lants', 'alt'));
  }
  const statusText = lot.status === 'unlisted' ? 'Not listed' : lot.status === 'pending' ? 'Pending' : 'Listed';
  badges.appendChild(badge(statusText, lot.status === 'listed' ? 'ok' : 'muted'));
  head.appendChild(badges);
  card.appendChild(head);

  const idRow = el('div', 'sf-card-id');
  const idLink = el('a', 'sf-id-link', '#' + lot.tokenId);
  idLink.href = '#position/' + lot.tokenId;
  idRow.appendChild(idLink);
  if (lot.source === 'seaport') idRow.appendChild(el('span', 'sf-attrib', 'Seaport order · listed on antseedmarkets.com'));
  card.appendChild(idRow);

  const stats = el('dl', 'sf-stats');
  stats.appendChild(stat('Amount', amountFmt.format(lot.amountAnts) + ' ANTS'));
  stats.appendChild(stat(
    'Lock',
    lot.lockWeeks === 'max' ? 'max lock' : `${lot.lockWeeks ?? '—'}w · unlocks ${formatUnlock(lot.unlock)}`
  ));
  stats.appendChild(stat('APR', lot.aprPct == null ? '—' : lot.aprPct.toFixed(1) + '%', 'Staking reward only; boost is separate.'));
  stats.appendChild(stat('Reward', lot.antsPerEpoch == null ? '—' : `≈${lot.antsPerEpoch.toFixed(2)} ANTS/epoch`));
  stats.appendChild(stat(
    'Boost',
    lot.poolSharePct == null ? '—' : `${(lot.poolSharePct * 100).toFixed(2)}% of next-epoch weight`,
    'Share of the provider pool weight; it raises buyer points, not holder ANTS.'
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

  const offer = el('button', 'sf-btn sf-offer', 'Make offer');
  offer.type = 'button';
  offer.dataset.tokenId = String(lot.tokenId);
  actions.appendChild(offer);

  const share = el('button', 'sf-btn sf-share', 'Share');
  share.type = 'button';
  share.dataset.tokenId = String(lot.tokenId);
  actions.appendChild(share);

  card.appendChild(actions);
  card.appendChild(el('div', 'sf-msg'));
  return card;
}
