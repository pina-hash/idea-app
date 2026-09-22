---
title: Two IdeaCAD arc leftovers, and a tour whose reported defect was not the one it had
date: 2026-09-22
branches: ["claude/new-session-ig6vdi"]
migrations: []
subsystems: ["ideacad", "tour", "browser-verify"]
---

Four findings on two disjoint surfaces. Two are the leftovers ledger 0275 named in
its own closing section and could not take, because their call sites sat outside
that bundle's files. The other two were reported against the spotlight tour, and
**only one of them was there**.

Decision 31 is the tie-breaker for both IdeaCAD items: "This is not a technical
precision program. You are sketching things in 3D space to get your idea across.
It should be quick to use, extremely quick to use."

## What the tree said about the four claims

Confirmed by running the code rather than reading it:

- **Item A holds exactly as reported.** An arc at radius 1.000 whose end is
  dragged to (0, 2.5) came out `rStart` 1.000 against `rEnd` 2.500, through the
  real `movePoints`.
- **Item B holds exactly as reported**, and reproduces 0275's own table to three
  decimals: a third click 0.01in below the start gave **359.427 degrees**.
- **Item C DOES NOT HOLD.** See below. The number it rests on is stale.
- **Item D holds and is worse than stated in one place**: the close X measured
  15x19.2, so its min dimension was 15px, not the 19.8 a height-only reading gives.

One smaller claim was also wrong: the prompt says all four controls use `--dim`.
Next/Done is `--gold` on its own gold wash and always was, measuring 5.62:1.

## Item A: a dragged endpoint sweeps along the arc's own circle

`movePoints` was a one-line map of new positions and is now arc-aware. The rule,
in one sentence: **the radius is `|start - center|` unless the START is the point
that moved and the END is not, in which case it is `|end - center|`; any endpoint
off that radius is pulled back onto it along its own bearing from the center;
and a move of the CENTER ALONE carries both endpoints with it.**

Measured through the real function, before and after:

| drag | before (rStart, rEnd, sweep) | after |
| --- | --- | --- |
| end -> (0, 2.5) | 1.000, 2.500, 90.000 | 1.000, 1.000, 90.000 |
| end -> (0, 0.4) | 1.000, 0.400, 90.000 | 1.000, 1.000, 90.000 |
| end -> (2, 2) | 1.000, 2.828, 45.000 | 1.000, 1.000, 45.000 |
| start -> (2.5, 0) | 2.500, 1.000, 90.000 | 1.000, 1.000, 90.000 |
| start -> (0.5, 0.5) | 0.707, 1.000, 45.000 | 1.000, 1.000, 45.000 |
| center -> (0.3, 0.2) | 0.728, 0.854, 126.501 | 1.000, 1.000, 90.000 |
| whole entity +(1,1) | 1.000, 1.000, 90.000 | unchanged, and not recomputed |

**And it is not cosmetic, which the kernel is what says.** The same drag was put
to the real Remus wasm in both states: the end written verbatim at (0, 2.5) is
REFUSED by the extrude (`edge vertices do not agree with its authoritative curve
trim`), and the swept one builds, with the volume the geometry predicts --
`r^2/2 * (theta - sin theta)` at r = 1 and theta = pi/2, one inch thick, which is
`pi/4 - 1/2`. Both halves are pinned in
`tests/ideacad-solid-sketching-geometry.test.ts` as a positive and negative
control in one test.

### The two rejected alternatives, written down rather than settled silently

**RE-RADIUSING the whole arc** (the dragged end sets a new radius and the other
end moves out to match) is coherent and is worse for the reason 0275 gives about
its own snapped-endpoint fork: in the case that matters, closing a profile, the
OTHER end is the one already shared with a line the student drew first, so
honouring the drag means silently moving geometry they are not touching.

**REFUSING the drag** is worse still. An arc can already be inconsistent -- through
a join, and through every document saved before today -- and a refusal takes away
the repair that the sketch panel's own notice tells a student to perform.

Sweeping needs no explanation, which under decision 31 is the whole argument.

### What it deliberately does not cover

