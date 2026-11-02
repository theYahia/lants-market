import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshAccessToken, postTweet, getMe, scopeAllowsWrite, scopeAllowsMedia, uploadMedia, getUserTweets } from './xapi.mjs';

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (key) => headers[key] ?? null },
  };
}

test('refreshAccessToken posts basic auth and returns a rotated token', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return jsonResponse(200, { access_token: 'at', refresh_token: 'rt2', expires_in: 7200, scope: 'tweet.write' });
  };
  const res = await refreshAccessToken({ clientId: 'cid', clientSecret: 'sec', refreshToken: 'rt1', fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.accessToken, 'at');
  assert.equal(res.refreshToken, 'rt2');
  assert.equal(seen.url, 'https://api.x.com/2/oauth2/token');
  assert.equal(seen.opts.method, 'POST');
  assert.equal(seen.opts.headers.authorization, 'Basic ' + Buffer.from('cid:sec').toString('base64'));
  assert.equal(seen.opts.body, 'grant_type=refresh_token&refresh_token=rt1');
});

test('refreshAccessToken surfaces an invalid grant as non-retryable', async () => {
  const fetchImpl = async () =>
    jsonResponse(400, { error: 'invalid_request', error_description: 'Value passed for the token was invalid.' });
  const res = await refreshAccessToken({ clientId: 'c', clientSecret: 's', refreshToken: 'bad', fetchImpl });
  assert.equal(res.ok, false);
  assert.equal(res.retryable, false);
  assert.equal(res.status, 400);
  assert.equal(res.reason, 'Value passed for the token was invalid.');
});

test('postTweet sends a bearer token and returns the tweet id', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return jsonResponse(201, { data: { id: '123', text: 'hi' } });
  };
  const res = await postTweet({ accessToken: 'at', text: 'hi', fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.id, '123');
  assert.equal(seen.url, 'https://api.x.com/2/tweets');
  assert.equal(seen.opts.headers.authorization, 'Bearer at');
  assert.equal(seen.opts.body, JSON.stringify({ text: 'hi' }));
});

test('postTweet flags 429 as retryable and 403 as human-actionable', async () => {
  const tooMany = await postTweet({
    accessToken: 'at',
    text: 'hi',
    fetchImpl: async () => jsonResponse(429, { title: 'Too Many Requests' }),
  });
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.retryable, true);

  const forbidden = await postTweet({
    accessToken: 'at',
    text: 'hi',
    fetchImpl: async () => jsonResponse(403, { title: 'Forbidden', detail: 'client-not-enrolled' }),
  });
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.retryable, false);
  assert.equal(forbidden.reason, 'client-not-enrolled');
  // The raw body is surfaced so run.mjs can log the full X response.
  assert.ok(forbidden.body);
  assert.equal(forbidden.body.detail, 'client-not-enrolled');
});

test('postTweet rejects empty or over-length text before calling the API', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return jsonResponse(201, { data: { id: '1' } });
  };
  assert.equal((await postTweet({ accessToken: 'at', text: '  ', fetchImpl })).ok, false);
  assert.equal((await postTweet({ accessToken: 'at', text: 'x'.repeat(281), fetchImpl })).ok, false);
  assert.equal(called, false);
});

