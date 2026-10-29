#!/usr/bin/env node
// @lantsalerts_bot entry point (cron polling, no server).
//
//   node bot/tg-run.mjs --dry-run   poll + read + print replies/alerts, send nothing, write no state
//   node bot/tg-run.mjs             deliver command replies and alerts, persist state
//   node bot/tg-run.mjs --state <p> alternate state file
//
// Exit codes: 0 = done or a retryable failure (next cron retries); 1 = a
// human-actionable failure (missing token, unauthorized bot token).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFeed } from './read-feed.mjs';
import { readOwnListings } from './read-own-listings.mjs';
import { readAntseedStats } from './read-antseedstats.mjs';
import { getUpdates, getMe, sendMessage, answerCallbackQuery } from './tg-api.mjs';
import { loadTgState, saveTgState, upsertSubscriber } from './tg-state.mjs';
import { parseCommand, handleCommand, handleCallback } from './tg-commands.mjs';
import { computeAlerts } from './tg-alerts.mjs';
import { helpText, listingAlertReply, epochEndedAlertText, floorAlertText } from './tg-format.mjs';

const BOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATE = path.join(BOT_DIR, 'tg-state.json');
// The token must belong to this bot; a token for the wrong bot would otherwise
// poll and reply as a different account (mirrors run.mjs's @sxsiant check).
const EXPECTED_BOT_USERNAME = 'lantsalerts_bot';

function log(msg) {
  console.log(`[tg] ${msg}`);
}

