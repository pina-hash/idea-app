# IdeaCAD Spec — Addendum A: research, corrections, and hard-won repo facts

Read this **with** `IDEACAD_SPEC_v1.md`. Where the two disagree, this document wins — it
was written after research the spec was missing.

---

## A1. The kernel recommendation in the spec is WRONG. Correcting it.

Spec section 3 offered Manifold as "the pragmatic path." That was a guess made without
research. Having researched it, **the guess points the wrong way**, and this is the single
most consequential decision in the project, so here is what I actually found.

### Manifold — strong library, wrong shape for this job

Manifold is a genuinely excellent mesh-boolean library, available as `manifold-3d` on npm
as a WASM module, <cite index="37-1">with reliability as its primary goal — guaranteed manifold output without caveats or edge cases — and performance second, via parallelization or pipelining when only a single thread is available</cite>.

Two things disqualify it as the primary kernel here:

1. **It is a triangle-mesh library, not a B-rep kernel.** It has no faces, edges or
   vertices as first-class topological entities. A "face" would be a coplanar triangle
   group you track yourself, and keeping that identity stable across a boolean is exactly
   the hard problem you'd be signing up to solve from scratch. Direct manipulation *is*
   selecting a face and pushing it, so face identity is not a nice-to-have — it is the
   product.
2. **Its own author has said it is not intended as a real-time solution** — it is built to
   make very complicated designs possible without crashing, not to update at 60fps under a
   drag. That is a design posture, not a bug, and it is the opposite of what section 4
   requires.

Manifold is still worth keeping in mind for **export-time mesh repair** and for guaranteeing
a watertight 3MF. Not for the interactive model.

### B-rep on WASM — the option the spec should have led with

<cite index="46-1">`occt-wasm` is OpenCascade compiled to WebAssembly with a clean TypeScript API, and `brepjs` builds on it with a friendlier API for parametric modeling, sketching and production CAD applications; brepjs is strongest at exact, manufacturable geometry — precise booleans, fillets, chamfers and shells; real volumes, areas and clearances; watertight solids that round-trip through STEP — from a single part to a full assembly, and it is explicitly not built for organic sculpting or dense lattices</cite>. Enclosures, brackets, fixtures and machined parts are its stated sweet spot,
which is precisely what a combat-robot blade and a student's bracket are.

Two facts that answer the objection I would otherwise have raised:

- <cite index="42-1">`occt-wasm` ships at roughly 4.5 MB brotli, about half the size of opencascade.js</cite>. The "OCCT is too heavy for a browser" concern is
  much weaker than it was.
- <cite index="46-1">brepjs has a kernel abstraction layer, so switching kernels is a one-line change</cite>, and a Rust replacement kernel is in development. You are
  not permanently married to the choice.

The counter-evidence, and you should weigh it: <cite index="44-1">OpenZCAD, a browser-first parametric CAD with exact B-rep solids and direct on-model editing, dropped OpenCascade from its adapter entirely so that neither its ~22 MB WASM nor any code reaching it is emitted into the bundle</cite>. That is a real production
project choosing to leave OCCT over bundle size. Measure both; do not take either number on
faith.

### Study OpenZCAD before designing the document model

<cite index="44-1">OpenZCAD keeps the browser document and history model as the source of truth with meshes as disposable projections, runs geometry in a browser Web Worker, and content-addresses topology fingerprints so they are stable across rebuilds — checked in tests</cite>.

Those three ideas are the answers to the three hardest problems in this build:

- **Geometry in a Web Worker** keeps the UI at 60fps while a boolean runs. Do this.
- **Meshes as disposable projections** means the mesh is never the truth, so a
  re-tessellation cannot lose work — which is the class of bug that has bitten this repo
  repeatedly.
- **Content-addressed topology fingerprints, stable across rebuilds** is how a selected
  face survives an edit. Without something like it, the user's selection evaporates every
  time the model changes, and direct manipulation dies.

### What I am asking you to do

Do not take my corrected recommendation on faith either. **Prototype the decision before
committing to it.** Build the smallest possible spike: load the kernel, make a box, subtract
a cylinder, select the resulting face, drag it, and measure. Report bundle size, cold load
time, boolean time, and whether the face identity survived the edit. Then choose, and write
the choice and its evidence into `docs/IDEACAD.md`.

A day spent on that spike is cheaper than the three days this project just spent building
on an architecture that could not do what was asked.

---

## A2. SolidWorks mouse bindings — now sourced

Two previous lanes failed to establish these because their containers had no web access, so
one of them left the gestures unbound and the other guessed. Here is the documented
behavior, with the nuance that matters.

