#!/usr/bin/env python3
"""Playwright guard for checking the market listings grid with mocked RPC responses.

The script starts a temporary HTTP server that serves the `site/` directory,
opens the page in a headless Chromium browser, intercepts all HTTPS requests,
mocks the blockchain RPC calls, and validates the listing row rendering.

Two runs are performed:
- Run A: "live" state (soldTime = 0)
- Run B: "sold" state (soldTime = now-60)

Expected signals are printed as KEY=VALUE lines and a final listing_ok=1/0.
"""

import sys
import threading
import socket
import http.server
import json
import time
import traceback
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import (
    sync_playwright,
    TimeoutError as PlaywrightTimeoutError,
)

# Repository root – script resides in scripts/site/, go up three levels
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SITE_ROOT = REPO_ROOT / "site"

# Mock addresses (lowercase hex without 0x for comparison)
MARKET = "0xc5bfc309a68dbf4e7eeca9bd91749d611c75c660"
NFT = "0x8bf4d39aa13f3cb03f87d9500767fbc4d0940652"
USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
SELLER = "0x3d4cccfaa3b25997f4ab33f838558521259eef1b"

# RPC endpoints to intercept
RPC_ENDPOINTS = [
    "https://base-rpc.publicnode.com",
    "https://base.drpc.org",
    "https://mainnet.base.org",
]

# Known function selectors
SELECTORS = {
    "listingsLength": "0x7afd81f5",
    "listings": "0xde74e57b",
    "listingPrice": "0x115bc936",
    "ownerOf": "0x6352211e",
    "positions": "0x99fbab88",
}

# Timeout for waiting for selectors (milliseconds)
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
            """Override to suppress request logging."""
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), CustomHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def _pad_word(value) -> str:
    """Pad a value to a 32-byte word (64 hex chars after 0x).
    
    Accepts:
    - int: formatted as decimal -> hex, left-padded to 64 chars
    - str starting with 0x: treated as address, left-padded to 64 chars
    """
    if isinstance(value, int):
        return format(value, "064x")
    elif isinstance(value, str) and value.startswith("0x"):
        # Address string - extract hex part and left-pad to 64 chars
        hex_part = value[2:]  # Remove 0x
        return hex_part.rjust(64, "0")
    else:
        # Fallback for any other string (treat as hex without 0x)
        hex_part = value.replace("0x", "")
        return hex_part.rjust(64, "0")


def _build_mock_response(method: str, params: list, run_type: str) -> str:
    """Build the mock RPC response based on the called method and parameters."""
    now = int(time.time())
    
    if method == "eth_call":
        if not params or not isinstance(params[0], dict):
            return "0x" + "0" * 64
        
        to = params[0].get("to", "").lower()
        data = params[0].get("data", "")
        
        # Listings length
        if to == MARKET and data.startswith(SELECTORS["listingsLength"]):
            return "0x" + _pad_word(1)
        
        # Listings(0) - note: listings(0) means calling listings(uint256) with 0
        elif to == MARKET and data.startswith(SELECTORS["listings"]):
            # Extract the argument from data (after selector)
            if len(data) >= 74:  # 10 (selector) + 64 (one word)
                arg = int(data[10:74], 16)
                if arg == 0:
                    # 11 words: SELLER, NFT, 1, 106, USDC, 0, 2000000, 0, 2592000, endTime, soldTime
                    words = [
                        _pad_word(SELLER),
                        _pad_word(NFT),
                        _pad_word(1),
                        _pad_word(106),
                        _pad_word(USDC),
                        _pad_word(0),
                        _pad_word(2000000),
                        _pad_word(0),
                        _pad_word(2592000),
                        _pad_word(now + 86400),
                        _pad_word(0 if run_type == "A" else now - 60),
                    ]
                    return "0x" + "".join(words)
        
        # Listing price
        elif to == MARKET and data.startswith(SELECTORS["listingPrice"]):
            if len(data) >= 74:
                arg = int(data[10:74], 16)
                if arg == 0:
                    return "0x" + _pad_word(2000000)
        
        # NFT ownerOf
        elif to == NFT and data.startswith(SELECTORS["ownerOf"]):
            if len(data) >= 74:
                arg = int(data[10:74], 16)
                if arg == 106:
                    return "0x" + _pad_word(SELLER)
        
        # NFT positions(106)
        elif to == NFT and data.startswith(SELECTORS["positions"]):
            if len(data) >= 74:
                arg = int(data[10:74], 16)
                if arg == 106:
                    # 8 words: SELLER, 52894, 50*10**18, 50*10**18, 25, 129, 0, 0
                    words = [
                        _pad_word(SELLER),
                        _pad_word(52894),
                        _pad_word(50 * 10**18),
                        _pad_word(50 * 10**18),
                        _pad_word(25),
                        _pad_word(129),
                        _pad_word(0),
                        _pad_word(0),
                    ]
                    return "0x" + "".join(words)
    
    # Default: return zeros (32 bytes)
    return "0x" + "0" * 64


