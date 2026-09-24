#!/usr/bin/env python3
"""Check that the .soon-panel aside stays sticky within the viewport.

Mirrors scripts/site/check_privy.py: launch chromium at 1280x900, open the
All positions tab, scroll down, then measure the last .soon-panel bounding box.
Prints sticky_ok=1 when its top is within the viewport, else sticky_ok=0.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

SITE_DIR = Path(__file__).resolve().parents[2] / "site"
INDEX = SITE_DIR / "index.html"


def main() -> int:
    url = INDEX.as_uri()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto(url)

        # Open the "All positions" tab.
        try:
            page.get_by_role("tab", name="All positions").click()
        except Exception:
            try:
                page.get_by_text("All positions", exact=False).first.click()
            except Exception:
                pass

        page.wait_for_timeout(200)

        # Scroll the window down so the sticky aside has room to travel.
        page.evaluate("window.scrollTo(0, 900)")
        page.wait_for_timeout(200)

        panel = page.locator(".soon-panel").last
        box = panel.bounding_box()
        if box is None:
            print("sticky_ok=0")
            browser.close()
            return 1

        viewport_height = page.viewport_size["height"]
        top = box["y"]
        sticky_ok = 1 if 0 <= top <= viewport_height else 0
        print(f"sticky_ok={sticky_ok}")

        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())