function loadEnvFile(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

function queueCommand(state, outbox, chatId, text, context, nowIso) {
  const command = parseCommand(text);
  if (!command) {
    outbox.push({ kind: 'message', chatId, text: helpText(), replyMarkup: null });
    return;
  }
  if (command.name === 'start') upsertSubscriber(state, chatId, nowIso);
  const { reply } = handleCommand({ command, context: { state, chatId, ...context } });
  outbox.push({ kind: 'message', chatId, text: reply.text, replyMarkup: reply.replyMarkup ?? null });
}

function queueCallback(state, outbox, callbackQueryId, chatId, data, context) {
  if (data === null) {
    outbox.push({ kind: 'callback-answer', callbackQueryId, text: null });
    return;
  }
  const { ack, reply } = handleCallback({ data, context: { state, chatId, ...context } });
  outbox.push({ kind: 'callback-answer', callbackQueryId, text: ack ? ack.text : null });
  if (reply) outbox.push({ kind: 'message', chatId, text: reply.text, replyMarkup: reply.replyMarkup ?? null });
}

// One broadcast/personal alert -> the text and keyboard to send.
function alertPayload(alert, restakeBonusPct) {
  if (alert.type === 'listing') return listingAlertReply(alert.lot, alert.isFloor);
  if (alert.type === 'epoch') return { text: epochEndedAlertText(alert.closedEpoch, restakeBonusPct), replyMarkup: null };
  return { text: floorAlertText(alert.floor, alert.threshold), replyMarkup: null };
}

async function main(argv) {
  loadEnvFile(path.join(BOT_DIR, '.env'));

  const dryRun = argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const token = process.env.TG_BOT_TOKEN || null;
  const statePath = argValue(argv, '--state') || DEFAULT_STATE;
  const nowIso = new Date().toISOString();
  let state = loadTgState(statePath);

  if (!token && !dryRun) {
    log('missing TG_BOT_TOKEN');
    return 1;
  }

  // 1) Verify the token belongs to this bot before polling.
  let updates = [];
  if (token) {
    const me = await getMe({ token });
    if (!me.ok) {
      log(`token check failed: ${me.reason}${me.status ? ` (HTTP ${me.status})` : ''}${me.description ? `: ${me.description}` : ''}`);
      return me.retryable ? 0 : 1;
    }
    if (me.username !== EXPECTED_BOT_USERNAME) {
      log(`token belongs to @${me.username}, expected @${EXPECTED_BOT_USERNAME} (wrong bot)`);
      return 1;
    }
    log(`authenticated as @${me.username}`);
  }

  // 2) Poll pending updates. A dry run without a token still exercises the
  // readers and alert logic locally.
  if (token) {
    const poll = await getUpdates({ token, offset: state.offset });
    if (!poll.ok) {
      log(`getUpdates failed: ${poll.reason}${poll.status ? ` (HTTP ${poll.status})` : ''}${poll.description ? `: ${poll.description}` : ''}`);
      return poll.retryable ? 0 : 1;
    }
    updates = poll.updates;
  } else {
    log('TG_BOT_TOKEN missing; polling skipped (dry-run only)');
  }
  if (updates.length > 0) log(`received ${updates.length} update(s)`);

  // Advance the offset in memory only; a single save happens at the end. In a
  // dry run the offset is not persisted, so the next real run re-reads them.
  for (const u of updates) {
    if (Number.isInteger(u.update_id)) state.offset = Math.max(state.offset, u.update_id + 1);
  }

  // 2) Readers. A feed failure degrades commands/floor alerts; an own-listings
  // failure only skips listing alerts (nothing is marked seen, so nothing lost).
  const feed = await readFeed();
  const market = feed.ok ? feed.market : null;
  if (!feed.ok) log(`feed unavailable (${feed.reason}); market commands answer 'unavailable'`);
  const ownRes = await readOwnListings();
  const own = ownRes.ok ? ownRes.listings : null;
  if (!ownRes.ok) log(`own listings unavailable (${ownRes.reason}); listing alerts skipped`);
  const astats = await readAntseedStats({ prevMaxCompletedEpoch: Number.MAX_SAFE_INTEGER });
  const network = astats.ok ? astats.network : null;
  const staking = astats.ok ? astats.staking : null;
  if (!astats.ok) log(`antseedstats unavailable (${astats.reason}); epoch countdown omitted`);
  const epochData = {
    epoch: network && Number.isInteger(network.epoch) ? network.epoch : (market ? market.epoch : null),
    secondsLeft: network ? network.secondsLeft : null,
    restakeBonusPct: staking ? staking.restakeBonusPct : null,
  };

  // 3) Dispatch updates (mutates state: subscription, thresholds).
  const outbox = [];
  for (const u of updates) {
    const message = u.message || null;
    const callback = u.callback_query || null;
    if (message && typeof message.text === 'string') {
      const chat = message.chat || null;
      // DM-only: a bot in a group must not answer every message there.
      if (chat && chat.type && chat.type !== 'private') continue;
      const chatId = chat ? chat.id : null;
      if (chatId != null) queueCommand(state, outbox, chatId, message.text, { market, epochData }, nowIso);
      continue;
    }
    if (callback) {
      const chat = callback.message && callback.message.chat ? callback.message.chat : null;
      if (chat && chat.type && chat.type !== 'private') continue;
      const chatId = chat ? chat.id : null;
      const callbackQueryId = typeof callback.id === 'string' ? callback.id : null;
      if (chatId != null && callbackQueryId) {
        const data = typeof callback.data === 'string' ? callback.data : null;
        queueCallback(state, outbox, callbackQueryId, chatId, data, { market, epochData });
      }
    }
  }

  // 4) Alerts are computed from the post-command state.
  const { alerts, state: nextState } = computeAlerts({ state, market, own });
  state = nextState;
  if (alerts.length > 0) log(`${alerts.length} alert(s) to deliver`);

  if (dryRun) {
    log(`dry-run: ${updates.length} update(s), ${outbox.length} reply action(s), ${alerts.length} alert(s)`);
    for (const item of outbox) {
      if (item.kind === 'message') log(`reply -> ${item.chatId}: ${item.text}`);
      else log(`callback-answer -> ${item.callbackQueryId}: ${item.text ?? '(no text)'}`);
    }
    for (const a of alerts) {
      const audience = a.type === 'floor' ? a.chatId : 'all';
      log(`alert ${a.type} -> ${audience}: ${alertPayload(a, epochData.restakeBonusPct).text}`);
    }
    log('state not written (dry-run)');
    return 0;
  }

  // 5) Deliver replies, then alerts. Per-send failures are logged and counted;
  // a failed personal floor alert is re-armed so it retries next run.
  const subscriberIds = Object.keys(state.subscribers);
  let failures = 0;
  for (const item of outbox) {
    if (item.kind === 'callback-answer') {
      const r = await answerCallbackQuery({ token, callbackQueryId: item.callbackQueryId, text: item.text });
      if (!r.ok) {
        failures += 1;
        log(`answerCallbackQuery failed: ${r.reason}${r.status ? ` (HTTP ${r.status})` : ''}`);
      }
      continue;
    }
    const r = await sendMessage({ token, chatId: item.chatId, text: item.text, replyMarkup: item.replyMarkup });
    if (!r.ok) {
      failures += 1;
      log(`sendMessage -> ${item.chatId} failed: ${r.reason}${r.status ? ` (HTTP ${r.status})` : ''}`);
    }
  }

  for (const a of alerts) {
    const payload = alertPayload(a, epochData.restakeBonusPct);
    if (a.type === 'floor') {
      const r = await sendMessage({ token, chatId: a.chatId, text: payload.text });
      if (!r.ok) {
        failures += 1;
        const sub = state.subscribers[String(a.chatId)];
        if (sub) sub.floorArmedDown = true;
        log(`floor alert -> ${a.chatId} failed: ${r.reason}`);
      }
      continue;
    }
    for (const chatId of subscriberIds) {
      const r = await sendMessage({ token, chatId, text: payload.text, replyMarkup: payload.replyMarkup });
      if (!r.ok) {
        failures += 1;
        log(`broadcast -> ${chatId} failed: ${r.reason}`);
      }
    }
  }

  saveTgState(statePath, state);
  log(`done: ${alerts.length} alert(s), ${subscriberIds.length} subscriber(s), ${failures} send failure(s)`);
  return 0;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error('[tg] fatal: ' + ((e && e.stack) || e));
    process.exitCode = 1;
  });
