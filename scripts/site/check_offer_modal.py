#!/usr/bin/env python3
"""Playwright guard for checking the offer modal window.

Runs as a regular Python script, opens a test page and checks:
1. Clicking the first .ms-offer opens .offer-modal (offer_modal_open=visible/none)
2. Escape closes .offer-modal (offer_modal_close=hidden/shown)

Only two signal lines are printed to stdout, one per line.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# Path to repository root — script resides in scripts/site/, go up two levels
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SITE_INDEX = REPO_ROOT / "site" / "index.html"

# Selectors
OFFER_SELECTOR = ".ms-offer"
MODAL_SELECTOR = ".offer-modal"


def main() -> None:
    """Main store logic."""
    # Prepare output: two signal lines
    open_signal = "offer_modal_open=none"
    close_signal = "offer_modal_close=shown"

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            # Load the page (using file:// or http://localhost, depending on what's available)
            if SITE_INDEX.exists():
                page.goto(SITE_INDEX.as_uri())
            else:
                # If index.html is missing, try localhost (in case the server is running)
                page.goto("http://localhost:8000")
                page.wait_for_load_state("networkidle")

            # Wait for the offer element to appear
            try:
                page.wait_for_selector(OFFER_SELECTOR, timeout=10000)

                # Click the first offer
                page.click(OFFER_SELECTOR)

                # Check if the modal appeared
                modal = page.locator(MODAL_SELECTOR)
                if modal.count() > 0 and modal.first.is_visible():
                    open_signal = "offer_modal_open=visible"
                else:
                    open_signal = "offer_modal_open=none"

                # Press Escape
                page.keyboard.press("Escape")

                # Check if the modal disappeared
                if modal.count() > 0:
                    if modal.first.is_hidden():
                        close_signal = "offer_modal_close=hidden"
                    else:
                        close_signal = "offer_modal_close=shown"
                else:
                    close_signal = "offer_modal_close=shown"

            except PlaywrightTimeoutError:
                # If .ms-offer did not appear -> no modal
                open_signal = "offer_modal_open=none"
                close_signal = "offer_modal_close=shown"

            browser.close()

    except Exception:
        # Any other error — assume the modal is absent
        open_signal = "offer_modal_open=none"
        close_signal = "offer_modal_close=shown"

    # Output only two signal lines
    print(open_signal)
    print(close_signal)


if __name__ == "__main__":
    main()