"""Hook 03 · V2 and Simulate (IDEA100 hook project) on the hx-kit. Writes hook-03.src.html."""
import json, pathlib
from hookparts import (fig, fig_css, symbol, image_box, video, picture_picks, SPOTS, KIT_CSS, KIT_JS, esc)

HERE = pathlib.Path(__file__).parent

def lv(*rows):
    return [{"points": p, "label": l, "short": sh, "descriptor": d} for p, l, sh, d in rows]

FIXES = [  # value, label, figure or None, moves, why
    ('ring', 'Thicken the ring', 38, ['Edit the sketch and make the outer circle of the top ring bigger.', 'The hole stays 1.000 in or more. Only the ring around it grows.'],
     'The pull runs through the ring on both sides of the hole. More ring, less stress in it.'),
    ('round', 'Round the inside corner', 39, ['Find the sharp inside corner where it broke: under the ring, or where the shank turns into the bowl.', 'Make that Fillet bigger, or add one.'],
     'A sharp inside corner piles the stress up in one spot, and cracks start there. A bigger round spreads it out.'),
    ('shank', 'Widen the shank', 40, ['Edit the sketch and move the shank\'s outside line out.', 'Keep the opening 0.500 in or more.'],
     'The shank is pulled straight. Its stress is the load divided by its area: more width, less stress.'),
    ('bowl', 'Make the bowl deeper', 41, ['Edit the sketch and make the bowl\'s outer circle bigger, moving it down.', 'The inside stays 1.000 in or more; the opening stays 0.500 in or more.'],
     'The bowl bends, and in bending the depth counts twice. A tip that pulled open is the bowl bending too far.'),
    ('joint', 'Give the joint more grip', None, ['Make the keys bigger, or add another one.', 'Round the inside corners of each key. It still opens and closes by hand in 10 s.'],
     'A joint is where the pull passes through less material than anywhere else. Give it more.'),
]
SPOT_FIX = {'top': 'ring', 'neck': 'round', 'shank': 'shank', 'throat': 'round', 'bowl': 'bowl', 'tip': 'bowl', 'joint': 'joint', 'other': ''}

