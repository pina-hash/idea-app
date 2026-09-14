---
title: "IdeaCAD body profiles become direct-manipulation sketches"
date: 2026-09-14
branches: ["codex/ideacad-profile-editor-0250"]
migrations: []
subsystems: ["IdeaCAD"]
---

Body Revolve no longer presents one numeric row and two structural buttons for every
station. Its PropertyManager now gives the sketch nearly the full pane width, labels the
axis of revolution and radius direction in the drawing, and makes every station a large
drag handle. The selected handle alone exposes r and z fields for precise entry.

The pure profile interaction layer converts screen deltas into the existing inch-valued
r/z coordinates. It clamps radius at zero, clamps each height between its neighbours with
a 0.005-inch strictness gap, and keeps the first station's configured tip height fixed.
Crossing a bound holds the handle at that bound and names the active limit beside the
sketch. Pointer movement writes through the existing draft callback on every event, so
both the sketch and the existing 3D evaluation update live; pointer-up commits without an
Accept action, while Escape restores the drag-start station list.

Clicking the wide invisible hit target over a segment inserts at the click's projected
position between that segment's two neighbours. Keyboard users can focus that target and
insert at its midpoint. Delete removes the selected station until the existing three-point
floor; the pure helpers also refuse insertion at eight. The old table and its per-row plus
and minus controls are deleted rather than retained as an alternate path.

The focused pure and mounted test run reported 38 passed and 3 failed. The three failures
are pre-existing assertions from the zero-instruction bundle: they still demand double
click to edit and standing explanatory prose that the current FeatureManager deliberately
removed. The new profile arithmetic's five tests all passed, and the updated mounted
checks prove the table absent, four handles present, one selected r/z pair present, and
the drawing changes when that pair changes.

The full runner reported 9,098 passed, 14 failed, and 15 skipped across 480 files. Three
failures are the same stale IdeaCAD assertions above; ten are the environment's missing
`psql` executable/live-probe cascade; one is the pre-existing missing 0215 applied-record
entry. None exercises the new profile helpers or updated sketch assertions.

The browser launch was attempted twice after installing the Playwright-recommended host
dependencies. Chromium still refused to launch because this container's package indexes
do not contain the requested libraries (`libatk-1.0.so.0` remains absent). Therefore the
1440px raster, the visual result after dragging, actual pane dimensions, and the live 3D
frame during that drag could not be visually verified. The unverified visual decisions are
the sketch's 280px minimum height and 48vh cap, copper dashed axis and labels, green
three-pixel silhouette, nine-pixel outlined handles, selected-handle fill, and responsive
two-column precision field layout.
