// Pure command/callback handlers for @lantsalerts_bot. No IO, no network:
// every handler receives the injected data (state, chatId, market, epochData)
// and returns the reply to send, or a callback acknowledgement. The run loop
// performs the actual sendMessage / answerCallbackQuery calls.

import {
  welcomeReply,
  helpText,
  floorReply,
  floorHasData,
  unavailableText,
  epochReply,
  setfloorReply,
  floorSetAckText,
  floorOffAckText,
} from './tg-format.mjs';
import { TOP_MODELS_ENABLED } from './tg-config.mjs';
import { upsertSubscriber, setFloorThreshold, disableFloorAlert } from './tg-state.mjs';

// "/floor@lantsalerts_bot 206" -> { name: 'floor', args: '206' }. The botname
// suffix is accepted and dropped (Telegram appends it in groups).
export function parseCommand(text) {
  if (typeof text !== 'string') return null;
  const m = /^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+(.*))?$/.exec(text.trim());
  if (!m) return null;
  return { name: m[1].toLowerCase(), args: (m[2] || '').trim() };
}

// Message-command dispatch. context: { state, chatId, market, epochData }.
export function handleCommand({ command, context }) {
  const { name, args } = command;
  const { market, epochData } = context;

  if (name === 'start') return { reply: welcomeReply() };
  if (name === 'help') return { reply: { text: helpText() } };

  if (name === 'floor') {
    if (!market || !floorHasData(market)) return { reply: { text: unavailableText() } };
    return { reply: floorReply(market) };
  }

  if (name === 'epoch') {
    return { reply: epochReply(epochData) };
  }

  if (name === 'setfloor') {
    const sub = upsertSubscriber(context.state, context.chatId);
    const arg = (args || '').trim();
    if (arg !== '') {
      const v = Number(arg);
      if (Number.isFinite(v) && v > 0) {
        setFloorThreshold(context.state, context.chatId, v);
        return { reply: { text: floorSetAckText(v) } };
      }
      return { reply: { text: 'Invalid price.\n\n' + setfloorReply(sub).text } };
    }
    return { reply: setfloorReply(sub) };
  }

  if (name === 'top') {
    // Gated behind the same TOP_MODELS_ENABLED constant as the X-side post;
    // no data source is wired until the flag is flipped.
    if (!TOP_MODELS_ENABLED) return { reply: { text: 'Top models are not available yet.' } };
    return { reply: { text: unavailableText() } };
  }

  return { reply: { text: 'Unknown command. /help' } };
}

// Inline-button dispatch. context: { state, chatId, market, epochData }.
// Returns { ack: {text}|null, reply: {text,replyMarkup?}|null }.
export function handleCallback({ data, context }) {
  const { market, epochData } = context;

  const preset = /^setfloor:(.+)$/.exec(data);
  if (preset) {
    const v = Number(preset[1]);
    if (Number.isFinite(v) && v > 0) {
      setFloorThreshold(context.state, context.chatId, v);
      return { ack: { text: floorSetAckText(v) }, reply: null };
    }
    return { ack: { text: 'Invalid value.' }, reply: null };
  }

  if (data === 'floor:off') {
    disableFloorAlert(context.state, context.chatId);
    return { ack: { text: floorOffAckText() }, reply: null };
  }

  if (data === 'cmd:floor') {
    if (!market || !floorHasData(market)) return { ack: null, reply: { text: unavailableText() } };
    return { ack: null, reply: floorReply(market) };
  }

  if (data === 'cmd:epoch') {
    return { ack: null, reply: epochReply(epochData) };
  }

  if (data === 'cmd:setfloor') {
    const sub = upsertSubscriber(context.state, context.chatId);
    return { ack: null, reply: setfloorReply(sub) };
  }

  return { ack: { text: 'Unknown button.' }, reply: null };
}
