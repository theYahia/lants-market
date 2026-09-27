"""Guard: every view has an address (#market, #listings, #portfolio, #incentives), Back works, no empty Offers sub-tab.

Prints nav_urls=1 or nav_urls=0 plus reason=<first failure>.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import e2e_fork_trade as e2e  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


def main():
    port = e2e.start_http_server()
    base = f"http://127.0.0.1:{port}/index.html"
    fails = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            page = b.new_page(viewport={"width": 1280, "height": 900})
            page.goto(base, wait_until="domcontentloaded")
            page.wait_for_timeout(1000)

            def expect(cond, why):
                if not cond:
                    fails.append(why)

            hash_ = lambda: page.evaluate("location.hash")
            visible = lambda sel: page.locator(sel).first.is_visible()
            page.click('a.hdr-link[href="#incentives"]')
            expect(hash_() == "#incentives" and visible("#incentives"), "incentives click: " + hash_())
            page.click('a.hdr-link[href="#portfolio"]')
            expect(hash_() == "#portfolio" and visible("#portfolio"), "portfolio click: " + hash_())
            page.go_back()
            page.wait_for_timeout(300)
            expect(hash_() == "#incentives" and visible("#incentives"), "back: " + hash_())
            page.click('a.hdr-link[href="#tabs"]')
            expect(hash_() == "#market" and visible("#tabs"), "market click: " + hash_())
            page.click('.tab[data-tab="listings"]')
            expect(hash_() == "#listings", "listings click: " + hash_())
            page.goto(base + "?r=direct#listings", wait_until="domcontentloaded")
            page.wait_for_timeout(800)
            active = page.evaluate("""() => [document.querySelector('.tab[data-tab="listings"]')?.classList.contains('is-active'),
                document.querySelector('.panel[data-panel="listings"]')?.classList.contains('is-open')]""")
            expect(active == [True, True], f"direct #listings: {active}")
            expect(page.locator('.tab[data-tab="offers"], .panel[data-panel="offers"]').count() == 0, "empty Offers sub-tab still present")
            b.close()
    finally:
        e2e.stop_all()
    print(f"nav_urls={0 if fails else 1}")
    if fails:
        print(f"reason={fails[0]}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
