# Twitter content plan — @sxsiant (lants.eth.limo)

Status: Phase 0 active (manual posting while the storefront sprint T1–T8 is in progress).
Account: handle `@sxsiant`, display `lants.eth.limo`, bio `Locked ANTS positions (lANTS) market on @base · lants.eth.limo`.
Automated-by label: `Automated by @TheTieTieTies` (X settings attribution; no bot code exists yet).

Ground rules (from `docs/planning-context.md` §5.5): every number on this account must be
verifiable on-chain or from the public competitor feed. No inflated volume, no invented APR,
no "two yields" framing. If a number changes, post the change; never post a number twice as news.

## Verified market snapshot (28.10, from `/api/lants-market`)

- Floor ask: $0.140/ANTS; 24h avg sale: $0.101874; network-cited avg (older post): $0.094.
- Listed: 15 of 483 positions; open offers: 0.
- Implied MC ≈ $13.24M, implied FDV ≈ $105.95M (ratio 8.0).
- Epoch 28 active (weekly, closes Thursday); ANTS supply ≈ 129.9M of 1.04B max.
- Site header tiles: Implied Price/ANTS, 24H Volume, Implied MC, Implied FDV, Listed/Supply, Floor Ask.

## Content pillars

1. **Market data** — floor, 24h avg, implied MC/FDV, listed count. The trust anchor.
2. **Education** — what a lANTS position is, how staking reward and boost actually work.
3. **Position highlights** — the best real lots, with numbers, from the live feed.
4. **Product updates** — the storefront sprint, then Seaport aggregation + on-site fulfill.
5. **Ecosystem** — AntSeed network news, epoch closes, incentives/bribes when they ship.

## Cadence

- Phase 0 (now → debut deploy): 2–3 manual posts/week. Data + education only. No promises.
- Phase 1 (after T1–T8 deploy): launch thread once, then steady data cadence.
- Phase 2 (bot, live): automated data posts only (our own listings, epoch closes,
  antseedstats metrics), dedup + change-only. No per-day or per-run cap while the owner
  watches live behaviour (29.10): `STATS_PER_RUN = 0`, `STATS_THROTTLE = false`,
  no `MAX_POSTS_PER_RUN`. Weekly digest still fires at most once per 7 days.
  Manual posts stay manual (no label on them).
- Best window: 14:00–17:00 UTC (17:00–20:00 MSK) — morning US + evening EU, per the AntSeed
  contest playbook found on disk. Not on Moscow nights, not weekends unless an epoch closes.

## Phase 0 — ready-to-post bank

### P0.1 Kickoff (post once, pin it)

> lants.eth.limo — the valuation board for locked ANTS positions (lANTS) on Base.
> 483 positions. Only 15 listed. Floor $0.14, 24h avg $0.102, implied MC ~$13.2M.
> The numbers are live and verifiable — see the header, not a chart of guesses.
> #AntSeed #lANTS

### P0.2 Education — what is a lANTS position?

> A lANTS position is ANTS staked and time-locked behind a provider.
> While it lives it earns the holder a staking reward — and it raises the
> provider's boost. 483 exist today, 15 are for sale.
> lants.eth.limo

### P0.3 Education — APR is staking reward, not the boost (honesty post)

> The APR on a position is its staking reward only.
> The boost it gives the provider is a separate thing: it raises the provider's
> points, not the holder's yield. Summing them is how fake yield metrics happen.
> We show both, labelled, never summed.

### P0.4 Education — the three price numbers

> $0.094 / $0.102 / $0.140 — why three numbers?
> avg of past sales when the network announced, 24h avg now, lowest ask now.
> Same asset, three honest answers. All on the header, each labelled.

### P0.5 Market state — weekly (Monday)

> lANTS market, week N:
> floor $0.140 · 24h avg $0.1019 · 15/483 listed · 0 open offers
> implied MC $13.2M · FDV $106.0M
> data: lants.eth.limo

### P0.6 Position highlight (only when a real lot is worth it)

> Cheapest ANTS right now: 762.47 ANTS @ $0.140 → $106.75, lock 126d (106d left).
> #205 · agent 45869. Full card on lants.eth.limo/#position/205

### P0.7 Teaser — building (honest, no "live" claim)

> Building: card storefront, deep position pages, and cross-market aggregation for lANTS.
> Until then the header prices are already live — refresh and see.

## Phase 1 — debut thread (when T1–T8 ships)

1. Hook: "lANTS just became searchable. 483 locked positions, one screen."
2. Problem: positions used to be a ranked table; valuation was guesswork.
3. What: card storefront — provider, lock, APR, price, source badge, one screen.
4. Header: live implied price, floor, 24h avg — labelled, verifiable.
5. Aggregation: Seaport listings from other markets render in the same grid.
6. Buy: fulfill Seaport orders on-site via the canonical contract, 0% platform fee.
7. Deep pages: `#position/{id}` is a shareable destination, richer than the order page anywhere else.
8. Trust: every figure on the page is on-chain or from a public feed; no wash volume.
9. Roadmap: incentives proof page (public payout rules + verifiable trees), phase-4 market layer.
10. CTA: lants.eth.limo — open the market.

## Phase 2 — automated posts (bot, live)

Change-only, dedup by `(type, value)`; never repeat an identical value as new.
Listing posts cover ONLY our own marketplace listings (VexyMarketplace, the 1%
seller fee). The competitor's Seaport orders on antseedmarkets.com are theirs
to post, never ours.

