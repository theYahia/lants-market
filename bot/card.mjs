// SVG cards for the posts that carry numbers: the market board (B), the epoch
// close (A) and the lot highlight (C). 1200×675 (X's 16:9 timeline preview), the
// site's dark theme, no emoji, DejaVu Sans (present on ubuntu-latest runners).
//
// Pure builders: same input -> same SVG string. Rasterisation is a separate,
// optional step (renderPng) so the text post never depends on it. Output is
// ASCII-only: a provider name may contain Cyrillic or emoji, which DejaVu on CI
// would render as tofu.

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { epochBoundary } from '../site/epochs.mjs';
import { fmtAmount, fmtCompact, usdWhole } from './format.mjs';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 675;

const BG = '#14171a';
const PANEL = '#1c2024';
const BORDER = '#2a2f35';
const FG = '#eef2f5';
const MUTED = '#93a1ad';
const ACCENT = '#3ecf9a';
const FONT = 'DejaVu Sans, Verdana, sans-serif';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function ascii(value) {
  return String(value == null ? '' : value).replace(/[^\x20-\x7E]/g, '').trim();
}

function formatDate(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '-';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatIsoDate(iso) {
  if (typeof iso !== 'string' || iso.length < 10) return '-';
  const ms = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return formatDate(ms);
}

function price3(v) {
  return Number.isFinite(v) ? '$' + Number(v).toFixed(3) : '-';
}

function orDash(v) {
  return v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v)) ? '-' : String(v);
}

function valueSize(text) {
  const len = String(text).length;
  if (len > 20) return 20;
  if (len > 15) return 22;
  if (len > 13) return 24;
  if (len > 10) return 30;
  return 38;
}

function tile(x, y, w, h, label, value) {
  const text = orDash(value);
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${PANEL}" stroke="${BORDER}" stroke-width="1"/>`,
    `<text x="${x + 24}" y="${y + 44}" font-family="${FONT}" font-size="16" letter-spacing="1.5" fill="${MUTED}">${esc(label.toUpperCase())}</text>`,
    `<text x="${x + 24}" y="${y + 108}" font-family="${FONT}" font-size="${valueSize(text)}" font-weight="700" fill="${FG}">${esc(text)}</text>`,
  ].join('');
}

function card({ title, subtitle, tiles, footer }) {
  const cols = tiles.length <= 5 ? 3 : 4;
  const pad = 64;
  const gap = 24;
  const top = 196;
  const tileW = Math.floor((CARD_WIDTH - pad * 2 - gap * (cols - 1)) / cols);
  const tileH = 168;
  const body = tiles.map((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return tile(pad + col * (tileW + gap), top + row * (tileH + gap), tileW, tileH, t.label, t.value);
  }).join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">`,
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${BG}"/>`,
    `<rect x="0" y="0" width="${CARD_WIDTH}" height="6" fill="${ACCENT}"/>`,
    `<text x="${pad}" y="96" font-family="${FONT}" font-size="44" font-weight="700" fill="${FG}">${esc(title)}</text>`,
    `<text x="${pad}" y="140" font-family="${FONT}" font-size="22" fill="${MUTED}">${esc(subtitle)}</text>`,
    body,
    `<text x="${pad}" y="636" font-family="${FONT}" font-size="18" fill="${MUTED}">${esc(footer)}</text>`,
    '</svg>',
  ].join('');
}

/** Market board card: floor, 24h avg, listed, bids, supply, 7d settled, staked, epoch. */
export function boardCard(board = {}) {
  const supply = Number.isFinite(board.minted) && Number.isFinite(board.maxSupply)
    ? `${fmtCompact(board.minted)} / ${fmtCompact(board.maxSupply)}`
    : '-';
  const listed = Number.isFinite(board.listedCount) && Number.isFinite(board.totalNfts)
    ? `${board.listedCount}/${board.totalNfts}`
    : orDash(board.listedCount);
  return card({
    title: 'lANTS market board',
    subtitle: `Epoch ${orDash(board.epoch)} | locked ANTS positions on Base`,
    tiles: [
      { label: 'Floor ask', value: price3(board.floorAsk) },
      { label: '24h avg sale', value: price3(board.avg24h) },
      { label: 'Listed', value: listed },
      { label: 'Open bids', value: orDash(board.offeredCount) },
      { label: 'ANTS supply', value: supply },
      { label: 'Settled 7d', value: Number.isFinite(board.settled7d) ? usdWhole(board.settled7d) : '-' },
      { label: 'Staked', value: Number.isFinite(board.stakedPct) ? `${Math.round(board.stakedPct)}%` : '-' },
      { label: 'Epoch', value: orDash(board.epoch) },
    ],
    footer: 'lants.eth.limo - data: antseedstats.com',
  });
}

