#!/usr/bin/env python3
"""Online guard for the buyer-cashback inputs in the snapshot (key inc_cashback_data).

Runs the real CI step `node site/enrich-snapshot.mjs` (two RPCs, pinned block), then reads the
same values itself with raw eth_call at the snapshot's block and compares. Restores the tracked
fixture afterwards. Needs network; the offline page checks live in check_incentives_v2.py.

Contract (see check_incentives_v2.py): usageByEpoch[h] for h = e-1, e with buyerBudget, sellerBudget,
totalWeightedBuyerPoints, poolWeights{pool: w > 0}; maxRewardShareBps, starterGrantsLeft,
starterInitEndEpoch - all decimal strings.

Run: python scripts/site/check_usage_live.py   (prints inc_cashback_data=0/1 and reason= lines)
"""

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
TRACKED = REPO / "site" / "fixtures" / "snapshot-e23.live.json"
RPCS = ["https://base-rpc.publicnode.com", "https://mainnet.base.org"]

USAGE_REWARDS = "0x78330bF154172F1137219Bb559d4F3A270B3201F"
ACCOUNTING = "0xAdd2D85316153D7bfaF7921EE9Bf1Bb6c7A1cBc9"
POOLS = "0x8Bf4d39AA13F3CB03F87D9500767fBc4D0940652"
GRANT = "0xB68AD13b681319fcEB6b0A640c2fd96C0138CBc8"
# 4-byte selectors (viem toFunctionSelector)
SEL = {
    "buyerEpochBudget": "0x4b319e39",
    "sellerEpochBudget": "0x14667c97",
    "totalWeightedBuyerPointsByEpoch": "0x2be44c9c",
    "poolWeightAtEpoch": "0x5c50b757",
    "MAX_REWARD_SHARE_BPS": "0x93e6f153",
    "remainingInits": "0x5f7e1619",
    "initEndEpoch": "0x69e1a312",
}


def call(to, sel, args, block):
    """eth_call at the pinned block; public RPCs rate-limit (403/429), so retry with a pause and a second RPC."""
    data = SEL[sel] + "".join(f"{int(a):064x}" for a in args)
    req = {"jsonrpc": "2.0", "id": 1, "method": "eth_call", "params": [{"to": to, "data": data}, hex(int(block))]}
    last = None
    for attempt in range(6):
        url = RPCS[attempt % len(RPCS)]
        try:
            r = urllib.request.Request(url, json.dumps(req).encode(), {"content-type": "application/json", "user-agent": "lants-guard/1.0"})
            with urllib.request.urlopen(r, timeout=30) as resp:
                out = json.load(resp)
            if "result" in out:
                time.sleep(0.1)
                return str(int(out["result"], 16))
            last = RuntimeError(str(out.get("error"))[:200])
        except (urllib.error.URLError, TimeoutError) as exc:
            last = exc
        time.sleep(1.5 * (attempt + 1))
    raise last


def main():
    checks, reasons = [], []

    def record(why, ok):
        checks.append(bool(ok))
        if not ok:
            reasons.append("missing: " + why)

    backup = TRACKED.read_bytes()
    try:
        r = subprocess.run(["node", "site/enrich-snapshot.mjs"], cwd=REPO, capture_output=True, text=True, timeout=600)
        record(f"enrich-snapshot exit {r.returncode}: {(r.stderr or r.stdout)[-300:]}", r.returncode == 0)
        out = json.loads(TRACKED.read_text(encoding="utf-8"))
        block, e = out["snapshotBlock"], int(out["epoch"])
        usage = out.get("usageByEpoch") or {}
        record(f"usageByEpoch keys {sorted(usage)}, want {[str(e - 1), str(e)]}", sorted(usage) == sorted([str(e - 1), str(e)]))
        for h in (e - 1, e):
            u = usage.get(str(h), {})
            for field, to, sel in [("buyerBudget", USAGE_REWARDS, "buyerEpochBudget"),
                                   ("sellerBudget", USAGE_REWARDS, "sellerEpochBudget"),
                                   ("totalWeightedBuyerPoints", ACCOUNTING, "totalWeightedBuyerPointsByEpoch")]:
                want = call(to, sel, [h], block)
                record(f"usageByEpoch[{h}].{field} = {u.get(field)!r}, chain {want}", u.get(field) == want)
            weights = u.get("poolWeights") or {}
            pools = sorted({str(p["agentId"]) for p in out.get("positions", [])})
            bad = []
            for pool in pools:
                want = call(POOLS, "poolWeightAtEpoch", [pool, h], block)
                got = weights.get(pool, "0")
                if got != want:
                    bad.append(f"{pool}: {got} vs {want}")
            record(f"usageByEpoch[{h}].poolWeights differ from chain for {len(bad)} pools: {bad[:3]}", not bad)
            record(f"usageByEpoch[{h}].poolWeights keeps zero weights", all(v != "0" for v in weights.values()))
        for field, to, sel in [("maxRewardShareBps", USAGE_REWARDS, "MAX_REWARD_SHARE_BPS"),
                               ("starterGrantsLeft", GRANT, "remainingInits"),
                               ("starterInitEndEpoch", GRANT, "initEndEpoch")]:
            want = call(to, sel, [], block)
            record(f"{field} = {out.get(field)!r}, chain {want}", out.get(field) == want)
        record("salesByPool lost", bool(out.get("salesByPool")))
    except Exception as exc:
        checks.append(False)
        reasons.append(f"{type(exc).__name__}: {str(exc).splitlines()[0][:200]}")
    finally:
        TRACKED.write_bytes(backup)

    ok = bool(checks) and all(checks)
    print(f"inc_cashback_data={1 if ok else 0}")
    for r in reasons:
        print("reason=" + r)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
