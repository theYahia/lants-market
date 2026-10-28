import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodeFunctionData, parseAbi, toFunctionSelector } from 'viem';
import {
  SEL,
  SEAPORT_16,
  ZERO_BYTES32,
  BASIC_ORDER_TYPE_ERC20_TO_ERC721_FULL_OPEN,
  encodeFulfillBasicOrder,
  encGetOrderStatus,
  encGetCounter,
  decodeOrderStatus,
} from './seaport-abi.mjs';

const order = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/seaport/order-205.json', import.meta.url)), 'utf8')
);

const abi = parseAbi([
  'function fulfillBasicOrder((address considerationToken,uint256 considerationIdentifier,uint256 considerationAmount,address offerer,address zone,address offerToken,uint256 offerIdentifier,uint256 offerAmount,uint8 basicOrderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 offererConduitKey,bytes32 fulfillerConduitKey,uint256 totalOriginalAdditionalRecipients,(uint256 amount,address recipient)[] additionalRecipients,bytes signature) parameters) payable returns (bool)',
  'function getOrderStatus(bytes32 orderHash) view returns (bool isValidated, bool isCancelled, uint256 totalFilled, uint256 totalSize)',
  'function getCounter(address offerer) view returns (uint256 counter)',
]);

function paramsFromOrder(orderJson, overrides = {}) {
  const p = orderJson.orderParameters;
  const primary = p.consideration[0];
  return {
    considerationToken: primary.token,
    considerationIdentifier: primary.identifierOrCriteria,
    considerationAmount: primary.startAmount,
    offerer: p.offerer,
    zone: p.zone,
    offerToken: p.offer[0].token,
    offerIdentifier: p.offer[0].identifierOrCriteria,
    offerAmount: p.offer[0].startAmount,
    basicOrderType: BASIC_ORDER_TYPE_ERC20_TO_ERC721_FULL_OPEN,
    startTime: p.startTime,
    endTime: p.endTime,
    zoneHash: p.zoneHash,
    salt: p.salt,
    offererConduitKey: p.conduitKey,
    fulfillerConduitKey: ZERO_BYTES32,
    additionalRecipients: [],
    signature: orderJson.signature,
    ...overrides,
  };
}

test('fulfillBasicOrder calldata matches viem for the captured order', () => {
  const params = paramsFromOrder(order);
  const mine = encodeFulfillBasicOrder(params);
  const theirs = encodeFunctionData({
    abi,
    functionName: 'fulfillBasicOrder',
    args: [{ ...params, totalOriginalAdditionalRecipients: 0 }],
  });
  assert.equal(mine, theirs);
  assert.ok(mine.startsWith(SEL.fulfillBasicOrder));
});

test('tail encoding matches viem with additional recipients and a short signature', () => {
  const params = paramsFromOrder(order, {
    additionalRecipients: [
      { amount: 1000n, recipient: '0x1111111111111111111111111111111111111111' },
      { amount: 2000n, recipient: '0x2222222222222222222222222222222222222222' },
    ],
    signature: '0xdeadbeef',
  });
  // The tuple components are named in the test ABI; totalOriginalAdditionalRecipients
  // is derived by our encoder but viem reads it from the object.
  const viemParams = {
    ...params,
    totalOriginalAdditionalRecipients: params.additionalRecipients.length,
    additionalRecipients: params.additionalRecipients.map((r) => [r.amount, r.recipient]),
  };
  assert.equal(
    encodeFulfillBasicOrder(params),
    encodeFunctionData({ abi, functionName: 'fulfillBasicOrder', args: [viemParams] })
  );
});

test('selectors are pinned to the Seaport 1.6 ABI', () => {
  assert.equal(
    toFunctionSelector('function fulfillBasicOrder((address considerationToken,uint256 considerationIdentifier,uint256 considerationAmount,address offerer,address zone,address offerToken,uint256 offerIdentifier,uint256 offerAmount,uint8 basicOrderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 offererConduitKey,bytes32 fulfillerConduitKey,uint256 totalOriginalAdditionalRecipients,(uint256 amount,address recipient)[] additionalRecipients,bytes signature) parameters)'),
    SEL.fulfillBasicOrder
  );
  assert.equal(toFunctionSelector('function getOrderStatus(bytes32 orderHash) view returns (bool, bool, uint256, uint256)'), SEL.getOrderStatus);
  assert.equal(toFunctionSelector('function getCounter(address offerer) view returns (uint256)'), SEL.getCounter);
  assert.equal(SEAPORT_16.toLowerCase(), '0x0000000000000068f116a894984e2db1123eb395');
});

test('read calldata and order status decoding', () => {
  assert.equal(
    encGetOrderStatus(order.orderHash),
    encodeFunctionData({ abi, functionName: 'getOrderStatus', args: [order.orderHash] })
  );
  assert.equal(
    encGetCounter(order.offerer),
    encodeFunctionData({ abi, functionName: 'getCounter', args: [order.offerer] })
  );
  const status = decodeOrderStatus([
    '0'.repeat(63) + '1',
    '0'.repeat(64),
    '0'.repeat(63) + '1',
    '0'.repeat(63) + '1',
  ]);
  assert.deepEqual(status, { validated: true, cancelled: false, totalFilled: 1n, totalSize: 1n });
});
