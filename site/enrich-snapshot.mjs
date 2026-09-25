import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { loadAll } from './net.mjs'
import { createPublicClient, http, parseAbi } from 'viem'
import { base } from 'viem/chains'

const POOLS_ADDRESS = '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652'
const REWARDS_ADDRESS = '0x83cc5b9aa0c8cb8683f35462c385a5baaa755ee5'
const RPC_URL = 'https://base-rpc.publicnode.com'

// New contract to fetch stakerBudget
const STAKING_ADDRESS = '0xE60a31E6CD2F8455503cA0B3f6545Dd3DDF543BD'

const POOLS_ABI = parseAbi([
  'function currentEpoch() view returns (uint256)',
  'function positionWeightAtEpoch(uint256, uint256) view returns (uint256)',
  'function positionMaxLockPowerAtEpoch(uint256, uint256) view returns (uint256)',
  'function earlyExitSlashBps(uint256) view returns (uint256)',
  'function positionWithdrawableEpoch(uint256) view returns (uint64)',
  'function poolWeightAtEpoch(uint256, uint256) view returns (uint256)',
])

const REWARDS_ABI = parseAbi([
  'function pendingStakerReward(uint256, uint256) view returns (uint256)',
])

const client = createPublicClient({ chain: base, transport: http(RPC_URL), batch: { multicall: true } })
const callPools = (fn, args = []) => client.readContract({ address: POOLS_ADDRESS, abi: POOLS_ABI, functionName: fn, args })
const callRewards = (fn, args = []) => client.readContract({ address: REWARDS_ADDRESS, abi: REWARDS_ABI, functionName: fn, args })

async function main() {
  const positions = await loadAll()

  const LIVE_PATH = resolve('site/fixtures/snapshot-e23.live.json')
  const FULL_PATH = resolve('site/fixtures/snapshot-e23.full.json')
  let salesByPool = {}
  try {
    salesByPool = JSON.parse(readFileSync(LIVE_PATH, 'utf8')).salesByPool || {}
  } catch (e) {
    try {
      salesByPool = JSON.parse(readFileSync(FULL_PATH, 'utf8')).salesByPool || {}
    } catch (e2) {
      console.warn('no previous snapshot with salesByPool: ' + e2.message)
    }
  }

  const currentEpoch = Number(await callPools('currentEpoch'))
  const epochs = [currentEpoch, currentEpoch + 1, currentEpoch + 7, currentEpoch + 17]
  const rewardEpochs = [currentEpoch - 1, currentEpoch]

  // Raw selector: the contract has no named stakerBudget() function, calling it reverts
  const blockNumber = await client.getBlockNumber()
  const rawBudget = await client.request({
    method: 'eth_call',
    params: [{ to: STAKING_ADDRESS, data: '0x56ab55c5' }, '0x' + blockNumber.toString(16)]
  })
  if (!rawBudget || rawBudget === '0x') throw new Error('stakerBudget selector 0x56ab55c5 returned empty')
  const stakerBudget = String(BigInt(rawBudget))
  const stakerBudgetSource = `${STAKING_ADDRESS} 0x56ab55c5 block ${blockNumber}`

  const enrichedPositions = []
  const poolWeightByEpoch = {}

  for (const p of positions) {
    const posId = BigInt(p.id)
    const agentId = BigInt(p.agentId)

    const weightsByEpoch = {}
    const maxLockPowerByEpoch = {}
    try {
      for (const e of epochs) {
        const w = await callPools('positionWeightAtEpoch', [posId, BigInt(e)])
        const m = await callPools('positionMaxLockPowerAtEpoch', [posId, BigInt(e)])
        weightsByEpoch[String(e)] = String(w)
        maxLockPowerByEpoch[String(e)] = String(m)
      }
    } catch (e) {
      console.warn('Weights read failed', e.message)
    }

    let slashBps = null
    let exitOpensEpoch = null
    try {
      const slash = await callPools('earlyExitSlashBps', [posId])
      slashBps = String(slash)
    } catch (e) {
      console.warn('Slash read failed', e.message)
      try {
        const epochVal = await callPools('positionWithdrawableEpoch', [posId])
        const epochNum = Number(epochVal)
        if (epochNum > currentEpoch) exitOpensEpoch = epochNum
      } catch (_) {}
    }

    const rewardByEpoch = {}
    try {
      for (const re of rewardEpochs) {
        if (re < 0) continue
        const r = await callRewards('pendingStakerReward', [posId, BigInt(re)])
        rewardByEpoch[String(re)] = String(r)
      }
    } catch (e) {
      console.warn('Reward read failed', e.message)
    }

    enrichedPositions.push({
      id: p.id,
      agentId: p.agentId,
      amount: p.amount,
      slashBps,
      exitOpensEpoch,
      weightsByEpoch,
      maxLockPowerByEpoch,
      rewardByEpoch,
      stakeStartEpoch: p.stakeStartEpoch,
      stakeEndEpoch: p.stakeEndEpoch,
      closedAtEpoch: p.closedAtEpoch,
      withdrawn: p.withdrawn
    })
  }

  const poolIds = Object.keys(salesByPool).filter(a => Number(salesByPool[a]) > 0)
  let weightErrors = 0
  for (const agent of poolIds) {
    try {
      const pw = await callPools('poolWeightAtEpoch', [BigInt(agent), BigInt(currentEpoch + 1)])
      poolWeightByEpoch[agent] = { [String(currentEpoch + 1)]: String(pw) }
    } catch (e) {
      weightErrors++
      console.warn('poolWeight failed for ' + agent + ': ' + e.message)
    }
  }
  console.log('pools_with_sales=' + poolIds.length + ' pool_weight_errors=' + weightErrors)
  if (weightErrors > 0) throw new Error('pool weights incomplete: ' + weightErrors + ' failures')

  const output = {
    epoch: String(currentEpoch),
    snapshotBlock: String(blockNumber),
    snapshotEpoch: String(currentEpoch),
    generatedAt: new Date().toISOString(),
    positions: enrichedPositions,
    poolWeightByEpoch,
    salesByPool,
    stakerBudget,
    stakerBudgetSource
  }

  writeFileSync(resolve('site/fixtures/snapshot-e23.live.json'), JSON.stringify(output, null, 2))
  console.log('snapshot saved')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })