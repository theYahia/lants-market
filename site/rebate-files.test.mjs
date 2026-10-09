import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildExcludeTable,
  stakeByPersonaFrom,
  treeFileName,
  nextTreeVersion,
  writeRebateFiles
} from './rebate-files.mjs';

const WEI = 10n ** 18n;
const PAYER = '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B';
const SELLER = '0x73b4c9335fa239f9c6df3d28d5bf5d3cdf4de736';
const OP = '0x1111111111111111111111111111111111111111';
const OP2 = '0x2222222222222222222222222222222222222222';
const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OWN = '0xcccccccccccccccccccccccccccccccccccccccc';

test('exclude table: seller, payer and their operators get one reason each', () => {
  const ex = buildExcludeTable({
    seller: SELLER,
    payer: PAYER,
    sellerOperators: [OP, OP2],
    payerOperators: [SELLER, ''],
    ownAddresses: [OWN],
    excludeOwn: false
  });
  assert.equal(ex[SELLER.toLowerCase()], 'seller');
  assert.equal(ex[PAYER.toLowerCase()], 'payer');
  assert.equal(ex[OP], 'operator');
  assert.equal(ex[OP2], 'operator');
  assert.equal(ex[OWN], undefined, 'own list is not applied when the payer is not ours');
});

test('exclude table: own list applies only when the payer is in it', () => {
  const ex = buildExcludeTable({
    seller: SELLER,
    payer: OWN,
    ownAddresses: [OWN, OP],
    excludeOwn: true
  });
  assert.equal(ex[OWN], 'payer', 'the payer reason wins over own');
  assert.equal(ex[OP], 'own');
});

test('exclude table: the committed exclude file wins and gives one reason per address', () => {
  const ex = buildExcludeTable({
    seller: SELLER,
    payer: PAYER,
    sellerOperators: [OP],
    extra: { [A]: 'opted_out', [OP]: 'builder' }
  });
  assert.equal(ex[A], 'opted_out');
  assert.equal(ex[OP], 'builder');
});

test('stakeByPersona: sums weight/104 of stable owners only', () => {
  const weight = (ants) => String(104n * BigInt(ants) * WEI); // max-lock weight of `ants` ANTS
  const positions = [
    { id: 1, owner: OP, weightsByEpoch: { 27: weight(100) } },
    { id: 2, owner: OP, weightsByEpoch: { 27: weight(50) } },
    { id: 3, owner: '', weightsByEpoch: { 27: weight(100) } },
    { id: 4, owner: A, weightsByEpoch: { 27: '0' } },
    { id: 5, owner: B, weightsByEpoch: { 26: weight(100) } }
  ];
  const out = stakeByPersonaFrom(positions, 27);
  assert.deepEqual(out, { [OP]: String(150n * WEI) });
});

test('tree versioning: v1 plain name, rerun picks the next version', () => {
  assert.equal(treeFileName(27, '52894', 1), '27-52894.tree.json');
  assert.equal(treeFileName(27, '52894', 2), '27-52894.tree.v2.json');
  assert.equal(nextTreeVersion([], 27, '52894'), 1);
  assert.equal(nextTreeVersion(['27-52894.json', '27-52894.csv'], 27, '52894'), 1);
  assert.equal(nextTreeVersion(['27-52894.tree.json'], 27, '52894'), 2);
  assert.equal(nextTreeVersion(['27-52894.tree.json', '27-52894.tree.v2.json'], 27, '52894'), 3);
  assert.equal(nextTreeVersion(['26-52894.tree.json'], 27, '52894'), 1, 'another epoch does not count');
});

function tmpDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rebate-files-'));
  const moduleDir = path.join(root, 'site');
  const out = path.join(root, 'rebates');
  fs.mkdirSync(moduleDir);
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(moduleDir, 'own-addresses.json'), JSON.stringify({ addresses: [OWN] }));
  return { root, moduleDir, out };
}

test('writeRebateFiles: persona gate, exclude table and the versioned tree', async () => {
  const { moduleDir, out } = tmpDirs();
  const offer = {
    type: 'rebate',
    pool: '52894',
    epochs: [3],
    pctBps: 300,
    capUsdc: 10,
    capPerBuyerUsdc: 2,
    stakeGate: { minStakeAnts: 50 },
    payer: PAYER
  };
  const offerPath = path.join(moduleDir, 'offer.json');
  fs.writeFileSync(offerPath, JSON.stringify(offer));
  const snapshotPath = path.join(moduleDir, 'snapshot.json');
  fs.writeFileSync(
    snapshotPath,
    JSON.stringify({
      snapshotBlock: 100,
      positions: [
        { id: 1, agentId: '52894', weightsByEpoch: { 3: String(5200n * WEI) } }, // 50 ANTS at max lock
        { id: 2, agentId: '52894', weightsByEpoch: { 3: String(10400n * WEI) } } // moved -> not counted
      ]
    })
  );

  const deps = {
    resolveOperatorsAt: async (addresses, block) => {
      const outMap = {};
      for (const a of addresses) outMap[String(a).toLowerCase()] = '';
      outMap[A] = OP; // stable operator on both blocks
      outMap[B] = OP; // shared operator, one slot
      outMap[SELLER.toLowerCase()] = OP2; // the seller's operator
      outMap[PAYER.toLowerCase()] = OP; // the payer's operator
      return outMap;
    },
    resolveOwnersAt: async (ids, block) => {
      if (block === 100) return { 1: OP, 2: OP };
      return { 1: OP, 2: A }; // position 2 changed hands mid-epoch
    },
    scanTransfers: async () => new Set()
  };

  const spends = {
    [A]: '100000000',
    [B]: '10000000',
    [SELLER]: '5000000',
    [PAYER]: '5000000',
    [OP]: '5000000',
    [OWN]: '60000000'
  };
  const result = await writeRebateFiles({
    opts: { offer: offerPath, out, epoch: 3, pool: '52894', from: 100, pin: 200, snapshot: snapshotPath },
    spends,
    seller: SELLER,
    aggregate: '185000000',
    moduleDir,
    repoRoot: path.resolve('.'),
    deps
  });

  const j = JSON.parse(fs.readFileSync(path.join(out, '3-52894.json'), 'utf-8'));
  assert.deepEqual(j.payouts, { [A.toLowerCase()]: '2000000' }, 'one slot: the higher spender is paid, capped per buyer');
  assert.equal(j.excluded[B.toLowerCase()], 'stake_gate');
  assert.equal(j.excluded[SELLER.toLowerCase()], 'seller');
  assert.equal(j.excluded[PAYER.toLowerCase()], 'payer');
  assert.equal(j.excluded[OP], 'operator', 'the operators of seller/payer are excluded as addresses');
  assert.equal(j.excluded[OWN], 'stake_gate', 'our own addresses are not excluded when the payer is not ours');
  assert.equal(j.personas[A.toLowerCase()], OP);
  assert.equal(j.stakeByPersona[OP], String(50n * WEI));
  assert.equal(j.stakeByPersona[A.toLowerCase()], undefined, 'the moved position does not count');

  const tree = JSON.parse(fs.readFileSync(path.join(out, '3-52894.tree.json'), 'utf-8'));
  assert.equal(tree.version, 1);
  assert.match(tree.root, /^0x[0-9a-f]{64}$/);
  assert.ok(result.tree.endsWith('3-52894.tree.json'));
  assert.equal(tree.total, '2000000');
  assert.equal(tree.claimWindowDays, 14);
  assert.equal(tree.leaves.length, 1);
  assert.equal(tree.leaves[0].account, A.toLowerCase());
  assert.ok(Array.isArray(tree.leaves[0].proof));
});
