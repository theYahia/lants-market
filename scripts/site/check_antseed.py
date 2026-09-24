import sys, pathlib
html = pathlib.Path("site/index.html").read_text(encoding="utf-8")
sig = {}
sig["ms_link_site"]   = 1 if ('class="ms-link"' in html and 'https://antseed.com/' in html) else 0
sig["ms_link_x"]      = 1 if ('class="ms-link"' in html and 'https://x.com/AntSeed' in html) else 0
sig["foot_site"]      = html.count('foot-site')
sig["foot_x_ant"]     = html.count('foot-x-ant')
sig["foot_x"]         = 1 if 'https://x.com/TheTieTieTies' in html else 0
sig["antseed_count"]  = html.count('https://antseed.com/')
sig["antseedai_count"]= html.count('https://x.com/AntSeedAI')
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