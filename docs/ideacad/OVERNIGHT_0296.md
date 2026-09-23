# IdeaCAD overnight run, ledger 0296

- Issued: 2026-09-22, by the router chat, for one Claude Code session running as an
  `ultracode` workflow overnight with nobody watching.
- Precedence: `docs/ideacad/VISION.md` governs. This brief is a plan for serving it. The
  research report (`docs/ideacad/research/2026-09-22-feature-and-ux-research.md`) is
  evidence. Where this brief disagrees with the vision, the vision wins and the session
  says so in its history entry. If the report is not in the tree (it travels as an
  attachment and may not have been attached), section 5 carries its findings, and the
  session researches anything else it needs from primary sources with web search.
- **Every statement in this brief about the repo is a claim**, made from a clone of
  `main` at `bf04a223` on 2026-09-22. Verify each against the tree before relying on it,
  and record in the history entry every claim that was wrong.

## 1. The job

Make IdeaCAD match its vision as far as one night allows, across the whole program, and
keep it well-rounded while doing it. Three things are equally part of the job:

1. **Build the foundation** that most of the requested mechanics depend on (section 4).
2. **Catch up the weakest areas** under the catch-up rule (section 3), using the seeds in
   section 5 as a starting point.
3. **Seek out improvements nobody listed** (section 6). In Mr. Pina's words: "I want for
   claude code to seek out improvements to work towards my vision rather than just relying
   on the prompt for things to add/change." The seed list is not the boundary of the work.

Run until the work is done or the usage budget is spent. Commit and push in coherent
slices as you go, so an interrupted run still leaves landed work behind.

## 2. Phase 0: audit, gating everything after it

No build agent starts until this phase is written down in
`docs/ideacad/overnight-0296/AUDIT.md`.

1. Read `docs/ideacad/VISION.md`, `docs/IDEACAD.md`, the research report's summary table
   and the sections for any area you work in (when it is present), `CLAUDE.md`, and
   `docs/standards/IDEA_INTERFACE_STANDARDS.md` in full.
2. Start the dev server and drive IdeaCAD in real Chromium, as a student would, at
   1440x900, at 960x900 (half of a 1920 screen), and at 375x812. Use the harness routes
   under `src/routes/dev/ideacad-*` and the real `/ideacad` routes as far as the dev
   server allows. Try to model three things from nothing: a motor bracket with a bolt
   pattern, a spinner weapon disk, and a two-part assembly with a pin. Screenshot every
   state you judge.
3. Score every area in section 3 from 0 to 4 against the rubric there, with one line of
   evidence per score (a file, a measured behavior, or a screenshot). The scores in
   section 3 are the router's claims; replace them with yours.
4. Start `docs/ideacad/overnight-0296/FRICTION.md`: every place the program was slow,
   confusing, ugly, dead, overlapping, or missing something, one line each, with the area
   it belongs to. This log is the main source of the unlisted work in section 6.
5. Write the plan: which areas go first under the catch-up rule, which agents own which
   files, and which shared files have a single writer.

## 3. The maturity ledger and the catch-up rule

Mr. Pina, 2026-09-22: "If one part of the program is built out really in depth right now,
I want the other parts to catch up before further progress is made on the more developed
parts."

**Rubric.** 0 absent. 1 exists but a student cannot use it without help. 2 usable for the
basic case, with visible gaps. 3 covers what a student in IDEA100 or FRC needs, discoverable
without instruction. 4 matches the vision, including the speed thesis against SolidWorks.

**Router's claimed starting scores** (replace in Phase 0):

| Area | Claim | Basis |
|---|---|---|
| Launch and documents | 3 | Chooser, folders, tags, archive, trash; chooser brand and logo requests open |
| Sketching | 2 | Line, rectangle, circle, six-sided polygon, arc; no splines; no values drawn in viewport |
| Part features | 3 | Extrude, cut, revolve, shell, draft, sweep, loft, hole, patterns, mirror, boolean |
| Fillets and chamfers | 1 | He says they "totally suck"; no edge-set expansion, no hover preview |
| Reference geometry | 2 | Planes, axes, points and origin planes exist; not claimed to appear as Front, Top, Right and Origin in the tree |
| Design tree and history | 1 | Flat list; no nesting, no rollback bar, no timeline |
| Dimensions | 2 | Typed values at cursor; no values drawn beside geometry, no click-to-edit |
| Selection and interaction | 1 | No hover pipeline, no right-click menu (`contextmenu` absent from `solid/**`), no box select |
| Viewport and display | 2 | Triad, section, edges; triad not in corner; no view modes; fixed tessellation |
| Assembly | 1 | Named mates between two bodies, one file; no parts as definitions, no motion, no interference |
| Simulation and analysis | 0 to 1 | Measure and mass properties with the density rule; no interference, CG, or calculators |
| Materials and appearance | 2 | Stock materials with color and cited density |
| Add-ons | 2 | Registry and IdeaBlade advisory, off by default |
| Import and export | 2 | 3MF, STL, DXF, `.ideacad`; no STEP |
| Learning and onboarding | 1 | Icons and hover descriptions; no tutorial, no contextual help beyond tooltips |
| Customization | 0 | No per-user preference store found in `solid/**` |
| Branding and chrome | 2 | Logo, chooser; dead space, overlap at half width, button text touching borders reported |

