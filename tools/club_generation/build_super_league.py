"""Super League clubs (SPEC §17.3): the 48 clubs in three tiers of 16.

DRAFT for T's approval (SL1 chunk 1). Until he approves, run it only with --preview:

    python3 build_super_league.py --preview <dir>

which writes a crest preview page and a markdown table to <dir> and leaves data/ alone.

Names are T's (city + nickname). based_on is a dev reference only, never shipped. The 14
clubs that are also in Classic keep their Classic code (crest file and random stream)
and values; only the name, short name, abbreviation and crest initials are T's.
"""
import json, os, sys

# Fields as build_clubs.py: league, based_on (dev reference only), name, short, abbr, city,
# country, capacity, primary, secondary, tertiary, market (1-100), reputation (1-100),
# revenue_m (EUR M, 2026/27 projection, relational), strength (target starting-XI OVR),
# crest_shape, crest_motif; code = the Classic code for the 14 shared clubs.
C = []
def add(league, based_on, name, short, abbr, city, country, cap, p, s, t, market, rep, rev,
        strength, shape, motif, code=None):
    C.append(dict(id=code or abbr.lower(), league=league, based_on=based_on, name=name,
                  short=short, abbr=abbr, city=city, country=country, capacity=cap,
                  colors=dict(primary=p, secondary=s, tertiary=t),
                  market=market, reputation=rep, revenue_m=rev, strength=strength,
                  crest=dict(shape=shape, motif=motif, initials=abbr)))

# ---------------- Star (tier 1) ----------------
L = "STAR"
add(L,"Real Madrid","Madrid Blancos","Blancos","MBL","Madrid","ESP",83186,"#FFFFFF","#00529F","#FEBE10",96,99,1250,77,"round","crown")
add(L,"Atletico Madrid","Madrid Colchoneros","Colchoneros","MCO","Madrid","ESP",70692,"#CB3524","#FFFFFF","#272E61",88,86,470,71,"shield","bear")
add(L,"FC Barcelona","Barcelona Blaugrana","Blaugrana","BAR","Barcelona","ESP",99354,"#A50044","#004D98","#EDBB00",94,96,1000,75,"shield","cross")
add(L,"Manchester City","Manchester Citizens","Citizens","MCI","Manchester","ENG",61470,"#6CABDD","#FFFFFF","#1C2C5B",86,92,830,76,"round","eagle","msk")
add(L,"Liverpool","Liverpool Reds","Reds","LIV","Liverpool","ENG",61276,"#C8102E","#FFFFFF","#00B2A9",82,94,840,76,"shield","bird","msr")
add(L,"Arsenal","North London Gunners","Gunners","NLG","London","ENG",60704,"#EF0107","#FFFFFF","#063672",90,90,830,75,"shield","cannon","isl")
add(L,"Chelsea","London Blues","Blues","LBL","London","ENG",40343,"#034694","#FFFFFF","#DBA111",90,88,580,72,"round","lion","ken")
add(L,"Tottenham Hotspur","North London Lilywhites","Lilywhites","NLL","London","ENG",62850,"#FFFFFF","#132257","#000000",88,82,670,69,"shield","cockerel","har")
add(L,"FC Bayern Munchen","Munich Die Roten","Die Roten","MUN","Munich","GER",75024,"#DC052D","#FFFFFF","#0066B2",92,95,860,76,"round","diamonds","mun")
add(L,"Borussia Dortmund","Dortmund Schwarzgelben","Schwarzgelben","DSG","Dortmund","GER",81365,"#FDE100","#000000","#FFFFFF",84,86,530,71,"round","monogram","bor")
add(L,"Bayer 04 Leverkusen","Leverkusen Werkself","Werkself","LEV","Leverkusen","GER",30210,"#E32221","#000000","#FFFFFF",60,82,330,70,"round","cross","rhw")
add(L,"Inter","Milan Nerazzurri","Nerazzurri","MNE","Milan","ITA",75817,"#010E80","#000000","#FFFFFF",88,88,600,73,"round","serpent")
add(L,"AC Milan","Milan Rossoneri","Rossoneri","MRO","Milan","ITA",75817,"#FB090B","#000000","#FFFFFF",88,86,500,70,"shield","devil")
add(L,"Juventus","Turin Bianconeri","Bianconeri","TUR","Turin","ITA",41507,"#000000","#FFFFFF","#D4AF37",80,88,560,70,"shield","zebra")
add(L,"Napoli","Naples Partenopei","Partenopei","NAP","Naples","ITA",54726,"#12A0D7","#FFFFFF","#003C82",76,80,330,71,"round","monogram")
add(L,"Paris Saint-Germain","Paris Rouge-et-Bleu","Rouge-et-Bleu","PAR","Paris","FRA",47929,"#004170","#DA291C","#FFFFFF",94,92,900,75,"round","tower")

