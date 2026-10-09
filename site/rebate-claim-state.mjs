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
