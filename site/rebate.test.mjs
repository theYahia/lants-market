import test from 'node:test';
import assert from 'node:assert/strict';
import { validRebate, rebatePayout, rebateLabel } from './rebate.mjs';

const WEI = 10n ** 18n;
const PAYER = '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B';
const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const C = '0xcccccccccccccccccccccccccccccccccccccccc';
const OP = '0x1111111111111111111111111111111111111111';

const offer = { type: 'rebate', pool: '52894', epochs: [27], pctBps: 300, capUsdc: 10, payer: PAYER };
const gated = { ...offer, stakeGate: { minStakeAnts: 50 } };

// stakeByPersona is person -> ANTS (wei, weight/104 at max lock).
const ants = (n) => String(BigInt(n) * WEI);

test('validRebate accepts an optional stakeGate', () => {
  assert.equal(validRebate(offer), true);
  assert.equal(validRebate({ ...offer, stakeGate: { minStakeAnts: 1 } }), true);
  assert.equal(validRebate({ ...offer, stakeGate: {} }), true);
});

test('validRebate rejects a malformed stakeGate', () => {
  for (const bad of [0, -1, 1.5, '100', null]) {
    assert.equal(validRebate({ ...offer, stakeGate: { minStakeAnts: bad } }), false, String(bad));
  }
  assert.equal(validRebate({ ...offer, stakeGate: 100 }), false);
  assert.equal(validRebate({ ...offer, stakeGate: { minStakeAnts: 50, extra: 1 } }), false);
});

test('persona: stake only at the operator -> the buyer is paid', () => {
  const r = rebatePayout(
    { [A]: '100000000' },
    gated,
    {},
    { [OP.toLowerCase()]: ants(100) },
    { [A.toLowerCase()]: OP },
  );
  assert.deepEqual(r.payouts, { [A.toLowerCase()]: 3000000n });
  assert.equal(r.total, 3000000n);
});

test('persona: shared operator, enough stake for ONE -> only the higher spender is paid', () => {
  const spends = { [A]: '100000000', [B]: '10000000' };
  const r = rebatePayout(
    spends,
    gated,
    {},
    { [OP.toLowerCase()]: ants(50) }, // k = floor(50/50) = 1
    { [A.toLowerCase()]: OP, [B.toLowerCase()]: OP },
  );
  assert.deepEqual(r.payouts, { [A.toLowerCase()]: 3000000n }, 'higher spend admitted');
  assert.equal(r.excluded[B.toLowerCase()], 'stake_gate', 'second buyer gated');
});

test('persona: a persona with no stake admits nobody under the gate', () => {
  const r = rebatePayout({ [A]: '100000000' }, gated, {}, {}, { [A.toLowerCase()]: OP });
  assert.deepEqual(r.payouts, {});
  assert.equal(r.excluded[A.toLowerCase()], 'stake_gate');
});

test('persona: operator changed -> persona is the buyer, no stake -> gated', () => {
  // personaOf maps the buyer to themselves (operator not stable on both blocks).
  const r = rebatePayout({ [A]: '100000000' }, gated, {}, {}, { [A.toLowerCase()]: A });
  assert.deepEqual(r.payouts, {});
  assert.equal(r.excluded[A.toLowerCase()], 'stake_gate');
});

test('persona tie-break: equal spends, ascending address wins the single slot', () => {
  const spends = { [A]: '100000000', [B]: '100000000' };
  const r = rebatePayout(
    spends,
    gated,
    {},
    { [OP.toLowerCase()]: ants(50) }, // k = 1
    { [A.toLowerCase()]: OP, [B.toLowerCase()]: OP },
  );
  const admittedAddr = A.toLowerCase() < B.toLowerCase() ? A.toLowerCase() : B.toLowerCase();
  const otherAddr = admittedAddr === A.toLowerCase() ? B.toLowerCase() : A.toLowerCase();
  assert.ok(admittedAddr in r.payouts, 'lower address admitted on tie');
  assert.ok(!(otherAddr in r.payouts), 'higher address gated on tie');
  assert.equal(r.payouts[admittedAddr], 3000000n);
});

test('two personas each get their own capacity', () => {
  const spends = { [A]: '100000000', [B]: '100000000' };
  const op2 = '0x2222222222222222222222222222222222222222';
  const r = rebatePayout(
    spends,
    gated,
    {},
    { [OP.toLowerCase()]: ants(50), [op2.toLowerCase()]: ants(50) },
    { [A.toLowerCase()]: OP, [B.toLowerCase()]: op2 },
  );
  assert.ok(A.toLowerCase() in r.payouts);
  assert.ok(B.toLowerCase() in r.payouts);
});

test('payout goes to the buyer even when the persona is the operator', () => {
  const r = rebatePayout(
    { [A]: '100000000' },
    gated,
    {},
    { [OP.toLowerCase()]: ants(100) },
    { [A.toLowerCase()]: OP },
  );
  assert.ok(A.toLowerCase() in r.payouts, 'paid to buyer, not operator');
  assert.ok(!(OP.toLowerCase() in r.payouts));
});

test('without a stake gate, positions/personas are ignored and all are paid', () => {
  const r = rebatePayout({ [A]: '100000000' }, offer, {}, {}, {});
  assert.deepEqual(r.payouts, { [A.toLowerCase()]: 3000000n });
});

test('exclude map is honored', () => {
  const r = rebatePayout({ [A]: '100000000', [B]: '100000000' }, offer, { [A]: 'seller' }, {});
  assert.deepEqual(r.payouts, { [B.toLowerCase()]: 3000000n });
  assert.equal(r.excluded[A.toLowerCase()], 'seller');
});

test('rebateLabel names the stake-gated discount', () => {
  assert.match(rebateLabel(gated, 27), /stake-gated discount/);
  assert.match(rebateLabel(gated, 27), /50 ANTS/);
  assert.doesNotMatch(rebateLabel(offer, 27), /stake-gated/);
});