# ---------------- Gold (tier 2) ----------------
L = "GOLD"
add(L,"Manchester United","Manchester Red Devils","Red Devils","MRD","Manchester","ENG",74197,"#DA291C","#000000","#FBE122",88,92,780,70,"shield","devil","mdv")
add(L,"Newcastle United","Newcastle Magpies","Magpies","NEW","Newcastle","ENG",52258,"#241F20","#FFFFFF","#41B6E6",74,78,400,70,"round","magpie","tyn")
add(L,"Aston Villa","Birmingham Lions","Lions","BIR","Birmingham","ENG",42640,"#670E36","#95BFE5","#FEE505",76,76,450,69,"shield","lion","ast")
add(L,"Sevilla","Seville Nervionenses","Nervionenses","SNE","Seville","ESP",43883,"#FFFFFF","#D81920","#000000",70,76,210,65,"shield","king")
add(L,"Real Sociedad","San Sebastián Txuri-Urdin","Txuri-Urdin","SSE","San Sebastián","ESP",39313,"#0067B1","#FFFFFF","#E4B04A",54,72,190,66,"round","crown")
add(L,"Athletic Club","Bilbao Leones","Leones","BIL","Bilbao","ESP",53331,"#EE2523","#FFFFFF","#000000",66,78,200,67,"shield","tree")
add(L,"Villarreal","Villarreal Submarino","Submarino","VIL","Villarreal","ESP",23008,"#FFE600","#005187","#FFFFFF",40,70,170,67,"shield","submarine")
add(L,"RB Leipzig","Leipzig Bullen","Bullen","LEI","Leipzig","GER",47069,"#FFFFFF","#DD0741","#001F47",66,78,480,69,"round","bull","sac")
add(L,"Eintracht Frankfurt","Frankfurt Adler","Adler","FRA","Frankfurt","GER",58000,"#E1000F","#000000","#FFFFFF",78,74,290,66,"shield","eagle","fra")
add(L,"AS Roma","Rome Giallorossi","Giallorossi","RGI","Rome","ITA",70634,"#8E1F2F","#F0BC42","#FFFFFF",86,80,320,68,"shield","wolf")
add(L,"Lazio","Rome Biancocelesti","Biancocelesti","RBI","Rome","ITA",70634,"#87D8F7","#FFFFFF","#002B5C",86,74,200,67,"shield","eagle")
add(L,"Atalanta","Bergamo Dea","Dea","BGO","Bergamo","ITA",24950,"#1E71B8","#000000","#FFFFFF",52,78,300,69,"round","goddess")
add(L,"Olympique de Marseille","Marseille Phocéens","Phocéens","MAR","Marseille","FRA",67394,"#FFFFFF","#2FAEE0","#000000",78,80,300,67,"shield","monogram")
add(L,"AS Monaco","Monaco Monégasques","Monégasques","MON","Monaco","MCO",16360,"#E51B22","#FFFFFF","#000000",40,74,230,68,"shield","diamonds")
add(L,"Benfica","Lisbon Encarnados","Encarnados","LEN","Lisbon","POR",64642,"#E83030","#FFFFFF","#000000",80,84,330,68,"round","eagle")
add(L,"FC Porto","Porto Dragões","Dragões","POR","Porto","POR",50033,"#003893","#FFFFFF","#E7C102",70,82,300,67,"shield","dragon")

