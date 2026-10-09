// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {RebateClaims} from "../src/RebateClaims.sol";
import {TestMerkle} from "./TestMerkle.sol";

interface IUSDC {
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

// Fork test on Base mainnet with the real USDC token
// (0x833589fCD6eDd6aF70fA7dA1d62C02960f2913). Run with:
//   forge test --match-contract RebateClaimsForkTest --fork-url https://mainnet.base.org
// The contract's canonical claim core must hold against the real ERC20 too.
contract RebateClaimsForkTest is Test {
    // Canonical USDC on Base (verified on-chain: symbol()==USDC, 6 decimals).
    address constant USDC_ADDR = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    RebateClaims claims;
    address seller;
    address buyer1;
    address buyer2;

    bytes32[] leaves;
    uint256[] amounts = [100e6, 50e6, 25e6];
    address[] buyers;

    function setUp() public {
        vm.createSelectFork(vm.envOr("FORK_URL", string("https://mainnet.base.org")));

        IUSDC usdc = IUSDC(USDC_ADDR);
        assertEq(usdc.symbol(), "USDC", "real USDC symbol");
        assertEq(usdc.decimals(), 6, "real USDC decimals");
        assertTrue(USDC_ADDR.code.length > 0, "USDC has code on fork");

        claims = new RebateClaims(USDC_ADDR);

        seller = makeAddr("seller");
        buyer1 = makeAddr("buyer1");
        buyer2 = makeAddr("buyer2");

        buyers = new address[](3);
        buyers[0] = buyer1;
        buyers[1] = buyer2;
        buyers[2] = makeAddr("buyer3");

        leaves = new bytes32[](3);
        for (uint256 i = 0; i < 3; i++) {
            leaves[i] = keccak256(abi.encodePacked(uint256(i), buyers[i], amounts[i]));
        }
    }

    function _fundCampaign(uint256 amt) internal returns (uint256 id) {
        vm.startPrank(seller);
        deal(USDC_ADDR, seller, amt);
        IUSDC(USDC_ADDR).approve(address(claims), amt);
        id = claims.createCampaignAndFund(block.timestamp + 1 days, block.timestamp + 2 days, 14 days, 27, "52894", amt);
        vm.stopPrank();
    }

    function test_ForkLifecycleWithRealUsdc() public {
        uint256 total = 175e6;
        uint256 id = _fundCampaign(total);
        vm.prank(seller);
        claims.setMerkleRoot(id, TestMerkle.root(leaves), total);

        // Claim a leaf with real USDC.
        bytes32[] memory p = TestMerkle.proof(leaves, 0);
        uint256 before = IUSDC(USDC_ADDR).balanceOf(buyer1);
        vm.prank(buyer1);
        claims.claim(id, 0, buyer1, amounts[0], p);
        assertEq(IUSDC(USDC_ADDR).balanceOf(buyer1) - before, amounts[0], "real USDC paid out");

        // Sweep the rest after the window.
        vm.warp(block.timestamp + 14 days + 1);
        uint256 sellerBefore = IUSDC(USDC_ADDR).balanceOf(seller);
        vm.prank(seller);
        claims.sweep(id);
        assertEq(IUSDC(USDC_ADDR).balanceOf(seller) - sellerBefore, total - amounts[0], "sweep unclaimed");
    }

    function test_ForkInvalidProofRevertsOnRealUsdc() public {
        uint256 total = 100e6;
        uint256 id = _fundCampaign(total);
        vm.prank(seller);
        claims.setMerkleRoot(id, TestMerkle.root(leaves), total);

        bytes32[] memory bad = new bytes32[](1);
        vm.expectRevert(RebateClaims.InvalidProof.selector);
        vm.prank(buyer1);
        claims.claim(id, 0, buyer1, amounts[0], bad);
    }
}
