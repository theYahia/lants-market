# Market research — what already exists

## The reference: Vexy (veAERO market on Base)

Vexy is a live, specialized market for locked Aerodrome positions (veAERO NFTs). It is the closest
working analogue to what lANTS could become.

| Metric | Value | Source |
|---|---:|---|
| Sales in 7 days | 74 | vexy.fi, 17.09.2026 |
| Volume in 7 days | $199 529 | same |
| Average discount | 12.17 % | same |
| Cumulative volume | $14 M (fees $140 K all-time) | Vexy on X, Nov 2025 |
| Listings / offers ever created | 10 694 / 16 628 | on-chain counters |
| Fee | 1 % of every sale | contract |

**How they earn.** The 1 % fee goes to a Safe. Fees in AERO are locked back into veAERO, which votes
and earns Aerodrome rewards. On 17.09 the Safe held 78 veAERO positions (218 252 AERO locked),
368 006 AERO, and 10 558 USDC. No Vexy token was found.

### The engine

**Listings** (marketplace contract `0x6b47…6738`)
- Non-custodial: the seller approves, the NFT moves only at the moment of sale.
- Fixed price, or a price that decays along a cubic curve toward a floor — a Dutch auction.
- Cancel-all through a nonce per (seller, collection, token). Max duration 60 days.

**Offers** (offers contract `0x2903…69c4`) — the part worth learning from
- A buyer posts a budget and a **price per unit of locked token**, a lock-size range and a maximum lock.
- The price is computed **at the moment of sale** from what the NFT actually contains.
- Partial fills reduce the budget.

**Page layout.** 7-day metrics on top, a listings table (ID, discount, locked, price, lock), a sales
feed, a "discount vs lock size" chart, a portfolio with "sell now into the best offer".

### Licensing

Both contracts are source-visible but marked `UNLICENSED` / "Unlicenced". **We copy no code.** The
logic is small and documented, so anything we need is written from scratch.

### What changes for lANTS

1. **There is no ANTS price to discount from.** The price column becomes *USDC per locked ANTS* — and the
   first trade becomes the first market price ANTS has ever had.
2. **A wider lens.** Besides amount and lock, an lANTS offer should see the pool, max-lock and the
   pending staker reward.
3. **Stronger buyer protection.** Check the position at fill time, not at listing time.
4. **Decimals.** USDC has 6, ANTS has 18. One wrong assumption is a 10¹² error, so this needs its own test.

## What Seaport gives us for free

Seaport 1.6 is deployed on Base (`0x0000000000000068F116a894984e2DB1123eB395`).

| Need | Seaport answer |
|---|---|
| Fixed price | standard order |
| Dutch auction | `startAmount ≠ endAmount` — linear price change over time |
| Offer on any token of a set | `ERC721_WITH_CRITERIA` — but one price for every token, blind to contents |
| Check state at fill time | restricted orders through a `zone` contract |

So listings and auctions need no custom contract. Offers priced by contents do — that is phase 4.

## OpenSea

- The lANTS collection is indexed; item pages open.
- It does not show amount, lock or pool, so a buyer cannot price a position there. An AntSeed team
  member pointed this out in the community chat on 17.09.
- Listings are read through the OpenSea API v2, which needs a key. The key has to stay server-side.

## Community landscape

| Project | What it does | How we relate |
|---|---|---|
| [antseed-zh](https://antseed-zh.com) | Community dashboard: buyer/seller stats, catalog, ANTS tokenomics, per-address and per-pool rewards | We do not duplicate it; we link to it. Its author has said he will focus on data rather than a position market. |
| antscan.co | Explorer for settlements, offers, channels, emissions | Data source for seller names |
| OpenSea | General NFT market | The venue v1 builds on |

## Lessons carried into the plan

- A locked-position market can sustain real volume when the underlying asset is liquid. Here it is not,
  so v1 is a **valuation layer** over an existing venue, not a new venue.
- Offers priced by contents are the one mechanic no general NFT market has. It is the core of phase 4.
- Fees come later, if ever: with zero transfers today, a fee earns nothing.
