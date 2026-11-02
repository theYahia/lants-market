import test from 'node:test';
import assert from 'node:assert/strict';
import { boardCard, epochCard, lotCard, cardFor, renderPng, CARD_WIDTH, CARD_HEIGHT } from './card.mjs';

const BOARD = {
  epoch: 28,
  floorAsk: 0.14,
  avg24h: 0.101931,
  listedCount: 15,
  totalNfts: 483,
  offeredCount: 0,
  minted: 129929424.0681841,
  maxSupply: 1040000000,
  settled7d: 13772,
  stakedPct: 73.2107,
};

const LOT = {
  id: 205,
  amount: 762.4724892065126,
  usd: 106.746148,
  perAntUsd: 0.13999999935878113,
  stakeEndEpoch: 44,
  unlockAt: '2027-02-11',
  daysRemaining: 106,
  rewardAnts: 1.5,
  agentId: 45869,
  provider: 'Venice.ai Proxy',
};

const EPOCH = {
  epoch: 28,
  emissionAnts: 5000000,
  sellerPointsUsd: 13145,
  restakeBonusPct: 5,
};

test('boardCard carries all eight board values', () => {
  const svg = boardCard(BOARD);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(/width="1200" height="675"/.test(svg));
  assert.ok(svg.includes('$0.140'), 'floor');
  assert.ok(svg.includes('$0.102'), '24h avg');
  assert.ok(svg.includes('15/483'), 'listed');
  assert.ok(svg.includes('129.93M / 1.04B'), 'supply');
  assert.ok(svg.includes('$13,772'), '7d settled');
  assert.ok(svg.includes('73%'), 'staked');
  assert.ok(svg.includes('OPEN BIDS'), 'bids label');
  assert.ok(svg.includes('Epoch'), 'epoch label');
  assert.equal(CARD_WIDTH, 1200);
  assert.equal(CARD_HEIGHT, 675);
});

test('lotCard carries the lot fields', () => {
  const svg = lotCard(LOT);
  assert.ok(svg.includes('#205'));
  assert.ok(svg.includes('762.47'));
  assert.ok(svg.includes('$106.75'));
  assert.ok(svg.includes('$0.140'));
  assert.ok(svg.includes('11 Feb 2027'));
  assert.ok(svg.includes('1.5'));
  assert.ok(svg.includes('Venice.ai Proxy'));
});

test('epochCard carries the epoch close fields', () => {
  const svg = epochCard(EPOCH);
  assert.ok(svg.includes('Epoch 28 closed'));
  assert.ok(svg.includes('5M ANTS'));
  assert.ok(svg.includes('$13,145'));
  assert.ok(svg.includes('+5% power'));
  assert.ok(svg.includes('29 Oct 2026'), 'next close date');
});

test('cards stay ASCII so DejaVu on CI never renders tofu', () => {
  const svg = lotCard({ ...LOT, provider: '\u25b2 Apex Ant', id: 1 });
  assert.ok(!svg.includes('\u25b2'));
  const cyrillic = boardCard({ ...BOARD, note: 'привет' });
  assert.ok(!/[^\x00-\x7F]/.test(cyrillic));
});

test('cardFor maps the three data families and skips the rest', () => {
  assert.ok(cardFor('board', BOARD).startsWith('<svg'));
  assert.ok(cardFor('epoch', EPOCH).startsWith('<svg'));
  assert.ok(cardFor('lot', LOT).startsWith('<svg'));
  assert.equal(cardFor('network', { buyers: 1 }), null);
  assert.equal(cardFor('edu', {}), null);
});

test('renderPng returns a non-empty PNG buffer', async () => {
  const png = await renderPng(boardCard(BOARD));
  assert.ok(Buffer.isBuffer(png));
  assert.ok(png.length > 1000);
  assert.equal(png[0], 0x89);
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
});
