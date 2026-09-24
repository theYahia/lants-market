import sys, pathlib
root = pathlib.Path(".")
sig = {}
sig["forecast_script"] = 1 if (root / "scripts/site/forecast.mjs").exists() else 0
sig["verify_script"] = 1 if (root / "scripts/site/verify.mjs").exists() else 0
sig["forecast_fixture"] = 1 if (root / "site/fixtures/forecast-e23.json").exists() else 0
build = (root / "scripts/site/build-dist.mjs").read_text(encoding="utf-8")
sig["files_has_forecast"] = 1 if "forecast" in build else 0
hits = 0
for p in list(root.glob("scripts/**/*.mjs")) + list(root.glob("site/**/*.mjs")):
    if ".bak" in p.name:
        continue
    if "Math.random" in p.read_text(encoding="utf-8"):
        hits += 1
        print("random_in=" + str(p).replace("\\", "/"))
sig["random_files"] = hits
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