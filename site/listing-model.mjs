// Unified lot model for the storefront: our own 1%-seller listings and the
// aggregated Seaport orders become one list keyed by token id, each joined to
// its snapshot position. Pure functions only (no fetch, no DOM).

import { INTERNAL_LISTING_IDS } from './market-config.mjs';

export const DUST_WEI = 10n ** 18n;

function findPosition(snapshot, tokenId) {
  const positions = snapshot?.positions || snapshot?.rows || [];
  return positions.find((p) => String(p.id) === String(tokenId)) || null;
}

function providerName(agentId, poolNames, fallback) {
  if (agentId != null) {
    const named = poolNames?.[String(agentId)];
    if (named) return named;
  }
  return fallback || (agentId != null ? '#' + agentId : 'unknown provider');
}

function isActivePosition(pos, curEpoch) {
  if (!pos || pos.withdrawn) return false;
  const closedAt = Number(pos.closedAtEpoch || 0);
  return !(closedAt > 0 && closedAt <= curEpoch);
}

function etherToAnts(wei) {
  const n = Number(wei);
  return Number.isFinite(n) ? n / 1e18 : 0;
}

function enrichLot(lot, snapshot, poolNames, curEpoch) {
  const pos = lot.position;
  const amountAnts = lot.amountAnts ?? etherToAnts(pos?.amount);
  const priceUsdc = lot.priceUsdc ?? null;
  const pending = Number(pos?.stakeStartEpoch || 0) > curEpoch;
  const status = priceUsdc != null ? (pending ? 'pending' : 'listed') : (pending ? 'pending' : 'unlisted');
  return {
    ...lot,
    amountAnts,
    perAntUsd: priceUsdc != null && amountAnts > 0 ? priceUsdc / amountAnts : null,
    provider: providerName(pos?.agentId ?? lot.agentId, poolNames, lot.sellerName),
    status,
  };
}

/**
 * Build the unified lot list.
 *
 * @param {Array} ownListings - items from readListings() (live rows are used).
 * @param {Array} seaportItems - normalized items from fetchSeaportMarket().
 * @param {Object} snapshot - snapshot with positions.
 * @param {Object} poolNames - agentId -> provider name.
 * @param {Object} [opts] - { internalIds }
 * @returns {Array} lots with the cheaper source kept and `alsoOn` filled.
 */
export function buildLots(ownListings, seaportItems, snapshot, poolNames = {}, opts = {}) {
  const curEpoch = Number(snapshot?.epoch || 0);
  const internal = new Set((opts.internalIds ?? INTERNAL_LISTING_IDS).map(String));
  const byToken = new Map();

  const add = (lot) => {
    const existing = byToken.get(lot.tokenId);
    if (!existing) {
      byToken.set(lot.tokenId, { ...lot, alsoOn: [] });
      return;
    }
    const incoming = lot.priceUsdc ?? Infinity;
    const current = existing.priceUsdc ?? Infinity;
    const keep = incoming < current ? lot : existing;
    const other = incoming < current ? existing : lot;
    byToken.set(lot.tokenId, {
      ...keep,
      alsoOn: Array.from(new Set([...(keep.alsoOn || []), other.source, ...(other.alsoOn || [])])),
    });
  };

  for (const item of ownListings || []) {
    if (!item.isLive) continue;
    if (internal.has(String(item.listingId))) continue;
    const priceMicro = Number(item.price);
    if (!(priceMicro > 0)) continue;
    const tokenId = Number(item.nftId);
    const pos = findPosition(snapshot, tokenId);
    if (!pos) continue;
    const chainAmount = item.chainAmount != null ? item.chainAmount : pos.amount;
    add({
      source: 'lants',
      tokenId,
      listingId: Number(item.listingId),
      priceUsdc: priceMicro / 1e6,
      seller: item.seller ? String(item.seller).toLowerCase() : null,
      amountAnts: etherToAnts(chainAmount),
      agentId: pos.agentId,
      position: pos,
      alsoOn: [],
    });
  }

  for (const item of seaportItems || []) {
    if (!(item.priceUsdc > 0)) continue;
    const tokenId = Number(item.id);
    const pos = findPosition(snapshot, tokenId);
    if (!pos) continue;
    add({
      source: 'seaport',
      tokenId,
      listingId: null,
      priceUsdc: item.priceUsdc,
      seller: item.owner ? String(item.owner).toLowerCase() : null,
      sellerName: item.sellerName || null,
      amountAnts: etherToAnts(pos.amount),
      agentId: pos.agentId,
      position: pos,
      alsoOn: [],
    });
  }

  const lots = [];
  for (const lot of byToken.values()) lots.push(enrichLot(lot, snapshot, poolNames, curEpoch));
  lots.sort((a, b) => {
    const ap = a.perAntUsd == null ? Infinity : a.perAntUsd;
    const bp = b.perAntUsd == null ? Infinity : b.perAntUsd;
    if (ap !== bp) return ap < bp ? -1 : 1;
    return a.tokenId - b.tokenId;
  });
  return lots;
}

/**
 * Add a card for every active, non-dust position that has no lot. These are
 * "Not listed" lots: no price, Make offer and Share only.
 */
export function buildUnlistedLots(snapshot, existingLots, poolNames = {}) {
  const curEpoch = Number(snapshot?.epoch || 0);
  const have = new Set((existingLots || []).map((l) => String(l.tokenId)));
  const out = [];

  for (const pos of snapshot?.positions || []) {
    if (!isActivePosition(pos, curEpoch)) continue;
    let amountWei;
    try {
      amountWei = BigInt(String(pos.amount));
    } catch (e) {
      continue; // malformed row: no amount, no card
    }
    if (amountWei <= DUST_WEI) continue; // dust is aggregated in List view
    if (have.has(String(pos.id))) continue;
    out.push(enrichLot({
      source: 'lants',
      tokenId: Number(pos.id),
      listingId: null,
      priceUsdc: null,
      seller: null,
      amountAnts: etherToAnts(pos.amount),
      agentId: pos.agentId,
      position: pos,
      alsoOn: [],
    }, snapshot, poolNames, curEpoch));
  }
  return out;
}

// Listed lots first, then by the storefront's default sort key.
export function mergeStorefrontLots(lots, unlisted) {
  return [...(lots || []), ...(unlisted || [])];
}
