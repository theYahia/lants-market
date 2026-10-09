import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256 as viemKeccak, toHex, stringToHex } from 'viem';
import { keccak256, keccakConcat, bytesToHex, hexToBytes } from './keccak.mjs';

test('keccak256: known vectors', () => {
  assert.equal(keccak256('0x'), '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  assert.equal(keccak256(stringToHex('abc')), '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45');
});

test('keccak256: matches viem around the 136-byte rate boundary', () => {
  for (const len of [0, 1, 31, 32, 63, 64, 135, 136, 137, 200, 272]) {
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = (i * 37 + 11) & 0xff;
    assert.equal(keccak256(bytes), viemKeccak(bytes), `len ${len}`);
  }
});

test('keccak256: matches viem on pseudo-random inputs', () => {
  let seed = 123456789;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000;
  for (let t = 0; t < 20; t++) {
    const len = Math.floor(rand() * 400);
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(rand() * 256);
    assert.equal(keccak256(bytes), viemKeccak(bytes), `case ${t} len ${len}`);
  }
});

test('keccakConcat: leaf hashing for the merkle tree matches viem encodePacked', () => {
  const index = 7n;
  const account = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const amount = 2000000n;
  const parts = [
    toHex(index, { size: 32 }),
    account,
    toHex(amount, { size: 32 })
  ];
  const mine = keccakConcat(parts);
  const theirs = viemKeccak(toHex(index, { size: 32 }) + account.slice(2) + toHex(amount, { size: 32 }).slice(2));
  assert.equal(mine, theirs);
});

test('hexToBytes/bytesToHex round-trip', () => {
  assert.equal(bytesToHex(hexToBytes('0x00ff10')), '0x00ff10');
  assert.throws(() => hexToBytes('0xabc'), /odd hex/);
});
