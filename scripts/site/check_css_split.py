import sys, pathlib
idx = pathlib.Path("site/index.html").read_text(encoding="utf-8")
css_path = pathlib.Path("site/app.css")
css = css_path.read_text(encoding="utf-8") if css_path.exists() else ""
build = pathlib.Path("scripts/site/build-dist.mjs").read_text(encoding="utf-8")
sig = {}
sig["style_tags"] = idx.count("<style")
sig["link_css"] = 1 if '<link rel="stylesheet" href="app.css">' in idx else 0
sig["css_braces"] = css.count("}")
sig["css_exists"] = 1 if css_path.exists() else 0
n = len(idx.encode("utf-8"))
sig["index_size_ok"] = 1 if 5000 < n < 20480 else 0
sig["files_has_css"] = 1 if "site/app.css" in build else 0
for k, v in sig.items():
    print(str(k) + "=" + str(v))
ok = True
args = sys.argv[1:]
i = 0
while i < len(args):
    if args[i] == "--expect" and i + 1 < len(args):
        k, _, v = args[i + 1].partition("=")
        if str(sig.get(k)) != v:
            print("MISMATCH " + k + " expected=" + v + " got=" + str(sig.get(k)))
            ok = False
        i += 2
    else:
        i += 1
sys.exit(0 if ok else 1)