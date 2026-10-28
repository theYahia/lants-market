// Offer validation and rendering: the stake-offer line (tests depend on it) and
// a structured card variant used by the dashboard. Rebates share the schema from
// rebate.mjs.
import { validRebate, rebateLine, rebateLabel } from './rebate.mjs';

export function isValidOffer(offer, displayEpoch) {
  if (!offer || typeof offer !== 'object') return false;
  if (typeof offer.pool !== 'string' || !/^\d+$/.test(offer.pool)) return false;
  if (typeof offer.usdcPer1k !== 'number' || !(offer.usdcPer1k > 0)) return false;
  if (typeof offer.capAnts !== 'number' || !(offer.capAnts > 0)) return false;
  if (typeof offer.payer !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(offer.payer)) return false;
  if (!Array.isArray(offer.epochs)) return false;
  for (const ep of offer.epochs) {
    if (typeof ep !== 'number' || !Number.isInteger(ep)) return false;
    if (ep !== displayEpoch) return false;
  }
  if (offer.pays !== 'all' && offer.pays !== 'new') return false;
  if (offer.note !== undefined && offer.note !== null && typeof offer.note !== 'string') return false;
  if (typeof offer.note === 'string' && offer.note.length > 140) return false;
  return true;
}

export function offerLine(offer, displayEpoch, poolNames) {
  const usdc = offer.capAnts / 1000 * offer.usdcPer1k;
  const name = poolNames[offer.pool];
  const prefix = name ? `${name} (pool ${offer.pool})` : `Pool ${offer.pool}`;
  const rule = offer.pays === 'new' ? 'new stakes only' : 'all stakers, pro rata';
  const payer = `${offer.payer.slice(0, 6)}…${offer.payer.slice(-4)}`;
  const line = `${prefix} · ${offer.usdcPer1k} USDC per 1,000 ANTS at max lock · epoch ${displayEpoch} · ${rule} · max ${usdc} USDC for the first ${offer.capAnts.toLocaleString('en-US')} ANTS · paid by ${payer}`;
  return { line, note: offer.note || '' };
}

// Structured variant for the card view: pool name + rate on top, conditions below.
export function offerCard(offer, displayEpoch, poolNames) {
  const name = poolNames[offer.pool];
  const title = name || `Pool ${offer.pool}`;
  if (validRebate(offer)) {
    return {
      title,
      rate: rebateLabel(offer, displayEpoch),
      sub: `Pool ${offer.pool} · paid by ${offer.payer}`,
      note: offer.note || '',
    };
  }
  const usdc = offer.capAnts / 1000 * offer.usdcPer1k;
  const rule = offer.pays === 'new' ? 'new stakes only' : 'all stakers, pro rata';
  const payer = `${offer.payer.slice(0, 6)}…${offer.payer.slice(-4)}`;
  return {
    title,
    rate: `${offer.usdcPer1k} USDC per 1,000 ANTS at max lock`,
    sub: `Pool ${offer.pool} · epoch ${displayEpoch} · ${rule} · max ${usdc} USDC for the first ${offer.capAnts.toLocaleString('en-US')} ANTS · paid by ${payer}`,
    note: offer.note || '',
  };
}

export function buildOfferRows(offers, displayEpoch, poolNames) {
  const rows = [];
  if (offers) {
    for (const offer of offers) {
      if (isValidOffer(offer, displayEpoch)) {
        rows.push(offerLine(offer, displayEpoch, poolNames));
      } else if (validRebate(offer)) { // rebate:rows
        rows.push(rebateLine(offer, displayEpoch, poolNames));
      }
    }
  }
  return rows;
}

export function buildOfferSection(offers, displayEpoch, poolNames) {
  const div = document.createElement('div');
  div.className = 'inc-offers';

  const headingRow = document.createElement('div');
  headingRow.className = 'inc-offers-head';

  const h3 = document.createElement('h3');
  h3.textContent = 'Offers';
  headingRow.appendChild(h3);

  div.appendChild(headingRow);

  const ul = document.createElement('ul');
  ul.className = 'inc-offers-list';

  if (offers === null) {
    const li = document.createElement('li');
    li.textContent = 'Offers unavailable';
    ul.appendChild(li);
  } else {
    const cards = [];
    for (const offer of offers) {
      if (isValidOffer(offer, displayEpoch)) {
        cards.push(offerCard(offer, displayEpoch, poolNames));
      } else if (validRebate(offer)) { // rebate:cards
        cards.push(offerCard(offer, displayEpoch, poolNames));
      }
    }
    if (cards.length === 0) {
      const li = document.createElement('li');
      li.textContent = `No offers for epoch ${displayEpoch} yet — be the first.`;
      ul.appendChild(li);
    } else {
      for (const card of cards) {
        const li = document.createElement('li');
        const head = document.createElement('div');
        head.className = 'inc-offer-card-head';
        const title = document.createElement('span');
        title.className = 'inc-offer-card-title';
        title.textContent = card.title;
        const rate = document.createElement('span');
        rate.className = 'inc-offer-card-rate';
        rate.textContent = card.rate;
        head.appendChild(title);
        head.appendChild(rate);
        const sub = document.createElement('div');
        sub.className = 'inc-offer-card-sub';
        sub.textContent = card.sub;
        li.appendChild(head);
        li.appendChild(sub);
        if (card.note) {
          const note = document.createElement('span');
          note.className = 'inc-offer-note';
          note.textContent = card.note;
          li.appendChild(note);
        }
        ul.appendChild(li);
      }
    }
  }

  div.appendChild(ul);
  return div;
}
