"""
IDEA logo vector reconstruction and site icon generator.

Everything geometric is MEASURED from IDEA_logo_transparent.png (2560x1204)
on 2026-09-08, in that file's pixel coordinates:

  Gear    centre (611, 582), tip R 568, root 500 (0.88 R), 14 teeth,
          tooth land 0.52 of pitch at mid-height, bore 372 (0.655 R),
          green inner rim 372..402 (0.655..0.708 R), dark outline ~25 px.
  Plate   octagon x 366..2522, y 248..918, 45 deg chamfer 165 px,
          glow line inset 32 px, 15 px wide.
  Letters traced from the ivory mask (cv2 contours, approxPolyDP eps 5),
          stored below verbatim so this file needs no image at run time.
  Accent  bottom glow line breaks at x 1961 and kinks 45 deg up to (2075,770),
          a second parallel slash (1981,890)..(2117,771), line resumes at 2058.
  Colours sampled from the same file.

One generator emits SVG. cairosvg rasterises. Edit parameters, regenerate.
"""
import math, json, os

SRC_W, SRC_H = 2560, 1204

# ---- palette (sampled) -----------------------------------------------------
STEEL_HI, STEEL_MID, STEEL_LO = "#B4BBAC", "#8E978A", "#5C665C"
STEEL_OUTLINE = "#1E2A20"
RIM_HI, RIM_LO = "#A9DDA0", "#4F944F"
PLATE_TOP, PLATE_MID, PLATE_LO = "#3B6748", "#2C4B36", "#1E3627"
PLATE_OUTLINE = "#0E1C13"
GLOW_HI, GLOW_MID, GLOW_LO = "#D5FBCA", "#B2DCA6", "#76B978"
IVORY_HI, IVORY_LO = "#F2EEE5", "#D3CBBC"
IVORY_OUTLINE = "#262B24"
LETTER_SHADOW = "#0F1A12"

# ---- gear (source px) ------------------------------------------------------
GEAR_CX, GEAR_CY, GEAR_R = 611.0, 582.0, 568.0
TEETH, ROOT, BORE, RIM_OUT = 14, 0.88, 0.655, 0.708
LAND, FLANK = 0.50, 0.14
GEAR_ROT = math.radians(8.0)   # tips measured at 124.8, 149.6, 177.0, 228.4, 254.6 deg
GEAR_OUTLINE_W = 25.0

# ---- plate (source px) -----------------------------------------------------
PX0, PX1, PY0, PY1, CHAMFER = 366, 2522, 248, 918, 165
GLOW_INSET, GLOW_W = 32, 15

