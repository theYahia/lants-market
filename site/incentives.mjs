import { rewardMode } from './metrics.mjs';

async function loadSnapshot() {
  const urls = [
    'https://raw.githubusercontent.com/theYahia/lants-market/data/live.json',
    'https://ipfs.filebase.io/ipns/k51qzi5uqu5di86efhnadxw0k1sxnuo2tkcmegxcn2ra2r3exyfpv9htxhit6b/fixtures/snapshot-e23.live.json',
    './fixtures/snapshot-e23.live.json'
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {
      // try next URL
    }
  }
  throw new Error('Failed to load incentive data.');
}

// Epoch boundary base: epoch 25 starts 2026-10-01T09:54:21Z, each next +7 days.
const EPOCH_BASE = new Date('2026-10-01T09:54:21Z');
const EPOCH_BASE_NUM = 25;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function epochBoundary(epochNum) {
  return new Date(EPOCH_BASE.getTime() + (epochNum - EPOCH_BASE_NUM) * WEEK_MS);
}

function formatCountdown(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}

function formatUtc(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const pad = (n) => String(n).padStart(2, '0');
  return `${weekdays[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

async function init() {
  const container = document.getElementById('incentives');
  if (!container) return;

  try {
    const snapshot = await loadSnapshot();
    const mode = rewardMode(snapshot);
    const e = Number(mode.epoch);
    const N = e + 1;
    const boundary = epochBoundary(N);
    const now = new Date();
    const countdownMs = boundary.getTime() - now.getTime();
    const countdown = formatCountdown(countdownMs);

    const header = document.createElement('div');
    header.className = 'inc-header';
    header.innerHTML = '';
    const title = document.createElement('h2');
    title.textContent = `Epoch ${N} · starts ${formatUtc(boundary)} · ${countdown}`;
    header.appendChild(title);
    container.innerHTML = '';
    container.appendChild(header);
  } catch (err) {
    container.innerHTML = '<p>Failed to load incentive data.</p>';
  }
}

init();
