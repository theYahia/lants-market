#!/usr/bin/env node
// Read-only overlap check for the all-time volume formula.
// Does the competitor's trades feed include any of our own VexyMarketplace
// BuyListing transactions? Prints the intersection so C2 can choose sum vs
// union. Run: node scripts/check-trades-overlap.mjs

const MARKET = '0xC5BFc309a68dBf4e7eEca9BD91749d611c75C660';
const BUY_LISTING_TOPIC0 = '0x4df3ab58a4d7c1b893e008bf1c2ae97dc5350248466a12507651a1ae285f650c';
const TRADES_URL = 'https://antseedmarkets.com/api/lants/trades';

const RPCS = [
  'https://base-rpc.publicnode.com',
  'https://base.drpc.org',
  'https://mainnet.base.org',
];

async function rpc(method, params) {
  let lastErr;
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!res.ok) { lastErr = new Error('http ' + res.status); continue; }
      const json = await res.json();
      if (json.error) { lastErr = new Error(json.error.message); continue; }
      return json.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('all RPCs failed');
}

async function latestBlock() {
  return BigInt(await rpc('eth_blockNumber', []));
}

async function getLogs(fromHex, toHex) {
  return rpc('eth_getLogs', [{
    fromBlock: fromHex,
    toBlock: toHex,
    address: MARKET,
    topics: [BUY_LISTING_TOPIC0],
  }]);
}

// Scan BuyListing logs over the last `maxBlocks` blocks in `chunk`-block ranges.
// The market deployed 2026-09-20, so ~2M blocks covers its whole life.
async function collectOwnTxHashes() {
  const latest = await latestBlock();
  const chunk = 50000n;
  const maxBlocks = 2000000n;
  const from = latest - maxBlocks > 0n ? latest - maxBlocks : 0n;
  const tx = new Set();
  let cursor = latest;
  while (cursor > from) {
    const start = cursor - chunk + 1n > from ? cursor - chunk + 1n : from;
    try {
      const logs = await getLogs('0x' + start.toString(16), '0x' + cursor.toString(16));
      if (Array.isArray(logs)) {
        for (const log of logs) {
          if (log && typeof log.transactionHash === 'string') {
            tx.add(log.transactionHash.toLowerCase());
          }
        }
      }
    } catch (e) {
      console.error(`getLogs failed for [${start}, ${cursor}]: ${e.message}`);
    }
    cursor = start - 1n;
    await new Promise((r) => setTimeout(r, 120));
  }
  return tx;
}

async function collectCompetitorTxHashes() {
  const tx = new Set();
  let page = 1;
  const pageSize = 100;
  let apiTotal = null;
  while (page <= 1000) {
    const res = await fetch(`${TRADES_URL}?page=${page}&pageSize=${pageSize}`);
    if (!res.ok) throw new Error('trades http ' + res.status);
    const json = await res.json();
    if (!Array.isArray(json.trades)) throw new Error('trades: missing trades array');
    if (Number.isInteger(json.total)) apiTotal = json.total;
    for (const t of json.trades) {
      if (t && t.currency === 'USDC' && typeof t.txHash === 'string') {
        tx.add(t.txHash.toLowerCase());
      }
    }
    if (json.trades.length < pageSize) break;
    if (apiTotal != null && tx.size >= apiTotal) break;
    page += 1;
  }
  return { tx, apiTotal };
}

const competitor = await collectCompetitorTxHashes();
const own = await collectOwnTxHashes();

const overlap = [];
for (const h of competitor.tx) {
  if (own.has(h)) overlap.push(h);
}

console.log(JSON.stringify({
  competitorUsdcTrades: competitor.tx.size,
  competitorApiTotal: competitor.apiTotal,
  ownBuyListingTxs: own.size,
  overlap: overlap.length,
  overlapTxHashes: overlap,
}, null, 2));
