// Tweet text builders. Pure string formatting only: no IO, no network.
// Number formats mirror docs/twitter-content-plan.md Phase 2 templates.

const MID = '\u00b7'; // middle dot separator used by the templates
const SITE = 'lants.eth.limo';
const DATA_SRC = 'data: antseedstats.com'; // CC BY 4.0 attribution

function price3(v) {
  return '$' + Number(v).toFixed(3);
}

function price4(v) {
  return '$' + Number(v).toFixed(4);
}

function usd2(v) {
  return '$' + Number(v).toFixed(2);
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
function countLabel(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US');
}

export function fmtEmission(v) {
  const n = Math.round(Number(v));
  return n.toLocaleString('en-US');
}

export function floorText(from, to) {
  return `Floor: ${price3(from)} \u2192 ${price3(to)} (${pct(from, to)}) ${MID} ${SITE}`;
}

export function tradeText(t) {
  return `Sold: #${t.tokenId} ${MID} ${fmtAmount(t.amount)} ANTS @ ${price4(t.perAntUsd)} (${usd2(t.usdTotal)} USDC) ${MID} ${SITE}`;
}

export function newListingText(l) {
  const lock = Number.isFinite(l.lockDays) && l.lockDays > 0
    ? ` ${MID} lock ${Math.round(l.lockDays / 7)}w`
    : '';
  return `New listing: #${l.id} ${MID} ${fmtAmount(l.amount)} ANTS @ ${price3(l.perAntUsd)}${lock} ${MID} ${SITE}`;
}

export function delistText(id) {
  return `Delisted: #${id} ${MID} ${SITE}`;
}

// "X ANTS emitted" and "24h avg $Y" are both optional: only include a measure
// when a live source supplied it (never invent a number).
export function epochText(closedEpoch, emission, avg24h) {
  const parts = [`Epoch ${closedEpoch} closed`];
  if (Number.isFinite(emission) && emission > 0) parts.push(`${fmtEmission(emission)} ANTS emitted`);
  if (Number.isFinite(avg24h)) parts.push(`24h avg ${price3(avg24h)}`);
  parts.push(SITE);
  return parts.join(` ${MID} `);
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

// antseedstats.com post types: every number carries the CC BY 4.0 attribution.
export function burnText(burn, totalBurned) {
  return `ANTS burn: ${fmtCompact(burn.ants)} (epoch ${burn.epoch}) ${MID} total ${fmtCompact(totalBurned)} ${MID} ${DATA_SRC}`;
}

// pctChange is a signed percent string like "+6.1%".
export function settledText(label, value, pctChange, settles, sellers) {
  return `AntSeed ${label} settled: ${usdWhole(value)} (${pctChange}) ${MID} ${countLabel(settles)} settlements ${MID} ${countLabel(sellers)} sellers ${MID} ${DATA_SRC}`;
}

// pctChange is a signed percent string like "+5.2%"; stakedPct is the raw
// share of stakable ANTS (73.2107 -> "73% of stakable").
export function stakedText(value, pctChange, stakedPct) {
  const pctOf = Number.isFinite(Number(stakedPct)) ? Math.round(Number(stakedPct)) : 0;
  return `Staked: ${fmtCompact(value)} ANTS (${pctChange}) ${MID} ${pctOf}% of stakable ${MID} ${DATA_SRC}`;
}

export function recordText(value) {
  return `AntSeed 7d settled hit a record: ${usdWhole(value)} ${MID} ${DATA_SRC}`;
}

function usdCompact(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '$0';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Emission/points/burn are all optional: include a measure only when the epoch
// record actually supplied it (burn lags the close by a few epochs).
export function epochStatsText(e) {
  const parts = [`Epoch ${e.epoch} rewards`];
  if (Number.isFinite(e.emissionAnts) && e.emissionAnts > 0) parts.push(`${fmtCompact(e.emissionAnts)} ANTS emission`);
  if (Number.isFinite(e.sellerPointsUsd) && e.sellerPointsUsd > 0) parts.push(`${usdCompact(e.sellerPointsUsd)} seller points`);
  if (Number.isFinite(e.burnAnts) && e.burnAnts > 0) parts.push(`${fmtCompact(e.burnAnts)} burned`);
  parts.push(DATA_SRC);
  return parts.join(` ${MID} `);
}
