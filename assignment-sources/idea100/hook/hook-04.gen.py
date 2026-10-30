"""Hook 04 · V3 and Your Call (IDEA100 hook project) on the hx-kit. Writes hook-04.src.html.

Split from the old "V3 and the Final" on 2026-10-29 after the rule audit: the call has to close
before the final (G6), so V3, the call and the final print are this post (due the night before
the final) and the final itself is Hook 05.
"""
import json, pathlib, re
from hookparts import (fig, fig_css, symbol, image_box, video, picture_picks, SPOTS, KIT_CSS, KIT_JS, esc)

HERE = pathlib.Path(__file__).parent
PRINT_VID = 'A2JFnsAUOSk'
SIM_RUN = 'ILTUysnIURA'

def lv(*rows):
    return [{"points": p, "label": l, "short": sh, "descriptor": d} for p, l, sh, d in rows]

manifest = {
  "schemaVersion": 3, "kind": "html-assignment", "title": "Hook 04 · V3 and Your Call", "course": "IDEA100", "points": 18,
  "thumbnail": {"kind": "html", "template": "idea-thumbnail"},
  "modules": [
    {"id": "h4-v3", "title": "V3 and your call", "points": 15, "audience": "individual",
     "blocks": [
       {"id": "h4-v3-shot", "field": "v3shot", "type": "image", "prompt": "Screenshot of V3: whole window, the change highlighted"},
       {"id": "h4-v3-stress", "field": "v3stress", "type": "image", "prompt": "V3 stress plot with its color scale"},
       {"id": "h4-v3-change", "field": "v3change", "type": "longText", "minSentences": 1, "prompt": "What V3 changed at the red, and where the grams came from"},
       {"id": "h4-v3-peaks", "field": "peaks", "type": "text", "optional": True, "prompt": "Stretch: V2 and V3 peak stress from the color scales"},
       {"id": "h4-v3-dims", "field": "dims", "type": "table", "prompt": "V3 measurements against the rules, with a fix for any that miss"},
       {"id": "h4-v3-mass", "field": "v3mass", "type": "text", "prompt": "V3 full-size weight from Bambu Studio, grams"},
       {"id": "h4-v3-settings", "field": "settings", "type": "text", "prompt": "Your print settings: wall loops and infill"},
       {"id": "h4-call-load", "field": "callLoad", "type": "text", "prompt": "Your call: V3 holds this much before it breaks, lb"},
       {"id": "h4-call-at", "field": "callAt", "type": "radio", "prompt": "Your call: where V3 will break"},
       {"id": "h4-call-why", "field": "callWhy", "type": "longText", "minSentences": 1, "prompt": "Why that number and that spot"}],
     "criteria": [
       {"id": "build", "text": "V3 is its own file, built at the red, checked with a new plot, and the change is explained", "points": 6,
        "levels": lv((6, "Complete", "At the red, plotted, explained", "A V3_ file with the change highlighted where V2's plot was red, a V3 stress plot with its scale, and a line naming the change and where the grams came from."),
                     (4, "Proficient", "One thing short", "The change is elsewhere, or no V3 plot, or the line does not say where the grams came from."),
                     (2, "Developing", "Barely changed", "V3 is V2 renamed, or nothing can be seen."),
                     (0, "Absent", "No V3", "No screenshot."))},
       {"id": "legal", "text": "V3 is measured and weighed at full size, and it is legal", "points": 3,
        "levels": lv((3, "Complete", "Measured, weighed, legal", "Five measurements from V3 inside the rules, a slicer weight at or under 0.110 lb (50.0 g), and the walls and infill named."),
                     (2, "Proficient", "One gap", "One measurement or the settings missing, or one miss with its fix written."),
                     (1, "Developing", "Over or mostly missing", "Over 50.0 g, or most of it missing."),
                     (0, "Absent", "Nothing", "Nothing."))},
       {"id": "call", "text": "The call is a load and a spot, with a reason from the tests or the plot", "points": 6,
        "levels": lv((6, "Complete", "Load, spot, real reason", "A load in pounds and a spot, and a reason that uses their own pulls or plot. A wrong call earns the same as a right one."),
                     (4, "Proficient", "Reason general", "A load and a spot with a reason that could fit any hook."),
                     (2, "Developing", "Half a call", "Only a load or only a spot."),
                     (0, "Absent", "No call", "Nothing."))}]},
    {"id": "h4-print", "title": "Final print", "points": 3, "audience": "individual",
     "blocks": [
       {"id": "h4-print-plate", "field": "plate", "type": "image", "prompt": "Screenshot: V3 sliced at full size, weight showing"},
       {"id": "h4-print-where", "field": "printerNo", "type": "text", "prompt": "The printer V3 is on, name or number"}],
     "criteria": [
       {"id": "printed", "text": "V3 is sliced at full size, legal, and printing", "points": 3,
        "levels": lv((3, "Complete", "Sliced, legal, printing", "The sliced plate at full size with the weight showing, at or under 50.0 g, and the printer named."),
                     (2, "Proficient", "One thing missing", "The weight is hidden or over, or no printer named."),
                     (0, "Absent", "Not printed", "Nothing."))}]}
  ]
}