def main() -> None:
    """Run the guard logic for both live and sold listing states."""
    port = _find_free_port()
    httpd = _start_http_server(port)

    results = {}

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            
            for run_type in ["A", "B"]:
                page = browser.new_page()
                
                # Set up route interception
                def handle_route(route, request, rt=run_type):
                    url = request.url
                    if any(url.startswith(endpoint) for endpoint in RPC_ENDPOINTS) and request.method == "POST":
                        try:
                            body = json.loads(request.post_data)
                            method = body.get("method", "")
                            params = body.get("params", [])
                            rpc_id = body.get("id", 1)
                            
                            result = _build_mock_response(method, params, rt)
                            response_body = json.dumps({
                                "jsonrpc": "2.0",
                                "id": rpc_id,
                                "result": result
                            })
                            route.fulfill(
                                status=200,
                                content_type="application/json",
                                headers={"Access-Control-Allow-Origin": "*"},
                                body=response_body
                            )
                        except Exception:
                            # Log the exception to stderr
                            traceback.print_exc()
                            route.fulfill(
                                status=500,
                                content_type="application/json",
                                headers={"Access-Control-Allow-Origin": "*"},
                                body=json.dumps({"jsonrpc": "2.0", "id": 1, "error": {"code": -32000, "message": "Mock error"}})
                            )
                    else:
                        route.abort()
                
                page.route("https://**/*", handle_route)
                
                try:
                    page.goto(f"http://127.0.0.1:{port}/index.html")
                    
                    # Click on listings tab
                    page.click(".tab[data-tab=listings]")
                    
                    # Wait for market row to appear
                    page.wait_for_selector("#market-list .market-row", timeout=SELECTOR_TIMEOUT)
                    
                    # Extract data from first market row
                    row = page.locator("#market-list .market-row").first
                    
                    # Extract field values
                    fields = {}
                    for field in ["listingId", "nftId", "price", "ants", "unitPrice", "lock", "state"]:
                        value = row.locator(f'span[data-field="{field}"]').text_content() or ""
                        fields[field] = value
                    
                    # Count text nodes (must be 0)
                    text_nodes = row.evaluate("""el => {
                        let count = 0;
                        for (let node of el.childNodes) {
                            if (node.nodeType === 3) count++;
                        }
                        return count;
                    }""")
                    
                    # Count children elements (must be 8)
                    children_count = row.locator(":scope > *").count()
                    
                    # Check buy and cancel buttons
                    buy_present = row.locator("button.buy").count() > 0
                    cancel_present = row.locator("button.cancel").count() > 0
                    
                    # Check header
                    head_present = page.locator("#market-list .market-head").count() > 0
                    head_children = page.locator("#market-list .market-head").first.locator(":scope > *").count() if head_present else 0
                    
                    # Get caveats
                    caveats = page.locator("#market-list .market-caveat")
                    caveat_texts = " ".join(c.text_content() or "" for c in caveats.all())
                    
                    prefix = f"{run_type.lower()}_"
                    results[f"{prefix}listingId"] = fields["listingId"]
                    results[f"{prefix}nftId"] = fields["nftId"]
                    results[f"{prefix}price"] = fields["price"]
                    results[f"{prefix}ants"] = fields["ants"]
                    results[f"{prefix}unitPrice"] = fields["unitPrice"]
                    results[f"{prefix}lock"] = fields["lock"]
                    results[f"{prefix}state"] = fields["state"]
                    results[f"{prefix}buy"] = "1" if buy_present else "0"
                    results[f"{prefix}cancel"] = "1" if cancel_present else "0"
                    results[f"{prefix}text_nodes"] = str(text_nodes)
                    results[f"{prefix}children"] = str(children_count)
                    results[f"{prefix}head_ok"] = "1" if head_present and head_children == 8 else "0"
                    results[f"{prefix}caveats_ok"] = "1" if (
                        "Staking rewards for the open epoch can't be claimed before listing and pass to the buyer with the NFT." in caveat_texts
                        and "claim before listing" not in caveat_texts
                        and "once listed" not in caveat_texts
                    ) else "0"
                    
                except PlaywrightTimeoutError:
                    # Selector timeout - record failure
                    prefix = f"{run_type.lower()}_"
                    results[f"{prefix}listingId"] = "TIMEOUT"
                    results[f"{prefix}state"] = "ERROR"
                    results[f"{prefix}text_nodes"] = "-1"
                    results[f"{prefix}children"] = "-1"
                    results[f"{prefix}head_ok"] = "0"
                    results[f"{prefix}caveats_ok"] = "0"
                
                page.close()
            
            browser.close()
    finally:
        # Ensure the HTTP server is stopped even if an exception occurs
        httpd.shutdown()
        httpd.server_close()

    # Print results
    for key in sorted(results.keys()):
        print(f"{key}={results[key]}")
    
    # Determine overall success
    listing_ok = 1
    try:
        # Run A checks
        if results["a_listingId"] != "#0": listing_ok = 0
        if results["a_nftId"] != "106": listing_ok = 0
        if results["a_price"] != "2.00 USDC": listing_ok = 0
        if results["a_ants"] != "50.00": listing_ok = 0
        if results["a_unitPrice"] != "0.0400": listing_ok = 0
        if results["a_lock"] != "104w": listing_ok = 0
        if results["a_state"] != "live": listing_ok = 0
        if results["a_buy"] != "1": listing_ok = 0
        if results["a_cancel"] != "0": listing_ok = 0
        
        # Run B checks
        if results["b_state"] != "sold": listing_ok = 0
        if results["b_ants"] != "50.00": listing_ok = 0
        if results["b_lock"] != "—": listing_ok = 0
        if results["b_buy"] != "0": listing_ok = 0
        if results["b_cancel"] != "0": listing_ok = 0
        
        # Both runs common checks
        for prefix in ["a_", "b_"]:
            if results[f"{prefix}text_nodes"] != "0": listing_ok = 0
            if results[f"{prefix}children"] != "8": listing_ok = 0
            if results[f"{prefix}head_ok"] != "1": listing_ok = 0
            if results[f"{prefix}caveats_ok"] != "1": listing_ok = 0
    except KeyError:
        listing_ok = 0
    
    print(f"listing_ok={listing_ok}")
    
    # Exit with code 1 if listing_ok is 0
    return 0 if listing_ok else 1


if __name__ == "__main__":
    sys.exit(main())