// site/seaport-buy.test.mjs - buySeaportOrder flow on the order-205 fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setupDom, teardown } from './dom-test-helper.mjs';
import { MARKET, SEL, encAddr, encUint } from './market-config.mjs';
import { SEAPORT_16, ZERO_ADDRESS, SEL as SEAPORT_SEL } from './seaport-abi.mjs';
import { buySeaportOrder } from './seaport-buy.mjs';

const ORDER = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/seaport/order-205.json', import.meta.url)), 'utf8'));
const OFFERER = ORDER.offerer.toLowerCase();
const TOKEN_ID = 205;
const PRICE = 106746148n; // fixture consideration startAmount

const BUYER = '0xabcdef0000000000000000000000000000000001';

const word = (v) => BigInt(v).toString(16).padStart(64, '0');
const addrWord = (a) => a.replace(/^0x/i, '').toLowerCase().padStart(64, '0');

const orderResponse = () => ({ ok: true, async json() { return ORDER; } });

function fakeStatus() {
  return {
    textContent: '',
    classList: { toggle() {} },
  };
}

// Default fake chain: owner == offerer, seller approved, counter 0, status open,
// buyer allowance covers the price.
function makeChain(overrides = {}) {
  const defaults = {
    owner: OFFERER,
    buyerOwner: BUYER, // owner reported after the purchase
    approvedForAll: 1n,
    getApproved: SEAPORT_16,
    counter: 0n,
    filled: false,
    allowance: PRICE,
  };
  const c = { ...defaults, ...overrides };
  let ownerReads = 0;
  const ethCallTo = async (to, data) => {
    const sel = data.slice(0, 10).toLowerCase();
    const toL = to.toLowerCase();
    if (toL === MARKET.nft.toLowerCase()) {
      if (sel === SEL.ownerOf) {
        ownerReads += 1;
        return '0x' + addrWord(ownerReads === 1 ? c.owner : c.buyerOwner);
      }
      if (sel === SEL.isApprovedForAll) return '0x' + word(c.approvedForAll);
      if (sel === SEL.getApproved) return '0x' + addrWord(c.getApproved);
    }
    if (toL === SEAPORT_16.toLowerCase()) {
      if (sel === SEAPORT_SEL.getCounter) return '0x' + word(c.counter);
      if (sel === SEAPORT_SEL.getOrderStatus) {
        return '0x' + [word(0n), word(c.filled ? 1n : 0n), word(0n), word(1n)].join('');
      }
    }
    if (toL === MARKET.usdc.toLowerCase() && sel === SEL.allowance) return '0x' + word(c.allowance);
    throw new Error('unhandled eth_call ' + to + ' ' + data);
  };
  return { ethCallTo };
}

function makeWallet(overrides = {}) {
  const calls = [];
  const handlers = {
    eth_accounts: async () => [BUYER],
    eth_call: async () => '0x', // simulate passes
    eth_sendTransaction: async () => '0x' + 'cd'.repeat(32),
    ...overrides,
  };
  const walletRequest = async (args) => {
    calls.push(args);
    const h = handlers[args.method];
    if (!h) throw new Error('unexpected wallet call ' + args.method);
    return typeof h === 'function' ? h(args) : h;
  };
  return { walletRequest, calls };
}

const baseDeps = (chain, wallet, extra = {}) => ({
  ...chain,
  ...wallet,
  ensureChain: async () => true,
  waitReceipt: async () => ({ status: '0x1' }),
  loadPublicMarket: async () => {},
  fetch: orderResponse,
  ...extra,
});

test.afterEach(() => teardown());

test('buySeaportOrder: different token id from the endpoint is rejected', async () => {
  const statusEl = fakeStatus();
  const res = await buySeaportOrder(
    { tokenId: TOKEN_ID, cardPriceMicro: PRICE.toString(), confirmedPriceMicro: null, statusEl },
    baseDeps(makeChain(), makeWallet(), { fetch: async () => ({ ok: true, async json() { return { ...ORDER, tokenId: 999 }; } }) })
  );
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'token');
  assert.equal(statusEl.textContent, 'The order endpoint returned another token.');
});

test('buySeaportOrder: an order failing validation is reported', async () => {
  const statusEl = fakeStatus();
  const bad = { ...ORDER, orderParameters: { ...ORDER.orderParameters, orderType: 3 } };
  const res = await buySeaportOrder(
    { tokenId: TOKEN_ID, cardPriceMicro: PRICE.toString(), confirmedPriceMicro: null, statusEl },
    baseDeps(makeChain(), makeWallet(), { fetch: async () => ({ ok: true, async json() { return bad; } }) })
  );
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'order-type');
  assert.match(statusEl.textContent, /can no longer be filled/);
});

test('buySeaportOrder: a changed price requires confirmation', async () => {
  const statusEl = fakeStatus();
  const res = await buySeaportOrder(
    { tokenId: TOKEN_ID, cardPriceMicro: '50000000', confirmedPriceMicro: null, statusEl },
    baseDeps(makeChain(), makeWallet())
  );
  assert.equal(res.ok, false);
  assert.equal(res.needsConfirm, true);
  assert.equal(res.priceMicro, PRICE.toString());
  assert.match(statusEl.textContent, /Price changed to/);
});

