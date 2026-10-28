// site/storefront-table.test.mjs - pure DOM table row builder under jsdom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardown } from './dom-test-helper.mjs';
import { buildTableHead, buildRow } from './storefront-table.mjs';

const lot = {
  tokenId: 12,
  source: 'lants',
  listingId: 3,
  amountAnts: 100,
  perAntUsd: 0.1,
  priceUsdc: 10,
  priceMicro: 10000000,
  currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  provider: 'Apex',
  agentId: '52894',
  status: 'listed',
  aprPct: 5.2,
  antsPerEpoch: 0.4,
  unlock: new Date('2027-01-15T00:00:00Z'),
  lockWeeks: 12,
};

test.beforeEach(() => setupDom());
test.afterEach(() => teardown());

test('buildTableHead: six columns with tips', () => {
  const thead = buildTableHead();
  assert.equal(thead.tagName, 'THEAD');
  const ths = [...thead.querySelectorAll('th')];
  assert.equal(ths.length, 6);
  assert.deepEqual(ths.map((t) => t.textContent.replace('ⓘ', '').trim()), ['Position ID', 'Price', 'Staked', 'Reward', 'Unlock', 'Actions']);
  assert.equal(ths[0].querySelector('.info').dataset.tip.length > 0, true);
  assert.equal(ths[5].className, 'sf-actions-col');
});

test('buildRow: full listed lants row structure', () => {
  const tr = buildRow(lot, { seaportBuyEnabled: true });
  assert.equal(tr.tagName, 'TR');
  assert.equal(tr.dataset.tokenId, '12');
  assert.equal(tr.dataset.source, 'lants');
  const cells = tr.children;
  assert.equal(cells.length, 6);

  // Position cell: id link only (a listed row needs no "Listed" badge)
  const idCell = cells[0];
  assert.equal(idCell.querySelector('.sf-id-link').textContent, '#12');
  assert.equal(idCell.querySelector('.sf-badge'), null);

  // Price cell: price + per-ANT sub
  assert.match(cells[1].querySelector('.sf-price').textContent, /^\$10\.00$/);
  assert.equal(cells[1].querySelector('.sf-sub').textContent, '$0.10 /ANTS');

  // Staked cell
  assert.equal(cells[2].querySelector('.sf-staked').textContent, '100 ANTS');

  // Reward cell: APR + ants/epoch
  assert.equal(cells[3].querySelector('.sf-apr').textContent, '5.2%');
  assert.equal(cells[3].querySelector('.sf-sub').textContent, '≈0.40 ANTS/epoch');

  // Unlock cell
  assert.equal(cells[4].querySelector('.sf-unlock').textContent, '12w · 15 Jan 2027');

  // Actions cell: buy button
  const buy = cells[5].querySelector('.sf-buy');
  assert.equal(buy.dataset.source, 'lants');
  assert.equal(buy.dataset.listingId, '3');
  assert.equal(cells[5].querySelector('.sf-msg').tagName, 'DIV');
});

test('buildRow: pending status renders a muted badge', () => {
  const tr = buildRow({ ...lot, status: 'pending', priceUsdc: null }, {});
  const badgeEl = tr.querySelector('.sf-badge');
  assert.equal(badgeEl.textContent, 'Pending');
  assert.equal(badgeEl.className, 'sf-badge sf-badge-muted');
});

test('buildRow: unlisted status offers instead of buying', () => {
  const tr = buildRow({ ...lot, status: 'unlisted', priceUsdc: null }, {});
  assert.equal(tr.querySelector('.sf-badge').textContent, 'Not listed');
  assert.equal(tr.querySelector('.sf-buy'), null);
  const offer = tr.querySelector('.sf-offer');
  assert.equal(offer.dataset.tokenId, '12');
  assert.match(tr.querySelector('.sf-price').textContent, /—/);
});

test('buildRow: null apr/reward render dashes in the reward cell', () => {
  const tr = buildRow({ ...lot, aprPct: null, antsPerEpoch: null }, {});
  const reward = tr.children[3];
  assert.equal(reward.querySelector('.sf-apr').textContent, '—');
  assert.equal(reward.querySelector('.sf-sub'), null);
});

test('buildRow: max lock in the unlock cell', () => {
  const tr = buildRow({ ...lot, lockWeeks: 'max', unlock: 'max' }, {});
  assert.equal(tr.children[4].querySelector('.sf-unlock').textContent, 'max lock');
});

test('buildRow: seaport buy button when enabled', () => {
  const sea = { ...lot, source: 'seaport', tokenId: 205, listingId: null, perAntUsd: 0.1, priceUsdc: 32.02, priceMicro: null };
  const off = buildRow(sea, {});
  assert.equal(off.querySelector('.sf-buy'), null);
  const on = buildRow(sea, { seaportBuyEnabled: true });
  const buy = on.querySelector('.sf-buy');
  assert.equal(buy.dataset.source, 'seaport');
  assert.equal(buy.dataset.tokenId, '205');
});

test('buildRow: share button is never part of the table row', () => {
  const tr = buildRow(lot, {});
  assert.equal(tr.querySelector('.sf-share'), null);
});

console.log('storefront_table_ok=1');
