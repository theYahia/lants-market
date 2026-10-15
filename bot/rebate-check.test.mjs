import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRebates,
  loadVerifiedConfig,
  openPostText,
  warnPostText,
  utcClock
} from './rebate-check.mjs';
import { defaultState } from './state.mjs';

const USDC_RAW = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const PAYER = '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B';
const ROOT = '0x' + 'ab'.repeat(32);

const B26 = Math.floor(new Date('2026-10-08T09:54:21.000Z').getTime() / 1000);
const B27 = Math.floor(new Date('2026-10-15T09:54:21.000Z').getTime() / 1000);
const CLAIM_WINDOW = 14 * 24 * 3600;
const SWEEP_AFTER = B27 + 72 * 3600 + 5 * 24 * 3600;

function offer() {
  return {
    type: 'rebate',
    pool: '44694',
    epochs: [26],
    pctBps: 100,
    capUsdc: 10,
    payer: PAYER,
    note: 'test offer'
  };
}

function campaign(overrides = {}) {
  return {
    owner: PAYER.toLowerCase(),
    pendingOwner: '0x' + '0'.repeat(40),
    cancelDeadline: B26,
    finalizeDeadline: B27 + 72 * 3600,
    claimWindow: CLAIM_WINDOW,
    epochId: 26n,
    poolId: '44694',
    root: ROOT,
    total: 10n * 10n ** 6n,
    funded: 10n * 10n ** 6n,
    claimed: 0n,
    sweepAfter: SWEEP_AFTER,
    ...overrides
  };
}

function tree() {
  return { root: ROOT };
}

// Encodes a campaign object into the ABI hex that decodeCampaign expects, so
// the default deps.ethCall mock returns realistic data.
function encUint(v) {
  return BigInt(v).toString(16).padStart(64, '0');
}
function encAddr(a) {
  return a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
}
function encodeCampaignHex(c) {
  const poolBytes = new TextEncoder().encode(c.poolId);
  let poolHex = '';
  for (const b of poolBytes) poolHex += b.toString(16).padStart(2, '0');
  const padded = poolHex.padEnd(Math.ceil(poolHex.length / 64) * 64, '0');
  const head =
    encAddr(c.owner) +
    encAddr(c.pendingOwner) +
    encUint(c.cancelDeadline) +
    encUint(c.finalizeDeadline) +
    encUint(c.claimWindow) +
    encUint(c.epochId) +
    encUint(12 * 32) +
    c.root.replace(/^0x/, '').toLowerCase() +
    encUint(c.total) +
    encUint(c.funded) +
    encUint(c.claimed) +
    encUint(c.sweepAfter);
  return '0x' + head + encUint(poolBytes.length) + padded;
}

function makeDeps({ campaignHex, campaignFile = { campaignId: '7' }, treeFile = tree(), ethGetCode = '0xbeef' } = {}) {
  return {
    ethCall: async (to, data) => campaignHex || '0x',
    ethGetCode: async () => ethGetCode,
    fetchJson: async (urls) => {
      const u = urls[0];
      if (u.includes('.campaign.json')) return campaignFile;
      if (u.includes('.tree.json')) return treeFile;
      return null;
    }
  };
}

test('checkRebates: open window far from close -> one open post', async () => {
  const nowMs = (SWEEP_AFTER - 10 * 24 * 3600) * 1000;
  const posts = await checkRebates({
    deps: makeDeps({ campaignHex: encodeCampaignHex(campaign()) }),
    state: defaultState(),
    config: { address: '0x' + '1'.repeat(40), runtimeCodeHash: '0x', deployBlock: 1 },
    offers: [offer()],
    nowMs
  });
  assert.equal(posts.length, 1);
  assert.ok(posts[0].text.includes('Rebate claims are open'));
  assert.ok(posts[0].text.includes('Open Forge'));
  assert.ok(posts[0].text.includes('epoch 26'));
});

test('checkRebates: window closing in under 48h -> warn post instead of open', async () => {
  const nowMs = (SWEEP_AFTER - 24 * 3600) * 1000;
  const posts = await checkRebates({
    deps: makeDeps({ campaignHex: encodeCampaignHex(campaign()) }),
    state: defaultState(),
    config: { address: '0x' + '1'.repeat(40) },
    offers: [offer()],
    nowMs
  });
  assert.equal(posts.length, 1);
  assert.ok(posts[0].text.includes('window closing'));
  const s = defaultState();
  posts[0].apply(s);
  assert.deepEqual(s.rebates['26-44694'], { open: true, warn48: true });
});

