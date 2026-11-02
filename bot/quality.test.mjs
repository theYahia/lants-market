import test from 'node:test';
import assert from 'node:assert/strict';
import { gatePost, isWindowOpen, MAX_POST_LEN } from './quality.mjs';
import { epochCloseText, boardText, lotText, networkText, eduText } from './format.mjs';

const NOW = Date.parse('2026-10-29T15:00:00Z');
const FREE = {};

// The eight posts that went out on 29.10 — the format this gate exists to stop.
const OLD_POSTS = [
  '\u{1F3C1} Epoch 28 has ended \u00b7 \u{1F41C} 5M ANTS emitted \u00b7 24h avg $0.102\n\nStaker rewards for epoch 28 are claimable now:\n\u2022 Claim \u2014 ANTS to your wallet\n\u2022 Restake \u2014 compound into a new position \u{1F331}\n\nhttps://lants.eth.limo',
  '\u{23F3}\uFE0F Epoch 28 ends in ~1h \u2014 claim staker rewards or restake with a +5% power bonus \u{1F331}\n\nhttps://lants.eth.limo',
  '\u{1F331} Staked: 1.79M ANTS (+5.3%) \u00b7 73% of stakable \u00b7 data: antseedstats.com',
  '\u{1F331} Staked: 1.7M ANTS (+8.1%) \u00b7 72% of stakable \u00b7 data: antseedstats.com',
  '\u{1F4B0} AntSeed 7d settled: $12,804 (+6.1%) \u00b7 27,841 settlements \u00b7 70 sellers \u00b7 data: antseedstats.com',
  '\u{1F4B0} AntSeed 30d settled: $30,411 (-3.0%) \u00b7 78,141 settlements \u00b7 88 sellers \u00b7 data: antseedstats.com',
  '\u{1F381} Epoch 28 rewards \u00b7 \u{1F41C} 5M ANTS emission \u00b7 $10,735.66 seller points \u00b7 data: antseedstats.com',
  '\u{1F4E1} AntSeed 24h \u00b7 215.41K requests \u00b7 9.77B tokens \u00b7 95% attributed \u00b7 data: antseedstats.com',
];

const NEW_POSTS = {
  epoch: epochCloseText({ epoch: 28, emissionAnts: 5000000, sellerPointsUsd: 13145, restakeBonusPct: 5 }),
  board: boardText({ listedCount: 15, totalNfts: 483, offeredCount: 0, floorAsk: 0.14, avg24h: 0.101931 }),
  lot: lotText({ id: 205, amount: 762.4724, usd: 106.746148, perAntUsd: 0.14, daysRemaining: 106, stakeEndEpoch: 44 }),
  network: networkText({ buyers: 307, sellers: 72, settled7d: 13772, pctChange: '+5.9%' }),
  edu: eduText({ totalNfts: 483, listedCount: 15 }),
};

test('every post from 29.10 is refused by the gate', () => {
  for (const text of OLD_POSTS) {
    const res = gatePost({ text, family: 'board', slots: FREE, nowMs: NOW, windowOpen: true });
    assert.equal(res.ok, false, text);
  }
});

test('the five new templates pass on a free slot inside the window', () => {
  for (const [family, text] of Object.entries(NEW_POSTS)) {
    const res = gatePost({ text, family, slots: FREE, nowMs: NOW, windowOpen: true });
    assert.deepEqual(res, { ok: true, reason: null }, `${family}: ${text}`);
  }
});

test('a post without the site link is refused as no-link', () => {
  const text = 'Epoch 28 closed. 5M ANTS went to stakers.\n\nClaim your rewards.';
  assert.deepEqual(gatePost({ text, family: 'epoch', slots: FREE, nowMs: NOW }), { ok: false, reason: 'no-link' });
});

test('a post without a number is refused as no-number', () => {
  const text = 'Epoch closed. Rewards are claimable now.\n\nlants.eth.limo';
  assert.deepEqual(gatePost({ text, family: 'epoch', slots: FREE, nowMs: NOW }), { ok: false, reason: 'no-number' });
});

test('an emoji-led or middle-dot first line is refused as first-line', () => {
  const emoji = '\u{1F4CA} lANTS weekly\n\nFloor $0.140 \u00b7 15 listed\n\nhttps://lants.eth.limo';
  assert.equal(gatePost({ text: emoji, family: 'board', slots: FREE, nowMs: NOW }).reason, 'first-line');
  const label = 'AntSeed 24h: 215.41K requests\n\nlants.eth.limo';
  assert.equal(gatePost({ text: label, family: 'network', slots: FREE, nowMs: NOW }).reason, 'first-line');
  const dot = 'Floor moved today \u00b7 $0.140 now \u00b7 lants.eth.limo';
  assert.equal(gatePost({ text: dot, family: 'board', slots: FREE, nowMs: NOW }).reason, 'first-line');
});

test('a prose first line with a colon is allowed', () => {
  const res = gatePost({ text: NEW_POSTS.lot, family: 'lot', slots: FREE, nowMs: NOW });
  assert.equal(res.ok, true);
});

test('over-length text is refused as too-long', () => {
  const text = 'Epoch 28 closed. ' + 'word '.repeat(50) + 'lants.eth.limo';
  assert.ok(text.length > MAX_POST_LEN);
  assert.equal(gatePost({ text, family: 'epoch', slots: FREE, nowMs: NOW }).reason, 'too-long');
});

test('the second epoch post in a row is refused as family-gap', () => {
  const slots = { epoch: NOW - 24 * 3600 * 1000 };
  assert.deepEqual(
    gatePost({ text: NEW_POSTS.epoch, family: 'epoch', slots, nowMs: NOW }),
    { ok: false, reason: 'family-gap' }
  );
  // Five days after the last one the slot is free again.
  const later = NOW + 5 * 24 * 3600 * 1000;
  assert.equal(gatePost({ text: NEW_POSTS.epoch, family: 'epoch', slots, nowMs: later }).ok, true);
});

test('education waits ten days, the data families five', () => {
  const slots = { edu: NOW - 9 * 24 * 3600 * 1000, board: NOW - 4 * 24 * 3600 * 1000 };
  assert.equal(gatePost({ text: NEW_POSTS.edu, family: 'edu', slots, nowMs: NOW }).reason, 'family-gap');
  assert.equal(gatePost({ text: NEW_POSTS.board, family: 'board', slots, nowMs: NOW }).reason, 'family-gap');
});

test('a closed window holds the post', () => {
  assert.deepEqual(
    gatePost({ text: NEW_POSTS.epoch, family: 'epoch', slots: FREE, nowMs: NOW, windowOpen: false }),
    { ok: false, reason: 'window-closed' }
  );
});

test('an unknown family never passes', () => {
  assert.equal(gatePost({ text: NEW_POSTS.board, family: 'digest', slots: FREE, nowMs: NOW }).reason, 'family');
});

test('the posting window is 14:00-17:00 UTC', () => {
  assert.equal(isWindowOpen(Date.parse('2026-10-29T13:59:00Z')), false);
  assert.equal(isWindowOpen(Date.parse('2026-10-29T14:00:00Z')), true);
  assert.equal(isWindowOpen(Date.parse('2026-10-29T16:59:00Z')), true);
  assert.equal(isWindowOpen(Date.parse('2026-10-29T17:00:00Z')), false);
  assert.equal(isWindowOpen(Date.parse('2026-10-29T02:00:00Z')), false);
});
