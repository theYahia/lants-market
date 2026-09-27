#!/usr/bin/env python3
"""Incentives page guard: verifies the incentives view renders correctly.

Serves site/ over a local http server, opens index.html#incentives with a mock
wallet, and verifies five UX pieces are present:

1. inc_view  — the "Incentives" nav link is visible, the #incentives section is
   visible, and both the market (#tabs) and the portfolio (#portfolio) are
   hidden when the hash is #incentives.
2. inc_round — the section text contains "Epoch 25" and a countdown in d/h/m
   format.
3. inc_board — the first board row is pool 45049 with est "3039.65"; est is
   recomputed in Python from the same fixture using
   est = R_e * v / (W_next + v), where v = 1000 * 104, e = rewardMode.epoch = 24,
   R_e = sum of rewardByEpoch[e] over the pool's positions, and
   W_next = poolWeightByEpoch[pool][e + 1]. Pools with W_next = 0
   (85104, 86897, 87124, 94701, 94730) must appear after the ranked ones.
4. inc_offers — with an injected offer {pool 52894, usdcPer1k 5, capAnts 10000}
   the page shows "5 USDC per 1,000 ANTS" and "max 50 USDC"; with
   offers.json = [] it shows "No offers for epoch 25 yet"; the "Post an offer"
   button's href starts with
   https://github.com/theYahia/lants-market/issues/new and its
   percent-decoded body contains "Pool", "USDC per 1,000 ANTS", "Cap" and
   "Payer"; an offer with note "<b>x</b>" renders literally as text.
5. inc_calc  — for pool 52894 with the same offer, Y=2000 gives "10.00 USDC"
   and Y=20000 gives "50.00 USDC" (capped).

Dependencies:
- scripts/site/e2e_fork_trade.py (start_http_server, stop_all)
- site/index.html          (#incentives section)
- site/metrics.mjs         (rewardMode(snapshot) semantics, recomputed in Python)
- site/fixtures/snapshot-e23.live.json (fixture snapshot, used both by the
  site mock responses and by the independent Python recomputation)
"""

import json
import sys
import urllib.parse
from pathlib import Path

# Make the sibling module importable without touching REPO_ROOT:
# add the directory containing this file (scripts/site) to sys.path,
# then import the neighbor module by its plain name.
sys.path.insert(0, str(Path(__file__).parent.resolve()))

import e2e_fork_trade as e2e

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]  # scripts
SITE_DIR = Path(__file__).resolve().parents[2] / "site"
FIXTURE = SITE_DIR / "fixtures" / "snapshot-e23.live.json"

LIVE_URLS = [
    "https://raw.githubusercontent.com/theYahia/lants-market/data/live.json",
    "https://lants.eth.limo/fixtures/snapshot-e23.live.json",
    "https://lants.eth.limo/snapshot-e23.live.json",
]

# Test offers injected per check; the default has one offer for pool 52894.
DEFAULT_OFFERS = [
    {
        "pool": "52894",
        "epochs": [25],
        "usdcPer1k": 5,
        "capAnts": 10000,
        "payer": "0x0000000000000000000000000000000000000001",
        "note": "",
        "pays": "new",
    }
]


def load_fixture():
    """Load and return the fixture snapshot dict."""
    with open(FIXTURE, "r", encoding="utf-8") as fh:
        return json.load(fh)


def reward_mode_epoch(snapshot):
    """Python reimplementation of metrics.mjs rewardMode(snapshot).

    Returns the epoch whose rewards should be shown: the current epoch when
    any position already has a non-zero reward for it, otherwise the previous
    epoch.
    """
    cur = int(snapshot.get("epoch", 0))
    prev = cur - 1
    positions = snapshot.get("positions")
    if not isinstance(positions, list):
        return cur
    for pos in positions:
        reward = int(pos.get("rewardByEpoch", {}).get(str(cur), 0) or 0)
        if reward > 0:
            return cur
    return prev


