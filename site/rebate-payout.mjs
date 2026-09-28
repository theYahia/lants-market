// Rebate payout for one offer and epoch: buyers from logs, spends from buyerAgentEpochUsage at a pinned block,
// the formula from site/rebate.mjs. Node only. Spec: scripts/site/check_rebate.py (rebate_view, rebate_files).
// Usage: node site/rebate-payout.mjs --epoch N --pool ID --from B --to B --pin B [--dry] [--offer file] [--out dir]

import { createPublicClient, http, parseAbi, decodeFunctionResult } from 'viem';
import { base } from 'viem/chains';
import { scanPool } from './rebate-scan.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validRebate, rebatePayout } from './rebate.mjs';

const CONTRACT = '0xAdd2D85316153D7bfaF7921EE9Bf1Bb6c7A1cBc9';
const SELECTOR_BUYER = '0x72d72952';
const SELECTOR_POOL = '0xca2b5f5e';
const RPC_PRIMARY = 'https://mainnet.base.org';
const RPC_FALLBACK = 'https://base-mainnet.public.blastapi.io';
const BATCH = 20;
const REBATE_FORMULA = 'min(spend_i * pctBps / 10000, capPerBuyerUsdc), adjusted by the total cap'; 

const buyerAbi = parseAbi([
  'function buyerAgentEpochUsage(uint256 epoch, address buyer, uint256 agentId) view returns ((uint256 points, uint256 weightedPoints))'
]);
const poolAbi = parseAbi([
  'function poolPointsByEpoch(uint256 epoch, address seller) view returns (uint256)'
]);

function parseArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--epoch') opts.epoch = Number(args[++i]);
    else if (a === '--pool') opts.pool = args[++i];
    else if (a === '--from') opts.from = Number(args[++i]);
    else if (a === '--to') opts.to = Number(args[++i]);
    else if (a === '--pin') opts.pin = Number(args[++i]);
    else if (a === '--dry') opts.dry = true;
    else if (a === '--offer') opts.offer = args[++i];
    else if (a === '--out') opts.out = args[++i];
    else {
      console.error('rebate-payout: unknown argument ' + a);
      process.exit(2);
    }
  }
  return opts;
}

function makeClient(url) {
  return createPublicClient({
    chain: base,
    transport: http(url, { timeout: 30000 })
  });
}

async function multicallBatches(client, calls, blockNumber) {
  const results = [];
  for (let i = 0; i < calls.length; i += BATCH) {
    const batch = calls.slice(i, i + BATCH);
    let r;
    try {
      r = await client.multicall({
        contracts: batch,
        blockNumber: BigInt(blockNumber),
        allowFailure: false
      });
    } catch (e) {
      // Try fallback RPC
      const fb = makeClient(RPC_FALLBACK);
      try {
        r = await fb.multicall({
          contracts: batch,
          blockNumber: BigInt(blockNumber),
          allowFailure: false
        });
      } catch (e2) {
        throw e2;
      }
    }
    results.push(...r);
  }
  return results;
}

// Try primary first, fall back to fallback on network errors
async function callWithFallback(fn) {
  try {
    return await fn(makeClient(RPC_PRIMARY));
  } catch (e) {
    return await fn(makeClient(RPC_FALLBACK));
  }
}

async function getBuyerSpend(client, epoch, buyer, agentId, blockNumber) {
  const enc = {
    abi: buyerAbi,
    functionName: 'buyerAgentEpochUsage',
    args: [BigInt(epoch), buyer, agentId],
    address: CONTRACT
  };
  let data;
  try {
    data = await client.readContract(enc);
  } catch (e) {
    throw e;
  }
  let points;
  if (Array.isArray(data)) {
    points = data[0];
  } else if (data && typeof data === 'object') {
    points = data.points;
  }
  if (points === undefined || points === null) {
    console.error(`rebate-payout: buyerAgentEpochUsage returned no points field for buyer ${buyer}`);
    process.exit(1);
  }
  return BigInt(points);
}

