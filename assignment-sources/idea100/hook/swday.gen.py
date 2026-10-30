"""Build SolidWorks Day (IDEA100, hook project) on the hx-kit from the Rotation 2 page's own data.

swday-data.json is the data object cut from Rotation 2's SolidWorks Day (steps, his 16 SolidWorks
Basics videos with their frames, the step pictures, and the 105-entry Unstuck list). This script
writes swday.src.html; build it with tools/hx-kit/build.mjs.
"""
import json, html, pathlib, re

here = pathlib.Path(__file__).parent
D = json.loads((here / 'swday-data.json').read_text())
E = {e['id']: e for e in D['entries']}
esc = html.escape

# Rotation 3 keeps every part file in IDEA Armory, so the hand-in entries change.
E['attach-file'].update({
    'title': 'Hand in my part file',
    'fix': 'Nothing to upload. Save the part into your own Armory folder: Armory keeps it, and I grade it from there.',
    'steps': [{'t': 'Ctrl+S. In the Save As box, open your Armory folder: IDEA 100, then Last_First.', 'w': 'menu'},
              {'t': 'Name it the way the step says, with your own last name.', 'w': 'keyboard'},
              {'t': 'Save and close the part when you leave: that checks it in.', 'w': 'menu'}],
    'why': 'Armory keeps every version of every file, on every lab computer.',
})
E['paste-shot'].update({
    'fix': 'Click the picture box in the step, then press Ctrl+V.',
    'steps': [{'t': 'Click the picture box so it is outlined.', 'w': 'graphics'},
              {'t': 'Press Ctrl+V. The picture appears and saves.', 'w': 'keyboard'},
              {'t': 'Wrong picture? Press Remove, then paste again.', 'w': 'graphics'}],
})
E['save']['steps'][2:2] = [{'t': 'In the Save As box, open your Armory folder: IDEA 100, then your own folder, like Lopez_Maria.', 'w': 'menu'}]
E['screenshot']['steps'][2] = {'t': 'Click the picture box in the step, then press Ctrl+V.', 'w': 'keyboard'}
E['armory-folder'] = {'id': 'armory-folder', 'title': 'I cannot find my Armory folder in the Save As box', 'q': 'armory; folder; where do i save; cant find folder; save as; my folder; last_first',
  'fix': 'Save it to Documents for now with the right name, finish the step, and raise your hand. It moves into Armory later.', 'steps': [], 'why': 'Your work is never lost by saving it somewhere else first.'}

WHERE = {'savebox': 'the Save As box', 'menu': 'the menus at the top', 'units': 'the bottom-right corner', 'keyboard': 'your keyboard',
         'tree': 'the tree on the left', 'graphics': 'the big part area', 'ribbon': 'the tool buttons under the tabs',
         'status': 'the bottom-right corner', 'property': 'the panel on the left', 'mouse': 'your mouse',
         'corner': 'the top-right corner of the part', 'tabs': 'the tabs at the top'}

def vid_index(n):
    return D['stepVid'][str(n)]  # 1-based into D['vids']

def video(i, label='Watch the video'):
    v = D['vids'][i - 1]
    thumb = D['thumbs'][i - 1]
    return (f'<div class="sw-vid"><div class="hx-video" data-video="{v["id"]}">'
            f'<img src="{thumb}" alt="" loading="lazy"><span class="sw-play" aria-hidden="true">'
            f'<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></span></div>'
            f'<button type="button" class="idea-key" data-play="{v["id"]}">{esc(label)}</button>'
            f'<small class="sw-vt">{esc(v["t"].split(": ", 1)[-1])}</small></div>')

