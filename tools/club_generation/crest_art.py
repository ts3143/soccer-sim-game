"""Crest drawing shared by build_crests.py for both worlds: initials on the club's colors
and crest shape. A club in both worlds gets the same crest file."""

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
