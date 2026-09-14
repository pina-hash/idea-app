---
title: "Three checks that ask whether anything was actually drawn, and what they found on a black IdeaCAD viewport (`claude/relaxed-meitner-2h6vmx`, ledger 0247)"
date: 2026-09-14
branches: [claude/relaxed-meitner-2h6vmx]
migrations: []
subsystems: ["IDEACAD", "Verification harness"]
---

Three lanes shipped visual work into the IdeaCAD 3D viewport and none of them
could see it. The result was a completely black viewport that passed every
check on the way in: present, visible, 44px, 4.5:1, and the right words in the
right elements. This bundle builds the instrument that catches that, proves
each of its checks fails when the defect it names is planted, and reports what
it finds. **It fixes nothing** -- every defect below belongs to the lane that
owns the file.

**IT WAS MEASURED ON THREE TREES AND TWO OF THE READINGS MATTER.** The branch
was cut from `799d203`, where the viewport is black; `origin/main` moved to
`fe62631` underneath it, carrying ledgers 0240 to 0246, and one of those
repaired the collapsed pane. It moved again to `115ed79` (ledgers 0252 and
0253) before this landed, and **every number below is byte-identical on both of
the later two** -- 30 outside threshold, canvas 16.87% to 42.83% over 6,833 to
9,706 colours, the same three zero-box controls -- so they are reported once. The findings reported here are from the MERGED tree, because
that is what lands. The branch-point readings are kept beside them, because the
same check on the same route answering 0.00% off the dominant colour over 1
distinct colour at `799d203` and 21.50% over 8,325 at `fe62631` is the best
evidence anyone is likely to get that it discriminates -- and because a check
that only ever ran against a broken tree would be a check nobody had seen
pass.

## The gap, stated precisely

The existing checks are not wrong. They ask a question about a BOX, and a box
can be perfect over nothing at all. Measured on `/dev/ideacad` at 1440 at
`799d203`: the canvas is `912.0 x 0.0`, its WebGL drawing buffer is `1368 x 1`,
99.56% of that buffer is the page ground -- and the route's `presence`,
`contrast`, `tap-target` and `text-contains` rows were green over it.

So the three new checks in `tools/browser-verify/checks-visual.mjs` ask the
other question:

| Check | Asks |
| --- | --- |
| `canvas-content` | did the renderer put anything in the canvas, or is it one flat colour |
| `layout-sanity` | is every interactive element a real box, in a real place, off the reserved chrome, with its text inside its container |
| `distinguishable` | do two things that must read differently actually differ in size, weight or colour |

They are their OWN FILE rather than the bottom of `checks.mjs`, for the reason
`routes.mjs` gives about `routes/`: a file every lane appends to at one closing
brace is a shared write point, and this repository has paid for that three
times. `checks.mjs` is untouched by this bundle.

## The load-bearing decisions

### A WebGL readback needs `preserveDrawingBuffer`, and without it the instrument is blind in the reassuring direction

`src/lib/ideacad/viewport/Viewport.svelte` builds its renderer as
`new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })`, which is
the WebGL default of `preserveDrawingBuffer: false` -- so the drawing buffer is
thrown away the instant the frame is composited and `gl.readPixels` afterwards
reads a cleared one. **Measured on a fixture whose triangle is known to be
drawn: 120000 pixels, 1 distinct colour, `rgb(0, 0, 0)`.** An instrument that
cannot tell that from a genuinely blank canvas is worse than no instrument,
because its "blank" reading looks like a finding.

`installCanvasReadback` therefore patches
`HTMLCanvasElement.prototype.getContext` before any page script runs. It changes
whether the buffer is KEPT, never what is drawn into it. **Where the patch has
to be installed was measured, not assumed, and the obvious spelling does not
work:**

| | marker | `preserveDrawingBuffer` |
| --- | --- | --- |
| `context.addInitScript` + `setContent` | NOT RUN | false |
| `page.addInitScript` + `goto('data:text/html,...')` | ran | **true** |
| `page.addInitScript` + `goto('about:blank')` + `setContent` | ran | **true** |

So the helper navigates to `about:blank` itself and one call serves the real run
and a `setContent` fixture alike. `run.mjs` installs it only for a spec carrying
`canvasContent`, so no other route pays for a renderer attribute it did not ask
for. **If the hook is missing the check says so in words** rather than reporting
the blank buffer it would otherwise get: a plausible blank is not investigated
and a false red is. That refusal has its own control in `--selftest`, with an
`assert` on the reason text, because "outside threshold" alone would also be
satisfied by the failure mode under test.

### The dominant colour is DERIVED, so nobody has to declare a clear colour

