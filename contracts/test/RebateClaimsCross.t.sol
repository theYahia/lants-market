// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {RebateClaims} from "../src/RebateClaims.sol";
import {MerkleProof} from "../vendor/oz/MerkleProof.sol";
import {MockUSDC} from "./MockUSDC.sol";

// Cross-test: the platform's JS tree builder (buildRebateTree in
// site/rebate-tree.mjs) exports a fixture to contracts/test/fixtures/. This
// test reads that fixture and claims every leaf on the deployed RebateClaims
// contract through its canonical claim core, proving the JS leaves/proofs are
// byte-compatible with Solidity abi.encodePacked + MerkleProof.verify.
// Regenerate the fixture with:
//   node scripts/site/gen-rebate-fixture.mjs
contract RebateClaimsCrossTest is Test {
    string constant FIXTURE = "test/fixtures/rebate-tree-3.json";
    // Keep in sync with the fixture's leaf count.
    uint256 constant MAX_LEAVES = 3;

    MockUSDC usdc;
    RebateClaims claims;
    address seller;

    bytes32 root;
    uint256 total;
    uint256 fundedMicro;
    uint256 claimWindow;

    uint256[] leafIndex;
    address[] leafAccount;
    uint256[] leafAmount;
    bytes32[][] leafProof;

    function setUp() public {
        string memory json = vm.readFile(FIXTURE);

        root = vm.parseJsonBytes32(json, ".root");
        total = vm.parseJsonUint(json, ".total");
        fundedMicro = vm.parseJsonUint(json, ".fundedMicro");
        claimWindow = vm.parseJsonUint(json, ".claimWindowDays") * 1 days;

        leafIndex = new uint256[](MAX_LEAVES);
        leafAccount = new address[](MAX_LEAVES);
        leafAmount = new uint256[](MAX_LEAVES);
        leafProof = new bytes32[][](MAX_LEAVES);

        for (uint256 i = 0; i < MAX_LEAVES; i++) {
            leafIndex[i] = vm.parseJsonUint(json, string.concat(".leaves[", vm.toString(i), "].index"));
            leafAccount[i] = vm.parseJsonAddress(json, string.concat(".leaves[", vm.toString(i), "].account"));
            leafAmount[i] = vm.parseJsonUint(json, string.concat(".leaves[", vm.toString(i), "].amount"));
            uint256 plen = vm.parseJsonUint(json, string.concat(".leaves[", vm.toString(i), "].proofCount"));
            leafProof[i] = new bytes32[](plen);
            for (uint256 j = 0; j < plen; j++) {
                leafProof[i][j] =
                    vm.parseJsonBytes32(json, string.concat(".leaves[", vm.toString(i), "].proof[", vm.toString(j), "]"));
            }
        }

        usdc = new MockUSDC();
        claims = new RebateClaims(address(usdc));

        seller = makeAddr("seller");
        vm.startPrank(seller);
        usdc.mint(seller, fundedMicro);
        usdc.approve(address(claims), fundedMicro);
        claims.createCampaignAndFund(block.timestamp + 1 days, block.timestamp + 2 days, claimWindow, 27, "52894", fundedMicro);
        claims.setMerkleRoot(0, root, total);
        vm.stopPrank();
    }

    function test_EveryJsLeafClaimsAndPays() public {
        for (uint256 i = 0; i < MAX_LEAVES; i++) {
            bytes32 node = keccak256(abi.encodePacked(leafIndex[i], leafAccount[i], leafAmount[i]));
            assertTrue(
                MerkleProof.verify(leafProof[i], root, node),
                string.concat("leaf ", vm.toString(i), " proof must verify")
            );

            uint256 before = usdc.balanceOf(leafAccount[i]);
            vm.prank(leafAccount[i]);
            claims.claim(0, leafIndex[i], leafAccount[i], leafAmount[i], leafProof[i]);
            assertEq(usdc.balanceOf(leafAccount[i]) - before, leafAmount[i], "paid the leaf amount");
            assertTrue(claims.isClaimed(0, leafIndex[i]), "bitmap set");
        }
        // accounting: contract holds funded - total after all leaves claimed
        assertEq(usdc.balanceOf(address(claims)), fundedMicro - total, "all leaves claimed from funded");
    }

    function test_ForgedJsProofReverts() public {
        bytes32[] memory bad = new bytes32[](1);
        vm.expectRevert(RebateClaims.InvalidProof.selector);
        vm.prank(leafAccount[0]);
        claims.claim(0, leafIndex[0], leafAccount[0], leafAmount[0], bad);
    }
}
