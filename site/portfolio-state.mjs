// Pure state of a lANTS position for the portfolio view: no DOM, no fetch, no
// imports. Comments must stay ASCII-only (the build pipeline rejects non-latin
// bytes).
//
// A position becomes 'closed' from its first epoch without weight
// (`closedAtEpoch`, set by split / move / merge) on. The NFT is burned then, so
// the live `stakerPositionIds(owner)` list no longer returns it, while the
// pending reward stays on the id. The published snapshot's `owner` field
// (positions(id) word 0, kept after the burn) is what names the holder, and the
// snapshot is what enumerates a wallet's closed positions.

// 'missing' | 'withdrawn' | 'closed' | 'open'. Withdrawn outranks closed:
// nothing is left to claim on a withdrawn position.
export function positionState(pos, epoch) {
  if (!pos) return 'missing';
  if (pos.withdrawn) return 'withdrawn';
  const closedAt = Number(pos.closedAtEpoch || 0);
  const cur = Number(epoch || 0);
  if (closedAt > 0 && closedAt <= cur) return 'closed';
  return 'open';
}

// Ids of `account`'s closed positions in a published snapshot, ascending, as
// strings. Empty for a missing snapshot or account.
export function closedPositionIdsForOwner(snapshot, account, epoch) {
  const who = String(account || '').toLowerCase();
  if (!who || !snapshot || !Array.isArray(snapshot.positions)) return [];
  return snapshot.positions
    .filter((p) => String(p.owner || '').toLowerCase() === who && positionState(p, epoch) === 'closed')
    .map((p) => String(p.id))
    .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
}
