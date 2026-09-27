#!/usr/bin/env python3
"""Prepares an anvil fork so the staker-rewards pending amount for position 27 is non-zero.

Uses the same fork block as the E2E trade test and applies the operator's verified recipe:
1. evm_setNextBlockTimestamp to 1790850600, then evm_mine (currentEpoch becomes 25)
2. anvil_setBalance on a caller
3. send indexPoolRewards(52894, 10) as a TRANSACTION to the staker-rewards contract
4. afterwards pendingIndexedStakerReward(27) on that contract is 28341831743556013816873

The preparation is exposed as the importable function prepare_restake_fork so a UI guard
can call it against an already-running anvil without booting it a second time.
"""

import sys
import time
from pathlib import Path

# Make the sibling module importable without touching REPO_ROOT:
# add the directory containing this file (scripts/site) to sys.path,
# then import the neighbor module by its plain name.
sys.path.insert(0, str(Path(__file__).parent.resolve()))

import e2e_fork_trade as e2e  # noqa: E402  (imports start_anvil, rpc, ANVIL_URL, stop_all, eth_call, eth_send_and_wait)

# Contract addresses (must match site/market-config.mjs)
STAKER_REWARDS = "0x83cc5b9aa0c8cb8683f35462c385a5baaa755ee5"
MARKET = "0xC5BFc309a68dBf4e7eEca9BD91749d611c75C660"
NFT = "0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652"
USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
USAGE_REWARDS = "0x78330bF154172F1137219Bb559d4F3A270B3201F"
OPERATOR = "0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B"

# Selectors measured via `cast sig` (must match site/market-config.mjs)
SEL_INDEX_POOL_REWARDS = "0x4a40d139"       # indexPoolRewards(uint256,uint256)
SEL_PENDING_INDEXED = "0x0b19b283"          # pendingIndexedStakerReward(uint256)

# Recipe constants
TIMESTAMP = 1790850600
AGENT_ID = 52894
MAX_EPOCHS = 10
POSITION_ID = 27


def _enc_agent(max_epochs: int) -> str:
    """Encode agentId to uint256."""
    return hex(max_epochs)[2:].zfill(64)


def prepare_restake_fork(rpc_url: str = e2e.ANVIL_URL) -> None:
    """Perform on-fork state changes for the restake scenario.

    The caller must already have anvil running (started via e2e_fork_trade.start_anvil
    or equivalent). Mutates the fork in place:
    - sets the next block timestamp and mines (currentEpoch becomes 25)
    - funds a caller
    - sends indexPoolRewards(52894, 10) to 0x83cc5b9aa0c8cb8683f35462c385a5baaa755ee5
    """
    caller = OPERATOR

    # 1. Advance to the block whose timestamp makes currentEpoch() == 25.
    e2e.rpc("evm_setNextBlockTimestamp", [TIMESTAMP])
    e2e.rpc("evm_mine", [])

    # 2. Fund the caller for gas.
    e2e.rpc("anvil_setBalance", [caller, hex(10**17)])  # 0.1 ETH

    # 3. indexPoolRewards(52894, 10) as a transaction.
    data = SEL_INDEX_POOL_REWARDS + _enc_agent(AGENT_ID) + _enc_agent(MAX_EPOCHS)
    e2e.eth_send_and_wait(caller, STAKER_REWARDS, data)


def read_pending_indexed_staker_reward(rpc_url: str = e2e.ANVIL_URL) -> int:
    """Read pendingIndexedStakerReward(27) from the chain via eth_call.

    Returns the integer value. Raises if the call returns empty or fails.
    """
    calldata = SEL_PENDING_INDEXED + _enc_agent(POSITION_ID)
    raw_hex = e2e.eth_call(STAKER_REWARDS, calldata)
    if not raw_hex or raw_hex == "0x" or len(raw_hex.strip()) < 3:
        raise RuntimeError(f"pendingIndexedStakerReward({POSITION_ID}) returned empty 0x — cannot parse")
    return int(raw_hex, 16)


if __name__ == "__main__":
    try:
        # Boot a fresh anvil forked at the same block as the E2E test.
        e2e.start_anvil()

        # Apply the recipe mutations.
        prepare_restake_fork()

        # Read the actual on-chain value and print exactly one line.
        pending = read_pending_indexed_staker_reward()
        print(f"ready_pending={pending}")

    except Exception as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)
    finally:
        e2e.stop_all()
