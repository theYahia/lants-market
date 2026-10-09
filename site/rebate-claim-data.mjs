// Data loading for the rebate claim panel: offers.json, the published
// rebates/<epoch>-<pool>.* files and the offer's canonical campaign — the one
// whose owner is provably the payer's (campaign.json campaignId first, else
// the CampaignCreated scan). Foreign campaigns on the same (epoch, pool) are
// ignored. Split out of rebate-claim.mjs to keep both files small.

import { decodeCampaign, encCampaignData } from './rebate-claims-abi.mjs';
import { ethCall, findCampaigns } from './rebate-claim-chain.mjs';
import { isCanonicalCampaign, pickCanonical } from './rebate-claim-state.mjs';

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

export async function offerData(offer, config) {
  const epoch = offer.epochs[0];
  const base = `${epoch}-${offer.pool}`;
  const [params, tree, campaignFile] = await Promise.all([
    loadRebateFile(`${base}.campaign-params.json`),
    loadRebateFile(`${base}.tree.json`),
    loadRebateFile(`${base}.campaign.json`)
  ]);
  const authorization = (campaignFile && campaignFile.payerAuthorization) || null;
  const fileId =
    campaignFile && campaignFile.campaignId !== undefined && campaignFile.campaignId !== null
      ? BigInt(campaignFile.campaignId)
      : null;
  let campaignId = null;
  let campaign = null;
  let warn = null;
  if (config) {
    if (fileId !== null) {
      const decoded = decodeCampaign(await ethCall(config.address, encCampaignData(fileId)));
      if (isCanonicalCampaign(decoded, offer, authorization)) {
        campaignId = fileId;
        campaign = decoded;
      } else {
        warn = `campaign ${fileId} from campaign.json is not the payer's campaign — ignored`;
      }
    }
    if (campaignId === null) {
      const candidates = await findCampaigns({
        address: config.address,
        deployBlock: config.deployBlock,
        epochId: epoch,
        poolId: offer.pool
      });
      const campaignsById = {};
      for (const c of candidates) {
        if (fileId !== null && c.id === fileId) continue; // checked (and rejected) above
        campaignsById[String(c.id)] = decodeCampaign(await ethCall(config.address, encCampaignData(c.id)));
      }
      const picked = pickCanonical(candidates, campaignsById, offer, authorization);
      if (picked !== null) {
        campaignId = picked;
        campaign = campaignsById[String(picked)];
      }
    }
  }
  return { epoch, base, params, tree, campaignFile, campaignId, campaign, warn };
}
