---
title: "hx-kit: four fixes from the FRC Training Library overhaul"
date: 2026-10-27
branches: ["main"]
migrations: []
subsystems: ["html-assignments"]
---

The FRC Classroom migration chat rebuilt Start Here and Track 1 on the 2.12 kit and reported four kit defects, each worked around in its pages.

- `color.mjs` `solve` measured contrast on the float color and shipped the rounded hex, so FIRST red's text on its fill read 4.50 and shipped at 4.49, under the 4.5 gate. Both the on-fill loop and the ink search now judge the `#rrggbb` that ships, and the on-fill target is 4.55.
- `.hx-step-body` was `repeat(auto-fit, minmax(380px, 1fr))`; a `.hx-full` child spans every track, which stops auto-fit collapsing the empty ones, so a two-stack step grew a third empty column from about 1180px. A track's minimum is now half the body (less the gap), so there are never more than two.
- The "That is not what I see" rows stacked under `@media (max-width: 520px)`; in a half-width column at 1440 they still squeezed. They stack under `@container (max-width: 34rem)` now, and `.hx-step` is a size container so the rule always has one.
- `test.mjs`'s camera check pressed the first picture box's Take photo key with that box inside a closed `details`, timed out and crashed the run. It now opens every disclosure around the box and its key first.

Not verified: the FRC pages themselves, which their chat rebuilds.
