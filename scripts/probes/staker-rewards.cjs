// Staker rewards for every position: last finished epoch and the current one.
// Usage: node scripts/probes/staker-rewards.cjs [rpcUrl]
const V = require('viem');
const { base } = require('viem/chains');
const c = V.createPublicClient({ chain: base, transport: V.http(process.argv[2] || 'https://base-rpc.publicnode.com'), batch: { multicall: true } });
const POOLS = '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652', SPR = '0x83cc5b9aa0c8cb8683f35462c385a5baaa755ee5';
const abi = V.parseAbi([
  'function nextPositionId() view returns (uint256)',
  'function currentEpoch() view returns (uint256)',
  'function positions(uint256) view returns (address,uint256,uint256,uint256,uint64,uint64,uint64,bool)',
  'function ownerOf(uint256) view returns (address)',
  'function pendingStakerReward(uint256,uint256) view returns (uint256)',
  'function pendingIndexedStakerReward(uint256) view returns (uint256)',
]);
const r = (a, f, x = []) => c.readContract({ address: a, abi, functionName: f, args: x }).catch((e) => 'ERR');
const F = (x) => (typeof x === 'bigint' ? Number(V.formatUnits(x, 18)).toFixed(1) : x);
(async () => {
  const s = await (await fetch('https://antscan.co/api/sellers')).json();
  const name = (id) => (s.find((x) => x.agentId === String(id)) || {}).sellerName || '';
  const n = Number(await r(POOLS, 'nextPositionId')) - 1;
  const cur = BigInt(await r(POOLS, 'currentEpoch')), prev = cur - 1n; // last finished epoch and the current one
  const ids = Array.from({ length: n }, (_, i) => BigInt(i + 1));
  const rows = await Promise.all(ids.map(async (id) => {
    const p = await r(POOLS, 'positions', [id]);
    const [o, e22, e23, idx] = await Promise.all([r(POOLS, 'ownerOf', [id]), r(SPR, 'pendingStakerReward', [id, prev]), r(SPR, 'pendingStakerReward', [id, cur]), r(SPR, 'pendingIndexedStakerReward', [id])]);
    return { id, agent: p[1], amt: F(p[2]), owner: o, e22: F(e22), e23: F(e23), idx: F(idx) };
  }));
  let t22 = 0;
  for (const x of rows) { if (x.e22 !== 'ERR') t22 += Number(x.e22); console.log(`#${x.id}`.padEnd(4), String(x.agent).padEnd(6), name(x.agent).slice(0, 20).padEnd(20), String(x.amt).padStart(9), x.owner.slice(0, 10), `e${prev}`, String(x.e22).padStart(9), `e${cur}`, String(x.e23).padStart(9), 'indexed', x.idx); }
  console.log(`sum e${prev} pending`, t22.toFixed(1));
})();
