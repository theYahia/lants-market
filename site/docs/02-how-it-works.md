# How it works

The marketplace lets an NFT owner list a token for sale in USDC without
transferring the token into escrow. The NFT stays in the seller's wallet
until a purchase completes.

## Roles and custody

The seller keeps ownership of the NFT for the entire life of a listing. To
make a sale possible, the seller must approve the marketplace to move the
token:

```
setApprovalForAll(market, true)   // selector 0xa22cb465
```

Without this approval a buyer's transaction reaches the payment stage and
then reverts on the ERC-721 transfer. No funds change hands in a reverted
transaction.

## Currency and price format

All listings are priced in USDC. USDC uses 6 decimals, so a price is an
integer count of micro-dollars:

| Price   | Value passed to the contract |
|---------|------------------------------|
| $0.10   | 100000                       |
| $1.00   | 1000000                      |
| $100.00 | 100000000                    |

The contract rejects any currency other than USDC.

## Fee

A fixed 1% fee applies to every sale:

```
FEE = 0.01 ether
fee = price * FEE / 1e18   // exactly 1% of price
```

On purchase the buyer pays `price`. The seller receives `price - fee`, and
the fee recipient receives `fee`. Both transfers happen in the same
transaction.

## Lifetime

Every listing has an end time set at creation:

```
endTime = block.timestamp + fixedDuration + slopeDuration
```

The combined duration cannot exceed 60 days. After `endTime` the listing
can no longer be bought; a purchase attempt reverts.

## Cancellation

A seller cancels by calling:

```
cancelNftListings(nftCollection, nftId)
```

This increments the seller's nonce for that NFT. Every prior listing on
that token no longer matches the current nonce and becomes invalid.
Cancellation costs only gas.

It does not delete anything. The listing record stays in the `listings`
array, and the transaction history remains on-chain permanently. "Invalid"
means unbuyable, not removed.