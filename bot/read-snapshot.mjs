// Read-only loader for the lANTS position snapshot (the same file the site
// header uses). It supplies two things the bot needs:
//   - the per-position staking reward per epoch (epoch close emission),
//   - the lock end epoch and reward of a listed position (lot highlight).
//
// The snapshot is a soft dependency: when it is unavailable the epoch post
// omits the emission and the lot highlight is skipped.

// Same live snapshot URLs the site header uses (market-view.mjs LIVE_URLS).
export const SNAPSHOT_URLS = [
  'https://raw.githubusercontent.com/theYahia/lants-market/data/live.json',
  'https://ipfs.filebase.io/ipns/k51qzi5uqu5di86efhnadxw0k1sxnuo2tkcmegxcn2ra2r3exyfpv9htxhit6b/fixtures/snapshot-e23.live.json',
];

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function intOrNull(v) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) ? n : null;
}

// Decimal/hex string, number or bigint -> BigInt; anything odd becomes 0n so a
// single malformed reward never aborts the whole snapshot.
export function parseWei(v) {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? BigInt(Math.trunc(v)) : 0n;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return 0n;
    if (/^0x[0-9a-fA-F]+$/.test(s)) return BigInt(s);
    if (/^\d+$/.test(s)) return BigInt(s);
    const n = Number(s);
    return Number.isFinite(n) ? BigInt(Math.trunc(n)) : 0n;
  }
  return 0n;
}

export function weiToAnts(v) {
  return Number(parseWei(v)) / 1e18;
}

async function getJson(fetchImpl, url, timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (controller) controller.abort();
      reject(new Error('timeout'));
    }, timeoutMs);
  });
  try {
    const request = fetchImpl(url, {
      signal: controller ? controller.signal : undefined,
      headers: { accept: 'application/json' },
    });
    const res = await Promise.race([request, timeout]);
    if (!res || res.ok !== true) return { ok: false, reason: 'http' };
    const json = await Promise.race([res.json(), timeout]);
    return { ok: true, json };
  } catch (e) {
    return { ok: false, reason: e && e.message === 'timeout' ? 'timeout' : 'network' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Turn a raw snapshot into typed positions.
 * @returns {Array<{id:string, amount:number, agentId:(number|null), stakeEndEpoch:(number|null), rewardByEpoch:Object<string, number>}>|null}
 */
export function parsePositions(json) {
  if (!isObject(json) || !Array.isArray(json.positions)) return null;
  const positions = [];
  for (const p of json.positions) {
    if (!isObject(p)) continue;
    const rawRewards = isObject(p.rewardByEpoch) ? p.rewardByEpoch : {};
    const rewardByEpoch = {};
    for (const [epoch, value] of Object.entries(rawRewards)) {
      const ants = weiToAnts(value);
      if (Number.isFinite(ants)) rewardByEpoch[String(epoch)] = ants;
    }
    positions.push({
      // A position without an id still contributes to the epoch emission sum;
      // it simply cannot be matched to a listing by pickLot().
      id: p.id == null ? null : String(p.id),
      amount: weiToAnts(p.amount),
      agentId: intOrNull(p.agentId),
      stakeEndEpoch: intOrNull(p.stakeEndEpoch),
      rewardByEpoch,
    });
  }
  return positions;
}

/**
 * Fetch and parse the snapshot. `minEpoch` rejects a snapshot older than the
 * epoch the caller is asking about (a stale snapshot would under-report).
 */
export async function readSnapshot({ fetchImpl = globalThis.fetch, timeoutMs = 20000, minEpoch = null } = {}) {
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'no-fetch' };
  for (const url of SNAPSHOT_URLS) {
    const res = await getJson(fetchImpl, url, timeoutMs);
    if (!res.ok) continue;
    const snap = res.json;
    const snapshotEpoch = Number(snap?.epoch);
    if (!Number.isFinite(snapshotEpoch)) return { ok: false, reason: 'schema' };
    if (Number.isInteger(minEpoch) && snapshotEpoch < minEpoch) return { ok: false, reason: 'stale' };
    const positions = parsePositions(snap);
    if (positions === null) return { ok: false, reason: 'schema' };
    return { ok: true, epoch: snapshotEpoch, positions };
  }
  return { ok: false, reason: 'network' };
}

// Sum of staking reward accrued in `epoch` across all snapshot positions = the
// ANTS emitted to stakers that epoch. Kept as a wrapper for existing callers.
export async function fetchEmission({ fetchImpl = globalThis.fetch, timeoutMs = 20000, epoch } = {}) {
  if (!Number.isInteger(epoch) || epoch < 0) return { ok: false, reason: 'epoch' };
  const snap = await readSnapshot({ fetchImpl, timeoutMs, minEpoch: epoch });
  if (!snap.ok) return snap;
  const key = String(epoch);
  let sum = 0;
  for (const pos of snap.positions) {
    const reward = pos.rewardByEpoch[key];
    if (Number.isFinite(reward)) sum += reward;
  }
  return { ok: true, ants: sum, epoch, snapshotEpoch: snap.epoch };
}

// Emission from an already-loaded snapshot, so run.mjs reads the snapshot once.
export function emissionFromSnapshot(snapshot, epoch) {
  if (!snapshot || !snapshot.ok || !Array.isArray(snapshot.positions)) return null;
  if (!Number.isInteger(epoch)) return null;
  const key = String(epoch);
  let sum = 0;
  let seen = false;
  for (const pos of snapshot.positions) {
    const reward = pos.rewardByEpoch[key];
    if (!Number.isFinite(reward)) continue;
    seen = true;
    sum += reward;
  }
  return seen ? sum : null;
}
