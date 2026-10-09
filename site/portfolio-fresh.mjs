// Fresh-position helpers: a position newer than the last published snapshot
// shows raw chain values until the next refresh. Snapshot slots land around
// 06:15 / 14:15 / 22:15 UTC (see .github/workflows/snapshot.yml).

export const FRESH_TIP_TIMES = '~06:15 / 14:15 / 22:15 UTC';

export function freshTip(epoch) {
  const n = epoch === null || epoch === undefined || epoch === '' ? null : Number(epoch);
  const at = n !== null && Number.isFinite(n) ? ` (epoch ${n})` : '';
  return `Staked after the last snapshot${at}. Max lock, reward and exit appear after the next snapshot (${FRESH_TIP_TIMES}).`;
}

export function freshNote(tip) {
  const info = document.createElement('span');
  info.className = 'info';
  info.tabIndex = 0;
  info.dataset.tip = tip;
  info.textContent = 'ⓘ';
  return info;
}
