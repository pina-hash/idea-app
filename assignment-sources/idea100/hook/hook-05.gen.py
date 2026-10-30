"""Hook 05 · The Final (IDEA100 hook project) on the hx-kit. Writes hook-05.src.html.

The final, split from Hook 04 on 2026-10-29 so the call is locked in Hook 04 before the pull (G6).
"""
import json, pathlib
from hookparts import (fig, fig_css, symbol, image_box, picture_picks, SPOTS, KIT_CSS, KIT_JS, esc)

HERE = pathlib.Path(__file__).parent
DECK = 'https://docs.google.com/presentation/d/1b6EarIaB3UGrG1Ee7HwFap8aBLAiEdwBRE6myKoFLg8/edit?usp=sharing'

def lv(*rows):
    return [{"points": p, "label": l, "short": sh, "descriptor": d} for p, l, sh, d in rows]

manifest = {
  "schemaVersion": 3, "kind": "html-assignment", "title": "Hook 05 · The Final", "course": "IDEA100", "points": 12,
  "thumbnail": {"kind": "html", "template": "idea-thumbnail"},
  "modules": [
    {"id": "h5-final", "title": "The final", "points": 12, "audience": "individual",
     "blocks": [
       {"id": "h5-result", "field": "result", "type": "radio", "prompt": "What happened to V3 at the final"},
       {"id": "h5-result-load", "field": "heldLoad", "type": "text", "optional": True, "prompt": "The most V3 held, lb (left blank only if it was not pulled)"},
       {"id": "h5-result-at", "field": "brokeAt", "type": "radio", "optional": True, "prompt": "Where V3 broke, or stretched most (left blank only if it was not pulled)"},
       {"id": "h5-photo", "field": "photo", "type": "image", "prompt": "Photo of V3: the break, or the whole hook if it never broke or was not pulled"},
       {"id": "h5-my-call", "field": "myCall", "type": "text", "prompt": "Your call, copied from Hook 04"},
       {"id": "h5-call-real", "field": "callReal", "type": "longText", "minSentences": 2, "prompt": "Your call against what happened, on the load and the spot, and why"},
       {"id": "h5-v4", "field": "v4", "type": "longText", "minSentences": 1, "prompt": "One change for V4: what, where, and why"},
       {"id": "h5-slide", "field": "slide", "type": "image", "prompt": "Screenshot of your slide in the IDEA Hook Designs deck"},
       {"id": "h5-per-gram", "field": "perGram", "type": "text", "optional": True, "prompt": "Stretch: V3's weight from Hook 04, for pounds held per gram"}],
     "criteria": [
       {"id": "result", "text": "The result is recorded: what happened, the load, where, and a photo", "points": 4,
        "levels": lv((4, "Complete", "All four", "What happened, the load in pounds, the spot, and a close photo. Not pulled: what happened and why, and a photo of the hook."),
                     (3, "Proficient", "One missing", "One of the four is missing."),
                     (1, "Developing", "Two or more missing", "Only one or two are in."),
                     (0, "Absent", "Nothing", "Nothing."))},
       {"id": "reflect", "text": "Compares the locked call to what happened, and names one V4 change tied to the break", "points": 4,
        "levels": lv((4, "Complete", "Both, specific", "Says how close the load and the spot were and why, and one V4 change at a named place."),
                     (2, "Proficient", "Vague", "Compares in general, or the V4 change is not tied to the break."),
                     (1, "Developing", "One of the two", "Only the comparison or only the change."),
                     (0, "Absent", "Nothing", "Nothing."))},
       {"id": "slide", "text": "One slide in the IDEA Hook Designs deck carrying all six things", "points": 4,
        "levels": lv((4, "Complete", "All six", "Hook name and student name, the load, a CAD image of V3, V3's stress plot with its scale, a photo of the printed hook, a slicer view."),
                     (2, "Proficient", "Four or five", "Four or five of the six."),
                     (1, "Developing", "Three or fewer", "Three or fewer."),
                     (0, "Absent", "No slide", "No slide."))}]}
  ]
}

