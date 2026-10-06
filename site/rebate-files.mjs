// Rebate payout files: validate the offer, build the exclude map, apply the optional stake
// gate, and write <epoch>-<pool>.json / .csv without overwriting. Node only.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validRebate, rebatePayout } from './rebate.mjs';
import { loadStakeSnapshot, positionsWithOwners } from './stake-positions.mjs';

const REBATE_FORMULA = 'min(spend_i * pctBps / 10000, capPerBuyerUsdc), adjusted by the total cap';

async function stakePositionsFor(offer, opts) {
  if (!offer.stakeGate) return undefined;
  if (!opts.snapshot) {
    console.error('rebate-payout: offer has a stakeGate; pass --snapshot file|url');
    process.exit(1);
  }
  return positionsWithOwners(await loadStakeSnapshot(opts.snapshot), offer.pool);
}

export async function writeRebateFiles({ opts, spends, seller, aggregate, moduleDir, repoRoot }) {
  const outDir = path.resolve(opts.out || 'rebates');
  const offer = JSON.parse(fs.readFileSync(opts.offer, 'utf-8'));

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

  const ownAddresses = JSON.parse(fs.readFileSync(path.join(moduleDir, 'own-addresses.json'), 'utf-8'));
  const exclude = {};
  for (const addr of ownAddresses.addresses) {
    exclude[addr.toLowerCase()] = 'own';
  }
  exclude[seller.toLowerCase()] = 'seller';
  exclude[offer.payer.toLowerCase()] = 'payer';
  const excludeFile = path.join(repoRoot, 'rebates', `${opts.epoch}-${opts.pool}.exclude.json`);
  if (fs.existsSync(excludeFile)) {
    const extraExclude = JSON.parse(fs.readFileSync(excludeFile, 'utf-8'));
    for (const [addr, reason] of Object.entries(extraExclude)) {
      exclude[addr.toLowerCase()] = reason;
    }
  }

  const stakePositions = await stakePositionsFor(offer, opts);
  const { payouts, excluded, total: totalPayout, cut } = rebatePayout(spends, offer, exclude, stakePositions);

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

  if (!fs.existsSync(jsonPath) && !fs.existsSync(csvPath)) {
    fs.writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2) + '\n', { flag: 'wx' });
    const csvLines = ['address,amount'];
    for (const [addr, amt] of Object.entries(payouts)) {
      csvLines.push(`${addr},${amt}`);
    }
    fs.writeFileSync(csvPath, csvLines.join('\n') + '\n', { flag: 'wx' });
  }
}
