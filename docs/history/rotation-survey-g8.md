---
title: "Rotation Survey moved onto 2.15 G8, generator committed"
date: 2026-10-28
branches: ["main"]
migrations: []
subsystems: ["html-assignments"]
---

The IDEA100 Rotation Survey (post "ROTATION 2 | SURVEY") follows the 2.15 G8 shape: the required part is three steps and seven answers (three scales, three awards, one written answer), the written-answer step says "You're done" once a box has words, and the five rating steps carry `data-optional`. The three award steps became one step of three `<select class="idea-well idea-well--select">` dropdowns; their manifest type moved from radio to text, and the stored values (each item's id) are the same, so the 17 students who had answered keep their picks (read back after the replace). The page copy no longer names the rotation. The kit labels every evidence panel "counts toward your grade", optional steps included; the survey overrides that label on `[data-optional]` steps in its own CSS, and the kit gap is reported.

`rotation-2-survey.gen.py` writes `rotation-2-survey.src.html` beside itself (its page shell is inside it). Measured 2026-10-28: the generator, run in place, reproduces the committed source byte for byte; the source, built on today's kit, is the live page byte for byte (downloaded after the replace). The test: 0 FAIL, 0 WARN, 42 PASS.

The test's "no dead space under a step" check failed on the first build (261px under the one-step awards); an "x of 3 awards picked" readout brought it to 208px.

Not verified: how the dropdowns read in the grading console's Answers view now that the blocks are type text.
