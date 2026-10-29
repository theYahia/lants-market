// Loaders for the incentives snapshot/offers/names, plus the pure snapshot-derived
// computations (next budget, network headline numbers, cashback) and shared date
// formatting. No DOM, no network side effects beyond `fetch`.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function loadJSON(urls) {
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {
      // try next URL
    }
  }
  return null;
}

export async function loadSnapshot() {
  const urls = [
    'https://raw.githubusercontent.com/theYahia/lants-market/data/live.json',
    'https://ipfs.filebase.io/ipns/k51qzi5uqu5di86efhnadxw0k1sxnuo2tkcmegxcn2ra2r3exyfpv9htxhit6b/fixtures/snapshot-e23.live.json',
    './fixtures/snapshot-e23.live.json'
  ];
  const data = await loadJSON(urls);
  if (!data) throw new Error('Failed to load incentive data.');
  return data;
}

export async function loadOffers() {
  const data = await loadJSON([
    'https://raw.githubusercontent.com/theYahia/lants-market/main/site/offers.json',
    './offers.json'
  ]);
  if (!Array.isArray(data)) return null;
  return data;
}

export async function loadPoolNames() {
  const data = await loadJSON([
    'https://raw.githubusercontent.com/theYahia/lants-market/main/site/pool-names.json',
    './pool-names.json'
  ]);
  if (!data || typeof data !== 'object') return {};
  return data;
}

// Staker budget of epoch N as the rewards contract projects it; null for older snapshots or another epoch.
export function nextBudget(snapshot, N) {
  if (!snapshot.stakerBudgetNext || snapshot.stakerBudgetNextEpoch !== String(N)) return null;
  return Number(BigInt(snapshot.stakerBudgetNext)) / 1e18;
}

// The three network headline numbers for the target epoch N, derived from the
// snapshot only (never duplicated as constants). "S ANTS staked" is the whole
// network stake, so weight is summed from positions (weightsByEpoch), not from
// poolWeightByEpoch: the latest snapshot is sales-limited (pools without sales
// drop out), which would undercount "staked". Position-weight sum equals
// poolWeightAtEpoch. B is null when the snapshot carries no budget for epoch N
// (stale snapshot or another epoch); A is null whenever B is null.
export function networkMetrics(snapshot, N) {
  const B = nextBudget(snapshot, N);
  let totalWeight = 0n;
  for (const pos of snapshot.positions || []) {
    totalWeight += BigInt(String(pos.weightsByEpoch?.[String(N)] || '0'));
  }
  const stakedFloat = Number(totalWeight) / 1e18 / 104;
  const S = Math.round(stakedFloat);
  const A = B === null ? null : (S > 0 ? Math.round(B / S * 1000) : 0);
  return { B, S, A };
}

export function cashbackUsage(snapshot) {
  const se = Number(snapshot.epoch);
  const byEpoch = snapshot.usageByEpoch;
  if (!byEpoch || !byEpoch[String(se)]) return null;
  const cur = byEpoch[String(se)];
  const prev = byEpoch[String(se - 1)];
  if (prev && BigInt(cur.totalWeightedBuyerPoints || '0') * 20n < BigInt(prev.totalWeightedBuyerPoints || '0')) {
    return { usage: prev, epoch: se - 1, heading: `Buyer ANTS per $1, final, epoch ${se - 1}` };
  }
  return { usage: cur, epoch: se, heading: `Buyer ANTS per $1, epoch ${se} so far` };
}

export function cashbackCell(snapshot, pool) {
  const cb = cashbackUsage(snapshot);
  if (!cb) return { wei: 0n, text: '—' };
  const u = cb.usage;
  const t = BigInt(u.totalWeightedBuyerPoints || '0');
  const w = BigInt((u.poolWeights || {})[pool] || '0');
  const wei = t === 0n ? 0n : BigInt(u.buyerBudget || '0') * w * 1000000n / t;
  if (wei === 0n) {
    const next = String(Number(snapshot.epoch) + 1);
    const wn = BigInt(String(snapshot.poolWeightByEpoch?.[pool]?.[next] || '0'));
    return { wei, text: wn > 0n ? `from epoch ${next}` : '0' };
  }
  if (wei < 10n ** 18n) return { wei, text: '<1' };
  return { wei, text: (wei / 10n ** 18n).toLocaleString('en-US') };
}

