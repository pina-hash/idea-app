---
title: "Three layout defects reported from production, reproduced and measured before a line was changed: a status chip painted on top of every student's name, 713px of dead column down the class page, and a link popover sliced off its editor (`claude/charming-bell-msr4rl`, no migration)"
date: 2026-09-11
branches: [claude/charming-bell-msr4rl]
migrations: []
subsystems: ["Notebook", "Classroom", "Verification"]
---

Three defects, all reported from production, all shipped past every check this
repository has. What they have in common is the point of this entry: **every
string was present on all three broken surfaces.** A presence row, a
`textContains` row and a `svelte-check` pass are green on a name with a chip
painted over it, on a page with a 713px hole in it, and on a popover whose
Cancel is outside its container. Nothing in `tests/dom/` could have caught any
of them either -- happy-dom has no layout engine, so a geometry read there is
zero and passes vacuously. All three needed a real browser, and two of them
needed a HIT TEST rather than a box.

Each was reproduced and measured before anything was edited. The numbers below
are the pre-change measurements.

## ONE: the compliance grid painted status chips over student names

Reported 2026-09-11 from a screenshot: rows reading `Abundiz, <chip>mma`,
`Alvarenga <chip>cob`, `Barahon <chip>atthew`.

**Measured on `/dev/notebook-review` at 375px, scrolled to the end of the
table:** "Newcomer, Dana" is a 113.2px text box at x=77.8; two `.cell` buttons
intersect it, at 67.8-98.2 and 179.4-209.8, covering 32.0px -- **28.3% of the
name**. "Okafor, Ben" 26.4%, "Patel, Dev" 30.4%, "Ruiz, Ana" 33.3%. A hit test
across the name's own text box, 13 points left to right, landed on a
`button.cell` at **3 of 13** points for the first row and 1 of 13 for the
second: the name was not merely unreadable, the link under it was taking the
wrong taps.

**The sticky column was never too narrow, which was the first hypothesis and it
is wrong.** The row header is 176px (`min-width: 11rem`) with its right edge at
217px, and the longest name in the fixture ends at 191px -- inside it, with room
to spare. It is a PAINT ORDER defect. `position: sticky` makes the header a
POSITIONED box; `.cell` is `position: relative` (it has to be, for the
multi-entry badge and the not-reviewed dot). Both were `z-index: auto`, and
positioned siblings with `z-index: auto` paint in TREE ORDER -- every cell comes
after the row header in the row -- so the cells painted straight over it the
moment the table was scrolled sideways. The opaque `background: var(--surface-1)`
on the column was doing nothing about it and never could: a background only
covers what paints BENEATH it. `thead .name-col` already carried `z-index: 3`
and was correct; the `tbody` one had never been given one.

`z-index: 1` on `.name-col` is the whole fix -- one level over the cells, two
below the header row, which has to keep sliding over this column vertically.

**AND FIXING IT CREATED THE SECOND HALF, IMMEDIATELY.** The moment the header
correctly paints over the cells, a cell brought to the scrollport's left edge by
`scrollIntoView({ inline: 'nearest' })` lands BEHIND it and cannot be clicked --
and that call is made by the grid's own arrow-key cursor effect on every press,
and by any scripted click for itself. It was caught within minutes, by the
existing browser specs rather than by reasoning: `/dev/notebook-review?viewer=
instructor` and `?viewer=reviewer` at 375px went from green to **7 findings**,
led by `prepare-click [.cell.late] -- 1 matched, 6 attempt(s), predicate never
satisfied`. Reverting `SectionGrid.svelte` to `HEAD` and re-running returned 0
outside threshold, which is what established the cause rather than a guess about
it.

`scroll-padding-left` on `.table-scroll` is the one CSS feature that tells a
scroll an overlay is there. It takes its value from `--nb-grid-name-col`, the
same custom property `.name-col`'s `min-width` reads, declared once on
`.grid-card`: a second literal is a column and a padding that stop agreeing the
first time either moves.

