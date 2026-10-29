// "For buyers" section: per-pool buyer ANTS per $1, the spend that reaches the
// 5% cap, and a spend calculator. Buyer math lives in incentives-points; the
// per-$1 column reuses cashbackCell so it stays identical to the old board column.
import { buildSection, infoIcon } from './incentives-hero.mjs';
import { cashbackCell, cashbackHead } from './incentives-data.mjs';
import { buyerAntsForSpend, buyerCapSpend, formatAntsWei, listPools } from './incentives-points.mjs';

function buildBuyerTable(snapshot, poolNames) {
  const rows = listPools(snapshot).map((pool) => ({
    pool,
    cb: cashbackCell(snapshot, pool),
    cap: buyerCapSpend(snapshot, pool),
  }));
  rows.sort((a, b) => {
    if (a.cb.wei !== b.cb.wei) return a.cb.wei < b.cb.wei ? 1 : -1;
    return String(poolNames[a.pool] || a.pool).localeCompare(String(poolNames[b.pool] || b.pool));
  });

  const head = cashbackHead(snapshot);
  const table = document.createElement('table');
  table.className = 'inc-board-table inc-buyers-table';
  const thead = document.createElement('thead');
  const headTr = document.createElement('tr');
  const headings = [
    { text: 'Seller', tip: 'Seller pool; each $1 spent with it earns buyer ANTS scaled by its weight.' },
    { text: head.heading, tip: head.tip },
    { text: '5% cap at', tip: 'Spend at which one buyer reaches the 5% per-account cap on the buyer budget for this epoch.' },
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
    tr.className = 'buyer-row';
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
    const tdRate = document.createElement('td');
    tdRate.textContent = row.cb.text;
    const tdCap = document.createElement('td');
    tdCap.textContent = row.cap === null ? '\u2014' : `$${row.cap.toLocaleString('en-US')}`;
    tr.appendChild(tdPool);
    tr.appendChild(tdRate);
    tr.appendChild(tdCap);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  const wrap = document.createElement('div');
  wrap.className = 'inc-board-scroll';
  wrap.appendChild(table);
  return wrap;
}

function buildBuyerCalc(snapshot, poolNames) {
  const container = document.createElement('div');
  container.className = 'inc-calc inc-buyer-calc';

  const h3 = document.createElement('h3');
  h3.textContent = 'Buyer points calculator';
  container.appendChild(h3);

  const poolSelect = document.createElement('select');
  poolSelect.id = 'inc-buyer-pool';
  const order = listPools(snapshot);
  if (!order.includes('52894')) order.unshift('52894');
  for (const pool of order) {
    const option = document.createElement('option');
    option.value = pool;
    const name = poolNames[pool];
    option.textContent = name ? `${name} · ${pool}` : pool;
    if (pool === '52894') option.selected = true;
    poolSelect.appendChild(option);
  }
  const poolLabel = document.createElement('label');
  poolLabel.textContent = 'Pool: ';
  poolLabel.appendChild(poolSelect);

  const spendInput = document.createElement('input');
  spendInput.type = 'number';
  spendInput.min = '0';
  spendInput.step = '1';
  spendInput.value = '100';
  spendInput.id = 'inc-buyer-spend';
  const spendLabel = document.createElement('label');
  spendLabel.textContent = 'Spend (USD): ';
  spendLabel.appendChild(spendInput);

  const fields = document.createElement('div');
  fields.className = 'inc-calc-fields';
  fields.appendChild(poolLabel);
  fields.appendChild(spendLabel);
  container.appendChild(fields);

  const result = document.createElement('div');
  result.className = 'inc-calc-result';
  const resultValue = document.createElement('div');
  resultValue.className = 'inc-calc-result-value';
  const resultSub = document.createElement('div');
  resultSub.className = 'inc-calc-result-sub';
  result.appendChild(resultValue);
  result.appendChild(resultSub);
  container.appendChild(result);

  function update() {
    const spend = Number(spendInput.value);
    if (!spendInput.value || !(spend > 0)) {
      result.style.display = 'none';
      return;
    }
    const pool = poolSelect.value;
    const wei = buyerAntsForSpend(snapshot, pool, spend);
    result.style.display = '';
    if (wei === null) {
      resultValue.textContent = '\u2014';
      resultSub.textContent = '';
      return;
    }
    resultValue.textContent = `You earn ${formatAntsWei(wei)} ANTS this epoch`;
    const cap = buyerCapSpend(snapshot, pool);
    resultSub.textContent = cap === null ? '' : `5% cap reached at $${cap.toLocaleString('en-US')}`;
  }

  poolSelect.addEventListener('input', update);
  spendInput.addEventListener('input', update);
  update();
  return container;
}

// A full section: table of per-$1 rates plus the spend calculator.
export function buildBuyersSection(snapshot, mode, poolNames) {
  const body = document.createElement('div');
  body.appendChild(buildBuyerTable(snapshot, poolNames));
  body.appendChild(buildBuyerCalc(snapshot, poolNames));
  const lead = 'Every $1 you spend with a seller earns ANTS, scaled by that seller\u2019s pool weight. One account can take at most 5% of the buyer budget per epoch.';
  return buildSection('For buyers', lead, body, 'inc-buyers-section');
}
