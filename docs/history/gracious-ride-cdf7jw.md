---
title: "IdeaCAD overnight, ledger 0296: the foundation, every area off the floor, and a blind pocket that had never cut"
date: 2026-09-23
branches: [claude/gracious-ride-cdf7jw]
migrations: []
subsystems: [ideacad, verification, testing, documentation]
---

Ledger 0296, one Claude Code session run as a set of workflows overnight on 2026-09-23 with
nobody watching. The brief is `docs/ideacad/OVERNIGHT_0296.md`, the governing intent is
`docs/ideacad/VISION.md`, and the plan, the scores and the friction log are in
`docs/ideacad/overnight-0296/` (`AUDIT.md`, `MATURITY.md`, `FRICTION.md`). This entry follows
the order the brief's section 9 asks for.

## 1. What to look at first, and where

Open `/ideacad`, make a new model, and in this order:

1. **The empty part.** Front, Top and Right planes and the Origin are there, with one line
   and two buttons: "Sketch on a plane" and "Start from a box". Press "Start from a box".
2. **The sizes on the model.** The box's width, depth and height are drawn beside it as
   numbers. Click one, type a new size, press Enter.
3. **Right-click anything**: a face, an edge, the box, empty space, a row in the tree. Every
   one opens IdeaCAD's own menu. Point at a face or an edge first: it lights before you
   click.
4. **The design tree** on the left: Origin and the three planes on top, the sketch folded
   under the feature that used it (open it with the caret), F2 renames. Drag the thin bar
   between rows up: the part rolls back, and new work goes in at the bar.
5. **The history slider** along the bottom: press Play for the time-lapse of the part being
   built.
6. **Fillet** an edge (hover it first to see the chain it will take), then type a radius far
   too big: the refusal says so in words and offers "Use the largest that fits".
7. **Sketch a circle in the middle of the top face and pull it down half way.** That pocket
   used to be refused, always; it cuts now (section 4, part features).
8. **Mates**: pick two faces and choose Hinge. Then Move the pinned part: it only turns.
9. **Analysis**: mass, balance, tip angle, inertia, clashes. Every number without a cited
   density reads Unknown and names the body in the way.
10. **Learn** (header) for the tutorial, the gear for Preferences, W for command search, and
    the home page's IdeaCAD card for the animated cube.

Screenshots of each area's final state are in `docs/ideacad/verification/0296/<area>/`
(`foundation-w1`, `foundation-w2`, `branding`, `tree`, `analysis`, `dimensions`, `fillets`,
`assembly`, `learning`, `integration-w3`, `round2`, `final`), and the Phase 0 "before" is in
`audit/`.

## 2. What reached main, and what production serves

- Branch head merged to `main`: **`b2ab71ea`**, a fast-forward from `bf04a223` (no force), then
  merged into `integration` as `df0d4012`.
- Version string production serves at `https://ideabosco.com/`: **`IDEA Portal v1.1901 · b2ab71e`**,
  read at 14:18 UTC on 2026-09-23 (it was `v1.1789 · bf04a22` before the push). This entry's
  own commit, which only fills in these two lines, went to `main` after that reading.

## 3. Proposed SQL for 0226

**None was written, and 0226 is released.** The brief expected a server table might be
needed for per-user preferences. It is not: `profiles.preferences` already carries a
per-user `ideacad` namespace under RLS "update own profile" (the legacy chooser wrote
`ideacad.panes` there). The new store writes `preferences.ideacad.solid` with a whole-blob
spread-merge that keeps every sibling namespace and `ideacad.panes`, and the legacy writer,
which used to replace the whole `ideacad` object, now merges too. Nothing under
`supabase/migrations/` changed (`git diff origin/main --name-only -- supabase/migrations` is
empty). No manifest format changed either: the new mate fields (`joint`, `group`) are
optional keys 0217's validator does not look at, checked against the SQL.

## 4. What shipped, by area

Scores are `MATURITY.md`'s, Phase 0 to final. **The lowest moved from 0 to 2.** Friction:
85 lines logged, 58 fixed with a re-check each, 27 open.

