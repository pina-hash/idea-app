---
title: "IdeaCAD's 3D viewport, built"
date: "2026-09-12"
branches: ["claude/keen-pasteur-40dx0m"]
migrations: []
subsystems: ["IdeaCAD", "Classroom", "Testing"]
---

Ledger 0160 audited IdeaCAD's visual surface and found the half the tests could not
see: `geometry.ts` builds real three.js `LatheGeometry` and `ExtrudeGeometry` from
the feature tree and had **zero importers anywhere in the tree**;
`viewport/controls-math.ts` had none outside its own test; `config.ts` had none at
all, not even a test. There was no canvas, no `WebGLRenderer`, no camera and no
controls. What sat where the graphics area belongs was three CSS divs -- an ellipse
and two bars under a `rotateX(58deg)`. 0145's own report described a viewport with a
toolbar and rule readouts; that was not true of the tree, and 0160's measurements
govern. This bundle is the renderer those modules were written for.

## What was built

Three files, and the division between them is the point.

- **`viewport/camera-rig.ts`** is the one statement of how a `CameraState` becomes a
  three.js camera, and the reading is **forced rather than chosen**.
  `zoomOrthoAboutCursor`'s own test pins
  `(cursorX - width / 2) / orthoZoom + rotationCenter.x` as invariant, which makes
  `orthoZoom` PIXELS PER WORLD UNIT and `rotationCenter.x/y` a pan offset along the
  camera's own right and up axes rather than a world point. A rig that read either
  differently would render a plausible model and zoom to the wrong place with
  nothing on screen to say so.
- **`viewport/controls.ts`** is the DOM half of PART 4 over that module: middle-drag
  free arcball, Ctrl pan, Shift zoom (up is in), Alt roll, wheel zoom about the
  cursor at 1.25 a notch, F / Z / Shift+Z / Ctrl+Shift+Z, the arrow increments, and
  Ctrl+1 to Ctrl+7 for the seven standard views, plus one-finger touch rotate and
  pinch. It owns no arithmetic beyond composing `controls-math.ts`'s own helpers.
  **Not OrbitControls**, for PART 4's reason rather than for availability: the addon
  file does exist at `three/examples/jsm/controls/OrbitControls.js` in the pinned
  build (only the main entry lacks the export), and it is refused because a
  turntable is not an arcball and a student feels the difference in the first
  second.
- **`viewport/Viewport.svelte`** is the renderer. `three` and `geometry.ts` are
  imported dynamically inside `onMount`, **after** the WebGL context test, so a
  machine that cannot use a renderer does not pay to download one. The frustum is
  the canvas in PIXELS, which is what makes `camera.zoom` literally pixels per world
  unit and the invariant above hold against the real camera rather than
  approximately. Shaded-with-edges under a plain key/fill/rim rig with no
  environment map, one material per role shared across every blade instance, a
  `ResizeObserver`, and **render on demand with no animation loop** -- an idle
  viewport issues no frames at all, which is what makes a frame measurement during a
  drag mean anything.

`BladeEditor` mounts it in place of the three divs and wires the five heads-up
controls, which had no handlers. `config.ts` gets its first importer: the editor
puts an incoming config through `bladeConfigShaped` at the component boundary and
**names** an unusable one on the rail rather than swapping it silently.

## Four defects found by rasterizing and looking, after every threshold passed

This is the whole lesson of the bundle, and it is 0160's lesson repeated: every one
of these was found with the verdict list entirely green.

- **The rotation arrow was inside the fit bounding sphere.** It is an annotation
  about the part, not part of the part, so Zoom to Fit was sizing the pane to an
  arrow: radius 3.519 against the model's own 2.198.
- **And the bound itself came from `Box3.getBoundingSphere`**, which returns the
  sphere through the box's CORNERS. For a part shaped like this one -- a squat
  cylinder, wider than it is tall -- that is a diagonal nothing occupies: 3.404
  against a true 2.198, and a fitted model filling **28.7% of the pane's width**
  where it should fill 80.3% of its height. Measured off a rasterization, masking
  the DOM overlays painted on top of the canvas; the model's own pixels went from
  51,649 to 123,016 on the fix.
