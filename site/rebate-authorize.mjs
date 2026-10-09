// Publish the payer's EIP-712 authorization for one rebate campaign.
//
// The site's "Sign payer authorization" button only signs (the browser never
// loads a secp256k1 implementation); this Node CLI recovers the signer with
// viem and writes rebates/<epoch>-<pool>.campaign.json with the `wx` flag (an
// existing file is never overwritten). The CI guard
// scripts/site/check_authorizations.mjs re-runs the same verification for every
// published file on `npm test`, so the browser may trust the file's bindings.
//
// Usage:
//   node site/rebate-authorize.mjs --offer file --epoch N --auth signed.json \
//     --claims 0x<claims contract> [--out dir]
// `signed.json` is exactly the JSON the site button emits:
//   {payer, campaignWallet, epochId, poolId, cancelDeadline, finalizeDeadline,
//    claimWindow, signature}
// The file is written only when the signature recovers to offer.payer and every
// binding equals campaignParams(offer, epoch); without a valid signature
// nothing is written.

import { verifyTypedData } from 'viem';
import { pathToFileURL } from 'node:url';
import { campaignParams, authorizationTypedData, CHAIN_ID } from './rebate-campaign.mjs';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;

// Full verification of one authorization against one offer. Returns the
// campaign.json payload or throws with the reason.
export async function verifyAuthorization({ offer, epoch, claimsAddress, auth }) {
  if (!ADDRESS_RE.test(String(claimsAddress))) throw new Error('bad claims address: ' + claimsAddress);
  if (!auth || typeof auth !== 'object') throw new Error('missing authorization JSON');
  const params = campaignParams(offer, epoch);
  if (String(auth.payer).toLowerCase() !== String(params.payer).toLowerCase()) {
    throw new Error('authorization payer is not the offer payer');
  }
  const campaignWallet = String(auth.campaignWallet);
  if (!ADDRESS_RE.test(campaignWallet)) throw new Error('bad campaignWallet: ' + auth.campaignWallet);
  if (!SIGNATURE_RE.test(String(auth.signature))) throw new Error('bad signature');
  if (auth.claimsAddress !== undefined && String(auth.claimsAddress).toLowerCase() !== String(claimsAddress).toLowerCase()) {
    throw new Error('authorization was signed for another claims contract: ' + auth.claimsAddress);
  }
  const bad = [];
  if (Number(auth.epochId) !== params.epochId) bad.push('epochId');
  if (String(auth.poolId) !== params.poolId) bad.push('poolId');
  if (Number(auth.cancelDeadline) !== params.cancelDeadline) bad.push('cancelDeadline');
  if (Number(auth.finalizeDeadline) !== params.finalizeDeadline) bad.push('finalizeDeadline');
  if (Number(auth.claimWindow) !== params.claimWindow) bad.push('claimWindow');
  if (bad.length) throw new Error('authorization does not match the offer: ' + bad.join(', '));
  const typed = authorizationTypedData({ claimsAddress, params, campaignWallet });
  const ok = await verifyTypedData({
    address: params.payer,
    domain: typed.domain,
    types: typed.types,
    primaryType: typed.primaryType,
    message: typed.message,
    signature: String(auth.signature)
  });
  if (!ok) throw new Error('signature does not recover to the offer payer');
  return {
    payerAuthorization: {
      chainId: CHAIN_ID,
      claimsAddress,
      payer: params.payer,
      campaignWallet,
      epochId: params.epochId,
      poolId: params.poolId,
      cancelDeadline: params.cancelDeadline,
      finalizeDeadline: params.finalizeDeadline,
      claimWindow: params.claimWindow,
      signature: String(auth.signature)
    }
  };
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--offer') o.offer = argv[++i];
    else if (a === '--epoch') o.epoch = Number(argv[++i]);
    else if (a === '--auth') o.auth = argv[++i];
    else if (a === '--claims') o.claims = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else throw new Error('unknown argument ' + a);
  }
  if (!o.offer || !Number.isInteger(o.epoch) || !o.auth || !o.claims) {
    throw new Error('usage: node site/rebate-authorize.mjs --offer file --epoch N --auth signed.json --claims 0x... [--out dir]');
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const fs = await import('node:fs');
  const path = await import('node:path');
  const offer = JSON.parse(fs.readFileSync(o.offer, 'utf-8'));
  const auth = JSON.parse(fs.readFileSync(o.auth, 'utf-8'));
  const payload = await verifyAuthorization({ offer, epoch: o.epoch, claimsAddress: o.claims, auth });
  const outDir = path.resolve(o.out || 'rebates');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${payload.payerAuthorization.epochId}-${payload.payerAuthorization.poolId}.campaign.json`);
  if (fs.existsSync(file)) throw new Error('file already exists: ' + file);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', { flag: 'wx' });
  console.log(file);
}

const isEntry = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isEntry) {
  main().catch((e) => {
    console.error('rebate-authorize: ' + ((e && e.message) || e));
    process.exit(1);
  });
}
