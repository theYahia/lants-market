// site/incentives-dom.test.mjs - incentives DOM builders (offer section/cards,
// metric cards, hero, section shell, calculator, board).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setupDom, teardown } from './dom-test-helper.mjs';

const SNAPSHOT = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/snapshot-e23.full.json', import.meta.url)), 'utf8'));

let inc;

test.before(async () => {
  setupDom();
  inc = await import('./incentives.mjs');
});
test.after(() => teardown());

const stakeOffer = {
  pool: '44694',
  epochs: [25],
  usdcPer1k: 1,
  capAnts: 10000,
  payer: '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B',
  pays: 'new',
};

const rebateOffer = {
  type: 'rebate',
  pool: '52894',
  epochs: [28],
  pctBps: 100,
  capUsdc: 1,
  capPerBuyerUsdc: 0.2,
  payer: '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B',
};

test('buildOfferSection: valid offers render as list items with notes', () => {
  const div = inc.buildOfferSection([stakeOffer], 25, {});
  assert.equal(div.className, 'inc-offers');
  assert.equal(div.querySelector('h3').textContent, 'Offers');
  const items = [...div.querySelectorAll('.inc-offers-list li')];
  assert.equal(items.length, 1);
  assert.match(items[0].textContent, /Pool 44694/);
});

test('buildOfferSection: null offers show a fallback line', () => {
  const div = inc.buildOfferSection(null, 25, {});
  assert.equal(div.querySelector('li').textContent, 'Offers unavailable');
});

test('buildOfferSection: no valid offers shows the empty-epoch line', () => {
  const div = inc.buildOfferSection([{ ...stakeOffer, pool: 'broken', epochs: [99] }], 25, {});
  assert.equal(div.querySelector('li').textContent, 'No offers for epoch 25 yet — be the first.');
});

test('buildOfferSection: a note attaches to its row', () => {
  const withNote = { ...stakeOffer, note: 'Sponsored by the team.' };
  const div = inc.buildOfferSection([withNote, stakeOffer], 25, {});
  assert.equal(div.querySelectorAll('li').length, 2);
  const note = div.querySelector('.inc-offer-note');
  assert.equal(note.textContent, 'Sponsored by the team.');
});

test('offerCard: splits pool name, rate and conditions into a structured card', () => {
  const card = inc.offerCard(stakeOffer, 25, { 44694: 'GesundAI' });
  assert.equal(card.title, 'GesundAI');
  assert.equal(card.rate, '1 USDC per 1,000 ANTS at max lock');
  assert.match(card.sub, /Pool 44694 · epoch 25 · new stakes only/);
  assert.equal(card.note, '');
  const rebate = inc.offerCard(rebateOffer, 28, {});
  assert.equal(rebate.title, 'Pool 52894');
  assert.match(rebate.rate, /1% back, up to \$1/);
});

test('buildOfferSection: renders cards with a title and rate line', () => {
  const div = inc.buildOfferSection([stakeOffer], 25, { 44694: 'GesundAI' });
  const li = div.querySelector('.inc-offers-list li');
  assert.equal(li.querySelector('.inc-offer-card-title').textContent, 'GesundAI');
  assert.match(li.querySelector('.inc-offer-card-rate').textContent, /1 USDC per 1,000 ANTS at max lock/);
  assert.match(li.querySelector('.inc-offer-card-sub').textContent, /new stakes only/);
});

test('buildMetrics: four cards with the headline labels, values and caption', () => {
  const grid = inc.buildMetrics(5000, 12345, 405, '5d 04h 12m', 25);
  assert.equal(grid.className, 'inc-metrics');
  assert.equal(grid.querySelector('.inc-metrics-caption').textContent, 'From snapshot, epoch 25');
  const cards = [...grid.querySelectorAll('.inc-metric')];
  assert.equal(cards.length, 4);
  assert.ok(cards[0].classList.contains('inc-metric--budget'));
  assert.ok(cards[3].classList.contains('inc-metric--countdown'));
  const labels = cards.map((c) => c.querySelector('.inc-metric-label-text').textContent);
  const values = cards.map((c) => c.querySelector('.inc-metric-value').textContent);
  assert.deepEqual(labels, [
    'Next-epoch staker budget',
    'ANTS staked next epoch',
    'Avg reward per 1,000 ANTS / epoch',
    'Next epoch starts in',
  ]);
  assert.deepEqual(values, ['5,000 ANTS', '12,345', '405', '5d 04h 12m']);
  assert.ok(cards[2].querySelector('.info[data-tip]'));
});