DIMS = [(1, 'Center to center', '2.000 to 3.000', 'range:2:3'), (2, 'Top hole', '1.000 or more', 'min:1'),
        (3, 'Bottom inside', '1.000 or more', 'min:1'), (4, 'Opening', '0.500 or more', 'min:0.5'), (5, 'Thickness', '0.750 or less', 'max:0.75')]
dims_rows = ''.join(
    f'<tr data-dim="{n}" data-check="{chk}"><td data-label="Dimension"><span class="hk-n">{n}</span> <strong>{esc(nm)}</strong></td>'
    f'<td data-label="The rule"><span class="hk-num">{esc(rule)}</span></td>'
    f'<td data-label="V3, in"><input class="idea-well idea-well--field" type="text" inputmode="decimal" aria-label="{esc(nm)}: V3, inches" placeholder="e.g. 0.000"></td>'
    f'<td data-label="If outside: the fix"><input class="idea-well idea-well--field" type="text" aria-label="{esc(nm)}: the fix" placeholder="e.g. edit ... to ..."></td></tr>'
    for n, nm, rule, chk in DIMS)

# Figure 44 without its green check: a check means done, and this post is not.
def fig_nocheck(n, **kw):
    out = fig(n, **kw)
    return re.sub(r'<circle class="okc"[^>]*/>|<path class="okm"[^>]*/>', '', out)