Emoji convention: one leading emoji per post —
🆕 listing · 🎯 floor listing · 🗑️ delisted · 🏁 epoch close · 🔥 burn ·
💰 settled · 🌱 staked · 🏆 record · 🎁 epoch rewards · 📊 weekly digest ·
📡 usage · ⏳ countdown · 🧮 allocation · 🏅 top models.
Two markers also sit inside the text: 🐜 before an ANTS amount (listing size,
epoch emission, burn, epoch rewards) and 🌱 for staking/growth (staked post,
the Restake bullet). No other emoji inside the text, the Twitter length limit
(280) is the hard constraint — `epochText` drops its measures rather than exceed it.

- New listing: `🆕 New listing: #206 · 400 ANTS @ $0.150 · lock 8w · lants.eth.limo/#position/206`
- New floor listing: `🎯 New floor listing: #206 · 400 ANTS @ $0.120 · lock 8w · lants.eth.limo/#position/206`
- Delisted: `🗑️ Delisted: #205 · lants.eth.limo/#position/205`
- Epoch close (Thursday), a claim/restake call to action:
  ```
  🏁 Epoch 29 has ended · X ANTS emitted · 24h avg $Y

  Staker rewards for epoch 29 are claimable now:
  • Claim — ANTS to your wallet
  • Restake — compound into a new position 🌱 (+5% power bonus)

  Buyer rewards for epoch 29 can be staked into a seller pool.

  https://lants.eth.limo
  ```
  The measures on the first line are optional (only when the source supplied them);
  the `(+N% power bonus)` appears only when the staking endpoint supplied it.
- antseedstats: burn, settled (7d/30d, now with a buyer count), staked, record,
  epoch rewards, weekly digest, plus the demand-side posts below.

### Demand-side posts (network usage side of AntSeed)

The `network/summary`, `epochs/{id}` and `staking/pools` endpoints already expose
the demand side the bot used to ignore. Added 29.10:

- Usage (24h): `📡 AntSeed 24h: 232.7K requests · 13.4B tokens · 610 videos · 96% attributed · data: antseedstats.com`
  — change-only, ±5% on `paid_usage_24h.requests` vs the last posted value.
- Epoch countdown: `⏳ Epoch 28 ends in ~3h — claim staker rewards or restake with a +5% power bonus 🌱` + site URL.
  Once per epoch per bucket (`6h`, `1h`), from `epoch.seconds_left` + `staking.pools.restake_bonus_pct`.
- Emission allocation: `🧮 Epoch 28 emission: 40% seller pools · 20% usage · 15% team · 15% reserve · 10% verification · data: antseedstats.com`
  — on completed-epoch advance, from `epochs/{id}.economics.buckets`.
- Top models: `🏅 Most-used AI on AntSeed (7d): Claude Opus 5.5 · GPT-6 Astra · Kimi K3 · data: antseedstats.com`
  — weekly, top 3 by usage from the models first page. **Gated off**
  (`TOP_MODELS_ENABLED = false`) until the `models` sort semantics are verified.
- Buyers folded into the existing settled post: `… 27,841 settlements · 70 sellers · 306 buyers · …`.
- Usage + generative folded into the weekly digest (two plain lines, no emoji).

## Removed post types (do not reintroduce)

Two former event types were removed on 29.10.2026 because they made @sxsiant a
second "market ticker" behind @antseedbot instead of a destination for buyers:

- **Sold** — removed. The competitor already posts every sale with more context
  ("X% above 24h avg"). A sold position is a dead end for us: the deep link led
  to a position that no longer exists, so the post never converted. Sale volume
  now lives only in the weekly digest.
- **Floor move** — removed. A floor change on the aggregate (antseedmarkets) feed
  is the competitor's story, not our inventory. Our own floor is only relevant
  when a new own listing sets it ("New floor listing").

Reintroducing either means posting the competitor's activity as our own. The bot
now posts only: our own listings, epoch closes, and the antseedstats data we
attribute. If a future change adds them back, this decision must be revisited.

## Rejected post types (antseedstats demand, do not implement)

Considered 29.10 and rejected; one line each. See `notes/handoff.md` Session 16.

- **APY** — `staking/pools.rows[].apy_*_pct` (the 2y figure is exactly the
  "inflated yield" the invariants ban). Never post APY.
- **Standalone buyers** — folded into the settled post (one less continuous stream).
- **Standalone coverage** — kept only as the trailing "N% attributed" in the usage post.
- **Standalone generative** — folded into the weekly digest.
- **Standalone claimable** — folded into countdown / epoch CTA.
- **Full models catalog** — pagination (page 100) unreliable on the free tier; only
  "top 3 by usage" from the first page is used, and only after sort semantics are verified.
- **Prices per-listing / new seller / price change** — 1631 live rows are the network's
  sellers (not our inventory) and duplicates the competitor's story.
- **Internal plumbing** — `buyer_ants_per_usd_projected`, `degraded`, `tokens_in`/`tokens_out`,
  `economics.stake`, `usage.pct_of_target` — too technical, not user-facing.

## Repost strategy (main account @TheTieTieTies)

- Quote-tweet, never bare retweet; add one line of founder commentary.
- Space 30–60 min between the bot post and the main-account quote.
- Main account carries personal voice; @sxsiant carries the data.

## Do-not list

- No price predictions, no "wen moon", no financial advice.
- Never repost a stale number as fresh. Always recompute from the live feed.
- No engagement bait (ratio, reply-for-reply); reply to real questions only.
- No auto-follow, auto-like, auto-DM, or auto-replies when the bot runs — suspension risk.
