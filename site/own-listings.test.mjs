// site/own-listings.test.mjs - decodeListing golden vectors and fetch-injected
// chain reads (ethCallTo fallback, readListings end to end).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKET, SEL, encAddr, encUint } from './market-config.mjs';
import { decodeListing, ethCallTo, readListings, getMinted, getMaxSupply } from './own-listings.mjs';

const ANTS_TOKEN = '0xa87EE81b2C0Bc659307ca2D9ffdC38514DD85263';
const SELLER = '0xE692B41Cf5c0CB8C2D0aAfEaF59863B30981B049';
const NOW = BigInt(Math.floor(Date.now() / 1000));

const word = (v) => {
  const s = typeof v === 'bigint' || /^[0-9]+$/.test(String(v)) ? BigInt(v).toString(16) : String(v).replace(/^0x/i, '');
  return s.padStart(64, '0');
};
const addrWord = (a) => a.replace(/^0x/i, '').toLowerCase().padStart(64, '0');

// One listings(uint256) struct: [seller, nonce, _, nftId, currency, slopeMax,
// _, slopeDuration, _, endTime, soldTime] per the word offsets used by the code.
function listingWords({ seller = SELLER, nftId = 5n, currency = MARKET.usdc, slopeMax = 0n, slopeDuration = 0n, endTime = NOW + 500000n, soldTime = 0n, nonce = 123n } = {}) {
  return [
    addrWord(seller), word(nonce), word(0n), word(nftId), addrWord(currency),
    word(slopeMax), word(0n), word(slopeDuration), word(0n), word(endTime), word(soldTime),
  ];
}

const okJson = (result) => ({
  ok: true,
  status: 200,
  async json() { return { jsonrpc: '2.0', id: 1, result }; },
});

test('decodeListing: golden vector parses the 11-word struct', () => {
  const words = listingWords({ nftId: 205n, endTime: 1795360779n, soldTime: 0n, slopeMax: 0n, slopeDuration: 0n });
  const l = decodeListing(words, { listingId: 7n });
  assert.equal(l.listingId, 7n);
  assert.equal(l.seller, SELLER.toLowerCase());
  assert.equal(l.currency, MARKET.usdc.toLowerCase());
  assert.equal(l.nftId, 205n);
  assert.equal(l.endTime, 1795360779n);
  assert.equal(l.soldTime, 0n);
  assert.equal(l.slopeMax, 0n);
  assert.equal(l.slopeDuration, 0n);
  // dynamic fields keep neutral defaults; readListings fills them from the chain
  assert.equal(l.price, 0n);
  assert.equal(l.priceEstimated, false);
  assert.equal(l.cancelled, false);
  assert.equal(l.isLive, false);
  assert.equal(l.ownerMismatch, false);
  assert.equal(l.chainAmount, null);
  assert.equal(l.chainClosed, false);
  assert.equal(l.chainStakeEnd, null);
});

test('decodeListing: soldTime with slopes marks the price as estimated', () => {
  const sold = listingWords({ soldTime: NOW, slopeMax: 1000n, slopeDuration: 0n });
  assert.equal(decodeListing(sold, { listingId: 0n }).priceEstimated, true);
  const flat = listingWords({ soldTime: NOW, slopeMax: 0n, slopeDuration: 0n });
  assert.equal(decodeListing(flat, { listingId: 0n }).priceEstimated, false);
  const live = listingWords({ soldTime: 0n, slopeMax: 5000n, slopeDuration: 100n });
  assert.equal(decodeListing(live, { listingId: 0n }).priceEstimated, false);
});

test('decodeListing: fewer than 11 words returns null', () => {
  assert.equal(decodeListing([], { listingId: 0n }), null);
  assert.equal(decodeListing(listingWords().slice(0, 5), { listingId: 0n }), null);
});

test('ethCallTo: falls back to the second RPC when the first fails', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url === 'https://base-rpc.publicnode.com') throw new Error('network down');
    return okJson('0x' + word(42n));
  };
  const out = await ethCallTo('0x' + 'aa'.repeat(20), '0x1234', fetchImpl);
  assert.equal(out, '0x' + word(42n));
  assert.equal(calls.length, 2);
});

test('ethCallTo: throws when every RPC fails', async () => {
  const fetchImpl = async () => { throw new Error('down'); };
  await assert.rejects(ethCallTo('0x' + 'aa'.repeat(20), '0x1234', fetchImpl), /all public RPCs failed/);
});

test('ethCallTo: a non-ok response moves to the next RPC', async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, async json() { return {}; } });
  await assert.rejects(ethCallTo('0x' + 'aa'.repeat(20), '0x1234', fetchImpl), /all public RPCs failed/);
});

