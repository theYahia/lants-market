// Data loading for the rebate claim panel: offers.json, the published
// rebates/<epoch>-<pool>.* files, the offer's campaign (from campaign.json or
// the CampaignCreated scan) and the payer-authorization bindings. Split out of
// rebate-claim.mjs to keep both files small.

import { decodeCampaign, encCampaignData } from './rebate-claims-abi.mjs';
import { ethCall, findCampaignId } from './rebate-claim-chain.mjs';

export const OFFERS_URLS = [
  'https://raw.githubusercontent.com/theYahia/lants-market/main/site/offers.json',
  './offers.json'
];

export async function loadJson(urls) {
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch {
      // try next
    }
  }
  return null;
}

async function loadRebateFile(name) {
  try {
    const r = await fetch('./rebates/' + name, { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch {
    // missing is fine
  }
  return null;
}

// Publication-time verified payer authorization, re-checked for its bindings.
export function payerLink(offer, campaign, campaignFile) {
  if (!campaign) return 'none';
  const owner = campaign.owner.toLowerCase();
  if (owner === offer.payer.toLowerCase()) return 'owner';
  const a = campaignFile && campaignFile.payerAuthorization;
  if (
    a &&
    a.signature &&
    a.signatureVerified === true &&
    String(a.payer).toLowerCase() === offer.payer.toLowerCase() &&
    String(a.campaignWallet).toLowerCase() === owner &&
    Number(a.epochId) === offer.epochs[0] &&
    String(a.poolId) === String(offer.pool) &&
    Number(a.cancelDeadline) === Number(campaign.cancelDeadline) &&
    Number(a.finalizeDeadline) === Number(campaign.finalizeDeadline) &&
    Number(a.claimWindow) === Number(campaign.claimWindow)
  ) {
    return 'authorization';
  }
  return 'none';
}

export async function offerData(offer, config) {
  const epoch = offer.epochs[0];
  const base = `${epoch}-${offer.pool}`;
  const [params, tree, campaignFile] = await Promise.all([
    loadRebateFile(`${base}.campaign-params.json`),
    loadRebateFile(`${base}.tree.json`),
    loadRebateFile(`${base}.campaign.json`)
  ]);
  let campaignId = campaignFile && campaignFile.campaignId !== undefined ? BigInt(campaignFile.campaignId) : null;
  let campaign = null;
  if (config) {
    if (campaignId === null) {
      const found = await findCampaignId({
        address: config.address,
        deployBlock: config.deployBlock,
        epochId: epoch,
        poolId: offer.pool
      });
      if (found) campaignId = found.id;
    }
    if (campaignId !== null) {
      campaign = decodeCampaign(await ethCall(config.address, encCampaignData(campaignId)));
    }
  }
  return { epoch, base, params, tree, campaignFile, campaignId, campaign };
}
