---
title: The IdeaCAD arc tool - which way round, one radius, and what the kernel says
date: 2026-09-22
branches: ["claude/new-session-9tmqf4"]
migrations: []
subsystems: ["ideacad"]
---

A student filed this on 2026-09-21 at 19:57 local, against build `3793ea2`, from
`/ideacad` at 1920x919: **"Arc tool isn't helpful and causes great issue."** The
sketch editor that carries the tool landed the same day, in `e65056ea`, so he is
plausibly the first person to have used it.

Decision 31 is the tie-breaker for every choice below: "This is not a technical
precision program... It should be quick to use, extremely quick to use."

## The five defects, each confirmed by running the code rather than reading it

Every claim in the prompt was re-derived by transcribing the deployed functions
and running them. All five hold, and two of them are worse than stated.

**1. Every arc swept counter-clockwise, so half of all third clicks gave the
complement.** `arcSweep` normalizes into `(0, 2pi]`, the arc entity has no
direction field, and the `'arc'` branch of `down()` read no modifier. Measured,
center `(0,0)` and start `(1,0)`:

| third click | sweep |
| --- | --- |
| 10 degrees counter-clockwise | 10.000 |
| 10 degrees clockwise | 350.000 |
| 90 degrees clockwise | 270.000 |
| 0.01 in below the start | **359.427** |
| collinear beyond the start | 360.000 |

**2. The preview showed a different arc from the one committed.** The preview
built its third anchor as `{ at: cursor.at, kind: 'none' }`, dropping `point`;
`arcDraft` branched on exactly that field. Measured with an existing point at
`(0,3)`: preview end `(0.000, 1.000)` at radius 1.000, committed end
`(0.000, 3.000)` at radius 3.000.

**3. A snapped arc had two radii and nothing refused it.** Same fixture: the
rendered segment jumps **2.000 inches radially** between its last two vertices,
because `samples()` puts every vertex but the last at the start radius.

**4. The v2 validator had dropped the v1 radius guard.** Confirmed: the whole v2
arc check is three non-empty strings. An arc with radii 1.000 and 3.000 is
ACCEPTED; so is one whose center, start and end are all the same point.

**5. Degenerate third clicks were accepted.** Worse than reported: a third click
on the CENTER committed an arc with **end radius 0.000 and sweep 360.000**, not
merely an end equal to the center. A third click on the start committed sweep
360.000 with two distinct coincident points.

**The two lower-confidence claims.** `countDof` does return **6** for a lone arc
where a real arc has 5 -- confirmed. `arcRadius` IS a center-to-start distance --
confirmed, and it is CORRECT rather than a defect, for a reason only the kernel
could give (below).

## A sixth defect the prompt does not contain, and it decides the hardest question

**Dragging an arc's end point in Select breaks the radius with no arc tool
involved.** Measured through the real `movePoints`: an arc at radius 1.000 whose
end is dragged to `(0, 2.5)` ends up with `rStart=1.000, rEnd=2.500`. Dragging the
CENTER does the same to both radii at once. So the arc tool is not the only
generator, and a guard that refuses the state at the document boundary would fire
on ordinary future editing, not only on legacy rows.

## What the kernel says, which the prompt expected to be unanswerable

The prompt said the Remus seam could not be read from a container and told this
bundle to design so the answer did not matter. **It is readable**: the wasm is
committed at `static/ideacad/kernels/remus-9307e73.wasm` and the suite already
loads it. The answers are sharp enough to change the design, so they are now
pinned in `tests/ideacad-solid-sketching-geometry.test.ts` rather than left in
prose.

- **`makeCircleArc3d` REFUSES an inconsistent arc outright**, down to one part in
  a million: `invalid input: edge vertices do not agree with its authoritative
  curve trim`. The two degeneracies get their own sentences (`start point
  coincides with center`, `periodic edge endpoints do not establish a non-zero
  span`). A start equal to the end -- a whole turn -- is ACCEPTED.
- **`gcsAddArc` DOES couple the end radius to the start radius.** `gcsDof` over
  three points with a fixed center reports `numEquations: 0` for a line and
  **`numEquations: 1` for an arc**. Behaviourally: an end at `(0,3)` on a
  radius-1 arc is pulled to `(0,1)` by the first solve, with nothing having asked
  it to move.
- So an inconsistent arc is never merely cosmetic. It cannot be extruded (the
  extrude of such a profile throws that sentence, measured through the real
  engine), and the moment the sketch carries any constraint the solver TELEPORTS
  the end onto the radius, dragging whatever shares that point with it.
- That also settles `arcRadius`: constraining center-to-start pins the end radius
  too, THROUGH the arc's own equation. It is not a half-measure.

`solveSketch` returns early when `doc.constraints.length === 0`, which is why the
coupling exists in the kernel and is not reached in the common case.

## What was built

**1. The third click is a DIRECTION, and it is the only thing it can be.** With
the center and the start clicked, the radius is fixed, so a third click can only
choose how far round and which way. `arcSweepToward` in `model.ts` returns the
SIGNED short way round; `arcDraft` takes a `Vec2` rather than an `Anchor` for it,
so a caller has nowhere to put a point id and the old branch cannot come back.
The end is always `arcPoint`'s, which carries the start's radius by construction,
so defects 2 and 3 are one fix and are structural rather than checked.

**2. A clockwise arc is stored with its ends SWAPPED, exactly as `filletCorner`
already did it.** The arc entity gains no field, "counter-clockwise from start to
end" stays true for every reader, and **an arc saved before this reads exactly as
it did** -- there is no legacy shape and no optional field defaulting to the old
behaviour.

