"""The hook project's header pictures and class-list thumbnails (Mr. Pina 2026-10-30: "make it
look really badass"). One 3D hook, beveled with a real lighting filter, that changes with the
project: a concept with its rule dimensions (Hook 01), a CAD part (SolidWorks Day), a print with
layer lines (Hook 02), an FEA stress plot (Hook 03), the final version with its call (Hook 04),
and the pull (Hook 05).
"""

# The hook outline: eye at the top, shank, a bowl that thickens at the bottom, a tapered tip.
EYE = ('M66 10 a36 36 0 1 0 0.01 0 Z M66 28 a18 18 0 1 1 -0.01 0 Z')
BODY = ('M50 74 L50 150 A58 58 0 1 0 158.2 121 L151 103 A6.5 6.5 0 0 0 138.6 107 '
        'L133.2 131.4 A29 29 0 1 1 82 150 L82 74 Z')
HOOK_BOX = (0, 0, 176, 212)   # the hook's own extent


def _defs(uid, stage):
    """Gradients and the bevel filter. Every id is suffixed so two pictures on a page never clash."""
    mats = {
        'concept': ('#f6a35a', '#c8641c', '#7a3510'),
        'cad': ('#ff6f5e', '#d1291b', '#7d140c'),
        'print': ('#f6a35a', '#d8701f', '#7a3510'),
        'fea': None,
        'final': ('#f6a35a', '#d8701f', '#7a3510'),
        'pull': ('#f6a35a', '#d8701f', '#7a3510'),
    }
    m = mats[stage]
    if m:
        mat = (f'<linearGradient id="m{uid}" x1="0" y1="0" x2="1" y2="1">'
               f'<stop offset="0" stop-color="{m[0]}"/><stop offset=".55" stop-color="{m[1]}"/>'
               f'<stop offset="1" stop-color="{m[2]}"/></linearGradient>')
    else:  # the FEA plot: blue at the eye, through green and yellow, red at the bottom of the bowl
        mat = (f'<linearGradient id="m{uid}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="212">'
               '<stop offset="0" stop-color="#2f5bea"/><stop offset=".35" stop-color="#21b5d6"/>'
               '<stop offset=".55" stop-color="#3fd17a"/><stop offset=".72" stop-color="#f2d23a"/>'
               '<stop offset=".88" stop-color="#f07a26"/><stop offset="1" stop-color="#e5352b"/></linearGradient>')
    bevel = (f'<filter id="b{uid}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">'
             '<feGaussianBlur in="SourceAlpha" stdDeviation="3.2" result="bl"/>'
             '<feSpecularLighting in="bl" surfaceScale="5" specularConstant=".9" specularExponent="22" lighting-color="#fff" result="sp">'
             '<feDistantLight azimuth="225" elevation="42"/></feSpecularLighting>'
             '<feComposite in="sp" in2="SourceAlpha" operator="in" result="spi"/>'
             '<feComposite in="SourceGraphic" in2="spi" operator="arithmetic" k1="0" k2="1" k3=".75" k4="0" result="lit"/>'
             '<feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity=".45"/>'
             '</filter>')
    layers = (f'<pattern id="l{uid}" width="6" height="3.2" patternUnits="userSpaceOnUse">'
              '<rect width="6" height="1.1" fill="#000" opacity=".22"/></pattern>')
    steel = (f'<linearGradient id="s{uid}" x1="0" y1="0" x2="0" y2="1">'
             '<stop offset="0" stop-color="#e9edf2"/><stop offset=".45" stop-color="#9aa4b1"/>'
             '<stop offset="1" stop-color="#4b525c"/></linearGradient>')
    return f'<defs>{mat}{bevel}{layers}{steel}</defs>'


def _hook(uid, stage, x, y, s):
    """The hook at (x, y), scale s, with the stage's surface."""
    over = ''
    if stage == 'print':
        over = f'<g fill="url(#l{uid})"><path d="{EYE}" fill-rule="evenodd"/><path d="{BODY}"/></g>'
    if stage == 'pull':  # the break: a jagged crack across the bowl, glowing at its lips
        crack = 'M64 194 L72 186 L69 180 L78 176 L76 170 L86 168'
        over = (f'<path d="{crack}" fill="none" stroke="#ff5a3c" stroke-width="7" opacity=".45" stroke-linecap="round" stroke-linejoin="round"/>'
                f'<path d="{crack}" fill="none" stroke="#1a0b05" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>')
    return (f'<g transform="translate({x} {y}) scale({s})"><g filter="url(#b{uid})" fill="url(#m{uid})">'
            f'<path d="{EYE}" fill-rule="evenodd"/><path d="{BODY}"/></g>{over}</g>')


