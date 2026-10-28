// "Selling, but no pool": sellers with earnings but no pool weight next epoch.
// Uses formatDate from the shared data module instead of an inline month table.
import { formatDate } from './incentives-data.mjs';

export function buildNoPool(snapshot, poolNames) {
  const ACTIVE_SECS = 14 * 86400;
  const MIN_EARNED = 1000000000n;
  const GRANT_ADDR = '0xB68AD13b681319fcEB6b0A640c2fd96C0138CBc8';
  const MIN_STAKE_USDC = 10000000; // 10 USDC in micro-USDC

  const e = Number(snapshot.epoch);
  const nextEpoch = String(e + 1);
  const genSecs = Math.floor(new Date(snapshot.generatedAt).getTime() / 1000);
  const positions = snapshot.positions || [];

  const usage = snapshot.usageByEpoch?.[String(e)] || {};
  const sb = BigInt(usage.sellerBudget || '0');
  const t = BigInt(usage.totalWeightedBuyerPoints || '0');
  const cap = sb * BigInt(snapshot.maxRewardShareBps || 0) / 10000n;
  const w1 = (BigInt(snapshot.starterInitEndEpoch || 0) - BigInt(e + 1)) * 10n ** 18n;
  const WEEK = 604800n;

  const estimateForSeller = (s) => {
    if (t === 0n) return null;
    const periodRaw = BigInt(s.lastSeenAt) - BigInt(s.firstSeenAt);
    const period = periodRaw < WEEK ? WEEK : periodRaw;
    const weekly = s.earned * WEEK / period;
    const r1 = sb * weekly * w1 / t;
    const w2 = w1 + r1 * 104n;
    const v = sb * weekly * w2 / t;
    return (v < cap ? v : cap) / 10n ** 18n;
  };

  // A pool here = one that carries weight into the next epoch. Weight is summed from
  // positions (weightsByEpoch), the same way the board does — NOT from poolWeightByEpoch:
  // the latest enrich-snapshot fills that only for pools with sales, so a seller with a
  // live fat pool but no fresh sales (GesundAI 87124, 13.10: weight 10.7M) was wrongly
  // listed as "Selling, but no pool". Position-weight sum == poolWeightAtEpoch
  // (cross-checked on Apex 52894: 18.78M in both sources).
  const nextEpochWeight = new Map();
  for (const pos of positions) {
    const pool = String(pos.agentId);
    nextEpochWeight.set(pool, (nextEpochWeight.get(pool) || 0n) + BigInt(String(pos.weightsByEpoch?.[nextEpoch] || '0')));
  }

  const sellers = [];
  for (const [id, s] of Object.entries(snapshot.sellersById || {})) {
    const earned = BigInt(s.earnedUsdc || '0');
    if (earned < MIN_EARNED) continue;
    if ((nextEpochWeight.get(id) || 0n) !== 0n) continue;
    sellers.push({ id, ...s, earned });
  }
  sellers.sort((a, b) => (a.earned < b.earned ? 1 : -1));

  const active = sellers.filter((s) => genSecs - Number(s.lastSeenAt) <= ACTIVE_SECS);
  const inactive = sellers.filter((s) => genSecs - Number(s.lastSeenAt) > ACTIVE_SECS);

  if (active.length === 0) return null;

  const div = document.createElement('div');
  div.className = 'inc-nopool';

  const h3 = document.createElement('h3');
  h3.textContent = 'Selling, but no pool';
  div.appendChild(h3);

  const steps = document.createElement('p');
  steps.className = 'inc-nopool-steps';
  steps.textContent = `Steps: call initPosition() on ${GRANT_ADDR} (1 ANTS starter pool, ${snapshot.starterGrantsLeft} left, needs a legacy seller stake of at least 10 USDC); then stakeAgentReward your first seller reward into your own pool. The last column is what that would pay you per epoch: a starter pool plus your first seller reward restaked at max lock, at this epoch's rates.`;
  div.appendChild(steps);

  const makeTable = (list) => {
    const table = document.createElement('table');
    table.className = 'inc-nopool-table';
    const thead = document.createElement('thead');
    const headTr = document.createElement('tr');
    for (const h of ['Seller', 'All-time', 'Buyers', 'Last sale', 'With a starter pool']) {
      const th = document.createElement('th');
      if (h === 'Last sale') th.className = 'nopool-last';
      th.textContent = h;
      headTr.appendChild(th);
    }
    thead.appendChild(headTr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const s of list) {
      const tr = document.createElement('tr');
      tr.className = 'nopool-row';
      const tdName = document.createElement('td');
      const name = s.name || poolNames[s.id] || `#${s.id}`;
      tdName.textContent = name;
      const idSpan = document.createElement('span');
      idSpan.className = 'inc-pool-id';
      idSpan.textContent = s.id;
      tdName.appendChild(idSpan);
      tr.appendChild(tdName);
      const tdEarned = document.createElement('td');
      const earnedUsdc = Number(s.earned) / 1e6;
      tdEarned.textContent = `$${Math.floor(earnedUsdc).toLocaleString('en-US')}`;
      tr.appendChild(tdEarned);
      const tdBuyers = document.createElement('td');
      tdBuyers.textContent = Number(s.uniqueBuyers || 0).toLocaleString('en-US');
      tr.appendChild(tdBuyers);
      const tdLast = document.createElement('td');
      tdLast.className = 'nopool-last';
      tdLast.textContent = formatDate(new Date(Number(s.lastSeenAt) * 1000));
      tr.appendChild(tdLast);
      const tdEst = document.createElement('td');
      tdEst.className = 'nopool-x';
      const stakeUsdc = BigInt(s.stakeUsdc || '0');
      if (stakeUsdc < BigInt(MIN_STAKE_USDC)) {
        tdEst.textContent = 'needs a 10 USDC seller stake first';
      } else {
        const estValue = estimateForSeller(s);
        if (estValue !== null) {
          tdEst.textContent = '\u2248 ' + estValue.toLocaleString('en-US') + ' ANTS/epoch';
        }
      }
      tr.appendChild(tdEst);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
  };

  div.appendChild(makeTable(active));

  if (inactive.length > 0) {
    const details = document.createElement('details');
    details.className = 'inc-nopool-inactive';
    const summary = document.createElement('summary');
    summary.textContent = `${inactive.length} inactive seller${inactive.length === 1 ? '' : 's'} without a pool`;
    details.appendChild(summary);
    details.appendChild(makeTable(inactive));
    div.appendChild(details);
  }

  return div;
}
