// Tweet text builders. Pure string formatting only: no IO, no network.
//
// One post = one story. The text carries the narrative (a sentence a buyer can
// act on), the card carries the density (see bot/card.mjs); the old
// "emoji · number · number · data:" dumps are gone and must not come back
// (docs/twitter-content-plan.md, Phase 3). Every builder ends on the site link
// because the bot's gate refuses a post without a route back to lants.eth.limo.

const SITE = 'lants.eth.limo';
const SITE_URL = 'https://lants.eth.limo';

function posLink(id) {
  return `${SITE}/#position/${id}`;
}

function price3(v) {
  return '$' + Number(v).toFixed(3);
}

function usd2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '$0.00';
  return '$' + n.toFixed(2);
}

// 400 -> "400", 762.4724 -> "762.47", 1512.7 -> "1512.7"
export function fmtAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '0';
  return n.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

// Signed percent string "+8.4%" / "-5.0%".
export function pct(from, to) {
  const p = ((to - from) / from) * 100;
  const sign = p < 0 ? '-' : '+';
  return sign + Math.abs(p).toFixed(1) + '%';
}

// Whole dollars with thousands separators: 12804.23 -> "$12,804".
export function usdWhole(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '$0';
  return '$' + Math.round(n).toLocaleString('en-US');
}

// 27841 -> "27,841" (settlement counts in antseedstats texts).
export function countLabel(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

export function fmtEmission(v) {
  const n = Math.round(Number(v));
  return n.toLocaleString('en-US');
}

// 1500000 -> "1.5M", 6000000 -> "6M", 1535689.21 -> "1.54M".
export function fmtCompact(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e9) return trim(n / 1e9) + 'B';
  if (n >= 1e6) return trim(n / 1e6) + 'M';
  if (n >= 1e3) return trim(n / 1e3) + 'K';
  return String(Math.round(n));
}

function trim(x) {
  return String(Number(x.toFixed(2)));
}

// --- A. Epoch close + claim/restake CTA -------------------------------------

// The measures are optional and only appear when a live source supplied them
// (never invent one). `paid` reads the sentence naturally with or without them.
export function epochCloseText({ epoch, emissionAnts, sellerPointsUsd, restakeBonusPct } = {}) {
  const n = Number(epoch);
  let head = Number.isInteger(n) && n >= 0 ? `Epoch ${n} closed.` : 'Epoch closed.';
  const parts = [];
  if (Number.isFinite(emissionAnts) && emissionAnts > 0) {
    parts.push(`${fmtCompact(emissionAnts)} ANTS went to stakers`);
  }
  if (Number.isFinite(sellerPointsUsd) && sellerPointsUsd > 0) {
    parts.push(`${usdWhole(sellerPointsUsd)} of seller points to providers`);
  }
  if (parts.length > 0) head += ' ' + parts.join(', ') + '.';
  const bonus = Number.isFinite(restakeBonusPct) && restakeBonusPct > 0
    ? `for +${Math.round(restakeBonusPct)}% power`
    : 'to compound';
  return [
    head,
    '',
    `Holding a locked position? Claim, or restake ${bonus}.`,
    'Bought compute? Your buyer rewards can go into a seller pool.',
    '',
    SITE,
  ].join('\n');
}

// --- B. Market board -------------------------------------------------------

function bidsLine(offeredCount) {
  const n = Number(offeredCount);
  if (!Number.isFinite(n)) return '';
  if (n <= 0) return 'Zero bids on any of them.';
  if (n === 1) return 'One open bid on one of them.';
  return `${countLabel(n)} open bids across them.`;
}

export function boardText(board = {}) {
  const listed = Number(board.listedCount);
  const total = Number(board.totalNfts);
  const lines = [];

  if (Number.isFinite(listed) && Number.isFinite(total) && total > 0) {
    const bids = bidsLine(board.offeredCount);
    lines.push(`${listed} of ${total} locked ANTS positions are for sale.${bids ? ' ' + bids : ''}`);
  }

  const price = [];
  if (Number.isFinite(board.floorAsk)) price.push(`Floor ${price3(board.floorAsk)}`);
  if (Number.isFinite(board.avg24h)) price.push(`24h average sale ${price3(board.avg24h)}`);
  if (price.length > 0) {
    const rest = Number.isFinite(total) && Number.isFinite(listed) && total > listed
      ? ` \u2014 the other ${total - listed} holders are just holding`
      : '';
    lines.push(`${price.join(', ')}${rest}.`);
  }

  lines.push(`Every lot, live: ${SITE}`);
  return lines.join('\n\n');
}

