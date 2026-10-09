// CI guard: re-verify every published payer authorization. For each
// rebates/<epoch>-<pool>.campaign.json it rebuilds the EIP-712 typed data from
// site/offers.json and the claims address pinned in site/rebate-claims.json,
// then re-runs the full check of site/rebate-authorize.mjs (bindings +
// signature). A campaign file without a valid authorization fails `npm test`;
// with no campaign files at all the guard passes (nothing published yet).
//
// Usage: node scripts/site/check_authorizations.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyAuthorization } from '../../site/rebate-authorize.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const CAMPAIGN_RE = /^(\d+)-(\d+)\.campaign\.json$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// Verifies all campaign files in `rebatesDir` against the parsed `offers` and
// the pinned `claimsAddress`. Returns { ok, failures }.
export async function checkAuthorizations({ rebatesDir, offers, claimsAddress }) {
  const failures = [];
  const names = existsSync(rebatesDir) ? readdirSync(rebatesDir).filter((f) => CAMPAIGN_RE.test(f)).sort() : [];
  if (names.length === 0) return { ok: true, failures };
  if (!ADDRESS_RE.test(String(claimsAddress))) {
    return { ok: false, failures: ['site/rebate-claims.json: missing or bad address — a published campaign needs the pinned claims contract'] };
  }
  const list = Array.isArray(offers) ? offers : [];
  for (const name of names) {
    const m = CAMPAIGN_RE.exec(name);
    const epoch = Number(m[1]);
    const pool = m[2];
    let j = null;
    try {
      j = JSON.parse(readFileSync(path.join(rebatesDir, name), 'utf8'));
    } catch (e) {
      failures.push(`${name}: unreadable JSON: ${e && e.message}`);
      continue;
    }
    const offer = list.find(
      (o) => o && o.type === 'rebate' && String(o.pool) === pool && Array.isArray(o.epochs) && Number(o.epochs[0]) === epoch
    );
    if (!offer) {
      failures.push(`${name}: no matching rebate offer in site/offers.json`);
      continue;
    }
    try {
      await verifyAuthorization({ offer, epoch, claimsAddress, auth: j && j.payerAuthorization });
    } catch (e) {
      failures.push(`${name}: ${(e && e.message) || e}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

async function main() {
  let offers = null;
  try {
    offers = JSON.parse(readFileSync(path.join(REPO, 'site', 'offers.json'), 'utf8'));
  } catch {
    offers = null;
  }
  let claimsAddress = null;
  try {
    claimsAddress = JSON.parse(readFileSync(path.join(REPO, 'site', 'rebate-claims.json'), 'utf8')).address;
  } catch {
    claimsAddress = null;
  }
  const { ok, failures } = await checkAuthorizations({
    rebatesDir: path.join(REPO, 'rebates'),
    offers,
    claimsAddress
  });
  console.log(ok ? 'authorizations_ok=1' : 'authorizations_ok=0');
  for (const f of failures) console.log('reason=' + f);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('check_authorizations failed: ' + ((e && e.message) || e));
    process.exit(1);
  });
}
