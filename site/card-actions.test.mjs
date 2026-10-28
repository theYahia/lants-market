// site/card-actions.test.mjs - delegated buy/share/offer clicks with injected deps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardown } from './dom-test-helper.mjs';
import { initCardActions } from './card-actions.mjs';

const flush = () => new Promise((r) => setTimeout(r, 0));

const CURRENCY = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

function makeGrid() {
  document.body.innerHTML = `
    <div id="grid">
      <article class="sf-card" data-token-id="12">
        <button class="sf-btn sf-buy" data-source="lants" data-listing-id="3" data-price="10000000" data-currency="${CURRENCY}">Buy</button>
        <button class="sf-btn sf-share" data-token-id="12">Share</button>
        <button class="sf-btn sf-offer" data-token-id="12">Make offer</button>
        <div class="sf-msg"></div>
      </article>
      <article class="sf-card" data-token-id="205">
        <button class="sf-btn sf-buy" data-source="seaport" data-token-id="205" data-price="32020000">Buy</button>
        <div class="sf-msg"></div>
      </article>
      <div class="offer-modal"></div>
      <button class="ms-offer">Open offer</button>
    </div>
  `;
  return document.getElementById('grid');
}

test.beforeEach(() => setupDom());
test.afterEach(() => teardown());

test('initCardActions: lants buy routes dataset to the injected buyer', async () => {
  const grid = makeGrid();
  const calls = [];
  let refreshed = 0;
  initCardActions(grid, {
    onRefresh: async () => { refreshed++; },
    buyListing: async (input, report) => {
      calls.push({ input, report });
      report('bought');
      return { ok: true };
    },
  });
  const buy = grid.querySelector('[data-source="lants"]');
  buy.click();
  assert.equal(buy.disabled, true); // disabled for the duration of the buy
  await flush();
  assert.equal(buy.disabled, false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].input, { id: 3, price: 10000000n, currency: CURRENCY });
  assert.equal(refreshed, 1);
  const msg = buy.closest('.sf-card').querySelector('.sf-msg');
  assert.equal(msg.textContent, 'bought');
});

test('initCardActions: a failing lants buy reports but does not refresh', async () => {
  const grid = makeGrid();
  let refreshed = 0;
  initCardActions(grid, {
    onRefresh: async () => { refreshed++; },
    buyListing: async (input, report) => {
      report('buy reverted', true);
      return { ok: false };
    },
  });
  grid.querySelector('[data-source="lants"]').click();
  await flush();
  assert.equal(refreshed, 0);
});

test('initCardActions: seaport buy passes token id and pending confirmation', async () => {
  const grid = makeGrid();
  const calls = [];
  const statusEls = [];
  initCardActions(grid, {
    buySeaportOrder: async (input) => {
      calls.push(input);
      statusEls.push(input.statusEl);
      if (calls.length === 1) return { ok: false, needsConfirm: true, priceMicro: '106746148' };
      return { ok: true };
    },
  });
  const buy = grid.querySelector('[data-source="seaport"]');
  buy.click();
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tokenId, 205);
  assert.equal(calls[0].cardPriceMicro, '32020000');
  assert.equal(calls[0].confirmedPriceMicro, undefined);
  // needsConfirm stores the price; the next click passes it as confirmed
  buy.click();
  await flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].confirmedPriceMicro, '106746148');
  assert.ok(statusEls[0] instanceof Element);
});

test('initCardActions: share copies the position deep link via clipboard', async () => {
  const grid = makeGrid();
  let copied = '';
  const copy = async (text) => { copied = text; };
  initCardActions(grid, { copy });
  grid.querySelector('.sf-share').click();
  await flush();
  assert.ok(copied.endsWith('#position/12'));
  assert.equal(grid.querySelector('.sf-card .sf-msg').textContent, 'Link copied');
});

test('initCardActions: a failing copy reports an error', async () => {
  const grid = makeGrid();
  initCardActions(grid, {
    copy: async () => { throw new Error('denied'); },
  });
  grid.querySelector('.sf-share').click();
  await flush();
  const msg = grid.querySelector('.sf-card .sf-msg');
  assert.equal(msg.textContent, 'Copy failed');
  assert.equal(msg.classList.contains('is-error'), true);
});

test('initCardActions: share falls back to document.execCommand without the Clipboard API', async () => {
  const grid = makeGrid();
  let execCalled = false;
  document.execCommand = () => { execCalled = true; return true; };
  initCardActions(grid, { copy: null }); // exercises the default fallback
  grid.querySelector('.sf-share').click();
  await flush();
  assert.equal(execCalled, true);
});

test('initCardActions: offer sets the modal token id and opens it', async () => {
  const grid = makeGrid();
  let openerClicks = 0;
  document.querySelector('.ms-offer').addEventListener('click', () => openerClicks++);
  initCardActions(grid, {});
  grid.querySelector('.sf-offer').click();
  await flush();
  assert.equal(document.querySelector('.offer-modal').dataset.tokenId, '12');
  assert.equal(openerClicks, 1);
});

console.log('card_actions_ok=1');
