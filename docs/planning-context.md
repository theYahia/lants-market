# Planning context — lants.eth.limo (28.10.2026)

Consolidated input for the next planning session. Pulls together the session handoff,
the Seaport recon, and the strategy discussion around antseedpoints.com, the AntSeed
network posts, and how we become the canonical lANTS surface.

Pointers to the detailed files (do not duplicate them here):

- `notes/handoff.md` — addresses, deploy/CI, tests, agreed work direction.
- `docs/seaport-recon.md` — competitor order source: endpoints, order format, clean
  aggregation path.
- `docs/decisions.md` — D0…D18 decision log.
- `docs/market-research.md` — Vexy teardown and the OpenSea/Seaport groundwork.

## 1. Current state

- Header (6 tiles: Implied Price/ANTS, 24H Volume, Implied MC, Implied FDV,
  Listed/Supply, Floor Ask/ANTS) ships from live external asks (VWAP), `MAX_SUPPLY`
  read live, sold-lot prices from `BuyListing` logs. Tiles show «—»: 0 live listings
  of our own.
- Default «All positions» view is still a raw ~235-row table — the card-storefront
  rework is the next UX step.
- `npm test` 119/120 (one pre-existing rebate-deploy failure needs `forge build`),
  `npm run build` OK.
- Deploy is CI-only (`.github/workflows/snapshot.yml`), manual trigger 2 clicks.
- Community/business state: owner runs a TG group with 2 interested providers; a
  "bribes" announcement to providers is already out. Incentives/bribes + `RebateClaims`
  (escrow v2) are built (D15, D16, D18) and the first rebate campaign was funded 15.10.
  The first incentive offer (Open Forge, epoch 25) settled to $0 — the flywheel still
  needs a real third-party offer to prove itself.
- Timing: stop-rule check 05.11 (ROADMAP) gates the phase-4 market layer. This plan is
  the valuation + aggregation layer, not the phase-4 order book; the storefront and
  deep-page work are independent of that gate.

## 2. Recon result (already answered)

**Yes — the competitor exposes active orders via a same-origin, CORS-open REST API.**

- `GET /api/lants-market?page=1&pageSize=24&sort=listedFirst` — normalized feed
  (15 active of 483 positions, with `perAntUsd`, `mcUsd`, `fdvUsd`, seller name).
- `GET /api/lants/order/{tokenId}` — full Seaport order (parameters + signature +
  `protocolAddress`), executable directly.
- Orders are fully-open (`orderType 0`, `zone 0`, `conduitKey 0`): 0% platform fee,
  fulfill on-chain via canonical Seaport 1.6 (`0x0000000000000068F116a894984e2DB1123eB395`)
  with `fulfillBasicOrder`/`fulfillOrder` — no competitor backend involved.
- `Access-Control-Allow-Origin: *` → callable straight from our frontend, no proxy/key.

Conclusion: aggregation is **clean** — read their feed, execute their orders at the
same 0%, show our own 1%-seller lots as a clearly-marked separate offer.

## 3. The network's economic model (from the Antseed Points announcement)

This is the flywheel the network itself describes, and it makes lANTS trading a
first-class step, not a side feature:

```
spend on AI → points (× provider boost)
  → buyer-reward ANTS (claim Thursday, 5% cap per buyer)
    → stake ANTS behind a provider → lANTS NFT
      → hold & collect / list for sale / buy a position   ← our market
        → boost rises → more points for everyone
```

Exact parameters to encode in our APR/estimate math:

| Parameter | Value |
|---|---|
| Epoch | 1 week, closes Thursday |
| Buyer reward pool | qualifying paid usage that week; shared by points |
| Buyer cap | 5% of the pool per buyer |
| Provider reward pool | separate, 5% cap per provider |
| Boost | f(amount of ANTS staked behind provider, lock duration); 0× = no points |
| Points | only from qualifying **paid** usage (free models earn nothing) |
| Staking rewards | separate from the 5% buyer cap |
| Emission | total ANTS released per week halves roughly every 2 years |
| Early withdraw | 5–50% burned |
| ANTS as payment | planned, not live |

Key facts for valuation:

- A lANTS position is literally "staked ANTS + lock". The holder earns only the staking
  reward; boost raises the provider's buyer points, not the holder's ANTS. Show the two
  as separate pieces: APR / «≈X ANTS/epoch» from the staking reward only, and a boost
  badge showing the position's share of the provider's next-epoch weight. Never fold
  boost into the yield.