- **Customization, 0 to 2.** One typed preference store (`preferences.ts`) with ten groups,
  validated on read (an unknown or bad value falls back one field at a time), saving only
  what differs from the defaults, with memory, localStorage and profile implementations.
  A Preferences panel (header gear) edits view, toolbar contents and order, shortcuts
  (record a key; a conflict is refused naming the command that has it), snaps, hints and
  units, each with Reset.
- **Selection and interaction, 1 to 2.** Hover highlight on faces, edges (thick lines),
  vertices, planes and sketches, one pick function for hover, click, box and menus (pick
  under 1 ms median on a 402-face part); box select, left to right "Inside" and right to left
  "Touching", visible-only; Select Other in depth order; a pick filter with a visible cue;
  a registry-built right-click menu for seven kinds, keyboard operable; a context toolbar and
  a breadcrumb near the pointer; tangent-chain and loop selection; Escape always clears. One
  command registry (`command-registry.ts`) behind the palette, menus, search (W) and
  remappable shortcuts (L, R, C, E, F, W, Space, Ctrl+Z/Y).
- **Viewport and display, 1 to 3.** Front, Top, Right, Iso, Normal To (second press flips)
  and Fit, folding into a menu rather than overlapping (0 px at 960, from 59.6 x 46); a corner
  triad that turns with the view; four display modes; size-relative display tessellation
  (export mesh unchanged); right-drag orbit; Fit and refit clear of open panels; Edit sketch
  frames the sketch; a phone bottom sheet for panels.
- **Reference geometry, 1 to 2.** Front, Top, Right and Origin in every part, in the tree
  with an eye and in the viewport; pressing a plane with a drawing tool sketches on it.
- **Design tree and history, 1 to 3.** Rebuilt to resemble SolidWorks' FeatureManager
  (nesting, collapse, F2 and slow double-click rename, quiet rows, one refused-with-reason
  menu, hover linked both ways); a rollback bar that inserts at the bar and survives undo; a
  bottom history slider whose time-lapse replays cached meshes (1.1 to 1.4 ms a step), never
  the kernel.
- **Dimensions, 1 to 3.** Sizes drawn beside their geometry and typed in place; drawn
  rectangles, circles and polygons arrive with driving sizes; a size can be typed while
  drawing ("3 Tab 1.5 Enter"); the typed-value race ("0.25" becoming 2 or 25) is gone.
- **Fillets and chamfers, 1 to 2.** The drag no longer freezes; the chain previews on
  hover; refusals are sentences with a one-click largest size that fits (at most 8 kernel
  attempts, only on refusal); tangent propagation on by default; sticky last size.
- **Sketching, 2.** Typed sizes, sizes on the model and an L profile in 7 clicks; inference
  relations and one-sketch-many-shapes are still open.
