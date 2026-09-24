// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VexyMarketplace} from "../src/VexyMarketplace.sol";

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function approve(address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract ForkMarketTest is Test {
    address constant POOLS = 0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    VexyMarketplace market;
    address seller;
    address buyer;

    function setUp() public {
        market = new VexyMarketplace();
        seller = IERC721(POOLS).ownerOf(27);
        buyer = makeAddr("buyer");
        deal(USDC, buyer, 1_000e6);
    }

    function test_OwnerIsReal() public view {
        assertTrue(seller != address(0), "seller must exist on fork");
    }

    function test_ListAndBuy() public {
        // List position 27 for 100 USDC, no dutch slope
        vm.prank(seller);
        IERC721(POOLS).approve(address(market), 27);
        vm.prank(seller);
        uint256 id = market.createListing(POOLS, 27, USDC, 100e6, 0, 0, 1 days);

        uint256 fee = (100e6 * market.FEE()) / 1e18; // 1 percent = 1 USDC
        uint256 sellerBefore = IERC20(USDC).balanceOf(seller);
        uint256 feeBefore = IERC20(USDC).balanceOf(market.feeRecipient());

        // Buyer approves and purchases
        vm.startPrank(buyer);
        IERC20(USDC).approve(address(market), 100e6);
        market.buyListing(id);
        vm.stopPrank();

        // NFT moved to buyer
        assertEq(IERC721(POOLS).ownerOf(27), buyer, "nft should go to buyer");
        // Seller got price minus fee
        assertEq(
            IERC20(USDC).balanceOf(seller) - sellerBefore,
            100e6 - fee,
            "seller payout wrong"
        );
        // Fee recipient got exactly the fee
        assertEq(
            IERC20(USDC).balanceOf(market.feeRecipient()) - feeBefore,
            fee,
            "fee payout wrong"
        );
    }

    function test_DutchAuctionPriceFalls() public {
        // List with descending slope: 1e18 over 1 day, then fixed for 1 day
        vm.prank(seller);
        IERC721(POOLS).approve(address(market), 27);
        vm.prank(seller);
        uint256 id = market.createListing(POOLS, 27, USDC, 100e6, 1e18, 1 days, 1 days);

        uint256 p0 = market.listingPrice(id);
        vm.warp(block.timestamp + 12 hours);
        uint256 p1 = market.listingPrice(id);

        assertTrue(p1 < p0, "price should fall during slope");
        assertTrue(p1 >= 100e6, "price must not fall below base price");
    }
}