def _rig(uid, x, y, s):
    """The steel dowel through the eye, and the strap in the bowl pulling down."""
    return (f'<g transform="translate({x} {y}) scale({s})">'
            f'<rect x="20" y="20" width="92" height="16" rx="8" fill="url(#s{uid})"/>'
            '<rect x="20" y="22" width="92" height="3" rx="1.5" fill="#fff" opacity=".55"/>'
            '</g>')


def hero(stage):
    """The header picture: a 400 x 200 scene. Words sit at 16 or more in the scene, about 11px at its
    smallest drawn width. Colors that sit on the page come from the page's own tokens."""
    uid = 'h' + stage
    hx, hy, hs = 38, 8, 0.86
    hook = _hook(uid, stage, hx, hy, hs)
    cy = hy + 46 * hs          # the hole's center: the dowel runs through it
    dowel = (f'<rect x="8" y="{cy - 7:.1f}" width="190" height="14" rx="7" fill="url(#s{uid})"/>'
             f'<rect x="8" y="{cy - 5.5:.1f}" width="190" height="3" rx="1.5" fill="#fff" opacity=".6"/>')
    mono = 'font-family="Share Tech Mono, monospace"'
    ink, cap = 'var(--plate-ink, #e8eaed)', 'var(--caption, #9aa0a6)'
    red = '#e5352b'
    big = f'{mono} font-size="30" fill="{ink}"'
    small = f'{mono} font-size="16" fill="{cap}" letter-spacing="1"'
    right = ''
    if stage == 'concept':
        right = (f'<g stroke="{cap}" stroke-width="1.6" fill="none"><path d="M214 48 H228 M214 150 H228 M221 50 V148"/><path d="M216 57 L221 49 L226 57 M216 141 L221 149 L226 141"/></g>'
                 f'<text x="240" y="92" {small}>CENTER TO CENTER</text><text x="240" y="126" {big}>2 TO 3 IN</text>'
                 f'<text x="240" y="160" {small}>50.0 G MAX</text>')
    elif stage == 'cad':
        right = (f'<g transform="translate(262 128)" stroke-width="4" stroke-linecap="round">'
                 f'<path d="M0 0 L56 -22" stroke="{red}"/><path d="M0 0 L0 -66" stroke="#3fd17a"/><path d="M0 0 L-40 -24" stroke="#2f7bea"/></g>'
                 f'<text x="216" y="172" {small}>V1_LASTNAME</text>')
    elif stage == 'print':
        right = (f'<g transform="translate(224 34)"><rect width="150" height="24" rx="6" fill="var(--panel-top, #2a2d31)" stroke="{cap}" stroke-width="1"/>'
                 f'<path d="M64 24 h22 l-6 16 h-10 Z" fill="url(#s{uid})"/><circle cx="75" cy="45" r="3.2" fill="#f6a35a"/></g>'
                 f'<text x="224" y="118" {big}>50%</text><text x="224" y="146" {small}>TEST COPY, ABS</text>'
                 f'<rect x="224" y="160" width="150" height="7" rx="3.5" fill="var(--panel-top, #2a2d31)"/><rect x="224" y="160" width="74" height="7" rx="3.5" fill="#f6a35a"/>')
    elif stage == 'fea':
        stops = ['#e5352b', '#f07a26', '#f2d23a', '#3fd17a', '#21b5d6', '#2f5bea']
        bar = ''.join(f'<rect x="222" y="{28 + i * 24}" width="18" height="24" fill="{c}"/>' for i, c in enumerate(stops))
        right = (f'{bar}<rect x="222" y="28" width="18" height="144" rx="2" fill="none" stroke="{cap}" stroke-width="1"/>'
                 f'<text x="252" y="44" {small}>MAX</text><text x="252" y="170" {small}>MIN</text>'
                 f'<text x="282" y="112" {big}>400</text><text x="282" y="136" {small}>LBF</text>')
    elif stage == 'final':
        right = (f'<text x="224" y="70" {small}>YOUR CALL</text><text x="224" y="122" {mono} font-size="48" fill="{ink}">? LB</text>'
                 f'<rect x="224" y="138" width="140" height="4" rx="2" fill="#f6a35a"/><text x="224" y="166" {small}>BEFORE THE PULL</text>')
    elif stage == 'pull':
        right = (f'<g transform="translate(296 128)"><path d="M-62 0 A62 62 0 0 1 62 0" fill="none" stroke="var(--panel-top, #2a2d31)" stroke-width="12" stroke-linecap="round"/>'
                 f'<path d="M-62 0 A62 62 0 0 1 44 -44" fill="none" stroke="{red}" stroke-width="12" stroke-linecap="round"/>'
                 f'<path d="M0 0 L40 -40" stroke="{ink}" stroke-width="4" stroke-linecap="round"/><circle r="7" fill="{ink}"/></g>'
                 f'<text x="296" y="166" text-anchor="middle" {small}>PEAK LOAD</text>')
    return (f'<svg viewBox="0 0 400 200" role="img" aria-label="The hook project">{_defs(uid, stage)}'
            f'{dowel}{hook}{right}</svg>')


