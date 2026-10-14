import json, os
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data")

data = json.load(open(os.path.join(DATA, "clubs_2026_27.json")))
os.makedirs(os.path.join(DATA, "crests"), exist_ok=True)

def lum(hex_):
    r, g, b = (int(hex_[i:i+2], 16) / 255 for i in (1, 3, 5))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

def text_color(bg, *cands):
    for c in cands:
        if contrast(bg, c) >= 3:
            return c
    return "#000000" if lum(bg) > 0.4 else "#FFFFFF"

SHAPES = {
    "shield": "M10 8 H110 V62 C110 100 82 122 60 132 C38 122 10 100 10 62 Z",
    "round": None,
    "diamond": "M60 6 L114 70 L60 134 L6 70 Z",
}

def crest_svg(c):
    p, s, t = c["colors"]["primary"], c["colors"]["secondary"], c["colors"]["tertiary"]
    shape = c["crest"]["shape"]
    ink = text_color(p, s, t)
    edge = s if contrast(p, s) >= 1.5 else t
    if shape == "round":
        body = (f'<circle cx="60" cy="70" r="56" fill="{edge}"/>'
                f'<circle cx="60" cy="70" r="49" fill="{p}"/>'
                f'<circle cx="60" cy="70" r="42" fill="none" stroke="{edge}" stroke-width="2"/>')
    else:
        d = SHAPES[shape]
        body = (f'<path d="{d}" fill="{edge}"/>'
                f'<path d="{d}" fill="{p}" transform="translate(60 70) scale(0.87) translate(-60 -70)"/>')
    initials = c["crest"]["initials"]
    size = 30 if len(initials) <= 3 else 24
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140" width="120" height="140" '
            f'role="img" aria-label="{c["name"]} crest">{body}'
            f'<text x="60" y="80" text-anchor="middle" font-family="Georgia, serif" font-weight="700" '
            f'font-size="{size}" fill="{ink}" letter-spacing="1">{initials}</text></svg>')

for c in data["clubs"]:
    svg = crest_svg(c)
    open(os.path.join(DATA, "crests", c['id'] + ".svg"), "w").write(svg)
    c["crest"]["svg"] = "data/crests/" + c['id'] + ".svg"

json.dump(data, open(os.path.join(DATA, "clubs_2026_27.json"), "w"), indent=2, ensure_ascii=False)

# preview page
names = {"ENG1": "English top flight", "ENG2": "English second tier", "GER1": "German top flight"}
sections = []
for lg in ["ENG1", "ENG2", "GER1"]:
    clubs = sorted([c for c in data["clubs"] if c["league"] == lg], key=lambda c: (-c["strength"], c["name"]))
    cards = []
    for c in clubs:
        sw = "".join(f'<span class="sw" style="background:{c["colors"][k]}"></span>' for k in ("primary", "secondary", "tertiary"))
        cards.append(f'<div class="card">{crest_svg(c)}<div class="nm">{c["name"]}</div>'
                     f'<div class="meta">{c["city"]} · {c["capacity"]:,}</div><div class="sws">{sw}</div>'
                     f'<div class="meta">STR {c["strength"]} · REP {c["reputation"]} · €{c["revenue_m"]}M</div></div>')
    sections.append(f'<h2>{names[lg]} <small>{len(clubs)} clubs</small></h2><div class="grid">{"".join(cards)}</div>')

html = f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Club Crests 2026/27</title>
<style>
:root{{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1b;--muted:#6b6a66;--line:#e3e1dc}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#151514;--card:#1f1f1d;--ink:#eeece6;--muted:#a3a19a;--line:#33322f}}}}
:root[data-theme="dark"]{{--bg:#151514;--card:#1f1f1d;--ink:#eeece6;--muted:#a3a19a;--line:#33322f}}
body{{margin:0;padding:24px 16px;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}}
h1{{font:600 22px Georgia,serif;margin:0 0 4px}} p{{color:var(--muted);margin:0 0 20px}}
h2{{font:600 17px Georgia,serif;margin:28px 0 12px}} h2 small{{color:var(--muted);font:400 13px system-ui}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;text-align:center}}
.card svg{{width:72px;height:84px}} .nm{{font-weight:600;margin-top:6px}} .meta{{color:var(--muted);font-size:12px}}
.sws{{display:flex;justify-content:center;gap:4px;margin:6px 0}} .sw{{width:16px;height:16px;border-radius:4px;border:1px solid var(--line)}}
</style></head><body><h1>Club crests, 2026/27</h1>
<p>Generated initials crests for all 62 MVP clubs, in each club's colors. Sorted by starting strength.</p>
{''.join(sections)}</body></html>"""
open("crest_preview.html", "w").write(html)
print("crests:", len(os.listdir(os.path.join(DATA, "crests"))))
