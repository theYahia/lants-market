// Epoch boundaries for the AntSeed platform. Canonical source: the same
// constants that incentives.mjs used. Shared by the payout pipeline, the
// claim site and incentives so boundaries are never duplicated.

export const EPOCH_BASE = new Date('2026-10-01T09:54:21Z');
export const EPOCH_BASE_NUM = 25;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Epoch N starts at EPOCH_BASE + (N - EPOCH_BASE_NUM) weeks (Thursday 09:54:21 UTC).
export function epochBoundary(epochNum) {
  return new Date(EPOCH_BASE.getTime() + (Number(epochNum) - EPOCH_BASE_NUM) * WEEK_MS);
}