**3. Shift takes the long way round**, and it reaches the preview. `context()`
defaults `shift` to false because the redraw effect has no event to read it from,
so without plumbing it the preview would show the short way and the commit would
take the long one -- a smaller copy of the very defect being fixed.
`session.setModifier` is driven from window keydown/keyup and answers whether
anything on screen actually changes, so every other key costs no redraw.

**4. Three refusals, in student-facing sentences.** A start on its own center
(moved EARLIER, to the second click, where it costs one click instead of two), a
third click on the center, and a third click exactly along the center-to-start
ray.

**5. A snap may never manufacture a refusal.** This was found by the new tests,
not by reading: referencing the second click to the center is useful (a start
placed exactly level or plumb with it), but the same reference on the THIRD click
snaps a 170-degree click onto the 180 ray, where the two half circles are mirror
images and the normalization has to pick one -- so a student aiming just below
the far side got the half bulging the other way, **which is the reported defect
in miniature**. The third click is therefore referenced to nothing. Separately, a
click near the origin snaps to the origin, which IS the center whenever the
student drew around it; `arcSnap` uses a snapped position only while it still
asks for an arc and falls back to the raw one when it does not.

**6. The panel says what the tool does.** The hint was "Click the center, then
the start, then the end", which is wrong in both branches of the old `arcDraft`
and differently wrong in each. It now reads "Click the center, then the start,
then swing round to where it ends. Hold Shift for the long way round."

## The one defect deliberately NOT fixed, and why

**The v2 validator's arc check is unchanged. `validate.ts` and `types.ts` were
not touched.**

`validateManifest` is called from exactly two places in `engine.ts`: `snapshot()`,
before a SAVE, and `load()`, before an OPEN. A refusal there is not a warning, it
is a document that will not open.

- An inconsistent arc can already be in a saved sketch -- through the old snapped
  branch, and (still, today) through an ordinary endpoint drag.
- Such a document opens today. The arc draws with a visible radial jump, the
  extrude refuses, and **the student can repair it by hand**: drag the end, or
  delete the arc and draw again.
- With the guard, that same document does not open at all, and the repair becomes
  unreachable. The guard fires at open and save, never at the extrude, so it does
  not even improve the sentence the student reads when the geometry is consumed.
- The kernel is already the guard, and an honest one: it refuses every
  inconsistency at the one place it matters. What it lacks is words, and
  `engine.ts` (where they would go) is outside this bundle.

CLAUDE.md requires a narrowing to have an answer for the rows already stored, and
no session in this container can count them. So the guard's VALUE is delivered
where it costs nothing: `inconsistentArcs` in `model.ts` and a non-blocking
notice in the sketch panel, naming the arcs and saying what to do. It covers arcs
made by the drag hole too, which the arc-tool fix cannot.

**For Mr. Pina.** Two things are left for him to decide, neither fixable inside
this bundle's files:

1. **An arc's points can still be dragged into an inconsistent state** (Select,
   any arc endpoint or its center). Fixing it means changing what a drag MEANS
   for an arc, which changes the Select tool for every arc and belongs in its own
   bundle. Until then the notice is what reports it.
2. **If he wants the hard document-boundary guard anyway**, it needs a companion
   answer for documents already saved -- a repair on load rather than a refusal --
   and that lives in `engine.ts`/`upgradeManifest`, not in `validate.ts`.

A third, smaller one: `arcEntities` (the v1 drawing path used by
`viewport/drawing.ts`, not the sketch editor) has the identical counter-clockwise
defect. Its caller is outside this bundle's files, so it was left alone.

## Verified

- **Third click against sweep, before and after**, eleven rows, printed by
  `tests/ideacad-solid-sketching-session.test.ts`. The `was` column is DERIVED
  from `arcSweep`, which is still present and still correct for its own job, so
  the claim about the old behaviour is itself asserted rather than remembered.
- **`npx svelte-check`: 0 errors, 37 warnings in 20 files, 31/5/1**, before and
  after -- re-derived on the clean tree at `3793ea2c` with the two `PUBLIC_`
  values exported before the sync. CLAUDE.md's written baseline was CORRECT this
  time, for the first time in six recorded readings.
- **A browser spec that drives the tool**,
  `tools/browser-verify/routes/ideacad-solid-state-arc.mjs`, the first of 237 to
  press the arc tool at all. Three arcs from nine real presses on the viewport
  canvas: the reported case (0.573 degrees, where the deployed tool gave
  359.427), a clockwise quarter (90, which that tool could not draw), and a
  Shift-held major arc (270, carried by a real `shiftKey`). The quarter is then
  closed and extruded: **1 body, volume 1.7837**, against the analytic circular
  segment `3.125 * (pi/2 - 1) = 1.7837`. 36 measurements at 375 and 1440, 0
  outside threshold.
- **Its one instrument adjustment is declared in the spec's own header**:
  `viewport.ts` calls `setPointerCapture` with the event's pointer id, which
  throws for a synthetic `PointerEvent`, so the drive stubs that one method for
  the length of the drive and restores it. The harness's only pointer verb is a
  click at an element's centre, and an arc needs three different points.
- **The kernel facts above** are pinned against the real wasm, each with a
  positive control (the consistent arc builds; a line over the same points adds
  no equation).

## Not verified

- Nothing was run against the production database or a signed-in session; this
  container cannot reach either.
- The Vercel preview was not opened; no cloud session can.
- Whether any saved document currently holds an inconsistent arc. That is a
  property of production and no file in this repository records it. It is the
  fact the validator decision turns on, and the decision was made to be safe
  under either answer.
- `prefers-reduced-motion` is `no-preference` in the harness, and web fonts are
  blocked, so text was measured in the fallback stack.