def stuck(ids):
    rows = ''.join(f'<tr><td>{esc(E[i]["title"])}</td><td>{esc(E[i]["fix"])}</td></tr>' for i in ids if i in E)
    return ('<details class="hx-stuck"><summary>That is not what I see</summary>'
            f'<table>{rows}</table>'
            '<div class="sw-unstuck" data-unstuck><label>Something else? Search 105 fixes'
            '<input class="idea-well idea-well--field" type="search" data-unstuck-q placeholder="e.g. my lines are red"></label>'
            '<ol class="sw-hits" data-unstuck-hits></ol></div></details>')

GLOSS = D.get('gloss', {})
USED = set()
def term(text):
    t = esc(text)
    for g in sorted(GLOSS, key=len, reverse=True):
        if g in USED: continue
        i = t.find(esc(g))
        if i >= 0 and '<span' not in t[max(0, i - 40):i]:
            USED.add(g)
            t = t[:i] + f'<span class="it" data-term="{esc(g)}">{esc(g)}</span>' + t[i + len(esc(g)):]
    return t

def moves(do):
    return '<ol class="hx-do">' + ''.join(
        f'<li><span>{term(t)} <small class="sw-where">{esc(WHERE.get(w, w))}</small></span></li>' for t, w in do) + '</ol>'

def pic(key):
    svg = D['pics'][key]
    svg = re.sub(r'^<svg class="fig"', '<svg', svg)
    return f'<figure class="hx-fig sw-pic">{svg}</figure>'

def image_box(field, label, optional=False):
    opt = ' data-optional' if optional else ''
    empty = 'Click here, then Ctrl+V the screenshot'
    return (f'<div class="hx-box" data-image-box="{field}"{opt} data-empty="{empty}">{empty}</div>'
            f'<input type="file" data-field="{field}"{opt} accept="image/*" hidden>'
            f'<div class="hx-row hx-edit-only"><button type="button" class="idea-key" data-edits data-choose="{field}">Choose file</button>'
            f'<button type="button" class="idea-key" data-edits data-remove="{field}" hidden>Remove</button></div>'
            f'<p class="hx-note" data-file-note="{field}"></p>')

# ---- steps ----------------------------------------------------------------
steps_html = []
blocks_wrench, blocks_drill = [], []
for st in D['steps']:
    n = st['n']
    do = [list(x) for x in st['do']]
    if n == 1:
        do[3][0] = ('Type SWDAY_ then YOUR OWN last name (Maria Lopez types SWDAY_LOPEZ). '
                    'Before Save, open your Armory folder: IDEA 100, then your own folder (hers is Lopez_Maria).')
        do[3][1] = 'savebox'
        do.append(['Screenshot: Windows + Shift + S, drag over the whole SolidWorks window. Click the box on the right, Ctrl+V. Every step ends the same way.', 'keyboard'])
    if n == 13:
        do[0][0] = 'New part. Save it as DRILL_ and your last name: drill 2 and 3 keep using it. Front Plane, Sketch.'
    if n == 6:
        do[2][0] = 'Screenshot the warning now. Then click the red X and press Ctrl+Z until the top line is back.'
    drill = st['part'] == 'drill'
    field = f's{n}' if not drill else f'd{n - 12}'
    bid = f'swd-step-{n:02d}' if not drill else f'swd-drill-{n - 12}'
    title = st['title']
    phase = 'wrench' if not drill else 'drills'
    tag = 'The wrench' if not drill else f'Drill {n - 12} · IDEA Coins, not points'
    prompt = (f'Wrench step {n} screenshot: {title.lower()}' if not drill
              else f'Drill {n - 12} screenshot: {title.lower()}')
    (blocks_wrench if not drill else blocks_drill).append(
        {"id": bid, "field": field, "type": "image", "prompt": prompt, **({"optional": True} if drill else {})})
    goal = f'<p><strong>Goal:</strong> {esc(st["goal"])} Try it first; the moves are the hints.</p>' if drill else ''
    oops = f'<p class="hx-note">{esc(st["oops"])}</p>' if st.get('oops') else ''
    body_moves = (f'<details class="hx-more"><summary>Hints: the moves</summary>{moves(do)}</details>' if drill else moves(do))
    opt = ' data-optional' if drill else ''
    steps_html.append(f'''
  <section class="hx-step idea-panel" id="s-{field}" data-phase="{phase}" data-title="{esc(title)}"{opt}>
    <div class="hx-step-head"><div><span class="hx-phase-tag">{esc(tag)}</span><h2>{esc(title)}</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        {goal}{body_moves}{oops}
        <p class="hx-see">{esc(st["shot"])}</p>
        {video(vid_index(n))}
        {stuck(st.get("help", []) + (['armory-folder', 'screenshot', 'paste-shot'] if n == 1 else ['paste-shot']))}
      </div>
      <div class="hx-stack">
        {pic(st["pic"])}
        <div class="hx-evidence idea-panel"{' data-graded="no"' if drill else ''}>
          <span class="idea-eyebrow">{'Your drill' if drill else 'Your screenshot'}</span>
          <p class="hx-note">{'Your drill, whole window.' if drill else 'The whole SolidWorks window: SWDAY_ and your name at the top, the part, the tree.'}</p>
          {image_box(field, prompt, drill)}
        </div>
      </div>
    </div>
  </section>''')

