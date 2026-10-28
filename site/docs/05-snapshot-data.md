# Snapshot & Data

The positions table computes from a snapshot, not from a live read of the whole network. A GitHub Actions job refreshes it three times a day (06, 14 and 22 UTC); the line under the table reads `Snapshot: block ..., epoch ..., taken ...`.

Pool weights are read with `poolWeightAtEpoch(agentId, epoch)` for every pool with non-zero sales.

**Known defect, fixed.** Before 2026-09-21, weights were collected only for the 32 pools that hold our own positions, so the reward denominator was understated. The ratio of the full denominator to the partial one was 1.1179. As a result the site showed #27 at 43,022 instead of 38,486 — 11.8% too high. The defect was found and corrected, and the snapshot was rebuilt.

**Sources.** Pool sales come from the public API `antscan.co/api/sellers`, a third-party community site, not an on-chain source. Everything else is read directly from Base.

**Cross-check.** Every snapshot number is read on two independent RPCs (`base-rpc.publicnode.com` and `base-mainnet.public.blastapi.io`) at the same block and compared. If they disagree, the snapshot is not published.

**Live reads.** Listings, sales, My Portfolio and the MC / FDV figures do not come from the snapshot: your browser reads them directly from Base through public RPC endpoints.

## Price sources

The header shows separate measures, each labelled by its source, not one
"reconciled" number:

| Measure | What it is | Source |
|---|---|---|
| Implied Price/ANTS | Size-weighted VWAP of live asks per ANTS | lANTS lots here + Seaport feed |
| Floor Ask/ANTS | Lowest live ask per ANTS | lANTS lots here + Seaport feed |
| 24h avg sale | Average executed sale price over 24h (second line under 24H Volume) | Seaport feed (antseedmarkets.com) |

The network's announcement cites $0.094/ANTS as the **average lANTS sale price
at post time**, not a floor and not an implied price. When no live asks are
available the ask-derived tiles show an em dash; the 24h average is whatever
the feed reports, or nothing when the feed is unavailable.

Seaport lots come from the ecosystem front's public feed. A feed outage hides
those lots and their asks; our own listings keep rendering.

**Privacy.** The page has no backend and does not collect user data. Transactions go through your wallet; reads go through public RPC endpoints.

---