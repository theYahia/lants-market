# Build in public — lants-market roadmap

A public board and USDC market for locked ANTS (lANTS) positions on Base. Everything here is dated
and honest: what shipped, what didn't, and what's next.

Built the AntSeed way: planned and reviewed by `claude-opus-4.8` on AntSeed, coded mostly by **free and
cheap models served on AntSeed itself**, with a human accepting every stage by command — never by the
model's own report. AntSeed inference up to 25.09: $17.58. This roadmap, the build log, and what breaks
are all public.

**The question this iteration answers:** by **22 October 2026**, will lANTS have its first market
price and its first seller paying for pool weight?

| | Baseline (17.09) | Target (22.10) |
|---|---:|---:|
| lANTS transfers between wallets | 0 | ≥ 1 |
| Listings not made by us | not measured | ≥ 1 |
| Seller incentive offers on the board | 0 | ≥ 1 |

*Note (25.09): "lANTS transfers between wallets" is no longer 0 on-chain — antseedmarkets.com (a community Seaport marketplace) shows 4 lANTS trades on 20–24.09 (positions #46 and #49 between two wallets) plus an open lot #106 (100 ANTS for $300). None of these are on our market; our own first trade followed on 25.09 (internal test, not counted in volume).*

*Note (27.09): the Incentives tab is live with one offer — ours, as a sponsor (Open Forge, epoch 25). The target counts offers from sellers themselves; that is still 0.*

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
| 25.09 | Full trade flow through the site (create · buy · cancel · manage position); 8-column listings grid with on-chain fallback; snapshot cross-checked on two RPCs with a freshness gate; portfolio and positions fixes; e2e fork test (injected + Privy) and 19-check QA sweep both pass | 3 | ✅ |
| 25.09 | First trade on our market, every step through the site: stake buyer reward → #110, split → #111 + #112, max-lock #111, list #112 for 1.00 USDC, buy from our second wallet ([tx](https://basescan.org/tx/0x33ed01b75166aa1c17388fc92bd1bbbd9e2bcd17cff68b139fa4ce227a8fc610)); marked internal, not in volume | 3 | ✅ |
| 25.09 | Sales panel reads sold lots from the chain; My Positions shows positions newer than the snapshot and refreshes after a transaction (two bugs found by replaying the trade on a Base fork) | 3 | ✅ |
| 26.09 | First public lots: five positions of 10 ANTS at 0.10 USDC each | 3 | ✅ |
| 26.09 | Implied MC / FDV on every lot and sale (feedback from the AntSeed chat); lots load in parallel (~1 s); clearer manage flow: next-step hints, plain-word errors, Split/Move disabled on max-locked positions | 3 | ✅ |
| 27.09 | Claim and Restake buttons for staker rewards; portfolio polish (empty states, Staker Rewards tile, Est. reward column, snapshot caption) | 3 | ✅ |
| 27.09 | Listed on antseed.com/ecosystem ([PR #1065](https://github.com/AntSeed/antseed/pull/1065)) | 3 | ✅ |
| 27.09 | Incentives tab (Votium for AntSeed): pools ranked by what they paid stakers in completed epochs, seller names, sortable columns, USDC offers with a payout rule, calculator; an address for every view ([docs](docs/incentives.md)) | 3 | ✅ |
| 01.10 | First staker reward for #27 · weekly recap #1 with the real number | build in public | 🔜 |
| 02.10 | Launch announcement on X and in the AntSeed chat | 3 | 🔜 |
| every Thu | Epoch recap (08.10, 15.10, …) | build in public | 🔜 |
| 22.10 | Signal check · decide on the money model and phase 4 | 3 | 🔜 |
| 05.11 | Stop rule check | 3 | 🔜 |

---

## What lANTS-market is

- **The board** — every lANTS position: amount, lock (max-lock marked), staker reward for the current
  epoch and what an early exit returns; sortable by reward.
- **The USDC market** — list a position, buy it through the contract, priced as **USDC per locked
  ANTS**. Contract: VexyMarketplace fork, `0xC5BFc309a68dBf4e7eEca9BD91749d611c75C660` on Base,
  source-verified on Basescan and Blockscout.
- **Docs page** and wallet connect via Privy.
- **Portfolio** — your positions with List / Manage buttons, and your listings; manage actions (stake a
  buyer reward, split, move, max-lock), Claim / Restake for staker rewards, and a Sales panel with each
  sale's implied FDV.
- **Incentives** — every seller pool ranked by what it paid its stakers in completed epochs (new and thin
  pools tagged), with what 1,000 ANTS at max lock would earn next epoch as a what-if; sellers' USDC offers for weight in their pool, paid by the named payer after the epoch;
  a calculator for your own amount. How it works: [docs/incentives.md](docs/incentives.md).
- **Hosting** — static site on IPFS, addressed by `lants.eth` (via ENS). Since 25.09 `lants.eth` points at
  each release's CID directly (one ENS transaction per release; IPNS caching lagged for hours). Live at
  https://lants.eth.limo since 23.09.
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
| Full trade flow through the site (create · buy · cancel · manage position) + e2e fork test and 19-check QA sweep | 25.09 | ✅ done |
| Seller incentives board v1 — an Incentives tab on lants.eth (the Votium / Hidden Hand model for AntSeed): sellers post "X per 1,000 ANTS of weight in my pool for epoch N", paid in USDC or in their own inference credits; stakers stake there with one click; the site computes payouts from on-chain weight and sellers pay; stop if no seller posts an offer within 2 epochs. v2 later: escrow contract, audit, 2-5% fee | 27.09 | ✅ v1 live |
| Pay the first incentive offer: new stakes in Open Forge for epoch 25, 1 USDC per 1,000 ANTS, up to 10 USDC | 09.10 | open |
| List on antseed.com/ecosystem ([PR #1065](https://github.com/AntSeed/antseed/pull/1065)) | 27.09 | ✅ done |
| First staker reward for #27 + weekly recap #1 | 01.10 | open |
| Fund the second (buyer) wallet for the first trade | 25.09 | ✅ done |
| First trade on our market: stake the epoch-23 buyer reward in Apex, split off 50 ANTS, list and buy it (internal test) | 25.09 | ✅ done |
| Confirm staking decisions: #27 stays in Apex and is not listed; restake its rewards in Apex; a stake in Open Forge | 26.09 | ✅ decided |
| Post on X about the first trade: [reply with video](https://x.com/TheTieTieTies/status/2103556306388844621) to our contest entry, models and AntSeed cost ($17.58) | 25.09 | ✅ done |
| First public lots: split a 50-ANTS position into five lots of 10 ANTS at 0.10 USDC | 26.09 | ✅ done |
| Implied MC / FDV on every lot and sale; faster listings; manage-flow hints and plain-word errors | 26.09 | ✅ done |
| Page order that follows the flow (stake → split → list); show "sold" from the receipt right after Buy | — | open |
| Check the AntSeed contest results | 29.09 | open |
| Claim and Restake staker rewards with buttons in My Positions (fork e2e covers both) | 27.09 | ✅ done |
| Portfolio polish: hide the table header when there are no positions, empty state for My Listings, "Staker Rewards" tile, "Est. reward" column, labelled listing rows, snapshot refresh caption | 27.09 | ✅ done |
| Portfolio polish, rest: no duplicate rows with pre-connected wallets, shorter listing rules | 28.09 | open |
| Incentives polish: a "how to stake into a pool" line, collapse the board to 10 rows on phones | 01.10 | open |
| Before the next offer: pick the best offer per pool by payout, validate offer fields strictly | 01.10 | open |
| Rebate offers: a seller (or a sponsor) returns a share of what buyers spend with it in an epoch, in USDC, computed from the chain; first sponsored rebate on Apex for epoch 25 after the owner's go | 01.10 | code ✅ 28.09 · offer pending |
| Incentives v2: network line above the board, "Post an offer" on top, expandable rows with seller stats from antscan, a "buyer ANTS per $1" column, and a "Selling, but no pool" list with the steps to get a pool | 01.10 | ✅ done 28.09 |
| Tell the active sellers without a pool, one by one, what a starter pool plus a restaked first seller reward would earn them | 02.10 | open |
| Post the "Selling, but no pool" list in the AntSeed chat and on X | 04.10 | open |
| Warn on the Move button that moving between sellers will lower the reward rate, once AntSeed ships it (announced 27.09) | when live | open |
| Restake #27's epoch-24 staker reward in Apex; stake the epoch-24 buyer reward straight into Open Forge (pool 44694, where the free models that built lants.eth run) — a max-locked position can't be moved | 01.10 | open |
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
- [x] Positions page: metric tiles and the positions table (amount, lock, reward, exit)
- [x] Pools table: seller names, sales, weight and expected reward after dilution — the Incentives board, 27.09
- [x] **Seller incentives** — offers in `site/offers.json`, posted through a GitHub issue — 27.09

### Phase 2 — Publish ✅ (20.09 → 23.09)

- [x] Market contract deployed on Base (USDC-only listings) — 20.09
- [x] Register `lants.eth`; static build pinned to IPFS with contenthash on `lants.eth` — 23.09
- [x] Listing prices shown as **USDC per locked ANTS**, with explicit decimals (USDC 6, ANTS 18)

### Phase 3 — Launch and listen (24.09 → 22.10)

- [x] Repo public; contract source verified on Basescan and Blockscout — 24.09
- [x] Listed on antseed.com/ecosystem — 27.09
- [x] Claim / Restake buttons and the Incentives tab — 27.09
- [ ] First staker reward for #27 + weekly recap #1 — 01.10
- [ ] Launch announcement on X and in the AntSeed chat — 02.10
- [ ] Pay the first incentive offer (Open Forge, epoch 25) and publish the transaction — 09.10
- [ ] Weekly recaps + seller conversations about incentive offers — every Thursday
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

### Ideas (not scheduled)

- **Why seller incentives can work here.** About 70% of Aerodrome's bribe mechanics carry over: stake in a pool works like a vote (it multiplies rewards for that seller's buyers), sellers play the role of protocols buying votes, and new sellers keep arriving. The missing piece is a liquid reward: ANTS can't be transferred, so a pool's weight is worth ANTS, not dollars. Paying in inference credits closes that gap; if ANTS transfers are ever enabled, the USDC version works exactly like Aerodrome's.

- **lANTS Allocator — where to stake ANTS, for people and agents.** A pools table (seller name, sales,
  weight, forecast reward for *your* amount after your own dilution, plus the buyer-reward boost if you buy
  from that seller) with a one-signature "Stake here"; the same answer as a pay-per-query API for agents
  over x402 (USDC on Base, no keys or accounts) and as an MCP tool. Needs a small server and a check of x402
  facilitator terms on Base mainnet. Worth it once there are many more stakers or agents that stake their own
  rewards. *(27.09: the pools table and the forecast after your own dilution shipped as the Incentives board;
  the one-signature "Stake here", the buyer-reward boost and the API are still open.)*

---

## Build in public on X

Every post carries real numbers. No price predictions for ANTS.

| When | Post |
|---|---|
| 23.09 | AntSeed contest entry — [x.com/TheTieTieTies/status/2102802534259916926](https://x.com/TheTieTieTies/status/2102802534259916926) |
| 25.09 | First trade, with video, models and AntSeed cost — [reply](https://x.com/TheTieTieTies/status/2103556306388844621) |
| Every Thursday after the epoch boundary | Epoch recap — positions, ANTS staked, weight by pool, reward per weight, our own rewards |
| After each stage | Stage done — what was built, which free model built it, what the human caught at acceptance |
| 01.10 | First staker reward for #27 — the real number vs our estimate |
| 27.09 | Contest entry #3: the Incentives tab, with video — [thread](https://x.com/TheTieTieTies/status/2104281429886513316) |
| 02.10 | Launch — what `lants.eth` shows, an invitation for sellers to post incentive offers |

---

## How this could make money

Most concrete first. Nothing here is decided before 22.10.

| Source | How | Today |
|---|---|---|
| Our own staking | #27 plus weekly restakes and buyer rewards compound in ANTS | first staker reward after 01.10 |
| Seller incentives | sellers' offers pay our own stake; v2 — an escrow contract with a 2–5% fee | 1 offer, ours as a sponsor |
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

**28.09.2026 (evening).** Rebate offers: the second offer type. A seller or sponsor gives the pool's buyers a discount in
USDC on what they spent with that seller in an epoch; every payout is computed from on-chain usage and can be checked
against the chain to the micro-USDC (Apex, epoch 23: 52 buyers, 558,971,119 micro-USDC, equal to the pool aggregate).
Why: sellers needed a way to offer a discount, and cashback in ANTS can't be sold while transfers are off; USDC can be
spent the same day.

**28.09.2026** — Incentives tab, v2. On antscan, sellers with $168,492 of lifetime sales (58 % of all seller revenue there, $290,282) have no pool for epoch 25. Four of them are selling now. Without a pool, their sales earn no points for them or their buyers. The tab now shows:

- a network line above the board: next epoch's staker budget, total stake, and the average per 1,000 ANTS;
- a ▾ panel per seller with revenue, weekly average, buyers, models and last sale from antscan, plus the pool's cashback and where a buyer reaches the 5 % cap;
- a "Buyer ANTS per $1" column, computed as the usage accounting contract does. Our epoch 23 buyer reward (3,487.06 ANTS) matched it;
- a "Selling, but no pool" block with the two transactions that open a pool and an estimate of what it would pay the seller.

Details: [docs/incentives.md](docs/incentives.md).

**27.09.2026 (evening)** — Incentives tab: AntSeed sellers can pay stakers for weight in their pool at a fixed USDC
rate per 1,000 ANTS with a cap, either to every staker pro rata (like Votium / Aerodrome) or to new stakes only. The board
ranks every pool by what 1,000 ANTS at max lock would earn next epoch after dilution, using the protocol's own split
(pool share grows with pool weight). First offer is ours: 1 USDC per 1,000 ANTS for new stakes in Open Forge, epoch 25,
up to 10 USDC. lANTS Market is also listed on antseed.com/ecosystem. Later that evening: seller names from
antseedstats.com, sortable columns, a live countdown, and an address for every view (#market, #listings, #portfolio,
#incentives). How it works: [docs/incentives.md](docs/incentives.md). After a review in the AntSeed chat (the model
holds under the live linear weight policy, `poolWeightPolicy() = 0x0`), the estimate now takes next epoch's staker
budget straight from the rewards contract (`stakerEpochBudget(25)` = 101,600 ANTS) instead of this epoch's. Second
point from the same review: ranking by the estimate puts thin pools on top, and if everyone follows it they stop
being thin. The board is now ranked by what each pool paid its stakers in completed epochs, with `new` and `thin` tags.
Then the board was reworked the Votium way: four columns (seller with its stake, ANTS per 1,000 ANTS next epoch,
paid to stakers, offer), one headline number, and every caveat in an ⓘ tip next to its heading.

**27.09.2026** — Claim and Restake for staker rewards in My Positions, one click each; after the
transaction the portfolio re-reads the wallet, so the new position and the zeroed reward show without a reload. Tested on a
Base fork at the next epoch: Claim sent 28,341.83 ANTS to the wallet, Restake minted position #110 with the same amount.
On mainnet the buttons light up once the first staker rewards are indexed, from 01.10.

**26.09.2026 (later)** — Full repo audit before more eyes land on it: no secrets in 351 commits, no
broken links, every contract fact re-read on chain (ANTS `MAX_SUPPLY()` is 1.04B, so the FDV basis is the
token's own). The Docs page had gone stale ("zero sales", a wrong claim that inactive positions can't
be split — it is max-lock that blocks split and move); rewritten. Three stale checks and two probes fixed;
the fork e2e test passes again in both wallet modes.

**26.09.2026** — First public lots: our buyer wallet split its 50-ANTS position into five lots of 10 ANTS
at 0.10 USDC. Feedback from the AntSeed chat: a bare USDC price is hard to read, so every lot now shows
its implied MC (× ANTS minted, read from the token) and FDV (× 1.04B max supply). Also measured: the
contract refuses to split or move a max-locked position, so the site now disables those buttons.

**25.09.2026** — First trade on our market, every step through the site ([tx](https://basescan.org/tx/0x33ed01b75166aa1c17388fc92bd1bbbd9e2bcd17cff68b139fa4ce227a8fc610)). Replaying it on a
Base fork from the block before the trade exposed two portfolio bugs (positions newer than the snapshot
were hidden; the portfolio did not refresh after a transaction); both fixed the same day. `lants.eth`
now points at each release's CID directly.

**24.09.2026** — Repo made public (ahead of the planned 02.10). Contract source verified on
Basescan and Blockscout the same day.

**23.09.2026** — Site live at `lants.eth` (IPFS + ENS, IPNS via Filebase, gas-free updates).
Automatic snapshot 3×/day turned on. AntSeed contest entry posted on X.

**20.09.2026** — Market contract deployed on Base: USDC-only listings, priced per locked ANTS.

**17.09.2026** — Staked our epoch-22 buyer reward as position #27 (max-lock on). Within five hours
three large positions appeared and our epoch-24 pool-weight share fell 99.99 % → 34.7 %. Lesson: one
wallet's weight is temporary; buyer rewards can be staked every epoch and holders already do it.
This is why reward per unit of weight matters more than stake size (see protocol-notes).

**09.09.2026** — Research verdict: a locked-position market works, but at the time there were no
transfers. Decision: watch the signals. Two signals (positions and staked amount) later moved, which
is why this repo exists.

---

## Metrics

| Metric | Source | Baseline 17.09 | 26.09 | 27.09 |
|---|---|---:|---:|---:|
| lANTS transfers between wallets | Blockscout token transfers | 0 | ≥ 5 (4 on antseedmarkets.com, 1 internal on ours) | — |
| Positions > 1 ANTS | on-chain snapshot | 5 | 76 | 96 |
| Listings not by us | market data | not measured | 0 | — |
| Seller incentive offers | `site/offers.json` | 0 | 0 | 1 (ours, sponsor) |
| X followers / impressions | X analytics | — | — |
| AntSeed inference spent on this build | call logs | — | $17.58 (to 25.09) |
