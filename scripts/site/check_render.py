import json
import http.server
import socketserver
import threading
import sys
from functools import partial
from playwright.sync_api import sync_playwright

def main():
    # 1. Data reading
    with open('site/fixtures/snapshot-e23.full.json') as f:
        data = json.load(f)
    N = len(data['positions'])

    # 2. Server preparation
    handler = partial(http.server.SimpleHTTPRequestHandler, directory='site')
    server = socketserver.TCPServer(('', 0), handler)
    server.allow_reuse_address = True

    # Mute server logs
    def silent_log(*args):
        pass
    server.RequestHandlerClass.log_message = silent_log

    # Start server in background
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    port = server.server_address[1]
    url = f'http://127.0.0.1:{port}/index.html'

    # 3. Playwright
    errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
        page.on('pageerror', lambda err: errors.append(str(err)))

        # 4. Navigate to page with timeout
        try:
            page.goto(url, wait_until='networkidle', timeout=20000)
        except Exception:
            pass

        try:
            page.wait_for_selector('table tbody tr', timeout=15000)
        except Exception:
            pass

        # 5. Count rows
        rows = page.locator('table tbody tr').count()

        # 6. Print result
        print(f'rows={rows} expected={N} errors={len(errors)}')

        # 7. Error and content details
        for e in errors:
            print(f'CONSOLE ERROR: {e}')

        if rows == 0:
            print(page.content()[:500])

        # 8. Cleanup (browser closes on exiting with block)
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    # 9. Return code
    if rows == N and len(errors) == 0:
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == '__main__':
    main()