**The rule, operationally.**

- Work proceeds in rounds. Each round starts by re-reading the ledger.
- An area scoring two or more above the current lowest score gets **no new depth work**
  until the areas below it catch up. It still gets defect fixes, and it still gets
  whatever the foundation work in section 4 requires of it.
- Defects Mr. Pina named (button text touching borders, overlap at half width, dead space)
  are fixed wherever they are, regardless of score.
- Re-score an area only from evidence (a screenshot, a test, a measured behavior), and log
  every re-score with its evidence in `docs/ideacad/overnight-0296/MATURITY.md`.
- The end state is judged by the lowest score, not the highest.

## 4. Phase 1: the foundation, one writer per shared file

The research found that about a third of the requested mechanics depend on two pieces
IdeaCAD does not have: a viewport hover pipeline and dimension values drawn in the
viewport. Build the foundation before the areas that depend on it, the way the feature
graph was built as a spine before the ten surfaces.

1. **Hover and picking.** Preselection highlight on faces, edges, vertices, sketch
   entities, planes and axes as the pointer moves; Select Other; a pick filter. Ray-cast
   over the tessellation with a cost you measure and report. Every later mechanic (preview
   on hover, breadcrumbs, mate-connector inference, edge-chain preview) reads this.
2. **Selection model.** Click, Ctrl or Shift add, Esc always clears, box select where
   left-to-right is window (fully inside) and right-to-left is crossing (touching), as in
   SolidWorks, drawn so the direction is visible. Loop, tangent-chain and partial-loop
   selection for edges.
3. **One command registry.** Every tool is registered once with its name, icon, one-line
   description, the selection it accepts, and an optional shortcut. Toolbars, right-click
   menus, the context toolbar, command search, shortcuts, and the tutorial all read the
   registry. Nothing hard-codes a tool list twice.
4. **Right-click and context chrome.** A right-click menu on the viewport, on every
   selection type, on tree rows, and on empty space, built from the registry. Right-click
   inside the viewport never opens the browser's own menu. A small context toolbar and a
   selection breadcrumb appear near the pointer on selection, as SolidWorks does, and move
   out of the way of the pointer.
5. **Dimensions in the viewport.** Sketch and feature dimensions drawn beside the
   geometry they control, legible at every zoom, clickable to type a new value in place,
   with the unit rules `docs/IDEACAD.md` already states.
6. **Per-user preferences.** One store for everything the user customizes: layout, panel
   widths, toolbar contents and order, shortcuts, view mode, units, colors, hint and
   tutorial state, density. The goal is that it follows the user to another computer.
   Tonight it is stored in the browser, behind a storage interface a server store can
   take over later without changing any caller (section 7 says why).

Assign one agent as the single writer for `SolidWorkspace.svelte`, `viewport.ts`,
`engine.ts`, `features/core.ts`, and any new registry or preferences module. Other agents
send it requests and never edit those files directly. That discipline is how the feature
graph's ten parallel surfaces stayed coherent, and it is how this run stays coherent.

## 5. Seeds by area

Each area lists what Mr. Pina asked for, then the research's highest-value moves, then what
done means. Seeds are starting points. Where the research and a seed disagree, prefer the
seed and write down why the research disagreed.

### Launch and documents
- Asked: chooser top left shows the regular website logo linking home, with the IdeaCAD
  logo beside it. The IdeaCAD logo refined so it is less plain, keeping the logo. An
  animated cube in the home page banner, themed so it reads as IdeaCAD without the word,
  with `prefers-reduced-motion` honored (a still frame, never a stopped mid-spin frame).
- Research: a new document opens on the three default planes with a one-line cue and two
  direct actions, "sketch on a plane" and "start from a box".
- Done: the front door has no dead space at any of the three widths, and a new document is
  one click from drawing.

