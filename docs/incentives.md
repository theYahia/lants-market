# Incentives — Votium for AntSeed

Live at [lants.eth.limo/#incentives](https://lants.eth.limo/#incentives) since 27.09.2026.

Stake in a seller pool works like a vote: it multiplies rewards for that seller's buyers. The Incentives tab lets
sellers pay stakers for that weight, the way protocols pay veCRV / veAERO voters on Votium and Aerodrome. There is no
contract in v1: offers are public JSON, payouts are computed from on-chain weight, and the payer pays.

## The board

Pools ranked by what each one paid its stakers in completed epochs since M001 (epoch 22):
`stakerEpochBudget(h) × weightedPoolPointsByEpoch(h, pool) / totalWeightedPoolPointsByEpoch(h)`, as the rewards
contract computes it. A new stake only counts from the next epoch, so history says more than this week's volume.
Tags: `new` — paid nothing in completed epochs; `thin` — under 100 ANTS staked next epoch (little trust from the
network yet). Per unit of weight, epochs 22–23 are not comparable: every pool held only its starter stake (weight ≈ 104).

Next to it, a what-if: what 1,000 ANTS at max lock (weight 104,000) would earn next epoch, after its own dilution.
Click any column header to sort.

For the current epoch `e` and the next epoch `N = e + 1`, per pool `p` (all sums over the pool's positions):

| Symbol | Meaning |
|---|---|
| `R_p` | staker reward of the pool in epoch `e` (`pendingStakerReward`) |
| `W_e,p`, `W_N,p` | pool weight in epochs `e` and `N` |
| `k_p = R_p / W_e,p` | ANTS per unit of weight — follows the pool's share of sales |
| `B` | the staker budget of epoch `N` as the rewards contract projects it now (`stakerEpochBudget(N)`: 101,600 ANTS for epoch 25); older snapshots use `Σ R_p` of epoch `e` |
| `S = Σ k_p · W_N,p` | the whole network's reward-weighted stake next epoch |

`est_p = B · v · k_p / (S + k_p · v)`, with `v = 104,000` for 1,000 ANTS at max lock.

**What it assumes:** each pool keeps its share of sales, and no one else changes their stake. The budget moves with
total active stake; one more stake barely changes it. Nearly empty pools with sales show very large numbers; the next staker there cuts them sharply.
"Staked" is shown in ANTS at max lock (`weight / 104`). Pool names come from
[antseedstats.com/sellers](https://antseedstats.com/sellers) (`site/pool-names.json`).

## Network line

Above the board, one line for the whole network:
`Network, epoch N: B ANTS to stakers · S ANTS staked · A per 1,000 on average`.

| Symbol | Meaning |
|---|---|
| `B` | `stakerEpochBudget(N)` |
| `S` | `Σ pool weight at N / 1e18 / 104`, the ANTS at max lock staked in all pools next epoch |
| `A` | `B / S × 1000`, what 1,000 ANTS at max lock earns next epoch in an average pool |

A pool above `A` pays more than the network average per unit of stake. A pool below `A` pays less.

## Seller details

The ▾ button in a row opens the seller's history from [antscan.co/api/sellers](https://antscan.co/api/sellers). It covers sellers with at least $100 earned in total.

- earned, all time
- average per week of activity: `earned / (lastSeen − firstSeen) × 604800`
- buyers, models, last sale

The same panel shows the pool's buyer cashback. It also shows the purchase amount at which one buyer reaches the cap for the epoch: `0.05 × buyerEpochBudget(e) / (ANTS per $1)`.

## Buyer ANTS per $1

The column "Buyer ANTS per $1, epoch e so far" is:
`floor(buyerEpochBudget(e) × poolWeightAtEpoch(pool, e) × 1e6 / totalWeightedBuyerPointsByEpoch(e))`.

This is how the protocol pays buyers:

- `AntseedUsageAccounting._recordUsage` multiplies both buyer and seller points by the pool's weight.
- If the pool weight is below `minimumAccountedPoolPower` (= 1), the purchase gives no points to either side.
- A buyer's reward is `buyerEpochBudget × buyer's weighted points / total weighted buyer points`.
- One account can get at most `MAX_REWARD_SHARE_BPS` = 500, or 5 % of the budget. For epoch 24 that was 12,530 ANTS.

The number falls during the epoch as sales add to the total. At the start of an epoch, while `T(e) < 5 % × T(e−1)`, the column shows the final value for `e − 1`.

- `<1`: the pool exists but its weight is very small.
- `0`: there is no pool.

Check: our buyer reward for epoch 23 was 3,487.06 ANTS, the same as this formula gives.

## Selling, but no pool

This block lists sellers with at least $1,000 earned who have no pool weight for the next epoch. Their sales earn no points for them or for their buyers.

Sellers with a sale in the last 14 days are listed first. The rest are in a collapsed list.

To get a pool:

1. Call `initPosition()` on AntseedPositionInit `0xB68AD13b681319fcEB6b0A640c2fd96C0138CBc8`.
   - It gives 1 ANTS, locked until epoch 126.
   - It requires a legacy seller stake of at least 10 USDC.
   - 63 grants were left as of 28.09.2026.
2. Stake the first seller reward into your own pool with `stakeAgentReward`.

The column shows an estimate of the seller reward per epoch once the pool is running:

```
weekly = earned × 604800 / max(active seconds, 604800)
w1     = (126 − N) × 1e18
r1     = sellerBudget × weekly × w1 / T
w2     = w1 + r1 × 104
X      = min(cap, sellerBudget × weekly × w2 / T)
```

Here `T` is the network's total weighted seller points and `cap` is 5 % of the seller budget.

**What it assumes:** sales stay at the seller's weekly average, `T` does not change, and the first reward is restaked at max lock. Example: CatGPT ≈ 12,037 ANTS per epoch.

## Offers

An offer is one entry in [`site/offers.json`](../site/offers.json):

```json
{"pool": "44694", "epochs": [25], "usdcPer1k": 1, "capAnts": 10000,
 "payer": "0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B", "pays": "new", "note": "..."}
```

| Field | Meaning |
|---|---|
| `pool` | seller pool (agent id) |
| `epochs` | epochs the offer pays for |
| `usdcPer1k` | USDC per 1,000 ANTS at max lock (`weight / 104`) |
| `capAnts` | the most ANTS the offer pays for; the budget is `capAnts / 1000 × usdcPer1k` |
| `payer` | the address that pays, shown on the offer |
| `pays` | `all` — every position in the pool, pro rata when over the cap (Votium, Aerodrome); `new` — only positions staked for that epoch (`stakeStartEpoch == N`), in the order they were created, until the cap is used |

**Payout:** USDC on Base to the position owner within 7 days after the epoch ends, from the last published snapshot of
that epoch. The site's calculator shows the same numbers before you stake.

**Post an offer:** the "Post an offer on GitHub" button opens an issue with the fields pre-filled; once checked, the
offer goes into `site/offers.json` and appears on the site.

**Trust model (v1):** no escrow — the payer is named on every offer and pays themselves. We publish the payout
transaction for our own offer. v2: an escrow contract with an audit.

## First offer

lants.eth pays 1 USDC per 1,000 ANTS staked in Open Forge (pool 44694) for epoch 25, new stakes only, up to 10 USDC.
Payout by 09.10.2026.
