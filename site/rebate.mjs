// Rebate offers: schema, epoch state and the payout formula. Pure module (no DOM, no network):
// the page and the node payout script import the same code. Spec: scripts/site/check_rebate.py.

export function validRebate(offer) {
  throw new Error('validRebate: not implemented');
}

export function offerState(offer, displayEpoch) {
  throw new Error('offerState: not implemented');
}

export function rebatePayout(spends, offer, exclude) {
  throw new Error('rebatePayout: not implemented');
}

export function rebateForSpend(spendMicro, offer) {
  throw new Error('rebateForSpend: not implemented');
}
