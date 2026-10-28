import test from 'node:test';
import assert from 'node:assert/strict';
import { positionViewModel } from './position-page.mjs';

const E18 = (n) => (BigInt(Math.round(n * 1e6)) * 10n ** 12n).toString();

const snapshot = {
  epoch: '28',
  positions: [
    {
      id: '1',
      agentId: '10',
      owner: '0xAbCdEf0000000000000000000000000000000001',
      amount: E18(10),
      stakeStartEpoch: '20',
      stakeEndEpoch: '30',
      weightsByEpoch: { 29: E18(10) },
    },
    { id: '2', agentId: '10', amount: E18(5), stakeStartEpoch: '20', stakeEndEpoch: '30', closedAtEpoch: '28' },
  ],
};

const lots = [
  { tokenId: 1, perAntUsd: 0.2, priceUsdc: 2, provider: 'Apex', source: 'lants' },
  { tokenId: 1, perAntUsd: 0.1, priceUsdc: 1, provider: 'Apex', source: 'seaport' },
];

const sales = [
  { nftId: '1', price: 2000000n, soldTime: 1700000000 },
  { nftId: '2', price: 9000000n, soldTime: 1700000000 },
  { nftId: '1', price: 0n, soldTime: 0n },
];

const trades = [
  { tokenId: 1, priceWei: '3000000', createdAt: 1700100000000, txHash: '0xaaa', buyer: '0xbb' },
  { tokenId: 1, priceWei: '3000000', createdAt: 1700100000000, txHash: '0xaaa' },
  { tokenId: 2, priceWei: '1', createdAt: 1700100000000, txHash: '0xccc' },
];

test('unknown and closed ids are reported as not found', () => {
  assert.equal(positionViewModel({ tokenId: 99, snapshot, lots }).found, false);
  // #2 is closed at the current epoch, so it is no longer an active position.
  assert.equal(positionViewModel({ tokenId: 2, snapshot, lots }).found, false);
});

test('a position closing at the next epoch is still active now', () => {
  const snap = {
    epoch: '28',
    positions: [
      { id: '3', agentId: '10', amount: E18(1), stakeStartEpoch: '20', stakeEndEpoch: '30', closedAtEpoch: '29' },
    ],
  };
  const vm = positionViewModel({ tokenId: 3, snapshot: snap, lots: [] });
  assert.equal(vm.found, true);
  assert.equal(vm.lockWeeks, 1); // next epoch 29 -> 30 is one week away
});

test('view model joins position, lots, owner and implied valuation', () => {
  const vm = positionViewModel({
    tokenId: 1,
    snapshot,
    lots,
    minted: 1000,
    maxSupply: 10000,
  });
  assert.equal(vm.found, true);
  assert.equal(vm.provider, 'Apex');
  assert.equal(vm.agentId, '10');
  assert.equal(vm.amountAnts, 10);
  assert.equal(vm.owner, '0xAbCdEf0000000000000000000000000000000001');
  assert.equal(vm.lots.length, 2);
  assert.equal(vm.perAntUsd, 0.1); // cheapest lot
  assert.equal(vm.impliedMcUsd, 100);
  assert.equal(vm.impliedFdvUsd, 1000);
  assert.equal(vm.lockWeeks, 1); // epoch 30 - next epoch 29
  assert.equal(vm.unlock instanceof Date, true);
});

test('history merges our sales and feed trades, dedupes and sorts', () => {
  const vm = positionViewModel({ tokenId: 1, snapshot, lots, sales, trades });
  assert.equal(vm.history.length, 2);
  assert.equal(vm.history[0].kind, 'seaport');
  assert.equal(vm.history[0].txHash, '0xaaa');
  assert.equal(vm.history[1].kind, 'lants');
  assert.equal(vm.history[1].priceUsdc, 2);
});

test('a position without a snapshot owner leaves owner null for the live read', () => {
  const snap = { epoch: '28', positions: [{ ...snapshot.positions[0], owner: undefined }] };
  const vm = positionViewModel({ tokenId: 1, snapshot: snap, lots });
  assert.equal(vm.owner, null);
});
