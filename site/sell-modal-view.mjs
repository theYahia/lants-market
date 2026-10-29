// DOM for the sell modal: pick, price form, review and done steps.
// The flow module owns state and wallet calls; this file only renders.
import { MARKET, cancelNftListings } from './market-config.mjs';
import { feeBreakdown, clampDays, endDateFromDays } from './sell-model.mjs';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function antsLabel(ants) {
  return Number.isFinite(ants) ? ants.toFixed(2) + ' ANTS' : 'ANTS unavailable';
}

function summaryText(state) {
  const fee = feeBreakdown(state.price, state.selected && state.selected.ants);
  if (!fee) return 'Enter a price to see your net proceeds.';
  const perAnts = fee.perAnts == null ? '-' : fee.perAnts.toFixed(4) + ' USDC/ANTS';
  return 'Gross ' + fee.gross.toFixed(2) + ' USDC \u00b7 fee 1% ' + fee.fee.toFixed(2) +
    ' \u00b7 net ' + fee.net.toFixed(2) + ' \u00b7 ' + perAnts + ' \u00b7 ends ' + endDateFromDays(state.days);
}

function renderPick(body, state, h) {
  const sellable = state.choices.filter((c) => c.state === 'sellable');
  const listed = state.choices.filter((c) => c.state === 'listed');
  const blocked = state.choices.filter((c) => c.state === 'pending' || c.state === 'unavailable');

  body.appendChild(el('p', 'cf-note', 'Only sellable positions are listed. Live listings can be cancelled here.'));

  if (!sellable.length && !listed.length && !blocked.length) {
    body.appendChild(el('p', 'select-nft-empty-title', 'Nothing sellable right now'));
    body.appendChild(el('p', 'select-nft-empty-sub', 'Closed, withdrawn and pending positions cannot be listed.'));
    return;
  }

  const list = el('div', 'select-nft-list');
  for (const choice of sellable) {
    const item = el('button', 'select-nft-item', '#' + choice.tokenId + ' \u00b7 ' + antsLabel(choice.ants));
    item.type = 'button';
    item.addEventListener('click', () => h.select(choice.tokenId));
    list.appendChild(item);
  }
  for (const choice of listed) {
    const row = el('div', 'market-row');
    row.appendChild(document.createTextNode('#' + choice.tokenId + ' \u00b7 listed at '));
    row.appendChild(el('span', '', Number.isFinite(choice.priceUsdc) ? choice.priceUsdc.toFixed(2) + ' USDC' : 'price unavailable'));
    const cancel = el('button', 'cancel', 'Cancel');
    cancel.type = 'button';
    cancel.dataset.id = choice.listingId;
    cancel.dataset.calldata = cancelNftListings(MARKET.nft, BigInt(choice.tokenId));
    row.appendChild(document.createTextNode(' '));
    row.appendChild(cancel);
    list.appendChild(row);
  }
  for (const choice of blocked) {
    const why = choice.state === 'pending'
      ? ' starts next epoch and cannot be listed yet.'
      : ' is not in the latest snapshot yet; retry after the next snapshot.';
    list.appendChild(el('div', 'cf-note', '#' + choice.tokenId + why));
  }
  body.appendChild(list);
}

function renderForm(body, state, h) {
  const chosen = state.selected;
  body.appendChild(el('p', 'cf-note', 'Position #' + chosen.tokenId + ' \u00b7 ' + antsLabel(chosen.ants)));
  body.appendChild(el('p', 'cf-note', 'The buyer pays the price; you receive it minus the 1% marketplace fee.'));

  const row = el('div', 'cf-row');
  const priceField = el('label', 'cf-field');
  priceField.appendChild(el('span', '', 'Price (USDC)'));
  const priceInput = el('input');
  priceInput.type = 'number';
  priceInput.min = '0.01';
  priceInput.step = '0.01';
  priceInput.placeholder = '2.00';
  priceInput.value = state.price;
  priceField.appendChild(priceInput);

  const daysField = el('label', 'cf-field');
  daysField.appendChild(el('span', '', 'Duration (days)'));
  const daysInput = el('input');
  daysInput.type = 'number';
  daysInput.min = '1';
  daysInput.max = '60';
  daysInput.step = '1';
  daysInput.value = state.days;
  daysField.appendChild(daysInput);
  daysField.appendChild(el('span', 'cf-note', '1\u201360 days'));
  row.appendChild(priceField);
  row.appendChild(daysField);

  const summary = el('div', 'cf-summary', summaryText(state));
  const update = () => { summary.textContent = summaryText(state); };
  priceInput.addEventListener('input', () => { state.price = priceInput.value; update(); });
  daysInput.addEventListener('input', () => { state.days = daysInput.value; update(); });

  const review = el('button', 'offer-cta', 'Review listing');
  review.type = 'button';
  review.addEventListener('click', () => h.review());

  body.appendChild(row);
  body.appendChild(summary);
  body.appendChild(review);
}

