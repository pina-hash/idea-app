---
title: "IdeaCAD's FeatureManager, PropertyManager, concept cards and undo"
date: "2026-09-12"
branches: ["claude/pensive-turing-inj1ih"]
migrations: []
subsystems: ["IdeaCAD", "Classroom", "Testing"]
---

Ledger 0167 built the 3D viewport; this bundle built the console around it. What
existed at branch time, measured rather than read off a report: a feature tree that
could only SELECT, a concept strip that could create, rename and delete but not
reorder and drew no picture of anything, a `history` array in `BladeEditor` with no
writer and no control, and no PropertyManager of any kind -- so there was no path
by which a student could change a single parameter of their blade.

## The prediction gate was already fixed, and this bundle measured it

**The prompt said the gate is broken and ledger 0160 measured it. 0160 measured it
AND FIXED IT**, in the same bundle: `{#if !prediction}` over
`bind:value={prediction}` became a separate `revealed` flag that only the deliberate
press sets. The defect described in the prompt -- one character typed into "Say why",
no concept picked, Reveal never pressed, `I 1626.6 g·cm²` on screen -- was not
reproducible on `origin/integration` at `3728698`.

So what this bundle owed was the MEASUREMENT, and it is now a durable one.
`__ideacadGateProbe` on the dev harness runs 0160's own experiment at both widths:
the sheet opens locked, one character leaves it locked, a press with half an answer
leaves it locked, the other half alone leaves it locked -- and then **the positive
control, which is the step that makes the six absences mean anything**: the
deliberate press with both halves opens it, one physics block per concept, with the
inertia figure on screen. Without that last claim every "still locked" above it is
satisfied by a sheet that never renders physics under any circumstances.

**Mutation proof, and the first mutant was the wrong one, which is the finding.**
Changing `{#if !revealed}` to `{#if !rationale}` reddened two claims -- and for the
wrong reason. That branch governs only which PROMPT shows; the physics `<dl>` is
gated separately, so the mutant merely removed the picker mid-probe. The real mutant
is `{#if revealed}` on the `<dl>` itself, and it reddens exactly the claims 0160
measured: *one character typed into Say why leaves it locked* FAILED, *and no
inertia figure is anywhere on the sheet* FAILED. `BladeEditor.svelte` was restored
from a copy taken before the mutation and is md5-identical (`38afbf09e2c9`) --
`git checkout --` was not used, per the rule in `CLAUDE.md` that has cost three
sessions their uncommitted work.

**Two real defects in the gate survived 0160 and are fixed here.**

- **It opened on the PRESS, not on the WRITE.** `revealed = true` ran before
  `await setPrediction(...)`, so a rejected `ideacad_set_prediction` left the
  comparative physics on screen with nothing recorded: the student is taught the
  lesson and the evidence of their prediction is thrown away. It is now inside the
  `try`, and a refusal keeps the gate shut and says so. The happy path is identical
  either way, so **only a transport that REJECTS can tell the two apart** -- which
  is why that case is a test rather than a harness note.
- **A prediction already recorded did not unlock anything.** `BladeEditor` takes a
  `prediction` prop now and seeds `revealed` from it, and the sheet quotes the
  prediction back with its date instead of asking again. A gate that asks twice
  overwrites the answer it is teaching by.

## The four surfaces, and the one verb the schema cannot carry

**Reorder is the only one of rename, reorder and delete that a blade document can
represent, and that is a fact about `blade/tree.ts` rather than a design
preference.** `evaluate` finds every feature by TYPE (`featureOf(tree, 'revolve')`
and five more) and throws on the first missing one, so a deleted feature is not a
degraded blade, it is a document nothing can open. A `BladeFeature` carries no name
field, so a rename would live in one browser's memory and be gone at the next load.
Neither module is this lane's to widen. **Reorder, by contrast, is whole**: order
changes no number, which the test asserts by re-evaluating a reordered tree, and it
is CONSTRAINED by the tree's own declared references -- `ExtrudeFeature.sketch`,
`PatternFeature.feature`, `MountFeature.feature` -- so a feature can never sit above
something it is built on. A refusal is a SENTENCE naming both features, because a
move that silently does nothing is the same control twice.

