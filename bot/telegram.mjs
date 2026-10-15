// Telegram delivery: a plain sendMessage POST to the Bot API, with bounded
// retries. No long-polling, no commands, no storage — the bot only posts into
// the channel. `TELEGRAM_API_URL`-style override goes through the `apiUrl`
// dep so the same code works behind a relay (the RU prod box needs one).

// Pins the welcome post in the chat. Returns the Telegram response on success.
// In a private chat pinning is allowed; elsewhere the bot must be an admin.
export async function pinMessage(messageId, deps = {}) {
  const apiUrl = deps.apiUrl || process.env.TG_API_URL || DEFAULT_API_URL;
  const token = deps.token || process.env.TG_BOT_TOKEN || '';
  const chatId = deps.chatId || process.env.TG_CHAT_ID || '';
  const doFetch = deps.fetch || fetch;

  if (!token) throw new Error('telegram: TG_BOT_TOKEN is not set');
  if (!chatId) throw new Error('telegram: TG_CHAT_ID is not set');

  const url = `${apiUrl.replace(/\/+$/, '')}/bot${token}/pinChatMessage`;
  const res = await doFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`telegram: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  const j = await res.json();
  if (!j.ok) throw new Error(`telegram: ${j.description || 'unknown error'}`);
  return j;
}

// Updates the text of an already-sent message in place (used to refresh the
// pinned welcome post when its text changes). Returns the Telegram response.
export async function editMessageText(messageId, text, deps = {}) {
  const apiUrl = deps.apiUrl || process.env.TG_API_URL || DEFAULT_API_URL;
  const token = deps.token || process.env.TG_BOT_TOKEN || '';
  const chatId = deps.chatId || process.env.TG_CHAT_ID || '';
  const doFetch = deps.fetch || fetch;

  if (!token) throw new Error('telegram: TG_BOT_TOKEN is not set');
  if (!chatId) throw new Error('telegram: TG_CHAT_ID is not set');

  const url = `${apiUrl.replace(/\/+$/, '')}/bot${token}/editMessageText`;
  const res = await doFetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`telegram: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  const j = await res.json();
  if (!j.ok) throw new Error(`telegram: ${j.description || 'unknown error'}`);
  return j;
}

const DEFAULT_API_URL = 'https://api.telegram.org';
const MAX_TRIES = 4;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Throws on a config problem (missing token/chat id) and on delivery failure
// after all retries. Returns the Telegram response body on success.
// `replyMarkup` is an optional inline_keyboard row of { text, url } buttons.
export async function sendMessage(text, deps = {}) {
  const apiUrl = deps.apiUrl || process.env.TG_API_URL || DEFAULT_API_URL;
  const token = deps.token || process.env.TG_BOT_TOKEN || '';
  const chatId = deps.chatId || process.env.TG_CHAT_ID || '';
  const doFetch = deps.fetch || fetch;

  if (!token) throw new Error('telegram: TG_BOT_TOKEN is not set');
  if (!chatId) throw new Error('telegram: TG_CHAT_ID is not set');
  if (!text || !text.trim()) throw new Error('telegram: empty message');

  const url = `${apiUrl.replace(/\/+$/, '')}/bot${token}/sendMessage`;
  const body = { chat_id: chatId, text, disable_web_page_preview: false };
  if (deps.replyMarkup && deps.replyMarkup.length) {
    body.reply_markup = {
      inline_keyboard: deps.replyMarkup.map((b) => [
        { text: b.text, url: b.url }
      ])
    };
  }
  let lastErr;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`telegram: HTTP ${res.status} ${body.slice(0, 200)}`);
      }
      const j = await res.json();
      if (!j.ok) throw new Error(`telegram: ${j.description || 'unknown error'}`);
      return j;
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_TRIES) await sleep(1500 * attempt);
    }
  }
  throw lastErr;
}
