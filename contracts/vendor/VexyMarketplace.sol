// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import "./Owned.sol";

/// @title Vexy ERC721 Marketplace
/// @author @0xValde
contract VexyMarketplace is Owned {
    uint256 public constant FEE = 0.01 ether;

    struct Listing {
        address seller;
        uint96 sellerNftNonce;
        address nftCollection;
        uint256 nftId;
        address currency;
        uint96 slopeMax;
        uint256 price;
        uint32 slopeDuration;
        uint32 fixedDuration;
        uint64 endTime;
        uint64 soldTime;
    }

    Listing[] public listings;
    mapping(address seller => mapping(address collection => mapping(uint256 nftId => uint96 nonce))) public
        sellerNftNonce;

    address public feeRecipient;

    event CreateListing(
        uint256 indexed listingId, address indexed nftCollection, uint256 indexed nftId, Listing listing
    );
    event SellerNonce(address indexed seller, address indexed nftCollection, uint256 indexed nftId, uint256 nonce);
    event FeeRecipientUpdated(address feeRecipient);
    event BuyListing(
        uint256 indexed listingId,
        address indexed nftCollection,
        uint256 indexed nftId,
        address buyer,
        address currency,
        uint256 price,
        uint256 fee
    );

    constructor() Owned(msg.sender) {
        feeRecipient = msg.sender;
        emit FeeRecipientUpdated(feeRecipient);
    }

    function createListing(
        address nftCollection,
        uint256 nftId,
        address currency,
        uint256 price,
        uint96 slopeMax,
        uint32 slopeDuration,
        uint32 fixedDuration
    ) external returns (uint256 listingId) {
        require(ERC721(nftCollection).ownerOf(nftId) == msg.sender, "Marketplace: Only owner can list NFT");
        require(slopeDuration + fixedDuration <= 60 days, "Marketplace: Max 60 day combined listing time");
        listingId = listings.length;
        Listing memory listing = Listing({
            seller: msg.sender,
            nftCollection: nftCollection,
            nftId: nftId,
            sellerNftNonce: ++sellerNftNonce[msg.sender][nftCollection][nftId],
            currency: currency,
            slopeMax: slopeMax,
            price: price,
            slopeDuration: slopeDuration,
            fixedDuration: fixedDuration,
            endTime: uint64(block.timestamp + fixedDuration + slopeDuration),
            soldTime: 0
        });
        listings.push(listing);
        require(listingPrice(listingId) > 0, "Marketplace: Listing would be free");
        emit SellerNonce(msg.sender, nftCollection, nftId, listing.sellerNftNonce);
        emit CreateListing(listingId, nftCollection, nftId, listing);
        return listingId;
    }

    function cancelNftListings(address nftCollection, uint256 nftId) external {
        uint256 newNonce = ++sellerNftNonce[msg.sender][nftCollection][nftId];
        emit SellerNonce(msg.sender, nftCollection, nftId, newNonce);
    }

    function buyListing(uint256 listingId) external {
        require(listingId < listings.length, "Marketplace: Listing does not exist");
        Listing memory listing = listings[listingId];
        address collection = listing.nftCollection;
        uint256 nftId = listing.nftId;
        uint256 _sellerNftNonce = sellerNftNonce[listing.seller][collection][nftId];
        require(listing.soldTime == 0, "Marketplace: Listing was sold");
        require(listing.endTime >= block.timestamp, "Marketplace: Listing is expired");
        require(listing.sellerNftNonce == _sellerNftNonce, "Marketplace: Listing is outdated");

        uint256 price = listingPrice(listingId);
        uint256 fee = price * FEE / 1e18;
        assert(price >= listing.price);

        listings[listingId].soldTime = uint64(block.timestamp);

        ERC20(listing.currency).transferFrom(msg.sender, listing.seller, price - fee);
        ERC20(listing.currency).transferFrom(msg.sender, feeRecipient, fee);
        ERC721(listing.nftCollection).transferFrom(listing.seller, msg.sender, listing.nftId);

        emit BuyListing(listingId, listing.nftCollection, nftId, msg.sender, listing.currency, price, fee);
    }

    function listingPrice(uint256 listingId) public view returns (uint256) {
        require(listingId < listings.length, "Marketplace: Listing does not exist");
        Listing storage listing = listings[listingId];
        uint256 basePrice = listing.price;
        uint256 endTime = listing.endTime;
        uint256 fixedDuration = listing.fixedDuration;
        uint256 slopeDuration = listing.slopeDuration;
        if (slopeDuration == 0 || block.timestamp >= endTime - fixedDuration) {
            return basePrice; // After slope, so base price
        }
        // Work backwards from end of slope to find how much of slope has elapsed
        uint256 r = (endTime - fixedDuration - block.timestamp) * 1e12 / slopeDuration;
        uint256 price = basePrice + (basePrice * r * r * r / 1e36) * listing.slopeMax / 1e18;
        return price >= basePrice ? price : basePrice;
    }

    function listingsLength() external view returns (uint256) {
        return listings.length;
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(address(_feeRecipient) != address(0), "Marketplace: Invalid fee recipient");
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }
}

// Valde Vexy!

interface ERC721 {
    function transferFrom(address from, address to, uint256 id) external;
    function ownerOf(uint256 id) external view returns (address owner);
}

interface ERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}