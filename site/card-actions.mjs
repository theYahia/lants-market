// Delegated actions for storefront cards (grid and position page): Buy,
// Make offer and Share. Shared so both surfaces behave identically.

import { SEAPORT_BUY_ENABLED } from './market-config.mjs';
import { buyListing as buyListingImpl } from './market-buy.mjs';
import { buySeaportOrder as buySeaportOrderImpl } from './seaport-buy.mjs';

function report(card, text, isError) {
  const msg = card?.querySelector('.sf-msg');
  if (!msg) return;
  msg.textContent = text;
  msg.classList.toggle('is-error', !!isError);
}

// Copy text to the clipboard: async Clipboard API first, execCommand fallback.
async function defaultCopy(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    if (typeof document.execCommand === 'function') document.execCommand('copy');
    else throw new Error('no clipboard API');
  } finally {
    ta.remove();
  }
}

function shareText(card, button) {
  const tokenId = button.dataset.tokenId || card.dataset.tokenId || '';
  const href = typeof window !== 'undefined' && window.location ? window.location.href : '';
  const url = button.dataset.share || (href.split('#')[0] + '#position/' + tokenId);
  return { tokenId, url };
}

/**
 * Wire card actions on a container that survives re-renders.
 *
 * @param {Element} container
 * @param {{onRefresh?:() => Promise<void>|void, buyListing?:Function,
 *          buySeaportOrder?:Function, copy?:Function}} [opts]
 */
export function initCardActions(container, opts = {}) {
  if (!container) return;
  const pendingPrice = new Map();
  const refresh = opts.onRefresh || (() => {});
  const buyListing = opts.buyListing || buyListingImpl;
  const buySeaportOrder = opts.buySeaportOrder || buySeaportOrderImpl;
  const copy = opts.copy || defaultCopy;

  container.addEventListener('click', async (ev) => {
    const card = ev.target.closest('.sf-card, .sf-row');
    if (!card) return;

    const offer = ev.target.closest('.sf-offer');
    if (offer) {
      ev.preventDefault();
      const modal = document.querySelector('.offer-modal');
      if (modal) modal.dataset.tokenId = offer.dataset.tokenId || '';
      const opener = document.querySelector('.ms-offer');
      if (opener) opener.click();
      return;
    }

    const share = ev.target.closest('.sf-share');
    if (share) {
      ev.preventDefault();
      const { tokenId, url } = shareText(card, share);
      if (!tokenId) return;
      try {
        await copy(url);
        report(card, 'Link copied');
      } catch (e) {
        report(card, 'Copy failed', true);
      }
      return;
    }

    const buy = ev.target.closest('.sf-buy');
    if (!buy) return;
    ev.preventDefault();

    if (buy.dataset.source === 'lants') {
      buy.disabled = true;
      const res = await buyListing(
        {
          id: Number(buy.dataset.listingId),
          price: BigInt(buy.dataset.price),
          currency: buy.dataset.currency,
        },
        (text, isError) => report(card, text, isError)
      );
      buy.disabled = false;
      if (res.ok) await refresh();
      return;
    }

    if (buy.dataset.source !== 'seaport' || !SEAPORT_BUY_ENABLED) return;
    buy.disabled = true;
    const tokenId = Number(buy.dataset.tokenId);
    const res = await buySeaportOrder({
      tokenId,
      cardPriceMicro: buy.dataset.price,
      confirmedPriceMicro: pendingPrice.get(tokenId),
      statusEl: card.querySelector('.sf-msg'),
    });
    if (res.needsConfirm) pendingPrice.set(tokenId, res.priceMicro);
    if (res.ok) {
      pendingPrice.delete(tokenId);
      await refresh();
    }
    buy.disabled = false;
  });
}
