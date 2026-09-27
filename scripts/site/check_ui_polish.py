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
5. listing_label - the My Listings panel for a wallet with data must show
   the row 'Listing #0 · position #112 · 1.00 USDC · sold'.
6. reward_head - the .pf-pos-head must contain 'EST. REWARD' as header label.
7. rules_compact - the listing rules must be collapsed inside a native
   <details> element with <summary>Listing rules</summary>; the line
   'Unclaimed rewards pass to the buyer with the NFT.' must always be visible.

Dependencies:
- scripts/site/e2e_fork_trade.py (start_anvil, start_http_server,
  setup_rpc_route, add_init_script, stop_all)
- site/index.html  (#portfolio, #hdr-connect, #pf-body, .pf-pos-head,
  .pf-empty, .pf-pos-wrap, .pf-positions-head, .pf-value, .snap-footer)
- site/market-view.mjs (renderMyPositions, renderMyListingsPanel)
- site/render.mjs (renderSnapshot, snap-footer origin line / blurb)
- scripts/site/qa_sweep.py (MOCK_WALLET_JS for the wallet with data)
"""

import sys
import time
from pathlib import Path

# Make the sibling module importable without touching REPO_ROOT:
# add the directory containing this file (scripts/site) to sys.path,
# then import the neighbor module by its plain name.
sys.path.insert(0, str(Path(__file__).parent.resolve()))

import e2e_fork_trade as e2e
import qa_sweep
from qa_sweep import MOCK_WALLET_JS as QA_MOCK_WALLET_JS

from playwright.sync_api import sync_playwright

# The empty wallet that connects (0 positions, 0 listings).
EMPTY_WALLET = "0x86Bb4278389572D6FFC803D72661552bE096E473"

# The wallet with data: has position #112 and a sold listing #0.
DATA_WALLET = "0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B"

# Site URL: local http server, path #portfolio.
SITE_URL = "http://127.0.0.1:{port}/#portfolio"


def open_live_page(browser, site_port):
    """Open the site with the QA mock wallet (reads on live RPC).

    The QA mock wallet from scripts/site/qa_sweep.py is injected as an
    init script. The page is opened at index.html (default market view).
    """
    context = browser.new_context(viewport={"width": 1280, "height": 900})

    def route_handler(route):
        url = route.request.url
        if not url.startswith("http://127.0.0.1:"):
            route.continue_()
            return
        route.continue_()

    context.route("http://127.0.0.1:**/*", route_handler)
    context.add_init_script(QA_MOCK_WALLET_JS.replace("__ADDR__", DATA_WALLET))
    page = context.new_page()
    page.goto(f"http://127.0.0.1:{site_port}/index.html", wait_until="networkidle")
    return context, page


def run_guard() -> int:
    """Run the UI polish guard.

    Returns 0 on success, 1 on failure (also used as exit code).
    """
    results = {
        "empty_head": 0,
        "listings_empty": 0,
        "tile_label": 0,
        "refresh_note": 0,
        "listing_label": 0,
        "reward_head": 0,
        "rules_compact": 0,
        "head_first": 0,
        "rules_live": 0,
        "snap_note": 0,
        "rules_short": 0,
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

            # 11. Check rules_compact: the listing rules must be inside a
            # native <details> element with <summary>Listing rules</summary>.
            # The line 'Unclaimed rewards pass to the buyer with the NFT.'
            # must always be visible; the other three rules must be inside
            # the collapsed details.
            try:
                details = page.locator("#market-list details")
                if details.count() == 0:
                    reasons.append("collapsed listing rules")
                else:
                    summary_text = details.locator("summary").first.inner_text().strip()
                    details_text = details.first.inner_text()

                    always_visible_line = False
                    collapsed_rule_ok = False
                    # The 'Unclaimed rewards pass to the buyer with the NFT.'
                    # line: it must be OUTSIDE the details (always visible).
                    market_list_text = page.locator("#market-list").inner_text()
                    if "Unclaimed rewards pass to the buyer with the NFT." in market_list_text:
                        always_visible_line = True

                    if summary_text == "Listing rules":
                        collapsed_rule_ok = True

                    if always_visible_line and collapsed_rule_ok:
                        results["rules_compact"] = 1
                    else:
                        reasons.append("collapsed listing rules")
            except Exception as exc:
                reasons.append("collapsed listing rules")

            # 12. Open the live page for the wallet with data.
            # listing_label and reward_head use the QA mock wallet reading
            # live RPC (the fork has no listing #0). The local http server
            # serves the files; the QA mock routes API calls to live RPC.
            live_context, live_page = open_live_page(browser, site_port)
            try:
                # Wait a moment for the page to settle.
                live_page.wait_for_timeout(3000)

                # Connect the wallet by clicking the header connect button.
                live_page.click("#hdr-connect")
                # Wait for the header to show a connected address.
                try:
                    live_page.wait_for_function(
                        """() => {
                            const b = document.getElementById('hdr-connect');
                            return b && b.textContent.trim().startsWith('0x');
                        }""",
                        timeout=20000
                    )
                except Exception:
                    reasons.append("listing label")

                # Navigate to the portfolio view.
                live_page.locator('a.hdr-link[href="#portfolio"]').click()
                live_page.wait_for_timeout(2000)

                # Wait for the My Listings panel to load data.
                try:
                    live_page.wait_for_selector(
                        '[data-panel="my-listings"] .market-row, '
                        '[data-panel="my-listings"] .pf-empty',
                        timeout=30000
                    )
                except Exception:
                    reasons.append("listing label")

                # Check listing_label: the My Listings panel must contain a
                # row reading 'Listing #0 · position #112 · 1.00 USDC · sold'.
                try:
                    my_rows = live_page.locator('[data-panel="my-listings"] .market-row').all()
                    found_label = False
                    for row in my_rows:
                        row_text = row.inner_text()
                        # normalize whitespace
                        normalized = " ".join(row_text.split())
                        if "Listing #0 · position #112 · 1.00 USDC · sold" in normalized:
                            found_label = True
                            break
                    if found_label:
                        results["listing_label"] = 1
                    else:
                        reasons.append("listing label")
                except Exception:
                    reasons.append("listing label")

                # Check reward_head: the .pf-pos-head must contain
                # 'EST. REWARD' as one of its header labels.
                try:
                    head_ok = False
                    head_count = live_page.locator("#pf-positions .pf-pos-head").count()
                    if head_count > 0:
                        head_text = live_page.locator("#pf-positions .pf-pos-head").first.inner_text()
                        if "EST. REWARD" in head_text.upper():
                            head_ok = True
                    if head_ok:
                        results["reward_head"] = 1
                    else:
                        reasons.append("EST. REWARD head")
                except Exception:
                    reasons.append("EST. REWARD head")
            finally:
                live_context.close()

            # 13. Check snap_note: open a fresh page at index.html WITHOUT any
            # #portfolio hash; do NOT wait on visibility. Use the .snap-footer
            # locator with wait_for(state='attached') and read text_content,
            # and verify it contains 'Auto-refreshed 3x/day (~06:15 / 14:15 / 22:15 UTC)'.
            try:
                snap_context = browser.new_context(viewport={"width": 1280, "height": 900})

                def snap_route_handler(route):
                    url = route.request.url
                    if not url.startswith("http://127.0.0.1:"):
                        route.continue_()
                        return
                    route.continue_()

                snap_context.route("http://127.0.0.1:**/*", snap_route_handler)
                snap_context.add_init_script(QA_MOCK_WALLET_JS.replace("__ADDR__", DATA_WALLET))
                snap_page = snap_context.new_page()
                snap_page.goto(f"http://127.0.0.1:{site_port}/index.html", wait_until="networkidle")
                snap_footer = snap_page.locator(".snap-footer")
                snap_footer.wait_for(state="attached", timeout=20000)
                snap_footer_text = snap_footer.text_content() or ""
                if "Auto-refreshed 3x/day (~06:15 / 14:15 / 22:15 UTC)" in snap_footer_text:
                    results["snap_note"] = 1
                else:
                    reasons.append("snapshot refresh note")
            except Exception as exc:
                reasons.append(f"{type(exc).__name__}: {exc}")
            finally:
                snap_context.close()

            # 14. Check head_first and rules_live on the live page for the
            # wallet with data. Reuse the open_live_page flow with DATA_WALLET.
            try:
                head_live_context, head_live_page = open_live_page(browser, site_port)
                try:
                    # Wait a moment for the page to settle.
                    head_live_page.wait_for_timeout(3000)

                    # Connect the wallet by clicking the header connect button.
                    head_live_page.click("#hdr-connect")
                    # Wait for the header to show a connected address.
                    try:
                        head_live_page.wait_for_function(
                            """() => {
                                const b = document.getElementById('hdr-connect');
                                return b && b.textContent.trim().startsWith('0x');
                            }""",
                            timeout=20000
                        )
                    except Exception:
                        reasons.append("header row first in #pf-positions")

                    # Navigate to the portfolio view.
                    head_live_page.locator('a.hdr-link[href="#portfolio"]').click()
                    head_live_page.wait_for_timeout(2000)

                    # Wait for the positions container to render rows.
                    try:
                        head_live_page.wait_for_selector(
                            "#pf-positions .pf-pos-row",
                            timeout=30000
                        )
                    except Exception:
                        reasons.append("header row first in #pf-positions")

                    # Check head_first: the FIRST element child of #pf-positions
                    # must be the .pf-pos-head row AND its text must contain
                    # 'EST. REWARD'.
                    try:
                        first_child = head_live_page.evaluate(
                            """() => {
                                const container = document.getElementById('pf-positions');
                                if (!container || !container.firstElementChild) return null;
                                return {
                                    className: container.firstElementChild.className,
                                    text: container.firstElementChild.textContent || ''
                                };
                            }"""
                        )
                        if (
                            first_child
                            and "pf-pos-head" in (first_child.get("className") or "")
                            and "EST. REWARD" in (first_child.get("text") or "").upper()
                        ):
                            results["head_first"] = 1
                        else:
                            reasons.append("header row first in #pf-positions")
                    except Exception:
                        reasons.append("header row first in #pf-positions")

                    # Check rules_live: verify #market-list always shows the
                    # visible line 'Unclaimed rewards pass to the buyer with the
                    # NFT.' AND contains a native <details> whose <summary> text
                    # is 'Listing rules' holding all three rule lines.
                    try:
                        market_list = head_live_page.locator("#market-list")
                        market_list.wait_for(state="visible", timeout=15000)
                        market_list_text = market_list.inner_text()
                        details_present = market_list.locator("details").count() > 0
                        summary_text = ""
                        details_content = ""
                        if details_present:
                            summary_el = market_list.locator("details summary").first
                            if summary_el.count() > 0:
                                summary_text = summary_el.inner_text().strip()
                            details_content = market_list.locator("details").first.inner_text() or ""

                        visible_line_ok = "Unclaimed rewards pass to the buyer with the NFT." in market_list_text
                        details_ok = (
                            details_present
                            and summary_text == "Listing rules"
                            and "Only one active listing per NFT." in details_content
                            and "Staking rewards for the open epoch can't be claimed before listing and pass to the buyer with the NFT." in details_content
                            and "A listing on a closed, split, moved or transferred position is invalid and cannot be bought." in details_content
                        )
                        if visible_line_ok and details_ok:
                            results["rules_live"] = 1
                        else:
                            reasons.append("live listing rules")
                    except Exception:
                        reasons.append("live listing rules")
                finally:
                    head_live_context.close()
            except Exception as exc:
                reasons.append(f"{type(exc).__name__}: {exc}")

            # 15. Check rules_short: a dedicated page (live RPC, wallet with
            # data) with the listing rules split into a visible line and a
            # collapsed <details> block containing exactly the three short
            # rules. Reuse open_live_page which already routes to live RPC.
            try:
                short_context, short_page = open_live_page(browser, site_port)
                try:
                    # Wait a moment for the page to settle.
                    short_page.wait_for_timeout(3000)

                    # Ensure the market listings are visible (default view).
                    market_list = short_page.locator("#market-list")
                    market_list.wait_for(state="visible", timeout=15000)

                    # Wait until at least one market row exists (caveats are
                    # rendered after real listings).
                    short_page.wait_for_selector(
                        "#market-list .market-row",
                        timeout=30000
                    )

                    # (a) The visible line must be present in the market list.
                    market_list_text = market_list.inner_text()
                    visible_line_ok = (
                        "Unclaimed rewards pass to the buyer with the NFT."
                        in market_list_text
                    )

                    # (b) The <details> collapse with exactly three short rules.
                    details_ok = False
                    summary_ok = False
                    short_rules_ok = False
                    details_present = market_list.locator("details").count() > 0
                    if details_present:
                        summary_text = market_list.locator("details summary").first.inner_text().strip()
                        summary_ok = summary_text == "Listing rules"

                        details_content = market_list.locator("details").first.inner_text() or ""
                        required_lines = [
                            "Contents can change until the sale.",
                            "One active listing per NFT.",
                            "Closed, split, moved or transferred positions can't be bought.",
                        ]
                        short_rules_ok = all(line in details_content for line in required_lines)

                        # Ensure no extra rule lines inside the details.
                        extra_lines_present = False
                        for unexpected in [
                            "Only one active listing per NFT.",
                            "Staking rewards for the open epoch can't be claimed before listing and pass to the buyer with the NFT.",
                            "A listing on a closed, split, moved or transferred position is invalid and cannot be bought.",
                        ]:
                            if unexpected in details_content:
                                extra_lines_present = True
                                break
                        if extra_lines_present:
                            short_rules_ok = False

                    if details_present and summary_ok and short_rules_ok:
                        details_ok = True

                    if visible_line_ok and details_ok:
                        results["rules_short"] = 1
                    else:
                        reasons_list = []
                        if not visible_line_ok:
                            reasons_list.append("visible line 'Unclaimed rewards pass to the buyer with the NFT.'")
                        if not details_present:
                            reasons_list.append("details element")
                        if details_present and not summary_ok:
                            reasons_list.append("summary 'Listing rules'")
                        if details_present and not short_rules_ok:
                            reasons_list.append("exact short rules inside details")
                        for reason_item in reasons_list:
                            reasons.append(reason_item)
                finally:
                    short_context.close()
            except Exception as exc:
                reasons.append(f"{type(exc).__name__}: {exc}")

            # 16. Print results.
            for key in ["empty_head", "listings_empty", "tile_label", "refresh_note",
                        "listing_label", "reward_head", "rules_compact",
                        "head_first", "rules_live", "snap_note", "rules_short"]:
                print(f"{key}={results[key]}")

            for reason in reasons:
                print(f"reason=missing: {reason}")

            if all(results.values()):
                return 0
            return 1

    except Exception as exc:
        # Print all keys as 0 and the reason for the exception.
        print("empty_head=0")
        print("listings_empty=0")
        print("tile_label=0")
        print("refresh_note=0")
        print("listing_label=0")
        print("reward_head=0")
        print("rules_compact=0")
        print("head_first=0")
        print("rules_live=0")
        print("snap_note=0")
        print(f"reason={type(exc).__name__}: {exc}")
        return 1
    finally:
        e2e.stop_all()


if __name__ == "__main__":
    sys.exit(run_guard())
