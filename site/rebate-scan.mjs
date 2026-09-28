// Find every buyer of a pool in an epoch from UsagePointsAccrued logs. Node only.
// Usage: node site/rebate-scan.mjs <epoch> <agentId> <fromBlock> <toBlock>   (RPC_URL overrides the RPC)
// Spec: scripts/site/check_rebate.py (rebate_scan, rebate_scan_split).

import { pathToFileURL } from 'node:url';

const CONTRACT = '0xAdd2D85316153D7bfaF7921EE9Bf1Bb6c7A1cBc9';
const TOPIC0 = '0xd8469404b4fcea354e3da6ebb8adc96ef1235e56d085663fdaedbe092ca3818c';
const RPC_DEFAULT = 'https://mainnet.base.org';
const WINDOW = 2000;
const MAX_TRIES = 8;
let lastRequestTime = 0;

function hexToNumber(hex) {
  return parseInt(hex, 16);
}

function numberToHex(n) {
  return '0x' + n.toString(16);
}

function padTopic(value) {
  if (typeof value === 'number' || typeof value === 'bigint') {
    value = BigInt(value).toString(16);
  }
  return '0x' + value.padStart(64, '0');
}

function isRangeError(err) {
  if (!err) return false;
  const code = err.code;
  if (code === -32614 || code === -32005) return true;
  const msg = String(err.message || '');
  return /range|block range|too many blocks|limited to/i.test(msg);
}

function topicToAddress(topic) {
  return '0x' + topic.slice(26).toLowerCase();
}

function dataToWord(data, index) {
  const hex = data.slice(2);
  const word = hex.slice(index * 64, (index + 1) * 64);
  return '0x' + word;
}

function dataWordToBigInt(word) {
  return BigInt(word);
}

async function rpcCall(method, params, rpcUrl) {
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method,
    params
  };
  let lastErr;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const now = Date.now();
      const elapsed = now - lastRequestTime;
      if (lastRequestTime > 0 && elapsed < 300) {
        await sleep(300 - elapsed);
      }
      lastRequestTime = Date.now();
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error('HTTP ' + res.status);
        await sleep(2000 * attempt + Math.random() * 1000);
        continue;
      }
      const j = await res.json();
      if (j.error) {
        const msg = String(j.error.message || j.error.code || '');
        if (/rate limit/i.test(msg)) {
          lastErr = new Error(msg);
          await sleep(2000 * attempt + Math.random() * 1000);
          continue;
        }
        // SPLIT: range-error handling (stage 3b)
        if (isRangeError(j.error)) {
          throw new RangeError('SPLIT');
        }
        throw new Error(msg);
      }
      return j.result;
    } catch (e) {
      if (e instanceof TypeError || /rate limit/i.test(String(e.message))) {
        lastErr = e;
        await sleep(1000 + Math.random() * 1000);
        continue;
      }
      if (e instanceof RangeError) {
        throw e;
      }
      // network error retry
      lastErr = e;
      await sleep(1000 + Math.random() * 1000);
    }
  }
  throw lastErr || new Error('rpc retries exhausted');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getLogs(from, to, epochTopic, rpcUrl) {
  const params = [{
    address: CONTRACT,
    fromBlock: numberToHex(from),
    toBlock: numberToHex(to),
    topics: [TOPIC0, epochTopic]
  }];
  return await rpcCall('eth_getLogs', params, rpcUrl);
}

async function scanWindows(epoch, pool, fromBlock, toBlock, rpcUrl) {
  const epochTopic = padTopic(epoch);
  const buyers = new Set();
  const sellers = new Set();

  async function fetchWindow(start, end) {
    if (end < start) return;
    let logs;
    try {
      logs = await getLogs(start, end, epochTopic, rpcUrl);
    } catch (e) {
      if (e instanceof RangeError) {
        if (start === end) {
          throw new Error('window still fails at a single block ' + start);
        }
        const mid = Math.floor((start + end) / 2);
        await fetchWindow(start, mid);
        await fetchWindow(mid + 1, end);
        return;
      }
      throw e;
    }
    if (logs) {
      for (const log of logs) {
        const data = log.data || '0x';
        const agentWord = dataToWord(data, 0);
        const agentId = dataWordToBigInt(agentWord).toString();
        if (agentId === pool) {
          const topics = log.topics || [];
          if (topics.length >= 4) {
            buyers.add(topicToAddress(topics[2]));
            sellers.add(topicToAddress(topics[3]));
          }
        }
      }
    }
  }

  for (let start = fromBlock; start <= toBlock; start += WINDOW) {
    const end = Math.min(start + WINDOW - 1, toBlock);
    await fetchWindow(start, end);
  }
  return { buyers: [...buyers].sort(), sellers: [...sellers].sort() };
}

export async function scanPool({epoch, pool, from, to}) {
  const rpcUrl = process.env.RPC_URL || RPC_DEFAULT;
  const fromBlock = typeof from === 'number' ? from : hexToNumber(from);
  const toBlock = typeof to === 'number' ? to : hexToNumber(to);
  const { buyers, sellers } = await scanWindows(epoch, pool, fromBlock, toBlock, rpcUrl);
  return {
    epoch: Number(epoch),
    pool: String(pool),
    fromBlock,
    toBlock,
    buyers,
    sellers
  };
}

export async function scanBuyers(epoch, agentId, fromBlock, toBlock, rpcUrl) {
  const rpc = rpcUrl || process.env.RPC_URL || RPC_DEFAULT;
  const { buyers } = await scanWindows(epoch, agentId, fromBlock, toBlock, rpc);
  return buyers;
}

const isEntry = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  const args = process.argv.slice(2);
  if (args.length !== 4) {
    console.error('usage: node site/rebate-scan.mjs <epoch> <pool> <fromBlock> <toBlock>');
    process.exit(1);
  }
  const epoch = Number(args[0]);
  const pool = args[1];
  const fromBlock = Number(args[2]);
  const toBlock = Number(args[3]);
  if (!Number.isInteger(epoch) || !Number.isInteger(fromBlock) || !Number.isInteger(toBlock)) {
    console.error('epoch/fromBlock/toBlock must be integers');
    process.exit(1);
  }
  try {
    const result = await scanPool({epoch, pool, from: fromBlock, to: toBlock});
    console.log(JSON.stringify(result));
  } catch (e) {
    console.error('rebate-scan failed: ' + (e && e.message || e));
    process.exit(1);
  }
}