# ---- letters, traced (source px) -------------------------------------------
LETTERS_RAW = json.loads(r'''[{"name": "i_top", "pts": [[670.0, 355.0], [578.0, 355.0], [567.0, 363.0], [568.0, 467.0], [579.0, 507.0], [662.0, 427.0]]}, {"name": "i_bar", "pts": [[665.0, 490.0], [643.0, 497.0], [569.0, 569.0], [581.0, 782.0], [656.0, 783.0], [664.0, 775.0], [664.0, 506.0], [675.0, 505.0]]}, {"name": "D", "pts": [[711.0, 361.0], [709.0, 378.0], [792.0, 456.0], [1097.0, 456.0], [1161.0, 521.0], [1161.0, 630.0], [1144.0, 628.0], [1093.0, 683.0], [823.0, 684.0], [808.0, 698.0], [806.0, 525.0], [815.0, 513.0], [714.0, 508.0], [724.0, 781.0], [1129.0, 783.0], [1242.0, 669.0], [1244.0, 484.0], [1253.0, 478.0], [1138.0, 355.0]]}, {"name": "E_top", "pts": [[1817.0, 367.0], [1802.0, 355.0], [1401.0, 356.0], [1286.0, 474.0], [1298.0, 480.0], [1299.0, 595.0], [1441.0, 456.0], [1736.0, 456.0]]}, {"name": "E_mid", "pts": [[1419.0, 534.0], [1501.0, 625.0], [1733.0, 625.0], [1814.0, 546.0], [1801.0, 525.0], [1432.0, 525.0]]}, {"name": "E_bot", "pts": [[1286.0, 652.0], [1412.0, 784.0], [1796.0, 783.0], [1814.0, 767.0], [1741.0, 684.0], [1445.0, 684.0], [1392.0, 627.0], [1378.0, 629.0], [1377.0, 593.0], [1388.0, 592.0], [1379.0, 574.0], [1359.0, 581.0]]}, {"name": "A", "pts": [[1844.0, 472.0], [1854.0, 493.0], [1857.0, 782.0], [1937.0, 775.0], [1938.0, 526.0], [2004.0, 455.0], [2217.0, 457.0], [2273.0, 514.0], [2278.0, 545.0], [2256.0, 558.0], [2063.0, 559.0], [1979.0, 651.0], [2003.0, 660.0], [2275.0, 660.0], [2277.0, 779.0], [2358.0, 779.0], [2368.0, 474.0], [2257.0, 357.0], [1962.0, 355.0]]}]''')
# Hand correction, 2026-09-08: the trace of the E's lower-arm tip carried two
# sub-pixel jogs at (1377,593)/(1388,592) that snap45 turned into a spur. The tip
# is a vertical stub capped at y 574 and the outer 45 deg edge down to (1286,652).
for _L in LETTERS_RAW:
    if _L['name'] == 'E_bot':
        _L['pts'] = [[1286,652],[1412,784],[1796,783],[1814,767],[1741,684],[1445,684],[1392,627],[1378,629],[1378,574],[1359,581]]
LETTERS = [dict(name=L['name'], pts=[tuple(p) for p in L['pts']]) for L in LETTERS_RAW]

def snap45(pts, min_len=4.0):
    """Snap every edge of a traced polygon to the nearest 45 deg direction, then
    rebuild vertices as intersections of consecutive snapped edge lines."""
    n = len(pts)
    lines = []
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy)
        if L < min_len:
            continue
        ang = round(math.atan2(dy, dx) / (math.pi / 4)) * (math.pi / 4)
        ux, uy = math.cos(ang), math.sin(ang)
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        if lines and abs(((lines[-1][2] - ux + 2) % 2)) < 1e-6 and abs(((lines[-1][3] - uy + 2) % 2)) < 1e-6:
            pass
        lines.append([mx, my, ux, uy, L])
    # merge consecutive parallel lines (same direction) into one, weighted by length
    merged = []
    for ln in lines:
        if merged and abs(merged[-1][2] - ln[2]) < 1e-6 and abs(merged[-1][3] - ln[3]) < 1e-6:
            a, b = merged[-1], ln
            w = a[4] + b[4]
            merged[-1] = [(a[0]*a[4] + b[0]*b[4]) / w, (a[1]*a[4] + b[1]*b[4]) / w, a[2], a[3], w]
        else:
            merged.append(ln)
    if len(merged) > 1 and abs(merged[0][2] - merged[-1][2]) < 1e-6 and abs(merged[0][3] - merged[-1][3]) < 1e-6:
        a, b = merged[0], merged[-1]
        w = a[4] + b[4]
        merged[0] = [(a[0]*a[4] + b[0]*b[4]) / w, (a[1]*a[4] + b[1]*b[4]) / w, a[2], a[3], w]
        merged.pop()
    out = []
    m = len(merged)
    for i in range(m):
        x1, y1, u1, v1, _ = merged[i]
        x2, y2, u2, v2, _ = merged[(i + 1) % m]
        den = u1 * v2 - v1 * u2
        if abs(den) < 1e-9:
            out.append((x2, y2)); continue
        t = ((x2 - x1) * v2 - (y2 - y1) * u2) / den
        out.append((x1 + u1 * t, y1 + v1 * t))
    return out