### Sketching
- Asked: a formal sketch system. Sketches are first-class objects with relations,
  dimensions, and visible status.
- Research: named inference with click-to-commit relations and Ctrl to suppress; typed
  values during any draw with no mode switch; the first dimension rescales the whole
  sketch; shaded closed regions that can be pulled straight into a solid; SolidWorks
  status colors (blue free, black fully defined, red and yellow for conflicts); an
  over-defining dimension turns into a gray measured value with one sentence instead of a
  dialog; Power Trim; Dynamic Mirror; sketch entry rotates normal and cancel restores the
  view. Splines have no entity in the kernel's 2D solver: spike a freeform curve through
  `makeNurbsEdge` or `interpolatePoints` before promising one, and report the result.
- Done: a student can draw a constrained, dimensioned profile without opening a panel.

### Part features
- Research: pull a shaded region into a solid with boss or cut inferred from direction;
  exact single-edge sweep through `sweepWithOptions`; counterbore and countersink holes;
  sticky last-used values. Rib must be constructed from primitives and needs a spike.
  Smooth loft through three or more profiles is broken in this kernel build: do not ship
  it, say so.

### Fillets and chamfers
- Asked: fillets rebuilt; curvature; quick selection of many edges.
- Research: one pick expands to the tangent chain, previewed on hover before commit;
  select a face to fillet all its edges; drag handles in the viewport with a live radius;
  when the kernel refuses a radius, bisect to report the largest radius that fits instead
  of failing; variable radius is exposed by the kernel. Full round, face-to-face fillet
  and vertex chamfer are absent from the kernel: say so where a student would look for
  them. Curvature: a tangent versus smooth choice where the kernel supports it, and a way
  to see curvature (`getFaceCurvature`) as a display mode, measured for cost.
- Done: filleting every edge of a bracket takes fewer actions than SolidWorks and never
  leaves the student guessing why it failed.

### Reference geometry
- Asked: default Front, Top and Right planes and the Origin in every part, shown in the
  tree as SolidWorks shows them.
- Research: temporary axes on every cylinder; drag a face to create an offset plane;
  planes shown or hidden per the user's preference.
- Done: a student never has to create a plane to start sketching.

### Design tree and history
- Asked: a tree that resembles SolidWorks'. Sketches nest under the features that consume
  them. Rows collapse. Rename in place by slow double-click or F2. A history slider along
  the bottom with a play button that runs a time-lapse of the build at a defined rate.
- Research: a rollback bar in the tree; hover a row to highlight its geometry and hover
  geometry to highlight its row; parent and child indicators; reorder allowed only while
  every parent stays above its child. The time-lapse replays **cached meshes** per step,
  not the kernel, because a deep replay costs 63 to 111 ms and checkpoints cost memory.
  Choose the default rate, make it adjustable, and honor reduced motion.
- Existing documents must open unchanged, with their saved trees intact.

### Dimensions
- Research: one smart dimension tool where placement decides the type; every number in
  the viewport clickable to type; driving versus driven values kept visibly distinct.

### Selection and interaction
- Asked: right-click menus everywhere; breadcrumbs and icons near the pointer on
  selection; box select in both directions; quick multi-edge selection; shortcuts that are
  always optional.
- Research: command search (SolidWorks `W`) over the registry; an `S`-style shortcut bar
  near the pointer, customizable; right-drag mouse gestures only if they do not conflict
  with the right-click menu, and only as an option.

### Viewport and display
- Asked: the axes triad moved to the bottom-left corner, rotating with the view, keeping
  its current visual design. View modes.
- Research: a view cube with hover preview and Normal To; shaded, shaded with edges,
  wireframe and hidden-lines-removed modes; a capped section plane (the kernel's
  `section` has three silent failure modes, test them); size-relative tessellation instead
  of the fixed 0.002 in and 0.15 rad (the research measured 2e-4 of model size and 0.06
  rad in a comparable app), measured for frame cost before and after.
- Rule: no ground plane and no drop shadow, ever.

### Assembly
- Asked (2026-09-20 and 2026-09-22): mates, the one-file assembly, moving parts, and "a
  ton of stuff" on the assembly side.
- Research: every solid is a part by default, split into a definition (its own feature
  history) and occurrences (placement and mates), so editing one wheel edits all four and
  "make unique" breaks the link; per-part histories also keep a deep edit to one part's
  replay cost. Behavior-named joints (hinge, slider, fixed); mate connectors inferred on
  hover; drag a part and it moves only within its remaining freedom; SolidWorks mate
  status prefixes for fixed, floating, under-defined and conflicting; coupling mates for
  gears and belts only after the basics work.