The single most common exact RGB value in the sampled buffer is the ground, and
the verdict is the fraction of pixels off it. That makes the question "is this
uniform", which is the defect, and it works on a viewport whose clear colour
nobody told us: a canvas that was only cleared is one colour at 100% whatever
that colour is.

### The two floors, and why no number between them needs defending

`>= 2%` of sampled pixels further than 8/channel from the dominant colour, AND
`>= 16` distinct colours. The arithmetic first: the IdeaCAD pane at 1440 backs a
1368-wide store at the clamped 1.5x ratio, so a healthy pane is order 1.25M
pixels and 2% is ~25,000 of them -- a single stray pixel is 8e-7 of that, four
orders of magnitude below the floor. The second term catches what the first
cannot: a canvas painted one flat wrong colour over another clears 2% easily and
is still not a rendered model.

Then both floors were checked against two SOUND renders rather than against
arithmetic alone:

| | differ > 8/channel | distinct colours |
| --- | --- | --- |
| the `--selftest` shaded fixture | 23.77% | 9,617 |
| the real Blade model, correctly fitted | 19.09% | 11,110 |
| the same canvas, `--break blank-canvas` | 0.00% | 1 |
| a canvas that was only ever cleared | 0.00% | 1 |

A sound render clears the 2% floor by an order of magnitude and the 16-colour
floor by nearly three; both broken readings sit at the floor of both terms.

### "Outside the viewport" is asked of the DOCUMENT, not of the viewport

`getBoundingClientRect().top >= innerHeight` is what EVERY element below the fold
of a scrolling page returns, so that spelling is a page-length detector rather
than a check. The finding is an element parked outside the area the document
itself can reach. Three more exclusions are measured rather than preferred:

- **A `display: none` control is not a zero box**, it is an element the page
  does not render. The collapsed FeatureManager stations are exactly this and a
  check that counted them would report eight findings on a correct tree. They
  are counted as skipped and the count is printed.
- **A zero-size box is never also counted as offscreen.** The three 0x0 pane
  tabs sit at (0,0), where the naive viewport test reports three offscreen
  elements that are nothing of the kind -- and a reader chasing them would be
  chasing an artefact of the first finding.
- **An element inside a scroller that could reach it is scrolled away, not
  offscreen.** The concept strip is a real horizontal scroller. Reported in its
  own bucket, never folded into the verdict.

`text-overflow: ellipsis` and the 1x1 `clip` visually-hidden idiom are the same
deal on the text side: reported by name with their text, never counted. Naming
them rather than skipping them silently is what surfaced finding 5 below.

### `distinguishable` decides on exactly size, weight and colour

Every real pair on the surface was sampled at 1440 before the axis list was
closed: the readout label against its value is 12px/400 against 16.8px/700 (size
AND weight), the status-bar label against its value is 400 against 600 at the
same size and ink (**weight alone**), and the eyebrow against the saved-state
word is teal against ink at the same size and weight (**colour alone**, 1.85:1).
All three axes are exercised by real pairs and not one needs a fourth, so
font-family and letter-spacing are REPORTED and decide nothing -- admitting them
would have widened the check to accept a distinction weaker than any this design
actually makes, on no evidence. The colour floor of 1.25:1 sits a third of the
way from "the same ink" (exactly 1.00:1) to the one real colour-only pair.

### The IdeaCAD wiring is a shared fragment, and which routes take it is measured

`routes/_ideacad-drawn.mjs` states the canvas selector, the reserved region and
the three pairs ONCE; fifteen specs spread it in. The editor is one component
and those are properties of the component, not of any one state.

Every `/dev/ideacad*` spec was driven at 1440 and asked for its own anchors
before the file was written: **fifteen** answer `.ideacad` 1, the canvas 1,
`.status-bar` 1 and `.readouts .metric` 7; the other **eighteen** -- archive,
attach, shared, team, and `ideacad-item-state-unavailable` -- answer 0 to all
four, because they mount a panel and not the editor. A check pointed at an
anchor that is not there is a red row nobody can fix, so they do not take it.

Two selectors are more specific than they look and measurably have to be.
`.status-bar .save`, never `.save`: there are TWO `.save` elements and the first
in document order is the deliberately visually-hidden
`.header-status-compat` at `BladeEditor.svelte:908`, so a bare selector compares
the word nobody can see. `.ideacad .eyebrow`, never `.eyebrow`: the
`/dev/ideacad-item` harness draws an eyebrow of its own, so a bare selector
measures the harness's chrome on six of the fifteen routes and the product's on
the other nine.

## The negative controls

