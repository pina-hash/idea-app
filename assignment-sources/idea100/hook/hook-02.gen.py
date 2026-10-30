"""Hook 02 · V1, Print and Pull (IDEA100 hook project) on the hx-kit. Writes hook-02.src.html."""
import json, pathlib
from hookparts import (fig, fig_css, symbol, image_box, video, picture_picks, SPOTS, MODES, KIT_CSS, KIT_JS, esc)

HERE = pathlib.Path(__file__).parent
PRINT_VID = 'A2JFnsAUOSk'

def lv(*rows):
    return [{"points": p, "label": l, "short": sh, "descriptor": d} for p, l, sh, d in rows]

manifest = {
  "schemaVersion": 3, "kind": "html-assignment", "title": "Hook 02 · V1, Print and Pull", "course": "IDEA100", "points": 35,
  "thumbnail": {"kind": "html", "template": "idea-thumbnail"},
  "modules": [
    {"id": "h2-v1", "title": "V1", "points": 10, "audience": "individual",
     "blocks": [
       {"id": "h2-v1-type", "field": "hookType", "type": "radio", "prompt": "V1 hook type: standard or multi-part"},
       {"id": "h2-v1-pieces", "field": "pieces", "type": "radio", "optional": True, "prompt": "Multi-part: how the pieces are made"},
       {"id": "h2-v1-shot", "field": "shot", "type": "image", "prompt": "Screenshot of V1: whole window, file name and tree"},
       {"id": "h2-v1-dims", "field": "dims", "type": "table", "prompt": "V1 measurements against the rules, with a fix for any that miss"}],
     "criteria": [
       {"id": "shot", "text": "V1 is a whole hook in its own file, shown with its name and a readable tree", "points": 4,
        "levels": lv((4, "Complete", "Whole hook, name, tree", "The screenshot shows a whole hook (not a start), V1_ and the student's last name at the top, and a readable tree with no red or yellow."),
                     (3, "Proficient", "Whole hook, one thing off", "A whole hook, but the tree has red or yellow, or the name does not follow V1_LASTNAME."),
                     (2, "Developing", "Still a start", "A sketch or a partial body, or the tree and name cannot be read."),
                     (0, "Absent", "No screenshot", "No screenshot."))},
       {"id": "dims", "text": "Every dimension is measured on the model, and every one outside a rule has a fix", "points": 6,
        "levels": lv((6, "Complete", "All measured, every miss fixed", "Every row carries a number measured on the student's own model, and every row outside its rule says what changes and by how much."),
                     (4, "Proficient", "One row missing or unfixed", "One row has no measurement, or one row outside its rule has no fix."),
                     (2, "Developing", "Rules copied, not measured", "The numbers repeat the rule rather than the model, or two or more rows are missing."),
                     (0, "Absent", "Empty", "No measurements."))}]},
    {"id": "h2-print", "title": "Slice and print", "points": 10, "audience": "individual",
     "blocks": [
       {"id": "h2-print-printer", "field": "printer", "type": "radio", "prompt": "Which printer: X1 Carbon or H2D"},
       {"id": "h2-print-nozzle", "field": "nozzle", "type": "radio", "prompt": "Nozzle set in Bambu Studio"},
       {"id": "h2-print-filament", "field": "filament", "type": "radio", "prompt": "Filament set in Bambu Studio"},
       {"id": "h2-print-full", "field": "fullMass", "type": "text", "prompt": "Full-size weight from Bambu Studio, grams"},
       {"id": "h2-print-half", "field": "halfMass", "type": "text", "prompt": "Half-size weight from Bambu Studio, grams"},
       {"id": "h2-print-preview", "field": "preview", "type": "image", "prompt": "Preview screenshot: the thinnest spot, weight showing"},
       {"id": "h2-print-walls", "field": "walls", "type": "longText", "minSentences": 1, "prompt": "At the thinnest spot: solid walls or infill, and why it matters in a pull"},
       {"id": "h2-print-where", "field": "printerNo", "type": "text", "prompt": "The printer it is on, name or number"}],
     "criteria": [
       {"id": "setup", "text": "The half-size copy is set up right and printing", "points": 4,
        "levels": lv((4, "Complete", "Right settings, printing", "The nozzle matches the printer picked, Generic ABS, and the printer it runs on is named."),
                     (2, "Developing", "Printing, a setting off", "Printing, but the nozzle does not match the printer or the filament is not Generic ABS."),
                     (0, "Absent", "Not printing", "No printer named and no settings picked."))},
       {"id": "weights", "text": "Both weights are read off Bambu Studio and the full size is judged against 50.0 g", "points": 3,
        "levels": lv((3, "Complete", "Both weights, judged", "Full-size and half-size weights from the slicer, and the full size is at or under 50.0 g, or the page's warning was acted on."),
                     (2, "Proficient", "One weight", "One weight is missing or is not a slicer reading."),
                     (0, "Absent", "None", "No weights."))},
       {"id": "preview", "text": "The preview shows the thinnest spot, and the line says why walls or infill matter there", "points": 3,
        "levels": lv((3, "Complete", "Found it, and why", "A sliced preview at the thinnest spot with the weight readable, and a sentence on walls or infill there and why it matters in a pull."),
                     (2, "Proficient", "Shot or sentence weak", "The screenshot is not at the thinnest spot or the weight is hidden, or the sentence names walls or infill with no why."),
                     (1, "Developing", "One of the two", "Only the screenshot or only the sentence."),
                     (0, "Absent", "Neither", "Nothing."))}]},
    {"id": "h2-pull", "title": "The pull", "points": 15, "audience": "individual",
     "blocks": [
       {"id": "h2-pull-call-at", "field": "callAt", "type": "radio", "prompt": "Your call, before the pull: where will it break?"},
       {"id": "h2-pull-call-why", "field": "callWhy", "type": "longText", "minSentences": 1, "prompt": "Why there?"},
       {"id": "h2-pull-load", "field": "load", "type": "text", "prompt": "Breaking load from the score sheet, lb"},
       {"id": "h2-pull-photo", "field": "photo", "type": "image", "prompt": "Photo of the break"},
       {"id": "h2-pull-photo-2", "field": "photo2", "type": "image", "optional": True, "prompt": "Another photo of the break"},
       {"id": "h2-pull-mode", "field": "mode", "type": "radio", "prompt": "What the hook did when it failed"},
       {"id": "h2-pull-mode-other", "field": "modeOther", "type": "text", "optional": True, "prompt": "What it did, if none of the choices fit"},
       {"id": "h2-pull-at", "field": "breakAt", "type": "radio", "prompt": "Where it broke"},
       {"id": "h2-pull-next", "field": "nextChange", "type": "longText", "minSentences": 1, "prompt": "One thing V2 changes because of it"},
       {"id": "h2-pull-tests", "field": "tests", "type": "table", "optional": True, "prompt": "More pulls: date, version, load, where it broke"}],
     "criteria": [
       {"id": "call", "text": "A call made before the pull, with a reason", "points": 4,
        "levels": lv((4, "Complete", "Spot and a real reason", "A spot picked before the pull, and a reason about where the load goes or where the hook is thinnest. A wrong call earns the same as a right one."),
                     (2, "Developing", "Spot, vague reason", "A spot with a reason that could fit any hook."),
                     (0, "Absent", "No call", "No spot picked."))},
       {"id": "pulled", "text": "The copy is pulled at the rig and the load recorded", "points": 3,
        "levels": lv((3, "Complete", "Pulled, load in", "The breaking load from the score sheet, in pounds."),
                     (1, "Developing", "Load not a reading", "A load that is not from the rig's score sheet, or no unit."),
                     (0, "Absent", "Not pulled", "No load."))},
       {"id": "photo", "text": "The break photo is close, in focus, and shows the broken face", "points": 3,
        "levels": lv((3, "Complete", "Close, sharp, broken face", "At least one photo close and in focus on the broken face."),
                     (2, "Proficient", "Blurry or far", "A photo of the break that is blurry, far away, or misses the broken face."),
                     (0, "Absent", "No photo", "No photo."))},
       {"id": "read", "text": "Reads the break: how it failed, where, and what V2 changes", "points": 5,
        "levels": lv((5, "Complete", "Mode, spot, change", "Picks how it failed and where, and names one change for V2 at that place, by how much."),
                     (3, "Proficient", "Change is vague", "Mode and spot picked, but the change is not tied to where it broke."),
                     (1, "Developing", "Partly read", "Only the mode or only the spot."),
                     (0, "Absent", "Not read", "Nothing."))}]}
  ]
}

