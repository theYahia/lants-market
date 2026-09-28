#!/usr/bin/env python3
"""Incentives v2 guard: seller stats, buyer ANTS per $1, the no-pool list.

Offline: no RPC, no network. Numbers are recomputed here from three fixtures
captured on 28.09.2026 and compared with what the page shows.

Fixtures (site/fixtures/):
- snapshot-e24.live.json          the data-branch live.json of 28.09 03:57 UTC (epoch 24)
- antscan-sellers-2026-09-28.json https://antscan.co/api/sellers, 271 sellers, raw
- usage-e24.json                  on-chain reads at one block, equal on two RPCs:
                                  buyer/seller budgets, totalWeightedBuyerPointsByEpoch,
                                  poolWeightAtEpoch for epochs 23 and 24, MAX_REWARD_SHARE_BPS,
                                  remainingInits (starter grants left), initEndEpoch

Snapshot fields this iteration adds (the data contract; compose_snapshot() below
is the reference build the page is tested against):
  sellersById[agentId] = {name, earnedUsdc, uniqueBuyers, firstSeenAt, lastSeenAt, stakeUsdc, modelsServed}
      only sellers with earnedUsdc >= 100e6; name = antscan sellerName ('' if none);
      earnedUsdc / stakeUsdc stay decimal strings in micro-USDC, the rest are integers
  usageByEpoch[h] = {buyerBudget, sellerBudget, totalWeightedBuyerPoints, poolWeights{pool: w}}
      h = e-1 and e (e = snapshot.epoch); decimal strings; poolWeights only for w > 0
  maxRewardShareBps, starterGrantsLeft, starterInitEndEpoch   decimal strings

Keys:
  inc_sellers_data  node site/enrich-sales.mjs --sellers <antscan fixture> writes sellersById as above
  inc_net           one line under the countdown: Network, epoch N: B ANTS to stakers · S ANTS staked · A per 1,000 on average
  inc_postcta       exactly one visible a.inc-post-offer, above the board table, centred on it
  inc_expand        a button.inc-expand per board row; it opens a tr.inc-detail right under its row
  inc_expand_sort   after a header sort the open detail row still sits right under its board row
  inc_cashback_head  a 4th heading "Buyer ANTS per $1, epoch e so far" with a tip that names the cap and "0 = no pool"
  inc_cashback      the cells: floor(B·W·1e6/T) with separators, "<1", "from epoch e+1", "0"
  inc_cashback_early  when T(e) < 5 % of T(e-1): heading "final, epoch e-1" and cells from epoch e-1
  inc_cashback_detail  the detail row: "<cell> ANTS per $1", "reached at ≈ $D"; at 390 px the column is hidden, no side scroll
  inc_nopool        .inc-nopool under the board: steps, active sellers without a pool, closed list of inactive ones
  inc_nopool_x      the first active row shows what a starter pool plus a restaked first seller reward earns it
  inc_nopool_earned  the first active row shows all-time earnings as whole dollars with separators
  inc_nopool_phone  at 390 px the seller cell of the first no-pool row is at least 90 px wide
  inc_polish        the estimate cell has the colour of the other cells; the expand button is not a light box;
                    the detail row has " · " before "<n> ANTS per $1"

Run: python scripts/site/check_incentives_v2.py   (prints key=0/1 and reason= lines; exit 0 only if all are 1)
"""

import json
import math
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.resolve()))
import e2e_fork_trade as e2e  # noqa: E402
from check_incentives import post_offer_href_ok, LIVE_URLS  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
FIX = REPO / "site" / "fixtures"
SNAP = FIX / "snapshot-e24.live.json"
ANTSCAN = FIX / "antscan-sellers-2026-09-28.json"
USAGE = FIX / "usage-e24.json"
TRACKED = FIX / "snapshot-e23.live.json"  # enrich-sales.mjs rewrites this file in place

WEEK = 604800
MIN_EARNED = 100 * 10**6
NOPOOL_EARNED = 1000 * 10**6
ACTIVE_SECS = 14 * 86400
GRANT_ADDR = "0xB68AD13b681319fcEB6b0A640c2fd96C0138CBc8"


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def seller_record(s):
    return {
        "name": s.get("sellerName") or "",
        "earnedUsdc": str(s["earnedUsdc"]),
        "uniqueBuyers": int(s["uniqueBuyers"]),
        "firstSeenAt": int(s["firstSeenAt"]),
        "lastSeenAt": int(s["lastSeenAt"]),
        "stakeUsdc": str(s["stakeUsdc"]),
        "modelsServed": int(s["modelsServed"]),
    }


