// Network stake state: positions, owners, pool weights for the next epoch.
// Usage: node scripts/probes/net-state.cjs [rpcUrl]
const V = require('viem');
const { base } = require('viem/chains');

const rpc = process.argv[2] || 'https://base-rpc.publicnode.com';
const c = V.createPublicClient({ chain: base, transport: V.http(rpc), batch: { multicall: true } });
const POOLS = '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652';
const abi = V.parseAbi([
  'function nextPositionId() view returns (uint256)',
  'function currentEpoch() view returns (uint256)',
  'function positions(uint256) view returns (address,uint256,uint256,uint256,uint64,uint64,uint64,bool)',
  'function ownerOf(uint256) view returns (address)',
  'function poolWeightAtEpoch(uint256,uint256) view returns (uint256)',
  'function totalPowerWeightAtEpoch(uint256) view returns (uint256)',
]);
const r = (f, args = []) => c.readContract({ address: POOLS, abi, functionName: f, args });
const ants = (x) => Number(V.formatUnits(x, 18));

(async () => {
  const [next, epoch] = await Promise.all([r('nextPositionId'), r('currentEpoch')]);
  const nextEpoch = epoch + 1n;
  const ids = Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1));
  const pos = await Promise.all(ids.map((id) => r('positions', [id])));
  const owners = await Promise.all(ids.map((id) => r('ownerOf', [id]).catch(() => null)));
  const agents = [...new Set(pos.map((p) => p[1]))];
  const weights = await Promise.all(agents.map((a) => r('poolWeightAtEpoch', [a, nextEpoch])));
  const totalWeight = await r('totalPowerWeightAtEpoch', [nextEpoch]);
  const locked = pos.reduce((s, p) => s + p[2], 0n);

  console.log(`rpc ${rpc}`);
  console.log(`epoch ${epoch} | positions ${ids.length} | owners ${new Set(owners.filter(Boolean)).size} | locked ${ants(locked).toFixed(2)} ANTS`);
  console.log('\npositions > 1 ANTS:');
  pos.forEach((p, i) => {
    if (ants(p[2]) > 1.0001) console.log(`  #${ids[i]}  owner ${owners[i]}  pool ${p[1]}  ${ants(p[2]).toFixed(2)} ANTS  ends ${p[5]}`);
  });
  console.log(`\npool weight for epoch ${nextEpoch} (total ${ants(totalWeight).toFixed(0)}):`);
  agents
    .map((a, i) => ({ a, w: weights[i] }))
    .sort((x, y) => (y.w > x.w ? 1 : -1))
    .slice(0, 8)
    .forEach(({ a, w }) => console.log(`  ${String(a).padEnd(6)} ${ants(w).toFixed(0).padStart(10)}  ${(Number((w * 10000n) / (totalWeight || 1n)) / 100).toFixed(1)} %`));
})();
