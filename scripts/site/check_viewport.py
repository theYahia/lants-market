import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

def main() -> None:
    # Default viewport width
    width = int(sys.argv[1]) if len(sys.argv) > 1 else 390
    height = 844

    # Resolve the path to site/index.html
    index_path = Path(__file__).resolve().parents[2] / "site" / "index.html"
    if not index_path.is_file():
        raise FileNotFoundError(f"Cannot find {index_path}")

    url = index_path.as_uri()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": width, "height": height})
        page = context.new_page()
        page.goto(url, wait_until="networkidle")
        overflow = page.evaluate(
            """() => {
                const el = document.documentElement;
                return el.scrollWidth - el.clientWidth;
            }"""
        )
        # Ensure integer output
        overflow = int(overflow)
        if overflow <= 0:
            print("overflow=0")
        else:
            print(f"overflow={overflow}")

        context.close()
        browser.close()


if __name__ == "__main__":
    main()