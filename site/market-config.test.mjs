// site/market-config.test.mjs - pure ABI encoders vs hand-computed vectors and viem.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData, parseAbi } from 'viem';
import {
  pad32,
  encAddr,
  encUint,
  cancelNftListings,
  decodeWords,
  wordToBigInt,
  wordToAddr,
  formatUnits,
  encCreateListing,
  encSetApprovalForAll,
  encIndexPoolRewards,
  encOneAddressCall,
  encAddressPlusTwoNumbers,
  needsRewardIndex,
  SEL,
} from './market-config.mjs';

const Z = '0'.repeat(64);
const pad = (hex) => hex.replace(/^0x/i, '').padStart(64, '0');

// viem reference for the same signatures: the browser has no viem, so the
// hand-rolled encoders must match byte for byte.
const vi = (abi, args) => encodeFunctionData({ abi: parseAbi([abi]), args }).toLowerCase();

test('pad32: bigint, number, hex string and decimal string agree', () => {
  const want = Z.slice(0, 62) + '05';
  assert.equal(pad32(5n), want);
  assert.equal(pad32(5), want);
  assert.equal(pad32('0x5'), want);
  assert.equal(pad32('5'), want);
});

test('pad32: bare hex string is treated as hex, decimals as decimal', () => {
  assert.equal(pad32('ff'), Z.slice(0, 62) + 'ff');
  assert.equal(pad32('0xAbC'), Z.slice(0, 61) + 'abc');
  assert.equal(pad32(0n), Z);
  assert.equal(pad32(0), Z);
});

test('pad32: values longer than 32 bytes are rejected, bad input throws', () => {
  assert.throws(() => pad32('0x' + 'ff'.repeat(33)), /too long for 32 bytes/);
  assert.throws(() => pad32(1n << 256n), /too long for 32 bytes/);
  assert.throws(() => pad32(1.5), /not an integer/);
  assert.throws(() => pad32({}), /bad hex/);
});

test('encAddr: pads a valid address and accepts bare/lowercase forms', () => {
  const addr = '0xC5BFc309a68dBf4e7eEca9BD91749d611c75C660';
  assert.equal(encAddr(addr), Z.slice(0, 24) + 'c5bfc309a68dbf4e7eeca9bd91749d611c75c660');
  assert.equal(encAddr(addr.toLowerCase().replace(/^0x/, '')), encAddr(addr));
});

test('encAddr: rejects non-hex and >40 hex chars', () => {
  assert.throws(() => encAddr('0xzz'), /bad address/);
  assert.throws(() => encAddr('0x' + '12'.repeat(21)), /bad address/);
  assert.throws(() => encAddr(5), /must be string/);
});

test('encUint: encodes non-negative integers, rejects negative', () => {
  assert.equal(encUint(0n), Z);
  assert.equal(encUint(255n), Z.slice(0, 62) + 'ff');
  assert.equal(encUint('0x10'), Z.slice(0, 62) + '10');
  assert.equal(encUint(1024), Z.slice(0, 61) + '400');
  assert.throws(() => encUint(-1n), /negative uint/);
  assert.throws(() => encUint(-1), /negative uint/);
});

test('decodeWords: splits a raw eth_call response into 32-byte words', () => {
  assert.deepEqual(decodeWords('0x'), []);
  const w1 = Z.slice(0, 62) + '01';
  const w2 = Z.slice(0, 24) + 'ab'.repeat(20);
  const words = decodeWords('0x' + w1 + w2);
  assert.deepEqual(words, [w1, w2]);
  // lowercase-normalised and 0X-tolerant
  assert.deepEqual(decodeWords('0X' + w1.toUpperCase()), [w1]);
});

test('decodeWords: rejects non-hex and non-32-byte-multiple responses', () => {
  assert.throws(() => decodeWords('0xzz'), /bad hex response/);
  assert.throws(() => decodeWords('0x' + '01'.repeat(10)), /not multiple of 32 bytes/);
  assert.throws(() => decodeWords(null), /must be string/);
});

test('wordToBigInt: parses with or without 0x and rejects bad words', () => {
  assert.equal(wordToBigInt('0x' + Z.slice(0, 63) + 'a'), 10n);
  assert.equal(wordToBigInt(Z.slice(0, 63) + 'A'), 10n);
  assert.throws(() => wordToBigInt('0xzz'), /bad word/);
  assert.throws(() => wordToBigInt('0x' + 'ff'.repeat(33)), /bad word/);
});

test('wordToAddr: takes the last 20 bytes of the word', () => {
  const addr = 'ab'.repeat(20);
  assert.equal(wordToAddr('0x' + '11'.repeat(12) + addr), '0x' + addr);
  assert.equal(wordToAddr('0x' + addr), '0x' + addr);
});

