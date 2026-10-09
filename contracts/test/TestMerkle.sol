// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

// Sorted-pair Merkle tree matching the platform builder and the canonical
// Uniswap merkle-distributor convention. Leaves are the raw hashed leaf
// values (keccak256(abi.encodePacked(index, account, amount))).
library TestMerkle {
    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    // Root for a full power-of-two-aware tree; odd nodes are lifted unhashed.
    function root(bytes32[] memory leaves) internal pure returns (bytes32) {
        while (leaves.length > 1) {
            bytes32[] memory next = new bytes32[]((leaves.length + 1) / 2);
            for (uint256 i = 0; i < leaves.length; i += 2) {
                if (i + 1 < leaves.length) {
                    next[i / 2] = _hashPair(leaves[i], leaves[i + 1]);
                } else {
                    next[i / 2] = leaves[i];
                }
            }
            leaves = next;
        }
        return leaves[0];
    }

    // Proof for the given leaf index. Only correct for power-of-two leaf counts
    // (used for test fixtures where trees are kept full).
    function proof(bytes32[] memory leaves, uint256 index) internal pure returns (bytes32[] memory) {
        bytes32[] memory out = new bytes32[](depth(leaves.length));
        uint256 idx = index;
        bytes32[] memory level = leaves;
        uint256 n = 0;
        while (level.length > 1) {
            uint256 peerIdx = idx ^ 1;
            bytes32 peer = peerIdx < level.length ? level[peerIdx] : bytes32(0);
            out[n++] = peer;
            bytes32[] memory next = new bytes32[]((level.length + 1) / 2);
            for (uint256 i = 0; i < level.length; i += 2) {
                if (i + 1 < level.length) {
                    next[i / 2] = _hashPair(level[i], level[i + 1]);
                } else {
                    next[i / 2] = level[i];
                }
            }
            level = next;
            idx /= 2;
        }
        return out;
    }

    function depth(uint256 count) internal pure returns (uint256) {
        uint256 d = 0;
        uint256 c = count;
        while (c > 1) {
            c = (c + 1) / 2;
            d++;
        }
        return d;
    }
}
