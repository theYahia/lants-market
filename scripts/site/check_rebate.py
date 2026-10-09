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
  rebate_issue_form  the 'Post an offer' GitHub issue body has the rebate fields next to the stake ones
  rebate_calc_style  the spend input looks like the other calculator fields (dark, >= 16px text, >= 40px tall)
  rebate_calc        the calculator shows "you get $Z back" for a pool with an active rebate offer
  rebate_claim_tree  the claim tree over the reference payouts: independent Python keccak root, sums and caps
  rebate_claim_state the claim state machine (site/rebate-claim-state.mjs) on fixed fixtures
  rebate_claim_ui    the claim panel on a fixture: statuses, buttons, tree/root trust checks (Playwright)

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
  rebatePayout(spends, offer, exclude, stakeByPersona?, personaOf?) -> {payouts: {addr: BigInt}, excluded: {addr: reason}, total: BigInt, cut: boolean}
      spends: {address: BigInt | decimal string} (micro-USDC); exclude: {address: reason}; addresses compared lower-case;
      reason for a small spend is 'below_min_spend', for a persona over its slot 'stake_gate';
      persona gate (offer.stakeGate): buyers grouped by persona (personaOf or the buyer), each persona admits
      floor(stakeByPersona[p] / minStakeAnts) buyers ranked by spend desc (tie: addr asc). USDC -> micro: BigInt(Math.round(usdc * 1e6)).
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


def reference_payout(spends, offer, exclude, stake_by_persona=None, persona_of=None):
    """The formula (persona stake gate included), independent of the JS module."""
    bps = offer["pctBps"]
    cap = micro(offer["capUsdc"])
    cap_pb = micro(offer["capPerBuyerUsdc"]) if offer.get("capPerBuyerUsdc") is not None else None
    min_spend = micro(offer["minSpendUsdc"]) if offer.get("minSpendUsdc") is not None else 0
    gate = offer.get("stakeGate") or {}
    min_stake = int(gate["minStakeAnts"]) * 10**18 if gate.get("minStakeAnts") is not None else 0
    if min_stake > 0 and (stake_by_persona is None or persona_of is None):
        raise ValueError("reference_payout: stakeGate offer needs stake_by_persona/persona_of")
    excl = {k.lower(): v for k, v in exclude.items()}
    excluded, candidates = {}, []
    for a, s in spends.items():
        a, s = a.lower(), int(s)
        if a in excl:
            excluded[a] = excl[a]
            continue
        if s < min_spend:
            excluded[a] = "below_min_spend"
            continue
        p = (persona_of or {}).get(a, a).lower()
        candidates.append((a, s, p))
    admitted = []
    if min_stake > 0:
        by_persona = {}
        for c in candidates:
            by_persona.setdefault(c[2], []).append(c)
        for p, group in by_persona.items():
            group.sort(key=lambda c: (-c[1], c[0]))
            k = int(stake_by_persona.get(p, "0")) // min_stake
            for i, c in enumerate(group):
                if i < k:
                    admitted.append(c)
                else:
                    excluded[c[0]] = "stake_gate"
    else:
        admitted = candidates
    r = {}
    for a, s, _ in admitted:
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


# ---- independent keccak-256 (no third-party deps) and merkle helpers ----

_KECCAK_MASK = (1 << 64) - 1
_KECCAK_RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]
_KECCAK_ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14]


def _rotl64(x, n):
    x &= _KECCAK_MASK
    if n == 0:
        return x
    return ((x << n) | (x >> (64 - n))) & _KECCAK_MASK


def _keccak_permute(a):
    for rnd in range(24):
        c = [a[x] ^ a[x + 5] ^ a[x + 10] ^ a[x + 15] ^ a[x + 20] for x in range(5)]
        for x in range(5):
            d = c[(x + 4) % 5] ^ _rotl64(c[(x + 1) % 5], 1)
            for y in range(5):
                a[x + 5 * y] = (a[x + 5 * y] ^ d) & _KECCAK_MASK
        b = [0] * 25
        for x in range(5):
            for y in range(5):
                b[y + 5 * ((2 * x + 3 * y) % 5)] = _rotl64(a[x + 5 * y], _KECCAK_ROT[x + 5 * y])
        for x in range(5):
            for y in range(5):
                a[x + 5 * y] = b[x + 5 * y] ^ ((~b[(x + 1) % 5 + 5 * y]) & _KECCAK_MASK & b[(x + 2) % 5 + 5 * y])
        a[0] ^= _KECCAK_RC[rnd]
    return a


