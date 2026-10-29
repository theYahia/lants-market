// Shared staker-reward reads for the portfolio summary and the position rows.
// Both sum the indexed bucket (pendingIndexedStakerReward) plus the finished
// epoch rewards nobody has indexed yet (pendingStakerReward over a small
// window), so the summary matches the Claim / Restake buttons on each row.

import { encUint, decodeWords, wordToBigInt } from './market-config.mjs';

// Live current epoch minus one (the most recent finished epoch), or null when
// the read fails. The caller passes this into the reward readers so the epoch
// is read once instead of once per row.
export async function readFinishedEpoch({ ethCallTo, MARKET }) {
  try {
    const raw = await ethCallTo(MARKET.nft, '0x76671808'); // currentEpoch()
    const words = decodeWords(raw);
    if (words.length > 0) return wordToBigInt(words[0]) - 1n;
  } catch (e) {
    console.error('Error reading current epoch', e);
  }
  return null;
}

// One position's indexed reward plus its finished-epoch reward over scanEpochs.
// scanEpochs matches OPEN_FINISHED_EPOCHS / CLOSED_FINISHED_EPOCHS in the rows.
export async function readPositionReward(id, finishedEpoch, scanEpochs, { ethCallTo, SEL, MARKET }) {
  const nftId = encUint(BigInt(id));
  let indexedWei = 0n;
  try {
    const raw = await ethCallTo(MARKET.stakerRewards, SEL.pendingIndexedStakerReward + nftId);
    if (raw !== '0x') indexedWei = wordToBigInt(decodeWords(raw)[0] || raw);
  } catch (e) {
    console.error('Error reading indexed reward for position', id, e);
  }

  let finishedWei = 0n;
  if (finishedEpoch != null) {
    for (let k = 0; k < scanEpochs; k++) {
      const ep = finishedEpoch - BigInt(k);
      if (ep <= 0n) continue;
      try {
        const raw = await ethCallTo(MARKET.stakerRewards, SEL.pendingStakerReward + nftId + encUint(ep));
        const words = decodeWords(raw);
        if (words.length > 0) finishedWei += wordToBigInt(words[0]);
      } catch (e) {
        console.error('Error reading finished-epoch reward for position', id, e);
      }
    }
  }
  return { indexedWei, finishedWei };
}

// Sum indexed + finished rewards across all ids (the portfolio summary tile).
export async function readStakerRewardTotals(ids, finishedEpoch, scanEpochs, deps) {
  let indexedWei = 0n;
  let finishedWei = 0n;
  for (const id of ids || []) {
    const { indexedWei: indexed, finishedWei: finished } = await readPositionReward(id, finishedEpoch, scanEpochs, deps);
    indexedWei += indexed;
    finishedWei += finished;
  }
  return { indexedWei, finishedWei };
}