for _L in LETTERS:
    _L["pts"] = snap45(_L["pts"])


def gear_ring_path(cx, cy, r_tip, r_inner, teeth=TEETH, root=ROOT, land=LAND, flank=FLANK, rot=None):
    if rot is None:
        rot = GEAR_ROT
    r_root = r_tip * root
    step = 2 * math.pi / teeth
    pts = []
    for i in range(teeth):
        a = i * step - math.pi / 2 + rot
        hl = step * land / 2
        fl = step * flank
        pts += [(a - hl - fl, r_root), (a - hl, r_tip), (a + hl, r_tip), (a + hl + fl, r_root)]
    d = "M %.1f %.1f " % (cx + pts[0][1] * math.cos(pts[0][0]), cy + pts[0][1] * math.sin(pts[0][0]))
    d += " ".join("L %.1f %.1f" % (cx + r * math.cos(a), cy + r * math.sin(a)) for a, r in pts[1:]) + " Z"
    d += (" M %.1f %.1f A %.1f %.1f 0 1 0 %.1f %.1f A %.1f %.1f 0 1 0 %.1f %.1f Z"
          % (cx - r_inner, cy, r_inner, r_inner, cx + r_inner, cy, r_inner, r_inner, cx - r_inner, cy))
    return d


def annulus_path(cx, cy, r_out, r_in):
    return ("M %.1f %.1f A %.1f %.1f 0 1 0 %.1f %.1f A %.1f %.1f 0 1 0 %.1f %.1f Z "
            "M %.1f %.1f A %.1f %.1f 0 1 0 %.1f %.1f A %.1f %.1f 0 1 0 %.1f %.1f Z"
            % (cx - r_out, cy, r_out, r_out, cx + r_out, cy, r_out, r_out, cx - r_out, cy,
               cx - r_in, cy, r_in, r_in, cx + r_in, cy, r_in, r_in, cx - r_in, cy))


def octagon(x0, y0, x1, y1, c):
    return (f"M {x0+c} {y0} L {x1-c} {y0} L {x1} {y0+c} L {x1} {y1-c} L {x1-c} {y1} "
            f"L {x0+c} {y1} L {x0} {y1-c} L {x0} {y0+c} Z")


def poly_path(pts):
    return "M " + " L ".join("%.1f %.1f" % (x, y) for x, y in pts) + " Z"


def defs(prefix=""):
    p = prefix
    return f"""<defs>
<linearGradient id="{p}steel" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="{STEEL_HI}"/><stop offset="0.5" stop-color="{STEEL_MID}"/><stop offset="1" stop-color="{STEEL_LO}"/>
</linearGradient>
<linearGradient id="{p}rim" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="{RIM_HI}"/><stop offset="1" stop-color="{RIM_LO}"/>
</linearGradient>
<linearGradient id="{p}plate" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="{PLATE_TOP}"/><stop offset="0.45" stop-color="{PLATE_MID}"/><stop offset="1" stop-color="{PLATE_LO}"/>
</linearGradient>
<linearGradient id="{p}glow" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="{GLOW_HI}"/><stop offset="0.5" stop-color="{GLOW_MID}"/><stop offset="1" stop-color="{GLOW_LO}"/>
</linearGradient>
<linearGradient id="{p}ivory" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="{IVORY_HI}"/><stop offset="1" stop-color="{IVORY_LO}"/>
</linearGradient>
<linearGradient id="{p}tile" x1="0" y1="0" x2="0.3" y2="1">
  <stop offset="0" stop-color="#1C2123"/><stop offset="1" stop-color="#070909"/>
</linearGradient>
</defs>"""


