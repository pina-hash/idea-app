---
title: "Ledger 0341: classroom shape language round 2, Plate: one sci-fi geometry for IDEA, Matrix and Space White after the Sci-Fi Line references with green for orange, mocked up on /dev/themes-shape with a cross-theme box diff (`claude/new-session-1om559`, no migration)"
date: 2026-09-27
branches: [claude/new-session-1om559]
migrations: []
subsystems: ["IDEA Classroom", "Browser harness", "Documentation"]
---

A proposal for Mr. Pina, not a change: nothing outside `/dev` renders differently. The full
write-up, with every table, is `docs/feedback/2026-09-25/overnight/shapes-v2.md`; this entry is
what changed in the tree, why, and what is left.

## What changed

- `/dev/themes-shape` gained a third view, **Plate**, now the default, plus a theme switcher for
  all three site themes. Round 1's two-corner and four-corner views are kept (`?view=two`,
  `?view=four`, and round 1's `?cut=four` still lands on its view).
- `src/routes/dev/themes-shape/plate.css` is the proposal: one block of shared lengths (cuts,
  label floor, marks, decoration bands), one block of colours and shadows per theme, and rules
  that name no theme. `PlateView.svelte` holds the specimens, each written once and rendered in
  a before and an after column, on the real `.btn`, `.card`, chips, `.cr-select`, `ClassView`,
  `ClassroomShell` (header and class menu) and `ReturnedGrade` (the dark inset display).
- Three route specs, one per theme, fed by one factory (`routes/_themes-shape-plate.mjs`), and a
  hand-run pixel script (`routes/_themes-shape-plate-pixels.mjs`) for what a spec cannot see: the
  cross-theme box diff, focus rings along the cuts, borders along the cuts, press tests and the
  screenshots.
- Round 1's spec was renamed to `themes-shape-state-space-white-view-two.mjs` (path
  `&view=two`) and its measurement file with it, because Plate became the default view; it
  measures exactly what it measured before, 160 measurements, 0 outside.
- `_themes-shape-pixels.mjs` (round 1) now exports its pixel helpers and runs only when invoked,
  so the new script imports them instead of copying them. Its cut reader took the darkest pixel
  as the line, which reads the ground back at 1.00:1 on a dark theme; it now takes the pixel
  furthest from the ground, which on a light ground is the same pixel, so round 1's figures do
  not move.
- The ten reference images are committed under `docs/reference/space-white/`.

## Decisions and why

- **Lengths once, colours per theme, and a measurement rather than an argument.** 174 control
  boxes and 1016 element boxes, 0 differing, max delta 0.00px, Matrix and Space White against
  IDEA, at 1440 and 375.
- **No token moved.** Every floor held with the three palettes as they are; the new values are
  literals for grounds the token set has no name for (well, display, raised face).
- **Outlines kept, titles kept in the reading face**, both departures from the reference, both
  for a floor or a house rule (load-bearing boundaries at 3:1; sentence case for content).
- **The logo link gets 44px in the after column.** Measured today at 56x26.3 at 375 in every
  theme; a real target under 44 on the live classroom header, fixed only in the mockup.
- **The 11px mono label floor** is set on every label class the sweep found under it (69 of 108
  labels on this page today); the list row's meta line needed 0.04em tracking to stop wrapping
  every fact onto its own line at 375.

## Measured

`verify:browser`: 242 measurements per theme, 726 in all, 0 outside threshold; round 1's 160,
0 outside. Tightest after figure: the open list row's title on the wall in IDEA, 4.65:1 against
4.5. Borders along the cuts: 3.73 to 4.36:1 on a monitor, 2.46 to 3.26 on the wall (floors 3.0
and 2.0). Focus rings drawn in full along every cut (101 to 103%). No after control under 44px
in any theme at either width; no horizontal scroll. svelte-check 0 errors, 37 warnings in 20
files (31/5/1), the baseline.

## Not verified, and left

No projector, no school desktop, no GPU, no Safari or Firefox (no `corner-shape` there; the
`@supports` fallback is reasoned). Hover not measured. The big ring knob as a circular readout
was allowed and not built. The class strip clips the focus ring on class icons today (61%);
not this bundle's. Adoption is a move of the three blocks, described in shapes-v2.md, and waits
on Mr. Pina's answer to its three questions.