From SOLIDWORKS' own documentation and blog:

- **Middle mouse button drag rotates the model view.** <cite index="51-1">This is the documented default: to rotate the model view, drag with the middle mouse button</cite>.
- **Rotate about an entity is a click-then-drag gesture, not a hover.** <cite index="50-1">You single-click a piece of geometry — face, plane, edge, vertex, sketch entity — with the middle mouse button; it highlights in magenta and shows a rotate cursor with a green line through it. Then you drag with the middle mouse button, and it rotates about that entity until you release, at which point the entity is deselected</cite>.
- **The default pivot is not simply screen center.** <cite index="50-1">SOLIDWORKS automatically calculates a rotation point for the trouble cases where a model is off screen and would otherwise fly away; an older option to always rotate about screen center was removed once that automatic behavior existed</cite>.
- **Ctrl + middle drag pans.** <cite index="50-1">In drawings you do not need Ctrl, since you cannot rotate there — both plain middle drag and Ctrl+middle drag pan</cite>.
- **Shift + middle drag zooms**, <cite index="50-1">and the wheel zooms in and out</cite>.
- **Wheel zoom is cursor-centred by default**, <cite index="50-1">with a "Zoom about screen center" setting under View, Modify that changes it</cite>.
- **Ctrl+Alt + middle drag turns the camera**, <cite index="50-1">available only when viewing a camera view and editing it, or with "Lock camera position except when editing" turned off</cite>. Out of scope here; listed so you don't bind it to something else.

### Where the owner's description and the documentation differ — and who wins

Mr. Pina described it as: *"when you hover your mouse over a specific point on an object, it
orbits around that point until you let go."* The documentation describes a middle-**click**
to pick the entity first, then drag.

**Build what he asked for**, because he is the user and he uses this software daily:
raycast at middle-mousedown, use the hit point as the pivot for that entire drag, release on
mouseup. Capture the pivot **once** at mousedown — recomputing it mid-drag makes the model
swim under the cursor. If the ray hits nothing, fall back to the view-plane point through
the current target and say so in your report.

Then, if it is cheap, offer the documented click-an-entity-first refinement as well. The
hover behavior is the one that unblocks him today.

### The vertical inversion

He has reported this twice: *"when I hold to orbit and move my mouse upwards, the model
should orbit to show its underside."* Horizontal is correct; vertical is inverted. Fix the
sign, and **pin it in a test that asserts the sign on both axes**, because a silent flip
here is invisible to every other check and it has now survived two rounds of fixes.

---

## A3. Repo facts you will otherwise rediscover the hard way

All measured, all costly to learn the first time.

**Build and test**
- `npm test` **exits 0 with failing tests.** Read the summary line, and read stderr, where
  vitest writes its whole failure report while still exiting 0. Never trust the exit code.
- `npm test` passes `--no-file-parallelism` because the database tests share one embedded
  Postgres cluster. A bare `npx vitest run` does not, and one suite then silently never
  runs, and a mutant "killed" by that race proves nothing.
- Baseline: roughly **487 test files, 9226 passing, 0 failed**. `npx svelte-check`:
  **0 errors, 37 warnings in 20 files**, breakdown 31/5/1.
- `svelte-check` catches what the suite cannot, because **vitest does not typecheck**. Six
  type errors once passed a fully green suite.
- Write `.env` values **before** running `svelte-kit sync`. Syncing without them reports
  around 15 phantom errors.
- Use `npm ci`, never `npm install` — install reformats the 4,600-line lockfile.
- **Never run prettier.** It is not a project dependency; a bare `prettier` resolves to a
  global install and reformats this tab-indented codebase into whole-file churn.

**Rendering and measurement**
- The headless Chromium in CI **paints no scrollbar into a screenshot at any colour**, so a
  content check passes straight over a broken layout. Rasterize and look.
- `readPixels` returns a flat single colour on a visibly-rendering viewport, because the
  WebGL context uses the default `preserveDrawingBuffer: false` and the buffer is discarded
  after compositing. A harness must force that attribute on before any page script runs, or
  its canvas check is measuring nothing. This cost one lane a full investigation.
- Playwright **evaluates a string as an expression**, so `() => ...` yields the function
  uncalled and the read silently returns `undefined`.

**Database and migrations**
- Migrations are pasted into the Supabase SQL editor by Mr. Pina. A migration is applied
  only when he says so, and `tools/record-applied.mjs` writes the record from his own
  verification output — never from a session's belief. Four separate sessions correctly
  refused to write a record they could not substantiate.