def gear_svg(scale=1.0, cx=GEAR_CX, cy=GEAR_CY, r=GEAR_R, outline=GEAR_OUTLINE_W, prefix="", bore=BORE, rim_out=RIM_OUT):
    """Steel gear with dark outline, bevel, and green inner rim. Bore is open."""
    r_in = r * rim_out
    body = gear_ring_path(cx, cy, r, r_in)
    rim = annulus_path(cx, cy, r * rim_out, r * bore)
    # inset bevel: a lighter copy of the ring, slightly smaller, clipped to the body
    return f"""<g>
<path d="{body}" fill-rule="evenodd" fill="{STEEL_OUTLINE}" stroke="{STEEL_OUTLINE}" stroke-width="{outline*0.9:.1f}" stroke-linejoin="round"/>
<path d="{gear_ring_path(cx, cy, r - outline*0.55, r_in + outline*0.35)}" fill-rule="evenodd" fill="url(#{prefix}steel)"/>
<path d="{gear_ring_path(cx, cy, r - outline*1.15, r_in + outline*0.9)}" fill-rule="evenodd" fill="none" stroke="{STEEL_HI}" stroke-opacity="0.35" stroke-width="{outline*0.35:.1f}"/>
<path d="{rim}" fill-rule="evenodd" fill="url(#{prefix}rim)" stroke="{STEEL_OUTLINE}" stroke-width="{outline*0.16:.1f}"/>
</g>"""


def plate_svg(x0=PX0, y0=PY0, x1=PX1, y1=PY1, c=CHAMFER, inset=GLOW_INSET, gw=GLOW_W, accent=True, prefix=""):
    outer = octagon(x0, y0, x1, y1, c)
    ci = c - inset * (math.sqrt(2) - 1)  # keep the inset line's chamfer parallel
    ci = c - inset * 0.414
    inner = octagon(x0 + inset, y0 + inset, x1 - inset, y1 - inset, ci)
    g = f"""<g>
<path d="{outer}" fill="{PLATE_OUTLINE}" stroke="{PLATE_OUTLINE}" stroke-width="10" stroke-linejoin="round"/>
<path d="{octagon(x0+4, y0+4, x1-4, y1-4, c-2)}" fill="url(#{prefix}plate)"/>
<path d="{inner}" fill="none" stroke="{PLATE_OUTLINE}" stroke-opacity="0.6" stroke-width="{gw*1.9:.1f}"/>
"""
    if accent:
        # glow line with the double-slash break at lower right, in source px, scaled to this plate
        sx = (x1 - x0) / (PX1 - PX0); sy = (y1 - y0) / (PY1 - PY0)
        def S(x, y): return (x0 + (x - PX0) * sx, y0 + (y - PY0) * sy)
        yb = y1 - inset            # bottom glow centreline
        # path around the plate, with the break: start after the break, go around, return along the bottom to the break
        b_left = S(1961, yb)[0]
        b_top = S(2075, 770)
        b_resume = S(2058, yb)[0]
        gi = octagon(x0 + inset, y0 + inset, x1 - inset, y1 - inset, ci)
        # draw the closed inner octagon minus the bottom segment between the break points, then the slash pieces
        # simplest faithful approach: full loop, then paint the gap in plate colour, then draw slashes
        g += f'<path d="{gi}" fill="none" stroke="{GLOW_MID}" stroke-opacity="0.22" stroke-width="{gw*3.2:.1f}" stroke-linejoin="round"/>\n'
        g += f'<path d="{gi}" fill="none" stroke="url(#{prefix}glow)" stroke-width="{gw}" stroke-linejoin="round"/>\n'
        g += f'<rect x="{b_left:.1f}" y="{yb-gw:.1f}" width="{b_resume-b_left:.1f}" height="{gw*2:.1f}" fill="{PLATE_LO}"/>\n'
        g += f'<path d="M {b_left:.1f} {yb:.1f} L {b_top[0]:.1f} {b_top[1]:.1f}" stroke="url(#{prefix}glow)" stroke-width="{gw}" stroke-linecap="butt"/>\n'
        s2a = S(1991, 890); s2b = S(2108, 771)
        g += f'<path d="M {s2a[0]:.1f} {s2a[1]:.1f} L {s2b[0]:.1f} {s2b[1]:.1f}" stroke="url(#{prefix}glow)" stroke-width="{gw}" stroke-linecap="butt"/>\n'
    else:
        g += f'<path d="{inner}" fill="none" stroke="{GLOW_MID}" stroke-opacity="0.22" stroke-width="{gw*3.2:.1f}" stroke-linejoin="round"/>\n'
        g += f'<path d="{inner}" fill="none" stroke="url(#{prefix}glow)" stroke-width="{gw}" stroke-linejoin="round"/>\n'
    return g + "</g>"