## TWO: 713px of dead column down the left of the class page

Mr. Pina, 2026-09-09, build `54bf64f`, `/classroom/[sectionId]`, viewport
1196x1304, verbatim: "this shit is such a mess lmao". From the screenshot: a
large empty column down the LEFT, every unit panel crammed into the right half,
and "Documents and References" and "Not in a unit" at the bottom in an uneven
two-column arrangement.

**`/dev/classroom-split`'s own fixture cannot reproduce it, and that is the
finding rather than an obstacle.** Its three units are of roughly comparable
height -- 522.9, 388.3 and 248 -- which is the shape the grid was measured
against and the shape it has always handled. Driven at 1196x1304 it lays out two
529px columns with nothing wrong. A REAL class is not that: one unit carries a
term of posts and the next carries three. That difference IS the defect, so it
got a fixture of its own: `/dev/classroom-stream`, which mounts the identical
`ClassView` inside the identical `ClassSplit` and differs only in the data,
driven by `?sizes=` so one route covers every arrangement.

**Measured there at 1196x1304, the reported width**, with a class of 3, 18, 2, 5
and 4 items across five groups, two 529px columns:

| panel | column x | top | bottom | height |
| --- | --- | --- | --- | --- |
| Unit 1 · Sketching | 57 | 163.3 | 364.5 | 201.3 |
| Unit 2 · Bridges | 610 | 163.3 | 1065.8 | 902.5 |
| Unit 3 · Materials and testing | 57 | 1077.8 | 1232.3 | 154.5 |
| Documents and References | 610 | 1077.8 | 1372.5 | 294.8 |
| Not in a unit | 57 | 1384.5 | 1632.5 | 248.0 |

Unit 1 ends at y=364.5 and the next card in that column begins at y=1077.8:
**713.3px of the left column, its full 529px width, dead**, while Unit 2's
902.5px panel fills the right. At a 1304px viewport that is the whole first
screen. The rasterised screenshot is Mr. Pina's, panel for panel.

**The cause is that a grid ROW is as tall as its tallest member.** `.stream` was
`grid-template-columns: repeat(auto-fit, minmax(min(22.25rem, 100%), 1fr))`, so
row 1 is `max(201.3, 902.5)` and everything under Unit 1 in that row is void.
Nothing reports it: no overflow, no unused selector, no warning, and every item
title still present and still readable.

The fix is a multi-column container. Panels are `break-inside: avoid`, they fill
down one column and on into the next, and `column-fill: balance` picks the
shortest height that holds them, so there are no rows to lock. **Measured after,
same fixture, same width:** column 1 holds Unit 1 and Unit 2 (163.3 to 1279.0),
column 2 holds Unit 3, Documents and References and Not in a unit (163.3 to
884.5); largest gap inside a column **12px**, the row gap; stream height 1115.8
against 1469.3 before. The only void left is the ragged bottom of column 2,
which is what the foot of a newspaper column looks like.

**`column-width`, not `column-count`, so the breakpoints do not move.** With a
column width the count is the same arithmetic `auto-fit` was doing. Verified
across the range: 3 columns at 1440, 2 at 1196, 2 at 1024, 2 at 768, 1 at 375 --
identical to the grid at every one, and `/dev/classroom-split`'s own three-unit
fixture measures 3 columns at 1440 and 2 at 1196 exactly as it did.

**THE ONE REGRESSION THIS INTRODUCED, AND IT IS THE RULE THE OLD COMMENT WAS
MOST EMPHATIC ABOUT.** `auto-fit` COLLAPSES a track nothing was placed in;
multicol has no equivalent and simply leaves the spare column empty. Measured
immediately after the change, two groups at 1440: two 426px columns at x=57 and
x=507 against the 1326px the stream had to spend, i.e. **450px dead at the
right** -- "a class with two units must not lay itself out in two columns and a
void where a third would go", exactly. Closed with a column-count CEILING:
`columns: <width> <count>` makes the count an upper bound over the same width
arithmetic, so two groups share the whole measure where there is room and still
drop to one column in a narrow pane. Re-measured: 2 groups at 1440 are two 651px
columns with **0px dead**; at 768, two 356px; at 375, one. Only 1 and 2 need
capping -- the split's 92rem cap means the stream is never wider than 1326px,
which is three columns, so a class with three or more groups cannot out-run the
tracks.