- The announcement prices ANTS off lANTS sales: *"based on avg lANTS sales,
  14,100 ANTS = ~$1,327 on $0.094/ANTS."* This is the implied price we already
  compute in the header. Reconcile our live floor/avg against $0.094 publicly → we
  become the canonical source of that number.
- Market snapshot (28.10, from the competitor API): 15 listed of 483 positions, 0
  offers, floor ask $0.140, 24h avg $0.101931, `currentEpoch` 28, `antsTotalSupply`
  ≈129.9M. **Three different measures, not one price:** floor ask (lowest live ask per
  ANTS), 24h average sale, and implied price (size-weighted VWAP of live asks, ours
  plus Seaport). The network's $0.094/ANTS is its average lANTS-sales figure at post
  time, not a reconciled floor or implied price; the site labels each measure by its
  source.

## 4. Competitive landscape

| Surface | Layer | Notes |
|---|---|---|
| antseedmarkets.com | execution | Seaport 0%, TG alerter (17 subs) |
| antseedpoints.com | earnings | buyer points → weekly ANTS rewards, boost comparison |
| antscan.co | data | explorer, settlements, seller names |
| antseed-zh.com | data | catalog, tokenomics, stats |
| **lants.eth.limo** | **decision + monetization** | valuation, own market (1%), bribes/incentives |

The competitor also has a distribution channel: a TG alerter that pings new
listings/sales (17 subscribers). So "audience/relationships" is **contested**, not our
moat. We do not build a competing alerter — it is a "what happened" feed (top-of-funnel);
we win the "what to do" step (bottom-of-funnel) with a richer position page, and its
growth feeds the Seaport liquidity we aggregate anyway.

## 5. Strategic conclusions (the reframing)

1. **There is no winner-take-all marketplace here by design.** The founder's network
   post says open markets must let providers, gateways, and applications share, with no
   single company controlling access. Multiple frontends is the design, not a bug.
   Abandoning the project "to avoid a second marketplace" is fighting the network's own
   thesis.
2. **The goal is not "beat the competitor" but "become the canonical front the network
   points to."** That is won on trust + usefulness + openness, not price or audience
   theft.
3. **The moat is the trust/decision layer, not price.** The founder defines trust as:
   lock ANTS to back providers + qualifying paid activity + public payment history and
   staking support. The official Seaport front shows a bare order; we can show the
   portable trust record (payments, staking support, boost, model-verification status)
   next to the price. That is "better than the official front on the founder's own
   terms."
4. **Undercutting is a demo, not a strategy.** Tiny inventory (13 payer positions),
   it reprices the whole asset down, and a price race is unwinnable against a 0% front.
   Use 2–3 competitive lots as a live-store demo only.
5. **Anti-fake-metrics is enforced by the network.** The founder explicitly calls out
   wash trading and recycled money; AntSeedStats publishes wash-trading proofs. Inflated
   volume/FDV will be audited and discredited. Our honest, verifiable numbers (implied
   price from real asks, Merkle payouts verifiable to micro-USDC) are the winning
   position — the AskVenice pattern: publish the rule + the public record, let people
   verify.
6. **The bribes/incentives layer is the monetized moat** (nobody else monetizes weight),
   and its proof should follow the AskVenice template: public rules + verifiable payout
   trees on the page.

## 6. Agreed direction & prioritized next steps

1. **Card storefront for «All positions»** — provider name + link, lock days + unlock
   date, APR% + «≈X ANTS/epoch» (staking reward only; boost is a separate badge, per §3),
   price + price/ANTS, Buy + Make offer, status badge, sort, Grid/List, Share.
2. **Deep position page `#position/{id}`** — the canonical destination for external
   links (TG alerter, chat): price, APR, boost, implied MC/FDV, owner, history,
   Buy/Make offer. Richer than the competitor's bare order page.
3. **Reconcile the header with $0.094/ANTS** — publicly show how avg lANTS sales
   produce the price the network itself cites.
4. **Seaport aggregation** — render `GET /api/lants-market`, execute via
   `GET /api/lants/order/{id}` + Seaport `fulfillBasicOrder`. No on-chain fallback for
   discovery: orders are signed off-chain; the chain only verifies an order.
5. **Bribe/incentive proof page** — public payout rules + verifiable tree (AskVenice
   template), the durable monetized moat.

Open questions for planning (do not decide here):

- Scope boundary for the first sprint: storefront + deep page (highest leverage) vs.
  also wiring Seaport execution.
- How to present our 1%-seller lots alongside 0% aggregated orders without a confusing
  fee comparison.
- Whether the feed (`/api/lants-market`) is a hard dependency: there is no on-chain
  fallback for discovery, so a feed outage hides Seaport lots.