- **A verification query must RETURN ROWS.** The Supabase SQL editor displays no
  `raise notice` or `raise warning` and shows only the last statement's result set, so a
  probe reporting through `raise` looks exactly like one that never ran.
- **Never put a `$` of any kind inside a `--` comment in a SQL file.** A `$tag$` inside a
  comment balances in Postgres and breaks the editor's statement splitter. It cost one
  migration a full apply cycle.
- `revoke ... from public` does **not** remove Supabase's direct `anon` default-privilege
  grants. Revoke from `anon` by name.

**Classroom engine, if you touch the linking path**
- Student answers key on `(item_id, student_email, block_id)` with a foreign key to
  `classroom_items`, never to the spec. Re-importing a spec cannot delete student work, but
  it can **orphan** it: an answer under a block id the new spec does not contain simply
  stops rendering. Block ids are semantic and permanent from the first draft.
- `ideacad_documents.item_id` is **NOT NULL**, so a genuinely assignment-free document is
  impossible without a migration. If the rewrite makes documents standalone-first — and it
  should — that is a migration, and it is Mr. Pina's to apply.

---

## A4. Domain facts for the IdeaBlade add-on

Do not re-derive these. They were established against real sources and real hardware.

- **Hex extension: minimum 0.5 inches, NO MAXIMUM.** A competitor may take as much or as
  little of the hex core as their stack-up needs. The current code had 0.45 and an upper
  bound; both were wrong.
- **Collar: 0.5 inch of width on top, and its height adapts to the height of the design.**
  A previous lane implemented the adaptive part as 10% of body height clamped between 0.125
  and 0.5 inch. **That clamp was invented**, not specified. Treat the relationship as
  unspecified and ask rather than inheriting the guess.
- **Spin bolt: on the bottom, and OPTIONAL** — a user may omit it to use a custom spin
  point.
- **Material densities carry cited sources** in `blade/materials.ts`, and anything
  unsourced is marked unverified. Preserve that discipline exactly. One lane established
  that ASTM A240 is a *procurement specification* and states no density at all, so citing
  it for a density is wrong — check that every citation actually contains the number
  attributed to it.
- The physics — mass, centre of mass, rotational inertia, radius of gyration — is
  closed-form and tested. Keep it.
- **Export prefers 3MF over STL.** <cite index="37-1">STL is lossy and inefficient: when saving a manifold mesh to STL there is no guarantee the re-imported mesh is still manifold, because the topology is lost, whereas 3MF was designed from the beginning for manifold meshes representing solid objects</cite>. Keep STL for
  compatibility, default to 3MF. DXF of the flat blade profile matters because the blade is
  laser-cut from sheet.

---

## A5. The failure patterns that produced this rewrite

Each of these shipped, passed its own tests, and was rejected on sight. They are listed so
you can build the check that catches them, not just avoid them.

1. **Built, tested, invisible.** The Blade editor shipped complete and unreachable — no
   surface in the app called the function that attached it. Twice more, a panel was built
   with no mount. **A feature nobody can reach is not done.** Before calling anything
   finished, open it in a browser as a user and use it.
2. **A green test over a black screen.** Three lanes shipped visual work none could see; one
   produced a completely blank 3D viewport that passed every check, because the checks asked
   "present, visible, 44px, contrast" and none asked "did anything render."
3. **Watertight and wrong.** A mesh passed every watertightness assertion while being 48.7%
   too large — a repair loop was dilating the model toward its bounding box. **Volume
   against an analytic bound is the first acceptance test**, watertightness second, and
   single-connected-component third. A body plus eight floating slabs is nine components and
   must fail.
4. **A vacuous verification.** A check reported "the model fills the pane it was fitted to"
   over a model 0.68 pixels wide, because its ratio divided by a pane dimension that was
   zero. **A check that has never failed has not been tested** — plant the defect and prove
   the check goes red.
5. **The fork.** Two sessions wrote two different versions of the same stylesheet from
   different bases; git merged the later one cleanly onto a selector the other had retired,
   so a fix silently matched nothing with no conflict marker anywhere. Running alone, you
   avoid this entirely — which is a large part of why running alone is right.

---

## A6. How to judge yourself

The spec's done-test is the real one: a student who has never used CAD models a
recognizable object of their own design in five minutes with no instruction, then enables
IdeaBlade and gets told whether it passes and what it weighs.

Two shorter checks along the way, both of which the current build fails:

- **Model something that is not a blade.** A simple bracket with a hole and a fillet. If
  you cannot, the general tools are not general.
- **Hand it to someone cold.** If your own first instinct is to explain how something
  works, that thing is the defect. Fix the control, not the explanation.