steps = f'''
  <section class="hx-step idea-panel" id="s-v3" data-phase="v3" data-title="Build V3 at the red">
    <div class="hx-step-head"><div><span class="hx-phase-tag">V3 · 35 min</span><h2>Build V3 at the red</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <p><strong>V3 is the hook you take to the final.</strong> Build it from what the plot showed: material where V2 went red, grams from where it was blue.</p>
        <ol class="hx-do">
          <li><span>Open V2. <strong>File, Save As</strong>: <strong>V3_</strong> and your last name, in your Armory folder. V2 stays as it is.</span></li>
          <li><span>Make the change from your V3 plan in Hook 03. Rebuild: no red or yellow in the tree.</span></li>
          <li><span>Click the face or feature you changed so it highlights. Screenshot the whole window: V3_ at the top.</span></li>
        </ol>
        <p class="hx-see">V3 open, the change lit up in blue, V3_ and your name at the top.</p>
        <details class="hx-stuck"><summary>That is not what I see</summary><table>
          <tr><td>The title still says V2</td><td>You changed V2. Ctrl+Z back, then File, Save As V3 first.</td></tr>
          <tr><td>Red or yellow after the change</td><td>A sketch lost what it was attached to. Edit that sketch and fix the red line.</td></tr>
        </table></details>
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">Your V3</span>
        {image_box('v3shot')}
        <label>What did V3 change at the red, and where did the grams come from?
          <textarea class="idea-well" data-field="v3change" data-min-sentences="1" placeholder="e.g. V3 adds ... at the ..., taken from the ..."></textarea></label>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-plot" data-phase="v3" data-title="Check V3 with a new plot">
    <div class="hx-step-head"><div><span class="hx-phase-tag">V3 · 10 min</span><h2>Check V3 with a new plot</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ol class="hx-do">
          <li><span>Simulation tab: the study came with the file. <strong>Run This Study</strong>.</span></li>
          <li><span>The notification: click <strong>No</strong>. Under <strong>Results</strong>, double-click <strong>Stress</strong>.</span></li>
          <li><span>Screenshot the hook and the color scale.</span></li>
        </ol>
        <p class="hx-see">Less red where V2 was reddest. Not better? Back to the last step: change it again, run it again.</p>
        {video(SIM_RUN, 'Simulate 6 of 6: Run it and read it')}
        <details class="hx-stretch hx-more"><summary>Peak stress · IDEA Coins, not points <span class="idea-chip">Optional</span></summary>
          <p>Read the top number on V2's color scale and on V3's. How much did V3 bring the peak down?</p>
          <input class="idea-well idea-well--field" type="text" data-field="peaks" data-optional placeholder="e.g. V2 ____ psi, V3 ____ psi" aria-label="V2 and V3 peak stress"></details>
      </div>
      <div class="hx-stack">
        {fig(43, caption='Blue is little stress, red the most.', cls='hk-f150')}
        <div class="hx-evidence idea-panel">
          <span class="idea-eyebrow">V3 stress plot</span>
          {image_box('v3stress')}
        </div>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-measure" data-phase="v3" data-title="Measure V3">
    <div class="hx-step-head"><div><span class="hx-phase-tag">V3 · 10 min</span><h2>Measure V3</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <p>Material at the red can close the opening or shrink the top hole. <strong>Evaluate</strong> tab, <strong>Measure</strong>. Inches, three decimals. Anything outside a rule gets fixed before it prints.</p>
        {fig(5, caption='Each number matches a row. Click a row to light its number.', cls='hk-measure')}
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">V3 measurements</span>
        <div data-field="dims" data-kind="table">
          <table class="hx-table hk-dims"><thead><tr><th>Dimension</th><th>The rule</th><th>V3, <span class="hx-keep-case">in</span></th><th>If outside: the fix</th></tr></thead><tbody>{dims_rows}</tbody></table>
        </div>
        <p class="hx-readout" id="hk-dims-out" aria-live="polite">Each measurement is checked against its rule here.</p>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-weigh" data-phase="v3" data-title="Weigh V3 on your settings">
    <div class="hx-step-head"><div><span class="hx-phase-tag">V3 · 15 min</span><h2>Weigh V3 on your settings</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ol class="hx-do">
          <li><span><strong>File, Save As</strong>, <strong>STEP AP214</strong>.</span></li>
          <li><span>Bambu Studio: your printer and nozzle, <strong>Generic ABS</strong>, <strong>Textured PEI</strong>, <strong>Enable support</strong>, <strong>Auto orient</strong>.</span></li>
          <li><span>Choose your <strong>wall loops</strong> and <strong>infill</strong>: more is stronger and heavier.</span></li>
          <li><span><strong>Slice plate</strong> at full size. The slicer's weight, supports included, is the rule: at or under 0.110 lb (50.0 g).</span></li>
        </ol>
        {video(PRINT_VID, 'Printing: STEP file to a clean plate', [('Printer and nozzle', 137), ('Supports and orient', 272), ('Slice and weigh', 570), ('H2D: which side', 1086)])}
        <details class="hx-stuck"><summary>That is not what I see</summary><table>
          <tr><td>The hook floats or droops in the preview</td><td>Supports are off. Support tab, Enable support, slice again.</td></tr>
          <tr><td>Far under 0.110 lb (50.0 g)</td><td>Grams to spend: more walls or infill, or more material at the red in SolidWorks.</td></tr>
          <tr><td>Over 0.110 lb (50.0 g)</td><td>Less infill, or take grams from the blue in SolidWorks. Over means it does not print for the final.</td></tr>
        </table></details>
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">V3, full size</span>
        <label>V3 alone, from Bambu Studio
          <span class="hx-unit"><input class="idea-well idea-well--field" type="text" inputmode="decimal" data-field="v3mass" placeholder="e.g. 00.0"><span>g</span></span></label>
        <p class="hx-readout" id="hk-mass-out" aria-live="polite">Your weight in pounds, against 0.110 lb (50.0 g), appears here.</p>
        <label>Your settings: wall loops and infill
          <input class="idea-well idea-well--field" type="text" data-field="settings" placeholder="e.g. _ wall loops, __ percent infill"></label>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-call" data-phase="v3" data-title="Make your call">
    <div class="hx-step-head"><div><span class="hx-phase-tag">V3 · 20 min</span><h2>Make your call</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <p>Before the final, say what V3 will do. You are graded on the reason, not on being right. <strong>Your call locks when this post closes</strong>, the night before the final.</p>
        <ul class="hx-list">
          <li><strong>A rough guide:</strong> your half-size pulls are in Hook 02. Full size has four times the cross section, so about four times the load, if it breaks the same way.</li>
          <li>Rough because walls do not scale: the nozzle sets their width. Different walls or infill from your test copy change it too.</li>
          <li>Your plot says where the stress piles up.</li>
        </ul>
        <p class="hx-readout" id="hk-guide-out" aria-live="polite">Type a half-size load below to see four times it.</p>
        <label>A half-size load from your pulls (for the guide only)
          <span class="hx-unit"><input class="idea-well idea-well--field hk-guide" type="text" inputmode="decimal" placeholder="e.g. 00" aria-label="A half-size load, pounds"><span>lb</span></span></label>
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">Your call</span>
        <label>V3 holds this much before it breaks
          <span class="hx-unit"><input class="idea-well idea-well--field" type="text" inputmode="decimal" data-field="callLoad" placeholder="e.g. 000"><span>lb</span></span></label>
        {picture_picks('callAt', 'Where will V3 break?', SPOTS)}
        <label>Why that number and that spot? Use your tests or the plot.
          <textarea class="idea-well" data-field="callWhy" data-min-sentences="1" placeholder="e.g. Test 1 held ... at half size, and the plot ..."></textarea></label>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-print" data-phase="print" data-title="Print V3">
    <div class="hx-step-head"><div><span class="hx-phase-tag">Final print · 25 min</span><h2>Print V3</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ol class="hx-do">
          <li><span>Slice V3 at <strong>full size</strong> on your settings. Screenshot the plate with the weight.</span></li>
          <li><span><strong>Export plate sliced file</strong> onto the printer's card or drive, named <strong>LASTNAME-V3</strong>. Never press Print plate.</span></li>
          <li><span>On the printer: HIPS slot set to <strong>Generic ABS</strong>, <strong>Print Files</strong>, your file, <strong>Print</strong>.</span></li>
          <li><span>Watch the first layer, close the door. A full-size hook takes a while.</span></li>
          <li><span>Done before the bell: oven mitt, plate onto the glass table until it crackles free. Remove every support.</span></li>
        </ol>
        <p class="hx-note">Still printing at the bell? Leave it on the printer, door closed. Take it off at the start of the final.</p>
        {video(PRINT_VID, 'Printing: card, start, clean plate', [('Export onto the card', 737), ('Start it', 860), ('When it finishes', 982), ('H2D: USB', 1525)])}
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">V3, sliced and printing</span>
        {image_box('plate')}
        <label>The printer V3 is on
          <input class="idea-well idea-well--field" type="text" data-field="printerNo" placeholder="e.g. the number on its front"></label>
        <p class="hx-note">Up next: <strong>Hook 05</strong>, the final.</p>
      </div>
    </div>
  </section>
'''

