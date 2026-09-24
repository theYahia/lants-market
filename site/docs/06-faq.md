# FAQ

### What is a lANTS position, and why does this market exist?
A position is an ERC-721 from the AntseedSellerPools collection
(0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652 on Base, chainId 8453). It represents
ANTS locked by staking into a seller pool. ANTS themselves are non-transferable
between wallets: transfersEnabled() is false and a transfer reverts with
TransfersNotEnabled(). The stake contract sits in the transfer whitelist, so the
position NFT is the only way to hand locked ANTS to another wallet. This market
exists so that NFT can change hands.

### How do I get a position?
The main path is to stake: call stake(agentId, amount, stakeEpochs) on the pool,
which mints the position NFT to you. stakeEpochs runs from minStakeEpochs = 1 to
MAX_STAKE_EPOCHS = 104, where one epoch is one week. The position activates from
the next epoch: stakeActivationDelay = 1. The other path is to buy an existing
position from a listing here.

### How do I list a position for sale?
First call setApprovalForAll for the marketplace, VexyMarketplace
(0xC5BFc309a68dBf4e7eEca9BD91749d611c75C660); the NFT stays in your wallet. Then
call createListing(nftCollection, nftId, currency, price, slopeMax, slopeDuration,
fixedDuration). Settlement is in USDC
(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913, 6 decimals). The seller pays a 1 %
fee on sale. slopeDuration + fixedDuration must be <= 60 days.

### What is the difference between a fixed price and a Dutch auction?
Fixed price: slopeMax = 0 and slopeDuration = 0. The price is constant.
Dutch auction: slopeMax and slopeDuration are non-zero. price is the base price,
which is also the final and minimum price; the auction starts above it and
declines toward it.

### How does the Dutch auction price actually move?
r is the remaining slope time: r = (endTime - fixedDuration - now) * 1e12 /
slopeDuration. The price is price + (price * r^3 / 1e36) * slopeMax / 1e18. Early
in the slope r is near 1, so the price is at its maximum and falls fast; toward
the end it flattens out at the base price. The r^3 term means most of the drop
happens near the start.

### How do I buy a listing?
Buyers fill a listing directly at its current price, paid in USDC. There is no
bidding and no offer system: no offer contract exists.

### How do I cancel a listing?
Call cancelNftListings(nftCollection, nftId). It cancels ALL of your listings on
that NFT at once by incrementing the nonce; you cannot cancel a single lot by id.
The records are not deleted, they just become unbuyable. The only cost is gas.

### How much will my position sell for?
We don't know, and we won't pretend to. **There have been zero sales.** There is
no trade history, no volume, and no discount range to quote. The first sale will
be the first data point. Anyone citing an expected price right now is guessing.

### Are there any listings right now?
Currently none. The market is empty. When it isn't, listings appear here
automatically from on-chain data. There is no offer system: buyers fill listings
directly, they do not bid.

### How does the interface read data?
This site is static. All reads come from your connected wallet or a public RPC
endpoint. There is no backend, no database, no server-side indexer of ours.

### Who makes this, and what do you collect about me?
One person, with help from AntSeed network models. There is no company and no team.
We collect nothing: no accounts, no analytics, no cookies, no logs.
See Privacy & Terms.