TOOLS = [  # name, where, what, on a hook
    ('Measure', 'Evaluate tab', 'Click two circular edges for center to center, or one edge for its diameter.', 'Every number in the table.'),
    ('Offset Entities', 'Sketch tab', 'Copies an outline a set distance inside or outside itself.', 'A raised rim: offset inward, then cut a pocket inside it.'),
    ('Boss from a face', 'Features tab', 'Click a face, sketch on it, extrude new material up from it.', 'Thicker bosses around the holes, or a thicker bowl.'),
    ('Extruded Cut', 'Features tab', 'Removes material through a sketch.', 'Pockets where the load does not go.'),
    ('Fillet', 'Features tab', 'Rounds an edge to a radius.', 'Every sharp inside corner, where cracks start.'),
    ('Chamfer', 'Features tab', 'Cuts an edge to a flat bevel.', 'A down-facing edge: 45 degrees prints without support.'),
]
tools_html = ''.join(f'<li><strong>{esc(n)}</strong> ({esc(w)}): {esc(a)} <em>On a hook:</em> {esc(b)}</li>' for n, w, a, b in TOOLS)

DIMS = [  # n, name, how, rule, check
    (1, 'Center to center', 'Hole center to bowl center', '2.000 to 3.000', 'range:2:3'),
    (2, 'Top hole', 'Diameter, closed loop', '1.000 or more', 'min:1'),
    (3, 'Bottom inside', 'The circle the bowl holds', '1.000 or more', 'min:1'),
    (4, 'Opening', 'Narrowest gap', '0.500 or more', 'min:0.5'),
    (5, 'Thickness', 'Thickest point anywhere', '0.750 or less', 'max:0.75'),
]
dims_rows = ''.join(
    f'<tr data-dim="{n}" data-check="{chk}"><td data-label="Dimension"><span class="hk-n">{n}</span> <strong>{esc(nm)}</strong></td>'
    f'<td data-label="The rule"><span class="hk-num">{esc(rule)}</span></td>'
    f'<td data-label="Yours, in"><input class="idea-well idea-well--field" type="text" inputmode="decimal" aria-label="{esc(nm)}: yours, inches" placeholder="e.g. 0.000"></td>'
    f'<td data-label="If outside: the fix"><input class="idea-well idea-well--field" type="text" aria-label="{esc(nm)}: the fix" placeholder="e.g. edit ... to ..."></td></tr>'
    for n, nm, how, rule, chk in DIMS)

