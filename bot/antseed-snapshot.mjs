// Snapshot/state shapes for the antseedstats demand data. Pure conversions
// only: read-antseedstats.mjs parses the API; this module shapes the diff-ready
// snapshot and the compact state persisted in state.json.

import { maxCompletedEpoch } from './read-antseedstats.mjs';

// Full snapshot for diffing.
export function toAntseedSnapshot(result) {
  const n = result.network || {};
  return {
    settled24h: n.settled24h ?? null,
    settled7d: n.settled7d ?? null,
    settled30d: n.settled30d ?? null,
    settles24h: n.settles24h ?? null,
    settles7d: n.settles7d ?? null,
    settles30d: n.settles30d ?? null,
    sellers24h: n.sellers24h ?? null,
    sellers7d: n.sellers7d ?? null,
    sellers30d: n.sellers30d ?? null,
    buyers24h: n.buyers24h ?? null,
    buyers7d: n.buyers7d ?? null,
    buyers30d: n.buyers30d ?? null,
    requests24h: n.requests24h ?? null,
    tokens24h: n.tokens24h ?? null,
    videos24h: n.videos24h ?? null,
    coverage24h: n.coverage24h ?? null,
    generativeVideos7d: n.generativeVideos7d ?? null,
    generativeSpendUsd7d: n.generativeSpendUsd7d ?? null,
    epoch: n.epoch ?? null,
    secondsLeft: n.secondsLeft ?? null,
    stakedAnts: result.supply ? result.supply.stakedAnts : null,
    stakedPct: result.supply ? result.supply.stakedPct : null,
    burnedAnts: result.supply ? result.supply.burnedAnts : null,
    burns: result.supply ? result.supply.burns : [],
    restakeBonusPct: result.staking ? result.staking.restakeBonusPct : null,
    epochDetail: result.epochDetail || null,
    topModels: result.topModels || null,
    epochs: result.epochs ? result.epochs : [],
  };
}

// Bucket a countdown into its nearest emitted boundary, or null when far out.
export function countdownBucket(secondsLeft) {
  if (!Number.isFinite(secondsLeft)) return null;
  if (secondsLeft <= 3600) return '1h';
  if (secondsLeft <= 21600) return '6h';
  return null;
}

// Compact form persisted in state.json. `prev` carries the run-dependent
// post-baselines (posted, max7d) that a fresh snapshot does not know about.
export function toAntseedState(snapshot, prev = null) {
  const prevPosted = prev?.posted ?? {};
  // Seed any missing baseline (new field on an old state) from the current
  // snapshot so the upgrade run posts nothing, same as the existing `posted`.
  const posted = {
    settled7d: prevPosted.settled7d ?? snapshot.settled7d,
    settled30d: prevPosted.settled30d ?? snapshot.settled30d,
    stakedAnts: prevPosted.stakedAnts ?? snapshot.stakedAnts,
    requests24h: prevPosted.requests24h ?? snapshot.requests24h ?? null,
  };
  const seedBucket = countdownBucket(snapshot.secondsLeft);
  const countdownPosted = prev?.countdownPosted
    ?? (seedBucket && Number.isInteger(snapshot.epoch) ? { [snapshot.epoch]: seedBucket } : {});
  return {
    settled24h: snapshot.settled24h,
    settled7d: snapshot.settled7d,
    settled30d: snapshot.settled30d,
    settles7d: snapshot.settles7d,
    sellers7d: snapshot.sellers7d,
    settles30d: snapshot.settles30d,
    sellers30d: snapshot.sellers30d,
    stakedAnts: snapshot.stakedAnts,
    stakedPct: snapshot.stakedPct,
    burnedAnts: snapshot.burnedAnts,
    burns: snapshot.burns,
    maxCompletedEpoch: maxCompletedEpoch(snapshot.epochs),
    posted,
    // All-time high of settled7d; a new high always posts (record key).
    max7d: prev?.max7d ?? snapshot.settled7d,
    // Timestamps of the last successful post per continuous metric, used for
    // the per-metric cooldown (24h settled, 48h staked).
    postedAt: prev?.postedAt ?? {},
    // Per-epoch countdown bucket already emitted (once per epoch per bucket).
    countdownPosted,
    // Timestamp of the last top-models post (7-day gate, disabled by default).
    lastTopModelsAt: prev?.lastTopModelsAt ?? null,
  };
}
