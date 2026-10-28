// Read the lANTS marketplace listings (live, sold and expired) directly from
// Base, plus the ANTS supply figures the valuation views need. Extracted from
// market-view.mjs so the storefront, the position page and the legacy table
// all share one read path and one set of caches.

import {
  MARKET,
  SEL,
  encAddr,
  encUint,
  decodeWords,
  wordToBigInt,
  wordToAddr,
} from './market-config.mjs';
import { buyListingPriceFromData } from './market-stats.mjs';

// ANTS ERC-20 on Base: totalSupply() = ANTS minted so far.
const ANTS_TOKEN = '0xa87EE81b2C0Bc659307ca2D9ffdC38514DD85263';
const MAX_SUPPLY_SELECTOR = '0x32cb6b0c'; // MAX_SUPPLY()

// Number of 32-byte words in the listings(uint256) struct (measured by ABI).
const WORDS_PER_LISTING = 11;

const SELECTORS = {
  listingsLength: SEL.listingsLength,
  listings: SEL.listings,
  listingPrice: SEL.listingPrice,
};

// BuyListing(uint256 indexed listingId, address indexed nftCollection, uint256 indexed nftId, address buyer, address currency, uint256 price, uint256 fee)
const BUY_LISTING_TOPIC0 = '0x4df3ab58a4d7c1b893e008bf1c2ae97dc5350248466a12507651a1ae285f650c';

let minted = null;
let maxSupply = null;

export function getMinted() {
  return minted;
}

export function getMaxSupply() {
  return maxSupply;
}

export async function ethCallTo(to, data) {
  const READ_RPCS = [
    'https://base-rpc.publicnode.com',
    'https://base.drpc.org',
    'https://mainnet.base.org',
  ];
  for (const rpc of READ_RPCS) {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to, data }, 'latest'],
        }),
      });
      if (!response.ok) continue;
      const json = await response.json();
      if (typeof json.result === 'string') return json.result;
    } catch (e) {
      // try next RPC
    }
  }
  throw new Error('all public RPCs failed');
}

async function ethCall(data) {
  return ethCallTo(MARKET.market, data);
}

async function fetchLatestBlock(rpc) {
  try {
    const response = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    });
    if (!response.ok) return null;
    const json = await response.json();
    return typeof json.result === 'string' ? BigInt(json.result) : null;
  } catch (e) {
    return null;
  }
}

async function ethGetLogs(rpc, params) {
  const response = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [params] }),
  });
  if (!response.ok) throw new Error('bad status ' + response.status);
  const json = await response.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

// Fetch the actual paid prices of sold lots from BuyListing logs over a bounded
// recent window, as listingId (decimal key) -> paid price (BigInt). Free public
// RPCs cap the eth_getLogs range, so old sales can be missed; callers fall back
// to listingPrice() when a sold lot is not present.
async function fetchBuyListingPrices() {
  const LOG_RPCS = [
    ['https://base-rpc.publicnode.com', 50000],
    ['https://base.drpc.org', 10000],
    ['https://mainnet.base.org', 10000],
  ];
  const out = new Map();
  for (const [rpc, maxRange] of LOG_RPCS) {
    try {
      const latest = await fetchLatestBlock(rpc);
      if (latest === null) continue;
      const fromBlock = '0x' + BigInt(Math.max(0, Number(latest) - maxRange)).toString(16);
      const result = await ethGetLogs(rpc, { fromBlock, toBlock: 'latest', topics: [BUY_LISTING_TOPIC0] });
      if (!Array.isArray(result)) continue;
      for (const log of result) {
        const price = buyListingPriceFromData(log.data);
        if (price === null) continue;
        const listingId = log.topics && log.topics[1];
        if (listingId) out.set(BigInt(listingId).toString(), price);
      }
      return out;
    } catch (e) {
      // try the next RPC
    }
  }
  return out;
}

