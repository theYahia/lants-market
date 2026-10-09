// Rebate payout files: validate the offer, build the exclude table (seller,
// payer, their operators, the own list only when the payer is ours, and the
// committed exclude file), resolve buyer personas from AntseedDeposits on two
// chain blocks, apply the persona stake gate, and write
// <epoch>-<pool>.json / .csv plus the versioned <epoch>-<pool>.tree.json for
// the claim contract. Node only.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validRebate, rebatePayout } from './rebate.mjs';
import { loadStakeSnapshot, positionsWithOwnersAt } from './stake-positions.mjs';
import { resolveOperatorsAt, personaOf } from './rebate-operators.mjs';
import { buildRebateTree } from './rebate-tree.mjs';
import { CLAIM_WINDOW_DAYS } from './rebate-campaign.mjs';

const REBATE_FORMULA = 'min(spend_i * pctBps / 10000, capPerBuyerUsdc), adjusted by the total cap';
const MAX_LOCK_FACTOR = 104n;

// One reason per address: seller/payer win over operators, the own list is
// applied only when the payer is ours, the committed exclude file wins overall.
export function buildExcludeTable({ seller, payer, sellerOperators = [], payerOperators = [], ownAddresses = [], excludeOwn = false, extra = {} }) {
  const ex = {};
  if (seller) ex[String(seller).toLowerCase()] = 'seller';
  if (payer) ex[String(payer).toLowerCase()] = 'payer';
  for (const op of [...sellerOperators, ...payerOperators]) {
    if (!op) continue;
    const a = String(op).toLowerCase();
    if (!(a in ex)) ex[a] = 'operator';
  }
  if (excludeOwn) {
    for (const a of ownAddresses) {
      const l = String(a).toLowerCase();
      if (!(l in ex)) ex[l] = 'own';
    }
  }
  for (const [a, reason] of Object.entries(extra)) {
    ex[String(a).toLowerCase()] = reason;
  }
  return ex;
}

// persona -> ANTS (wei, weight / 104) summed over positions that stick for the
// whole epoch (owner of record non-empty). Positions owned by the buyer itself
// count for the buyer, positions owned by the operator count for the operator.
export function stakeByPersonaFrom(positions, epoch) {
  const key = String(epoch);
  const out = {};
  for (const p of positions) {
    if (!p.owner) continue;
    const ants = BigInt((p.weightsByEpoch && p.weightsByEpoch[key]) || '0') / MAX_LOCK_FACTOR;
    if (ants <= 0n) continue;
    out[p.owner] = String(BigInt(out[p.owner] || '0') + ants);
  }
  return out;
}

// v1 keeps the plain name; a rerun after an objection writes the next version.
export function treeFileName(epoch, pool, version) {
  return version === 1 ? `${epoch}-${pool}.tree.json` : `${epoch}-${pool}.tree.v${version}.json`;
}