test('buildMetrics: null budget and average render as an em dash', () => {
  const grid = inc.buildMetrics(null, 12345, null, '1d 00h 00m', 25);
  const values = [...grid.querySelectorAll('.inc-metric-value')].map((v) => v.textContent);
  assert.deepEqual(values, ['—', '12,345', '—', '1d 00h 00m']);
});

test('buildHero: hero root with title, secondary meta and network summary', () => {
  const hero = inc.buildHero('Incentives', 'Epoch 25 \u00B7 starts soon', 'Network, epoch 25: 5,000 ANTS to stakers');
  assert.equal(hero.className, 'inc-hero');
  assert.equal(hero.querySelector('.inc-header h2').textContent, 'Incentives');
  assert.equal(hero.querySelector('.inc-header h2').className, 'inc-hero-title');
  assert.equal(hero.querySelector('.inc-hero-meta').textContent, 'Epoch 25 \u00B7 starts soon');
  assert.equal(hero.querySelector('.inc-net').textContent, 'Network, epoch 25: 5,000 ANTS to stakers');
});

test('buildSection: a titled section shell wraps its body', () => {
  const body = document.createElement('div');
  body.className = 'stub-body';
  const section = inc.buildSection('Pool board', 'Stake to earn ANTS.', body, 'inc-board-section');
  assert.ok(section.classList.contains('inc-section'));
  assert.ok(section.classList.contains('inc-board-section'));
  assert.equal(section.querySelector('.inc-section-title').textContent, 'Pool board');
  assert.equal(section.querySelector('.inc-section-lead').textContent, 'Stake to earn ANTS.');
  assert.equal(section.querySelector('.stub-body'), body);
  const bare = inc.buildSection('Only title', null, null, null);
  assert.ok(bare.classList.contains('inc-section'));
  assert.equal(bare.querySelector('.inc-section-lead'), null);
});

test('buildCalculator: a card with a heading and generated controls', () => {
  const calc = inc.buildCalculator(SNAPSHOT, { mode: 'live', epoch: '23' }, null, 24, {});
  assert.equal(calc.className, 'inc-calc');
  assert.equal(calc.querySelector('h3').textContent, 'Estimated rewards calculator');
  assert.ok(calc.querySelector('select'));
  const amount = calc.querySelector('input[type=number]#inc-calc-amount');
  assert.ok(amount);
  assert.equal(amount.value, '1000');
  assert.ok(calc.querySelector('.inc-calc-result'));
  assert.ok(calc.querySelector('.inc-calc-rebate'));
});

test('buildCalculator: a snapshot without pool 52894 does not throw', () => {
  const snap = {
    epoch: '23',
    positions: [{ agentId: '99999', rewardByEpoch: {}, weightsByEpoch: { '23': '1', '24': '1' } }],
  };
  const calc = inc.buildCalculator(snap, { mode: 'live', epoch: '23' }, null, 24, {});
  assert.equal(calc.querySelector('select').value, '52894');
});

test('board Calculate action selects the pool in the calculator', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const board = inc.buildBoard(SNAPSHOT, { mode: 'live', epoch: '23' }, null, 24, {});
  const calc = inc.buildCalculator(SNAPSHOT, { mode: 'live', epoch: '23' }, null, 24, {});
  container.appendChild(board);
  container.appendChild(calc);

  const firstRow = board.querySelector('tbody tr.board-row');
  const pool = firstRow.dataset.pool;
  const expandBtn = firstRow.querySelector('.inc-expand');
  expandBtn.click();
  const detail = firstRow.nextElementSibling;
  assert.ok(detail.classList.contains('inc-detail'));
  const calcBtn = detail.querySelector('.inc-calc-btn');
  assert.ok(calcBtn, 'detail row has a Calculate action');
  calcBtn.click();
  assert.equal(calc.querySelector('select').value, pool);
  container.remove();
});

console.log('incentives_dom_ok=1');