// Spend in USD at which one buyer reaches MAX_REWARD_SHARE_BPS of the buyer budget.
// null when the snapshot cannot price the pool (no ledger, no weight, no cap).
export function buyerCapSpend(snapshot, pool) {
  const cb = cashbackUsage(snapshot);
  if (!cb) return null;
  const u = cb.usage;
  const t = BigInt(u.totalWeightedBuyerPoints || '0');
  if (t === 0n) return null;
  const budget = BigInt(u.buyerBudget || '0');
  const w = BigInt((u.poolWeights || {})[pool] || '0');
  const perDollar = budget * w * 1000000n / t;
  if (perDollar === 0n) return null;
  const capWei = budget * BigInt(snapshot.maxRewardShareBps ?? 0) / 10000n;
  if (capWei === 0n) return null;
  return Number((capWei + perDollar - 1n) / perDollar);
}

export function cashbackHead(snapshot) {
  const cb = cashbackUsage(snapshot);
  if (!cb) return { heading: 'Buyer ANTS per $1', tip: 'ANTS a buyer earns for each $1 spent with this seller this epoch. 0 = no pool: neither the seller nor its buyers earn ANTS.' };
  const cur = snapshot.usageByEpoch[String(Number(snapshot.epoch))];
  const cap = BigInt(cur.buyerBudget || '0') * BigInt(snapshot.maxRewardShareBps ?? 0) / 10000n / 10n ** 18n;
  return { heading: cb.heading, tip: `ANTS a buyer earns for each $1 spent with this seller this epoch. Falls as more sales land before the epoch ends. Capped at ${cap.toLocaleString('en-US')} ANTS per buyer per epoch. 0 = no pool: neither the seller nor its buyers earn ANTS.` };
}

// The seller detail line shown when a board row is expanded: cashback, cap, and the
// seller's sales history. `offerText` is the pool's offer column text from the board.
export function sellerDetailText(snapshot, pool, offerText) {
  const seller = snapshot.sellersById?.[pool];
  const cb = cashbackCell(snapshot, pool);
  let detailText = `${cb.text} ANTS per $1`;
  const cbUsage = cashbackUsage(snapshot);
  if (cbUsage && cbUsage.epoch === Number(snapshot.epoch) && cb.wei > 0n) {
    const cur = snapshot.usageByEpoch[String(Number(snapshot.epoch))];
    const cap = BigInt(cur.buyerBudget || '0') * BigInt(snapshot.maxRewardShareBps ?? 0) / 10000n / 10n ** 18n;
    const D = buyerCapSpend(snapshot, pool);
    if (D !== null) {
      detailText += ` · Cap of ${cap.toLocaleString('en-US')} ANTS reached at ≈ $${String(D)}`;
    }
  }
  const offer = ` · Offer: ${offerText}`;
  if (!seller) {
    return `No sales data from antscan · ${detailText}${offer}`;
  }
  const earned = Number(BigInt(seller.earnedUsdc || '0')) / 1e6;
  const period = Math.max(604800, Number(seller.lastSeenAt) - Number(seller.firstSeenAt));
  const avg = earned * 604800 / period;
  const lastDate = new Date(Number(seller.lastSeenAt) * 1000);
  return `${earned.toLocaleString('en-US', { maximumFractionDigits: 0 })} USDC all-time · ${avg.toLocaleString('en-US', { maximumFractionDigits: 1 })} avg per active week · ${Number(seller.uniqueBuyers).toLocaleString('en-US')} buyers · ${Number(seller.modelsServed).toLocaleString('en-US')} models · last sale ${formatDate(lastDate)} · ${detailText}${offer}`;
}

export function formatCountdown(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}

export function formatUtc(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${WEEKDAYS[date.getUTCDay()]} ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

export function formatDate(date) {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}
