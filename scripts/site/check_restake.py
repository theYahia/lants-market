import sys
import os
import time
import json
from pathlib import Path

# Ensure the directory containing this script is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from e2e_fork_trade import (
    start_anvil,
    start_http_server,
    setup_rpc_route,
    add_init_script,
    setup_page_logging,
    rpc,
    eth_call,
    eth_send_and_wait,
    get_position_amount,
    OPERATOR,
    ANVIL_URL,
    stop_all,
)

from playwright.sync_api import sync_playwright

INDEX_POOL_REWARDS_SELECTOR = "0x4a40d139"
TIMESTAMP_EPOCH_25 = 1790850600
EXPECTED_PENDING_REWARD = 28341831743556013816873
POSITION_ID = 110

REASON = None


def get_pending_reward():
    """Fetch pendingIndexedStakerReward(27) via eth_call."""
    calldata = "0x" + "8693dd3c" + "000000000000000000000000000000000000000000000000000000000000001b"
    result = eth_call(OPERATOR, calldata)
    return int(result, 16)


def run():
    global REASON

    anvil_process, http_process = None, None
    browser = None
    context = None
    page = None
    try:
        # Boot anvil and http server
        anvil_process = start_anvil()
        http_process = start_http_server()

        funded_caller = OPERATOR

        # Recipe in exact order:
        # 1) evm_setNextBlockTimestamp to 1790850600
        rpc("evm_setNextBlockTimestamp", [TIMESTAMP_EPOCH_25])
        # 2) evm_mine
        rpc("evm_mine", [])
        # 3) anvil_setBalance to funded caller address
        rpc("anvil_setBalance", [funded_caller, hex(10**22)])
        # 4) call indexPoolRewards(52894, 10) via eth_send_and_wait
        calldata = INDEX_POOL_REWARDS_SELECTOR + (
            "000000000000000000000000000000000000000000000000000000000000ce9e"  # 52894
            "000000000000000000000000000000000000000000000000000000000000000a"  # 10
        )
        eth_send_and_wait(funded_caller, OPERATOR, calldata)

        # Verify pending reward before UI
        pending = get_pending_reward()
        if pending != EXPECTED_PENDING_REWARD:
            REASON = f"pending reward mismatch: got {pending}, expected {EXPECTED_PENDING_REWARD}"
            print(f"reason={REASON}")
            print("restake_ok=0")
            return

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            # Setup RPC route on the context
            setup_rpc_route(context)
            page = context.new_page()
            # Init script, operator
            add_init_script(page, OPERATOR)
            # Logging
            setup_page_logging(page)

            # Open local site
            page.goto(f"http://127.0.0.1:{http_process}", wait_until="networkidle")

            # Switch to My Positions tab
            page.click(".tab[data-tab=positions]")
            page.wait_for_timeout(500)

            # Wait for .pf-pos-row with dataset.id == 27
            row = None
            deadline = time.time() + 15
            while time.time() < deadline:
                rows = page.query_selector_all(".pf-pos-row")
                for r in rows:
                    d = r.get_attribute("data-id")
                    if d == "27":
                        row = r
                        break
                if row:
                    break
                page.wait_for_timeout(500)

            if not row:
                REASON = "position row 27 not found"
                print(f"reason={REASON}")
                print("restake_ok=0")
                return

            # Check Restake control shows pending amount
            restake_buttons = row.query_selector_all("button.restake")
            if not restake_buttons:
                REASON = "Restake button not found in position row 27"
            else:
                restake_btn = restake_buttons[0]
                text = restake_btn.inner_text()
                # Ensure the pending amount is shown before sign
                if str(EXPECTED_PENDING_REWARD) not in text:
                    REASON = f"Restake button does not show pending amount, got: {text}"
                else:
                    # Click restake, wait for tx
                    restake_btn.click()
                    page.wait_for_timeout(10000)

                    # Confirm fresh position id 110
                    amount = get_position_amount(POSITION_ID)
                    if amount != EXPECTED_PENDING_REWARD:
                        REASON = f"position {POSITION_ID} amount mismatch, got: {amount}"

            if REASON:
                print(f"reason={REASON}")
                print("restake_ok=0")
            else:
                print("restake_ok=1")

    except Exception as e:
        REASON = str(e)
        print(f"reason={REASON}")
        print("restake_ok=0")
    finally:
        stop_all()
        if browser:
            browser.close()


if __name__ == "__main__":
    run()