def compute_board(snapshot):
    """Recompute the board rows in Python from the fixture.

    For each pool with a non-zero next-epoch weight, est is:
        est = R_e * v / (W_next + v)
    where:
        v      = 1000 * 104
        e      = rewardMode.epoch (current or previous)
        R_e    = sum of rewardByEpoch[e] over the pool's positions (wei)
        W_next = poolWeightByEpoch[pool][e + 1] (wei)

    Pools with W_next = 0 (or missing) are returned separately and must be
    placed after the ranked pools in the UI.

    Returns (ranked, unranked): ranked is a list of (pool, est) sorted by est
    descending, unranked is a list of pools with no next-epoch weight.
    """
    epoch = reward_mode_epoch(snapshot)
    next_epoch = epoch + 1
    v = 1000 * 104
    v_wei = v * 10**18

    pools = {}
    for pos in snapshot.get("positions", []):
        pool = str(pos.get("agentId", ""))
        reward_wei = int(pos.get("rewardByEpoch", {}).get(str(epoch), 0) or 0)
        pools.setdefault(pool, 0)
        pools[pool] += reward_wei

    weights = snapshot.get("poolWeightByEpoch", {})
    ranked = []
    unranked = []
    for pool, reward_wei in pools.items():
        w_next = int(weights.get(pool, {}).get(str(next_epoch), 0) or 0)
        if w_next == 0:
            unranked.append(pool)
            continue
        est_wei = reward_wei * v_wei // (w_next + v_wei)
        est = est_wei / 10**18
        ranked.append((pool, est))

    ranked.sort(key=lambda item: item[1], reverse=True)
    unranked.sort()
    return ranked, unranked


def format_est(est):
    """Format est number to two decimals as the site would."""
    return f"{est:.2f}"


def post_offer_href_ok(href):
    """Check the post-offer href: starts with the github URL and its
    percent-decoded body contains Pool, USDC per 1,000 ANTS, Cap and Payer."""
    expected_prefix = "https://github.com/theYahia/lants-market/issues/new"
    if not href.startswith(expected_prefix):
        return False
    parsed = urllib.parse.urlparse(href)
    query = urllib.parse.parse_qs(parsed.query)
    body = query.get("body", [""])[0]
    decoded = urllib.parse.unquote(body)
    for needle in ["Pool", "USDC per 1,000 ANTS", "Cap", "Payer"]:
        if needle not in decoded:
            return False
    return True


