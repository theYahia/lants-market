// Telegram DM layer for the alerts bot. Each daemon tick it polls pending
// updates, answers commands/buttons and delivers personal alerts (floor below
// a subscriber's threshold, epoch end) to private chats. Channel posting stays
// in cron.mjs; this module only talks to DMs.
//
// Market data comes from the fetch-only readers (read-feed, read-antseedstats).
// Own-VexyMarketplace listing alerts are intentionally not wired here yet: that
// needs the on-chain reader, which this channel branch does not carry.

import { readFeed } from './read-feed.mjs';
import { readAntseedStats } from './read-antseedstats.mjs';
import { getUpdates, sendMessage, answerCallbackQuery } from './tg-api.mjs';
import { parseCommand, handleCommand, handleCallback } from './tg-commands.mjs';
import { computeAlerts } from './tg-alerts.mjs';
import { upsertSubscriber } from './tg-state.mjs';
import { helpText, floorAlertText, epochEndedAlertText } from './tg-format.mjs';

function isPrivate(chat) {
  return !chat || !chat.type || chat.type === 'private';
}

function queueMessage(outbox, chatId, reply) {
  outbox.push({ kind: 'message', chatId, text: reply.text, replyMarkup: reply.replyMarkup ?? null });
}

async function readContext(log) {
  const feed = await readFeed();
  if (!feed.ok) log(`tg: feed unavailable (${feed.reason}); market commands answer 'unavailable'`);
  const market = feed.ok ? feed.market : null;
  const astats = await readAntseedStats({ prevMaxCompletedEpoch: Number.MAX_SAFE_INTEGER });
  const network = astats.ok ? astats.network : null;
  const staking = astats.ok ? astats.staking : null;
  if (!astats.ok) log(`tg: antseedstats unavailable (${astats.reason}); countdown omitted`);
  const epochData = {
    epoch: network && Number.isInteger(network.epoch) ? network.epoch : (market ? market.epoch : null),
    secondsLeft: network ? network.secondsLeft : null,
    restakeBonusPct: staking ? staking.restakeBonusPct : null,
  };
  return { market, epochData };
}

function dispatch(updates, state, context, outbox) {
  for (const u of updates) {
    const message = u.message || null;
    const callback = u.callback_query || null;
    if (message && typeof message.text === 'string') {
      const chat = message.chat || null;
      if (!isPrivate(chat)) continue;
      const chatId = chat ? chat.id : null;
      if (chatId == null) continue;
      const command = parseCommand(message.text);
      if (!command) {
        queueMessage(outbox, chatId, { text: helpText() });
        continue;
      }
      if (command.name === 'start') upsertSubscriber(state, chatId);
      const { reply } = handleCommand({ command, context: { state, chatId, ...context } });
      queueMessage(outbox, chatId, reply);
      continue;
    }
    if (callback) {
      const chat = callback.message && callback.message.chat ? callback.message.chat : null;
      if (!isPrivate(chat)) continue;
      const chatId = chat ? chat.id : null;
      const callbackQueryId = typeof callback.id === 'string' ? callback.id : null;
      if (chatId == null || callbackQueryId == null) continue;
      const data = typeof callback.data === 'string' ? callback.data : null;
      if (data === null) {
        outbox.push({ kind: 'callback', callbackQueryId, text: null });
        continue;
      }
      const { ack, reply } = handleCallback({ data, context: { state, chatId, ...context } });
      outbox.push({ kind: 'callback', callbackQueryId, text: ack ? ack.text : null });
      if (reply) queueMessage(outbox, chatId, reply);
    }
  }
}

async function deliverOutbox(token, outbox, log) {
  for (const item of outbox) {
    if (item.kind === 'callback') {
      const r = await answerCallbackQuery({ token, callbackQueryId: item.callbackQueryId, text: item.text });
      if (!r.ok) log(`tg: answerCallbackQuery failed: ${r.reason}`);
      continue;
    }
    const r = await sendMessage({ token, chatId: item.chatId, text: item.text, replyMarkup: item.replyMarkup });
    if (!r.ok) log(`tg: sendMessage -> ${item.chatId} failed: ${r.reason}`);
  }
}

async function deliverAlerts(token, state, alerts, epochData, log) {
  const subscriberIds = Object.keys(state.subscribers || {});
  for (const a of alerts) {
    if (a.type === 'floor') {
      const r = await sendMessage({ token, chatId: a.chatId, text: floorAlertText(a.floor, a.threshold) });
      if (!r.ok) {
        const sub = state.subscribers[String(a.chatId)];
        if (sub) sub.floorArmedDown = true;
        log(`tg: floor alert -> ${a.chatId} failed: ${r.reason}`);
      }
      continue;
    }
    const text = epochEndedAlertText(a.closedEpoch, epochData.restakeBonusPct);
    for (const chatId of subscriberIds) {
      const r = await sendMessage({ token, chatId, text });
      if (!r.ok) log(`tg: broadcast -> ${chatId} failed: ${r.reason}`);
    }
  }
}

/**
 * One DM poll. Mutates `state` (offset, subscribers, floor arming, lastEpoch).
 * Never throws: a failed tick is logged and the daemon keeps going.
 */
export async function pollTelegram({ state, dryRun = false, log = () => {} } = {}) {
  const token = process.env.TG_BOT_TOKEN || '';
  if (!token) {
    log('tg: TG_BOT_TOKEN not set; DM poll skipped');
    return;
  }
  try {
    const poll = await getUpdates({ token, offset: state.offset || 0 });
    if (!poll.ok) {
      log(`tg: getUpdates failed: ${poll.reason}${poll.status ? ` (HTTP ${poll.status})` : ''}`);
      return;
    }
    const updates = poll.updates;
    for (const u of updates) {
      if (Number.isInteger(u.update_id)) state.offset = Math.max(state.offset || 0, u.update_id + 1);
    }

    const { market, epochData } = await readContext(log);
    const outbox = [];
    dispatch(updates, state, { market, epochData }, outbox);

    const { alerts, state: next } = computeAlerts({ state, market, own: null });
    Object.assign(state, next);

    if (dryRun) {
      log(`tg dry-run: ${updates.length} update(s), ${outbox.length} reply(ies), ${alerts.length} alert(s)`);
      for (const item of outbox) {
        log(item.kind === 'message'
          ? `tg reply -> ${item.chatId}: ${item.text}`
          : `tg callback-answer -> ${item.callbackQueryId}: ${item.text ?? '(no text)'}`);
      }
      for (const a of alerts) {
        log(a.type === 'floor' ? `tg alert floor -> ${a.chatId}` : `tg alert ${a.type} -> subscribers`);
      }
      return;
    }

    await deliverOutbox(token, outbox, log);
    await deliverAlerts(token, state, alerts, epochData, log);
    if (updates.length || alerts.length) {
      log(`tg: ${updates.length} update(s), ${alerts.length} alert(s), ${Object.keys(state.subscribers || {}).length} subscriber(s)`);
    }
  } catch (e) {
    log(`tg: poll failed: ${e && e.message ? e.message : e}`);
  }
}
