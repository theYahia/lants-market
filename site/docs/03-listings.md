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
