// Minimal X (Twitter) API v2 client for the bot: OAuth 2.0 user-context token
// refresh and tweet creation. No SDK; fetch only. The app is a confidential
// client (client id + secret), so refresh uses HTTP Basic auth.
//
// Scopes required on the refresh token: tweet.write, tweet.read, offline.access,
// users.read (for GET /2/users/me identity check).

const OAUTH_TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const TWEET_URL = 'https://api.x.com/2/tweets';
const ME_URL = 'https://api.x.com/2/users/me';
const MAX_TWEET_LEN = 280;

function basicAuth(clientId, clientSecret) {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
}

function isRetryable(status) {
  return status === 0 || status === 429 || status >= 500;
}

function errorDetail(json) {
  if (!json || typeof json !== 'object') return null;
  return json.detail || json.title || json.error_description || json.error || null;
}

// A tweet.write scope is what lets POST /2/tweets succeed; its absence is the
// signal that the refresh token was minted under a read-only (or downgraded) app.
export function scopeAllowsWrite(scope) {
  return typeof scope === 'string' && scope.split(/\s+/).includes('tweet.write');
}

const HEADER_KEYS = [
  'x-rate-limit-limit',
  'x-rate-limit-remaining',
  'x-rate-limit-reset',
  'x-user-limit-24hour-limit',
  'x-user-limit-24hour-remaining',
  'www-authenticate',
  'x-response-time',
];

function pickHeaders(response) {
  const headers = {};
  if (!response || typeof response.headers?.get !== 'function') return headers;
  for (const key of HEADER_KEYS) {
    const value = response.headers.get(key);
    if (value != null) headers[key] = value;
  }
  return headers;
}

async function send(fetchImpl, url, options, timeoutMs) {
  if (typeof fetchImpl !== 'function') return { ok: false, status: 0, reason: 'no-fetch', json: null, headers: {} };
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
      fetchImpl(url, { ...options, signal: controller ? controller.signal : undefined }),
      timeout,
    ]);
  } catch (e) {
    return { ok: false, status: 0, reason: e && e.message === 'timeout' ? 'timeout' : 'network', json: null, headers: {} };
  } finally {
    if (timer) clearTimeout(timer);
  }
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return {
    ok: response.ok === true,
    status: response.status,
    reason: response.ok === true ? null : 'http',
    json,
    headers: pickHeaders(response),
  };
}

/**
 * Exchange a refresh token for a fresh access token. X may rotate the refresh
 * token; when it does, the caller must persist `refreshToken`.
 */
export async function refreshAccessToken({
  clientId,
  clientSecret,
  refreshToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
} = {}) {
  if (!clientId || !clientSecret || !refreshToken) return { ok: false, reason: 'credentials' };
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString();
  const res = await send(fetchImpl, OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: basicAuth(clientId, clientSecret),
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body,
  }, timeoutMs);

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      retryable: isRetryable(res.status),
      reason: errorDetail(res.json) || res.reason || 'http',
    };
  }
  const json = res.json || {};
  if (typeof json.access_token !== 'string' || json.access_token === '') {
    return { ok: false, status: res.status, retryable: false, reason: 'no-access-token' };
  }
  return {
    ok: true,
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === 'string' && json.refresh_token !== '' ? json.refresh_token : null,
    expiresIn: Number.isFinite(json.expires_in) ? json.expires_in : null,
    scope: typeof json.scope === 'string' ? json.scope : null,
  };
}

/** Resolve the account behind an access token via GET /2/users/me (needs users.read). */
export async function getMe({
  accessToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
} = {}) {
  if (!accessToken) return { ok: false, status: 0, retryable: false, reason: 'token', username: null, userId: null, body: null };
  const res = await send(fetchImpl, ME_URL, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  }, timeoutMs);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      retryable: isRetryable(res.status),
      reason: errorDetail(res.json) || res.reason || 'http',
      username: null,
      userId: null,
      body: res.json,
    };
  }
  const username = typeof res.json?.data?.username === 'string' ? res.json.data.username : null;
  const userId = typeof res.json?.data?.id === 'string' ? res.json.data.id : null;
  return { ok: true, status: res.status, retryable: false, reason: null, username, userId, body: res.json };
}

/** Create one tweet. Returns { ok:true, id } or an error with a retryable flag. */
export async function postTweet({
  accessToken,
  text,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
} = {}) {
  if (!accessToken) return { ok: false, reason: 'token', retryable: false };
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, reason: 'text', retryable: false };
  if (text.length > MAX_TWEET_LEN) return { ok: false, reason: 'too-long', retryable: false };

  const res = await send(fetchImpl, TWEET_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ text }),
  }, timeoutMs);

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      retryable: isRetryable(res.status),
      reason: errorDetail(res.json) || res.reason || 'http',
      body: res.json,
      headers: res.headers,
    };
  }
  const id = res.json?.data?.id;
  if (typeof id !== 'string' || id === '') {
    return { ok: false, status: res.status, retryable: false, reason: 'no-id', body: res.json, headers: res.headers };
  }
  return { ok: true, id };
}
