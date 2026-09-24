import sys, pathlib, re
p = pathlib.Path("site/docs.html")
sig = {}
if not p.exists():
    sig = {"docs_exists": 0, "docs_headings": 0, "docs_tables": 0, "docs_nav": 0,
           "docs_cyrillic": 0, "docs_external": 0, "docs_in_manifest": 0, "docs_link_on_site": 0}
else:
    h = p.read_text(encoding="utf-8")
    sig["docs_exists"] = 1
    sig["docs_headings"] = len(re.findall(r"<h[123][ >]", h))
    sig["docs_tables"] = h.count("<table>")
    sig["docs_nav"] = len(re.findall(r'<a href="#[a-z-]+"', h))
    sig["docs_cyrillic"] = 1 if re.search(r"[\u0400-\u04FF]", h) else 0
    sig["docs_external_assets"] = len(re.findall(r'src="https?://', h)) + len(re.findall(r'<link[^>]+href="https?://', h))
    sig["docs_external_links"] = len(re.findall(r'<a [^>]*href="https?://', h))
    build = pathlib.Path("scripts/site/build-dist.mjs").read_text(encoding="utf-8")
    sig["docs_in_manifest"] = 1 if "site/docs.html" in build else 0
    idx = pathlib.Path("site/index.html").read_text(encoding="utf-8")
    sig["docs_link_on_site"] = 1 if "docs.html" in idx else 0
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