import {
  startEpoch,
  isMaxLock,
  expectedReward,
  rewardMode,
  exitSlash,
  fadingCount,
  floorPrice,
  yieldPerEpoch,
  payback,
  lockLabel, exitBurn,
} from './metrics.mjs';

/**
 * NOTE: The goodDeal computation and badge rendering have been removed.
 * The badge-deal class is now only used in the Listings section.
 */

// Live snapshot URLs: primary (data branch) first, IPNS fallback.
const LIVE_URLS = [
  'https://raw.githubusercontent.com/theYahia/lants-market/data/live.json',
  'https://ipfs.filebase.io/ipns/k51qzi5uqu5di86efhnadxw0k1sxnuo2tkcmegxcn2ra2r3exyfpv9htxhit6b/fixtures/snapshot-e23.live.json'
];

const LIVE_TIMEOUT_MS = 20000;

// Load the local snapshot used for the very first paint so the tbody is never
// empty for more than a fraction of a second.
// Preference: ./fixtures/snapshot-e23.live.json (dropped by CI build-dist.mjs),
// then ./fixtures/snapshot-e23.full.json.
async function loadLocalSnapshot() {
  try {
    const res = await fetch('./fixtures/snapshot-e23.live.json');
    if (res.ok) return await res.json();
  } catch (e) {
    /* ignore, fall through */
  }
  const res = await fetch('./fixtures/snapshot-e23.full.json');
  return await res.json();
}

