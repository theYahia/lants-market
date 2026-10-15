import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256 as viemKeccak, toHex } from 'viem';
import { SEL, encIndexPoolRewards, needsRewardIndex, encUint } from './market-config.mjs';

const sig = (s) => viemKeccak(toHex(s)).slice(0, 10);

test('SEL.pendingStakerReward and SEL.indexPoolRewards match their signatures', () => {
  assert.equal(SEL.pendingStakerReward, sig('pendingStakerReward(uint256,uint256)'));
  assert.equal(SEL.indexPoolRewards, sig('indexPoolRewards(uint256,uint256)'));
});

test('SEL.posMaxLockPower matches positionMaxLockPowerAtEpoch(uint256,uint256)', () => {
  assert.equal(SEL.posMaxLockPower, sig('positionMaxLockPowerAtEpoch(uint256,uint256)'));
});

test('encIndexPoolRewards encodes selector plus two uint256 words', () => {
  const data = encIndexPoolRewards(52894n, 2n);
  assert.equal(data.slice(0, 10), SEL.indexPoolRewards);
  assert.equal(data.length, 10 + 64 + 64);
  assert.equal(data.slice(10, 74), encUint(52894n));
  assert.equal(data.slice(74), encUint(2n));
});

test('needsRewardIndex: only non-zero finished-epoch pending triggers indexing', () => {
  assert.equal(needsRewardIndex(0n), false);
  assert.equal(needsRewardIndex(1n), true);
  assert.equal(needsRewardIndex(9214400000000000000000n), true);
});
