import json, os
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data")

# Fields: id, league, based_on (dev reference only), name, short, abbr, city, country,
# capacity, primary, secondary, tertiary, market (1-100), reputation (1-100),
# revenue_m (EUR M, 2026/27 projection, relational), strength (target starting-XI OVR),
# crest_shape, crest_motif
C = []
def add(league, based_on, name, short, abbr, city, country, cap, p, s, t, market, rep, rev, strength, shape, motif):
    C.append(dict(id=abbr.lower(), league=league, based_on=based_on, name=name, short=short, abbr=abbr,
                  city=city, country=country, capacity=cap,
                  colors=dict(primary=p, secondary=s, tertiary=t),
                  market=market, reputation=rep, revenue_m=rev, strength=strength,
                  crest=dict(shape=shape, motif=motif, initials=abbr)))

# ---------------- ENG1: Premier League 2026/27 (20) ----------------
L = "ENG1"
add(L,"Arsenal","Islington Cannons","Cannons","ISL","London","ENG",60704,"#EF0107","#FFFFFF","#063672",90,90,830,75,"shield","cannon")
add(L,"Aston Villa","Aston Lions","Lions","AST","Birmingham","ENG",42640,"#670E36","#95BFE5","#FEE505",76,76,450,69,"shield","lion")
add(L,"AFC Bournemouth","Dorset Cherries","Cherries","DOR","Bournemouth","ENG",11307,"#DA291C","#000000","#FFFFFF",48,56,200,64,"round","cherry")
add(L,"Brentford","West London Bees","Bees","WLB","London","ENG",17250,"#E30613","#FFFFFF","#000000",62,58,200,64,"round","bee")
add(L,"Brighton & Hove Albion","Sussex Seagulls","Seagulls","SUS","Brighton","ENG",31876,"#0057B8","#FFFFFF","#FFCD00",64,66,260,66,"round","gull")
add(L,"Chelsea","Kensington Blues","Blues","KEN","London","ENG",40343,"#034694","#FFFFFF","#DBA111",90,88,580,72,"round","lion")
add(L,"Coventry City","Warwickshire Sky Blues","Sky Blues","WAR","Coventry","ENG",32609,"#5BC2E7","#FFFFFF","#1D2A4D",58,50,180,61,"shield","elephant")
add(L,"Crystal Palace","South London Eagles","Eagles","SLE","London","ENG",25486,"#1B458F","#C4122E","#FFFFFF",70,62,230,65,"shield","eagle")
add(L,"Everton","Mersey Blues","Toffees","MER","Liverpool","ENG",52888,"#003399","#FFFFFF","#000000",74,68,230,64,"shield","tower")
add(L,"Fulham","Riverside Cottagers","Cottagers","RIV","London","ENG",29600,"#FFFFFF","#000000","#CC0000",68,58,230,64,"shield","cottage")
add(L,"Hull City","Humber Tigers","Tigers","HUM","Hull","ENG",25586,"#F5A12D","#000000","#FFFFFF",54,46,170,60,"round","tiger")
add(L,"Ipswich Town","Suffolk Town","Tractors","SUF","Ipswich","ENG",30000,"#1C4A9F","#FFFFFF","#DE2C37",52,50,180,61,"shield","horse")
add(L,"Leeds United","Yorkshire Whites","Whites","YOR","Leeds","ENG",37645,"#FFFFFF","#1D428A","#FFCD00",74,64,220,63,"shield","rose")
add(L,"Liverpool","Merseyside Reds","Reds","MSR","Liverpool","ENG",61276,"#C8102E","#FFFFFF","#00B2A9",82,94,840,76,"shield","bird")
add(L,"Manchester City","Manchester Sky","Citizens","MSK","Manchester","ENG",61470,"#6CABDD","#FFFFFF","#1C2C5B",86,92,830,76,"round","eagle")
add(L,"Manchester United","Manchester Devils","Devils","MDV","Manchester","ENG",74197,"#DA291C","#000000","#FBE122",88,92,780,70,"shield","devil")
add(L,"Newcastle United","Tyneside Magpies","Magpies","TYN","Newcastle","ENG",52258,"#241F20","#FFFFFF","#41B6E6",74,78,400,70,"round","magpie")
add(L,"Nottingham Forest","Trent Foresters","Foresters","TRE","Nottingham","ENG",30404,"#DD0000","#FFFFFF","#000000",64,62,220,65,"round","tree")
add(L,"Sunderland","Wearside Black Cats","Black Cats","WEA","Sunderland","ENG",48707,"#EB172B","#FFFFFF","#000000",66,58,190,62,"shield","cat")
add(L,"Tottenham Hotspur","Haringey Cockerels","Cockerels","HAR","London","ENG",62850,"#FFFFFF","#132257","#000000",88,82,670,69,"shield","cockerel")

