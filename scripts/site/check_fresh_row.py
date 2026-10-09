#!/usr/bin/env python3
"""Playwright guard: a position newer than the snapshot renders as a fresh row.

Serves site/, mocks the read RPC (eth_call) and calls the real
``renderMyPositions()`` with one id from the snapshot fixture and one id that is
not in it. The fresh row must carry ``is-fresh``, a muted reward/exit color and
the ``.info`` tip naming the snapshot epoch.

Run:  python scripts/site/check_fresh_row.py
Signals (one per line):
    fresh_epoch=<N>
    fresh_rows=<n>
    fresh_class_ok=<0|1>
    fresh_tip_ok=<0|1>
    fresh_muted_ok=<0|1>
    fresh_ok=<0|1>
"""

import json
import socket
import sys
import threading
import http.server
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

REPO = Path(__file__).resolve().parents[2]
SITE = REPO / "site"
FIXTURE = SITE / "fixtures" / "snapshot-e24.live.json"

ACCOUNT = "0x" + "b0" * 20
FRESH_ID = "999999"  # not in the fixture
RPC_HOSTS = ("base-rpc.publicnode.com", "base.drpc.org", "mainnet.base.org")
POSITIONS_SELECTOR = "0x99fbab88"  # positions(uint256) on the positions contract


def _word(x: int) -> str:
    return format(x, "064x")


def _positions_result() -> str:
    # words: [?, ?, amount, ?, ?, stakeEndEpoch, closedAt, withdrawn] — see market-view.mjs
    words = [0, 0, 10**18, 0, 0, 130, 0, 0]
    return "0x" + "".join(_word(w) for w in words)


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _start_server(port: int) -> http.server.ThreadingHTTPServer:
    class Silent(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(SITE), **kwargs)

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Silent)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def _pick_real_id(snapshot) -> str:
    epoch = int(snapshot.get("epoch") or snapshot.get("snapshotEpoch") or 0)
    for pos in snapshot.get("positions", []):
        if pos.get("withdrawn"):
            continue
        closed = int(pos.get("closedAtEpoch") or 0)
        if closed > 0 and closed <= epoch:
            continue
        if str(pos.get("id")) != FRESH_ID:
            return str(pos["id"])
    raise RuntimeError("no live position in the fixture")


def main() -> int:
    snapshot = json.loads(FIXTURE.read_text(encoding="utf-8"))
    epoch = snapshot.get("epoch") or snapshot.get("snapshotEpoch")
    real_id = _pick_real_id(snapshot)
    expected_tip = (
        f"Staked after the last snapshot (epoch {epoch}). Max lock, reward and exit "
        "appear after the next snapshot (~06:15 / 14:15 / 22:15 UTC)."
    )

    port = _find_free_port()
    httpd = _start_server(port)

    fresh_rows = 0
    class_ok = tip_ok = muted_ok = 0

    def rpc_mock(route):
        body = route.request.post_data or "{}"
        try:
            q = json.loads(body)
        except Exception:
            q = {}
        data = str(((q.get("params") or [{}])[0] or {}).get("data", ""))
        result = _positions_result() if data.startswith(POSITIONS_SELECTOR) else "0x" + "00" * 32
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"jsonrpc": "2.0", "id": q.get("id", 1), "result": result}),
        )

    def handler(route):
        url = route.request.url
        if url.startswith(f"http://127.0.0.1:{port}"):
            return route.continue_()
        if any(host in url for host in RPC_HOSTS):
            return rpc_mock(route)
        return route.abort()

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.route("**/*", handler)
            try:
                page.goto(f"http://127.0.0.1:{port}/index.html")
                page.wait_for_selector("#pf-positions", state="attached", timeout=15000)
                res = page.evaluate(
                    """
                    async ([account, realId, freshId]) => {
                        const m = await import('./market-view.mjs');
                        const snap = await (await fetch('./fixtures/snapshot-e24.live.json')).json();
                        await m.renderMyPositions(account, [realId, freshId], snap);
                        const rows = [...document.querySelectorAll('#pf-positions .pf-pos-row')];
                        const fresh = rows.find(r => r.dataset.id === String(freshId));
                        const normal = rows.find(r => r.dataset.id === String(realId));
                        const info = fresh && fresh.querySelector('[data-field="lock"] .info');
                        const color = (el) => (el ? getComputedStyle(el).color : null);
                        return {
                            fresh: rows.filter(r => r.classList.contains('is-fresh')).length,
                            freshClass: fresh ? fresh.classList.contains('is-fresh') : null,
                            normalClass: normal ? normal.classList.contains('is-fresh') : null,
                            tip: info ? info.getAttribute('data-tip') : null,
                            title: fresh ? fresh.title : null,
                            freshColor: color(fresh && fresh.children[3]),
                            normalColor: color(normal && normal.children[3]),
                        };
                    }
                    """,
                    [ACCOUNT, real_id, FRESH_ID],
                )
                fresh_rows = int(res["fresh"])
                class_ok = 1 if res["freshClass"] is True and res["normalClass"] is False else 0
                tip_ok = 1 if res["tip"] == expected_tip and res["title"] == expected_tip else 0
                muted_ok = 1 if res["freshColor"] and res["normalColor"] and res["freshColor"] != res["normalColor"] else 0
            except PlaywrightTimeoutError:
                pass
            finally:
                browser.close()
    finally:
        httpd.shutdown()
        httpd.server_close()

    fresh_ok = 1 if (fresh_rows >= 1 and class_ok and tip_ok and muted_ok) else 0

    print(f"fresh_epoch={epoch}")
    print(f"fresh_rows={fresh_rows}")
    print(f"fresh_class_ok={class_ok}")
    print(f"fresh_tip_ok={tip_ok}")
    print(f"fresh_muted_ok={muted_ok}")
    print(f"fresh_ok={fresh_ok}")
    return 0 if fresh_ok == 1 else 1


if __name__ == "__main__":
    sys.exit(main())
