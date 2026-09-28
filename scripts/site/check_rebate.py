#!/usr/bin/env python3
"""Rebate offers guard: schema, payout math, buyer scan, payout files, board and calculator.

Keys (one per code stage):
  rebate_schema      site/rebate.mjs validRebate() and offerState() on 18 cases
  rebate_math        rebatePayout() and rebateForSpend() equal the Python reference below on real spends
  rebate_scan        ONLINE  node site/rebate-scan.mjs 23 52894 51420000 51730000 -> the 52 buyers of Apex in epoch 23
  rebate_scan_split  offline mock RPC that refuses ranges over 1,000 blocks and fails each window once -> same buyers
  rebate_scan_pace   offline mock: "over rate limit" 4x on the first window, 1x on the others, and to requests < 200 ms apart
  rebate_view        ONLINE  rebate-payout.mjs --dry -> totalSpend = aggregate = 558971119, 52 buyers
  rebate_files       ONLINE  rebate-payout.mjs --offer --out -> JSON + CSV equal to the reference, no overwrite
  rebate_label       rebateLabel() / rebateLine() in site/rebate.mjs: the words of a rebate offer, by epoch state
  rebate_board_offers  the Offers section lists the rebate line next to the stake line
  rebate_board       the board and the Offers section show a rebate offer in words, by epoch state
  rebate_calc        the calculator shows "you get $Z back" for a pool with an active rebate offer

Run everything:        python scripts/site/check_rebate.py
Offline keys only:     python scripts/site/check_rebate.py --offline
One stage's key:       python scripts/site/check_rebate.py --only rebate_view   (others print 0, "not run")

The formula (plan ПЛАН-rebate-v1, fix 2), all integers in micro-USDC, floor division:
  buyers in `exclude` and buyers with spend < minSpend are dropped (listed in `excluded` with a reason);
  r_i = min(spend_i * pctBps / 10000, capPerBuyer);  if sum(r) > cap: p_i = r_i * cap / sum(r);  zero payouts dropped.

Module contract (site/rebate.mjs, pure ES module):
  validRebate(offer) -> boolean
      type === 'rebate'; pool = digits; epochs = array of exactly one integer; pctBps integer 1..5000;
      capUsdc number > 0; capPerBuyerUsdc optional number > 0; minSpendUsdc optional number >= 0;
      payer 0x + 40 hex; note optional string <= 140; usdcPer1k / capAnts must be absent.
  offerState(offer, displayEpoch) -> 'upcoming' | 'active' | 'ended'   (epochs[0] vs displayEpoch)
  rebatePayout(spends, offer, exclude) -> {payouts: {addr: BigInt}, excluded: {addr: reason}, total: BigInt, cut: boolean}
      spends: {address: BigInt | decimal string} (micro-USDC); exclude: {address: reason}; addresses compared lower-case;
      reason for a small spend is 'below_min_spend'. USDC -> micro: BigInt(Math.round(usdc * 1e6)).
  rebateForSpend(spendMicro, offer) -> BigInt   one buyer before the total cap: 0n below minSpend, else min(s*bps/10000, capPB)
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FIX = REPO / "site" / "fixtures" / "rebate"
APEX = "0x73b4c9335fa239f9c6df3d28d5bf5d3cdf4de736"
PAYER = "0x3d4cccfaa3b25997f4ab33f838558521259eef1b"
OWN = [a.lower() for a in json.loads((REPO / "site" / "own-addresses.json").read_text(encoding="utf-8"))["addresses"]]
T0 = "0xd8469404b4fcea354e3da6ebb8adc96ef1235e56d085663fdaedbe092ca3818c"

OFFER = {"type": "rebate", "pool": "52894", "epochs": [25], "pctBps": 300, "capUsdc": 10, "capPerBuyerUsdc": 2,
         "minSpendUsdc": 1, "payer": "0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B", "note": "test rebate"}


def micro(usdc):
    return int(round(usdc * 1e6))


def reference_payout(spends, offer, exclude):
    """The formula, independent of the JS module."""
    bps = offer["pctBps"]
    cap = micro(offer["capUsdc"])
    cap_pb = micro(offer["capPerBuyerUsdc"]) if offer.get("capPerBuyerUsdc") is not None else None
    min_spend = micro(offer["minSpendUsdc"]) if offer.get("minSpendUsdc") is not None else 0
    excl = {k.lower(): v for k, v in exclude.items()}
    r, excluded = {}, {}
    for a, s in spends.items():
        a, s = a.lower(), int(s)
        if a in excl:
            excluded[a] = excl[a]
            continue
        if s < min_spend:
            excluded[a] = "below_min_spend"
            continue
        v = s * bps // 10000
        if cap_pb is not None:
            v = min(v, cap_pb)
        if v > 0:
            r[a] = v
    total = sum(r.values())
    cut = total > cap
    if cut:
        r = {a: v * cap // total for a, v in r.items()}
        r = {a: v for a, v in r.items() if v > 0}
    return r, excluded, sum(r.values()), cut


def default_exclude(offer, seller):
    ex = {a: "own" for a in OWN}
    ex[seller.lower()] = "seller"
    ex[offer["payer"].lower()] = "payer"
    return ex


NODE_HARNESS = r"""
import { pathToFileURL } from 'node:url';
const m = await import(pathToFileURL(process.argv[1]).href);
const job = JSON.parse(process.argv[2]);
const ser = (k, v) => typeof v === 'bigint' ? v.toString() : v;
const out = [];
for (const c of job) {
  try {
    let r;
    if (c.fn === 'validRebate') r = m.validRebate(c.offer);
    else if (c.fn === 'offerState') r = m.offerState(c.offer, c.display);
    else if (c.fn === 'rebatePayout') r = m.rebatePayout(c.spends, c.offer, c.exclude);
    else if (c.fn === 'rebateForSpend') r = m.rebateForSpend(BigInt(c.spend), c.offer);
    else if (c.fn === 'rebateLabel') r = m.rebateLabel(c.offer, c.epoch);
    else if (c.fn === 'rebateLine') r = m.rebateLine(c.offer, c.epoch, c.names);
    out.push({ ok: true, r: JSON.parse(JSON.stringify(r, ser)), bigint: typeof r === 'bigint' });
  } catch (e) { out.push({ ok: false, err: String(e && e.message || e).slice(0, 160) }); }
}
console.log(JSON.stringify(out));
"""


def run_js(cases):
    r = subprocess.run(["node", "--input-type=module", "-e", NODE_HARNESS, str(REPO / "site" / "rebate.mjs"), json.dumps(cases)],
                       capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError("node harness exit %d: %s" % (r.returncode, (r.stderr or r.stdout)[-300:]))
    return json.loads(r.stdout.strip().splitlines()[-1])


def schema_cases():
    good = dict(OFFER)
    minimal = {k: OFFER[k] for k in ("type", "pool", "epochs", "pctBps", "capUsdc", "payer")}
    bad = [
        dict(OFFER, pctBps=2.5), dict(OFFER, pctBps=0), dict(OFFER, pctBps=5001), dict(OFFER, capUsdc=0),
        dict(OFFER, usdcPer1k=1), dict(OFFER, payer="0x3d4C"), dict(OFFER, note="x" * 141), dict(OFFER, type="stake"),
        {k: v for k, v in OFFER.items() if k != "type"}, dict(OFFER, epochs=[25, 26]), dict(OFFER, pool="abc"),
        dict(OFFER, capPerBuyerUsdc=-1), dict(OFFER, minSpendUsdc=-1),
    ]
    cases = [({"fn": "validRebate", "offer": good}, True), ({"fn": "validRebate", "offer": minimal}, True)]
    cases += [({"fn": "validRebate", "offer": b}, False) for b in bad]
    cases += [({"fn": "offerState", "offer": good, "display": d}, want) for d, want in ((24, "upcoming"), (25, "active"), (26, "ended"))]
    return cases


def main():
    offline = "--offline" in sys.argv
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    keys = ["rebate_schema", "rebate_math", "rebate_scan", "rebate_scan_split", "rebate_scan_pace", "rebate_view", "rebate_files", "rebate_label", "rebate_board_offers", "rebate_board", "rebate_calc"]
    checks = {k: [] for k in keys}
    reasons = []

    def record(key, why, ok):
        checks[key].append(bool(ok))
        if not ok:
            reasons.append(f"missing: {key}: {why}")

    def run_key(key):
        if only is not None and key not in only:
            reasons.append(f"missing: {key}: not run (--only)")
            return False
        return True

    def crash(key, exc):
        if isinstance(exc, StopIteration):
            return
        checks[key].append(False)
        reasons.append(f"{type(exc).__name__}: {key}: {str(exc).splitlines()[0][:200] if str(exc) else ''}")

    a23 = json.loads((FIX / "apex-23.spends.json").read_text(encoding="utf-8"))
    a24 = json.loads((FIX / "apex-24.spends.json").read_text(encoding="utf-8"))

    # ---- rebate_schema ----
    try:
        if not run_key("rebate_schema"):
            raise StopIteration
        cases = schema_cases()
        got = run_js([c for c, _ in cases])
        bad = [f"case {i}: {g.get('err') or g.get('r')!r} != {w!r}" for i, ((c, w), g) in enumerate(zip(cases, got)) if not g["ok"] or g["r"] != w]
        record("rebate_schema", f"{len(bad)} of {len(cases)} cases wrong, first: {bad[:2]}", not bad)
    except Exception as exc:
        crash("rebate_schema", exc)

    # ---- rebate_math ----
    try:
        if not run_key("rebate_math"):
            raise StopIteration
        jobs, wants = [], []
        o23 = {"type": "rebate", "pool": "52894", "epochs": [23], "pctBps": 500, "capUsdc": 10, "payer": OFFER["payer"]}
        for spends, offer in ((a24["spends"], OFFER), (a23["spends"], o23),
                              ({k.upper().replace("0X", "0x"): v for k, v in a24["spends"].items()}, OFFER)):
            ex = default_exclude(offer, APEX)
            jobs.append({"fn": "rebatePayout", "spends": spends, "offer": offer, "exclude": ex})
            p, e, t, cut = reference_payout(spends, offer, ex)
            wants.append({"payouts": {a: str(v) for a, v in p.items()}, "excluded": e, "total": str(t), "cut": cut})
        for spend, want in ((50_000_000, 1_500_000), (100_000_000, 2_000_000), (500_000, 0), (1_000_000, 30_000)):
            jobs.append({"fn": "rebateForSpend", "spend": str(spend), "offer": OFFER})
            wants.append(str(want))
        got = run_js(jobs)
        for i, (g, w) in enumerate(zip(got, wants)):
            if not g["ok"]:
                record("rebate_math", f"job {i} ({jobs[i]['fn']}) threw: {g['err']}", False)
                continue
            r = g["r"]
            if jobs[i]["fn"] == "rebateForSpend":
                record("rebate_math", f"rebateForSpend({jobs[i]['spend']}) = {r!r}, want {w} (BigInt)", r == w and g["bigint"])
                continue
            norm = {"payouts": {k.lower(): v for k, v in (r.get("payouts") or {}).items()},
                    "excluded": {k.lower(): v for k, v in (r.get("excluded") or {}).items()},
                    "total": r.get("total"), "cut": r.get("cut")}
            diff = [k for k in ("payouts", "excluded", "total", "cut") if norm[k] != w[k]]
            record("rebate_math", f"rebatePayout job {i}: {diff} differ; total {norm['total']} vs {w['total']}", not diff)
    except Exception as exc:
        crash("rebate_math", exc)

    # ---- rebate_label (text of a rebate offer, pure functions) ----
    try:
        if not run_key("rebate_label"):
            raise StopIteration
        no_pb = {k: v for k, v in OFFER.items() if k != "capPerBuyerUsdc"}
        jobs = [{"fn": "rebateLabel", "offer": OFFER, "epoch": 25}, {"fn": "rebateLabel", "offer": OFFER, "epoch": 24},
                {"fn": "rebateLabel", "offer": OFFER, "epoch": 26}, {"fn": "rebateLine", "offer": OFFER, "epoch": 25, "names": {"52894": "Apex"}},
                {"fn": "rebateLabel", "offer": no_pb, "epoch": 25}]
        got = run_js(jobs)
        txt = [str(g.get("r") if g["ok"] else "THREW " + g["err"]) for g in got]
        line = (got[3].get("r") or {}).get("line", "") if got[3]["ok"] and isinstance(got[3].get("r"), dict) else ""
        for i, needle in ((0, "3% back, up to $10"), (0, "max $2/buyer"), (1, "starts"), (2, "ended")):
            record("rebate_label", f"rebateLabel case {i} {txt[i]!r} lacks {needle!r}", needle in txt[i])
        for needle in ("Apex (pool 52894)", "3% back", OFFER["payer"]):
            record("rebate_label", f"rebateLine {line!r} lacks {needle!r}", needle in line)
        record("rebate_label", f"label without a per-buyer cap {txt[4]!r} mentions 'max' or 'undefined'", "undefined" not in txt[4] and "max $" not in txt[4] and "3% back" in txt[4])
    except Exception as exc:
        crash("rebate_label", exc)

    # ---- rebate_scan_split (offline mock RPC) ----
    try:
        if not run_key("rebate_scan_split"):
            raise StopIteration
        win = json.loads((FIX / "logs-e23-window.json").read_text(encoding="utf-8"))
        failed_once = set()
        requests = []

        class Mock(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))) or b"{}")
                batch = body if isinstance(body, list) else [body]
                out = []
                for q in batch:
                    m, p = q.get("method"), q.get("params") or []
                    if m == "eth_chainId":
                        out.append({"jsonrpc": "2.0", "id": q.get("id"), "result": "0x2105"})
                    elif m == "eth_blockNumber":
                        out.append({"jsonrpc": "2.0", "id": q.get("id"), "result": hex(win["toBlock"] + 1000)})
                    elif m == "eth_getLogs":
                        f = p[0]
                        fb, tb = int(f["fromBlock"], 16), int(f["toBlock"], 16)
                        requests.append((fb, tb))
                        if tb - fb + 1 > 1000:
                            out.append({"jsonrpc": "2.0", "id": q.get("id"), "error": {"code": -32614, "message": "eth_getLogs is limited to a 1,000 range"}})
                            continue
                        if fb not in failed_once:
                            failed_once.add(fb)
                            self.send_response(503)
                            self.end_headers()
                            return
                        topics = f.get("topics") or []
                        logs = [x for x in win["logs"] if fb <= int(x["blockNumber"], 16) <= tb
                                and (not topics or x["topics"][0] == topics[0])
                                and (len(topics) < 2 or topics[1] is None or x["topics"][1] == topics[1])]
                        out.append({"jsonrpc": "2.0", "id": q.get("id"), "result": logs})
                    else:
                        out.append({"jsonrpc": "2.0", "id": q.get("id"), "error": {"code": -32601, "message": "not in mock"}})
                data = json.dumps(out if isinstance(body, list) else out[0]).encode()
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        srv = HTTPServer(("127.0.0.1", 0), Mock)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            env = dict(os.environ, RPC_URL=f"http://127.0.0.1:{srv.server_port}")
            r = subprocess.run(["node", "site/rebate-scan.mjs", "23", "52894", str(win["fromBlock"]), str(win["toBlock"])],
                               cwd=REPO, capture_output=True, text=True, timeout=180, env=env)
        finally:
            srv.shutdown()
        record("rebate_scan_split", f"rebate-scan exit {r.returncode}: {(r.stderr or '')[-200:]}", r.returncode == 0)
        if r.returncode == 0:
            out = json.loads(r.stdout)
            want = sorted(b.lower() for b in win["expectedBuyers"])
            record("rebate_scan_split", f"buyers {len(out.get('buyers', []))}, want {len(want)}", sorted(b.lower() for b in out.get("buyers", [])) == want)
            record("rebate_scan_split", "no window was split below 1,000 blocks", any(tb - fb + 1 <= 1000 for fb, tb in requests))
            record("rebate_scan_split", f"sellers {out.get('sellers')}, want [{APEX}]", [s.lower() for s in out.get("sellers", [])] == [APEX])
    except Exception as exc:
        crash("rebate_scan_split", exc)

    # ---- rebate_scan_pace (offline mock RPC that rate-limits like mainnet.base.org) ----
    try:
        if not run_key("rebate_scan_pace"):
            raise StopIteration
        import time as _t
        win = json.loads((FIX / "logs-e23-window.json").read_text(encoding="utf-8"))
        limited = {}
        last = [0.0]
        stats = {"too_fast": 0, "limited": 0}

        class Pace(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                q = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))) or b"{}")
                m, p = q.get("method"), q.get("params") or []
                now = _t.monotonic()
                gap, last[0] = now - last[0], now
                if m == "eth_chainId":
                    res = {"result": "0x2105"}
                elif m == "eth_blockNumber":
                    res = {"result": hex(win["toBlock"] + 1000)}
                elif m == "eth_getLogs":
                    f = p[0]
                    fb, tb = int(f["fromBlock"], 16), int(f["toBlock"], 16)
                    if gap < 0.2:
                        stats["too_fast"] += 1
                        res = {"error": {"code": -32016, "message": "over rate limit"}}
                    elif limited.get(fb, 0) < (4 if fb == win["fromBlock"] else 1):  # a real limit lasts several tries
                        limited[fb] = limited.get(fb, 0) + 1
                        stats["limited"] += 1
                        res = {"error": {"code": -32016, "message": "over rate limit"}}
                    else:
                        res = {"result": [x for x in win["logs"] if fb <= int(x["blockNumber"], 16) <= tb and x["topics"][0] == f["topics"][0]]}
                else:
                    res = {"error": {"code": -32601, "message": "not in mock"}}
                data = json.dumps(dict(jsonrpc="2.0", id=q.get("id"), **res)).encode()
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        srv = HTTPServer(("127.0.0.1", 0), Pace)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            env = dict(os.environ, RPC_URL=f"http://127.0.0.1:{srv.server_port}")
            r = subprocess.run(["node", "site/rebate-scan.mjs", "23", "52894", str(win["fromBlock"]), str(win["toBlock"])],
                               cwd=REPO, capture_output=True, text=True, timeout=300, env=env)
        finally:
            srv.shutdown()
        record("rebate_scan_pace", f"rebate-scan gave up under 'over rate limit' (exit {r.returncode}): {(r.stderr or '')[-160:]}", r.returncode == 0)
        if r.returncode == 0:
            out = json.loads(r.stdout)
            record("rebate_scan_pace", "buyers differ from the window fixture", sorted(b.lower() for b in out.get("buyers", [])) == sorted(b.lower() for b in win["expectedBuyers"]))
        record("rebate_scan_pace", f"{stats['too_fast']} getLogs requests came less than 200 ms after the previous one", stats["too_fast"] == 0)
    except Exception as exc:
        crash("rebate_scan_pace", exc)

    # ---- online keys ----
    online = [k for k in ("rebate_scan", "rebate_view", "rebate_files") if not offline and run_key(k)]
    if offline:
        for k in ("rebate_scan", "rebate_view", "rebate_files"):
            reasons.append(f"missing: {k}: skipped (--offline)")
    if online:
        try:
            if "rebate_scan" not in online:
                raise StopIteration
            r = subprocess.run(["node", "site/rebate-scan.mjs", "23", "52894", "51420000", "51730000"], cwd=REPO,
                               capture_output=True, text=True, timeout=900)
            record("rebate_scan", f"rebate-scan exit {r.returncode}: {(r.stderr or '')[-200:]}", r.returncode == 0)
            if r.returncode == 0:
                out = json.loads(r.stdout)
                want = sorted(a23["spends"])
                record("rebate_scan", f"buyers {len(out.get('buyers', []))}, want {len(want)}", sorted(b.lower() for b in out.get("buyers", [])) == want)
        except Exception as exc:
            crash("rebate_scan", exc)
        base = ["node", "site/rebate-payout.mjs", "--epoch", "23", "--pool", "52894", "--from", "51420000", "--to", "51730000", "--pin", a23["pinBlock"]]
        try:
            if "rebate_view" not in online:
                raise StopIteration
            r = subprocess.run(base + ["--dry"], cwd=REPO, capture_output=True, text=True, timeout=900)
            record("rebate_view", f"--dry exit {r.returncode}: {(r.stderr or '')[-200:]}", r.returncode == 0)
            if r.returncode == 0:
                out = json.loads(r.stdout)
                record("rebate_view", f"totalSpend {out.get('totalSpend')} / aggregate {out.get('aggregate')}, want {a23['aggregate']}",
                       str(out.get("totalSpend")) == a23["aggregate"] == str(out.get("aggregate")))
                record("rebate_view", f"buyers {out.get('buyers')}, want {len(a23['spends'])}", out.get("buyers") == len(a23["spends"]))
        except Exception as exc:
            crash("rebate_view", exc)
        tmp = Path(tempfile.mkdtemp())
        try:
            if "rebate_files" not in online:
                raise StopIteration
            offer = dict(OFFER, epochs=[23])
            (tmp / "offer.json").write_text(json.dumps(offer), encoding="utf-8")
            args = base + ["--offer", str(tmp / "offer.json"), "--out", str(tmp)]
            r = subprocess.run(args, cwd=REPO, capture_output=True, text=True, timeout=900)
            record("rebate_files", f"exit {r.returncode}: {(r.stderr or '')[-200:]}", r.returncode == 0)
            jf, cf = tmp / "23-52894.json", tmp / "23-52894.csv"
            record("rebate_files", "no 23-52894.json / .csv in --out", jf.exists() and cf.exists())
            if jf.exists() and cf.exists():
                j = json.loads(jf.read_text(encoding="utf-8"))
                p, e, t, cut = reference_payout(a23["spends"], offer, default_exclude(offer, APEX))
                for f in ("epoch", "pool", "pinBlock", "commit", "formula", "payouts", "excluded", "total"):
                    record("rebate_files", f"JSON lacks {f!r}", f in j)
                record("rebate_files", "pinBlock is not the one passed", str(j.get("pinBlock")) == a23["pinBlock"])
                record("rebate_files", "commit is not a 40-hex git hash", isinstance(j.get("commit"), str) and len(j["commit"]) == 40)
                record("rebate_files", "formula does not state 'pctBps / 10000'", "pctBps / 10000" in str(j.get("formula")))
                got = {k.lower(): str(v) for k, v in (j.get("payouts") or {}).items()}
                record("rebate_files", f"payouts differ from the reference (total {j.get('total')} vs {t})",
                       got == {a: str(v) for a, v in p.items()} and str(j.get("total")) == str(t))
                rows = [ln.split(",") for ln in cf.read_text(encoding="utf-8").strip().splitlines()]
                body = rows[1:] if rows and rows[0][0].lower() == "address" else rows
                record("rebate_files", "CSV sum differs from JSON total", sum(int(x[1]) for x in body) == t)
                before = jf.read_bytes()
                r2 = subprocess.run(args, cwd=REPO, capture_output=True, text=True, timeout=900)
                record("rebate_files", "a second run overwrote the payout file or exited 0", r2.returncode != 0 and jf.read_bytes() == before)
        except Exception as exc:
            crash("rebate_files", exc)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # ---- page keys ----
    page_keys = [k for k in ("rebate_board_offers", "rebate_board", "rebate_calc") if run_key(k)]
    try:
        if not page_keys:
            raise StopIteration
        sys.path.insert(0, str(Path(__file__).parent.resolve()))
        import e2e_fork_trade as e2e
        from check_incentives_v2 import compose_snapshot, LIVE_URLS
        from playwright.sync_api import sync_playwright

        snap = json.dumps(compose_snapshot()).encode()
        stake = json.loads((REPO / "site" / "offers.json").read_text(encoding="utf-8"))
        offers = [json.dumps(stake + [dict(OFFER, epochs=[e])]).encode() for e in (25, 26, 24)]
        cur = [offers[0]]
        port = e2e.start_http_server()
        try:
            with sync_playwright() as p:
                b = p.chromium.launch()

                def open_page(tag):
                    ctx = b.new_context(viewport={"width": 1280, "height": 900})

                    def route(r):
                        u = r.request.url
                        if u.startswith("http://127.0.0.1:"):
                            return r.continue_()
                        if any(u.startswith(x) for x in LIVE_URLS):
                            return r.fulfill(status=200, content_type="application/json", body=snap)
                        if "offers.json" in u:
                            return r.fulfill(status=200, content_type="application/json", body=cur[0])
                        return r.continue_()
                    ctx.route("**/*", route)
                    pg = ctx.new_page()
                    pg.set_default_timeout(5000)
                    pg.goto(f"http://127.0.0.1:{port}/index.html?r={tag}#incentives")
                    pg.wait_for_load_state("networkidle")
                    pg.wait_for_selector("#incentives tr.board-row", timeout=15000)
                    pg.wait_for_timeout(400)
                    return pg

                def offer_cell(pg):
                    heads = pg.locator("#incentives table.inc-board-table thead th")
                    idx = next(i for i in range(heads.count()) if heads.nth(i).inner_text().strip().lower().startswith("offer"))
                    return " ".join(pg.locator('#incentives tr.board-row[data-pool="52894"] td').nth(idx).inner_text().split())

                try:
                    if "rebate_board_offers" not in page_keys:
                        raise StopIteration
                    sect = open_page("offers").locator("#incentives .inc-offers").inner_text()
                    record("rebate_board_offers", "Offers section lacks a '3% back' line", "3% back" in sect)
                    record("rebate_board_offers", "the stake offer line disappeared", "USDC per 1,000 ANTS" in sect)
                except Exception as exc:
                    crash("rebate_board_offers", exc)

                try:
                    if "rebate_board" not in page_keys:
                        raise StopIteration
                    pg = open_page("active")
                    cell = offer_cell(pg)
                    record("rebate_board", f"52894 Offer cell {cell!r} lacks '3% back, up to $10'", "3% back, up to $10" in cell)
                    record("rebate_board", f"52894 Offer cell {cell!r} lacks 'max $2/buyer'", "max $2/buyer" in cell)
                    sect = pg.locator("#incentives .inc-offers").inner_text()
                    record("rebate_board", "Offers section lacks a '3% back' line", "3% back" in sect)
                    record("rebate_board", "the stake offer line disappeared", "USDC per 1,000 ANTS" in sect)
                    for tag, want in (("upcoming", "starts"), ("ended", "ended")):
                        cur[0] = offers[1] if tag == "upcoming" else offers[2]
                        c2 = offer_cell(open_page(tag)).lower()
                        record("rebate_board", f"{tag} rebate: Offer cell {c2!r} lacks {want!r}", want in c2)
                    cur[0] = offers[0]
                except Exception as exc:
                    crash("rebate_board", exc)

                try:
                    if "rebate_calc" not in page_keys:
                        raise StopIteration
                    pg = open_page("calc")
                    pg.locator("#incentives .inc-calc select").first.select_option("52894")
                    pg.wait_for_timeout(300)
                    spend = pg.locator("#inc-calc-spend")
                    record("rebate_calc", "no #inc-calc-spend input for a pool with an active rebate", spend.count() == 1 and spend.is_visible())
                    if spend.count() == 1:
                        for val, want in (("50", "$1.50 back"), ("100", "$2.00 back"), ("0.5", "minimum spend $1")):
                            spend.fill(val)
                            pg.wait_for_timeout(250)
                            txt = pg.locator("#incentives .inc-calc").inner_text()
                            record("rebate_calc", f"spend {val}: calculator lacks {want!r}", want in txt)
                    pg.locator("#incentives .inc-calc select").first.select_option("44694")
                    pg.wait_for_timeout(300)
                    sp = pg.locator("#inc-calc-spend")
                    record("rebate_calc", "the spend input stays for a pool without a rebate", sp.count() == 0 or not sp.is_visible())
                except Exception as exc:
                    crash("rebate_calc", exc)
                b.close()
        finally:
            e2e.stop_all()
    except Exception as exc:
        crash("rebate_board_offers", exc)
        crash("rebate_board", exc)
        crash("rebate_calc", exc)

    ok_all = True
    for k in keys:
        v = 1 if checks[k] and all(checks[k]) else 0
        ok_all = ok_all and v == 1
        print(f"{k}={v}")
    for r in reasons:
        print("reason=" + r)
    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main())