- **Part features, 2.** **A blind pocket from a face sketch cuts now.** Found by the learning
  agent (its tutorial's "cut a hole" step could not pass) and diagnosed in the ending: a tool
  swept against its own profile's normal makes the kernel's cut and fuse return an invalid
  solid; the identical cylinder swept the other way is valid; a 0.001 in overshoot does not
  help; and it was the same on `main` at `bf04a223`. So every interior blind pocket had
  always been refused, and only cuts that broke out of the part survived (which is why the
  existing through-cut test never saw it). The extrude rebuilds such a tool from its far end
  only when the first result is invalid, so every cut that already worked is byte-identical.
  Pinned by `tests/ideacad-solid-blind-pocket.test.ts`, which fails with the fix removed.
  Also: the Hole tool drills with a plain click; combine, mirror and pattern refusals say
  what to change.
- **Assembly, 1 to 2.** Joints named by motion (Hinge, Slider, Cylindrical, Planar, Fixed,
  Pin in slot), each one undo, invalid pairs refused before adding, readable face names, and
  a mated part moved only within its remaining freedom (a hinged pin moved 0 in under a Z and
  an X drag, and no redundant mate was added).
- **Simulation and analysis, 1 to 2.** An Analysis panel: mass table, combined CG and its
  height, tip angle and sideways limit, inertia about a picked axis, exact interference and a
  true minimum clearance, all under the unchanged density rule. Measure's body-to-body
  distance now uses the same search, because `solidToSolidDistance` returns nearest corners on
  curved faces (measured 4.5x wrong, and nonzero for overlapping boxes).
- **Learning and onboarding, 1 to 3.** Tool cards after a 400 ms delay (from 1 ms) with a
  looping gesture picture; a Learn button opening a non-blocking five-task tutorial on the
  student's own model; first-use hints that retire; instruction prose removed from panels.
- **Branding and chrome, 1 to 3.** The site logo linking home beside a refined IdeaCAD logo
  on the chooser; an animated extruding cube on the home card (still under reduced motion);
  no control text within 6 px of its border; the palette's empty cells gone; the shell's
  Voice and Report controls docked in the footer.
- **Add-ons, 2 to 3.** A spinner-weapon calculator (with both published worked examples as
  tests) and FRC checks, off by default and advisory only.
- **Launch and documents, 2.** Compact masthead, models first on a phone; a new model is still
  three steps.
- **Materials and appearance, 2; Import and export, 2.** Unchanged in the product. STEP was
  spiked (section 5).

**How it was run.** A Phase 0 audit (a code agent and a browser agent at 1440, 960 and 375),
then one single writer at a time for the shared files (`SolidWorkspace.svelte`,
`viewport.ts`, `engine.ts`, `features/core.ts`, the registry and the store) through four
stages, beside nine agents each owning a disjoint file set in its own worktree and sending
the writer tested requests, a pre-merge agent that combined the round 2 branches, and a docs
agent. About 8 million subagent tokens over fifteen agents.

**Verification.** svelte-check stayed at the baseline, 0 errors and 37 warnings in 20 files
(31 `state_referenced_locally`, 5 `css_unused_selector`, 1 `perf_avoid_nested_class`), in
every lane and on the merged tree. The full suite, the build and the README
measurement are in the gate record below. The final writer stage's browser pass: 58 route and width runs, 962
measurements, the arc spec's canvas-content reading (F085) the one open finding, which the ending traced and
fixed (below).

**The merge gate, as run.** `origin/main` had not moved since the run began (`bf04a223`),
so merging it into the branch was a no-op. The suite and the build ran at `eff5c9e7`;
after that come only CLAUDE.md, the README measurement and the seven-line fix below.

| Step | Where | Result |
|---|---|---|
| `npm ci` | branch at `eff5c9e7` | exit 0 |
| `npx svelte-kit sync && npx svelte-check` | same | 0 errors and 37 warnings in 20 files, the baseline |
| `npm test` | same | 573 test files and 10,861 tests passed, 0 failed; no `Failed Suites` and no `failed to apply` anywhere in the stream; 1,381 s |
| `npm run build` | same | built; exit 0 |
| `tests/claude-md.test.ts`, `tests/derived-numbers.test.ts` | `4cd231ed`, after the CLAUDE.md commit | 50 of 50 passed; `node tools/claude-md-check.mjs` agrees with the tree |
| `npm run verify:readme` | `4cd231ed`, clean tree; the arc spec again on `165f36d0` | 287 specs, 574 runs, 10,298 measurements; 228 outside threshold, then 226 after the arc fix. The committed measurement (taken at `bddca62f`) had 182 |
| IdeaCAD tests reaching the fix | `165f36d0` | 6 files, 178 tests passed; svelte-check still 0 errors and 37 warnings in 20 files |
| `git diff origin/main --stat -- supabase/migrations` | before the push | empty |

**`verify:readme` did not boot twice before it ran, and the cause is a trap the next
session will hit in the same order.** Run straight after `npm run build`, the harness's
dev server printed "ready" and then answered no request to `/dev/pathways` for 180 s,
twice. Debug logging showed Vite spending over four seconds loading a one-line file,
because the build had left 219 MB in `.vercel/output` and 218 MB in `.svelte-kit/output`
inside the watched root. With those two directories deleted, the same page answered in
1.0 s and the harness booted. CLAUDE.md now says so under Machine and toolchain.

**What moved in the README measurement, and whose it is.** 46 rows joined the outside list
and none left it. Each was re-run alone on the branch AND in a worktree of untouched `main`
(`bf04a223`):

- **44 are `main`'s, not this run's**, identical on both trees: the Foundry gallery in full
  screen at 375 (19), the grading console's incomplete-hand-in exports (22 in the full pass,
  11 on one re-run, 22 on `main`; the export disclosure's opening click never lands), the
  tournaments TV view's exit control (1), and the empty spec table's checklist reach (2).
  They landed on `main` between `bddca62f` and `bf04a223` and are left for their owners.
- **2 were this run's: F085, the arc spec**, reading 0.61% and 1.18% of the canvas drawn
  against 8.62% and 21.88% on `main`. Cause: writer stage 4's "Edit sketch frames the
  sketch" runs `focusSketch` one `tick()` after the sketch opens, so a view or Fit given in
  the same moment was turned back to face the sketch and the new body was seen flat on as one
  shade. No student can press a key inside a microtask, but a deferred call overriding a
  later camera command is a race, so the fix is in the product and not in the spec: the
  viewport counts camera commands (`cameraCommands()`) and the deferred framing stands down
  if the count moved. Re-measured: 9.67% and 57.29%, 0 of 38 outside.

**Not re-run after that fix, on the fast path chosen at the end of the run:** the full test suite and the
other IdeaCAD browser specs. The fix changes behaviour only when the camera is commanded
within one microtask of a sketch opening, and the six test files that import either changed
file pass.

## 5. Tried and abandoned, and why

- **Part definitions and occurrences** (the research's one-file instancing): not started.
  It is a saved-format decision (question 1 below), and the riskiest change to student
  documents this run could make.
- **STEP**, spiked and not shipped. The vendored core kernel's `toBREP` throws "toBREP
  requires the optional 'io' feature for STEP export". `remus-wasm-io` from `9307e73`'s
  `crates/wasm-io/pkg` (package v2.130.20, matching the core) round-tripped a box and a
  cylinder exactly (11,056 bytes in 16.8 ms, import 25.0 ms), and the file declares
  millimetres, so a 25.4 scale through `copyAndTransformSolid` (row-major) is mandatory; the
  scaled box came back as 11.99999999999998 in³. Not vendored because it had no lane tonight
  and nothing opened the file in SolidWorks. Hashes and scripts are recorded in the session
  notes; the next lane should fetch the same five files and check them.
- **An overshoot for the pocket.** The first hypothesis (a tool coplanar with the face) was
  wrong: starting the tool 0.001 in, 0.01 in or 1 in above the face changed nothing, which is
  what pointed at the sweep direction.
- **The edge-set accelerator near the pointer** after one fillet pick: the helpers exist
  (`edgeSetOffers`), the viewport wiring did not fit in the time.
- **Smooth loft, rib, counterbore and countersink, FEA, the materials table**: not attempted.
- The agents' own abandoned attempts (59 of them, each with its reason) are in their
  reports; the ones that shaped the code are recorded where they matter in `docs/IDEACAD.md`
  and CLAUDE.md (a DOMRect spread copies nothing, a portal loses the room's tokens, the global
  `.card` and `.field` classes, the padding reset that puts button text on the border).

## 6. Every claim in the brief that was wrong

Checked against the tree at `bf04a223` in Phase 0 (`AUDIT.md` has the file and line for
each), plus three found later.

1. "`contextmenu` absent from `solid/**`": wrong; `viewport.ts` swallowed it with
   `preventDefault` and opened nothing.
2. "Six-sided polygon": wrong; the side count was already typed.
3. Fillets "no edge-set expansion": wrong; tangent chain and face-to-edges existed behind
   options that defaulted off.
4. Simulation "no CG": wrong in part; CG was computed but shown only in the IdeaBlade panel,
   and Measure had body clearance.
5. Customization's implication that preferences might need migration 0226: wrong; the
   per-user store already existed in `profiles.preferences`.
6. "44px targets (`IDEA_INTERFACE_STANDARDS.md` 2.12)": 2.12 is the document's version; the
   rule is section 10.
7. "STEP needs the separate `remus-wasm-io` module": **right**, though the Phase 0 code audit
   had called it overstated because the core declares `toBREP` "(STEP format)". Measured, the
   core refuses.
8. "`remus-wasm-io` at the same vendored commit (`9307e73`)" needs a correction: `9307e73`
   is the containment revision, the vendored bytes are the `f7907f5` artifact refresh at
   package v2.130.20, and saved documents carry `remus-f7907f5-2.130.20`.
9. "Face-to-face fillet absent from the kernel": partly wrong; `faceFaceBlend` returns a
   sheet, not a filleted solid.
10. The triad seed "keeping its current visual design" was ambiguous: the solid modeler's
    axes were an unlabeled `AxesHelper` at the origin. The red, green and blue lines were kept
    and moved to the corner.
11. "Sketch entry rotates normal" and parent-above-child reordering were already built.
12. `docs/IDEACAD.md`'s "Limits of the current tools" was stale (corrected in place).
13. Materials: the solid modeler's list is a code constant, not the 0208 table (question 2).
14. Found later: body clearance "exists" in Measure, but `solidToSolidDistance` is not a
    minimum distance on curved faces.
15. Found later: "Part features 3" in the router's table. A blind pocket from a face sketch,
    the commonest cut there is, had always been refused (fixed tonight).
16. Found later: the brief's section 8 says `npm test` "exits 0 with failing tests". Tonight
    the failing baseline run exited 1 (`tools/run-tests.mjs` reported the one failure). Read
    the summary line either way.

## 7. Open questions for Mr. Pina

The first four are also in `docs/ideacad/VISION.md`'s open questions.

1. Should a part used several times in one file become one definition with several
   placements (edit one wheel, all four change; "make unique" breaks the link)? It changes the
   saved format.
2. Should the solid modeler's materials come from the admin-edited materials table (your
   2026-09-12 decision), instead of the fixed list it carries?
3. Should hiding a body be saved with the document?
4. Front, Top and Right show until the first solid (chosen) or always, as SolidWorks does?
5. Should the Analysis panel check for clashes on its own when the model changes (about 76 ms
   for 6 bodies, 158 ms for 12, blocking the geometry worker) or only on a Check press?
6. Keep the FRC checks add-on? It was not asked for by name (research rank 6).
7. A size typed right after drawing changes only that size. Should the first size rescale the
   whole sketch, as SolidWorks does?
8. Hidden lines visible keeps faces shaded; SolidWorks draws it unshaded. Which?
9. The display is finer on round parts (a 6 in disk from 2,580 to 5,956 triangles) and orbit
   stayed under 1 ms median here, but it was not measured on the school desktops. Acceptable,
   or a setting?
10. "Learn" or "Help" for the header control?
11. A hinge picked top face to top face turns the pin over (outside to outside). Right, or
    should the panel offer the flip?
12. Pin in slot rides one wall of the slot. Acceptable for now?
13. When a document opens, should the fillet and shell size boxes show the size already in
    the model, or the student's own last-used size (current)?
14. Should the IdeaCAD home card take IdeaCAD's own green rather than the shared default?
15. The shell's Voice control now sits in IdeaCAD's footer. Should IdeaCAD show voice at all?

## Environment notes

- `/dev/null` was a regular 0644 file from 06:11 UTC, so embedded Postgres could not start;
  a writer stage recreated it (`mknod c 1 3`). Cause not found.
- On this 4-core container a workflow runs at most two agents at once; up to five ran across
  concurrent workflows, with every browser session serialized on one `flock`.
- `tests/identity-style-shared.test.ts` was red on `main` itself (it read `origin/main` as
  its "before", which stopped being the before once its own change landed). It is outside this
  lane; it was corrected to read `f9d43b49^` so the merge gate could pass, and says why in its
  header.
