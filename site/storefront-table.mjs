// Pure DOM builder for the veXy-style listing table. All values come
// precomputed on the lot; this module never fetches or decides validity.

import { formatUnlock } from './position-yield.mjs';
import { el, badge, formatPrice, formatPerAnt, buyNode } from './storefront-card.mjs';

const amountFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function cell(children) {
  const td = el('td', null, null);
  for (const child of children) if (child != null) td.appendChild(child);
  return td;
}

function sub(text, title) {
  const span = el('span', 'sf-sub', text);
  if (title) span.title = title;
  return span;
}

function statusText(lot) {
  if (lot.status === 'unlisted') return 'Not listed';
  if (lot.status === 'pending') return 'Pending';
  return 'Listed';
}

function statusKind(lot) {
  return lot.status === 'listed' ? 'ok' : 'muted';
}

function priceCell(lot) {
  if (lot.priceUsdc == null) {
    return cell([el('span', 'sf-price is-empty', '—')]);
  }
  return cell([el('span', 'sf-price', formatPrice(lot.priceUsdc)), sub(formatPerAnt(lot.perAntUsd))]);
}

function stakedCell(lot) {
  return cell([el('span', 'sf-staked', amountFmt.format(lot.amountAnts) + ' ANTS')]);
}

function rewardCell(lot) {
  const apr = lot.aprPct == null ? '—' : lot.aprPct.toFixed(1) + '%';
  const reward = lot.antsPerEpoch == null ? null : `≈${lot.antsPerEpoch.toFixed(2)} ANTS/epoch`;
  const aprEl = el('span', 'sf-apr', apr);
  aprEl.title = 'Staking reward only; boost is separate.';
  return cell([aprEl, reward ? sub(reward) : null]);
}

function unlockCell(lot) {
  const text = lot.lockWeeks === 'max'
    ? 'max lock'
    : (lot.lockWeeks == null ? '—' : `${lot.lockWeeks}w · ${formatUnlock(lot.unlock)}`);
  return cell([el('span', 'sf-unlock', text)]);
}

function actionsCell(lot, opts) {
  const td = el('td', 'sf-actions-col', null);
  const actions = el('div', 'sf-actions', null);
  const buy = buyNode(lot, opts);
  if (buy) actions.appendChild(buy);

  if (lot.priceUsdc == null) {
    const offer = el('button', 'sf-btn sf-offer', 'Make offer');
    offer.type = 'button';
    offer.dataset.tokenId = String(lot.tokenId);
    actions.appendChild(offer);
  }

  td.appendChild(actions);
  td.appendChild(el('div', 'sf-msg', null));
  return td;
}

const COLUMN_TIPS = {
  'Position ID': 'Position id in the lANTS collection on Base.',
  Price: 'Asking price in USDC, and the price per ANTS.',
  Staked: 'ANTS locked in this position.',
  Reward: 'Estimated staker reward for the current epoch: APR and ANTS per epoch. Boost is a separate badge.',
  Unlock: "Weeks left in the lock; 'max' never counts down.",
};

const COLUMN_SORT = {
  'Position ID': 'id',
  Price: 'perAnt',
  Staked: 'amount',
  Reward: 'apr',
  Unlock: 'unlock',
};

function thWithTip(name) {
  const th = el('th', name === 'Actions' ? 'sf-actions-col' : null, name);
  const tip = COLUMN_TIPS[name];
  if (tip) {
    const info = el('span', 'info', 'ⓘ');
    info.dataset.tip = tip;
    th.appendChild(info);
  }
  const key = COLUMN_SORT[name];
  if (key) {
    th.dataset.sort = key;
    th.classList.add('is-sortable');
  }
  return th;
}

export function buildTableHead() {
  const thead = el('thead', null, null);
  const tr = el('tr', null, null);
  const cols = ['Position ID', 'Price', 'Staked', 'Reward', 'Unlock', 'Actions'];
  for (const name of cols) tr.appendChild(thWithTip(name));
  thead.appendChild(tr);
  return thead;
}

/**
 * Build one listing row.
 *
 * @param {Object} lot - enriched lot (amountAnts, perAntUsd, priceUsdc, aprPct,
 *   antsPerEpoch, unlock, lockWeeks, status, source).
 * @param {Object} [opts] - { seaportBuyEnabled }
 */
export function buildRow(lot, opts = {}) {
  const tr = el('tr', 'sf-row', null);
  tr.dataset.tokenId = String(lot.tokenId);
  tr.dataset.source = lot.source;

  const idCell = el('td', 'sf-id-col', null);
  const idLink = el('a', 'sf-id-link', '#' + lot.tokenId);
  idLink.href = '#position/' + lot.tokenId;
  idCell.appendChild(idLink);
  if (lot.status !== 'listed') idCell.appendChild(badge(statusText(lot), statusKind(lot)));
  tr.appendChild(idCell);

  tr.appendChild(priceCell(lot));
  tr.appendChild(stakedCell(lot));
  tr.appendChild(rewardCell(lot));
  tr.appendChild(unlockCell(lot));
  tr.appendChild(actionsCell(lot, opts));
  return tr;
}