- **A `cw` document drew a counter-clockwise arrow.**
  `docs/prompts/0145-ideacad.md` line 356 defines the field as
  `rotation: 'cw' | 'ccw'  // viewed from above`, and the Top view is the one that
  shows it. The arrowhead was also at a mirrored coordinate rather than on the arc's
  end. The direction is now `spinArrowTurn`, a pure function with the spec's own
  sentence beside it, and it is **a half turn and never a negative scale**: a mirror
  reverses the winding of every face with it, so the arrow would have started
  culling itself for exactly one of the two documents.
- **`PreviousViewStack.push` deep-copies with `structuredClone`, which refuses a
  Svelte `$state` proxy.** That call is the FIRST statement of `pointerdown`, so the
  throw aborted the handler before the drag was armed and **the entire control map
  went silent** -- no rotation, no Previous, no standard view -- with nothing on
  screen to say why. It surfaced as three unrelated symptoms (a 300-frame drag that
  recorded 0 frames, a Top that stayed Isometric, a Previous that did nothing) and
  took a page error to join them up.
  - `controls-math.ts` is right and was not changed: `structuredClone` is correct for
    the plain object its own type describes, and handing it one is the viewport's
    job (`$state.snapshot`). What `controls.ts` gained is a second layer -- going
    back a view is a convenience, and a convenience must never be able to abort the
    feature it sits in front of. `setPointerCapture` is guarded for the same reason:
    it throws for a pointer the element is not tracking, and capture improves a drag
    rather than being a precondition for one.

## A fifth defect, found by re-reading the diff rather than by any instrument

`untrack(() => fn)?.(args)` untracks the LOOKUP and leaves the CALL tracked, and it
looks exactly like the correct thing. `CLAUDE.md`'s rule is "track the inputs, untrack
the call", and the call means the invocation -- written the other way round, everything
the callee touches joins the effect's dependency set. Both of this viewport's effects
shipped that shape, and on the rebuild effect it was a real defect: `build()` reads the
`rotation` prop and ends in `paint()`, which reads `cam` and `style` through its own
defaults, so **once an evaluation change armed the effect, every camera write during a
drag re-triggered a full geometry rebuild**.

**No measurement in this bundle caught it, and none could have**, which is the part
worth keeping: the harness fixture never changes the feature tree, so the effect never
re-ran with `rebuild` set. Neither did the frame numbers once it was looked for --
1148 triangles rebuild fast enough that the render p95 and the presented cadence were
identical with and without the fix at 375.

**The instrument that did work was counting GL buffer allocations**, with
`createBuffer` patched before the renderer existed: a rebuild allocates fresh buffers
and reusing geometry allocates none. It also needed the right lever, and the first one
was wrong -- **Accept does not change `draft`** (it copies draft into accepted and
leaves draft alone), so nothing rebuilt and the first reading was a clean 0 either way.
Switching concepts is what replaces `draft`:

| | concept switch | the 30-frame drag after it |
|---|---|---|
| with the fix | 22 buffers | **0** |
| as shipped | 22 buffers | **594** (19.8 per frame) |

`tests/ideacad-viewport-effect-untrack.test.ts` is the guard, and it is a STATIC one on
purpose: `tests/dom/` has no WebGL so nothing there can see a rebuild, and
`tests/classroom-composer-effect-reactivity.test.ts` cannot see this at all -- it sweeps
for calls to CALLER-SUPPLIED code, and `rebuild` and `apply` are local variables. Its
own first run found a hit inside the fix's comment, which quotes the broken shape to
explain it, so the sweep strips comments (with both directions asserted, since a
stripper that removed everything would make every absence pass). Reverting the shape
reddens 2 of its 5.

## What was measured

Chromium 141.0.7390.37 at `/opt/pw-browsers`, Vite on 5199.
**WebGL2 is available under the harness's OWN launch args** -- measured, not assumed:
`--disable-gpu` with no swiftshader flag still yields a context through ANGLE's
SwiftShader device, so no launch change was needed and `tools/browser-verify/browser.mjs`
was not touched.

| | 375 x 812 | 1024 x 768 | 1440 x 900 |
|---|---|---|---|
| viewport pane | 373 x 360 | 442 x 535.3 | 858 x 559.3 |
| canvas, CSS px | 373 x 360 | 442 x 535.3 | 858 x 559.3 |
| backing store | 559 x 540 | 663 x 802 | 1287 x 838 |
| device pixel ratio | 1.499 | 1.5 | 1.5 |
| fitted `orthoZoom` | 70.44 | -- | 109.38 |
| draw calls / triangles | 14 / 1148 | 14 / 1148 | 14 / 1148 |

