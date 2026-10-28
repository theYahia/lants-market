import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parseNetworkSummary,
  parseSupply,
  parseStaking,
  parseEpochs,
  parseEpochDetail,
  parseModels,
  parsePrices,
  maxCompletedEpoch,
  readAntseedStats,
  toAntseedSnapshot,
  toAntseedState,
} from './read-antseedstats.mjs';

const load = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));

const networkFixture = load('antseedstats-network-summary-2026-10-28.json');
const supplyFixture = load('antseedstats-supply-2026-10-28.json');
const stakingFixture = load('antseedstats-staking-pools-2026-10-28.json');
const epochsFixture = load('antseedstats-epochs-2026-10-28.json');
const epoch28Fixture = load('antseedstats-epoch-28-2026-10-28.json');
const modelsFixture = load('antseedstats-models-2026-10-28.json');
const pricesFixture = load('antseedstats-prices-2026-10-28.json');

test('parseNetworkSummary extracts settled windows and epoch', () => {
  const res = parseNetworkSummary(networkFixture);
  assert.equal(res.ok, true);
  assert.equal(res.network.epoch, 28);
  assert.ok(Math.abs(res.network.settled24h - 2418.38) < 1e-6);
  assert.ok(Math.abs(res.network.settled7d - 12804.23) < 1e-6);
  assert.ok(Math.abs(res.network.settled30d - 30411.16) < 1e-6);
});

test('parseSupply extracts totals, stake partition and sorted burns', () => {
  const res = parseSupply(supplyFixture);
  assert.equal(res.ok, true);
  assert.equal(res.supply.burnedAnts, 6000000);
  assert.ok(Math.abs(res.supply.totalSupplyAnts - 129929424.06818411) < 1e-6);
  assert.ok(Math.abs(res.supply.stakedAnts - 1535689.2100756501) < 1e-6);
  assert.ok(Math.abs(res.supply.stakedPct - 73.21072304386453) < 1e-6);
  assert.deepEqual(res.supply.burns, [
    { epoch: 22, ants: 1500000 },
    { epoch: 23, ants: 1500000 },
    { epoch: 24, ants: 1500000 },
    { epoch: 25, ants: 1500000 },
  ]);
});

test('parseStaking extracts active stake and budget', () => {
  const res = parseStaking(stakingFixture);
  assert.equal(res.ok, true);
  assert.ok(Math.abs(res.staking.totalStakeAnts - 1164191.5653076272) < 1e-6);
  assert.equal(res.staking.budgetAnts, 104500);
  assert.equal(res.staking.rewardEpoch, 27);
});

test('parseEpochs normalizes and sorts the epoch list', () => {
  const res = parseEpochs(epochsFixture);
  assert.equal(res.ok, true);
  assert.equal(res.epochs.length, 29);
  assert.equal(res.epochs[0].epoch, 0);
  const last = res.epochs[res.epochs.length - 1];
  assert.equal(last.epoch, 28);
  assert.equal(last.status, 'current');
  assert.equal(last.emissionAnts, 5000000);
  assert.equal(last.burnAnts, null);
});

test('parseEpochDetail exposes emission, burn and points for one epoch', () => {
  const res = parseEpochDetail(epoch28Fixture);
  assert.equal(res.ok, true);
  assert.equal(res.epoch.epoch, 28);
  assert.equal(res.epoch.status, 'current');
  assert.equal(res.epoch.emissionAnts, 5000000);
  assert.equal(res.epoch.model, 'recognized');
  assert.equal(res.epoch.burnAnts, null);
  assert.ok(Math.abs(res.epoch.sellerPointsUsd - 10735.66) < 1e-6);
});

test('parseModels keeps model id and display name', () => {
  const res = parseModels(modelsFixture);
  assert.equal(res.ok, true);
  assert.equal(res.models.length, 10);
  assert.deepEqual(res.models[0], { model: 'gpt-5-3-codex-spark', display: 'GPT-5.3 Codex Spark' });
});

test('parsePrices keeps live listing model + input price', () => {
  const res = parsePrices(pricesFixture);
  assert.equal(res.ok, true);
  assert.equal(res.listings.length, 10);
  assert.equal(res.listings[0].model, '0gm-1-0-35b-a3b');
  assert.equal(res.listings[0].display, '0gm 1.0 35B A3B');
  assert.equal(res.listings[0].inputUsdPerM, 0.06);
  assert.equal(res.listings[0].live, true);
});

test('maxCompletedEpoch ignores the current epoch', () => {
  assert.equal(maxCompletedEpoch([{ epoch: 26, status: 'complete' }, { epoch: 27, status: 'complete' }, { epoch: 28, status: 'current' }]), 27);
  assert.equal(maxCompletedEpoch([]), 0);
});

test('all parsers fail closed on a bad top-level shape', () => {
  for (const fn of [parseNetworkSummary, parseSupply, parseStaking, parseEpochs, parseEpochDetail, parseModels, parsePrices]) {
    assert.deepEqual(fn(null), { ok: false, reason: 'schema' });
    assert.deepEqual(fn({}), { ok: false, reason: 'schema' });
  }
});

test('readAntseedStats merges sections and reports per-section failures', async () => {
  const byPath = {
    '/api/v1/network/summary': networkFixture,
    '/api/v1/ants/supply': supplyFixture,
    '/api/v1/epochs': epochsFixture,
  };
  const fetchImpl = async (url) => {
    const body = byPath[new URL(url).pathname];
    return body ? { ok: true, json: async () => body } : { ok: false, status: 500 };
  };
  const res = await readAntseedStats({ fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.reasons.network, null);
  assert.ok(Math.abs(res.network.settled24h - 2418.38) < 1e-6);
  assert.equal(res.supply.burns.length, 4);
  assert.equal(res.epochs.length, 29);
});

test('readAntseedStats soft-fails a section instead of aborting the run', async () => {
  const fetchImpl = async (url) =>
    url.includes('/api/v1/ants/supply') ? { ok: false, status: 500 } : { ok: true, json: async () => networkFixture };
  const res = await readAntseedStats({ fetchImpl });
  assert.equal(res.ok, true);
  assert.ok(res.network);
  assert.equal(res.supply, null);
  assert.equal(res.reasons.supply, 'http');
});

test('toAntseedSnapshot and toAntseedState build diff + persist shapes', () => {
  const result = {
    network: { settled24h: 1 },
    supply: { stakedAnts: 2, stakedPct: 3, burns: [{ epoch: 22, ants: 1500000 }] },
    epochs: [{ epoch: 27, status: 'complete' }, { epoch: 28, status: 'current' }],
  };
  const snapshot = toAntseedSnapshot(result);
  assert.equal(snapshot.settled24h, 1);
  assert.equal(snapshot.stakedAnts, 2);
  assert.equal(snapshot.epochs.length, 2);
  const state = toAntseedState(snapshot);
  assert.deepEqual(state.burns, [{ epoch: 22, ants: 1500000 }]);
  assert.equal(state.maxCompletedEpoch, 27);
});
