// site/portfolio-rewards.test.mjs - indexed + finished-epoch reward reads
// shared by the portfolio summary and the position rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPositionReward, readStakerRewardTotals, readFinishedEpoch } from './portfolio-rewards.mjs';
import { MARKET, SEL, encUint } from './market-config.mjs';

const word = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');

function fakeEthCallTo(responses) {
  return async (to, data) => (responses[data] !== undefined ? responses[data] : '0x');
}

test('readPositionReward: sums indexed and finished-epoch rewards', async () => {
  const id = 7;
  const finishedEpoch = 30n;
  const responses = {};
  responses[SEL.pendingIndexedStakerReward + encUint(BigInt(id))] = word(5n * 10n ** 18n);
  for (let k = 0; k < 2; k++) {
    const ep = finishedEpoch - BigInt(k);
    responses[SEL.pendingStakerReward + encUint(BigInt(id)) + encUint(ep)] = word(1n * 10n ** 18n);
  }
  const { indexedWei, finishedWei } = await readPositionReward(id, finishedEpoch, 2, {
    ethCallTo: fakeEthCallTo(responses), SEL, MARKET,
  });
  assert.equal(indexedWei, 5n * 10n ** 18n);
  assert.equal(finishedWei, 2n * 10n ** 18n);
});

test('readPositionReward: skips the finished window when the epoch is unknown', async () => {
  const id = 7;
  const responses = {};
  responses[SEL.pendingIndexedStakerReward + encUint(BigInt(id))] = word(3n * 10n ** 18n);
  const { indexedWei, finishedWei } = await readPositionReward(id, null, 2, {
    ethCallTo: fakeEthCallTo(responses), SEL, MARKET,
  });
  assert.equal(indexedWei, 3n * 10n ** 18n);
  assert.equal(finishedWei, 0n);
});

test('readPositionReward: a failed indexed read is zero, not a throw', async () => {
  const id = 7;
  const { indexedWei, finishedWei } = await readPositionReward(id, 10n, 1, {
    ethCallTo: async () => { throw new Error('rpc down'); },
    SEL, MARKET,
  });
  assert.equal(indexedWei, 0n);
  assert.equal(finishedWei, 0n);
});

test('readStakerRewardTotals: sums indexed + finished across ids', async () => {
  const ids = [1, 2];
  const finishedEpoch = 10n;
  const responses = {};
  for (const id of ids) {
    responses[SEL.pendingIndexedStakerReward + encUint(BigInt(id))] = word(2n * 10n ** 18n);
    responses[SEL.pendingStakerReward + encUint(BigInt(id)) + encUint(finishedEpoch)] = word(1n * 10n ** 18n);
  }
  const totals = await readStakerRewardTotals(ids, finishedEpoch, 1, {
    ethCallTo: fakeEthCallTo(responses), SEL, MARKET,
  });
  assert.equal(totals.indexedWei, 4n * 10n ** 18n);
  assert.equal(totals.finishedWei, 2n * 10n ** 18n);
});

test('readFinishedEpoch: returns currentEpoch - 1 and null on failure', async () => {
  assert.equal(await readFinishedEpoch({ ethCallTo: async () => word(31), MARKET }), 30n);
  assert.equal(await readFinishedEpoch({
    ethCallTo: async () => { throw new Error('rpc down'); },
    MARKET,
  }), null);
});

console.log('portfolio_rewards_ok=1');