def keccak256(data: bytes) -> bytes:
    rate = 136
    padded = bytearray(data)
    padded.append(0x01)
    while len(padded) % rate != 0:
        padded.append(0)
    padded[-1] ^= 0x80
    a = [0] * 25
    for off in range(0, len(padded), rate):
        for i in range(rate // 8):
            a[i] ^= int.from_bytes(padded[off + i * 8: off + i * 8 + 8], "little")
        _keccak_permute(a)
    return b"".join(a[i].to_bytes(8, "little") for i in range(4))


def tree_leaf(index: int, account: str, amount: int) -> bytes:
    return keccak256(index.to_bytes(32, "big") + bytes.fromhex(account.lower().replace("0x", "")) + amount.to_bytes(32, "big"))


def tree_root(leaves: list) -> bytes:
    level = list(leaves)
    while len(level) > 1:
        nxt = []
        for i in range(0, len(level), 2):
            if i + 1 < len(level):
                pair = sorted([level[i], level[i + 1]])
                nxt.append(keccak256(pair[0] + pair[1]))
            else:
                nxt.append(level[i])
        level = nxt
    return level[0]


def tree_process_proof(proof: list, leaf: bytes) -> bytes:
    h = leaf
    for p in proof:
        h = keccak256(min(h, p) + max(h, p))
    return h


def tree_build(payouts: dict) -> dict:
    """Independent builder with the canonical convention (sorted leaves, sorted pairs, odd lift)."""
    entries = sorted(((a.lower(), int(v)) for a, v in payouts.items() if int(v) > 0), key=lambda x: x[0])
    level = [tree_leaf(i, a, v) for i, (a, v) in enumerate(entries)]
    root = tree_root(level)
    leaves = []
    for i, (a, v) in enumerate(entries):
        proof, cur, idx = [], level, i
        while len(cur) > 1:
            peer = idx + 1 if idx % 2 == 0 else idx - 1
            if peer < len(cur):
                proof.append(cur[peer])
            nxt = []
            for j in range(0, len(cur), 2):
                if j + 1 < len(cur):
                    pair = sorted([cur[j], cur[j + 1]])
                    nxt.append(keccak256(pair[0] + pair[1]))
                else:
                    nxt.append(cur[j])
            cur, idx = nxt, idx // 2
        leaves.append({"index": i, "account": a, "amount": str(v), "proof": ["0x" + p.hex() for p in proof]})
    return {"root": "0x" + root.hex(), "total": str(sum(v for _, v in entries)), "leaves": leaves}


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
    else if (c.fn === 'rebatePayout') r = m.rebatePayout(c.spends, c.offer, c.exclude, c.stake, c.persona);
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


NODE_HARNESS_CLAIM = r"""
import { pathToFileURL } from 'node:url';
const treeMod = await import(pathToFileURL(process.argv[1]).href);
const stateMod = await import(pathToFileURL(process.argv[2]).href);
const job = JSON.parse(process.argv[3]);
const ser = (k, v) => typeof v === 'bigint' ? v.toString() : v;
const out = [];
for (const c of job) {
  try {
    let r;
    if (c.fn === 'buildRebateTree') r = treeMod.buildRebateTree(c.payouts);
    else if (c.fn === 'claimState') r = stateMod.claimState(c.args);
    else if (c.fn === 'statusText') r = stateMod.statusText(c.state, c.info);
    out.push({ ok: true, r: JSON.parse(JSON.stringify(r, ser)) });
  } catch (e) { out.push({ ok: false, err: String(e && e.message || e).slice(0, 200) }); }
}
console.log(JSON.stringify(out));
"""


def run_js_claim(cases):
    r = subprocess.run(
        ["node", "--input-type=module", "-e", NODE_HARNESS_CLAIM,
         str(REPO / "site" / "rebate-tree.mjs"), str(REPO / "site" / "rebate-claim-state.mjs"), json.dumps(cases)],
        capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError("claim harness exit %d: %s" % (r.returncode, (r.stderr or r.stdout)[-300:]))
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
    keys = ["rebate_schema", "rebate_math", "rebate_scan", "rebate_scan_split", "rebate_scan_pace", "rebate_view", "rebate_files", "rebate_label", "rebate_board_offers", "rebate_board", "rebate_calc", "rebate_calc_style", "rebate_issue_form", "rebate_claim_tree", "rebate_claim_state", "rebate_claim_ui"]
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
        # persona stake gate: the JS and Python references must agree, and the
        # numbers must pin the semantics (k = floor(stake / minStakeAnts), ranked by spend)
        big, small = "0x" + "b1" * 20, "0x" + "b2" * 20
        solo, op = "0x" + "b3" * 20, "0x" + "d1" * 20
        gated = dict(OFFER, epochs=[23], minSpendUsdc=1, capPerBuyerUsdc=2, stakeGate={"minStakeAnts": 100})
        g_spends = {big: "100000000", small: "50000000", solo: "40000000"}
        g_stake = {op: str(100 * 10**18), solo: str(300 * 10**18)}
        g_persona = {big: op, small: op, solo: solo}
        g_ex = {APEX: "seller", OFFER["payer"].lower(): "payer"}
        jobs.append({"fn": "rebatePayout", "spends": g_spends, "offer": gated, "exclude": g_ex,
                     "stake": g_stake, "persona": g_persona})
        p, e, t, cut = reference_payout(g_spends, gated, g_ex, g_stake, g_persona)
        wants.append({"payouts": {a: str(v) for a, v in p.items()}, "excluded": e, "total": str(t), "cut": cut})
        gate_key = len(jobs) - 1
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
            if i == gate_key:
                record("rebate_math", f"gate: one slot admits only the bigger spend of the shared operator: {norm['payouts']}",
                       norm["payouts"].get(big) == "2000000" and small not in norm["payouts"] and norm["payouts"].get(solo) == "1200000")
                record("rebate_math", f"gate: small buyer excluded with stake_gate, got {norm['excluded'].get(small)}",
                       norm["excluded"].get(small) == "stake_gate")
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

    # ---- rebate_claim_tree (offline: JS tree vs independent Python keccak) ----
    try:
        if not run_key("rebate_claim_tree"):
            raise StopIteration
        record("rebate_claim_tree", "python keccak self-check failed",
               keccak256(b"abc").hex() == "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45")
        offer = dict(OFFER, epochs=[23])
        ex = default_exclude(offer, APEX)
        p, _, t, _ = reference_payout(a23["spends"], offer, ex)
        payouts = {a: str(v) for a, v in p.items()}
        got = run_js_claim([{"fn": "buildRebateTree", "payouts": payouts}])
        record("rebate_claim_tree", "buildRebateTree threw: %s" % got[0].get("err"), got[0]["ok"])
        if got[0]["ok"]:
            tree = got[0]["r"]
            entries = sorted(((a.lower(), int(v)) for a, v in payouts.items()), key=lambda x: x[0])
            leaves = [tree_leaf(i, a, v) for i, (a, v) in enumerate(entries)]
            root = tree_root(leaves)
            record("rebate_claim_tree", "JS root %s != python root 0x%s" % (tree["root"], root.hex()),
                   tree["root"].lower() == "0x" + root.hex())
            record("rebate_claim_tree", "JS total %s != python sum %d" % (tree["total"], t), int(tree["total"]) == t)
            record("rebate_claim_tree", "total %s above cap %d" % (tree["total"], micro(offer["capUsdc"])),
                   int(tree["total"]) <= micro(offer["capUsdc"]))
            cap_pb = micro(offer["capPerBuyerUsdc"])
            over = [l for l in tree["leaves"] if int(l["amount"]) > cap_pb]
            record("rebate_claim_tree", "%d leaves above the per-buyer cap" % len(over), not over)
            banned = set(ex) | set(OWN) | {APEX, offer["payer"].lower()}
            in_leaves = [l["account"] for l in tree["leaves"] if l["account"].lower() in banned]
            record("rebate_claim_tree", "excluded addresses in leaves: %s" % in_leaves[:3], not in_leaves)
            record("rebate_claim_tree", "leaf indices are not the sorted positions",
                   [l["index"] for l in tree["leaves"]] == list(range(len(tree["leaves"]))))
            bad = []
            for l in tree["leaves"]:
                leaf = tree_leaf(l["index"], l["account"], int(l["amount"]))
                proof = [bytes.fromhex(x.replace("0x", "")) for x in l["proof"]]
                if tree_process_proof(proof, leaf).hex() != tree["root"].replace("0x", "").lower():
                    bad.append(l["index"])
            record("rebate_claim_tree", "proofs fail for indices %s" % bad[:5], not bad)
    except Exception as exc:
        crash("rebate_claim_tree", exc)

    # ---- rebate_claim_state (offline: the UI state machine on fixtures) ----
    try:
        if not run_key("rebate_claim_state"):
            raise StopIteration
        ZERO = "0x" + "00" * 32
        ROOT = "0x" + "ab" * 32
        camp = {"owner": "0x" + "11" * 20, "pendingOwner": "0x" + "00" * 20,
                "cancelDeadline": 1000, "finalizeDeadline": 261200, "claimWindow": 1209600,
                "epochId": 27, "poolId": "52894", "root": ZERO, "total": 0,
                "funded": 20000000, "claimed": 0, "sweepAfter": 0}
        cases = [
            ({"now": 500, "epochStart": 1000, "epochEnd": 2000, "campaign": None, "tree": None}, "awaiting_launch"),
            ({"now": 1500, "epochStart": 1000, "epochEnd": 2000, "campaign": None, "tree": None}, "not_funded_expired"),
            ({"now": 500, "epochStart": 1000, "epochEnd": 2000, "campaign": camp, "tree": None}, "funded"),
            ({"now": 300000, "epochStart": 1000, "epochEnd": 2000, "campaign": camp, "tree": None}, "no_eligible_buyers"),
            ({"now": 300000, "epochStart": 1000, "epochEnd": 2000,
              "campaign": camp, "tree": {"root": ROOT}}, "not_finalized_expired"),
            ({"now": 300000, "epochStart": 1000, "epochEnd": 2000,
              "campaign": dict(camp, root=ROOT, total=500, sweepAfter=500000), "tree": {"root": ROOT}}, "claims_open"),
            ({"now": 300000, "epochStart": 1000, "epochEnd": 2000,
              "campaign": dict(camp, root=ROOT, total=500, sweepAfter=500000), "tree": {"root": "0x" + "cd" * 32}}, "root_mismatch"),
            ({"now": 300000, "epochStart": 1000, "epochEnd": 2000,
              "campaign": dict(camp, root=ROOT, total=500, sweepAfter=500000), "tree": None}, "no_tree"),
            ({"now": 600000, "epochStart": 1000, "epochEnd": 2000,
              "campaign": dict(camp, root=ROOT, total=500, sweepAfter=500000), "tree": {"root": ROOT}}, "sweepable"),
        ]
        got = run_js_claim([{"fn": "claimState", "args": c} for c, _ in cases])
        for i, ((_, want), g) in enumerate(zip(cases, got)):
            record("rebate_claim_state", "case %d: %s" % (i, g.get("err") or (g.get("r") or {}).get("state")),
                   g["ok"] and g["r"]["state"] == want)
        texts = run_js_claim([
            {"fn": "statusText", "state": "claims_open", "info": {"sweepAfter": 1792662861}},
            {"fn": "statusText", "state": "root_mismatch", "info": None},
            {"fn": "statusText", "state": "not_funded_expired", "info": None},
        ])
        record("rebate_claim_state", "statusText claims_open", texts[0]["ok"] and "claims open" in texts[0]["r"] and "claim by 2026-10-22" in texts[0]["r"])
        record("rebate_claim_state", "statusText root_mismatch", texts[1]["ok"] and "root mismatch" in texts[1]["r"])
        record("rebate_claim_state", "statusText not funded", texts[2]["ok"] and "not funded" in texts[2]["r"])
    except Exception as exc:
        crash("rebate_claim_state", exc)

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
    page_keys = [k for k in ("rebate_board_offers", "rebate_board", "rebate_calc", "rebate_calc_style", "rebate_issue_form") if run_key(k)]
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
                    if "rebate_issue_form" not in page_keys:
                        raise StopIteration
                    import urllib.parse as _up
                    href = open_page("form").locator("#incentives a.inc-post-offer").first.get_attribute("href") or ""
                    body = _up.unquote(_up.parse_qs(_up.urlparse(href).query).get("body", [""])[0])
                    for needle in ("Type: stake | rebate", "pctBps", "capUsdc", "capPerBuyerUsdc", "minSpendUsdc", "USDC per 1,000 ANTS", "Payer"):
                        record("rebate_issue_form", f"the 'Post an offer' issue body lacks {needle!r}", needle in body)
                except Exception as exc:
                    crash("rebate_issue_form", exc)

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
                    if "rebate_calc" not in page_keys and "rebate_calc_style" not in page_keys:
                        raise StopIteration
                    pg = open_page("calc")
                    pg.locator("#incentives .inc-calc select").first.select_option("52894")
                    pg.wait_for_timeout(300)
                    spend = pg.locator("#inc-calc-spend")
                    record("rebate_calc", "no #inc-calc-spend input for a pool with an active rebate", spend.count() == 1 and spend.is_visible())
                    if "rebate_calc_style" in page_keys:
                        if spend.count() == 1 and spend.is_visible():
                            st = spend.evaluate("el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).fontSize]")
                            h = spend.bounding_box()["height"]
                            record("rebate_calc_style", f"#inc-calc-spend background {st[0]} is white (the other fields are dark)", st[0].lower() != "rgb(255, 255, 255)")
                            record("rebate_calc_style", f"#inc-calc-spend font-size {st[1]} < 16px", float(st[1].replace("px", "") or 0) >= 16)
                            record("rebate_calc_style", f"#inc-calc-spend height {h:.0f}px < 40px", h >= 40)
                        else:
                            record("rebate_calc_style", "no visible #inc-calc-spend to style", False)
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
                    crash("rebate_calc_style", exc)
                b.close()
        finally:
            e2e.stop_all()
    except Exception as exc:
        crash("rebate_board_offers", exc)
        crash("rebate_board", exc)
        crash("rebate_calc", exc)

    # ---- rebate_claim_ui (offline: claim panel on fixtures, mocked RPC/wallet) ----
    try:
        if not run_key("rebate_claim_ui"):
            raise StopIteration
        sys.path.insert(0, str(Path(__file__).parent.resolve()))
        import e2e_fork_trade as e2e
        from check_incentives_v2 import compose_snapshot, LIVE_URLS
        from playwright.sync_api import sync_playwright

        CLAIMS = "0x" + "5c" + "11" * 19
        FAKE_CODE = "0x6001600155"
        HASH = "0x" + keccak256(bytes.fromhex(FAKE_CODE.replace("0x", ""))).hex()
        BUYER = "0x" + "b0" * 20
        ZERO32 = "0x" + "00" * 32
        ROOT_AB = "0x" + "ab" * 32
        SWEEP_FAR = 4102444800

        def _w(x):
            if isinstance(x, str):
                return x.lower().replace("0x", "").rjust(64, "0")
            return format(x, "064x")

        def enc_campaign(c):
            pool = c["poolId"].encode()
            tail = _w(len(pool)) + pool.hex().ljust(64, "0") if pool else _w(0)
            head = "".join(_w(c[k]) for k in (
                "owner", "pendingOwner", "cancelDeadline", "finalizeDeadline", "claimWindow", "epochId",
            )) + _w(12 * 32) + "".join(_w(c[k]) for k in ("root", "total", "funded", "claimed", "sweepAfter"))
            return "0x" + head + tail

        tree_a = tree_build({BUYER: 500000, "0x" + "b1" * 20: 250000})
        tree_bad = json.loads(json.dumps(tree_a))
        tree_bad["leaves"][0]["proof"] = [ROOT_AB]

        camp_a = {"owner": OFFER["payer"], "pendingOwner": "0x" + "00" * 20, "cancelDeadline": 1792058061,
                  "finalizeDeadline": 1792922061, "claimWindow": 1209600, "epochId": 27, "poolId": "52894",
                  "root": tree_a["root"], "total": int(tree_a["total"]), "funded": 20000000, "claimed": 0,
                  "sweepAfter": SWEEP_FAR}
        camp_b = dict(camp_a, poolId="44694", root=ROOT_AB, total=500000)
        camp_c = dict(camp_a, poolId="99999", root=tree_a["root"], total=int(tree_a["total"]))

        E28 = 1792662861  # 2026-10-22T09:54:21Z
        params_launch = {"chainId": 8453, "epochId": 28, "poolId": "11111", "amountMicro": "10000000",
                         "amountUsdc": 10, "payer": OFFER["payer"], "cancelDeadline": E28,
                         "finalizeDeadline": E28 + 7 * 86400 + 72 * 3600, "claimWindow": 1209600,
                         "claimWindowDays": 14, "authorizationType": "RebateCampaignAuthorization"}

        def reb_offer(pool, epoch):
            return dict(OFFER, pool=pool, epochs=[epoch], note="claim ui fixture")

        os.chdir(REPO)  # a previous page key leaves the cwd inside site/
        offers_ui = [
            {"pool": "44694", "epochs": [25], "usdcPer1k": 1, "capAnts": 10000,
             "payer": "0x3d4CCcfAA3B25997F4ab33f838558521259Eef1B", "pays": "new", "note": "stake fixture"},
            reb_offer("52894", 27), reb_offer("44694", 27), reb_offer("99999", 27), reb_offer("11111", 28),
        ]
        files = {
            "rebate-claims.json": {"address": CLAIMS, "chainId": 8453, "runtimeCodeHash": HASH,
                                   "initCodeHash": HASH, "deployBlock": 51990000},
            "rebates/27-52894.tree.json": tree_a,
            "rebates/27-52894.campaign.json": {"campaignId": 1},
            "rebates/27-44694.tree.json": tree_a,
            "rebates/27-44694.campaign.json": {"campaignId": 2},
            "rebates/27-99999.tree.json": tree_bad,
            "rebates/27-99999.campaign.json": {"campaignId": 3},
            "rebates/28-11111.campaign-params.json": params_launch,
        }
        campaigns = {1: camp_a, 2: camp_b, 3: camp_c}
        seen_claim_calls = []

        def rpc_result(method, params):
            if method == "eth_chainId":
                return "0x2105"
            if method == "eth_blockNumber":
                return hex(52000000)
            if method == "eth_getCode":
                return FAKE_CODE
            if method == "eth_getLogs":
                return []
            if method == "eth_call":
                to = str(params[0].get("to", "")).lower()
                data = str(params[0].get("data", ""))
                if to == CLAIMS.lower():
                    sel = data[:10]
                    if sel == "0x89a30271":
                        return "0x" + _w("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")
                    if sel == "0xccd39037":
                        return enc_campaign(campaigns[int(data[10:], 16)])
                    if sel == "0x5d4df3bf":
                        seen_claim_calls.append(data)
                        return "0x"
                return "0x"
            return None

        port = e2e.start_http_server()
        try:
            with sync_playwright() as p:
                b = p.chromium.launch()
                ctx = b.new_context(viewport={"width": 1280, "height": 900})
                ctx.add_init_script(
                    "window.ethereum = { request: async ({method}) => {"
                    " if (method === 'eth_accounts' || method === 'eth_requestAccounts') return ['%s'];"
                    " if (method === 'eth_chainId') return '0x2105';"
                    " if (method === 'eth_sendTransaction') return '0x' + 'ab'.repeat(32);"
                    " if (method === 'eth_getTransactionReceipt') return { status: '0x1', transactionHash: '0x' + 'ab'.repeat(32) };"
                    " return null; } };" % BUYER
                )

                def route(r):
                    u = r.request.url
                    rel = u.split("/")[-1].split("?")[0]
                    if any(u.startswith(x) for x in LIVE_URLS):
                        return r.fulfill(status=200, content_type="application/json", body=json.dumps(compose_snapshot()))
                    if "offers.json" in u:
                        return r.fulfill(status=200, content_type="application/json", body=json.dumps(offers_ui))
                    for name, body in files.items():
                        if rel == name.split("/")[-1]:
                            return r.fulfill(status=200, content_type="application/json", body=json.dumps(body))
                    if "mainnet.base.org" in u or "blastapi" in u:
                        q = json.loads(r.request.post_data or "{}")
                        res = {"jsonrpc": "2.0", "id": q.get("id")}
                        out = rpc_result(q.get("method"), q.get("params") or [])
                        if out is None:
                            return r.fulfill(status=200, content_type="application/json",
                                             body=json.dumps(dict(res, error={"code": -32601, "message": "not mocked"})))
                        return r.fulfill(status=200, content_type="application/json", body=json.dumps(dict(res, result=out)))
                    return r.continue_()

                ctx.route("**/*", route)
                pg = ctx.new_page()
                pg.set_default_timeout(10000)
                pg.goto(f"http://127.0.0.1:{port}/index.html?r=claim#incentives")
                pg.wait_for_selector(".inc-claims .inc-claim", timeout=20000)
                pg.wait_for_timeout(1200)

                def block_for(pool):
                    for blk in pg.locator(".inc-claims .inc-claim").all():
                        if ("pool %s" % pool) in blk.inner_text():
                            return blk
                    return None

                a = block_for("52894")
                record("rebate_claim_ui", "no claim block for pool 52894", a is not None)
                if a is not None:
                    txt = " ".join(a.inner_text().split())
                    record("rebate_claim_ui", "52894 status lacks 'claims open': %s" % txt[:120], "claims open" in txt)
                    record("rebate_claim_ui", "52894 lacks the Claim button", a.locator("button", has_text="Claim $0.50").count() == 1)
                    a.locator("button", has_text="Claim $0.50").click()
                    try:
                        a.locator("span.inc-claim-msg", has_text="confirmed").first.wait_for(timeout=15000)
                    except Exception:
                        pass
                    record("rebate_claim_ui", "claim click did not confirm: %s" % a.inner_text()[:160],
                           "confirmed" in a.inner_text())
                    record("rebate_claim_ui", "no claim calldata with the canonical selector was sent", bool(seen_claim_calls))

                bblk = block_for("44694")
                record("rebate_claim_ui", "no claim block for pool 44694", bblk is not None)
                if bblk is not None:
                    txt = " ".join(bblk.inner_text().split())
                    record("rebate_claim_ui", "44694 status lacks 'root mismatch': %s" % txt[:120], "root mismatch" in txt)
                    record("rebate_claim_ui", "44694 still shows a Claim button", bblk.locator("button", has_text="Claim").count() == 0)

                cblk = block_for("99999")
                record("rebate_claim_ui", "no claim block for pool 99999", cblk is not None)
                if cblk is not None:
                    txt = " ".join(cblk.inner_text().split())
                    record("rebate_claim_ui", "99999 lacks the local tree-verification warning: %s" % txt[:120],
                           "failed local verification" in txt)

                dblk = block_for("11111")
                record("rebate_claim_ui", "no claim block for pool 11111", dblk is not None)
                if dblk is not None:
                    txt = " ".join(dblk.inner_text().split())
                    record("rebate_claim_ui", "11111 status lacks 'awaiting launch': %s" % txt[:120], "awaiting launch" in txt)
                    record("rebate_claim_ui", "11111 lacks the Launch & fund button", dblk.locator("button", has_text="Launch & fund").count() == 1)
                b.close()
        finally:
            e2e.stop_all()
    except Exception as exc:
        crash("rebate_claim_ui", exc)

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
