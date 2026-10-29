// IO glue extracted from bot/cron.mjs: failover RPC/JSON fetch, Telegram post
// delivery and the pinned welcome post. Every network call and file write is
// injectable through `deps` so the tick can be exercised offline; the defaults
// are the live values, so runtime behavior is unchanged.

import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sendMessage, editMessageText, pinMessage } from './telegram.mjs';
import { welcomeText } from './welcome.mjs';
import { saveState } from './state.mjs';

// Wall-clock cap for every RPC / JSON fetch the tick performs. Without it a
// hung public RPC blocks the tick indefinitely; with it the tick degrades to a
// logged failure instead.
export const RPC_TIMEOUT_MS = 20000;
export const RPC_URLS = (
  process.env.RPC_URLS || 'https://mainnet.base.org,https://base-mainnet.public.blastapi.io'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
export const DEFAULT_STATE_FILE = fileURLToPath(new URL('./data/state.json', import.meta.url));

const SITE_LINK = [{ text: 'Open lants.eth.limo', url: 'https://lants.eth.limo' }];

function defaultLog(line) {
  console.error(`[${new Date().toISOString()}] ${line}`);
}

export async function rpc(method, params, deps = {}) {
  const urls = deps.urls ?? RPC_URLS;
  const fetchImpl = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? RPC_TIMEOUT_MS;
  let last = new Error('rpc: no endpoint');
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: controller.signal
      });
      if (!res.ok) {
        last = new Error('rpc HTTP ' + res.status);
        continue;
      }
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || 'rpc error');
      return j.result;
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

export async function fetchJson(urls, deps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? RPC_TIMEOUT_MS;
  let last = new Error('fetchJson: no urls');
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { cache: 'no-store', signal: controller.signal });
      if (res.ok) return await res.json();
      last = new Error('HTTP ' + res.status + ' for ' + url);
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

// Coalesce repeated reads to one per interval: the last result (including a
// failure) is reused inside the window, so a fast tick cannot hammer a slow or
// failing RPC. Used for the on-chain own-listing read.
export function makeThrottledReader(readFn, intervalMs, nowFn = Date.now) {
  let cached = null;
  let cachedAt = 0;
  let primed = false;
  return async () => {
    const now = nowFn();
    if (primed && now - cachedAt < intervalMs) return cached;
    cached = await readFn();
    cachedAt = now;
    primed = true;
    return cached;
  };
}

export async function deliver(post, dryRun = false, deps = {}) {
  const logFn = deps.log ?? defaultLog;
  const sendMessageFn = deps.sendMessage ?? sendMessage;
  if (dryRun) {
    logFn('DRY-RUN would send:\n' + post.text);
    return true;
  }
  try {
    await sendMessageFn(post.text, { replyMarkup: SITE_LINK });
    logFn('sent post (' + post.text.split('\n')[0].slice(0, 60) + ')');
    return true;
  } catch (e) {
    logFn('telegram delivery failed: ' + e.message);
    return false;
  }
}

function welcomeHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

// Sends the welcome post once, keeps it pinned, and refreshes its text in
// place when the welcome text changes. Idempotent across restarts: ids and
// the text hash survive in state, the pin is retried if it failed.
export async function ensureWelcomePin(state, deps = {}) {
  const logFn = deps.log ?? defaultLog;
  const dryRun = deps.dryRun ?? false;
  const saveStateFn = deps.saveState ?? saveState;
  const stateFile = deps.stateFile ?? DEFAULT_STATE_FILE;
  const textOf = deps.welcomeText ?? welcomeText;
  const sendMessageFn = deps.sendMessage ?? sendMessage;
  const editMessageTextFn = deps.editMessageText ?? editMessageText;
  const pinMessageFn = deps.pinMessage ?? pinMessage;
  const text = textOf();
  const hash = welcomeHash(text);
  if (dryRun) {
    if (!state.welcomeMessageId) logFn('DRY-RUN would send welcome:\n' + text);
    else if (state.welcomeTextHash !== hash) logFn('DRY-RUN would edit welcome:\n' + text);
    return;
  }
  if (!state.welcomeMessageId) {
    try {
      const res = await sendMessageFn(text);
      state.welcomeMessageId = res.result.message_id;
      state.welcomeTextHash = hash;
      saveStateFn(stateFile, state);
      logFn('sent welcome post (message_id ' + state.welcomeMessageId + ')');
    } catch (e) {
      logFn('welcome delivery failed: ' + e.message);
      return;
    }
  } else if (state.welcomeTextHash !== hash) {
    try {
      await editMessageTextFn(state.welcomeMessageId, text);
      state.welcomeTextHash = hash;
      saveStateFn(stateFile, state);
      logFn('edited welcome post (message_id ' + state.welcomeMessageId + ')');
    } catch (e) {
      logFn('welcome edit failed (will retry on next restart): ' + e.message);
      return;
    }
  }
  if (state.welcomePinned === state.welcomeMessageId) return;
  try {
    await pinMessageFn(state.welcomeMessageId);
    state.welcomePinned = state.welcomeMessageId;
    saveStateFn(stateFile, state);
    logFn('welcome post pinned');
  } catch (e) {
    logFn('pin failed (will retry on next restart): ' + e.message);
  }
}
