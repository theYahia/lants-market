import sys
import os
import time
from pathlib import Path

# Ensure the directory containing this script is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from e2e_fork_trade import (
    start_anvil,
    start_http_server,
    setup_rpc_route,
    add_init_script,
    setup_page_logging,
    eth_call,
    get_position_amount,
    OPERATOR,
    stop_all,
)

from playwright.sync_api import sync_playwright

import fork_prep

EXPECTED_PENDING_REWARD = 28341831743556013816873
EXPECTED_PENDING_REWARD_FORMATTED = "28341.83"
POSITION_ID = 110
STAKER_REWARDS = fork_prep.STAKER_REWARDS
SEL_PENDING_INDEXED = fork_prep.SEL_PENDING_INDEXED


def enc_uint(value: int) -> str:
    """Encode uint256 as 64 hex chars (no 0x prefix)."""
    return f"{value:064x}"


def get_position_owner(token_id: int) -> str:
    """Fetch ownerOf(tokenId) via eth_call, returns checksummed-free lowercase address."""
    calldata = "0x6352211e" + enc_uint(token_id)
    result = eth_call(fork_prep.NFT, calldata)
    if not result or result == "0x":
        raise RuntimeError(f"empty eth_call result for ownerOf({token_id})")
    raw = result[2:]
    return "0x" + raw[24:64].lower()


def run():
    http_process = None
    browser = None

    try:
        start_anvil()
        http_process = start_http_server()

        # Apply the shared fork preparation: timestamp/mine, setBalance, indexPoolRewards.
        fork_prep.prepare_restake_fork()

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            setup_rpc_route(context)
            page = context.new_page()
            add_init_script(page, OPERATOR)
            setup_page_logging(page)

            # Open local site with #portfolio hash so the portfolio view is revealed.
            page.goto(f"http://127.0.0.1:{http_process}/#portfolio", wait_until="networkidle")

            # Ensure the portfolio panel is visible (the hash should do it, but clicking the link is a safe fallback).
            portfolio_visible = page.evaluate("() => !document.getElementById('portfolio').hidden")
            if not portfolio_visible:
                page.click('a.hdr-link[href="#portfolio"]')
                page.wait_for_timeout(300)

            # The placeholder with #pf-connect is shown initially; click it to trigger the connect flow.
            # (If the placeholder is already hidden because the wallet connected, fall back to #hdr-connect.)
            pf_connect = page.query_selector("#pf-connect")
            if pf_connect is not None and pf_connect.is_visible():
                pf_connect.click()
            else:
                page.click("#hdr-connect")

            # Wait for the portfolio body to become visible (onConnect does this after eth_requestAccounts).
            deadline = time.time() + 30
            while time.time() < deadline:
                pf_body_hidden = page.evaluate("() => document.getElementById('pf-body').hidden")
                if not pf_body_hidden:
                    break
                page.wait_for_timeout(500)
            else:
                reason = "missing: portfolio body after connect"
                print(f"reason={reason}")
                print("restake_btn=0")
                print("restake_ok=0")
                return

            # Wait for .pf-pos-row with data-id == 27 inside #pf-positions.
            row = None
            deadline = time.time() + 30
            while time.time() < deadline:
                rows = page.query_selector_all("#pf-positions .pf-pos-row")
                for r in rows:
                    d = r.get_attribute("data-id")
                    if d == "27":
                        row = r
                        break
                if row:
                    break
                page.wait_for_timeout(500)

            if not row:
                reason = "missing: position row 27"
                print(f"reason={reason}")
                print("restake_btn=0")
                print("restake_ok=0")
                return

            # Check Restake control shows pending amount.
            restake_buttons = row.query_selector_all("button.restake")
            if not restake_buttons:
                reason = "missing: Restake button in row #27"
                print(f"reason={reason}")
                print("restake_btn=0")
                print("restake_ok=0")
                return

            restake_btn = restake_buttons[0]
            text = restake_btn.inner_text()
            title = restake_btn.get_attribute("title") or ""
            # Ensure the pending amount is shown before sign (UI shows ANTS with 2 decimals).
            if EXPECTED_PENDING_REWARD_FORMATTED not in text and EXPECTED_PENDING_REWARD_FORMATTED not in title:
                reason = "missing: pending ANTS amount on Restake button"
                print(f"reason={reason}")
                print("restake_btn=0")
                print("restake_ok=0")
                return

            print("restake_btn=1")

            # Click restake, wait for the transaction to be mined.
            restake_btn.click()

            # Poll for the newly minted position 110 (amount and owner) on-chain.
            deadline = time.time() + 60
            amount = None
            while time.time() < deadline:
                try:
                    amount = get_position_amount(POSITION_ID)
                    if amount == EXPECTED_PENDING_REWARD:
                        break
                except Exception:
                    amount = None
                page.wait_for_timeout(1000)

            if amount is None or amount != EXPECTED_PENDING_REWARD:
                reason = "missing: minted position 110"
                print(f"reason={reason}")
                print("restake_ok=0")
                return

            owner = get_position_owner(POSITION_ID)
            if owner != OPERATOR.lower():
                reason = "missing: position 110 owner"
                print(f"reason={reason}")
                print("restake_ok=0")
                return

            print("restake_ok=1")

    except Exception as e:
        cls = e.__class__.__name__
        msg = str(e)
        reason = f"{cls}: {msg}" if msg else cls
        print(f"reason={reason}")
        print("restake_ok=0")
    finally:
        stop_all()
        if browser:
            try:
                browser.close()
            except Exception:
                pass


if __name__ == "__main__":
    run()