manifest = {
  "schemaVersion": 3, "kind": "html-assignment", "title": "Hook 03 · V2 and Simulate", "course": "IDEA100", "points": 35,
  "thumbnail": {"kind": "html", "template": "idea-thumbnail"},
  "modules": [
    {"id": "h3-v2", "title": "V2", "points": 20, "audience": "individual",
     "blocks": [
       {"id": "h3-v2-break-at", "field": "breakAt", "type": "radio", "prompt": "Where Test 1 broke"},
       {"id": "h3-v2-break-other", "field": "breakOther", "type": "text", "optional": True, "prompt": "Somewhere else: where it broke"},
       {"id": "h3-v2-shot", "field": "v2shot", "type": "image", "prompt": "Screenshot of V2 with the change highlighted"},
       {"id": "h3-v2-dims", "field": "dims", "type": "table", "prompt": "V2 measurements against the rules, with a fix for any that miss"},
       {"id": "h3-v2-mass", "field": "v2mass", "type": "text", "prompt": "V2 full-size weight from Bambu Studio, grams"},
       {"id": "h3-v2-what", "field": "v2what", "type": "longText", "minSentences": 1, "prompt": "What changed, where, and by how much"},
       {"id": "h3-v2-cost", "field": "v2cost", "type": "radio", "prompt": "What the change cost in weight"},
       {"id": "h3-v2-cost-why", "field": "v2costWhy", "type": "text", "prompt": "How many grams, and from where (or why nothing)"}],
     "criteria": [
       {"id": "file", "text": "V2 is its own file, changed at the place Test 1 broke, and shown with the change highlighted", "points": 8,
        "levels": lv((8, "Complete", "V2, at the break, shown", "A V2_ file (V1 left as it was), the change at the spot Test 1 broke, highlighted in the screenshot, no red or yellow in the tree."),
                     (5, "Proficient", "Changed elsewhere, or not shown", "V2 exists, but the change is not at the break, or the screenshot does not show which change."),
                     (2, "Developing", "Saved over V1, or barely changed", "V1 was changed instead of a new V2, or nothing visible changed."),
                     (0, "Absent", "No V2", "No screenshot."))},
       {"id": "measure", "text": "Every dimension and the full-size weight are measured on V2, and V2 is legal or has its fix", "points": 6,
        "levels": lv((6, "Complete", "Measured and legal", "Five measurements from V2 and a slicer weight, each inside its rule or with its fix."),
                     (4, "Proficient", "One missing", "One measurement or the weight is missing, or one miss has no fix."),
                     (2, "Developing", "Copied or partial", "Numbers repeat the rules, or two or more are missing."),
                     (0, "Absent", "Nothing", "No measurements."))},
       {"id": "say", "text": "Says what changed and what it cost", "points": 6,
        "levels": lv((6, "Complete", "Where, how much, the grams", "Names the place, the amount, and the grams it cost or saved, and where they came from."),
                     (4, "Proficient", "Change clear, cost vague", "The change is clear but the cost is not."),
                     (2, "Developing", "General", "Says it was made stronger, nothing specific."),
                     (0, "Absent", "Blank", "Nothing written."))}]},
    {"id": "h3-sim", "title": "Simulate", "points": 15, "audience": "individual",
     "blocks": [
       {"id": "h3-sim-split", "field": "split", "type": "image", "prompt": "Screenshot: both split faces"},
       {"id": "h3-sim-setup", "field": "setup", "type": "image", "prompt": "Screenshot before the run: fixture, 400 lbf load, study list"},
       {"id": "h3-sim-stress", "field": "stress", "type": "image", "prompt": "The stress plot with its color scale"},
       {"id": "h3-sim-red", "field": "redAt", "type": "radio", "prompt": "Where the most red is"},
       {"id": "h3-sim-match", "field": "match", "type": "radio", "prompt": "Is that where Test 1 broke?"},
       {"id": "h3-sim-v3", "field": "v3plan", "type": "longText", "minSentences": 2, "prompt": "What V3 will change: material at the red, and where the grams come from"},
       {"id": "h3-sim-insight", "field": "insight", "type": "image", "optional": True, "prompt": "Stretch: a Design Insight screenshot"}],
     "criteria": [
       {"id": "setup", "text": "The study is set up right: split faces, fixture on the top face, 400 lbf down on the bowl face", "points": 6,
        "levels": lv((6, "Complete", "All three right", "Both split faces show, the fixture is on the small top face only, and the load is 400 lbf pointing down on the small bowl face."),
                     (4, "Proficient", "One thing off", "One of the three is on the wrong face, the wrong size, or the wrong way."),
                     (2, "Developing", "Two off", "Two of the three are off, or a screenshot is missing."),
                     (0, "Absent", "No study", "No setup screenshots."))},
       {"id": "plot", "text": "The stress plot is in, with its color scale", "points": 3,
        "levels": lv((3, "Complete", "Plot and scale", "The hook in blue to red with the color scale beside it."),
                     (1, "Developing", "No scale, or one color", "No scale, or the whole hook is one color."),
                     (0, "Absent", "No plot", "No plot."))},
       {"id": "plan", "text": "Reads the plot against Test 1 and plans V3 from it", "points": 6,
        "levels": lv((6, "Complete", "Red located, plan from it", "Picks where the red is and whether it matches Test 1, and the plan adds material at the red and names the blue areas the grams come from."),
                     (4, "Proficient", "Plan vague", "The red is located, but the plan does not say where the grams come from."),
                     (2, "Developing", "Not from the plot", "A plan that does not use the plot."),
                     (0, "Absent", "Nothing", "Nothing."))}]}
  ]
}

DIMS = [(1, 'Center to center', '2.000 to 3.000', 'range:2:3'), (2, 'Top hole', '1.000 or more', 'min:1'),
        (3, 'Bottom inside', '1.000 or more', 'min:1'), (4, 'Opening', '0.500 or more', 'min:0.5'), (5, 'Thickness', '0.750 or less', 'max:0.75')]
