// Side panel on the Listings view: recent network sales as a veXy-style table
// (Time / Token / Discount / Staked / Price) with a small pager. The Discount
// vs Lock Size panel is a static SOON stub.

import { fetchSeaportMarket, SEAPORT_MARKET_ORIGIN } from './seaport-feed.mjs';

const TRADES_PATH = '/api/lants/trades';
const MAX_TRADE_PAGES = 3;
const PAGE = 8;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Compact numbers like veXy: 101.7, 8.7K, 0.1
function fmtNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  if (n < 10) return n.toFixed(2).replace(/\.?0+$/, '');
  return n.toFixed(1).replace(/\.0$/, '');
}

function fmtTime(ms) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return hh + ':' + mm;
}

// One network trade -> sale row, or null when it cannot be shown honestly.
// Only USDC fills are reported (the price is atomic USDC, 6 decimals).
function normalizeNetworkTrade(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!Number.isInteger(raw.tokenId) || raw.tokenId < 0) return null;
  const amount = Number(raw.amount);
  if (!(amount > 0)) return null;
  const priceWei = typeof raw.priceWei === 'bigint' ? raw.priceWei : BigInt(raw.priceWei ?? 0);
  if (priceWei <= 0n) return null;
  const usdTotal = Number(priceWei) / 1e6;
  if (!(usdTotal > 0)) return null;
  const ts = Number(raw.createdAt ?? raw.timestamp ?? 0);
  return {
    id: raw.id || null,
    tokenId: raw.tokenId,
    amount,
    usdTotal,
    tradeType: raw.tradeType === 'offer' ? 'offer' : 'listing',
    createdAtMs: Number.isFinite(ts) && ts > 0 ? ts : null,
  };
}

// Recent network sales from the competitor marketplace feed. A failure or an
// empty response leaves the panel on the "no sales" placeholder.
async function fetchNetworkTrades() {
  const out = [];
  try {
    for (let page = 1; page <= MAX_TRADE_PAGES; page += 1) {
      const res = await fetch(`${SEAPORT_MARKET_ORIGIN}${TRADES_PATH}?page=${page}&pageSize=100`);
      if (!res.ok) break;
      const json = await res.json();
      const arr = Array.isArray(json?.trades) ? json.trades : [];
      for (const raw of arr) {
        const t = normalizeNetworkTrade(raw);
        if (t) out.push(t);
      }
      const total = Number.isInteger(json?.total) ? json.total : null;
      if (arr.length < 100 || (total !== null && out.length >= total)) break;
    }
  } catch (e) {
    /* trades feed down -> sales panel stays empty */
  }
  return out;
}

function renderSales(trades, referencePrice) {
  const body = document.getElementById('sales-body');
  if (!body) return;
  body.textContent = '';

  const list = (trades || []).slice();
  if (!list.length) {
    body.appendChild(el('div', 'soon-word', 'SOON'));
    body.appendChild(el('p', 'soon-note', 'No sales have happened yet.'));
    return;
  }

  // Discount vs the 24h average (or the cheapest trade shown when the feed is
  // down); a sale above the reference reads as 0%.
  let ref = referencePrice != null && referencePrice > 0 ? referencePrice : null;
  if (ref == null) {
    const floor = Math.min(...list.map((t) => t.usdTotal / t.amount));
    if (Number.isFinite(floor) && floor > 0) ref = floor;
  }

  const rows = list.map((t) => ({
    time: t.createdAtMs != null ? fmtTime(t.createdAtMs) : '—',
    tokenId: t.tokenId,
    discount: ref ? Math.max(0, ((ref - t.usdTotal / t.amount) / ref) * 100) : 0,
    staked: t.amount,
    price: t.usdTotal,
  }));

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  let page = 0;

  const table = el('table', 'sales-table');
  const head = el('thead', null);
  const hr = el('tr', null);
  for (const h of ['Time', 'ID', 'Discount', 'Staked', 'Price']) {
    hr.appendChild(el('th', h === 'ID' ? 's-id' : null, h));
  }
  head.appendChild(hr);
  const tbody = el('tbody', null);
  table.appendChild(head);
  table.appendChild(tbody);
  body.appendChild(table);

  const pager = el('div', 'sales-pager');
  body.appendChild(pager);

  function draw() {
    tbody.textContent = '';
    const start = page * PAGE;
    for (const r of rows.slice(start, start + PAGE)) {
      const tr = el('tr', null);
      tr.appendChild(el('td', 's-t', r.time));
      tr.appendChild(el('td', 's-id', '#' + r.tokenId));
      tr.appendChild(el('td', 's-disc', r.discount.toFixed(2) + '%'));
      tr.appendChild(el('td', 's-staked', fmtNum(r.staked)));
      tr.appendChild(el('td', 's-price', fmtNum(r.price)));
      tbody.appendChild(tr);
    }
  }

  function drawPager() {
    pager.textContent = '';
    const prev = el('button', 's-page', '‹');
    prev.type = 'button';
    prev.disabled = page <= 0;
    prev.addEventListener('click', () => {
      if (page > 0) {
        page -= 1;
        draw();
        drawPager();
      }
    });
    const next = el('button', 's-page', '›');
    next.type = 'button';
    next.disabled = page >= pages - 1;
    next.addEventListener('click', () => {
      if (page < pages - 1) {
        page += 1;
        draw();
        drawPager();
      }
    });
    pager.appendChild(prev);
    pager.appendChild(el('span', 's-count', (page + 1) + ' of ' + pages));
    pager.appendChild(next);
  }

  draw();
  drawPager();
}

async function load() {
  const [tradesRes, feedRes] = await Promise.allSettled([fetchNetworkTrades(), fetchSeaportMarket()]);
  const trades = tradesRes.status === 'fulfilled' ? tradesRes.value : [];
  const feed = feedRes.status === 'fulfilled' ? feedRes.value : null;
  renderSales(trades, feed?.price?.avgPrice24h ?? null);
}

function initExpand() {
  const panel = document.getElementById('sales-panel');
  const btn = document.getElementById('sales-expand');
  if (!panel || !btn) return;
  btn.addEventListener('click', () => {
    const full = panel.classList.toggle('is-fullscreen');
    btn.textContent = full ? '\u2921' : '\u2922';
    btn.setAttribute('aria-label', full ? 'Collapse Sales' : 'Expand Sales');
    btn.setAttribute('aria-expanded', String(full));
  });
}

if (typeof document !== 'undefined' && document.getElementById('sales-panel')) {
  initExpand();
  void load();
}
