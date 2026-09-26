// site/market-buy.mjs
// Market buying logic
// Delegated click handler on #market-list for buttons with class "buy"

import {
  MARKET,
  SEL,
  encAddr,
  encUint,
  decodeWords,
  wordToBigInt,
} from "./market-config.mjs";
import { walletRequest, ensureChain, waitReceipt, loadPublicMarket, humanError } from "./market-view.mjs";

/**
 * Helper: create / get a span for messages inside the same market row.
 */
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

/**
 * Show a temporary message (hash or error) next to the button.
 */
function setMessage(row, text, isError = false) {
  const span = getMessageSpan(row);
  span.textContent = text;
  span.style.color = isError ? "red" : "inherit";
}

/**
 * Main delegated click handler.
 */
function initBuyHandler() {
  const list = document.getElementById("market-list");
  if (!list) return; // nothing to do

  list.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button.buy");
    if (!btn) return; // not a buy button

    ev.preventDefault();

    // Disable button to avoid double clicks
    btn.disabled = true;

    const row = btn.closest("div.market-row") || btn.parentElement;
    const id = Number(btn.dataset.id);
    const price = BigInt(btn.dataset.price);
    const currency = btn.dataset.currency;

    // -----------------------------------------------------------------
    // 1. Get user address
    // -----------------------------------------------------------------
    let accounts = [];
    try {
      accounts = await walletRequest({ method: "eth_accounts" });
    } catch (e) {
      setMessage(row, humanError(e), true);
      btn.disabled = false;
      return;
    }

    if (!accounts || accounts.length === 0) {
      setMessage(row, "connect wallet first", true);
      btn.disabled = false;
      return;
    }

    const from = accounts[0];

    try {
      if (!(await ensureChain())) {
        setMessage(row, "wrong network", true);
        btn.disabled = false;
        return;
      }
    } catch (e) {
      setMessage(row, humanError(e), true);
      btn.disabled = false;
      return;
    }

    // -----------------------------------------------------------------
    // 2. Check allowance (ERC20)
    // -----------------------------------------------------------------
    let needApprove = false;
    try {
      // SEL.allowance already contains the 0x prefix
      const callData = SEL.allowance + encAddr(from) + encAddr(MARKET.market);
      const raw = await walletRequest({
        method: "eth_call",
        params: [{ to: currency, data: callData }, "latest"],
      });
      const words = decodeWords(raw);
      const allowance = wordToBigInt(words[0] ?? "0x0");
      if (allowance < price) needApprove = true;
    } catch (e) {
      setMessage(row, 'Could not check the USDC allowance: ' + humanError(e), true);
      btn.disabled = false;
      return;
    }

    // -----------------------------------------------------------------
    // 3. Approve if needed
    // -----------------------------------------------------------------
    if (needApprove) {
      try {
        // SEL.approve already contains the 0x prefix
        const approveData = SEL.approve + encAddr(MARKET.market) + encUint(price);
        const txHash = await walletRequest({
          method: "eth_sendTransaction",
          params: [{ from, to: currency, data: approveData }],
        });
        setMessage(row, `approve sent: ${txHash}`);
        const aRcpt = await waitReceipt(txHash);
        if (!aRcpt || aRcpt.status !== "0x1") {
          setMessage(row, "approve failed", true);
          btn.disabled = false;
          return;
        }
      } catch (e) {
        setMessage(row, humanError(e), true);
        btn.disabled = false;
        return;
      }
    }

    // -----------------------------------------------------------------
    // 4. Buy listing
    // -----------------------------------------------------------------
    try {
      // SEL.buyListing already contains the 0x prefix
      const buyData = SEL.buyListing + encUint(id);
      const txHash = await walletRequest({
        method: "eth_sendTransaction",
        params: [{ from, to: MARKET.market, data: buyData }],
      });
      setMessage(row, `buy sent: ${txHash}`);
      const rcpt = await waitReceipt(txHash);
      if (rcpt && rcpt.status === "0x1") {
        setMessage(row, "bought");
        await loadPublicMarket();
      } else {
        setMessage(row, "buy reverted", true);
      }
    } catch (e) {
      setMessage(row, humanError(e), true);
      btn.disabled = false;
      return;
    }

    // Re‑enable button after all work is done
    btn.disabled = false;
  });
}

// Initialise on module load
initBuyHandler();