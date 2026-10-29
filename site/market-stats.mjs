// site/market-stats.mjs

/**
 * Fallback maximum supply of ANTS. MAX_SUPPLY() is read live from the token
 * by market-view.mjs; this constant is used when the RPC read fails.
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

// Resolve the sale amount (in wei) for an item: the on-chain amount is read
// live and is authoritative; the snapshot is only a fallback for a position
// whose chain read failed.
function resolveAmountWei(item, snapshot) {
  return item.chainAmount ?? item.amount ?? findPos(snapshot, item.nftId)?.amount ?? null;
}

/**
 * Compute historical market statistics from completed sales.
 *
 * @param {Array<Object>} items - List of sale items.
 * @param {Object} snapshot - Snapshot containing positions.
 * @param {Array<string|number>} internalIds - Listing IDs considered internal.
 * @param {number} nowSec - Current timestamp in seconds.
 * @param {number} [maxSupply=ANTS_MAX_SUPPLY] - Resolved ANTS max supply.
 * @param {number} [competitorVolumeUsd=0] - All-time external USDC volume from
 *   the competitor feed, added to our own sales (no overlap, see C1).
 * @returns {Object} Statistics object.
 */
export function computeMarketStats(items, snapshot, internalIds, nowSec, maxSupply = ANTS_MAX_SUPPLY, competitorVolumeUsd = 0) {
  const SECS_IN_DAY = 86400;
  const VOLUME_DAYS = 1;   // 24h volume, matching the native marketplace header
  const FDV_DAYS = 30;

  // Compare IDs as strings to handle BigInt listingIds
  const internalIdSet = new Set((internalIds || []).map(String));

  let volumeUsd = 0;      // sales in the last 24h
  let volume7dUsd = 0;    // sales in the last 7 days (kept for future use)
  let totalVolumeUsd = 0; // all-time external volume
  let externalSales30 = 0;
  let vwapUsd = 0;        // sum of USDC paid (30d, external)
  let vwapAnts = 0;       // sum of ANTS sold (30d, external)

  for (const item of items || []) {
    const soldTime = Number(item.soldTime);
    if (soldTime <= 0) continue; // not sold

    const isInternal = internalIdSet.has(String(item.listingId));
    if (isInternal) continue; // ignore internal sales

    const usdc = Number(item.price) / 1e6; // price is in micro-USDC
    totalVolumeUsd += usdc;
    const ageSec = nowSec - soldTime;

    if (ageSec <= VOLUME_DAYS * SECS_IN_DAY) {
      volumeUsd += usdc;
    }
    if (ageSec <= 7 * SECS_IN_DAY) {
      volume7dUsd += usdc;
    }

    // For FDV we need a known, non-zero amount
    const amountWei = resolveAmountWei(item, snapshot);
    if (amountWei && ageSec <= FDV_DAYS * SECS_IN_DAY) {
      const amount = Number(amountWei) / 1e18; // convert wei to token amount
      if (amount !== 0) {
        externalSales30 += 1;
        vwapUsd += usdc;
        vwapAnts += amount;
      }
    }
  }

  // FDV uses the size-weighted VWAP over external sales in the last 30 days:
  // total USDC paid / total ANTS sold, scaled to the full supply.
  const fdvUsd = vwapAnts > 0 ? (vwapUsd / vwapAnts) * maxSupply : null;
  const n = externalSales30;

  // Competitor volume is all-time only: it never enters the 24h/7d windows.
  const competitor = Number(competitorVolumeUsd);
  if (Number.isFinite(competitor) && competitor > 0) {
    totalVolumeUsd += competitor;
  }

  // Human-readable formatting
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
    volume7dUsd,
    totalVolumeUsd,
    fdvUsd,
    externalSales30,
    n,
    volumeText,
    fdvText,
  };
}

// BuyListing(uint256 indexed listingId, address indexed nftCollection,
// uint256 indexed nftId, address buyer, address currency, uint256 price,
// uint256 fee) emits the non-indexed payload as buyer(32) currency(32)
// price(32) fee(32); the paid price is the third 32-byte word.
export function buyListingPriceFromData(logData) {
  const data = String(logData || '').replace(/^0x/, '');
  if (data.length < 256) return null; // buyer(32) currency(32) price(32) fee(32)
  return BigInt('0x' + data.slice(128, 192));
}

