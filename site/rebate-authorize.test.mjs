import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateKeyToAccount } from 'viem/accounts';
import { authorizationTypedData, campaignParams } from './rebate-campaign.mjs';
import { checkAuthorizations } from '../scripts/site/check_authorizations.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
// Well-known anvil test keys; never used on chain.
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const OTHER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const CLAIMS = '0x' + '5c'.repeat(20);
const CAMPAIGN_WALLET = '0x' + '22'.repeat(20);

const payer = privateKeyToAccount(KEY);
const other = privateKeyToAccount(OTHER_KEY);
const OFFER = { type: 'rebate', pool: '11111', epochs: [28], pctBps: 300, capUsdc: 10, payer: payer.address };
const PARAMS = campaignParams(OFFER, 28);

async function signAuth(account, { poolId = '11111', claimsAddress = CLAIMS, campaignWallet = CAMPAIGN_WALLET } = {}) {
  const typed = authorizationTypedData({ claimsAddress, params: { ...PARAMS, poolId }, campaignWallet });
  const signature = await account.signTypedData({
    domain: typed.domain,
    types: typed.types,
    primaryType: typed.primaryType,
    message: typed.message
  });
  return {
    payer: account.address,
    campaignWallet,
    epochId: 28,
    poolId,
    cancelDeadline: PARAMS.cancelDeadline,
    finalizeDeadline: PARAMS.finalizeDeadline,
    claimWindow: PARAMS.claimWindow,
    signature
  };
}

async function withTmp(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'rebate-auth-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const campaignFiles = (dir) => readdirSync(dir).filter((f) => f.endsWith('.campaign.json'));

function runCli(dir, offer, auth) {
  const offerPath = path.join(dir, 'offer.json');
  const authPath = path.join(dir, 'signed.json');
  writeFileSync(offerPath, JSON.stringify(offer));
  writeFileSync(authPath, JSON.stringify(auth));
  return spawnSync(
    process.execPath,
    ['site/rebate-authorize.mjs', '--offer', offerPath, '--epoch', '28', '--auth', authPath, '--claims', CLAIMS, '--out', dir],
    { cwd: REPO, encoding: 'utf8' }
  );
}

test('a valid signature is published and an existing file is never overwritten', async () => {
  await withTmp(async (dir) => {
    const auth = await signAuth(payer);
    const r = runCli(dir, OFFER, auth);
    assert.equal(r.status, 0, r.stderr);
    const file = path.join(dir, '28-11111.campaign.json');
    assert.ok(existsSync(file), 'campaign.json was not written');
    const j = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(j.payerAuthorization.signature, auth.signature);
    assert.equal(j.payerAuthorization.payer.toLowerCase(), payer.address.toLowerCase());
    assert.equal(j.payerAuthorization.claimsAddress, CLAIMS);
    assert.equal(j.campaignId, undefined, 'campaignId is added only after funding');
    const r2 = runCli(dir, OFFER, auth);
    assert.notEqual(r2.status, 0, 'a repeated run must not overwrite the file');
  });
});

test('a signature from another address is refused', async () => {
  await withTmp(async (dir) => {
    const impostor = await signAuth(other);
    const r1 = runCli(dir, OFFER, impostor);
    assert.notEqual(r1.status, 0);
    assert.deepEqual(campaignFiles(dir), []);
    const stolen = await signAuth(other);
    stolen.payer = payer.address;
    const r2 = runCli(dir, OFFER, stolen);
    assert.notEqual(r2.status, 0, 'declaring the payer cannot replace their signature');
    assert.deepEqual(campaignFiles(dir), []);
  });
});

test('a tampered poolId is refused', async () => {
  await withTmp(async (dir) => {
    const auth = await signAuth(payer);
    auth.poolId = '22222';
    const r = runCli(dir, { ...OFFER, pool: '22222' }, auth);
    assert.notEqual(r.status, 0, 'the bindings pass but the signature must fail');
    assert.deepEqual(campaignFiles(dir), []);
    const auth2 = await signAuth(payer);
    auth2.poolId = '22222';
    const r2 = runCli(dir, OFFER, auth2);
    assert.notEqual(r2.status, 0, 'a binding mismatch must fail before the signature check');
    assert.deepEqual(campaignFiles(dir), []);
  });
});

test('a signature for another claims contract is refused', async () => {
  await withTmp(async (dir) => {
    const auth = await signAuth(payer, { claimsAddress: '0x' + '77'.repeat(20) });
    const r = runCli(dir, OFFER, auth);
    assert.notEqual(r.status, 0);
    assert.deepEqual(campaignFiles(dir), []);
  });
});

test('the CI guard re-verifies every published campaign.json', async () => {
  await withTmp(async (dir) => {
    const rebatesDir = path.join(dir, 'rebates');
    mkdirSync(rebatesDir, { recursive: true });
    const file = path.join(rebatesDir, '28-11111.campaign.json');
    const payload = {
      payerAuthorization: { chainId: 8453, claimsAddress: CLAIMS, ...(await signAuth(payer)) }
    };
    writeFileSync(file, JSON.stringify(payload));
    const good = await checkAuthorizations({ rebatesDir, offers: [OFFER], claimsAddress: CLAIMS });
    assert.equal(good.ok, true, JSON.stringify(good.failures));
    payload.payerAuthorization.signature = (await signAuth(other)).signature;
    writeFileSync(file, JSON.stringify(payload));
    const bad = await checkAuthorizations({ rebatesDir, offers: [OFFER], claimsAddress: CLAIMS });
    assert.equal(bad.ok, false);
    assert.match(bad.failures.join(' '), /recover/);
    const unpinned = await checkAuthorizations({ rebatesDir, offers: [OFFER], claimsAddress: null });
    assert.equal(unpinned.ok, false, 'a published campaign without a pinned claims address must fail');
    const noFiles = await checkAuthorizations({ rebatesDir: path.join(dir, 'missing'), offers: [OFFER], claimsAddress: null });
    assert.equal(noFiles.ok, true, 'nothing published -> the guard passes');
  });
});
