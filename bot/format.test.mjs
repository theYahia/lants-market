// bot/format.test.mjs - tweet text builders, pure string formatting.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtAmount,
  fmtEmission,
  fmtCompact,
  newListingText,
  newFloorListingText,
  epochCloseText,
  boardText,
  lotText,
  networkText,
  eduText,
  usdWhole,
  pct,
} from './format.mjs';

const DOT = '\u00b7'; // legacy separator, must not appear in the new posts

const REAL_BOARD = {
  listedCount: 15,
  totalNfts: 483,
  offeredCount: 0,
  floorAsk: 0.14,
  avg24h: 0.101931,
};
const REAL_LOT = {
  id: 205,
  amount: 762.4724892065126,
  usd: 106.746148,
  perAntUsd: 0.13999999935878113,
  daysRemaining: 106,
  stakeEndEpoch: 44,
};

function assertStoryLines(text) {
  const firstLine = text.split('\n')[0];
  assert.ok(!firstLine.includes(DOT), `first line has a middle dot: ${firstLine}`);
  assert.ok(text.includes('lants.eth.limo'), 'post must link back to the site');
  assert.ok(/\d/.test(text), 'post must carry a number');
  assert.ok(text.length <= 280, `post is ${text.length} chars`);
}

test('fmtAmount: trims trailing zeros, keeps meaningful cents', () => {
  assert.equal(fmtAmount(400), '400');
  assert.equal(fmtAmount(762.4724), '762.47');
  assert.equal(fmtAmount(1512.7), '1512.7');
  assert.equal(fmtAmount(100.05), '100.05');
  assert.equal(fmtAmount(62.5), '62.5');
  assert.equal(fmtAmount(5.001), '5');
});

test('fmtAmount: zero, negative and non-finite input', () => {
  assert.equal(fmtAmount(0), '0');
  assert.equal(fmtAmount(-3), '0');
  assert.equal(fmtAmount(NaN), '0');
  assert.equal(fmtAmount(Infinity), '0');
});

test('fmtEmission: rounds and groups with en-US separators', () => {
  assert.equal(fmtEmission(1500000), '1,500,000');
  assert.equal(fmtEmission(1234567.4), '1,234,567');
  assert.equal(fmtEmission(0), '0');
});

test('fmtCompact: K/M/B notation with trimming', () => {
  assert.equal(fmtCompact(1500000), '1.5M');
  assert.equal(fmtCompact(6000000), '6M');
  assert.equal(fmtCompact(1535689.21), '1.54M');
  assert.equal(fmtCompact(1000), '1K');
  assert.equal(fmtCompact(1250000000), '1.25B');
  assert.equal(fmtCompact(999), '999');
  assert.equal(fmtCompact(550.7), '551');
  assert.equal(fmtCompact(0), '0');
  assert.equal(fmtCompact(-5), '0');
  assert.equal(fmtCompact(NaN), '0');
});

test('usdWhole: whole dollars with thousands separators', () => {
  assert.equal(usdWhole(12804.23), '$12,804');
  assert.equal(usdWhole(12804.5), '$12,805');
  assert.equal(usdWhole(0), '$0');
  assert.equal(usdWhole(NaN), '$0');
  assert.equal(usdWhole(994.4), '$994');
});

test('pct: signed percent strings', () => {
  assert.equal(pct(12000, 12804.23), '+6.7%');
  assert.equal(pct(12804.23, 12000), '-6.3%');
  assert.equal(pct(100, 100), '+0.0%');
});

test('epochCloseText: the claim/restake story', () => {
  const text = epochCloseText({ epoch: 28, emissionAnts: 5000000, sellerPointsUsd: 13145, restakeBonusPct: 5 });
  assert.equal(
    text,
    [
      'Epoch 28 closed. 5M ANTS went to stakers, $13,145 of seller points to providers.',
      '',
      'Holding a locked position? Claim, or restake for +5% power.',
      'Bought compute? Your buyer rewards can go into a seller pool.',
      '',
      'lants.eth.limo',
    ].join('\n')
  );
  assertStoryLines(text);
});

test('epochCloseText: missing measures and an unknown bonus still read as prose', () => {
  const bare = epochCloseText({ epoch: 28 });
  assert.equal(bare.split('\n')[0], 'Epoch 28 closed.');
  assert.ok(bare.includes('restake to compound.'));
  assert.ok(!bare.includes('power'));
  assertStoryLines(bare);

  const partial = epochCloseText({ epoch: 28, emissionAnts: 5000000 });
  assert.equal(partial.split('\n')[0], 'Epoch 28 closed. 5M ANTS went to stakers.');
  assertStoryLines(partial);
});

test('boardText: the market board on the real 28.10 numbers', () => {
  const text = boardText(REAL_BOARD);
  assert.equal(
    text,
    [
      '15 of 483 locked ANTS positions are for sale. Zero bids on any of them.',
      '',
      'Floor $0.140, 24h average sale $0.102 \u2014 the other 468 holders are just holding.',
      '',
      'Every lot, live: lants.eth.limo',
    ].join('\n')
  );
  assertStoryLines(text);
});

