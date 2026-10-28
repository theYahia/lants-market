import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadState, EMPTY_STATE } from './state.mjs';
import { saveRotatedToken, rotatedTokenPath, ROTATED_TOKEN_FILE } from './token-store.mjs';

test('saveRotatedToken persists state and writes the marker file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bot-token-'));
  const statePath = path.join(dir, 'state.json');
  const state = loadState(statePath);
  state.pending = [{ type: 'floor', key: 'k1', text: 't' }];

  saveRotatedToken(statePath, state, 'rt-new');

  const reloaded = loadState(statePath);
  assert.equal(reloaded.refreshToken, 'rt-new');
  assert.equal(reloaded.pending.length, 1);
  const marker = path.join(dir, ROTATED_TOKEN_FILE);
  assert.equal(existsSync(marker), true);
  assert.equal(readFileSync(marker, 'utf8'), 'rt-new\n');
  assert.equal(rotatedTokenPath(statePath), marker);
  rmSync(dir, { recursive: true, force: true });
});

test('rotatedTokenPath is derived from the state file location', () => {
  assert.equal(rotatedTokenPath('C:/bot/state.json'), path.join('C:\\bot', ROTATED_TOKEN_FILE));
});

test('state without a rotated token stays empty', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bot-token-'));
  const statePath = path.join(dir, 'state.json');
  assert.deepEqual(loadState(statePath), EMPTY_STATE);
  assert.equal(existsSync(path.join(dir, ROTATED_TOKEN_FILE)), false);
  rmSync(dir, { recursive: true, force: true });
});
