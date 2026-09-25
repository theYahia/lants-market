#!/usr/bin/env python3
"""E2E fork trade test: first trade end-to-end through the site on a Base fork.

Preconditions (assumes these fixes are merged):
- buy/create/cancel use walletRequest/selectedProvider ?? window.ethereum
- buy waits for approve receipt before buyListing
- ensureChain() called inside create and buy
- create is single-click auto-continue with receipt wait + list refresh
- cancel gate uses connectedAccount (not exercised here)
"""

import json
import os
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from playwright.sync_api import sync_playwright

# ── Config ──────────────────────────────────────────────────────────────
# These addresses must match site/market-config.mjs
MARKET = "0xC5BFc309a68dBf4e7eEca9BD91749d611c75C660"
NFT = "0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652"
USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
USAGE_REWARDS = "0x78330bF154172F1137219Bb559d4F3A270B3201F"
OPERATOR = "0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B"
BUYER = "0x00000000000000000000000000000000000B0B01"

ANVIL_PORT = 8545
ANVIL_URL = f"http://127.0.0.1:{ANVIL_PORT}"
FORK_RPC = "https://base-mainnet.public.blastapi.io"
SITE_DIR = "site"
CHAIN_ID_HEX = "0x2105"
PRICE_USDC = "2.00"
USDC_BALANCES_SLOT = 9
CDN_URLS = [
    "base-rpc.publicnode.com",
    "base.drpc.org",
    "mainnet.base.org",
    "base-mainnet.public.blastapi.io"
]
TX_POLL_TIMEOUT = 60  # seconds - for 2s block time

anvil_proc: Optional[subprocess.Popen] = None
httpd: Optional[HTTPServer] = None
http_thread: Optional[threading.Thread] = None

# ── Mock wallet JS (never use f-string - braces) ───────────────────────
MOCK_WALLET_JS = """
(() => {
    const ANVIL = "http://127.0.0.1:__ANVIL_PORT__";
    const ACTIVE = "__ACTIVE__";
    const CHAIN = "__CHAIN_ID_HEX__";

    class MockProvider {
        constructor() {}
        on() { return this; }
        removeListener() { return this; }
        async request({method, params}) {
            try {
                await window.__e2eLog("WALLET_CALL", method, JSON.stringify(params));
            } catch(e) {}
            switch (method) {
                case "eth_requestAccounts":
                case "eth_accounts":
                    return [ACTIVE];
                case "eth_chainId":
                    return CHAIN;
                case "wallet_switchEthereumChain":
                case "wallet_addEthereumChain":
                    return null;
                default: {
                    if (method === "eth_sendTransaction") {
                        // First estimate gas against latest block (like a real wallet)
                        const tx = {...params[0], from: ACTIVE};
                        const estimateBody = JSON.stringify({
                            jsonrpc: "2.0",
                            method: "eth_estimateGas",
                            params: [tx, "latest"],
                            id: 1
                        });
                        const estimateResp = await fetch(ANVIL, {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: estimateBody
                        });
                        const estimateJson = await estimateResp.json();
                        if (estimateJson.error) {
                            throw new Error(estimateJson.error.message);
                        }
                        
                        // Now send with the gas estimate
                        const body = JSON.stringify({
                            jsonrpc: "2.0",
                            method: "eth_sendTransaction",
                            params: [{...tx, gas: estimateJson.result}],
                            id: 1
                        });
                        const resp = await fetch(ANVIL, {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: body
                        });
                        const json = await resp.json();
                        if (json.error) throw new Error(json.error.message);
                        return json.result;
                    } else {
                        const body = JSON.stringify({
                            jsonrpc: "2.0",
                            method: method,
                            params: params,
                            id: 1
                        });
                        const resp = await fetch(ANVIL, {
                            method: "POST",
                            headers: {"Content-Type": "application/json"},
                            body: body
                        });
                        const json = await resp.json();
                        if (json.error) throw new Error(json.error.message);
                        return json.result;
                    }
                }
            }
        }
    }

    window.ethereum = new MockProvider();
})();
"""

# ── Helpers ─────────────────────────────────────────────────────────────
def assert_eq(name: str, got: Any, want: Any) -> None:
    """Check equality and print result."""
    got_str = str(got).lower()
    want_str = str(want).lower()
    print(f"{name}={got_str}")
    if got_str != want_str:
        raise AssertionError(f"{name}: got {got_str}, want {want_str}")


