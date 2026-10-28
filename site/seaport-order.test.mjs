import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateOrder, toBasicOrderParameters } from './seaport-order.mjs';
import { SEAPORT_16 } from './seaport-abi.mjs';
import { MARKET } from './market-config.mjs';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/seaport/order-205.json', import.meta.url)), 'utf8')
);

const NOW = 1793183328; // inside the captured order's window
const expected = { tokenId: 205, now: NOW };
const clone = () => JSON.parse(JSON.stringify(fixture));

function reasonOf(mutate) {
  const order = clone();
  mutate(order);
  const res = validateOrder(order, expected);
  return res.ok ? 'ok' : res.reason;
}

test('the captured order validates and returns the exact total', () => {
  const res = validateOrder(fixture, expected);
  assert.equal(res.ok, true);
  assert.equal(res.total, 106746148n);
  assert.equal(res.offerer, '0xe692b41cf5c0cb8c2d0aafeaf59863b30981b049');
  assert.equal(res.counter, 0n);
  assert.deepEqual(res.additionalRecipients, []);

  const params = toBasicOrderParameters(fixture, expected);
  assert.equal(params.considerationAmount, 106746148n);
  assert.equal(params.salt, BigInt(fixture.orderParameters.salt));
  assert.equal(params.considerationToken.toLowerCase(), MARKET.usdc.toLowerCase());
  assert.equal(params.offerToken.toLowerCase(), MARKET.nft.toLowerCase());
  assert.equal(params.fulfillerConduitKey, '0x' + '0'.repeat(64));
});

test('every rejection branch fails closed', () => {
  const cases = [
    ['protocol', (o) => { o.protocolAddress = '0x' + '11'.repeat(20); }],
    ['schema', (o) => { o.orderParameters = null; }],
    ['offerer', (o) => { o.offerer = '0x2222222222222222222222222222222222222222'; }],
    ['order-type', (o) => { o.orderParameters.orderType = 1; }],
    ['zone', (o) => { o.orderParameters.zone = '0x1111111111111111111111111111111111111111'; }],
    ['zone-hash', (o) => { o.orderParameters.zoneHash = '0x' + '11'.repeat(32); }],
    ['conduit-key', (o) => { o.orderParameters.conduitKey = '0x' + '11'.repeat(32); }],
    ['offer', (o) => { o.orderParameters.offer = []; }],
    ['offer-item-type', (o) => { o.orderParameters.offer[0].itemType = 1; }],
    ['offer-token', (o) => { o.orderParameters.offer[0].token = '0x2222222222222222222222222222222222222222'; }],
    ['offer-id', (o) => { o.orderParameters.offer[0].identifierOrCriteria = '206'; }],
    ['offer-amount', (o) => { o.orderParameters.offer[0].startAmount = '2'; }],
    ['consideration', (o) => { o.orderParameters.consideration = []; }],
    ['consideration-item-type', (o) => { o.orderParameters.consideration[0].itemType = 0; }],
    ['consideration-token', (o) => { o.orderParameters.consideration[0].token = '0x2222222222222222222222222222222222222222'; }],
    ['consideration-dynamic', (o) => { o.orderParameters.consideration[0].endAmount = '1'; }],
    ['consideration-amount', (o) => { o.orderParameters.consideration[0].startAmount = '0'; o.orderParameters.consideration[0].endAmount = '0'; }],
    ['recipient', (o) => { o.orderParameters.consideration[0].recipient = '0x2222222222222222222222222222222222222222'; }],
    ['timing', (o) => { o.orderParameters.startTime = String(NOW + 1); }],
    ['signature', (o) => { o.signature = '0x'; }],
    ['counter', (o) => { delete o.orderParameters.counter; }],
    ['salt', (o) => { o.orderParameters.salt = 'not-a-number'; }],
    ['order-hash', (o) => { o.orderHash = '0x1234'; }],
  ];
  for (const [want, mutate] of cases) {
    assert.equal(reasonOf(mutate), want, 'mutation should fail with ' + want);
  }
});

test('the order window is half-open', () => {
  const before = clone();
  before.orderParameters.startTime = String(NOW + 1);
  assert.deepEqual(validateOrder(before, expected), { ok: false, reason: 'timing' });

  const atEnd = clone();
  atEnd.orderParameters.endTime = String(NOW);
  assert.deepEqual(validateOrder(atEnd, expected), { ok: false, reason: 'timing' });
});

test('a fee item becomes an additional recipient and stays in the total', () => {
  const order = clone();
  order.orderParameters.consideration.push({
    itemType: 1,
    token: MARKET.usdc,
    identifierOrCriteria: '0',
    startAmount: '1000',
    endAmount: '1000',
    recipient: '0x3333333333333333333333333333333333333333',
  });
  const res = validateOrder(order, expected);
  assert.equal(res.ok, true);
  assert.equal(res.total, 106747148n);
  assert.deepEqual(res.additionalRecipients, [
    { amount: 1000n, recipient: '0x3333333333333333333333333333333333333333' },
  ]);
  const params = toBasicOrderParameters(order, expected);
  assert.equal(params.additionalRecipients.length, 1);
  assert.equal(params.considerationAmount, 106746148n);
  assert.equal(SEAPORT_16.toLowerCase(), String(order.protocolAddress).toLowerCase());
});
