// Pure change-only diff: previous feed state + current feed state -> posts.
// Dedup keys follow plan section 6:
//   floor   -> (floor value)
//   trade   -> (trade id)
//   listing -> (token id + listed flag)
//   epoch   -> (closed epoch number)
// antseedstats types (diffAntseedStats):
//   burn -> (epoch), settled -> (window + value), staked -> (value),
//   epochstats -> (epoch)
// No IO here; state.mjs applies the persisted dedup/queue.

import { floorText, tradeText, newListingText, delistText, epochText, burnText, settledText, stakedText, epochStatsText } from './format.mjs';
import { maxCompletedEpoch } from './read-antseedstats.mjs';

const asIdSet = (list) => new Set((list || []).map((v) => String(v)));

// Continuous antseedstats metrics post only past this relative change, so a
// run never spams one tweet per drifting number (handoff: "record / ±5%").
const CHANGE_THRESHOLD = 0.05;

function changedBy(prevValue, currValue) {
  return prevValue > 0 && currValue > 0 && Math.abs(currValue - prevValue) / prevValue >= CHANGE_THRESHOLD;
}

/**
 * @param {object|null} prev  { floorAsk, avg24h, epoch, listings:[id], tradeIds:[id] }
 * @param {object} curr       { floorAsk, avg24h, epoch, listings:[lot], trades:[trade] }
 * @param {{emission?:(number|null)}} opts
 * @returns {Array<{type:string,key:string,text:string}>}
 */
export function diffFeed(prev, curr, { emission = null } = {}) {
  const events = [];
  // No baseline yet: a first run records state only, it does not announce the
  // whole current market as "new".
  if (!prev || !curr) return events;
  const p = prev;

  if (p.floorAsk != null && curr.floorAsk != null && p.floorAsk !== curr.floorAsk) {
    events.push({
      type: 'floor',
      key: `floor:${curr.floorAsk}`,
      text: floorText(p.floorAsk, curr.floorAsk),
    });
  }

  const prevIds = asIdSet(p.listings);
  const currIds = asIdSet((curr.listings || []).map((l) => l.id));
  for (const lot of curr.listings || []) {
    if (prevIds.has(String(lot.id))) continue;
    events.push({
      type: 'listing',
      key: `listing:${lot.id}:listed`,
      text: newListingText(lot),
    });
  }
  for (const id of prevIds) {
    if (currIds.has(id)) continue;
    events.push({
      type: 'delist',
      key: `listing:${id}:unlisted`,
      text: delistText(id),
    });
  }

  const prevTrades = asIdSet(p.tradeIds);
  for (const t of curr.trades || []) {
    if (prevTrades.has(String(t.id))) continue;
    // Offers are not sales; the "Sold" template describes listing fills only.
    if (t.tradeType !== 'listing') continue;
    events.push({
      type: 'trade',
      key: `trade:${t.id}`,
      text: tradeText(t),
    });
  }

  if (p.epoch != null && curr.epoch != null && curr.epoch > p.epoch) {
    const closed = curr.epoch - 1;
    events.push({
      type: 'epoch',
      key: `epoch:${closed}`,
      text: epochText(closed, emission, curr.avg24h),
    });
  }

  return events;
}

/**
 * antseedstats.com change-only diff. Discrete events (burn, enriched epoch
 * close) post as soon as they appear; continuous ones (settled, staked) post
 * past a ±5% move. prev is the compact persisted state (max completed epoch);
 * curr is the full snapshot.
 * @param {object|null} prev  toAntseedState shape
 * @param {object|null} curr  toAntseedSnapshot shape
 * @returns {Array<{type:string,key:string,text:string}>}
 */
export function diffAntseedStats(prev, curr) {
  if (!prev || !curr) return [];
  const events = [];

  const prevBurns = new Set((prev.burns || []).map((b) => String(b.epoch)));
  for (const b of curr.burns || []) {
    if (prevBurns.has(String(b.epoch))) continue;
    events.push({ type: 'burn', key: `burn:${b.epoch}`, text: burnText(b) });
  }

  for (const [field, label] of [['settled24h', '24h'], ['settled7d', '7d'], ['settled30d', '30d']]) {
    if (changedBy(prev[field], curr[field])) {
      events.push({
        type: 'settled',
        key: `settled:${field}:${curr[field]}`,
        text: settledText(label, prev[field], curr[field]),
      });
    }
  }

  if (changedBy(prev.stakedAnts, curr.stakedAnts)) {
    events.push({
      type: 'staked',
      key: `staked:${curr.stakedAnts}`,
      text: stakedText(prev.stakedAnts, curr.stakedAnts),
    });
  }

  const currMax = maxCompletedEpoch(curr.epochs || []);
  const prevMax = prev.maxCompletedEpoch || 0;
  if (currMax > prevMax) {
    for (const e of curr.epochs || []) {
      if (e.status === 'complete' && e.epoch > prevMax) {
        events.push({ type: 'epochstats', key: `epochstats:${e.epoch}`, text: epochStatsText(e) });
      }
    }
  }

  return events;
}
