// site/storefront-card.test.mjs - pure DOM card builder under jsdom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardown } from './dom-test-helper.mjs';
import { el, badge, formatPrice, formatPerAnt, providerNode, buyNode, buildCard, PROVIDER_URL } from './storefront-card.mjs';

const lantsLot = {
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
  poolSharePct: 0.02,
  unlock: new Date('2027-01-15T00:00:00Z'),
  lockWeeks: 12,
};

const seaportLot = {
  tokenId: 205,
  source: 'seaport',
  amountAnts: 300,
  perAntUsd: 0.106746,
  priceUsdc: 32.02,
  provider: 'xV4x',
  agentId: '87124',
  status: 'listed',
  unlock: new Date('2026-12-01T00:00:00Z'),
  lockWeeks: 8,
  aprPct: 3.1,
  antsPerEpoch: 0.2,
  poolSharePct: null,
};

test.beforeEach(() => setupDom());
test.afterEach(() => teardown());

test('el: creates an element with class and text', () => {
  const node = el('div', 'sf-test', 'hello');
  assert.equal(node.tagName, 'DIV');
  assert.equal(node.className, 'sf-test');
  assert.equal(node.textContent, 'hello');
  const bare = el('span', null, null);
  assert.equal(bare.className, '');
  assert.equal(bare.textContent, '');
});

test('badge: applies the sf-badge kind class', () => {
  const b = badge('Listed', 'ok');
  assert.equal(b.className, 'sf-badge sf-badge-ok');
  assert.equal(b.textContent, 'Listed');
});

test('formatPrice/formatPerAnt: USD formatting with a dash for null', () => {
  assert.equal(formatPrice(10), '$10.00');
  assert.equal(formatPrice(null), '—');
  assert.equal(formatPerAnt(0.106746), '$0.1067 /ANTS');
  assert.equal(formatPerAnt(null), '—');
});

test('providerNode: links to the seller page when an agentId exists', () => {
  const a = providerNode(lantsLot);
  assert.equal(a.tagName, 'A');
  assert.equal(a.href, PROVIDER_URL + encodeURIComponent('52894'));
  assert.equal(a.target, '_blank');
  assert.equal(a.rel, 'noopener');
  const span = providerNode({ provider: 'nope', agentId: null });
  assert.equal(span.tagName, 'SPAN');
  assert.equal(span.textContent, 'nope');
  const unknown = providerNode({});
  assert.equal(unknown.textContent, 'unknown provider');
});

test('buyNode: lants button carries listing data', () => {
  const btn = buyNode(lantsLot, {});
  assert.equal(btn.dataset.source, 'lants');
  assert.equal(btn.dataset.listingId, '3');
  assert.equal(btn.dataset.price, '10000000');
  assert.equal(btn.dataset.currency, lantsLot.currency);
  assert.equal(btn.classList.contains('sf-buy'), true);
});

test('buyNode: seaport button requires the enabled flag', () => {
  const on = buyNode(seaportLot, { seaportBuyEnabled: true });
  assert.equal(on.dataset.source, 'seaport');
  assert.equal(on.dataset.tokenId, '205');
  assert.equal(on.dataset.price, '32020000'); // Math.round(32.02e6)
  assert.equal(buyNode(seaportLot, {}), null);
  assert.equal(buyNode({ ...lantsLot, priceUsdc: null }, {}), null);
});

test('buyNode: null price yields no buy button', () => {
  assert.equal(buyNode({ ...lantsLot, priceUsdc: null }, {}), null);
});

test('buildCard: lants card structure, badges and stats', () => {
  const card = buildCard(lantsLot, { seaportBuyEnabled: true });
  assert.equal(card.tagName, 'ARTICLE');
  assert.equal(card.dataset.tokenId, '12');
  assert.equal(card.dataset.source, 'lants');
  assert.equal(card.querySelector('.sf-badge').textContent, 'Listed');
  assert.equal(card.querySelector('.sf-id-link').href.endsWith('#position/12'), true);
  const stats = [...card.querySelectorAll('.sf-stat')];
  assert.equal(stats.length, 5);
  assert.match(card.querySelector('.sf-price').textContent, /^\$10\.00$/);
  assert.match(card.querySelector('.sf-unit').textContent, /\/ANTS$/);
  const buy = card.querySelector('.sf-buy');
  assert.equal(buy.dataset.source, 'lants');
  assert.equal(card.querySelector('.sf-offer'), null);
  assert.equal(card.querySelector('.sf-msg').tagName, 'DIV');
});

test('buildCard: max-lock renders the lock stat without a date', () => {
  const card = buildCard({ ...lantsLot, lockWeeks: 'max', unlock: 'max' }, {});
  const lockStat = card.querySelectorAll('.sf-stat')[1];
  assert.match(lockStat.textContent, /max lock/);
  assert.ok(!lockStat.textContent.includes('unlocks'));
});

test('buildCard: pending and unlisted statuses', () => {
  const pending = buildCard({ ...lantsLot, status: 'pending', priceUsdc: null }, {});
  assert.equal(pending.classList.contains('is-pending'), true);
  assert.equal(pending.classList.contains('is-unlisted'), true);
  assert.equal(pending.querySelector('.sf-badge').textContent, 'Pending');
  const offer = pending.querySelector('.sf-offer');
  assert.equal(offer.dataset.tokenId, '12');
  assert.equal(pending.querySelector('.sf-buy'), null);

  const unlisted = buildCard({ ...lantsLot, status: 'unlisted', priceUsdc: null }, {});
  assert.equal(unlisted.querySelector('.sf-badge').textContent, 'Not listed');
});

test('buildCard: seaport card with buy enabled', () => {
  const card = buildCard(seaportLot, { seaportBuyEnabled: true });
  const buy = card.querySelector('.sf-buy');
  assert.equal(buy.dataset.source, 'seaport');
  assert.equal(buy.dataset.tokenId, '205');
});

test('buildCard: null apr/reward/boost render dashes', () => {
  const card = buildCard({ ...lantsLot, aprPct: null, antsPerEpoch: null, poolSharePct: null, lockWeeks: null, unlock: null }, {});
  const texts = [...card.querySelectorAll('.sf-stat')].map((s) => s.textContent);
  assert.ok(texts.some((t) => t.includes('—')));
  assert.ok(texts.some((t) => t.includes('· unlocks ')));
});

console.log('storefront_card_ok=1');
