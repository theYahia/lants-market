#!/usr/bin/env python3
"""Playwright guard for checking LOCK cells on the default page.

The script starts a temporary HTTP server that serves the `site/` directory,
opens the page in a headless Chromium browser, waits for the positions table
to be rendered, extracts LOCK cell values and their right edge positions,
and reports a few signals.

Only seven signal lines are printed to stdout, one per line:
    rows_total=<int>
    max_count=<int>
    weeks_count=<int>
    bad_count=<int>
    right_edges_aligned=<0|1>
    distinct_texts=<comma‑joined sorted set>
    lock_ok=<0|1>

Two additional lines are printed before ``lock_ok``:
    sort_asc_last=<text of the last non‑dust row after ascending sort>
    sort_desc_first=<text of the first non‑dust row after descending sort>
"""

import sys
import threading
import socket
import http.server
import re
from pathlib import Path

from playwright.sync_api import (
    sync_playwright,
    TimeoutError as PlaywrightTimeoutError,
)

# Repository root – script resides in scripts/site/, go up three levels
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SITE_ROOT = REPO_ROOT / "site"

# Timeout for waiting for the table to be ready (in milliseconds)
TABLE_READY_TIMEOUT = 15000


def _find_free_port() -> int:
    """Return an available TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _start_http_server(port: int) -> http.server.ThreadingHTTPServer:
    """Create and start a simple HTTP server serving SITE_ROOT on the given port."""

    class SilentHandler(http.server.SimpleHTTPRequestHandler):
        """Handler that serves files from SITE_ROOT without logging."""

        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(SITE_ROOT), **kwargs)

        def log_message(self, format, *args):
            # Suppress request logging
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), SilentHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def _abort_remote_requests(page, local_port: int):
    """Register a route that aborts any request not served from the local HTTP server."""

    def handler(route):
        url = route.request.url
        # Allow only requests that go to our temporary local server
        if url.startswith(f"http://127.0.0.1:{local_port}"):
            route.continue_()
        else:
            route.abort()

    # Catch‑all pattern – the handler decides which to abort
    page.route("**/*", handler)


def _wait_for_table(page):
    """Wait until the positions table with a LOCK column is ready."""
    script = """
    () => {
        const tables = document.querySelectorAll('table');
        let target = null;
        let lockIdx = -1;
        for (const tbl of tables) {
            const ths = tbl.querySelectorAll('thead th');
            for (let i = 0; i < ths.length; i++) {
                if (ths[i].textContent.trim().startsWith('LOCK')) {
                    target = tbl;
                    lockIdx = i;
                    break;
                }
            }
            if (target) break;
        }
        if (!target) return false;
        const rows = Array.from(target.querySelectorAll('tbody tr'));
        const nonDustRows = rows.filter(tr => tr.cells[0].textContent.trim().toLowerCase() !== 'dust');
        if (nonDustRows.length === 0) return false;
        for (const tr of nonDustRows) {
            const lockCell = tr.cells[lockIdx];
            const span = lockCell.querySelector('span');
            if (!span || span.textContent.trim() === '') return false;
        }
        return true;
    }
    """
    page.wait_for_function(script, timeout=TABLE_READY_TIMEOUT)


def _extract_lock_data(page):
    """Return a list of dicts with 'text' and 'right' for each non‑dust LOCK cell."""
    script = """
    () => {
        const tables = document.querySelectorAll('table');
        let target = null;
        let lockIdx = -1;
        for (const tbl of tables) {
            const ths = tbl.querySelectorAll('thead th');
            for (let i = 0; i < ths.length; i++) {
                if (ths[i].textContent.trim().startsWith('LOCK')) {
                    target = tbl;
                    lockIdx = i;
                    break;
                }
            }
            if (target) break;
        }
        if (!target) return [];
        const rows = Array.from(target.querySelectorAll('tbody tr'));
        const result = [];
        for (const tr of rows) {
            const first = tr.cells[0].textContent.trim().toLowerCase();
            if (first === 'dust') continue;
            const lockCell = tr.cells[lockIdx];
            const span = lockCell.querySelector('span');
            if (!span) continue;
            const text = span.textContent.trim();
            const right = span.getBoundingClientRect().right;
            result.push({text, right});
        }
        return result;
    }
    """
    return page.evaluate(script)


def _read_lock_texts_in_order(page):
    """Return a list of LOCK texts (non‑dust rows) in the current table order."""
    script = """
    () => {
        const tables = document.querySelectorAll('table');
        let target = null;
        let lockIdx = -1;
        for (const tbl of tables) {
            const ths = tbl.querySelectorAll('thead th');
            for (let i = 0; i < ths.length; i++) {
                if (ths[i].textContent.trim().startsWith('LOCK')) {
                    target = tbl;
                    lockIdx = i;
                    break;
                }
            }
            if (target) break;
        }
        if (!target) return [];
        const rows = Array.from(target.querySelectorAll('tbody tr'));
        const result = [];
        for (const tr of rows) {
            const first = tr.cells[0].textContent.trim().toLowerCase();
            if (first === 'dust') continue;
            const lockCell = tr.cells[lockIdx];
            // Use the cell's full text content (may include a span)
            const text = lockCell.textContent.trim();
            result.push(text);
        }
        return result;
    }
    """
    return page.evaluate(script)


def _read_pending_marker_info(page):
    """Return dict with pending‑marker related checks for the positions table."""
    script = """
    () => {
        const tables = document.querySelectorAll('table');
        let target = null;
        for (const tbl of tables) {
            const ths = tbl.querySelectorAll('thead th');
            for (let i = 0; i < ths.length; i++) {
                if (ths[i].textContent.trim().startsWith('LOCK')) {
                    target = tbl;
                    break;
                }
            }
            if (target) break;
        }
        if (!target) {
            return {
                pending_count: 0,
                pending_id_numeric: 0,
                reward_sortable: 0,
                pending_marker_in_reward: 0,
                marker_not_in_id: 0,
                marker_only_pending: 0
            };
        }
        const rows = Array.from(target.querySelectorAll('tbody tr'));
        let pendingCount = 0;
        let allIdNumeric = true;
        let allRewardSortable = true;
        let pendingMarkerInReward = 0;
        let anyIdHasFrom = false;
        let anyNonPendingRewardHasFrom = false;

        for (const tr of rows) {
            const first = tr.cells[0].textContent.trim().toLowerCase();
            if (first === 'dust') continue;

            const idCell = tr.cells[0];
            const rewardCell = tr.cells[3];

            const idText = idCell.textContent.trim();
            if (!/^\\d+$/.test(idText)) {
                allIdNumeric = false;
            }

            const rewardText = rewardCell.textContent.trim();
            if (Number(rewardText) !== Number(rewardText)) { // NaN check
                allRewardSortable = false;
            }

            const isPending = tr.classList.contains('is-pending');
            if (isPending) {
                pendingCount++;
                const after = getComputedStyle(rewardCell, '::after').content;
                const cleaned = after.replace(/^["']|["']$/g, '').trim();
                if (/^from e\\d+$/.test(cleaned)) {
                    pendingMarkerInReward++;
                }
            } else {
                const after = getComputedStyle(rewardCell, '::after').content;
                const cleaned = after.replace(/^["']|["']$/g, '').trim();
                if (cleaned.includes('from')) {
                    anyNonPendingRewardHasFrom = true;
                }
            }

            const idAfter = getComputedStyle(idCell, '::after').content;
            const idCleaned = idAfter.replace(/^["']|["']$/g, '').trim();
            if (idCleaned.includes('from')) {
                anyIdHasFrom = true;
            }
        }

        return {
            pending_count: pendingCount,
            pending_id_numeric: allIdNumeric ? 1 : 0,
            reward_sortable: allRewardSortable ? 1 : 0,
            pending_marker_in_reward: pendingMarkerInReward,
            marker_not_in_id: anyIdHasFrom ? 0 : 1,
            marker_only_pending: anyNonPendingRewardHasFrom ? 0 : 1
        };
    }
    """
    return page.evaluate(script)


def main() -> int:
    """Run the guard logic, print signals, and return appropriate exit code."""
    port = _find_free_port()
    httpd = _start_http_server(port)

    # Default signal values
    rows_total = 0
    max_count = 0
    weeks_count = 0
    bad_count = 0
    right_edges_aligned = 0
    distinct_texts = ""
    sort_asc_last = ""
    sort_desc_first = ""

    # Pending‑marker related defaults
    pending_count = 0
    pending_id_numeric = 0
    reward_sortable = 0
    pending_marker_in_reward = 0
    marker_not_in_id = 0
    marker_only_pending = 0

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            # Abort any remote request; keep local server traffic
            _abort_remote_requests(page, port)

            try:
                page.goto(f"http://127.0.0.1:{port}/index.html")
                _wait_for_table(page)

                # -----------------------------------------------------------------
                # Extract basic LOCK data (text + right edge)
                # -----------------------------------------------------------------
                data = _extract_lock_data(page)

                rows_total = len(data)
                texts = [item["text"] for item in data]
                rights = [item["right"] for item in data]

                max_count = sum(1 for t in texts if t == "max")
                weeks_pattern = re.compile(r"^\d+w$")
                weeks_count = sum(1 for t in texts if weeks_pattern.match(t))
                bad_count = sum(1 for t in texts if not (t == "max" or weeks_pattern.match(t)))

                if rights:
                    right_edges_aligned = 1 if (max(rights) - min(rights) <= 1.0) else 0
                else:
                    right_edges_aligned = 0

                distinct_set = sorted(set(texts))
                distinct_texts = ",".join(distinct_set)

                # -----------------------------------------------------------------
                # Pending‑marker checks (must be read before any sorting)
                # -----------------------------------------------------------------
                pending_info = _read_pending_marker_info(page)
                pending_count = pending_info["pending_count"]
                pending_id_numeric = pending_info["pending_id_numeric"]
                reward_sortable = pending_info["reward_sortable"]
                pending_marker_in_reward = pending_info["pending_marker_in_reward"]
                marker_not_in_id = pending_info["marker_not_in_id"]
                marker_only_pending = pending_info["marker_only_pending"]

                # -----------------------------------------------------------------
                # LOCK column sorting checks
                # -----------------------------------------------------------------
                # Click once – ascending
                page.locator("th", has_text="LOCK").first.click()
                page.wait_for_timeout(400)  # give the UI time to sort
                asc_texts = _read_lock_texts_in_order(page)
                sort_asc_last = asc_texts[-1] if asc_texts else ""

                # Click again – descending
                page.locator("th", has_text="LOCK").first.click()
                page.wait_for_timeout(400)
                desc_texts = _read_lock_texts_in_order(page)
                sort_desc_first = desc_texts[0] if desc_texts else ""

                # -----------------------------------------------------------------
                # Determine lock_ok according to specification (including sort & pending checks)
                # -----------------------------------------------------------------
                lock_ok = 1 if (
                    rows_total > 0
                    and bad_count == 0
                    and max_count >= 1
                    and weeks_count >= 1
                    and right_edges_aligned == 1
                    and sort_asc_last == "max"
                    and sort_desc_first == "max"
                    and pending_count > 0
                    and pending_id_numeric == 1
                    and reward_sortable == 1
                    and pending_marker_in_reward == pending_count
                    and marker_not_in_id == 1
                    and marker_only_pending == 1
                ) else 0

            except PlaywrightTimeoutError:
                # Table never became ready – keep default zero values
                lock_ok = 0
            finally:
                browser.close()
    finally:
        httpd.shutdown()
        httpd.server_close()

    # Print the required signals
    print(f"rows_total={rows_total}")
    print(f"max_count={max_count}")
    print(f"weeks_count={weeks_count}")
    print(f"bad_count={bad_count}")
    print(f"right_edges_aligned={right_edges_aligned}")
    print(f"distinct_texts={distinct_texts}")
    # New lines for sorting checks
    print(f"sort_asc_last={sort_asc_last}")
    print(f"sort_desc_first={sort_desc_first}")
    # Pending‑marker lines (must appear before lock_ok)
    print(f"pending_count={pending_count}")
    print(f"pending_id_numeric={pending_id_numeric}")
    print(f"reward_sortable={reward_sortable}")
    print(f"pending_marker_in_reward={pending_marker_in_reward}")
    print(f"marker_not_in_id={marker_not_in_id}")
    print(f"marker_only_pending={marker_only_pending}")
    print(f"lock_ok={lock_ok}")

    return 0 if lock_ok == 1 else 1


if __name__ == "__main__":
    sys.exit(main())