def letters_svg(outline=7.0, shadow=(5, 6), which=None, prefix=""):
    """Ivory letters with the source's bevel: dark outline, light rim, thin dark ridge, then flat ivory."""
    g = "<g>"
    sel = [L for L in LETTERS if not which or L["name"] in which]
    for L in sel:
        d = poly_path(L["pts"])
        g += (f'<path d="{d}" transform="translate({shadow[0]},{shadow[1]})" fill="{LETTER_SHADOW}" fill-opacity="0.8" '
              f'stroke="{LETTER_SHADOW}" stroke-opacity="0.8" stroke-width="{outline}" stroke-linejoin="round"/>')
    for L in sel:
        d = poly_path(L["pts"]); cp = f'clip-path="url(#{prefix}clip_{L["name"]})"'
        g += f'<path d="{d}" fill="url(#{prefix}ivory)"/>'
        g += f'<path d="{d}" fill="none" stroke="#5F5D55" stroke-width="{outline*3.2:.1f}" stroke-linejoin="round" {cp}/>'
        g += f'<path d="{d}" fill="none" stroke="#B9B2A3" stroke-width="{outline*2.3:.1f}" stroke-linejoin="round" transform="translate({outline*0.3:.1f},{outline*0.3:.1f})" {cp}/>'
        g += f'<path d="{d}" fill="none" stroke="{IVORY_HI}" stroke-width="{outline*2.3:.1f}" stroke-linejoin="round" transform="translate({-outline*0.3:.1f},{-outline*0.3:.1f})" {cp}/>'
        g += f'<path d="{d}" fill="none" stroke="{IVORY_OUTLINE}" stroke-width="{outline}" stroke-linejoin="round"/>'
    return g + "</g>"


def letter_clips(prefix=""):
    return "<defs>" + "".join(
        f'<clipPath id="{prefix}clip_{L["name"]}"><path d="{poly_path(L["pts"])}"/></clipPath>' for L in LETTERS) + "</defs>"


def full_logo_svg(w=SRC_W, h=SRC_H, background=None):
    """The lockup, 1:1 with the source pixel space."""
    bg = f'<rect width="{w}" height="{h}" fill="{background}"/>' if background else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
            + defs() + letter_clips() + bg
            + gear_svg() + plate_svg() + letters_svg() + "</svg>")