**Fixtures: 98 controls run (50 negative, 48 positive), 0 instrument failures**
-- up from 70/36/34, so 28 of them are this bundle's, one pair per claim. Each
sub-claim gets its own group rather than one group per check: a check with four
sub-claims and one pair of fixtures proves whichever sub-claim the fixture
happens to move and says nothing about the other three. Six of the pairs carry
an `assert` on the reason text, because "outside threshold" is also what a
broken instrument returns.

**Live, on the real surface**, `/dev/ideacad?role=teacher&state=property` at
1440. Each preset's own row is in bold and every other row sits at its
baseline, which is the property that makes a preset worth anything:

| | `canvas-content` | `layout-sanity` | `distinguishable` |
| --- | --- | --- | --- |
| no preset | ok 21.50% / 8,325 colours | 3 zero-box | ok, ok, ok |
| `blank-canvas` | **0.00% / 1 colour** | 3 zero-box | ok, ok, ok |
| `zero-box` | ok 21.50% / 8,325 | **6 zero-box** | ok, ok, ok |
| `same-style` | ok 21.50% / 8,325 | 3 zero-box | **INDISTINGUISHABLE x3** |

`zero-box` is the one that cannot be a clean transition, because the surface
genuinely has three zero-box controls (finding 2 below); what it demonstrates is
the count moving 3 to 6 with the newly zeroed controls named by their own text.
At the branch point `blank-canvas` was in the same position for a different
reason -- `canvas-content` short-circuited on the canvas's zero CSS box before it
read a pixel -- and its green-to-red was taken by propping the collapsed pane to
431px in a scratch script and pressing the surface's own **Fit** control
(19.09% / 11,110 colours WITHIN, then 0.00% / 1 OUTSIDE). The merged tree makes
that prop unnecessary.

`blank-canvas` needs BOTH halves of what it does, and that is a measurement
rather than belt and braces. No-oping the draw calls covers a surface that
renders again after the injection -- `/dev/ideacad`'s prepare drives 300 real
frames. Clearing the live buffer covers the other fourteen routes:
`Viewport.svelte`'s own header says "RENDER ON DEMAND. There is no animation
loop", so with `preserveDrawingBuffer` forced on, the frame drawn before the
injection is still sitting there, the patched draw calls never run, and the
control comes back green while proving nothing.

## What the instrument found on the merged tree, and none of it is fixed here

66 route/width runs over the 33 `/dev/ideacad*` specs, 1344 measurements, 147
outside threshold. 150 of those measurements are the new checks' and **30 are
outside threshold**, all of them two findings repeated across the fifteen editor
routes.

1. **The 3D viewport draws, on all fifteen editor routes at both widths.** 30 of
   30 `canvas-content` readings are WITHIN: CSS boxes from `307.0 x 328.5` to
   `924.0 x 490.2`, **16.87% to 42.83%** of sampled pixels off the dominant
   colour over **6,833 to 9,706** distinct colours, against floors of 2% and 16.
   This is the finding that was not available at the branch point, where the
   same thirty readings were `zero CSS box ... nothing can be drawn in it`.

2. **Three pane-switcher buttons render at 0x0 at 1440**, on all fifteen routes
   -- `nav.mobile-switcher > button` reading "Features", "Graphics" and
   "Properties". They are RENDERED, not `display: none`, so they are focusable,
   tabbable controls with no box at desktop width. At 375, where they are the
   real switcher, they are fine and thirteen other elements are correctly not
   rendered. This is every `layout-sanity` red in the run: 15 of 15 at 1440, 0
   of 15 at 375.

3. **`p.view` ("Isometric") is 1x1 and clipped on all fifteen routes at both
   widths** -- 58x14 of text in a 1x1 box. `Viewport.svelte` declares `.view`
   TWICE in one stylesheet: the rule at line 674 is the visually-hidden idiom
   (`width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)`) and the one
   at line 707 sets `position/bottom/left/margin/font/color` and undoes none of
   it, so the later rule gives it a place to sit and the earlier one keeps the
   box at 1x1. Meanwhile the spec's `contrast [the current view name]` row
   measures it at **16.19:1** -- a contrast reading on text nobody can see. It
   is REPORTED and not counted, because the idiom it wears is the legitimate
   screen-reader pattern and `.header-status-compat` beside it is a correct use
   of it; naming the bucket's members rather than skipping them is the whole
   reason this is visible at all.

4. **The readouts rail is `visibility: hidden` at 375** on all fifteen routes, so
   `distinguishable` reports NOT BOTH VISIBLE for the label/value pair there.
   This is corroborated rather than novel: the spec's own pre-existing
   `presence [rule readouts...]` row already reads `present 7, visible 0` and
   already fails at that width. Two independent checks agreeing is the reading
   to trust.

