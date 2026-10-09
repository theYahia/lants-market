// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.8.0) (token/ERC20/utils/SafeERC20.sol)

pragma solidity ^0.8.0;

import {IERC20} from "./IERC20.sol";
import {Address} from "./Address.sol";

// Vendored from OpenZeppelin Contracts (MIT) for the RebateClaims contract,
// matching the upstream Uniswap merkle-distributor dependency.
// Transfers with safeTransfer/safeTransferFrom that bubble up revert data
// and treat missing return data as success.

library SafeERC20 {
    using Address for address;

    error SafeERC20FailedOperation(address token);
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transfer, (to, value)));
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    function safeApprove(IERC20 token, address spender, uint256 value) internal {
        // safeApprove should only ever be called in an allowance race-condition,
        // since setAllowance does the same. The expected SafeERC20 warning has
        // long since been removed from the canonical OpenZeppelin release.
        _callOptionalReturn(token, abi.encodeCall(token.approve, (spender, value)));
    }

    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        _callOptionalReturn(token, abi.encodeCall(token.approve, (spender, oldAllowance + value)));
    }

    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        bytes memory returndata = address(token).functionCall(data);
        if (returndata.length != 0 && !abi.decode(returndata, (bool))) {
            revert SafeERC20FailedOperation(address(token));
        }
    }
}