Two further things were checked rather than assumed, because multicol changes
how fragmentation and containing blocks work: a row menu opened inside a card in
the second column is right-aligned to its own trigger and hit-testable
(`rightAlignedToTrigger: true`, `belowTrigger: true`, top hit inside the menu);
and the pointer-drag reorder and filing-by-drag specs on `/dev/classroom-split`
run 12 route/width runs and 144 measurements with 0 outside threshold.

The reading order changes from row-major to column-major, which for an ordered
list of units is the order they are numbered in: Unit 1 then Unit 2 down the
left rather than Unit 1 left, Unit 2 right, Unit 3 left.

## THREE: the link popover sliced off the right of its editor

Same route, narrower windows: the popover opens with a URL field, an Add button,
and a second button clipped past its container's right edge.

**Measured on `/dev/item-images`**, editor right edge against popover right
edge:

| viewport | editor right | popover right | over | what is lost |
| --- | --- | --- | --- | --- |
| 375 | 342.0 | 335.4 | -6.6 | nothing (the media query covers it) |
| 520 | 487.0 | 591.2 | **+104.2** | Add and Cancel entirely |
| 600 | 567.0 | 671.2 | **+104.2** | Add and Cancel entirely |
| 700 | 667.0 | 693.2 | **+26.2** | Cancel sliced down the middle |
| 768 | 735.0 | 693.2 | -41.8 | nothing |
| 1024 | 959.0 | 725.2 | -233.8 | nothing |
| 1440 | 1167.0 | 933.2 | -233.8 | nothing |

`.rt-editor` carries `overflow: hidden`, so what runs past is CUT rather than
merely overflowing. The screenshot at 700px reads `https://` | `Add` | `Canc`.

**A `@media (max-width: 30rem)` rule already existed and fixed the phone, which
is why the band from 481px to about 740px went unnoticed.** The deeper problem
is that a media query is the wrong instrument here at all: the panel was
`position: absolute` at `left: 0` of the LINK BUTTON, so how far past the editor
it runs is a function of where the wrapping toolbar happened to put that button
and how wide the toolbar is -- not of the viewport. Another threshold would have
moved the band, not closed it.

`use:anchored` closes it, and it is the SHARED implementation rather than a
fourth copy: `$lib/shell/anchored.ts`, which `InfoTip` and the grading console
already use and **whose own header named this popover as the hand-rolled copy of
it and said it was deliberately not converted.** That sentence is corrected in
the same change. The action writes `position: fixed` plus two coordinates, so
the panel escapes the clip entirely and flips and clamps against the viewport.

Measured after, at nine widths (375, 481, 520, 600, 700, 740, 768, 1024, 1440):
every control's own box inside the viewport and reachable by a hit test at its
centre, at every one, with no horizontal scroll. At 740 and above the panel
keeps the position it always had (x=343 at 740, matching the pre-fix geometry);
below that it flips and clamps. The picture popover takes the same treatment: 0
offscreen controls at every width, and outside-dismiss still works in both
directions (a pointerdown inside keeps it open, one on the body closes it)
because the panel is still a DOM child of `.link-wrap`, which is what
`contains()` is asked about.

One thing the action cannot do is cap a panel WIDER than the viewport -- clamping
keeps its start on screen and lets the far edge run off -- so `.link-pop` keeps a
`max-width: min(30rem, calc(100vw - 1rem))` and `flex-wrap: wrap` of its own, and
its absolute rules stay as the fallback that prints and paints before the first
placement. Verified inside the composer's fixed dialog layer as well, where a
`position: fixed` panel could have been broken by a transformed ancestor: at
375, 700 and 1440 the panel's x matches its trigger's x to within 0.2px and every
control is reachable.

