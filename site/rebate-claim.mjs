// Rebate claim panel for the Incentives section. Per rebate offer it shows the
// campaign status and the seller/buyer actions (rendered by
// rebate-claim-actions.mjs from the data loaded by rebate-claim-data.mjs).
//
// Trust model before any signature (plan §8): the contract address comes only
// from rebate-claims.json (published in dist), its runtime code hash is
// re-read from chain and compared, USDC() must be the canonical token, the
// campaign epoch/pool/deadlines are compared against the published files, the
// published merkle tree is re-verified locally (keccak of every leaf + proof
// must reproduce its root), and the on-chain root must equal the tree root.
// The payer EIP-712 authorization is verified by the publish CLI
// (site/rebate-authorize.mjs) and re-verified by the CI guard
// (scripts/site/check_authorizations.mjs); this browser panel (no secp256k1
// here) checks only its bindings.

import { validRebate } from './rebate.mjs';
import { epochBoundary } from './epochs.mjs';
import { claimState, statusText } from './rebate-claim-state.mjs';
import { campaignParams } from './rebate-campaign.mjs';
import { keccakConcat } from './keccak.mjs';
import { loadClaimsConfig } from './rebate-claim-chain.mjs';
import { humanError } from './market-view.mjs';
import { el, button, currentAccount, renderActions } from './rebate-claim-actions.mjs';
import { OFFERS_URLS, loadJson, offerData } from './rebate-claim-data.mjs';

// --- merkle proof verification (same convention as site/rebate-tree.mjs) ---
const word = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');

export function leafHash(index, account, amount) {
  return keccakConcat([word(index), account, word(amount)]);
}

export function rootFromProof(leaf, proof) {
  let h = leaf.toLowerCase();
  for (const p of proof || []) {
    const peer = String(p).toLowerCase();
    h = h < peer ? keccakConcat([h, peer]) : keccakConcat([peer, h]);
  }
  return h;
}

export function verifyTree(tree) {
  const root = String(tree.root).toLowerCase();
  if (!Array.isArray(tree.leaves) || tree.leaves.length === 0) return false;
  for (const l of tree.leaves) {
    if (rootFromProof(leafHash(l.index, l.account, l.amount), l.proof) !== root) return false;
  }
  return true;
}

async function renderOffer(block, offer, config, account) {
  const { epoch, params, tree, campaignId, campaign, warn } = await offerData(offer, config);
  const head = el('div', 'inc-claim-head', `Rebate · pool ${offer.pool} · epoch ${epoch}`);
  block.appendChild(head);

  const start = epochBoundary(epoch).getTime() / 1000;
  const end = epochBoundary(epoch + 1).getTime() / 1000;
  const state = claimState({ now: Math.floor(Date.now() / 1000), epochStart: start, epochEnd: end, campaign, tree });
  const status = el('div', 'inc-claim-status', statusText(state.state, state.info || {}));
  block.appendChild(status);

  const msg = el('span', 'inc-claim-msg', '');
  msg.style.marginLeft = '6px';

  if (tree && !verifyTree(tree)) {
    block.appendChild(el('div', 'inc-claim-warn', 'published tree failed local verification — do not claim'));
    return;
  }
  if (warn) {
    block.appendChild(el('div', 'inc-claim-warn', warn));
  }
  // The published campaign params must match the offer and the epoch; a
  // mismatch disables every launch/finalize action.
  let paramsOk = true;
  if (params) {
    try {
      const expect = campaignParams(offer, epoch);
      paramsOk =
        Number(params.cancelDeadline) === expect.cancelDeadline &&
        Number(params.finalizeDeadline) === expect.finalizeDeadline &&
        Number(params.claimWindow) === expect.claimWindow &&
        Number(params.epochId) === expect.epochId &&
        String(params.poolId) === expect.poolId &&
        String(params.amountMicro) === expect.amountMicro &&
        String(params.payer).toLowerCase() === String(expect.payer).toLowerCase();
    } catch {
      paramsOk = false;
    }
    if (!paramsOk) {
      block.appendChild(el('div', 'inc-claim-warn', 'campaign params mismatch — do not launch or finalize'));
    }
  }
  if (campaign && (Number(campaign.epochId) !== epoch || String(campaign.poolId) !== String(offer.pool))) {
    block.appendChild(el('div', 'inc-claim-warn', 'campaign params mismatch — claim disabled'));
    block.appendChild(msg);
    return;
  }

  const actions = state.actions;
  if (!paramsOk) {
    actions.launch = false;
    actions.finalize = false;
  }
  renderActions(block, { offer, epoch, params, tree, campaignId, campaign, config, account, msg, actions });
  block.appendChild(msg);
}

let claimsConfig;
async function render(host) {
  const offers = await loadJson(OFFERS_URLS);
  const rebates = (Array.isArray(offers) ? offers : []).filter(validRebate);
  const old = host.querySelector('.inc-claims');
  if (old) old.remove();
  if (rebates.length === 0) return;

  if (claimsConfig === undefined) {
    try {
      claimsConfig = await loadClaimsConfig();
    } catch (e) {
      claimsConfig = null;
      console.error('rebate-claim:', e);
    }
  }
  const account = await currentAccount(false);

  const panel = el('div', 'inc-claims');
  panel.appendChild(el('h3', 'inc-claims-title', 'Rebate claims'));
  if (!claimsConfig) {
    panel.appendChild(el('div', 'inc-claim-status', 'the claims contract is not published yet'));
  }
  for (const offer of rebates.sort((a, b) => b.epochs[0] - a.epochs[0])) {
    const block = el('div', 'inc-claim');
    try {
      await renderOffer(block, offer, claimsConfig, account);
    } catch (e) {
      block.appendChild(el('div', 'inc-claim-warn', humanError(e)));
    }
    panel.appendChild(block);
  }
  const refresh = button(panel, 'Refresh', () => render(host), el('span', 'inc-claim-msg', ''));
  refresh.style.marginTop = '6px';
  host.appendChild(panel);
}

// Mount once the Incentives section has rendered its offers list.
function mount() {
  const host = document.getElementById('incentives');
  if (!host || !host.querySelector('.inc-offers')) {
    setTimeout(mount, 1000);
    return;
  }
  render(host).catch((e) => console.error('rebate-claim:', e));
}

if (typeof document !== 'undefined') mount();