- Decision 30 (assembly ownership and team-role permissions) is answered and unbuilt. Do
  not build its permission model tonight; do not build anything that contradicts it.
- Done: a student can build a two-wheel drive module in one file, mate it, and move it
  through its freedom.

### Simulation and analysis
- Asked: "even in the context of something like a basic simulation," there is work to do.
- Research, in order of honesty: exact interference volume and minimum clearance between
  parts (kernel intersect plus mass properties); CG and tip-over angle, atan(d/h), with
  the density rule respected; a spinner-weapon calculator fed by the model's own moment
  of inertia (E = 1/2 I omega squared, tip speed, bite); one-degree-of-freedom mechanism
  posing driven by the mate solver; closed-form FRC checks. Principal moments come free
  from `massProperties`.
- Linear static FEA stays behind a validation gate: do not ship it tonight. If you
  prototype it, it must reproduce the cantilever deflection FL^3/3EI and bending stress
  Mc/I within stated tolerance before any student sees a number, and it is off by default.
- Where the density rule blocks a calculation, the tool shows Unknown with the reason and
  a way forward. It never assumes a density.
- Domain calculators (spinner, FRC) belong in add-ons per the vision.

### Materials and appearance
- Research: color from a seed material onto each instance; a warning chip on an uncited
  density; no photorealistic rendering.

### Add-ons
- IdeaBlade's tools live in its add-on and never constrain the base program. New
  calculators from the simulation area register as add-ons, off by default.

### Import and export
- Research: STEP needs the separate `remus-wasm-io` module at the same vendored commit
  (`9307e73`), about 2.5 MB, with inch scaling by 25.4. Vendor it only at that commit,
  load it lazily, and prove a round trip. IGES stays out.

### Learning and onboarding
- Asked: an interactive tutorial that can be opened at any time and never blocks work.
- Research: pushed first-run tours underperform; help at the moment of need wins. Rich
  tooltips on a 0.3 to 0.5 second delay; short looping clips on hover for tools where a
  picture explains more than a sentence (ToolClips raised task completion from 10 to 70
  percent in the CHI 2010 study); hints that retire after use and can be brought back from
  preferences; the tutorial as a set of short tasks run in the real workspace on a real
  document, launched from a help control, never a modal wall.
- Rule: no prose instructions in the interface. A tutorial step points at the real control.

### Customization
- Asked, three times: "customization, customization, customization."
- Built on the preferences store in section 4: rearrangeable and hideable toolbars,
  resizable and collapsible panels, remappable shortcuts, default view mode, units,
  colors, hint state. A reset to defaults for each group.

### Branding and chrome
- Asked: no dead space anywhere, including the tool menu; no toolbar overlap at half
  width; button text never touching its border on any page.
- Research: a priority-plus toolbar that folds overflow into a "more" control at narrow
  widths instead of overlapping; chrome that follows the pointer and the selection.
- Sweep every IdeaCAD page at the three widths for text touching borders and fix it at the
  component level, not page by page.

## 6. Phase 3: seek out what nobody listed

Once the foundation is in and the lowest scores have moved, run this loop until the budget
is spent:

1. Pick a student task from `FRICTION.md` or invent one a fourteen-year-old in IDEA100 or an
   FRC student would plausibly attempt.
2. Do it in Chromium. Count the actions. Where you know SolidWorks' action count for the
   same task from its documentation, write both down.
3. Every step that was slower, more confusing, or uglier than it should be becomes a line
   in `FRICTION.md`, tagged with its area.
4. Fix the line if it serves the vision and the catch-up rule allows it. Re-run the task
   and record the new count.

Write a short rationale for any change not traceable to a seed, a research finding, or a
friction line. A change that cannot be justified against `VISION.md` does not ship.

## 7. Rules for the run

- **No migration tonight. Write nothing under `supabase/migrations/`.** This run merges
  to `main` when it is done (section 9), and a deploy carrying a migration comes back to
  Mr. Pina, because he applies the SQL by hand before the push. If you conclude a server
  table is needed for preferences, first check whether an existing per-user table can hold
  them without a migration. If none can, write the SQL to
  `docs/ideacad/overnight-0296/0226_preferences_PROPOSED.sql` and explain it in the
  history entry. Number 0226 stays reserved for it (0225 is claimed by another lane). The
  proposed SQL follows every rule a real migration would: owner row-level security; revoke
  from `anon` by name, following `0166`'s shape (revoking from `public` does not remove
  Supabase's direct `anon` grants); a verification query that RETURNS ROWS naming what it
  examined and says so when it examined nothing, because the SQL editor shows no notices;
  a planted negative control for that query; no dollar-quote token inside a `--` comment.
