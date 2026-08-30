---
title: "The pan/zoom engine is shared (`$lib/panzoom`, code-only; NO migration)"
date: 2026-08-19
branches: []
migrations: []
subsystems: ["GAUNTLET"]
record_order: 21
---

`DrawingViewer.svelte` carried the only real pan/zoom implementation in the app,
and a second room needed it. It is a module now: `$lib/panzoom/transform.ts`
(pure arithmetic) and `$lib/panzoom/controller.ts` (the DOM half). It sits
OUTSIDE `$lib/gauntlet` and imports nothing from any feature area, so a notebook
component can mount it without pulling GAUNTLET in with it.

- **WHAT MOVED is the transform engine and nothing else:** the fit-to-stage
  scale, the scale clamp, the pan clamp, `zoomAt`, the pointer-capture drag, the
  two-finger pinch, the wheel handler, and the ResizeObserver that re-frames on a
  stage resize. **WHAT STAYED** is every part of DrawingViewer that is
  GAUNTLET's: the minimap, the pdf.js path, the raster and inline-SVG paths, the
  focus-region jump chips, the CRT reveal, the controls, and every colour, class
  and style. **The markup and the style block are BYTE-IDENTICAL** to what they
  were (asserted by comparing everything after the closing script tag; 13,971
  bytes either side), and no feature was added to the engine that GAUNTLET did
  not already have.
- **THE SPLIT IS NOT COSMETIC.** The arithmetic is checked by a generated sweep
  of tens of thousands of geometries, and a sweep cannot run against code that
  needs a browser. So the arithmetic is callable with no DOM, and the controller
  is the thin part that binds it to a stage element and a world element.
- **The host owns the view.** The controller reads and writes through accessors
  (`PanZoomHost`) rather than holding state, so DrawingViewer's `$state` stays
  the one source of truth and everything derived from the transform -- the
  minimap, the zoom readout, the PDF re-render gate -- keeps tracking it.
- **Two invariants carried over and must survive any edit**: listeners are
  attached with `addEventListener`, never a delegated framework binding (a
  delegated handler registers on the main document's root, which a node MOVED
  into a Document PiP window cannot reach, so the viewer would go dead the
  moment it popped out); and the wheel listener is non-passive, since a passive
  listener cannot preventDefault and the page would scroll behind the zoom.
- **`zoomCentre` exists so the +/- controls and a wheel notch cannot drift into
  disagreeing about a bound** -- browser-verified byte-identical against a wheel
  event aimed at the exact stage centre.

### CHARACTERIZED BEFORE IT MOVED, which is the part that matters

`tests/fixtures/panzoom-golden.json` was recorded from the arithmetic AS IT
STOOD INSIDE `DrawingViewer.svelte`, before any of it moved. The baseline was
generated MECHANICALLY: a script pulled the literal expression and statement
text out of the .svelte source with regexes and spliced it into a runnable
module, so the record is the shipped code rather than a retyping of it (a
retyping would characterize what I believed the code did).
`tests/panzoom-cases.ts` is the shared case generator both the golden run and
the test import, so the two cannot drift. **A sweep written after a move only
proves the new code agrees with itself.**

- **32,955 cases, generated rather than hand-picked**: a full cross product of
  13 stage sizes against 13 content sizes, and per pair the scalars, the fit
  transform, ten clamp probes, six pan-clamp states, zoom at each stage corner
  AND the exact centre at four factors, five pan deltas, and four resizes.
  Degenerate rows are deliberate -- a zero stage, a zero content, content
  SMALLER than the stage, content exactly ONE PIXEL wider than the stage, aspect
  ratios nothing like the stage's, and scales sitting exactly on each clamp
  bound. All 32,955 reproduce value for value.
- **MUTATION-CHECKED FOURTEEN WAYS, all caught**: the fit margin, both maxScale
  terms, the pan clamp's min/max, an uncentred fit, an unclamped pan, the zoom's
  no-op early return, the zoom anchor's sign, the resize's re-clamp, the
  resize's pan clamp, the resize's zero-stage guard, and the fit's ready guard.
  Module restored byte-identical each time.
- **ONE MUTANT SURVIVES AND IS PROVABLY EQUIVALENT**, recorded so nobody
  re-chases it: flipping the pan clamp's `ow <= stage.w` to `<` changes nothing,
  because at exact equality the centred branch gives `(W - ow) / 2 === 0` and
  the edge-lock branch gives `Math.min(0, Math.max(0, tx))`, which is 0 for
  every tx. The sweep DOES reach that boundary -- 312 cases sit at a scale that
  fills one axis exactly, added specifically because the 0.92 fit margin means
  no fitted view ever lands there.

