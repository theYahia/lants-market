import os
import re
import socket
import threading
import sys
import io
import argparse
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright, ConsoleMessage, TimeoutError as PlaywrightTimeoutError


# CONTAINER_SIGNAL: canonical expected headers for the positions table
EXPECTED = ["#", "AMOUNT", "LOCK", "REWARD", "EXIT"]


class _QuietHandler(SimpleHTTPRequestHandler):
    """A request handler that suppresses access logs."""
    def log_message(self, *args, **kwargs):
        # Override to silence the default logging to stderr.
        pass


def _serve_site(port: int, directory: Path) -> ThreadingHTTPServer:
    """Start a simple HTTP server serving *directory* on *port* without logging."""
    os.chdir(directory)
    server = ThreadingHTTPServer(("127.0.0.1", port), _QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def _free_port() -> int:
    """Return an unused TCP port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def parse_output_line(line: str) -> dict:
    """
    Parse a line of the form ``key1=val1 key2=val2 ...`` into a dict.
    The values are kept as strings.
    """
    result = {}
    for part in line.strip().split():
        if "=" in part:
            k, v = part.split("=", 1)
            result[k] = v
    return result


def _normalize_text(text: str) -> str:
    """Collapse whitespace, strip, uppercase."""
    text = re.sub(r'[▲▼]', '', text)  # remove sort arrows
    return re.sub(r"\s+", " ", text).strip().upper()


def main() -> int:
    # ----------------------------------------------------------------------
    # Capture own stderr to count how many lines are written there.
    # ----------------------------------------------------------------------
    _stderr_buffer = io.StringIO()
    _original_stderr = sys.stderr
    sys.stderr = _stderr_buffer

    # ----------------------------------------------------------------------
    # Argument parsing (strict)
    # ----------------------------------------------------------------------
    parser = argparse.ArgumentParser(
        description="Check the rendered market table for layout issues."
    )
    parser.add_argument(
        "width",
        nargs="?",
        type=int,
        default=390,
        help="Viewport width (default: 390)",
    )
    parser.add_argument(
        "--expect",
        action="append",
        default=[],
        help="Expected key=value pair, can be repeated.",
    )
    try:
        args = parser.parse_args()
    except SystemExit as e:
        # argparse already printed an error message to stderr.
        sys.stderr = _original_stderr
        return e.code

    width = args.width

    # ----------------------------------------------------------------------
    # Build absolute path to the site directory and start a local HTTP server
    # ----------------------------------------------------------------------
    site_dir = Path(__file__).resolve().parents[2] / "site"
    server = None
    result_dict = {}

    if not site_dir.is_dir():
        # Site directory missing – produce a default result.
        result_dict = {
            "stderr_lines": "0",
            "page_live": "0",
            "rows": "0",
            "container_overflow": "1",
            "reward_vis": "0",
            "diffcols_visible": "0",
            "reward_found": "0",
            "captions": "0",
            "labels_clipped": "0",
            "th_titles": "0",
            "container_ok": "0/5",
        }
    else:
        port = _free_port()
        server = _serve_site(port, site_dir)
        url = f"http://127.0.0.1:{port}/index.html"

        # ------------------------------------------------------------------
        # Playwright: open the page, listen for console errors, and run checks
        # ------------------------------------------------------------------
        cors_err = [0]  # mutable flag

        def _on_console(msg: ConsoleMessage) -> None:
            if msg.type == "error":
                txt = msg.text
                if ("CORS" in txt) or ("file://" in txt) or ("net::ERR_FAILED" in txt):
                    cors_err[0] = 1

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": width, "height": 800},
                device_scale_factor=1,
            )
            page = context.new_page()
            page.on("console", _on_console)

            try:
                page.goto(url, wait_until="load", timeout=15000)
            except PlaywrightTimeoutError:
                # Page failed to load – use fallback values.
                result_dict = {
                    "stderr_lines": "0",
                    "page_live": "0",
                    "rows": "0",
                    "container_overflow": "1",
                    "reward_vis": "0",
                    "diffcols_visible": "0",
                    "reward_found": "0",
                    "captions": "0",
                    "labels_clipped": "0",
                    "th_titles": "0",
                    "container_ok": "0/5",
                }
            else:
                # ------------------------------------------------------------------
                # Wait for the main table to be rendered
                # ------------------------------------------------------------------
                page.wait_for_selector("table")

                # ------------------------------------------------------------------
                # Count rows in the table body
                # ------------------------------------------------------------------
                rows = page.locator("tbody tr").count()

                # ------------------------------------------------------------------
                # 1) Check container overflow (no horizontal scroll)
                # ------------------------------------------------------------------
                # The container is defined as the parent element of the <table>.
                # We compute the overflow as scrollWidth - clientWidth.
                container_overflow = 0
                table_handle = page.query_selector("table")
                if table_handle:
                    parent_handle = page.evaluate_handle(
                        "(el) => el.parentElement", table_handle
                    )
                    if parent_handle:
                        container_overflow = page.evaluate(
                            "(el) => el.scrollWidth - el.clientWidth", parent_handle
                        )
                        # Ensure a non‑negative integer.
                        container_overflow = max(int(container_overflow), 0)

                # ------------------------------------------------------------------
                # 2) Find header columns (<th>) case‑insensitively
                # ------------------------------------------------------------------
                # Updated patterns after redesign.
                reward_patterns = {
                    "reward",
                    "rewardforecast",
                }
                lock_pattern = "lock"

                reward_elem = None
                lock_elem = None
                reward_found = 0

                th_elements = page.query_selector_all("th")
                for th in th_elements:
                    # Get raw text content, strip whitespace and lower‑case it.
                    txt = page.evaluate("(el) => el.textContent", th)
                    txt_norm = txt.strip().lower()
                    if txt_norm in reward_patterns and reward_elem is None:
                        reward_elem = th
                        reward_found = 1
                    if txt_norm == lock_pattern and lock_elem is None:
                        lock_elem = th

                # Helper to decide visibility of a given element.
                def _elem_fully_visible(el) -> bool:
                    if not el or not el.is_visible():
                        return False
                    right = page.evaluate("(el) => el.getBoundingClientRect().right", el)
                    inner_width = page.evaluate("() => innerWidth")
                    return right <= inner_width

                reward_visible = _elem_fully_visible(reward_elem)

                # ------------------------------------------------------------------
                # Compute visibility counters
                # ------------------------------------------------------------------
                reward_vis = int(reward_visible)
                diffcols_visible = int(bool(lock_elem))

                # ------------------------------------------------------------------
                # 3) Count leaf elements whose textContent contains
                #    'epoch staker budget'
                # ------------------------------------------------------------------
                captions = page.evaluate(
                    """() => {
                        return [...document.querySelectorAll('*')]
                            .filter(e => e.textContent.includes('epoch staker budget') && ![...e.children].some(c => c.textContent.includes('epoch staker budget')))
                            .length;
                    }"""
                )
                captions = int(captions)

                th_titles = page.evaluate(
                    """() => {
                        return [...document.querySelectorAll('thead th')]
                            .filter(e => (e.getAttribute('title') || '').trim().length > 10)
                            .length;
                    }"""
                )
                th_titles = int(th_titles)

                # ------------------------------------------------------------------
                # 4) Count metric labels that are clipped (scrollWidth > clientWidth + 1)
                # ------------------------------------------------------------------
                labels_clipped = page.evaluate(
                    """() => {
                        return [...document.querySelectorAll('.metric-label')]
                            .filter(e => e.scrollWidth > e.clientWidth + 1).length;
                    }"""
                )
                labels_clipped = int(labels_clipped)

                # ------------------------------------------------------------------
                # NEW: Validate the 5 header cells against EXPECTED
                # ------------------------------------------------------------------
                matched_headers = 0
                header_cells = page.query_selector_all("thead th")
                for idx, expected in enumerate(EXPECTED):
                    if idx >= len(header_cells):
                        break
                    # Clone the th to avoid mutating the page
                    cell = header_cells[idx]
                    # Remove descendants with class 'th-note' before reading text
                    normalized = page.evaluate(
                        """(el) => {
                            const clone = el.cloneNode(true);
                            clone.querySelectorAll('.th-note, .info').forEach(n => n.remove()); // header tips add an info icon
                            return clone.textContent || '';
                        }""",
                        cell,
                    )
                    normalized = _normalize_text(normalized)
                    if normalized == expected:
                        matched_headers += 1
                container_ok = f"{matched_headers}/5"

                # ------------------------------------------------------------------
                # Determine if the page is live (rows > 0 and no CORS errors)
                # ------------------------------------------------------------------
                page_live = 1 if rows > 0 and cors_err[0] == 0 else 0

                # ------------------------------------------------------------------
                # Count captured stderr lines
                # ------------------------------------------------------------------
                sys.stderr = _original_stderr
                stderr_content = _stderr_buffer.getvalue()
                stderr_lines = len(
                    [line for line in stderr_content.splitlines() if line.strip() != ""]
                )

                # ------------------------------------------------------------------
                # Assemble result dict (including reward_found, captions, labels_clipped)
                # ------------------------------------------------------------------
                result_dict = {
                    "stderr_lines": str(stderr_lines),
                    "page_live": str(page_live),
                    "rows": str(rows),
                    "container_overflow": str(container_overflow),
                    "reward_vis": str(reward_vis),
                    "diffcols_visible": str(diffcols_visible),
                    "reward_found": str(reward_found),
                    "captions": str(captions),
                    "labels_clipped": str(labels_clipped),
                    "th_titles": str(th_titles),
                    "container_ok": container_ok,
                }

                # Clean up Playwright resources
                context.close()
                browser.close()

        # Ensure server is shut down after Playwright block
        if server:
            server.shutdown()

    # ----------------------------------------------------------------------
    # If we fell back to a default result (e.g., site missing or timeout),
    # we still need to count captured stderr lines.
    # ----------------------------------------------------------------------
    if not result_dict:
        # This should never happen, but guard against it.
        result_dict = {
            "stderr_lines": "0",
            "page_live": "0",
            "rows": "0",
            "container_overflow": "1",
            "reward_vis": "0",
            "diffcols_visible": "0",
            "reward_found": "0",
            "captions": "0",
            "labels_clipped": "0",
            "th_titles": "0",
            "container_ok": "0/5",
        }

    # Restore original stderr before any further output
    sys.stderr = _original_stderr

    # ----------------------------------------------------------------------
    # Print the result line (always the same format)
    # ----------------------------------------------------------------------
    output_line = (
        f"stderr_lines={result_dict['stderr_lines']} "
        f"page_live={result_dict['page_live']} rows={result_dict['rows']} "
        f"container_overflow={result_dict['container_overflow']} "
        f"reward_vis={result_dict['reward_vis']} "
        f"diffcols_visible={result_dict['diffcols_visible']} "
        f"reward_found={result_dict['reward_found']} "
        f"captions={result_dict['captions']} "
        f"labels_clipped={result_dict['labels_clipped']} "
        f"th_titles={result_dict['th_titles']} "
        f"container_ok={result_dict['container_ok']}"
    )
    print(output_line)

    # ----------------------------------------------------------------------
    # Evaluate expectations, if any
    # ----------------------------------------------------------------------
    exit_code = 0
    if args.expect:
        parsed = parse_output_line(output_line)
        for exp in args.expect:
            if "=" not in exp:
                print(f"Invalid expectation format (expected KEY=VAL): {exp}", file=sys.stderr)
                exit_code = 1
                continue
            key, val = exp.split("=", 1)
            if key not in parsed:
                print(f"Expectation key not found in output: {key}", file=sys.stderr)
                exit_code = 1
                continue
            if parsed[key] != val:
                print(
                    f"Expectation mismatch for {key}: expected {val}, got {parsed[key]}",
                    file=sys.stderr,
                )
                exit_code = 1

    return exit_code


if __name__ == "__main__":
    sys.exit(main())