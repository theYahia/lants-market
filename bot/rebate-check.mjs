// Rebate campaign watch: which rebate offers have a claim window open right
// now, and whether the window is about to close. Mirrors the claim UI's trust
// model: only the canonical campaign of a published offer is announced, and
// only when its on-chain state is `claims_open` (root set, published tree
// matches, inside the 14-day window).
//
// Network access is injected (`deps`), so the module stays testable without
// RPC. Data sources: offers.json, the published rebates/<epoch>-<pool>.*
// files, and the pinned RebateClaims config re-checked against the chain.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validRebate } from '../site/rebate.mjs';
import { epochBoundary } from '../site/epochs.mjs';
import { decodeAddress, decodeCampaign, encCampaignData, SEL } from '../site/rebate-claims-abi.mjs';
import { claimState, isCanonicalCampaign } from '../site/rebate-claim-state.mjs';
import { keccak256 } from '../site/keccak.mjs';
import { USDC } from '../site/rebate-claim-chain.mjs';
import { rebateKey } from './state.mjs';

export const WARN_48H_MS = 48 * 60 * 60 * 1000;
export const SITE_URL = 'https://lants.eth.limo';

export const OFFERS_URLS = [
  `${SITE_URL}/offers.json`,
  'https://raw.githubusercontent.com/theYahia/lants-market/main/site/offers.json'
];

export function rebateFileUrls(base, suffix) {
  // dist/ is gitignored and published only to the site, so lants.eth.limo is
  // the single canonical source for the published payout files.
  return [`${SITE_URL}/rebates/${base}${suffix}`];
}

export function loadLocalConfig() {
  const file = fileURLToPath(new URL('../site/rebate-claims.json', import.meta.url));
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

export function loadPoolNames() {
  const file = fileURLToPath(new URL('../site/pool-names.json', import.meta.url));
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return {};
  }
}

// Re-check the pinned claims config against the chain (code presence, runtime
// code hash, canonical USDC) — the same trust checks the site runs. Returns
// the config or null when the chain says no.
export async function loadVerifiedConfig(deps, config) {
  if (!config || !/^0x[0-9a-fA-F]{40}$/.test(String(config.address))) return null;
  try {
    const code = await deps.ethGetCode(config.address);
    if (!code || code === '0x') return null;
    if (keccak256(code) !== String(config.runtimeCodeHash).toLowerCase()) return null;
    const usdc = decodeAddress(await deps.ethCall(config.address, SEL.usdc));
    if (usdc.toLowerCase() !== USDC.toLowerCase()) return null;
    return config;
  } catch {
    return null;
  }
}

export function utcClock(sec) {
  return new Date(Number(sec) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

export function openPostText(epoch, poolName, sweepAfter) {
  return [
    `🪙 Rebate claims are open — epoch ${epoch} · ${poolName}`,
    '',
    `Claim your USDC on ${SITE_URL} before ${utcClock(sweepAfter)}.`,
    '',
    'After the window, unclaimed USDC returns to the seller.'
  ].join('\n');
}

export function warnPostText(epoch, poolName, sweepAfter) {
  return [
    `⏰ Rebate window closing — epoch ${epoch} · ${poolName}`,
    '',
    `Less than 48 hours left to claim your USDC on ${SITE_URL} (closes ${utcClock(sweepAfter)}).`,
    '',
    'Unclaimed rebates return to the seller after the window.'
  ].join('\n');
}

// One watch run. Returns a list of due posts: { text, apply(state) } where
// apply marks the state so the post is never repeated. Callers apply only
// after the message was actually delivered.
export async function checkRebates({ deps, state, config, offers, nowMs }) {
  const posts = [];
  if (!config || !Array.isArray(offers)) return posts;
  const poolNames = loadPoolNames();

  for (const offer of offers) {
    if (!validRebate(offer)) continue;
    const epoch = Number(offer.epochs[0]);
    const base = `${epoch}-${offer.pool}`;

    let campaignFile = null;
    try {
      campaignFile = await deps.fetchJson(rebateFileUrls(base, '.campaign.json'));
    } catch {
      campaignFile = null;
    }
    if (!campaignFile || campaignFile.campaignId === undefined || campaignFile.campaignId === null) continue;

    let campaign;
    try {
      campaign = decodeCampaign(await deps.ethCall(config.address, encCampaignData(BigInt(campaignFile.campaignId))));
    } catch {
      continue;
    }

    let tree = null;
    try {
      tree = await deps.fetchJson(rebateFileUrls(base, '.tree.json'));
    } catch {
      tree = null;
    }

    const authorization = campaignFile.payerAuthorization || null;
    try {
      if (!isCanonicalCampaign(campaign, offer, authorization)) continue;
    } catch {
      continue;
    }

    const nowSec = Math.floor(nowMs / 1000);
    const st = claimState({
      now: nowSec,
      epochStart: Math.floor(epochBoundary(epoch).getTime() / 1000),
      epochEnd: Math.floor(epochBoundary(epoch + 1).getTime() / 1000),
      campaign,
      tree
    });
    if (st.state !== 'claims_open') continue;

    const key = rebateKey(epoch, offer.pool);
    const r = state.rebates[key] || {};
    const remainingMs = Number(st.info.sweepAfter) * 1000 - nowMs;
    const warnDue = remainingMs > 0 && remainingMs <= WARN_48H_MS;
    const poolName = poolNames[String(offer.pool)] || `pool ${offer.pool}`;

    if (!r.open) {
      if (warnDue) {
        posts.push({
          text: warnPostText(epoch, poolName, st.info.sweepAfter),
          apply: (s) => {
            s.rebates[key] = { open: true, warn48: true };
          }
        });
      } else {
        posts.push({
          text: openPostText(epoch, poolName, st.info.sweepAfter),
          apply: (s) => {
            s.rebates[key] = { open: true, warn48: false };
          }
        });
      }
    } else if (!r.warn48 && warnDue) {
      posts.push({
        text: warnPostText(epoch, poolName, st.info.sweepAfter),
        apply: (s) => {
          s.rebates[key] = { open: true, warn48: true };
        }
      });
    }
  }
  return posts;
}