The two refused verbs are said in words rather than left as gaps, per this repo's
own rule for a control that is absent for a reason. **What it would take to make
rename real is one line in `blade/tree.ts` (`name?: string`) and nothing else** --
the RPC stores `p_features` as jsonb and would round-trip it -- and that line
belongs to whoever owns that module, which is why this bundle did not write it
under a `NamedFeature` cast of its own.

- **The FeatureManager** is a real ARIA tree: one tab stop with a roving tabindex,
  arrows and Home/End to move, Enter or double-click for Edit Feature, a REBUILD
  chip on any row `validateBladeTree` names, and the body's stations as child rows
  behind an expander.
- **The PropertyManager** replaces the tree in the same pane, which is what "in
  place" means and is a claim only a browser can check. Every bound it draws comes
  from the CONFIG's own rules (`panelFor` reads `config.rules`), never a number
  typed beside the control, so a slider cannot reach a value the rail then calls
  FAIL with nothing to say why. The body edits as a station table with add and
  remove inside `validateBladeTree`'s 3-to-8, and a new station is inserted at the
  MIDPOINT so strictly-increasing z holds by construction rather than by the student
  repairing it -- an equal-height station is a zero-height frustum, and
  `frustumProperties` divides by `r2**3 - r1**3`.
- **The concept strip** gained a profile thumbnail, a live rule chip and reorder.
  The thumbnail is the profile polyline, not an offscreen render: a second WebGL
  context per card, on the six-to-eight-year-old school desktops this repo's
  performance budget names, is a lot to spend on a picture 46px wide, and the
  polyline differs between two concepts exactly when their bodies do.
- **Undo and redo** are 50 deep over ACCEPTED edits, never the draft -- a stack fed
  by the live preview would need forty presses of Ctrl+Z to undo one decision. They
  do not follow a concept load, because an undo that reached into a document the
  student is not looking at is a rewrite nobody can see.

**The keystroke has one owner, and `defaultPrevented` is the discriminator.**
`viewport/controls.ts` binds `z` unconditionally on its OWN element, so `Ctrl+Z`
inside the graphics area is a zoom and calls `preventDefault`; the console's handler
reads that and stands down, so one press never does two jobs. The positive control
is in the test: the identical keystroke UNCLAIMED does undo. `typingInto` is
imported from that module rather than restated.

## Three defects every threshold passed, found by rasterizing and looking

0160's lesson, and it held exactly.

- **The tree's last rows were below an invisible fold.** Station rows expanded by
  default pushed Materials and Standard Parts -- two nodes 0145 PART 5 names -- past
  the bottom of a 514.6px pane at 1440. **This container's Chromium paints OVERLAY
  scrollbars**, measured: `.tree`'s `offsetWidth` and `clientWidth` differ by its own
  1px border and nothing else, so there was no cue of any kind. Stations are
  collapsed by default and the full refusal prose moved to the PropertyManager; the
  pane now fits exactly, `scrollHeight` 515 against `clientHeight` 515, and the last
  sentence's bottom sits 29px above the fold.
- **Two Accept buttons on one screen.** The PropertyManager carries the confirm pair
  0145 asks for, and the viewport's own pair rendered beside it. They call the same
  two functions, so the question is which is visible: the viewport's is withdrawn
  while the panel is up.
- **The concept strip ran off a 1440px window** with "Commit as concept card" sliced
  in half. It scrolls, so no threshold could see it, and nothing tells a student
  there is more to the right. Cards keep the horizontal scroll (a document may hold
  many, and a card is a fixed size); the controls WRAP, because there is a known
  number of them and every one has to be reachable without a gesture.

A fourth was cosmetic and is fixed: the recorded prediction's date was jammed
against the sentence (`...further out2026-09-12`), because a `{#if}` inside a
sentence collapses the whitespace around it.

## Measured

- **svelte-check: 0 errors, 38 warnings in 21 files**, before and after -- 32
  `state_referenced_locally`, 5 `css_unused_selector`, 1 `perf_avoid_nested_class`.
  **`CLAUDE.md` says 40 in 22 files and that is stale on this tree**; the baseline
  was re-derived off `origin/integration` at `3728698` before a line was changed.
  That file is not this lane's to edit.
- **`npm test`: 405 files, 7879 tests, all green**, against a 403/7809 baseline taken
  on the same tree. 380.4s.
