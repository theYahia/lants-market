# Build in public — lants-market roadmap

A public board and USDC market for locked ANTS (lANTS) positions on Base. Everything here is dated
and honest: what shipped, what didn't, and what's next.

Built the AntSeed way: planned once with a strong model, then coded by **free models served on
AntSeed itself**, with a human accepting every stage by command — never by the model's own report.
This roadmap, the build log, and what breaks are all public.

**The question this iteration answers:** by **22 October 2026**, will lANTS have its first market
price and its first seller paying for pool weight?

| | Baseline (17.09) | Target (22.10) |
|---|---:|---:|
| lANTS transfers between wallets | 0 | ≥ 1 |
| Listings not made by us | not measured | ≥ 1 |
| Seller perks on the board | 0 | ≥ 1 |

**Stop rule.** If both are still zero on **5 November 2026**, the board keeps running as is, and the
market layer (phase 4) does not start.

---

## Timeline

| Date | What | Phase | Status |
|---|---|---|---|
| 09.09 | Research sprint: locked-position markets, Vexy as the reference | 0 | ✅ |
| 17.09 | First stake (#27, max-lock on), Vexy teardown, name and hosting, execution plan | 0 | ✅ |
| 20.09 | Market contract deployed on Base (USDC-only listings) | 2 | ✅ |
| 23.09 | Site live at `lants.eth` (IPFS + ENS); auto snapshot 3×/day; AntSeed contest entry on X | 2 · build in public | ✅ |
| 24.09 | Repo made public; contract source verified on Basescan and Blockscout | 3 | ✅ |
| this week | Listing on antseed.com/ecosystem | 3 | 🔜 |
| 01.10 | First staker reward for #27 · weekly recap #1 with the real number | build in public | 🔜 |
| 02.10 | Launch announcement on X and in the AntSeed chat | 3 | 🔜 |
| every Thu | Epoch recap (08.10, 15.10, …) | build in public | 🔜 |
| 22.10 | Signal check · decide on the money model and phase 4 | 3 | 🔜 |
| 05.11 | Stop rule check | 3 | 🔜 |

---

## What lANTS-market is

- **The board** — every lANTS position (amount, lock, pool, weight, exit penalty, pending reward),
  led by expected staker reward per unit of weight next epoch.
- **The USDC market** — list a position, buy it through the contract, priced as **USDC per locked
  ANTS**. Contract: VexyMarketplace fork, `0xC5BFc309a68dBf4e7eEca9BD91749d611c75C660` on Base,
  source-verified on Basescan and Blockscout.
- **Docs page** and wallet connect via Privy.
- **Hosting** — static site on IPFS, addressed by `lants.eth` (via ENS). Content is served through
  IPNS on Filebase, so updates need no gas. Live at https://lants.eth.limo since 23.09.
- **Fresh data** — a snapshot refreshes automatically 3× a day (GitHub Actions, since 23.09).

---

## Public task list

Plain tasks, due dates, status. No keys, no internal tooling.

| Task | Due | Status |
|---|---|---|
| Deploy market contract on Base (USDC listings) | 20.09 | ✅ done |
| Register `lants.eth` and go live on IPFS + ENS | 23.09 | ✅ done |
| Automatic snapshot 3×/day | 23.09 | ✅ done |
| Make repo public + verify contract on Basescan and Blockscout | 24.09 | ✅ done |
| Seller perks board | — | open |
| List on antseed.com/ecosystem | this week | open |
| First staker reward for #27 + weekly recap #1 | 01.10 | open |
| Stake our epoch-23 buyer reward (3,487 ANTS) into the pool with the best reward per weight, measured at the end of epoch 24 | 01.10 | open |
| Launch announcement on X and in the AntSeed chat | 02.10 | open |
| Weekly epoch recaps on X | every Thu | open |
| Signal check + money-model decision; stop rule check on 05.11 | 22.10 | open |

---

## Phases

### Phase 0 — Research and first stake ✅ (09.09 → 17.09)

- [x] Research sprint on locked-position markets (Vexy as the reference) — 09.09
- [x] Stake our epoch-22 buyer reward: position **#27**, max-lock on — 17.09
- [x] Vexy teardown (docs, contracts, business model); the market contract became a USDC-only fork of VexyMarketplace
- [x] Name `lants-market`, site `lants.eth`; execution plan written — 17.09

### Phase 1 — The board

- [x] A lens that reads every position and pool, cross-checked on two RPCs before anything is written
- [x] Positions page: metric tiles, positions table, pools table led by expected reward per weight
- [ ] **Seller perks board** — a schema-checked list plus instructions for sellers to add their perks

### Phase 2 — Publish ✅ (20.09 → 23.09)

- [x] Market contract deployed on Base (USDC-only listings) — 20.09
- [x] Register `lants.eth`; static build pinned to IPFS with contenthash on `lants.eth` — 23.09
- [x] Listing prices shown as **USDC per locked ANTS**, with explicit decimals (USDC 6, ANTS 18)

### Phase 3 — Launch and listen (24.09 → 22.10)

- [x] Repo public; contract source verified on Basescan and Blockscout — 24.09
- [ ] Listed on antseed.com/ecosystem — this week
- [ ] First staker reward for #27 + weekly recap #1 — 01.10
- [ ] Launch announcement on X and in the AntSeed chat — 02.10
- [ ] Weekly recaps + seller conversations about perks — every Thursday
- [ ] Signal check and money decision — 22.10 · stop rule check — 05.11

### Phase 4 — Market layer 🔒 (after 22.10, only if phase 3 passes)

Every item below touches other people's assets, so each one gets its own review.

- [ ] Our own order book (fixed price and Dutch auction)
- [ ] **Offers priced per locked ANTS**, filtered by size, lock and pool — the mechanic no general
  NFT market has
- [ ] Buyer protection: the position is checked at fill time, so a seller can't drain rewards or
  split the position between listing and sale
- [ ] A fee, only once there is volume
- [ ] Explore a pool-weight hub (pooled positions, holder voting on weight). Needs an audit first.

---

## Build in public on X

Every post carries real numbers. No price predictions for ANTS.

| When | Post |
|---|---|
| 23.09 | AntSeed contest entry — [x.com/TheTieTieTies/status/2102802534259916926](https://x.com/TheTieTieTies/status/2102802534259916926) |
| Every Thursday after the epoch boundary | Epoch recap — positions, ANTS staked, weight by pool, reward per weight, our own rewards |
| After each stage | Stage done — what was built, which free model built it, what the human caught at acceptance |
| 01.10 | First staker reward for #27 — the real number vs our estimate |
| 02.10 | Launch — what `lants.eth` shows, an invitation for sellers to list perks |

---

## How this could make money

Most concrete first. Nothing here is decided before 22.10.

| Source | How | Today |
|---|---|---|
| Our own staking | #27 plus weekly restakes and buyer rewards compound in ANTS | first staker reward after 01.10 |
| Seller perks | perks for our pool weight turn into discounts or quota | 0 perks |
| Being the first buyer | with no market yet, whoever buys first sets the discount | 0 transfers |
| Market fee | a small USDC fee on our own order book | phase 4, with volume |
| Audience | the X account and the board become a channel for the next project | building |

---

## Signals we watch

| Signal | Why it matters |
|---|---|
| ≥ 5 lANTS transfers between wallets | a market started without us |
| Large new stakes | more positions to value, weight gets split |
| Sellers restaking into their own pools | dilutes outside holders in that pool |
| ANTS transfers enabled | lANTS stops being the only exposure; value of this layer drops |
| Foundation reserve staked into pools | staker yields dilute |

---

## Build log

**24.09.2026** — Repo made public (ahead of the planned 02.10). Contract source verified on
Basescan and Blockscout the same day.

**23.09.2026** — Site live at `lants.eth` (IPFS + ENS, IPNS via Filebase, gas-free updates).
Automatic snapshot 3×/day turned on. AntSeed contest entry posted on X.

**20.09.2026** — Market contract deployed on Base: USDC-only listings, priced per locked ANTS.

**17.09.2026** — Staked our epoch-22 buyer reward as position #27 (max-lock on). Within five hours
three large positions appeared and our epoch-24 pool-weight share fell 99.99 % → 34.7 %. Lesson: one
wallet's weight is temporary; buyer rewards can be staked every epoch and holders already do it.
This drove the "reward per weight" column on the board.

**09.09.2026** — Research verdict: a locked-position market works, but at the time there were no
transfers. Decision: watch the signals. Two signals (positions and staked amount) later moved, which
is why this repo exists.

---

## Metrics

| Metric | Source | Baseline 17.09 |
|---|---|---:|
| lANTS transfers between wallets | Blockscout token transfers | 0 |
| Positions > 1 ANTS | on-chain snapshot | 5 |
| Listings not by us | market data | not measured |
| Seller perks | perks list | 0 |
| X followers / impressions | X analytics | — |
| Paid planning sessions | this log | 1 |
