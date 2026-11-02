import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTweetList, aggregateByFamily, renderTable, renderMarkdown, FAMILY_LABELS } from './metrics.mjs';

const TWEETS_JSON = {
  data: [
    {
      id: '101',
      created_at: '2026-10-29T14:07:00.000Z',
      public_metrics: {
        retweet_count: 1,
        reply_count: 2,
        like_count: 10,
        quote_count: 0,
        bookmark_count: 3,
        impression_count: 500,
      },
    },
    {
      id: '102',
      created_at: '2026-10-30T14:07:00.000Z',
      public_metrics: {
        retweet_count: 0,
        reply_count: 0,
        like_count: 5,
        bookmark_count: 0,
        impression_count: 100,
      },
    },
    {
      id: '103',
      created_at: '2026-10-31T14:07:00.000Z',
      public_metrics: {
        retweet_count: 0,
        reply_count: 0,
        like_count: 0,
        bookmark_count: 0,
        impression_count: 0,
      },
    },
  ],
};

test('parseTweetList flattens the public metrics and tolerates missing counters', () => {
  const rows = parseTweetList(TWEETS_JSON.data);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    id: '101',
    createdAt: '2026-10-29T14:07:00.000Z',
    impressions: 500,
    likes: 10,
    replies: 2,
    reposts: 1,
    bookmarks: 3,
  });
  assert.equal(rows[1].replies, 0);
  assert.equal(rows[1].bookmarks, 0);
});

test('parseTweetList skips rows without an id', () => {
  assert.deepEqual(parseTweetList([{ id: '' }, null, { public_metrics: {} }]), []);
  assert.deepEqual(parseTweetList(null), []);
});

test('aggregateByFamily sums per archetype and joins on the published ledger', () => {
  const published = [
    { id: '101', family: 'board', type: 'board' },
    { id: '102', family: 'board', type: 'board' },
    { id: '103', family: 'epoch', type: 'epoch' },
    { id: '999', family: 'lot', type: 'lot' }, // not in the API page
  ];
  const rows = aggregateByFamily(published, parseTweetList(TWEETS_JSON.data));
  const board = rows.find((r) => r.family === 'board');
  assert.equal(board.posts, 2);
  assert.equal(board.impressions, 600);
  assert.equal(board.likes, 15);
  assert.equal(board.replies, 2);
  assert.equal(board.reposts, 1);
  assert.equal(board.bookmarks, 3);
  assert.equal(board.interactions, 21);
  assert.ok(Math.abs(board.engagementRate - 21 / 600) < 1e-12);
  assert.equal(rows.find((r) => r.family === 'lot'), undefined);
});

test('aggregateByFamily never divides by zero impressions', () => {
  const rows = aggregateByFamily([{ id: '103', family: 'epoch' }], parseTweetList(TWEETS_JSON.data));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].impressions, 0);
  assert.equal(rows[0].engagementRate, null);
});

test('aggregateByFamily sorts by impressions and labels unknown families', () => {
  const tweets = parseTweetList(TWEETS_JSON.data);
  const rows = aggregateByFamily([
    { id: '102', family: 'edu' },
    { id: '101', family: 'board' },
    { id: '103', family: 'legacy' },
  ], tweets);
  assert.deepEqual(rows.map((r) => r.family), ['board', 'edu', 'legacy']);
});

test('renderTable produces a markdown table with a total row', () => {
  const rows = aggregateByFamily(
    [{ id: '101', family: 'board' }, { id: '103', family: 'epoch' }],
    parseTweetList(TWEETS_JSON.data)
  );
  const table = renderTable(rows);
  assert.ok(table.includes('| Family | Posts | Impressions |'));
  assert.ok(table.includes(FAMILY_LABELS.board));
  assert.ok(table.includes('3.20%')); // 16 / 500 for the board row
  assert.ok(table.includes('| **total** | 2 | 500 |'));
  assert.ok(renderTable([]).includes('no posts matched the ledger'));
});

test('renderMarkdown writes the provenance and the retrospective note', () => {
  const md = renderMarkdown([], Date.parse('2026-11-02T06:00:00Z'));
  assert.ok(md.startsWith('# @sxsiant post metrics'));
  assert.ok(md.includes('Last run: 2026-11-02T06:00:00.000Z'));
  assert.ok(md.includes('Retrospective after 4 weeks'));
});
