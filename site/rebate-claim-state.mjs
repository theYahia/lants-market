// Pure state machine of a rebate campaign for the claim UI and the stowatch.
// No DOM, no network, no wallet: inputs are the offer epoch times, the decoded
// on-chain campaign (or null) and the published tree (or null), all in seconds.
//
// States (plan §5, §8):
//   awaiting_launch      no campaign, before the epoch starts -> Launch & fund
//   not_funded_expired   no campaign, the epoch already started -> gone
//   funded               campaign, not finalized, before cancelDeadline -> cancel/transfer
//   awaiting_finalize    campaign, not finalized, inside (cancelDeadline, finalizeDeadline]
//   no_eligible_buyers   not finalized, not finalized in time, no tree -> sweep
//   not_finalized_expired not finalized after finalizeDeadline -> sweep
//   no_tree              finalized but the payout file is missing -> claims hidden
//   root_mismatch        on-chain root != published tree root -> claims hidden
//   claims_open          finalized, root matches, inside the claim window
//   sweepable            finalized, claim window over -> seller withdraws the rest
//
// Canonical campaign (F1): the contract has no owner, so anyone can create a
// campaign for any (epoch, pool). The UI shows only the campaign whose owner is
// provably the payer's — the payer itself or the campaign wallet named in the
// payer's authorization (verified at publication, re-checked by the CI guard) —
// and only when its deadline bindings match the offer's epoch-derived params.

import { campaignParams } from './rebate-campaign.mjs';

export const OBJECTIONS_HOURS = 48;

export function claimState({ now, epochStart, epochEnd, campaign, tree }) {
  const t = Number(now);
  const objectionsEnd = Number(epochEnd) + OBJECTIONS_HOURS * 3600;
  const base = { actions: {} };

  if (!campaign) {
    const state = t < Number(epochStart) ? 'awaiting_launch' : 'not_funded_expired';
    return { ...base, state, actions: state === 'awaiting_launch' ? { launch: true } : {} };
  }

  const funded = BigInt(campaign.funded);
  const claimed = BigInt(campaign.claimed);
  const total = BigInt(campaign.total);
  const rootSet = BigInt(campaign.root) !== 0n;
  const treeRoot = tree ? String(tree.root).toLowerCase() : null;
  const rootMatches = rootSet && treeRoot !== null && String(campaign.root).toLowerCase() === treeRoot;

  const info = {
    funded: String(funded),
    claimed: String(claimed),
    total: String(total),
    remaining: String(funded - claimed),
    cancelDeadline: String(campaign.cancelDeadline),
    finalizeDeadline: String(campaign.finalizeDeadline),
    sweepAfter: String(campaign.sweepAfter),
    root: campaign.root,
    owner: campaign.owner,
    pendingOwner: campaign.pendingOwner,
    epochId: String(campaign.epochId),
    poolId: campaign.poolId,
    objectionsEnd: String(objectionsEnd)
  };

  if (!rootSet) {
    if (t < Number(campaign.cancelDeadline)) {
      return {
        ...base,
        state: 'funded',
        info,
        actions: { cancel: true, transfer: true }
      };
    }
    if (t <= Number(campaign.finalizeDeadline)) {
      return {
        ...base,
        state: 'awaiting_finalize',
        info,
        actions: {
          transfer: true,
          finalize: tree !== null && t >= objectionsEnd
        }
      };
    }
    return {
      ...base,
      state: tree ? 'not_finalized_expired' : 'no_eligible_buyers',
      info,
      actions: { sweep: true }
    };
  }

  if (tree === null) {
    return { ...base, state: 'no_tree', info, actions: {} };
  }
  if (!rootMatches) {
    return { ...base, state: 'root_mismatch', info, actions: {} };
  }
  if (t > Number(campaign.sweepAfter)) {
    return { ...base, state: 'sweepable', info, actions: { sweep: true } };
  }
  return { ...base, state: 'claims_open', info, actions: { claim: true } };
}

export function statusText(state, info) {
  const usd = (micro) => '$' + (Number(micro) / 1e6).toFixed(2);
  const date = (sec) => new Date(Number(sec) * 1000).toISOString().slice(0, 10);
  switch (state) {
    case 'awaiting_launch':
      return 'awaiting launch — the seller funds the campaign before the epoch';
    case 'not_funded_expired':
      return 'not funded — expired';
    case 'funded':
      return `funded ${usd(info.funded)}${info.total !== '0' ? ' of ' + usd(info.total) : ''} · the seller can cancel until ${date(info.cancelDeadline)}`;
    case 'awaiting_finalize':
      return `awaiting finalize · the seller can finalize until ${date(info.finalizeDeadline)} after the objections window ends ${date(info.objectionsEnd)}`;
    case 'no_eligible_buyers':
      return 'no eligible buyers — the seller can withdraw the cap';
    case 'not_finalized_expired':
      return 'not finalized — the seller can withdraw the cap';
    case 'no_tree':
      return 'finalized, but the payout file is not published — do not claim';
    case 'root_mismatch':
      return 'root mismatch — the on-chain root differs from the published tree, claim disabled';
    case 'claims_open':
      return `claims open · claim by ${date(info.sweepAfter)}`;
    case 'sweepable':
      return `claim window closed · the seller can withdraw the unclaimed ${usd(info.remaining)}`;
    default:
      return state;
  }
}

// The payer's authorization names the campaign wallet for this offer; its
// signature was checked in full at publication (rebate-authorize.mjs) and is
// re-checked by the CI guard, so here the bindings to the offer must hold.
function authorizationMatches(a, offer, expect) {
  return Boolean(
    a &&
    a.signature &&
    String(a.payer).toLowerCase() === String(offer.payer).toLowerCase() &&
    Number(a.epochId) === expect.epochId &&
    String(a.poolId) === expect.poolId &&
    Number(a.cancelDeadline) === expect.cancelDeadline &&
    Number(a.finalizeDeadline) === expect.finalizeDeadline &&
    Number(a.claimWindow) === expect.claimWindow
  );
}

// True when `campaign` is the offer's canonical campaign: owner is the payer or
// the wallet from its authorization, and the epoch/pool/deadlines equal the
// offer's epoch-derived campaignParams. Anything else on the same (epoch, pool)
// is a squatter and is ignored.
export function isCanonicalCampaign(campaign, offer, authorization) {
  if (!campaign) return false;
  let expect;
  try {
    expect = campaignParams(offer, Number(offer.epochs[0]));
  } catch {
    return false;
  }
  if (Number(campaign.epochId) !== expect.epochId || String(campaign.poolId) !== expect.poolId) return false;
  if (
    Number(campaign.cancelDeadline) !== expect.cancelDeadline ||
    Number(campaign.finalizeDeadline) !== expect.finalizeDeadline ||
    Number(campaign.claimWindow) !== expect.claimWindow
  ) {
    return false;
  }
  const owner = String(campaign.owner).toLowerCase();
  if (owner === String(offer.payer).toLowerCase()) return true;
  return authorizationMatches(authorization, offer, expect) && owner === String(authorization.campaignWallet).toLowerCase();
}

// First candidate by id whose decoded campaign passes isCanonicalCampaign;
// null when no candidate qualifies (or its data is missing).
export function pickCanonical(candidates, campaignsById, offer, authorization) {
  const sorted = [...(candidates || [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const c of sorted) {
    const campaign = campaignsById[String(c.id)];
    if (isCanonicalCampaign(campaign, offer, authorization)) return c.id;
  }
  return null;
}