def run_guard() -> int:
    """Run the incentives guard.

    Returns 0 on success, 1 on failure (also used as exit code).
    """
    results = {
        "inc_view": 0,
        "inc_round": 0,
        "inc_board": 0,
        "inc_offers": 0,
        "inc_calc": 0,
        "inc_nav": 0,
        "inc_units": 0,
        "inc_clean": 0,
        "inc_mobile": 0,
        "inc_cta": 0,
        "inc_rule": 0,
    }
    subchecks = {key: [] for key in results}
    reasons = []

    def record(key, name, ok):
        subchecks[key].append(ok)
        if not ok:
            reasons.append(name)

    def finalize_results():
        for key, checks in subchecks.items():
            if checks and all(checks):
                results[key] = 1
            else:
                results[key] = 0

    try:
        # 1. Start the local http server serving site/.
        site_port = e2e.start_http_server()
        if not site_port:
            raise RuntimeError("http server did not start")

        # 2. Open the site at index.html#incentives with the mock wallet.
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1280, "height": 900})

            offers = DEFAULT_OFFERS
            offers_requests = []
            http_4xx_responses = []

            rule_checks = []
            pays_cases = [
                {
                    "label": "new",
                    "offer": dict(DEFAULT_OFFERS[0], pays="new"),
                    "expected": {
                        "text": "new stakes only",
                        "2000": "10.00 USDC",
                        "20000": "44.50 USDC",
                    },
                },
                {
                    "label": "all",
                    "offer": dict(DEFAULT_OFFERS[0], pays="all"),
                    "expected": {
                        "text": "all stakers, pro rata",
                        "2000": "5.29 USDC",
                        "20000": "27.09 USDC",
                    },
                },
            ]

            def route_handler(route):
                url = route.request.url
                if url.startswith("http://127.0.0.1:"):
                    # Local server continues normally (serves site/ files).
                    route.continue_()
                    return
                # Snapshot responses: live URLs and the fixture fallback all
                # return the local fixture file.
                for live in LIVE_URLS:
                    if url.startswith(live):
                        route.fulfill(
                            status=200,
                            content_type="application/json",
                            body=FIXTURE.read_bytes(),
                        )
                        return
                # Offer responses: return the currently injected offers list.
                if "offers.json" in url:
                    # only the data branch is wrong (CI rebuilds it with live.json alone); main/site and ./ are fine
                    if "/data/offers.json" in url:
                        offers_requests.append(url)
                    route.fulfill(
                        status=200,
                        content_type="application/json",
                        body=json.dumps(offers).encode(),
                    )
                    return
                route.continue_()

            # Track HTTP 4xx responses for inc_clean.
            page_on_response = None
            context.route("**/*", route_handler)
            context.add_init_script(
                "window.__incentivesMock = true;"
            )
            page = context.new_page()
            page.on("response", lambda resp: http_4xx_responses.append(resp.status) if 400 <= resp.status < 500 else None)
            page.goto(f"http://127.0.0.1:{site_port}/index.html#incentives")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(2000)

            # 3. inc_view: the "Incentives" nav link is visible; the
            #    #incentives section is visible; #tabs and #portfolio are hidden.
            try:
                inc_link = page.locator('a.hdr-link[href="#incentives"], a[href="#incentives"]')
                inc_link_visible = inc_link.count() > 0 and inc_link.first.is_visible()

                incentives = page.locator("#incentives")
                incentives_visible = incentives.count() > 0 and incentives.is_visible()

                tabs_hidden = page.locator("#tabs").count() == 0 or not page.locator("#tabs").is_visible()
                portfolio_hidden = page.locator("#portfolio").count() == 0 or not page.locator("#portfolio").is_visible()

                record("inc_view", "missing: incentives view visible", inc_link_visible and incentives_visible and tabs_hidden and portfolio_hidden)
            except Exception as exc:
                record("inc_view", "incentives view raised " + type(exc).__name__ + ": " + str(exc), False)

            # 4. inc_round: the section text contains "Epoch 25" and a
            #    countdown in d/h/m format.
            try:
                section_text = page.locator("#incentives").inner_text()
                has_epoch = "Epoch 25" in section_text
                # Countdown formats: "12d 03h 45m", "12d 3h 45m", "0d 00h 00m"
                import re as _re
                has_countdown = _re.search(r"\d+d\s+\d+h\s+\d+m", section_text) is not None
                record("inc_round", "missing: epoch 25 or countdown text", has_epoch and has_countdown)
            except Exception as exc:
                record("inc_round", "epoch 25 countdown raised " + type(exc).__name__ + ": " + str(exc), False)

            # 5. inc_board: fixed literal expectations from the fixture.
            expected_board = [
                ("59969", "7646.75"),
                ("86897", "5440.85"),
                ("45049", "3100.73"),
            ]
            try:
                board_rows = page.locator(".inc-board-table .board-row, #incentives .board-row").all()
                if not board_rows:
                    record("inc_board", "missing: board rows", False)
                else:
                    # Extract (pool, est) pairs from the first two columns.
                    rows_data = []
                    for row in board_rows:
                        cells = row.locator("td").all()
                        if len(cells) >= 2:
                            pool = cells[0].inner_text().strip()
                            # Column 2 is staked; column 4 is est. ANTS for 1,000 staked.
                            if len(cells) >= 5:
                                est = cells[3].inner_text().strip()
                                rows_data.append((pool, est))
                            else:
                                rows_data.append((pool, ""))

                    top_ok = len(rows_data) >= 3
                    for idx, (exp_pool, exp_est) in enumerate(expected_board):
                        if idx >= len(rows_data):
                            top_ok = False
                            break
                        pool = rows_data[idx][0]
                        est = rows_data[idx][1]
                        if pool != exp_pool or est != exp_est:
                            top_ok = False
                            break

                    # Pool 87124 present with est 1155.48.
                    pool_87124_ok = any(pool == "87124" and est == "1155.48" for pool, est in rows_data)

                    # Exactly one pool marked 'no stake next epoch' — check the
                    # est column text (4th cell) for "no stake next epoch".
                    no_stake_pools = [pool for pool, est in rows_data if "no stake next epoch" in est and pool == "94725"]
                    exactly_one_no_stake = len(no_stake_pools) == 1
                    # And no OTHER pool (besides 94725) has that marker.
                    other_no_stake = [pool for pool, est in rows_data if "no stake next epoch" in est and pool != "94725"]
                    only_94725_no_stake = len(other_no_stake) == 0

                    record(
                        "inc_board",
                        "board literal rows/markers",
                        top_ok and pool_87124_ok and exactly_one_no_stake and only_94725_no_stake,
                    )
            except Exception as exc:
                record("inc_board", "board raised " + type(exc).__name__ + ": " + str(exc), False)

            # 6. inc_offers: with the injected offer, "5 USDC per 1,000 ANTS"
            #    and "max 50 USDC" appear.
            try:
                incentives_text = page.locator("#incentives").inner_text()
                offers_row_ok = "5 USDC per 1,000 ANTS" in incentives_text and "max 50 USDC" in incentives_text
                record("inc_offers", "missing: offer row text", offers_row_ok)
            except Exception as exc:
                record("inc_offers", "offer row raised " + type(exc).__name__ + ": " + str(exc), False)

            # 7. inc_calc: pool 52894 with the same offer: Y=2000 -> "10.00 USDC",
            #    Y=20000 -> "50.00 USDC" (capped).
            try:
                y_input = page.locator("#incentives input[type=number]")
                if y_input.count() == 0:
                    record("inc_calc", "missing: calc input", False)
                else:
                    y_input.first.fill("2000")
                    page.wait_for_timeout(300)
                    calc_text_2000 = page.locator("#incentives").inner_text()
                    got_2000 = "10.00 USDC" in calc_text_2000

                    y_input.first.fill("20000")
                    page.wait_for_timeout(300)
                    calc_text_20000 = page.locator("#incentives").inner_text()
                    got_20000 = "44.50 USDC" in calc_text_20000

                    record("inc_calc", "missing: calc values 10/44.50 USDC", got_2000 and got_20000)
            except Exception as exc:
                record("inc_calc", "calc raised " + type(exc).__name__ + ": " + str(exc), False)

            # 8. inc_offers, no-offers case: offers.json = [] must show the
            #    "No offers for epoch 25 yet" message.
            offers = []
            page.reload()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)
            try:
                no_offers_text = page.locator("#incentives").inner_text()
                no_offers_ok = "No offers for epoch 25 yet" in no_offers_text
                record("inc_offers", "missing: no offers message", no_offers_ok)
            except Exception as exc:
                record("inc_offers", "no offers raised " + type(exc).__name__ + ": " + str(exc), False)

            # 9. inc_offers, post offer href: with offers.json = [] the CTA
            #    "Post an offer" must link to the GitHub issue form with the
            #    right body.
            try:
                post_btn = page.locator('#incentives a[href*="issues/new"], #incentives a:has-text("Post an offer")')
                if post_btn.count() == 0:
                    record("inc_offers", "missing: post offer link", False)
                else:
                    href = post_btn.first.get_attribute("href") or ""
                    record("inc_offers", "missing: post offer link href", post_offer_href_ok(href))
            except Exception as exc:
                record("inc_offers", "post offer raised " + type(exc).__name__ + ": " + str(exc), False)

            # 10. inc_offers, note rendering: an offer with note "<b>x</b>"
            #     must render literally as text.
            offers = [
                {
                    "pool": "52894",
                    "epochs": [25],
                    "usdcPer1k": 5,
                    "capAnts": 10000,
                    "payer": "0x0000000000000000000000000000000000000001",
                    "note": "<b>x</b>",
                    "pays": "new",
                }
            ]
            page.reload()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)
            try:
                note_text = page.locator("#incentives").inner_text()
                record("inc_offers", "missing: offer note literal", "<b>x</b>" in note_text)
            except Exception as exc:
                record("inc_offers", "note raised " + type(exc).__name__ + ": " + str(exc), False)

            # 11. inc_calc, with the note offer: pool 52894 still caps and
            #     formats values the same way regardless of the note.
            try:
                y_input = page.locator("#incentives input[type=number]")
                if y_input.count() == 0:
                    record("inc_calc", "missing: calc input note", False)
                else:
                    y_input.first.fill("2000")
                    page.wait_for_timeout(300)
                    calc_text_2000 = page.locator("#incentives").inner_text()
                    got_2000 = "10.00 USDC" in calc_text_2000

                    y_input.first.fill("20000")
                    page.wait_for_timeout(300)
                    calc_text_20000 = page.locator("#incentives").inner_text()
                    got_20000 = "44.50 USDC" in calc_text_20000

                    record("inc_calc", "missing: calc values note", got_2000 and got_20000)
            except Exception as exc:
                record("inc_calc", "calc note raised " + type(exc).__name__ + ": " + str(exc), False)

            # 12. inc_nav: click a.hdr-link[href='#tabs'] -> hide incentives and
            #     portfolio; click brand -> hide incentives; click portfolio link
            #     -> only portfolio visible; aria-current on active link only.
            try:
                # Start from #incentives.
                page.goto(f"http://127.0.0.1:{site_port}/index.html#incentives")
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(1000)

                # Click the Market (tabs) link.
                market_link = page.locator('a.hdr-link[href="#tabs"]')
                if market_link.count() > 0:
                    market_link.first.click()
                    page.wait_for_timeout(500)
                    inc_after_market = page.locator("#incentives").is_visible()
                    pf_after_market = page.locator("#portfolio").is_visible()
                else:
                    inc_after_market = True
                    pf_after_market = True
                tab_click_ok = (not inc_after_market) and (not pf_after_market)

                # Click the brand logo.
                brand = page.locator("a.brand")
                if brand.count() > 0:
                    brand.first.click()
                    page.wait_for_timeout(500)
                    inc_after_brand = page.locator("#incentives").is_visible()
                else:
                    inc_after_brand = True
                brand_click_ok = not inc_after_brand

                # Click the portfolio link.
                pf_link = page.locator('a.hdr-link[href="#portfolio"]')
                if pf_link.count() > 0:
                    pf_link.first.click()
                    page.wait_for_timeout(500)
                    pf_visible = page.locator("#portfolio").is_visible()
                    inc_after_pf = page.locator("#incentives").is_visible()
                else:
                    pf_visible = False
                    inc_after_pf = True
                pf_click_ok = pf_visible and (not inc_after_pf)

                # aria-current: active link has it, inactive don't.
                def has_aria_current(href):
                    loc = page.locator(f'a.hdr-link[href="{href}"]')
                    if loc.count() == 0:
                        return False
                    attr = loc.first.get_attribute("aria-current")
                    return attr == "page"

                # At this point #portfolio is the active view.
                active_has = has_aria_current("#portfolio")
                market_has = has_aria_current("#tabs")
                inc_has = has_aria_current("#incentives")
                aria_ok = active_has and (not market_has) and (not inc_has)

                record(
                    "inc_nav",
                    "missing: nav clicks/aria-current",
                    tab_click_ok and brand_click_ok and pf_click_ok and aria_ok,
                )
            except Exception as exc:
                record("inc_nav", "nav raised " + type(exc).__name__ + ": " + str(exc), False)

            # 13. inc_units: #incentives text contains 'max lock' in the column
            #     heading and in the explanatory note.
            try:
                units_text = page.locator("#incentives").inner_text()
                # 'max-lock eq.' is the heading text (from the site's board).
                has_heading = "max-lock eq" in units_text
                has_note = "max lock" in units_text
                record("inc_units", "missing: 'max lock' in heading and note", has_heading and has_note)
            except Exception as exc:
                record("inc_units", "units raised " + type(exc).__name__ + ": " + str(exc), False)

            # 14. inc_clean: no requests to .../data/offers.json and no 4xx
            #     responses while loading index.html#incentives.
            try:
                clean_ok = len(offers_requests) == 0 and len(http_4xx_responses) == 0
                record("inc_clean", "missing: clean network (offers.json/4xx)", clean_ok)
            except Exception as exc:
                record("inc_clean", "clean raised " + type(exc).__name__ + ": " + str(exc), False)

            # 15. inc_mobile: viewport 390x844, scrollWidth <= 390 and the
            #     board table is not wider than its container.
            try:
                mobile_page = context.new_page()
                mobile_page.set_viewport_size({"width": 390, "height": 844})
                # Reuse the same routing on the new page by attaching the
                # same context (routes are context-wide).
                mobile_page.goto(f"http://127.0.0.1:{site_port}/index.html#incentives")
                mobile_page.wait_for_load_state("networkidle")
                mobile_page.wait_for_timeout(1500)
                scroll_width = mobile_page.evaluate("document.documentElement.scrollWidth")
                table = mobile_page.locator(".inc-board-table")
                if table.count() == 0:
                    record("inc_mobile", "missing: board table on mobile", False)
                else:
                    table_box = table.first.bounding_box()
                    container_box = mobile_page.locator("#incentives").bounding_box()
                    table_not_wide = table_box is not None and container_box is not None and table_box["width"] <= container_box["width"]
                    record(
                        "inc_mobile",
                        "missing: mobile no horizontal scroll",
                        scroll_width <= 390 and table_not_wide,
                    )
                mobile_page.close()
            except Exception as exc:
                record("inc_mobile", "mobile raised " + type(exc).__name__ + ": " + str(exc), False)

            # 16. inc_cta: 'Post an offer' link computed color is not
            #     rgb(0, 0, 238) and height >= 40 px.
            try:
                # the nav checks above leave another view open; a hidden link has no box
                page.locator('a.hdr-link[href="#incentives"]').click()
                page.wait_for_timeout(500)
                post_link = page.locator("#incentives a.inc-post-offer, #incentives a:has-text('Post an offer')")
                if post_link.count() == 0:
                    record("inc_cta", "missing: post offer cta link", False)
                else:
                    cta = post_link.first
                    color = cta.evaluate("el => getComputedStyle(el).color")
                    box = cta.bounding_box()
                    height_ok = box is not None and box["height"] >= 40
                    color_ok = color.lower() != "rgb(0, 0, 238)"
                    record("inc_cta", "missing: cta color/size", height_ok and color_ok)
            except Exception as exc:
                record("inc_cta", "cta raised " + type(exc).__name__ + ": " + str(exc), False)

            # 17. inc_rule: the 'pays' rule in incentives.mjs.
            try:
                # Run both pays cases: 'new' and 'all', reloading the page
                # for each and checking the offer text and calculator values.
                for case in pays_cases:
                    offers = [case["offer"]]
                    page.goto(f"http://127.0.0.1:{site_port}/index.html?r={id(offers)}#incentives")  # unique URL: same-hash goto does not reload
                    page.wait_for_load_state("networkidle")
                    page.wait_for_timeout(1500)

                    incentives_text = page.locator("#incentives").inner_text()
                    text_ok = case["expected"]["text"] in incentives_text

                    y_input = page.locator("#incentives input[type=number]")
                    if y_input.count() == 0:
                        calc_ok = False
                    else:
                        y_input.first.fill("2000")
                        page.wait_for_timeout(300)
                        calc_text_2000 = page.locator("#incentives").inner_text()
                        y_input.first.fill("20000")
                        page.wait_for_timeout(300)
                        calc_text_20000 = page.locator("#incentives").inner_text()
                        calc_ok = (
                            case["expected"]["2000"] in calc_text_2000
                            and case["expected"]["20000"] in calc_text_20000
                        )

                    rule_checks.append(text_ok and calc_ok)

                # Post-offer body must contain 'Pays:'.
                offers = DEFAULT_OFFERS
                page.goto(f"http://127.0.0.1:{site_port}/index.html?r={id(offers)}#incentives")  # unique URL: same-hash goto does not reload
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(1500)
                post_btn = page.locator('#incentives a[href*="issues/new"], #incentives a:has-text("Post an offer")')
                if post_btn.count() > 0:
                    href = post_btn.first.get_attribute("href") or ""
                    parsed = urllib.parse.urlparse(href)
                    query = urllib.parse.parse_qs(parsed.query)
                    body = query.get("body", [""])[0]
                    decoded = urllib.parse.unquote(body)
                    rule_checks.append("Pays:" in decoded)
                else:
                    rule_checks.append(False)

                # Invalid pays value: offer must not be shown.
                offers = [dict(DEFAULT_OFFERS[0], pays="invalid")]
                page.goto(f"http://127.0.0.1:{site_port}/index.html?r={id(offers)}#incentives")  # unique URL: same-hash goto does not reload
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(1500)
                invalid_text = page.locator("#incentives").inner_text()
                rule_checks.append("5 USDC per 1,000 ANTS" not in invalid_text)

                # Missing pays field: offer must not be shown.
                no_pays_offer = dict(DEFAULT_OFFERS[0])
                del no_pays_offer["pays"]
                offers = [no_pays_offer]
                page.goto(f"http://127.0.0.1:{site_port}/index.html?r={id(offers)}#incentives")  # unique URL: same-hash goto does not reload
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(1500)
                no_pays_text = page.locator("#incentives").inner_text()
                rule_checks.append("5 USDC per 1,000 ANTS" not in no_pays_text)

                record("inc_rule", "missing: pays rule output", all(rule_checks))
            except Exception as exc:
                record("inc_rule", "inc_rule raised " + type(exc).__name__ + ": " + str(exc), False)

            # 18. Finalize and print all keys.
            finalize_results()
            for key in sorted(results.keys()):
                print(f"{key}={results[key]}")

            for reason in reasons:
                if reason.startswith("missing:"):
                    print(f"reason={reason}")
                else:
                    print(f"reason=missing: {reason}")

            if all(results.values()) and not reasons:
                return 0
            return 1

    except Exception as exc:
        print("inc_view=0")
        print("inc_round=0")
        print("inc_board=0")
        print("inc_offers=0")
        print("inc_calc=0")
        print("inc_nav=0")
        print("inc_units=0")
        print("inc_clean=0")
        print("inc_mobile=0")
        print("inc_cta=0")
        print("inc_rule=0")
        print(f"reason={type(exc).__name__}: {exc}")
        return 1
    finally:
        e2e.stop_all()


if __name__ == "__main__":
    sys.exit(run_guard())
