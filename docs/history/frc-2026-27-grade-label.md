---
title: "FRC 2026/27: the three ungraded pages stop saying they count toward the grade"
date: 2026-10-28
branches: ["main"]
migrations: []
subsystems: ["html-assignments"]
---

Shop Safety, The Shop Trophy and Important Links have no post points, so every check on them is ungraded and each eyebrow was written "Check yourself · not graded". The kit appends " · counts toward your grade" to every `.hx-evidence > .idea-eyebrow` through `::after` (`tools/hx-kit/kit/kit.css`), so for about an hour the live pages read "Check yourself · not graded · counts toward your grade". It was found while writing up notes for the authoring standard, by reading the computed `::after` content in Chromium. The test does not catch it, because it never reads pseudo-element text.

Fix: the eyebrow is "Check yourself" with class `rf-ungraded`, and the page's own rule sets that eyebrow's `::after` to " · not graded". All three were replaced with every block kept, none dropped and none added. The sources here were updated to match, and each still rebuilds byte for byte to the uploaded page.

Left for the kit: it has no way to mark an evidence panel as ungraded. A page-level override is the stopgap.
