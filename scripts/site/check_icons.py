import pathlib, sys
from playwright.sync_api import sync_playwright

url = pathlib.Path('site/index.html').resolve().as_uri()
BAD_COLORS = {'rgb(0,0,238)', 'rgb(0,0,255)'}
ok = True
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto(url)
    els = pg.query_selector_all('.ms-link svg')
    if not els:
        print('icon_none width_px=0 color=none')
        b.close()
        print('icons_bad')
        sys.exit(1)
    for i, el in enumerate(els):
        box = el.bounding_box()
        w = box['width'] if box else 0.0
        color = el.evaluate('e => getComputedStyle(e).color')
        print('icon%d width_px=%.1f color=%s' % (i, w, color))
        if not (8 <= w <= 40):
            ok = False
        if color.replace(' ', '') in BAD_COLORS:
            ok = False
    b.close()
print('icons_ok' if ok else 'icons_bad')
sys.exit(0 if ok else 1)