def rpc(method: str, params: list) -> Any:
    """POST JSON-RPC to anvil."""
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(ANVIL_URL, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
    if "error" in result:
        raise RuntimeError(f"RPC {method} failed: {result['error']}")
    return result["result"]


def start_anvil() -> subprocess.Popen:
    """Start anvil forked from Base."""
    global anvil_proc
    cmd = [
        "anvil",
        "--fork-url", FORK_RPC,
        "--port", str(ANVIL_PORT),
        "--auto-impersonate",
        "--chain-id", "8453",
        "--block-time", "2",
        "--silent"
    ]
    anvil_proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # wait for chain id
    for _ in range(60):
        try:
            chain_id = rpc("eth_chainId", [])
            if chain_id:
                return anvil_proc
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError("anvil failed to start")


def start_http_server() -> int:
    """Start http server on a free port, serve site/."""
    global httpd, http_thread

    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

    os.chdir(SITE_DIR)
    handler = QuietHandler
    httpd = HTTPServer(("127.0.0.1", 0), handler)  # port 0 = free
    port = httpd.server_address[1]
    http_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    http_thread.start()
    return port


def stop_all() -> None:
    """Stop anvil and http server."""
    global anvil_proc, httpd
    if httpd:
        httpd.shutdown()
        httpd.server_close()
        httpd = None
    if anvil_proc:
        anvil_proc.terminate()
        try:
            anvil_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            anvil_proc.kill()
        anvil_proc = None


# ── ABI encode helpers ─────────────────────────────────────────────────
def enc_addr(addr: str) -> str:
    """Pad address to 32 bytes hex."""
    return "0x" + addr[2:].zfill(64)


def enc_uint(val: int) -> str:
    """Encode uint256 as 32-byte hex."""
    return "0x" + f"{val:064x}"


def keccak(data: bytes) -> str:
    """Keccak256 via cast."""
    proc = subprocess.run(
        ["cast", "keccak", "0x" + data.hex()],
        capture_output=True, text=True, check=True
    )
    return proc.stdout.strip()


def get_selector(sig: str) -> str:
    """Get 4-byte function selector."""
    proc = subprocess.run(
        ["cast", "sig", sig],
        capture_output=True, text=True, check=True
    )
    return proc.stdout.strip()


def eth_call(to: str, data: str) -> str:
    """eth_call to address."""
    return rpc("eth_call", [{"to": to, "data": data}, "latest"])


def eth_send_and_wait(frm: str, to: str, data: str, value: str = "0x0") -> Dict:
    """Send tx and wait for receipt, assert status 0x1."""
    tx_hash = rpc("eth_sendTransaction", [{
        "from": frm,
        "to": to,
        "data": data,
        "value": value
    }])
    for _ in range(60):
        receipt = rpc("eth_getTransactionReceipt", [tx_hash])
        if receipt:
            assert receipt["status"] == "0x1", f"tx {tx_hash} failed"
            return receipt
        time.sleep(1)
    raise TimeoutError(f"tx {tx_hash} not mined")


def get_nft_position_id(receipt: Dict) -> int:
    """Parse NFT ERC721 mint transfer from receipt logs."""
    transfer_topic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
    for log in receipt["logs"]:
        if log["address"].lower() == NFT.lower() and log["topics"][0] == transfer_topic:
            if log["topics"][1] == "0x" + "0" * 64:  # from zero address
                return int(log["topics"][3], 16)
    raise AssertionError("no mint transfer log found")


def get_position_amount(token_id: int) -> int:
    """Get positions(token_id) word 2 (amount)."""
    selector = get_selector("positions(uint256)")
    data = selector + enc_uint(token_id)[2:]
    result = eth_call(NFT, data)
    # word 0: owner, word 1: rewardToken, word 2: amount, word 3: startEpoch, word 4: endEpoch, word 5: ...
    return int(result[2 + 2 * 64: 2 + 3 * 64], 16)


def get_listing(listing_id: int) -> Dict:
    """Get listing struct from MARKET.

    VexyMarketplace listings(uint256) returns 11 words in this order:
    0 seller, 1 nftCollection, 2 sellerNftNonce, 3 nftId, 4 currency,
    5 slopeMax, 6 price, 7 slopeDuration, 8 fixedDuration, 9 endTime, 10 soldTime.
    """
    selector = get_selector("listings(uint256)")
    data = selector + enc_uint(listing_id)[2:]
    result = eth_call(MARKET, data)
    
    seller = "0x" + result[2 + 12 * 2: 2 + 32 * 2]
    nft_id = int(result[2 + 3 * 64: 2 + 4 * 64], 16)
    currency = "0x" + result[2 + 4 * 64: 2 + 5 * 64][24:]
    price = int(result[2 + 6 * 64: 2 + 7 * 64], 16)
    sold_time = int(result[2 + 10 * 64: 2 + 11 * 64], 16)
    
    return {"seller": seller, "nftId": nft_id, "currency": currency, "price": price, "soldTime": sold_time}


def get_listings_length() -> int:
    selector = get_selector("listingsLength()")
    result = eth_call(MARKET, selector)
    return int(result, 16)


def get_owner_of_nft(token_id: int) -> str:
    selector = get_selector("ownerOf(uint256)")
    data = selector + enc_uint(token_id)[2:]
    result = eth_call(NFT, data)
    return "0x" + result[2 + 24: 2 + 64]


def get_usdc_balance(addr: str) -> int:
    selector = get_selector("balanceOf(address)")
    data = selector + enc_addr(addr)[2:]
    result = eth_call(USDC, data)
    return int(result, 16)


def set_usdc_balance(addr: str, amount_wei: int) -> None:
    """Set USDC balance via storage slot."""
    # slot = keccak256(abi.encode(addr, 9))
    proc = subprocess.run(
        ["cast", "index", "address", addr, str(USDC_BALANCES_SLOT)],
        capture_output=True, text=True, check=True
    )
    slot = proc.stdout.strip()
    rpc("anvil_setStorageAt", [USDC, slot, "0x" + f"{amount_wei:064x}"])
    assert_eq(f"usdc_balance_{addr}", get_usdc_balance(addr), amount_wei)


# ── Site setup / mock wallet ───────────────────────────────────────────
def add_init_script(page, addr: str) -> None:
    """Inject mock window.ethereum before page scripts."""
    js = MOCK_WALLET_JS.replace("__ACTIVE__", addr).replace("__ANVIL_PORT__", str(ANVIL_PORT)).replace("__CHAIN_ID_HEX__", CHAIN_ID_HEX)
    page.add_init_script(js)


def setup_rpc_route(context) -> None:
    """Intercept public RPC calls and forward to anvil."""
    def handle_route(route):
        req = route.request
        url = req.url
        if any(host in url for host in CDN_URLS):
            if req.method == "OPTIONS":
                route.fulfill(
                    status=204,
                    headers={
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "POST, OPTIONS",
                        "Access-Control-Allow-Headers": "*"
                    }
                )
                return
            body = req.post_data_buffer or b""
            try:
                proxy_req = urllib.request.Request(
                    ANVIL_URL,
                    data=body,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(proxy_req, timeout=30) as resp:
                    data = resp.read()
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    headers={"Access-Control-Allow-Origin": "*"},
                    body=data
                )
            except Exception as e:
                error_body = json.dumps({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "error": {"code": -32000, "message": str(e)}
                }).encode()
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    headers={"Access-Control-Allow-Origin": "*"},
                    body=error_body
                )
        else:
            route.continue_()
    context.route("**/*", handle_route)


