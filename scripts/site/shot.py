import socket
import threading
import http.server
import json
import re
import sys
import time
import io
from pathlib import Path
from playwright.sync_api import sync_playwright

def get_free_port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port

class _StderrCounter(io.TextIOBase):
    """Wraps a text stream, forwards writes to it and counts newline‑terminated lines."""
    def __init__(self, stream):
        self._stream = stream
        self.lines = 0

    def write(self, data):
        # Forward the data to the original stream.
        self._stream.write(data)
        # Count how many newlines were written.
        self.lines += data.count("\n")
        return len(data)

    def flush(self):
        self._stream.flush()

    def isatty(self):
        return self._stream.isatty()

    # Provide the attributes that sys.stderr normally has.
    def __getattr__(self, name):
        return getattr(self._stream, name)

def main():
    # Replace stderr with a counting wrapper.
    original_stderr = sys.stderr
    sys.stderr = _StderrCounter(original_stderr)

    def _exit_with_count(code: int):
        """Print the number of stderr lines and exit with the given code."""
        # Ensure the count is printed to stdout before exiting.
        print(f"stderr_lines={sys.stderr.lines}")
        sys.exit(code)

    script_dir = Path(__file__).parent
    root_dir = script_dir.parent.parent
    json_path = root_dir / "site" / "fixtures" / "snapshot-e23.full.json"
    img_path = root_dir / "site.png"
    fixture_dir = root_dir / "site"

    if not json_path.exists():
        print(f"FileNotFoundError: {json_path}", file=sys.stderr)
        _exit_with_count(1)

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    # Expected number of rows rendered in the table.
    N = 11

    port = get_free_port()
    handler = http.server.SimpleHTTPRequestHandler
    handler_dir = str(fixture_dir)

    class Handler(handler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=handler_dir, **kwargs)

        # Suppress default HTTP request logging.
        def log_message(self, *args):
            pass

    server = http.server.HTTPServer(("127.0.0.1", port), Handler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()
            
            page.goto(f"http://127.0.0.1:{port}/index.html", wait_until="domcontentloaded")
            page.wait_for_selector("table tbody tr", timeout=15000)
            page.screenshot(path=str(img_path), full_page=True)
            
            rows = page.locator("table tbody tr").count()
            
            full_text = page.inner_text("body")
            matches = re.findall(r"[\u0410-\u042F\u0430-\u044F\u0401\u0451]+", full_text)
            for match in matches:
                print(f"RU: {match}")
            ru = len(matches)
            
            print(f"rows={rows} expected={N} ru={ru}")
            
            context.close()
            browser.close()

            exit_code = 0 if (rows == N and ru == 0) else 1
            _exit_with_count(exit_code)
    finally:
        server.shutdown()
        server.server_close()

if __name__ == "__main__":
    main()