dims_rows = ''.join(
    f'<tr data-dim="{n}" data-check="{chk}"><td data-label="Dimension"><span class="hk-n">{n}</span> <strong>{esc(nm)}</strong></td>'
    f'<td data-label="The rule"><span class="hk-num">{esc(rule)}</span></td>'
    f'<td data-label="V2, in"><input class="idea-well idea-well--field" type="text" inputmode="decimal" aria-label="{esc(nm)}: V2, inches" placeholder="e.g. 0.000"></td>'
    f'<td data-label="If outside: the fix"><input class="idea-well idea-well--field" type="text" aria-label="{esc(nm)}: the fix" placeholder="e.g. edit ... to ..."></td></tr>'
    for n, nm, rule, chk in DIMS)

fix_cards = ''.join(
    f'<div class="hk-fix" data-fix="{v}" hidden><div class="hk-fixtext"><h3>{esc(lab)}</h3><ol class="hx-do">' +
    ''.join(f'<li><span>{esc(m)}</span></li>' for m in moves) +
    f'</ol><p class="hx-note">{esc(why)}</p></div>' + (fig(n) if n else '') + '</div>'
    for v, lab, n, moves, why in FIXES)

fix_picks = ''.join(f'<label class="hx-pick"><input type="radio" name="fix" value="{v}"> {esc(lab)}</label>' for v, lab, n, m, w in FIXES) + \
    ''

SIM = [('eHiw4DTJk4E', 'Open V2, turn on Simulation'), ('uQNVVqn5Xgk', 'Split the two faces'), ('9415dn__W2g', 'New study, Nylon 101'),
       ('LSaGV5LSw_s', 'Fix the top face'), ('Re9qWExPoeU', 'Load it: 400 lbf, down'), ('ILTUysnIURA', 'Run it and read it')]