THUMB_BG = {  # dark and light grounds per stage, and the label ink
    'concept': ('#2b2018', '#141112', '#e8dfd6', '#fbeee2', '#ecd9c6', '#2c2420'),
    'cad': ('#2e1616', '#141112', '#ece2df', '#fbe7e4', '#efd2cd', '#2c2220'),
    'print': ('#2b2018', '#141112', '#e8dfd6', '#fbeee2', '#ecd9c6', '#2c2420'),
    'fea': ('#18203a', '#121318', '#e3e6ee', '#e6ecfa', '#d2dbef', '#222630'),
    'final': ('#2b2018', '#141112', '#e8dfd6', '#fbeee2', '#ecd9c6', '#2c2420'),
    'pull': ('#1e2228', '#121416', '#e6e9ee', '#e9edf2', '#d3dae3', '#20252c'),
}


def thumbnail(stage, kicker, title):
    """The class-list picture: the same hook, big and beveled, with the post's name beside it on wide shapes."""
    uid = 't' + stage
    a, b, line, la, lb, lline = THUMB_BG[stage]
    return f'''<template id="idea-thumbnail">
<style>
  :root {{ --a: {a}; --b: {b}; --line: {line}; }}
  :root[data-idea-scheme="light"] {{ --a: {la}; --b: {lb}; --line: {lline}; }}
  .t {{ position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 5%; background: radial-gradient(120% 140% at 20% 30%, var(--a), var(--b) 75%); color: var(--line); font: 700 clamp(11px, 30vh, 22px)/1 Rajdhani, system-ui, sans-serif; white-space: nowrap; overflow: hidden; }}
  .t svg {{ height: 86%; overflow: visible; flex: none; }}
  .t span {{ display: none; }}
  .t small {{ display: block; font: 400 max(11px, 0.6em)/1.2 "Share Tech Mono", monospace; opacity: 0.8; letter-spacing: 0.12em; }}
  :root[data-idea-shape="wide"] .t, :root[data-idea-shape="banner"] .t {{ justify-content: flex-start; padding-left: 5%; }}
  :root[data-idea-shape="wide"] .t span, :root[data-idea-shape="banner"] .t span {{ display: block; }}
  :root[data-idea-shape="wide"] .t svg {{ height: 62%; }}
  :root[data-idea-shape="wide"] .t span {{ white-space: normal; line-height: 1.05; max-width: 58%; }}
</style>
<div class="t">
  <svg viewBox="-6 -4 190 222" aria-hidden="true">{_defs(uid, stage)}{_hook(uid, stage, 0, 0, 1)}</svg>
  <span><small>{kicker}</small>{title}</span>
</div>
</template>'''


import re as _re


def inject(html, stage, kicker, title):
    """Put this stage's header picture and thumbnail into a built page source."""
    html, n1 = _re.subn(r'<template id="idea-thumbnail">.*?</template>', lambda m: thumbnail(stage, kicker, title), html, count=1, flags=_re.S)
    html, n2 = _re.subn(r'(<div class="hx-hero-art"[^>]*>).*?(</div>\s*</header>)', lambda m: m.group(1) + hero(stage) + m.group(2), html, count=1, flags=_re.S)
    assert n1 == 1 and n2 == 1, (n1, n2)
    return html
