# Protocol notes — how lANTS works

Read from the verified contract sources and the AntSeed docs of 17.09.2026, and cross-checked on
two public RPCs (publicnode, drpc). Base mainnet. Where we are not sure, we say so.

## Contracts

| Contract | Address | What we use it for |
|---|---|---|
| AntseedSellerPools (lANTS, ERC-721) | `0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652` | positions, pool weights, move / split / merge |
| AntseedSellerPoolsRewards | `0x83cc5b9aa0c8cb8683f35462c385a5baaa755ee5` | staker rewards |
| AntseedUsageRewards | `0x78330bF154172F1137219Bb559d4F3A270B3201F` | buyer and seller rewards, `stakeBuyerReward` |
| AntseedUsageAccounting | `0xAdd2D85316153D7bfaF7921EE9Bf1Bb6c7A1cBc9` | recognized sales and points per epoch |
| AntseedEmissionsGate | `0xE60a31E6CD2F8455503cA0B3f6545Dd3DDF543BD` | claims |
| AntseedDeposits | `0x0F7a3a8f4Da01637d1202bb5443fcF7F88F99fD2` | buyer balances and operators |
| ANTS token | `0xa87EE81b2C0Bc659307ca2D9ffdC38514DD85263` | transfers disabled |
| Seaport 1.6 (OpenSea) | `0x0000000000000068F116a894984e2DB1123eB395` | the market lANTS already trades on |