test('boardText: open bids are reported, not hidden', () => {
  const one = boardText({ ...REAL_BOARD, offeredCount: 1 });
  assert.ok(one.includes('One open bid on one of them.'));
  const many = boardText({ ...REAL_BOARD, offeredCount: 4 });
  assert.ok(many.includes('4 open bids across them.'));
  assertStoryLines(many);
});

test('boardText: reports only the numbers it has', () => {
  const text = boardText({ listedCount: 15, totalNfts: 483, offeredCount: 0 });
  assert.ok(!text.includes('Floor'));
  assertStoryLines(text);
});

test('lotText: the lot highlight on the real #205 lot', () => {
  const text = lotText(REAL_LOT);
  assert.equal(
    text,
    [
      'Cheapest way into locked ANTS today: 762.47 ANTS for $106.75.',
      '',
      '$0.140/ANTS, unlocks in 106 days, earning staking rewards the whole time.',
      '',
      'Card: lants.eth.limo/#position/205',
    ].join('\n')
  );
  assertStoryLines(text);
});

test('lotText: an unlock inside the current epoch is not counted back', () => {
  const text = lotText({ ...REAL_LOT, daysRemaining: 0 });
  assert.ok(text.includes('unlocks this epoch'));
  assert.ok(lotText({ ...REAL_LOT, daysRemaining: 1 }).includes('unlocks in 1 day'));
});

test('networkText: buyers, sellers and a genuine w/w comparison', () => {
  const text = networkText({ buyers: 307, sellers: 72, settled7d: 13772, pctChange: '+5.9%' });
  assert.equal(
    text,
    [
      'More buyers than sellers on AntSeed this week: 307 buyers, 72 sellers, $13,772 settled in 7d (+5.9% w/w).',
      '',
      '72 sellers serving 307 buyers is a supply shortage, not a demand problem.',
      '',
      'lants.eth.limo \u00b7 src: antseedstats.com',
    ].join('\n')
  );
  assert.ok(text.length <= 280);
});

test('networkText: the conclusion flips when sellers outnumber buyers', () => {
  const text = networkText({ buyers: 40, sellers: 90, settled7d: 5000, pctChange: '-2.0%' });
  assert.ok(text.startsWith('Sellers outnumber buyers on AntSeed this week: 40 buyers, 90 sellers'));
  assert.ok(text.includes('demand is the constraint this week.'));
  assert.ok(text.length <= 280);
});

test('eduText: what a lANTS position is, and what it is not', () => {
  const text = eduText({ totalNfts: 483, listedCount: 15 });
  assert.equal(
    text,
    [
      'A lANTS position is ANTS staked behind a provider until a date. Buying one buys the lock, the yield and the boost with it.',
      '',
      '483 exist. 15 are for sale.',
      '',
      'Want ANTS without a lock? This is not it. lants.eth.limo',
    ].join('\n')
  );
  assertStoryLines(text);
});

test('every archetype template stays under the tweet limit on real numbers', () => {
  const texts = [
    epochCloseText({ epoch: 128, emissionAnts: 1500000, sellerPointsUsd: 13145.5, restakeBonusPct: 5 }),
    boardText({ listedCount: 483, totalNfts: 1040, offeredCount: 12, floorAsk: 123.45, avg24h: 0.101931 }),
    lotText(REAL_LOT),
    networkText({ buyers: 3071, sellers: 729, settled7d: 137720, pctChange: '+15.9%' }),
    eduText({ totalNfts: 1040, listedCount: 483 }),
  ];
  for (const text of texts) {
    assert.ok(text.length <= 280, `${text.length}: ${text}`);
    assert.ok(!text.split('\n')[0].includes(DOT));
  }
});

// Legacy listing builders (kept for the Telegram bot and its tests).
test('newListingText: with and without a lock', () => {
  const t = newListingText({ id: 7, amount: 100, perAntUsd: 0.101, lockDays: 14 });
  assert.equal(t, '\u{1F195} New listing: #7 ' + DOT + ' \u{1F41C} 100 ANTS @ $0.101 ' + DOT + ' lock 2w ' + DOT + ' lants.eth.limo/#position/7');
  const s = newListingText({ id: 8, amount: 100, perAntUsd: 0.101, lockDays: 0 });
  assert.ok(!s.includes('lock'));
  assert.ok(s.startsWith('\u{1F195} New listing: #8'));
});

test('newFloorListingText: same detail as a listing, new-floor prefix', () => {
  const t = newFloorListingText({ id: 7, amount: 100, perAntUsd: 0.101, lockDays: 14 });
  assert.equal(t, '\u{1F3AF} New floor listing: #7 ' + DOT + ' \u{1F41C} 100 ANTS @ $0.101 ' + DOT + ' lock 2w ' + DOT + ' lants.eth.limo/#position/7');
  assert.ok(newFloorListingText({ id: 8, amount: 100, perAntUsd: 0.09, lockDays: 0 }).startsWith('\u{1F3AF} New floor listing: #8'));
});

console.log('format_ok=1');
