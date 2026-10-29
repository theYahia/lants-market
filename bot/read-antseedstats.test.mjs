// bot/read-antseedstats.test.mjs - parsers and the soft-failure read path.
import test from 'node:test';
import assert from 'node:assert/strict';
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
} from './read-antseedstats.mjs';

function summaryJson() {
  return {
    data: {
      windows: {
        '24h': { settled_usd: 100, settles: 5, sellers: 2, buyers: 3 },
        '7d': { settled_usd: '700', settles: '35', sellers: '7', buyers: '9' },
        '30d': { settled_usd: 3000, settles: 150, sellers: 30, buyers: 40 },
      },
      paid_usage_24h: { requests: 10, tokens: '2000', videos: 1, coverage: 0.5 },
      generative_7d: { videos: 2, spend_usd: 3 },
      epoch: { number: 30, seconds_left: 3600 },
      lifetime: { settled_usd: 1, settles: 2, buyers: 3, sellers: 4, fees_usd: 5 },
      modality_7d: { text: { spend_usd: 11 }, images: { spend_usd: 22 }, video: { spend_usd: 33 } },
    },
  };
}

test('parseNetworkSummary fails closed on a broken schema', () => {
  assert.equal(parseNetworkSummary(null).reason, 'schema');
  assert.equal(parseNetworkSummary({ data: { epoch: { number: 1 } } }).reason, 'schema');
  assert.equal(parseNetworkSummary({ data: { windows: {} } }).reason, 'schema');
});

test('parseNetworkSummary maps windows, usage, lifetime and modality', () => {
  const { ok, network } = parseNetworkSummary(summaryJson());
  assert.equal(ok, true);
  assert.equal(network.settled24h, 100);
  assert.equal(network.settled7d, 700);
  assert.equal(network.settled30d, 3000);
  assert.equal(network.settles7d, 35);
  assert.equal(network.sellers30d, 30);
  assert.equal(network.buyers24h, 3);
  assert.equal(network.requests24h, 10);
  assert.equal(network.tokens24h, 2000);
  assert.equal(network.videos24h, 1);
  assert.equal(network.coverage24h, 0.5);
  assert.equal(network.generativeVideos7d, 2);
  assert.equal(network.generativeSpendUsd7d, 3);
  assert.equal(network.secondsLeft, 3600);
  assert.equal(network.lifetimeFeesUsd, 5);
  assert.equal(network.modalityTextUsd, 11);
  assert.equal(network.modalityImagesUsd, 22);
  assert.equal(network.modalityVideoUsd, 33);
  assert.equal(network.epoch, 30);
});

test('parseSupply fails closed and filters malformed burns', () => {
  assert.equal(parseSupply({ data: {} }).reason, 'schema');
  const { supply } = parseSupply({
    data: {
      total_supply_ants: '1000',
      burned_ants: 5,
      partition: { staked_ants: '600', staked_pct: 60 },
      burns: [
        { epoch: 28, ants: 2 },
        { epoch: 26, ants: 1 },
        { epoch: 27, ants: 0 },
        { epoch: 'x', ants: 5 },
        { epoch: 29, ants: '3' },
      ],
    },
  });
  assert.equal(supply.totalSupplyAnts, 1000);
  assert.equal(supply.stakedAnts, 600);
  assert.equal(supply.stakedPct, 60);
  assert.deepEqual(supply.burns, [
    { epoch: 26, ants: 1 },
    { epoch: 28, ants: 2 },
    { epoch: 29, ants: 3 },
  ]);
});

test('parseStaking maps the restake bonus used by the countdown', () => {
  assert.equal(parseStaking({}).reason, 'schema');
  const { staking } = parseStaking({
    data: {
      total_stake_ants: '10',
      budget_ants: 2,
      reward_epoch: 27,
      restake_bonus_pct: '5',
      claimable_ants: 1,
      stakers: 3,
      positions: 4,
    },
  });
  assert.equal(staking.restakeBonusPct, 5);
  assert.equal(staking.rewardEpoch, 27);
  assert.equal(staking.stakers, 3);
  assert.equal(staking.positions, 4);
});

