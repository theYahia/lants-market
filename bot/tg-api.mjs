// Minimal Telegram Bot API client for @lantsalerts_bot.
//
// getUpdates / sendMessage / answerCallbackQuery over fetch. Fail-closed: every
// call resolves to {ok:true,...} or {ok:false,status,reason,description,retryable}.
// The token travels in the request URL, so it is never echoed back in any
// returned string - callers must log only status/reason/description.

const API_ORIGIN = 'https://api.telegram.org';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function isRetryable(status) {
  return status === 0 || RETRYABLE_STATUS.has(status);
}

function descriptionOf(json) {
  return json && typeof json === 'object' && typeof json.description === 'string' ? json.description : null;
}

function methodUrl(token, method) {
  return `${API_ORIGIN}/bot${token}/${method}`;
}

async function send(fetchImpl, url, body, timeoutMs) {
  if (typeof fetchImpl !== 'function') return { ok: false, status: 0, reason: 'no-fetch', description: null, retryable: false };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (controller) controller.abort();
      reject(new Error('timeout'));
    }, timeoutMs);
  });
  let response;
  try {
    response = await Promise.race([
      fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: controller ? controller.signal : undefined,
      }),
      timeout,
    ]);
  } catch (e) {
    return { ok: false, status: 0, reason: e && e.message === 'timeout' ? 'timeout' : 'network', description: null, retryable: true };
  } finally {
    if (timer) clearTimeout(timer);
  }
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (response.ok !== true) {
    return {
      ok: false,
      status: response.status,
      reason: 'http',
      description: descriptionOf(json),
      retryable: isRetryable(response.status),
    };
  }
  return { ok: true, status: response.status, json, description: null, retryable: false };
}

/** Resolve the bot identity, for a startup token/identity check (mirrors xapi getMe). */
export async function getMe({ token, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  if (!token) return { ok: false, reason: 'token' };
  const res = await send(fetchImpl, methodUrl(token, 'getMe'), {}, timeoutMs);
  if (!res.ok) return { ok: false, status: res.status, reason: res.reason, description: res.description, retryable: res.retryable };
  const result = res.json?.result;
  if (!result || typeof result.username !== 'string' || result.username === '') {
    return { ok: false, reason: 'no-result', retryable: false };
  }
  return { ok: true, username: result.username, id: typeof result.id === 'number' ? result.id : null };
}

/** Poll pending updates (short poll: timeout=0). Caller advances offset itself. */
export async function getUpdates({
  token,
  offset = 0,
  timeout = 0,
  allowedUpdates = ['message', 'callback_query'],
  fetchImpl = globalThis.fetch,
  timeoutMs = 30000,
} = {}) {
  if (!token) return { ok: false, reason: 'token' };
  const res = await send(fetchImpl, methodUrl(token, 'getUpdates'), {
    offset,
    timeout,
    allowed_updates: allowedUpdates,
  }, timeoutMs);
  if (!res.ok) return { ok: false, status: res.status, reason: res.reason, description: res.description, retryable: res.retryable };
  const updates = Array.isArray(res.json?.result) ? res.json.result : null;
  if (updates === null) return { ok: false, reason: 'no-result', retryable: false };
  return { ok: true, updates };
}

/** Send one text message with optional inline keyboard (url or callback buttons). */
export async function sendMessage({
  token,
  chatId,
  text,
  replyMarkup = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
} = {}) {
  if (!token) return { ok: false, reason: 'token' };
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, reason: 'text', retryable: false };
  const body = { chat_id: chatId, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await send(fetchImpl, methodUrl(token, 'sendMessage'), body, timeoutMs);
  if (!res.ok) return { ok: false, status: res.status, reason: res.reason, description: res.description, retryable: res.retryable };
  const messageId = res.json?.result?.message_id;
  return { ok: true, messageId: Number.isInteger(messageId) ? messageId : null };
}

/** Acknowledge an inline-button press (clears the spinner, no message back). */
export async function answerCallbackQuery({
  token,
  callbackQueryId,
  text = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
} = {}) {
  if (!token) return { ok: false, reason: 'token' };
  if (typeof callbackQueryId !== 'string' || callbackQueryId === '') return { ok: false, reason: 'callback-id' };
  const body = { callback_query_id: callbackQueryId };
  if (typeof text === 'string' && text !== '') body.text = text;
  const res = await send(fetchImpl, methodUrl(token, 'answerCallbackQuery'), body, timeoutMs);
  if (!res.ok) return { ok: false, status: res.status, reason: res.reason, description: res.description, retryable: res.retryable };
  return { ok: true };
}