def plate_tile_svg(S, chamfer=0.135, accent=True, prefix="", bleed_square=False):
    """The plate itself as the tile: full-bleed chamfered square, glow inset line, double-slash accent."""
    c = S * chamfer
    inset = S * 0.048
    gw = S * 0.020
    outer = f'<rect width="{S}" height="{S}" fill="url(#{prefix}plate)"/>' if bleed_square else \
            f'<path d="{octagon(0, 0, S, S, c)}" fill="url(#{prefix}plate)"/>'
    ci = c - inset * 0.414
    inner = octagon(inset, inset, S - inset, S - inset, ci)
    g = "<g>" + outer
    g += f'<path d="{inner}" fill="none" stroke="{PLATE_OUTLINE}" stroke-opacity="0.55" stroke-width="{gw*1.9:.1f}" stroke-linejoin="round"/>'
    g += f'<path d="{inner}" fill="none" stroke="{GLOW_MID}" stroke-opacity="0.22" stroke-width="{gw*3.2:.1f}" stroke-linejoin="round"/>'
    g += f'<path d="{inner}" fill="none" stroke="url(#{prefix}glow)" stroke-width="{gw:.1f}" stroke-linejoin="round"/>'
    if accent:
        # source accent, in units of plate height (670): break 0.837H left of the right edge,
        # first slash rises 0.173H at 45 deg, second slash 0.030H to its right, line resumes 0.693H
        H = S; x1 = S - inset; yb = S - inset
        bx = x1 - 0.30 * H; rise = 0.155 * H
        g += f'<rect x="{bx:.1f}" y="{yb-gw:.1f}" width="{0.11*H:.1f}" height="{gw*2:.1f}" fill="url(#{prefix}plate)"/>'
        g += f'<path d="M {bx:.1f} {yb:.1f} L {bx+rise:.1f} {yb-rise:.1f}" stroke="url(#{prefix}glow)" stroke-width="{gw:.1f}"/>'
        g += f'<path d="M {bx+0.058*H:.1f} {yb+gw*0.5:.1f} L {bx+0.058*H+rise+gw*0.5:.1f} {yb-rise:.1f}" stroke="url(#{prefix}glow)" stroke-width="{gw:.1f}"/>'
    return g + "</g>"


def icon_svg(size=512, mode="stack", maskable=False, k=None):
    """
    'stack' : the plate as the tile, gear above, IDEA wordmark below (>= 128 px)
    'mark'  : the plate as the tile, the gear alone, large (<= 96 px)
    """
    S = size
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}" height="{S}">', defs(), letter_clips()]
    parts.append(plate_tile_svg(S, accent=(mode == "stack"), bleed_square=maskable))
    if k is None:
        k = 0.86 if maskable else 1.0
    if mode == "stack":
        r = S * 0.295 * k
        sc = r / GEAR_R
        gx, gy = S * 0.5, S * (0.5 - 0.115 * k)
        parts.append(f'<g transform="translate({gx - GEAR_CX*sc:.2f},{gy - GEAR_CY*sc:.2f}) scale({sc:.5f})">'
                     + gear_svg(outline=GEAR_OUTLINE_W * 1.25) + "</g>")
        # wordmark ink box 565..2369 x 355..784
        lw, lh = 2369 - 565, 784 - 355
        ls = S * 0.72 * k / lw
        lx = S / 2 - lw * ls / 2 - 565 * ls
        ly = S * (0.5 + 0.315 * k) - lh * ls / 2 - 355 * ls
        parts.append(f'<g transform="translate({lx:.2f},{ly:.2f}) scale({ls:.5f})">'
                     + letters_svg(outline=9, shadow=(7, 8)) + "</g>")
    else:
        r = S * 0.39 * k
        sc = r / GEAR_R
        parts.append(f'<g transform="translate({S/2 - GEAR_CX*sc:.2f},{S/2 - GEAR_CY*sc:.2f}) scale({sc:.5f})">'
                     + gear_svg(outline=GEAR_OUTLINE_W * 1.9, bore=0.56, rim_out=0.63) + "</g>")
    parts.append("</svg>")
    return "\n".join(parts)


if __name__ == "__main__":
    import sys
    import cairosvg
    out = sys.argv[1] if len(sys.argv) > 1 else "v2"
    os.makedirs(out, exist_ok=True)
    open(f"{out}/IDEA_logo_vector.svg", "w").write(full_logo_svg())
    cairosvg.svg2png(bytestring=full_logo_svg().encode(), write_to=f"{out}/IDEA_logo_vector_1280.png", output_width=1280)
    for mode in ("stack", "mark"):
        svg = icon_svg(512, mode)
        open(f"{out}/icon_{mode}.svg", "w").write(svg)
        for px in (512, 180, 64, 32, 16):
            cairosvg.svg2png(bytestring=svg.encode(), write_to=f"{out}/icon_{mode}_{px}.png", output_width=px, output_height=px)
    print("ok")