// Fetch the live snapshot from the URLs with a generous timeout per attempt.
async function loadLiveSnapshot() {
  for (const url of LIVE_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = await res.json();
      if (json && json.generatedAt) return json;
    } catch (e) {
      // ignore and try next URL
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

let currentSortCol = null;
let currentSortDir = 'asc';
let sortingInitialised = false;

function sortPositions(positions, col, dir) {
  positions.sort((a, b) => {
    let aVal, bVal;
    switch (col) {
      case 0:
        aVal = Number(a.pos.id);
        bVal = Number(b.pos.id);
        break;
      case 1:
        aVal = a.amountNum;
        bVal = b.amountNum;
        break;
      case 2:
        aVal = a.lockLeft;
        bVal = b.lockLeft;
        break;
      case 3:
        aVal = Number(a.reward);
        bVal = Number(b.reward);
        break;
      case 4:
        aVal = a.floor === '—' ? Infinity : Number(a.floor);
        bVal = b.floor === '—' ? Infinity : Number(b.floor);
        break;
      default:
        return 0;
    }

    if (aVal === Infinity) return 1;
    if (bVal === Infinity) return -1;

    if (aVal < bVal) return dir === 'asc' ? -1 : 1;
    if (aVal > bVal) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

function updateSortIndicators() {
  const ths = document.querySelectorAll('table thead th');
  ths.forEach((th, idx) => {
    th.classList.remove('sort-asc', 'sort-desc');
    const existingArrow = th.querySelector('.sort-arrow');
    if (existingArrow) existingArrow.remove();

    if (idx === currentSortCol) {
      th.classList.add(currentSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      const arrow = document.createElement('span');
      arrow.className = 'sort-arrow';
      arrow.textContent = currentSortDir === 'asc' ? ' ▲' : ' ▼';
      th.appendChild(arrow);
    }
  });
}

function setupSorting() {
  if (sortingInitialised) return;
  sortingInitialised = true;
  const ths = document.querySelectorAll('table thead th');
  ths.forEach((th, idx) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      if (currentSortCol === idx) {
        currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSortCol = idx;
        currentSortDir = 'asc';
      }

      const tbody = document.querySelector('table tbody');
      const allRows = Array.from(tbody.querySelectorAll('tr'));
      const dustRow = allRows[allRows.length - 1];
      const positionRows = allRows.slice(0, -1);

      const positionData = positionRows.map((row) => {
        const cells = row.querySelectorAll('td');
        return {
          row,
          id: cells[0].textContent,
          amount: cells[1].textContent,
          lock: cells[2].textContent,
          reward: cells[3].textContent,
          floor: cells[4].textContent,
        };
      });

      const enrichedForSort = positionData.map((d) => ({
        pos: { id: d.id },
        amountNum: Number(d.amount),
        lockLeft: d.lock === '—' ? Infinity : parseInt(d.lock, 10),
        reward: d.reward,
        floor: d.floor,
      }));

      sortPositions(enrichedForSort, idx, currentSortDir);

      tbody.innerHTML = '';
      enrichedForSort.forEach((item) => {
        const originalId = item.pos.id;
        const originalPos = positionData.find((pd) => pd.id === originalId);
        if (originalPos) {
          tbody.appendChild(originalPos.row);
        }
      });
      if (dustRow) tbody.appendChild(dustRow);

      updateSortIndicators();
    });
  });
}

// Render an entire snapshot into the DOM. Safe to call multiple times; it
// rebuilds the table body and footer from scratch.
// opts.frozen === true → render a static "frozen" footer with no live-data
// blurb (no "Live from Base", no "Auto-refreshed").
function renderSnapshot(snapshot, opts = {}) {
  const frozen = !!opts.frozen;
  const epochNum = Number(snapshot.epoch);
  const epoch = String(epochNum + 1);

  // Ensure positions is an array
  const rawPositions = Array.isArray(snapshot?.positions) ? snapshot.positions : [];

  // Sort positions by amount descending (original logic)
  const positions = [...rawPositions];
  positions.sort((a, b) => Number(b.amount) - Number(a.amount));

  // ---------- Separate dust (≤1 ANTS) from live positions ----------
  const DUST_THRESHOLD = 1e18; // 1 ANTS in wei
  const dustPositions = positions.filter((p) => Number(p.amount) <= DUST_THRESHOLD);
  const livePositions = positions.filter((p) => Number(p.amount) > DUST_THRESHOLD);
  // ---------------------------------------------------------------------------

  // ---------- Sort live positions by '#' (position id) ascending ----------
  livePositions.sort((a, b) => Number(a.id) - Number(b.id));
  // ---------------------------------------------------------------------------

  // ---------- Compute aggregates for dust ----------
  const dustAmountWei = dustPositions.reduce((acc, p) => acc + Number(p.amount), 0);
  const dustRewardWei = dustPositions.reduce(
    (acc, p) => acc + expectedReward(snapshot, p, epoch),
    0
  );
  const dustAmount = (dustAmountWei / 1e18).toFixed(2);
  const dustReward = dustRewardWei.toFixed(2);
  // ---------------------------------------------------------------------------

  // ---------- Compute per‑position derived values ----------
  const enrichedLive = livePositions.map((pos) => {
    const amountNum = Number(pos.amount);
    const amount = (amountNum / 1e18).toFixed(2);
    const rewardRaw = expectedReward(snapshot, pos, epoch);
    const reward = rewardRaw.toFixed(2);
    const floor = floorPrice(pos);
    const floorVal = typeof floor === 'number' ? floor.toFixed(2) : '—';
    const lockLeft = Number(pos.stakeEndEpoch) - Number(epoch);
    const lockLeftStr = String(lockLeft) + 'w';
    return {
      pos,
      amount,
      amountNum,
      lockLeft,
      lockLeftStr,
      isMax: isMaxLock(pos, epoch),
      reward,
      floor: floorVal,
    };
  });
  // ---------------------------------------------------------------------------

  // ---------- Rendering ----------
  const tbody = document.querySelector('table tbody');
  // Clear any existing rows
  tbody.innerHTML = '';
  const rewardNote = document.getElementById('th-reward-note');
  if (rewardNote) { const m = rewardMode(snapshot); rewardNote.textContent = `${m.mode} · e${m.epoch}`; }

  // Render live positions
  enrichedLive.forEach(({ pos, amount, lockLeftStr, lockLeft, isMax, reward, floor }) => {
    const row = document.createElement('tr');

    // First cell – pure position number
    const idCell = document.createElement('td');
    idCell.textContent = pos.id;
if (Number(pos.stakeStartEpoch) > Number(snapshot.epoch)) {
  idCell.classList.add('is-pending');
  idCell.dataset.start = String(pos.stakeStartEpoch);
  idCell.title = 'Staking power activates at epoch ' + pos.stakeStartEpoch;
}
    // Badge rendering removed; class badge-deal is no longer applied here.
    row.appendChild(idCell);

    // Helper to create numeric cells with right‑align style
    const makeCell = (text) => {
      const td = document.createElement('td');
      td.setAttribute('style', 'text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap');
      td.textContent = text;
      return td;
    };

    row.appendChild(makeCell(amount));

    // Lock cell – only lockLeft text, no max badge; add title for peak weight
    const lockTd = document.createElement('td');
    lockTd.setAttribute('style', 'text-align:right;font-variant-numeric:tabular-nums');
    const lockText = document.createElement('span');
    lockText.textContent = lockLeftStr;
    lockTd.appendChild(lockText);
    if (isMax) {
  lockTd.classList.add('is-maxlock');
  lockTd.title = 'Max lock: constant peak weight. Cannot be split or merged while max lock is on.';
} else if (Number(pos.weightsByEpoch[epoch]) > 0 && pos.weightsByEpoch[epoch] === pos.maxLockPowerByEpoch[epoch]) {
  lockTd.title = 'peak weight';
}
    row.appendChild(lockTd);

    row.appendChild(makeCell(reward));
    const exitTd = makeCell(floor);
    exitTd.title = 'Early exit burns ~' + exitBurn(pos).toFixed(2) + ' ANTS (' + exitSlash(pos) + '%). No burn after the lock ends.';
    row.appendChild(exitTd);

    tbody.appendChild(row);
  });

  // Render dust row (must be last)
  const dustRow = document.createElement('tr');

  const dustId = document.createElement('td');
  dustId.textContent = 'dust';
  dustRow.appendChild(dustId);

  const dustAmountCell = document.createElement('td');
  dustAmountCell.setAttribute('style', 'text-align:right;font-variant-numeric:tabular-nums');
  dustAmountCell.textContent = dustAmount;
  dustRow.appendChild(dustAmountCell);

  const dustLockCell = document.createElement('td');
  dustLockCell.setAttribute('style', 'text-align:right;font-variant-numeric:tabular-nums');
  dustLockCell.textContent = '—';
  dustRow.appendChild(dustLockCell);

  const dustRewardCell = document.createElement('td');
  dustRewardCell.setAttribute('style', 'text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap');
  dustRewardCell.textContent = dustReward;
  dustRow.appendChild(dustRewardCell);

  const dustFloorCell = document.createElement('td');
  dustFloorCell.setAttribute('style', 'text-align:right;font-variant-numeric:tabular-nums');
  dustFloorCell.textContent = '—';
  dustRow.appendChild(dustFloorCell);

  tbody.appendChild(dustRow);
  // ---------------------------------------------------------------------------

  // ---------- Origin line inside .snap-footer ----------
  if (
    snapshot.snapshotBlock !== undefined &&
    snapshot.snapshotEpoch !== undefined &&
    snapshot.generatedAt !== undefined
  ) {
    const snapFooter = document.querySelector('.snap-footer');
    if (snapFooter) {
      snapFooter.innerHTML = '';

      const originLine = document.createElement('div');
      originLine.className = 'metric note';

      const genDate = new Date(snapshot.generatedAt);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = monthNames[genDate.getUTCMonth()];
      const day = genDate.getUTCDate();
      const hours = String(genDate.getUTCHours()).padStart(2, '0');
      const minutes = String(genDate.getUTCMinutes()).padStart(2, '0');

      originLine.innerHTML = `Snapshot <span class="snap-block">#${snapshot.snapshotBlock}</span> · epoch ${snapshot.snapshotEpoch} · ${month} ${day}, ${genDate.getUTCFullYear()} ${hours}:${minutes} UTC`;

      const blurbLine = document.createElement('div');
      blurbLine.className = 'metric note';

      if (frozen) {
        // Frozen mode: static demo data — no live-data blurb whatsoever.
        blurbLine.textContent =
          'Frozen snapshot — static demo data (20 rows). No network refresh.';
      } else {
        // Live-data blurb shown alongside the Snapshot line.
        blurbLine.textContent =
          'Live from Base - two RPCs cross-checked, sales from antscan. Auto-refreshed 3x/day (06:00 / 14:00 / 22:00 UTC).';
      }

      snapFooter.appendChild(originLine);
      snapFooter.appendChild(blurbLine);
    }
  }
  // ---------------------------------------------------------------------------

  // portfolio-fill
  const pfValues = document.querySelectorAll('#portfolio .pf-value');
  if (pfValues.length >= 3) {
    // Positions: number of positions in snapshot
    pfValues[0].textContent = String(positions.length);

    // Total Staked: sum of live positions amount / 1e18, toFixed(2)
    const totalStakedWei = livePositions.reduce((acc, p) => acc + Number(p.amount), 0);
    pfValues[1].textContent = (totalStakedWei / 1e18).toFixed(2);

    // Claimable Rewards: leave as "—" (undefined without wallet)
    // pfValues[2].textContent = '—'; // already set, no change
  }

  const pfSnapshot = document.querySelector('.pf-snapshot');
  if (pfSnapshot && snapshot.snapshotBlock !== undefined) {
    pfSnapshot.textContent = snapshot.snapshotBlock;
  }
  // end portfolio-fill

  // Setup sorting after render (idempotent). Reset default sort state.
  currentSortCol = 0;
  currentSortDir = 'asc';
  setupSorting();
  updateSortIndicators();
}

function isNewer(candidate, current) {
  if (!current) return true;
  const cGen = candidate && candidate.generatedAt ? new Date(candidate.generatedAt).getTime() : NaN;
  const curGen = current && current.generatedAt ? new Date(current.generatedAt).getTime() : NaN;
  if (Number.isNaN(cGen)) return false;
  if (Number.isNaN(curGen)) return true;
  return cGen > curGen;
}

// Trim a snapshot down to a fixed number of live rows for the frozen demo.
function toFrozenSet(snapshot, rowCount) {
  const raw = Array.isArray(snapshot?.positions) ? snapshot.positions : [];
  const DUST_THRESHOLD = 1e18;
  const live = raw.filter((p) => Number(p.amount) > DUST_THRESHOLD);
  const dust = raw.filter((p) => Number(p.amount) <= DUST_THRESHOLD);
  live.sort((a, b) => Number(a.id) - Number(b.id));
  const trimmedLive = live.slice(0, rowCount);
  return { ...snapshot, positions: [...trimmedLive, ...dust] };
}

async function init() {
  let frozen = false;
  try {
    frozen = new URLSearchParams(window.location.search).get('data') === 'frozen';
  } catch (e) {
    frozen = false;
  }

  // Frozen mode: always render the local full fixture (trimmed to 20 rows) and
  // stop. The live snapshot swap is intentionally disabled here.
  if (frozen) {
    const res = await fetch('./fixtures/snapshot-e23.full.json');
    const full = await res.json();
    const frozenSet = toFrozenSet(full, 20);
    renderSnapshot(frozenSet, { frozen: true });
    return; // never fetch/swap live data in frozen mode
  }

  // 1) First paint: render local snapshot immediately so tbody is populated.
  let rendered = null;
  try {
    const local = await loadLocalSnapshot();
    renderSnapshot(local);
    rendered = local;
  } catch (e) {
    /* if even local fails, leave the DOM as-is */
  }

  // 2) Kick off the live fetch (generous timeout). Swap only if it is newer.
  const live = await loadLiveSnapshot();
  if (live && isNewer(live, rendered)) {
    renderSnapshot(live);
    rendered = live;
  }
}

function setMetric(id, value) {
  const el = document.querySelector(`#${id} .metric-value`);
  if (el) {
    el.textContent = value;
  }
}

init();