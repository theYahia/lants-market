# AGENTS.md — lants.eth.limo

Market front for locked ANTS positions (lANTS) on Base: valuation header, our own
1%-seller marketplace, and aggregation of Seaport orders from antseedmarkets.com.

## Stack & commands

- Static site in `site/` (native ES modules, no bundler), published to IPFS by CI.
- Node scripts in `scripts/`; tests are `node --test site/*.test.mjs`.
- viem exists in Node tests only. The browser has no viem/SDK: ABI encoding is hand-rolled.
- Tests: `npm.cmd test` (PowerShell blocks `npm.ps1`). Build: `npm.cmd run build`.
- Coverage: `npm.cmd run test:coverage` (node `--experimental-test-coverage`,
  needs Node >= 20.12). DOM-builder tests use `jsdom` via `site/dom-test-helper.mjs`
  (setupDom/teardown/stubWallet); it is NOT in the build manifest and never
  reaches `dist/`. Modules with a top-level `init()` (storefront, incentives) are
  dynamically imported AFTER `setupDom()`.
- Bot tests: `npm.cmd run bot`. Bot dry run: `node bot/run.mjs --dry-run`.
- After editing `site/docs/*.md`: `node scripts/site/build-docs.mjs`.
- Local preview: `python -m http.server 8099` from `site/`.

## Contracts (Base)

- Market (VexyMarketplace, 1% seller fee): `0xC5BFc309a68dBf4e7eEca9BD91749d611c75C660`
- lANTS positions NFT: `0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- ANTS: `0xa87EE81b2C0Bc659307ca2D9ffdC38514DD85263`
- Seaport 1.6: `0x0000000000000068F116a894984e2DB1123eB395`

## Architecture

- `site/index.html` — all views and the inline router
  (`#market`, `#listings`, `#portfolio`, `#incentives`, `#position/{id}`).
- `site/market-view.mjs` — wallet connect, legacy positions table, manage forms,
  header tiles; exports the shared wallet helpers (`walletRequest`, `ensureChain`,
  `waitReceipt`, `humanError`, `loadPublicMarket`, `loadSnapshot`).
- `site/own-listings.mjs` — canonical chain read of listings + ANTS supply, shared
  by table, storefront and deep page. Do not add a second listing reader.
- `site/listing-model.mjs` — unified lots (lants + Seaport), join with snapshot,
  dedupe by tokenId, active/closed position predicate.
- `site/position-yield.mjs` — APR, ANTS per epoch, pool share/weights, unlock dates.
- `site/storefront*.mjs`, `site/card-actions.mjs` — default card view, filters,
  sort, Grid/List, Buy/Make offer/Share.
- `site/position-page.mjs` — deep page view-model and DOM.
- `site/sell-model.mjs`, `site/sell-modal-view.mjs`, `site/sell-modal.mjs`,
  `site/create-listing.mjs` — the `+ Sell` flow: sellable classification,
  fee/net math, pick → review → wallet create; live own lots show Cancel instead
  of relist. `create-listing.mjs` is the shared owner/approve/createListing
  wallet path, used by both the modal and the Portfolio form.
- `site/seaport-feed.mjs` — competitor listing feed: the only discovery source.
- `site/seaport-abi.mjs`, `site/seaport-order.mjs`, `site/seaport-buy.mjs` —
  Seaport 1.6 fulfill: pinned selector/struct, fail-closed validation, exact approve.
- `site/render.mjs` — legacy positions table used by List view; prefer not to modify.
- `bot/` — `@sxsiant` automation: `read-feed.mjs` (market feed), `read-snapshot.mjs`
  (position snapshot; epoch emission + lot data), `aggregate.mjs` (board/lot numbers),
  `diff.mjs` / `diff-live.mjs` (change detection), `format.mjs` (5 archetype builders),
  `quality.mjs` (publication gate), `card.mjs` / `media.mjs` (SVG cards + upload),
  `metrics.mjs` (weekly engagement table), `xapi.mjs` (OAuth + tweet + media),
  `run.mjs` (`--dry-run`). State is gitignored `bot/state.json`; CI uses
  `.github/workflows/twitter-bot.yml`. The bot posts exactly five archetypes:
  epoch close (A), market board (B), lot highlight (C), network story (D), education (E).