# ---------------- ENG2: Championship 2026/27 (24) ----------------
L = "ENG2"
add(L,"Birmingham City","Second City Blues","Blues","SCB","Birmingham","ENG",29409,"#0000FF","#FFFFFF","#E2001A",70,46,75,57,"round","globe")
add(L,"Blackburn Rovers","Lancashire Rovers","Rovers","LAN","Blackburn","ENG",31367,"#009EE0","#FFFFFF","#000000",50,46,45,54,"shield","rose")
add(L,"Bolton Wanderers","Bolton Trotters","Trotters","BOL","Bolton","ENG",28723,"#FFFFFF","#263C7E","#E2001A",54,40,40,53,"round","elephant")
add(L,"Bristol City","Bristol Robins","Robins","BRI","Bristol","ENG",26462,"#E21A23","#FFFFFF","#000000",64,40,45,54,"round","robin")
add(L,"Burnley","Pennine Clarets","Clarets","PEN","Burnley","ENG",21990,"#6C1D45","#99D6EA","#FFFFFF",44,50,110,59,"shield","bee")
add(L,"Cardiff City","Welsh Bluebirds","Bluebirds","WBB","Cardiff","WAL",33280,"#0070B5","#FFFFFF","#E2001A",60,44,45,52,"round","bluebird")
add(L,"Charlton Athletic","Valley Addicks","Addicks","VAL","London","ENG",27111,"#D4021D","#FFFFFF","#000000",58,38,35,52,"round","sword")
add(L,"Derby County","East Midlands Rams","Rams","EMR","Derby","ENG",33597,"#FFFFFF","#000000","#C8A964",60,46,45,53,"round","ram")
add(L,"Lincoln City","Lincolnshire Imps","Imps","LIN","Lincoln","ENG",11400,"#D71920","#FFFFFF","#000000",40,32,20,50,"shield","imp")
add(L,"Middlesbrough","Teesside Boro","Boro","TEE","Middlesbrough","ENG",34742,"#E11B22","#FFFFFF","#000000",58,48,55,57,"shield","lion")
add(L,"Millwall","Bermondsey Lions","Lions","BER","London","ENG",20146,"#001D5E","#FFFFFF","#000000",58,38,35,53,"shield","lion")
add(L,"Norwich City","Norfolk Canaries","Canaries","NOR","Norwich","ENG",27359,"#FFF200","#00A650","#000000",54,48,55,56,"round","canary")
add(L,"Portsmouth","Pompey Blues","Pompey","POM","Portsmouth","ENG",20867,"#001489","#FFFFFF","#E2001A",58,42,40,52,"shield","star")
add(L,"Preston North End","Preston Lilywhites","Lilywhites","PRE","Preston","ENG",23408,"#FFFFFF","#001F5B","#000000",50,38,35,52,"shield","lamb")
add(L,"Queens Park Rangers","Shepherd's Bush Hoops","Hoops","SHB","London","ENG",18439,"#1D5BA4","#FFFFFF","#000000",60,40,40,53,"round","hoops")
add(L,"Sheffield United","Sheffield Blades","Blades","SHE","Sheffield","ENG",32050,"#EE2737","#FFFFFF","#000000",64,50,60,57,"shield","blades")
add(L,"Southampton","Solent Saints","Saints","SOL","Southampton","ENG",32384,"#D71920","#FFFFFF","#000000",60,54,80,59,"round","halo")
add(L,"Stoke City","Stoke Potters","Potters","STK","Stoke-on-Trent","ENG",30089,"#E03A3E","#FFFFFF","#1B449C",56,44,50,54,"shield","knot")
add(L,"Swansea City","Swansea Jacks","Jacks","SWA","Swansea","WAL",21088,"#FFFFFF","#000000","#E2001A",50,44,40,54,"round","swan")
add(L,"Watford","Hertfordshire Hornets","Hornets","HER","Watford","ENG",22200,"#FBEE23","#000000","#ED2127",52,44,50,54,"round","hornet")
add(L,"West Bromwich Albion","Black Country Baggies","Baggies","BCB","West Bromwich","ENG",26850,"#122F67","#FFFFFF","#000000",62,48,55,56,"shield","thrush")
add(L,"West Ham United","East London Irons","Irons","ELI","London","ENG",62500,"#7A263A","#1BB1E7","#F3D459",80,66,160,61,"shield","hammers")
add(L,"Wolverhampton Wanderers","Wolverhampton Pack","Wolves","WOL","Wolverhampton","ENG",31750,"#FDB913","#231F20","#FFFFFF",64,58,120,60,"round","wolf")
add(L,"Wrexham","North Wales Dragons","Dragons","NWD","Wrexham","WAL",10771,"#D50032","#FFFFFF","#00843D",40,44,45,54,"shield","dragon")