steps = f'''
  <section class="hx-step idea-panel" id="s-break" data-phase="v2" data-title="Pick your fix">
    <div class="hx-step-head"><div><span class="hx-phase-tag">V2 · 15 min</span><h2>Pick your fix</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <p>Your half-size copy from Hook 02 broke somewhere. That spot is the whole brief: add material there, and take grams from places that showed no strain.</p>
        <div class="hx-evidence idea-panel">
          <span class="idea-eyebrow">Test 1</span>
          {picture_picks('breakAt', 'Where did Test 1 break? Never broke: where it stretched most (white marks).', SPOTS)}
          <label>Somewhere else? Say where.
            <input class="idea-well idea-well--field" type="text" data-field="breakOther" data-optional placeholder="e.g. just above the ..."></label>
        </div>
      </div>
      <div class="hx-stack">
        <p class="hx-readout" id="hk-fix-hint" aria-live="polite">Pick where it broke, and the usual fix for that spot shows here.</p>
        {fix_cards}
        <p class="hx-note">The fix is a starting point. How much to change, and which number, is your call: you will write it in step 4.</p>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-v2" data-phase="v2" data-title="Save V2 and change it">
    <div class="hx-step-head"><div><span class="hx-phase-tag">V2 · 40 min</span><h2>Save V2 and change it</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ol class="hx-do">
          <li><span>Open V1 from your Armory folder. <strong>File, Save As</strong>: <strong>V2_</strong> and your last name, same folder. V1 stays exactly as it is.</span></li>
          <li><span>Make the change from your fix. Rebuild (<strong>Ctrl+B</strong>): no red or yellow in the tree.</span></li>
          <li><span>Click the face or feature you changed so it highlights.</span></li>
          <li><span>Screenshot the whole window: V2_ at the top, the change highlighted.</span></li>
        </ol>
        <p class="hx-see">V2 open, the changed face lit up in blue, V2_ and your name at the top.</p>
        <details class="hx-stuck"><summary>That is not what I see</summary><table>
          <tr><td>The title still says V1</td><td>You changed V1. Ctrl+Z back, then File, Save As V2 first.</td></tr>
          <tr><td>Red or yellow after the change</td><td>A sketch lost what it was attached to. Edit that sketch and fix the red line.</td></tr>
          <tr><td>Multi-part</td><td>V2A_, V2B_: one file per piece you change.</td></tr>
        </table></details>
      </div>
      <div class="hx-stack">
        {fig(29, caption='V2: material added where it broke.', cls='hk-f150')}
        <div class="hx-evidence idea-panel">
          <span class="idea-eyebrow">Your V2</span>
          {image_box('v2shot')}
        </div>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-measure" data-phase="v2" data-title="Measure V2">
    <div class="hx-step-head"><div><span class="hx-phase-tag">V2 · 15 min</span><h2>Measure V2</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <p><strong>Evaluate</strong> tab, <strong>Measure</strong>. Inches, three decimals. V2 should be legal: anything outside a rule gets its fix.</p>
        {fig(5, caption='Each number matches a row. Click a row to light its number.', cls='hk-measure')}
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">V2 measurements</span>
        <div data-field="dims" data-kind="table">
          <table class="hx-table hk-dims"><thead><tr><th>Dimension</th><th>The rule</th><th>V2, <span class="hx-keep-case">in</span></th><th>If outside: the fix</th></tr></thead><tbody>{dims_rows}</tbody></table>
        </div>
        <p class="hx-readout" id="hk-dims-out" aria-live="polite">Each measurement is checked against its rule here.</p>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-say" data-phase="v2" data-title="Weigh it and say what it cost">
    <div class="hx-step-head"><div><span class="hx-phase-tag">V2 · 20 min</span><h2>Weigh it and say what it cost</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ol class="hx-do">
          <li><span>Same as Hook 02: Save As <strong>STEP</strong>, into Bambu Studio, X1 Carbon 0.6 mm or your H2D side, <strong>Generic ABS</strong>, <strong>Slice plate</strong>.</span></li>
          <li><span>Read the weight at <strong>full size</strong>, not 50 percent.</span></li>
          <li><span>Over 0.110 lb (50.0 g)? It cannot print for the final. Take grams from a place your test showed was fine: no crack, no white marks.</span></li>
        </ol>
        <p class="hx-note">Material is never free. A gram added at the break is worth more than a gram anywhere else.</p>
        <p class="hx-note">Done early? Print V2 at half size like Hook 02 and pull it. Log it under <strong>More pulls</strong> in Hook 02. Every pull before the final is free information.</p>
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">What V2 did</span>
        <label>V2, full size, from Bambu Studio
          <span class="hx-unit"><input class="idea-well idea-well--field" type="text" inputmode="decimal" data-field="v2mass" placeholder="e.g. 00.0"><span>g</span></span></label>
        <p class="hx-readout" id="hk-mass-out" aria-live="polite">Your weight in pounds, against 0.110 lb (50.0 g), appears here.</p>
        <label>What changed, where, and by how much?
          <textarea class="idea-well" data-field="v2what" data-min-sentences="1" placeholder="e.g. I made the ... from ... to ..., at the ..."></textarea></label>
        <fieldset class="hx-picks hk-row3" data-field="v2cost" data-kind="radio"><legend>What did it cost?</legend>
          <label class="hx-pick"><input type="radio" name="v2cost" value="added"> Added weight</label>
          <label class="hx-pick"><input type="radio" name="v2cost" value="moved"> Took it from somewhere</label>
          <label class="hx-pick"><input type="radio" name="v2cost" value="none"> Nothing</label></fieldset>
        <label>How many grams, and from where? Or why nothing? (V1's weight: Hook 02, Weigh it.)
          <input class="idea-well idea-well--field" type="text" data-field="v2costWhy" placeholder="e.g. about _ g, from the ..."></label>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-split" data-phase="sim" data-title="Turn on Simulation, split two faces">
    <div class="hx-step-head"><div><span class="hx-phase-tag">Simulate · 20 min</span><h2>Turn on Simulation, split two faces</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ol class="hx-do">
          <li><span>Open V2 (press <strong>R</strong> for recent files). No <strong>Simulation</strong> tab? <strong>SOLIDWORKS Add-Ins</strong> tab, click <strong>SOLIDWORKS Simulation</strong>.</span></li>
          <li><span><strong>Front Plane</strong>, Sketch. Draw a circle about the size of the rig's dowel (the round bar your hook hangs from), about halfway across the inside of the top loop. Eyeball it: no dimensions.</span></li>
          <li><span>Features tab, the arrow under <strong>Curves</strong>, <strong>Split Line</strong>. Top box: your circle. <strong>Projection</strong>. Second box: the inside face of the top loop. Green check.</span></li>
          <li><span>Again in the bowl: a smaller circle where the rope rests, <strong>Split Line</strong> on the inside face of the bowl.</span></li>
        </ol>
        <p class="hx-see">A small face of its own in the top loop and another in the bowl, each with a line around it.</p>
        {video(SIM[0][0], 'Simulate 1 of 6: ' + SIM[0][1])}
        <details class="hx-stuck"><summary>That is not what I see</summary><table>
          <tr><td>No Add-Ins tab</td><td>Tools menu, Add-Ins, tick both boxes beside SOLIDWORKS Simulation, OK. Wait a few seconds. Video 1 shows it.</td></tr>
          <tr><td>Can't find Split Line</td><td>Search box, top right: set it to Commands, type split line.</td></tr>
          <tr><td>Split Line will not finish</td><td>The circle has to cross the face. Edit the sketch and drag it so it overlaps the inside curve.</td></tr>
          <tr><td>The whole loop changed</td><td>The circle swallowed the loop. Make it smaller, about the dowel's size, and crossing the inside edge.</td></tr>
        </table></details>
      </div>
      <div class="hx-stack">
        {video(SIM[1][0], 'Simulate 2 of 6: ' + SIM[1][1])}
        <div class="hx-evidence idea-panel">
          <span class="idea-eyebrow">Both split faces</span>
          {image_box('split')}
        </div>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-study" data-phase="sim" data-title="Set up the study">
    <div class="hx-step-head"><div><span class="hx-phase-tag">Simulate · 25 min</span><h2>Set up the study</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ol class="hx-do">
          <li><span>Simulation tab, <strong>New Study</strong>, Static, green check. <strong>Apply Material</strong>: <strong>Nylon 101</strong>.</span></li>
          <li><span><strong>Fixtures Advisor</strong>, Add a fixture: click the small split face in the <strong>top loop</strong> only. Green check.</span></li>
          <li><span><strong>External Loads Advisor</strong>, Force: the small split face in the <strong>bowl</strong>. Normal. Units <strong>English (IPS)</strong>, <strong>400</strong> lbf, arrows pointing <strong>down</strong> into the face.</span></li>
          <li><span>Screenshot before you run: the arrows and the study list on the left.</span></li>
        </ol>
        <p class="hx-see">Green fixture arrows on the top face, load arrows down on the bowl face.</p>
        <div class="hk-vids3">{video(SIM[2][0], '3: ' + SIM[2][1])}{video(SIM[3][0], '4: ' + SIM[3][1])}{video(SIM[4][0], '5: ' + SIM[4][1])}</div>
      </div>
      <div class="hx-stack">
        <div class="hx-evidence idea-panel">
          <span class="idea-eyebrow">Before you run</span>
          {image_box('setup')}
          <details class="hx-stuck"><summary>That is not what I see</summary><table>
            <tr><td>Arrows point up</td><td>Tick Reverse direction.</td></tr>
            <tr><td>The box says N, not lbf</td><td>English (IPS), then type 400 again. 400 N is only about 90 lbf.</td></tr>
            <tr><td>Arrows over the whole bowl or loop</td><td>Right-click in the box, Clear Selections, click only the small split face.</td></tr>
            <tr><td>New Study is grey</td><td>You are still in a sketch. Exit it first.</td></tr>
          </table></details>
        </div>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-run" data-phase="sim" data-title="Run it">
    <div class="hx-step-head"><div><span class="hx-phase-tag">Simulate · 10 min</span><h2>Run it</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ol class="hx-do">
          <li><span><strong>Run This Study</strong>. It meshes the hook, then solves. Busy for a minute or two is normal: never close SolidWorks.</span></li>
          <li><span>A notification pops up when it finishes: click <strong>No</strong>. It just finishes this study.</span></li>
          <li><span>Under <strong>Results</strong>, double-click <strong>Stress</strong>.</span></li>
          <li><span>Screenshot the hook and the color scale.</span></li>
        </ol>
        <p class="hx-see">The hook in blue to red, with the color scale beside it.</p>
        {video(SIM[5][0], 'Simulate 6 of 6: ' + SIM[5][1])}
        <details class="hx-stuck"><summary>That is not what I see</summary><table>
          <tr><td>The whole hook is one color</td><td>The load is on the wrong face or in N. Right-click the force, Edit Definition.</td></tr>
          <tr><td>An error about fixtures</td><td>The fixture is missing. Back to the last step.</td></tr>
          <tr><td>Changed the hook, old plot still showing</td><td>Run This Study again.</td></tr>
        </table></details>
      </div>
      <div class="hx-stack">
        {fig(43, caption='Blue is little stress, red the most.', cls='hk-f150')}
        <div class="hx-evidence idea-panel">
          <span class="idea-eyebrow">Your stress plot</span>
          {image_box('stress')}
        </div>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-read" data-phase="sim" data-title="Read it and plan V3">
    <div class="hx-step-head"><div><span class="hx-phase-tag">Simulate · 15 min</span><h2>Read it and plan V3</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ul class="hx-list">
          <li><strong>Red:</strong> the most stress. Reinforce it. <strong>Blue:</strong> little stress, grams you could take.</li>
          <li>Some red is always there: the hardest-working spot. Nylon 101 shows where stress piles up, not your print's real numbers.</li>
        </ul>
        <div class="hx-evidence idea-panel">
          <span class="idea-eyebrow">Your plot against your test</span>
          {picture_picks('redAt', 'Where is the most red?', SPOTS, color='stress-low')}
          <fieldset class="hx-picks hk-row3" data-field="match" data-kind="radio"><legend>Is that where Test 1 broke?</legend>
            <label class="hx-pick"><input type="radio" name="match" value="same"> Same spot</label>
            <label class="hx-pick"><input type="radio" name="match" value="close"> Close to it</label>
            <label class="hx-pick"><input type="radio" name="match" value="else"> Somewhere else</label></fieldset>
        </div>
      </div>
      <div class="hx-stack">
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">Your V3 plan</span>
        <p class="hx-readout" id="hk-match-out" aria-live="polite">Your test and your plot, side by side, show here.</p>
        <label>What will V3 change? Material at the red, and the grams from the big blue areas.
          <textarea class="idea-well" data-field="v3plan" data-min-sentences="2" placeholder="e.g. V3 adds ... at the ... The grams come from the ..."></textarea></label>
        <p class="idea-chip" data-count-for="v3plan" data-min="2">0 of 2 sentences</p>
        <p class="hx-note">Up next: <strong>Hook 04</strong>. V3, your call, and the final print.</p>
      </div>
      <details class="hx-stretch hx-more"><summary>Design Insight · IDEA Coins, not points <span class="idea-chip">Optional</span></summary>
        <p>Results: Everything looks reasonable, then Material breaking or yielding, then Show regions that carry most of the load, Yes. Slide the bar down to the hardest-working spots.</p>
        {image_box('insight', 'Design Insight screenshot (optional)', optional=True, small=True)}
      </details>
      </div>
    </div>
  </section>
'''

