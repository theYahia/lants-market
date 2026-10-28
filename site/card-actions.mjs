// Delegated actions for storefront cards (grid and position page): Buy,
// Make offer and Share. Shared so both surfaces behave identically.

import { SEAPORT_BUY_ENABLED } from './market-config.mjs';
import { buyListing } from './market-buy.mjs';
import { buySeaportOrder } from './seaport-buy.mjs';

const SHARE_BASE = 'https://lants.eth.limo/';

function report(card, text, isError) {
  const msg = card?.querySelector('.sf-msg');
  if (!msg) return;
  msg.textContent = text;
  msg.classList.toggle('is-error', !!isError);
}

async function copyShare(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (e) {
    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch (e2) {
      return false;
    }
  }
}

/**
 * Wire card actions on a container that survives re-renders.
 *
 * @param {Element} container
 * @param {{onRefresh?:() => Promise<void>|void}} [opts]
 */
export function initCardActions(container, opts = {}) {
  if (!container) return;
  const pendingPrice = new Map();
  const refresh = opts.onRefresh || (() => {});

  container.addEventListener('click', async (ev) => {
    const card = ev.target.closest('.sf-card');
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
      const ok = await copyShare(SHARE_BASE + '#position/' + share.dataset.tokenId);
      const original = share.textContent;
      share.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => {
        share.textContent = original;
      }, 1500);
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
