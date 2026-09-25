import test from 'node:test'
import assert from 'node:assert'
import { crossCheck } from './net.mjs'

test('equal passes', () => assert.strictEqual(crossCheck('5', '5', 'x'), '5'))
test('drpc-zero mismatch throws', () =>
  assert.throws(() => crossCheck('5', '0', 'pendingStakerReward'), /RPC mismatch/))