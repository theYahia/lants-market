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
- Phase 2 (bot, later): automated data posts only (floor moves, trades, listings, epoch summaries),
  dedup + change-only, max 1/day. Manual posts stay manual (no label on them).
- Best window: 14:00–17:00 UTC (17:00–20:00 MSK) — morning US + evening EU, per the AntSeed
  contest playbook found on disk. Not on Moscow nights, not weekends unless an epoch closes.

## Phase 0 — ready-to-post bank

### P0.1 Kickoff (post once, pin it)

> lants.eth.limo — the valuation board for locked ANTS positions (lANTS) on Base.
> 483 positions. Only 15 listed. Floor $0.14, 24h avg $0.102, implied MC ~$13.2M.
> The numbers are live and verifiable — see the header, not a chart of guesses.
> #AntSeed #lANTS

### P0.2 Education — what is a lANTS position?

> A lANTS position is ANTS locked behind a provider, with a timer.
> Staked, time-locked, and it raises the provider's boost while it lives.
> 483 exist today. 15 are for sale.
> lants.eth.limo

### P0.3 Education — APR is staking reward, not the boost (honesty post)

> APR on a position = its staking reward. That's it.
> The boost it gives the provider is separate — it raises buyer points, not the
> holder's yield. Mixing them is how fake yield metrics happen.
> We show both, labelled, never summed.

### P0.4 Education �� the three price numbers

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

## Phase 2 — automated posts (spec for the future bot)

Change-only, dedup by `(type, value)`; never repeat an identical value as new.

- Floor move: `Floor: $0.140 → $0.132 (−5.7%) · lants.eth.limo`
- Trade: `Sold: #205 · 762.47 ANTS @ $0.1399 ($106.75 USDC) · lants.eth.limo`
- New listing: `New listing: #206 · 400 ANTS @ $0.150 · lock 8w · lants.eth.limo`
- Epoch close (Thursday): `Epoch 29 closed · X ANTS emitted · 24h avg $Y · lants.eth.limo`

## Repost strategy (main account @TheTieTieTies)

- Quote-tweet, never bare retweet; add one line of founder commentary.
- Space 30–60 min between the bot post and the main-account quote.
- Main account carries personal voice; @sxsiant carries the data.

## Do-not list

- No price predictions, no "wen moon", no financial advice.
- Never repost a stale number as fresh. Always recompute from the live feed.
- No engagement bait (ratio, reply-for-reply); reply to real questions only.
- No auto-follow, auto-like, auto-DM, or auto-replies when the bot runs — suspension risk.
