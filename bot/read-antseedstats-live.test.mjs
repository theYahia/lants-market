import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLeaders,
  parseDaily,
  parseDiem,
  parseRewardsCurrent,
  parseModelsTop3,
  latestCompleteDay,
  readAntseedStatsLive,
} from './read-antseedstats-live.mjs';

const leadersJson = {
  data: {
    window_hours: 24,
    seller: { address: '0x1d90', name: 'Open Forge', settled_usd: '645.38', buyers: 10 },
    top_model_by_sales: { model: 'openai-gpt-6-astra', display: 'GPT-6 Astra', settled_usd: '410.19', tokens: 257920696, requests: 6585, buyers: 23 },
    top_model_by_tokens: { model: 'deepseek-v4-1-flash', display: 'DeepSeek V4.1 Flash', tokens: 5713003154, requests: 57175, buyers: 31 },
    top_free_model: { model: 'deepseek-v4-flash', display: 'DeepSeek V4 Flash 0423', tokens: 5098293560, buyers: 266 },
    excluded_sellers: 8,
  },
};

test('parseLeaders extracts seller and per-model leaders', () => {
  const res = parseLeaders(leadersJson);
  assert.equal(res.ok, true);
  assert.equal(res.leaders.sellerName, 'Open Forge');
  assert.ok(Math.abs(res.leaders.sellerUsd - 645.38) < 1e-6);
  assert.equal(res.leaders.sellerBuyers, 10);
  assert.equal(res.leaders.topModelSales.display, 'GPT-6 Astra');
  assert.ok(Math.abs(res.leaders.topModelSales.usd - 410.19) < 1e-6);
  assert.equal(res.leaders.topModelTokens.display, 'DeepSeek V4.1 Flash');
  assert.equal(res.leaders.topModelTokens.tokens, 5713003154);
  assert.equal(res.leaders.topFreeModel.display, 'DeepSeek V4 Flash 0423');
  assert.equal(res.leaders.excludedSellers, 8);
});

test('parseDaily normalizes and sorts the day series', () => {
  const json = {
    data: {
      days: [
        { day: '2026-10-29', settled_usd: '1017.52', requests: 104978, new_users: 4, video_seconds: 1568 },
        { day: '2026-10-28', settled_usd: '2738.72', requests: 210696, new_users: 18, video_seconds: 2996 },
      ],
    },
  };
  const res = parseDaily(json);
  assert.equal(res.ok, true);
  assert.equal(res.days.length, 2);
  assert.equal(res.days[0].day, '2026-10-28');
  assert.ok(Math.abs(res.days[0].settledUsd - 2738.72) < 1e-6);
  assert.equal(res.days[0].newUsers, 18);
  assert.equal(res.days[1].day, '2026-10-29');
});

test('latestCompleteDay skips the partial (today) row', () => {
  const nowMs = Date.parse('2026-10-29T12:00:00Z');
  const days = [
    { day: '2026-10-28', settledUsd: 2738.72 },
    { day: '2026-10-29', settledUsd: 1017.52 },
  ];
  const best = latestCompleteDay(days, nowMs);
  assert.equal(best.day, '2026-10-28');
  assert.equal(latestCompleteDay([], nowMs), null);
  assert.equal(latestCompleteDay(null, nowMs), null);
});

test('parseDiem extracts capacity and payouts, never apy', () => {
  const json = {
    data: {
      total_staked_diem: 396.6,
      stakers: 82,
      stake_value_usd: 690694.85,
      usdc_distributed_usd: '7647.37',
      usdc_reserved_usd: '1969.71',
      ants_distributed: 1403252.05,
      apy_pct: 9.13,
    },
  };
  const res = parseDiem(json);
  assert.equal(res.ok, true);
  assert.ok(Math.abs(res.diem.stakeValueUsd - 690694.85) < 1e-6);
  assert.equal(res.diem.stakers, 82);
  assert.ok(Math.abs(res.diem.usdcDistributedUsd - 7647.37) < 1e-6);
  assert.ok(Math.abs(res.diem.antsDistributed - 1403252.05) < 1e-6);
  assert.equal('apy' in res.diem, false);
});

test('parseRewardsCurrent extracts budgets and pct-of-target', () => {
  const json = {
    data: {
      epoch: { number: 29, emission_ants: 5000000 },
      budgets: {
        usage_input_usd: '60.31',
        usage_target_usd: '1000000.00',
        usage_pct_of_target: 0.0060312987,
        stake_active_ants: 1570595.45,
        stake_target_ants: 400000000,
        stake_pct_of_target: 0.392648863,
        pools_ants: 107400,
      },
    },
  };
  const res = parseRewardsCurrent(json);
  assert.equal(res.ok, true);
  assert.equal(res.rewards.epoch, 29);
  assert.equal(res.rewards.emissionAnts, 5000000);
  assert.ok(Math.abs(res.rewards.usagePctOfTarget - 0.0060312987) < 1e-9);
  assert.ok(Math.abs(res.rewards.stakePctOfTarget - 0.392648863) < 1e-9);
});

test('parseModelsTop3 keeps the top-3 display names by recent settled', () => {
  const json = {
    data: {
      models: [
        { model: 'a', display: 'Alpha', usage: { settled_usd: '100' } },
        { model: 'b', display: 'Beta', usage: { settled_usd: '500' } },
        { model: 'c', display: 'Gamma', usage: { settled_usd: '300' } },
        { model: 'd', display: 'Delta', usage: { settled_usd: '50' } },
      ],
    },
  };
  const res = parseModelsTop3(json);
  assert.equal(res.ok, true);
  assert.deepEqual(res.models, ['Beta', 'Gamma', 'Alpha']);
});

test('all live parsers fail closed on a bad top-level shape', () => {
  for (const fn of [parseLeaders, parseDaily, parseDiem, parseRewardsCurrent, parseModelsTop3]) {
    assert.deepEqual(fn(null), { ok: false, reason: 'schema' });
    assert.deepEqual(fn({}), { ok: false, reason: 'schema' });
  }
});

test('readAntseedStatsLive merges sections and reports per-section failures', async () => {
  const byPath = {
    '/api/v1/leaders': leadersJson,
    '/api/v1/network/daily': { data: { days: [{ day: '2026-10-28', settled_usd: '2738.72' }] } },
    '/api/v1/diem': { data: { stakers: 82, stake_value_usd: 690694.85 } },
    '/api/v1/rewards/current': { data: { epoch: { number: 29 } } },
    '/api/v1/models': { data: { models: [{ model: 'a', display: 'Alpha', usage: { settled_usd: '1' } }] } },
  };
  const fetchImpl = async (url) => {
    const body = byPath[new URL(url).pathname];
    return body ? { ok: true, json: async () => body } : { ok: false, status: 500 };
  };
  const res = await readAntseedStatsLive({ fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.reasons.leaders, null);
  assert.equal(res.leaders.sellerName, 'Open Forge');
  assert.equal(res.daily[0].settledUsd, 2738.72);
  assert.equal(res.diem.stakers, 82);
  assert.equal(res.rewards.epoch, 29);
  assert.deepEqual(res.topModels, ['Alpha']);
});

test('readAntseedStatsLive soft-fails a section instead of aborting', async () => {
  const fetchImpl = async (url) =>
    url.includes('/api/v1/leaders') ? { ok: false, status: 500 } : { ok: true, json: async () => ({ data: {} }) };
  const res = await readAntseedStatsLive({ fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.leaders, null);
  assert.equal(res.reasons.leaders, 'http');
});
