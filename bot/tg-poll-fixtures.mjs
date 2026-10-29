// Shared fixtures for the @lantsalerts_bot poller tests: a fake token, an env
// guard, a private chat and a stub reader set. One copy so both poll suites
// keep the same reader contract.

export const TEST_TOKEN = 'test-token';

export async function withToken(fn) {
  const prev = process.env.TG_BOT_TOKEN;
  process.env.TG_BOT_TOKEN = TEST_TOKEN;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.TG_BOT_TOKEN;
    else process.env.TG_BOT_TOKEN = prev;
  }
}

export function privateChat(id = 42) {
  return { id, type: 'private' };
}

export function readerSet(overrides = {}) {
  return {
    readFeed: async () => ({ ok: true, market: { floorAsk: 0.1, avg24h: 0.1, listedCount: 1, epoch: 28, listings: [] } }),
    readAntseedStats: async () => ({ ok: true, network: { epoch: 28, secondsLeft: 3600 }, staking: { restakeBonusPct: 5 } }),
    readOwnListings: async () => ({ ok: true, listings: [] }),
    ...overrides,
  };
}