steps = f'''
  <section class="hx-step idea-panel" id="s-result" data-phase="final" data-title="What happened">
    <div class="hx-step-head"><div><span class="hx-phase-tag">The final · 15 min</span><h2>What happened</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <p>Your load is on the score sheet at the rig: copy it as soon as V3 is pulled. Then look at your pieces. White marks show where it stretched first.</p>
        {fig(45, caption='Read the break: where it started, and why there.', cls='hk-f150')}
        <p class="hx-note">Not pulled (not printed, over a rule, or absent)? Pick that, skip the load and the spot, and say why in the next step.</p>
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">V3 at the final</span>
        <fieldset class="hx-picks hk-row3" data-field="result" data-kind="radio"><legend>What happened to V3?</legend>
          <label class="hx-pick"><input type="radio" name="result" value="broke"> It broke</label>
          <label class="hx-pick"><input type="radio" name="result" value="held"> It never broke</label>
          <label class="hx-pick"><input type="radio" name="result" value="none"> It was not pulled</label></fieldset>
        <label>The most it held, from the score sheet
          <span class="hx-unit"><input class="idea-well idea-well--field" type="text" inputmode="decimal" data-field="heldLoad" data-optional placeholder="e.g. 000"><span>lb</span></span></label>
        {picture_picks('brokeAt', 'Where did it break? Never broke: where it stretched most.', SPOTS)}
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-right" data-phase="final" data-title="Photograph it, check your call">
    <div class="hx-step-head"><div><span class="hx-phase-tag">The final · 20 min</span><h2>Photograph it, check your call</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ol class="hx-do">
          <li><span>A close photo of the broken face, in focus. Never broke, or not pulled: the whole hook. On a phone: open this post, <strong>Take photo</strong>.</span></li>
          <li><span>Open <strong>Hook 04</strong> and copy your call into the box here, exactly as it is. It is locked there, and Mr. Pina sees both.</span></li>
          <li><span>Say plainly how close you were. A wrong call you can explain is worth the same as a right one. Not pulled: say why, and what you think it would have done.</span></li>
        </ol>
        <p class="hx-readout" id="hk-callcmp" aria-live="polite">Your call and what happened show here, side by side.</p>
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">Your photo and your call</span>
        {image_box('photo', 'Paste the photo here, or Take photo on a phone')}
        <label>Your call from Hook 04
          <input class="idea-well idea-well--field" type="text" data-field="myCall" placeholder="e.g. ___ lb, at the ..."></label>
        <label>How close was your call, on the load and the spot? Why did it go that way?
          <textarea class="idea-well" data-field="callReal" data-min-sentences="2" placeholder="e.g. I called ... and it held ... It broke at ..., because ..."></textarea></label>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-slide" data-phase="final" data-title="One change, and your slide">
    <div class="hx-step-head"><div><span class="hx-phase-tag">The final · 25 min</span><h2>One change, and your slide</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <div class="hx-links"><a class="hx-link-card" href="{DECK}" target="_blank" rel="noopener"><span class="hx-link-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></svg></span><span class="hx-link-text"><small>Google Slides · new tab</small><b>IDEA Hook Designs</b><span>the class deck</span></span><span class="hx-link-go">Open</span></a></div>
        <ol class="hx-do">
          <li><span>In the deck, right-click any slide already in it, <strong>Duplicate slide</strong>. That copy is yours.</span></li>
          <li><span>Replace everything on it with your six things. Drag pictures in from your screenshots.</span></li>
        </ol>
        <ul class="hx-list hk-six">
          <li>Hook name and your name</li><li>The load it held, in lb</li><li>A CAD image of V3</li>
          <li>V3's stress plot, scale showing</li><li>A photo of the printed hook</li><li>A slicer view of V3</li>
        </ul>
        <details class="hx-stretch hx-more"><summary>Pounds per gram · IDEA Coins, not points <span class="idea-chip">Optional</span></summary>
          <p>Strength for its weight is what engineers chase. Type V3's weight from Hook 04.</p>
          <span class="hx-unit"><input class="idea-well idea-well--field" type="text" inputmode="decimal" data-field="perGram" data-optional placeholder="e.g. 00.0" aria-label="V3 weight, grams"><span>g</span></span>
          <p class="hx-readout" id="hk-pg-out" aria-live="polite">Pounds held per gram shows here.</p></details>
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">V4 and your slide</span>
        <label>One change for V4: what, where on the part, and why?
          <textarea class="idea-well" data-field="v4" data-min-sentences="1" placeholder="e.g. V4 would ... at the ..., because ..."></textarea></label>
        {image_box('slide', 'Paste a screenshot of your slide')}
        <p class="hx-note">That is the whole hook project. Nice work.</p>
      </div>
    </div>
  </section>
'''

