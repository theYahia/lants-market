import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshAccessToken, postTweet } from './xapi.mjs';

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
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