test('parseEpochs sorts and maps the epoch list', () => {
  assert.equal(parseEpochs({ data: {} }).reason, 'schema');
  const { epochs } = parseEpochs({
    data: {
      epochs: [
        { epoch: 28, status: 'current', emission_ants: '2', model: 'm', burn_ants: 1, seller_points_usd: 3 },
        { epoch: 'x', status: 'complete' },
        { epoch: 27, status: 'complete', emission_ants: 1, model: null, burn_ants: 0, seller_points_usd: 2 },
      ],
    },
  });
  assert.deepEqual(epochs.map((e) => e.epoch), [27, 28]);
  assert.equal(epochs[0].status, 'complete');
  assert.equal(epochs[0].model, null);
});

test('parseEpochDetail maps economics buckets and the burn', () => {
  assert.equal(parseEpochDetail({ data: {} }).reason, 'schema');
  const { epoch } = parseEpochDetail({
    data: {
      epoch: 27,
      status: 'complete',
      emission_ants: 10,
      model: 'm',
      burn_ants: 1,
      seller_points_usd: 2,
      buyer_points_usd: 3,
      economics: {
        buckets: [
          { key: 'small', cap_pct: 5 },
          { key: 'big', cap_pct: 40 },
          { key: 'bad', cap_pct: null },
          { cap_pct: 9 },
        ],
        burn: { cap_ants: 4, projected_ants: 2 },
      },
    },
  });
  assert.equal(epoch.buyerPointsUsd, 3);
  assert.deepEqual(epoch.economics.buckets, [
    { key: 'big', capPct: 40 },
    { key: 'small', capPct: 5 },
  ]);
  assert.deepEqual(epoch.economics.burn, { capAnts: 4, projectedAnts: 2 });
});

test('parseModels and parsePrices validate shape and map rows', () => {
  assert.equal(parseModels({}).reason, 'schema');
  const { models } = parseModels({ data: { models: [{ model: 'gpt', display: 'GPT' }, { model: '' }, { model: 'x' }] } });
  assert.deepEqual(models, [{ model: 'gpt', display: 'GPT' }, { model: 'x', display: 'x' }]);

  assert.equal(parsePrices({ data: {} }).reason, 'schema');
  const { listings } = parsePrices({
    data: {
      listings: [
        { model: 'gpt', model_display: 'GPT', input_usd_per_m: '1', output_usd_per_m: 2, live: true },
        { model: '' },
      ],
    },
  });
  assert.deepEqual(listings, [
    { model: 'gpt', display: 'GPT', inputUsdPerM: 1, outputUsdPerM: 2, live: true },
  ]);
});

test('maxCompletedEpoch picks the highest complete epoch', () => {
  assert.equal(maxCompletedEpoch([{ epoch: 3, status: 'complete' }, { epoch: 5, status: 'current' }, { epoch: 4, status: 'complete' }]), 4);
  assert.equal(maxCompletedEpoch([]), 0);
});

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

function routeFetch(routes) {
  return async (url) => {
    for (const [suffix, body] of Object.entries(routes)) {
      if (url.endsWith(suffix)) return typeof body === 'function' ? body() : jsonResponse(body);
    }
    throw new Error('unexpected url ' + url);
  };
}

test('readAntseedStats tolerates a failing staking section', async () => {
  const res = await readAntseedStats({
    timeoutMs: 1000,
    fetchImpl: routeFetch({
      '/network/summary': summaryJson(),
      '/ants/supply': { data: { burns: [] } },
      '/epochs': { data: { epochs: [{ epoch: 27, status: 'complete' }] } },
      '/epochs/27': { data: { epoch: 27, status: 'complete' } },
      '/staking/pools': () => ({ ok: false, status: 503, json: async () => ({}) }),
    }),
  });
  assert.equal(res.ok, true);
  assert.equal(res.staking, null);
  assert.equal(res.reasons.staking, 'http');
  assert.equal(res.reasons.network, null);
  assert.equal(res.epochDetail.epoch, 27);
});

test('readAntseedStats skips the epoch detail when it is already seen', async () => {
  const res = await readAntseedStats({
    prevMaxCompletedEpoch: 27,
    timeoutMs: 1000,
    fetchImpl: routeFetch({
      '/network/summary': summaryJson(),
      '/ants/supply': { data: { burns: [] } },
      '/epochs': { data: { epochs: [{ epoch: 27, status: 'complete' }] } },
      '/staking/pools': { data: {} },
    }),
  });
  assert.equal(res.epochDetail, null);
  assert.equal(res.reasons.epochDetail, 'skipped');
});
