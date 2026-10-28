#!/usr/bin/env python3
"""Playwright guard for checking market tiles on the default page.

The script starts a temporary HTTP server that serves the `site/` directory,
opens the page in a headless Chromium browser, waits for the metric tiles to be
rendered, extracts their text values and reports a few signals.

The header mirrors the native marketplace: Implied price/ANTS, 24H volume,
Implied MC, Implied FDV, Listed/Supply and Floor Ask/ANTS. Metrics derived from
live asks show em dash when there is no live external listing; the 24h volume
is computed from sales (0 with no sales).

Only six signal lines are printed to stdout, one per line:
    price_text=<text>
    volume_text=<text>
    mc_text=<text>
    fdv_text=<text>
    listed_text=<text>
    floor_text=<text>
    tiles_ok=<0|1>
"""

import sys
import threading
import socket
import http.server
from pathlib import Path

from playwright.sync_api import (
    sync_playwright,
    TimeoutError as PlaywrightTimeoutError,
)

# Repository root – script resides in scripts/site/, go up three levels
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SITE_ROOT = REPO_ROOT / "site"

# Metric tiles: id -> signal name
TILES = [
    ("m-price", "price_text"),
    ("m-positions", "volume_text"),
    ("m-mc", "mc_text"),
    ("m-locked", "fdv_text"),
    ("m-listed", "listed_text"),
    ("m-floor", "floor_text"),
]

# Timeout for waiting for the selectors (in milliseconds)
SELECTOR_TIMEOUT = 15000


def _find_free_port() -> int:
    """Return an available TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _start_http_server(port: int) -> http.server.ThreadingHTTPServer:
    """Create and start a simple HTTP server serving SITE_ROOT on the given port."""

    class CustomHandler(http.server.SimpleHTTPRequestHandler):
        """Handler that serves files from SITE_ROOT."""

        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(SITE_ROOT), **kwargs)

    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), CustomHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def main() -> None:
    """Run the guard logic and print the required signals."""
    port = _find_free_port()
    httpd = _start_http_server(port)

    # Prepare default signal values
    values = {name: "" for _, name in TILES}
    tiles_from_data = 0
    tiles_ok = 0

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            # Block external requests: market tiles must render from local
            # fixtures without depending on live RPCs in CI.
            page.route("https://**/*", lambda route: route.abort())
            try:
                page.goto(f"http://127.0.0.1:{port}/index.html")
                # Wait for every metric tile to be computed (or timeout)
                for tile_id, _ in TILES:
                    page.wait_for_selector(f'#{tile_id} .metric-value[data-src="computed"]', timeout=SELECTOR_TIMEOUT)

                # All selectors are present
                tiles_from_data = 1

                # Extract text content
                for tile_id, name in TILES:
                    values[name] = page.locator(f'#{tile_id} .metric-value[data-src="computed"]').first.text_content() or ""

                # Determine tiles_ok: with no live RPC data there are no live
                # external listings, so ask-derived tiles show em dash and the
                # 24h volume shows $0 (no historical sales in the fixture).
                if (
                    values["price_text"].strip() == "—"
                    and values["volume_text"].strip() == "$0"
                    and values["mc_text"].strip() == "—"
                    and values["fdv_text"].strip() == "—"
                    and values["listed_text"].strip() == "—"
                    and values["floor_text"].strip() == "—"
                ):
                    tiles_ok = 1
                else:
                    tiles_ok = 0

            except PlaywrightTimeoutError:
                # One or more selectors did not appear within the timeout
                tiles_from_data = 0
                tiles_ok = 0
                # values remain empty strings

            finally:
                browser.close()

    finally:
        # Ensure the HTTP server is stopped even if an exception occurs
        httpd.shutdown()
        httpd.server_close()

    # Print the signals
    for _, name in TILES:
        print(f"{name}={values[name]}")
    print(f"tiles_from_data={tiles_from_data}")
    print(f"tiles_ok={tiles_ok}")


if __name__ == "__main__":
    sys.exit(main())