**A drag that ends ON another point is a JOIN**, which goes through `joinPoints`
and never through `movePoints`, and a join onto a point off the circle still
leaves the arc inconsistent. Honouring the join AND the radius is impossible; 0275
explicitly directs students to that path ("drag its end onto the target, which
`joinPoints` already supports"), so closing it means deciding what a join MEANS
for an arc, which changes every arc join in the app. **For Mr. Pina: this is the
one arc path still open, and the amber notice 0275 shipped is what reports it.**
The prompt's own instruction was to keep that notice as the safety net for
anything not covered, and it is kept.

**The repair is one pass, first writer wins.** Two arcs sharing a point can each
ask for it; a second pass would chase a chain of them. Residue is the notice's.

**An arc none of whose points moved is never touched**, so opening a document that
already carries a broken arc does not rewrite it behind the student's back --
but dragging that arc's own end DOES repair it.

## Item B: the v1 drawing path takes the same direction rule

`arcEntities` -- the drag-draw path with no sketch open, whose one caller is still
`viewport/drawing.ts` and nothing else (confirmed by sweep before touching it) --
projected the third click onto the radius correctly and then stored the arc
`start -> end` unconditionally. A stored arc runs counter-clockwise, so every
clockwise click committed the complement.

| third click | before | after |
| --- | --- | --- |
| 10 deg counter-clockwise | 10.000 | 10.000 |
| 10 deg clockwise | 350.000 | 10.000 |
| 90 deg clockwise | 270.000 | 90.000 |
| 170 deg clockwise | 190.000 | 170.000 |
| 0.01 in below the start | **359.427** | **0.573** |
| collinear beyond the start | 360.000 | 360.000 |

359.427 + 0.573 = 360.000 exactly: it is the same click, with the complement
removed. **The signature did not change and `drawing.ts` needed no edit** -- the
repair is `arcDraft`'s own, so there is one direction rule rather than two, and
the end POSITION is unchanged, which a test pins by comparing the two paths.
The chord is kept; it is the real difference between the two and is why a first
drawing closes.

**Shift for the long way round is NOT plumbed here**, deliberately: this path's
press handler reads no modifier, so a major-arc option would ship a preview that
cannot show it -- which is the defect 0275 fixed one surface over.

**Left alone and named rather than fixed:** this path's live guide is a polyline
through the three clicks, not the arc, so the preview still does not show the
shape; and it has none of the tool's three degenerate-click refusals. Both are
pre-existing, both need `drawing.ts`, and neither is a direction defect.

## Item C: the reported contrast defect is not on this tree

The report was that the callout's controls paint `--dim` on `--bg1` at **4.46:1**,
under the 4.5 floor. Measured in Chromium through `npm run verify:browser`:

    close X   4.52:1   fg rgb(132,144,128) on rgb(26,42,26)
    Skip tour 4.52:1   same
    Back      4.52:1   same
    Next      5.62:1   fg rgb(200,168,72) on its own gold wash rgb(42,53,30)

**4.52 clears 4.5.** #849080 on #1a2a1a is 4.52 under an independent sRGB
computation as well, agreeing to the hundredth. The 4.46 comes from `CLAUDE.md`'s
`--dim` paragraph, where **every other figure in the row reproduces exactly**
(5.31 on `--bg0`, 4.24 on `--bg2`, and `--text-2`'s 6.91 / 5.88 / 5.51) -- which
is what says the drift is that one number rather than the whole row. It has been
corrected in place, along with the two sentences whose conclusion it carried
("clears only the DARKEST of the three" is now "the two DARKER", and "`--dim` on
`--bg1` or `--bg2` is still a failure waiting for a use" is now `--bg2` alone).
**The FRC readings in the same paragraph were NOT re-measured** and are untouched.

`CLAUDE.md` is outside this bundle's stated files and the edit is deliberate: the
figure is one this session measured, `CLAUDE.md`'s own rule is that a session
measuring a different number corrects the line in the same change, and the stale
one had already cost a whole prompt item. **It is one number and two clauses; if
Mr. Pina would rather it went through its own bundle, it reverts on its own.**

### What IS under a floor on those controls is the box, not the label

`--dim` thinned to 45% for `.tour-btn`'s border composites to #4a5848 and measures
**2.00:1** against the callout plate; the primary's 55% gold composites to #817435
and measures **2.76:1** against its own wash. `CLAUDE.md`'s `--boundary` contract
names "the outer edge of an interactive control" as load-bearing at 3:1.

    Back  border --boundary neat   rgb(111,123,115)  3.42:1 against the plate
    Next  border --gold at 75%     rgb(160,139,61)   3.86:1 against its own fill, 4.50:1 against the plate

The primary keeps its identity colour and moves only the alpha -- the `--acc-edge`
argument in miniature: a neutral edge there would delete the one thing marking
Next apart from Back. 75% still reads as a tint, so the hover step up has
something left to say.

**So item C shipped a repair, but not the one it was written for**, and the label
colour was left exactly where it was. Its margin is thin -- 4.52 against 4.5 -- and
the spec now pins it at 4.5 so a move in either token reddens. **For Mr. Pina:
if that 0.02 is too little air, the fix is `--text-2` at those three call sites
(5.88:1), which is the substitution `CLAUDE.md` already records for the two
`SaveIndicator`/`ItemBody` sites. It is a one-line change and I did not make it,
because the control clears and churning a passing colour is what that paragraph
warns against.**

## Item D: 44px, and the spec that is the durable half

All four controls were under the floor, three of them under the 24px absolute
floor as well. `IDEA_INTERFACE_STANDARDS` 2.12 puts 44px on every student surface
without exception; the 24px density floor is a property a surface DECLARES with a
named class on its own root, and the tour declares none.

| control | before | after |
| --- | --- | --- |
| close X | 15 x 19.2 | 44 x 44 |
| Skip tour | 55.3 x 11 | 55.3 x 44 |
| Back | 57 x 26.8 | 57 x 44 |
| Next / Done | 57 x 26.8 | 57 x 44 |

Identical at 375 and 1440. The mechanism is `.tap-44` from `src/app.css` rather
than a scoped copy, per `CLAUDE.md`'s two-mechanisms rule. It grows HEIGHT and
never width, which is what keeps it safe in the actions row: Skip and Back sit
closer than 44px horizontally, so a reach that grew sideways would hand one
control's tap to the other. The close X re-pins `min-width: 44px` (two classes
beats `.tap-44`'s one on specificity) because it is a single glyph owning its
corner with nothing beside it.

### `tools/browser-verify/routes/tour-mode-student.mjs`

**Nothing had ever measured this component.** One spec drove `/dev/tour` before
(`tour-mode-picker.mjs`) and it is about the pathway sheet's scroll lock: it
DISMISSES the sheet and measures the home page underneath, and asserts nothing
about the callout. That absence is why both C and D went unmeasured, and it is
what the new spec fixes.

Three things it had to learn the hard way, each of which had produced a confident
wrong number first:

- **The dev harness's own panel covers two of the controls at 375.** Back and
  Next reported `COVERED by svelte-1t7fjab` while rendering perfectly;
  `tapTargets` resolved their centres to the harness's Reset button, and a
  scripted press of Next pressed the harness. The spec hides the panel first and
  SAYS whether it found one, so the day that class moves this reports "no panel
  found" instead of silently measuring under it again. **This is harness
  furniture, not a product defect** -- production has no such panel.
- **Pressing Next on the last step ENDS the tour.** An unguarded advance
  completed the tour, unmounted the callout and stamped the profile, after which
  every check honestly reported "no match" against a page with no tour on it. The
  advance is now conditional on there being a step to advance to.
- **A `color-mix(..., transparent)` border is reported by Chromium as
  `color(srgb r g b / a)` with 0-to-1 FLOATS.** A reader that scraped numbers out
  of that string read 0.784 as a red channel and reported the gold edge as
  rgb(7,10,6) at 1.26:1 -- near black, plausible, and entirely the instrument.
  That is `CLAUDE.md`'s own rule ("MEASURE BY PAINTING TO A CANVAS AND READING
  THE PIXEL BACK") and the edge check now does exactly that, painting plate,
  own background and border in order so no alpha arithmetic is left to get wrong.
  It also reads `fillStyle` back after each assignment, because an unparseable
  colour leaves the previous one in place and a canvas reader will otherwise
  report a confident number about a colour it never painted.

**A `\d` inside a JS template literal loses its backslash before the string is
ever evaluated**, so `/[\d.]+/g` in an in-page helper matched the LETTER d and
`/(\d+) of (\d+)/` matched nothing. Both read as page defects. Every character
class in that file is now escape-free (`[0-9.]`). This is the same family as the
trap the harness already documents for `page.evaluate` treating a string as an
expression, and it is worth knowing that it bites one layer further in.

The edge check lives in a `prepare` step rather than in `checks.mjs`: `contrast`
reads `cs.color` and nothing else, so a control's box is invisible to it, and
adding a border check means adding its `--selftest` and `--break` controls too,
which is a different bundle. **For Mr. Pina: a first-class border-contrast check
would be worth having, and it is the kind of check several surfaces would use.**

## Verification

- **`npm test`**, full suite, the summary line read rather than the exit code:
  **527 files, 9876 tests, all passing.**
  - **THE FIRST BASELINE RUN WAS CONTAMINATED AND IS REPORTED AS SUCH.** It was
    started in the background before the edits and reported 527 / 9876 -- but
    `geometry.test.ts` shows **33 tests** in that very log, which is this
    bundle's count, not `origin/main`'s. Vitest collected the file after the
    edit landed, so the "before" figure already contained the "after". That is
    exactly the trap `CLAUDE.md` names ("a baseline measured on the tree under
    test is not a baseline"), and it is silent: both numbers look like a clean
    pair and the run is green either way.
  - **The true baseline was re-derived in a clean `git worktree` at
    `origin/main` (`1ec2f640`)**, per that same rule. `geometry.test.ts` carries
    **23 tests** there against 33 here, so this bundle adds 10 and `origin/main`
    totals **9866** across the same 527 files. The arithmetic closes exactly,
    which is the check that the delta is additions and nothing else.
  - A third run was needed because the second still carried a phantom failure:
    a scratch measurement file deleted from disk AFTER vitest had collected it,
    which reports as `1 failed | 527 passed (528)` with 0 failing tests. Worth
    knowing -- it reads as a real regression and is a file that is not there.
- **`npx svelte-kit sync && npx svelte-check`**: **0 errors, 37 warnings in 20
  files** before and after, with the breakdown unmoved at 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`. That matches what `CLAUDE.md` records, which after
  five corrections in three weeks is worth saying explicitly.
- **`npm run verify:browser -- --route "mode=student"`**: 40 measurements across
  375 and 1440, **0 outside threshold**, from 7 before.
- **Rasterized and looked at**, both widths, through `_shot.mjs` so the picture is
  of the state the checks ran against. The callout reads correctly at both: ring
  on the target, all four controls legible and comfortable, Next distinguishable
  from Back by fill and edge, nothing clipped and no overlap.
- `npm run verify:readme -- --route "mode=student"` then `npm run verify:counts`;
  the README counts blocks are generated and were not hand-edited.
- `node tools/claude-md-check.mjs`: agrees with the tree.

### Mutation proof, per item

Restored from an in-memory byte copy and md5-checked, never `git checkout --`;
judged by the summary line over stdout AND stderr concatenated, never by an exit
code. Control green before and after every run.

Items A and B, against `tests/ideacad-solid-sketching-geometry.test.ts`:

| mutant | verdict |
| --- | --- |
| A: `movePoints` writes the raw move (the pre-repair one-liner) | KILLED, 5 tests |
| A: the radius is always read from the START | KILLED, 1 test |
| A: a center-only move re-radiuses instead of carrying both ends | KILLED, 1 test |
| A: the repair fires for an arc no point of which moved | KILLED, 1 test |
| B: `arcEntities` stores start -> end always | KILLED, 3 tests |
| B: `arcEntities` drops its chord | KILLED, 1 test |

Items C and D, against `npm run verify:browser`. **They are judged there and not
by `npm test`, and that is not a shortcut**: `tests/dom/` has no layout engine and
reads every box as zero, so a mutation judged in the suite would report every one
of these as SURVIVED.

| mutant | verdict |
| --- | --- |
| C: `.tour-btn` edge back to the thinned `--dim` | KILLED (edge check) |
| C: `.tour-btn.primary` edge back to 55% gold | KILLED (edge check) |
| D: close X loses `.tap-44` | KILLED (tap-target) |
| D: close X keeps `.tap-44`, loses its `min-width` re-pin | KILLED (tap-target) |
| D: Skip tour loses `.tap-44` | KILLED (tap-target) |
| D: Back alone loses `.tap-44` | **SURVIVED** |
| D: Next alone loses `.tap-44` | **SURVIVED** |
| D: BOTH nav buttons lose `.tap-44` | KILLED, 57x26.8 |

**The two survivors are defence in depth and both classes stay.** `.tour-nav` is a
flex row at the default `align-items: stretch`, so each button's own 44px floor
props the other up; removing either leaves the other holding the pair at 57x44,
and removing both drops them to 57x26.8. That is exactly the case `CLAUDE.md`
names -- "do not remove a redundant check because a test did not notice: verify by
opening BOTH and confirming only that reddens" -- so it was verified that way
rather than resolved by deleting a class.

### Not verified

- **Nothing was run against production or against a signed-in session.** No
  session in this container can reach the Supabase project; the only database
  touched is the suite's embedded one.
- **The Vercel preview was not opened**, which no cloud session can do.
- **`prefers-reduced-motion: reduce` was not exercised.** The harness runs at
  `no-preference`, so the tour's reduced-motion branch is unmeasured here; the
  change touches no rule inside that media query.
- **Web fonts do not load in the harness** (it blocks every non-loopback request),
  so all text geometry above is measured in the fallback stack. The tap figures
  are driven by `min-height` and padding rather than by glyph metrics, so the font
  does not move them; the contrast figures are colour and are font-independent.
- **The FRC contrast readings in `CLAUDE.md`'s `--dim` paragraph were not
  re-measured**, only the three portal grounds.
- **The IdeaCAD changes were not driven in a browser.** They are pure geometry
  over a shared-point graph and are exercised through the real functions and the
  real kernel in the suite; no `/dev` route drives the sketch editor's Select
  drag, and adding one would need files outside this bundle.
