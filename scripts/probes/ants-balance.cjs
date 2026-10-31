// ANTS / USDC balance and per-epoch staker rewards for one wallet.
//
// Read-only: never sends a transaction. Answers "how much ANTS did this wallet
// accrue this epoch, and what is its balance now vs last run".
//
// Usage:
//   node scripts/probes/ants-balance.cjs [address] [--proxy] [--rpc <url>]
//
//   address   wallet to inspect (default: the marketplace operator)
//   --proxy   route RPC through the nodemaven resident proxy (proxies-ru.txt)
//   --rpc     override the JSON-RPC endpoint (default: DRPC, then publicnode)
//
// State: the previous ANTS balance is persisted to
//   scripts/probes/.ants-balance-state.json
// so a later run can print the "was -> now" delta.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPublicClient, http, fallback, parseAbi, formatUnits } = require('viem');
const { base } = require('viem/chains');

const OPERATOR = '0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B';
const POOLS = '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652'; // lANTS positions NFT
const SPR = '0x83cc5b9aa0c8cb8683f35462c385a5baaa755ee5'; // staker rewards
const ANTS = '0xa87EE81b2C0Bc659307ca2D9ffdC38514DD85263'; // ANTS ERC-20, 18 decimals
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC, 6 decimals
const USAGE_REWARDS = '0x78330bF154172F1137219Bb559d4F3A270B3201F'; // AntseedUsageRewards: buyer rewards
const BUYER_NODE = '0x86bb4278389572d6ffc803d72661552be096e473'; // our own buyer node

const ABI = parseAbi([
  'function currentEpoch() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function stakerPositionCount(address) view returns (uint256)',
  'function stakerPositionIds(address,uint256,uint256) view returns (uint256[])',
  'function stakerTotalActiveStake(address) view returns (uint256)',
  'function positions(uint256) view returns (address,uint256,uint256,uint256,uint64,uint64,uint64,bool)',
  'function pendingStakerReward(uint256,uint256) view returns (uint256)',
  'function pendingIndexedStakerReward(uint256) view returns (uint256)',
  'function pendingBuyerReward(address,uint256) view returns (uint256)',
  'function buyerEpochClaimed(address,uint256) view returns (bool)',
]);

// Buyer rewards start accruing at epoch 22 (M001). pendingBuyerReward returns the
// gross amount and is NOT zeroed after a stake/claim; the claimed flag is tracked
// separately by buyerEpochClaimed, so "claimable now" = pending > 0 && !claimed.
const BUYER_FIRST_EPOCH = 22;

const SECRETS_DIR = path.join(os.homedir(), '.config', 'kilo', 'secrets');
const STATE_PATH = path.join(__dirname, '.ants-balance-state.json');

const args = process.argv.slice(2);
const addressArg = args.find((a) => a && !a.startsWith('--'));
const address = addressArg || OPERATOR;
const useProxy = args.includes('--proxy');
const rpcIdx = args.indexOf('--rpc');
const rpcOverride = rpcIdx >= 0 ? args[rpcIdx + 1] : null;