## Invariants

- APR and «≈X ANTS/epoch» are the holder's staking reward only. Boost is a separate
  badge (provider pool share of next-epoch weight) and is never folded into yield.
- Seaport orders are signed off-chain: there is no on-chain fallback for discovery.
  If the feed fails, Seaport lots are hidden; our own lots keep rendering.
- Buyer price is final in both sources. The 1% fee is seller-side only.
- Header price measures stay separate: floor ask (lowest live ask), Avg Price
  (24H) from the feed, and Implied MC/FDV = Avg Price (24H) × ANTS minted / max
  supply. MC/FDV never use the ask VWAP: an inflated ask must not move the
  headline valuation. MC/FDV are priced via locked lANTS, not liquid ANTS (ANTS
  has no liquid DEX; the locked-position sale price is the only signal). MC uses
  ANTS minted (totalSupply), not circulating supply. `$0.094` is the network's
  average-sales figure, not a floor or a current price. LISTED/SUPPLY
  denominator is live positions (feed `totalNfts`), not the snapshot ledger.
- Seaport Buy goes only through `fulfillBasicOrder` (BasicOrderType 8,
  fulfillerConduitKey `0x0`) and only after `validateOrder`. `SEAPORT_BUY_ENABLED`
  is `true` in `site/market-config.mjs`, but the Base-fork fulfill transcript is
  still not recorded (no forge/anvil on the machine): the flag is provisional and
  the fulfill path remains guarded by validateOrder + on-chain checks + eth_call
  simulate.
- Files copied into `dist/` must be ASCII (Cyrillic is rejected; binary images are
  exempt).
- The bot posts only five archetypes — epoch close, market board, lot highlight,
  network story, education — one post per run, at most one per family per 5 days
  (education 10). It never posts listings (new/floor/delist), `Sold`, `Floor move`,
  per-metric tickers (`settled`, `staked`, `usage`, `leaders`, `daily`, `diem`,
  `modality`, `video`, `lifetime`, `usagetarget`, `countdown`, `alloc`,
  `epochstats`, `record7d`, `topmodels`): those numbers live inside the epoch and
  board cards. Everything is gated by `bot/quality.mjs` (link, number, prose first
  line, 280 chars, family slot, 14:00–17:00 UTC window) — rationale and the full
  list in `docs/twitter-content-plan.md` "Removed post types". Do not reintroduce.
- The bot never posts APY / boost-yield numbers from antseedstats
  (`staking/pools.rows[].apy_*_pct`): the 2y figure is the "inflated yield" the
  invariants ban.
- Cards need the `media.write` X scope. Until the owner re-mints the refresh token
  with it, `bot/media.mjs` skips the card and the post goes out as text — that
  fallback is deliberate, never a reason to drop the post.

## Deploy & hygiene

- Deploy is CI-only: GitHub Actions `snapshot` → Run workflow → `source=manual`.
  Do not publish IPFS locally.
- Do not commit `tmp-*.mjs`, `.kilo/`, `lants-thread/`, or unrelated local notes.
- Current session state, commit list, validation status and next steps:
  `notes/handoff.md`.

## Video clips (AntSeed Halloween series)

- All media lives outside git in `C:\Users\romim\lants-video-media\<clip>\` (one folder per clip,
  each with a `README.md`: delivered files, prices, what the audit proved, what is open).
- Series pointer and per-clip lessons: `notes/antseed-video.md`. Verified entry, tool, seller
  prices and traps: `C:\Users\romim\lants-video-media\halloween\PLAYBOOK.md`. Read those before
  planning a new clip; do not re-research them.
- The acceptance gate is a vision audit on the buyer node (`gemini-3.7-flash` over
  `POST /v1/chat/completions` with base64 stills, ~$0.002 per call), not SSIM alone. Set
  `ANTSEED_AUTHORIZATION` from `~/.config/kilo/secrets/antseed.key`; never put the key in a file.
  One create ≤ $1.00, never pass `--audio`/`--no-audio`/`--aspect-ratio`.
