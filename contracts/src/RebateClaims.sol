// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.17;

import {IERC20} from "../vendor/oz/IERC20.sol";
import {SafeERC20} from "../vendor/oz/SafeERC20.sol";
import {MerkleProof} from "../vendor/oz/MerkleProof.sol";

/// @title RebateClaims
/// @notice One shared claims contract for the whole lants platform. Each
///         seller-epoch offer is a campaign inside it. The claim core below is
///         copied byte-for-byte from the canonical Uniswap MerkleDistributor
///         (GPL-3.0-or-later, see vendor), with campaign lifecycle additions
///         that are all gated on the campaign owner (the seller).
///
/// Core invariants:
///   - The contract has NO owner. Operators are powerless over funds.
///   - Only the campaign owner (seller) can create/fund/finalize/cancel/sweep
///     their own campaign. Claim is permissionless.
///   - The single token is USDC, fixed at construction.
///   - sum(funded - claimed) across campaigns == USDC.balanceOf(this), because
///     funds only move via fund/createCampaignAndFund and out via claim/sweep/
///     cancel. A plain ERC20 transfer to this address is not attributed and is
///     treated as lost (documented).
contract RebateClaims {
    using SafeERC20 for IERC20;

    error AlreadyClaimed();
    error InvalidProof();
    error ClaimWindowFinished();
    error InvalidParams();
    error Underfunded();
    error NotOwner();
    error TooEarly();
    error TooLate();
    error AlreadyFinalized();
    error NotPendingOwner();
    error NoFunds();

    IERC20 public immutable USDC;

    struct Campaign {
        address owner;                 // seller; may be an EOA, Privy wallet or Safe
        address pendingOwner;          // 2-step ownership transfer target
        uint256 cancelDeadline;        // epoch start
        uint256 finalizeDeadline;      // epoch end + objections window + buffer
        uint256 claimWindow;           // claim window after finalize (seconds)
        uint256 epochId;
        string poolId;
        bytes32 root;                  // 0 = not finalized
        uint256 total;                 // sum of leaves, micro-USDC
        uint256 funded;                // accounting of deposits
        uint256 claimed;               // accounting of withdrawals
        uint256 sweepAfter;            // set in setMerkleRoot = finalize time + claimWindow
        mapping(uint256 => uint256) claimedBitMap;
    }

    uint256 public nextCampaignId;
    mapping(uint256 => Campaign) private campaigns;

    event CampaignCreated(uint256 indexed id, address indexed owner, uint256 epochId, string poolId);
    event Funded(uint256 indexed id, uint256 amount);
    event Finalized(uint256 indexed id, bytes32 root, uint256 total, uint256 sweepAfter);
    event Cancelled(uint256 indexed id, uint256 amount);
    event Swept(uint256 indexed id, uint256 amount);
    event Claimed(uint256 indexed id, uint256 index, address indexed account, uint256 amount);
    event OwnershipTransferStarted(uint256 indexed id, address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(uint256 indexed id, address indexed previousOwner, address indexed newOwner);

    constructor(address usdc_) {
        require(usdc_ != address(0), "RebateClaims: zero usdc");
        USDC = IERC20(usdc_);
    }

    modifier onlyCampaignOwner(uint256 id) {
        if (campaigns[id].owner != msg.sender) revert NotOwner();
        _;
    }

    function campaign(uint256 id)
        external
        view
        returns (
            address owner,
            address pendingOwner,
            uint256 cancelDeadline,
            uint256 finalizeDeadline,
            uint256 claimWindow,
            uint256 epochId,
            string memory poolId,
            bytes32 root,
            uint256 total,
            uint256 funded,
            uint256 claimed,
            uint256 sweepAfter
        )
    {
        Campaign storage c = campaigns[id];
        return (
            c.owner,
            c.pendingOwner,
            c.cancelDeadline,
            c.finalizeDeadline,
            c.claimWindow,
            c.epochId,
            c.poolId,
            c.root,
            c.total,
            c.funded,
            c.claimed,
            c.sweepAfter
        );
    }

    // Sanity: cancelDeadline_ > now; cancelDeadline_ < finalizeDeadline_ <= cancelDeadline_ + 30 days;
    // claimWindow_ >= 7 days; amount_ > 0; pulls amount_ USDC from the caller.
    function createCampaignAndFund(
        uint256 cancelDeadline_,
        uint256 finalizeDeadline_,
        uint256 claimWindow_,
        uint256 epochId_,
        string calldata poolId_,
        uint256 amount_
    ) external returns (uint256 id) {
        if (cancelDeadline_ <= block.timestamp) revert InvalidParams();
        if (finalizeDeadline_ <= cancelDeadline_) revert InvalidParams();
        if (finalizeDeadline_ > cancelDeadline_ + 30 days) revert InvalidParams();
        if (claimWindow_ < 7 days) revert InvalidParams();
        if (bytes(poolId_).length == 0) revert InvalidParams();
        if (amount_ == 0) revert InvalidParams();

        id = nextCampaignId++;
        Campaign storage c = campaigns[id];
        c.owner = msg.sender;
        c.cancelDeadline = cancelDeadline_;
        c.finalizeDeadline = finalizeDeadline_;
        c.claimWindow = claimWindow_;
        c.epochId = epochId_;
        c.poolId = poolId_;

        if (amount_ > 0) {
            USDC.safeTransferFrom(msg.sender, address(this), amount_);
            c.funded = amount_;
        }

        emit CampaignCreated(id, msg.sender, epochId_, poolId_);
        if (amount_ > 0) emit Funded(id, amount_);
    }

    // Top up a campaign. Only the campaign owner.
    function fund(uint256 id, uint256 amount) external onlyCampaignOwner(id) {
        if (amount == 0) revert InvalidParams();
        Campaign storage c = campaigns[id];
        if (c.root != bytes32(0)) revert AlreadyFinalized();
        USDC.safeTransferFrom(msg.sender, address(this), amount);
        c.funded += amount;
        emit Funded(id, amount);
    }

    // 2-step ownership transfer (Ownable2Step semantics).
    function transferCampaignOwnership(uint256 id, address newOwner) external onlyCampaignOwner(id) {
        if (newOwner == address(0)) revert InvalidParams();
        Campaign storage c = campaigns[id];
        c.pendingOwner = newOwner;
        emit OwnershipTransferStarted(id, c.owner, newOwner);
    }

    // The pending owner accepts; resets pendingOwner; old owner loses rights.
    function acceptOwnership(uint256 id) external {
        Campaign storage c = campaigns[id];
        if (c.pendingOwner == address(0) || c.pendingOwner != msg.sender) revert NotPendingOwner();
        emit OwnershipTransferred(id, c.owner, msg.sender);
        c.owner = msg.sender;
        c.pendingOwner = address(0);
    }

    // Finalize: publish the merkle root. Owner's on-chain agreement with the
    // published computation. Reverts if under-funded or too late.
    function setMerkleRoot(uint256 id, bytes32 root_, uint256 total_) external onlyCampaignOwner(id) {
        Campaign storage c = campaigns[id];
        if (c.root != bytes32(0)) revert AlreadyFinalized();
        if (root_ == bytes32(0)) revert InvalidParams();
        if (block.timestamp > c.finalizeDeadline) revert TooLate();
        if (c.funded < total_) revert Underfunded();

        c.root = root_;
        c.total = total_;
        c.sweepAfter = block.timestamp + c.claimWindow;
        emit Finalized(id, root_, total_, c.sweepAfter);
    }

    // Cancel before the epoch starts; refunds everything to the owner.
    function cancel(uint256 id) external onlyCampaignOwner(id) {
        Campaign storage c = campaigns[id];
        if (c.root != bytes32(0)) revert AlreadyFinalized();
        if (block.timestamp >= c.cancelDeadline) revert TooLate();

        uint256 amount = c.funded;
        if (amount == 0) revert NoFunds();
        c.funded = 0;
        USDC.safeTransfer(msg.sender, amount);
        emit Cancelled(id, amount);
    }

    // Sweep unclaimed funds back to the owner.
    //   finalized: only after sweepAfter; amount = funded - claimed
    //   not finalized: only after finalizeDeadline; amount = funded
    function sweep(uint256 id) external onlyCampaignOwner(id) {
        Campaign storage c = campaigns[id];
        if (c.root != bytes32(0)) {
            if (block.timestamp < c.sweepAfter) revert TooEarly();
        } else {
            if (block.timestamp < c.finalizeDeadline) revert TooEarly();
        }
        uint256 amount = c.funded - c.claimed;
        if (amount == 0) revert NoFunds();
        c.funded = 0;
        c.claimed = 0;
        USDC.safeTransfer(msg.sender, amount);
        emit Swept(id, amount);
    }

    function isClaimed(uint256 id, uint256 index) public view returns (bool) {
        Campaign storage c = campaigns[id];
        uint256 claimedWord = index / 256;
        uint256 bit = index % 256;
        uint256 mask = 1 << bit;
        return c.claimedBitMap[claimedWord] & mask == mask;
    }

    function _setClaimed(uint256 id, uint256 index) private {
        Campaign storage c = campaigns[id];
        uint256 claimedWord = index / 256;
        uint256 bit = index % 256;
        uint256 mask = 1 << bit;
        c.claimedBitMap[claimedWord] |= mask;
    }

    // CORE claim, byte-for-byte from Uniswap MerkleDistributor, with the
    // MerkleDistributorWithDeadline window check. `_setClaimed`/`safeTransfer`/
    // `emit` ordering is unchanged from the canonical core; only the platform
    // accounting `claimed += amount` is added around it.
    //
    // Two local deviations from the canonical core, both about the sweep
    // boundary: the window check is `>=` (so the last claimable timestamp is
    // sweepAfter - 1 and claim/sweep can never overlap in one block), and the
    // `claimed + amount <= funded` guard keeps the per-campaign accounting
    // exact even if a campaign were emptied by any other path.
    function claim(uint256 id, uint256 index, address account, uint256 amount, bytes32[] calldata merkleProof)
        external
    {
        Campaign storage c = campaigns[id];
        if (isClaimed(id, index)) revert AlreadyClaimed();
        if (block.timestamp >= c.sweepAfter) revert ClaimWindowFinished();

        bytes32 node = keccak256(abi.encodePacked(index, account, amount));
        if (!MerkleProof.verify(merkleProof, c.root, node)) revert InvalidProof();
        if (c.claimed + amount > c.funded) revert NoFunds();

        _setClaimed(id, index);
        c.claimed += amount;
        USDC.safeTransfer(account, amount);
        emit Claimed(id, index, account, amount);
    }
}
