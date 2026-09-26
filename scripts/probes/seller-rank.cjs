// Recognized sales by seller for one epoch (+ seller reward once the epoch is finished).
// Usage: node scripts/probes/seller-rank.cjs <epoch> [rpcUrl]
const V = require('viem');
const { base } = require('viem/chains');

const epoch = BigInt(process.argv[2] ?? 0);
const rpc = process.argv[3] || 'https://base-rpc.publicnode.com';
const c = V.createPublicClient({ chain: base, transport: V.http(rpc), batch: { multicall: true } });
const ACCOUNTING = '0xAdd2D85316153D7bfaF7921EE9Bf1Bb6c7A1cBc9';
const REWARDS = '0x78330bF154172F1137219Bb559d4F3A270B3201F';
const abi = V.parseAbi([
  'function currentEpoch() view returns (uint256)',
  'function sellerPointsByEpoch(uint256,address) view returns (uint256)',
  'function totalSellerPointsByEpoch(uint256) view returns (uint256)',
  'function pendingAgentReward(uint256,uint256) view returns (uint256)',
]);
const read = (address, f, args = []) => c.readContract({ address, abi, functionName: f, args });

(async () => {
  // Seller addresses and names come from the public explorer API.
  // antscan also lists sellers without an agent id; they have no pool and no recognized sales
  const sellers = (await (await fetch('https://antscan.co/api/sellers')).json()).filter((s) => s.agentId != null);
  const current = await read(ACCOUNTING, 'currentEpoch');
  const total = await read(ACCOUNTING, 'totalSellerPointsByEpoch', [epoch]);
  const points = await Promise.all(sellers.map((s) => read(ACCOUNTING, 'sellerPointsByEpoch', [epoch, s.address])));
  const finished = epoch < current;
  const rewards = finished
    ? await Promise.all(sellers.map((s) => read(REWARDS, 'pendingAgentReward', [BigInt(s.agentId), epoch]).catch(() => 0n)))
    : sellers.map(() => 0n);

  const rows = sellers
    .map((s, i) => ({ id: s.agentId, name: (s.sellerName || '').slice(0, 24), pts: points[i], rew: rewards[i] }))
    .filter((x) => x.pts > 0n)
    .sort((a, b) => (b.pts > a.pts ? 1 : b.pts < a.pts ? -1 : 0));

  console.log(`epoch ${epoch} (current ${current}) | recognized sales $${(Number(total) / 1e6).toFixed(2)} | sellers ${rows.length}`);
  rows.forEach((x, i) => {
    const usd = `$${(Number(x.pts) / 1e6).toFixed(2)}`.padStart(10);
    const share = `${(Number((x.pts * 10000n) / (total || 1n)) / 100).toFixed(2)} %`.padStart(8);
    const rew = finished ? `  reward ${Number(V.formatUnits(x.rew, 18)).toFixed(1)} ANTS` : '';
    console.log(`${String(i + 1).padStart(2)}  ${x.id.padEnd(6)} ${x.name.padEnd(24)} ${usd} ${share}${rew}`);
  });
})();
