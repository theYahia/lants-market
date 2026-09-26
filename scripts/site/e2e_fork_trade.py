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
import mimetypes
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
BUYER = "0x00000000000000000000000000000000000B0b01"  # EIP-55 checksum (Privy rejects a bad checksum)

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
privy_mode = False

# ── Mock wallet JS (never use f-string - braces) ───────────────────────
MOCK_WALLET_JS = """
(() => {
    const ANVIL = "https://anvil.e2e.invalid/";
    const ACTIVE = "__ACTIVE__";
    const CHAIN = "__CHAIN_ID_HEX__";

    class MockProvider {
        constructor() {
            this.isMetaMask = true;
            this.isRabby = true;
            this.listeners = new Map();
            this.walletCalls = [];
            window.__walletCalls = this.walletCalls;
        }
        on(event, fn) {
            if (!this.listeners.has(event)) this.listeners.set(event, []);
            this.listeners.get(event).push(fn);
            return this;
        }
        addListener(event, fn) {
            return this.on(event, fn);
        }
        removeListener(event, fn) {
            if (this.listeners.has(event)) {
                const arr = this.listeners.get(event);
                const idx = arr.indexOf(fn);
                if (idx !== -1) arr.splice(idx, 1);
            }
            return this;
        }
        off(event, fn) {
            return this.removeListener(event, fn);
        }
        once(event, fn) {
            const self = this;
            const wrapper = (...args) => {
                self.removeListener(event, wrapper);
                fn(...args);
            };
            return this.on(event, wrapper);
        }
        emit(event, ...args) {
            if (this.listeners.has(event)) {
                for (const fn of this.listeners.get(event)) {
                    fn(...args);
                }
            }
            return this;
        }
        async request({method, params}) {
            this.walletCalls.push(method);
            try {
                await window.__e2eLog("WALLET_CALL", method, JSON.stringify(params));
            } catch(e) {}
            
            switch (method) {
                case "eth_requestAccounts":
                case "eth_accounts": {
                    if (method === "eth_requestAccounts") {
                        setTimeout(() => {
                            this.emit("connect", {chainId: CHAIN});
                            this.emit("accountsChanged", [ACTIVE]);
                        }, 0);
                    }
                    return [ACTIVE];
                }
                case "eth_chainId":
                    return CHAIN;
                case "wallet_switchEthereumChain":
                case "wallet_addEthereumChain":
                    return null;
                case "wallet_requestPermissions":
                    return [{parentCapability: "eth_accounts", caveats: []}];
                case "wallet_getPermissions":
                    return [{parentCapability: "eth_accounts", caveats: []}];
                case "wallet_getCapabilities":
                    return {};
                case "wallet_revokePermissions":
                    return null;
                case "eth_coinbase":
                    return ACTIVE;
                case "net_version":
                    return "8453";
                case "personal_sign":
                case "eth_signTypedData_v4":
                    return "0x" + "11".repeat(65);
                case "eth_sendTransaction": {
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
                }
                default: {
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

    window.ethereum = new MockProvider();

    // EIP-6963 announcement
    const provider = new MockProvider();
    const announce = () => {
        const event = new CustomEvent("eip6963:announceProvider", {
            detail: {
                info: {
                    uuid: "e2e-rabby",
                    name: "Rabby Wallet",
                    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
                    rdns: "io.rabby"
                },
                provider: provider
            }
        });
        window.dispatchEvent(event);
    };
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
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
        # one block before the real first trade staked the epoch-23 buyer reward (AlreadyClaimed after it)
        "--fork-block-number", "51780129",
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


def setup_privy_route(context) -> None:
    """Route lants.eth.limo requests to dist/ files."""
    dist_dir = Path(SITE_DIR + "/../dist").resolve()
    
    def handle_route(route):
        url = route.request.url
        # Parse URL
        from urllib.parse import urlparse
        parsed = urlparse(url)
        path = parsed.path
        if path == "/":
            path = "/index.html"
        
        file_path = dist_dir / path.lstrip("/")
        
        if file_path.exists() and file_path.is_file():
            content_type = "text/javascript" if file_path.suffix == ".mjs" else mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
            with open(file_path, "rb") as f:
                body = f.read()
            route.fulfill(
                status=200,
                content_type=content_type,
                body=body
            )
        else:
            route.continue_()
    
    context.route("https://lants.eth.limo/**", handle_route)


def connect_privy(page, role: str) -> None:
    """Click connect button and wait for Privy connection, picking Rabby Wallet if needed."""
    page.click("#hdr-connect")
    
    deadline = time.time() + 20
    rabby_clicked = False
    while time.time() < deadline:
        try:
            btn_text = page.inner_text("#hdr-connect")
            # Check if button text starts with 0x (connected address)
            if btn_text.strip().startswith("0x"):
                # Check no visible privy dialog backdrop
                backdrop = page.locator("#privy-dialog-backdrop")
                if not backdrop.is_visible():
                    print(f"PRIVY_CONNECTED_{role}=1")
                    return
        except Exception:
            pass
        
        # Check if Rabby Wallet is visible and click it once
        if not rabby_clicked:
            try:
                rabby_wallet = page.get_by_text("Rabby Wallet", exact=True)
                if rabby_wallet.is_visible():
                    rabby_wallet.click()
                    rabby_clicked = True
                    print(f"PRIVY_PICKED_RABBY_{role}=1")
                    # Continue polling for connection
            except Exception:
                pass
        
        page.wait_for_timeout(500)
    
    # Diagnostic output on failure
    try:
        btn_text = page.inner_text("#hdr-connect")
        print(f"PRIVY_BTN={btn_text}")
    except Exception:
        print("PRIVY_BTN=<not accessible>")
    
    try:
        backdrop = page.locator("#privy-dialog-backdrop")
        if backdrop.count() == 0:
            print("PRIVY_BACKDROP=absent")
        elif backdrop.is_visible():
            print("PRIVY_BACKDROP=visible")
        else:
            print("PRIVY_BACKDROP=hidden")
    except Exception:
        print("PRIVY_BACKDROP=error")
    
    try:
        frames = page.frames
        frame_info = []
        for f in frames:
            url = f.url
            if len(url) > 80:
                url = url[:80] + "..."
            frame_info.append(url)
        print(f"PRIVY_FRAMES={','.join(frame_info)}")
    except Exception:
        print("PRIVY_FRAMES=<error>")
    
    # Get wallet calls from window.__walletCalls
    try:
        wallet_calls = page.evaluate("() => (window.__walletCalls||[]).join(',')")
        print(f"PRIVY_WALLET_CALLS={wallet_calls}")
    except Exception:
        print("PRIVY_WALLET_CALLS=<error>")
    
    # Take screenshot
    script_dir = Path(__file__).parent
    screenshot_path = script_dir / f"privy_fail_{role}.png"
    try:
        page.screenshot(path=str(screenshot_path))
        print(f"PRIVY_SCREENSHOT={screenshot_path}")
    except Exception:
        print(f"PRIVY_SCREENSHOT=<error saving {screenshot_path}>")
    
    # This will be overridden by the actual logger, but let's try to get page errors
    try:
        print(f"PRIVY_DIAGNOSTICS_CAPTURED={role}")
    except Exception:
        pass
    
    raise AssertionError(f"Privy connection failed for {role}")


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


_PRE_TRADE_SNAPSHOT: Optional[bytes] = None


def pre_trade_snapshot() -> bytes:
    """Live snapshot without positions minted by or after the first trade (ids >= 110)."""
    global _PRE_TRADE_SNAPSHOT
    if _PRE_TRADE_SNAPSHOT is None:
        with urllib.request.urlopen("https://raw.githubusercontent.com/theYahia/lants-market/data/live.json", timeout=30) as r:
            snap = json.load(r)
        snap["positions"] = [x for x in snap["positions"] if int(x["id"]) < 110]
        _PRE_TRADE_SNAPSHOT = json.dumps(snap).encode()
    return _PRE_TRADE_SNAPSHOT


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
        elif "raw.githubusercontent.com/theYahia/lants-market/data/live.json" in url:
            # the fork is at the block before the first trade; today's snapshot already has #110+ split and closed
            route.fulfill(status=200, content_type="application/json",
                          headers={"Access-Control-Allow-Origin": "*"}, body=pre_trade_snapshot())
        elif "anvil.e2e.invalid" in url:
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
        # Only append to the list and return immediately - no Playwright API calls
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
def run_step1_3(site_port: int) -> int:
    """Steps 1-3: stakeBuyerReward, splitStake, enableMaxLock (single operator flow)."""
    # fund operator
    rpc("anvil_setBalance", [OPERATOR, "0x16345785d8a0000"])  # 0.1 ETH

    # Open operator page for steps 1-3
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        setup_rpc_route(context)
        if privy_mode:
            setup_privy_route(context)
        page = context.new_page()
        add_init_script(page, OPERATOR)
        logs = setup_page_logging(page)

        if privy_mode:
            page.goto("https://lants.eth.limo/index.html")
            connect_privy(page, "OPERATOR_STEP123")
        else:
            page.goto(f"http://127.0.0.1:{site_port}/")
        page.wait_for_load_state("networkidle")

        # Open Listings tab (Manage a position form is here)
        page.click(".tab[data-tab=listings]")
        page.wait_for_timeout(1000)

        # Step 1: Stake buyer reward
        page.fill("#br-buyer", "0x86Bb4278389572D6FFC803D72661552bE096E473")
        page.fill("#br-epoch", "23")
        page.fill("#br-agent", "52894")
        page.fill("#br-epochs", "104")
        
        # Wait for summary to be non-empty (pending reward shown)
        deadline = time.time() + 15
        while time.time() < deadline:
            br_summary = page.inner_text("#br-summary").strip()
            if br_summary:
                break
            page.wait_for_timeout(500)
        else:
            raise AssertionError(f"br-summary did not become non-empty: '{br_summary}'")
        
        # Read pendingBuyerReward via eth_call BEFORE clicking submit
        selector = get_selector("pendingBuyerReward(address,uint256)")
        data = selector + enc_addr("0x86Bb4278389572D6FFC803D72661552bE096E473")[2:] + enc_uint(23)[2:]
        pending_reward_hex = eth_call(USAGE_REWARDS, data)
        pending_reward = int(pending_reward_hex, 16)
        print(f"pending_buyer_reward_before={pending_reward}")
        
        page.click("#br-submit")
        
        # Wait for status matching /position\s*#?\d+/i
        try:
            page.wait_for_selector("#br-status:has-text('position')", timeout=120000)
            # Wait for #mf-posid to have a value
            deadline = time.time() + 10
            while time.time() < deadline:
                posid_val = page.input_value("#mf-posid")
                if posid_val.strip():
                    break
                page.wait_for_timeout(500)
            else:
                raise AssertionError(f"#mf-posid did not get filled: '{posid_val}'")
            P = int(posid_val)
        except Exception as e:
            print(f"MANAGE_STATUS={page.inner_text('#manage-status')}")
            print(f"BR_STATUS={page.inner_text('#br-status')}")
            print(f"MF_CARD={page.inner_text('#mf-card')}")
            raise
        
        # Chain check: positions(P) amount == pendingBuyerReward
        actual_amount = get_position_amount(P)
        assert_eq("positions_P_amount", actual_amount, pending_reward)
        print(f"STEP1_SITE_OK P={P}")

        # Step 2: Split
        page.fill("#mf-split", "50")
        page.click("#mf-split-btn")
        
        try:
            page.wait_for_selector("#manage-status:has-text('Split')", timeout=120000)
        except Exception as e:
            print(f"MANAGE_STATUS={page.inner_text('#manage-status')}")
            print(f"BR_STATUS={page.inner_text('#br-status')}")
            print(f"MF_CARD={page.inner_text('#mf-card')}")
            raise
        
        SMALL = int(page.input_value("#cf-nftid"))
        BIG = int(page.input_value("#mf-posid"))
        small_amount = get_position_amount(SMALL)
        big_amount = get_position_amount(BIG)
        assert_eq("small_amount", small_amount, 50 * 10**18)
        assert_eq("big_amount", big_amount, pending_reward - 50 * 10**18)
        print(f"STEP2_SITE_OK SMALL={SMALL} BIG={BIG}")

        # Step 3: Max-lock
        page.click("#mf-maxlock-btn")
        
        try:
            page.wait_for_selector("#manage-status:has-text('Max-lock enabled')", timeout=120000)
        except Exception as e:
            print(f"MANAGE_STATUS={page.inner_text('#manage-status')}")
            print(f"BR_STATUS={page.inner_text('#br-status')}")
            print(f"MF_CARD={page.inner_text('#mf-card')}")
            raise
        
        # Chain check: positionMaxLockPowerAtEpoch(BIG, currentEpoch()+1) > 0
        current_epoch_data = get_selector("currentEpoch()")
        current_epoch_hex = eth_call(NFT, current_epoch_data)
        current_epoch = int(current_epoch_hex, 16)
        maxlock_selector = get_selector("positionMaxLockPowerAtEpoch(uint256,uint256)")
        maxlock_data = maxlock_selector + enc_uint(BIG)[2:] + enc_uint(current_epoch + 1)[2:]
        maxlock_power = int(eth_call(NFT, maxlock_data), 16)
        assert maxlock_power > 0, f"maxlock power should be > 0, got {maxlock_power}"
        print(f"STEP3_SITE_OK maxlock_power={maxlock_power}")

        # Auto-fill check: #cf-nftid should be filled with SMALL in this same page
        cf_nftid_val = page.input_value("#cf-nftid")
        assert_eq("cf_nftid_autofill", cf_nftid_val, str(SMALL))
        print("cf_nftid_autofill_ok=1")

        print_logs(logs, "OPERATOR_STEP123_")
        page.unroute_all(behavior="ignoreErrors")
        browser.close()
        return SMALL


def operator_flow(nft_id: int, site_port: int) -> int:
    """Operator creates listing (filling #cf-nftid manually since this is a new page)."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        setup_rpc_route(context)
        if privy_mode:
            setup_privy_route(context)
        page = context.new_page()
        add_init_script(page, OPERATOR)
        logs = setup_page_logging(page)

        if privy_mode:
            page.goto("https://lants.eth.limo/index.html")
            connect_privy(page, "OPERATOR_CREATE")
        else:
            page.goto(f"http://127.0.0.1:{site_port}/")
        page.wait_for_load_state("networkidle")

        # open Listings tab (Manage a position form)
        page.click(".tab[data-tab=listings]")
        page.wait_for_timeout(1000)

        # Fill #cf-nftid manually (this is a new page, auto-fill from step 1-3 doesn't persist)
        page.fill("#cf-nftid", str(nft_id))

        # fill price and days
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
        if privy_mode:
            setup_privy_route(context)
        page = context.new_page()
        add_init_script(page, BUYER)
        logs = setup_page_logging(page)

        if privy_mode:
            page.goto("https://lants.eth.limo/index.html")
            connect_privy(page, "BUYER")
        else:
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
        # lot 0 is in INTERNAL_LISTING_IDS since 25.09, so the site shows "sold · internal"
        assert_eq("row_status_buy", status.strip().lower().split(" · ")[0], "sold")

        print_logs(logs, "BUYER_")
        page.unroute_all(behavior="ignoreErrors")
        print(f"BUY_OK OPERATOR_DELTA={op_delta} BUYER_DELTA={buyer_delta} NFT_OWNER={BUYER}")
        browser.close()


def main():
    global privy_mode
    site_port = None
    
    import argparse
    parser = argparse.ArgumentParser(description="E2E fork trade test")
    parser.add_argument("--privy", action="store_true", help="Run in Privy mode")
    args = parser.parse_args()
    privy_mode = args.privy
    
    print(f"MODE={'privy' if privy_mode else 'default'}")
    
    try:
        # start infrastructure
        start_anvil()
        if privy_mode:
            # Build dist and serve from there
            subprocess.run(["node", "scripts/site/build-dist.mjs"], check=True, cwd=os.getcwd())
        else:
            site_port = start_http_server()

        # steps 1-3 (now through the site, returns SMALL which will be listed)
        nft_id = run_step1_3(site_port or 0)

        # step 6: operator creates listing (fills #cf-nftid manually in this new page)
        listing_id = operator_flow(nft_id, site_port or 0)

        # step 7: buyer buys
        buyer_flow(listing_id, site_port or 0)

        print("RESULT=PASS")
        return 0
    except Exception as e:
        print(f"RESULT=FAIL reason={e}")
        return 1
    finally:
        stop_all()


if __name__ == "__main__":
    sys.exit(main())