head_css = KIT_CSS + '''
  .hk-row2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hk-row3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @container (max-width: 26rem) { .hk-row2, .hk-row3 { grid-template-columns: 1fr; } }
  .hk-fix { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 150px); gap: var(--space-3); align-items: start; }
  .hk-fix h3 { margin: 0 0 6px; font-size: 1.05rem; color: var(--plate-ink); }
  .hk-fix .r2 .fg { max-height: 150px; }
  @container (max-width: 26rem) { .hk-fix { grid-template-columns: 1fr; } }
  .hk-n { display: inline-grid; place-items: center; width: 1.4em; height: 1.4em; border-radius: 50%; background: var(--panel-top); box-shadow: inset 0 0 0 1px var(--hair); font: 700 0.75rem/1 var(--font-mono); }
  .hk-dims tr.on .hk-n { background: var(--accent); }
  .hk-measure .fg { max-height: 330px; }
  .hk-vids3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
  .hk-vids3 .hk-vid { grid-template-columns: 1fr; }
  .hk-vids3 .hk-vmeta small { display: none; }
  .hk-vids3 .hk-vmeta b { font-size: 0.86rem; }
  @container (max-width: 26rem) { .hk-vids3 { grid-template-columns: 1fr; } }
  .hk-f150 .fg { max-height: 150px; }
'''

