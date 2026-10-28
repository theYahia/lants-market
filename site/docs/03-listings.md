# Listings

A listing records who is selling which NFT, at what price, in USDC, and
until when.

## Creating a listing

Listings are created with:

```
createListing(
  address nftCollection,
  uint256 nftId,
  address currency,       // must be USDC
  uint256 price,
  uint96  slopeMax,
  uint32  slopeDuration,
  uint32  fixedDuration
)
```

Requirements enforced by the contract:

| Check                                        | Meaning                                  |
|----------------------------------------------|------------------------------------------|
| `ownerOf(nftId) == msg.sender`               | You must own the NFT to list it.         |
| `slopeDuration + fixedDuration <= 60 days`   | Total lifetime is capped at 60 days.     |
| `currency == USDC`                            | Only USDC is accepted.                    |
| `listingPrice(listingId) > 0`                | A zero-price listing cannot be created.  |

The NFT is not moved on listing. Remember to approve the marketplace
(`setApprovalForAll`), or sales will revert.

## Fixed price vs. Dutch auction

The contract supports two pricing modes through the same function.

**Fixed price.** With `slopeMax = 0` and `slopeDuration = 0`,
`listingPrice` always returns the base `price`. The listing form on this
site creates fixed-price listings only.

**Dutch auction.** With a non-zero `slopeMax` and `slopeDuration`, the
price starts above the base price and falls to it along a cubic curve:

```
r = (endTime - fixedDuration - now) * 1e12 / slopeDuration
price = basePrice + (basePrice * r^3 / 1e36) * slopeMax / 1e18
```

Once the slope period has passed, `listingPrice` returns the base `price`.
Dutch-auction listings are not offered by the form and must be created by
calling the contract directly.

## Buying a listing

```
buyListing(uint256 listingId)
```

Conditions that must all hold:

| Check                                   | If it fails                       |
|-----------------------------------------|-----------------------------------|
| `soldTime == 0`                         | Already sold.                     |
| `endTime >= block.timestamp`            | Listing has expired.              |
| `sellerNftNonce == current nonce`       | Listing was cancelled.            |

When all conditions hold, the buyer pays `price` in USDC. The seller
receives `price - fee`, the fee recipient receives `fee`, and the NFT is
transferred from seller to buyer in the same transaction.

## Aggregated Seaport lots

The storefront also shows active orders from the ecosystem front
(antseedmarkets.com) in the same grid as our own lots, sorted by price per
ANTS. The source badge says where an order lives.

| Source | Fee | Where the order lives |
|---|---|---|
| lANTS (this market) | 1% paid by the seller | VexyMarketplace on Base |
| Seaport | 0% platform fee | Seaport 1.6, signed off-chain |

The buyer price is final in both cases: the 1% is deducted from the seller's
proceeds, not added to the buyer's price. Only the seller-facing copy in the
list form mentions it.

Seaport lots come from the front's public feed. That feed is the **only
discovery source**: Seaport orders are signed off-chain, so nothing can be
recovered from chain logs. The chain is used only to verify an order
(`getOrderStatus`, `getCounter`, `ownerOf`, `isApprovedForAll`). If the feed is
unavailable, Seaport lots are hidden with a banner and our own lots keep
rendering.

Buying a Seaport lot calls `fulfillBasicOrder` on Seaport 1.6 with no platform
fee. Only orders that pass every check are offered with a Buy button here;
anything else links out to antseedmarkets.com. While `SEAPORT_BUY_ENABLED` is
false in `market-config.mjs`, every Seaport card links out.

## MC / FDV on each lot

The table shows what a lot's price implies for ANTS as a whole:

```
price per ANTS = price / ANTS in the position
MC  = price per ANTS * totalSupply()   // ANTS minted so far, read live from the token
FDV = price per ANTS * MAX_SUPPLY()    // 1,040,000,000 ANTS
```

Example: 10 ANTS for 0.10 USDC is $0.01 per ANTS, an MC of about $1.19M and
an FDV of about $10.4M. Trades between our own wallets are labelled
*internal* and are not counted in volume or in the Implied FDV tile.
