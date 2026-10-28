---
title: "Rotation Survey rebuilt on 2.16: thumbnail text and not-graded rating steps"
date: 2026-10-28
branches: ["main"]
migrations: []
subsystems: ["html-assignments"]
---

Standard 2.16 landed while the 2.15 survey (ledger 0461) went live, and its test failed the survey's thumbnail: the subtitle drew at 8.7px in the 56px banner and the key strip ran past the 320x180 wide card. The subtitle is now `max(11px, .6em)`, and in the wide shape the strip takes 46% of the width and the title wraps. The optional rating steps' evidence panels carry the kit's `data-graded="no"` ("not graded"), which replaces the survey's own CSS override that ledger 0461 recorded.

Measured 2026-10-28: the 2.16 test, 0 FAIL, 0 WARN, 45 PASS; the replace kept all 57 blocks; the live page, downloaded after the replace, matches the build byte for byte; the committed generator reproduces the committed source byte for byte.

Also found: the two earlier commits from this chat (0454 and 0461) ran their bullet list into the subject line, which 2.16 Part I now forbids; they are pushed and stay as they are.
