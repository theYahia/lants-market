// site/market-stats.mjs

/**
 * Maximum supply of ANTS token.
 * @type {number}
 */
export const ANTS_MAX_SUPPLY = 1.04e9;

/**
 * Find a position in a snapshot by NFT id.
 *
 * @param {Object} snapshot - Snapshot object that may contain a `positions` array.
 * @param {string|number} nftId - NFT identifier to look for.
 * @returns {Object|null} Position object with fields `id` and `amount` (wei) or null.
 */
function findPos(snapshot, nftId) {
  if (!snapshot?.positions) return null;
  for (const p of snapshot.positions) {
    if (String(p.id) === String(nftId)) return p;
  }
  return null;
}

/**
 * Compute market statistics.
 *
 * @param {Array<Object>} items - List of sale items.
 * @param {Object} snapshot - Snapshot containing positions.
 * @param {Array<string|number>} internalIds - Listing IDs considered internal.
 * @param {number} nowSec - Current timestamp in seconds.
 * @returns {Object} Statistics object.
 */
export function computeMarketStats(items, snapshot, internalIds, nowSec) {
  const SECS_IN_DAY = 86400;
  const VOLUME_DAYS = 7;
  const FDV_DAYS = 30;

  // Compare IDs as strings to handle BigInt listingIds
  const internalIdSet = new Set(internalIds.map(String));

  let volumeUsd = 0;
  let externalSales30 = 0;
  const pricePerAnts = [];

  for (const item of items) {
    const soldTime = Number(item.soldTime);
    if (soldTime <= 0) continue; // not sold

    const isInternal = internalIdSet.has(String(item.listingId));
    if (isInternal) continue; // ignore internal sales

    const usdc = Number(item.price) / 1e6; // price is in micro‑USDC
    const ageSec = nowSec - soldTime;

    // Volume: sales in the last 7 days (add regardless of amount)
    if (ageSec <= VOLUME_DAYS * SECS_IN_DAY) {
      volumeUsd += usdc;
    }

    // Resolve amount (wei) from possible fields
    const amountWei =
      item.amount ??
      item.chainAmount ??
      findPos(snapshot, item.nftId)?.amount;

    // For FDV we need a known, non‑zero amount
    if (amountWei) {
      const amount = Number(amountWei) / 1e18; // convert wei to token amount
      if (amount !== 0 && ageSec <= FDV_DAYS * SECS_IN_DAY) {
        externalSales30 += 1;
        pricePerAnts.push(usdc / amount);
      }
    }
  }

  // Compute FDV using median price per ANTS
  let fdvUsd = null;
  if (pricePerAnts.length >= 3) {
    pricePerAnts.sort((a, b) => a - b);
    const mid = Math.floor(pricePerAnts.length / 2);
    const median =
      pricePerAnts.length % 2 === 0
        ? (pricePerAnts[mid - 1] + pricePerAnts[mid]) / 2
        : pricePerAnts[mid];
    fdvUsd = median * ANTS_MAX_SUPPLY;
  }

  // Human‑readable formatting
  const volumeText = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(volumeUsd);

  const fdvText =
    fdvUsd === null
      ? '—'
      : new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          notation: 'compact',
          maximumFractionDigits: 2,
        }).format(fdvUsd);

  return {
    volumeUsd,
    fdvUsd,
    externalSales30,
    volumeText,
    fdvText,
  };
}