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
We don't predict prices. The data so far: one internal test trade on 2026-09-25
(50 ANTS for 1.00 USDC, between our own wallets, not counted in volume) and five
public lots of 10 ANTS at 0.10 USDC each, listed on 2026-09-26. Every lot shows
the MC and FDV its price implies. Anyone citing an expected price is guessing.

### Are there any listings right now?
Open the Listings tab: listings are read live from the chain, and sold or
cancelled ones are labelled. There is no offer system: buyers fill listings
directly, they do not bid.

### What do MC and FDV mean on a lot?
They translate a lot's price into a valuation of ANTS: price per ANTS times ANTS
minted so far (MC) and times the 1.04B max supply (FDV). A bare USDC price for a
position is hard to compare; these two numbers make lots of any size comparable.

### Why are Split and Move disabled for my position?
The position is on max-lock. The contract reverts split and move on a max-locked
position, so the site disables those buttons. Split or move before enabling max-lock.

### How does the interface read data?
This site is static. All reads come from your connected wallet or a public RPC
endpoint. There is no backend, no database, no server-side indexer of ours.

### Who makes this, and what do you collect about me?
One person, with help from AntSeed network models. There is no company and no team.
We collect nothing: no accounts, no analytics, no cookies, no logs.
See Privacy & Terms.
