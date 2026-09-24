import sys, pathlib
src = pathlib.Path("site/enrich-snapshot.mjs").read_text(encoding="utf-8")
sales = pathlib.Path("site/enrich-sales.mjs").read_text(encoding="utf-8")
sig = {}
sig["named_call"] = 1 if "callStaking('stakerBudget')" in src else 0
sig["named_abi"] = 1 if "function stakerBudget() view returns" in src else 0
sig["raw_call"] = 1 if "method: 'eth_call'" in src else 0
sig["all_pools"] = 1 if "pools_with_sales=" in src else 0
sig["old_pool_block"] = 1 if "if (!(String(agentId) in poolWeightByEpoch))" in src else 0
sig["provenance"] = 1 if ("snapshotBlock" in src and "snapshotEpoch" in src) else 0
sig["sales_budget_override"] = 1 if "100100" in sales else 0
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