def sellers_by_id(antscan):
    out = {}
    for s in antscan:
        if int(s["earnedUsdc"]) >= MIN_EARNED:
            key = str(s["agentId"]) if str(s.get("agentId") or "0") != "0" else "addr:" + s["address"]
            out[key] = seller_record(s)
    return out


def compose_snapshot():
    snap = load(SNAP)
    usage = load(USAGE)
    snap["sellersById"] = sellers_by_id(load(ANTSCAN))
    snap["usageByEpoch"] = {h: dict(v) for h, v in usage["byEpoch"].items()}
    snap["maxRewardShareBps"] = usage["maxRewardShareBps"]
    snap["starterGrantsLeft"] = usage["starterGrantsLeft"]
    snap["starterInitEndEpoch"] = usage["starterInitEndEpoch"]
    return snap


def fmt(n):
    return f"{n:,}"


def cashback_wei(u, pool):
    """ANTS (in wei) a buyer earns per $1 with this pool: B * W * 1e6 / T, floor."""
    t = int(u["totalWeightedBuyerPoints"])
    w = int(u["poolWeights"].get(pool, "0"))
    return int(u["buyerBudget"]) * w * 10**6 // t if t else 0


def cashback_text(snap, pool):
    """What the cashback cell must read for this pool, and the heading epoch."""
    e = int(snap["epoch"])
    cur, prev = snap["usageByEpoch"][str(e)], snap["usageByEpoch"].get(str(e - 1))
    use, h = cur, e
    if prev and int(cur["totalWeightedBuyerPoints"]) * 20 < int(prev["totalWeightedBuyerPoints"]):
        use, h = prev, e - 1  # T(e) under 5 % of T(e-1): too early in the epoch, show the final e-1
    wei = cashback_wei(use, pool)
    if wei == 0:
        wn = int(snap["poolWeightByEpoch"].get(pool, {}).get(str(e + 1), "0") or 0)
        return (f"from epoch {e + 1}" if wn > 0 else "0"), h
    if wei < 10**18:
        return "<1", h
    return fmt(wei // 10**18), h


def starter_estimate(snap, s):
    """ANTS per epoch to the seller with a starter pool plus its first seller reward restaked at max lock."""
    e = int(snap["epoch"])
    n = e + 1
    u = snap["usageByEpoch"][str(e)]
    sb, t = int(u["sellerBudget"]), int(u["totalWeightedBuyerPoints"])
    cap = sb * int(snap["maxRewardShareBps"]) // 10000
    weekly = int(s["earnedUsdc"]) * WEEK // max(s["lastSeenAt"] - s["firstSeenAt"], WEEK)
    w1 = (int(snap["starterInitEndEpoch"]) - n) * 10**18
    r1 = sb * weekly * w1 // t
    w2 = w1 + r1 * 104
    return min(cap, sb * weekly * w2 // t) // 10**18


def nopool_lists(snap):
    gen = int(datetime.fromisoformat(snap["generatedAt"].replace("Z", "+00:00")).timestamp())
    n = str(int(snap["epoch"]) + 1)
    active, inactive = [], []
    for pid, s in sorted(snap["sellersById"].items(), key=lambda kv: -int(kv[1]["earnedUsdc"])):
        if int(s["earnedUsdc"]) < NOPOOL_EARNED:
            continue
        if str(snap["poolWeightByEpoch"].get(pid, {}).get(n, "0") or "0") != "0":
            continue
        (active if gen - s["lastSeenAt"] <= ACTIVE_SECS else inactive).append((pid, s))
    return active, inactive


def net_line(snap):
    n = str(int(snap["epoch"]) + 1)
    budget = int(snap["stakerBudgetNext"]) // 10**18
    weight = sum(int(v.get(n, "0") or 0) for v in snap["poolWeightByEpoch"].values())
    staked = weight / 1e18 / 104
    avg = round(budget / staked * 1000)
    return f"Network, epoch {n}: {fmt(budget)} ANTS to stakers · {fmt(round(staked))} ANTS staked · {avg} per 1,000 on average"


def run_guard():
    results = {k: 0 for k in ["inc_sellers_data", "inc_net", "inc_postcta", "inc_expand", "inc_expand_sort", "inc_cashback_head", "inc_cashback", "inc_cashback_early", "inc_cashback_detail", "inc_nopool", "inc_nopool_x", "inc_nopool_earned", "inc_nopool_phone", "inc_polish"]}
    checks = {k: [] for k in results}
    reasons = []

    def record(key, why, ok):
        checks[key].append(bool(ok))
        if not ok:
            reasons.append(f"missing: {key}: {why}")

    def crash(key, exc):
        # an exception is printed with its class (KONTRAKT): Playwright TimeoutError = element not there
        checks[key].append(False)
        reasons.append(f"{type(exc).__name__}: {key}: {str(exc).splitlines()[0][:200]}")

    # ---- inc_sellers_data: the CI enrich step, run on the antscan fixture ----
    backup = TRACKED.read_bytes()
    try:
        r = subprocess.run(["node", "site/enrich-sales.mjs", "--sellers", str(ANTSCAN.relative_to(REPO))],
                           cwd=REPO, capture_output=True, text=True, timeout=120)
        out = json.loads(TRACKED.read_text(encoding="utf-8"))
        got = out.get("sellersById")
        want = sellers_by_id(load(ANTSCAN))
        record("inc_sellers_data", f"enrich-sales exit {r.returncode}: {r.stderr[-200:]}", r.returncode == 0)
        record("inc_sellers_data", f"sellersById has {len(got or {})} sellers, want {len(want)}", isinstance(got, dict) and len(got) == len(want))
        if isinstance(got, dict):
            bad = [k for k in want if got.get(k) != want[k]]
            record("inc_sellers_data", f"{len(bad)} records differ from the contract, first {bad[:3]}: got {got.get(bad[0]) if bad else ''} want {want[bad[0]] if bad else ''}", not bad)
        record("inc_sellers_data", "salesByPool lost", bool(out.get("salesByPool")))
    except Exception as exc:
        crash("inc_sellers_data", exc)
    finally:
        TRACKED.write_bytes(backup)

    # ---- page keys: the composed snapshot served in place of live.json ----
    snap = compose_snapshot()
    body = [json.dumps(snap).encode()]
    e = int(snap["epoch"])

    try:
        port = e2e.start_http_server()
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            def route(r):
                url = r.request.url
                if url.startswith("http://127.0.0.1:"):
                    return r.continue_()
                if any(url.startswith(u) for u in LIVE_URLS):
                    return r.fulfill(status=200, content_type="application/json", body=body[0])
                if "offers.json" in url:
                    return r.fulfill(status=200, content_type="application/json", body=b"[]")
                if "pool-names.json" in url:
                    return r.fulfill(status=200, content_type="application/json", body=b'{"52894": "Test Apex"}')
                return r.continue_()

            def open_page(width, tag):
                ctx = browser.new_context(viewport={"width": width, "height": 900})
                ctx.route("**/*", route)
                page = ctx.new_page()
                page.set_default_timeout(5000)
                page.goto(f"http://127.0.0.1:{port}/index.html?r={tag}#incentives")
                page.wait_for_load_state("networkidle")
                page.wait_for_selector("#incentives table.inc-board-table tr.board-row", timeout=15000)
                page.wait_for_timeout(500)
                return page

            page = open_page(1280, "v2")
            table = page.locator("#incentives table.inc-board-table")
            tbox = table.bounding_box()

            # inc_net
            try:
                net = page.locator("#incentives .inc-net")
                want = net_line(snap)
                record("inc_net", f"want one .inc-net, got {net.count()}", net.count() == 1)
                if net.count() == 1:
                    text = " ".join(net.inner_text().split())
                    record("inc_net", f"text {text!r} != {want!r}", text == want)
                    title = page.locator("#incentives .inc-header h2").bounding_box()
                    nb = net.bounding_box()
                    record("inc_net", "not between the countdown and the board", title and nb and title["y"] <= nb["y"] and nb["y"] + nb["height"] <= tbox["y"] + 1)
            except Exception as exc:
                crash("inc_net", exc)

            # inc_postcta
            try:
                links = page.locator("#incentives a.inc-post-offer")
                vis = [links.nth(i) for i in range(links.count()) if links.nth(i).is_visible()]
                record("inc_postcta", f"want exactly 1 visible a.inc-post-offer, got {len(vis)}", len(vis) == 1)
                if len(vis) == 1:
                    b = vis[0].bounding_box()
                    record("inc_postcta", "button is not above the board", b["y"] + b["height"] <= tbox["y"] + 1)
                    off = abs((b["x"] + b["width"] / 2) - (tbox["x"] + tbox["width"] / 2))
                    record("inc_postcta", f"button centre is {off:.0f}px off the board centre (max 60)", off <= 60)
                    record("inc_postcta", "text does not start with 'Post an offer'", vis[0].inner_text().strip().startswith("Post an offer"))
                    record("inc_postcta", "href is not the GitHub issue form", post_offer_href_ok(vis[0].get_attribute("href") or ""))
            except Exception as exc:
                crash("inc_postcta", exc)

            # inc_expand
            try:
                rows = page.locator("#incentives tr.board-row")
                btns = page.locator("#incentives tr.board-row button.inc-expand")
                record("inc_expand", f"{btns.count()} expand buttons for {rows.count()} rows", btns.count() == rows.count() and rows.count() > 0)
                apex = snap["sellersById"]["52894"]

                def detail_of(pool):
                    return page.locator(f'#incentives tr.board-row[data-pool="{pool}"] + tr.inc-detail')

                btn = page.locator('#incentives tr.board-row[data-pool="52894"] button.inc-expand')
                record("inc_expand", "aria-expanded is not 'false' before a click", btn.get_attribute("aria-expanded") == "false")
                btn.click()
                page.wait_for_timeout(200)
                det = detail_of("52894")
                record("inc_expand", "aria-expanded is not 'true' after a click", btn.get_attribute("aria-expanded") == "true")
                ok = det.count() == 1 and det.is_visible()
                record("inc_expand", "no visible tr.inc-detail right under the 52894 row", ok)
                if ok:
                    t = det.inner_text()
                    for needle in [f"{fmt(apex['uniqueBuyers'])} buyers", "avg per active week", f"{apex['modelsServed']} models"]:
                        record("inc_expand", f"detail lacks {needle!r}: {t[:160]!r}", needle in t)
                btn.click()
                page.wait_for_timeout(200)
                record("inc_expand", "second click does not close the detail", btn.get_attribute("aria-expanded") == "false" and (det.count() == 0 or not det.is_visible()))
                missing = next(p_ for p_ in (r_.get_attribute("data-pool") for r_ in rows.all()) if p_ not in snap["sellersById"])
                page.locator(f'#incentives tr.board-row[data-pool="{missing}"] button.inc-expand').click()
                page.wait_for_timeout(200)
                record("inc_expand", f"pool {missing} without antscan data does not say 'No sales data from antscan'", "No sales data from antscan" in detail_of(missing).inner_text())
                page.locator(f'#incentives tr.board-row[data-pool="{missing}"] button.inc-expand').click()
                # sorting must carry an OPEN detail row with its board row: open, sort, then look
                btn.click()
                page.wait_for_timeout(200)
                before = page.evaluate("() => [...document.querySelectorAll('#incentives tbody tr.board-row')].map(r => r.dataset.pool).join()")
                page.locator("#incentives thead th button.inc-sort").first.click()
                page.wait_for_timeout(300)
                after = page.evaluate("() => [...document.querySelectorAll('#incentives tbody tr.board-row')].map(r => r.dataset.pool).join()")
                record("inc_expand_sort", "the sort did not reorder the rows, nothing proven", before != after)
                record("inc_expand_sort", "after sorting, the open 52894 detail is not right under its row", detail_of("52894").count() == 1 and detail_of("52894").is_visible())
                record("inc_expand_sort", "after sorting there are stray tr.inc-detail rows", page.locator("#incentives tr.inc-detail").count() == 1)
                btn.click()
            except Exception as exc:
                crash("inc_expand", exc)
                crash("inc_expand_sort", exc)

            # inc_cashback (desktop)
            try:
                heads = page.locator("#incentives table.inc-board-table thead th")
                idx = next((i for i in range(heads.count()) if heads.nth(i).inner_text().strip().lower().startswith("buyer ants per $1")), None)
                record("inc_cashback_head", "no 'Buyer ANTS per $1' column heading", idx is not None)
                record("inc_cashback", "no 'Buyer ANTS per $1' column heading", idx is not None)
                if idx is not None:
                    htext = " ".join(heads.nth(idx).inner_text().split()).lower()  # headings are uppercased by CSS
                    record("inc_cashback_head", f"heading {htext!r} lacks 'epoch {e} so far'", f"epoch {e} so far" in htext)
                    tip = heads.nth(idx).locator("span.info").get_attribute("data-tip") or ""
                    cap = int(snap["usageByEpoch"][str(e)]["buyerBudget"]) * int(snap["maxRewardShareBps"]) // 10000 // 10**18
                    for needle in [f"Capped at {fmt(cap)} ANTS per buyer per epoch", "0 = no pool"]:
                        record("inc_cashback_head", f"tip lacks {needle!r}", needle in tip)
                    for pool in ["44694", "52894", "47140", "53354"]:
                        want, _ = cashback_text(snap, pool)
                        cell = page.locator(f'#incentives tr.board-row[data-pool="{pool}"] td').nth(idx)
                        got = " ".join(cell.inner_text().split())
                        record("inc_cashback", f"pool {pool}: cell {got!r}, want {want!r}", got == want)
            except Exception as exc:
                crash("inc_cashback_head", exc)
                crash("inc_cashback", exc)

            # inc_cashback_detail (desktop): the detail row names the cap in dollars at this rate
            try:
                cap = int(snap["usageByEpoch"][str(e)]["buyerBudget"]) * int(snap["maxRewardShareBps"]) // 10000 // 10**18
                rate = cashback_wei(snap["usageByEpoch"][str(e)], "44694") / 1e18
                dollars = math.ceil(cap / rate)
                page.locator('#incentives tr.board-row[data-pool="44694"] button.inc-expand').click()
                page.wait_for_timeout(200)
                dt = page.locator('#incentives tr.board-row[data-pool="44694"] + tr.inc-detail').inner_text()
                record("inc_cashback_detail", f"44694 detail lacks 'reached at ≈ ${dollars}': {dt[:200]!r}", f"reached at ≈ ${dollars}" in dt)
                want, _ = cashback_text(snap, "44694")
                record("inc_cashback_detail", f"44694 detail lacks '{want} ANTS per $1'", f"{want} ANTS per $1" in dt)
                record("inc_polish", f"44694 detail lacks the separator before the cashback: ' · {want} ANTS per $1'", f" · {want} ANTS per $1" in dt)
                bg = page.locator('#incentives tr.board-row[data-pool="44694"] button.inc-expand').evaluate("el => getComputedStyle(el).backgroundColor")
                rgb = [int(x) for x in bg.replace("rgba(", "").replace("rgb(", "").replace(")", "").split(",")[:3]]
                alpha = float(bg.split(",")[3].strip(" )")) if bg.startswith("rgba") else 1.0
                record("inc_polish", f"expand button is a light box ({bg}); style it like the page's small buttons", alpha == 0 or sum(rgb) < 300)
            except Exception as exc:
                crash("inc_cashback_detail", exc)

            # inc_nopool
            try:
                sec = page.locator("#incentives .inc-nopool")
                record("inc_nopool", f"want one .inc-nopool, got {sec.count()}", sec.count() == 1)
                if sec.count() != 1 or sec.locator("tr.nopool-row").count() == 0:
                    record("inc_nopool_x", "no .inc-nopool rows to hold the starter-pool estimate", False)
                if sec.count() == 1:
                    sb = sec.bounding_box()
                    record("inc_nopool", "block is not under the board", sb["y"] >= tbox["y"] + tbox["height"] - 1)
                    st = sec.inner_text()
                    record("inc_nopool", "heading lacks 'Selling, but no pool'", "selling, but no pool" in st.lower())  # headings may be uppercased by CSS
                    for needle in ["initPosition()", GRANT_ADDR, "stakeAgentReward", f"{snap['starterGrantsLeft']} left"]:
                        record("inc_nopool", f"steps lack {needle!r}", needle in st)
                    active, inactive = nopool_lists(snap)
                    arows = sec.locator("tr.nopool-row:not(details tr)")
                    record("inc_nopool", f"{arows.count()} active rows, want {len(active)}", arows.count() == len(active))
                    if arows.count() and active:
                        first_id, first = active[0]
                        ft = arows.first.inner_text()
                        record("inc_nopool", f"first row {ft[:80]!r} is not {first['name']!r}", first["name"] in ft)
                        earned = f"${fmt(int(first['earnedUsdc']) // 10**6)}"
                        record("inc_nopool_earned", f"first row lacks all-time earnings {earned!r}: {ft[:120]!r}", earned in ft)
                        # inc_polish: the estimate reads as data, not as an error: same colour as the buyers cell
                        cells = arows.first.locator("td")
                        colors = [cells.nth(i).evaluate("el => getComputedStyle(el).color") for i in range(cells.count())]
                        texts = [cells.nth(i).inner_text() for i in range(cells.count())]
                        xi = next((i for i, t in enumerate(texts) if "ANTS/epoch" in t), None)
                        bi = next((i for i, t in enumerate(texts) if t.strip() == str(first["uniqueBuyers"])), None)
                        record("inc_polish", f"estimate cell colour {colors[xi] if xi is not None else None} differs from the buyers cell {colors[bi] if bi is not None else None}",
                               xi is not None and bi is not None and colors[xi] == colors[bi])
                        want_x = f"{fmt(starter_estimate(snap, first))} ANTS"
                        record("inc_nopool_x", f"first row lacks {want_x!r}: {ft[:160]!r}", want_x in ft)
                    det = sec.locator("details.inc-nopool-inactive")
                    record("inc_nopool", "want one closed details.inc-nopool-inactive", det.count() == 1 and det.get_attribute("open") is None)
                    if det.count() == 1:
                        record("inc_nopool", f"inactive summary lacks '{len(inactive)}'", str(len(inactive)) in det.locator("summary").inner_text())
                        record("inc_nopool", f"inactive rows {det.locator('tr.nopool-row').count()}, want {len(inactive)}", det.locator("tr.nopool-row").count() == len(inactive))
            except Exception as exc:
                crash("inc_nopool", exc)
                crash("inc_nopool_x", exc)
                crash("inc_nopool_earned", exc)

            # inc_cashback fallback: too early in the epoch -> the final previous epoch
            try:
                early = json.loads(body[0])
                early["usageByEpoch"][str(e)]["totalWeightedBuyerPoints"] = str(int(early["usageByEpoch"][str(e - 1)]["totalWeightedBuyerPoints"]) // 100)
                body[0] = json.dumps(early).encode()
                pg = open_page(1280, "early")
                heads = pg.locator("#incentives table.inc-board-table thead th")
                idx = next((i for i in range(heads.count()) if heads.nth(i).inner_text().strip().lower().startswith("buyer ants per $1")), None)
                ok = idx is not None and f"final, epoch {e - 1}" in heads.nth(idx).inner_text().lower()
                record("inc_cashback_early", f"early in the epoch the heading does not say 'final, epoch {e - 1}'", ok)
                if idx is not None:
                    want, _ = cashback_text(early, "44694")
                    got = " ".join(pg.locator('#incentives tr.board-row[data-pool="44694"] td').nth(idx).inner_text().split())
                    record("inc_cashback_early", f"fallback 44694 cell {got!r}, want {want!r}", got == want)
            except Exception as exc:
                crash("inc_cashback_early", exc)
            finally:
                body[0] = json.dumps(snap).encode()

            # inc_cashback on a phone: column hidden, no side scroll, the number in the detail row
            try:
                ph = open_page(390, "phone")
                sw = ph.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
                record("inc_cashback_detail", f"390px scrolls sideways: {sw}", sw[0] <= sw[1])
                heads = ph.locator("#incentives table.inc-board-table thead th")
                vis = [heads.nth(i) for i in range(heads.count()) if heads.nth(i).is_visible() and heads.nth(i).inner_text().strip().lower().startswith("buyer ants per $1")]
                record("inc_cashback_detail", "cashback heading is visible at 390px", not vis)
                ph.locator('#incentives tr.board-row[data-pool="44694"] button.inc-expand').click()
                ph.wait_for_timeout(200)
                want, _ = cashback_text(snap, "44694")
                dt = ph.locator('#incentives tr.board-row[data-pool="44694"] + tr.inc-detail').inner_text()
                record("inc_cashback_detail", f"390px detail lacks '{want} ANTS per $1'", f"{want} ANTS per $1" in dt)
                name_cell = ph.locator("#incentives .inc-nopool tr.nopool-row").first.locator("td").first
                w = name_cell.bounding_box()["width"] if name_cell.count() else 0
                record("inc_nopool_phone", f"390px: the seller cell of the first no-pool row is {w:.0f}px wide (want >= 90), names break per letter", w >= 90)
            except Exception as exc:
                crash("inc_cashback_detail", exc)
                crash("inc_nopool_phone", exc)

            browser.close()
    except Exception as exc:
        reasons.append(f"{type(exc).__name__}: guard: {str(exc).splitlines()[0][:200]}")
    finally:
        e2e.stop_all()

    for k in results:
        results[k] = 1 if checks[k] and all(checks[k]) else 0
        print(f"{k}={results[k]}")
    for r in reasons:
        print("reason=" + r)
    return 0 if all(results.values()) else 1


if __name__ == "__main__":
    sys.exit(run_guard())