The canvas matches its pane to within a pixel at every width, and the model renders:
**123,016 non-ground pixels** at 1440, a projected extent of 382 x 449 in an
858 x 559.3 pane. The rasterization is the instrument, and the first attempt at it
was vacuous in a way worth writing down: **reading the GL buffer back with
`readPixels` after the frame has been presented returns garbage**, and without
`preserveDrawingBuffer` it scored **100% coverage** -- every pixel "lit" because an
undefined buffer differs from the ground. The tell was the 100%. The real instrument
is a screenshot decoded through a 2D canvas, with the DOM overlays (the toolbar, the
Accept pair, the triad, the view name) masked out, because an element screenshot
includes whatever paints on top of it.

### Frame time, against PART 4's budget

PART 4 asks for 60 fps and "measure frame time in the harness and report the p95 for
a 300-frame drag" -- 16.667 ms. Ledger 0160 could not take it because there was
nothing to drag. The drag is real: `pointerdown`, 300 `pointermove`s around a circle
through the real `SolidWorksControls`, one rendered frame awaited per move, then the
view put back through the real Previous control so every layout verdict after it is
taken at the pose the page opened on.

**Two clocks, because one of them answers the wrong question.**

| | 375 | 1024 | 1440 |
|---|---|---|---|
| `renderer.render()` p95 | 0.4 ms | 0.4 ms | **0.5 ms** |
| presented interval p95 | 16.8 ms | 16.7 ms | 33.4 ms |
| host idle interval p95 | 16.7 ms | 16.7 ms | 16.7 ms |

**The render p95 is 0.5 ms against a 16.667 ms budget, and that is the number this
repository answers for.** It is the CPU cost of issuing a frame; the driver has not
rasterised and the compositor has not presented when it returns.

The presented cadence is the host's, and the idle control is what makes it readable:
**this container has no GPU and Chromium falls back to SwiftShader, a software
rasteriser.** The host ticks at 16.7 ms when the viewport is idle -- it renders on
demand, so an idle viewport issues no frames at all -- and the drag holds that at 375
and 1024 and drops to every other frame at 1440. The discriminator is fill rate, not
scene cost: the render CPU is flat at 0.4 ms across all three while the backing store
grows 302K -> 532K -> 1.08M pixels, and the crossing sits between half a million and a
million. **On a GPU, 1148 triangles and 14 draw calls at a million pixels is not a
frame budget problem**, but this container cannot demonstrate that, so the presented
numbers are reported beside their control and **never thresholded** -- holding a
software rasteriser to 60 fps would redden the harness for the machine it runs on
rather than for anything in the repository.

### The suite, and the harness

The one full-pass `verify:readme` at the end, on the clean committed tree at `2d57351`:
**388 route/width runs, 6802 measurements, 0 outside threshold**, 1028.5s -- the whole
harness, not just this bundle's three specs. (0160's was 388 / 6790 at `51a1c98`; the
twelve new measurements are this bundle's.)

`tools/browser-verify/routes/ideacad.mjs` gained eight geometry verdicts, a canvas
presence check, the no-WebGL notice as an absence with the canvas as its positive
control, and the frame-drag block. The triad is an SVG overlay now and paints
`currentColor` so a contrast reading -- which asks an element for its `color` -- gets
the colour on screen: **5.37:1** for the crimson X axis over the viewport ground, and
16.19:1 for the view name.

Four new test files: `tests/ideacad-viewport-rig.test.ts` (34), the first test
`config.ts` has ever had in `tests/ideacad-viewport-config.test.ts` (14),
`tests/dom/ideacad-viewport-controls-mount.test.ts` (20) and
`tests/dom/ideacad-viewport-mount.test.ts` (12). The central one is **cross-module**:
a state goes through the real `zoomOrthoAboutCursor` and `worldUnderCursor` must
answer identically before and after, with a different pixel as the positive control
so the property cannot pass by ignoring the zoom. No width, ratio or tap target is
asserted in `tests/dom/` -- happy-dom has no layout engine and all three read zero.

Mutation proof, every file copied first and restored FROM THAT COPY, all md5-identical
afterwards, positive controls green (20 / 12 / 34):

