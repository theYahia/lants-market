// Stake offer payout file for one offer and epoch, from a published snapshot. Node only.
// Usage: node site/stake-payout-run.mjs --epoch N --pool ID --snapshot file|url [--out dir]
// Writes <out>/<N>-<pool>.json and .csv (micro-USDC); an existing file is not overwritten.

import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { stakePayout, validStakeOffer, STAKE_FORMULA } from './stake-payout.mjs';

const POOLS = '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652';
const RPC = 'https://mainnet.base.org';
const abi = parseAbi(['function ownerOf(uint256) view returns (address)']);

function parseArgs(argv) {
  const o = { out: 'stake-payouts' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--epoch') o.epoch = Number(argv[++i]);
    else if (a === '--pool') o.pool = String(argv[++i]);
    else if (a === '--snapshot') o.snapshot = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else throw new Error('unknown argument ' + a);
  }
  if (!Number.isInteger(o.epoch) || !o.pool || !o.snapshot) throw new Error('need --epoch --pool --snapshot');
  return o;
}

async function loadSnapshot(src) {
  if (!/^https?:/.test(src)) return JSON.parse(fs.readFileSync(src, 'utf-8'));
  const res = await fetch(src);
  if (!res.ok) throw new Error('snapshot http ' + res.status);
  return res.json();
}

async function resolveOwners(ids, block) {
  const client = createPublicClient({ chain: base, transport: http(RPC, { timeout: 30000 }) });
  const owners = {};
  for (const id of ids) {
    try {
      owners[id] = await client.readContract({ address: POOLS, abi, functionName: 'ownerOf', args: [BigInt(id)], blockNumber: block });
    } catch {
      owners[id] = '';
    }
  }
  return owners;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const root = fileURLToPath(new URL('..', import.meta.url));
  const offers = JSON.parse(fs.readFileSync(path.join(root, 'site/offers.json'), 'utf-8'));
  const offer = offers.find((x) => validStakeOffer(x) && x.pool === o.pool && x.epochs.includes(o.epoch));
  if (!offer) throw new Error(`no stake offer for pool ${o.pool} epoch ${o.epoch}`);

  const snap = await loadSnapshot(o.snapshot);
  const positions = (snap.positions || []).filter((p) => String(p.agentId) === o.pool);
  const block = BigInt(snap.snapshotBlock);
  const owners = await resolveOwners(positions.map((p) => String(p.id)), block);

  const own = JSON.parse(fs.readFileSync(path.join(root, 'site/own-addresses.json'), 'utf-8'));
  const exclude = Object.fromEntries(own.addresses.map((a) => [a.toLowerCase(), 'own']));
  exclude[offer.payer.toLowerCase()] = 'payer';
  const extra = path.join(root, 'stake-payouts', `${o.epoch}-${o.pool}.exclude.json`);
  if (fs.existsSync(extra)) Object.assign(exclude, JSON.parse(fs.readFileSync(extra, 'utf-8')));

  const r = stakePayout(positions, offer, o.epoch, owners, exclude);
  const outDir = path.resolve(o.out);
  const jsonPath = path.join(outDir, `${o.epoch}-${o.pool}.json`);
  const csvPath = path.join(outDir, `${o.epoch}-${o.pool}.csv`);
  if (fs.existsSync(jsonPath) || fs.existsSync(csvPath)) throw new Error('payout file already exists: ' + jsonPath);

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf-8' }).trim();
  const out = {
    epoch: o.epoch, pool: o.pool, snapshotBlock: String(snap.snapshotBlock), snapshotEpoch: snap.snapshotEpoch,
    snapshotGeneratedAt: snap.generatedAt, commit, formula: STAKE_FORMULA, offer,
    poolPositions: positions.length, byPosition: r.byPosition, payouts: r.payouts, excluded: r.excluded,
    recipients: Object.keys(r.payouts).length, total: r.total, totalUsdc: Number(r.total) / 1e6, paidTx: null
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2) + '\n', { flag: 'wx' });
  const csv = ['address,amount', ...Object.entries(r.payouts).map(([a, v]) => `${a},${v}`)];
  fs.writeFileSync(csvPath, csv.join('\n') + '\n', { flag: 'wx' });
  console.log(`total_usdc=${out.totalUsdc} recipients=${out.recipients} pool_positions=${positions.length} snapshot_block=${out.snapshotBlock}`);
}

main().catch((e) => {
  console.error('stake-payout-run failed: ' + (e && e.message || e));
  process.exit(1);
});