steps = f'''
  <section class="hx-step idea-panel" id="s-open" data-phase="v1" data-title="Open V1 and pick its type">
    <div class="hx-step-head"><div><span class="hx-phase-tag">V1 · 5 min</span><h2>Open V1 and pick its type</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ol class="hx-do">
          <li><span>Open <strong>Armory</strong>, then your <strong>IDEA 100</strong> folder, <strong>Last_First</strong>.</span></li>
          <li><span>Double-click <strong>V1_</strong> and your last name. It opens in SolidWorks and is checked out to you.</span></li>
          <li><span>No V1 yet? New part, IPS, save it there as V1_ and your last name. SolidWorks Day's last step shows how.</span></li>
          <li><span>Leaving class: <strong>Ctrl+S</strong>, then close it. That checks it in.</span></li>
        </ol>
        <p class="hx-see">Your V1 open, with V1_ and your last name at the very top of SolidWorks.</p>
        <details class="hx-stuck"><summary>That is not what I see</summary><table>
          <tr><td>My V1 is not in my folder</td><td>Find it on this computer: File, Open, Recent. Then Save As into your Armory folder.</td></tr>
          <tr><td>It says someone has it checked out</td><td>That someone is you on another computer. Go save and close it there.</td></tr>
          <tr><td>Armory asks me to sign in</td><td>Sign in with your boscotech.net account, the same as the site.</td></tr>
        </table></details>
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">Your hook type</span>
        {picture_picks('hookType', 'Standard or multi-part? Same as your sketch, or switch now.', [('standard', 'Standard', 'One piece. The rope slides on.', 3), ('multi', 'Multi-part', 'Pieces that open and close. Harder.', 4)])}
        <fieldset class="hx-picks" data-field="pieces" data-kind="radio" data-optional>
          <legend>Multi-part only: your pieces</legend>
          <label class="hx-pick"><input type="radio" name="pieces" value="two"> Two different</label>
          <label class="hx-pick"><input type="radio" name="pieces" value="mirror"> A mirrored pair</label>
          <label class="hx-pick"><input type="radio" name="pieces" value="twice"> One piece, printed twice</label>
          <label class="hx-pick"><input type="radio" name="pieces" value="three"> Three pieces</label>
        </fieldset>
        <p class="hx-note">Multi-part: one part file per piece, <strong>V1A_</strong>, <strong>V1B_</strong>, in your Armory folder. No assembly.</p>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-finish" data-phase="v1" data-title="Finish V1">
    <div class="hx-step-head"><div><span class="hx-phase-tag">V1 · 50 min</span><h2>Finish V1</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <p>Today it becomes a <strong>whole hook</strong>: finished enough to print. It does not have to be legal yet.</p>
        <ol class="hx-do">
          <li><span>Build it from your own sketch, with your <strong>3D feature</strong> from Hook 01.</span></li>
          <li><span>Rebuild (<strong>Ctrl+B</strong>). The tree should have no red or yellow.</span></li>
          <li><span><strong>Ctrl+S</strong> often.</span></li>
          <li><span>Screenshot the whole window: your part, the file name at the top, the tree on the left.</span></li>
        </ol>
        <p class="hx-see">A whole hook, and a tree with no red or yellow marks.</p>
        <details class="hx-more"><summary>Tools you may want</summary>
          <ul class="hx-list">{tools_html}</ul>
        </details>
        <details class="hx-stuck"><summary>That is not what I see</summary><table>
          <tr><td>Red or yellow in the tree</td><td>Click it: it says what is wrong. Most often a sketch lost a line it was attached to. Edit that sketch.</td></tr>
          <tr><td>I want to change something I already made</td><td>Edit it, do not start over: right-click the feature, Edit Feature, or its sketch, Edit Sketch.</td></tr>
          <tr><td>Stuck on a click</td><td>SolidWorks Day has the videos and the search of 105 fixes.</td></tr>
        </table></details>
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">Your V1</span>
        {image_box('shot')}
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-measure" data-phase="v1" data-title="Measure it">
    <div class="hx-step-head"><div><span class="hx-phase-tag">V1 · 15 min</span><h2>Measure it</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <p><strong>Evaluate</strong> tab, <strong>Measure</strong>. Inches, three decimals. Outside a rule is fine today: write the fix.</p>
        {fig(5, caption='Each number on your hook matches a row. Click a row to light its number.', cls='hk-measure')}
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">Your measurements</span>
        <div data-field="dims" data-kind="table">
          <table class="hx-table hk-dims"><thead><tr><th>Dimension</th><th>The rule</th><th>Yours, <span class="hx-keep-case">in</span></th><th>If outside: the fix</th></tr></thead><tbody>{dims_rows}</tbody></table>
        </div>
        <p class="hx-readout" id="hk-dims-out" aria-live="polite">Each measurement is checked against its rule here.</p>
        <p class="hx-note">Multi-part: measure each rule on the piece that carries it; type NA for the opening. Opening: click the tip face and the shank face. Thickness: the two flat faces.</p>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-setup" data-phase="print" data-title="Set it up in Bambu Studio">
    <div class="hx-step-head"><div><span class="hx-phase-tag">Print · 15 min</span><h2>Set it up in Bambu Studio</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ol class="hx-do">
          <li><span>Pick a <strong>free printer</strong> now and stay with it: you slice for that printer.</span></li>
          <li><span>SolidWorks: <strong>File, Save As</strong>, type <span class="it" data-term="STEP">STEP</span> AP214, your folder. Never STL. Multi-part: one STEP per piece, all onto one plate.</span></li>
          <li><span>Bambu Studio: <strong>Create new project</strong> (the cube with a plus), your STEP file.</span></li>
          <li><span>Printer: <strong>X1 Carbon, 0.6 mm</strong>, flow Standard. H2D: on its screen, <strong>Settings, Nozzle and extruder</strong> says which nozzle is on the HIPS side. Set exactly that.</span></li>
          <li><span>Filament: <strong>Generic ABS</strong> (every spool here is HIPS). Plate: <strong>Textured PEI</strong>.</span></li>
          <li><span><strong>Enable support</strong>, then <strong>Auto orient</strong>. The hook lies flat, so the pull runs along the layers.</span></li>
        </ol>
        {video(PRINT_VID, 'Printing: STEP file to a clean plate', [('Into Bambu Studio', 74), ('Printer and nozzle', 137), ('Supports and orient', 272), ('H2D: which side', 1086)])}
      </div>
      <div class="hx-stack">
        {fig(9, cls='hk-figcap')}
        <div class="hx-evidence idea-panel">
          <span class="idea-eyebrow">What Bambu Studio shows now</span>
          <fieldset class="hx-picks hk-row3" data-field="printer" data-kind="radio"><legend>Printer</legend>
            <label class="hx-pick"><input type="radio" name="printer" value="x1c"> X1 Carbon</label>
            <label class="hx-pick"><input type="radio" name="printer" value="h2d"> H2D</label></fieldset>
          <fieldset class="hx-picks hk-row3" data-field="nozzle" data-kind="radio"><legend>Nozzle</legend>
            <label class="hx-pick"><input type="radio" name="nozzle" value="0.6"> 0.6 mm</label>
            <label class="hx-pick"><input type="radio" name="nozzle" value="0.6hf"> 0.6 mm High Flow</label>
            <label class="hx-pick"><input type="radio" name="nozzle" value="0.4"> 0.4 mm</label></fieldset>
          <fieldset class="hx-picks hk-row3" data-field="filament" data-kind="radio"><legend>Filament</legend>
            <label class="hx-pick"><input type="radio" name="filament" value="gabs"> Generic ABS</label>
            <label class="hx-pick"><input type="radio" name="filament" value="ghips"> Generic HIPS</label>
            <label class="hx-pick"><input type="radio" name="filament" value="pla"> Generic PLA</label></fieldset>
          <p class="hx-readout" id="hk-setup-out" aria-live="polite">Pick what it shows.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-weigh" data-phase="print" data-title="Weigh it, then halve it">
    <div class="hx-step-head"><div><span class="hx-phase-tag">Print · 10 min</span><h2>Weigh it, then halve it</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ol class="hx-do">
          <li><span><strong>Slice plate</strong>. Read the filament weight in grams: your hook at full size.</span></li>
          <li><span>Back to <strong>Prepare</strong>. <strong>Ctrl+A</strong>, then <strong>Scale</strong>: uniform, <strong>50 percent</strong>.</span></li>
          <li><span>Slice again and read it. One plate, your hook only.</span></li>
        </ol>
        <div class="hk-figs">{fig(10)}{fig(11)}</div>
        <p class="hx-see">Two weights: full size, then about one sixth to one eighth of it at half size.</p>
        <details class="hx-stuck"><summary>That is not what I see</summary><table>
          <tr><td>No Scale tool</td><td>It is on the top toolbar beside Move and Rotate. Select the hook first.</td></tr>
          <tr><td>The weight is huge</td><td>You scaled to 50 percent twice, or brought in the wrong file. Undo and check the size.</td></tr>
        </table></details>
        <p class="hx-note">Supports count in the slicer's weight. On inspection day the scale weighs the hook with supports removed.</p>
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">Your weights</span>
        <label>Full size, from Bambu Studio
          <span class="hx-unit"><input class="idea-well idea-well--field" type="text" inputmode="decimal" data-field="fullMass" placeholder="e.g. 00.0"><span>g</span></span></label>
        <label>Half size, from Bambu Studio
          <span class="hx-unit"><input class="idea-well idea-well--field" type="text" inputmode="decimal" data-field="halfMass" placeholder="e.g. 0.0"><span>g</span></span></label>
        <p class="hx-readout" id="hk-mass-out" aria-live="polite">Your weights in pounds, and against 0.11 lb (50.0 g), appear here.</p>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-preview" data-phase="print" data-title="Find the thinnest spot">
    <div class="hx-step-head"><div><span class="hx-phase-tag">Print · 10 min</span><h2>Find the thinnest spot</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ol class="hx-do">
          <li><span>In <strong>Preview</strong>, drag the layer slider on the right to a middle layer.</span></li>
          <li><span>Look at the narrowest part of the outline: solid walls, or walls with <span class="it" data-term="infill">infill</span> between them?</span></li>
          <li><span>Screenshot the whole window, the weight showing.</span></li>
        </ol>
        <p class="hx-see">The outline of your hook at one layer, walls around the edge.</p>
        {fig(12, caption='Thick: walls with infill between them. Thin: solid walls.')}
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">Your preview</span>
        {image_box('preview')}
        <label>At the thinnest spot: solid walls or infill, and why does that matter in a pull?
          <textarea class="idea-well" data-field="walls" data-min-sentences="1" placeholder="At the ..., it is ..., so when it is pulled ..."></textarea></label>
        <p class="idea-chip" data-count-for="walls" data-min="1">0 of 1 sentence</p>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-print" data-phase="print" data-title="Print it">
    <div class="hx-step-head"><div><span class="hx-phase-tag">Print · 25 min</span><h2>Print it</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ol class="hx-do">
          <li><span>Card or drive out of <strong>your</strong> printer: X1 Carbon microSD beside the screen, into an adapter from the tables between the printers. H2D: USB, top left.</span></li>
          <li><span>The arrow beside Print plate: <strong>Export plate sliced file</strong>, onto the card or drive, top level, named <strong>LASTNAME-hook02-half</strong>. Never press Print plate.</span></li>
          <li><span>Eject it, back into its printer.</span></li>
          <li><span>On the printer: <strong>Filament</strong> page, tap the HIPS slot, it must say <strong>Generic ABS</strong>. Pick it if not.</span></li>
          <li><span><strong>Print Files</strong>, your file, <strong>Print</strong>. Watch the first layer, then close the door.</span></li>
          <li><span>Done: oven mitt, plate onto the glass table until the print crackles free. Scrap in a green bin, plate back against the stops.</span></li>
        </ol>
        {video(PRINT_VID, 'Printing: card, start, clean plate', [('Export onto the card', 737), ('Start it', 860), ('When it finishes', 982), ('H2D: USB', 1525)])}
      </div>
      <div class="hx-stack">
        <div class="hk-figs">{fig(14)}{fig(20)}</div>
        <div class="hx-evidence idea-panel">
          <span class="idea-eyebrow">Where it is printing</span>
          <label>The printer it is on: the name or number on the printer
            <input class="idea-well idea-well--field" type="text" data-field="printerNo" placeholder="e.g. X1C-__"></label>
          <details class="hx-stuck"><summary>That is not what I see</summary><table>
            <tr><td>The printer will not start my file</td><td>The nozzle in Bambu Studio does not match the printer, or (H2D) you sliced for the other side. Back to the setup step.</td></tr>
            <tr><td>My file is not on the card</td><td>It went into a folder. Export again onto the card itself.</td></tr>
            <tr><td>No card or drive in the printer</td><td>Someone is using it. Wait, or use another printer. Never take one from another printer.</td></tr>
            <tr><td>The first layer curls or drags</td><td>Press Stop. Let it cool, clean the plate, and start again.</td></tr>
          </table></details>
        </div>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-call" data-phase="pull" data-title="Call it">
    <div class="hx-step-head"><div><span class="hx-phase-tag">The pull · 10 min</span><h2>Call it</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <p>Before you pull it, look at your test copy. <strong>Where will it break, and why there?</strong> A wrong call earns the same as a right one.</p>
        {fig(23, caption='The rig: the top hole sits on a fixed pin, a rope through the bowl pulls down until it breaks.')}
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">Your call</span>
        {picture_picks('callAt', 'Where will it break?', SPOTS)}
        <label>Why there? (Somewhere else? Say where.)
          <textarea class="idea-well" data-field="callWhy" data-min-sentences="1" placeholder="It is thinnest at the ..., and the load ..."></textarea></label>
        <p class="idea-chip" data-count-for="callWhy" data-min="1">0 of 1 sentence</p>
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-pull" data-phase="pull" data-title="Pull it">
    <div class="hx-step-head"><div><span class="hx-phase-tag">The pull · 15 min</span><h2>Pull it</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        <ol class="hx-do">
          <li><span><strong>Safety glasses on.</strong> Stand where the rig operator (Mr. Pina, or the student he names) tells you.</span></li>
          <li><span>Watch <strong>where</strong> it breaks. That is the real result.</span></li>
          <li><span>Copy your load from the score sheet at the rig.</span></li>
          <li><span>Keep every piece in your bin. You need them for V2.</span></li>
          <li><span>Photograph the break: close, the broken face in focus. On your phone: open this post, <strong>Take photo</strong>.</span></li>
        </ol>
        <p class="hx-see">A sharp photo of the broken face, close enough to see where the crack started.</p>
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">Your pull</span>
        <label>Breaking load, from the score sheet
          <span class="hx-unit"><input class="idea-well idea-well--field" type="text" inputmode="decimal" data-field="load" placeholder="e.g. 00.0"><span>lb</span></span></label>
        {image_box('photo', 'Paste the photo here, or press Choose file')}
        {image_box('photo2', 'Another angle (optional)', optional=True, small=True)}
      </div>
    </div>
  </section>

  <section class="hx-step idea-panel" id="s-read" data-phase="pull" data-title="Read the break">
    <div class="hx-step-head"><div><span class="hx-phase-tag">The pull · 15 min</span><h2>Read the break</h2></div></div>
    <div class="hx-step-body">
      <div class="hx-stack">
        {picture_picks('mode', 'How did it fail?', MODES)}
        <label>None fit, or it broke somewhere else? Say what and where
          <input class="idea-well idea-well--field" type="text" data-field="modeOther" data-optional placeholder="e.g. it ... before it ..."></label>
        <p class="hx-note">Up next: <strong>Hook 03</strong>. V2 from your break, then the simulation.</p>
        <details class="hx-stretch hx-more"><summary>More pulls · IDEA Coins, not points <span class="idea-chip">Optional</span></summary>
          <p>Print and pull as many more as you want until the final: a fix, a second copy, V2. Log each one.</p>
          <div data-field="tests" data-kind="table" data-optional><table class="hx-table"><thead><tr><th>Date</th><th>Version</th><th>Load, <span class="hx-keep-case">lb</span></th><th>Where it broke</th></tr></thead><tbody>
            <tr><td data-label="Date"><input class="idea-well idea-well--field" type="text" aria-label="Test 2 date" placeholder="e.g. 11/__"></td><td data-label="Version"><input class="idea-well idea-well--field" type="text" aria-label="Test 2 version" placeholder="e.g. V__"></td><td data-label="Load, lb"><input class="idea-well idea-well--field" type="text" aria-label="Test 2 load" placeholder="e.g. 00"></td><td data-label="Where it broke"><input class="idea-well idea-well--field" type="text" aria-label="Test 2 where" placeholder="e.g. the ..."></td></tr>
            <tr><td data-label="Date"><input class="idea-well idea-well--field" type="text" aria-label="Test 3 date" placeholder="e.g. 11/__"></td><td data-label="Version"><input class="idea-well idea-well--field" type="text" aria-label="Test 3 version" placeholder="e.g. V__"></td><td data-label="Load, lb"><input class="idea-well idea-well--field" type="text" aria-label="Test 3 load" placeholder="e.g. 00"></td><td data-label="Where it broke"><input class="idea-well idea-well--field" type="text" aria-label="Test 3 where" placeholder="e.g. the ..."></td></tr>
          </tbody></table></div>
        </details>
      </div>
      <div class="hx-evidence idea-panel">
        <span class="idea-eyebrow">Your break</span>
        {picture_picks('breakAt', 'Where did it break? White marks show where it stretched first.', SPOTS)}
        <p class="hx-readout" id="hk-call-out" aria-live="polite">Your call against the real break shows here.</p>
        <label>One thing V2 changes because of it: where, and by how much
          <textarea class="idea-well" data-field="nextChange" data-min-sentences="1" placeholder="V2 makes the ... thicker by ..., because it broke at ..."></textarea></label>
        <p class="idea-chip" data-count-for="nextChange" data-min="1">0 of 1 sentence</p>
      </div>
    </div>
  </section>
'''

