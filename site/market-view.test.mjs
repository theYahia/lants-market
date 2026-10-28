// site/market-view.test.mjs - pure helpers exported by market-view.mjs.
// Only humanError and daysToSeconds: wallet-DOM glue is outside the scope.
import test from 'node:test';
import assert from 'node:assert/strict';
import { humanError, daysToSeconds } from './market-view.mjs';

const E = (msg) => ({ message: msg });

test('humanError: user rejection maps to a plain cancellation message', () => {
  assert.equal(humanError(E('User rejected the request')), 'Cancelled in the wallet.');
  assert.equal(humanError(E('user denied message signature')), 'Cancelled in the wallet.');
});

test('humanError: insufficient funds and balance exceeded', () => {
  assert.equal(humanError(E('insufficient funds for gas * price * value')), 'Not enough ETH on Base for gas.');
  assert.equal(humanError(E('transfer amount exceeds balance')), 'Not enough USDC in this wallet.');
});

test('humanError: on-chain require messages', () => {
  assert.equal(humanError(E('execution reverted: 0x9e684275')), 'This position is max-locked or closed: split and move are disabled.');
  assert.equal(humanError(E('Error: PositionClosed()')), 'This position is max-locked or closed: split and move are disabled.');
  assert.equal(humanError(E('execution reverted: 0x646cf558')), 'This reward is already staked or claimed.');
  assert.equal(humanError(E('AlreadyClaimed')), 'This reward is already staked or claimed.');
});

test('humanError: stale nonce / underpriced', () => {
  assert.equal(humanError(E('intrinsic gas too low: underpriced')), 'The wallet reused an old transaction. Wait a few seconds and try again.');
  assert.equal(humanError(E('nonce too low')), 'The wallet reused an old transaction. Wait a few seconds and try again.');
});

test('humanError: Marketplace: <message> extraction', () => {
  assert.equal(humanError(E('execution reverted: Marketplace: Seller not owner')), 'Seller not owner.');
  assert.equal(humanError(E('Marketplace: Invalid price')), 'Invalid price.');
});

test('humanError: raw message passthrough and truncation over 140 chars', () => {
  assert.equal(humanError(E('Something went wrong')), 'Something went wrong');
  const long = 'x'.repeat(200);
  assert.equal(humanError(E(long)), 'x'.repeat(140) + '…');
  const at140 = 'y'.repeat(140);
  assert.equal(humanError(E(at140)), at140);
});

test('humanError: prefers shortMessage and handles non-string errors', () => {
  assert.equal(humanError({ shortMessage: 'Metamask RPC error: user rejected' }), 'Cancelled in the wallet.');
  assert.equal(humanError(new Error('execution reverted: 0x9e684275')), 'This position is max-locked or closed: split and move are disabled.');
});

test('daysToSeconds: null for zero, negative and non-finite input', () => {
  assert.equal(daysToSeconds(0), null);
  assert.equal(daysToSeconds(-5), null);
  assert.equal(daysToSeconds(NaN), null);
  assert.equal(daysToSeconds(Infinity), null);
  assert.equal(daysToSeconds('abc'), null);
  assert.equal(daysToSeconds(undefined), null);
  assert.equal(daysToSeconds(null), null);
});

test('daysToSeconds: whole and fractional days', () => {
  assert.equal(daysToSeconds(1), 86400);
  assert.equal(daysToSeconds(0.5), 43200);
  assert.equal(daysToSeconds(2.5), 216000);
  assert.equal(daysToSeconds(7), 604800);
  assert.equal(daysToSeconds('30'), 2592000);
});

test('daysToSeconds: caps at 60 days', () => {
  assert.equal(daysToSeconds(60), 5184000);
  assert.equal(daysToSeconds(60.1), null);
  assert.equal(daysToSeconds(61), null);
});

console.log('market_view_ok=1');
