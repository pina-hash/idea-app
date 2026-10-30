"""Shared pieces for the hook project's kit sources (Hook 02 to Hook 04).

Diagrams are Mr. Pina's Rotation 2 figures (fig/fNN.svg, class "fg"), styled by fig/fig.css on
the kit's roles. Videos are his own: the printing walkthrough and the six Simulate videos.
"""
import html, json, pathlib

HERE = pathlib.Path(__file__).parent
FIG = HERE / 'fig'
esc = html.escape


def fig(n, color='filament-orange', caption=None, cls=''):
    svg = (FIG / f'f{n:02d}.svg').read_text().strip()
    cap = f'<figcaption>{caption}</figcaption>' if caption else ''
    return (f'<figure class="hx-fig r2 r2-no {cls}" data-color="stress-high"><div class="r2" data-color="{color}">'
            f'{svg}</div>{cap}</figure>')


def fig_css():
    return (FIG / 'fig.css').read_text()


def symbol():
    return (FIG / 'symbol.svg').read_text().strip()


def thumb(vid):
    return (FIG / f'thumb-{vid}.txt').read_text().strip()


def image_box(field, empty='Click here, then Ctrl+V. Or press Choose file.', optional=False, small=False):
    opt = ' data-optional' if optional else ''
    wrap_a, wrap_b = ('<div class="hk-small">', '</div>') if small else ('', '')
    return (f'{wrap_a}<div class="hx-box" data-image-box="{field}"{opt} data-empty="{esc(empty)}">{esc(empty)}</div>{wrap_b}'
            f'<input type="file" data-field="{field}"{opt} accept="image/*" hidden>'
            f'<div class="hx-row hx-edit-only"><button type="button" class="idea-key" data-edits data-choose="{field}">Choose file</button>'
            f'<button type="button" class="idea-key" data-edits data-remove="{field}" hidden>Remove</button></div>'
            f'<p class="hx-note" data-file-note="{field}"></p>')


def video(vid, title, chapters=None, box_id=None):
    """A video card (his own frame, a play badge) with optional chapter keys that start it at a time."""
    bid = f' id="{box_id}"' if box_id else ''
    keys = ''
    if chapters:
        keys = '<div class="hk-chapters">' + ''.join(
            f'<button type="button" class="idea-key hk-ch" data-chapter-for="{vid}" data-start="{sec}">'
            f'<span>{esc(label)}</span><small>{sec // 60}:{sec % 60:02d}</small></button>'
            for label, sec in chapters) + '</div>'
    return (f'<div class="hk-vid"><div class="hx-video" data-video="{vid}"{bid}>'
            f'<img src="{thumb(vid)}" alt="" loading="lazy"><span class="hk-play" aria-hidden="true">'
            f'<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></span></div>'
            f'<div class="hk-vmeta"><small>Mr. Pina · video</small><b>{esc(title)}</b>'
            f'<button type="button" class="idea-key" data-chapter-for="{vid}" data-start="0">Play</button></div></div>{keys}')


SPOTS = [  # (value, label, hint, figure)
    ('top', 'Top hole', 'The ring around the top hole.', 30),
    ('neck', 'Neck', 'Just under the top ring.', 31),
    ('shank', 'Shank', 'The straight middle.', 32),
    ('throat', 'Throat', 'Where the shank turns into the bowl.', 33),
    ('bowl', 'Bowl', 'The bottom of the curve.', 34),
    ('tip', 'Tip', 'The end of the hook, by the opening.', 35),
    ('joint', 'The joint', 'Multi-part: where the pieces meet.', 36),
    ('other', 'Somewhere else', 'Say where.', 37),
]

MODES = [
    ('snapped', 'It snapped', 'A clean break into pieces.', 24),
    ('opened', 'It pulled open', 'It bent until it let go.', 25),
    ('layers', 'Layers split', 'The printed layers peeled apart.', 26),
    ('joint', 'The joint let go', 'Multi-part pieces came apart.', 27),
    ('other', 'Something else', 'Say what you saw.', 28),
]


def svg_inline(n):
    return (FIG / f'f{n:02d}.svg').read_text().strip()


def picture_picks(field, legend, options, color='filament-orange'):
    keys = ''.join(
        f'<label class="hx-pick hk-pp" title="{esc(hint)}"><input type="radio" name="{field}" value="{v}">'
        f'<span class="r2 r2-no hk-ppfig" data-color="stress-high"><span class="r2" data-color="{color}">{svg_inline(n)}</span></span>'
        f'<b>{esc(lab)}</b></label>'
        for v, lab, hint, n in options)
    return (f'<fieldset class="hx-picks hk-ppset" data-field="{field}" data-kind="radio">'
            f'<legend>{legend}</legend>{keys}</fieldset>')


KIT_CSS = '''
  .hk-vid { display: grid; grid-template-columns: minmax(0, 190px) minmax(0, 1fr); gap: var(--space-2) var(--space-3); align-items: center; }
  .hk-vid .hx-video img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .hk-play { position: absolute; right: 6px; bottom: 6px; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: rgba(0,0,0,.62); color: var(--screen-ink); }
  .hk-play svg { width: 16px; height: 16px; }
  .hk-vmeta { display: grid; gap: 4px; justify-items: start; }
  .hk-vmeta small { font-family: var(--font-mono); font-size: 0.66rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--caption); }
  .hk-vmeta b { color: var(--plate-ink); line-height: 1.25; }
  @container (max-width: 26rem) { .hk-vid { grid-template-columns: 1fr; } }
  .hk-chapters { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(130px, 100%), 1fr)); gap: 6px; }
  .hk-ch { display: grid; justify-items: start; gap: 2px; text-align: left; white-space: normal; line-height: 1.2; min-width: 0; }
  .hk-ch span { overflow-wrap: anywhere; }
  .hk-ch small { font-family: var(--font-mono); color: var(--caption); }
  .hk-small .hx-box { aspect-ratio: auto; height: 84px; min-height: 84px; }
  .hk-ppset { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  @container (max-width: 34rem) { .hk-ppset { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .hk-pp b { font-size: 0.86rem; line-height: 1.15; }
  .hx-evidence .hx-box { width: min(100%, 250px); }
  .hk-figcap .fg { max-height: 120px; }
  .hx-picks label.hx-pick.hk-pp { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0; padding-top: 6px; padding-bottom: 6px; }
  .hk-pp input { align-self: flex-start; }
  .hk-pp .hk-ppfig.r2 { display: block; width: 64px; max-width: 100%; flex: none; }
  .hk-pp .hk-ppfig > .r2 { display: block; width: 100%; }
  .hk-pp { min-width: 0; }
  .hk-ppfig .fg { max-height: 60px; }
  .hk-pp small { font-family: var(--font-display); text-transform: none; letter-spacing: 0; font-size: 0.78rem; color: var(--text-2); line-height: 1.2; }
  .hk-figs { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); gap: var(--space-3); align-items: start; }
  .hk-figs .r2 .fg { max-height: 170px; }
  .hk-num { font-family: var(--font-mono); white-space: nowrap; }
  .hx-hero-art .r2 .fg { max-height: 190px; }
'''

KIT_JS = '''
/* Chapter keys: start the video at a time (the portal plays it over its box). */
document.addEventListener('click', function (e) {
  var k = e.target.closest ? e.target.closest('[data-chapter-for]') : null;
  if (!k) return;
  var scope = k.closest('.hx-step') || document;
  var box = scope.querySelector('[data-video="' + k.dataset.chapterFor + '"]');
  if (!box) return;
  box.dataset.start = k.dataset.start;
  if (typeof hxPlay === 'function') hxPlay(box);
});
'''
