"""IDEA icon, fourth pass: the lockup's own silhouette. Gear left, chamfered plate
crossing in front of it to the right edge. Two shapes, no letters."""
import math, os, sys
# The generators are a pair; resolve the sibling from this file's own directory
# so the tool runs from anywhere in the tree.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from idea_logo_vector import octagon, gear_ring_path

GRAPH_HI, GRAPH_LO = "#1A1F21", "#060808"
GREEN_HI, GREEN_LO = "#3C7A4C", "#1F4A2C"
GLOW = "#9FE29A"
STEEL_HI, STEEL_LO = "#CBD2C4", "#87928A"
OUTLINE = "#0A0F0B"

def bar(x0, y0, x1, y1, c):
    return (f"M {x0} {y0} L {x1-c} {y0} L {x1} {y0+c} L {x1} {y1-c} L {x1-c} {y1} L {x0} {y1} Z")

def build(variant="A", S=512, square=False):
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}" height="{S}">',
           f'<defs><linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="{GRAPH_HI}"/><stop offset="1" stop-color="{GRAPH_LO}"/></linearGradient>'
           f'<linearGradient id="pl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{GREEN_HI}"/><stop offset="1" stop-color="{GREEN_LO}"/></linearGradient>'
           f'<linearGradient id="st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{STEEL_HI}"/><stop offset="1" stop-color="{STEEL_LO}"/></linearGradient></defs>']
    tile_on = variant in ("A", "D") or (variant == "C" and square)
    if tile_on:
        c = S * 0.135
        out.append(f'<rect width="{S}" height="{S}" fill="url(#bg)"/>' if square else f'<path d="{octagon(0,0,S,S,c)}" fill="url(#bg)"/>')
    ow = S * 0.030          # outline weight, the one thing that keeps shapes apart at 16 px
    if variant in ("A", "B"):
        # gear
        r = S * 0.30; cx, cy = S * 0.33, S * 0.50
        teeth = 9
        out.append(f'<path d="{gear_ring_path(cx, cy, r, r*0.52, teeth=teeth, root=0.76, land=0.48, flank=0.14, rot=math.pi/teeth)}" fill-rule="evenodd" fill="url(#st)" stroke="{OUTLINE}" stroke-width="{ow:.1f}" stroke-linejoin="round"/>')
        # plate bar, in front, from the gear centre to the right edge
        bh = S * 0.40; y0 = cy - bh / 2; x0 = cx; x1 = S * 0.94; ch = bh * 0.25
        out.append(f'<path d="{bar(x0, y0, x1, y0+bh, ch)}" fill="url(#pl)" stroke="{OUTLINE}" stroke-width="{ow:.1f}" stroke-linejoin="round"/>')
        ins = S * 0.045
        out.append(f'<path d="{bar(x0+ins, y0+ins, x1-ins, y0+bh-ins, ch-ins*0.414)}" fill="none" stroke="{GLOW}" stroke-width="{S*0.026:.1f}" stroke-linejoin="round"/>')
    elif variant in ("C", "D"):
        # gear centred on the plate as its shaft: the plate runs edge to edge behind it
        r = S * 0.36; cx, cy = S * 0.5, S * 0.5
        bh = S * 0.34; y0 = cy - bh / 2; ch = bh * 0.25; xa, xb = S * 0.05, S * 0.95
        d = f"M {xa+ch} {y0} L {xb-ch} {y0} L {xb} {y0+ch} L {xb} {y0+bh-ch} L {xb-ch} {y0+bh} L {xa+ch} {y0+bh} L {xa} {y0+bh-ch} L {xa} {y0+ch} Z"
        out.append(f'<path d="{d}" fill="url(#pl)" stroke="{OUTLINE}" stroke-width="{ow:.1f}" stroke-linejoin="round"/>')
        ins = S * 0.04
        out.append(f'<path d="M {xa+ch+ins*0.6} {y0+ins} L {xb-ch-ins*0.6} {y0+ins} M {xa+ch+ins*0.6} {y0+bh-ins} L {xb-ch-ins*0.6} {y0+bh-ins}" fill="none" stroke="{GLOW}" stroke-opacity="0.9" stroke-width="{S*0.022:.1f}"/>')
        teeth = 8
        out.append(f'<path d="{gear_ring_path(cx, cy, r, r*0.46, teeth=teeth, root=0.74, land=0.46, flank=0.15, rot=0.0)}" fill-rule="evenodd" fill="url(#st)" stroke="{OUTLINE}" stroke-width="{ow:.1f}" stroke-linejoin="round"/>')
        out.append(f'<circle cx="{cx}" cy="{cy}" r="{r*0.46-ow*0.5:.1f}" fill="{"url(#pl)" if variant=="C" else GRAPH_LO}"/>')
    out.append("</svg>")
    return "\n".join(out)

if __name__ == "__main__":
    import cairosvg, os
    o = sys.argv[1] if len(sys.argv) > 1 else "v7"; os.makedirs(o, exist_ok=True)
    for v in "CD":
        svg = build(v); open(f"{o}/{v}.svg", "w").write(svg)
        for px in (512, 64, 32, 16):
            cairosvg.svg2png(bytestring=svg.encode(), write_to=f"{o}/{v}_{px}.png", output_width=px, output_height=px)
    print("ok")
