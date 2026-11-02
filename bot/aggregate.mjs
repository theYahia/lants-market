// Aggregation for the two data-heavy archetypes: the market board (B) and the
// lot highlight (C). Pure functions over the already-read market feed, the
// antseedstats snapshot and the position snapshot — no IO, no formatting.
//
// Implied MC/FDV are NOT recomputed here: computeImpliedFromAsks from
// site/market-stats.mjs is the single implementation, and it is fed the native
// market 24h average sale price as the valuation reference (an inflated ask
// must never move the headline valuation — AGENTS.md invariant).

import { ANTS_MAX_SUPPLY, computeImpliedFromAsks } from '../site/market-stats.mjs';
import { epochBoundary } from '../site/epochs.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

// A lot smaller than this is dust: not a story, and the wording ("cheapest way
// in") would be technically true but useless.
export const MIN_LOT_ANTS = 100;

// Live listings -> the ask-item shape computeImpliedFromAsks expects. Amount is
// carried in wei (6-decimal price precision is enough for a VWAP).
function askItems(listings) {
  const out = [];
  for (const lot of listings || []) {
    const usd = Number(lot.usd);
    const amount = Number(lot.amount);
    if (!(usd > 0) || !(amount > 0)) continue;
    const priceMicro = Math.round(usd * 1e6);
    if (!(priceMicro > 0)) continue;
    const amountWei = BigInt(Math.round(amount * 1e6)) * 10n ** 12n;
    if (amountWei <= 0n) continue;
    out.push({
      listingId: 'seaport-' + lot.id,
      nftId: String(lot.id),
      price: priceMicro,
      isLive: true,
      chainAmount: amountWei,
    });
  }
  return out;
}

/**
 * Board numbers for a market board post and its card.
 *
 * @param {object} args
 * @param {object} args.market   toMarket() output
 * @param {object|null} args.antseed toAntseedSnapshot() output (soft dependency)
 * @param {number|null} args.epoch   active epoch
 * @returns {object|null}
 */
export function buildBoard({ market, antseed = null, epoch = null } = {}) {
  if (!market) return null;
  const minted = Number.isFinite(market.minted) ? market.minted : null;
  const maxSupply = ANTS_MAX_SUPPLY;
  const implied = computeImpliedFromAsks(askItems(market.listings), [], {
    maxSupply,
    minted,
    supplyCount: Number.isFinite(market.totalNfts) ? market.totalNfts : minted,
    referencePrice: Number.isFinite(market.avg24h) ? market.avg24h : null,
  });
  return {
    epoch: Number.isInteger(epoch) ? epoch : market.epoch,
    listedCount: Number.isFinite(market.listedCount) ? market.listedCount : null,
    totalNfts: Number.isFinite(market.totalNfts) ? market.totalNfts : null,
    offeredCount: Number.isFinite(market.offeredCount) ? market.offeredCount : null,
    floorAsk: Number.isFinite(market.floorAsk) ? market.floorAsk : null,
    avg24h: Number.isFinite(market.avg24h) ? market.avg24h : null,
    askVwap: implied.impliedPricePerAnts,
    mcUsd: implied.mcUsd,
    fdvUsd: implied.fdvUsd,
    minted,
    maxSupply,
    settled7d: antseed && Number.isFinite(antseed.settled7d) ? antseed.settled7d : null,
    buyers7d: antseed && Number.isFinite(antseed.buyers7d) ? antseed.buyers7d : null,
    sellers7d: antseed && Number.isFinite(antseed.sellers7d) ? antseed.sellers7d : null,
    stakedPct: antseed && Number.isFinite(antseed.stakedPct) ? antseed.stakedPct : null,
  };
}

function daysUntil(unlockMs, nowMs) {
  if (!Number.isFinite(unlockMs)) return null;
  return Math.max(0, Math.round((unlockMs - nowMs) / DAY_MS));
}

/**
 * Cheapest live lot worth highlighting, restricted to positions the snapshot
 * confirms: it must have a lock end epoch and a reward recorded for `epoch`
 * (so the post's "earning staking rewards" claim is checkable).
 *
 * @returns {object|null} null when there is no snapshot or no lot ≥ 100 ANTS.
 */
export function pickLot({ market, snapshot, epoch, nowMs = Date.now() } = {}) {
  if (!market || !Array.isArray(market.listings) || market.listings.length === 0) return null;
  if (!snapshot || !snapshot.ok || !Array.isArray(snapshot.positions)) return null;
  if (!Number.isInteger(epoch)) return null;

  const key = String(epoch);
  const byId = new Map();
  for (const pos of snapshot.positions) byId.set(String(pos.id), pos);

  let best = null;
  for (const lot of market.listings) {
    if (!(Number(lot.amount) >= MIN_LOT_ANTS)) continue;
    if (!(Number(lot.perAntUsd) > 0) || !(Number(lot.usd) > 0)) continue;
    const pos = byId.get(String(lot.id));
    if (!pos) continue;
    if (!Number.isInteger(pos.stakeEndEpoch)) continue;
    const reward = pos.rewardByEpoch ? pos.rewardByEpoch[key] : undefined;
    if (!Number.isFinite(reward)) continue;
    if (best === null || Number(lot.perAntUsd) < best.perAntUsd) {
      const unlockMs = epochBoundary(pos.stakeEndEpoch).getTime();
      best = {
        id: lot.id,
        amount: Number(lot.amount),
        usd: Number(lot.usd),
        perAntUsd: Number(lot.perAntUsd),
        agentId: Number.isInteger(lot.agentId) ? lot.agentId : pos.agentId ?? null,
        provider: lot.sellerName || null,
        stakeEndEpoch: pos.stakeEndEpoch,
        unlockAt: new Date(unlockMs).toISOString().slice(0, 10),
        daysRemaining: daysUntil(unlockMs, nowMs),
        rewardAnts: reward,
      };
    }
  }
  return best;
}