test('postTweet surfaces rate-limit and response headers on failure', async () => {
  const res = await postTweet({
    accessToken: 'at',
    text: 'hi',
    fetchImpl: async () =>
      jsonResponse(403, { title: 'Forbidden' }, {
        'x-rate-limit-limit': '17',
        'x-user-limit-24hour-remaining': '0',
        'x-response-time': '12',
      }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.headers['x-rate-limit-limit'], '17');
  assert.equal(res.headers['x-user-limit-24hour-remaining'], '0');
  assert.equal(res.headers['x-response-time'], '12');
});

test('getMe resolves the authenticated account identity', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return jsonResponse(200, { data: { id: '2115408906172485912', name: 'sxsiant', username: 'sxsiant' } });
  };
  const res = await getMe({ accessToken: 'at', fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.username, 'sxsiant');
  assert.equal(res.userId, '2115408906172485912');
  assert.equal(seen.url, 'https://api.x.com/2/users/me');
  assert.equal(seen.opts.headers.authorization, 'Bearer at');
});

test('getMe surfaces a 403 as a non-retryable failure', async () => {
  const res = await getMe({
    accessToken: 'at',
    fetchImpl: async () => jsonResponse(403, { title: 'Forbidden', detail: 'Forbidden' }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
  assert.equal(res.retryable, false);
});

test('getMe maps network and timeout failures to a non-ok result', async () => {
  const timedOut = await getMe({
    accessToken: 'at',
    fetchImpl: async () => {
      throw new Error('timeout');
    },
  });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.reason, 'timeout');

  const offline = await getMe({
    accessToken: 'at',
    fetchImpl: async () => {
      throw new Error('boom');
    },
  });
  assert.equal(offline.ok, false);
  assert.equal(offline.reason, 'network');
});

test('scopeAllowsWrite detects tweet.write in a scope string', () => {
  assert.equal(scopeAllowsWrite(null), false);
  assert.equal(scopeAllowsWrite(''), false);
  assert.equal(scopeAllowsWrite('tweet.read offline.access'), false);
  assert.equal(scopeAllowsWrite('tweet.write'), true);
  assert.equal(scopeAllowsWrite('tweet.write tweet.read offline.access users.read'), true);
});

test('scopeAllowsMedia is a separate scope from tweet.write', () => {
  assert.equal(scopeAllowsMedia(null), false);
  assert.equal(scopeAllowsMedia('tweet.write users.read tweet.read offline.access'), false);
  assert.equal(scopeAllowsMedia('tweet.write media.write users.read'), true);
});

test('postTweet sends media.media_ids when a card is attached', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return jsonResponse(201, { data: { id: '124' } });
  };
  const res = await postTweet({ accessToken: 'at', text: 'hi', mediaIds: ['777'], fetchImpl });
  assert.equal(res.ok, true);
  assert.deepEqual(JSON.parse(seen.opts.body), { text: 'hi', media: { media_ids: ['777'] } });
});

test('postTweet omits the media object without mediaIds', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return jsonResponse(201, { data: { id: '125' } });
  };
  await postTweet({ accessToken: 'at', text: 'hi', mediaIds: [], fetchImpl });
  assert.deepEqual(JSON.parse(seen.opts.body), { text: 'hi' });
  await postTweet({ accessToken: 'at', text: 'hi', fetchImpl });
  assert.deepEqual(JSON.parse(seen.opts.body), { text: 'hi' });
});

test('uploadMedia posts multipart form data and returns the media id', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return jsonResponse(200, { data: { id: '9001', media_key: '3_9001' } });
  };
  const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const res = await uploadMedia({ accessToken: 'at', buffer, fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.mediaId, '9001');
  assert.equal(seen.url, 'https://api.x.com/2/media/upload');
  assert.equal(seen.opts.method, 'POST');
  assert.equal(seen.opts.headers.authorization, 'Bearer at');
  assert.equal(seen.opts.headers['content-type'], undefined);
  assert.ok(seen.opts.body instanceof FormData);
  assert.equal(seen.opts.body.get('media_category'), 'tweet_image');
  assert.ok(seen.opts.body.get('media'));
});

test('uploadMedia refuses an empty buffer and surfaces a scope rejection', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return jsonResponse(200, { data: { id: '1' } });
  };
  assert.equal((await uploadMedia({ accessToken: 'at', buffer: Buffer.alloc(0), fetchImpl })).ok, false);
  assert.equal(called, false);

  const denied = await uploadMedia({
    accessToken: 'at',
    buffer: Buffer.from([1]),
    fetchImpl: async () => jsonResponse(403, { title: 'Forbidden', detail: 'Unauthorized' }),
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 403);
  assert.equal(denied.reason, 'Unauthorized');
});

test('getUserTweets requests original tweets with public metrics', async () => {
  let seen = null;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return jsonResponse(200, { data: [{ id: '1', public_metrics: { impression_count: 5 } }] });
  };
  const res = await getUserTweets({ accessToken: 'at', userId: '42', fetchImpl });
  assert.equal(res.ok, true);
  assert.equal(res.tweets.length, 1);
  assert.ok(seen.url.startsWith('https://api.x.com/2/users/42/tweets?'));
  assert.ok(seen.url.includes('max_results=100'));
  assert.ok(seen.url.includes('tweet.fields=created_at,public_metrics'));
  assert.ok(seen.url.includes('exclude=replies,retweets'));
  assert.equal(seen.opts.headers.authorization, 'Bearer at');
});

test('getUserTweets caps max_results at the API limit', async () => {
  let seen = null;
  const fetchImpl = async (url) => {
    seen = url;
    return jsonResponse(200, { data: [] });
  };
  await getUserTweets({ accessToken: 'at', userId: '42', maxResults: 500, fetchImpl });
  assert.ok(seen.includes('max_results=100'));
});