test('checkRebates: open already posted -> warn at 48h, then silence', async () => {
  const config = { address: '0x' + '1'.repeat(40) };
  const deps = makeDeps({ campaignHex: encodeCampaignHex(campaign()) });

  const stateOpen = defaultState();
  stateOpen.rebates['26-44694'] = { open: true, warn48: false };
  const far = (SWEEP_AFTER - 10 * 24 * 3600) * 1000;
  const postsFar = await checkRebates({ deps, state: stateOpen, config, offers: [offer()], nowMs: far });
  assert.equal(postsFar.length, 0);

  const near = (SWEEP_AFTER - 24 * 3600) * 1000;
  const postsNear = await checkRebates({ deps, state: stateOpen, config, offers: [offer()], nowMs: near });
  assert.equal(postsNear.length, 1);
  postsNear[0].apply(stateOpen);
  assert.deepEqual(stateOpen.rebates['26-44694'], { open: true, warn48: true });

  const again = await checkRebates({ deps, state: stateOpen, config, offers: [offer()], nowMs: near });
  assert.equal(again.length, 0);
});

test('checkRebates: silent when root is not set', async () => {
  const c = campaign({ root: '0x' + '0'.repeat(64) });
  const posts = await checkRebates({
    deps: makeDeps({ campaignHex: encodeCampaignHex(c) }),
    state: defaultState(),
    config: { address: '0x' + '1'.repeat(40) },
    offers: [offer()],
    nowMs: (SWEEP_AFTER - 10 * 24 * 3600) * 1000
  });
  assert.equal(posts.length, 0);
});

test('checkRebates: silent when the tree does not match the root', async () => {
  const posts = await checkRebates({
    deps: makeDeps({ campaignHex: encodeCampaignHex(campaign()), treeFile: { root: '0x' + 'cd'.repeat(32) } }),
    state: defaultState(),
    config: { address: '0x' + '1'.repeat(40) },
    offers: [offer()],
    nowMs: (SWEEP_AFTER - 10 * 24 * 3600) * 1000
  });
  assert.equal(posts.length, 0);
});

test('checkRebates: silent when the campaign is not the payer\u2019s (squatter)', async () => {
  const c = campaign({ owner: '0x' + 'f'.repeat(40) });
  const posts = await checkRebates({
    deps: makeDeps({ campaignHex: encodeCampaignHex(c) }),
    state: defaultState(),
    config: { address: '0x' + '1'.repeat(40) },
    offers: [offer()],
    nowMs: (SWEEP_AFTER - 10 * 24 * 3600) * 1000
  });
  assert.equal(posts.length, 0);
});

test('checkRebates: silent without a campaign file and for non-rebate offers', async () => {
  const posts = await checkRebates({
    deps: makeDeps({ campaignFile: { campaignId: null } }),
    state: defaultState(),
    config: { address: '0x' + '1'.repeat(40) },
    offers: [offer(), { pool: '44694', epochs: [25], usdcPer1k: 1, capAnts: 10000, payer: PAYER, pays: 'new' }],
    nowMs: (SWEEP_AFTER - 10 * 24 * 3600) * 1000
  });
  assert.equal(posts.length, 0);
});

test('checkRebates: silent for a sweeping (expired) window', async () => {
  const nowMs = (SWEEP_AFTER + 60) * 1000;
  const posts = await checkRebates({
    deps: makeDeps({ campaignHex: encodeCampaignHex(campaign()) }),
    state: defaultState(),
    config: { address: '0x' + '1'.repeat(40) },
    offers: [offer()],
    nowMs
  });
  assert.equal(posts.length, 0);
});

test('checkRebates: null config -> silent', async () => {
  const posts = await checkRebates({
    deps: makeDeps(),
    state: defaultState(),
    config: null,
    offers: [offer()],
    nowMs: (SWEEP_AFTER - 10 * 24 * 3600) * 1000
  });
  assert.equal(posts.length, 0);
});

test('loadVerifiedConfig: passes only with code, hash and USDC all matching', async () => {
  const { keccak256 } = await import('../site/keccak.mjs');
  const cfg = {
    address: '0x' + '1'.repeat(40),
    runtimeCodeHash: keccak256('0xbeef'),
    deployBlock: 1
  };
  const usdcCall = '0x' + '0'.repeat(24) + USDC_RAW.slice(2);

  const good = {
    ethGetCode: async () => '0xbeef',
    ethCall: async (to, data) => usdcCall
  };
  assert.ok(await loadVerifiedConfig(good, cfg));

  const noCode = { ethGetCode: async () => '0x', ethCall: async () => usdcCall };
  assert.equal(await loadVerifiedConfig(noCode, cfg), null);

  const wrongHash = { ...cfg, runtimeCodeHash: '0x' + 'cd'.repeat(32) };
  assert.equal(await loadVerifiedConfig(good, wrongHash), null);

  const badUsdc = {
    ethGetCode: async () => '0xbeef',
    ethCall: async () => '0x' + '0'.repeat(24) + 'ff'.repeat(20)
  };
  assert.equal(await loadVerifiedConfig(badUsdc, cfg), null);
});

test('post texts carry the deadline and pool name', () => {
  assert.ok(openPostText(26, 'Open Forge', SWEEP_AFTER).includes(utcClock(SWEEP_AFTER)));
  assert.ok(warnPostText(26, 'Open Forge', SWEEP_AFTER).includes('48 hours'));
});
