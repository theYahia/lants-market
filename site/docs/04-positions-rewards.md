# Positions & Rewards

A staking position is an ERC-721 token minted when you stake ANTS into a seller's pool. One stake produces one token. The collection is `0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652`.

`positions(uint256)` returns: `owner`, `agentId`, `amount`, `weightAmount`, `stakeStartEpoch`, `stakeEndEpoch`, `closedAtEpoch`, `withdrawn`.

Example — position #27, read on-chain:

| Field | Value |
|---|---|
| owner | `0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B` |
| agentId | 52894 |
| amount | 10,075.913604428940056768 ANTS |
| stakeStartEpoch | 24 |
| stakeEndEpoch | 128 (104-epoch lock) |
| closedAtEpoch | 0 |
| withdrawn | false |

**Epochs.** An epoch lasts one week. Epoch 23 began 2026-09-17 09:54 UTC; epoch 24 begins 2026-09-24 09:54 UTC. `currentEpoch()` at snapshot time was 23.

**Activation.** `stakeActivationDelay()` = 1, so a position is not active in the epoch it is created. Calling `splitStake` on an inactive position reverts with `PositionClosed()` even though `closedAtEpoch` is 0.

**Lock bounds.** `minStakeEpochs()` = 1, `MAX_STAKE_EPOCHS()` = 104.

**Early exit.** Exiting before the end epoch is slashed by `earlyExitSlashBps`. For #27 this is 50%. The floor you recover on early exit is `amount * (1 - slash)` = 5,037.96 ANTS.

**Rewards.** A staker's reward for an epoch is driven by pool *sales*, not by stake size:

```
poolReward     = stakerBudget * (poolSales * poolWeight) / sum(poolSales * poolWeight over all pools)
positionReward = poolReward * positionWeight / poolWeight
```

`stakerBudget` = 100,000 ANTS per epoch, read via raw selector `0x56ab55c5` on the `emissionsGate` contract `0xE60a31E6CD2F8455503cA0B3f6545Dd3DDF543BD` at block 51613321. This selector has no name in any signature database and the contract ABI is not verified. The value is constant across epochs 21, 22 and 23 and equals 2% of the weekly emission of 5,000,000 ANTS derived from `currentEmissionRate()`.

Position #27 metrics for the next epoch:

| Metric | Value | Definition |
|---|---|---|
| reward | 38,486 ANTS | next-epoch position reward |
| yield | 3.820 | reward / amount |
| payback | 0.131 | floor / reward (epochs for the reward to cover the floor) |

**Transferability.** ANTS is non-transferable between wallets: `transfersEnabled()` = false, and a direct `transfer` reverts with `TransfersNotEnabled()`. The stake contract is on the `transferWhitelist`, so you can stake, but you cannot send ANTS to another person. Because of this, the position NFT is the only way to move locked ANTS.

---