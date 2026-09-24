#!/usr/bin/env python3
"""Playwright guard for checking market tiles on the default page.

The script starts a temporary HTTP server that serves the `site/` directory,
opens the page in a headless Chromium browser, waits for the metric tiles to be
rendered, extracts their text values and reports a few signals.

Only four signal lines are printed to stdout, one per line:
    volume_text=<text>
    fdv_text=<text>
    tiles_from_data=<0|1>
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

# Selectors used in the test
POSITIONS_SELECTOR = '#m-positions .metric-value[data-src="computed"]'
LOCKED_SELECTOR = '#m-locked .metric-value[data-src="computed"]'

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
    volume_text = ""
    fdv_text = ""
    tiles_from_data = 0
    tiles_ok = 0

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            try:
                page.goto(f"http://127.0.0.1:{port}/index.html")
                # Wait for both metric elements to appear (or timeout)
                page.wait_for_selector(POSITIONS_SELECTOR, timeout=SELECTOR_TIMEOUT)
                page.wait_for_selector(LOCKED_SELECTOR, timeout=SELECTOR_TIMEOUT)

                # Both selectors are present
                tiles_from_data = 1

                # Extract text content
                volume_text = page.locator(POSITIONS_SELECTOR).first.text_content() or ""
                fdv_text = page.locator(LOCKED_SELECTOR).first.text_content() or ""

                # Determine tiles_ok according to the specification
                if (
                    volume_text.strip() == "$0"
                    and fdv_text.strip() == "—"
                ):
                    tiles_ok = 1
                else:
                    tiles_ok = 0

            except PlaywrightTimeoutError:
                # One or both selectors did not appear within the timeout
                tiles_from_data = 0
                tiles_ok = 0
                # volume_text and fdv_text remain empty strings

            finally:
                browser.close()

    finally:
        # Ensure the HTTP server is stopped even if an exception occurs
        httpd.shutdown()
        httpd.server_close()

    # Print the signals
    print(f"volume_text={volume_text}")
    print(f"fdv_text={fdv_text}")
    print(f"tiles_from_data={tiles_from_data}")
    print(f"tiles_ok={tiles_ok}")


if __name__ == "__main__":
    sys.exit(main())