// --- C. Lot highlight ------------------------------------------------------

function unlockPhrase(lot) {
  const days = Number(lot.daysRemaining);
  if (Number.isFinite(days) && days > 1) return `unlocks in ${days} days`;
  if (days === 1) return 'unlocks in 1 day';
  if (days === 0) return 'unlocks this epoch';
  return `lock ends at epoch ${lot.stakeEndEpoch}`;
}

export function lotText(lot = {}) {
  if (!Number.isInteger(Number(lot.id))) return '';
  return [
    `Cheapest way into locked ANTS today: ${fmtAmount(lot.amount)} ANTS for ${usd2(lot.usd)}.`,
    '',
    `${price3(lot.perAntUsd)}/ANTS, ${unlockPhrase(lot)}, earning staking rewards the whole time.`,
    '',
    `Card: ${posLink(lot.id)}`,
  ].join('\n');
}

// --- D. Network story ------------------------------------------------------

export function networkText({ buyers, sellers, settled7d, pctChange } = {}) {
  const b = Number(buyers);
  const s = Number(sellers);
  const moreBuyers = b > s;
  const head = moreBuyers
    ? 'More buyers than sellers on AntSeed this week'
    : 'Sellers outnumber buyers on AntSeed this week';
  const parts = [`${countLabel(b)} buyers`, `${countLabel(s)} sellers`];
  if (Number.isFinite(settled7d)) {
    const change = typeof pctChange === 'string' ? ` (${pctChange} w/w)` : '';
    parts.push(`${usdWhole(settled7d)} settled in 7d${change}`);
  }
  const conclusion = moreBuyers
    ? `${countLabel(s)} sellers serving ${countLabel(b)} buyers is a supply shortage, not a demand problem.`
    : `${countLabel(b)} buyers spread across ${countLabel(s)} sellers \u2014 demand is the constraint this week.`;
  return [
    `${head}: ${parts.join(', ')}.`,
    '',
    conclusion,
    '',
    `${SITE} \u00b7 src: antseedstats.com`,
  ].join('\n');
}

// --- E. Education ----------------------------------------------------------

export function eduText({ totalNfts, listedCount } = {}) {
  const lines = [
    'A lANTS position is ANTS staked behind a provider until a date. Buying one buys the lock, the yield and the boost with it.',
    '',
  ];
  const total = Number(totalNfts);
  const listed = Number(listedCount);
  if (Number.isFinite(total) && Number.isFinite(listed)) {
    lines.push(`${total} exist. ${listed} are for sale.`, '');
  }
  lines.push(`Want ANTS without a lock? This is not it. ${SITE}`);
  return lines.join('\n');
}

// --- Legacy builders -------------------------------------------------------
// Listing-level posts are removed (docs/twitter-content-plan.md "Removed post
// types"); these two builders stay because the Telegram bot and their tests
// still reference them.

export function newListingText(l) {
  const MID = '\u00b7';
  const lock = Number.isFinite(l.lockDays) && l.lockDays > 0
    ? ` ${MID} lock ${Math.round(l.lockDays / 7)}w`
    : '';
  return `\u{1F195} New listing: #${l.id} ${MID} \u{1F41C} ${fmtAmount(l.amount)} ANTS @ ${price3(l.perAntUsd)}${lock} ${MID} ${posLink(l.id)}`;
}

export function newFloorListingText(l) {
  const MID = '\u00b7';
  const lock = Number.isFinite(l.lockDays) && l.lockDays > 0
    ? ` ${MID} lock ${Math.round(l.lockDays / 7)}w`
    : '';
  return `\u{1F3AF} New floor listing: #${l.id} ${MID} \u{1F41C} ${fmtAmount(l.amount)} ANTS @ ${price3(l.perAntUsd)}${lock} ${MID} ${posLink(l.id)}`;
}

export { SITE, SITE_URL };