const isEntry = import.meta.url === new URL(import.meta.url).pathname.endsWith('/rebate-payout.mjs') ? true : false;

async function main() {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  if (opts.epoch === undefined || opts.pool === undefined || opts.from === undefined || opts.to === undefined || opts.pin === undefined) {
    console.error('usage: node site/rebate-payout.mjs --epoch N --pool P --from B --to B --pin B [--dry] [--offer file --out dir]');
    process.exit(2);
  }
  if (!Number.isInteger(opts.epoch) || !Number.isInteger(opts.from) || !Number.isInteger(opts.to) || !Number.isInteger(opts.pin)) {
    console.error('rebate-payout: epoch/from/to/pin must be integers');
    process.exit(2);
  }

  // 1) Scan logs for buyers and sellers of this pool in the epoch
  const scan = await scanPool({ epoch: opts.epoch, pool: opts.pool, from: opts.from, to: opts.to });
  const buyers = scan.buyers || [];
  const sellers = scan.sellers || [];

  if (sellers.length !== 1) {
    console.error(`rebate-payout: expected exactly one seller, got ${sellers.length}`);
    process.exit(1);
  }
  const seller = sellers[0];

  // 2) Get spend for each buyer via buyerAgentEpochUsage
  const agentId = BigInt(opts.pool);
  const blockNumber = BigInt(opts.pin);
  let client = makeClient(RPC_PRIMARY);

  const buyerCalls = buyers.map(buyer => ({
    address: CONTRACT,
    abi: buyerAbi,
    functionName: 'buyerAgentEpochUsage',
    args: [BigInt(opts.epoch), buyer, agentId]
  }));
  const buyerResults = await multicallBatches(client, buyerCalls, blockNumber);

  const spends = {};
  let total = 0n;
  for (let i = 0; i < buyers.length; i++) {
    let points;
    const data = buyerResults[i];
    if (Array.isArray(data)) {
      points = data[0];
    } else if (data && typeof data === 'object') {
      points = data.points;
    }
    if (points === undefined || points === null) {
      console.error(`rebate-payout: buyerAgentEpochUsage returned no points field for buyer ${buyers[i]}`);
      process.exit(1);
    }
    const p = BigInt(points);
    spends[buyers[i]] = p;
    total += p;
  }

  // 3) Aggregate from poolPointsByEpoch(epoch, seller) — the argument is the seller address
  let aggregate;
  try {
    const poolResult = await client.readContract({
      address: CONTRACT,
      abi: poolAbi,
      functionName: 'poolPointsByEpoch',
      args: [BigInt(opts.epoch), seller]
    }, { blockNumber });
    aggregate = BigInt(poolResult);
  } catch (e) {
    try {
      const fb = makeClient(RPC_FALLBACK);
      const poolResult = await fb.readContract({
        address: CONTRACT,
        abi: poolAbi,
        functionName: 'poolPointsByEpoch',
        args: [BigInt(opts.epoch), seller]
      }, { blockNumber });
      aggregate = BigInt(poolResult);
    } catch (e2) {
      throw e2;
    }
  }

  // 4) Assert Σ spend_i = aggregate over ALL buyers (including zero spends)
  if (total !== aggregate) {
    console.error(`rebate-payout: sum of spends ${total} does not equal aggregate ${aggregate}`);
    process.exit(1);
  }

  // FILES: --offer/--out (stage 4b)
  if (opts.offer) {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = fileURLToPath(new URL('..', import.meta.url));

    if (!opts.out) {
      opts.out = 'rebates';
    }

    // Resolve --out (absolute stays absolute, relative is relative to cwd)
    const outDir = path.resolve(opts.out);
    const offerRaw = fs.readFileSync(opts.offer, 'utf-8');
    const offer = JSON.parse(offerRaw);

    if (!validRebate(offer)) {
      console.error('rebate-payout: offer is not a valid rebate offer');
      process.exit(1);
    }
    if (offer.epochs[0] !== opts.epoch) {
      console.error('rebate-payout: offer epoch does not match --epoch');
      process.exit(1);
    }
    if (String(offer.pool) !== String(opts.pool)) {
      console.error('rebate-payout: offer pool does not match --pool');
      process.exit(1);
    }

    const jsonPath = path.join(outDir, `${opts.epoch}-${opts.pool}.json`);
    const csvPath = path.join(outDir, `${opts.epoch}-${opts.pool}.csv`);

    if (fs.existsSync(jsonPath) || fs.existsSync(csvPath)) {
      console.error(`rebate-payout: payout file already exists: ${jsonPath} or ${csvPath}`);
      process.exit(1);
    }

    // Build the exclude map
    const ownAddresses = JSON.parse(fs.readFileSync(path.join(moduleDir, 'own-addresses.json'), 'utf-8'));
    const exclude = {};
    for (const addr of ownAddresses.addresses) {
      exclude[addr.toLowerCase()] = 'own';
    }
    exclude[seller.toLowerCase()] = 'seller';
    exclude[offer.payer.toLowerCase()] = 'payer';

    // Add rebates/<epoch>-<pool>.exclude.json if it exists
    const excludeFile = path.join(repoRoot, 'rebates', `${opts.epoch}-${opts.pool}.exclude.json`);
    if (fs.existsSync(excludeFile)) {
      const extraExclude = JSON.parse(fs.readFileSync(excludeFile, 'utf-8'));
      for (const [addr, reason] of Object.entries(extraExclude)) {
        exclude[addr.toLowerCase()] = reason;
      }
    }

    const result = rebatePayout(spends, offer, exclude);
    const payouts = result.payouts;
    const excluded = result.excluded;
    const totalPayout = result.total;
    const cut = result.cut;

    let commit = '';
    try {
      commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf-8' }).trim();
    } catch (e) {
      // Not a git repo — leave empty
    }
    if (!commit) {
      console.error('rebate-payout: could not get git commit');
      process.exit(1);
    }
    if (!REBATE_FORMULA.includes('pctBps / 10000')) {
      console.error('rebate-payout: REBATE_FORMULA must contain "pctBps / 10000"');
      process.exit(1);
    }

    const jsonOut = {
      epoch: opts.epoch,
      pool: String(opts.pool),
      pinBlock: String(opts.pin),
      commit,
      formula: REBATE_FORMULA,
      note: REBATE_FORMULA,
      offer,
      seller,
      aggregate: String(aggregate),
      spends: Object.fromEntries(Object.entries(spends).map(([a, v]) => [a, String(v)])),
      payouts: Object.fromEntries(Object.entries(payouts).map(([a, v]) => [a, String(v)])),
      excluded,
      total: String(totalPayout),
      cut,
      paidTx: null
    };

    // Write both files with 'wx' AFTER checking both
    if (!fs.existsSync(jsonPath) && !fs.existsSync(csvPath)) {
      fs.writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2) + '\n', { flag: 'wx' });
      const csvLines = ['address,amount'];
      for (const [addr, amt] of Object.entries(payouts)) {
        csvLines.push(`${addr},${amt}`);
      }
      fs.writeFileSync(csvPath, csvLines.join('\n') + '\n', { flag: 'wx' });
    }
  }

  // --dry prints one JSON
  if (opts.dry) {
    const out = {
      epoch: opts.epoch,
      pool: String(opts.pool),
      pinBlock: String(opts.pin),
      seller,
      buyers: buyers.length,
      totalSpend: String(total),
      aggregate: String(aggregate),
      spends: Object.fromEntries(Object.entries(spends).map(([a, v]) => [a, String(v)]))
    };
    console.log(JSON.stringify(out));
  }
}

main().catch(e => {
  console.error('rebate-payout failed: ' + (e && e.message || e));
  process.exit(1);
});