| mutant | reddened |
|---|---|
| `pushPrevious` throws again, as shipped | 1 of 20 |
| the config guard always passes | 1 of 12 |
| the arrow turn inverted, as shipped | 2 of 34 |
| `rotationCenter` read as a world point rather than a camera-axis pan | 5 of 34 |
| the canvas replaced by the old CSS divs | 2 of 12 |

And against the browser harness, 120 measurements per run:

| mutant | reddened |
|---|---|
| the renderer stops matching the canvas to the pane | 2 of 120 |
| the `$state` proxy handed over again **and** `pushPrevious` unguarded | 4 of 120 |
| the fit taken from the box corners again | 2 of 120 |

**The proxy mutant needed BOTH layers opened**, which is the point of having two: with
only the viewport's snapshot reverted, the guard in `controls.ts` catches it and
nothing reddens, correctly. **And one browser check was weak and the mutation proof is
what said so.** "The model is inside the pane at the zoom it fits to" was written on
`radius * 2 * orthoZoom` -- but the fit DERIVES the zoom from the radius, so that
product is invariant under a wrong radius, and inflating the radius 2.2x moved nothing.
It now asks the geometry: a `projected()` probe walks the real mesh vertices through
the real camera and the verdict is that the model USES the room it was fitted to.

## Not verified, and why

- **No GPU anywhere in this container.** Every frame number above is a software
  rasteriser. The claim that the presented cadence at 1440 is fill rate rather than
  scene cost rests on the three-width curve with the render CPU flat, not on a
  reading from a real GPU. **The school's desktops are the budget this subsystem is
  written against and none was available**, so the p95 that matters to Mr. Pina is
  still to be taken on a lab machine.
- **Nothing signed in.** The harness covers `/dev` routes only. The real classroom
  item page needs a Bosco Tech Google session no automated run holds, so whether a
  student with a schema-4 item reaches this viewport is untested here.
- **No production database.** `0201`'s and `0202`'s RPCs are called by nothing in
  this bundle.
- **Web fonts do not load** under the harness (`fonts.googleapis.com` is blocked), so
  every contrast figure is measured in the fallback stack.
- **`prefers-reduced-motion` is `no-preference`** in the harness. The viewport has no
  animation loop at all, so there is nothing to gate, but the 250 ms eased view
  transition PART 4 asks for is **not built** -- a standard view snaps.
- **The SolidWorks control map is not finished**, and the gaps are named rather than
  implied: no selection or hover pre-highlight, so left-click and right-drag do
  nothing; no middle-click rotate-about-geometry (it needs the raycast the selection
  layer will bring); no View Selector cube, no Normal To, no mouse gestures, no
  dimension overlay. **Rotate is middle-drag only**, which is SolidWorks' own binding
  and is worth flagging: a school laptop with no middle button cannot rotate with a
  mouse today, and inventing a left-drag binding now would have to be taken away the
  day selection lands. That is a decision for Mr. Pina, not a defect to patch.

## Reported to other lanes, not fixed here

- **`classroom-updates.json` is NOT in this bundle's owned surface and was not
  touched**, deliberately: three ledgers ran in parallel with this one and
  `CLAUDE.md` names that file as this repository's most reliable conflict. But a
  schema-4 item's editor now shows a real 3D model where it showed three CSS divs,
  which is student-visible, so the standing directive is owed an entry. Suggested
  text, for whoever owns the file next: *"The Blade editor now shows your design in
  real 3D. Drag with the middle mouse button to spin it, scroll to zoom, and press F
  to fit it back in the window."*
- **`CLAUDE.md`'s verification baseline still says 0 errors and 37 warnings.**
  Measured on `origin/integration` at this branch's point (`ebf23dcd`, which already
  carries 0160's merge) with the two `$env/static/public` values exported: **0 errors,
  38 warnings in 21 files** -- 32 `state_referenced_locally`, 5 `css_unused_selector`,
  1 `perf_avoid_nested_class`. That is exactly what 0160's entry predicted it would
  settle to after its merge, and it is what this bundle ends on. `CLAUDE.md` is not
  this bundle's surface, so the line is reported rather than corrected. Note also that
  ledger 0167's prompt cited 40 in 22 files, which was the pre-0160-merge reading.
- **One a11y warning is suppressed, with its reason written beside it.**
  `a11y_no_noninteractive_tabindex` on the viewport pane: the role is `application`
  because the pane owns its whole key map and a screen reader must hand keystrokes to
  it, and a focusable widget keyboard users cannot reach is the worse answer.
