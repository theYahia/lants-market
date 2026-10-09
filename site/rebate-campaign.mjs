// Campaign parameters for a rebate offer: pure module (Node + browser, no keys)
// shared by the operator CLI and the site's "Launch & fund" button. Reads the
// offer and epochBoundary(N); nothing here touches a wallet.
//
// Lifecycle (plan §5): cancelDeadline = start of epoch N; finalizeDeadline =
// end of epoch N + 48h objections + 24h buffer; claim window = 14 days.
//
// EIP-712 authorization: the single signature of the offer.payer address that
// authorizes a dedicated campaign wallet to run the campaign. The contract does
// not verify it (the payer's on-chain consent is setMerkleRoot); the site and
// rebate-claims.json consumers do.

import { validRebate } from './rebate.mjs';
import { epochBoundary } from './epochs.mjs';

export const CAMPAIGN_AUTHORIZATION_TYPE = 'RebateCampaignAuthorization';
export const CHAIN_ID = 8453;
export const CLAIM_WINDOW_DAYS = 14;
export const OBJECTIONS_HOURS = 48;
export const FINALIZE_BUFFER_HOURS = 24;

export function campaignParams(offer, epoch) {
  if (!validRebate(offer)) throw new Error('rebate-campaign: not a valid rebate offer');
  if (Number(offer.epochs[0]) !== Number(epoch)) {
    throw new Error(`rebate-campaign: offer is for epoch ${offer.epochs[0]}, not ${epoch}`);
  }
  const cancelDeadline = Math.floor(epochBoundary(epoch).getTime() / 1000);
  const finalizeDeadline =
    Math.floor(epochBoundary(Number(epoch) + 1).getTime() / 1000) +
    (OBJECTIONS_HOURS + FINALIZE_BUFFER_HOURS) * 3600;
  const claimWindow = CLAIM_WINDOW_DAYS * 24 * 3600;
  // Contract sanity (RebateClaims.createCampaignAndFund).
  if (finalizeDeadline <= cancelDeadline || finalizeDeadline > cancelDeadline + 30 * 24 * 3600) {
    throw new Error('rebate-campaign: finalize deadline outside the contract bounds');
  }
  if (claimWindow < 7 * 24 * 3600) {
    throw new Error('rebate-campaign: claim window below the contract minimum');
  }
  return {
    chainId: CHAIN_ID,
    epochId: Number(epoch),
    poolId: String(offer.pool),
    amountMicro: String(Math.round(offer.capUsdc * 1e6)),
    amountUsdc: offer.capUsdc,
    payer: offer.payer,
    cancelDeadline,
    finalizeDeadline,
    claimWindow,
    claimWindowDays: CLAIM_WINDOW_DAYS,
    authorizationType: CAMPAIGN_AUTHORIZATION_TYPE
  };
}

// EIP-712 typed data for the payer's one signature. `params` comes from
// campaignParams(); `campaignWallet` is the wallet that will create the campaign.
export function authorizationTypedData({ claimsAddress, params, campaignWallet, chainId = CHAIN_ID }) {
  return {
    domain: {
      name: 'lants.eth',
      version: '1',
      chainId,
      verifyingContract: claimsAddress
    },
    types: {
      RebateCampaignAuthorization: [
        { name: 'chainId', type: 'uint256' },
        { name: 'epochId', type: 'uint256' },
        { name: 'poolId', type: 'string' },
        { name: 'campaignWallet', type: 'address' },
        { name: 'cancelDeadline', type: 'uint256' },
        { name: 'finalizeDeadline', type: 'uint256' },
        { name: 'claimWindow', type: 'uint256' }
      ]
    },
    primaryType: CAMPAIGN_AUTHORIZATION_TYPE,
    message: {
      chainId,
      epochId: params.epochId,
      poolId: params.poolId,
      campaignWallet,
      cancelDeadline: params.cancelDeadline,
      finalizeDeadline: params.finalizeDeadline,
      claimWindow: params.claimWindow
    }
  };
}

// CLI (Node only; the module itself is browser-safe):
// node site/rebate-campaign.mjs --offer file --epoch N [--out dir]
// Writes <out>/<epoch>-<pool>.campaign-params.json; an existing file is kept.
let isEntry = false;
if (typeof process !== 'undefined' && Array.isArray(process.argv) && process.argv[1]) {
  const { pathToFileURL } = await import('node:url');
  isEntry = import.meta.url === pathToFileURL(process.argv[1]).href;
}
if (isEntry) {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--offer') opts.offer = args[++i];
    else if (args[i] === '--epoch') opts.epoch = Number(args[++i]);
    else if (args[i] === '--out') opts.out = args[++i];
    else {
      console.error('rebate-campaign: unknown argument ' + args[i]);
      process.exit(2);
    }
  }
  if (!opts.offer || !Number.isInteger(opts.epoch)) {
    console.error('usage: node site/rebate-campaign.mjs --offer file --epoch N [--out dir]');
    process.exit(2);
  }
  const fs = await import('node:fs');
  const path = await import('node:path');
  const offer = JSON.parse(fs.readFileSync(opts.offer, 'utf-8'));
  const params = campaignParams(offer, opts.epoch);
  const outDir = path.resolve(opts.out || 'rebates');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${opts.epoch}-${params.poolId}.campaign-params.json`);
  if (fs.existsSync(file)) {
    console.error('rebate-campaign: file already exists: ' + file);
    process.exit(1);
  }
  fs.writeFileSync(file, JSON.stringify(params, null, 2) + '\n', { flag: 'wx' });
  console.log(file);
}
