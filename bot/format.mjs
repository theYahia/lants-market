// Tweet text builders. Pure string formatting only: no IO, no network.
// Number formats mirror docs/twitter-content-plan.md Phase 2 templates.

const MID = '\u00b7'; // middle dot separator used by the templates
const SITE = 'lants.eth.limo';
const SITE_URL = 'https://lants.eth.limo';
const DATA_SRC = 'data: antseedstats.com'; // CC BY 4.0 attribution
const MAX_POST_LEN = 280; // must match xapi.mjs MAX_TWEET_LEN

function posLink(id) {
  return `${SITE}/#position/${id}`;
}

function price3(v) {
  return '$' + Number(v).toFixed(3);
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

export function newListingText(l) {
  const lock = Number.isFinite(l.lockDays) && l.lockDays > 0
    ? ` ${MID} lock ${Math.round(l.lockDays / 7)}w`
    : '';
  return `\u{1F195} New listing: #${l.id} ${MID} \u{1F41C} ${fmtAmount(l.amount)} ANTS @ ${price3(l.perAntUsd)}${lock} ${MID} ${posLink(l.id)}`;
}

export function newFloorListingText(l) {
  const lock = Number.isFinite(l.lockDays) && l.lockDays > 0
    ? ` ${MID} lock ${Math.round(l.lockDays / 7)}w`
    : '';
  return `\u{1F3AF} New floor listing: #${l.id} ${MID} \u{1F41C} ${fmtAmount(l.amount)} ANTS @ ${price3(l.perAntUsd)}${lock} ${MID} ${posLink(l.id)}`;
}

export function delistText(id) {
  return `\u{1F5D1}\uFE0F Delisted: #${id} ${MID} ${posLink(id)}`;
}

// Epoch close is a call to action (claim / restake), not a market ticker. The
// measures stay optional and compact on the first line: only include a number
// when a live source supplied it (never invent one). A long pair of measures is
// dropped rather than letting the post exceed the tweet limit and fail forever.
export function epochText(closedEpoch, emission, avg24h, opts = {}) {
  const measures = [];
  if (Number.isFinite(emission) && emission > 0) measures.push(`\u{1F41C} ${fmtEmission(emission)} ANTS emitted`);
  if (Number.isFinite(avg24h)) measures.push(`24h avg ${price3(avg24h)}`);
  const bonus = Number.isFinite(opts.restakeBonusPct) && opts.restakeBonusPct > 0
    ? ` (+${Math.round(opts.restakeBonusPct)}% power bonus)`
    : '';
  const build = (withMeasures) => {
    const head = withMeasures && measures.length > 0
      ? `\u{1F3C1} Epoch ${closedEpoch} has ended ${MID} ${measures.join(` ${MID} `)}`
      : `\u{1F3C1} Epoch ${closedEpoch} has ended`;
    return [
      head,
      '',
      `Staker rewards for epoch ${closedEpoch} are claimable now:`,
      '\u2022 Claim \u2014 ANTS to your wallet',
      `\u2022 Restake \u2014 compound into a new position \u{1F331}${bonus}`,
      '',
      `Buyer rewards for epoch ${closedEpoch} can be staked into a seller pool.`,
      '',
      SITE_URL,
    ].join('\n');
  };
  const full = build(true);
  return full.length <= MAX_POST_LEN ? full : build(false);
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
  return `\u{1F525} ANTS burn: \u{1F41C} ${fmtCompact(burn.ants)} (epoch ${burn.epoch}) ${MID} total ${fmtCompact(totalBurned)} ${MID} ${DATA_SRC}`;
}

// pctChange is a signed percent string like "+6.1%"; buyers is optional.
export function settledText(label, value, pctChange, settles, sellers, buyers) {
  let s = `\u{1F4B0} AntSeed ${label} settled: ${usdWhole(value)} (${pctChange}) ${MID} ${countLabel(settles)} settlements ${MID} ${countLabel(sellers)} sellers`;
  if (Number.isFinite(buyers) && buyers > 0) s += ` ${MID} ${countLabel(buyers)} buyers`;
  return s + ` ${MID} ${DATA_SRC}`;
}

// pctChange is a signed percent string like "+5.2%"; stakedPct is the raw
// share of stakable ANTS (73.2107 -> "73% of stakable").
export function stakedText(value, pctChange, stakedPct) {
  const pctOf = Number.isFinite(Number(stakedPct)) ? Math.round(Number(stakedPct)) : 0;
  return `\u{1F331} Staked: ${fmtCompact(value)} ANTS (${pctChange}) ${MID} ${pctOf}% of stakable ${MID} ${DATA_SRC}`;
}

export function recordText(value) {
  return `\u{1F3C6} AntSeed 7d settled hit a record: ${usdWhole(value)} ${MID} ${DATA_SRC}`;
}

function usdCompact(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '$0';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Emission/points/burn are all optional: include a measure only when the epoch
// record actually supplied it (burn lags the close by a few epochs).
export function epochStatsText(e) {
  const parts = [`\u{1F381} Epoch ${e.epoch} rewards`];
  if (Number.isFinite(e.emissionAnts) && e.emissionAnts > 0) parts.push(`\u{1F41C} ${fmtCompact(e.emissionAnts)} ANTS emission`);
  if (Number.isFinite(e.sellerPointsUsd) && e.sellerPointsUsd > 0) parts.push(`${usdCompact(e.sellerPointsUsd)} seller points`);
  if (Number.isFinite(e.burnAnts) && e.burnAnts > 0) parts.push(`${fmtCompact(e.burnAnts)} burned`);
  parts.push(DATA_SRC);
  return parts.join(` ${MID} `);
}

// Demand-side post types (plan 1793256926840): usage, countdown, alloc, topmodels.

export function usageText({ requests, tokens, videos, coverage } = {}) {
  const parts = ['\u{1F4E1} AntSeed 24h'];
  if (Number.isFinite(requests)) parts.push(`${fmtCompact(requests)} requests`);
  if (Number.isFinite(tokens)) parts.push(`${fmtCompact(tokens)} tokens`);
  if (Number.isFinite(videos)) parts.push(`${fmtCompact(videos)} videos`);
  if (Number.isFinite(coverage)) parts.push(`${Math.round(coverage * 100)}% attributed`);
  parts.push(DATA_SRC);
  return parts.join(` ${MID} `);
}

export function countdownText({ epoch, hoursLeft, bonusPct } = {}) {
  let line = `\u{23F3}\uFE0F Epoch ${epoch} ends in ~${hoursLeft}h \u2014 claim staker rewards or restake`;
  if (Number.isFinite(bonusPct) && bonusPct > 0) line += ` with a +${Math.round(bonusPct)}% power bonus`;
  line += ` \u{1F331}`;
  return [line, '', SITE_URL].join('\n');
}

const BUCKET_LABELS = { sellerPools: 'seller pools', usage: 'usage', team: 'team', reserve: 'reserve', verification: 'verification' };

export function allocText({ epoch, buckets } = {}) {
  const parts = [`\u{1F9EE} Epoch ${epoch} emission`];
  for (const b of buckets || []) {
    if (!Number.isFinite(b.capPct)) continue;
    parts.push(`${Math.round(b.capPct)}% ${BUCKET_LABELS[b.key] || b.key}`);
  }
  parts.push(DATA_SRC);
  return parts.join(` ${MID} `);
}

export function topModelsText({ models } = {}) {
  const list = (models || []).filter((m) => typeof m === 'string' && m !== '');
  return `\u{1F3C5} Most-used AI on AntSeed (7d): ${list.join(` ${MID} `)} ${MID} ${DATA_SRC}`;
}

// Weekly market snapshot: a fixed-cadence digest that includes only the
// measures the live sources actually supplied. Market numbers come from the
// feed; antseedstats numbers are optional (that feed is a soft dependency).
export function digestText(d) {
  const lines = ['\u{1F4CA} lANTS weekly', ''];
  const market = [];
  if (Number.isFinite(d.floorAsk)) market.push(`Floor ${price3(d.floorAsk)}`);
  if (Number.isFinite(d.avg24h)) market.push(`24h avg ${price3(d.avg24h)}`);
  if (Number.isInteger(d.listedCount)) market.push(`${d.listedCount} listed`);
  if (market.length) lines.push(market.join(` ${MID} `));
  const stats = [];
  if (Number.isFinite(d.settled7d) && d.settled7d > 0) {
    let s = `7d settled ${usdWhole(d.settled7d)}`;
    if (Number.isFinite(d.sellers7d)) s += ` ${MID} ${countLabel(d.sellers7d)} sellers`;
    stats.push(s);
  }
  if (Number.isFinite(d.stakedAnts) && d.stakedAnts > 0) {
    let s = `${fmtCompact(d.stakedAnts)} ANTS staked`;
    if (Number.isFinite(d.stakedPct)) s += ` ${MID} ${Math.round(Number(d.stakedPct))}% of stakable`;
    stats.push(s);
  }
  if (stats.length) lines.push(stats.join(` ${MID} `));
  const usage = d.usage || {};
  const usageParts = [];
  if (Number.isFinite(usage.requests)) usageParts.push(`${fmtCompact(usage.requests)} requests`);
  if (Number.isFinite(usage.tokens)) usageParts.push(`${fmtCompact(usage.tokens)} tokens`);
  if (usageParts.length) lines.push(`24h ${usageParts.join(` ${MID} `)}`);
  const generative = d.generative || {};
  const genParts = [];
  if (Number.isFinite(generative.spendUsd)) genParts.push(usdWhole(generative.spendUsd));
  if (Number.isFinite(generative.videos)) genParts.push(`${fmtCompact(generative.videos)} videos`);
  if (genParts.length) lines.push(`7d generative ${genParts.join(` ${MID} `)}`);
  lines.push('');
  lines.push(`${SITE_URL} ${MID} ${DATA_SRC}`);
  return lines.join('\n');
}
