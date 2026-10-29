// Text builders for @lantsalerts_bot. Pure string formatting only: no IO, no
// network. English content mirrors the X bot and the site; non-ASCII glyphs use
// \u escapes so the source stays ASCII (like format.mjs).

import { newListingText, newFloorListingText, countdownText } from './format.mjs';

const SITE_URL = 'https://lants.eth.limo';
const ARROW = '\u2192'; // right arrow
const BULLET = '\u2022';

// Local copies (identical to format.mjs) so the Telegram bot does not depend on
// the X-bot module's private helpers while that file is being refactored.
function posLink(id) {
  return `lants.eth.limo/#position/${id}`;
}

function price3(v) {
  return '$' + Number(v).toFixed(3);
}

// Floor display: 4-decimal rounding trimmed to its meaningful form but never
// below two decimals (0.1100001 -> "$0.11", 0.1019 -> "$0.1019",
// 0.1 -> "$0.10"), matching diff.mjs approxPrice.
export function trimPrice(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '$0';
  const r = Math.round(n * 1e4) / 1e4;
  let s = r.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  if (!s.includes('.')) s += '.00';
  else if (s.split('.')[1].length === 1) s += '0';
  return '$' + s;
}

export function inlineButton(text, callbackData) {
  return { text, callback_data: callbackData };
}

export function urlButton(text, url) {
  return { text, url };
}

export function keyboard(rows) {
  return { inline_keyboard: rows };
}

export function welcomeReply() {
  const text = [
    'Welcome to lANTS market alerts \u{1F41C}',
    '',
    'I will DM you:',
    `${BULLET} a new listing on our storefront`,
    `${BULLET} the floor dropping below your threshold`,
    `${BULLET} an epoch ending (claim / restake)`,
    '',
    'Commands:',
    '/floor - floor ask and 24h average',
    '/epoch - current epoch and time left',
    '/setfloor - set your floor alert',
    '/help - all commands',
    '',
    SITE_URL,
  ].join('\n');
  return { text };
}

export function helpText() {
  return [
    'Commands:',
    '/start - subscribe to alerts',
    '/floor - floor ask, 24h avg, listed count, epoch',
    '/epoch - current epoch and time left',
    '/setfloor <price> - one alert when the floor drops below your price',
    '',
    'Alerts arrive in DM: a new listing, the floor dropping below your price (once), an epoch ending.',
    SITE_URL,
  ].join('\n');
}

export function unavailableText() {
  return 'Data is unavailable right now, try again later.';
}

// market: { floorAsk, avg24h, listedCount, epoch } from readFeed().market.
export function floorHasData(market) {
  return Boolean(
    market
    && (Number.isFinite(market.floorAsk)
      || Number.isFinite(market.avg24h)
      || Number.isInteger(market.listedCount)
      || Number.isInteger(market.epoch))
  );
}

export function floorReply(market) {
  const lines = [];
  if (Number.isFinite(market.floorAsk)) lines.push(`Floor Ask: ${trimPrice(market.floorAsk)}`);
  if (Number.isFinite(market.avg24h)) lines.push(`24h avg: ${price3(market.avg24h)}`);
  if (Number.isInteger(market.listedCount)) lines.push(`Listed: ${market.listedCount}`);
  if (Number.isInteger(market.epoch)) lines.push(`Epoch: ${market.epoch}`);
  return { text: lines.join('\n') };
}

// data: { epoch, secondsLeft, restakeBonusPct } (secondsLeft/restakeBonusPct soft).
export function epochReply(data) {
  const epoch = Number.isInteger(data.epoch) ? data.epoch : null;
  const secondsLeft = Number.isFinite(data.secondsLeft) ? data.secondsLeft : null;
  if (epoch !== null && secondsLeft !== null) {
    return { text: countdownText({ epoch, hoursLeft: Math.max(1, Math.round(secondsLeft / 3600)), bonusPct: data.restakeBonusPct }) };
  }
  if (epoch !== null) {
    return { text: `Epoch ${epoch}\n${SITE_URL}` };
  }
  return { text: unavailableText() };
}

// sub: { floorThreshold } of the subscriber.
export function setfloorReply(sub) {
  if (sub && Number.isFinite(sub.floorThreshold)) {
    return {
      text: [
        `Your floor alert is armed: you'll be notified once when the floor drops below ${trimPrice(sub.floorThreshold)}.`,
        '',
        'Change it with /setfloor <price>, e.g. /setfloor 0.10',
      ].join('\n'),
    };
  }
  return {
    text: [
      'No floor threshold set.',
      '',
      'Send the price you want to be alerted at (one alert), e.g. /setfloor 0.12',
    ].join('\n'),
  };
}

export function floorSetAckText(threshold) {
  return `Floor alert set at ${trimPrice(threshold)}. You will hear when the floor drops below it.`;
}

export function floorOffAckText() {
  return 'Floor alert off.';
}

export function floorAlertText(floor, threshold) {
  return `Floor ${trimPrice(floor)} \u2014 below your threshold ${trimPrice(threshold)}`;
}

// Broadcast text for a new own listing (reuses the X-bot listing templates) +
// a Buy button that deep-links the position page.
export function listingAlertReply(lot, isFloor) {
  const text = isFloor ? newFloorListingText(lot) : newListingText(lot);
  const replyMarkup = keyboard([[urlButton(`Buy ${ARROW}`, posLink(lot.id))]]);
  return { text, replyMarkup };
}

// Compact broadcast CTA for a closed epoch, reusing the epochText idea.
export function epochEndedAlertText(closedEpoch, restakeBonusPct = null) {
  let text = `\u{1F3C1} Epoch ${closedEpoch} has ended \u2014 claim staker rewards or restake \u{1F331}`;
  if (Number.isFinite(restakeBonusPct) && restakeBonusPct > 0) {
    text += ` (+${Math.round(restakeBonusPct)}% power bonus)`;
  }
  return text;
}
