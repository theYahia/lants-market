import os
import socket
import threading
import re
import sys
import io
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright, ConsoleMessage


class _QuietHandler(SimpleHTTPRequestHandler):
    """Suppress access logs for the HTTP server."""
    def log_message(self, *args):
        pass


def _serve_site(port: int, directory: Path) -> ThreadingHTTPServer:
    """Start a simple HTTP server serving *directory* on *port*."""
    os.chdir(directory)
    # Use the quiet handler to silence access logs.
    server = ThreadingHTTPServer(("127.0.0.1", port), _QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def _free_port() -> int:
    """Return an unused TCP port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def main() -> None:
    # ----------------------------------------------------------------------
    # Redirect own stderr to capture any lines written to it.
    # ----------------------------------------------------------------------
    original_stderr = sys.stderr
    stderr_buffer = io.StringIO()
    sys.stderr = stderr_buffer

    # ----------------------------------------------------------------------
    # Build absolute path to the site directory and start a local HTTP server
    # ----------------------------------------------------------------------
    site_dir = Path(__file__).resolve().parents[2] / "site"
    if not site_dir.is_dir():
        # No site directory – report zeroed metrics and captured stderr line count.
        stderr_lines = len(stderr_buffer.getvalue().splitlines())
        sys.stderr = original_stderr
        print(f"page_live=0 rows=0 badges_ok=0 listing_badges=0 clean_ids=0/0 stderr_lines={stderr_lines}")
        return

    port = _free_port()
    server = _serve_site(port, site_dir)
    url = f"http://127.0.0.1:{port}/index.html"

    # ----------------------------------------------------------------------
    # Playwright: open the page, listen for console errors, and run checks
    # ----------------------------------------------------------------------
    cors_err = [0]  # mutable container to allow modification from inner scope

    def _on_console(msg: ConsoleMessage) -> None:
        if msg.type == "error":
            txt = msg.text
            if ("CORS" in txt) or ("file://" in txt) or ("net::ERR_FAILED" in txt):
                cors_err[0] = 1

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("console", _on_console)

        page.goto(url)
        page.wait_for_selector("table")

        # ------------------------------------------------------------------
        # Count rows in the main table body
        # ------------------------------------------------------------------
        rows = page.locator("tbody tr").count()

        # ------------------------------------------------------------------
        # Determine badge counts
        #   - total: all <td class="badge-deal">
        #   - inside: those inside #listings
        #   - outside: total - inside
        # ------------------------------------------------------------------
        total_badges = page.locator("td.badge-deal").count()
        inside_badges = page.locator("#listings td.badge-deal").count()
        outside_badges = total_badges - inside_badges

        # badges_ok = 1 if there are NO badges outside #listings
        badges_ok = 1 if outside_badges == 0 else 0

        # listing_badges = number of badges inside #listings (0 if #listings absent)
        listing_badges = inside_badges

        # ------------------------------------------------------------------
        # Compute clean_ids metric:
        #   - total: number of <td class="badge-deal"> cells
        #   - match: those whose trimmed text consists only of digits,
        #            spaces, or decimal separators ('.' or ',')
        #            and does NOT contain the phrase "Great deal"
        # ------------------------------------------------------------------
        badge_cells = page.locator("td.badge-deal")
        total = badge_cells.count()
        match = 0
        if total > 0:
            texts = badge_cells.all_text_contents()
            for txt in texts:
                stripped = txt.strip()
                # Skip if it contains the phrase "Great deal"
                if "Great deal" in stripped:
                    continue
                # Check if the remaining text is only digits, spaces, '.' or ','
                if re.fullmatch(r"[\d\s.,]+", stripped):
                    match += 1

        # ------------------------------------------------------------------
        # Determine if the page is live (rows > 0 and no CORS errors)
        # ------------------------------------------------------------------
        page_live = 1 if rows > 0 and cors_err[0] == 0 else 0

        # ------------------------------------------------------------------
        # Compute how many lines were written to our own stderr.
        # ------------------------------------------------------------------
        stderr_lines = len(stderr_buffer.getvalue().splitlines())

        # ------------------------------------------------------------------
        # Restore original stderr before final output.
        # ------------------------------------------------------------------
        sys.stderr = original_stderr

        # ------------------------------------------------------------------
        # Output in the required format, now including listing_badges.
        # ------------------------------------------------------------------
        print(
            f"page_live={page_live} rows={rows} badges_ok={badges_ok} "
            f"listing_badges={listing_badges} clean_ids={match}/{total} "
            f"stderr_lines={stderr_lines}"
        )

        browser.close()

    # ----------------------------------------------------------------------
    # Shut down the temporary HTTP server
    # ----------------------------------------------------------------------
    server.shutdown()


if __name__ == "__main__":
    main()