import test from 'node:test';
import assert from 'node:assert/strict';
import {
  campaignParams,
  authorizationTypedData,
  CAMPAIGN_AUTHORIZATION_TYPE,
  CLAIM_WINDOW_DAYS
} from './rebate-campaign.mjs';

const PAYER = '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B';
const WALLET = '0x1199887766554433221100998877665544332211';

const offer = {
  type: 'rebate',
  pool: '52894',
  epochs: [27],
  pctBps: 300,
  capUsdc: 20,
  capPerBuyerUsdc: 2,
  stakeGate: { minStakeAnts: 100 },
  payer: PAYER
};

const sec = (iso) => Math.floor(Date.parse(iso) / 1000);

test('campaignParams: deadlines from epoch 27 boundaries, 48h+24h finalize buffer', () => {
  const p = campaignParams(offer, 27);
  assert.equal(p.cancelDeadline, sec('2026-10-15T09:54:21Z'), 'cancel = start of epoch 27');
  assert.equal(p.finalizeDeadline, sec('2026-10-22T09:54:21Z') + 72 * 3600, 'finalize = epoch end + 72h');
  assert.equal(p.claimWindow, 14 * 24 * 3600);
  assert.equal(p.claimWindowDays, CLAIM_WINDOW_DAYS);
  assert.equal(p.chainId, 8453);
  assert.equal(p.epochId, 27);
  assert.equal(p.poolId, '52894');
  assert.equal(p.amountMicro, '20000000');
  assert.equal(p.amountUsdc, 20);
  assert.equal(p.payer, PAYER);
  assert.equal(p.authorizationType, CAMPAIGN_AUTHORIZATION_TYPE);
});

test('campaignParams: contract bounds hold (finalize <= cancel + 30d, window >= 7d)', () => {
  const p = campaignParams(offer, 27);
  assert.ok(p.finalizeDeadline > p.cancelDeadline);
  assert.ok(p.finalizeDeadline <= p.cancelDeadline + 30 * 24 * 3600);
  assert.ok(p.claimWindow >= 7 * 24 * 3600);
});

test('campaignParams: an offer for another epoch or a malformed offer throws', () => {
  assert.throws(() => campaignParams(offer, 26), /epoch/);
  assert.throws(() => campaignParams({ ...offer, pctBps: 0 }, 27), /valid rebate offer/);
});

test('authorizationTypedData: EIP-712 shape binds the payer signature to one campaign wallet', () => {
  const p = campaignParams(offer, 27);
  const td = authorizationTypedData({ claimsAddress: '0x1111111111111111111111111111111111111111', params: p, campaignWallet: WALLET });
  assert.equal(td.primaryType, CAMPAIGN_AUTHORIZATION_TYPE);
  assert.equal(td.domain.name, 'lants.eth');
  assert.equal(td.domain.chainId, 8453);
  assert.equal(td.domain.verifyingContract, '0x1111111111111111111111111111111111111111');
  assert.deepEqual(
    td.types.RebateCampaignAuthorization.map((f) => f.name),
    ['chainId', 'epochId', 'poolId', 'campaignWallet', 'cancelDeadline', 'finalizeDeadline', 'claimWindow']
  );
  assert.deepEqual(td.message, {
    chainId: 8453,
    epochId: 27,
    poolId: '52894',
    campaignWallet: WALLET,
    cancelDeadline: p.cancelDeadline,
    finalizeDeadline: p.finalizeDeadline,
    claimWindow: p.claimWindow
  });
});
