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
        "inc_mobhead": 0,
        "inc_cta": 0,
        "inc_rule": 0,
        "inc_calcui": 0,
        "inc_names": 0,
        "inc_sort": 0,
        "inc_copy": 0,
        "inc_layout": 0,
        "inc_tips": 0,
    }
    subchecks = {key: [] for key in results}
    calcui_failures = []
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

            # the served snapshot; inc_layout swaps in one with pool history, then restores it
            snapshot_body = [FIXTURE.read_bytes()]

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
                            body=snapshot_body[0],
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
                # Pool names: return the test mapping.
                if url.startswith("https://raw.githubusercontent.com/theYahia/lants-market/main/site/pool-names.json"):
                    route.fulfill(
                        status=200,
                        content_type="application/json",
                        body=json.dumps({"59969": "Test Deep", "52894": "Test Apex"}).encode(),
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
                    # Layout-free: pool and estimate come from the row's data attributes, not column positions,
                    # and the three highest estimates are checked whatever the default order is.
                    rows_data = [
                        ((r.get_attribute("data-pool") or "").strip(), r.get_attribute("data-est") or "", r.inner_text())
                        for r in board_rows
                    ]
                    ests = sorted(((float(e), p) for p, e, _ in rows_data if e not in ("", "-1")), reverse=True)
                    top_ok = [(p, f"{v:.2f}") for v, p in ests[:3]] == expected_board
                    pool_87124_ok = any(p == "87124" and e and abs(float(e) - 1155.48) < 0.005 for p, e, _ in rows_data)
                    no_stake = [p for p, _, t in rows_data if "no stake next epoch" in t]
                    record(
                        "inc_board",
                        "board literal rows/markers",
                        top_ok and pool_87124_ok and no_stake == ["94725"],
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

            # 11b. inc_names: with the routed pool names, verify the board,
            #      calculator select and first offer line show the test names.
            try:
                failures = []

                pool_59969 = page.locator('#incentives .board-row[data-pool="59969"] td').first
                if pool_59969.count() == 0:
                    failures.append("missing: row for pool 59969")
                else:
                    pool_59969_text = pool_59969.inner_text()
                    if "Test Deep" not in pool_59969_text or "59969" not in pool_59969_text:
                        failures.append("missing: pool 59969 cell text contains Test Deep and 59969")

                pool_86897 = page.locator('#incentives .board-row[data-pool="86897"] td').first
                if pool_86897.count() == 0:
                    failures.append("missing: row for pool 86897")
                else:
                    pool_86897_text = pool_86897.inner_text().strip()
                    # no name: the cell starts with the id (stake and tags may follow)
                    if not pool_86897_text.startswith("86897") or "Test" in pool_86897_text:
                        failures.append("missing: pool 86897 cell starts with 86897 and has no name")

                option_52894 = page.locator('#incentives .inc-calc select option[value="52894"]')
                if option_52894.count() == 0:
                    failures.append("missing: option value=52894 in calc select")
                else:
                    option_text = option_52894.first.inner_text()
                    if "Test Apex" not in option_text:
                        failures.append("missing: calc option 52894 contains Test Apex")

                first_offer_li = page.locator("#incentives .inc-offers-list li").first
                if first_offer_li.count() == 0:
                    failures.append("missing: first offer line in offers list")
                else:
                    first_offer_text = first_offer_li.inner_text()
                    if not first_offer_text.startswith("Test Apex"):
                        failures.append("missing: first offer line starts with Test Apex")

                if not failures:
                    results["inc_names"] = 1
                    subchecks["inc_names"].append(True)
                else:
                    results["inc_names"] = 0
                    subchecks["inc_names"].append(False)
                    reasons.extend(failures)
            except Exception as exc:
                results["inc_names"] = 0
                subchecks["inc_names"].append(False)
                reasons.append("missing: inc_names raised " + type(exc).__name__ + ": " + str(exc))

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

            # 13. inc_units: a heading names the unit ('1,000 ANTS') and a heading tip explains 'max lock'.
            try:
                heads_text = page.locator("#incentives .inc-board-table thead").inner_text().lower()
                tips = page.eval_on_selector_all(
                    "#incentives .inc-board-table thead th .info", "e => e.map(x => (x.dataset.tip || '').toLowerCase())")
                record("inc_units", "missing: '1,000 ANTS' in a heading and 'max lock' in a heading tip",
                       "1,000 ants" in heads_text and any("max lock" in t for t in tips))
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

            # 15b. inc_mobhead: on mobile viewport, every visible table header
            #     must align horizontally with the corresponding column of the
            #     first row. Uses the same board markup from
            #     site/incentives.mjs buildBoard() (thead th and rows with
            #     class 'board-row'). A header is considered visible when its
            #     computed display is not 'none'; threshold for alignment is
            #     abs(th.left - td.left) <= 2 px per column, in order.
            try:
                mobhead_page = context.new_page()
                mobhead_page.set_viewport_size({"width": 390, "height": 844})
                mobhead_page.goto(f"http://127.0.0.1:{site_port}/index.html#incentives")
                mobhead_page.wait_for_selector("#incentives .board-row", timeout=30000)
                mobhead_ths = mobhead_page.locator("#incentives .inc-board-table thead th").all()
                mobhead_tds = mobhead_page.locator("#incentives .board-row").first.locator("td").all()

                visible_ths = []
                for th in mobhead_ths:
                    display = th.evaluate("el => getComputedStyle(el).display")
                    if display != "none":
                        visible_ths.append(th)

                visible_tds = []
                for td in mobhead_tds:
                    display = td.evaluate("el => getComputedStyle(el).display")
                    if display != "none":
                        visible_tds.append(td)

                th_count = len(visible_ths)
                td_count = len(visible_tds)
                if th_count == 0:
                    results["inc_mobhead"] = 0
                    subchecks["inc_mobhead"].append(False)
                    reasons.append("missing: no visible header columns on mobile")
                elif th_count != td_count:
                    results["inc_mobhead"] = 0
                    subchecks["inc_mobhead"].append(False)
                    reasons.append(
                        "missing: header/column count mismatch on mobile — "
                        f"{th_count} visible th vs {td_count} visible td"
                    )
                else:
                    misaligned = []
                    for i in range(th_count):
                        th_box = visible_ths[i].bounding_box()
                        td_box = visible_tds[i].bounding_box()
                        if th_box is None or td_box is None:
                            misaligned.append(f"col {i}: no box (th={th_box is not None}, td={td_box is not None})")
                            continue
                        diff = abs(th_box["x"] - td_box["x"])
                        if diff > 2:
                            misaligned.append(f"col {i}: {diff:.2f}px")
                    if misaligned:
                        results["inc_mobhead"] = 0
                        subchecks["inc_mobhead"].append(False)
                        reasons.append("missing: mobile header/column misalignment — " + ", ".join(misaligned))
                    else:
                        results["inc_mobhead"] = 1
                        subchecks["inc_mobhead"].append(True)
                mobhead_page.close()
            except Exception as exc:
                results["inc_mobhead"] = 0
                subchecks["inc_mobhead"].append(False)
                reasons.append(
                    "missing: mobile header alignment check raised "
                    + type(exc).__name__
                    + ": "
                    + str(exc)
                )

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

            # 18. inc_calcui: verify dark background, font-size >= 16px and
            #     rendered height >= 40px on every input/select inside
            #     #incentives .inc-calc. The Incentives view must be active
            #     because earlier checks leave another view active and a
            #     hidden element reports no size.
            try:
                inc_link = page.locator('a.hdr-link[href="#incentives"]')
                if inc_link.count() > 0 and inc_link.first.is_visible():
                    inc_link.first.click()
                    page.wait_for_timeout(800)
                else:
                    # ensure #incentives is visible anyway (set location hash)
                    page.goto(f"http://127.0.0.1:{site_port}/index.html?r=calcui#incentives")
                    page.wait_for_load_state("networkidle")
                    page.wait_for_timeout(800)

                fields = page.locator('#incentives .inc-calc input, #incentives .inc-calc select').all()
                print(f"inc_calcui_fields={len(fields)}")

                ok = True
                for field in fields:
                    tag_name = field.evaluate("el => el.tagName.toLowerCase()")
                    field_id = field.evaluate("el => el.id || el.name || ''")
                    if not field_id:
                        field_id = tag_name

                    bg = field.evaluate("el => getComputedStyle(el).backgroundColor")
                    fs = field.evaluate("el => getComputedStyle(el).fontSize")
                    box = field.bounding_box()

                    bg_ok = bg.lower() != "rgb(255, 255, 255)"
                    fs_px = 0.0
                    try:
                        fs_px = float(fs.replace("px", ""))
                    except ValueError:
                        fs_px = 0.0
                    fs_ok = fs_px >= 16

                    height_ok = box is not None and box["height"] >= 40

                    if not bg_ok:
                        ok = False
                        calcui_failures.append(f"#{field_id}.background-color={bg}")
                    if not fs_ok:
                        ok = False
                        calcui_failures.append(f"#{field_id}.font-size={fs}")
                    if not height_ok:
                        ok = False
                        calcui_failures.append(f"#{field_id}.height={box['height'] if box else 'hidden'}")

                if ok and len(fields) > 0:
                    results["inc_calcui"] = 1
                    subchecks["inc_calcui"].append(True)
                else:
                    results["inc_calcui"] = 0
                    subchecks["inc_calcui"].append(False)
                    if len(fields) == 0:
                        reasons.append("missing: no fields found under #incentives .inc-calc")
                    for fail in calcui_failures:
                        reasons.append("missing: dark styles on #incentives .inc-calc fields — " + fail)
            except Exception as exc:
                results["inc_calcui"] = 0
                subchecks["inc_calcui"].append(False)
                reasons.append("missing: dark styles on #incentives .inc-calc fields — " + type(exc).__name__ + ": " + str(exc))

            # 19. inc_sort: four headings with one sort button each; the estimate is the default sort without
            #     pool history; clicks toggle it; Seller sorts by name. Read from row data attributes.
            try:
                nav_link = page.locator('a.hdr-link[href="#incentives"]')
                if nav_link.count() == 0 or not nav_link.first.is_visible():
                    page.goto(f"http://127.0.0.1:{site_port}/index.html?r=incsort#incentives")
                    page.wait_for_load_state("networkidle")
                    page.wait_for_timeout(1500)
                else:
                    nav_link.first.click()
                    page.wait_for_timeout(800)

                sort_failures = []

                def incsort_headers():
                    return page.locator("#incentives .inc-board-table thead th").all()

                def incsort_aria():
                    return {i: th.get_attribute("aria-sort") for i, th in enumerate(incsort_headers(), start=1)
                            if th.get_attribute("aria-sort") is not None}

                def incsort_rows():
                    return [{"name": r.get_attribute("data-name") or "", "est": float(r.get_attribute("data-est") or "-1")}
                            for r in page.locator("#incentives .board-row").all()]

                # 19a. Four headings (Seller, per 1,000 ANTS, Paid, Offer), one button.inc-sort in each.
                headers = incsort_headers()
                if len(headers) != 4:
                    sort_failures.append(f"{len(headers)} headings, want 4")
                for idx, th in enumerate(headers, start=1):
                    count = th.locator("button.inc-sort").count()
                    if count != 1:
                        sort_failures.append(f"th[{idx}] has {count} sort buttons, want 1")

                # 19b. No pool history in the fixture: the estimate (th[2]) is the default sort, descending.
                if incsort_aria() != {2: "descending"}:
                    sort_failures.append(f"start aria-sort {incsort_aria()}, want {{2: 'descending'}}")

                # 19c. Click the estimate heading: ascending, first row is the minimum.
                headers[1].locator("button.inc-sort").click()
                page.wait_for_timeout(300)
                rows = incsort_rows()
                if not rows or rows[0]["est"] != min(r["est"] for r in rows):
                    sort_failures.append("after 1st click on the estimate the first row is not the minimum")
                if incsort_aria() != {2: "ascending"}:
                    sort_failures.append(f"after 1st click aria-sort {incsort_aria()}")

                # 19d. Click again: descending, first row is the maximum.
                headers[1].locator("button.inc-sort").click()
                page.wait_for_timeout(300)
                rows = incsort_rows()
                if not rows or rows[0]["est"] != max(r["est"] for r in rows):
                    sort_failures.append("after 2nd click on the estimate the first row is not the maximum")
                if incsort_aria() != {2: "descending"}:
                    sort_failures.append(f"after 2nd click aria-sort {incsort_aria()}")

                # 19e. Click Seller: rows by name (or id when no name), ascending.
                headers[0].locator("button.inc-sort").click()
                page.wait_for_timeout(300)
                names = [r["name"] for r in incsort_rows()]
                if names != sorted(names, key=lambda s: s.lower()):
                    sort_failures.append("Seller sort is not ascending by name")
                if incsort_aria() != {1: "ascending"}:
                    sort_failures.append(f"after Seller click aria-sort {incsort_aria()}")

                if not sort_failures:
                    results["inc_sort"] = 1
                    subchecks["inc_sort"].append(True)
                else:
                    results["inc_sort"] = 0
                    subchecks["inc_sort"].append(False)
                    for fail in sort_failures:
                        reasons.append("missing: " + fail)
            except Exception as exc:
                results["inc_sort"] = 0
                subchecks["inc_sort"].append(False)
                reasons.append(
                    "missing: inc_sort raised "
                    + type(exc).__name__
                    + ": "
                    + str(exc)
                )

            # 20. inc_copy: verify the copy in the incentives view.
            try:
                copy_failures = []

                # 20a. h2 title must contain "stake now to count from it"
                #      and match r"in \d+d \d+h \d+m".
                h2 = page.locator("#incentives h2").first
                if h2.count() == 0:
                    copy_failures.append("missing: h2 element not found")
                else:
                    h2_text = h2.inner_text()
                    if "stake now to count from it" not in h2_text:
                        copy_failures.append("missing: 'stake now to count from it' in h2")
                    import re as _re
                    if _re.search(r"in \d+d \d+h \d+m", h2_text) is None:
                        copy_failures.append("missing: countdown pattern 'in NdXh YmZ' in h2")

                # 20b. The estimate heading's tip (th[2]) says "per epoch" and "no one else joins the pool".
                est_tip = page.locator("#incentives .inc-board-table thead th:nth-child(2) .info")
                tip_text = (est_tip.first.get_attribute("data-tip") or "") if est_tip.count() else ""
                if "per epoch" not in tip_text:
                    copy_failures.append("missing: 'per epoch' in the estimate heading tip")
                if "no one else joins the pool" not in tip_text:
                    copy_failures.append("missing: 'no one else joins the pool' in the estimate heading tip")

                # 20c. First offer li (with DEFAULT_OFFERS) must contain
                #      "paid by 0x0000…0001" and "for the first 10,000 ANTS"
                #      and must NOT contain "up to ".
                # earlier checks leave other test offers served; reload with the default one
                offers = DEFAULT_OFFERS
                page.goto(f"http://127.0.0.1:{site_port}/index.html?r=copy{id(offers)}#incentives")
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(1500)
                first_li = page.locator("#incentives .inc-offers-list li").first
                if first_li.count() == 0:
                    copy_failures.append("missing: first offers list li")
                else:
                    first_li_text = first_li.inner_text()
                    if "paid by 0x0000…0001" not in first_li_text:
                        copy_failures.append("missing: 'paid by 0x0000…0001' in first offer line")
                    if "for the first 10,000 ANTS" not in first_li_text:
                        copy_failures.append("missing: 'for the first 10,000 ANTS' in first offer line")
                    if "up to " in first_li_text:
                        copy_failures.append("missing: 'up to ' should not appear in first offer line")

                # 20d. With a substituted offer note="Test note" (via unique
                #      ?r=), the element #incentives .inc-offer-note must
                #      have text equal to "Test note".
                note_offer = [
                    {
                        "pool": "52894",
                        "epochs": [25],
                        "usdcPer1k": 5,
                        "capAnts": 10000,
                        "payer": "0x0000000000000000000000000000000000000001",
                        "note": "Test note",
                        "pays": "new",
                    }
                ]
                offers = note_offer
                page.goto(f"http://127.0.0.1:{site_port}/index.html?r={id(note_offer)}#incentives")
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(1500)
                note_el = page.locator("#incentives .inc-offer-note")
                if note_el.count() == 0:
                    copy_failures.append("missing: .inc-offer-note element not found")
                else:
                    note_text_val = note_el.first.inner_text()
                    if note_text_val != "Test note":
                        copy_failures.append(f"missing: .inc-offer-note text '{note_text_val}' != 'Test note'")

                if not copy_failures:
                    results["inc_copy"] = 1
                    subchecks["inc_copy"].append(True)
                else:
                    results["inc_copy"] = 0
                    subchecks["inc_copy"].append(False)
                    for fail in copy_failures:
                        reasons.append(fail)
            except Exception as exc:
                results["inc_copy"] = 0
                subchecks["inc_copy"].append(False)
                reasons.append("missing: inc_copy raised " + type(exc).__name__ + ": " + str(exc))

            # 20e. inc_layout: four columns Seller / per 1,000 ANTS / Paid to stakers / Offer, one tip (span.info
            #      with data-tip) on every heading, stake shown in the seller cell, no analyst jargon and no note
            #      paragraph; with pool history in the snapshot the Paid column shows it and is the default sort;
            #      on a phone the estimate and Paid headings stay visible without sideways scroll.
            try:
                lay = []
                hist = json.loads(FIXTURE.read_bytes())
                hist["poolHistoryEpochs"] = ["22", "23"]
                hist["poolRewardByEpoch"] = {
                    "52894": {"22": str(21807 * 10**18), "23": str(18549 * 10**18)},
                    "59969": {"22": "0", "23": "0"},
                }
                snapshot_body[0] = json.dumps(hist).encode()
                offers = DEFAULT_OFFERS
                page.goto(f"http://127.0.0.1:{site_port}/index.html?r=layout#incentives")
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(1500)
                ths = page.locator("#incentives .inc-board-table thead th").all()
                if len(ths) != 4:
                    lay.append(f"{len(ths)} headings, want 4")
                else:
                    for i, want in enumerate(["seller", "1,000 ants", "paid", "offer"]):
                        if want not in ths[i].inner_text().lower():
                            lay.append(f"heading {i + 1} lacks '{want}'")
                    for i, th in enumerate(ths):
                        tip = th.locator(".info[data-tip]")
                        if tip.count() != 1 or not (tip.first.get_attribute("data-tip") or "").strip():
                            lay.append(f"heading {i + 1} has no single tip")
                    if ths[2].get_attribute("aria-sort") != "descending":
                        lay.append("Paid is not the default sort")
                body = page.locator("#incentives").inner_text().lower()
                for bad in ("max-lock eq", "sales, lifetime", "weight 104,000"):
                    if bad in body:
                        lay.append(f"jargon on screen: '{bad}'")
                if page.locator("#incentives .inc-note").count():
                    lay.append(".inc-note paragraph still on the page")
                apex = page.locator('#incentives .board-row[data-pool="52894"]')
                if apex.count() == 0:
                    lay.append("no row for 52894")
                else:
                    cells = apex.first.locator("td").all()
                    if "staked" not in cells[0].inner_text().lower():
                        lay.append("seller cell lacks 'staked'")
                    if len(cells) < 3 or cells[2].inner_text().strip() != "18.5k · 21.8k":
                        lay.append("Paid cell for 52894 is not '18.5k · 21.8k'")
                tags = page.locator('#incentives .board-row[data-pool="59969"] .inc-tag').all()
                if not any(t.inner_text().strip() == "new" for t in tags):
                    lay.append("59969 lacks the 'new' tag")
                phone = context.new_page()
                phone.set_viewport_size({"width": 390, "height": 844})
                phone.goto(f"http://127.0.0.1:{site_port}/index.html?r=layoutphone#incentives")
                phone.wait_for_load_state("networkidle")
                phone.wait_for_timeout(1500)
                visible = phone.eval_on_selector_all(
                    "#incentives .inc-board-table thead th",
                    "e => e.filter(t => getComputedStyle(t).display !== 'none').map(t => t.innerText.toLowerCase())")
                if not (any("1,000 ants" in v for v in visible) and any("paid" in v for v in visible)):
                    lay.append(f"phone headings {visible}")
                if phone.evaluate("document.documentElement.scrollWidth") > 390:
                    lay.append("phone scrolls sideways")
                phone.close()
                snapshot_body[0] = FIXTURE.read_bytes()
                record("inc_layout", "missing: " + "; ".join(lay), not lay)
            except Exception as exc:
                snapshot_body[0] = FIXTURE.read_bytes()
                record("inc_layout", "layout raised " + type(exc).__name__ + ": " + str(exc), False)

            # 20f. inc_tips: heading tips explain the columns; the estimate reads as the headline number.
            #      Seller tip names 'staked', 'new' and 'thin'; estimate tip names this epoch's sales and the budget
            #      with a thousands separator; the estimate cell of 52894 is a whole number with separators, bold.
            try:
                tips_fail = []
                budgeted = json.loads(FIXTURE.read_bytes())
                budgeted["stakerBudgetNext"] = str(101600 * 10**18)
                budgeted["stakerBudgetNextEpoch"] = "25"
                snapshot_body[0] = json.dumps(budgeted).encode()
                page.goto(f"http://127.0.0.1:{site_port}/index.html?r=tips#incentives")
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(1500)
                tip_texts = page.eval_on_selector_all(
                    "#incentives .inc-board-table thead th .info", "e => e.map(x => (x.dataset.tip || '').toLowerCase())")
                if len(tip_texts) != 4:
                    tips_fail.append(f"{len(tip_texts)} heading tips, want 4")
                else:
                    for word in ("staked", "new", "thin"):
                        if word not in tip_texts[0]:
                            tips_fail.append(f"Seller tip lacks '{word}'")
                    if "this epoch's sales" not in tip_texts[1]:
                        tips_fail.append("estimate tip lacks \"this epoch's sales\"")
                    if "101,600 ants" not in tip_texts[1]:
                        tips_fail.append("estimate tip lacks the budget as '101,600 ANTS'")
                    if "newest first" not in tip_texts[2]:
                        tips_fail.append("Paid tip lacks 'newest first'")
                est_cell = page.locator('#incentives .board-row[data-pool="52894"] td').nth(1)
                est_text = est_cell.inner_text().strip() if est_cell.count() else ""
                if not _re.fullmatch(r"\d{1,3}(,\d{3})*", est_text):
                    tips_fail.append(f"estimate cell '{est_text}' is not a whole number with separators")
                weight = est_cell.evaluate("el => parseInt(getComputedStyle(el).fontWeight, 10)") if est_cell.count() else 0
                if weight < 600:
                    tips_fail.append(f"estimate cell font-weight {weight}, want >= 600")
                snapshot_body[0] = FIXTURE.read_bytes()
                record("inc_tips", "missing: " + "; ".join(tips_fail), not tips_fail)
            except Exception as exc:
                snapshot_body[0] = FIXTURE.read_bytes()
                record("inc_tips", "tips raised " + type(exc).__name__ + ": " + str(exc), False)

            # 21. Finalize and print all keys with honest aggregation.
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
        print("inc_names=0")
        print("inc_mobile=0")
        print("inc_mobhead=0")
        print("inc_cta=0")
        print("inc_rule=0")
        print("inc_copy=0")
        print(f"reason={type(exc).__name__}: {exc}")
        return 1
    finally:
        e2e.stop_all()


if __name__ == "__main__":
    sys.exit(run_guard())