# ---------------- GER1: Bundesliga 2026/27 (18) ----------------
L = "GER1"
add(L,"FC Augsburg","Augsburg Panther","Panther","AUG","Augsburg","GER",30660,"#BA3733","#46714D","#FFFFFF",54,52,130,61,"round","panther")
add(L,"Bayer 04 Leverkusen","Rheinland Werkself","Werkself","RHW","Leverkusen","GER",30210,"#E32221","#000000","#FFFFFF",60,82,330,70,"round","cross")
add(L,"FC Bayern München","München Rot 1900","Rekordmeister","MUN","Munich","GER",75024,"#DC052D","#FFFFFF","#0066B2",92,95,860,76,"round","diamonds")
add(L,"Borussia Dortmund","Borsigplatz 09","Schwarzgelben","BOR","Dortmund","GER",81365,"#FDE100","#000000","#FFFFFF",84,86,530,71,"round","monogram")
add(L,"Eintracht Frankfurt","Frankfurt Adler","Adler","FRA","Frankfurt","GER",58000,"#E1000F","#000000","#FFFFFF",78,74,290,66,"shield","eagle")
add(L,"SC Freiburg","Breisgau SC","Breisgauer","BRE","Freiburg","GER",34700,"#E30613","#FFFFFF","#000000",52,64,180,65,"shield","raven")
add(L,"Hamburger SV","Hamburg Rauten","Rothosen","HAM","Hamburg","GER",57000,"#0A3F86","#FFFFFF","#000000",80,64,160,61,"diamond","diamond")
add(L,"TSG Hoffenheim","Kraichgau 1899","Kraichgauer","KRA","Sinsheim","GER",30150,"#1961B5","#FFFFFF","#000000",44,58,170,64,"shield","monogram")
add(L,"1. FC Köln","Domstadt Geissboecke","Geissboecke","DOM","Cologne","GER",50000,"#ED1C24","#FFFFFF","#000000",78,60,170,61,"round","goat")
add(L,"RB Leipzig","Sachsen Bullen","Bullen","SAC","Leipzig","GER",47069,"#FFFFFF","#DD0741","#001F47",66,78,480,69,"round","bull")
add(L,"1. FSV Mainz 05","Rheinhessen 05","Nullfuenfer","RHE","Mainz","GER",33305,"#C3141E","#FFFFFF","#000000",54,58,150,62,"round","wheel")
add(L,"Borussia Moenchengladbach","Niederrhein Fohlen","Fohlen","NIE","Moenchengladbach","GER",54042,"#FFFFFF","#000000","#00A13F",66,66,200,63,"diamond","foal")
add(L,"SC Paderborn 07","Ostwestfalen 07","Paderborner","OST","Paderborn","GER",15000,"#005CA9","#000000","#FFFFFF",42,42,75,57,"shield","monogram")
add(L,"FC Schalke 04","Gelsenkirchen Knappen","Koenigsblauen","GEL","Gelsenkirchen","GER",62271,"#004D9D","#FFFFFF","#000000",78,66,190,60,"round","pick")
add(L,"SV 07 Elversberg","Spiesen 07","Elversberger","SPI","Spiesen-Elversberg","GER",10000,"#000000","#FFFFFF","#7F7F7F",30,36,55,57,"shield","monogram")
add(L,"VfB Stuttgart","Schwaben 1893","Schwaben","SCW","Stuttgart","GER",60058,"#FFFFFF","#E32219","#000000",76,72,280,67,"shield","antlers")
add(L,"1. FC Union Berlin","Koepenick Eisern","Eisernen","KOE","Berlin","GER",22012,"#EB1923","#FFFFFF","#FFD800",72,58,150,61,"round","iron")
add(L,"SV Werder Bremen","Hanseaten Bremen","Werderaner","HAN","Bremen","GER",42100,"#1D9053","#FFFFFF","#000000",66,64,170,62,"diamond","monogram")

