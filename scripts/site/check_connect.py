import sys,argparse
p=argparse.ArgumentParser();p.add_argument('--expect',action='append',default=[])
a=p.parse_args()
html=open('site/index.html',encoding='utf-8').read()
view=open('site/market-view.mjs',encoding='utf-8').read()
sig={}
sig['hdr_button']=1 if 'id="hdr-connect"' in html else 0
sig['view_binds']=1 if "getElementById('hdr-connect')" in view else 0
sig['dead_id']=view.count("getElementById('market-connect')")
sig['connect_wired']=1 if sig['hdr_button'] and sig['view_binds'] and sig['dead_id']==0 else 0
for k,v in sig.items():print("%s=%s" % (k,v))
ok=True
for e in a.expect:
    k,v=e.split('=');ok=ok and str(sig.get(k))==v
sys.exit(0 if ok else 1)