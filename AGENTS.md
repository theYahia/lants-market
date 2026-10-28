# AGENTS.md — lants.eth.limo

Market front for locked ANTS positions (lANTS) on Base: valuation header, our own
1%-seller marketplace, and aggregation of Seaport orders from antseedmarkets.com.

## Stack & commands

- Static site in `site/` (native ES modules, no bundler), published to IPFS by CI.
- Node scripts in `scripts/`; tests are `node --test site/*.test.mjs`.
- viem exists in Node tests only. The browser has no viem/SDK: ABI encoding is hand-rolled.
- Tests: `npm.cmd test` (PowerShell blocks `npm.ps1`). Build: `npm.cmd run build`.
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
- `site/seaport-feed.mjs` — competitor listing feed: the only discovery source.
- `site/seaport-abi.mjs`, `site/seaport-order.mjs`, `site/seaport-buy.mjs` —
  Seaport 1.6 fulfill: pinned selector/struct, fail-closed validation, exact approve.
- `site/render.mjs` — legacy positions table used by List view; prefer not to modify.

## Invariants

- APR and «≈X ANTS/epoch» are the holder's staking reward only. Boost is a separate
  badge (provider pool share of next-epoch weight) and is never folded into yield.
- Seaport orders are signed off-chain: there is no on-chain fallback for discovery.
  If the feed fails, Seaport lots are hidden; our own lots keep rendering.
- Buyer price is final in both sources. The 1% fee is seller-side only.
- Header price measures stay separate: floor ask, implied price (VWAP of live asks
  including Seaport), 24h average sale from the feed. `$0.094` is the network's
  average-sales figure, not a floor or the implied price.
- Seaport Buy goes only through `fulfillBasicOrder` (BasicOrderType 8,
  fulfillerConduitKey `0x0`) and only after `validateOrder`. It is currently behind
  `SEAPORT_BUY_ENABLED = false` in `site/market-config.mjs` until a Base-fork
  fulfillment test is recorded.
- Files copied into `dist/` must be ASCII (Cyrillic is rejected; binary images are
  exempt). New JS modules stay ≤300 lines; `market-view.mjs` and `render.mjs` must
  not grow.

## Deploy & hygiene

- Deploy is CI-only: GitHub Actions `snapshot` → Run workflow → `source=manual`.
  Do not publish IPFS locally.
- Do not commit `tmp-*.mjs`, `.kilo/`, `lants-thread/`, or unrelated local notes.
- Current session state, commit list, validation status and next steps:
  `notes/handoff.md`.