wrench_steps = [s for s in steps_html if 'data-phase="wrench"' in s]
drill_steps = [s for s in steps_html if 'data-phase="drills"' in s]

hook_step = f'''
  <section class="hx-step idea-panel" id="s-hook" data-phase="hook" data-title="Start your V1">
    <div class="hx-step-head"><div><span class="hx-phase-tag">Your hook</span><h2>Start your V1</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <p>Same moves, your design. No demo: the wrench, the videos and the fixes are your help.</p>
        <ol class="hx-do">
          <li><span>Pick one of your sketches from Hook 01. Find its two circles: the top hole and the bottom curve.</span></li>
          <li><span>New part, IPS. Ctrl+S into your Armory folder as <strong>V1_</strong> and your last name. Multi-part? The first piece is <strong>V1A_</strong>.</span></li>
          <li><span>Front Plane, Sketch. Two circles: top hole <strong>1.000</strong> or bigger, bottom inside <strong>1.000</strong> or bigger, centers <strong>2.000 to 3.000</strong> apart.</span></li>
          <li><span>Draw the outside around them, trim to one outline. Opening <strong>0.500</strong> or more. Extrude <strong>0.750</strong> or thinner.</span></li>
          <li><span>Not done? Fine. Ctrl+S and screenshot what you have. You keep building it next class.</span></li>
        </ol>
        <p class="hx-see">Your own hook taking shape, with V1_ and your last name at the very top of SolidWorks.</p>
        {stuck(['hook-start', 'trace-sketch', 'hole-in-sketch', 'offset', 'open-contour', 'armory-folder'])}
      </div>
      <div class="hx-stack">
        {pic('recipe')}
        <div class="hx-evidence idea-panel">
          <span class="idea-eyebrow">Your V1 so far</span>
          <p class="hx-note">The whole window: V1_ and your name at the top, your two rule circles sized in the sketch.</p>
          {image_box('ownShot', 'Screenshot of your V1 so far')}
        </div>
      </div>
    </div>
  </section>
  <section class="hx-step idea-panel" id="s-hook-note" data-phase="hook" data-title="Say how it went">
    <div class="hx-step-head"><div><span class="hx-phase-tag">Your hook</span><h2>Say how it went</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <p>Two sentences: what you built, and the one thing that stopped you or that you figured out alone.</p>
        <p><strong>You're done after this step.</strong> Time left? The three drills are next: IDEA Coins, not points.</p>
        <p class="hx-note">Up next: <strong>Hook 02</strong>. You finish V1, measure it against the rules, and print a half-size copy.</p>
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">How it went</span>
        <label>What you made, and what stopped you or what you figured out alone
          <textarea class="idea-well" data-field="ownNote" data-min-sentences="2" placeholder="e.g. I got as far as ... I was stuck on ... until ..."></textarea>
        </label>
        <p class="idea-chip" data-count-for="ownNote" data-min="2">0 of 2 sentences</p>
      </div>
    </div>
  </section>'''

