// site/rpc-multicall.test.mjs - resilient multicall with an injectable client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { multicallResilient, makeClient, RPC_PRIMARY, RPC_FALLBACK } from './rpc-multicall.mjs';

const CONTRACTS = [
  { address: '0x0000000000000000000000000000000000000001', abi: [{ type: 'function', name: 'f', stateMutability: 'view' }], functionName: 'f' },
];

test('multicallResilient: accepts a rejected-then-ok sequence with one client', async () => {
  const client = {
    calls: 0,
    async multicall(args) {
      this.calls += 1;
      assert.equal(args.blockNumber, 9000000n);
      assert.equal(args.allowFailure, true);
      return [{ status: 'success', result: 1n }];
    },
  };
  const out = await multicallResilient({ contracts: CONTRACTS, blockNumber: 9000000, client, ok: () => true });
  assert.deepEqual(out, [{ status: 'success', result: 1n }]);
  assert.equal(client.calls, 1);
});

test('multicallResilient: ok predicate rejecting a result throws', async () => {
  const client = {
    async multicall() {
      return [{ status: 'failure' }];
    },
  };
  await assert.rejects(
    multicallResilient({ contracts: CONTRACTS, blockNumber: 1, client, ok: () => false }),
    /rejected by the caller check/
  );
});

test('multicallResilient: a failing client multicall surfaces its error', async () => {
  const client = {
    async multicall() {
      const e = new Error('rpc down');
      e.code = -32000;
      throw e;
    },
  };
  await assert.rejects(
    multicallResilient({ contracts: CONTRACTS, blockNumber: 1, client, ok: () => true }),
    /rpc down/
  );
});

test('multicallResilient: ok predicate may reject partial failures', async () => {
  const client = {
    async multicall() {
      return [{ status: 'success', result: 1n }, { status: 'failure' }];
    },
  };
  await assert.rejects(
    multicallResilient({
      contracts: CONTRACTS,
      blockNumber: 5,
      client,
      ok: (results) => results.every((r) => r.status === 'success'),
    }),
    /rejected by the caller check/
  );
});

test('makeClient: returns a viem public client with a multicall method', () => {
  const client = makeClient(RPC_PRIMARY);
  assert.equal(typeof client.multicall, 'function');
  assert.equal(typeof client.chain.name, 'string');
});

test('RPC constants point at the primary and fallback endpoints', () => {
  assert.match(RPC_PRIMARY, /^https:\/\//);
  assert.match(RPC_FALLBACK, /^https:\/\//);
  assert.notEqual(RPC_PRIMARY, RPC_FALLBACK);
});

console.log('rpc_multicall_ok=1');
