import os
import sys
import json
import time
import threading
import urllib.request
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE_DIR = os.path.join(ROOT, "site")
PORT = 8000

LIVE_SNAPSHOT_URL = (
    "https://ipfs.filebase.io/ipns/"
    "k51qzi5uqu5di86efhnadxw0k1sxnuo2tkcmegxcn2ra2r3exyfpv9htxhit6b/"
    "fixtures/snapshot-e23.live.json"
)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args, **kwargs):
        pass


def start_server():
    handler = partial(QuietHandler, directory=SITE_DIR)
    httpd = HTTPServer(("localhost", PORT), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def emit(msg):
    print(msg)
    print(msg, file=sys.stderr)


def fetch_live_snapshot():
    try:
        with urllib.request.urlopen(LIVE_SNAPSHOT_URL, timeout=20) as resp:
            raw = resp.read()
    except Exception as e:
        return None, f"fetch_failed:{type(e).__name__}"

    try:
        data = json.loads(raw)
    except Exception as e:
        return None, f"json_parse_failed:{type(e).__name__}"

    block = data.get("snapshotBlock")
    epoch = data.get("snapshotEpoch")
    if block is None or epoch is None:
        return None, "missing_fields"

    return {"block": str(block), "epoch": str(epoch)}, None


def main():
    snap, reason = fetch_live_snapshot()
    if snap is None:
        emit(f"fresh_ok=skip reason={reason}")
        return 0

    expected_block = f"#{snap['block']}"
    expected_epoch = f"epoch {snap['epoch']}"

    httpd = start_server()
    # Give the server a moment to come up.
    time.sleep(0.4)

    url = f"http://localhost:{PORT}/"

    first_ok = False
    fresh_ok_footer = False

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url, wait_until="domcontentloaded")

            # Open the "All positions" tab if a tab control exists.
            try:
                page.get_by_text("All positions", exact=False).first.click(timeout=2000)
            except Exception:
                pass

            # 1) Within 600ms the tbody must already have rows (local snapshot).
            page.wait_for_timeout(600)
            try:
                rows = page.eval_on_selector_all("table tbody tr", "els => els.length")
            except Exception:
                rows = 0
            first_ok = rows > 0

            # 2) Within ~20s wait for the live footer swap.
            deadline = time.time() + 22
            while time.time() < deadline:
                try:
                    txt = page.inner_text(".snap-footer")
                except Exception:
                    txt = ""
                if expected_block in txt and expected_epoch in txt:
                    fresh_ok_footer = True
                    break
                page.wait_for_timeout(500)

            browser.close()
    finally:
        try:
            httpd.shutdown()
        except Exception:
            pass

    if first_ok and fresh_ok_footer:
        emit("fresh_ok=1 (first_ok=True footer_ok=True)")
        return 0
    else:
        emit(f"fresh_ok=0 (first_ok={first_ok} footer_ok={fresh_ok_footer})")
        return 1


if __name__ == "__main__":
    sys.exit(main())