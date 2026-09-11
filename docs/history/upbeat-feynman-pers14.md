---
title: "Prompt 0142: a progress rail above every ported HTML assignment, weighted by points, red to green, and not a grade (`claude/upbeat-feynman-pers14`, no migration)"
date: 2026-09-11
branches: [claude/upbeat-feynman-pers14]
migrations: []
subsystems: ["Classroom", "HTML assignments", "Browser harness"]
---

Mr. Pina's brief, in his words: a progress bar at the top of every HTML
assignment showing the student how far along they are, weighted by points
rather than by count, color-coded red to green as it fills, with a
percentage, gamified enough that finishing feels like something. "Make it
cool" was the whole of the visual instruction and the judgment was the
session's. This entry says what was chosen, what was rejected, and what was
measured.

## What shipped

**`src/lib/classroom/html-assignment/progress.ts`** is the rule and
**`Progress.svelte`** beside it is the look. The module takes the stored
manifest and the two records the answer controller already holds (`values`
and `images`, keyed by field) and returns one `HxProgress`: the percent, the
fraction, the basis the number was produced under, every block judged, every
module with its share of the bar, the first unmet block, and `complete` and
`started` as separate booleans. No DOM, no Svelte, no client; every rule is
put to a value in `tests/html-assignment-progress.test.ts` with no browser
in the room.

**`ItemDetail.svelte`'s schema-3 branch mounts it** between the section label
and `HtmlAssignmentFrame`, only when the page handed down `htmlAnswers` and
the manifest narrows through `htmlManifestShaped`, the same check the item
page uses to build the controller. It reads `htmlAnswers.values` and
`htmlAnswers.images`, the records the frame is seeded from, so the rail and
the document cannot disagree about what is filled in. A manager has no
`htmlAnswers` and gets no rail: there is nothing of theirs to measure.

**`/dev/html-progress`** mounts the real component eight times over
hand-written fixtures (zero, the one-point module alone, the five-point
module alone, an answer short of its floor, an image as the only unmet
block, complete, a one-module document half done and complete), once
interactively behind two 44px controls, and once inside the real
`ItemDetail` over a real `HxAnswersStore` against the real `/hx/worksheet`
document. **`tools/browser-verify/routes/html-progress.mjs`** drives all of
it at both widths.

## The number: what it is and why

**Weighted by points, spread evenly over a module's blocks.** The manifest
carries points per module and nothing finer, so a 6-point module with three
blocks is worth 2 per block. The fixture used everywhere in this bundle has
modules worth 5, 1 and 4 over 2, 1 and 3 blocks, chosen so a count-weighted
bar and a point-weighted bar disagree on every partial state: the one-point
module alone is 10% here and would be 17% by count; the five-point module
alone is 50% and would be 33%. Both pairs are pinned in the test and in the
browser spec's `mustNot`.

**The header is judged and never counted.** A student's name and the date are
identity, not work, and 0134's reason for lifting them out of a module was
that a 0-point module read as something to score. A module with points but
no blocks (graded by observation) contributes nothing to the denominator
either. When every module carries zero points the basis falls to count, and
`basis` says so, so a surface can never present a count as a weighting.

**Met is "has a stored response AND is not short of its sentence floor", and
the second half is `hxIncompleteBlocks`, called rather than copied.** That is
the Submit gate's own count; measured on 2026-09-10 it had no caller outside
its own file, and this is its first. A bar that counted sentences a second
way is a bar reading 100% over a worksheet Submit refuses. The first half is
per type and is this bundle's: a non-blank string for text, longText and
radio; a JSON table with at least one non-empty cell (a document serializes
the whole table on any change, so a table typed into and emptied is
`[["",""]]` and not an answer); any stored boolean for a checkbox, because a
manifest cannot say which way a box should go and treating only `true` as
met would make every "check if applicable" box a required tick; a picture
standing for an image field.

**The percent is clamped to 1 and 99 while partial.** Rounding alone shows
"0%" to a student who has just answered their first block of forty, which is
the one number this bar exists to move off, and "100%" over a worksheet
with a block still empty. Zero means nothing is met and one hundred means
everything is; `complete` is the boolean and the number agrees with it.

## The look: what was chosen, and what was rejected

