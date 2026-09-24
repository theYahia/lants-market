#!/usr/bin/env python3
"""
Check header/footer docs link counts in site/index.html.

Reads site/index.html (relative to this script's parent directory),
counts occurrences of "Docs" links inside the <header> block and inside
the <footer> block.

Expected counts may be supplied via repeated --expect KEY=VALUE arguments,
where KEY is one of 'hdr_docs' or 'foot_docs'. Additionally, foot_docs is
always required to be >= 1.

Exit code 0 only if all provided expectations match and the foot_docs
requirement is satisfied.
"""

import argparse
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SITE_DIR = SCRIPT_DIR.parent.parent / "site"  # site/ is sibling of scripts/
INDEX_FILE = SITE_DIR / "index.html"


def extract_block_counts(html: str) -> dict[str, int]:
    """
    Return {'hdr_docs': int, 'foot_docs': int} counts of "Docs" links
    inside the header block and footer block.
    If a block is not found, counts will be 0.
    """
    # Header block: <header> ... </header>
    header_pattern = re.compile(
        r'<header[^>]*>(.*?)</header>',
        re.DOTALL | re.IGNORECASE
    )
    header_match = header_pattern.search(html)
    header_content = header_match.group(1) if header_match else ""

    # Footer block: <footer> ... </footer>
    footer_pattern = re.compile(
        r'<footer[^>]*>(.*?)</footer>',
        re.DOTALL | re.IGNORECASE
    )
    footer_match = footer_pattern.search(html)
    footer_content = footer_match.group(1) if footer_match else ""

    # Count "docs.html" links: pattern for <a ... href="...docs.html..."> 
    link_pattern = re.compile(
        r'<a\b[^>]*href="[^"]*docs\.html[^"]*"[^>]*>',
        re.IGNORECASE
    )

    hdr_docs = len(link_pattern.findall(header_content))
    foot_docs = len(link_pattern.findall(footer_content))

    return {"hdr_docs": hdr_docs, "foot_docs": foot_docs}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate header/footer Docs link counts in site/index.html"
    )
    parser.add_argument(
        "--expect",
        action="append",
        metavar="KEY=VAL",
        default=[],
        help="Expected value, e.g. --expect hdr_docs=2 (repeatable)"
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not INDEX_FILE.is_file():
        print(f"ERROR: {INDEX_FILE} not found", file=sys.stderr)
        return 1

    try:
        html = INDEX_FILE.read_text(encoding="utf-8")
    except Exception as e:
        print(f"ERROR: cannot read {INDEX_FILE}: {e}", file=sys.stderr)
        return 1

    counts = extract_block_counts(html)

    # Print signals as required
    print(f"hdr_docs={counts['hdr_docs']}")
    print(f"foot_docs={counts['foot_docs']}")

    # Validate provided expectations
    ok = True

    # Parse expectations
    expected = {}
    for item in args.expect:
        if "=" not in item:
            print(f"ERROR: invalid --expect format '{item}' (expected KEY=VALUE)", file=sys.stderr)
            ok = False
            continue
        key, val = item.split("=", 1)
        key = key.strip()
        val = val.strip()
        if key not in ("hdr_docs", "foot_docs"):
            print(f"ERROR: unknown key '{key}' in --expect (only hdr_docs or foot_docs)", file=sys.stderr)
            ok = False
            continue
        try:
            expected[key] = int(val)
        except ValueError:
            print(f"ERROR: non-integer value '{val}' for key '{key}'", file=sys.stderr)
            ok = False

    # Compare
    for key, val in expected.items():
        if counts[key] != val:
            print(f"MISMATCH: {key}={counts[key]} (expected {val})", file=sys.stderr)
            ok = False

    # Internal requirement: foot_docs >= 1
    if counts["foot_docs"] < 1:
        print(f"ERROR: foot_docs={counts['foot_docs']} must be >= 1", file=sys.stderr)
        ok = False

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())