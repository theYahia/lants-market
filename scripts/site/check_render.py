import json
import http.server
import socketserver
import threading
import sys
import os
from functools import partial
from playwright.sync_api import sync_playwright

def main():
    # 1. Data reading
    fixture_dir = 'site/fixtures'
    live_fixture = os.path.join(fixture_dir, 'snapshot-e23.live.json')
    full_fixture = os.path.join(fixture_dir, 'snapshot-e23.full.json')
    fixture_path = live_fixture if os.path.exists(live_fixture) else full_fixture
    fixture_name = os.path.basename(fixture_path)
    
    with open(fixture_path) as f:
        data = json.load(f)
    
    # Count expected positions based on render.mjs logic
    DUST_THRESHOLD = 1e18
    positions = data['positions']
    snapshot_epoch = int(data["epoch"])
    expected = 0
    has_dust = False
    
    for p in positions:
        if not p.get('withdrawn', False) and (int(p.get('closedAtEpoch', 0) or 0) == 0 or int(p.get('closedAtEpoch', 0) or 0) > snapshot_epoch):
            amount = int(p.get('amount', 0))
            if amount > DUST_THRESHOLD:
                expected += 1
            else:
                has_dust = True
    
    if has_dust:
        expected += 1

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

        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' and msg.text != "Failed to load resource: net::ERR_FAILED" else None)
        page.on('pageerror', lambda err: errors.append(str(err)))

        # Block all network requests to ensure local fixture is used
        page.route("https://**/*", lambda route: route.abort())

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
        print(f'rows={rows} expected={expected} source={fixture_name} errors={len(errors)}')

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
    if rows == expected and len(errors) == 0:
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == '__main__':
    main()