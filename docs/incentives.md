# Incentives — Votium for AntSeed

Live at [lants.eth.limo/#incentives](https://lants.eth.limo/#incentives) since 27.09.2026.

Stake in a seller pool works like a vote: it multiplies rewards for that seller's buyers. The Incentives tab lets
sellers pay stakers for that weight, the way protocols pay veCRV / veAERO voters on Votium and Aerodrome. Stake
offers are still plain JSON with the payer paying themselves; rebate offers (below) run through the platform's
shared claims contract.

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

**Trust model (stake offers, v1):** no escrow — the payer is named on every offer and pays themselves. We publish the payout
transaction for our own offer. Rebate offers no longer work this way: they are funded before the epoch and claimed by
buyers from the shared claims contract (below).

## Rebate offers

A rebate offer is a second type of entry in [`site/offers.json`](../site/offers.json). The seller (or a sponsor)
returns `pctBps / 100` % of buyers' spend in USDC, up to `capUsdc` in total, optionally capped per buyer and with a
minimum spend. Nobody sends money by hand: the campaign is funded before the epoch and buyers claim their share
from the platform's shared `RebateClaims` contract.

```json
{"type": "rebate", "pool": "52894", "epochs": [27], "pctBps": 300, "capUsdc": 10,
 "capPerBuyerUsdc": 2, "minSpendUsdc": 1, "stakeGate": {"minStakeAnts": 100},
 "payer": "0x...", "note": "..."}
```

| Field | Meaning |
|---|---|
| `type` | `rebate`; entries without `type` are stake offers |
| `pool` | seller pool (agent id) |
| `epochs` | one epoch, `[N]` |
| `pctBps` | rebate in basis points, integer 1…5000 (`300` = 3%) |
| `capUsdc` | total budget of the offer, USDC — deposited into the campaign before the epoch; ≤ 20 until an external audit ([D18](decisions.md)) |
| `capPerBuyerUsdc` | optional: the most one buyer can get, USDC |
| `minSpendUsdc` | optional: buyers who spent less get nothing, USDC |
| `stakeGate` | optional `{minStakeAnts}`: only buyers who held ≥ N ANTS (at max lock, `weight / 104`) in this pool for the whole epoch get the rebate (see below) |
| `payer` | the address that funds the campaign, shown on the offer |
| `note` | up to 140 characters |

**The cycle, end to end:**

1. **Before the epoch** the seller launches a campaign in the shared `RebateClaims` contract and funds it with the
   cap in USDC. The contract has no owner. Only the campaign owner (the seller's campaign wallet) can top the
   campaign up, finalize it, cancel it before the epoch, or withdraw the unclaimed part — the operator who
   deployed the contract has no power over the money.
2. The epoch runs.
3. **After the epoch** the payout is computed from chain data and published:
   `rebates/<epoch>-<pool>.json/.csv` with the reasoning, plus the merkle tree
   `rebates/<epoch>-<pool>.tree.json` and a version. 48 hours for objections; a correction is a new tree version,
   never an overwrite.
4. **The seller presses Finalize:** `setMerkleRoot` puts the published root on chain — their on-chain agreement
   with the list. The claim window opens (14 days). The contract reverts a finalize when the campaign is not
   funded for the whole tree.
5. **Buyers claim themselves:** "Claim $X" from the site, "Claim for address" for any wallet (gas paid by the
   sender, USDC always to the buyer), or the CLI for node keys. A second claim of the same index is impossible.
6. **After the claim window** the seller withdraws whatever is left (`Withdraw unclaimed`).

**Refusing to finalize:** a campaign that is not finalized in time can be fully withdrawn by the seller after the
finalize deadline. Before the epoch the seller can cancel and take the cap back. If the seller finalized a wrong
root, the site shows `root mismatch` and hides the claim — only the seller's own money is at stake.

**Formula.** All amounts in micro-USDC, rounded down:

```
r_i = min(spend_i × pctBps / 10000, capPerBuyer)
```

If `Σr > cap`: `p_i = r_i × cap / Σr`. The remainder is not distributed.

**Excluded, one reason per address:** the seller, the payer and the operators of both (read from
`AntseedDeposits.getOperator` on the epoch start block and the payout block); [`site/own-addresses.json`](../site/own-addresses.json)
— only when we are the payer; any other exclusion comes from the committed `rebates/<N>-<pool>.exclude.json`.

**Where the numbers come from.** Buyers: `UsagePointsAccrued` events, read with `eth_getLogs` in windows of 2,000
blocks. Each buyer's spend: the view `buyerAgentEpochUsage(epoch, buyer, agentId)` at block "first block of
epoch N+1 + 100". Check: `Σ spend = poolPointsByEpoch(N, seller)`; if the sum does not match, the calculation is
not published. Verified on Apex, epoch 23: 52 buyers, 558,971,119 micro-USDC, sum equal to the pool aggregate.

**Pools with weight only.** Purchases from a seller without a pool are not recorded on chain, so there is nothing to
rebate against.

**Claim tree and verification.** The tree follows the canonical Uniswap merkle-distributor convention: leaves are
sorted by address, `leaf = keccak256(abi.encodePacked(uint256 index, address account, uint256 amount))`, interior
nodes hash sorted pairs, an odd node is lifted unhashed. The claim core of the contract is byte-for-byte the
canonical Uniswap code. Anyone can rebuild the tree from the published CSV and compare the root with the on-chain
campaign root; the claim UI re-verifies every published proof locally (keccak) and refuses to show claims when the
on-chain root differs from the published tree.

**Payout command:**

```
node site/rebate-payout.mjs --epoch N --pool ID [--from B] [--to B] [--pin B] --offer file --out dir [--snapshot file|url]
```

writes JSON, CSV and the versioned tree; an existing file is not overwritten. Without `--from/--to/--pin` the epoch
blocks are derived from the epoch boundaries. A stake-gated offer needs `--snapshot` (the last published snapshot of
epoch N): positions are resolved with `ownerOf` at the epoch start block and at the payout block, a position moved
inside the epoch is disqualified, and the stake of an identity opens the gate for `k = floor(stake / minStakeAnts)`
buyers (the biggest spenders first). Payouts always go to the buyer's address on Base.

**On the site:** the Offer column shows the terms, e.g. "3% back, up to $10 · max $2/buyer". The calculator takes
"Spend with this seller (USD)" and shows "You get $Z back". The claim panel shows the campaign status
(`awaiting launch` → `funded $X of $Y` → `awaiting finalize` → `claims open · claim by <date>` → `sweepable`)
and the buttons.

### Stake-gated discount, honest terms

With `stakeGate: {minStakeAnts: N}` the rebate goes only to buyers whose stake "identity" held at least N ANTS at
max lock (`weight / 104`) in that seller's pool for the **whole epoch**:

- a position counts only if its owner on the first block of the epoch and on the payout block is the same, and no
  `Transfer` moved it inside the epoch. A position bought, sold or moved mid-epoch does not count; a position
  staked during the epoch counts from the next one;
- the identity is the operator of the buyer's deposit (`Deposits.getOperator`) when it is the same address on both
  blocks, otherwise the buyer itself — renting a shared operator mid-epoch does not carry its stake over;
- one identity can cover several buyers: `k = floor(stake / N)`. Buyers are ranked by spend (ties by lower
  address); the identity's stake opens the gate for the first `k` of them.

ANTS cannot be bought directly, but a lANTS position can be bought on this market — the gate is not "an empty
wallet gets nothing", it is "you must hold the stake for the whole epoch, and buying it mid-epoch does not work".
Payouts always go to the buyer's address, never to the operator.

### Wallets & keys (for sellers)

The seller's main wallet never has to sign a transaction of this site. A campaign runs from a dedicated **campaign
wallet**: a fresh embedded Privy wallet, a burner address, or a Safe. The only action of the `payer` address is
**one EIP-712 signature** authorizing the campaign wallet — not a transaction, no funds move. Before every
signature the site shows the contract address (re-checked against the pinned runtime code hash), the function, the
amount and the deadlines. Approvals are for the exact cap only and only to the pinned contract address, never
unlimited. The campaign owner can be transferred 2-step to a Safe before Finalize. Losing the campaign wallet key
does not block claims — claiming is permissionless — but unclaimed funds cannot be swept without the owner.
A buyer needs no wallet to receive: "Claim for address" lets anyone pay the gas.

## First offer

lants.eth pays 1 USDC per 1,000 ANTS staked in Open Forge (pool 44694) for epoch 25, new stakes only, up to 10 USDC.
Payout by 09.10.2026.
