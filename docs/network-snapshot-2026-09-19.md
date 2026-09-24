# Network snapshot — 19.09.2026, epoch 23

Delta to [`network-snapshot-2026-09-17.md`](network-snapshot-2026-09-17.md). Every number from a
command in [`scripts/probes/`](../scripts/probes/), re-run on 19.09.

**Epoch 23 ends Thursday 24.09 at 09:54:21 UTC — one day before the contest deadline.**

## Positions — `node scripts/probes/net-state.cjs`

| Metric | 17.09 | 19.09 |
|---|---:|---:|
| Positions minted | 31 | **38** |
| Distinct owners | 28 | **34** |
| ANTS locked | 28 601.08 | **33 272.31** |
| Positions > 1 ANTS | 5 | **7** |
| Transfers between wallets | 0 | **0** |

New large positions — **the first ones not on max lock**, which is what makes a discount column mean
anything:

| # | Owner | Pool | ANTS | Ends at epoch |
|---:|---|---|---:|---:|
| 36 | `0xc8bd…` | 54634 · Ant Army | 1 348.87 | **34** (11 epochs left) |
| 37 | `0x114E…` | 51642 · antseed-aggregator | 3 317.36 | **28** (5 epochs left) |

## Pool weight for epoch 24 — total 3 048 045

| Pool | Weight | Share |
|---|---:|---:|
| 52894 · Apex Ant | 1 047 997 | 34.4 % |
| 47218 · antseed-zh | 957 122 | 31.4 % |
| 53509 · Super Seeder | 955 717 | 31.4 % |
| 47214 · D5V1N2 | 57 697 | 1.9 % |
| 54634 · Ant Army / 51642 · aggregator | 13 591 / 13 371 | 0.4 % each |

## Recognized sales — epoch 23 in progress

`node scripts/probes/seller-rank.cjs 23` · **$848.55** across **18** sellers (day one was $116.88 / 14).
Leader: Apex Ant $183.82 (21.66 %), then Auralis Medical $120.21, Auralis Legal $91.52,
Super Seeder $84.02.

## Staker rewards — `node scripts/probes/staker-rewards.cjs`

Pending for epoch 22 across all positions: **69 528.1 ANTS**.

⚠️ Every large position (#27–#31, #36–#37) shows **0.0 for epoch 23**, while small starter grants show
real numbers (#26 Dark Signal 4 870.9, #25 GesundAI 2 377.5, #21 antseed-zh 1 446.9). Reason: a stake
made in epoch N counts from N+1, and these were minted in epoch 23. **A buyer of a position must see
when its rewards actually start** — that is a column, not a footnote.
