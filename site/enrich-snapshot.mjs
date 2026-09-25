import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { loadAll, crossCheck } from './net.mjs'
import { createPublicClient, http, parseAbi } from 'viem'
import { base } from 'viem/chains'

const POOLS_ADDRESS = '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652'
const REWARDS_ADDRESS = '0x83cc5b9aa0c8cb8683f35462c385a5baaa755ee5'
const RPC_URLS = (process.env.RPC_URLS && process.env.RPC_URLS.split(',')) || ['https://base-rpc.publicnode.com', 'https://base-mainnet.public.blastapi.io']

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

const clients = RPC_URLS.map(u => createPublicClient({ chain: base, transport: http(u), batch: { multicall: true } }))
const client = clients[0]
let PIN_BLOCK
let liveNonZero = 0
const rpcMismatches = []
const xread = async (address, abi, fn, args = []) => {
  const [a, b] = await Promise.all(clients.map(c =>
    c.readContract({ address, abi, functionName: fn, args, blockNumber: PIN_BLOCK })))
  try {
    crossCheck(a, b, `${fn}(${args.join(',')})@${PIN_BLOCK}`)
  } catch (e) {
    rpcMismatches.push(`${fn}(${args.join(',')})@${PIN_BLOCK}`)
    throw e
  }
  if (String(b) !== '0') liveNonZero++
  return a
}
const callPools = (fn, args = []) => xread(POOLS_ADDRESS, POOLS_ABI, fn, args)
const callRewards = (fn, args = []) => xread(REWARDS_ADDRESS, REWARDS_ABI, fn, args)
// Batched cross-checked multicall: one HTTP request per RPC per batch (multicall3),
// allowFailure so reverts (e.g. earlyExitSlashBps PositionChangePending) don't kill the batch.
const xmulticall = async (contracts) => {
  const [ra, rb] = await Promise.all(clients.map(c =>
    c.multicall({ contracts, allowFailure: true, blockNumber: PIN_BLOCK })))
  return contracts.map((ct, i) => {
    const a = ra[i], b = rb[i]
    const label = `${ct.functionName}(${(ct.args || []).join(',')})@${PIN_BLOCK}`
    if (a.status !== b.status) { rpcMismatches.push(label + ' [status]'); return { ok: false } }
    if (a.status === 'failure') return { ok: false }
    try { crossCheck(a.result, b.result, label) } catch (e) { rpcMismatches.push(label) }
    if (String(b.result) !== '0') liveNonZero++
    return { ok: true, value: a.result }
  })
}

async function main() {
  PIN_BLOCK = (await client.getBlockNumber()) - 3n // ponytail: 3 blocks (~6 s) behind head so both RPCs have it; raise if an RPC lags more
  const positions = await loadAll(undefined, PIN_BLOCK)

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
  const blockNumber = PIN_BLOCK
  const hexBlock = '0x' + blockNumber.toString(16)
  const [rawBudget, rawBudget2] = await Promise.all(clients.map(c => c.request({
    method: 'eth_call',
    params: [{ to: STAKING_ADDRESS, data: '0x56ab55c5' }, hexBlock]
  })))
  if (!rawBudget || rawBudget === '0x') throw new Error('stakerBudget selector 0x56ab55c5 returned empty')
  crossCheck(BigInt(rawBudget), BigInt(rawBudget2 || '0x0'), 'stakerBudget')
  const stakerBudget = String(BigInt(rawBudget))
  const stakerBudgetSource = `${STAKING_ADDRESS} 0x56ab55c5 block ${blockNumber} (2 RPCs)`

  const enrichedPositions = []
  const poolWeightByEpoch = {}
  const activeRewardEpochs = rewardEpochs.filter(re => re >= 0)

  for (const p of positions) {
    const posId = BigInt(p.id)

    const contracts = []
    for (const e of epochs) {
      contracts.push({ address: POOLS_ADDRESS, abi: POOLS_ABI, functionName: 'positionWeightAtEpoch', args: [posId, BigInt(e)] })
      contracts.push({ address: POOLS_ADDRESS, abi: POOLS_ABI, functionName: 'positionMaxLockPowerAtEpoch', args: [posId, BigInt(e)] })
    }
    contracts.push({ address: POOLS_ADDRESS, abi: POOLS_ABI, functionName: 'earlyExitSlashBps', args: [posId] })
    contracts.push({ address: POOLS_ADDRESS, abi: POOLS_ABI, functionName: 'positionWithdrawableEpoch', args: [posId] })
    for (const re of activeRewardEpochs) {
      contracts.push({ address: REWARDS_ADDRESS, abi: REWARDS_ABI, functionName: 'pendingStakerReward', args: [posId, BigInt(re)] })
    }
    const res = await xmulticall(contracts)

    let i = 0
    const weightsByEpoch = {}
    const maxLockPowerByEpoch = {}
    for (const e of epochs) {
      const w = res[i++], m = res[i++]
      if (w.ok) weightsByEpoch[String(e)] = String(w.value)
      if (m.ok) maxLockPowerByEpoch[String(e)] = String(m.value)
    }

    const slashRes = res[i++]
    const withdrawRes = res[i++]
    let slashBps = null
    let exitOpensEpoch = null
    if (slashRes.ok) {
      slashBps = String(slashRes.value)
    } else if (withdrawRes.ok) {
      const epochNum = Number(withdrawRes.value)
      if (epochNum > currentEpoch) exitOpensEpoch = epochNum
    }

    const rewardByEpoch = {}
    for (const re of activeRewardEpochs) {
      const r = res[i++]
      if (r.ok) rewardByEpoch[String(re)] = String(r.value)
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
  const pwContracts = poolIds.map(agent => ({ address: POOLS_ADDRESS, abi: POOLS_ABI, functionName: 'poolWeightAtEpoch', args: [BigInt(agent), BigInt(currentEpoch + 1)] }))
  const pwRes = await xmulticall(pwContracts)
  let weightErrors = 0
  poolIds.forEach((agent, idx) => {
    if (pwRes[idx].ok) {
      poolWeightByEpoch[agent] = { [String(currentEpoch + 1)]: String(pwRes[idx].value) }
    } else {
      weightErrors++
      console.warn('poolWeight failed for ' + agent)
    }
  })
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

  if (rpcMismatches.length > 0) throw new Error('RPC mismatch on ' + rpcMismatches.length + ' reads, first: ' + rpcMismatches.slice(0, 5).join('; '))
  if (liveNonZero === 0) throw new Error('second RPC returned only zeros — suspected RPC fault, not publishing')
  writeFileSync(resolve('site/fixtures/snapshot-e23.live.json'), JSON.stringify(output, null, 2))
  console.log('snapshot saved')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })