---
title: "The split collapses when nothing is open, and the class stream uses the width (code-only; NO migration)"
date: 2026-08-20
branches: []
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 85
---

`.cr-split` held `minmax(0, 26rem) minmax(0, 1fr)` whether or not anything was
selected. Measured on the class page at 1440x900: a 416px list beside a 921px
detail pane whose entire content was a 31px line of hint text -- 65% of the
split spent on a placeholder, with the thing it was a placeholder FOR crushed
into the quarter beside it. The review console had already solved this
(`nav-wide:not(.has-detail)` collapses to one column) in the same stylesheet.

### WHAT CHANGED

- **`split.css`: the collapse is the shell's, not the wide orientation's.**
  `:not(.has-detail)` now hides the detail pane in BOTH orientations and gives
  the navigation the whole measure. The wide orientation keeps its exact
  single-track form; the default keeps TWO tracks and moves the width into the
  first (`--cr-nav-w: 100%`, `gap: 0`), because that is the only form the
  transition can interpolate.
- **`ClassView`: the group container is a `.stream` grid**,
  `repeat(auto-fit, minmax(min(22.25rem, 100%), 1fr))`. One column in the pane,
  two or three across the full measure. `auto-fit` rather than `auto-fill` so a
  class with two units gets two columns and no void; `min(..., 100%)` so the
  same declaration is the single narrow column at 375px with no breakpoint of
  its own. A single group (a class with no units, the `bare` case) takes
  `--measure-reading` instead of stretching a row to 1300px.
- **A 180ms ease on `grid-template-columns` and `gap`**, inside
  `prefers-reduced-motion: no-preference`, scoped `:not(.nav-wide)`.
- **Density**: the stream's vertical rhythm was audited and tightened (table
  below).
- **Three literals point at tokens**: `--measure-nav: 26rem` is new and the
  split reads it; both view-as pages read `--measure-reading` instead of the
  46rem that is its value.
- **The class page's empty-detail prompt is REMOVED, not hidden.** With the
  pane gone at every width it had no surface to render on, and a hidden one is
  a path nothing can reach. `+page.svelte` keeps the route and the tab title,
  which is the one thing a detail pane cannot supply while there is no detail.

### THE COLUMN WIDTH IS MEASURED, and this is the measurement

Driving the pane from 300px to 900px in the harness and counting ellipsised
`.row-name` over the 20-row fixture (teacher view, so the row menu is competing
for the width too):