def setup_page_logging(page) -> Dict:
    """Setup console and page error collection for a page."""
    logs = {"console": [], "page_errors": [], "wallet": []}
    
    page.on("console", lambda msg: logs["console"].append(msg.text) if msg.type in ("error", "warning") else None)
    page.on("pageerror", lambda exc: logs["page_errors"].append(str(exc)))
    
    def e2e_log(category: str, method: str, params_str: str):
        if category == "WALLET_CALL":
            logs["wallet"].append(f"{method}: {params_str[:200]}")
    
    page.expose_function("__e2eLog", e2e_log)
    return logs


def print_logs(logs: Dict, prefix: str = "") -> None:
    """Print collected logs."""
    for wallet_call in logs["wallet"]:
        method = wallet_call.split(":")[0].strip()
        print(f"WALLET_CALL={prefix}{method}")
    for console_msg in logs["console"]:
        print(f"PAGE_CONSOLE={prefix}{console_msg}")


# ── Main test ──────────────────────────────────────────────────────────
def run_step1_3() -> int:
    """Steps 1-3: stakeBuyerReward, splitStake, enableMaxLock."""
    # fund operator
    rpc("anvil_setBalance", [OPERATOR, "0x16345785d8a0000"])  # 0.1 ETH

    # Step 1: stakeBuyerReward
    sig = "stakeBuyerReward(address,uint256,uint256,uint256)"
    selector = get_selector(sig)
    data = (selector + enc_addr("0x86Bb4278389572D6FFC803D72661552bE096E473")[2:]
            + enc_uint(23)[2:] + enc_uint(52894)[2:] + enc_uint(104)[2:])
    receipt = eth_send_and_wait(OPERATOR, USAGE_REWARDS, data)
    P = get_nft_position_id(receipt)
    print(f"STEP1_OK position_id={P}")

    # Step 2: splitStake(P, 50e18)
    sig = "splitStake(uint256,uint256)"
    selector = get_selector(sig)
    data = selector + enc_uint(P)[2:] + enc_uint(50 * 10**18)[2:]
    receipt = eth_send_and_wait(OPERATOR, NFT, data)
    # find two mints, identify SMALL (amount=50e18) and BIG (other)
    transfer_topic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
    minted = []
    for log in receipt["logs"]:
        if log["address"].lower() == NFT.lower() and log["topics"][0] == transfer_topic:
            if log["topics"][1] == "0x" + "0" * 64:  # from zero
                tid = int(log["topics"][3], 16)
                minted.append(tid)
    assert len(minted) == 2, f"expected 2 mints, got {len(minted)}"
    amounts = {tid: get_position_amount(tid) for tid in minted}
    small = next(tid for tid, amt in amounts.items() if amt == 50 * 10**18)
    big = next(tid for tid, amt in amounts.items() if tid != small)
    print(f"STEP2_OK SMALL={small} BIG={big}")

    # Step 3: enableMaxLock(BIG)
    sig = "enableMaxLock(uint256)"
    selector = get_selector(sig)
    data = selector + enc_uint(big)[2:]
    eth_send_and_wait(OPERATOR, NFT, data)
    print(f"STEP3_OK nftId_for_listing={small}")

    return small


