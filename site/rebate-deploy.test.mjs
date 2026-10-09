import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256 } from 'viem';
import { artifactHashes, constructorArgsHex } from './rebate-deploy.mjs';

test('constructorArgsHex: ABI-encodes the USDC address for --constructor-args', () => {
  const usdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const enc = constructorArgsHex(usdc);
  assert.match(enc, /^0x[0-9a-f]{64}$/);
  assert.equal(enc, '0x000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913');
  assert.notEqual(enc, usdc);
});

test('artifactHashes: hashes both code blobs and keeps the abi', () => {
  const artifact = {
    abi: [{ type: 'function', name: 'claim' }],
    bytecode: { object: '0x6001600155' },
    deployedBytecode: { object: '0x6001' }
  };
  const h = artifactHashes(artifact);
  assert.equal(h.initCodeHash, keccak256('0x6001600155'));
  assert.equal(h.runtimeCodeHash, keccak256('0x6001'));
  assert.equal(h.bytecode, '0x6001600155');
  assert.equal(h.abi.length, 1);
});

test('artifactHashes: accepts plain-string bytecode and rejects an unbuilt artifact', () => {
  const h = artifactHashes({ abi: [], bytecode: '0x00', deployedBytecode: '0x01' });
  assert.equal(h.runtimeCodeHash, keccak256('0x01'));
  assert.throws(() => artifactHashes({ abi: [], bytecode: '0x00', deployedBytecode: '0x' }), /deployedBytecode/);
  assert.throws(() => artifactHashes({ abi: [] }), /bytecode/);
});
