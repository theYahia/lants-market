#!/usr/bin/env python3
"""Playwright guard for checking the "List a position" form.

The script starts a temporary HTTP server that serves the `site/` directory,
opens the page in a headless Chromium browser, checks the list form validation.

Only signal lines are printed to stdout:
    note_open_epoch=<0|1>
    note_fee=<0|1>
    zero_price_status=<text>
    list_form_ok=<0|1>
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

# Repository root – script resides in scripts/site/, go up two levels
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SITE_ROOT = REPO_ROOT / "site"

# Timeout for waiting for selectors (in milliseconds)
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
            
        def log_message(self, format, *args):
            """Suppress HTTP server logging."""
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), CustomHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def main() -> None:
    """Run the guard logic and print the required signals."""
    port = _find_free_port()
    httpd = _start_http_server(port)

    # Prepare default signal values
    note_open_epoch = 0
    note_fee = 0
    zero_price_status = ""
    list_form_ok = 0

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            try:
                # Block all network requests - keep the page offline
                page.route("https://**/*", lambda route: route.abort())
                
                page.goto(f"http://127.0.0.1:{port}/index.html")
                
                # Wait for the page to load and check if we need to show the Listings panel
                page.wait_for_timeout(500)
                
                # Make the form and all its ancestors visible if hidden
                page.evaluate("""
                    () => {
                        const form = document.getElementById('create-form');
                        if (form) {
                            let el = form;
                            while (el && el !== document.documentElement) {
                                if (el.hasAttribute('hidden')) {
                                    el.removeAttribute('hidden');
                                }
                                if (el.style.display === 'none' || getComputedStyle(el).display === 'none') {
                                    el.style.display = 'block';
                                }
                                el = el.parentElement;
                            }
                        }
                    }
                """)
                
                # Extract note signals
                note_data = page.evaluate("""
                    () => {
                        const form = document.getElementById('create-form');
                        if (!form) return {open_epoch: false, fee: false};
                        
                        const notes = form.querySelectorAll('.cf-note');
                        let open_epoch = false;
                        let fee = false;
                        
                        for (const note of notes) {
                            const text = note.textContent || '';
                            if (text.includes('open epoch')) {
                                open_epoch = true;
                            }
                            if (text.includes('Marketplace fee is 1%')) {
                                fee = true;
                            }
                        }
                        
                        return {open_epoch, fee};
                    }
                """)
                
                if note_data and note_data.get('open_epoch') is not None:
                    note_open_epoch = 1 if note_data['open_epoch'] else 0
                    note_fee = 1 if note_data['fee'] else 0
                
                # Test zero price validation
                page.fill('#cf-nftid', "51")
                page.fill('#cf-price', "0")
                page.click('#cf-submit')
                page.wait_for_timeout(300)
                
                # Get the status message
                status_elem = page.query_selector('#create-status')
                if status_elem:
                    zero_price_status = status_elem.text_content().strip()
                
                # Determine if all checks passed
                if (note_open_epoch == 1 and 
                    note_fee == 1 and 
                    zero_price_status == "Price must be greater than 0"):
                    list_form_ok = 1

            except PlaywrightTimeoutError as e:
                # Print timeout exception to stderr
                print(f"Timeout error: {e}", file=sys.stderr)
            except Exception as e:
                # Print any other exception to stderr
                print(f"Exception: {e}", file=sys.stderr)

            finally:
                browser.close()

    finally:
        # Ensure the HTTP server is stopped even if an exception occurs
        httpd.shutdown()
        httpd.server_close()

    # Print the signals
    print(f"note_open_epoch={note_open_epoch}")
    print(f"note_fee={note_fee}")
    print(f"zero_price_status={zero_price_status}")
    print(f"list_form_ok={list_form_ok}")

    # Exit with code 1 if list_form_ok is not 1
    sys.exit(0 if list_form_ok == 1 else 1)


if __name__ == "__main__":
    sys.exit(main())