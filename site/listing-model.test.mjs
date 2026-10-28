import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLots, buildUnlistedLots } from './listing-model.mjs';

const E18 = (n) => (BigInt(Math.round(n * 1e6)) * 10n ** 12n).toString();

const snapshot = {
  epoch: '28',
  positions: [
    { id: '1', agentId: '10', amount: E18(10), stakeStartEpoch: '26', stakeEndEpoch: '40' },
    { id: '2', agentId: '20', amount: E18(2), stakeStartEpoch: '20', stakeEndEpoch: '30' },
    { id: '3', agentId: '10', amount: E18(0.5), stakeStartEpoch: '20', stakeEndEpoch: '30' },
    { id: '4', agentId: '20', amount: E18(3), stakeStartEpoch: '20', stakeEndEpoch: '30', closedAtEpoch: '28' },
    { id: '5', agentId: '20', amount: E18(4), stakeStartEpoch: '30', stakeEndEpoch: '40' },
  ],
};

const own = [
  { listingId: 5, nftId: '1', price: 2000000n, isLive: true, seller: '0xAa', chainAmount: E18(10) },
  { listingId: 6, nftId: '2', price: 3000000n, isLive: true, seller: '0xBb', chainAmount: E18(2) },
  { listingId: 0, nftId: '2', price: 500000n, isLive: true, seller: '0xCc', chainAmount: E18(2) },
  { listingId: 7, nftId: '77', price: 1000000n, isLive: true, seller: '0xAa' },
];

const seaport = [
  { id: 1, priceUsdc: 1.5, owner: '0xBb', sellerName: 'Venice.ai Proxy' },
  { id: 88, priceUsdc: 1, owner: '0xBb', sellerName: 'Ghost' },
];

const poolNames = { 10: 'Apex', 20: 'Open Forge' };

test('buildLots joins positions, recomputes $/ANTS and drops unknown tokens', () => {
  const lots = buildLots(own, seaport, snapshot, poolNames);
  assert.equal(lots.length, 2);

  const one = lots.find((l) => l.tokenId === 1);
  assert.equal(one.source, 'seaport');
  assert.equal(one.priceUsdc, 1.5);
  assert.equal(one.amountAnts, 10);
  assert.equal(one.perAntUsd, 0.15);
  assert.equal(one.provider, 'Apex');
  assert.deepEqual(one.alsoOn, ['lants']);
  assert.equal(one.status, 'listed');

  // listing 0 is internal and must not count; the real lot is #6 at 3 USDC.
  const two = lots.find((l) => l.tokenId === 2);
  assert.equal(two.priceUsdc, 3);
  assert.equal(two.perAntUsd, 1.5);
  assert.equal(two.provider, 'Open Forge');
  assert.equal(two.listingId, 6);
  assert.deepEqual(two.alsoOn, []);
});

test('the cheaper source wins on a shared token and both badges survive', () => {
  const lots = buildLots(own, seaport, snapshot, poolNames);
  assert.equal(lots[0].tokenId, 1); // cheapest $/ANTS first
  assert.deepEqual(lots[0].alsoOn, ['lants']);
  const lantsOnly = buildLots(own, [{ ...seaport[0], priceUsdc: 9 }], snapshot, poolNames);
  assert.equal(lantsOnly[0].source, 'lants');
  assert.deepEqual(lantsOnly[0].alsoOn, ['seaport']);
});

test('unlisted lots add active non-dust positions only', () => {
  const listed = buildLots(own, seaport, snapshot, poolNames);
  const extra = buildUnlistedLots(snapshot, listed, poolNames);
  assert.equal(extra.length, 1);
  assert.equal(extra[0].tokenId, 5);
  assert.equal(extra[0].status, 'pending'); // stakeStartEpoch 30 > epoch 28
  assert.equal(extra[0].priceUsdc, null);
  assert.equal(extra[0].perAntUsd, null);
  assert.equal(extra[0].provider, 'Open Forge');
});

test('a position with no snapshot row is never carded', () => {
  const lots = buildLots([], [{ id: 999, priceUsdc: 1, owner: '0x1' }], snapshot, poolNames);
  assert.deepEqual(lots, []);
});
