#!/usr/bin/env python3
"""Check cancellation-related signals in market config/view files."""
import os
import sys

EXPECTED_FILES = [
    "scripts/site/check_cancel.py",
    "scripts/site/check_feeds.py"
]

def read_file(path):
    """Read file content as utf-8."""
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def compute_signals(market_config, market_view):
    """Compute all signals from file contents."""
    signals = {}
    
    # selector_ok: '0xa7faa28e' present in market-config.mjs
    signals['selector_ok'] = 1 if '0xa7faa28e' in market_config else 0
    
    # placeholder_gone: '0x????????' NOT present in market-config.mjs
    signals['placeholder_gone'] = 0 if '0x????????' in market_config else 1
    
    # two_args: encAddr(nftCollection) + encUint(nftId) present
    two_args_pattern = 'encAddr(nftCollection)' in market_config and 'encUint(nftId)' in market_config
    signals['two_args'] = 1 if two_args_pattern else 0
    
    # call_fixed: cancelNftListings(MARKET.nft, item.nftId) present in market-view.mjs
    signals['call_fixed'] = 1 if 'cancelNftListings(MARKET.nft, item.nftId)' in market_view else 0
    
    # ru_text_gone: '\u0421\u043d\u044f\u0442\u044c' NOT present in market-view.mjs
    signals['ru_text_gone'] = 0 if '\u0421\u043d\u044f\u0442\u044c' in market_view else 1
    
    return signals

def main():
    if len(sys.argv) < 2:
        print("Usage: check_cancel.py [--expect KEY=VAL ...]")
        return 1
    
    # Parse expected values
    expect = {}
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == '--expect':
            i += 1
            while i < len(sys.argv) and not sys.argv[i].startswith('--'):
                if '=' in sys.argv[i]:
                    key, val = sys.argv[i].split('=', 1)
                    expect[key] = val
                i += 1
        else:
            i += 1
    
    # Read files
    base_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(base_dir, '..', '..', 'site', 'market-config.mjs')
    view_path = os.path.join(base_dir, '..', '..', 'site', 'market-view.mjs')
    
    try:
        market_config = read_file(config_path)
        market_view = read_file(view_path)
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    
    # Compute signals
    signals = compute_signals(market_config, market_view)
    
    # Print signals
    for key in sorted(signals):
        print(f"{key}={signals[key]}")
    
    # Check expectations
    for key, val in expect.items():
        if key not in signals or str(signals[key]) != val:
            print("MISMATCH")
            return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())