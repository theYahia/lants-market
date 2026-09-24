# Snapshot & Data

The site computes from a snapshot, not from a live read of the whole network.

Latest snapshot: block 51613321, epoch 23, taken 2026-09-21T18:42:00.253Z. The line under the table reads `Snapshot: block ..., epoch ..., taken ...`.

The snapshot contains 50 positions, sales across 199 pools, and weights across 199 pools. Pool weights are read with `poolWeightAtEpoch(agentId, epoch)` for every pool with non-zero sales — 199 sequential calls through `base-rpc.publicnode.com`.

**Known defect, fixed.** Before 2026-09-21, weights were collected only for the 32 pools that hold our own positions, so the reward denominator was understated. The ratio of the full denominator to the partial one was 1.1179. As a result the site showed #27 at 43,022 instead of 38,486 — 11.8% too high. The defect was found and corrected, and the snapshot was rebuilt.

**Sources.** Pool sales come from the public API `antscan.co/api/sellers`, a third-party community site, not an on-chain source. Everything else is read directly from Base.

**Cross-check.** Positions are read from two independent RPCs (`base-rpc.publicnode.com` and `base.drpc.org`) and compared. If they disagree, the build fails.

**Privacy.** The page has no backend and does not collect user data. The wallet connects in the browser, and network requests go through the wallet's provider.

---