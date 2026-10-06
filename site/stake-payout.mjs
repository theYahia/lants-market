// Stake offer payout: pure formula shared by the CLI and tests (no DOM, no network).
// Spec: docs/incentives.md "Offers" — `pays: new` pays positions with stakeStartEpoch == N in creation order
// until capAnts is used; ANTS at max lock = weight / 104. `pays: all` pays every position pro rata over the cap.

const WEI = 10n ** 18n;
const MAX_LOCK_FACTOR = 104n;

export const STAKE_FORMULA = 'ants_i = weight_i(N) / 104; new: positions with stakeStartEpoch == N by id until capAnts; all: pro rata if Σants > capAnts; usdc_i = floor(ants_i × usdcPer1k / 1000), micro-USDC';

function microPer1k(offer) {
  return BigInt(Math.round(offer.usdcPer1k * 1e6));
}

function eligible(positions, offer, epoch) {
  const pool = String(offer.pool);
  const key = String(epoch);
  return positions
    .filter((p) => String(p.agentId) === pool)
    .filter((p) => offer.pays !== 'new' || Number(p.stakeStartEpoch) === epoch)
    .map((p) => ({ id: String(p.id), antsWei: BigInt(p.weightsByEpoch?.[key] || '0') / MAX_LOCK_FACTOR }))
    .filter((p) => p.antsWei > 0n)
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

function allot(rows, offer) {
  const cap = BigInt(offer.capAnts) * WEI;
  if (offer.pays === 'new') {
    let left = cap;
    return rows.map((r) => {
      const take = r.antsWei < left ? r.antsWei : left;
      left -= take;
      return { ...r, paidWei: take };
    });
  }
  const sum = rows.reduce((s, r) => s + r.antsWei, 0n);
  return rows.map((r) => ({ ...r, paidWei: sum > cap ? (r.antsWei * cap) / sum : r.antsWei }));
}

export function stakePayout(positions, offer, epoch, owners, exclude) {
  const excl = {};
  for (const k in exclude) excl[k.toLowerCase()] = exclude[k];
  const rate = microPer1k(offer);
  const byPosition = [];
  const payouts = {};
  const excluded = {};
  let total = 0n;
  for (const r of allot(eligible(positions, offer, epoch), offer)) {
    const owner = String(owners[r.id] || '').toLowerCase();
    const micro = (r.paidWei * rate) / 1000n / WEI;
    byPosition.push({ id: r.id, owner, ants: String(r.antsWei), paidAnts: String(r.paidWei), micro: String(micro) });
    if (!owner) {
      excluded['#' + r.id] = 'no_owner';
      continue;
    }
    if (owner in excl) {
      excluded[owner] = excl[owner];
      continue;
    }
    if (micro === 0n) continue;
    payouts[owner] = String(BigInt(payouts[owner] || '0') + micro);
    total += micro;
  }
  return { byPosition, payouts, excluded, total: String(total) };
}

export function validStakeOffer(offer) {
  if (!offer || typeof offer !== 'object' || offer.type !== undefined) return false;
  if (typeof offer.pool !== 'string' || !/^\d+$/.test(offer.pool)) return false;
  if (!Array.isArray(offer.epochs) || !offer.epochs.every(Number.isInteger)) return false;
  if (typeof offer.usdcPer1k !== 'number' || !(offer.usdcPer1k > 0)) return false;
  if (!Number.isInteger(offer.capAnts) || !(offer.capAnts > 0)) return false;
  if (offer.pays !== 'new' && offer.pays !== 'all') return false;
  return typeof offer.payer === 'string' && /^0x[0-9a-fA-F]{40}$/.test(offer.payer);
}