head_css = KIT_CSS + '''
  .hk-row3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @container (max-width: 26rem) { .hk-row3 { grid-template-columns: 1fr; } }
  .hk-f150 .fg { max-height: 150px; }
  .hk-six { columns: 2; column-gap: var(--space-3); }
  @container (max-width: 26rem) { .hk-six { columns: 1; } }
'''

page_js = KIT_JS + r'''
function hkVal(f) { var el = hxRoot(f); return el ? String(hxRead(el) || '') : ''; }
function hkNum(v) { var n = parseFloat(String(v).trim()); return isFinite(n) ? n : null; }
var HK_SPOT = {top: 'the top hole', neck: 'the neck', shank: 'the shank', throat: 'the throat', bowl: 'the bowl', tip: 'the tip', joint: 'the joint', other: 'somewhere else'};
function hkRefresh() {
  var r = hkVal('result'), hl = hkNum(hkVal('heldLoad')), ba = hkVal('brokeAt'), mc = hkVal('myCall').trim(), cc = document.getElementById('hk-callcmp');
  var what = r === 'none' ? 'V3 was not pulled.' : r ? 'V3 ' + (r === 'held' ? 'held' : 'broke at') + ' ' + (hl !== null ? hl + ' lb' : 'an unknown load') + (ba ? (r === 'held' ? ', stretching most at ' : ', at ') + HK_SPOT[ba] : '') + '.' : '';
  if (cc) cc.textContent = (mc || what) ? 'You called: ' + (mc || 'not copied yet') + '. ' + (what || 'What happened: not picked yet.') : 'Your call and what happened show here, side by side.';
  var g = hkNum(hkVal('perGram')), po = document.getElementById('hk-pg-out');
  if (po) po.textContent = (g && hl !== null) ? (hl / g).toFixed(1) + ' lb held per gram (' + hl + ' lb over ' + g + ' g).' : 'Pounds held per gram shows here.';
}
document.addEventListener('input', hkRefresh);
document.addEventListener('change', hkRefresh);
HX.onState.push(hkRefresh);
hkRefresh();
'''

