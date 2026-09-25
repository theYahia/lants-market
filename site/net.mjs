import { createPublicClient, http, parseAbi } from 'viem'
import { base } from 'viem/chains'

const POOLS_ADDRESS = '0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652'
const DEFAULT_RPCS = [
  'https://base-rpc.publicnode.com',
  'https://base-mainnet.public.blastapi.io'
]

const ABI = parseAbi([
  'function nextPositionId() view returns (uint256)',
  'function currentEpoch() view returns (uint256)',
  'function positions(uint256) view returns (address,uint256,uint256,uint256,uint64,uint64,uint64,bool)',
  'function ownerOf(uint256) view returns (address)',
  'function poolWeightAtEpoch(uint256, uint256) view returns (uint256)',
  'function totalPowerWeightAtEpoch(uint256) view returns (uint256)',
])

const read = (client, fn, args = [], blockNumber) =>
  client.readContract({ address: POOLS_ADDRESS, abi: ABI, functionName: fn, args, blockNumber })

const crossCheck = (a, b, label) => {
  if (String(a) !== String(b)) throw new Error(`RPC mismatch ${label}: ${a} vs ${b}`)
  return a
}

const activeCount = async (rpcs = DEFAULT_RPCS) => {
  const clients = rpcs.map(rpc => createPublicClient({ chain: base, transport: http(rpc), batch: { multicall: true } }))
  const [n1, n2] = await Promise.all(clients.map(c => read(c, 'nextPositionId')))
  if (n1.toString() !== n2.toString()) throw new Error(`nextPositionId mismatch: ${n1} vs ${n2}`)
  return Number(n1) - 1
}

const loadAll = async (rpcs = DEFAULT_RPCS, blockNumber) => {
  const clients = rpcs.map(rpc => createPublicClient({ chain: base, transport: http(rpc), batch: { multicall: true } }))
  if (blockNumber === undefined) blockNumber = await clients[0].getBlockNumber()

  const [n1, n2] = await Promise.all(clients.map(c => read(c, 'nextPositionId', [], blockNumber)))
  if (n1.toString() !== n2.toString()) throw new Error(`nextPositionId mismatch: ${n1} vs ${n2}`)

  const count = Number(n1) - 1
  const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1))

  const positions1 = await Promise.all(ids.map(id => read(clients[0], 'positions', [id], blockNumber)))
  const positions2 = await Promise.all(ids.map(id => read(clients[1], 'positions', [id], blockNumber)))

  const keys = ['owner','agentId','amount','weightAmount','stakeStartEpoch','stakeEndEpoch','closedAtEpoch','withdrawn']

  const results = []
  for (let i = 0; i < ids.length; i++) {
    const p1 = positions1[i]
    const p2 = positions2[i]

    for (let j = 0; j < keys.length; j++) {
      const v1 = String(p1[j])
      const v2 = String(p2[j])
      if (v1 !== v2) {
        throw new Error(`Position ${ids[i]} mismatch on ${keys[j]}: ${v1} vs ${v2}`)
      }
    }

    results.push({
      id: String(ids[i]),
      owner: p1[0],
      agentId: String(p1[1]),
      amount: String(p1[2]),
      weightAmount: String(p1[3]),
      stakeStartEpoch: String(p1[4]),
      stakeEndEpoch: String(p1[5]),
      closedAtEpoch: String(p1[6]),
      withdrawn: p1[7]
    })
  }
  return results
}

export { loadAll, activeCount, crossCheck }