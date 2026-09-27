#!/usr/bin/env python3
"""UI polish guard: verifies four UI polish changes are present.

Prepares a fork and local site, connects an empty wallet (0 positions,
0 listings), and checks:
1. empty_head - in the empty portfolio (#pf-body), the .pf-pos-head header
   row must be ABSENT above the 'No lANTS positions in this wallet.' message.
2. listings_empty - the My Listings panel must contain an element with class
   pf-empty and text 'No listings yet.'.
3. tile_label - the portfolio tile in site/index.html must read
   'Staker Rewards (ANTS)' (not 'Claimable Rewards (ANTS)').
4. refresh_note - the snapshot caption rendered by site/render.mjs in the
   market header (visible without a wallet) must read
   'Auto-refreshed 3x/day (~06:15 / 14:15 / 22:15 UTC)'.

Dependencies:
- scripts/site/e2e_fork_trade.py (start_anvil, start_http_server,
  setup_rpc_route, add_init_script, stop_all)
- site/index.html  (#portfolio, #hdr-connect, #pf-body, .pf-pos-head,
  .pf-empty, .pf-pos-wrap, .pf-positions-head, .pf-value, .snap-footer)
- site/market-view.mjs (renderMyPositions, renderMyListingsPanel)
- site/render.mjs (renderSnapshot, snap-footer origin line / blurb)
"""

import sys
import time
from pathlib import Path

# Make the sibling module importable without touching REPO_ROOT:
# add the directory containing this file (scripts/site) to sys.path,
# then import the neighbor module by its plain name.
sys.path.insert(0, str(Path(__file__).parent.resolve()))

import e2e_fork_trade as e2e

from playwright.sync_api import sync_playwright

# The empty wallet that connects (0 positions, 0 listings).
EMPTY_WALLET = "0x86Bb4278389572D6FFC803D72661552bE096E473"

# Site URL: local http server, path #portfolio.
SITE_URL = "http://127.0.0.1:{port}/#portfolio"


def run_guard() -> int:
    """Run the UI polish guard.

    Returns 0 on success, 1 on failure (also used as exit code).
    """
    results = {
        "empty_head": 0,
        "listings_empty": 0,
        "tile_label": 0,
        "refresh_note": 0,
    }
    reasons = []

    try:
        # 1. Start a fresh anvil.
        e2e.start_anvil()

        # 2. Start the local http server serving site/.
        site_port = e2e.start_http_server()

        # 3. Open the site at #portfolio with the mock wallet.
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            e2e.setup_rpc_route(context)
            page = context.new_page()
            e2e.add_init_script(page, EMPTY_WALLET)
            page.goto(SITE_URL.format(port=site_port))
            page.wait_for_load_state("networkidle")

            # 4. Check refresh_note BEFORE connecting the wallet -
            #    the market header is visible without a wallet.
            #    Read the .snap-footer blurb from render.mjs.
            try:
                snap_footer = page.locator(".snap-footer")
                snap_footer.wait_for(timeout=15000)
                footer_text = snap_footer.inner_text()
                if "Auto-refreshed 3x/day (~06:15 / 14:15 / 22:15 UTC)" in footer_text:
                    results["refresh_note"] = 1
                else:
                    reasons.append("refresh_note")
            except Exception:
                reasons.append("refresh_note")

            # 5. Check tile_label against site/index.html source:
            #    the portfolio tile must read 'Staker Rewards (ANTS)'.
            #    We read the DOM - the html file is served by the
            #    http server, so we can read it via fetch or read the
            #    served page directly.  The tile is in #portfolio .pf-cell
            #    with .pf-label.
            try:
                # Read the index.html source via the served page.
                html_source = page.evaluate(
                    "async () => { const r = await fetch('/index.html'); return await r.text(); }"
                )
                if "Staker Rewards (ANTS)" in html_source and "Claimable Rewards (ANTS)" not in html_source:
                    results["tile_label"] = 1
                else:
                    reasons.append("tile_label")
            except Exception:
                reasons.append("tile_label")

            # 6. Connect the wallet by clicking hdr-connect (mock wallet returns accounts).
            page.click("#hdr-connect")
            page.wait_for_timeout(2000)

            # 7. Wait for the portfolio body to be visible.
            try:
                page.wait_for_selector("#pf-body:not([hidden])", timeout=15000)
            except Exception:
                print("empty_head=0")
                print("listings_empty=0")
                print("tile_label=0" if results["tile_label"] == 0 else "tile_label=1")
                print("refresh_note=0" if results["refresh_note"] == 0 else "refresh_note=1")
                print("reason=missing: portfolio body did not become visible")
                page.screenshot(path=str(Path(__file__).parent / "guard_fail_no_body.png"))
                return 1

            # 8. Wait for the empty positions message to render.
            try:
                page.wait_for_selector(".pf-pos-wrap .pf-empty", timeout=15000)
            except Exception:
                # It might take a moment for the empty state to appear.
                page.wait_for_timeout(3000)

            # 9. Check empty_head: after connect, in the empty portfolio
            #    (#pf-body) the .pf-pos-head header row must be ABSENT above
            #    the 'No lANTS positions in this wallet.' message.
            try:
                # The .pf-pos-head is rendered by renderMyPositions at the top
                # of #pf-positions.  For an empty wallet, the header row must
                # NOT be rendered; only the .pf-empty message should appear.
                pos_head_count = page.locator("#pf-positions .pf-pos-head").count()
                empty_msg_count = page.locator("#pf-positions .pf-empty").count()
                if pos_head_count == 0 and empty_msg_count >= 1:
                    results["empty_head"] = 1
                else:
                    reasons.append("empty_head")
            except Exception:
                reasons.append("empty_head")

            # 10. Check listings_empty: the My Listings panel must contain an
            #    element with class pf-empty and text 'No listings yet.'.
            try:
                my_listings = page.locator('[data-panel="my-listings"]')
                my_listings.wait_for(timeout=10000)
                # Look for a pf-empty element inside the My Listings panel.
                pf_empty = my_listings.locator(".pf-empty")
                pf_empty_count = pf_empty.count()
                found_listings_empty = False
                for i in range(pf_empty_count):
                    txt = pf_empty.nth(i).inner_text().strip()
                    if txt == "No listings yet.":
                        found_listings_empty = True
                        break
                if found_listings_empty:
                    results["listings_empty"] = 1
                else:
                    reasons.append("listings_empty")
            except Exception:
                reasons.append("listings_empty")

            # Print the refresh_note and tile_label results (they might be
            # checked before the connect step if they were already set).
            # But we have already stored them in results; print at the end.

            # 11. Print results.
            for key in ["empty_head", "listings_empty", "tile_label", "refresh_note"]:
                print(f"{key}={results[key]}")

            for reason in reasons:
                print(f"reason=missing: {reason}")

            if results["empty_head"] == 1 and results["listings_empty"] == 1 and \
               results["tile_label"] == 1 and results["refresh_note"] == 1:
                return 0
            return 1

    except Exception as exc:
        # Print all keys as 0 and the reason for the exception.
        print("empty_head=0")
        print("listings_empty=0")
        print("tile_label=0")
        print("refresh_note=0")
        print(f"reason={type(exc).__name__}: {exc}")
        return 1
    finally:
        e2e.stop_all()


if __name__ == "__main__":
    sys.exit(run_guard())
