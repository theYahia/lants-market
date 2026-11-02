# Twitter content plan — @sxsiant (lants.eth.limo)

Status: Phase 3 active (bot packages posts: five archetypes, cards, gate, weekly metrics).
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
- Phase 3 (bot, live): automated posts only, packaged as five archetypes — epoch
  close (A), market board (B), lot highlight (C), network story (D), education (E).
  One post per run, at most one per family per 5 days (education 10), inside the
  14:00–17:00 UTC window, gated by `bot/quality.mjs`. Numbers live in the A/B cards
  (`bot/card.mjs`); the old "emoji · number · data:" streams are gone. Manual posts
  stay manual (no label on them).
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

## Phase 3 — automated posts (bot, live)

The bot no longer streams every change as its own post. One post = one story,
gated, at most one post per run; cards carry the numbers. A post must earn its
X API call: a link back to lants.eth.limo, a real number, a sentence first line
(no emoji-led "emoji · number · data:" dump), inside the 14:00–17:00 UTC window,
and only when its archetype's slot is free.

### The five archetypes

| # | Archetype | Cadence | Card | Absorbs |
|---|-----------|---------|------|---------|
| A | Epoch close + claim/restake CTA | 1/epoch (Thu) | epoch card | `epochstats`, `alloc`, `burn`, `countdown` |
| B | Market board (find of the week) | 1/week | board card | digest, `staked`, floor/avg, `listed`, `offeredCount`, supply, implied MC/FDV, `settled7d` |
| C | Lot highlight (real lot + deep link) | ≤1/week | lot card | new type |
| D | Network story (network demand) | ≤1/week | none | `settled 7d/30d`, `usage`, `leaders`, `daily`, `modality`, `video`, `record7d`, `usagetarget`, `diem` |
| E | Education (what is a lANT, honest bounds) | 1/10 days | none | new type |

Slot gaps: A/B/C/D every 5 days, E every 10 days (`bot/state.mjs`). TTLs: A 36h,
B/C/D 48h, E 10d — so waiting for a slot never loses the news. When several
candidates are ready, run order is A > B > C > D > E.

### Gate and merge

`bot/quality.mjs` refuses a post without `lants.eth.limo`, without a number, with
an emoji-led or middle-dot first line, over 280 chars, with a busy family slot,
or outside the window. `bot/run.mjs` posts at most one candidate per run (best by
archetype rank), so a burst is impossible by construction. The numbers that used
to stream as their own posts now live inside the A/B cards; the same data stays
available for free in the Telegram bot (untracked `bot/tg-*`, not touched).

### Cards

`bot/card.mjs` builds 1200×675 dark-theme SVGs (DejaVu Sans, ASCII-only):
`boardCard` (floor · 24h avg · listed · bids · supply · 7d settled · staked ·
epoch), `lotCard` (#id · ANTS · USD · $/ANTS · unlock date · ANTS/epoch ·
provider), `epochCard` (epoch · emission · seller points · restake bonus · next
close). `bot/media.mjs` renders (`@resvg/resvg-js`) and uploads
(`POST /2/media/upload?media_category=tweet_image`). Cards need the `media.write`
scope; without it (the current token) the bot posts text only.

### Metrics

`bot/metrics.mjs` joins `state.published` with the account's last 100 original
tweets (`GET /2/users/:id/tweets?max_results=100&tweet.fields=created_at,public_metrics`)
into a `family · impressions · likes · replies · reposts · bookmarks · engagement`
table. It runs weekly (workflow `0 6 * * 1`); `--write` persists it to
`notes/twitter-metrics.md`. After 4 weeks: keep the three archetypes that earn
their call.

### Cost

One post = one paid `POST /2/tweets` call; a card adds one `POST /2/media/upload`.
The per-call price is not recorded in this repo — fill it in here when known:

| Operation | Calls |
|-----------|-------|
| Text post | 1 × `POST /2/tweets` |
| Card post | +1 × `POST /2/media/upload` |
| Weekly metrics | 1 × `GET /2/users/:id/tweets` + 1 token refresh |

