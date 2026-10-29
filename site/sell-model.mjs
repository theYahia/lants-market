// Pure helpers for the sell flow: sellable classification and fee math.
// No DOM, no fetch; the modal view and the flow module build on these.
import { positionState } from './portfolio-state.mjs';
import { MARKET } from './market-config.mjs';

const FEE_RATE = 0.01;
const USDC_UNIT = 10 ** MARKET.usdcDecimals;
const MIN_PRICE_UNITS = BigInt(USDC_UNIT / 100); // 0.01 USDC

// USDC price (human string/number) -> integer micro-USDC for the listing call.
// Reject anything below the form's 0.01 USDC step or rounding to zero units.
export function usdcToWei(priceUsdc) {
  const n = Number(priceUsdc);
  if (!Number.isFinite(n) || n <= 0) return null;
  const wei = BigInt(Math.round(n * USDC_UNIT));
  return wei >= MIN_PRICE_UNITS ? wei : null;
}

export function etherToAnts(wei) {
  const n = Number(wei);
  return Number.isFinite(n) ? n / 1e18 : null;
}

// Buyer price is final; the 1% fee is seller-side only.
export function feeBreakdown(priceUsdc, ants) {
  const gross = Number(priceUsdc);
  if (!Number.isFinite(gross) || gross <= 0) return null;
  const fee = gross * FEE_RATE;
  const net = gross - fee;
  const antsN = Number(ants);
  const perAnts = Number.isFinite(antsN) && antsN > 0 ? gross / antsN : null;
  return { gross, fee, net, perAnts };
}

export function clampDays(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 60) return null;
  return Math.floor(n);
}

export function dateFromSeconds(sec) {
  const n = Number(sec);
  if (!(n > 0)) return '-';
  return new Date(n * 1000).toISOString().slice(0, 10);
}

export function endDateFromDays(days, nowMs = Date.now()) {
  const n = clampDays(days);
  if (n === null) return '-';
  return new Date(nowMs + n * 86400000).toISOString().slice(0, 10);
}

// Price, seller net and end date for a My Listings row.
export function listingMeta(item) {
  const priceUsdc = Number(item && item.price) / USDC_UNIT;
  if (!(priceUsdc > 0)) return { priceUsdc: null, netUsdc: null, endLabel: '-' };
  return {
    priceUsdc,
    netUsdc: priceUsdc * (1 - FEE_RATE),
    endLabel: dateFromSeconds(item.endTime),
  };
}

// Classify the wallet's live ids for the picker: sellable, already listed,
// pending (starts next epoch) or missing from the snapshot. Burned, closed and
// withdrawn positions are dropped: there is nothing left to sell.
export function buildSellChoices({ myIds = [], positions = [], listings = [], account = '', epoch = 0 } = {}) {
  const who = String(account || '').toLowerCase();
  const byId = new Map((positions || []).map((p) => [String(p.id), p]));
  const liveByNft = new Map();
  for (const item of listings || []) {
    if (!item.isLive || item.ownerMismatch || item.chainClosed) continue;
    if (String(item.seller || '').toLowerCase() !== who) continue;
    liveByNft.set(String(item.nftId), item);
  }

  const out = [];
  for (const raw of myIds || []) {
    const tokenId = String(raw);
    const listed = liveByNft.get(tokenId);
    if (listed) {
      out.push({
        tokenId,
        state: 'listed',
        ants: null,
        listingId: String(listed.listingId),
        priceUsdc: Number(listed.price) / USDC_UNIT,
      });
      continue;
    }
    const pos = byId.get(tokenId);
    if (!pos) {
      out.push({ tokenId, state: 'unavailable', ants: null });
      continue;
    }
    if (pos.withdrawn) continue;
    if (positionState(pos, epoch) !== 'open') continue;
    if (Number(pos.stakeStartEpoch || 0) > Number(epoch)) {
      out.push({ tokenId, state: 'pending', ants: etherToAnts(pos.amount) });
      continue;
    }
    out.push({ tokenId, state: 'sellable', ants: etherToAnts(pos.amount) });
  }
  return out;
}