# ---------------- Blue (tier 3) ----------------
L = "BLUE"
add(L,"Ajax","Amsterdam Godenzonen","Godenzonen","AMS","Amsterdam","NED",55865,"#D2122E","#FFFFFF","#000000",82,84,250,65,"round","warrior")
add(L,"PSV","Eindhoven Boeren","Boeren","EIN","Eindhoven","NED",35119,"#ED1C24","#FFFFFF","#000000",56,76,230,66,"round","monogram")
add(L,"Feyenoord","Rotterdam Stadionclub","Stadionclub","ROT","Rotterdam","NED",47500,"#E2001A","#FFFFFF","#000000",70,76,200,65,"round","monogram")
add(L,"Celtic","Glasgow Bhoys","Bhoys","GBH","Glasgow","SCO",60411,"#018749","#FFFFFF","#000000",72,80,160,63,"round","clover")
add(L,"Rangers","Glasgow Light Blues","Light Blues","GLB","Glasgow","SCO",50817,"#1B458F","#FFFFFF","#E2001A",72,76,140,62,"round","lion")
add(L,"Galatasaray","Istanbul Aslanlar","Aslanlar","IAS","Istanbul","TUR",52223,"#A90432","#FDB912","#FFFFFF",88,80,330,66,"round","lion")
add(L,"Fenerbahce","Istanbul Kanaryalar","Kanaryalar","IKA","Istanbul","TUR",47834,"#FFED00","#00205B","#FFFFFF",88,78,270,65,"round","canary")
add(L,"Olympique Lyonnais","Lyon Gones","Gones","LYO","Lyon","FRA",59186,"#FFFFFF","#14387F","#DA0812",74,76,270,65,"round","lion")
add(L,"Lille","Lille Dogues","Dogues","LIL","Lille","FRA",50186,"#E01E13","#FFFFFF","#20325F",64,72,200,66,"round","dog")
add(L,"Sporting CP","Lisbon Leões","Leões","LLE","Lisbon","POR",50095,"#008057","#FFFFFF","#000000",80,80,270,67,"shield","lion")
add(L,"Club Brugge","Bruges Blauw-Zwart","Blauw-Zwart","BRU","Bruges","BEL",29062,"#0067CE","#000000","#FFFFFF",48,72,190,65,"round","lion")
add(L,"Red Bull Salzburg","Salzburg Mozartstädter","Mozartstädter","SAL","Salzburg","AUT",30188,"#FFFFFF","#ED1C24","#0F1F3D",46,72,170,64,"round","bull")
add(L,"Shakhtar Donetsk","Donetsk Miners","Miners","DON","Donetsk","UKR",52518,"#F37021","#000000","#FFFFFF",60,70,150,62,"round","pick")
add(L,"Fiorentina","Florence Viola","Viola","FLO","Florence","ITA",43147,"#482E92","#FFFFFF","#E2001A",66,72,200,66,"diamond","lily")
add(L,"VfB Stuttgart","Stuttgart Schwaben","Schwaben","STU","Stuttgart","GER",60058,"#FFFFFF","#E32219","#000000",76,72,280,67,"shield","antlers","scw")
add(L,"Real Betis","Seville Verdiblancos","Verdiblancos","SVE","Seville","ESP",60721,"#00954C","#FFFFFF","#000000",70,72,230,66,"shield","monogram")

TIERS = [("STAR", "Star"), ("GOLD", "Gold"), ("BLUE", "Blue")]
for lid, _ in TIERS:
    assert len([c for c in C if c["league"] == lid]) == 16, lid
for key in ("id", "name", "abbr"):
    values = [c[key] for c in C]
    assert len(values) == len(set(values)), f"duplicate {key}"

# Crests: the same generator as build_crests.py (initials on the club's colors and shape).
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

def mean(xs):
    return round(sum(xs) / len(xs), 1)