function firstExisting(...paths) {
  for (const p of paths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function readSecret(filename) {
  const p = path.join(SECRETS_DIR, filename);
  try {
    return fs.readFileSync(p, 'utf8').trim();
  } catch {
    return null;
  }
}

function resolveRpc() {
  if (rpcOverride) return rpcOverride;
  if (process.env.ANTS_RPC) return process.env.ANTS_RPC;
  return readSecret('rpc-base.url') || 'https://base-rpc.publicnode.com';
}

function resolveProxy() {
  const fromEnv = process.env.ANTS_PROXY;
  if (fromEnv) return fromEnv;
  return readSecret('proxies-ru.txt') || null;
}

// RPC endpoints, tried in order: the DRPC secret first (when set), then the
// public Base RPCs. DRPC is a paid balance that can be exhausted, so the free
// public nodes are the safety net. The first reachable node wins.
function rpcCandidates(primary) {
  const list = [];
  if (primary && !/base-rpc\.publicnode\.com|base\.drpc\.org|mainnet\.base\.org/.test(primary)) {
    list.push(primary);
  }
  list.push('https://base-rpc.publicnode.com', 'https://base.drpc.org', 'https://mainnet.base.org');
  return list;
}

function makeTransport(rpcUrl, proxyUrl) {
  const { ProxyAgent, fetch: proxyFetch } = require('undici');
  const candidates = rpcCandidates(rpcUrl);
  const wrap = (url) => {
    if (!proxyUrl) return http(url);
    const agent = new ProxyAgent({ uri: proxyUrl });
    return http(url, { fetchFn: (u, init) => proxyFetch(u, { ...init, dispatcher: agent }) });
  };
  if (candidates.length === 1) return wrap(candidates[0]);
  return fallback(candidates.map((u) => wrap(u)));
}

function fmt(n, decimals) {
  return formatUnits(n, decimals);
}

function loadState() {
  try {
    const all = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return all && all[address.toLowerCase()] ? all[address.toLowerCase()] : null;
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    let all = {};
    try {
      all = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) || {};
    } catch {
      all = {};
    }
    all[address.toLowerCase()] = state;
    fs.writeFileSync(STATE_PATH, JSON.stringify(all, null, 2) + '\n');
  } catch (e) {
    console.error('(could not save state: ' + e.message + ')');
  }
}

async function main() {
  const rpcUrl = resolveRpc();
  const proxyUrl = useProxy ? resolveProxy() : null;
  const client = createPublicClient({
    chain: base,
    transport: makeTransport(rpcUrl, proxyUrl),
    batch: { multicall: true },
  });

  const read = (contract, fn, args = []) =>
    client.readContract({ address: contract, abi: ABI, functionName: fn, args }).catch(() => null);

  const [epoch, antsBal, usdcBal, posCount] = await Promise.all([
    read(POOLS, 'currentEpoch'),
    read(ANTS, 'balanceOf', [address]),
    read(USDC, 'balanceOf', [address]),
    read(POOLS, 'stakerPositionCount', [address]),
  ]);

  console.log('wallet    ' + address);
  console.log('epoch     ' + (epoch ?? 'n/a') + ' (finished ' + (epoch != null ? epoch - 1n : 'n/a') + ')');
  if (proxyUrl) console.log('proxy     ' + proxyUrl);
  console.log('rpc       ' + rpcUrl);
  console.log('');

  const antsNow = antsBal ?? null;
  const usdcNow = usdcBal ?? null;
  console.log('ANTS      ' + (antsNow != null ? fmt(antsNow, 18) : 'read failed'));
  console.log('USDC      ' + (usdcNow != null ? fmt(usdcNow, 6) : 'read failed'));

  const prev = loadState();
  if (prev && antsNow != null && prev.ants != null) {
    const before = BigInt(prev.ants);
    const delta = antsNow - before;
    const sign = delta > 0n ? '+' : '';
    console.log('  since   ' + (prev.at || 'unknown') + ' (epoch ' + (prev.epoch ?? '?') + ')');
    console.log('  was     ' + fmt(before, 18) + ' -> now ' + fmt(antsNow, 18) + '  (' + sign + fmt(delta, 18) + ')');
  }

  console.log('');

  const count = posCount != null ? Number(posCount) : 0;
  if (count === 0) {
    console.log('positions ' + (posCount == null ? 'read failed' : '0 (none)'));
  } else {
    const ids = await read(POOLS, 'stakerPositionIds', [address, 0n, BigInt(count)]);
    const idList = Array.isArray(ids) ? ids : [];
    const totalStake = await read(POOLS, 'stakerTotalActiveStake', [address]);
    console.log('positions ' + idList.length + ' (active stake ' + (totalStake != null ? fmt(totalStake, 18) : '?') + ' ANTS)');
    console.log('');

    let rewardFinished = 0n;
    let rewardCurrent = 0n;
    let rewardIndexed = 0n;
    const rows = [];

    for (const id of idList) {
      const pos = await read(POOLS, 'positions', [id]);
      const [idx, finished, current] = await Promise.all([
        read(SPR, 'pendingIndexedStakerReward', [id]),
        epoch != null ? read(SPR, 'pendingStakerReward', [id, epoch - 1n]) : Promise.resolve(null),
        epoch != null ? read(SPR, 'pendingStakerReward', [id, epoch]) : Promise.resolve(null),
      ]);
      const amount = pos && pos[2] != null ? pos[2] : null;
      const agentId = pos && pos[1] != null ? pos[1] : null;
      const i = idx ?? 0n;
      const f = finished ?? 0n;
      const c = current ?? 0n;
      rewardIndexed += i;
      rewardFinished += f;
      rewardCurrent += c;
      rows.push({ id, agentId, amount, idx: i, finished: f, current: c });
    }

    for (const r of rows) {
      const amt = r.amount != null ? fmt(r.amount, 18) : '?';
      console.log(
        '  #' + String(r.id).padEnd(5) +
        ' agent ' + String(r.agentId ?? '?').padEnd(6) +
        ' staked ' + amt.padStart(12) +
        '  reward e' + String(epoch != null ? epoch - 1n : '?') + ': ' + fmt(r.finished, 18) +
        '  e' + String(epoch ?? '?') + ': ' + fmt(r.current, 18) +
        '  indexed: ' + fmt(r.idx, 18)
      );
    }

    console.log('');
    console.log('reward finished epoch ' + (epoch != null ? epoch - 1n : '?') + ': ' + fmt(rewardFinished, 18) + ' ANTS');
    console.log('reward current  epoch ' + (epoch ?? '?') + ': ' + fmt(rewardCurrent, 18) + ' ANTS');
    console.log('reward indexed (claimable)     : ' + fmt(rewardIndexed, 18) + ' ANTS');
  }

  console.log('');

  if (epoch != null) {
    const lastEpoch = epoch - 1n;
    const buyerEpochs = [];
    for (let e = BUYER_FIRST_EPOCH; BigInt(e) <= lastEpoch; e++) {
      buyerEpochs.push(BigInt(e));
    }
    const buyerPending = {};
    const buyerClaimed = {};
    for (const e of buyerEpochs) {
      const [p, c] = await Promise.all([
        read(USAGE_REWARDS, 'pendingBuyerReward', [BUYER_NODE, e]),
        read(USAGE_REWARDS, 'buyerEpochClaimed', [BUYER_NODE, e]),
      ]);
      buyerPending[e.toString()] = p ?? 0n;
      buyerClaimed[e.toString()] = c === true;
    }

    let buyerClaimable = 0n;
    console.log('buyer node ' + BUYER_NODE);
    console.log('  epoch  pending     status');
    for (const e of buyerEpochs) {
      const key = e.toString();
      const p = buyerPending[key];
      const claimed = buyerClaimed[key];
      if (!claimed) buyerClaimable += p;
      console.log(
        '  e' + String(e).padEnd(6) +
        String(fmt(p, 18)).padStart(11) +
        '   ' + (claimed ? 'staked/claimed' : 'claimable')
      );
    }
    console.log('  claimable now: ' + fmt(buyerClaimable, 18) + ' ANTS');
  }

  saveState({
    address,
    ants: antsNow != null ? antsNow.toString() : (prev && prev.ants) || null,
    usdc: usdcNow != null ? usdcNow.toString() : (prev && prev.usdc) || null,
    epoch: epoch != null ? epoch.toString() : (prev && prev.epoch) || null,
    at: new Date().toISOString(),
  });
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
