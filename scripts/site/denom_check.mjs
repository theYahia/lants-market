// Cross-check the pool-reward denominator: recompute sum(sales * poolWeight) for
// epoch 24 from the on-chain contract vs the committed snapshot, and sanity-check
// one position's staker reward both ways. Read-only.
// Usage: node scripts/site/denom_check.mjs
import fs from 'node:fs';

const RPC_URL = 'https://mainnet.base.org';
const CONTRACT = '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652';
const SELECTOR = '0x5c50b757';
const EPOCH = 24;
const BATCH_SIZE = 5;
const BATCH_PAUSE = 400;
const RETRY_ATTEMPTS = 3;
const RETRY_PAUSE = 1000;

const snapshot = JSON.parse(
  fs.readFileSync('site/fixtures/snapshot-e23.full.json', 'utf8')
);

const salesByPool = snapshot.salesByPool || {};
const poolWeightByEpoch = snapshot.poolWeightByEpoch || {};
const positions = snapshot.positions || [];
const stakerBudget = BigInt(snapshot.stakerBudget || 0);

const agentIds = Object.entries(salesByPool)
  .filter(([, sales]) => BigInt(sales) > 0n)
  .map(([agentId]) => agentId);

const rpcErrors = [];
const onchainWeights = new Map();

function toHex64(value) {
  return value.toString(16).padStart(64, '0');
}

function decodeUint256(hex) {
  if (!hex || hex === '0x' || hex.length < 66) return 0n;
  return BigInt(hex);
}

async function rpcCall(agentId) {
  const data = SELECTOR + toHex64(BigInt(agentId)) + toHex64(BigInt(EPOCH));
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_call',
    params: [{ to: CONTRACT, data }, 'latest'],
  });

  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const result = await response.json();
      if (result.error) throw new Error(result.error.message || 'rpc error');
      return decodeUint256(result.result);
    } catch (e) {
      if (attempt < RETRY_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, RETRY_PAUSE));
      } else {
        throw e;
      }
    }
  }
}

async function fetchWeights() {
  for (let i = 0; i < agentIds.length; i += BATCH_SIZE) {
    const batch = agentIds.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (agentId) => {
        try {
          const weight = await rpcCall(agentId);
          onchainWeights.set(agentId, weight);
        } catch (e) {
          rpcErrors.push(agentId);
          onchainWeights.set(agentId, 0n);
          console.log(`rpc_error=${agentId}`);
        }
      })
    );
    if (i + BATCH_SIZE < agentIds.length) {
      await new Promise((r) => setTimeout(r, BATCH_PAUSE));
    }
  }
}

function calculateSums() {
  let sumNetwork = 0n;
  let sumSnapshot = 0n;
  let poolsWithOnchainWeight = 0;
  let poolsInSnapshot = 0;

  for (const agentId of agentIds) {
    const sales = BigInt(salesByPool[agentId]);
    const onchainWeight = onchainWeights.get(agentId) || 0n;
    if (onchainWeight > 0n) {
      poolsWithOnchainWeight++;
      sumNetwork += sales * onchainWeight;
    }

    const snapshotWeightStr = poolWeightByEpoch[agentId]?.[EPOCH];
    if (snapshotWeightStr) {
      poolsInSnapshot++;
      sumSnapshot += sales * BigInt(snapshotWeightStr);
    }
  }

  return { sumNetwork, sumSnapshot, poolsWithOnchainWeight, poolsInSnapshot };
}

async function main() {
  await fetchWeights();
  const { sumNetwork, sumSnapshot, poolsWithOnchainWeight, poolsInSnapshot } =
    calculateSums();

  const poolsTotal = agentIds.length;
  const ratio =
    sumSnapshot === 0n
      ? 'NaN'
      : (Number(sumNetwork) / Number(sumSnapshot)).toFixed(3);

  console.log(`pools_total=${poolsTotal}`);
  console.log(`pools_with_onchain_weight=${poolsWithOnchainWeight}`);
  console.log(`pools_in_snapshot=${poolsInSnapshot}`);
  console.log(`sum_network=${sumNetwork.toString()}`);
  console.log(`sum_snapshot=${sumSnapshot.toString()}`);
  console.log(`ratio=${ratio}`);
  console.log(`rpc_errors=${rpcErrors.length}`);

  // Position 27
  const position = positions.find((p) => p.id === '27');
  if (position) {
    const agentId = String(position.agentId);
    const positionWeight = BigInt(position.weightsByEpoch?.[EPOCH] || '0');
    const sales = BigInt(salesByPool[agentId] || 0);

    // Snapshot variant
    const snapshotPoolWeight = BigInt(poolWeightByEpoch[agentId]?.[EPOCH] || '0');
    let rewardBySnapshot = 'unavailable';
    if (sumSnapshot > 0n && snapshotPoolWeight > 0n && positionWeight > 0n) {
      const poolReward =
        (stakerBudget * sales * snapshotPoolWeight) / sumSnapshot;
      rewardBySnapshot = (
        Number(poolReward * positionWeight) / Number(snapshotPoolWeight)
      ).toFixed(2);
    }

    // On-chain variant
    const networkPoolWeight = onchainWeights.get(agentId) || 0n;
    let rewardByNetwork = 'unavailable';
    if (sumNetwork > 0n && networkPoolWeight > 0n && positionWeight > 0n) {
      const poolReward =
        (stakerBudget * sales * networkPoolWeight) / sumNetwork;
      rewardByNetwork = (
        Number(poolReward * positionWeight) / Number(networkPoolWeight)
      ).toFixed(2);
    }

    console.log(`reward_by_snapshot=${rewardBySnapshot}`);
    console.log(
      `reward_by_network=${rewardByNetwork}${
        rewardByNetwork === 'unavailable'
          ? ' (network weight is zero or sums are zero)'
          : ''
      }`
    );
  }

  if (rpcErrors.length > 10) {
    console.log(`WARNING measurement_unreliable rpc_errors=${rpcErrors.length}`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});