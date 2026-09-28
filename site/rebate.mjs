// Rebate offers: schema, epoch state and the payout formula. Pure module (no DOM, no network):
// the page and the node payout script import the same code. Spec: scripts/site/check_rebate.py.

export function validRebate(offer) {
  if (!offer || typeof offer !== 'object') return false;
  if (offer.type !== 'rebate') return false;
  if (typeof offer.pool !== 'string' || !/^\d+$/.test(offer.pool)) return false;
  if (!Array.isArray(offer.epochs)) return false;
  if (offer.epochs.length !== 1) return false;
  if (!Number.isInteger(offer.epochs[0])) return false;
  if (!Number.isInteger(offer.pctBps)) return false;
  if (!(offer.pctBps >= 1 && offer.pctBps <= 5000)) return false;
  if (typeof offer.capUsdc !== 'number' || !Number.isFinite(offer.capUsdc) || !(offer.capUsdc > 0)) return false;
  if (offer.capPerBuyerUsdc !== undefined) {
    if (typeof offer.capPerBuyerUsdc !== 'number' || !Number.isFinite(offer.capPerBuyerUsdc) || !(offer.capPerBuyerUsdc > 0)) return false;
  }
  if (offer.minSpendUsdc !== undefined) {
    if (typeof offer.minSpendUsdc !== 'number' || !Number.isFinite(offer.minSpendUsdc) || !(offer.minSpendUsdc >= 0)) return false;
  }
  if (typeof offer.payer !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(offer.payer)) return false;
  if (offer.note !== undefined && offer.note !== null && typeof offer.note !== 'string') return false;
  if (typeof offer.note === 'string' && offer.note.length > 140) return false;
  if (offer.usdcPer1k !== undefined) return false;
  if (offer.capAnts !== undefined) return false;
  return true;
}

export function offerState(offer, displayEpoch) {
  const d = Number(displayEpoch);
  const e = Number(offer.epochs[0]);
  if (e > d) return 'upcoming';
  if (e === d) return 'active';
  return 'ended';
}

export const REBATE_FORMULA = 'r_i = min(spend_i × pctBps / 10000, capPerBuyer) (floor); buyers with spend_i < minSpend or in exclude dropped; if Σr > cap: p_i = r_i × cap / Σr (multiply, then floor); remainder not distributed';

export function rebatePayout(spends, offer, exclude) {
  const bps = BigInt(offer.pctBps);
  const cap = BigInt(Math.round(offer.capUsdc * 1e6));
  const capPerBuyer = offer.capPerBuyerUsdc !== undefined ? BigInt(Math.round(offer.capPerBuyerUsdc * 1e6)) : undefined;
  const minSpend = offer.minSpendUsdc !== undefined ? BigInt(Math.round(offer.minSpendUsdc * 1e6)) : 0n;
  const excl = {};
  for (const k in exclude) {
    excl[k.toLowerCase()] = exclude[k];
  }
  const r = {};
  const excluded = {};
  for (const a in spends) {
    const addr = a.toLowerCase();
    const s = BigInt(spends[a]);
    if (addr in excl) {
      excluded[addr] = excl[addr];
      continue;
    }
    if (s < minSpend) {
      excluded[addr] = 'below_min_spend';
      continue;
    }
    let v = s * bps / 10000n;
    if (capPerBuyer !== undefined && v > capPerBuyer) {
      v = capPerBuyer;
    }
    if (v > 0n) {
      r[addr] = v;
    }
  }
  let total = 0n;
  for (const addr in r) {
    total += r[addr];
  }
  let cut = total > cap;
  let payouts = r;
  if (cut) {
    const capped = {};
    for (const addr in r) {
      const v = r[addr] * cap / total;
      if (v > 0n) {
        capped[addr] = v;
      }
    }
    payouts = capped;
    total = 0n;
    for (const addr in payouts) {
      total += payouts[addr];
    }
  }
  return { payouts, excluded, total, cut };
}

export function rebateForSpend(spendMicro, offer) {
  const s = BigInt(spendMicro);
  const minSpend = offer.minSpendUsdc !== undefined ? BigInt(Math.round(offer.minSpendUsdc * 1e6)) : 0n;
  if (s < minSpend) return 0n;
  const bps = BigInt(offer.pctBps);
  let v = s * bps / 10000n;
  const capPerBuyer = offer.capPerBuyerUsdc !== undefined ? BigInt(Math.round(offer.capPerBuyerUsdc * 1e6)) : undefined;
  if (capPerBuyer !== undefined && v > capPerBuyer) {
    v = capPerBuyer;
  }
  return v;
}