### Reply bank for @TheTieTieTies

Quote-tweet the bot post (never bare retweet), 30–60 min later, one line of
founder voice. Stock lines per archetype:

- A (epoch): "The lock keeps paying until you claim it — the yield is real, the date is fixed."
- B (board): "468 holders are holding through a 3% listed float. That's the signal."
- C (lot): "This is the cheapest real position on the board right now. Numbers verified, not vibes."
- D (network): "A seller shortage on the demand side is exactly what a staking network wants to show."
- E (education): "Buying a lock, the yield and the boost together — that's the whole product in one sentence."

## Removed post types (do not reintroduce)

Five former event types were removed on 29.10.2026 because they made @sxsiant a
second "market ticker" behind @antseedbot instead of a destination for buyers:

- **Sold** — removed. The competitor already posts every sale with more context
  ("X% above 24h avg"). A sold position is a dead end for us: the deep link led
  to a position that no longer exists, so the post never converted. Sale volume
  now lives only in the market board (B).
- **Floor move** — removed. A floor change on the aggregate (antseedmarkets) feed
  is the competitor's story, not our inventory.
- **New listing** — removed. A new listing on our own marketplace (VexyMarketplace)
  is the same ticker the competitor runs for their Seaport orders; it is not our
  story.
- **New floor listing** — removed. Same rationale as New listing: an undercut of
  the floor is a price-ticker event, not our inventory.
- **Delisted** — removed. A listing disappearing (sold, cancelled or expired) is
  competitor-ticker noise, not a call to action.

Reintroducing any of these means posting the competitor's activity as our own. The
bot now posts only: the five archetypes above. If a future change adds them back,
this decision must be revisited.

On 02.11.2026 the per-metric streams were also removed, because they were "posts
about the same thing with no story" — 5 of 8 posts on 29.10 had no link and none
had an image, a question or an interpretation. Their numbers now live inside the
epoch (A) and board (B) cards, or the free Telegram bot:

- **settled 7d/30d** — folded into the board card (`settled7d`) and the network story.
- **staked** — folded into the board card (`Staked %`).
- **usage** (24h requests/tokens/videos) — folded into the board card.
- **leaders, daily, diem, modality, video, lifetime, usagetarget** — folded into
  the network story (D), which posts only with a genuine week-over-week comparison
  and a conclusion.
- **topmodels** — folded into the board card's epoch context; the full catalog is
  never posted (see "Rejected post types").
- **epochstats, alloc, burn, countdown** — folded into the epoch card (A); a
  countdown never posts on its own.
- **record7d** — folded into the network story; a bare all-time-high post is gone.
- **digest** (lANTS weekly) — replaced by the market board (B), a once-a-week story
  instead of a number dump.

Also banned forever: a first line of the form `📡 AntSeed 24h · 215.41K requests · …`
(the gate rejects emoji-led and middle-dot first lines); a post without a link;
two posts about the same metric in one week; `countdown` as a standalone post.


## Rejected post types (antseedstats demand, do not implement)

Considered 29.10 and rejected; one line each. See `notes/handoff.md` Session 16.

- **APY** — `staking/pools.rows[].apy_*_pct` (the 2y figure is exactly the
  "inflated yield" the invariants ban). Never post APY.
- **Standalone buyers** — folded into the settled post (one less continuous stream).
- **Standalone coverage** — kept only as the trailing "N% attributed" in the usage post.
- **Standalone generative** — folded into the market board (B).
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
- Stock reply lines per archetype live in "Phase 3 — Reply bank for @TheTieTieTies".

## Do-not list

- No price predictions, no "wen moon", no financial advice.
- Never repost a stale number as fresh. Always recompute from the live feed.
- No engagement bait (ratio, reply-for-reply); reply to real questions only.
- No auto-follow, auto-like, auto-DM, or auto-replies when the bot runs — suspension risk.