head_css = KIT_CSS + '''
  .hk-n { display: inline-grid; place-items: center; width: 1.4em; height: 1.4em; border-radius: 50%; background: var(--panel-top); box-shadow: inset 0 0 0 1px var(--hair); font: 700 0.75rem/1 var(--font-mono); }
  .hk-dims tr.on .hk-n { background: var(--accent); }
  .hk-measure .fg { max-height: 330px; }
  .hk-f150 .fg { max-height: 150px; }
'''

page_js = KIT_JS + r'''
function hkVal(f) { var el = hxRoot(f); return el ? String(hxRead(el) || '') : ''; }
function hkNum(v) { var n = parseFloat(String(v).trim()); return isFinite(n) ? n : null; }
function hkRefresh() {
  var fm = hkNum(hkVal('v3mass')), mo = document.getElementById('hk-mass-out');
  if (mo) { mo.classList.toggle('warn', fm !== null && fm > 50); mo.textContent = fm === null ? 'Your weight in pounds, against 0.110 lb (50.0 g), appears here.' : 'V3: ' + (fm / 453.592).toFixed(3) + ' lb (' + fm.toFixed(1) + ' g), ' + (fm <= 50 ? 'legal on weight.' : 'over 0.110 lb (50.0 g). It does not print for the final until it is under.'); }
  var g = document.querySelector('.hk-guide'), go = document.getElementById('hk-guide-out');
  if (g && go) { var h = hkNum(g.value); go.textContent = h === null ? 'Type a half-size load below to see four times it.' : 'Four times ' + h + ' lb is about ' + Math.round(h * 4) + ' lb at full size, if it breaks the same way.'; }
  var dim = hxRoot('dims'), rows = [];
  try { rows = JSON.parse(hxRead(dim) || '[]'); } catch (e) { rows = []; }
  var outs = [], ins = 0;
  document.querySelectorAll('.hk-dims tbody tr').forEach(function (tr, i) {
    var v = rows[i] ? hkNum(rows[i][0]) : null, p = tr.dataset.check.split(':'), ok = null;
    if (v !== null) ok = p[0] === 'range' ? v >= +p[1] && v <= +p[2] : p[0] === 'min' ? v >= +p[1] : v <= +p[1];
    if (ok === true) ins++;
    if (ok === false) outs.push(tr.dataset.dim);
  });
  var dout = document.getElementById('hk-dims-out');
  if (dout) { dout.classList.toggle('warn', outs.length > 0); dout.textContent = (ins + outs.length) === 0 ? 'Each measurement is checked against its rule here.' : ins + ' inside the rules' + (outs.length ? '. Outside: row ' + outs.join(', ') + '. Fix it in SolidWorks before it prints, and write the fix in that row.' : '.'); }
}
document.querySelectorAll('.hk-dims tbody tr').forEach(function (tr) {
  tr.addEventListener('focusin', function () {
    document.querySelectorAll('.hk-dims tr.on').forEach(function (x) { x.classList.remove('on'); });
    tr.classList.add('on');
    var f = document.querySelector('.hk-measure .fg');
    if (f) { f.classList.add('dimfocus'); f.querySelectorAll('.dm, .dmg').forEach(function (g) { g.classList.toggle('on', g.getAttribute('data-dim') === tr.dataset.dim || g.getAttribute('data-n') === tr.dataset.dim); }); }
  });
});
document.addEventListener('input', hkRefresh);
document.addEventListener('change', hkRefresh);
HX.onState.push(hkRefresh);
hkRefresh();
'''

