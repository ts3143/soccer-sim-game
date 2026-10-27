import json, os
from crest_art import crest_svg

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data")
# Each world's clubs file. A club in both (same code) gets one crest, identical in both.
FILES = ["clubs_2026_27.json", "clubs_super_league_2026_27.json"]

os.makedirs(os.path.join(DATA, "crests"), exist_ok=True)
written = {}
sections = []
for file in FILES:
    data = json.load(open(os.path.join(DATA, file)))
    for c in data["clubs"]:
        svg = crest_svg(c)
        assert written.get(c["id"], svg) == svg, f"{c['id']}: different crests in two worlds"
        written[c["id"]] = svg
        open(os.path.join(DATA, "crests", c['id'] + ".svg"), "w").write(svg)
        c["crest"]["svg"] = "data/crests/" + c['id'] + ".svg"
    json.dump(data, open(os.path.join(DATA, file), "w"), indent=2, ensure_ascii=False)

    # preview page sections, one per league
    for league in data["leagues"]:
        clubs = sorted([c for c in data["clubs"] if c["league"] == league["id"]], key=lambda c: (-c["strength"], c["name"]))
        cards = []
        for c in clubs:
            sw = "".join(f'<span class="sw" style="background:{c["colors"][k]}"></span>' for k in ("primary", "secondary", "tertiary"))
            cards.append(f'<div class="card">{crest_svg(c)}<div class="nm">{c["name"]}</div>'
                         f'<div class="meta">{c["city"]} · {c["capacity"]:,}</div><div class="sws">{sw}</div>'
                         f'<div class="meta">STR {c["strength"]} · REP {c["reputation"]} · €{c["revenue_m"]}M</div></div>')
        sections.append(f'<h2>{league["name"]} <small>{len(clubs)} clubs</small></h2><div class="grid">{"".join(cards)}</div>')

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
<p>Generated initials crests for every club of both worlds (Classic, then the Super League), in each club's colors. Sorted by starting strength.</p>
{''.join(sections)}</body></html>"""
open("crest_preview.html", "w").write(html)
print("crests:", len(os.listdir(os.path.join(DATA, "crests"))))