| pane | stream column | titles clipped |
| --- | --- | --- |
| 300px | 240px | 20 of 20 |
| 340px | 280px | 4 of 20 |
| 380px | 320px | 3 of 20 |
| 416px (today's 26rem) | 356px | 1 of 20 |
| 448 - 832px | 388 - 772px | 1 of 20 |
| 900px | 840px | 0 of 20 |

The row gains NOTHING between 356px and 840px -- the one title still clipped
across that whole range is the fixture's deliberately-overlong crowded case,
which needs 900px -- and falls apart below ~280px. So the column is **22.25rem
(356px)**: the exact content width the row was designed against (the 26rem pane
less its own 48px padding and the card's), reached from a measurement rather
than from a round number.

Using that width means **a row is the same shape in both states**: opening an
item changes how many columns there are, not what a row looks like. That is
most of why the change does not read as a navigation.

**The implied breakpoints, measured by sweeping the container 600 - 1500px:**
1 column below 736px, 2 columns at >= 736px, 3 at >= 1116px. A fourth needs
1496px and the split's own 92rem cap puts the container at 1358px maximum, so
three is the ceiling by arithmetic rather than by a rule. In viewport terms
that is two columns from 1024px (the shell's breakpoint) and three from about
1245px.

### THE TRANSITION, and why the track count is load-bearing

`grid-template-columns` interpolates only when both states list the same number
of tracks; a different count is DISCRETE, and a discrete transition flips at
half the duration rather than immediately. So the collapsed default keeps two
tracks and animates 416px -> 100% with the gap going 24px -> 0, and the wide
orientation -- which genuinely drops to one track -- is excluded from the
transition entirely rather than made to flip 90ms late.

Verified by sampling the two endpoint values through the Web Animations API
(the pane cannot paint a transition, see below): `416px 560px` / `562px 420px`
/ `708px 280px` / `854px 140px` / `1000px 0px` at t = 0/.25/.5/.75/1, gap
24/18/12/6/0. A smooth ramp, not a jump: they interpolate.

### DENSITY: measured, then tightened

| | before | after |
| --- | --- | --- |
| group card padding | 12px 24px | 8px 16px |
| group card margin | 20px top / 16px bottom (collapsing to 20px between) | 0; the grid's `gap` (12px / 24px) is the whole rule |
| row height | 50.6px | 45.8px |
| row-main padding | 6.72px (0.42rem) | 4.8px (0.3rem) |
| pane header padding-bottom | 16px | 12px |
| actions row margin-bottom | 24px | 16px |
| footer margin-top | 22.4px | 16px |
| two-line row budget | 36.2px (18.7 title + 0.8 + 16.6 meta) | unchanged |
| row tap target | 49.6px | 45.8px (over the 44px floor) |

The row's floor is the TAP TARGET, not taste: 36.2px of text plus 2 x 0.3rem is
45.8px, and anything tighter would have to give the 44px minimum up. The group
head keeps its 40px min-height for the same reason. The 1rem inline padding is
where the real gain is: at the pane's 356px the card was spending 48px, 13.5%
of the column, on air beside rows that were already ellipsising.

### VERIFIED

Everything below is a measured geometry read in the Browser pane against
`/dev/classroom-split`, `/dev/notebook`, `/dev/notebook-review`,
`/dev/coin-desk` and `/dev/classroom`, with `* { transition: none }` injected
first (see the note at the end). "Scroll-to-last" is the pixels of scrolling
needed to bring the last focusable element into view, per scroll container.

**Class page, 1440x900** (before is the 2-unit fixture; after is measured both
ways, so the extra unit cannot flatter it):

| | before | after (2 units) | after (3 units) |
| --- | --- | --- | --- |
| nothing open: nav / detail | 416 / 921 | 1361 / not rendered | 1376 / not rendered |
| nothing open: stream columns | 356 | 638.5 + 638.5 | 426 + 426 + 426 |
| nothing open: rows without scrolling | 10 of 20 | 20 of 20 | 20 of 20 |
| nothing open: scroll-to-last | 543.7 pane + 4 doc | 0 | 0 |
| item open: nav / detail | 416 / 936 | 416 / 936 | 416 / 936 |
| item open: rows without scrolling | 10 of 20 | 11 of 20 | 10 of 20 |
| item open: scroll-to-last (nav / detail) | 543.7 / 264.8 | 434.8 / 264.8 | 503.8 / 264.8 |

**Class page, 1920x1080:** nothing open 416 / 968 -> **1408 / not rendered**,
stream 356 -> **3 x 436.7**, rows 12 -> **20 of 20**, scroll-to-last 363.7 ->
**0**. Item open 416 / 968 in both, rows 12 -> 14, nav scroll-to-last 363.7 ->
**323.8**, detail 84.8 -> 84.8.

**Class page, 375x812:** nothing open, nav 375 and the detail pane not rendered
in both -- unchanged, which is the point. Stream one column at 343px, no
horizontal overflow. Rows 9 of 20 in both; scroll-to-last 611 -> **571.1**. Item
open: nav not rendered, detail 375, scroll-to-last 492.5 -> 492.5, unchanged.

**1024x800, the shell's own breakpoint:** nav 945, stream **2 x 430.5**, 16 of
20 rows without scrolling, no horizontal overflow.

**Notebook feed: identical before and after, at all three widths.** Its detail
pane always holds something (the compose form, an entry, or the empty state),
so `hasDetail` is always true and nothing collapses -- which is correct, there
is no empty column to reclaim. 1440: nav 416 / detail 921, document 1741 tall,
scroll-to-last 574.5 nav / 512.6 detail, and with an entry open 574.5 / 768.2.
1920: 416 / 968, 394.5 / 332.6, and 394.5 / 538.8 open. 375: split 4035.6 tall,
nav 2356.7, detail 1678.9, scroll-to-last 3937.3 / 1327.4.
**The narrow-stack ordering still holds**: detail `order: 1` at y=774, nav
`order: 2` at y=2453, and the composer's contenteditable is mounted both before
and after selecting an entry -- the form instance is not re-created, which is
what the ordering exists for.

**Review console: unchanged, both states.** Nothing open `1361px` single track,
nav 1361, detail not rendered, scroll-to-last 604.8, document 1927 tall. Cell
open `905px 432px`, nav 905, detail 432, 639.2 / 1044.4, document 2398. Its
split reports `transition-duration: 0s` -- the `:not(.nav-wide)` scoping works.

**Coin desk: unchanged.** `nav-wide` with `hasDetail` always true; 440 / 432 at
1024.

**The teacher surface at full width**, driven at 1440 with `?manage=1`: the row
menu in the THIRD column anchors to its own trigger (menu right edge 1366 =
trigger right edge 1366; top 388 = trigger bottom 385 + 3.2), sits inside the
viewport, wins the hit test at its own centre, and dismisses on an outside
`pointerdown`. Expanding a row in column 2 grows only column 2 (384 -> 426);
columns 1 and 3 keep their tops at y=293. Opening the composer collapses the
stream 3 columns -> 1 and the split to 416 / 921, with the composer capped at
768px (`--measure-form`); closing it restores 1376 and 3 columns.

**`/dev/classroom`'s full-page ClassView** (the arrangement the view-as class
page uses, outside any split): 2 columns of 436px at a 960px measure, no
horizontal overflow.

**Tokens resolve to the values they replaced**: `--measure-reading` 736px (the
46rem both view-as pages wrote) and `--measure-nav` 416px (the 26rem the split
wrote), read off the live document.

`npx svelte-check`: **0 errors, 36 warnings** (the baseline).
`npx vitest run --no-file-parallelism`: **1495/1495 across 63 files**.

**The harness fixture gained a third unit** (`u-3`, the generated items
redistributed 5/5/10), because the arrangement tops out at three columns and a
two-unit fixture would have measured a two-column layout and called it the
whole mechanism.

### NOT VERIFIED

- **The live Supabase project, and the real `/classroom/<id>` route.** The
  local `.env` is the placeholder project; every class-page number above is the
  harness, which mounts the REAL `ClassSplit`, `ClassView` and layout structure.
- **The animation itself was never watched.** The Browser pane does not
  composite and freezes transitions at t=0, so what was verified is (a) the
  declaration, (b) that the two endpoint values interpolate smoothly through
  the Web Animations API, and (c) the final geometry with transitions disabled.
- **`prefers-reduced-motion: reduce` was not emulated.** The pane reports
  `matches: false`, and the transition is declared ONLY inside the
  `no-preference` query, so under `reduce` there is no transition to suppress --
  but that branch was not observed running.
- **No screenshots**, per the pane's own limits; every claim here is a
  geometry, computed-style or hit-test read.

**A NOTE FOR THE NEXT PERSON VERIFYING A TRANSITIONED LAYOUT IN THAT PANE**, now
in CLAUDE.md: a frozen transition leaves the pane's OWN layout at the old value,
not just `getComputedStyle`. Opening the composer without disabling transitions
reported a 0px detail pane beside a full-width list -- which reads exactly like
a broken rule and is not one.

**Undoing it:** revert `split.css`'s `:not(.has-detail)` rules to the
`nav-wide`-only pair, `--cr-nav-w` back to the literal, and drop the transition
block; `ClassView`'s `.stream` back to a bare `<div>` with the old card margins
and paddings. Nothing was migrated and nothing stored changed.

