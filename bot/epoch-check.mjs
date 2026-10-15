// The weekly "epoch ended" reminder. Pure module: given `now` and the state,
// it decides whether a post is due and builds the text. Nothing here touches
// the network or Telegram.
//
// Epoch N starts at epochBoundary(N) and ends at epochBoundary(N+1)
// (Thursday 09:54:21 UTC). When the boundary passes, staker rewards for the
// finished epoch become claimable (Claim / Restake) and buyer rewards can be
// staked into a seller pool. There is no on-chain deadline, but a post weeks
// late would be noise, so the post is skipped outside a 48h window.

import { epochBoundary, EPOCH_BASE, EPOCH_BASE_NUM, WEEK_MS } from '../site/epochs.mjs';

export const POST_WINDOW_MS = 48 * 60 * 60 * 1000;

// Epoch running at time `t`: the largest N with epochBoundary(N) <= t.
export function currentEpochAt(t) {
  const ms = t.getTime();
  if (ms < EPOCH_BASE.getTime()) {
    throw new Error('epoch-check: time before the epoch base');
  }
  return EPOCH_BASE_NUM + Math.floor((ms - EPOCH_BASE.getTime()) / WEEK_MS);
}

export function epochPostText(epoch, siteUrl = 'https://lants.eth.limo') {
  return [
    `🏁 Epoch ${epoch} has ended`,
    '',
    `Staker rewards for epoch ${epoch} are claimable now:`,
    '• Claim — ANTS to your wallet',
    '• Restake — compound into a new position',
    '',
    `Buyer rewards for epoch ${epoch} can be staked into a seller pool.`,
    '',
    siteUrl
  ].join('\n');
}

// Decide for one tick. Returns { post } when a message should be sent, or
// { post: null } when it should stay silent. The caller marks the state.
export function decideEpochPost({ now, state, windowMs = POST_WINDOW_MS }) {
  const finished = currentEpochAt(now) - 1; // the epoch whose end boundary just passed
  const endedAt = epochBoundary(finished + 1).getTime();
  const sinceEnd = now.getTime() - endedAt;
  if (sinceEnd < 0 || sinceEnd > windowMs) return { post: null, epoch: finished };
  if (state.epochPost === finished) return { post: null, epoch: finished };
  return { post: epochPostText(finished), epoch: finished };
}
