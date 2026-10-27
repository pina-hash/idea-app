---
title: "hx-kit: the assignment kit draws the live classroom's parts"
date: 2026-10-27
branches: ["main"]
migrations: []
subsystems: ["html-assignments"]
---

Mr. Pina said assignments looked "a little too vibe-coded, not professional enough" beside the site. A Chromium audit on 2026-10-26 (both themes, 1440) compared the kit's starter with `/dev/item-returned`, `/dev/classroom-student`, `/dev/themes-shape` and `/dev/html-progress`: the Plate parts in `kit/plate.css` matched live on radius, border, shadow, padding and type, and everything `kit.css` drew on top of them had no live counterpart (hue-washed day tiles with a 4px top stripe, 8px segment chips, a 44px step-number well, left stripes on examples, readouts and roles, colored status slabs, panels three deep, a cyan disclosure with no action word, flat table rules, a dashed picture box, a dark-trough textarea, body weight 500, a 1680px page).

What changed: `kit.css` was rewritten on the live recipes in `src/lib/classroom/plate.css` (pads from `.sec-tab`, the title bar from `.plate-title`, rows from `.group-card .row-wrap`, the display from `.grade-head`, the textarea rule, the upload zone) and `Progress.svelte` (`.hxp-bar`) and `Disclosure.svelte`. Nested `idea-panel`s inside a step are drawn as sections, so every existing source picks up the change on rebuild with no markup edit; `.hx-hero-text` and the step head's inner div use `display: contents` for the same reason. Nineteen tokens were added from the live Plate; the 2026-10-17 values were compared with main and none had drifted. The test's green probe counted a neutral key face (#2f3431) as green because it sits within 40 of the dark primary face (#2f4b2c); it now also requires the color to be green.

Measured 2026-10-27: starter 0 FAIL, Launcher: Design rebuilt 0 FAIL; at a 1240px page Launcher's step 7 measured 955px against the 830px pane, so the page cap is 1440px.

Not verified: the real `/hx` frame inside the deployed classroom (the stand-in host was used); the four other recent assignments, which their own chats rebuild. Deferred: the site-wide UI fixes, filed as site feedback 2026-10-27.