page_js = KIT_JS + r'''
function hkVal(f) { var el = hxRoot(f); return el ? String(hxRead(el) || '') : ''; }
function hkNum(v) { var n = parseFloat(String(v).trim()); return isFinite(n) ? n : null; }
var HK_SPOT = {top: 'the top hole', neck: 'the neck', shank: 'the shank', throat: 'the throat', bowl: 'the bowl', tip: 'the tip', joint: 'the joint', other: 'somewhere else'};
var HK_FIX = ''' + json.dumps(SPOT_FIX) + r''';
function hkRefresh() {
  var b = hkVal('breakAt'), f = HK_FIX[b] || '';
  document.querySelectorAll('.hk-fix').forEach(function (c) { c.hidden = c.dataset.fix !== f; });
  var hint = document.getElementById('hk-fix-hint');
  if (hint) hint.textContent = !b ? 'Pick where it broke, and the usual fix for that spot shows here.' : f ? 'The usual fix for ' + HK_SPOT[b] + '. How much is your call.' : 'Somewhere else: use the fix for the nearest spot, or your own.';
  var fm = hkNum(hkVal('v2mass')), mo = document.getElementById('hk-mass-out');
  if (mo) { mo.classList.toggle('warn', fm !== null && fm > 50); mo.textContent = fm === null ? 'Your weight in pounds, against 0.110 lb (50.0 g), appears here.' : 'V2: ' + (fm / 453.592).toFixed(3) + ' lb (' + fm.toFixed(1) + ' g), ' + (fm <= 50 ? 'under the cap.' : 'over 0.110 lb (50.0 g). The slicer number is the rule, supports included: take grams from where your test showed no strain.'); }
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
  if (dout) { dout.classList.toggle('warn', outs.length > 0); dout.textContent = (ins + outs.length) === 0 ? 'Each measurement is checked against its rule here.' : ins + ' inside the rules' + (outs.length ? '. Outside: row ' + outs.join(', ') + '. Write the fix in that row.' : '.'); }
  var r = hkVal('redAt'), mt = document.getElementById('hk-match-out');
  if (mt) mt.textContent = (b && r) ? 'Test 1 broke at ' + HK_SPOT[b] + '. The plot is reddest at ' + HK_SPOT[r] + '.' : 'Your test and your plot, side by side, show here.';
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
<title>Hook 03 · V2 and Simulate</title>
<!--
  Generated by hook-03.gen.py (with hookparts.py and fig/). Edit those, not this file.

  BRIEF (AUTHORING Part B; Mr. Pina 2026-10-29: the whole hook project on the current kit, his
  Rotation 2 diagrams kept)
  1 Skill: change a part where it failed and say what it cost; set up and read a static study in
    SolidWorks Simulation (split faces, fixture, load) and use it to plan the next version.
  2 Proof: the break spot and the fix; V2 with the change highlighted; V2 measured and weighed;
    the split faces, the setup before the run and the stress plot; where the red is against
    Test 1, and a V3 plan from the plot.
  3 Stuck points (Rotation 2 Hook 03: 50 blocks, median 52 percent, so V2 and Simulate are their
    own post with 14 required blocks; V3 and the final are Hook 04): changing V1 instead of saving
    V2; load in N not lbf; arrows the wrong way; fixture or load over a whole face.
  4 Builds on Hook 02 (the break, Test 1). Feeds Hook 04 (V3 from the plot).
  5 Problem: pick the fix for their own break; read their own plot against their own test.
    Stretch: Design Insight (IDEA Coins, not points).
  6 Shape: one post, two classes (Nov 6 V2, Nov 9 Simulate), two phases, eight steps, 35 points.
  7 Facts: his six Simulate videos and their steps (Rotation 2): Nylon 101, fixture on the split
    face in the top loop, 400 lbf down on the split face in the bowl. Rules as Hook 01.
  8 Look: V2 in SolidWorks red (CAD); Simulate in stress-low blue (the FEA plot's cool end).
    Diagrams are his Rotation 2 figures.
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
  :root {{ --a: #18203a; --b: #121318; --c1: #3b6ff0; --c2: #f0c33b; --c3: #e8442f; --line: #e3e6ee; }}
  :root[data-idea-scheme="light"] {{ --a: #e6ecfa; --b: #d2dbef; --c1: #2348b8; --c2: #a07800; --c3: #b42318; --line: #222630; }}
  .t {{ position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 6%; background: radial-gradient(circle at 30% 30%, var(--a), var(--b) 80%); color: var(--line); font: 700 clamp(11px, 30vh, 22px)/1 Rajdhani, system-ui, sans-serif; white-space: nowrap; }}
  .t svg {{ height: 78%; }}
  .t span {{ display: none; }}
  .t small {{ display: block; font-size: max(11px, 0.62em); opacity: 0.8; letter-spacing: 0.08em; }}
  :root[data-idea-shape="wide"] .t span, :root[data-idea-shape="banner"] .t span {{ display: block; }}
</style>
<div class="t">
  <svg viewBox="80 10 160 300" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--c1)"/><stop offset=".6" stop-color="var(--c2)"/><stop offset="1" stop-color="var(--c3)"/></linearGradient></defs><g fill="none" stroke="url(#g)" stroke-width="14" stroke-linejoin="round"><circle cx="150" cy="70" r="40"/><path d="M118 104 V200"/><path d="M196 198 A54 54 0 1 1 120 196"/></g></svg>
  <span><small>HOOK 03</small>V2 and Simulate</span>
</div>
</template>
</head>
<body class="idea-plate">
{symbol()}
<main id="hx-page">
  <header class="hx-hero">
    <div class="hx-hero-text">
      <span class="hx-crumb">IDEA100 · Hook Design Competition · Hook 03</span>
      <h1>V2 and Simulate</h1>
      <p class="hx-done-when"><strong>Done when:</strong> V2 fixes the spot Test 1 broke, it is measured and weighed, and a stress plot of V2 tells you what V3 changes.</p>
      <div class="hx-row">
        <span class="idea-chip">Writing: 4 sentences in all</span>
        <span class="idea-chip">Files stay in Armory</span>
        <span class="idea-chip">Done early? Pull V2, or Design Insight</span>
      </div>
    </div>
    <div class="hx-hero-art" aria-hidden="true">{fig(43)}</div>
  </header>
  <nav class="hx-plan idea-panel" id="hx-plan" aria-label="Classes in this assignment"></nav>
  <div class="hx-bar idea-panel" id="hx-bar"></div>
  <p class="hx-banner-failed" id="hx-failed" role="alert" hidden></p>
{steps}
</main>
<script type="application/json" id="hx-plan-data">
{{
  "phases": [
    {{"id": "v2", "name": "V2", "color": "solidworks-red", "days": [{{"label": "Class 1", "short": "Fix it where it broke", "date": "2026-11-06"}}]}},
    {{"id": "sim", "name": "Simulate", "color": "stress-low", "days": [{{"label": "Class 2", "short": "Where the stress piles up", "date": "2026-11-09"}}]}}
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
tpl = hookart.inject(tpl, 'fea', 'HOOK 03', 'V2 and Simulate')
(HERE / 'hook-03.src.html').write_text(tpl)
print('wrote hook-03.src.html', len(tpl))
