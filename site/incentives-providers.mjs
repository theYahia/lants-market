// "For providers" section: the seller side of the points ledger. Each pool earns
// sellerBudget x its share of weighted seller points (capped at 5%); boost is the
// pool weight that multiplies points per $1. Also hosts the "no pool" sellers.
import { buildSection, buildPostOfferButton, infoIcon } from './incentives-hero.mjs';
import { sellerRewardCell, sellerPointsUsage, poolBoost, listPools } from './incentives-points.mjs';
import { buildNoPool } from './incentives-nopool.mjs';

function boostText(boost) {
  if (boost.weightWei === 0n) return 'no stake next epoch';
  const staked = Math.round(boost.stakedAnts).toLocaleString('en-US');
  const multiplier = (boost.weightWei / 10n ** 18n).toLocaleString('en-US');
  return `${staked} ANTS staked \u2192 ${multiplier}\u00D7 points`;
}

function buildProviderTable(snapshot, poolNames) {
  const su = sellerPointsUsage(snapshot);
  const rows = listPools(snapshot).map((pool) => ({
    pool,
    reward: sellerRewardCell(snapshot, pool),
    boost: poolBoost(snapshot, pool),
  }));
  rows.sort((a, b) => {
    const aw = a.reward.wei === null ? -1n : a.reward.wei;
    const bw = b.reward.wei === null ? -1n : b.reward.wei;
    if (aw !== bw) return aw < bw ? 1 : -1;
    if (a.boost.weightWei !== b.boost.weightWei) return a.boost.weightWei < b.boost.weightWei ? 1 : -1;
    return String(poolNames[a.pool] || a.pool).localeCompare(String(poolNames[b.pool] || b.pool));
  });

  const table = document.createElement('table');
  table.className = 'inc-board-table inc-providers-table';
  const thead = document.createElement('thead');
  const headTr = document.createElement('tr');
  const headings = [
    { text: 'Seller', tip: 'Seller pool. A provider earns the seller budget share of its pool\u2019s weighted points.' },
    {
      text: su ? su.heading : 'Provider reward (ANTS per epoch)',
      tip: 'sellerBudget \u00D7 weightedPoolPoints(pool) / totalWeightedPoolPoints for this epoch, capped at MAX_REWARD_SHARE_BPS (5%) of the seller budget. Shows the final previous epoch while this epoch has almost no sales.',
    },
    { text: 'Boost', tip: 'Pool weight next epoch: the contract multiplies buyer and seller points per $1 by it. ANTS staked is weight / 104 (max lock).' },
  ];
  for (const h of headings) {
    const th = document.createElement('th');
    const btn = document.createElement('button');
    btn.className = 'inc-sort';
    btn.textContent = h.text;
    th.appendChild(btn);
    th.appendChild(infoIcon(h.tip));
    headTr.appendChild(th);
  }
  thead.appendChild(headTr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.className = 'provider-row';
    tr.dataset.pool = row.pool;
    const tdPool = document.createElement('td');
    const name = poolNames[row.pool];
    if (name) {
      tdPool.textContent = name;
      const idSpan = document.createElement('span');
      idSpan.className = 'inc-pool-id';
      idSpan.textContent = row.pool;
      tdPool.appendChild(idSpan);
    } else {
      tdPool.textContent = row.pool;
    }
    const tdReward = document.createElement('td');
    tdReward.textContent = row.reward.text;
    const tdBoost = document.createElement('td');
    tdBoost.textContent = boostText(row.boost);
    tr.appendChild(tdPool);
    tr.appendChild(tdReward);
    tr.appendChild(tdBoost);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  const wrap = document.createElement('div');
  wrap.className = 'inc-board-scroll';
  wrap.appendChild(table);
  return wrap;
}

// A full section: provider rewards and boost, the offer CTA, and the no-pool block.
export function buildProvidersSection(snapshot, mode, poolNames, offers, displayEpoch) {
  const body = document.createElement('div');
  body.appendChild(buildProviderTable(snapshot, poolNames));

  const cta = document.createElement('div');
  cta.className = 'inc-provider-cta';
  const label = document.createElement('span');
  label.className = 'inc-cta-label';
  label.textContent = 'Provide a seller pool? Offer USDC to its stakers next epoch.';
  cta.appendChild(label);
  cta.appendChild(buildPostOfferButton(displayEpoch));
  body.appendChild(cta);

  const nopool = buildNoPool(snapshot, poolNames);
  if (nopool) body.appendChild(nopool);

  const lead = 'A provider earns the seller budget share of its pool\u2019s weighted points. Boost is the pool weight: it multiplies points per $1 for the seller and for its buyers.';
  return buildSection('For providers', lead, body, 'inc-providers-section');
}
