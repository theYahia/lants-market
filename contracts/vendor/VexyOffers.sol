// SPDX-License-Identifier: Unlicenced
pragma solidity 0.8.28;

import "./FeeReceiver.sol";

/// @title Vexy ERC721 Offers
/// @author @0xValde
contract VexyOffers is FeeReceiver {
    uint256 public constant FEE = 0.01 ether; // 1%

    IERC721 immutable nft;
    IERC20 immutable currency;
    IVeLens immutable lens;

    struct Offer {
        uint128 budget; // Max spend on matching offers
        address buyer; // payer
        uint96 priceMultipler; // 1e18 denominated locked to price
        uint128 lockedMin; // Min size of NFT lock
        uint128 lockedMax; // Max size of NFT lock
        uint128 lockTimeMax; // Max duration of NFT lock
        uint64 end; // Offer expires
    }

    Offer[] public offers;

    event OfferCreated(uint256 indexed offerId, Offer offer);
    event BudgetChange(uint256 indexed offerId, uint256 budget);
    event OfferSale(
        uint256 indexed offerId,
        address seller,
        uint256 nftId,
        uint256 locked,
        uint256 duration,
        uint256 price,
        uint256 fee
    );

    constructor(address _nft, address _currency, address _lens) {
        nft = IERC721(_nft);
        currency = IERC20(_currency);
        lens = IVeLens(_lens);
        offers.push(Offer(0, address(0), 0, 0, 0, 0, 0));
    }

    /**
     * @notice Create an offer to buy NFTs
     * @param budget Max spend on matching offers
     * @param priceMultipler 1e18 denominated multiplier on locked amount for price
     * @param lockedMin Min size of NFT lock
     * @param lockedMax Max size of NFT lock
     * @param lockTimeMax Max duration of NFT lock. 0 for any duration
     * @param duration How many seconds this offer is valid for
     * @param replaceOfferId Optional offer to remove (allows updating in one tx)
     * @return offerId
     */
    function createOffer(
        uint128 budget,
        uint96 priceMultipler,
        uint128 lockedMin,
        uint128 lockedMax,
        uint128 lockTimeMax,
        uint64 duration,
        uint256 replaceOfferId
    ) external returns (uint256 offerId) {
        if (replaceOfferId != 0) {
            removeOffer(replaceOfferId);
        }
        require(duration <= 60 days, "Offers: Duration too long");
        Offer memory offer = Offer({
            budget: budget,
            buyer: msg.sender,
            priceMultipler: priceMultipler,
            lockedMin: lockedMin,
            lockedMax: lockedMax,
            lockTimeMax: lockTimeMax,
            end: uint64(block.timestamp) + duration
        });
        offers.push(offer);
        offerId = offers.length - 1;
        emit OfferCreated(offerId, offer);
        emit BudgetChange(offerId, budget);
        return offerId;
    }

    function removeOffer(uint256 offerId) public returns (bool) {
        require(offers[offerId].buyer == msg.sender, "Offers: Only buyer can remove offer");
        offers[offerId].budget = 0;
        emit BudgetChange(offerId, 0);
        return true;
    }

    function sellNFT(uint256 offerId, uint256 nftId) external returns (bool) {
        (uint256 locked, uint256 lockDuration) = lens.lockInfo(nftId);
        Offer memory offer = offers[offerId];
        uint256 price = locked * offer.priceMultipler / 1e18;
        uint256 fee = price * FEE / 1e18;
        require(offer.end >= block.timestamp, "Offer has expired");
        require(locked > 0, "Offers: NFT must have locked tokens");
        require((locked >= offer.lockedMin) && (locked <= offer.lockedMax), "Offers: Lock size not in range");
        require((lockDuration <= offer.lockTimeMax) || (offer.lockTimeMax == 0), "Offers: Lock duration too long");
        require(price <= offer.budget, "Offers: Price higher than spend cap");
        require(price > 0, "Offers: Price must be greater than 0");
        require(price <= type(uint128).max);

        offers[offerId].budget = offer.budget - uint128(price);

        emit OfferSale(offerId, msg.sender, nftId, locked, lockDuration, price, fee);
        emit BudgetChange(offerId, offers[offerId].budget);

        nft.transferFrom(msg.sender, offer.buyer, nftId);
        currency.transferFrom(offer.buyer, msg.sender, price - fee);
        currency.transferFrom(offer.buyer, feeReceiver, fee);
        return true;
    }

    function offerPrice(uint256 offerId, uint256 nftId) external view returns (uint256) {
        (uint256 locked,) = lens.lockInfo(nftId);
        Offer memory offer = offers[offerId];
        return locked * offer.priceMultipler / 1e18;
    }

    function offersLength() external view returns (uint256) {
        return offers.length;
    }
}

// Valde Vexy!

interface IVeLens {
    function lockInfo(uint256 nftId) external view returns (uint256 locked, uint256 duration);
}

interface IERC721 {
    function transferFrom(address from, address to, uint256 id) external;
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
