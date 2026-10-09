import test from 'node:test';
import assert from 'node:assert/strict';
import { personaOf, resolveOperatorsAt } from './rebate-operators.mjs';

const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OP = '0x1111111111111111111111111111111111111111';
const OP2 = '0x2222222222222222222222222222222222222222';
const ZERO = '0x0000000000000000000000000000000000000000';

test('persona: the same non-zero operator on both blocks wins', () => {
  const p = personaOf([A], { [A]: OP }, { [A]: OP });
  assert.equal(p[A], OP);
});

test('persona: a changed operator falls back to the buyer', () => {
  const p = personaOf([A], { [A]: OP }, { [A]: OP2 });
  assert.equal(p[A], A);
});

test('persona: a zero or missing operator falls back to the buyer', () => {
  assert.equal(personaOf([A], { [A]: ZERO }, { [A]: ZERO })[A], A);
  assert.equal(personaOf([A], {}, {})[A], A);
  assert.equal(personaOf([A], { [A]: OP }, {})[A], A);
});

test('persona: keys are lowercase and mixed-case inputs are normalized', () => {
  const p = personaOf([A.toUpperCase().replace('0X', '0x')], { [A]: OP.toUpperCase().replace('0X', '0x') }, { [A]: OP });
  assert.equal(p[A], OP);
});

test('resolveOperatorsAt: multicall maps lowercased results, zero -> empty', async () => {
  const seen = [];
  const client = {
    multicall: async ({ contracts, blockNumber, allowFailure }) => {
      seen.push({ n: contracts.length, blockNumber, allowFailure });
      return [
        { status: 'success', result: OP },
        { status: 'success', result: ZERO }
      ];
    }
  };
  const out = await resolveOperatorsAt([A, B], 123, client);
  assert.deepEqual(out, { [A]: OP, [B]: '' });
  assert.deepEqual(seen, [{ n: 2, blockNumber: 123n, allowFailure: true }]);
});

test('resolveOperatorsAt: a failing call throws instead of degrading to empty', async () => {
  const client = {
    multicall: async () => [
      { status: 'success', result: OP },
      { status: 'failure', error: new Error('missing trie node') }
    ]
  };
  await assert.rejects(() => resolveOperatorsAt([A, B], 123, client), /multicall/);
});

test('resolveOperatorsAt: no addresses -> no call', async () => {
  let called = false;
  const client = { multicall: async () => { called = true; return []; } };
  const out = await resolveOperatorsAt([], 1, client);
  assert.deepEqual(out, {});
  assert.equal(called, false);
});
