// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {RebateClaims} from "../src/RebateClaims.sol";
import {TestMerkle} from "./TestMerkle.sol";
import {MockUSDC} from "./MockUSDC.sol";

// Sorted-pair Merkle tree matches the platform builder convention; see
// TestMerkle.sol (imported above).

contract RebateClaimsTest is Test {
    MockUSDC usdc;
    RebateClaims claims;
    address seller;
    address buyer1;
    address buyer2;
    address buyer3;
    address other;

    uint256 cancelDeadline;
    uint256 finalizeDeadline;
    uint256 claimWindow = 14 days;

    // Tree leaves for buyers (power of two -> clean sorted-pair proofs), hashed.
    bytes32[] leaves;
    uint256[] amounts = [100e6, 50e6, 25e6, 15e6];
    address[] buyers;

    function setUp() public {
        usdc = new MockUSDC();
        claims = new RebateClaims(address(usdc));

        seller = makeAddr("seller");
        buyer1 = makeAddr("buyer1");
        buyer2 = makeAddr("buyer2");
        buyer3 = makeAddr("buyer3");
        other = makeAddr("other");

        // Epoch framing: cancel by +1 day, finalize by +2 days.
        cancelDeadline = block.timestamp + 1 days;
        finalizeDeadline = block.timestamp + 2 days;

        buyers = new address[](4);
        buyers[0] = buyer1;
        buyers[1] = buyer2;
        buyers[2] = buyer3;
        buyers[3] = other;

        leaves = new bytes32[](4);
        for (uint256 i = 0; i < 4; i++) {
            leaves[i] = keccak256(abi.encodePacked(uint256(i), buyers[i], amounts[i]));
        }
    }

    function _usdc(address a) internal view returns (uint256) {
        return usdc.balanceOf(a);
    }

    function _claimed(uint256 id) internal view returns (uint256) {
        (, , , , , , , , , , uint256 claimed, ) = claims.campaign(id);
        return claimed;
    }

    function _funded(uint256 id) internal view returns (uint256) {
        (, , , , , , , , , uint256 funded, , ) = claims.campaign(id);
        return funded;
    }

    function _pendingOwner(uint256 id) internal view returns (address) {
        (, address pendingOwner, , , , , , , , , , ) = claims.campaign(id);
        return pendingOwner;
    }

    function _owner(uint256 id) internal view returns (address) {
        (address owner, , , , , , , , , , , ) = claims.campaign(id);
        return owner;
    }

    function _root(uint256 id) internal view returns (bytes32) {
        (, , , , , , , bytes32 root, , , , ) = claims.campaign(id);
        return root;
    }

    function _newCampaign(uint256 fundedAmount) internal returns (uint256 id) {
        vm.startPrank(seller);
        usdc.mint(seller, fundedAmount);
        usdc.approve(address(claims), fundedAmount);
        id = claims.createCampaignAndFund(cancelDeadline, finalizeDeadline, claimWindow, 27, "52894", fundedAmount);
        vm.stopPrank();
    }

    function _finalize(uint256 id, uint256 total) internal {
        vm.prank(seller);
        claims.setMerkleRoot(id, TestMerkle.root(leaves), total);
    }

    // ---- sanity of campaign creation ----
    function test_CreateCampaignSanity() public {
        vm.startPrank(seller);
        usdc.mint(seller, 100e6);
        usdc.approve(address(claims), 100e6);

        vm.expectRevert(RebateClaims.InvalidParams.selector);
        claims.createCampaignAndFund(block.timestamp, finalizeDeadline, claimWindow, 27, "52894", 100e6);

        vm.expectRevert(RebateClaims.InvalidParams.selector);
        claims.createCampaignAndFund(cancelDeadline, cancelDeadline, claimWindow, 27, "52894", 100e6);

        vm.expectRevert(RebateClaims.InvalidParams.selector);
        claims.createCampaignAndFund(cancelDeadline, cancelDeadline + 40 days, claimWindow, 27, "52894", 100e6);

        vm.expectRevert(RebateClaims.InvalidParams.selector);
        claims.createCampaignAndFund(cancelDeadline, finalizeDeadline, 6 days, 27, "52894", 100e6);

        vm.expectRevert(RebateClaims.InvalidParams.selector);
        claims.createCampaignAndFund(cancelDeadline, finalizeDeadline, claimWindow, 27, "", 100e6);

        vm.expectRevert(RebateClaims.InvalidParams.selector);
        claims.createCampaignAndFund(cancelDeadline, finalizeDeadline, claimWindow, 27, "52894", 0);
        vm.stopPrank();
    }

    // ---- claim core ----
    function test_ClaimOk() public {
        uint256 id = _newCampaign(175e6);
        _finalize(id, 175e6);

        uint256 before = _usdc(buyer1);
        bytes32[] memory p = TestMerkle.proof(leaves, 0);
        vm.prank(buyer1);
        claims.claim(id, 0, buyer1, amounts[0], p);
        assertEq(_usdc(buyer1) - before, amounts[0], "buyer1 paid");
        assertTrue(claims.isClaimed(id, 0), "bitmap set");
        assertEq(_claimed(id), amounts[0], "accounting claimed");
    }

    function test_ClaimInvalidProof() public {
        uint256 id = _newCampaign(175e6);
        _finalize(id, 175e6);

        bytes32[] memory p = new bytes32[](1);
        vm.expectRevert(RebateClaims.InvalidProof.selector);
        vm.prank(buyer1);
        claims.claim(id, 0, buyer1, amounts[0], p);
    }

    function test_ClaimDouble() public {
        uint256 id = _newCampaign(175e6);
        _finalize(id, 175e6);

        bytes32[] memory p = TestMerkle.proof(leaves, 0);
        vm.prank(buyer1);
        claims.claim(id, 0, buyer1, amounts[0], p);
        vm.expectRevert(RebateClaims.AlreadyClaimed.selector);
        vm.prank(buyer1);
        claims.claim(id, 0, buyer1, amounts[0], p);
    }

    function test_ClaimAfterWindow() public {
        uint256 id = _newCampaign(175e6);
        _finalize(id, 175e6);

        vm.warp(block.timestamp + claimWindow + 1);
        bytes32[] memory p = TestMerkle.proof(leaves, 0);
        vm.expectRevert(RebateClaims.ClaimWindowFinished.selector);
        vm.prank(buyer1);
        claims.claim(id, 0, buyer1, amounts[0], p);
    }

    // Regression: claim and sweep must never be legal at the same timestamp,
    // otherwise a claim in the sweep block could be paid from other campaigns.
    function test_ClaimAndSweepDoNotOverlapAtBoundary() public {
        uint256 id = _newCampaign(175e6);
        _finalize(id, 175e6);

        vm.warp(block.timestamp + claimWindow); // == sweepAfter exactly
        bytes32[] memory p = TestMerkle.proof(leaves, 0);
        vm.expectRevert(RebateClaims.ClaimWindowFinished.selector);
        vm.prank(buyer1);
        claims.claim(id, 0, buyer1, amounts[0], p);

        uint256 sellerBefore = _usdc(seller);
        vm.prank(seller);
        claims.sweep(id);
        assertEq(_usdc(seller) - sellerBefore, 175e6, "sweep takes the whole unclaimed cap");
    }

    // ---- setMerkleRoot ----
    function test_SetMerkleRootRejectedCases() public {
        uint256 id = _newCampaign(300e6);

        // repeat / null root handled separately; underfunded first
        vm.expectRevert(RebateClaims.Underfunded.selector);
        _finalize(id, 500e6);

        // too late
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(RebateClaims.TooLate.selector);
        _finalize(id, 175e6);

        // null root
        vm.warp(block.timestamp - 3 days);
        vm.prank(seller);
        vm.expectRevert(RebateClaims.InvalidParams.selector);
        claims.setMerkleRoot(id, bytes32(0), 100e6);
    }

    function test_SetMerkleRootTwice() public {
        uint256 id = _newCampaign(175e6);
        _finalize(id, 175e6);
        vm.expectRevert(RebateClaims.AlreadyFinalized.selector);
        _finalize(id, 175e6);
    }

    // ---- cancel ----
    function test_CancelBeforeDeadlineRefunds() public {
        uint256 id = _newCampaign(100e6);
        uint256 sellerBefore = _usdc(seller);
        vm.prank(seller);
        claims.cancel(id);
        assertEq(_usdc(seller) - sellerBefore, 100e6, "refunded");
        assertEq(_funded(id), 0, "funded zeroed");
    }

    function test_CancelAfterDeadlineReverts() public {
        uint256 id = _newCampaign(100e6);
        vm.warp(block.timestamp + 1 days + 1);
        vm.expectRevert(RebateClaims.TooLate.selector);
        vm.prank(seller);
        claims.cancel(id);
    }

    function test_CancelNotOwner() public {
        uint256 id = _newCampaign(100e6);
        vm.expectRevert(RebateClaims.NotOwner.selector);
        vm.prank(other);
        claims.cancel(id);
    }

    function test_CancelAfterFinalizeReverts() public {
        uint256 id = _newCampaign(175e6);
        _finalize(id, 175e6);
        vm.expectRevert(RebateClaims.AlreadyFinalized.selector);
        vm.prank(seller);
        claims.cancel(id);
    }

    // ---- sweep ----
    function test_SweepFinalizedAfterWindow() public {
        uint256 id = _newCampaign(175e6);
        _finalize(id, 175e6);

        bytes32[] memory p = TestMerkle.proof(leaves, 0);
        vm.prank(buyer1);
        claims.claim(id, 0, buyer1, amounts[0], p);

        vm.warp(block.timestamp + claimWindow + 1);
        uint256 sellerBefore = _usdc(seller);
        vm.prank(seller);
        claims.sweep(id);
        assertEq(_usdc(seller) - sellerBefore, 175e6 - amounts[0], "sweep unclaimed only");
    }

    function test_SweepFinalizedEarlyReverts() public {
        uint256 id = _newCampaign(175e6);
        _finalize(id, 175e6);
        vm.expectRevert(RebateClaims.TooEarly.selector);
        vm.prank(seller);
        claims.sweep(id);
    }

    function test_SweepNotFinalizedAfterFinalizeDeadline() public {
        uint256 id = _newCampaign(100e6);
        vm.warp(block.timestamp + 2 days + 1);
        uint256 sellerBefore = _usdc(seller);
        vm.prank(seller);
        claims.sweep(id);
        assertEq(_usdc(seller) - sellerBefore, 100e6, "unfinalized sweep returns all");
    }

    function test_SweepNotFinalizedEarlyReverts() public {
        uint256 id = _newCampaign(100e6);
        vm.expectRevert(RebateClaims.TooEarly.selector);
        vm.prank(seller);
        claims.sweep(id);
    }

    function test_SweepNotOwnerReverts() public {
        uint256 id = _newCampaign(175e6);
        _finalize(id, 175e6);
        vm.warp(block.timestamp + claimWindow + 1);
        vm.expectRevert(RebateClaims.NotOwner.selector);
        vm.prank(other);
        claims.sweep(id);
    }

    // ---- two-step ownership transfer ----
    function test_TransferOwnership2Step() public {
        uint256 id = _newCampaign(100e6);

        // only owner can start
        vm.expectRevert(RebateClaims.NotOwner.selector);
        vm.prank(other);
        claims.transferCampaignOwnership(id, other);

        // start transfer to "newOwner"
        address newOwner = makeAddr("newOwner");
        vm.prank(seller);
        claims.transferCampaignOwnership(id, newOwner);
        assertEq(_pendingOwner(id), newOwner);

        // new transfer resets pendingOwner
        address newOwner2 = makeAddr("newOwner2");
        vm.prank(seller);
        claims.transferCampaignOwnership(id, newOwner2);
        assertEq(_pendingOwner(id), newOwner2);

        // only newOwner2 can accept; seller cannot
        vm.expectRevert(RebateClaims.NotPendingOwner.selector);
        vm.prank(seller);
        claims.acceptOwnership(id);

        vm.expectRevert(RebateClaims.NotPendingOwner.selector);
        vm.prank(other);
        claims.acceptOwnership(id);

        vm.prank(newOwner2);
        claims.acceptOwnership(id);
        assertEq(_owner(id), newOwner2);
        assertEq(_pendingOwner(id), address(0));

        // old owner lost rights: cannot fund/cancel now
        vm.expectRevert(RebateClaims.NotOwner.selector);
        vm.prank(seller);
        claims.cancel(id);
    }

    // ---- parallel campaigns ----
    function test_TwoCampaignsDoNotIntersect() public {
        uint256 id1 = _newCampaign(200e6);
        _finalize(id1, 190e6);

        // second campaign, different seller, its own distinct tree
        address seller2 = makeAddr("seller2");
        vm.startPrank(seller2);
        usdc.mint(seller2, 100e6);
        usdc.approve(address(claims), 100e6);
        uint256 id2 = claims.createCampaignAndFund(block.timestamp + 3 days, block.timestamp + 4 days, claimWindow, 28, "999", 100e6);
        vm.stopPrank();

        // Second tree of four different leaves from a foreign buyer set.
        uint256[] memory amounts2 = new uint256[](4);
        amounts2[0] = 10e6;
        amounts2[1] = 20e6;
        amounts2[2] = 30e6;
        amounts2[3] = 40e6;
        bytes32[] memory leaves2 = new bytes32[](4);
        for (uint256 i = 0; i < 4; i++) {
            leaves2[i] = keccak256(abi.encodePacked(uint256(i), buyers[i], amounts2[i]));
        }
        vm.prank(seller2);
        claims.setMerkleRoot(id2, TestMerkle.root(leaves2), 100e6);

        // claim id1 leaf 0
        bytes32[] memory p = TestMerkle.proof(leaves, 0);
        vm.prank(buyer1);
        claims.claim(id1, 0, buyer1, amounts[0], p);
        assertTrue(claims.isClaimed(id1, 0), "id1 claimed");
        assertTrue(!claims.isClaimed(id2, 0), "id2 bitmap untouched");

        // id2 claim with id1's proof should fail (different root)
        vm.expectRevert(RebateClaims.InvalidProof.selector);
        vm.prank(buyer1);
        claims.claim(id2, 0, buyer1, amounts[0], p);
    }

    // ---- fuzz: full lifecycle accounting ----
    function test_FuzzLifecycleAccounting(uint256 fundAmt, uint256 total) public {
        fundAmt = bound(fundAmt, 1, 1e12);
        total = bound(total, 1, fundAmt); // total <= funded

        uint256 id = _newCampaign(fundAmt);
        _finalize(id, total);

        // claim leaves whose cumulative amount is covered by total
        uint256 claimable = 0;
        uint256 cumulative = 0;
        for (uint256 i = 0; i < leaves.length; i++) {
            if (cumulative + amounts[i] > total) break;
            bytes32[] memory p = TestMerkle.proof(leaves, i);
            vm.prank(buyers[i]);
            claims.claim(id, uint256(i), buyers[i], amounts[i], p);
            cumulative += amounts[i];
            claimable += amounts[i];
        }

        // balance check: contract holds funded - claimed
        assertEq(_usdc(address(claims)), fundAmt - claimable, "contract balances == funded - claimed");
        assertEq(_claimed(id), claimable, "accounting matches claimed");
    }
}