tpl = f'''<!doctype html>
<html lang="en" data-color-pairs="stress-high/solidworks-red, stress-high/filament-orange">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hook 04 · V3 and Your Call</title>
<!--
  Generated by hook-04.gen.py (with hookparts.py and fig/). Edit those, not this file.

  BRIEF (AUTHORING Part B; Mr. Pina 2026-10-29: the whole hook project on the current kit)
  1 Skill: build the final version from evidence (tests and plot), check it with a new plot,
    keep it legal, weigh it on chosen settings, and predict its load and failure.
  2 Proof: V3 highlighted, its stress plot, the change explained; five measurements inside the
    rules; slicer weight and settings; a call (load, spot, reason); the sliced plate and printer.
  3 Stuck points (Rotation 2 Hook 03 stages 3 and 4): over 50 g; supports off; material at the
    red closing the opening; a call with no reason.
  4 Builds on Hook 03 (V2, the plot, the V3 plan) and Hook 02 (the half-size pulls). Feeds Hook 05.
  5 Problem: the call, from their own data. Stretch: V2 against V3 peak stress (IDEA Coins).
  6 Shape: closes the night before the final so the call is locked (G6, Part C split at an
    event). Two classes (Nov 10 V3, Nov 12 final print), two phases, five steps, 18 points.
    Individual, no teams: the final's format is not named, by Mr. Pina's instruction 2026-10-29.
  7 Facts: weight rule is the slicer's full-size weight, supports included, at or under 50.0 g
    (his Rotation 2 wording "close to 50.0 g, never over"); printing as Hook 02.
  8 Look: V3 in SolidWorks red, Final print in filament-orange (same anchors as Hooks 02 and 03:
    one color per real thing across the project).
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
  :root {{ --a: #2b2018; --b: #141112; --ink: #f2943e; --line: #e8dfd6; }}
  :root[data-idea-scheme="light"] {{ --a: #fbeee2; --b: #ecd9c6; --ink: #b4560e; --line: #2c2420; }}
  .t {{ position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 6%; background: radial-gradient(circle at 30% 30%, var(--a), var(--b) 80%); color: var(--line); font: 700 clamp(11px, 30vh, 22px)/1 Rajdhani, system-ui, sans-serif; white-space: nowrap; }}
  .t svg {{ height: 78%; }}
  .t span {{ display: none; }}
  .t small {{ display: block; font-size: max(11px, 0.62em); opacity: 0.8; letter-spacing: 0.08em; }}
  :root[data-idea-shape="wide"] .t span, :root[data-idea-shape="banner"] .t span {{ display: block; }}
</style>
<div class="t">
  <svg viewBox="80 10 160 300" aria-hidden="true"><g fill="none" stroke="var(--ink)" stroke-width="14" stroke-linejoin="round"><circle cx="150" cy="70" r="40"/><path d="M118 104 V200"/><path d="M196 198 A54 54 0 1 1 120 196"/></g><text x="214" y="300" font-family="Share Tech Mono, monospace" font-size="56" font-weight="700" fill="var(--line)" text-anchor="middle">V3</text></svg>
  <span><small>HOOK 04</small>V3 and Your Call</span>
</div>
</template>
</head>
<body class="idea-plate">
{symbol()}
<main id="hx-page">
  <header class="hx-hero">
    <div class="hx-hero-text">
      <span class="hx-crumb">IDEA100 · Hook Design Competition · Hook 04</span>
      <h1>V3 and Your Call</h1>
      <p class="hx-done-when"><strong>Done when:</strong> V3 is built at the red with a new plot, it is measured, weighed and legal, your call is in, and V3 is printing at full size.</p>
      <div class="hx-row">
        <span class="idea-chip">Writing: 2 sentences in all</span>
        <span class="idea-chip">Your call locks the night before the final</span>
        <span class="idea-chip">Done early? Peak stress, for coins</span>
      </div>
    </div>
    <div class="hx-hero-art" aria-hidden="true">{fig_nocheck(44)}</div>
  </header>
  <nav class="hx-plan idea-panel" id="hx-plan" aria-label="Classes in this assignment"></nav>
  <div class="hx-bar idea-panel" id="hx-bar"></div>
  <p class="hx-banner-failed" id="hx-failed" role="alert" hidden></p>
{steps}
</main>
<script type="application/json" id="hx-plan-data">
{{
  "phases": [
    {{"id": "v3", "name": "V3", "color": "solidworks-red", "days": [{{"label": "Class 1", "short": "V3, legal, your call", "date": "2026-11-10"}}]}},
    {{"id": "print", "name": "Final print", "color": "filament-orange", "days": [{{"label": "Class 2", "short": "Print V3 full size", "date": "2026-11-12"}}]}}
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
tpl = hookart.inject(tpl, 'final', 'HOOK 04', 'V3 and Your Call')
(HERE / 'hook-04.src.html').write_text(tpl)
print('wrote hook-04.src.html', len(tpl))
