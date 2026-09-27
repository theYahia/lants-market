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
        "usdcPer1k": 5,
        "capAnts": 10000,
        "note": "",
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
    }
    reasons = []

    try:
        # 1. Load the fixture and recompute expectations in Python.
        snapshot = load_fixture()
        ranked, unranked = compute_board(snapshot)
        if not ranked:
            reasons.append("no ranked pools in fixture")
        else:
            first_pool, first_est = ranked[0]
            first_est_text = format_est(first_est)

        # 2. Start the local http server serving site/.
        site_port = e2e.start_http_server()

        # 3. Open the site at index.html#incentives with the mock wallet.
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1280, "height": 900})

            offers = DEFAULT_OFFERS

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
                    route.fulfill(
                        status=200,
                        content_type="application/json",
                        body=json.dumps(offers).encode(),
                    )
                    return
                route.continue_()

            context.route("**/*", route_handler)
            context.add_init_script(
                "window.__incentivesMock = true;"
            )
            page = context.new_page()
            page.goto(f"http://127.0.0.1:{site_port}/index.html#incentives")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(2000)

            # 4. inc_view: the "Incentives" nav link is visible; the
            #    #incentives section is visible; #tabs and #portfolio are hidden.
            try:
                inc_link = page.locator('a.hdr-link[href="#incentives"], a[href="#incentives"]')
                inc_link_visible = inc_link.count() > 0 and inc_link.first.is_visible()

                incentives = page.locator("#incentives")
                incentives_visible = incentives.count() > 0 and incentives.is_visible()

                tabs_hidden = page.locator("#tabs").count() == 0 or not page.locator("#tabs").is_visible()
                portfolio_hidden = page.locator("#portfolio").count() == 0 or not page.locator("#portfolio").is_visible()

                if inc_link_visible and incentives_visible and tabs_hidden and portfolio_hidden:
                    results["inc_view"] = 1
                else:
                    reasons.append("incentives view")
            except Exception:
                reasons.append("incentives view")

            # 5. inc_round: the section text contains "Epoch 25" and a
            #    countdown in d/h/m format.
            try:
                section_text = page.locator("#incentives").inner_text()
                has_epoch = "Epoch 25" in section_text
                # Countdown formats: "12d 03h 45m", "12d 3h 45m", "0d 00h 00m"
                import re as _re
                has_countdown = _re.search(r"\d+d\s+\d+h\s+\d+m", section_text) is not None
                if has_epoch and has_countdown:
                    results["inc_round"] = 1
                else:
                    reasons.append("epoch 25 countdown")
            except Exception:
                reasons.append("epoch 25 countdown")

            # 6. inc_board: first board row is pool 45049 with est 3039.65;
            #    the unranked pools must be after the ranked ones.
            try:
                board_rows = page.locator("#incentives .board-row, #incentives [data-board] .board-row").all()
                if not board_rows:
                    reasons.append("board rows")
                else:
                    first_row_text = board_rows[0].inner_text()
                    normalized_first = " ".join(first_row_text.split())
                    expected_first = f"{first_pool} {first_est_text}"
                    # The row may contain extra fields; the pool id and est
                    # must appear in order within the first row.
                    first_ok = (
                        first_pool in normalized_first
                        and first_est_text in normalized_first
                        and normalized_first.index(first_pool) < normalized_first.index(first_est_text)
                    )

                    # Unranked pools must appear after all ranked pools in the
                    # flattened row text. Build the full ordered text.
                    full_text = " ".join(
                        " ".join(row.inner_text().split()) for row in board_rows
                    )
                    ranked_order_ok = True
                    for idx, (pool, _est) in enumerate(ranked):
                        if pool not in full_text:
                            ranked_order_ok = False
                            break
                        pos = full_text.index(pool)
                        if idx > 0:
                            prev_pool = ranked[idx - 1][0]
                            if pos < full_text.index(prev_pool):
                                ranked_order_ok = False
                                break

                    unranked_after_ok = True
                    if unranked:
                        last_ranked_pos = -1
                        for pool, _est in ranked:
                            pos = full_text.index(pool)
                            if pos > last_ranked_pos:
                                last_ranked_pos = pos
                        for pool in unranked:
                            if pool not in full_text:
                                unranked_after_ok = False
                                break
                            if full_text.index(pool) < last_ranked_pos:
                                unranked_after_ok = False
                                break

                    if first_ok and ranked_order_ok and unranked_after_ok:
                        results["inc_board"] = 1
                    else:
                        reasons.append("board ranking")
            except Exception:
                reasons.append("board ranking")

            # 7. inc_offers: with the injected offer, "5 USDC per 1,000 ANTS"
            #    and "max 50 USDC" appear.
            try:
                incentives_text = page.locator("#incentives").inner_text()
                if "5 USDC per 1,000 ANTS" in incentives_text and "max 50 USDC" in incentives_text:
                    results["inc_offers"] = 1
                else:
                    reasons.append("offer row")
            except Exception:
                reasons.append("offer row")

            # 8. inc_calc: pool 52894 with the same offer: Y=2000 -> "10.00 USDC",
            #    Y=20000 -> "50.00 USDC" (capped).
            try:
                calc_before = page.locator("#incentives").inner_text()
                y_input = page.locator("#inc-y, #incentives input[type=number], #incentives input")
                if y_input.count() == 0:
                    reasons.append("calc input")
                else:
                    y_input.first.fill("2000")
                    page.wait_for_timeout(300)
                    calc_text_2000 = page.locator("#incentives").inner_text()
                    got_2000 = "10.00 USDC" in calc_text_2000

                    y_input.first.fill("20000")
                    page.wait_for_timeout(300)
                    calc_text_20000 = page.locator("#incentives").inner_text()
                    got_20000 = "50.00 USDC" in calc_text_20000

                    if got_2000 and got_20000:
                        results["inc_calc"] = 1
                    else:
                        reasons.append("incentives calc")
                _ = calc_before
            except Exception:
                reasons.append("incentives calc")

            # 9. inc_offers, no-offers case: offers.json = [] must show the
            #    "No offers for epoch 25 yet" message.
            offers = []
            page.reload()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)
            try:
                no_offers_text = page.locator("#incentives").inner_text()
                if "No offers for epoch 25 yet" in no_offers_text:
                    results["inc_offers"] = 1
                else:
                    reasons.append("no offers message")
            except Exception:
                reasons.append("no offers message")

            # 10. inc_offers, post offer href: with offers.json = [] the CTA
            #     "Post an offer" must link to the GitHub issue form with the
            #     right body.
            try:
                post_btn = page.locator('#incentives a[href*="issues/new"], #incentives a:has-text("Post an offer")')
                if post_btn.count() == 0:
                    reasons.append("post offer link")
                else:
                    href = post_btn.first.get_attribute("href") or ""
                    if post_offer_href_ok(href):
                        results["inc_offers"] = 1
                    else:
                        reasons.append("post offer link")
            except Exception:
                reasons.append("post offer link")

            # 11. inc_offers, note rendering: an offer with note "<b>x</b>"
            #     must render literally as text.
            offers = [
                {
                    "pool": "52894",
                    "usdcPer1k": 5,
                    "capAnts": 10000,
                    "note": "<b>x</b>",
                }
            ]
            page.reload()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)
            try:
                note_text = page.locator("#incentives").inner_text()
                if "<b>x</b>" in note_text:
                    results["inc_offers"] = 1
                else:
                    reasons.append("offer note literal")
            except Exception:
                reasons.append("offer note literal")

            # 12. inc_calc, with the note offer: pool 52894 still caps and
            #     formats values the same way regardless of the note.
            try:
                y_input = page.locator("#inc-y, #incentives input[type=number], #incentives input")
                if y_input.count() == 0:
                    reasons.append("calc input")
                else:
                    y_input.first.fill("2000")
                    page.wait_for_timeout(300)
                    calc_text_2000 = page.locator("#incentives").inner_text()
                    got_2000 = "10.00 USDC" in calc_text_2000

                    y_input.first.fill("20000")
                    page.wait_for_timeout(300)
                    calc_text_20000 = page.locator("#incentives").inner_text()
                    got_20000 = "50.00 USDC" in calc_text_20000

                    if got_2000 and got_20000:
                        results["inc_calc"] = 1
                    else:
                        reasons.append("incentives calc")
            except Exception:
                reasons.append("incentives calc")

            # 13. Print results.
            for key in ["inc_view", "inc_round", "inc_board", "inc_offers", "inc_calc"]:
                print(f"{key}={results[key]}")

            for reason in reasons:
                if reason.startswith("missing:"):
                    print(f"reason={reason}")
                else:
                    print(f"reason=missing: {reason}")

            if all(results.values()):
                return 0
            return 1

    except Exception as exc:
        print("inc_view=0")
        print("inc_round=0")
        print("inc_board=0")
        print("inc_offers=0")
        print("inc_calc=0")
        print(f"reason={type(exc).__name__}: {exc}")
        return 1
    finally:
        e2e.stop_all()


if __name__ == "__main__":
    sys.exit(run_guard())
