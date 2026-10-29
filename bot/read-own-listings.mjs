// Read the marketplace's OWN listings — the positions listed through our
// VexyMarketplace interface (the 1% seller fee). This is the only listing
// source the bot posts: the competitor's Seaport orders on antseedmarkets.com
// are deliberately skipped (they are the competitor's to post). See
// docs/twitter-content-plan.md "Removed post types".
//
// readListings() is the canonical chain reader; this branch carries a
// self-contained copy under bot/ (fetch-only, no viem) so the container needs
// no node_modules.

import { readListings } from './own-listings.mjs';
import { INTERNAL_LISTING_IDS } from './market-config.mjs';

const WEI = 1e18;
const MICRO = 1e6;
const DAY_SEC = 86400;

function etherToAnts(wei) {
  const n = Number(wei);
  return Number.isFinite(n) ? n / WEI : 0;
}

// One decoded VexyMarketplace row -> the bot's listing lot, or null when it
// cannot be shown honestly (not live, internal wallet, mis-owned, closed, or no
// positive amount/price).
export function toOwnListing(item, nowSec) {
  if (!item || item.isLive !== true) return null;
  if (item.ownerMismatch || item.chainClosed) return null;
  if (INTERNAL_LISTING_IDS.includes(Number(item.listingId))) return null;
  const id = Number(item.nftId);
  if (!Number.isInteger(id) || id < 0) return null;
  const usd = Number(item.price) / MICRO;
  if (!(usd > 0)) return null;
  const amount = etherToAnts(item.chainAmount);
  if (!(amount > 0)) return null;
  const perAntUsd = usd / amount;
  if (!(perAntUsd > 0)) return null;
  const stakeEnd = item.chainStakeEnd == null ? null : Number(item.chainStakeEnd);
  const lockDays = Number.isFinite(stakeEnd) && stakeEnd > nowSec
    ? (stakeEnd - nowSec) / DAY_SEC
    : null;
  return {
    id,
    amount,
    perAntUsd,
    usd,
    lockDays: Number.isFinite(lockDays) && lockDays > 0 ? lockDays : null,
  };
}

// A live row whose on-chain position read failed is not evidence that the lot
// was delisted: report the whole read as failed so run.mjs keeps the previous
// listing set instead of posting a false "Delisted" (then a false re-listing
// when the RPC recovers).
export function hasIncompleteRows(rows) {
  return (rows || []).some((r) => r && r.isLive === true && r.chainAmount === null);
}

export async function readOwnListings({ fetchImpl = globalThis.fetch } = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  try {
    const rows = await readListings({ fetchImpl });
    if (hasIncompleteRows(rows)) return { ok: false, reason: 'partial' };
    const listings = (rows || []).map((r) => toOwnListing(r, nowSec)).filter(Boolean);
    return { ok: true, listings };
  } catch (e) {
    return { ok: false, reason: e && e.message ? e.message : 'network' };
  }
}