/**
 * Compute implied valuation metrics from live external asks.
 *
 * Live listings only (sold/expired/cancelled are excluded by the caller's
 * readiness flags), external only, and rows with a zero/unknown amount are
 * skipped so dust cannot move the whole header.
 *
 * @param {Array<Object>} items - Listing items from readListings().
 * @param {Array<string|number>} internalIds - Listing IDs considered internal.
 * @param {Object} [opts] - Resolved token values.
 * @param {number} [opts.maxSupply] - ANTS max supply (defaults to the constant).
 * @param {number|null} [opts.minted] - ANTS minted (totalSupply); null when unknown.
 * @param {number|null} [opts.supplyCount] - Total position count (LISTED/SUPPLY
 *   denominator); defaults to `minted` when omitted.
 * @param {number|null} [opts.referencePrice] - Native-market 24h average sale
 *   price used for MC/FDV; falls back to the ask VWAP when omitted.
 * @param {Object|null} [opts.snapshot] - Snapshot with positions, used as the
 *   amount fallback when a listing has no on-chain amount (fresh split).
 * @returns {Object} Implied valuation object.
 */
export function computeImpliedFromAsks(items, internalIds, opts = {}) {  const maxSupply = opts.maxSupply ?? ANTS_MAX_SUPPLY;
  const minted = opts.minted ?? null;
  const supplyCount = opts.supplyCount ?? minted;
  const referencePrice = opts.referencePrice ?? null;
  const snapshot = opts.snapshot ?? null;
  const internalIdSet = new Set((internalIds || []).map(String));

  let sumUsdc = 0;            // total USDC asked, live external lots
  let sumAnts = 0;            // total ANTS offered, live external lots
  let floorAskPerAnts = null; // lowest per-ANTS ask
  let listedCount = 0;

  for (const item of items || []) {
    if (!item.isLive) continue; // sold / expired / cancelled excluded
    if (internalIdSet.has(String(item.listingId))) continue; // internal only

    const amountWei = resolveAmountWei(item, snapshot);
    if (amountWei === null) continue; // unknown amount
    const amount = Number(amountWei) / 1e18;
    if (!(amount > 0)) continue; // dust / zero-amount rows excluded

    const usdc = Number(item.price) / 1e6; // micro-USDC
    if (!(usdc > 0)) continue;

    const perAnts = usdc / amount;
    sumUsdc += usdc;
    sumAnts += amount;
    if (floorAskPerAnts === null || perAnts < floorAskPerAnts) {
      floorAskPerAnts = perAnts;
    }
    listedCount += 1;
  }

  const impliedPricePerAnts = listedCount > 0 ? sumUsdc / sumAnts : null; // VWAP of live asks
  // MC/FDV use the native-market 24h average sale price when available; the
  // ask VWAP is only a fallback for callers that do not pass a reference price.
  const valuationPrice = referencePrice ?? impliedPricePerAnts;
  return {
    impliedPricePerAnts,
    floorAskPerAnts,
    listedCount,
    supplyCount,
    referencePrice,
    mcUsd: minted != null && valuationPrice != null ? valuationPrice * minted : null,
    fdvUsd: valuationPrice != null ? valuationPrice * maxSupply : null,
  };
}

/**
 * Adapt validated Seaport feed lots to the shape computeImpliedFromAsks()
 * expects. The feed is already filtered (listed, fulfillable, positive USD);
 * amounts are converted with 6-decimal precision, which is enough for VWAP.
 *
 * @param {Array<Object>} items - normalized items from seaport-feed.mjs.
 * @returns {Array<Object>} ask items.
 */
export function seaportAsAskItems(items) {
  const out = [];
  for (const item of items || []) {
    const priceUsdc = Number(item?.priceUsdc);
    const amount = Number(item?.amount);
    if (!(priceUsdc > 0) || !(amount > 0)) continue;
    const priceMicro = Math.round(priceUsdc * 1e6);
    if (!(priceMicro > 0)) continue;
    const amountWei = BigInt(Math.round(amount * 1e6)) * 10n ** 12n;
    if (amountWei <= 0n) continue;
    out.push({
      listingId: 'seaport-' + item.id,
      nftId: String(item.id),
      price: priceMicro,
      isLive: true,
      chainAmount: amountWei,
    });
  }
  return out;
}