export function nextTreeVersion(names, epoch, pool) {
  const base = `${epoch}-${pool}.tree`;
  let max = 0;
  for (const n of names) {
    if (n === `${base}.json`) max = Math.max(max, 1);
    const m = n.match(new RegExp(`^${base}\\.v(\\d+)\\.json$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export async function writeRebateFiles({ opts, spends, seller, aggregate, moduleDir, repoRoot, deps = {} }) {
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
  fs.mkdirSync(outDir, { recursive: true });
  if (fs.existsSync(jsonPath) || fs.existsSync(csvPath)) {
    console.error(`rebate-payout: payout file already exists: ${jsonPath} or ${csvPath}`);
    process.exit(1);
  }

  const startBlock = Number(opts.from);
  const payoutBlock = Number(opts.pin);
  if (!Number.isInteger(startBlock) || !Number.isInteger(payoutBlock)) {
    console.error('rebate-payout: --from (epoch start block) and --pin (payout block) are required');
    process.exit(1);
  }

  // Personas: getOperator on the first block of the epoch and at payout.
  const buyers = Object.keys(spends).map((a) => a.toLowerCase());
  const sellerL = String(seller).toLowerCase();
  const payerL = String(offer.payer).toLowerCase();
  const addresses = [...new Set([...buyers, sellerL, payerL])];
  const resolveOps = deps.resolveOperatorsAt || resolveOperatorsAt;
  const [opsAtStart, opsAtEnd] = await Promise.all([
    resolveOps(addresses, startBlock, deps.client),
    resolveOps(addresses, payoutBlock, deps.client)
  ]);
  const personas = personaOf(buyers, opsAtStart, opsAtEnd);

  const own = JSON.parse(fs.readFileSync(path.join(moduleDir, 'own-addresses.json'), 'utf-8'));
  const ownAddresses = own.addresses || [];
  const excludeOwn = ownAddresses.some((a) => String(a).toLowerCase() === payerL);

  const excludeFile = path.join(repoRoot, 'rebates', `${opts.epoch}-${opts.pool}.exclude.json`);
  let extra = {};
  if (fs.existsSync(excludeFile)) {
    extra = JSON.parse(fs.readFileSync(excludeFile, 'utf-8'));
  }

  const exclude = buildExcludeTable({
    seller,
    payer: offer.payer,
    sellerOperators: [opsAtStart[sellerL], opsAtEnd[sellerL]],
    payerOperators: [opsAtStart[payerL], opsAtEnd[payerL]],
    ownAddresses,
    excludeOwn,
    extra
  });

  let stakeByPersona;
  if (offer.stakeGate) {
    if (!opts.snapshot) {
      console.error('rebate-payout: offer has a stakeGate; pass --snapshot file|url');
      process.exit(1);
    }
    const snapshot = await loadStakeSnapshot(opts.snapshot);
    const positions = await positionsWithOwnersAt(snapshot, offer.pool, startBlock, payoutBlock, deps);
    stakeByPersona = stakeByPersonaFrom(positions, opts.epoch);
  }

  const { payouts, excluded, total: totalPayout, cut } = rebatePayout(spends, offer, exclude, stakeByPersona, personas);

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
    startBlock: String(opts.from),
    commit,
    formula: REBATE_FORMULA,
    note: REBATE_FORMULA,
    offer,
    seller,
    aggregate: String(aggregate),
    spends: Object.fromEntries(Object.entries(spends).map(([a, v]) => [a, String(v)])),
    payouts: Object.fromEntries(Object.entries(payouts).map(([a, v]) => [a, String(v)])),
    excluded,
    personas,
    stakeByPersona: stakeByPersona || null,
    total: String(totalPayout),
    cut,
    paidTx: null
  };

  fs.writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2) + '\n', { flag: 'wx' });
  const csvLines = ['address,amount'];
  for (const [addr, amt] of Object.entries(payouts)) {
    csvLines.push(`${addr},${amt}`);
  }
  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n', { flag: 'wx' });

  // Versioned claim tree for the RebateClaims campaign. Empty payouts -> no
  // eligible buyers: the contract campaign is swept after finalizeDeadline.
  if (Object.keys(payouts).length === 0) {
    console.error('rebate-payout: no eligible buyers; the claim tree is not written');
    return { tree: null, total: '0' };
  }
  const tree = buildRebateTree(payouts);
  const version = nextTreeVersion(fs.readdirSync(outDir), opts.epoch, opts.pool);
  const treePath = path.join(outDir, treeFileName(opts.epoch, opts.pool, version));
  const treeOut = {
    version,
    epoch: opts.epoch,
    pool: String(opts.pool),
    root: tree.root,
    total: tree.total,
    claimWindowDays: CLAIM_WINDOW_DAYS,
    leaves: tree.leaves
  };
  fs.writeFileSync(treePath, JSON.stringify(treeOut, null, 2) + '\n', { flag: 'wx' });
  return { tree: treePath, total: tree.total };
}