- **`npm run verify:browser`, the six IdeaCAD specs at 375 and 1440: 12 runs, 288
  measurements, 0 outside threshold.** Every control at 44px with no 24px exception
  claimed, this being a student surface at every width: the tightest are the station
  table's add and remove and the view toolbar, both exactly 44x44. No horizontal
  scroll at either width. Contrast worst case 5.37:1 (the triad's red axis letter
  over the viewport ground, 0167's).
- **Layout at 1440**: console 1440x760, tree 300, viewport 858, rail 280 -- the three
  regions summing to the console. PropertyManager 267x624.3 inside the 300px pane,
  profile preview 120x149.5 inside it. At **375** the console is a single column,
  viewport first at 373x360, and the PropertyManager is 341 wide with its whole
  station table and preview on screen.
- **One `verify:readme` pass over the specs this bundle touched**, which is the
  per-spec store 0168 built: six files written, the store now holding 199 specs, 398
  runs, 7018 measurements, 1 outside threshold (the pre-existing presence finding on
  `/dev/presence?presence=off`, untouched here).

## Not verified, and why

- **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder (`example-ref`) and `IDEA_MIGRATION_URL` and `DEPLOY_PROBE_URL` are
  both unset in this container. No migration was written; `Claims: none`.
- **No signed-in surface was driven.** `npm run verify:browser` covers `/dev` routes
  only, which is its stated boundary. The real classroom item page needs a Bosco
  Tech Google session no cloud session holds.
- **The Vercel preview was not opened**, which no cloud session can do.

## What this bundle deliberately did NOT do, and who it belongs to

**The real classroom page still mounts `BladeEditor` with no transports at all.**
`src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte` builds
`createIdeacadTransports(data.supabase)` and never passes it, because the only route
from that page to the editor is `ItemDetail.svelte`, which mounts `BladeEditor`
directly and is not in this lane's Owns. So on the real page every surface built
here is present and read-only in effect: the FeatureManager, the PropertyManager,
undo and the concept strip all work against in-memory state that no save reaches,
the prediction gate has no recording transport, and `prediction` is never handed in.
**That is the next bundle and it is one file**: `ItemDetail` needs to pass the
transports, the concepts, the active concept and the prediction down, and ledger
0170's `src/lib/ideacad/store.ts` is presumably where that wiring belongs.

**`store.ts` was not on `origin/integration` when this branch was cut** -- a sweep of
every remote ref found no such file anywhere -- so this bundle built against the
transports' own shapes and invented no second store, per its prompt. **It landed
while this bundle was running**, as `codex/build-state-layer-in-store.ts` (PR #93,
ledger 0170), and is on the merged tree here. **The two halves fit**:
`IdeacadStoreState` exposes `concepts`, `activeConceptId`, `prediction`, `config`
and a `phase`, which is exactly the set `BladeEditor` takes. What the mount site
owes is a field rename and nothing more -- 0170's `IdeacadPredictionRow` is
`{ predicted_concept_id, rationale, made_at }` against this component's
`{ conceptId, rationale, at }` -- and the rename belongs at the mount rather than in
the component, for the same reason the `concepts` prop is not a row shape either: a
presentation component takes state via props and does not learn the database's
column names. `phase` is what should drive the header's save word, which is a literal
here because nothing writes.

**The merged tree's counts region was regenerated rather than resolved by hand**,
which is the procedure `tools/browser-verify/README.md` states for exactly this
conflict: it is a pure function of the tree, so it produces the merged tree's own
answer whatever either side wrote. The store then reads 199 specs, 398 runs, 7022
measurements, **0 outside threshold** -- the one finding this bundle's own pre-merge
run carried (`/dev/presence?presence=off`) is gone because ledger 0172 re-measured
that spec on `integration`.

**A `readOnly` teacher can open the PropertyManager and read it.** That is role
parity rather than an oversight: one component, gated by `readOnly` and by which
callbacks it is handed, with the writes ABSENT rather than disabled at a flag. The
harness measures both halves at once, because an absence asserted with nothing on
the other side of it passes on a blank page.

**Selecting a feature does not highlight it in the viewport**, which 0145 PART 5
asks for. `viewport/Viewport.svelte` takes an evaluation and a rotation and has no
selection input, and it is 0167's file rather than this one's.
