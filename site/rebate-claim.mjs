// Rebate claim panel for the Incentives section. Per rebate offer it shows the
// campaign status and the seller/buyer actions (Launch & fund, Finalize,
// Transfer ownership, Claim, Claim for address, Withdraw unclaimed, Cancel).
//
// Trust model before any signature (plan §8): the contract address comes only
// from rebate-claims.json (published in dist), its runtime code hash is
// re-read from chain and compared, USDC() must be the canonical token, the
// campaign epoch/pool/deadlines are compared against the published files, the
// published merkle tree is re-verified locally (keccak of every leaf + proof
// must reproduce its root), and the on-chain root must equal the tree root.
// The payer EIP-712 authorization is verified at publication time (no
// secp256k1 in this site) and re-checked here for its bindings only.

import { validRebate } from './rebate.mjs';
import { epochBoundary } from './epochs.mjs';
import {
  SEL,
  encClaimData,
  encCreateCampaignData,
  encSetMerkleRootData,
  encIdData,
  encTransferOwnershipData,
  encCampaignData,
  decodeCampaign
} from './rebate-claims-abi.mjs';
import { claimState, statusText } from './rebate-claim-state.mjs';
import { campaignParams, authorizationTypedData } from './rebate-campaign.mjs';
import { keccakConcat } from './keccak.mjs';
import { loadClaimsConfig, ethCall, findCampaignId, simulate, USDC } from './rebate-claim-chain.mjs';
import { walletRequest, ensureChain, waitReceipt, humanError, ensurePrivy } from './market-view.mjs';