### Then operability, by simulated input rather than by geometry

Driven through `/dev/viewer` (no session needed) at **1440x900 and 375x812**,
with every gesture dispatched as a real event and every expectation computed
independently from the documented contract:

- **Wheel, both directions**: prevented every time (so the non-passive listener
  survived), zoom in and back out symmetric and returning EXACTLY to the fit
  scale, the world point under the cursor held throughout, and no side effect --
  world box, stage box, page/region/canvas counts, page scroll, the controls,
  and the harness's SECOND viewer all unchanged.
- **Drag of a known distance**: -40,-25 then -60,-35 landed as exactly -40,-25
  and -60,-35, total -100,-60, scale untouched, a stray `pointermove` after
  `pointerup` ignored. Dragged far past the edges it edge-locks exactly (0,0 one
  way, the computed far edge the other) and never leaves a gap. On an axis the
  content does NOT overflow, the drag correctly does nothing, because that axis
  is centre-pinned.
- **Two-finger pinch**: two pointers down is inert; spreading 200px to 300px
  scaled by exactly 1.5 about the midpoint and matched the independently
  computed transform to the CSS string's own precision; pinching back returned
  to the starting scale; lifting one finger caused NO jump and handed the drag
  back to the remaining pointer, which then moved exactly -30,-20.
- Residual differences are at the rendered transform's own SIX-SIGNIFICANT-FIGURE
  precision (scale ~6e-7, translate ~6e-4), which is the read precision of
  `style.transform`, not a behaviour difference.
- **All three content kinds** re-verified: raster (2520x1720 with its paper pad),
  inline SVG (840x560), and the two-page PDF (792x1245.42) each fit exactly and
  centre on both axes, `+` zooms, `Fit` restores exactly, the readout reads
  100%, and a focus-region jump chip still moves the view. Zero console errors
  and zero trapped window errors throughout.
- **The ResizeObserver path could not be delivered by the preview pane** (a
  probe confirmed RO never fires there, because delivery rides the rendering
  steps and rAF is frozen in a hidden tab -- equally true before this change),
  and no real Chrome was connected. So it was driven DIRECTLY instead: the
  `ResizeObserver` constructor was patched to capture the controller's own
  callback, the stage element was genuinely resized, and the callback invoked.
  It re-measures the stage, holds the world point under the stage centre,
  matches the pure `resizeView` byte for byte, re-clamps the scale when a grown
  or shrunk stage moves the fit, re-measures WITHOUT touching the view when the
  host has not fitted yet, and on teardown disconnects the observer and leaves
  the view frozen against further wheel and pointer events.

### The second controller in popout.ts stays where it is

`src/lib/gauntlet/popout.ts` carries a smaller pan/zoom controller inside
`drawingWindowHtml()`. **It should NOT move onto the extracted engine**, for
three reasons rather than by omission:

1. **It cannot import anything.** That window is deliberately detached -- an
   empty `window.open` plus `document.write`, "fully detached and needs nothing
   from the opener". There is no module graph in it. Using the engine there
   means either serializing the module into the string at build time (so what
   ships stops being the module the tests and the type-checker see) or pointing
   a script tag back at the app origin, which re-couples the window to the
   opener and defeats the tier's whole purpose.
2. **Its behaviour is deliberately different**, and matching the engine would
   CHANGE it: absolute clamps of 0.2x-10x rather than fit-relative bounds, a
   0.94 fit margin rather than 0.92, NO pan clamp at all (the sheet may be
   pushed off-screen), and no pinch. Reproducing those through the engine would
   mean adding an absolute-clamp mode and an optional pan clamp -- features
   GAUNTLET does not have and does not need.
3. **The tier that matters already runs the real engine.** Document PiP -- the
   primary target, and the one the school's Chrome supports -- MOVES the live
   viewer node, so it carries the extracted engine with it untouched. The
   `window.open` HTML is the fallback for browsers without that API, and is
   minimal on purpose.

The honest cost is that it remains a second implementation that could drift. If
it ever needs to match GAUNTLET's feel, the right fix is to point that fallback
window at a real drawing-only app route so it uses the engine by construction --
a product change, not a refactor.

