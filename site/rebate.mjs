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

export function rebatePayout(spends, offer, exclude) {
  throw new Error('rebatePayout: not implemented');
}

export function rebateForSpend(spendMicro, offer) {
  throw new Error('rebateForSpend: not implemented');
}