## The guards, and that each of them bites

Three `orderResult` rows, in the browser harness, because that is the only place
these claims can be made. No `tests/dom/` file was added: the rule against
geometry there is not a formality, it is that such a test READS ZERO AND PASSES.

Each was mutation-proved against the pre-fix code rather than assumed:

* **names not painted over** (`notebook-review`) -- restored `z-index: auto` and
  it reports `5/13 points under a cell` at 375 and `5/4/5/5` at 1440.
* **no dead run down a column** (`classroom-stream`) -- restored the `auto-fit`
  grid and it reports `largest gap 725px` against a 40px threshold at 1440.
* **the popover escapes its editor** (`item-images`) -- removed both
  `use:anchored` directives and it reports `positioned inside the editor, which
  clips it` at both widths.

Every mutated file was restored from a copy taken beforehand and md5-checked
identical, never with `git checkout --`.

**TWO OF THE THREE HAD TO CREATE THE REGIME THEY MEASURE, and a first draft of
each was vacuous until it did.** The harness drives 375 and 1440 only:

* At 1440 the notebook fixture's grid overflows by 24px against a 176px header,
  so there is physically no room to slide a cell under a name. The first draft
  reddened at 375 and could not at 1440. The probe now caps the scrollport to
  the header plus 120px -- the regime a class of thirty check-ins is in all the
  time -- and restores the width before returning.
* 375 and 1440 are the two widths the popover was NEVER broken at. A
  geometry-only row there would have been green on the shipped defect, exactly
  like every content check already was. What is true at every width is the
  MECHANISM, so the row's first element asserts the panel is positioned against
  the viewport, and the geometry is then asked with the editor narrowed to 420px
  so the three controls are measured in the regime that broke rather than the
  one that happened to be safe.
* The scrolled-cell row's positive control refused to reproduce at first for a
  third reason: `inline: 'nearest'` scrolls the least it can, so a cell brought
  in from the RIGHT lands at the scrollport's right edge, which the header is
  nowhere near. It is only a cell arriving at the LEFT edge that can be parked
  underneath. The probe now scrolls fully right and brings the FIRST data cell
  back, which is what an instructor does by holding the left arrow key.

Two absolute px figures were also written into an expectation and taken back
out: the amount there is to scroll is a function of the width being driven, so a
number is right at one width and a finding at the other. Both are phrased as
verdicts now (`the grid does overflow`, `scrolled to the end`).

## What was measured, and what was not

**Measured:** everything above, in Chromium 141.0.7390.37 through
`playwright-core`, against a Vite dev server on 5199. `npx svelte-check`: **0
errors, 37 warnings in 20 files**, breakdown re-derived as 31
`state_referenced_locally` / 5 `css_unused_selector` / 1
`perf_avoid_nested_class` -- the documented baseline, unchanged. `npm test`:
**378 files, 7454 tests**, with `tests/derived-numbers.test.ts` red on 7
assertions before the README regeneration and green after, every one of them the
generated counts region not yet covering the route spec this bundle adds.

**NOT verified:** nothing was run against the live Supabase project, and nothing
in this container can be -- the local `.env` is the placeholder `example-ref`
project. No signed-in production surface was opened. The `/dev` harness is the
whole of what the browser pass covers, which is the boundary that has always
applied to it. `prefers-reduced-motion` is `no-preference` in the harness, so
that path is not exercised here; none of these three changes touches an animated
rule. Web fonts are blocked by the harness, so every figure above is in the
fallback stack -- which affects text metrics and therefore the exact panel
heights, not the mechanism any of the three rows asserts.

**Not done, deliberately:** `/dev/classroom-stream` is driven at 375 and 1440 by
the harness, not at 1196. 1196 is a two-column width and 1440 is a three-column
one, so the mechanism is exercised at both; the 1196 figures in this entry were
taken by hand. Adding per-spec widths to `tools/browser-verify` would be a
change to the harness's own contract and belongs in its own bundle.
