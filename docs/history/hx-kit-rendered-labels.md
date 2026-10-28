---
title: "hx-kit: the test reads what the page says, and every thumbnail slot"
date: 2026-10-28
branches: ["main"]
migrations: []
subsystems: ["html-assignments"]
---

The FRC Classroom migration chat put three reading pages live whose checks read "Check yourself · not graded · counts toward your grade" for an hour: the author typed "not graded" and the kit's own `::after` added the rest, and the test never read text that styling adds. The test now reads each element's own text with its `::before` and `::after` content and FAILS a label carrying both phrases; the kit takes `data-graded="no"` on a section or on `<html>`. The same pass FAILS a unit inside a capitalized label (an all-caps chip turned µm into MM on a surface-finish spec); `.hx-keep-case` keeps it.

Thumbnails: nothing checked them, and that chat's first ones put unreadable text in the 56px banner. The test now bundles the real `thumbnailDocument` from `thumbnail.ts` and draws the template at the classroom's own slot sizes from `PostThumbnail.svelte` (48px and 34px tiles, 600 and 340 by 56 banners, a 320 by 180 card) in both schemes, failing text under 11px, outside the slot, or stacked three lines. It failed the kit's own starter first (12vh is 6.7px at 56px).

Also: each column's height printed on a step too tall; built pages stamped with `hx-kit` (last kit commit and date) and `hx-standard` meta tags for the site's kit-health list (lane 0458); `.gitignore` keeps built pages out of `assignment-sources/`. Ledger 0453 was taken twice on 2026-10-28; this chat's 2.15 entry moved to 0459.
