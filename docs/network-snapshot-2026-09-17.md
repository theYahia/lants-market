# Network snapshot — 17.09.2026 15:32 UTC, epoch 23

Every number below came from a command in [`scripts/probes/`](../scripts/probes/) or a public API.
Pool weights were read on two RPCs (publicnode and drpc) and matched.

## Positions

`node scripts/probes/net-state.cjs`

| Metric | Value |
|---|---:|
| Positions minted | **31** |
| Distinct owners | 28 |
| ANTS locked in all positions | 28 601.08 |
| Positions larger than 1 ANTS | **5** |
| Starter grants (1 ANTS each) | 26 |
| Transfers between wallets | **0** (Blockscout, `/api/v2/tokens/<lANTS>/transfers`) |

| # | Owner | Pool | ANTS | Ends at epoch |
|---:|---|---|---:|---:|
| 27 | `0x3d4C…` (us) | 52894 · Apex Ant | 10 075.91 | 128 · max-lock on since 17.09 evening |
| 28 | `0x8524…` | 47218 · antseed-zh | 9 202.11 | 128 |
| 29 | `0xD5E7…` (D5V1N2, own pool) | 47214 · D5V1N2 | 155.71 | 128 |
| 30 | `0xD5E7…` (D5V1N2, own pool) | 47214 · D5V1N2 | 390.30 | 128 |
| 31 | `0xd19f…` | 53509 · Super Seeder | 8 751.04 | 128 |

Minted today: #27 at 10:22 UTC, #28 at 11:32, #29–#30 at 13:15, #31 at 15:10. Every large position locks for the full 104 epochs.

## Pool weight for epoch 24

| Pool | Weight | Share |
|---|---:|---:|
| 52894 · Apex Ant | 1 047 997 | **34.7 %** |
| 47218 · antseed-zh | 957 122 | 31.7 % |
| 53509 · Super Seeder | 955 717 | 31.6 % |
| 47214 · D5V1N2 | 57 697 | 1.9 % |
| every other pool | ≤ 104 each | ~0 % |
| **Total** | 3 020 777 | |

At 13:44 UTC our pool held 50.7 % of this weight; at 10:22, before anyone else staked, 99.99 %.

## Recognized sales — epoch 22 (finished)

`node scripts/probes/seller-rank.cjs 22` · total **$2 737.60** across **16** sellers

| # | Seller | Sales | Share | Seller reward, ANTS |
|---:|---|---:|---:|---:|
| 1 | Apex Ant | $597.00 | 21.8 % | 12 532.5 (cap) |
| 2 | Vito-Minimax | $440.27 | 16.1 % | 12 532.5 (cap) |
| 3 | Auralis AI · Medical | $259.53 | 9.5 % | 12 532.5 (cap) |
| 4 | Super Seeder | $239.57 | 8.8 % | 12 532.5 (cap) |
| 5 | Auralis AI · Legal | $204.64 | 7.5 % | 12 532.5 (cap) |
| 6 | Venice.ai Proxy | $200.85 | 7.3 % | 12 532.5 (cap) |
| 7 | Open Forge | $198.80 | 7.3 % | 12 532.5 (cap) |
| 8 | Phala | $194.80 | 7.1 % | 12 532.5 (cap) |
| 9 | zro | $181.83 | 6.6 % | 12 532.5 (cap) |
| 10 | Edith AI | $135.37 | 4.9 % | 12 393.8 |

Our own purchases were $110.05 of Apex Ant's $597. Our buyer reward for epoch 22: 10 137.36 ANTS
(4.04 % of the buyer budget).

## Recognized sales — epoch 23 (day one)

`node scripts/probes/seller-rank.cjs 23` · $116.88 across 14 sellers so far. Leader: Apex Ant, $43.10 (36.9 %).

## All-time context (antscan.co)

| Metric | Leader | Apex Ant |
|---|---|---|
| Revenue, all time | CatGPT, $48 597 | #19 of 267, $2 524 |
| Unique buyers, all time | Dark Signal, 222 | #5, 141 |

The two all-time revenue leaders (CatGPT, Flash) have no recognized sales in epochs 22–23. We have
not checked why.

## ENS

| Name | Available | Rent per year |
|---|---|---:|
| `lants.eth` | yes | 0.002035 ETH (≈ $5 at ETH $2 457) |
| `lantsmarket.eth` | yes | same |
| `anthill.eth`, `pheromone.eth` | taken | — |

Read from the ENS registrar and controller on Ethereum mainnet; L1 gas was 0.44 gwei at the time.
