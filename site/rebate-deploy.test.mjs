import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256 } from 'viem';
import { artifactHashes } from './rebate-deploy.mjs';

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
