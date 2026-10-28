# Snapshot & Data

The positions table computes from a snapshot, not from a live read of the whole network. A GitHub Actions job refreshes it three times a day (06, 14 and 22 UTC); the line under the table reads `Snapshot: block ..., epoch ..., taken ...`.

Pool weights are read with `poolWeightAtEpoch(agentId, epoch)` for every pool with non-zero sales.

**Known defect, fixed.** Before 2026-09-21, weights were collected only for the 32 pools that hold our own positions, so the reward denominator was understated. The ratio of the full denominator to the partial one was 1.1179. As a result the site showed #27 at 43,022 instead of 38,486 — 11.8% too high. The defect was found and corrected, and the snapshot was rebuilt.

**Sources.** Pool sales come from the public API `antscan.co/api/sellers`, a third-party community site, not an on-chain source. Everything else is read directly from Base.

**Cross-check.** Every snapshot number is read on two independent RPCs (`base-rpc.publicnode.com` and `base-mainnet.public.blastapi.io`) at the same block and compared. If they disagree, the snapshot is not published.

**Live reads.** Listings, sales, My Portfolio and the MC / FDV figures do not come from the snapshot: your browser reads them directly from Base through public RPC endpoints.

## Price measures

The header shows separate measures, each computed from its own inputs, not one
"reconciled" number:

| Measure | What it is | Origin |
|---|---|---|
| Avg Price (24H) | Average executed sale price over 24h | market feed |
| Implied MC | Avg price (24H) x ANTS minted, read live from the token | token + feed |
| Implied FDV | Avg price (24H) x max supply (1.04B), read live from the token | token + feed |
| Floor Ask/ANTS | Lowest live ask per ANTS | all listings |
| Listed/Supply | Live listings vs live lANTS positions (on-chain NFTs) | feed + chain |

The network's announcement cites $0.094/ANTS as the **average lANTS sale price
at post time**, not a floor and not an implied price. Implied MC/FDV use the
feed's 24h average sale price; the ask-derived tiles (Floor Ask, Listed/Supply)
show an em dash when no live asks are available.

Implied MC and FDV are priced through **lANTS (locked positions)**, not liquid
ANTS: locked positions trade at a discount (lock-up + slash risk), and ANTS has
no liquid DEX market, so the locked-position sale price is the only market
signal. MC uses ANTS minted (`totalSupply`), not circulating supply — the
standard simplification for a staking token without a separate liquid market.

Aggregated lots come from the ecosystem front's public feed. A feed outage
hides those lots and their asks; our own listings keep rendering.

**Privacy.** The page has no backend and does not collect user data. Transactions go through your wallet; reads go through public RPC endpoints.

---