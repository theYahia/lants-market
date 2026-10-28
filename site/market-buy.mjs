// site/market-buy.mjs
// Buying a lot on our own marketplace (buyListing(uint256)). The storefront
// card and the legacy market-row button share buyListing(); the delegated
// click handler below keeps the old #market-list behaviour.

import {
  MARKET,
  SEL,
  encAddr,
  encUint,
  decodeWords,
  wordToBigInt,
} from "./market-config.mjs";
import { walletRequest, ensureChain, waitReceipt, loadPublicMarket, humanError } from "./market-view.mjs";

function getMessageSpan(row) {
  let span = row.querySelector("span.msg");
  if (!span) {
    span = document.createElement("span");
    span.className = "msg";
    span.style.marginLeft = "0.5rem";
    row.appendChild(span);
  }
  return span;
}

function setMessage(row, text, isError = false) {
  const span = getMessageSpan(row);
  span.textContent = text;
  span.style.color = isError ? "red" : "inherit";
}

/**
 * Buy one of our own listings. Returns { ok, txHash } and reports progress
 * through the caller's status callback.
 */
export async function buyListing({ id, price, currency }, report = () => {}) {
  let accounts = [];
  try {
    accounts = await walletRequest({ method: "eth_accounts" });
  } catch (e) {
    report(humanError(e), true);
    return { ok: false };
  }

  if (!accounts || accounts.length === 0) {
    report("connect wallet first", true);
    return { ok: false };
  }
  const from = accounts[0];

  try {
    if (!(await ensureChain())) {
      report("wrong network", true);
      return { ok: false };
    }
  } catch (e) {
    report(humanError(e), true);
    return { ok: false };
  }

  let needApprove = false;
  try {
    const callData = SEL.allowance + encAddr(from) + encAddr(MARKET.market);
    const raw = await walletRequest({
      method: "eth_call",
      params: [{ to: currency, data: callData }, "latest"],
    });
    const words = decodeWords(raw);
    const allowance = wordToBigInt(words[0] ?? "0x0");
    needApprove = allowance < price;
  } catch (e) {
    report("Could not check the USDC allowance: " + humanError(e), true);
    return { ok: false };
  }

  if (needApprove) {
    try {
      const approveData = SEL.approve + encAddr(MARKET.market) + encUint(price);
      const approveHash = await walletRequest({
        method: "eth_sendTransaction",
        params: [{ from, to: currency, data: approveData }],
      });
      report(`approve sent: ${approveHash}`);
      const aRcpt = await waitReceipt(approveHash);
      if (!aRcpt || aRcpt.status !== "0x1") {
        report("approve failed", true);
        return { ok: false };
      }
    } catch (e) {
      report(humanError(e), true);
      return { ok: false };
    }
  }

  try {
    const buyData = SEL.buyListing + encUint(id);
    const txHash = await walletRequest({
      method: "eth_sendTransaction",
      params: [{ from, to: MARKET.market, data: buyData }],
    });
    report(`buy sent: ${txHash}`);
    const rcpt = await waitReceipt(txHash);
    if (rcpt && rcpt.status === "0x1") {
      report("bought");
      await loadPublicMarket();
      await afterBuy();
      return { ok: true, txHash };
    }
    report("buy reverted", true);
    return { ok: false, txHash };
  } catch (e) {
    report(humanError(e), true);
    return { ok: false };
  }
}

async function afterBuy() {
  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("market:refresh"));
  }
}

function initBuyHandler() {
  const list = document.getElementById("market-list");
  if (!list) return;

  list.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button.buy");
    if (!btn) return;

    ev.preventDefault();
    btn.disabled = true;

    const row = btn.closest("div.market-row") || btn.parentElement;
    await buyListing(
      {
        id: Number(btn.dataset.id),
        price: BigInt(btn.dataset.price),
        currency: btn.dataset.currency,
      },
      (text, isError) => setMessage(row, text, isError)
    );

    btn.disabled = false;
  });
}

initBuyHandler();