def preview(out):
    os.makedirs(out, exist_ok=True)
    sections, tables = [], []
    for lid, label in TIERS:
        clubs = sorted([c for c in C if c["league"] == lid], key=lambda c: (-c["strength"], c["name"]))
        cards = []
        for c in clubs:
            sw = "".join(f'<span class="sw" style="background:{c["colors"][k]}"></span>' for k in ("primary", "secondary", "tertiary"))
            shared = '<div class="tag">also in Classic</div>' if c["id"] != c["abbr"].lower() else ""
            cards.append(f'<div class="card">{crest_svg(c)}<div class="nm">{c["name"]}</div>'
                         f'<div class="meta">{c["short"]} · {c["abbr"]} · {c["city"]}, {c["country"]}</div>'
                         f'<div class="sws">{sw}</div>'
                         f'<div class="meta">STR {c["strength"]} · REP {c["reputation"]} · MKT {c["market"]}</div>'
                         f'<div class="meta">€{c["revenue_m"]}M · {c["capacity"]:,} seats</div>{shared}</div>')
        s = [c["strength"] for c in clubs]
        sections.append(f'<h2>{label} <small>tier {TIERS.index((lid, label)) + 1} · 16 clubs · strength '
                        f'{min(s)}–{max(s)}, mean {mean(s)}</small></h2><div class="grid">{"".join(cards)}</div>')
        rows = ["| Club | Short | Abbr | City | Seats | Revenue €M | Rep | Market | Strength |",
                "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
        for c in clubs:
            rows.append(f'| {c["name"]} | {c["short"]} | {c["abbr"]} | {c["city"]} ({c["country"]}) | '
                        f'{c["capacity"]:,} | {c["revenue_m"]} | {c["reputation"]} | {c["market"]} | {c["strength"]} |')
        tables.append(f"## {label}\n\n" + "\n".join(rows))
    html = f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Super League Clubs</title>
<style>
:root{{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1b;--muted:#6b6a66;--line:#e3e1dc;--tag:#e7f1fb}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#151514;--card:#1f1f1d;--ink:#eeece6;--muted:#a3a19a;--line:#33322f;--tag:#23303d}}}}
:root[data-theme="dark"]{{--bg:#151514;--card:#1f1f1d;--ink:#eeece6;--muted:#a3a19a;--line:#33322f;--tag:#23303d}}
body{{margin:0;padding:24px 16px;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}}
h1{{font:600 22px Georgia,serif;margin:0 0 4px}} p{{color:var(--muted);margin:0 0 20px;max-width:70ch}}
h2{{font:600 17px Georgia,serif;margin:28px 0 12px}} h2 small{{color:var(--muted);font:400 13px system-ui}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;text-align:center}}
.card svg{{width:72px;height:84px}} .nm{{font-weight:600;margin-top:6px}} .meta{{color:var(--muted);font-size:12px}}
.sws{{display:flex;justify-content:center;gap:4px;margin:6px 0}} .sw{{width:16px;height:16px;border-radius:4px;border:1px solid var(--line)}}
.tag{{display:inline-block;margin-top:6px;padding:1px 8px;border-radius:9px;background:var(--tag);font-size:11px}}
</style></head><body><h1>Super League clubs: proposal</h1>
<p>Draft for approval (SL1 chunk 1). Crests are generated as in Classic: initials on the club's colors and shape.
Clubs tagged "also in Classic" keep their Classic values and crest colors; only the name, short name and initials are new.</p>
{''.join(sections)}</body></html>"""
    open(os.path.join(out, "super_league_preview.html"), "w").write(html)
    open(os.path.join(out, "super_league_clubs.md"), "w").write("\n\n".join(tables) + "\n")
    for lid, label in TIERS:
        s = [c["strength"] for c in C if c["league"] == lid]
        r = [c["revenue_m"] for c in C if c["league"] == lid]
        print(label, "strength", min(s), max(s), mean(s), "revenue", min(r), max(r), mean(r))

if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--preview":
        preview(sys.argv[2])
    else:
        sys.exit("Draft until T approves the values: run with --preview <dir>.")