head_css = KIT_CSS + '''
  .hk-row3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @container (max-width: 26rem) { .hk-row3 { grid-template-columns: 1fr; } }
  .hk-dims td { vertical-align: middle; }
  .hk-dims small, .hk-tools small { color: var(--text-2); }
  .hk-n { display: inline-grid; place-items: center; width: 1.4em; height: 1.4em; border-radius: 50%; background: var(--panel-top); box-shadow: inset 0 0 0 1px var(--hair); font: 700 0.75rem/1 var(--font-mono); }
  .hk-dims tr.on .hk-n { background: var(--accent); color: var(--primary-ink, var(--plate-ink)); }
  .hk-ck { font-family: var(--font-mono); font-size: 0.8rem; white-space: nowrap; }
  .hk-ck.warn { color: var(--amber, var(--plate-ink)); }
  .hk-measure .fg { max-height: 330px; }
  #s-pull .hx-evidence .hx-box { width: min(100%, 220px); }
  #s-pull .hk-small .hx-box { height: 60px; min-height: 60px; }
'''

page_js = KIT_JS + r'''
function hkVal(f) { var el = hxRoot(f); return el ? String(hxRead(el) || '') : ''; }
function hkNum(v) { var n = parseFloat(String(v).trim()); return isFinite(n) ? n : null; }
var HK_SPOT = {top: 'the top hole', neck: 'the neck', shank: 'the shank', throat: 'the throat', bowl: 'the bowl', tip: 'the tip', joint: 'the joint', other: 'somewhere else'};
function hkRefresh() {
  /* the setup mirror */
  var pr = hkVal('printer'), nz = hkVal('nozzle'), fl = hkVal('filament'), so = document.getElementById('hk-setup-out');
  if (so) {
    var msg = [];
    if (pr === 'x1c' && nz && nz !== '0.6') msg.push('Every X1 Carbon here is 0.6 mm: set the nozzle again.');
    if (fl && fl !== 'gabs') msg.push('Our spools are HIPS, set as Generic ABS.');
    so.classList.toggle('warn', msg.length > 0);
    so.textContent = msg.length ? msg.join(' ') : (pr && nz && fl ? 'Set. Next: weigh it.' : 'Pick what it shows.');
  }
  /* weights in pounds and grams */
  var fm = hkNum(hkVal('fullMass')), hm = hkNum(hkVal('halfMass')), mo = document.getElementById('hk-mass-out');
  if (mo) {
    var t = [];
    if (fm !== null) t.push('Full size ' + (fm / 453.592).toFixed(2) + ' lb (' + fm.toFixed(1) + ' g): ' + (fm <= 50 ? 'under the 0.11 lb (50.0 g) cap.' : 'over 0.11 lb (50.0 g) in the slicer, supports included. Without supports it may pass; if it is far over, take material from where it is not working.'));
    if (fm !== null && hm !== null && hm > 0 && hm < fm) t.push('Half size is ' + (fm / hm).toFixed(1) + ' times lighter. Pure scaling gives 8 times; the walls do not shrink with it, so it is usually less.');
    if (fm !== null && hm !== null && hm >= fm) t.push('The half-size weight should be much smaller. Check you scaled to 50 percent.');
    mo.classList.toggle('warn', fm !== null && fm > 50);
    mo.textContent = t.length ? t.join(' ') : 'Your weights in pounds, and against 0.11 lb (50.0 g), appear here.';
  }
  /* measure table checks */
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
  /* call against the break */
  var c = hkVal('callAt'), b = hkVal('breakAt'), co = document.getElementById('hk-call-out');
  if (co) co.textContent = c && b ? (c === 'other' || b === 'other' ? 'You called ' + HK_SPOT[c] + '; it broke at ' + HK_SPOT[b] + '. Compare your words.' : 'You called ' + HK_SPOT[c] + '. It broke at ' + HK_SPOT[b] + '. ' + (c === b ? 'Your call held.' : 'Different spot: what did you miss?')) : 'Your call against the real break shows here.';
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
<title>Hook 02 · V1, Print and Pull</title>
<!--
  Generated by hook-02.gen.py (with hookparts.py and fig/). Edit those, not this file.

  BRIEF (AUTHORING Part B; Mr. Pina 2026-10-29: the whole hook project on the current kit, his
  Rotation 2 diagrams kept)
  1 Skill: finish a part in SolidWorks and measure it against rules; set up, weigh and print a
    half-size copy on the lab printers alone; call where it breaks, pull it, and read the break.
  2 Proof: V1 screenshot with name and tree; five measurements with fixes; the Bambu Studio
    settings picked and weights read; a preview at the thinnest spot; the printer it is on; a
    call before the pull; the load and a photo of the break; the mode, the spot and one change.
  3 Stuck points (Rotation 2 Hook 02: 62 blocks, median 32 percent saved, so this post is cut to
    17 required blocks; printing steps now follow his own printing video, not Bambu's): wrong
    nozzle for the printer; HIPS slot not set to Generic ABS; pressing Print plate; exporting into
    a folder; rules copied instead of measured.
  4 Builds on SolidWorks Day (V1 started) and Hook 01 (the sketch and 3D feature). Feeds Hook 03.
  5 Problem: measure their own part and write a fix for each miss; call the break before the
    pull. Stretch: more pulls, logged (IDEA Coins, not points).
  6 Shape: one post, three classes (Nov 3 V1, Nov 4 print, Nov 5 pull), three phases, ten steps,
    35 points, 18 required blocks. Individual. Files live in Armory: nothing is uploaded.
  7 Facts (his, from 2026-09-30 and his printing video, 2026-10-08): X1C nozzles all 0.6 mm; H2D
    0.6, 0.6 High Flow or 0.4; spools are HIPS set by hand to Generic ABS; Textured PEI plates;
    supports always on; export the plate sliced file, never Print plate; microSD on the X1C, USB
    top left on the H2D; oven mitt, glass table, green bins. Rotation 2 rules: 50.0 g max.
  8 Look: V1 in SolidWorks red, Print in filament-orange (the printed part), The pull in steel
    (the rig). A break in a diagram is stress-high red, always beside its word. Diagrams are his Rotation 2 figures.
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
  :root {{ --a: #2b2018; --b: #141112; --ink: #f2943e; --line: #e8dfd6; --red: #ff6b5c; }}
  :root[data-idea-scheme="light"] {{ --a: #fbeee2; --b: #ecd9c6; --ink: #b4560e; --line: #2c2420; --red: #b42318; }}
  .t {{ position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 6%; background: radial-gradient(circle at 30% 30%, var(--a), var(--b) 80%); color: var(--line); font: 700 clamp(11px, 30vh, 22px)/1 Rajdhani, system-ui, sans-serif; white-space: nowrap; }}
  .t svg {{ height: 78%; }}
  .t span {{ display: none; }}
  .t small {{ display: block; font-size: max(11px, 0.62em); opacity: 0.8; letter-spacing: 0.08em; }}
  :root[data-idea-shape="wide"] .t span, :root[data-idea-shape="banner"] .t span {{ display: block; }}
</style>
<div class="t">
  <svg viewBox="80 10 160 300" aria-hidden="true"><g fill="none" stroke="var(--ink)" stroke-width="12" stroke-linejoin="round"><circle cx="150" cy="70" r="40"/><path d="M118 104 V200"/><path d="M196 198 A54 54 0 1 1 120 196"/></g><path d="M104 150 l20 -8 l-6 14 l22 -6" fill="none" stroke="var(--red)" stroke-width="7" stroke-linejoin="round"/></svg>
  <span><small>HOOK 02</small>V1, Print and Pull</span>
</div>
</template>
</head>
<body class="idea-plate">
{symbol()}
<main id="hx-page">
  <header class="hx-hero">
    <div class="hx-hero-text">
      <span class="hx-crumb">IDEA100 · Hook Design Competition · Hook 02</span>
      <h1>V1, Print and Pull</h1>
      <p class="hx-done-when"><strong>Done when:</strong> V1 is whole and measured, a half-size copy is printed, and you have called, pulled and read its break.</p>
      <div class="hx-row">
        <span class="idea-chip">Writing: 3 sentences in all</span>
        <span class="idea-chip">Files stay in Armory: nothing to upload</span>
        <span class="idea-chip">Done early? Pull more, step 10</span>
      </div>
    </div>
    <div class="hx-hero-art" aria-hidden="true">{fig(23)}</div>
  </header>
  <nav class="hx-plan idea-panel" id="hx-plan" aria-label="Classes in this assignment"></nav>
  <div class="hx-bar idea-panel" id="hx-bar"></div>
  <p class="hx-banner-failed" id="hx-failed" role="alert" hidden></p>
{steps}
</main>
<script type="application/json" id="hx-plan-data">
{{
  "phases": [
    {{"id": "v1", "name": "V1", "color": "solidworks-red", "days": [{{"label": "Class 1", "short": "Finish and measure V1", "date": "2026-11-03"}}]}},
    {{"id": "print", "name": "Print", "color": "filament-orange", "days": [{{"label": "Class 2", "short": "Weigh it, print it half size", "date": "2026-11-04"}}]}},
    {{"id": "pull", "name": "The pull", "color": "steel", "days": [{{"label": "Class 3", "short": "Call it, pull it, read it", "date": "2026-11-05"}}]}}
  ]
}}
</script>
<script type="application/json" id="hx-glossary">{{"STEP": "A 3D file other programs can read, with your exact shape and inches. Bambu Studio opens it.", "infill": "The pattern printed inside a part, between its walls. Less infill is lighter and weaker."}}</script>
<!-- hx:script -->
<script id="hx-page-js">
{page_js}
</script>
</body>
</html>
'''
(HERE / 'hook-02.src.html').write_text(tpl)
print('wrote hook-02.src.html', len(tpl))
