// Find every buyer of a pool in an epoch from UsagePointsAccrued logs. Node only.
// Usage: node site/rebate-scan.mjs <epoch> <agentId> <fromBlock> <toBlock>   (RPC_URL overrides the RPC)
// Spec: scripts/site/check_rebate.py (rebate_scan, rebate_scan_split).

export async function scanBuyers(epoch, agentId, fromBlock, toBlock, rpcUrl) {
  throw new Error('scanBuyers: not implemented');
}

console.error('rebate-scan: not implemented');
process.exit(2);