function renderReview(body, state, h) {
  const fee = feeBreakdown(state.price, state.selected && state.selected.ants);
  const rows = [
    ['Position', '#' + state.selected.tokenId],
    ['Staked', antsLabel(state.selected.ants)],
    ['Gross price', fee ? fee.gross.toFixed(2) + ' USDC' : '-'],
    ['Marketplace fee (1%)', fee ? fee.fee.toFixed(2) + ' USDC' : '-'],
    ['You receive', fee ? fee.net.toFixed(2) + ' USDC' : '-'],
    ['Price per ANTS', fee && fee.perAnts != null ? fee.perAnts.toFixed(4) + ' USDC/ANTS' : '-'],
    ['Currency', 'USDC'],
    ['Duration', clampDays(state.days) + ' days'],
    ['Ends', endDateFromDays(state.days)],
  ];
  for (const [label, value] of rows) {
    const line = el('div', 'cf-summary');
    line.appendChild(el('strong', '', label + ': '));
    line.appendChild(document.createTextNode(value));
    body.appendChild(line);
  }

  const row = el('div', 'cf-row');
  const back = el('button', '', 'Back');
  back.type = 'button';
  back.addEventListener('click', () => h.back());

  const go = el('button', 'offer-cta', state.busy ? 'Sending...' : 'Continue to wallet');
  go.type = 'button';
  go.disabled = state.busy;
  go.addEventListener('click', () => h.submit());
  row.appendChild(back);
  row.appendChild(go);
  body.appendChild(row);
}

function renderDone(body, h) {
  body.appendChild(el('p', 'select-nft-empty-title', 'Listing created'));
  body.appendChild(el('p', 'select-nft-empty-sub', 'My Listings and the storefront now show the live lot.'));
  const close = el('button', 'offer-cta', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => h.close());
  body.appendChild(close);
}

function renderRetry(body, h) {
  body.appendChild(el('p', 'select-nft-empty-title', 'Could not read your live listings'));
  body.appendChild(el('p', 'select-nft-empty-sub', 'Selling is paused so an already listed position is not listed twice. Retry the marketplace read.'));
  const retry = el('button', 'offer-cta', 'Retry');
  retry.type = 'button';
  retry.addEventListener('click', () => h.retry());
  body.appendChild(retry);
}

export function renderSellModal(state, h) {
  const body = document.getElementById('sell-modal-body');
  if (!body) return;
  body.textContent = '';

  if (state.step === 'connect') {
    body.appendChild(el('p', 'select-nft-empty-sub', 'Connect a wallet to list a position.'));
    const connect = el('button', 'offer-cta', 'Connect wallet');
    connect.type = 'button';
    connect.addEventListener('click', () => h.connect());
    body.appendChild(connect);
  } else if (state.step === 'loading') {
    body.appendChild(el('p', 'select-nft-empty-sub', 'Loading your positions...'));
  } else if (state.step === 'pick') {
    renderPick(body, state, h);
  } else if (state.step === 'retry') {
    renderRetry(body, h);
  } else if (state.step === 'form') {
    renderForm(body, state, h);
  } else if (state.step === 'review') {
    renderReview(body, state, h);
  } else if (state.step === 'done') {
    renderDone(body, h);
  }

  if (state.status && state.step !== 'done') body.appendChild(el('div', 'cf-status', state.status));
  if (state.error) body.appendChild(el('div', 'cf-status', state.error));
}