Explorer for the network: [antscan.co](https://antscan.co) (`/api/sellers` is public and CORS-open).

## Epochs

- One epoch is one week. The boundary is **Thursday 09:54:21 UTC**.
- M001 (recognized usage) is active from **epoch 22**. Earlier epochs are legacy emissions.
- A stake made during epoch N counts from **epoch N+1** (`stakeActivationDelay = 1`).

## Where lANTS comes from

ANTS cannot be transferred, so there is no way to buy ANTS and stake it. Positions are minted from
rewards only:

| Path | Who can call it |
|---|---|
| `stakeBuyerReward(buyer, epoch, agentId, epochs)` — stake a finished epoch's buyer reward | the buyer's **Deposits operator** |
| `stakeAgentReward(agentId, epoch, epochs)` — stake a finished epoch's **seller** reward | the seller |
| `restakeStakerRewards(positionId, epochs)` / `…Batch` — roll a position's staker reward into a **new** position | the position owner |
| Starter grant (`Init Position`) — 1 ANTS in the seller's own pool | the protocol, once per seller (26 so far; the faucet was sized for 100) |

`claimStakerRewards(positionId, recipient)` also exists and pays ANTS to a wallet — but ANTS in a wallet
cannot be staked while transfers are disabled. Restaking is the only way to keep compounding.

Seen on 17.09 (decoded on Blockscout): #27 and #28 — `stakeBuyerReward`; #30 — `stakeAgentReward`
(D5V1N2, its epoch-22 seller reward of 390.30); #29 and #31 — `restakeStakerRewards` from starter
positions #15 and #9.

## What a position is worth — the fields that matter

| Field | Why a buyer cares |
|---|---|
| `amount` | locked ANTS |
| `stakeEndEpoch` | how long it stays locked |
| `agentId` | which seller's pool it backs |
| weight at next epoch | its share of that pool |
| max-lock flag | changes weight math |
| `earlyExitSlashBps` | the penalty if the holder exits early |
| pending staker reward | **travels with the NFT** — the claim cursor is per position, not per owner |

## Weight

- Position weight ≈ `amount × (stakeEndEpoch − epoch)`; with max-lock it is `amount × 104`.
- A pool's weight is the sum of its positions.
- **Buyer and pool points are multiplied by the pool's weight** (`poolWeightPolicy = 0x0`, linear).
  That is why buying from a heavy pool earns far more points than buying from a light one.
- A pool needs at least `minimumAccountedPoolPower = 1` to count.

## Moving and changing a position

| Action | Cost | Note |
|---|---|---|
| `moveStake` to another pool | free | takes effect next epoch |
| `splitStake` | free | body and weight split proportionally, lock terms kept |
| `mergeStakes` | free | |
| `extendLock` / enable–disable max-lock | free | |
| split or move a **max-locked** position | reverts | measured 26.09 with `eth_call`: `PositionClosed()` (`0x9e684275`) on #27/#111, while the same calls pass on non-max-locked #29/#30 — split and move before enabling max-lock |
| Early exit | **max(5 %, 50 % × remaining / total)** of principal, burned | right after staking for 104 epochs this is 50 % |
| Transfer the NFT | gas | nothing in the contract blocks it |

⚠️ For a buyer of a position: between a listing and a sale the seller can still claim the pending
reward, split the position or switch max-lock. Any serious market has to check the position at fill
time.

## How the staker budget is split

From the contract header and `_poolRewardPreview`:

```
poolReward     = stakerBudget × poolWeightedPoints / totalWeightedPoints
poolWeightedPoints = pool's recognized sales × pool weight      (linear, no policy set)
positionReward = poolReward × positionWeight / poolWeight
```

So **reward per unit of weight in pool i = budget × salesᵢ / Σ(salesⱼ × weightⱼ)**. It depends on the
pool's sales, not on how much is staked there. The best pool for a staker is simply the one with the
most recognized sales. Other people's stakes change everyone's yield through the denominator.

- Nothing is paid until someone calls `indexPoolRewards(agentId, maxEpochs)` (anyone can) and the owner
  claims or restakes.
- Restaking creates a new position **in the same pool**; the contract may add a weight bonus for lock length.
- The budget is dynamic: `emission × share`, where share rises from 2 % toward 40 % as total active stake
  approaches 400 000 000 ANTS (`dynamicStakerConfigAt`). With today's stake that is 100 000 ANTS for
  epochs 22–23 and 100 100 for epoch 24; at 10 M staked it would be about 146 000.

In epochs 22–23 every pool's weight was 1 (starter grants only), so weighted points equalled sales and
**each seller's grant took its pool's whole share of sales**:

| Starter position | Pool | Staker reward, epoch 22 | Epoch 23 so far |
|---|---|---:|---:|
| #3 | Apex Ant | 21 807.6 | 32 742.6 |
| #11 | Vito-Minimax | 16 082.3 (indexed) | 0 |
| #5 | Auralis AI · Medical | 9 480.2 | 6 912.4 |
| #9 | Super Seeder | 8 751.0 → restaked as #31 | 3 102.1 |

**Why this matters to a holder.** From epoch 24 three pools carry ~98 % of all weight, so they take almost
the entire staker budget between them, split by their sales. A seller can restake its grant reward and its
seller reward into its own pool at any time: a position that holds 99.99 % of a pool today can hold a
fraction of it next epoch. The board shows **expected staker reward per 1 000 weight** for the next epoch.

## Reward budgets (epoch 22)

| Bucket | Size | Per-account cap |
|---|---:|---|
| Buyers | 250 650 ANTS | 5 % = 12 532.5 |
| Sellers | 250 650 ANTS | 5 % = 12 532.5 (nine sellers hit it in epoch 22) |
| Stakers | 100 000 ANTS | no per-account cap found |

- Claims have no deadline: the gate only requires the epoch to be finished and not earlier than
  activation.
- A wash-trading filter is registered as a points modifier; a seller whose proven wash volume reaches
  25 % of its history is zeroed.

## Routing trust score (AntSeed v0.2.41, 17.09)

The buyer node now ranks sellers by a trust score: **service history 60 · usage 15 · stake power 5 ·
identity 20**, zero if wash-flagged. Stake moves routing very little. Its real pull is the points
multiplier above: reward farmers follow weight.

## Referral rewards (AntSeed PR #1015 — open, not merged)

A foundation-funded contract would pay a referrer **2 %** of a referred buyer's ANTS usage rewards.
The buyer signs the binding, only before their first usage; referrer ≠ buyer and ≠ operator. If merged,
this is a fee-free way for community sites to be rewarded. How it pays out while ANTS transfers are
disabled is not yet clear to us.
