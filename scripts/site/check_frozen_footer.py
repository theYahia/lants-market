import sys
import os
import time
import threading
import functools
import http.server
import socketserver

from playwright.sync_api import sync_playwright

# Serve the repository's ./site directory so that ./fixtures/... resolves.
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SITE_DIR = os.path.join(REPO_ROOT, "site")
PORT = 8000


def start_server(directory, port):
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=directory
    )
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    httpd.allow_reuse_address = True
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd


def main():
    httpd = start_server(SITE_DIR, PORT)
    # Give the server a moment to come up.
    time.sleep(0.5)

    url = f"http://localhost:{PORT}/?data=frozen"
    footer_text = ""
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url, wait_until="networkidle")
            # Wait for the frozen footer to be populated by render.mjs.
            page.wait_for_selector(".snap-footer .note", timeout=15000)
            footer_text = page.eval_on_selector(
                ".snap-footer", "el => el.textContent"
            ) or ""
            browser.close()
    finally:
        httpd.shutdown()

    has_live = "Live from Base" in footer_text
    has_refresh = "Auto-refreshed" in footer_text

    if not has_live and not has_refresh:
        print("footer_ok=1")
    else:
        print("footer_ok=0")

    return 0


if __name__ == "__main__":
    sys.exit(main())