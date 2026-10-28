// site/market-buy.test.mjs - buyListing flow with injected deps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, teardown } from './dom-test-helper.mjs';
import { MARKET, SEL, encAddr, encUint } from './market-config.mjs';
import { buyListing } from './market-buy.mjs';

const ACCOUNT = '0xabcdef0000000000000000000000000000000001';
const CURRENCY = MARKET.usdc;
const PRICE = 106746148n;

const word = (v) => BigInt(v).toString(16).padStart(64, '0');

function makeWallet(overrides = {}) {
  const calls = [];
  const handlers = {
    eth_call: () => '0x' + word(PRICE), // allowance already covers the price
    eth_sendTransaction: () => '0x' + 'ab'.repeat(32),
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

function reportFn(log) {
  return (text, isError) => log.push({ text, isError });
}

test.afterEach(() => teardown());

test('buyListing: no connected wallet reports connect-wallet', async () => {
  const { walletRequest } = makeWallet({ eth_accounts: async () => [] });
  const log = [];
  const res = await buyListing({ id: 1n, price: PRICE, currency: CURRENCY }, reportFn(log), {
    walletRequest,
    ensureChain: async () => true,
    waitReceipt: async () => ({ status: '0x1' }),
    loadPublicMarket: async () => {},
  });
  assert.deepEqual(res, { ok: false });
  assert.equal(log[0].text, 'connect wallet first');
});

test('buyListing: eth_accounts failure surfaces the error', async () => {
  const { walletRequest } = makeWallet({ eth_accounts: () => { throw new Error('provider missing'); } });
  const log = [];
  const res = await buyListing({ id: 1n, price: PRICE, currency: CURRENCY }, reportFn(log), {
    walletRequest,
    ensureChain: async () => true,
    waitReceipt: async () => ({ status: '0x1' }),
    loadPublicMarket: async () => {},
  });
  assert.deepEqual(res, { ok: false });
  assert.match(log[0].text, /provider missing/);
});

test('buyListing: wrong network reports and stops', async () => {
  const { walletRequest } = makeWallet({
    eth_accounts: async () => [ACCOUNT],
    eth_call: () => '0x' + word(PRICE),
  });
  const log = [];
  const res = await buyListing({ id: 1n, price: PRICE, currency: CURRENCY }, reportFn(log), {
    walletRequest,
    ensureChain: async () => false,
    waitReceipt: async () => ({ status: '0x1' }),
    loadPublicMarket: async () => {},
  });
  assert.deepEqual(res, { ok: false });
  assert.equal(log[0].text, 'wrong network');
});

test('buyListing: sufficient allowance skips approve and buys', async () => {
  setupDom();
  const { walletRequest, calls } = makeWallet({
    eth_accounts: async () => [ACCOUNT],
    eth_call: () => '0x' + word(PRICE),
  });
  let refreshed = 0;
  const log = [];
  window.addEventListener('market:refresh', () => refreshed++);
  const res = await buyListing({ id: 7n, price: PRICE, currency: CURRENCY }, reportFn(log), {
    walletRequest,
    ensureChain: async () => true,
    waitReceipt: async () => ({ status: '0x1' }),
    loadPublicMarket: async () => {},
  });
  assert.equal(res.ok, true);
  assert.equal(res.txHash, '0x' + 'ab'.repeat(32));
  assert.equal(refreshed, 1);
  const sends = calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(sends.length, 1);
  assert.equal(sends[0].params[0].to, MARKET.market);
  assert.equal(sends[0].params[0].data, SEL.buyListing + encUint(7n));
  assert.equal(log.some((r) => r.text === 'bought'), true);
});

test('buyListing: low allowance sends approve then buy', async () => {
  const { walletRequest, calls } = makeWallet({
    eth_accounts: async () => [ACCOUNT],
    eth_call: () => '0x' + word(PRICE - 1n), // allowance < price
  });
  const res = await buyListing({ id: 7n, price: PRICE, currency: CURRENCY }, () => {}, {
    walletRequest,
    ensureChain: async () => true,
    waitReceipt: async () => ({ status: '0x1' }),
    loadPublicMarket: async () => {},
  });
  assert.equal(res.ok, true);
  const sends = calls.filter((c) => c.method === 'eth_sendTransaction');
  assert.equal(sends.length, 2);
  assert.equal(sends[0].params[0].to, CURRENCY);
  assert.equal(sends[0].params[0].data, SEL.approve + encAddr(MARKET.market) + encUint(PRICE));
  assert.equal(sends[1].params[0].to, MARKET.market);
});

test('buyListing: approve revert reports approve failed', async () => {
  const { walletRequest } = makeWallet({
    eth_accounts: async () => [ACCOUNT],
    eth_call: () => '0x' + word(PRICE - 1n),
  });
  const log = [];
  const res = await buyListing({ id: 7n, price: PRICE, currency: CURRENCY }, reportFn(log), {
    walletRequest,
    ensureChain: async () => true,
    waitReceipt: async () => ({ status: '0x0' }),
    loadPublicMarket: async () => {},
  });
  assert.deepEqual(res, { ok: false });
  assert.equal(log.at(-1).text, 'approve failed');
});

test('buyListing: buy revert reports buy reverted with the hash', async () => {
  const { walletRequest } = makeWallet({
    eth_accounts: async () => [ACCOUNT],
  });
  const log = [];
  const res = await buyListing({ id: 7n, price: PRICE, currency: CURRENCY }, reportFn(log), {
    walletRequest,
    ensureChain: async () => true,
    waitReceipt: async () => ({ status: '0x0' }),
    loadPublicMarket: async () => {},
  });
  assert.deepEqual(res, { ok: false, txHash: '0x' + 'ab'.repeat(32) });
  assert.equal(log.some((r) => r.text === 'buy reverted'), true);
});

test('buyListing: buy send failure is reported', async () => {
  const { walletRequest } = makeWallet({
    eth_accounts: async () => [ACCOUNT],
    eth_sendTransaction: () => { throw new Error('user rejected request'); },
  });
  const log = [];
  const res = await buyListing({ id: 7n, price: PRICE, currency: CURRENCY }, reportFn(log), {
    walletRequest,
    ensureChain: async () => true,
    waitReceipt: async () => ({ status: '0x1' }),
    loadPublicMarket: async () => {},
  });
  assert.deepEqual(res, { ok: false });
  assert.equal(log[0].text, 'Cancelled in the wallet.');
});

console.log('market_buy_ok=1');