test('readListings: live listing decoded end to end through a fake fetch', async () => {
  const price = 106746148n;
  const words = listingWords();
  const nonceWord = word(123n); // matches struct nonce -> not cancelled
  const handlers = {
    call(to, data) {
      const toL = to.toLowerCase();
      const sel = data.slice(0, 10);
      if (toL === MARKET.market.toLowerCase()) {
        if (sel === SEL.listingsLength) return '0x' + word(1n);
        if (sel === SEL.listings) return '0x' + words.join('');
        if (sel === SEL.listingPrice) return '0x' + word(price);
        if (sel === '0x444c74aa') return '0x' + nonceWord; // getNftListingState? nonce
      }
      if (toL === MARKET.nft.toLowerCase()) {
        if (sel === SEL.ownerOf) return '0x' + addrWord(SELLER);
        if (sel === '0x99fbab88') {
          // positions(uint256): [owner, agentId, amount, _, _, stakeEnd, closedAt, withdrawn]
          return '0x' + [addrWord('0x' + '11'.repeat(20)), word(52894n), word(10n ** 18n), word(0n), word(0n), word(NOW + 700000n), word(0n), word(0n)].join('');
        }
        throw new Error('unhandled nft call ' + data);
      }
      if (toL === ANTS_TOKEN.toLowerCase()) {
        if (sel === '0x18160ddd') return '0x' + word(130000000n * 10n ** 18n);
        if (sel === '0x32cb6b0c') return '0x' + word(1040000000n * 10n ** 18n);
        throw new Error('unhandled token call ' + data);
      }
      throw new Error('unhandled to ' + to);
    },
  };
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    const method = body.method;
    const params = body.params || [];
    if (method === 'eth_call') return okJson(handlers.call(params[0].to, params[0].data));
    if (method === 'eth_blockNumber') return okJson('0x' + 20000000n.toString(16));
    if (method === 'eth_getLogs') return okJson([]);
    throw new Error('unhandled method ' + method);
  };

  const out = await readListings({ fetchImpl });
  assert.equal(out.length, 1);
  const l = out[0];
  assert.equal(l.listingId, 0n);
  assert.equal(l.seller, SELLER.toLowerCase());
  assert.equal(l.currency, MARKET.usdc.toLowerCase());
  assert.equal(l.nftId, 5n);
  assert.equal(l.price, price);
  assert.equal(l.priceEstimated, false);
  assert.equal(l.isLive, true);
  assert.equal(l.cancelled, false);
  assert.equal(l.ownerMismatch, false);
  assert.equal(l.chainAmount, 10n ** 18n);
  assert.equal(l.chainClosed, false);
  assert.equal(l.chainStakeEnd, NOW + 700000n);
  assert.equal(getMinted(), 130000000);
  assert.equal(getMaxSupply(), 1040000000);
});

test('readListings: a changed nonce marks the listing cancelled', async () => {
  const words = listingWords({ nonce: 7n });
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.method === 'eth_call') {
      const { to, data } = body.params[0];
      const toL = to.toLowerCase();
      const sel = data.slice(0, 10);
      if (toL === MARKET.market.toLowerCase()) {
        if (sel === SEL.listingsLength) return okJson('0x' + word(1n));
        if (sel === SEL.listings) return okJson('0x' + words.join(''));
        if (sel === SEL.listingPrice) return okJson('0x' + word(50n));
        if (sel === '0x444c74aa') return okJson('0x' + word(99n)); // nonce mismatch
      }
      if (toL === MARKET.nft.toLowerCase()) {
        if (sel === SEL.ownerOf) return okJson('0x' + addrWord(SELLER));
        if (sel === '0x99fbab88') return okJson('0x' + [addrWord(SELLER), word(1n), word(1n), word(0n), word(0n), word(1n), word(0n), word(0n)].join(''));
      }
      if (toL === ANTS_TOKEN.toLowerCase()) {
        if (sel === '0x18160ddd') return okJson('0x' + word(1n));
        if (sel === '0x32cb6b0c') return okJson('0x' + word(1n));
      }
      throw new Error('unhandled call');
    }
    if (body.method === 'eth_blockNumber') return okJson('0x' + 20000000n.toString(16));
    if (body.method === 'eth_getLogs') return okJson([]);
    throw new Error('unhandled method');
  };

  const out = await readListings({ fetchImpl });
  assert.equal(out.length, 1);
  assert.equal(out[0].cancelled, true);
  assert.equal(out[0].isLive, false);
});

console.log('own_listings_ok=1');
