// Buy a Seaport order from our UI: fetch the raw order, validate it, verify it
// on-chain, simulate, then fulfillBasicOrder with an exact USDC approval.
// Mirrors market-buy.mjs; wallet access goes through market-view helpers.

import {
  MARKET,
  SEL,
  encAddr,
  encUint,
  decodeWords,
  wordToBigInt,
  wordToAddr,
  formatUnits,
} from './market-config.mjs';
import { walletRequest, ensureChain, waitReceipt, loadPublicMarket, humanError } from './market-view.mjs';
import { ethCallTo } from './own-listings.mjs';
import {
  SEAPORT_16,
  encodeFulfillBasicOrder,
  encGetOrderStatus,
  encGetCounter,
  decodeOrderStatus,
} from './seaport-abi.mjs';
import { validateOrder, toBasicOrderParameters } from './seaport-order.mjs';

const ORDER_ORIGIN = 'https://antseedmarkets.com';
const ORDER_TIMEOUT_MS = 8000;

async function fetchOrder(tokenId, timeoutMs = ORDER_TIMEOUT_MS) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (controller) controller.abort();
      reject(new Error('timeout'));
    }, timeoutMs);
  });
  try {
    const res = await Promise.race([
      fetch(`${ORDER_ORIGIN}/api/lants/order/${encodeURIComponent(tokenId)}`, {
        signal: controller ? controller.signal : undefined,
        headers: { accept: 'application/json' },
      }),
      timeout,
    ]);
    if (!res || !res.ok) throw new Error('order endpoint returned ' + (res ? res.status : 'nothing'));
    return await Promise.race([res.json(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readWord(to, data) {
  const raw = await ethCallTo(to, data);
  return wordToBigInt(decodeWords(raw)[0] ?? '0x0');
}

function reporter(statusEl) {
  return (text, isError) => {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('is-error', !!isError);
  };
}

/**
 * @param {Object} input - { tokenId, cardPriceMicro, confirmedPriceMicro, statusEl }
 * @returns {Promise<{ok:boolean, needsConfirm?:boolean, priceMicro?:string, txHash?:string, reason?:string}>}
 */
export async function buySeaportOrder({ tokenId, cardPriceMicro, confirmedPriceMicro, statusEl }) {
  const say = reporter(statusEl);

  try {
    let accounts = [];
    try {
      accounts = await walletRequest({ method: 'eth_accounts' });
    } catch (e) {
      accounts = [];
    }
    if (!accounts || accounts.length === 0) {
      say('connect wallet first', true);
      return { ok: false, reason: 'wallet' };
    }
    const buyer = accounts[0];

    if (!(await ensureChain())) {
      say('wrong network', true);
      return { ok: false, reason: 'chain' };
    }

    const now = Math.floor(Date.now() / 1000);
    say('Loading order...');
    const order = await fetchOrder(tokenId);
    if (Number(order.tokenId) !== Number(tokenId)) {
      say('The order endpoint returned another token.', true);
      return { ok: false, reason: 'token' };
    }

    const expected = { tokenId, now };
    const checked = validateOrder(order, expected);
    if (!checked.ok) {
      say('This order can no longer be filled (' + checked.reason + '). Buy on antseedmarkets.com.', true);
      return { ok: false, reason: checked.reason };
    }

    const total = checked.total;
    const card = cardPriceMicro != null ? BigInt(cardPriceMicro) : null;
    const confirmed = confirmedPriceMicro != null ? BigInt(confirmedPriceMicro) : null;
    if (card !== null && total !== card && total !== confirmed) {
      say('Price changed to ' + formatUnits(total, MARKET.usdcDecimals) + ' USDC — click Buy again to accept.', true);
      return { needsConfirm: true, priceMicro: total.toString(), ok: false };
    }

    say('Checking the order on Base...');
    const owner = wordToAddr(decodeWords(await ethCallTo(MARKET.nft, SEL.ownerOf + encUint(tokenId)))[0]);
    if (owner.toLowerCase() !== checked.offerer) {
      say('The seller no longer owns this position. Buy on antseedmarkets.com.', true);
      return { ok: false, reason: 'owner' };
    }

    const approved = await readWord(
      MARKET.nft,
      SEL.isApprovedForAll + encAddr(checked.offerer) + encAddr(SEAPORT_16)
    );
    if (approved === 0n) {
      say('The seller has not approved Seaport to transfer this position.', true);
      return { ok: false, reason: 'approval' };
    }

    const counter = await readWord(SEAPORT_16, encGetCounter(checked.offerer));
    if (counter !== checked.counter) {
      say('The order was cancelled or replaced (counter changed).', true);
      return { ok: false, reason: 'counter' };
    }

    const status = decodeOrderStatus(
      decodeWords(await ethCallTo(SEAPORT_16, encGetOrderStatus(checked.orderHash)))
    );
    if (status.cancelled || (status.totalSize > 0n && status.totalFilled >= status.totalSize)) {
      say('The order was cancelled or already filled.', true);
      return { ok: false, reason: 'filled' };
    }

    const allowance = await readWord(
      MARKET.usdc,
      SEL.allowance + encAddr(buyer) + encAddr(SEAPORT_16)
    );
    if (allowance < total) {
      say('Approving ' + formatUnits(total, MARKET.usdcDecimals) + ' USDC...');
      const approveData = SEL.approve + encAddr(SEAPORT_16) + encUint(total);
      const approveHash = await walletRequest({
        method: 'eth_sendTransaction',
        params: [{ from: buyer, to: MARKET.usdc, data: approveData }],
      });
      const approveReceipt = await waitReceipt(approveHash);
      if (!approveReceipt || approveReceipt.status !== '0x1') {
        say('The USDC approval failed.', true);
        return { ok: false, reason: 'approve' };
      }
    }

    const data = encodeFulfillBasicOrder(toBasicOrderParameters(order, expected));

    say('Simulating the purchase...');
    try {
      await walletRequest({
        method: 'eth_call',
        params: [{ from: buyer, to: SEAPORT_16, data }, 'latest'],
      });
    } catch (e) {
      say('The purchase would fail: ' + humanError(e), true);
      return { ok: false, reason: 'simulation' };
    }

    say('Sending the transaction...');
    const txHash = await walletRequest({
      method: 'eth_sendTransaction',
      params: [{ from: buyer, to: SEAPORT_16, data }],
    });
    say('sent: ' + txHash);
    const receipt = await waitReceipt(txHash);
    if (!receipt || receipt.status !== '0x1') {
      say('The purchase reverted.', true);
      return { ok: false, txHash };
    }

    const newOwner = wordToAddr(decodeWords(await ethCallTo(MARKET.nft, SEL.ownerOf + encUint(tokenId)))[0]);
    if (newOwner.toLowerCase() === buyer.toLowerCase()) {
      say('bought');
    } else {
      say('Transaction confirmed, but the owner check did not match yet. Refresh in a moment.', true);
    }

    try {
      await loadPublicMarket();
    } catch (e) {
      // the grid refreshes through the event below even if the table read fails
    }
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('market:refresh'));
    }
    return { ok: true, txHash };
  } catch (e) {
    say(humanError(e), true);
    return { ok: false, reason: 'error' };
  }
}
