#!/usr/bin/env python3
"""Check Privy wallet connect flow over the static site/ directory.

Serves site/ via a quiet ThreadingHTTPServer on the FIXED port 8098 (the origin
http://127.0.0.1:8098 is registered in Privy's allowed origins), opens the root
page in a headless chromium (playwright), injects a fake EIP-1193 wallet that
announces itself only through EIP-6963, drives the connect flow, and prints
exactly one summary line to BOTH stdout and stderr.

Privy renders its modal with React into the page DOM (not necessarily shadow
DOM) and may use an iframe. Detection is therefore robust: an element whose id
or class contains "privy", or visible login text like "Connect wallet" /
"Log in or sign up".
"""

import contextlib
import functools
import os
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import sync_playwright

REQ_THRESHOLD = 1
PORT = 8098

HERE = os.path.dirname(os.path.abspath(__file__))
SITE_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "site"))


class _QuietHandler(SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler that never writes to stdout/stderr."""

    def log_message(self, format, *args):  # noqa: A002 - match base signature
        pass


INIT_SCRIPT = r"""
(() => {
  window.__calls = [];
  const provider = {
    request: (args) => {
      const method = (args && args.method) || undefined;
      window.__calls.push({ method: method, ts: Date.now() });
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
        return Promise.resolve(['0x000000000000000000000000000000000000dEaD']);
      }
      if (method === 'eth_chainId') {
        return Promise.resolve('0x2105');
      }
      return Promise.resolve(null);
    },
    on: () => {},
    removeListener: () => {},
  };
  const info = {
    uuid: '00000000-0000-4000-8000-000000000000',
    name: 'LantsTest',
    icon: 'data:image/svg+xml;base64,',
    rdns: 'test.lants.wallet',
  };
  const announce = () => {
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({ info: info, provider: provider }),
    }));
  };
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
})();
"""

DEEP_CLICK = r"""
() => {
  const needle = 'LantsTest';
  const roots = [document];
  const seen = new Set();
  while (roots.length) {
    const root = roots.shift();
    const els = root.querySelectorAll('*');
    for (const el of els) {
      if (el.shadowRoot && !seen.has(el.shadowRoot)) {
        seen.add(el.shadowRoot);
        roots.push(el.shadowRoot);
      }
      const text = (el.textContent || '');
      const aria = (el.getAttribute && el.getAttribute('aria-label')) || '';
      if ((text.includes(needle) || aria.includes(needle)) &&
          typeof el.click === 'function') {
        el.click();
        return true;
      }
    }
  }
  return false;
}
"""

# Detect the Privy modal robustly. Privy renders into the page DOM with React
# (not necessarily shadow DOM) and may use an iframe container. We walk the
# document (descending into shadow roots too) looking for an element whose id or
# class contains "privy", an iframe whose src/title mentions privy, or visible
# login text such as "Connect wallet" / "Log in or sign up".
PRIVY_MODAL = r"""
() => {
  const roots = [document];
  const seen = new Set();
  const texts = [];
  while (roots.length) {
    const root = roots.shift();
    if (!root || seen.has(root)) continue;
    seen.add(root);
    let els;
    try {
      els = root.querySelectorAll('*');
    } catch (e) {
      continue;
    }
    for (const el of els) {
      const id = (el.id || '').toString().toLowerCase();
      const cls = (el.className && el.className.toString
                    ? el.className.toString() : '').toLowerCase();
      if (id.includes('privy') || cls.includes('privy')) return true;

      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'iframe') {
        const src = (el.getAttribute('src') || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();
        if (src.includes('privy') || title.includes('privy')) return true;
      }

      const dataTestId = (el.getAttribute &&
        (el.getAttribute('data-testid') || '')).toLowerCase();
      if (dataTestId.includes('privy')) return true;

      if (el.shadowRoot && !seen.has(el.shadowRoot)) {
        roots.push(el.shadowRoot);
      }
    }
  }
  const blob = (document.body ? document.body.innerText || '' : '')
    .toLowerCase();
  if (blob.includes('log in or sign up')) return true;
  if (blob.includes('connect wallet')) return true;
  return false;
}
"""

# Look for built-in Privy login methods (email input, social login buttons,
# "Continue with ..." text). Descends into shadow roots.
LOGIN_METHODS = r"""
() => {
  const roots = [document];
  const seen = new Set();
  const textParts = [];
  let hasEmailInput = false;

  while (roots.length) {
    const root = roots.shift();
    if (!root || seen.has(root)) continue;
    seen.add(root);
    let els;
    try {
      els = root.querySelectorAll('*');
    } catch (e) {
      continue;
    }
    for (const el of els) {
      if (el.tagName === 'INPUT') {
        const type = (el.getAttribute('type') || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        const ph = (el.getAttribute('placeholder') || '').toLowerCase();
        if (type === 'email' || name.includes('email') ||
            ph.includes('email')) {
          hasEmailInput = true;
        }
      }
      const aria = (el.getAttribute &&
                    el.getAttribute('aria-label')) || '';
      if (aria) textParts.push(aria);
      const text = (el.textContent || '').trim();
      if (text) textParts.push(text);
      if (el.shadowRoot && !seen.has(el.shadowRoot)) {
        roots.push(el.shadowRoot);
      }
    }
  }

  const blob = textParts.join('\n').toLowerCase();
  if (hasEmailInput) return true;
  if (blob.includes('continue with')) return true;
  if (blob.includes('email')) return true;

  const socials = ['google', 'apple', 'farcaster', 'discord',
                   'github', 'facebook', 'twitter'];
  const prefixes = ['continue with ', 'sign in with ', 'log in with ',
                    'login with '];
  for (const social of socials) {
    for (const prefix of prefixes) {
      if (blob.includes(prefix + social)) return true;
    }
  }
  return false;
}
"""


def main():
    handler = functools.partial(_QuietHandler, directory=SITE_DIR)
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    console_errors = []
    page_errors = []
    privy_modal = 0
    reqacc = 0
    calls_len = 0
    login_methods = 0
    hdr_addr = 0
    hdr_disc = 0

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()

            page.on(
                "console",
                lambda msg: console_errors.append(msg.text)
                if msg.type == "error"
                else None,
            )
            page.on("pageerror", lambda exc: page_errors.append(str(exc)))

            page.add_init_script(INIT_SCRIPT)

            page.goto(f"http://127.0.0.1:{PORT}/", wait_until="load")

            with contextlib.suppress(Exception):
                page.click("#hdr-connect")

            # Wait for the Privy modal to appear (React render + possible
            # iframe container), retrying the robust detector for a while.
            deadline = time.time() + 8
            while time.time() < deadline:
                with contextlib.suppress(Exception):
                    if page.evaluate(PRIVY_MODAL):
                        privy_modal = 1
                        break
                time.sleep(0.25)

            # Inspect for built-in login methods while the modal is open.
            deadline = time.time() + 5
            while time.time() < deadline:
                with contextlib.suppress(Exception):
                    if page.evaluate(LOGIN_METHODS):
                        login_methods = 1
                        break
                time.sleep(0.25)

            clicked = False
            with contextlib.suppress(Exception):
                clicked = page.evaluate(DEEP_CLICK)
            if not clicked:
                time.sleep(0.5)
                with contextlib.suppress(Exception):
                    clicked = page.evaluate(DEEP_CLICK)

            time.sleep(3)

            with contextlib.suppress(Exception):
                calls = page.evaluate("() => window.__calls || []")
                calls_len = len(calls)
                reqacc = sum(
                    1 for c in calls if c.get("method") == "eth_requestAccounts"
                )

            # After the LantsTest wallet is connected and the current summary
            # fields are computed, inspect the header connect button.
            hdr_text = ""
            with contextlib.suppress(Exception):
                hdr_text = page.evaluate(
                    "() => {"
                    " const el = document.getElementById('hdr-connect');"
                    " return el ? (el.textContent || '') : '';"
                    "}"
                )
            hdr_stripped = (hdr_text or "").strip()
            if hdr_stripped.startswith("0x0000") and "dEaD" in hdr_stripped:
                hdr_addr = 1

            # The Privy modal (#privy-modal-content) stays open and overlays
            # the header in headless Chromium, so a normal page.click is
            # intercepted. Trigger the disconnect click via JS instead.
            with contextlib.suppress(Exception):
                page.evaluate(
                    "document.getElementById('hdr-connect').click()"
                )

            deadline = time.time() + 6
            while time.time() < deadline:
                with contextlib.suppress(Exception):
                    hdr_now = page.evaluate(
                        "() => {"
                        " const el = document.getElementById('hdr-connect');"
                        " return el ? (el.textContent || '') : '';"
                        "}"
                    )
                    if (hdr_now or "").strip() == "Connect":
                        hdr_disc = 1
                        break
                time.sleep(0.25)

            context.close()
            browser.close()
    finally:
        httpd.shutdown()
        httpd.server_close()

    request_accounts = 1 if reqacc >= REQ_THRESHOLD else 0
    summary = (
        f"privy_modal={privy_modal} "
        f"provider_calls={calls_len} "
        f"request_accounts={request_accounts} "
        f"console_errors={len(console_errors)} "
        f"page_errors={len(page_errors)} "
        f"login_methods={login_methods}"
    )
    summary = f"{summary} hdr_addr={hdr_addr} hdr_disc={hdr_disc}"
    print(summary)
    print(summary, file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())