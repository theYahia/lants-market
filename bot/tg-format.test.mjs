// bot/tg-format.test.mjs - Telegram message text builders, pure formatting.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  trimPrice,
  inlineButton,
  urlButton,
  keyboard,
  welcomeReply,
  helpText,
  unavailableText,
  floorHasData,
  floorReply,
  epochReply,
  setfloorReply,
  floorSetAckText,
  floorOffAckText,
  floorAlertText,
  listingAlertReply,
  epochEndedAlertText,
} from './tg-format.mjs';

const ARROW = '\u2192';

test('trimPrice renders 4-decimal floors without trailing zeros', () => {
  assert.equal(trimPrice(0.11), '$0.11');
  assert.equal(trimPrice(0.12), '$0.12');
  assert.equal(trimPrice(0.1), '$0.10');
  assert.equal(trimPrice(0.1200001), '$0.12');
  assert.equal(trimPrice(0.1100001), '$0.11');
  assert.equal(trimPrice(0.1019), '$0.1019');
  assert.equal(trimPrice(NaN), '$0');
});

test('button and keyboard builders shape the Telegram payload', () => {
  assert.deepEqual(inlineButton('Floor', 'cmd:floor'), { text: 'Floor', callback_data: 'cmd:floor' });
  assert.deepEqual(urlButton('View ->', 'https://lants.eth.limo/#position/7'), { text: 'View ->', url: 'https://lants.eth.limo/#position/7' });
  assert.deepEqual(keyboard([[{ text: 'a', callback_data: 'b' }]]), { inline_keyboard: [[{ text: 'a', callback_data: 'b' }]] });
});

test('welcomeReply greets and lists commands without a keyboard', () => {
  const { text, replyMarkup } = welcomeReply();
  assert.ok(text.includes('Welcome'));
  assert.ok(text.includes('/floor'));
  assert.ok(text.includes('/setfloor'));
  assert.ok(text.includes('Commands:'));
  assert.equal(replyMarkup, undefined);
});

test('helpText lists every command', () => {
  const t = helpText();
  for (const cmd of ['/start', '/floor', '/epoch', '/setfloor']) {
    assert.ok(t.includes(cmd), `missing ${cmd}`);
  }
});

test('floorHasData and floorReply render the header measures', () => {
  assert.equal(floorHasData({ floorAsk: 0.11 }), true);
  assert.equal(floorHasData(null), false);
  assert.equal(floorHasData({}), false);
  const reply = floorReply({ floorAsk: 0.1100001, avg24h: 0.101931, listedCount: 16, epoch: 28 });
  assert.equal(reply.text, ['Floor Ask: $0.11', '24h avg: $0.102', 'Listed: 16', 'Epoch: 28'].join('\n'));
});

test('floorReply omits unknown measures', () => {
  const reply = floorReply({ floorAsk: null, avg24h: null, listedCount: 16, epoch: null });
  assert.equal(reply.text, 'Listed: 16');
});

test('epochReply uses the countdown CTA when data is present', () => {
  const reply = epochReply({ epoch: 28, secondsLeft: 10800, restakeBonusPct: 5 });
  assert.ok(reply.text.includes('Epoch 28 ends in ~3h'));
  assert.ok(reply.text.includes('+5% power bonus'));
  assert.ok(reply.text.includes('https://lants.eth.limo'));
});

test('epochReply falls back to a bare epoch line without countdown', () => {
  const reply = epochReply({ epoch: 28, secondsLeft: null, restakeBonusPct: null });
  assert.equal(reply.text, 'Epoch 28\nhttps://lants.eth.limo');
});

test('epochReply returns unavailable without an epoch', () => {
  assert.equal(epochReply({}).text, unavailableText());
});

test('setfloorReply instructs to type a price and has no keyboard', () => {
  const withValue = setfloorReply({ floorThreshold: 0.12 });
  assert.ok(withValue.text.includes('$0.12'));
  assert.ok(withValue.text.includes('/setfloor <price>'));
  assert.equal(withValue.replyMarkup, undefined);
  const without = setfloorReply({ floorThreshold: null });
  assert.ok(without.text.includes('No floor threshold'));
  assert.ok(without.text.includes('/setfloor 0.12'));
  assert.equal(without.replyMarkup, undefined);
});

test('floor set/off acknowledgements and the alert line', () => {
  assert.ok(floorSetAckText(0.12).includes('$0.12'));
  assert.equal(floorOffAckText(), 'Floor alert off.');
  assert.equal(floorAlertText(0.11, 0.12), 'Floor $0.11 \u2014 below your threshold $0.12');
});

test('listingAlertReply reuses the X templates and adds a Buy button', () => {
  const lot = { id: 7, amount: 100, perAntUsd: 0.101, lockDays: 14 };
  const plain = listingAlertReply(lot, false);
  assert.ok(plain.text.startsWith('\u{1F195} New listing: #7'));
  assert.deepEqual(plain.replyMarkup.inline_keyboard[0][0], { text: `Buy ${ARROW}`, url: 'lants.eth.limo/#position/7' });
  const floorLot = listingAlertReply(lot, true);
  assert.ok(floorLot.text.startsWith('\u{1F3AF} New floor listing: #7'));
});

test('epochEndedAlertText is a compact CTA with optional bonus', () => {
  assert.equal(epochEndedAlertText(27), '\u{1F3C1} Epoch 27 has ended \u2014 claim staker rewards or restake \u{1F331}');
  assert.ok(epochEndedAlertText(27, 5).includes('(+5% power bonus)'));
  assert.ok(!epochEndedAlertText(27, null).includes('power bonus'));
});
