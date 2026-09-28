---
title: "Ledger 0344: classroom shape language round 3, Plate v3: Sci-Fi Line's composite edges, pads, glow, broken ticked ring, progress ring and display in IDEA, Matrix and Space White, with redesigned chips and no grids, mocked up on /dev/themes-shape (`claude/new-session-nudymu`, no migration)"
date: 2026-09-28
branches: [claude/new-session-nudymu]
migrations: []
subsystems: ["IDEA Classroom", "Browser harness", "Documentation"]
---

A proposal for Mr. Pina, not a change: nothing outside `/dev` renders differently. The full
write-up, with every table and both independent reviews, is
`docs/feedback/2026-09-25/overnight/shapes-v3.md`; this entry is what changed in the tree, why,
and what is left.

**What changed.** `/dev/themes-shape` opens on a new default view, Plate v3: the same real
classroom components as round 2 (`ClassView`, `ClassroomShell`, `ReturnedGrade`, the real `.btn`,
`.card`, chips and `.cr-select`) in before-and-after pairs, the after column inside `.p3-after`,
the one wrapper `plate-v3.css` keys on. New files: `plate-v3.css` (the proposal),
`PlateV3View.svelte` (the specimens, a corner study, a six-card composed region),
`P3Ring.svelte` (the progress ring, inline SVG over real text) and `plate-fixtures.ts` (round 2's
fixtures, moved out of `PlateView.svelte` so both views share them, plus a six-card week). The
page gained a label-face toggle (A Share Tech Mono, B VT323, self-hosted from
`@fontsource/vt323`). Round 2's `plate.css` lost its readout grid (`--pl-display-grid`), so no view
on the page draws a grid.

**The load-bearing decisions.**

- The one rule is kept by construction and tightened: every length once, on `.p3-after`, with
  only viewport-driven lengths in a 480px block; theme blocks hold colours only, shadows
  included, so a bloom one theme does not want is a transparent colour rather than a missing
  shadow. The box diff proves it (0 of 1236 elements differ), and a planted length proves the
  diff can see a difference.
- The composite edge is a tube, not a stack of outlines: the hairline is the border and the only
  dark line, with a transition ring and highlight inside it and a faint dark tray outside, as the
  kit's pixels show (the first reviewer's "light halo outside" was checked against the kit and
  was wrong). On the dark themes the hairline is a gradient, lit at the top and AT the 3:1 floor
  at the foot, drawn as a transparent border over a border-box layer.
- Every control, card, housing, menu and plate is a rounded rectangle; the chamfer survives only
  where C2 puts it, at `superellipse(0.25)` on large shapes.
- Every gradient face declares its WORST stop as `background-color`, so the harness's contrast
  walk measures a face's floor rather than walking past it.
- Hatches are SVG masks over a colour token (antialiased, whole bars via `round()`, the far end
  cut on the bars' own slant), not stripe fills.

**The instruments, and two defects in them this bundle found in its own work.** The Plate spec's
grid sweep matched computed `background-image` with a regular expression that stopped at the
first `)`, so its planted control grid was never detected; it is rewritten layer by layer and
now also catches Matrix's scan-line layer when un-hidden. The pixel script's box reader added the
scroll offset to boxless (hidden) elements, which diffed 36 controls by 1090px whenever one
theme's menus needed a retry; it now reads from the top and records boxless as boxless. The
pixel script also gained a real-ground reading of the ring's readout (the spec's walk cannot see
SVG paint) and a paint-cost trace. The spec's expectations were updated to the new corners and
to the collapsed corner study.

**A bug in the proposal the first review found.** A blanket `fill: none` on the ring's circles
outranked the disc's and face's `fill="url(...)"` attributes (a stylesheet beats a presentation
attribute), so the ring's disc was never painted; each stroke-only circle now says `fill: none`
by class, and a comment says why.

**Measured.** `verify:browser` on the three Plate specs, 375 and 1440, monitor and projector: 828
measurements, 0 outside threshold. Worst text contrast in an after column: the Space White
display readout, 4.68:1 (3.35:1 on the wall). Box diff: 0 differing at both widths, with face A
and with face B. Chips no wider than today's with the same word, all five. Focus ring drawn in
full on every after control, the class pad included (61% today, clipped by its strip).
`svelte-check`: 0 errors, 37 warnings in 20 files (31/5/1), unchanged.

**Not verified.** Safari (no WebKit here; `corner-shape` is Chromium-only and falls back to plain
radii), a real projector and a school desktop's GPU (the paint figures are a headless software
renderer), and the reduced-motion path (read, not driven).

**Left.** The display screen's edge is one hairline where the kit ramps over four pixels (noted
in the band table, not changed after the final measurement). The phone header's class strip is
narrower than one pad, in today's column as well; that is the header's layout, not this
proposal's. Round 2 committed four paid Sci-Fi Line images to `docs/reference/space-white/`,
outside this bundle's ownership; question 3 in the note asks to remove them from the tree.