assert len([c for c in C if c["league"]=="ENG1"])==20
assert len([c for c in C if c["league"]=="ENG2"])==24
assert len([c for c in C if c["league"]=="GER1"])==18
ids=[c["id"] for c in C]; assert len(ids)==len(set(ids)), "dup abbr"
names=[c["name"] for c in C]; assert len(names)==len(set(names)), "dup name"

out = dict(season="2026/27", notes=("Fictional club names on real cities. Values are relational, not exact: "
      "market/reputation 1-100; revenue_m is a scaled 2026/27 projection in EUR M; strength is the target "
      "starting-XI OVR used to generate opening squads. based_on is a dev reference only and must not ship in the game UI."),
      leagues=[dict(id="ENG1",name="English top flight",country="ENG",tier=1,clubs=20),
               dict(id="ENG2",name="English second tier",country="ENG",tier=2,clubs=24),
               dict(id="GER1",name="German top flight",country="GER",tier=1,clubs=18)],
      clubs=C)
json.dump(out, open(os.path.join(DATA, "clubs_2026_27.json"),"w"), indent=2, ensure_ascii=False)

# markdown tables per league for the doc
def md(league):
    rows = sorted([c for c in C if c["league"]==league], key=lambda c:(-c["strength"], -c["reputation"]))
    lines = ["| Club | Abbr | Based on | City | Capacity | Colors | Market | Rep | Revenue €M | Strength | Crest |",
             "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for c in rows:
        col = f"{c['colors']['primary']} / {c['colors']['secondary']} / {c['colors']['tertiary']}"
        lines.append(f"| {c['name']} | {c['abbr']} | {c['based_on']} | {c['city']} | {c['capacity']:,} | {col} | {c['market']} | {c['reputation']} | {c['revenue_m']} | {c['strength']} | {c['crest']['shape']}, {c['crest']['motif']} |")
    return "\n".join(lines)
open("clubs_tables.md","w").write("\n\n".join(md(l) for l in ["ENG1","ENG2","GER1"]))
print("ok", len(C))
for l in ["ENG1","ENG2","GER1"]:
    s=[c["strength"] for c in C if c["league"]==l]; r=[c["revenue_m"] for c in C if c["league"]==l]
    print(l, "strength", min(s), max(s), round(sum(s)/len(s),1), "revenue", min(r), max(r))
