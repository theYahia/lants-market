// site/sell-modal.test.mjs - sellable classification, fee math and the
// sell modal steps (pick, form, review, create).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardown } from './dom-test-helper.mjs';
import { buildSellChoices, feeBreakdown, clampDays, listingMeta, endDateFromDays, usdcToWei } from './sell-model.mjs';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const WORD = (hex) => '0x' + hex.padStart(64, '0');

test('feeBreakdown: 1% seller fee, net and per-ANTS price', () => {
  const fee = feeBreakdown(2, 100);
  assert.equal(fee.gross, 2);
  assert.equal(fee.fee, 0.02);
  assert.equal(fee.net, 1.98);
  assert.equal(fee.perAnts, 0.02);
});

test('feeBreakdown: rejects non-positive and non-numeric prices', () => {
  assert.equal(feeBreakdown(0, 100), null);
  assert.equal(feeBreakdown(-1, 100), null);
  assert.equal(feeBreakdown('abc', 100), null);
  assert.equal(feeBreakdown(1, 0).perAnts, null);
});

test('usdcToWei: scales USDC to six-decimal units and rejects bad prices', () => {
  assert.equal(usdcToWei(2), 2000000n);
  assert.equal(usdcToWei('0.01'), 10000n);
  assert.equal(usdcToWei(0.0000004), null);
  assert.equal(usdcToWei('0.005'), null);
  assert.equal(usdcToWei(0), null);
  assert.equal(usdcToWei(-1), null);
  assert.equal(usdcToWei('abc'), null);
});

test('clampDays: 1..60, rejects above the contract cap and zero', () => {
  assert.equal(clampDays(1), 1);
  assert.equal(clampDays('30'), 30);
  assert.equal(clampDays(60), 60);
  assert.equal(clampDays(61), null);
  assert.equal(clampDays(0), null);
  assert.equal(clampDays(-5), null);
  assert.equal(clampDays('abc'), null);
  assert.equal(endDateFromDays(0), '-');
});

test('listingMeta: price, seller net and listing end date', () => {
  const meta = listingMeta({ price: 5_000_000n, endTime: 1_800_000_000n });
  assert.equal(meta.priceUsdc, 5);
  assert.equal(meta.netUsdc, 4.95);
  assert.equal(meta.endLabel, new Date(1_800_000_000_000).toISOString().slice(0, 10));
  assert.equal(listingMeta({ price: 0n }).netUsdc, null);
});

const positions = [
  { id: '1', amount: '100000000000000000000', stakeStartEpoch: 20, closedAtEpoch: 0 },
  { id: '3', amount: '200000000000000000000', stakeStartEpoch: 31, closedAtEpoch: 0 },
  { id: '4', amount: '300000000000000000000', stakeStartEpoch: 20, closedAtEpoch: 29 },
  { id: '5', amount: '400000000000000000000', stakeStartEpoch: 20, closedAtEpoch: 0, withdrawn: true },
];
const listings = [
  { listingId: 7n, nftId: 2n, price: 5_000_000n, isLive: true, seller: ACCOUNT, ownerMismatch: false, chainClosed: false },
  { listingId: 8n, nftId: 6n, price: 1_000_000n, isLive: true, seller: '0x2222222222222222222222222222222222222222', ownerMismatch: false, chainClosed: false },
  { listingId: 9n, nftId: 1n, price: 1_000_000n, isLive: false, seller: ACCOUNT, ownerMismatch: false, chainClosed: false },
];

test('buildSellChoices: sellable, listed, pending, unavailable only', () => {
  const choices = buildSellChoices({
    myIds: ['1', '2', '3', '4', '5', '6'],
    positions,
    listings,
    account: ACCOUNT,
    epoch: 30,
  });
  assert.deepEqual(choices.map((c) => [c.tokenId, c.state]), [
    ['1', 'sellable'],
    ['2', 'listed'],
    ['3', 'pending'],
    ['6', 'unavailable'],
  ]);
  assert.equal(choices[0].ants, 100);
  assert.equal(choices[1].priceUsdc, 5);
});

test('buildSellChoices: ignores live listings of other sellers on the same id', () => {
  const choices = buildSellChoices({
    myIds: ['6'],
    positions,
    listings,
    account: ACCOUNT,
    epoch: 30,
  });
  assert.equal(choices[0].state, 'unavailable');
});

test('buildSellChoices: closed and withdrawn positions are dropped', () => {
  const choices = buildSellChoices({
    myIds: ['4', '5'],
    positions,
    listings: [],
    account: ACCOUNT,
    epoch: 30,
  });
  assert.deepEqual(choices, []);
});

test.before(async () => {
  setupDom(`<!doctype html><html><body>
    <div class="offer-modal" id="sell-modal" hidden>
      <div class="offer-card">
        <div class="offer-head"><button class="offer-x" type="button">x</button></div>
        <div id="sell-modal-body"></div>
      </div>
    </div>
  </body></html>`);
});

test.after(() => teardown());

const BASE_URL = new URL('./sell-modal.mjs', import.meta.url).href;

function makeDeps(overrides = {}) {
  const calls = { sends: [], refreshed: 0 };
  const deps = {
    account: ACCOUNT,
    myIds: ['1', '2', '3'],
    loadSnapshot: async () => ({ epoch: 30, positions }),
    readListings: async () => listings,
    connect: () => {},
    refresh: async () => { calls.refreshed += 1; },
    wallet: {
      daysToSeconds: (d) => {
        const n = Number(d);
        if (!Number.isFinite(n) || n <= 0) return null;
        const secs = Math.floor(n * 86400);
        return secs > 5184000 ? null : secs;
      },
      request: async (args) => {
        if (args.method === 'eth_requestAccounts') return [ACCOUNT];
        if (args.method === 'eth_sendTransaction') { calls.sends.push(args.params[0]); return '0xtx'; }
        throw new Error('unexpected ' + args.method);
      },
      ensureChain: async () => true,
      waitReceipt: async () => ({ status: '0x1' }),
      humanError: (e) => String((e && e.message) || e),
    },
    ...overrides,
  };
  return { deps, calls };
}

