import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergePositionOwners,
  scanTransfers,
  positionsWithOwnersAt,
  blockAtOrBefore
} from './stake-positions.mjs';

const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topic = (hex) => '0x' + hex.padStart(64, '0');
const word = (hex) => hex.padStart(64, '0');

test('merge: same owner on both blocks and no transfer -> owner', () => {
  const out = mergePositionOwners([{ id: 7, agentId: '1' }], { 7: A }, { 7: A }, new Set());
  assert.equal(out[0].owner, A);
  assert.equal(out[0].ownerAtStart, A);
  assert.equal(out[0].ownerAtEnd, A);
  assert.equal(out[0].id, 7);
  assert.equal(out[0].agentId, '1');
});

test('merge: a transfer inside the epoch disqualifies the position', () => {
  const out = mergePositionOwners([{ id: 7 }], { 7: A }, { 7: A }, new Set(['7']));
  assert.equal(out[0].owner, '');
});

test('merge: owner changed between the blocks -> no owner of record', () => {
  const out = mergePositionOwners([{ id: 7 }], { 7: A }, { 7: B }, new Set());
  assert.equal(out[0].owner, '');
  assert.equal(out[0].ownerAtStart, A);
  assert.equal(out[0].ownerAtEnd, B);
});

test('merge: missing at the start (minted mid-epoch) -> no owner of record', () => {
  const out = mergePositionOwners([{ id: 7 }], { 7: '' }, { 7: A }, new Set());
  assert.equal(out[0].owner, '');
});

test('scanTransfers: picks only the wanted token ids from indexed logs', async () => {
  const calls = [];
  const client = {
    getLogs: async (req) => {
      calls.push(req);
      return [
        { topics: [TRANSFER, topic('1'), topic('2'), topic('7')], data: '0x' },
        { topics: [TRANSFER, topic('1'), topic('2'), topic('8')], data: '0x' },
        { topics: [TRANSFER, topic('1'), topic('2'), topic('7')], data: '0x' }
      ];
    }
  };
  const moved = await scanTransfers(['7', 8], 10, 20, { client });
  assert.deepEqual([...moved].sort(), ['7', '8']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fromBlock, 10n);
  assert.equal(calls[0].toBlock, 20n);
});

test('scanTransfers: a non-indexed ERC-721 Transfer takes the id from data', async () => {
  const client = {
    getLogs: async () => [
      { topics: [TRANSFER], data: '0x' + word('1') + word('2') + word('7') }
    ]
  };
  const moved = await scanTransfers(['7', '9'], 1, 2, { client });
  assert.deepEqual([...moved], ['7']);
});

test('scanTransfers: no ids -> no RPC call', async () => {
  let called = false;
  const client = { getLogs: async () => { called = true; return []; } };
  const moved = await scanTransfers([], 1, 2, { client });
  assert.equal(moved.size, 0);
  assert.equal(called, false);
});

test('positionsWithOwnersAt: two blocks + transfer scan over (start, end]', async () => {
  const snapshot = {
    positions: [
      { id: 1, agentId: '52894', weightsByEpoch: { 27: '104000000000000000000' } },
      { id: 2, agentId: '52894', weightsByEpoch: { 27: '52000000000000000000' } },
      { id: 3, agentId: '44694', weightsByEpoch: { 27: '104000000000000000000' } }
    ]
  };
  const calls = { blocks: [], scans: [] };
  const deps = {
    resolveOwnersAt: async (ids, block) => {
      calls.blocks.push([block, ids]);
      if (block === 100) return { 1: A, 2: A, 3: A };
      return { 1: A, 2: A, 3: A };
    },
    scanTransfers: async (ids, from, to) => {
      calls.scans.push([from, to, ids]);
      return new Set(['2']);
    }
  };
  const out = await positionsWithOwnersAt(snapshot, '52894', 100, 200, deps);
  assert.equal(out.length, 2, 'the other pool is dropped');
  assert.equal(out[0].owner, A);
  assert.equal(out[1].owner, '', 'id 2 moved mid-epoch');
  assert.deepEqual(calls.blocks.map((c) => c[0]), [100, 200]);
  assert.deepEqual(calls.scans, [[101, 200, ['1', '2']]], 'scan starts at startBlock + 1');
});

test('blockAtOrBefore: binary search on synthetic timestamps', async () => {
  const client = {
    getBlockNumber: async () => 9n,
    getBlock: async ({ blockNumber }) => ({ timestamp: 1000n + blockNumber })
  };
  assert.equal(await blockAtOrBefore(1005_400, client), 5);
  assert.equal(await blockAtOrBefore(1003_000, client), 3);
  assert.equal(await blockAtOrBefore(999_000, client), 0);
  assert.equal(await blockAtOrBefore(2000_000, client), 9);
});