tpl = f'''<!doctype html>
<html lang="en" data-color-pairs="stress-high/filament-orange">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hook 05 · The Final</title>
<!--
  Generated by hook-05.gen.py (with hookparts.py and fig/). Edit those, not this file.

  BRIEF (AUTHORING Part B; Mr. Pina 2026-10-29: the whole hook project on the current kit)
  1 Skill: record a test result honestly, read a fracture, compare a locked prediction with the
    result, and name the next change from evidence.
  2 Proof: what happened (load, spot, photo); the call copied from Hook 04 beside the result,
    explained; one V4 change; a slide with six items in the IDEA Hook Designs deck.
  3 Stuck points (Rotation 2 Hook 03 stage 4): no load copied at the rig; a slide missing
    pieces; a hook that was not pulled with no way to finish (now its own pick).
  4 Builds on Hook 04 (the locked call, V3) and Hook 03 (the plot).
  5 Problem: explain the gap between the call and the result. Stretch: pounds held per gram
    (IDEA Coins, not points).
  6 Shape: one class (Nov 13), one phase, three steps, 12 points, 6 required blocks. Individual:
    the final's format (head to head or not) is not named, by Mr. Pina's instruction 2026-10-29.
  7 Facts: score sheet at the rig (Hook 02); slide layout and its six items from the deck itself.
  8 Look: The final in steel (the rig).
-->
<script type="application/json" id="idea-manifest">
{json.dumps(manifest, indent=1, ensure_ascii=False)}
</script>
<!-- hx:head -->
<style>
{fig_css()}
{head_css}
</style>
<template id="idea-thumbnail">
<style>
  :root {{ --a: #1e2228; --b: #121416; --ink: #b9c3cf; --line: #e6e9ee; --hot: #f05a3c; }}
  :root[data-idea-scheme="light"] {{ --a: #e9edf2; --b: #d3dae3; --ink: #4a5563; --line: #20252c; --hot: #b42e14; }}
  .t {{ position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 6%; background: radial-gradient(circle at 30% 30%, var(--a), var(--b) 80%); color: var(--line); font: 700 clamp(11px, 30vh, 22px)/1 Rajdhani, system-ui, sans-serif; white-space: nowrap; }}
  .t svg {{ height: 78%; }}
  .t span {{ display: none; }}
  .t small {{ display: block; font-size: max(11px, 0.62em); opacity: 0.8; letter-spacing: 0.08em; }}
  :root[data-idea-shape="wide"] .t span, :root[data-idea-shape="banner"] .t span {{ display: block; }}
</style>
<div class="t">
  <svg viewBox="80 0 160 310" aria-hidden="true"><path d="M150 0 V28" stroke="var(--ink)" stroke-width="8"/><g fill="none" stroke="var(--line)" stroke-width="14" stroke-linejoin="round"><circle cx="150" cy="70" r="40"/><path d="M118 104 V200"/><path d="M196 198 A54 54 0 1 1 120 196"/></g><path d="M150 252 V310" stroke="var(--hot)" stroke-width="8"/><path d="M136 296 L150 310 L164 296" fill="none" stroke="var(--hot)" stroke-width="8" stroke-linejoin="round"/></svg>
  <span><small>HOOK 05</small>The Final</span>
</div>
</template>
</head>
<body class="idea-plate">
{symbol()}
<main id="hx-page">
  <header class="hx-hero">
    <div class="hx-hero-text">
      <span class="hx-crumb">IDEA100 · Hook Design Competition · Hook 05</span>
      <h1>The Final</h1>
      <p class="hx-done-when"><strong>Done when:</strong> V3's result is recorded with a photo, your locked call is checked against it, you have named one V4 change, and your slide is in the class deck.</p>
      <div class="hx-row">
        <span class="idea-chip">Writing: 3 sentences in all</span>
        <span class="idea-chip">Copy your load at the rig</span>
        <span class="idea-chip">Done early? Pounds per gram, for coins</span>
      </div>
    </div>
    <div class="hx-hero-art" aria-hidden="true">{fig(45)}</div>
  </header>
  <nav class="hx-plan idea-panel" id="hx-plan" aria-label="Classes in this assignment"></nav>
  <div class="hx-bar idea-panel" id="hx-bar"></div>
  <p class="hx-banner-failed" id="hx-failed" role="alert" hidden></p>
{steps}
</main>
<script type="application/json" id="hx-plan-data">
{{
  "phases": [
    {{"id": "final", "name": "The final", "color": "steel", "days": [{{"label": "Class 1", "short": "Pull it, check your call", "date": "2026-11-13"}}]}}
  ]
}}
</script>
<script type="application/json" id="hx-glossary">{{}}</script>
<!-- hx:script -->
<script id="hx-page-js">
{page_js}
</script>
</body>
</html>
'''
import hookart
tpl = hookart.inject(tpl, 'pull', 'HOOK 05', 'The Final')
(HERE / 'hook-05.src.html').write_text(tpl)
print('wrote hook-05.src.html', len(tpl))