function stubRpc() {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const data = JSON.parse(init.body).params[0].data;
    const result = data.startsWith('0x6352211e')
      ? WORD(ACCOUNT.slice(2).toLowerCase())
      : WORD('1');
    return { ok: true, json: async () => ({ result }) };
  };
  return () => { globalThis.fetch = original; };
}

test('sell modal: pick, form, review and wallet create', async () => {
  const sell = await import(BASE_URL);
  const { deps, calls } = makeDeps();
  const restore = stubRpc();
  try {
    await sell.openSellModal(deps);
    assert.equal(document.getElementById('sell-modal').hidden, false);
    const items = [...document.querySelectorAll('.select-nft-item')];
    assert.equal(items.length, 1);
    assert.match(items[0].textContent, /#1 \u00b7 100\.00 ANTS/);
    assert.match(document.querySelector('.market-row button.cancel').dataset.id, /^7$/);
    assert.match(document.body.textContent, /#3 starts next epoch/);

    items[0].click();
    assert.match(document.body.textContent, /1\u201360 days/);
    const price = document.getElementById('sell-modal-body').querySelector('input[type=number]');
    price.value = '2';
    price.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.match(document.body.textContent, /net 1\.98/);

    const reviewBtn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Review listing');
    reviewBtn.click();
    assert.match(document.body.textContent, /You receive: 1\.98 USDC/);
    assert.match(document.body.textContent, /Price per ANTS: 0\.0200 USDC\/ANTS/);
    assert.match(document.body.textContent, /Duration: 30 days/);

    const go = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Continue to wallet');
    go.click();
    await new Promise((res) => setTimeout(res, 50));
    assert.equal(calls.sends.length, 1);
    assert.equal(calls.refreshed, 1);
    assert.match(document.body.textContent, /Listing created/);
  } finally {
    restore();
  }
});

test('sell modal: a preselected id jumps straight to the price form', async () => {
  const sell = await import(BASE_URL);
  const { deps } = makeDeps({ preselectedId: '1' });
  const restore = stubRpc();
  try {
    await sell.openSellModal(deps);
    assert.match(document.body.textContent, /Position #1/);
    assert.ok(document.querySelector('#sell-modal-body input[type=number]'));
  } finally {
    restore();
  }
});

test('sell modal: rejects an empty or sub-cent price before the review step', async () => {
  const sell = await import(BASE_URL);
  const { deps } = makeDeps();
  await sell.openSellModal(deps);
  document.querySelector('.select-nft-item').click();
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Review listing').click();
  assert.match(document.body.textContent, /Price must be greater than 0/);

  const price = document.getElementById('sell-modal-body').querySelector('input[type=number]');
  price.value = '0.005';
  price.dispatchEvent(new window.Event('input', { bubbles: true }));
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Review listing').click();
  assert.match(document.body.textContent, /Price must be at least 0\.01 USDC/);
});

test('sell modal: approves the marketplace before creating when needed', async () => {
  const sell = await import(BASE_URL);
  const { deps, calls } = makeDeps();
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const data = JSON.parse(init.body).params[0].data;
    const result = data.startsWith('0x6352211e')
      ? WORD(ACCOUNT.slice(2).toLowerCase())
      : data.startsWith('0xe985e9c5') ? WORD('0') : WORD('1');
    return { ok: true, json: async () => ({ result }) };
  };
  try {
    await sell.openSellModal(deps);
    document.querySelector('.select-nft-item').click();
    const price = document.getElementById('sell-modal-body').querySelector('input[type=number]');
    price.value = '2';
    price.dispatchEvent(new window.Event('input', { bubbles: true }));
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Review listing').click();
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Continue to wallet').click();
    await new Promise((res) => setTimeout(res, 50));
    assert.equal(calls.sends.length, 2);
    assert.match(calls.sends[0].data, /^0xa22cb465/);
    assert.match(calls.sends[1].data, /^0x10e8ee82/);
  } finally {
    globalThis.fetch = original;
  }
});

test('sell modal: refreshes the picker after a listing is cancelled', async () => {
  const sell = await import(BASE_URL);
  let current = listings;
  const { deps } = makeDeps({ readListings: async () => current });
  await sell.openSellModal(deps);
  assert.match(document.body.textContent, /#2 \u00b7 listed at/);
  current = listings.filter((it) => it.nftId !== 2n);
  document.dispatchEvent(new window.CustomEvent('listing:cancelled'));
  await new Promise((res) => setTimeout(res, 20));
  assert.doesNotMatch(document.body.textContent, /listed at/);
  assert.match(document.body.textContent, /#2 is not in the latest snapshot yet/);
});

test('sell modal: pauses when the listings read fails and retries on demand', async () => {
  const sell = await import(BASE_URL);
  let fail = true;
  const { deps } = makeDeps({
    readListings: async () => {
      if (fail) throw new Error('rpc unavailable');
      return listings;
    },
  });
  await sell.openSellModal(deps);
  assert.match(document.body.textContent, /Could not read your live listings/);
  assert.doesNotMatch(document.body.textContent, /listed at/);

  fail = false;
  [...document.querySelectorAll('button')].find((b) => b.textContent === 'Retry').click();
  await new Promise((res) => setTimeout(res, 20));
  assert.match(document.body.textContent, /#2 \u00b7 listed at/);
});
