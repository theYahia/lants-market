import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { defaultState, loadState, saveState, rebateKey } from './state.mjs';

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lants-bot-state-'));
  return path.join(dir, 'state.json');
}

test('loadState: missing file -> defaults', () => {
  const s = loadState(tmpFile());
  assert.deepEqual(s, defaultState());
});

test('saveState/loadState roundtrip', () => {
  const file = tmpFile();
  const s = defaultState();
  s.epochPost = 26;
  s.rebates['26-44694'] = { open: true, warn48: false };
  saveState(file, s);
  const loaded = loadState(file);
  assert.equal(loaded.epochPost, 26);
  assert.deepEqual(loaded.rebates['26-44694'], { open: true, warn48: false });
});

test('loadState: corrupt file -> defaults, nothing thrown', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{not json');
  assert.deepEqual(loadState(file), defaultState());
});

test('loadState: partial file keeps defaults for missing fields', () => {
  const file = tmpFile();
  fs.writeFileSync(file, JSON.stringify({ epochPost: 27 }));
  const loaded = loadState(file);
  assert.equal(loaded.epochPost, 27);
  assert.deepEqual(loaded.rebates, {});
  assert.equal(loaded.lastRebateCheck, 0);
});

test('loadState: a v1 file re-baselines listings silently', () => {
  const file = tmpFile();
  fs.writeFileSync(file, JSON.stringify({ version: 1, listingsBaselineDone: true }));
  const loaded = loadState(file);
  assert.equal(loaded.version, 2);
  assert.equal(loaded.listingsBaselineDone, false);
});

test('loadState: a v2 file keeps a completed listings baseline', () => {
  const file = tmpFile();
  fs.writeFileSync(file, JSON.stringify({ version: 2, listingsBaselineDone: true }));
  const loaded = loadState(file);
  assert.equal(loaded.version, 2);
  assert.equal(loaded.listingsBaselineDone, true);
});

test('loadState: strips a leading BOM before parsing', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '\uFEFF' + JSON.stringify({ version: 2, epochPost: 29 }));
  const loaded = loadState(file);
  assert.equal(loaded.epochPost, 29);
});

test('rebateKey joins epoch and pool', () => {
  assert.equal(rebateKey(26, '44694'), '26-44694');
});
