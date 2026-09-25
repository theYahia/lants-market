#!/usr/bin/env python3
"""Playwright guard for info-icon tooltips.

The script starts a temporary HTTP server that serves the `site/` directory,
opens the page in a headless Chromium browser, and verifies that:

1. All 7 info icons are present and their tooltips are visible, non-empty,
   <= 90 chars, and fully inside the viewport at both 1280x900 and 390x900.
2. No element with an .info child has a native title attribute (no fallback).
3. Each thead th text still starts with its expected column name in order.

It prints one signal line per check and final tips_ok=0/1 as the last line.
Exit code is 1 when tips_ok=0.
"""

import sys
import threading
import socket
import http.server
import functools
from pathlib import Path

from playwright.sync_api import (
    sync_playwright,
    TimeoutError as PlaywrightTimeoutError,
)

# Repository root – script resides in scripts/site/, go up three levels
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SITE_ROOT = REPO_ROOT / "site"

# Maximum allowed tooltip text length
MAX_TIP_LENGTH = 90

# (icon selector, expected column/label prefix)
ICONS = [
    ("#m-positions .metric-label .info", "7-Day Volume"),
    ("#m-locked .metric-label .info", "Implied FDV"),
    ("thead th:nth-child(1) .info", "#"),
    ("thead th:nth-child(2) .info", "AMOUNT"),
    ("thead th:nth-child(3) .info", "LOCK"),
    ("thead th:nth-child(4) .info", "REWARD"),
    ("thead th:nth-child(5) .info", "EXIT"),
]

# Expected prefixes for the thead th texts in order
TH_PREFIXES = ["#", "AMOUNT", "LOCK", "REWARD", "EXIT"]

# Timeout for tooltip to appear (in milliseconds)
TIP_TIMEOUT = 2000


def _find_free_port() -> int:
    """Return an available TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _start_http_server(port: int) -> http.server.ThreadingHTTPServer:
    """Create and start a simple HTTP server serving SITE_ROOT on the given port."""
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler,
        directory=str(SITE_ROOT)
    )
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def check_tooltips_at(page, width):
    """Check all tooltips at a given viewport width."""
    ok = True
    page.set_viewport_size({"width": width, "height": 900})

    for selector, prefix in ICONS:
        try:
            # Scroll icon into view and hover
            icon = page.locator(selector)
            icon.scroll_into_view_if_needed(timeout=2000)
            icon.hover()

            # Wait for tooltip to appear
            page.wait_for_selector("#tip.show", timeout=TIP_TIMEOUT)
            tip = page.locator("#tip")

            # Get tooltip properties
            text = (tip.text_content() or "").strip()
            box = tip.bounding_box()
            visible = tip.is_visible()

            # Check if tooltip is inside viewport
            inside = bool(box and box["x"] >= 0 and box["y"] >= 0 and
                         box["x"] + box["width"] <= width and
                         box["y"] + box["height"] <= 900)

            # Verify all conditions
            good = visible and 0 < len(text) <= MAX_TIP_LENGTH and inside
            print(f"w{width}_{selector}_len={len(text)} "
                  f"inside={int(inside)} vis={int(visible)} ok={int(good)}")
            if not good:
                ok = False

            # Move mouse away to dismiss tooltip
            page.mouse.move(0, 0)
            page.wait_for_timeout(100)

        except PlaywrightTimeoutError:
            # Tooltip didn't appear in time
            print(f"w{width}_{selector}_len=0 inside=0 vis=0 ok=0")
            ok = False
            page.mouse.move(0, 0)  # clean up

    return ok


def main() -> int:
    """Run the guard logic and print the required signals."""
    # Ensure output is flushed
    print = functools.partial(__builtins__.print, flush=True)

    port = _find_free_port()
    httpd = _start_http_server(port)
    ok = True

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            # Block external requests to avoid network dependency
            page.route("https://**/*", lambda route: route.abort())

            try:
                page.goto(f"http://127.0.0.1:{port}/index.html",
                         wait_until="networkidle")

                # Check 1: No element with .info child should have title attribute
                bad_title_count = page.eval_on_selector_all(
                    ".metric-label, thead th",
                    """els => els.filter(e => {
                        const info = e.querySelector('.info');
                        return info && e.hasAttribute('title');
                    }).length"""
                )
                print(f"icon_elems_with_title={bad_title_count}")
                if bad_title_count:
                    ok = False

                # Check 2: All thead th texts must start with expected prefixes
                heads = page.eval_on_selector_all(
                    "thead th",
                    "els => els.map(e => e.textContent.trim())"
                )
                for i, prefix in enumerate(TH_PREFIXES):
                    if i < len(heads):
                        good = heads[i].startswith(prefix)
                        print(f"th{i}_prefix_{prefix}_ok={int(good)}")
                        if not good:
                            ok = False
                    else:
                        print(f"th{i}_prefix_{prefix}_ok=0")
                        ok = False

                # Check 3: Tooltips at 1280px width
                if not check_tooltips_at(page, 1280):
                    ok = False

                # Check 4: Tooltips at 390px width
                if not check_tooltips_at(page, 390):
                    ok = False

            except Exception as e:
                print(f"error={str(e)[:100]}")
                ok = False

            finally:
                browser.close()

    finally:
        httpd.shutdown()
        httpd.server_close()

    # Print final result
    print(f"tips_ok={int(ok)}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())