- **Existing documents open unchanged.** Every saved manifest format still loads, and a
  test proves it on a document saved before this run.
- **No clamps.** Any value can be typed. A refusal is the kernel's or reducer's own
  sentence with a way forward.
- **The vendored kernel is not modified.** Adding `remus-wasm-io` at the same commit is the
  only permitted vendor change.
- **`blade/**` is outside this run** except where moving IdeaBlade's tools into its add-on
  requires an import to change.
- **Student surfaces keep 44px targets** (`IDEA_INTERFACE_STANDARDS.md` 2.12). No dead space
  is achieved by removing waste, not by shrinking targets below the standard.
- **Reduced motion** is honored by every animation: the banner cube, the time-lapse, and
  any view transition.
- **American spelling; no em dashes** in code comments, UI copy, or docs.
- **Never prettier the tree.** Match each file's existing style.
- **No secrets printed**, and no command written that would print one.
- Do not open or refill any other lane, and do not edit files outside IdeaCAD except the
  home page banner, the app launcher entry, and shared components where a border or
  overlap defect lives.

## 8. Verification, which is part of the work and not after it

- `npm ci`, never `npm install`. Write `.env` before `svelte-kit sync`.
- `npx svelte-check`: report errors, warnings and files against the baseline you measure
  at the start. Zero new errors.
- `npm test`: it exits 0 with failing tests. Read the summary counts and stderr. Report
  passed, failed and skipped with the command.
- A mutant killed by a race proves nothing: mutation checks run under `npm test`, which
  passes `--no-file-parallelism`, never a bare `npx vitest run`. Do not commit while a
  mutation run is in progress; it captures the mutant.
- Browser verification through `tools/browser-verify/`, with route specs for every new
  surface, at 1440, 960 and 375. This Chromium paints no scrollbar into screenshots and
  `readPixels` reads zero with `preserveDrawingBuffer` false, so rasterize and look.
  Playwright evaluates a string as an expression, so pass functions, not arrow-function
  strings.
- Measure and report frame cost and hover ray-cast cost before and after, and deep replay
  cost with per-part histories.
- Screenshots of every seed item's final state go in `docs/ideacad/verification/0296/`.
- `verify:readme` runs once, at the end, on a clean committed tree.

## 9. Ending

1. Update `docs/IDEACAD.md` for every section whose truth changed, with measured numbers
   and dates. Leave `VISION.md` alone except to add a line under "Open questions" for any
   question only Mr. Pina can answer.
2. Final `MATURITY.md` with before and after scores and the evidence for each, and the
   lowest score stated first.
3. The history entry `docs/history/<this branch>.md` states, in this order: what Mr. Pina
   should look at first and where; the sha pushed to `main` and the version production
   serves; whether proposed SQL for 0226 exists and what it does; what
   shipped by area; what was tried and abandoned and why; every claim in this brief that
   was wrong; open questions for him.
4. **Merge to `main` yourself.** Mr. Pina approved this. Budget for it: when the work is
   finished or the usage budget is nearly spent, stop building and keep enough to do all
   of the following.
   1. `git fetch origin main integration`, then merge `origin/main` into your branch.
      Resolve conflicts by content: `tools/browser-verify/README.md` hunk by hunk, and
      `classroom-updates.json` keeping both sides' entries. Any other conflict you cannot
      resolve by content is a stop: push your branch, record it in the history entry, and
      do not touch `main`.
   2. On that merged tree, run and read in full: `npm ci`; `npx svelte-check` (zero new
      errors against the baseline you measured at the start); `npm test` (read the
      summary counts and stderr, because it exits 0 with failures; zero failures);
      `npm run build`; `verify:readme` once on a clean committed tree. Confirm
      `git diff origin/main --stat` shows nothing under `supabase/migrations/`.
   3. If all of that passes, `git push origin HEAD:main`. Never force. If the push is
      refused because `main` moved, repeat from step 1. If a failure cannot be fixed, push
      your branch only and record exactly what failed.
   4. After `main` is pushed, merge `main` into `integration` and push `integration`, so
      the two do not diverge.
5. **Confirm the deploy.** Wait for production to update, then read
   `https://ideabosco.com/` and compare the version string it serves against the sha you
   pushed. A push is not a deploy until the served version matches. If this container
   cannot reach production, say so; do not claim it deployed. Record both values in the
   history entry, then push the finished history entry to `main` the same way.
