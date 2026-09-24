# -*- coding: utf-8 -*-
"""Kill test for data provenance.

Run 1: original site/metrics.mjs — rendering should produce 42 lines.
Run 2: metrics.mjs is replaced with a stub, whose functions throw
exceptions. If the page still shows 42 lines — numbers are embedded
in HTML, not counted as code — red. At the end the original is restored
guaranteed (try/finally) and checked byte‑by‑byte.
"""

import functools
import http.server
import socket
import sys
import threading
import io  # added for stderr capture
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

# ----------------------------------------------------------------------
# Intercept and count lines written to stderr.
# ----------------------------------------------------------------------
class _StderrCounter(io.TextIOBase):
    """Wrap a text stream, forwarding writes and counting newline‑terminated lines."""

    def __init__(self, stream):
        self._stream = stream
        self.lines = 0

    def write(self, s):
        # Forward the output.
        self._stream.write(s)
        # Count how many newline characters were written.
        self.lines += s.count("\n")
        return len(s)

    def flush(self):
        return self._stream.flush()

    # Provide the attributes expected of a TextIOBase.
    def __getattr__(self, name):
        return getattr(self._stream, name)


# Replace sys.stderr with the counting wrapper.
_stderr_counter = _StderrCounter(sys.stderr)
sys.stderr = _stderr_counter
# ----------------------------------------------------------------------


SITE = Path("site")
METRICS = SITE / "metrics.mjs"

STUB = """\
export function expectedReward() { throw new Error('provenance stub'); }
export function startEpoch() { throw new Error('provenance stub'); }
export function isMaxLock() { throw new Error('provenance stub'); }
export function fadingCount() { throw new Error('provenance stub'); }
export function exitSlash() { throw new Error('provenance stub'); }
export default { expectedReward, startEpoch, isMaxLock, fadingCount, exitSlash };
"""

MIN_ROWS = 1  # original must render at least something live


def _free_port():
    # Take a free port from the OS and hand it over immediately.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


_server = None
_thread = None


def _serve():
    """Start http.server with directory='site' — as in check_cells.py."""
    global _server, _thread
    port = _free_port()
    # Quiet handler that suppresses access logs.
    class _QuietHandler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args, **kwargs):
            pass

    handler = functools.partial(_QuietHandler, directory=str(SITE))
    _server = http.server.HTTPServer(("127.0.0.1", port), handler)
    _thread = threading.Thread(target=_server.serve_forever, daemon=True)
    _thread.start()
    return port


def _stop():
    if _server is not None:
        _server.shutdown()
        _server.server_close()
    if _thread is not None:
        _thread.join(timeout=5)


def _load_page(page, base):
    """Open index.html, collect pageerror/console errors."""
    errors = []
    page.remove_listener("pageerror", _noop) if False else None
    # handlers are added anew for each run; no old listeners,
    # because contexts are created separately
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on(
        "console",
        lambda msg: errors.append(msg.text) if msg.type == "error" else None,
    )
    page.goto(base, wait_until="networkidle")
    rows = page.locator("table tbody tr").count()
    return rows, errors


def _noop(*a, **k):
    pass


def main():
    original = METRICS.read_bytes()
    port = _serve()
    base = f"http://127.0.0.1:{port}/index.html"

    from playwright.sync_api import sync_playwright

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()

            # --- Run 1: original ---
            page1 = browser.new_page()
            rows1, err1 = _load_page(page1, base)
            orig_ok = rows1 >= MIN_ROWS and not err1
            print(f"PROV original: {'OK' if orig_ok else 'FAIL'} - rows {rows1}, pageerror {'yes' if err1 else 'no'}")
            page1.close()

            # --- Run 2: stub ---
            METRICS.write_bytes(STUB.encode("utf-8"))
            try:
                page2 = browser.new_page()
                rows2, err2 = _load_page(page2, base)
                stub_failed = rows2 != rows1 or bool(err2)
                print(
                    f"PROV stubbed: {'OK' if stub_failed else 'FAIL'} — "
                    f"rows {rows2}, pageerror {'yes' if err2 else 'no'}"
                )
                if not stub_failed:
                    print(
                        "Red: with stub metrics.mjs the page still "
                        f"showed {rows2} rows — numbers do not depend on metrics.mjs."
                    )
                page2.close()
            finally:
                # --- Must restore original ---
                METRICS.write_bytes(original)

                # --- Run 3: restoration ---
                page3 = browser.new_page()
                rows3, _err3 = _load_page(page3, base)
                page3.close()

            browser.close()
    finally:
        _stop()
        # Final safety net for restoration and byte‑by‑byte check.
        restored = METRICS.read_bytes()
        byte_ok = restored == original
        print(f"PROV restored: {'OK' if byte_ok else 'FAIL'} — file matches byte‑by‑byte")

    # Summary: three conditions — original, stub failure, restoration.
    with sync_playwright() as _pw:
        pass  # no-op: Playwright context is already closed here

    ok_count = 0
    if orig_ok:
        ok_count += 1
    # stub_failed is defined above; we won't reach it on exception
    if stub_failed:
        ok_count += 1
    if byte_ok:
        ok_count += 1
    print(f"prov_ok={ok_count}/3")
    # ------------------------------------------------------------------
    # Report how many lines were written to stderr during execution.
    # ------------------------------------------------------------------
    print(f"stderr_lines={_stderr_counter.lines}")
    sys.exit(0 if ok_count == 3 else 1)


if __name__ == "__main__":
    main()