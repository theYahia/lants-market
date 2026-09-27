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
