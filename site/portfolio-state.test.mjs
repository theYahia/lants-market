import { test } from 'node:test';
import * as assert from 'node:assert';
import { positionState, closedPositionIdsForOwner } from './portfolio-state.mjs';

const OWNER = '0x7F9e56B765d824Bd867f62fe5b5e3f92Cd359c16';
const OTHER = '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B';

test('positionState – open', () => {
  assert.strictEqual(positionState({ closedAtEpoch: '0', withdrawn: false }, 28), 'open');
});

test('positionState – close still in the future stays open', () => {
  assert.strictEqual(positionState({ closedAtEpoch: '30', withdrawn: false }, 28), 'open');
});

test('positionState – closed in the current epoch', () => {
  assert.strictEqual(positionState({ closedAtEpoch: '28', withdrawn: false }, 28), 'closed');
});

test('positionState – closed earlier', () => {
  assert.strictEqual(positionState({ closedAtEpoch: '25', withdrawn: false }, 28), 'closed');
});

test('positionState – withdrawn outranks closed', () => {
  assert.strictEqual(positionState({ closedAtEpoch: '25', withdrawn: true }, 28), 'withdrawn');
});

test('positionState – missing position', () => {
  assert.strictEqual(positionState(null, 28), 'missing');
});

function makeSnapshot(positions, epoch = 28) {
  return { epoch, positions };
}

test('closedPositionIdsForOwner – keeps the wallet closed positions only', () => {
  const snap = makeSnapshot([
    { id: '10', owner: OWNER, closedAtEpoch: '27', withdrawn: false },
    { id: '11', owner: OTHER, closedAtEpoch: '27', withdrawn: false },
    { id: '12', owner: OWNER, closedAtEpoch: '0', withdrawn: false },
    { id: '13', owner: OWNER, closedAtEpoch: '25', withdrawn: true },
    { id: '14', owner: OWNER.toLowerCase(), closedAtEpoch: '26', withdrawn: false }
  ]);
  assert.deepStrictEqual(closedPositionIdsForOwner(snap, OWNER, snap.epoch), ['10', '14']);
});

test('closedPositionIdsForOwner – address match is case-insensitive', () => {
  const snap = makeSnapshot([{ id: '7', owner: OWNER, closedAtEpoch: '20', withdrawn: false }]);
  assert.deepStrictEqual(closedPositionIdsForOwner(snap, OWNER.toLowerCase(), snap.epoch), ['7']);
  assert.deepStrictEqual(closedPositionIdsForOwner(snap, OWNER.toUpperCase(), snap.epoch), ['7']);
});

test('closedPositionIdsForOwner – ascending order', () => {
  const snap = makeSnapshot([
    { id: '100', owner: OWNER, closedAtEpoch: '20', withdrawn: false },
    { id: '9', owner: OWNER, closedAtEpoch: '20', withdrawn: false }
  ]);
  assert.deepStrictEqual(closedPositionIdsForOwner(snap, OWNER, snap.epoch), ['9', '100']);
});

test('closedPositionIdsForOwner – missing snapshot or account', () => {
  assert.deepStrictEqual(closedPositionIdsForOwner(null, OWNER, 28), []);
  assert.deepStrictEqual(closedPositionIdsForOwner(makeSnapshot([]), '', 28), []);
  assert.deepStrictEqual(closedPositionIdsForOwner({}, OWNER, 28), []);
});