**Chosen.** A large percentage in the register's mono face with a stage word
and a filling-circle glyph beside it (`○ ◔ ◑ ◕ ● ★`, one per stage, so the
picture the glyph draws is the picture the bar draws). One track split into
MODULE SEGMENTS whose widths are the modules' point shares, so the weighting
is visible rather than merely applied: a five-point module is a segment five
times the width of a one-point one, and a student sees which part of the
assignment is worth the most of the bar without a number being printed. Each
segment fills from its own left edge. The fill is one `color-mix()` in oklab
between two of the room's own tokens, `--crimson` to `--amber` below fifty
and `--amber` to `--green` above, driven by three custom properties the
component sets inline; the value on screen is always a point on the line
between two register tokens and never a new color. One chip per counted
module carries the module's title and either "done" or how many ANSWERS are
left. One line names the first unmet module and what it wants ("needs 1 more
sentence", "is waiting for a photo", "has an empty answer"). And at every
value, zero and one hundred included, one sentence: "This measures how much
you have filled in, not how well. Grades come from your teacher." At 100% a
second sentence replaces the next-up line and says it again in the moment a
student is most likely to read the number as a mark.

**Motion.** The fill eases when the number moves; a gloss sweeps the bar once
on reaching 100%; the stage line pops once at the same moment. All three sit
inside `prefers-reduced-motion: no-preference`. The gloss is a background
layer on the fill itself rather than a separate element, which is what keeps
"nothing is hidden in a base state" true of it: under `reduce` the fill is
painted at full opacity with the gloss standing still. The harness's
`motion` check measured both states: 3 elements animated under
no-preference and 0 still moving, transformed or unpainted under reduce, on
the gloss and on the pop; 0 animated in either state on the zero card's
stage line, which is the `never` control.

**Rejected, and why.** Points anywhere on screen: "7 of 10" is a grade to a
fifteen-year-old however it is labelled, and a chip counts answers for the
same reason. Confetti or particles at 100%: they celebrate a mark, and they
cannot be made to say nothing under reduced motion. Streaks, levels, XP: no
storage exists for them and they would be a second gamification with its own
rules. A ring: cannot be segmented legibly and is cramped at 375. A single
unsegmented bar: hides the weighting the brief is about. A per-block dot
row: a manifest may carry four hundred blocks. A bar drawn by the document
itself: the authoring standard tells authors not to, because this exists. A
disclosure listing every unmet block: `Disclosure` defaults to expanded for
everyone, and a full list of blocks above the frame is a second worksheet.

**On `--crimson`.** The register reserves it for live, rec and error status.
A bar at 3% is a status, the brief named red explicitly, and it is the one
place this feature spends the token, only for the bottom of the ramp. Said
here so nobody reads it as an accent.

## Measured

**`svelte-check`: 0 errors and 37 warnings**, re-derived after every edit,
with the placeholder environment exported before `svelte-kit sync` as
`CLAUDE.md` requires.

**The unit file: 28 tests, and four permissive mutants each redden it**,
restored from a copy and md5-checked (`7c1ba66f...` before and after):
count weighting in place of points reddens 10; the sentence floor ignored
reddens 1; an image judged by its value instead of its file reddens 2; the
1/99 clamp removed reddens 1.

**The browser pass on `/dev/html-progress`: 114 measurements at 375 and at
1440, 0 outside threshold.** Ten rails on the page; the bar is 14px tall at
both widths; the three segments of the fixture measure 530/108/424 at 1440
and 142/30/114 at 375, ratios 5 and 4 to the one-point segment at both. No
horizontal scroll at either width. The fill against its own track, read from
pixels painted to a canvas because the fill is a `color-mix()` no regex can
parse: 4.96 at 10%, 5.27 at 25%, 5.70 at 50%, 7.05 at 90%, 7.44 at 100%,
every one above the 3:1 non-text floor and above 4.5. The oklab `a` axis of
the computed fill falls strictly across those five values, positive at 10%
and negative at 100%, which is the red-to-green claim as a number. Eleven
contrast rows on the words, all at or above 4.5:1 on the real classroom
ground. Three harness controls at 44px. The interactive card driven from 0
to 25, 50, 60, 73, 87 and 100 by six presses; the real `ItemDetail` mount
driven from 0 to 50 to 100 by two synthetic `MessageEvent`s through the real
`hxReceive` gate, the real controller and the real store, and the store's
transports recorded a save under each BLOCK ID.

**The checks were put to a broken page before they were trusted.** `--break
tiny-taps` reddened the tap-target row (3 of 3 controls at 18px);
`--break overflow` reddened horizontal scroll (189px); `--break
low-contrast` reddened all eleven contrast rows at 1:1. `--break blank-text`
and `--break motion` name selectors this page does not have (`.gt-tm p,
footer p` and `[data-mark]`), so they injected nothing here; that is the
instrument's scope, not a gap in the checks, and the `motion` rows above
carry their own positive control.

**Looking found what the checks did not.** The first render at 375 ellipsized
a chip's count behind a long module title ("2 an..."), with every content
check green because the text was all present. The chip wraps now, and the
spec carries a row asserting no chip's word span is clipped at either width
(24 chips, 0 clipped).

## Not verified

No production database, no signed-in session, no real ported document from a
real class: the local `.env` is a placeholder project and `/hx/worksheet` is
the dev fixture. The rail was not seen inside a real `/classroom/...` item
page; the real `ItemDetail` mount on the harness is the closest this
container can get, and it is the same component over the same controller.
Web fonts do not load in the harness, so every pixel figure above is in the
fallback stack; contrast is unaffected. `prefers-reduced-motion` was
exercised only by the `motion` rows.

## Deferred

The rail reads the controller's records and is therefore only ever as
current as the last accepted `idea:change`; a document that batches its
messages will move the bar in steps. A `Disclosure` listing the unmet blocks
by name was rejected above but is the natural next step if a class asks
"which one". No history table and no new storage: the number is derived at
read time from what is already stored, and nothing about it needs a
migration.
