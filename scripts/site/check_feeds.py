#!/usr/bin/env python3
import sys, re, pathlib

HTML = pathlib.Path("site/index.html").read_text(encoding="utf-8")

def has_panel(name):
    return re.search(r'data-panel="%s"' % name, HTML) is not None

signals = {}
signals["page_alive"] = 1 if (has_panel("listings") and has_panel("offers")) else 0
signals["listings_empty"] = 1 if 'data-empty="listings"' in HTML else 0
signals["offers_placeholder"] = 1 if 'data-empty="offers"' in HTML else 0

for k, v in signals.items():
    print("%s=%d" % (k, v))

ok = True
args = sys.argv[1:]
i = 0
while i < len(args):
    a = args[i]
    if a == "--expect":
        i += 1
        a = args[i] if i < len(args) else ""
    elif a.startswith("--expect="):
        a = a.split("=", 1)[1]
    else:
        i += 1
        continue
    if "=" in a:
        key, val = a.split("=", 1)
        if str(signals.get(key)) != val:
            print("MISMATCH %s expected=%s got=%s" % (key, val, signals.get(key)))
            ok = False
    i += 1

sys.exit(0 if ok else 1)