/** Epoch close card: epoch, emission, seller points, restake bonus, next close. */
export function epochCard(data = {}) {
  const next = Number.isInteger(Number(data.epoch)) ? formatDate(epochBoundary(Number(data.epoch) + 1).getTime()) : '-';
  return card({
    title: `Epoch ${orDash(data.epoch)} closed`,
    subtitle: 'AntSeed staking epoch - rewards claimable',
    tiles: [
      { label: 'Epoch', value: orDash(data.epoch) },
      { label: 'Emission', value: Number.isFinite(data.emissionAnts) && data.emissionAnts > 0 ? `${fmtCompact(data.emissionAnts)} ANTS` : '-' },
      { label: 'Seller points', value: Number.isFinite(data.sellerPointsUsd) && data.sellerPointsUsd > 0 ? usdWhole(data.sellerPointsUsd) : '-' },
      { label: 'Restake bonus', value: Number.isFinite(data.restakeBonusPct) && data.restakeBonusPct > 0 ? `+${Math.round(data.restakeBonusPct)}% power` : '-' },
      { label: 'Next close', value: next },
    ],
    footer: 'lants.eth.limo - data: antseedstats.com',
  });
}

/** Lot card: id, ANTS, USD, $/ANTS, unlock date, ANTS/epoch, provider. */
export function lotCard(lot = {}) {
  const reward = Number.isFinite(lot.rewardAnts) ? fmtAmount(lot.rewardAnts) : '-';
  const unlock = typeof lot.unlockAt === 'string'
    ? formatIsoDate(lot.unlockAt)
    : (Number.isFinite(lot.daysRemaining) ? `${lot.daysRemaining} days` : '-');
  return card({
    title: `Locked ANTS lot #${orDash(lot.id)}`,
    subtitle: 'Cheapest live lot by $/ANTS - staking reward included',
    tiles: [
      { label: 'Position', value: `#${orDash(lot.id)}` },
      { label: 'ANTS', value: Number.isFinite(lot.amount) ? fmtAmount(lot.amount) : '-' },
      { label: 'Price', value: Number.isFinite(lot.usd) ? `$${Number(lot.usd).toFixed(2)}` : '-' },
      { label: '$/ANTS', value: price3(lot.perAntUsd) },
      { label: 'Unlocks', value: unlock },
      { label: 'ANTS / epoch', value: reward },
      { label: 'Provider', value: ascii(lot.provider) || orDash(lot.agentId) },
    ],
    footer: 'lants.eth.limo - every number verifiable on-chain',
  });
}

// The card that belongs to an archetype family, or null when the family has no
// card (network, edu).
export function cardFor(family, data) {
  if (family === 'board') return boardCard(data);
  if (family === 'epoch') return epochCard(data);
  if (family === 'lot') return lotCard(data);
  return null;
}

/**
 * Rasterise SVG -> PNG. @resvg/resvg-js is a devDependency with prebuilt
 * binaries (no system libs); it is imported lazily so a missing dev install
 * only disables images, never the text post.
 */
export async function renderPng(svg) {
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: CARD_WIDTH },
    font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' },
  });
  const png = resvg.render().asPng();
  return Buffer.from(png);
}

// node bot/card.mjs --demo > tmp-card.svg
const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain && process.argv.includes('--demo')) {
  process.stdout.write(boardCard({
    epoch: 28,
    floorAsk: 0.14,
    avg24h: 0.101931,
    listedCount: 15,
    totalNfts: 483,
    offeredCount: 0,
    minted: 129929424.068,
    maxSupply: 1040000000,
    settled7d: 13772,
    stakedPct: 73,
  }));
}