test('buySeaportOrder: accepted price moves past confirmation', async () => {
  const statusEl = fakeStatus();
  const res = await buySeaportOrder(
    { tokenId: TOKEN_ID, cardPriceMicro: '50000000', confirmedPriceMicro: PRICE.toString(), statusEl },
    baseDeps(makeChain(), makeWallet())
  );
  assert.equal(res.ok, true);
});

test('buySeaportOrder: owner mismatch blocks the buy', async () => {
  const statusEl = fakeStatus();
  const res = await buySeaportOrder(
    { tokenId: TOKEN_ID, cardPriceMicro: PRICE.toString(), confirmedPriceMicro: null, statusEl },
    baseDeps(makeChain({ owner: '0x' + '11'.repeat(20) }), makeWallet())
  );
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'owner');
  assert.match(statusEl.textContent, /no longer owns/);
});

test('buySeaportOrder: seller without approval blocks the buy', async () => {
  const statusEl = fakeStatus();
  const res = await buySeaportOrder(
    { tokenId: TOKEN_ID, cardPriceMicro: PRICE.toString(), confirmedPriceMicro: null, statusEl },
    baseDeps(makeChain({ approvedForAll: 0n, getApproved: ZERO_ADDRESS }), makeWallet())
  );
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'approval');
  assert.match(statusEl.textContent, /has not approved/);
});

test('buySeaportOrder: a changed counter blocks the buy', async () => {
  const statusEl = fakeStatus();
  const res = await buySeaportOrder(
    { tokenId: TOKEN_ID, cardPriceMicro: PRICE.toString(), confirmedPriceMicro: null, statusEl },
    baseDeps(makeChain({ counter: 1n }), makeWallet())
  );
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'counter');
  assert.match(statusEl.textContent, /counter changed/);
});

test('buySeaportOrder: a filled order is rejected', async () => {
  const statusEl = fakeStatus();
  const res = await buySeaportOrder(
    { tokenId: TOKEN_ID, cardPriceMicro: PRICE.toString(), confirmedPriceMicro: null, statusEl },
    baseDeps(makeChain({ filled: true }), makeWallet())
  );
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'filled');
  assert.match(statusEl.textContent, /already filled/);
});

test('buySeaportOrder: low buyer allowance sends an approve transaction', async () => {
  const statusEl = fakeStatus();
  const { walletRequest, calls } = makeWallet();
  const res = await buySeaportOrder(
    { tokenId: TOKEN_ID, cardPriceMicro: PRICE.toString(), confirmedPriceMicro: null, statusEl },
    baseDeps(makeChain({ allowance: 0n }), { walletRequest })
  );
  assert.equal(res.ok, true);
  const sends = calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(sends.length, 2);
  assert.equal(sends[0].params[0].to, MARKET.usdc);
  assert.equal(sends[0].params[0].data, SEL.approve + encAddr(SEAPORT_16) + encUint(PRICE));
  assert.equal(sends[1].params[0].to, SEAPORT_16);
});

test('buySeaportOrder: a failed approval aborts', async () => {
  const statusEl = fakeStatus();
  const { walletRequest } = makeWallet();
  const res = await buySeaportOrder(
    { tokenId: TOKEN_ID, cardPriceMicro: PRICE.toString(), confirmedPriceMicro: null, statusEl },
    baseDeps(makeChain({ allowance: 0n }), { walletRequest }, { waitReceipt: async () => ({ status: '0x0' }) })
  );
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'approve');
  assert.equal(statusEl.textContent, 'The USDC approval failed.');
});

test('buySeaportOrder: a failing simulation aborts', async () => {
  const statusEl = fakeStatus();
  const { walletRequest } = makeWallet({
    eth_call: async () => { throw new Error('execution reverted'); },
  });
  const res = await buySeaportOrder(
    { tokenId: TOKEN_ID, cardPriceMicro: PRICE.toString(), confirmedPriceMicro: null, statusEl },
    baseDeps(makeChain(), { walletRequest })
  );
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'simulation');
  assert.match(statusEl.textContent, /would fail/);
});

test('buySeaportOrder: full success dispatches market:refresh', async () => {
  setupDom();
  let refreshed = 0;
  window.addEventListener('market:refresh', () => refreshed++);
  const statusEl = fakeStatus();
  const { walletRequest } = makeWallet();
  const res = await buySeaportOrder(
    { tokenId: TOKEN_ID, cardPriceMicro: PRICE.toString(), confirmedPriceMicro: null, statusEl },
    baseDeps(makeChain(), { walletRequest })
  );
  assert.equal(res.ok, true);
  assert.equal(res.txHash, '0x' + 'cd'.repeat(32));
  assert.equal(refreshed, 1);
  assert.equal(statusEl.textContent, 'bought');
});

console.log('seaport_buy_ok=1');