def operator_flow(nft_id: int, site_port: int) -> int:
    """Operator creates listing."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        setup_rpc_route(context)
        page = context.new_page()
        add_init_script(page, OPERATOR)
        logs = setup_page_logging(page)

        page.goto(f"http://127.0.0.1:{site_port}/")
        page.wait_for_load_state("networkidle")

        # open Listings tab (no Connect click needed)
        page.click(".tab[data-tab=listings]")
        page.wait_for_timeout(1000)

        # fill form
        page.fill("#cf-nftid", str(nft_id))
        page.fill("#cf-price", PRICE_USDC)
        page.fill("#cf-days", "30")

        # Wait for summary to update with correct values
        deadline = time.time() + 15
        while time.time() < deadline:
            summary_text = page.inner_text("#cf-summary")
            if ("50.00 ANTS" in summary_text and 
                "you receive 1.98 USDC" in summary_text and 
                "0.0400 USDC/ANTS" in summary_text):
                break
            page.wait_for_timeout(500)
        else:
            raise AssertionError(f"Summary did not update correctly: {page.inner_text('#cf-summary')}")
        print(f"form_summary={summary_text}")

        before_len = get_listings_length()

        # submit
        page.click("#cf-submit")

        # wait for success text
        try:
            page.wait_for_selector("#create-status:has-text('Listing created.')", timeout=120000)
        except Exception:
            raise AssertionError(f"create-status text: {page.inner_text('#create-status')}")

        # chain asserts
        after_len = get_listings_length()
        assert_eq("listings_length", after_len, before_len + 1)

        listing_id = after_len - 1  # listingsLength incremented, listing id = length-1 (0-indexed)
        listing = get_listing(listing_id)
        assert_eq("listing_owner", listing["seller"].lower(), OPERATOR.lower())
        assert_eq("listing_nftId", listing["nftId"], nft_id)
        assert_eq("listing_currency", listing["currency"].lower(), USDC.lower())
        assert_eq("listing_price", listing["price"], 2_000_000)
        assert_eq("listing_soldTime", listing["soldTime"], 0)
        nft_owner = get_owner_of_nft(nft_id)
        # NOTE: marketplace does NOT escrow, owner should still be OPERATOR
        assert_eq("nft_owner_after_create", nft_owner.lower(), OPERATOR.lower())

        # DOM: after site refresh, find row and verify status
        page.reload()
        page.wait_for_load_state("networkidle")
        page.click(".tab[data-tab=listings]")
        row = page.locator(f"#market-list .market-row[data-listing-id='{listing_id}']")
        row.wait_for(timeout=30000)
        status = row.locator("span[data-field=state]").inner_text()
        assert_eq("row_status_create", status.strip().lower(), "live")

        print_logs(logs, "OPERATOR_")
        page.unroute_all(behavior="ignoreErrors")
        print(f"CREATE_OK LISTING_ID={listing_id}")
        browser.close()
        return listing_id


def buyer_flow(listing_id: int, site_port: int) -> None:
    """Buyer purchases the listing."""
    rpc("anvil_setBalance", [BUYER, hex(10**17)])
    print("buyer_eth_set=1")
    set_usdc_balance(BUYER, 10 * 10**6)
    op_before = get_usdc_balance(OPERATOR)
    buyer_before = get_usdc_balance(BUYER)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        setup_rpc_route(context)
        page = context.new_page()
        add_init_script(page, BUYER)
        logs = setup_page_logging(page)

        page.goto(f"http://127.0.0.1:{site_port}/")
        page.wait_for_load_state("networkidle")
        page.click(".tab[data-tab=listings]")

        row = page.locator(f"#market-list .market-row[data-listing-id='{listing_id}']")
        row.wait_for(timeout=30000)
        row.locator("button.buy").click()

        # wait for sale complete (timeout 120s)
        deadline = time.time() + 120
        while time.time() < deadline:
            listing = get_listing(listing_id)
            if listing["soldTime"] != 0:
                break
            page.wait_for_timeout(2000)
        else:
            row_text = row.inner_text().replace("\n", " | ")
            print(f"BUY_ROW_TEXT={row_text}")
            for i, console_msg in enumerate(logs["console"]):
                print(f"PAGE_ERROR={console_msg}")
            for i, page_err in enumerate(logs["page_errors"]):
                print(f"PAGE_ERROR={page_err}")
            for wallet_call in logs["wallet"]:
                method = wallet_call.split(":")[0].strip()
                print(f"WALLET_CALL={method}")
            raise AssertionError("soldTime still 0 after timeout")

        # chain asserts
        assert_eq("nft_owner_after_buy", get_owner_of_nft(listing["nftId"]).lower(), BUYER.lower())
        op_after = get_usdc_balance(OPERATOR)
        buyer_after = get_usdc_balance(BUYER)
        op_delta = op_after - op_before
        buyer_delta = buyer_after - buyer_before  # negative represents payment
        assert_eq("operator_usdc_delta", op_delta, 2_000_000)
        assert_eq("buyer_usdc_delta", buyer_delta, -2_000_000)

        # DOM: after refresh status shows "sold"
        page.reload()
        page.wait_for_load_state("networkidle")
        page.click(".tab[data-tab=listings]")
        row = page.locator(f"#market-list .market-row[data-listing-id='{listing_id}']")
        row.wait_for(timeout=30000)
        status = row.locator("span[data-field=state]").inner_text()
        assert_eq("row_status_buy", status.strip().lower(), "sold")

        print_logs(logs, "BUYER_")
        page.unroute_all(behavior="ignoreErrors")
        print(f"BUY_OK OPERATOR_DELTA={op_delta} BUYER_DELTA={buyer_delta} NFT_OWNER={BUYER}")
        browser.close()


def main():
    site_port = None
    try:
        # start infrastructure
        start_anvil()
        site_port = start_http_server()

        # steps 1-3
        nft_id = run_step1_3()

        # step 6: operator creates listing
        listing_id = operator_flow(nft_id, site_port)

        # step 7: buyer buys
        buyer_flow(listing_id, site_port)

        print("RESULT=PASS")
        return 0
    except Exception as e:
        print(f"RESULT=FAIL reason={e}")
        return 1
    finally:
        stop_all()


if __name__ == "__main__":
    sys.exit(main())