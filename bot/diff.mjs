// Pure change-only diff for the market feed: previous feed state + current feed
// state -> candidate posts. No IO here; state.mjs applies the persisted
// dedup/queue and run.mjs formats, gates and ranks.
//
// The only feed-derived archetype is the epoch close (A). Listing/trade events
// are deliberately absent: they duplicate the competitor's Seaport ticker and
// are not our story (see docs/twitter-content-plan.md "Removed post types").

/**
 * @param {object|null} prev  { epoch }
 * @param {object} curr       { epoch }
 * @param {{emission?:(number|null), sellerPointsUsd?:(number|null), restakeBonusPct?:(number|null)}} opts
 * @returns {Array<{type:string, family:string, key:string, data:object}>}
 */
export function diffFeed(prev, curr, { emission = null, sellerPointsUsd = null, restakeBonusPct = null } = {}) {
  if (!prev || !curr) return [];
  if (!Number.isInteger(prev.epoch) || !Number.isInteger(curr.epoch)) return [];
  if (!(curr.epoch > prev.epoch)) return [];
  const closed = curr.epoch - 1;
  return [{
    type: 'epoch',
    family: 'epoch',
    key: `epoch:${closed}`,
    data: {
      epoch: closed,
      emissionAnts: Number.isFinite(emission) ? emission : null,
      sellerPointsUsd: Number.isFinite(sellerPointsUsd) ? sellerPointsUsd : null,
      restakeBonusPct: Number.isFinite(restakeBonusPct) ? restakeBonusPct : null,
    },
  }];
}
