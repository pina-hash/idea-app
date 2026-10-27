---
title: "hx-kit: parts lay out by their own width, and the test looks at 125% zoom"
date: 2026-10-27
branches: ["main"]
migrations: []
subsystems: ["html-assignments"]
---

Mr. Pina, at 125% browser zoom on a 1440 laptop, saw IDEA-Blade 01's resource cards set one word per line. The page (hand-built, not on the kit) laid each card out as icon, words and Open key side by side, switching to a stack with a `@media` width; at 125% the page is 1152 CSS pixels, above the switch, while each card sat in one column of a two-column step and was about 330px wide, so the words got 118px.

What changed: every step column, stack, evidence section and tile is a size container (`container-type: inline-size`), so a part can switch layout with `@container` on its own width; `.hx-link-card` inside `.hx-links` is the kit's link card and stacks under 26rem. `test.mjs` adds 1152x720 to its widths and, at every width with every step shown and every disclosure open, FAILS any element whose own text is three or more words, narrower than 9 em of its own font and at least 2.6 lines tall. The check also caught the kit itself: plan pads at 375 (56px), the "That is not what I see" rows at 375 (100px) and the bar's location line at 960 (0px, pushed out by a long Still-to-do key). The plan stacks one phase per row under 640px, those rows read top to bottom under 520px, and the bar keeps at least 12rem for where you are above 760px.

Measured 2026-10-27: exported IDEA-Blade 01 FAILS at 1152 and 375; starter passes at 1440, 1152, 960, 375.

Not verified: real browser zoom (the check uses the equivalent CSS width), and the IDEA 100 pages, which their chat rebuilds.
