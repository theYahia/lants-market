#!/usr/bin/env python3
"""Guard script: verifies the claim button appears for the target position row.

Prepares the fork via the shared prep (imports prepare_restake_fork from
scripts/site/fork_prep.py), opens the local site at #portfolio, connects the
wallet, finds the target claim position row and prints claim_btn=1 only if
that row has the claim button showing its claimable amount in ANTS with two
decimals in text or title, otherwise claim_btn=0.

On a tree without the claim button it prints claim_btn=0, and surfaces
Python exceptions as reason=<Class>: <text>.

Dependencies:
- scripts/site/fork_prep.py (prepare_restake_fork, read_pending_indexed_staker_reward)
- scripts/site/e2e_fork_trade.py (start_anvil, ANVIL_URL, OPERATOR, eth_call,
  eth_send_and_wait, set_usdc_balance, stop_all)
- site/index.html (#portfolio, #pf-connect, #hdr-connect, #pf-body, #pf-positions, .pf-pos-row)
- site/market-view.mjs (renderMyPositions)
"""

import sys
import time
from pathlib import Path

# Make the sibling module importable without touching REPO_ROOT:
# add the directory containing this file (scripts/site) to sys.path,
# then import the neighbor module by its plain name.
sys.path.insert(0, str(Path(__file__).parent.resolve()))

import e2e_fork_trade as e2e
import fork_prep

from playwright.sync_api import sync_playwright

# The caller that the wallet connects as (must match fork_prep.OPERATOR).
CALLER = fork_prep.OPERATOR

# Site URL: local http server, path #portfolio.
SITE_URL = "http://127.0.0.1:{port}/#portfolio"

# Target position id as defined in fork_prep.
POSITION_ID = str(fork_prep.POSITION_ID)

# Marker for the claim button class (must match the site implementation).
CLAIM_BTN_CLASS = "claim"


def run_guard() -> int:
    """Run the guard: prepare fork, open site, connect wallet, inspect row.

    Returns 0 on success, 1 on failure (also used as exit code).
    """
    try:
        # 1. Start a fresh anvil forked at the same block as the E2E test.
        e2e.start_anvil()

        # 2. Prepare the fork via the shared prep.
        fork_prep.prepare_restake_fork()

        # Read the on-chain expected pending amount (for verification only).
        pending = fork_prep.read_pending_indexed_staker_reward()
        print(f"forwarded_pending={pending}")

        # 3. Start the local http server serving site/.
        site_port = e2e.start_http_server()

        # 4. Open the site at #portfolio with the mock wallet.
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            e2e.setup_rpc_route(context)
            page = context.new_page()
            e2e.add_init_script(page, CALLER)
            page.goto(SITE_URL.format(port=site_port))
            page.wait_for_load_state("networkidle")

            # 5. Connect the wallet by clicking hdr-connect (mock wallet returns accounts).
            page.click("#hdr-connect")
            page.wait_for_timeout(2000)

            # 6. Wait for the portfolio body to be visible.
            try:
                page.wait_for_selector("#pf-body:not([hidden])", timeout=15000)
            except Exception:
                print("claim_btn=0")
                print("reason=missing: portfolio body did not become visible")
                page.screenshot(path=str(Path(__file__).parent / "guard_fail_no_body.png"))
                return 1

            # 7. Wait for position rows to render.
            try:
                page.wait_for_selector(".pf-pos-row", timeout=15000)
            except Exception:
                print("claim_btn=0")
                print("reason=missing: no position rows rendered")
                page.screenshot(path=str(Path(__file__).parent / "guard_fail_no_rows.png"))
                return 1

            # 8. Find the target position row (the one with data-id == POSITION_ID).
            rows = page.locator(".pf-pos-row")
            target_row = None
            row_count = rows.count()
            for i in range(row_count):
                row_id = rows.nth(i).get_attribute("data-id")
                if row_id == POSITION_ID:
                    target_row = rows.nth(i)
                    break

            if target_row is None:
                print("claim_btn=0")
                print(f"reason=missing: position row #{POSITION_ID} not found in the rendered rows")
                return 1

            # 9. Look for a claim button inside the target row.
            claim_btn = target_row.locator(f"button.{CLAIM_BTN_CLASS}")
            if claim_btn.count() == 0:
                print("claim_btn=0")
                print(f"reason=missing: claim button not found in position row #{POSITION_ID}")
                return 1

            # 10. Check the claim button text or title contains the claimable amount
            #     in ANTS with two decimals.
            btn_text = (claim_btn.first.inner_text() or "").strip()
            btn_title = (claim_btn.first.get_attribute("title") or "").strip()
            combined = btn_text + " " + btn_title

            # Expected amount: pending from the prep, formatted with two decimals.
            expected = pending / 1e18  # wei -> ANTS
            expected_str = f"{expected:.2f}"

            # The button must show the amount with two decimals (either in text or title).
            if expected_str in combined:
                # Make sure the amount is properly formatted with two decimals
                # (we already have the exact string in the combined text)
                print(f"claim_btn=1")
                print(f"claim_amount={expected_str}")
                return 0
            else:
                print("claim_btn=0")
                print(f"reason=missing: claim button amount {expected_str} not found in text or title")
                print(f"button_text={btn_text}")
                print(f"button_title={btn_title}")
                return 1

    except Exception as exc:
        print("claim_btn=0")
        print(f"reason={type(exc).__name__}: {exc}")
        return 1
    finally:
        e2e.stop_all()


if __name__ == "__main__":
    sys.exit(run_guard())