test('formatUnits: exact decimal division for 6 and 18 decimals', () => {
  assert.equal(formatUnits(1234567n, 6), '1.234567');
  assert.equal(formatUnits(1n, 0), '1');
  assert.equal(formatUnits(123456789012345678901234567890n, 18), '123456789012.345678901234567890');
  assert.equal(formatUnits(0n, 6), '0.000000');
});

test('formatUnits: negative values get a minus sign; bad input throws', () => {
  assert.equal(formatUnits(-10n, 2), '-0.10');
  assert.equal(formatUnits(-123456789n, 6), '-123.456789');
  assert.equal(formatUnits(-1n, 0), '-1');
  assert.throws(() => formatUnits(1n, -1n), /negative decimals/);
  assert.throws(() => formatUnits(1.5, 2), /not an integer/);
});

test('encCreateListing: golden vector matches viem byte for byte', () => {
  const args = {
    nftCollection: '0xC5BFc309a68dBf4e7eEca9BD91749d611c75C660',
    nftId: 42n,
    currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    price: 123456789n,
    slopeMax: 0n,
    slopeDuration: 0n,
    fixedDuration: 0n,
  };
  const want = '0x10e8ee82'
    + '000000000000000000000000c5bfc309a68dbf4e7eeca9bd91749d611c75c660'
    + '000000000000000000000000000000000000000000000000000000000000002a'
    + '000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913'
    + '00000000000000000000000000000000000000000000000000000000075bcd15'
    + '0000000000000000000000000000000000000000000000000000000000000000'
    + '0000000000000000000000000000000000000000000000000000000000000000'
    + '0000000000000000000000000000000000000000000000000000000000000000';
  assert.equal(encCreateListing(args), want);
  const v = vi(
    'function createListing(address,uint256,address,uint256,uint96,uint32,uint32)',
    [args.nftCollection, args.nftId, args.currency, args.price, args.slopeMax, args.slopeDuration, args.fixedDuration]
  );
  assert.equal(encCreateListing(args), v);
});

test('encCreateListing: matches viem for a full max-lock slope', () => {
  const args = {
    nftCollection: '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652',
    nftId: 205n,
    currency: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    price: 106746148n,
    slopeMax: 1043812739812n,
    slopeDuration: 604800n,
    fixedDuration: 0n,
  };
  const v = vi(
    'function createListing(address,uint256,address,uint256,uint96,uint32,uint32)',
    [args.nftCollection, args.nftId, args.currency, args.price, args.slopeMax, args.slopeDuration, args.fixedDuration]
  );
  assert.equal(encCreateListing(args), v);
});

test('encSetApprovalForAll: true/false match viem', () => {
  const operator = '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B';
  const a = vi('function setApprovalForAll(address,bool)', [operator, true]);
  const b = vi('function setApprovalForAll(address,bool)', [operator, false]);
  assert.equal(encSetApprovalForAll(operator, true), a);
  assert.equal(encSetApprovalForAll(operator, false), b);
  assert.match(encSetApprovalForAll(operator, false), /0000000000000000000000000000000000000000000000000000000000000000$/);
});

test('cancelNftListings: matches viem', () => {
  const nft = '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652';
  const id = 7n;
  const v = vi('function cancelNftListings(address,uint256)', [nft, id]);
  assert.equal(cancelNftListings(nft, id), v);
  assert.equal(cancelNftListings(nft, id).slice(0, 10), SEL.cancelNftListings);
});

test('encIndexPoolRewards: matches viem', () => {
  const v = vi('function indexPoolRewards(uint256,uint256)', [52894n, 2n]);
  assert.equal(encIndexPoolRewards(52894n, 2n), v);
});

test('encOneAddressCall: selector plus one padded address', () => {
  const addr = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const v = vi('function balanceOf(address) view returns (uint256)', [addr]);
  assert.equal(encOneAddressCall(SEL.balanceOf, addr), v);
  assert.equal(encOneAddressCall(SEL.balanceOf, addr).slice(0, 10), SEL.balanceOf);
});

test('encAddressPlusTwoNumbers: address and two uint256 words', () => {
  const addr = '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B';
  const v = vi('function stakerPositionIds(address,uint256,uint256) view returns (uint256[])', [addr, 0n, 10n]);
  assert.equal(encAddressPlusTwoNumbers(SEL.stakerPositionIds, addr, 0n, 10n), v);
});

test('needsRewardIndex: true only for a positive finished-epoch pending', () => {
  assert.equal(needsRewardIndex(1n), true);
  assert.equal(needsRewardIndex(0n), false);
});

console.log('market_config_ok=1');
