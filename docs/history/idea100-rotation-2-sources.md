---
title: "IDEA100 Rotation 2 sources committed under 2.14"
date: 2026-10-28
branches: ["main"]
migrations: []
subsystems: ["html-assignments"]
---

Two IDEA100 Section 2 sources go to `assignment-sources/idea100/`: the Rotation 2 Survey (rebuilt 2026-10-27 evening as seven required answers plus optional ratings, published that night) and IDEA-Blade 02 - Build and Fight (the 2.11 look overhaul, re-uploaded 2026-10-27). IDEA-Blade 01 - Design is a hand-built page from before the kit, so it has no `.src.html`; its live page is its only source.

Measured 2026-10-28: the survey's source, built with `tools/hx-kit/build.mjs` on today's kit, matches the live page at `/hx/0df05155-...` byte for byte. IDEA-Blade 02's source built today differs from its live page only in kit code added by 2.12 to 2.14 (container sizing, link cards, the two-column cap, the phone plan rows); the page text and manifest are unchanged.

Found while checking: IDEA-Blade 02 passed the 2.11 test with no FAIL on 2026-10-27, and fails two lines of the 2.14 test, live and rebuilt alike: 16px of sideways scroll at 375px, and its "fix" table (`.hx-table`, four columns, first column `nowrap`) squeezes cells to 71px at 375px. Not re-uploaded: the post is due 2026-10-28 and the defect is phone-width only.

Not verified: that the live pages still match after this commit. Library C holds the survey's v2 files from 2026-10-27; the generator (`gen.py`) that writes the survey source lives only there.