5. **"Standard Parts" is ellipsised in the feature tree at 1440** on 12 of the 15
   routes -- 103x21 of text in a 97x20 box. Reported, not counted: an ellipsis is
   a deliberate truncation with a visible mark. Worth a look by the owning lane
   all the same, since it is the only row in that tree that does not fit.

6. **Zero findings for three of the four `layout-sanity` claims**, over stated
   populations: 0 elements outside the document, 0 overlapping the status bar
   (measured `1438.0 x 36.0` at 1440 and `373.0 x 28.0` at 375), 0
   genuinely-clipped text elements, across 23 to 40 interactive elements and 23
   to 142 text elements per route.

### Two findings that are not this bundle's checks, found on the way past

7. **`svelte-check` on `origin/main` reports ERRORS, and the count is rising**,
   which CLAUDE.md's stated baseline (0 errors, 37 warnings in 20 files) does
   not admit. At `fe62631` it was ONE --
   `src/lib/ideacad/viewport/picking.ts:80:26`, `Argument of type 'Vector2Like'
   is not assignable to parameter of type 'Vector2'`, from ledger 0245 --
   measured on a CLEAN `git worktree` with none of this branch's changes in it,
   **1 error and 37 warnings in 21 files**, the same figure the merged tree
   gave. At `115ed79` it is TWO: ledger 0252 added
   `tests/ideacad-tree-ops.test.ts:51:67`, `'body' is possibly 'undefined'`.
   **2 errors and 37 warnings in 22 files**, warning mix unchanged throughout at
   31 `state_referenced_locally` / 5 `css_unused_selector` / 1
   `perf_avoid_nested_class`. This is why CI is red on `main`: every one of the
   last eight `ci.yml` runs on that branch failed, `fe62631` and `115ed79`
   included. CLAUDE.md is not this bundle's to edit and neither file is this
   bundle's to touch; both corrections belong to the lanes that own them.

8. **An existing IdeaCAD verdict was vacuous at the branch point and reported
   `ok` over a model 0.68 pixels wide.** `the model fills the pane it was fitted
   to` compares `max(projected.w, projected.h) >= min(box.w, box.h) * 0.55`, and
   with `box.height` 0 the right-hand side is 0, so any projection passed. It was
   green at 1440 in the same run whose `the canvas fills the viewport pane` sat
   FAILED two lines above it. The pane is repaired now so the verdict has teeth
   again, but **the shape is still there**: a ratio against a dimension that can
   be zero is a claim that switches itself off exactly when the thing it guards
   breaks. That is the bundle's own thesis arriving inside a check written to
   prevent it, and it is worth a look by the lane that owns the probe.

## What was NOT verified, and one limit worth knowing

- **Nothing was fixed and no `src/`, `supabase/`, migration or other
  subsystem's spec was touched.** Every finding above belongs to the lane that
  owns the file.
- **The eighteen panel-only `/dev/ideacad*` routes carry none of the three
  checks**, for the measured reason given above. That is a stated scope, not a
  silent gap.
- **The measured half of the harness README was regenerated for the ideacad
  specs and the `--selftest` count only** (`npm run verify:readme -- --route
  /dev/ideacad`), which is what that flag exists for; every other spec's
  measured file is untouched and its numbers are whatever the last full run
  wrote.
- The harness blocks every non-loopback request, so text is measured in the
  fallback stack; `prefers-reduced-motion` is `no-preference`, so that path is
  not exercised. Both are the harness's standing limits, not this bundle's.
- Nothing here says anything about production. No process in this container has
  a route to the production database and none was attempted.
- **The suite is red on `main` and stays red**, which this bundle neither caused
  nor fixed. At `fe62631`: **4 failed | 9112 passed | 6 skipped (9122)**, 4 files
  of 479, and the IDENTICAL four files with the IDENTICAL six named failures come
  back from a clean `git worktree` at `origin/main` with none of this branch in
  it -- `tests/dom/ideacad-ui-mount.test.ts`,
  `tests/apply-migration-guard.test.ts`, `tests/apply-migration-trace.test.ts`,
  `tests/db/migrations-applied-record.test.ts`. At `115ed79` it is **5 failed |
  9113 passed | 6 skipped (9124)**, the fifth being
  `tests/ideacad-tree-ops.test.ts`, which ledger 0252 added in the same commit
  that put the second `svelte-check` error in it. Not one of the five is a file
  this bundle touches. **Read off the summary line, never the exit code**:
  `tools/run-tests.mjs` says in its own header why, and this run is the case --
  `npm test` reported its failures and the wrapper's own `raw exit` was 1 while
  vitest underneath exited 0.