const OFFERS_URLS = [
  'https://raw.githubusercontent.com/theYahia/lants-market/main/site/offers.json',
  './offers.json'
];
const APPROVE = '0x095ea7b3';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadJson(urls) {
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

function leafFor(tree, account) {
  const a = String(account).toLowerCase();
  for (const l of (tree && tree.leaves) || []) {
    if (String(l.account).toLowerCase() === a) return l;
  }
  return null;
}

// --- wallet helpers ---
async function currentAccount(connect) {
  const get = async () => {
    try {
      const a = await walletRequest({ method: 'eth_accounts' });
      return a && a[0] ? String(a[0]).toLowerCase() : null;
    } catch {
      return null;
    }
  };
  let acc = await get();
  if (!acc && connect) {
    try {
      await ensurePrivy();
    } catch {
      // modal may already be open
    }
    for (let i = 0; i < 20 && !acc; i++) {
      await sleep(300);
      acc = await get();
    }
  }
  return acc;
}

function setMsg(el, text, isError = false) {
  el.textContent = text;
  el.style.color = isError ? '#ff6b6b' : 'inherit';
}

async function sendTx(to, data, msgEl) {
  const acc = await currentAccount(true);
  if (!acc) throw new Error('connect a wallet first');
  await ensureChain();
  const tx = await walletRequest({ method: 'eth_sendTransaction', params: [{ from: acc, to, data }] });
  setMsg(msgEl, 'tx ' + tx);
  const rcpt = await waitReceipt(tx);
  if (!rcpt || rcpt.status !== '0x1') throw new Error('transaction reverted: ' + tx);
  setMsg(msgEl, 'confirmed ' + tx);
  return tx;
}

// Publication-time verified payer authorization, re-checked for its bindings.
function payerLink(offer, campaign, campaignFile) {
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

async function offerData(offer, config) {
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

// --- rendering ---
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(parent, label, onClick, msgEl) {
  const b = el('button', 'inc-claim-btn', label);
  b.type = 'button';
  b.style.marginRight = '6px';
  b.addEventListener('click', async () => {
    b.disabled = true;
    setMsg(msgEl, '...');
    try {
      await onClick();
    } catch (e) {
      setMsg(msgEl, humanError(e), true);
    } finally {
      b.disabled = false;
    }
  });
  parent.appendChild(b);
  return b;
}

async function renderOffer(block, offer, config, account) {
  const { epoch, params, tree, campaignFile, campaignId, campaign } = await offerData(offer, config);
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
  if (campaign && config && payerLink(offer, campaign, campaignFile) === 'none') {
    block.appendChild(el('div', 'inc-claim-warn', 'campaign not verified with the payer'));
  }

  const owner = account && campaign && campaign.owner.toLowerCase() === account;
  const pending = account && campaign && campaign.pendingOwner.toLowerCase() === account;
  const actions = state.actions;
  if (!paramsOk) {
    actions.launch = false;
    actions.finalize = false;
  }

  if (actions.launch && params && config) {
    button(
      block,
      'Launch & fund',
      async () => {
        await currentAccount(true);
        const amount = BigInt(params.amountMicro);
        await sendTx(USDC, APPROVE + config.address.replace(/^0x/, '').padStart(64, '0') + amount.toString(16).padStart(64, '0'), msg);
        await sendTx(
          config.address,
          encCreateCampaignData({
            cancelDeadline: params.cancelDeadline,
            finalizeDeadline: params.finalizeDeadline,
            claimWindow: params.claimWindow,
            epochId: params.epochId,
            poolId: params.poolId,
            amount
          }),
          msg
        );
      },
      msg
    );
  }
  if (actions.finalize && owner && campaignId !== null && tree && config) {
    button(
      block,
      'Finalize',
      async () => {
        if (BigInt(campaign.funded) < BigInt(tree.total)) throw new Error('underfunded: funded < tree total');
        await simulate(account, config.address, encSetMerkleRootData(campaignId, tree.root, BigInt(tree.total)));
        await sendTx(config.address, encSetMerkleRootData(campaignId, tree.root, BigInt(tree.total)), msg);
      },
      msg
    );
  }
  if (actions.cancel && owner && campaignId !== null && config) {
    button(block, 'Cancel', () => sendTx(config.address, encIdData(SEL.cancel, campaignId), msg), msg);
  }
  if (actions.sweep && owner && campaignId !== null && config) {
    button(block, 'Withdraw unclaimed', () => sendTx(config.address, encIdData(SEL.sweep, campaignId), msg), msg);
  }
  if ((actions.transfer || actions.cancel || actions.finalize) && owner && campaignId !== null && config) {
    const input = el('input', 'inc-claim-input');
    input.placeholder = 'new owner 0x...';
    input.style.marginRight = '6px';
    block.appendChild(input);
    button(
      block,
      'Transfer ownership',
      async () => {
        if (!/^0x[0-9a-fA-F]{40}$/.test(input.value.trim())) throw new Error('enter a valid address');
        await sendTx(config.address, encTransferOwnershipData(campaignId, input.value.trim()), msg);
      },
      msg
    );
  }
  if (pending && campaignId !== null && config) {
    button(block, 'Accept ownership', () => sendTx(config.address, encIdData(SEL.acceptOwnership, campaignId), msg), msg);
  }
  if (actions.claim && campaignId !== null && tree && config) {
    const mine = account ? leafFor(tree, account) : null;
    button(
      block,
      mine ? `Claim $${(Number(mine.amount) / 1e6).toFixed(2)}` : 'Claim',
      async () => {
        const acc = await currentAccount(true);
        const leaf = leafFor(tree, acc);
        if (!leaf) throw new Error('your address is not in this payout tree');
        const data = encClaimData({ id: campaignId, index: leaf.index, account: leaf.account, amount: leaf.amount, proof: leaf.proof });
        await simulate(acc, config.address, data);
        await sendTx(config.address, data, msg);
      },
      msg
    );
    const input = el('input', 'inc-claim-input');
    input.placeholder = 'claim for address 0x...';
    input.style.marginRight = '6px';
    block.appendChild(input);
    button(
      block,
      'Claim for address',
      async () => {
        const acc = await currentAccount(true);
        const addr = input.value.trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) throw new Error('enter a valid address');
        const leaf = leafFor(tree, addr);
        if (!leaf) throw new Error('that address is not in this payout tree');
        const data = encClaimData({ id: campaignId, index: leaf.index, account: leaf.account, amount: leaf.amount, proof: leaf.proof });
        await simulate(acc, config.address, data);
        await sendTx(config.address, data, msg);
      },
      msg
    );
  }
  if (actions.launch && params && config && account && account === offer.payer.toLowerCase()) {
    const input = el('input', 'inc-claim-input');
    input.placeholder = 'campaign wallet 0x...';
    input.style.marginRight = '6px';
    block.appendChild(input);
    button(
      block,
      'Sign payer authorization',
      async () => {
        const wallet = input.value.trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) throw new Error('enter a valid campaign wallet');
        const td = authorizationTypedData({ claimsAddress: config.address, params: campaignParams(offer, epoch), campaignWallet: wallet });
        const signature = await walletRequest({ method: 'eth_signTypedData_v4', params: [account, JSON.stringify(td)] });
        setMsg(msg, JSON.stringify({
          payer: offer.payer,
          campaignWallet: wallet,
          epochId: epoch,
          poolId: offer.pool,
          cancelDeadline: params.cancelDeadline,
          finalizeDeadline: params.finalizeDeadline,
          claimWindow: params.claimWindow,
          signature,
          signatureVerified: false
        }));
      },
      msg
    );
  }
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
