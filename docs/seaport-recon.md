# Seaport recon — antseedmarkets.com order source (28.10.2026)

Read-only teardown of the competitor SPA (`antseedmarkets.com/markets`) to answer one
question: **does it expose active orders through an API we can read and execute?**

Answer: **yes.** Orders come from a same-origin REST API, and the raw Seaport order
(parameters + signature) is fetchable per token. The API is CORS-open, so our frontend
can call it directly — no proxy, no key.

## How the data flows

The SPA is a Vite + React app (wagmi/viem, RainbowKit). The `/markets` route boot
(`/assets/route-boot-*.js`) prefetches these endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /api/lants-market` | Active-listing feed (normalized) |
| `GET /api/lants/price` | Price stats (last, 24h/7d avg, floor ask) |
| `GET /api/lants/trades` | Trade history |
| `GET /api/lants/activity-stats` | Activity stats |
| `GET /api/collections` | Collection metadata (incl. `seaportAddress`) |
| `GET /api/sellers` | Seller directory |

The full API surface is in the client module (`fetchLantsMarket`, `fetchLantsOrder`,
`postLantsListing`, `postLantsOffer`, `acceptLantsOffer`, `postLantsTrade`, …). The two
that matter for aggregation are `fetchLantsMarket` and `fetchLantsOrder`.

## The order feed

`GET /api/lants-market?page=1&pageSize=24&sort=listedFirst`

```jsonc
{
  "price": { "avgPrice24h": "0.101874", "floorAsk": "0.140000", /* ... */ },
  "totalNfts": 483, "listedCount": 15, "offeredCount": 0,
  "currentEpoch": 28,
  "antsTotalSupply": 129929424.0681841, "antsMaxSupply": 1040000000,
  "impliedPriceUsd": 0.101874, "impliedMcUsd": 13236430.147522187,
  "impliedFdvUsd": 105948960,
  "sources": { "opensea": {"ok": true}, "antscan": {"ok": true},
               "chain": {"ok": true}, "indexer": {"ok": true} },
  "items": [
    {
      "id": 205, "owner": "0xe692…", "agentId": 45869, "sellerName": "Venice.ai Proxy",
      "amount": 762.47, "lockDays": 126, "daysRemaining": 106,
      "listed": true,
      "listing": { "usd": 106.746148, "perAntUsd": 0.1399999, "mcUsd": 18190119.28, "fdvUsd": 145599999.33 },
      "fulfillableHere": true, "offerCount": 0, "offers": []
    }
  ]
}
```

The feed aggregates from OpenSea, antscan, the chain, and its own indexer
(`sources.*.ok`). Note `impliedMcUsd`/`impliedFdvUsd` use the same 8.0 FDV/MC basis our
header already implements.

## The executable order

`GET /api/lants/order/{tokenId}` — returns the full Seaport order for a listed token:

```jsonc
{
  "tokenId": 205,
  "offerer": "0xe692…",
  "priceWei": "106746148",                       // USDC, 6 decimals
  "protocolAddress": "0x0000000000000068F116a894984e2DB1123eB395",  // Seaport 1.6, Base
  "orderHash": "0x3694…",
  "expiresAt": 1795360779000,
  "orderParameters": {
    "offerer": "0xE692…",
    "zone": "0x0000…0000", "zoneHash": "0x0000…0000",
    "orderType": 0,                               // FULL_OPEN — no restrictions
    "startTime": "1792768779", "endTime": 1795360779,
    "offer": [ { "itemType": 2, "token": "0x8bf4…", "identifierOrCriteria": "205",
                 "startAmount": "1", "endAmount": "1" } ],
    "consideration": [ { "itemType": 1, "token": "0x8335…" /* USDC */,
                         "identifierOrCriteria": "0", "startAmount": "106746148",
                         "endAmount": "106746148", "recipient": "0xE692…" } ],
    "totalOriginalConsiderationItems": 1,
    "salt": "0x…", "conduitKey": "0x0000…0000", "counter": "0"
  },
  "signature": "0x…"                               // 65 bytes (r,s,v)
}
```

- `offer[0]` is the lANTS position NFT (ERC721, `itemType` 2, contract
  `0x8bf4d39aa13f3cb03f87d9500767fbc4d0940652`).
- `consideration[0]` is USDC (ERC20, `itemType` 1) to the seller — a fixed-price sale.
- `orderType` 0 with `zone == 0`, `zoneHash == 0`, `conduitKey == 0` is a fully-open
  order: anyone can fulfill it with no zone check and no conduit.
- The competitor charges **0%**: no extra consideration item, no fee recipient.

Their SPA fulfils client-side through the `@opensea/seaport-js` SDK
(`fulfillOrder`/`fulfillBasicOrder`) against `protocolAddress` above. Fulfillment is
on-chain and does not go through their backend.

## Clean aggregation path (no fee war)

1. Read `GET /api/lants-market` to render their listings in our UI (sort by `perAntUsd`,
   name, lock, APR, as planned).
2. On Buy, `GET /api/lants/order/{tokenId}` for the raw order, then call Seaport
   `fulfillBasicOrder`/`fulfillOrder` from our own wallet client. The buyer pays the
   listing price + gas, no platform fee — identical economics to buying on their site.
3. Keep our own 1%-seller lots as a separate, clearly-marked offer, not mixed into the
   same sort as a "cheaper/equal" comparison.

## Verified facts

- `Access-Control-Allow-Origin: *` on the API — callable from `lants.eth.limo` directly.
- Cloudflare-fronted (`Server: cloudflare`); responses are JSON with `ETag`. No API key
  header observed on GET endpoints.
- 15 active listings of 483 positions at capture time; 0 open offers.
- No Seaport/OpenSea/Reservoir/GraphQL SDK code in the main bundle — order assembly
  (`listLants`) uses the Seaport SDK client-side, but reading/fulfilling an existing
  order only needs the canonical Seaport contract ABI (`fulfillOrder` /
  `fulfillBasicOrder`).

## Caveats / next checks

- The feed is their backend; it can change or be gated at any time. Treat it as a hard
  read dependency with **no on-chain fallback for discovery**: Seaport orders are signed
  off-chain and only fills, cancels and counter bumps emit events. The chain is used only
  to verify an order (`getOrderStatus`, `getCounter`, `ownerOf`, `isApprovedForAll`).
- Confirm decimals on `priceWei` (USDC 6) before touching amounts; the listing price
  `106746148` == `106.746148 USDC` matches `perAntUsd 0.14 × amount 762.47`.
- Offers (`offeredCount: 0`) use a separate flow (`/api/lants/offer*`); not needed for
  the initial aggregation scope.
