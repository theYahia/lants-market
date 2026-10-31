// Live/demand post-type diff: the antseedstats sections the core diff does not
// cover — 7d modality spend, video milestones, lifetime milestones, 24h
// leaders, yesterday's network day, the DIEM capacity pool and reward budgets.
// Pure functions; the shared continuous-diff helper (changedBy) and date key
// live here so diff.mjs and this module share one definition.

import { modalityText, videoText, lifetimeText, leadersText, dailyText, diemText, usageTargetText, pct } from './format.mjs';
import { latestCompleteDay } from './read-antseedstats-live.mjs';
import { milestoneBucket, LIFETIME_MILESTONES, VIDEO_MILESTONE_STEP } from './antseed-snapshot.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const CHANGE_THRESHOLD = 0.05;

export function dateKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// A continuous metric posts only past this relative change from the last posted
// value; a missing/zero baseline returns false so it seeds silently.
export function changedBy(prevValue, currValue) {
  return prevValue > 0 && currValue > 0 && Math.abs(currValue - prevValue) / prevValue >= CHANGE_THRESHOLD;
}

export function diffLiveStats(prev, curr, { posted, nowMs }) {
  const events = [];

  // 7d spend by modality (text/images/video), weekly. All three must be present
  // or the split would read as incomplete.
  if (Number.isFinite(curr.modalityTextUsd) && Number.isFinite(curr.modalityVideoUsd) && Number.isFinite(curr.modalityImagesUsd)) {
    const last = prev.lastModalityAt;
    if (!last || nowMs - last >= WEEK_MS) {
      events.push({
        type: 'modality',
        key: `modality:${dateKey(nowMs)}`,
        text: modalityText({ textUsd: curr.modalityTextUsd, videoUsd: curr.modalityVideoUsd, imagesUsd: curr.modalityImagesUsd }),
        meta: { field: 'lastModalityAt', value: nowMs },
      });
    }
  }

  // Native video-inference volume milestone (7d videos), round buckets.
  const videoBucket = milestoneBucket(curr.generativeVideos7d, VIDEO_MILESTONE_STEP);
  const videoPosted = posted.videoMilestone ?? videoBucket;
  if (videoBucket > videoPosted) {
    events.push({
      type: 'video',
      key: `video:${videoBucket}`,
      text: videoText({ videos: curr.generativeVideos7d, spendUsd: curr.generativeSpendUsd7d }),
      meta: { field: 'videoMilestone', value: videoBucket },
    });
  }

  // Lifetime milestones: settlements, settled volume, buyers, sellers.
  for (const { field, kind, step } of LIFETIME_MILESTONES) {
    const currBucket = milestoneBucket(curr[field], step);
    const prevBucket = posted[field] ?? currBucket;
    if (currBucket > prevBucket) {
      events.push({
        type: 'lifetime',
        key: `lifetime:${field}:${currBucket}`,
        text: lifetimeText(kind, currBucket),
        meta: { field, value: currBucket },
      });
    }
  }

  const todayKey = dateKey(nowMs);

  // 24h leaders, once per calendar day.
  if (curr.leaders && curr.leaders.topModelSales && curr.leaders.topModelSales.display) {
    if (prev.lastLeadersDay !== todayKey) {
      events.push({
        type: 'leaders',
        key: `leaders:${todayKey}`,
        text: leadersText(curr.leaders),
        meta: { field: 'lastLeadersDay', value: todayKey },
      });
    }
  }

  // Yesterday's fully-closed network day, once per calendar day.
  const day = latestCompleteDay(curr.daily, nowMs);
  if (day && prev.lastDailyDay !== todayKey) {
    events.push({
      type: 'daily',
      key: `daily:${todayKey}`,
      text: dailyText({ settledUsd: day.settledUsd, requests: day.requests, newUsers: day.newUsers }),
      meta: { field: 'lastDailyDay', value: todayKey },
    });
  }

  // DIEM capacity pool, change-only on the USD stake value (no yield).
  if (curr.diem && changedBy(posted.diemStake, curr.diem.stakeValueUsd)) {
    events.push({
      type: 'diem',
      field: 'diemStake',
      value: curr.diem.stakeValueUsd,
      key: `diem:${Math.round(curr.diem.stakeValueUsd)}`,
      text: diemText({
        stakeValueUsd: curr.diem.stakeValueUsd,
        stakers: curr.diem.stakers,
        usdcDistributedUsd: curr.diem.usdcDistributedUsd,
        pctChange: pct(posted.diemStake, curr.diem.stakeValueUsd),
      }),
      meta: { field: 'diemStake', value: curr.diem.stakeValueUsd },
    });
  }

  // Reward budgets vs targets (demand-vs-ceiling), weekly.
  if (curr.rewards && Number.isFinite(curr.rewards.usagePctOfTarget)) {
    const last = prev.lastUsageTargetAt;
    if (!last || nowMs - last >= WEEK_MS) {
      events.push({
        type: 'usagetarget',
        key: `usagetarget:${dateKey(nowMs)}`,
        text: usageTargetText({
          epoch: curr.rewards.epoch,
          usagePctOfTarget: curr.rewards.usagePctOfTarget,
          stakePctOfTarget: curr.rewards.stakePctOfTarget,
        }),
        meta: { field: 'lastUsageTargetAt', value: nowMs },
      });
    }
  }

  return events;
}
