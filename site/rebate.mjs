// Rebate offers: schema, epoch state and the payout formula. Pure module (no DOM, no network):
// the page and the node payout script import the same code. Spec: scripts/site/check_rebate.py.
// An optional `stakeGate: {minStakeAnts}` pays only buyers who own >= N ANTS (at max lock,
// weight / 104) in the seller's pool during the offer's epoch. Positions carry a resolved `owner`.

// D18: a campaign cap above $20 needs the external audit first; raising the
// bound is a separate commit (docs/decisions.md).
export const MAX_CAP_USDC_PRE_AUDIT = 20;

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
  if (offer.capUsdc > MAX_CAP_USDC_PRE_AUDIT) return false;
  if (offer.capPerBuyerUsdc !== undefined) {
    if (typeof offer.capPerBuyerUsdc !== 'number' || !Number.isFinite(offer.capPerBuyerUsdc) || !(offer.capPerBuyerUsdc > 0)) return false;
    if (offer.capPerBuyerUsdc > offer.capUsdc) return false;
  }
  if (offer.minSpendUsdc !== undefined) {
    if (typeof offer.minSpendUsdc !== 'number' || !Number.isFinite(offer.minSpendUsdc) || !(offer.minSpendUsdc >= 0)) return false;
  }
  if (offer.stakeGate !== undefined) {
    if (typeof offer.stakeGate !== 'object' || offer.stakeGate === null) return false;
    if (offer.stakeGate.minStakeAnts !== undefined) {
      if (!Number.isInteger(offer.stakeGate.minStakeAnts) || !(offer.stakeGate.minStakeAnts > 0)) return false;
    }
    if (Object.keys(offer.stakeGate).some(k => k !== 'minStakeAnts')) return false;
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

export const REBATE_FORMULA =
  'persona gate: buyers sorted by spend desc (tie: addr asc); a persona admits k buyers (k = floor(stakeAnts / minStakeAnts)); payout = min(spend_i x pctBps / 10000, capPerBuyer) (floor); if sum(r) > cap: p_i = r_i x cap / sum(r) (floor); payout always to the buyer';

export function rebatePayout(spends, offer, exclude, stakeByPersona, personaOf) {
  const bps = BigInt(offer.pctBps);
  const cap = BigInt(Math.round(offer.capUsdc * 1e6));
  const capPerBuyer = offer.capPerBuyerUsdc !== undefined ? BigInt(Math.round(offer.capPerBuyerUsdc * 1e6)) : undefined;
  const minSpend = offer.minSpendUsdc !== undefined ? BigInt(Math.round(offer.minSpendUsdc * 1e6)) : 0n;
  const stakeGate = offer.stakeGate || {};
  const minStakeAnts = stakeGate.minStakeAnts !== undefined ? BigInt(stakeGate.minStakeAnts) * 10n ** 18n : 0n;

  const excl = {};
  for (const k in exclude) excl[k.toLowerCase()] = exclude[k];

  // persona: buyer -> persona (operator on two blocks, else the buyer itself).
  const persona = (addr) => {
    const p = personaOf && personaOf[addr.toLowerCase()];
    return (p || addr).toLowerCase();
  };

  const excluded = {};
  const candidates = [];
  for (const a in spends) {
    const addr = a.toLowerCase();
    if (addr in excl) {
      excluded[addr] = excl[addr];
      continue;
    }
    const s = BigInt(spends[a]);
    if (s < minSpend) {
      excluded[addr] = 'below_min_spend';
      continue;
    }
    candidates.push({ addr, s, p: persona(addr) });
  }

  const admitted = [];
  if (minStakeAnts > 0n) {
    // group by persona; within a persona sort by spend desc, then addr asc
    const byPersona = {};
    for (const c of candidates) (byPersona[c.p] ||= []).push(c);
    for (const p in byPersona) {
      const group = byPersona[p].sort((x, y) => {
        if (x.s !== y.s) return x.s < y.s ? 1 : -1;
        return x.addr < y.addr ? -1 : 1;
      });
      const stake = BigInt((stakeByPersona && stakeByPersona[p]) || '0');
      const k = stake / minStakeAnts; // floor; how many buyers this persona can cover
      for (let i = 0; i < group.length; i++) {
        if (i < Number(k)) admitted.push(group[i]);
        else excluded[group[i].addr] = 'stake_gate';
      }
    }
  } else {
    admitted.push(...candidates);
  }

  const r = {};
  for (const b of admitted) {
    let v = (b.s * bps) / 10000n;
    if (capPerBuyer !== undefined && v > capPerBuyer) v = capPerBuyer;
    if (v > 0n) r[b.addr] = v;
  }

  let total = 0n;
  for (const addr in r) total += r[addr];

  const cut = total > cap;
  let payouts = r;
  if (cut) {
    const capped = {};
    for (const addr in r) {
      const v = (r[addr] * cap) / total;
      if (v > 0n) capped[addr] = v;
    }
    payouts = capped;
    total = 0n;
    for (const addr in payouts) total += payouts[addr];
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

export function rebateLabel(offer, epoch) {
  const pct = offer.pctBps / 100;
  const cap = offer.capUsdc;
  let text = `${pct}% back, up to $${cap}`;
  if (offer.capPerBuyerUsdc !== undefined) {
    text += ` · max $${offer.capPerBuyerUsdc}/buyer`;
  }
  if (offer.stakeGate?.minStakeAnts) {
    text += ` · stake-gated discount, ≥${offer.stakeGate.minStakeAnts} ANTS staked`;
  }
  const state = offerState(offer, epoch);
  if (state === 'upcoming') {
    text += ` · starts epoch ${offer.epochs[0]}`;
  } else if (state === 'ended') {
    text += ` · ended`;
  }
  return text;
}

export function rebateLine(offer, epoch, poolNames) {
  const name = poolNames[offer.pool];
  const prefix = name ? `${name} (pool ${offer.pool})` : `Pool ${offer.pool}`;
  const line = `${prefix} · ${rebateLabel(offer, epoch)} · paid by ${offer.payer}`;
  const note = offer.note || '';
  return { line, note };
}

// rebate:label-end
