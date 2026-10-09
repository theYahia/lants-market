// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {RebateClaims} from "../src/RebateClaims.sol";
import {TestMerkle} from "./TestMerkle.sol";
import {MockUSDC} from "./MockUSDC.sol";

// Invariant: the contract's USDC balance always equals sum over campaigns of
// (funded - claimed). Actions drive the full lifecycle (create, fund, finalize,
// claim, cancel, sweep, warp) with fuzzed orders and amounts.
//
/// forge-config: default.invariant.runs = 64
/// forge-config: default.invariant.depth = 128
contract RebateClaimsInvariantTest is Test {
    MockUSDC usdc;
    RebateClaims claims;
    address seller;

    uint256[] ids;
    uint256 constant LEAF_SUM = 190e6; // 100 + 50 + 25 + 15

    // Ghost counters: prove the fuzzer exercised every lifecycle path.
    uint256 ghostCreated;
    uint256 ghostFundedOps;
    uint256 ghostClaims;
    uint256 ghostCancels;
    uint256 ghostSweeps;

    address[4] buyers;
    uint256[4] amounts = [100e6, 50e6, 25e6, 15e6];
    bytes32[] leaves;

    function setUp() public {
        usdc = new MockUSDC();
        claims = new RebateClaims(address(usdc));
        seller = makeAddr("seller");
        vm.deal(address(this), 1_000 ether); // invariant calls are real txs on a fork
        targetContract(address(this));
        targetSender(address(this)); // pin the fuzzer's caller to a funded address
        for (uint256 i = 0; i < 4; i++) {
            buyers[i] = makeAddr(string(abi.encodePacked("inv-buyer", i)));
            leaves.push(keccak256(abi.encodePacked(i, buyers[i], amounts[i])));
        }
    }

    // Deterministic proof that the fuzzed actions can reach every lifecycle
    // path (so the invariant above is not vacuous).
    function test_paths_are_reachable() public {
        action_create(200e6, 1 days, 2 days, 14 days); // id 0
        action_fund(0, 10e6);
        action_finalize(0);
        action_claim(0, 0);
        vm.warp(block.timestamp + 15 days);
        action_sweep(0);

        action_create(10e6, 1 days, 2 days, 14 days); // id 1
        action_cancel(1);

        assertGt(ghostCreated, 1, "created");
        assertGt(ghostFundedOps, 0, "topped up");
        assertGt(ghostClaims, 0, "claimed");
        assertGt(ghostSweeps, 0, "swept");
        assertGt(ghostCancels, 0, "cancelled");
    }

    function _campaign(uint256 id)
        internal
        view
        returns (
            uint256 cancelDeadline,
            uint256 finalizeDeadline,
            bytes32 root,
            uint256 total,
            uint256 funded,
            uint256 claimed,
            uint256 sweepAfter
        )
    {
        (, , cancelDeadline, finalizeDeadline, , , , root, total, funded, claimed, sweepAfter) =
            claims.campaign(id);
    }

    function _pick(uint256 pick) internal view returns (uint256 id) {
        return ids[pick % ids.length];
    }

    function action_create(uint256 fundAmt, uint256 cancelAfter, uint256 finalizeAfter, uint256 window)
        public
    {
        fundAmt = bound(fundAmt, 1, 1_000e6);
        cancelAfter = bound(cancelAfter, 1, 7 days);
        finalizeAfter = bound(finalizeAfter, cancelAfter + 1, cancelAfter + 30 days);
        window = bound(window, 7 days, 30 days);

        vm.startPrank(seller);
        usdc.mint(seller, fundAmt);
        usdc.approve(address(claims), fundAmt);
        uint256 id = claims.createCampaignAndFund(
            block.timestamp + cancelAfter, block.timestamp + finalizeAfter, window, 28, "44694", fundAmt
        );
        vm.stopPrank();
        ids.push(id);
        ghostCreated++;
    }

    function action_fund(uint256 pick, uint256 amt) public {
        if (ids.length == 0) return;
        uint256 id = _pick(pick);
        (, , bytes32 root, , , , ) = _campaign(id);
        if (root != bytes32(0)) return;
        amt = bound(amt, 1, 1_000e6);
        vm.startPrank(seller);
        usdc.mint(seller, amt);
        usdc.approve(address(claims), amt);
        claims.fund(id, amt);
        vm.stopPrank();
        ghostFundedOps++;
    }

    function action_finalize(uint256 pick) public {
        if (ids.length == 0) return;
        uint256 id = _pick(pick);
        (, uint256 finalizeDeadline, bytes32 root, , uint256 funded, , ) = _campaign(id);
        if (root != bytes32(0) || block.timestamp > finalizeDeadline || funded < LEAF_SUM) return;
        vm.prank(seller);
        claims.setMerkleRoot(id, TestMerkle.root(leaves), LEAF_SUM);
    }

    function action_claim(uint256 pick, uint256 idx) public {
        if (ids.length == 0) return;
        uint256 id = _pick(pick);
        (, , bytes32 root, , , , uint256 sweepAfter) = _campaign(id);
        idx = bound(idx, 0, 3);
        if (root == bytes32(0) || block.timestamp >= sweepAfter || claims.isClaimed(id, idx)) return;
        vm.prank(buyers[idx]);
        claims.claim(id, idx, buyers[idx], amounts[idx], TestMerkle.proof(leaves, idx));
        ghostClaims++;
    }

    function action_cancel(uint256 pick) public {
        if (ids.length == 0) return;
        uint256 id = _pick(pick);
        (uint256 cancelDeadline, , bytes32 root, , uint256 funded, , ) = _campaign(id);
        if (root != bytes32(0) || block.timestamp >= cancelDeadline || funded == 0) return;
        vm.prank(seller);
        claims.cancel(id);
        ghostCancels++;
    }

    function action_sweep(uint256 pick) public {
        if (ids.length == 0) return;
        uint256 id = _pick(pick);
        (, uint256 finalizeDeadline, bytes32 root, , uint256 funded, uint256 claimed, uint256 sweepAfter) =
            _campaign(id);
        bool ready = root != bytes32(0) ? block.timestamp >= sweepAfter : block.timestamp >= finalizeDeadline;
        if (!ready || funded == claimed) return;
        vm.prank(seller);
        claims.sweep(id);
        ghostSweeps++;
    }

    function action_warp(uint256 dt) public {
        vm.warp(block.timestamp + bound(dt, 1, 3 days));
    }

    function invariant_balance_matches_campaign_accounting() public view {
        uint256 accounted = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            (, , , , uint256 funded, uint256 claimed, ) = _campaign(ids[i]);
            accounted += funded - claimed;
        }
        assertEq(usdc.balanceOf(address(claims)), accounted, "USDC balance == sum(funded - claimed)");
    }

    function invariant_claimed_never_over_funded() public view {
        for (uint256 i = 0; i < ids.length; i++) {
            (, , bytes32 root, uint256 total, uint256 funded, uint256 claimed, ) = _campaign(ids[i]);
            assertLe(claimed, funded, "claimed <= funded");
            if (root != bytes32(0) && funded > 0) assertLe(total, funded, "total <= funded");
        }
    }
}