manifest = {
    "schemaVersion": 3, "kind": "html-assignment", "title": "SolidWorks Day", "course": "IDEA100", "points": 10,
    "thumbnail": {"kind": "html", "template": "idea-thumbnail"},
    "modules": [
        {"id": "swd-wrench", "title": "The wrench", "points": 6, "audience": "individual", "blocks": blocks_wrench,
         "criteria": [{"id": "steps", "text": "A screenshot for every wrench step, each showing what its step asks for", "points": 6,
                       "levels": [
                           {"points": 6, "label": "Complete", "short": "All twelve", "descriptor": "Twelve screenshots, each showing what its step's You should see line describes."},
                           {"points": 4, "label": "Proficient", "short": "Nine to eleven", "descriptor": "Nine to eleven steps have a matching screenshot."},
                           {"points": 2, "label": "Developing", "short": "One to eight", "descriptor": "One to eight steps have a matching screenshot."},
                           {"points": 0, "label": "Absent", "short": "None", "descriptor": "No screenshots."}]}]},
        {"id": "swd-hook", "title": "Your V1", "points": 4, "audience": "individual",
         "blocks": [{"id": "swd-hook-shot", "field": "ownShot", "type": "image", "prompt": "Screenshot of your V1 so far, file name showing"},
                    {"id": "swd-hook-note", "field": "ownNote", "type": "longText", "minSentences": 2, "prompt": "What you made so far, and what stopped you or what you figured out alone"}] + blocks_drill,
         "criteria": [
             {"id": "start", "text": "V1 is started from the student's own sketch and saved under the V1_ name", "points": 2,
              "levels": [{"points": 2, "label": "Complete", "short": "Started, named", "descriptor": "The screenshot shows V1_ and the student's last name at the top, and at least the two rule circles sized from their own sketch."},
                         {"points": 1, "label": "Developing", "short": "Misnamed or empty", "descriptor": "A part, but misnamed, or nothing from their own design in it yet."},
                         {"points": 0, "label": "Absent", "short": "No screenshot", "descriptor": "No screenshot."}]},
             {"id": "note", "text": "Two sentences on what was made and what stopped them or what they solved alone", "points": 2,
              "levels": [{"points": 2, "label": "Complete", "short": "Both, specific", "descriptor": "Says what they built and names a specific problem and what they did about it."},
                         {"points": 1, "label": "Developing", "short": "Vague", "descriptor": "One sentence, or nothing specific."},
                         {"points": 0, "label": "Absent", "short": "Blank", "descriptor": "Nothing written."}]}]},
    ],
}

kb = [{k: e.get(k) for k in ('id', 'title', 'q', 'fix', 'steps', 'why')} for e in E.values()]

tpl = (here / 'swday.tpl.html').read_text()
out = (tpl.replace('%%MANIFEST%%', json.dumps(manifest, indent=1, ensure_ascii=False))
          .replace('%%WRENCH%%', ''.join(wrench_steps))
          .replace('%%HOOK%%', hook_step)
          .replace('%%DRILLS%%', ''.join(drill_steps))
          .replace('%%KB%%', json.dumps(kb, ensure_ascii=False).replace('</', '<\\/'))
          .replace('%%GLOSS%%', json.dumps({k: v for k, v in GLOSS.items() if k in USED}, ensure_ascii=False)))
import hookart
out = hookart.inject(out, 'cad', 'HOOK PROJECT', 'SolidWorks Day')
(here / 'swday.src.html').write_text(out)
print('wrote swday.src.html', len(out), 'wrench', len(wrench_steps), 'drills', len(drill_steps))
