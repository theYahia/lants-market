// Wallet and DOM helpers for the rebate claim panel, plus the campaign action
// buttons (Launch & fund, Finalize, Cancel, Withdraw unclaimed, Transfer
// ownership, Accept ownership, Claim, Claim for address, Sign payer
// authorization). Split out of rebate-claim.mjs to keep both files small.

import {
  SEL,
  encClaimData,
  encCreateCampaignData,
  encSetMerkleRootData,
  encIdData,
  encTransferOwnershipData
} from './rebate-claims-abi.mjs';
import { campaignParams, authorizationTypedData } from './rebate-campaign.mjs';
import { simulate, USDC } from './rebate-claim-chain.mjs';
import { walletRequest, ensureChain, waitReceipt, humanError, ensurePrivy } from './market-view.mjs';

const APPROVE = '0x095ea7b3';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- wallet helpers ---
export async function currentAccount(connect) {
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

export function setMsg(el, text, isError = false) {
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

// --- DOM helpers ---
export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function button(parent, label, onClick, msgEl) {
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

function leafFor(tree, account) {
  const a = String(account).toLowerCase();
  for (const l of (tree && tree.leaves) || []) {
    if (String(l.account).toLowerCase() === a) return l;
  }
  return null;
}

// Renders the action buttons of one offer block. `actions` comes from the
// claim state machine (already gated on the published params); `campaign` is
// the displayed campaign or null.
export function renderActions(block, { offer, epoch, params, tree, campaignId, campaign, config, account, msg, actions }) {
  const owner = account && campaign && campaign.owner.toLowerCase() === account;
  const pending = account && campaign && campaign.pendingOwner.toLowerCase() === account;

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
}
