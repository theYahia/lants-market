import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256 } from 'viem';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { artifactHashes, constructorArgsHex, patchImmutableEmbeds } from './rebate-deploy.mjs';

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

test('patchImmutableEmbeds: patches exactly-32-byte zero runs only', () => {
  const val = 'ab'.repeat(32);
  assert.equal(patchImmutableEmbeds('0x' + '00'.repeat(32) + 'aa', val), '0x' + val + 'aa');
  assert.equal(patchImmutableEmbeds('0x' + '00'.repeat(33) + 'aa', val), '0x' + '00'.repeat(33) + 'aa');
  assert.equal(patchImmutableEmbeds('0xaa' + '00'.repeat(32) + '11' + '00'.repeat(32), val), '0xaa' + val + '11' + val);
});

test('expectedRuntimeHash: real artifact equals the on-chain verified hash', () => {
  const artifactPath = fileURLToPath(new URL('../contracts/out/RebateClaims.sol/RebateClaims.json', import.meta.url));
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
  const h = artifactHashes(artifact);
  assert.equal(h.runtimeCodeHash, '0x72d5436c926730cf543566525fb802b113ff331d78c77347cd72eb0efe9659c6');
  assert.equal(h.expectedRuntimeHash, '0xd840ac24e8caf4121745cb93f4f4ae1fcd61a95826f9c208a4e3c5c5424fc279');
  assert.notEqual(h.runtimeCodeHash, h.expectedRuntimeHash);
});