async function readSupply() {
  if (minted == null) {
    try {
      minted = Number(wordToBigInt(decodeWords(await ethCallTo(ANTS_TOKEN, '0x18160ddd'))[0])) / 1e18 || null;
    } catch (e) {
      minted = null;
    }
  }
  if (maxSupply == null) {
    try {
      const words = decodeWords(await ethCallTo(ANTS_TOKEN, MAX_SUPPLY_SELECTOR));
      maxSupply = words.length > 0 ? Number(wordToBigInt(words[0])) / 1e18 || null : null;
    } catch (e) {
      maxSupply = null;
    }
  }
}

async function readAllListings() {
  const now = BigInt(Math.floor(Date.now() / 1000));
  await readSupply();

  const lenRaw = await ethCall(SELECTORS.listingsLength);
  const n = Number(wordToBigInt(decodeWords(lenRaw)[0] || lenRaw));

  const paidPriceByListing = await fetchBuyListingPrices();

  const readOne = async (i) => {
    const raw = await ethCall(SELECTORS.listings + encUint(i));
    const w = decodeWords(raw);
    if (!w || w.length < WORDS_PER_LISTING) return null;

    const listingId = i;
    const seller = wordToAddr(w[0]);
    const currency = wordToAddr(w[4]);
    const nftId = wordToBigInt(w[3]);
    const endTime = wordToBigInt(w[9]);
    const soldTime = wordToBigInt(w[10]);
    const slopeMax = wordToBigInt(w[5]);
    const slopeDuration = wordToBigInt(w[7]);

    let price = 0n;
    let priceEstimated = false;
    try {
      if (soldTime !== 0n && paidPriceByListing.has(i.toString())) {
        price = paidPriceByListing.get(i.toString());
      } else {
        const pRaw = await ethCall(SELECTORS.listingPrice + encUint(i));
        price = wordToBigInt(decodeWords(pRaw)[0] || pRaw);
        priceEstimated = soldTime !== 0n && (slopeMax !== 0n || slopeDuration !== 0n);
      }
    } catch (e) {
      throw new Error(
        'listingPrice failed for #' + i + ': ' + (e && e.message ? e.message : e)
      );
    }

    let cancelled = false;
    if (soldTime === 0n) {
      try {
        const nRaw = await ethCall('0x444c74aa' + encAddr(seller) + encAddr(MARKET.nft) + encUint(nftId));
        cancelled = wordToBigInt(decodeWords(nRaw)[0]) !== wordToBigInt(w[1]);
      } catch (e) {
        cancelled = false;
      }
    }

    const isLive = soldTime === 0n && endTime >= now && !cancelled;
    let owner = null;
    if (isLive) {
      try {
        const oRaw = await ethCallTo(MARKET.nft, SEL.ownerOf + encUint(nftId));
        owner = wordToAddr(decodeWords(oRaw)[0]);
      } catch (e) {
        owner = null;
      }
    }
    const ownerMismatch = isLive && (!owner || owner.toLowerCase() !== seller.toLowerCase());

    let chainAmount = null;
    let chainClosed = false;
    let chainStakeEnd = null;
    try {
      const pRaw = await ethCallTo(MARKET.nft, '0x99fbab88' + encUint(nftId)); // positions(uint256)
      const words = decodeWords(pRaw);
      chainAmount = wordToBigInt(words[2]);
      chainStakeEnd = wordToBigInt(words[5]);
      const closedAt = wordToBigInt(words[6]);
      const withdrawn = wordToBigInt(words[7]);
      chainClosed = closedAt > 0n || withdrawn > 0n;
    } catch (e) {
      chainAmount = null;
      chainClosed = false;
      chainStakeEnd = null;
    }

    return {
      listingId,
      nftId,
      seller,
      currency,
      price,
      priceEstimated,
      soldTime,
      endTime,
      isLive,
      ownerMismatch,
      chainAmount,
      chainClosed,
      chainStakeEnd,
      cancelled,
    };
  };

  const out = (await Promise.all(Array.from({ length: n }, (_, k) => readOne(BigInt(k))))).filter(Boolean);
  out.sort((a, b) => (a.listingId < b.listingId ? -1 : a.listingId > b.listingId ? 1 : 0));
  return out;
}

// Concurrent callers (legacy table + storefront + position page) share one
// read; the next call after it settles always re-reads the chain.
let inFlight = null;

export async function readListings() {
  if (!inFlight) {
    inFlight = readAllListings().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
