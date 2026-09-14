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

## The gap, stated precisely

The existing checks are not wrong. They ask a question about a BOX, and a box
can be perfect over nothing at all. Measured on `/dev/ideacad` at 1440 before
any change: the canvas is `912.0 x 0.0`, its WebGL drawing buffer is `1368 x 1`,
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

**Live, on the real surface.** A live control cannot show green-to-red on a
surface that is already red, and two of the three were:

| Preset | On `/dev/ideacad?role=teacher&state=property` @1440 |
| --- | --- |
| `same-style` | clean transition: all three `distinguishable` rows go from distinguished to `INDISTINGUISHABLE on all three axes` |
| `zero-box` | already red, so the demonstration is the count moving **4 to 9**, with the five newly-zeroed controls named by their own text (`Feature tree`, `left-divider`, `Hide FeatureManager`, `Fit`, ...) |
| `blank-canvas` | already red for a PRIOR reason -- the check short-circuits on the canvas's zero CSS box before it reads a pixel |

`blank-canvas`'s green-to-red was taken on the real renderer instead, in a
scratch script that props the collapsed pane to 431px and presses the surface's
own Fit control: **19.09% off the dominant colour over 11,110 distinct colours
(WITHIN), then 0.00% over 1 colour with the preset applied (OUTSIDE)**. Once the
pane is fixed the transition is available on the route itself.

`blank-canvas` needs BOTH halves of what it does, and that is a measurement
rather than belt and braces. No-oping the draw calls covers a surface that
renders again after the injection -- `/dev/ideacad`'s prepare drives 300 real
frames. Clearing the live buffer covers the other fourteen routes:
`Viewport.svelte`'s own header says "RENDER ON DEMAND. There is no animation
loop", so with `preserveDrawingBuffer` forced on, the frame drawn before the
injection is still sitting there, the patched draw calls never run, and the
control comes back green while proving nothing.

## What the instrument found, and none of it is fixed here

66 route/width runs over the 33 `/dev/ideacad*` specs, 1344 measurements, 187
outside threshold. 150 of those measurements are the new checks' and **75 are
outside threshold.**

1. **The 3D viewport is a zero-height canvas on all fifteen editor routes at
   both widths.** `912.0 x 0.0` and `359.0 x 0.0` on `/dev/ideacad*`;
   `444.5 x 0.0` and `295.0 x 0.0` on `/dev/ideacad-item*`. 30 of 30
   `canvas-content` readings short-circuit on it. The same element,
   `div.vp > canvas`, is also the zero-box row `layout-sanity` reports at 375.

2. **The model projects to 0.68 x 0.70 PIXELS**, and that is a second defect
   hiding behind the first. Propped to a real 912x429 pane and driven 300 frames
   through the real renderer, the canvas still reads 0.00% / 6 distinct colours,
   and the page's own probe answers `drawCalls 15, triangles 904,
   projected { width: 0.681, height: 0.702 }`. Pressing the surface's own **Fit**
   control takes the projection to `292 x 301` and the canvas to 19.09% / 11,110
   colours -- so the sub-pixel model is a consequence of the initial fit being
   computed against a zero-height pane, and this is ONE root cause rather than
   two.

3. **An existing verdict is vacuous while (1) holds, and reported `ok` over a
   0.68px model.** `the model fills the pane it was fitted to` compares
   `max(projected.w, projected.h) >= min(box.w, box.h) * 0.55`, and with
   `box.height` 0 the right-hand side is 0, so any projection passes. It is
   green at 1440 in the same run whose `the canvas fills the viewport pane`
   sits FAILED two lines above it. That is the bundle's own thesis arriving
   inside a check written to prevent it.

4. **Three pane-switcher buttons render at 0x0 at 1440** on all fifteen routes:
   `nav.mobile-switcher > button` reading "Features", "Graphics" and
   "Properties". They are RENDERED, not `display: none` -- so they are focusable,
   tabbable controls with no box at desktop width. At 375, where they are the
   real switcher, they are fine and thirteen other elements are correctly
   `display: none`.

5. **`p.view` ("Isometric") is 1x1 and clipped on all fifteen routes at both
   widths** -- 58x14 of text in a 1x1 box. `Viewport.svelte` declares `.view`
   TWICE in one stylesheet: the rule at line 634 is the visually-hidden idiom
   (`width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)`) and the one
   at line 667 sets `position/bottom/left/margin/font/color` and undoes none of
   it, so the later rule adds a place to sit and the earlier one keeps the box at
   1x1. Meanwhile the spec's `contrast [the current view name]` row measures it
   at **16.19:1** -- a contrast reading on text nobody can see. Found because the
   visually-hidden bucket is reported by name rather than skipped.

6. **The readouts rail is `visibility: hidden` at 375** on all fifteen routes,
   so `distinguishable` reports NOT BOTH VISIBLE for the label/value pair at that
   width. This is corroborated rather than novel: the spec's own pre-existing
   `presence [rule readouts...]` row already reads `present 7, visible 0` and
   already fails there. Two independent checks agreeing is the reading to trust.

7. **Zero findings for three of the four `layout-sanity` claims**, over stated
   populations: 0 elements outside the document, 0 overlapping the status bar
   (measured at `1438.0 x 28.0` and `373.0 x 28.0`), 0 genuinely-clipped text
   elements, across 23 to 40 interactive elements and 23 to 142 text elements per
   route.

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
- `--break blank-canvas` and `--break zero-box` cannot show a green-to-red
  transition on the IdeaCAD routes while findings 1 and 4 stand. The paragraph
  saying so in `tools/browser-verify/README.md` is worth deleting the day that
  stops being true.
