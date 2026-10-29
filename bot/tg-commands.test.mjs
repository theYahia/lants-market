// bot/tg-commands.test.mjs - pure command and callback handlers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, handleCommand, handleCallback } from './tg-commands.mjs';
import { EMPTY_TG_STATE } from './tg-state.mjs';
import { unavailableText, positionNotFoundText, floorOffAckText } from './tg-format.mjs';

const MARKET = {
  floorAsk: 0.1100001,
  avg24h: 0.101931,
  listedCount: 16,
  epoch: 28,
  listings: [
    { id: 206, amount: 400, perAntUsd: 0.102, usd: 40.8, lockDays: 56 },
    { id: 207, amount: 100, perAntUsd: 0.101, usd: 10.1, lockDays: null },
  ],
};

const EPOCH_DATA = { epoch: 28, secondsLeft: 10800, restakeBonusPct: 5 };

function context(overrides = {}) {
  return { state: { ...EMPTY_TG_STATE }, chatId: '42', market: MARKET, epochData: EPOCH_DATA, ...overrides };
}

test('parseCommand handles plain, args and botname suffix', () => {
  assert.deepEqual(parseCommand('/start'), { name: 'start', args: '' });
  assert.deepEqual(parseCommand('/position 206'), { name: 'position', args: '206' });
  assert.deepEqual(parseCommand('/start@lantsalerts_bot'), { name: 'start', args: '' });
  assert.deepEqual(parseCommand('/setfloor 0.12'), { name: 'setfloor', args: '0.12' });
  assert.equal(parseCommand('not a command'), null);
  assert.deepEqual(parseCommand('/floor x y'), { name: 'floor', args: 'x y' });
});

test('handleCommand /start returns the welcome text without a keyboard', () => {
  const { reply } = handleCommand({ command: { name: 'start', args: '' }, context: context() });
  assert.ok(reply.text.includes('Welcome'));
  assert.equal(reply.replyMarkup, undefined);
});

test('handleCommand /floor renders the header measures', () => {
  const { reply } = handleCommand({ command: { name: 'floor', args: '' }, context: context() });
  assert.equal(reply.text, ['Floor Ask: $0.11', '24h avg: $0.102', 'Listed: 16', 'Epoch: 28'].join('\n'));
});

test('handleCommand /floor reports unavailable without a feed', () => {
  const { reply } = handleCommand({ command: { name: 'floor', args: '' }, context: context({ market: null }) });
  assert.equal(reply.text, unavailableText());
});

test('handleCommand /position finds a lot and adds a View button', () => {
  const { reply } = handleCommand({ command: { name: 'position', args: '206' }, context: context() });
  assert.ok(reply.text.includes('#206'));
  assert.equal(reply.replyMarkup.inline_keyboard[0][0].text, 'View \u2192');
});

test('handleCommand /position not-found and bad-arg handling', () => {
  const notFound = handleCommand({ command: { name: 'position', args: '999' }, context: context() });
  assert.equal(notFound.reply.text, positionNotFoundText());
  const bad = handleCommand({ command: { name: 'position', args: 'abc' }, context: context() });
  assert.equal(bad.reply.text, 'Usage: /position <id>');
});

test('handleCommand /epoch renders the countdown CTA', () => {
  const { reply } = handleCommand({ command: { name: 'epoch', args: '' }, context: context() });
  assert.ok(reply.text.includes('Epoch 28 ends in ~3h'));
});

test('handleCommand /setfloor with a value mutates state and confirms', () => {
  const ctx = context();
  const { reply } = handleCommand({ command: { name: 'setfloor', args: '0.12' }, context: ctx });
  assert.ok(reply.text.includes('$0.12'));
  assert.equal(ctx.state.subscribers['42'].floorThreshold, 0.12);
  assert.equal(ctx.state.subscribers['42'].floorArmedDown, true);
});

test('handleCommand /setfloor without args shows the menu', () => {
  const ctx = context();
  ctx.state.subscribers['42'] = { subscribedAt: 'x', floorThreshold: 0.15, floorArmedDown: false };
  const { reply } = handleCommand({ command: { name: 'setfloor', args: '' }, context: ctx });
  assert.ok(reply.text.includes('$0.15'));
  assert.equal(reply.replyMarkup.inline_keyboard[0].length, 3);
});

test('handleCommand /top is gated off', () => {
  const { reply } = handleCommand({ command: { name: 'top', args: '' }, context: context() });
  assert.equal(reply.text, 'Top models are not available yet.');
});

test('handleCommand unknown command points to /help', () => {
  const { reply } = handleCommand({ command: { name: 'frobnicate', args: '' }, context: context() });
  assert.ok(reply.text.includes('/help'));
});

test('handleCallback setfloor preset sets the threshold and acks', () => {
  const ctx = context();
  const { ack, reply } = handleCallback({ data: 'setfloor:0.10', context: ctx });
  assert.ok(ack.text.includes('$0.10'));
  assert.equal(reply, null);
  assert.equal(ctx.state.subscribers['42'].floorThreshold, 0.10);
});

test('handleCallback floor:off disables the alert', () => {
  const ctx = context();
  ctx.state.subscribers['42'] = { subscribedAt: 'x', floorThreshold: 0.12, floorArmedDown: false };
  const { ack } = handleCallback({ data: 'floor:off', context: ctx });
  assert.equal(ack.text, floorOffAckText());
  assert.equal(ctx.state.subscribers['42'].floorThreshold, null);
});

test('handleCallback cmd buttons answer without a toast and reply', () => {
  const floorCb = handleCallback({ data: 'cmd:floor', context: context() });
  assert.equal(floorCb.ack, null);
  assert.ok(floorCb.reply.text.includes('Floor Ask'));
  const epochCb = handleCallback({ data: 'cmd:epoch', context: context() });
  assert.ok(epochCb.reply.text.includes('Epoch 28'));
  const setfloorCb = handleCallback({ data: 'cmd:setfloor', context: context() });
  assert.ok(setfloorCb.reply.replyMarkup.inline_keyboard.length > 0);
});

test('handleCallback unknown data acks a generic toast', () => {
  const { ack, reply } = handleCallback({ data: 'bogus:1', context: context() });
  assert.equal(ack.text, 'Unknown button.');
  assert.equal(reply, null);
});
