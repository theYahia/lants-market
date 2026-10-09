// Generate the forge cross-test fixture for RebateClaims from the platform's
// own buildRebateTree. Writes contracts/test/fixtures/rebate-tree-3.json, which
// the forge test (RebateClaimsCross.t.sol) reads to claim each leaf against the
// live contract. Re-run when the tree convention or vector changes.
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRebateTree } from '../../site/rebate-tree.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../contracts/test/fixtures/rebate-tree-3.json');

const payouts = {
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': '1250000',
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb': '2500000',
  '0xcccccccccccccccccccccccccccccccccccccccc': '3750000',
};

const tree = buildRebateTree(payouts);

const fixture = {
  root: tree.root,
  total: tree.total,
  fundedMicro: String(BigInt(tree.total) * 2n), // over-fund so setMerkleRoot passes
  claimWindowDays: 14,
  cancelDeadlineOffsetSec: 24 * 3600,
  finalizeDeadlineOffsetSec: 2 * 24 * 3600,
  leaves: tree.leaves.map((l) => ({ ...l, proofCount: l.proof.length })),
};

writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n');
console.log('wrote', out, 'root=' + tree.root, 'leaves=' + tree.leaves.length);
