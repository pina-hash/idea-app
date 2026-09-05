---
title: "A table row that more than doubled, priced per page instead of per row, and reordering dropped to pay for it (`claude/spec-table-row-height-7k2kz4`, no migration)"
date: 2026-09-05
branches: [claude/spec-table-row-height-7k2kz4]
migrations: []
subsystems: ["IDEA Classroom", "Browser harness", "Standards"]
---

Prompt 0048. No migration, no database, no new dependency. One markup change of five
lines, one function deleted, a browser route that measures a page instead of a row, and
a decision entry that hands Mr. Pina the thing the change costs.

Started from `origin/integration` at `17be15b`, which is 25 commits ahead of
`origin/main`. Working directory `/home/user/idea-app`. `git` already carried a
committer identity, so the failure the prompt warns about did not arise and nothing was
set.

## The question

Prompt 0043 fixed a real defect. The spec table's four row-action glyphs were 23.2x23.2,
under the 44px floor and under the 24px absolute floor too, recorded as a permanent
finding by prompt 0039 and then fixed under step 1 of `IDEA_INTERFACE_STANDARDS` 10
(2.12): laid 2x2 at 44px inside the 6.4rem column that was already declared. The column
NARROWED, the table's own horizontal scroll got SHORTER, and nothing beside it moved.

It cost row height, 40.4px to 98.3px, and 0043 said so plainly. What it could not say is
what that does to a page, because nobody had measured a page. Every number this surface
had ever produced was a per-row number taken on `?empty=1` with a single blank row.

## What a real spec table actually is, read rather than assumed

Across the 26 `table` blocks in the 14 assignment specs under `materials/`:

- `minRows` is **4 in 15 of the 26**, then 1 (x4), 5 (x2), 6 (x2), 2 (x2), 3 (x1).
- Per assignment PAGE the total is **1 at the least, 8 at the median, 16 at the worst**,
  spread over one to three table blocks.

So the prompt's 3 / 6 / 12 brackets a page that exists rather than a stress case, and 12
sits between the median page and the worst one.

## A1: the page cost, measured

375px, `/dev/spec-table?rows=N`, filled rows, the module opened and every cell refitted,
against a 667px phone viewport. "Scroll" is the distance from the top of the table to the
bottom of the Add row control beneath it, over 667.

| rows | before 0043 | 2x2 at 44px (0043) | two on one line (this bundle) |
|---|---|---|---|
| 3 | 271.9px table, 0.48 screens | 364.7px, 0.62 | 282.9px, 0.50 |
| 6 | 437.0px, 0.73 | 658.0px, 1.06 | 459.0px, 0.76 |
| 12 | 789.3px, 1.26 | 1244.5px, 1.94 | 822.3px, 1.31 |

The "before" column is the whole `SpecRenderer.svelte` as it stood at `5aa1e22^`, written
into the working tree with `git show` over a `cp` copy and restored FROM THAT COPY, md5
verified (`997d2ca...`). `git checkout --` was not run on any file at any point.

At 1440 the same twelve-row table is 1199.1px under the 2x2 and 652.9px now, and the
table does not scroll horizontally there at all (wrapper 1358 = table 1358), so the whole
width argument below is about 375.

**The headline: at the busiest real page size, step 1 had put nearly two full phone
screens between a student and the bottom of one table, against 1.26 before the fix it
was part of.**

## A2: what the four controls do, and which of them earn the room

Move up (`↑`), move down (`↓`), duplicate (`⧉`), delete (`✕`). There is no telemetry in
this repo, so "how often" is answered from what the controls DO and from two measurements
rather than from usage data, and this bundle does not claim otherwise.

- **Exactly two of any table's move controls are permanently disabled** -- the first row's
  up and the last row's down. Measured on the real page: 2 of 4 at one row (50%), 2 of 12
  at three, 2 of 48 at twelve. Four of the 26 real blocks declare `minRows: 1`, and
  `addRow` adds one at a time, so the 50% case is the state every table passes through.
- **Reordering costs one tap per position**, so it degrades exactly where it would matter:
  11 taps to bring the last row of a 12-row table to the front.
- **Nothing downstream reads row order.** `tableRowFilled`, `blockProgress` and
  `_classroom_spec_unmet` all count FILLED rows. The export writes rows in stored order
  either way, so a grader sees what was typed.
- Delete is the control an over-add needs and is never disabled. Duplicate is the one that
  saves typing on a lab log where a column repeats down the table, and is never disabled.

## A3: every arrangement, priced

375px, 12 rows, each measured on the real component with an injected stylesheet rather
than calculated.

| arrangement | typical row | table height | ops column | table scrollWidth | taps to delete |
|---|---|---|---|---|---|
| 2x2 at 44px (0043, shipped) | 97.8px | 1244.5px | 100px | 628px | 1 |
| four on one line at 44px | 62.4px | 822.3px | 192.8px | 721px | 1 |
| three on one line | 62.4px | 822.3px | 146.4px | 674px | 1 |
| **two on one line (chosen)** | **62.4px** | **822.3px** | **100px** | **628px** | **1** |
| one overflow trigger, four behind it | 62.4px | 822.3px | 53.6px | 582px | 2 |
| one control, delete only | 62.4px | 822.3px | 53.6px | 582px | 1 |
| no column, act on a selected row | 62.4px | 822.3px | 0px | 528px | 2 |

At 1440 the same sweep is 97.8px against 51.4px for every one-line row, table 1199.1
against 652.9.

**THE RESULT THAT DECIDED IT: every one-line arrangement returns the identical row.** The
row-action cell stops setting the row height the moment it is one line tall; past that
the cell content sets it. Four controls on one line give back exactly as much height as
zero controls do. So the choice is not about height at all, which is not what the
question looked like going in.

What separates them is width and taps. Two controls is the only row whose width figures
are exactly what the 2x2 already measured -- 100px column, 628px table scrollWidth --
so nothing beside it moves and no scroll gets longer. Four on one line widens a table
inside a 293px wrapper, which is the widening step 3 refuses at the narrow width. The
overflow menu and the selected-row column each cost the most common action a second tap,
on a control pressed at a bench on a phone, and a menu is not a disclosure
(`aria-haspopup`, outside-dismiss, focus management) so it is also much the largest build
of the seven.

## A4: what step 2 requires, quoted

> 2. **If no arrangement fits, the row carries fewer controls.** Move the surplus behind a
> deliberate affordance, or drop a function. Four controls in a cell with room for two is
> a design decision taken without measuring, and correcting it is the fix rather than an
> exception to the floor. This step changes what the surface can do, so it is raised to
> the surface's owner rather than taken inside the bundle that found it.

Two things follow. The clause names this surface's shape in its own words -- "four
controls in a cell with room for two" -- and it assigns the answer to an owner, not to
the bundle. `docs/decisions/entries/13-spec-table-row-actions-reorder.md` is that
raising: status open, the numbers above, the arrangements tried, what a student loses,
and the two ways back if the answer is no. The change is on the branch so that answering
"no" is a revert rather than a lane.

One honest qualification: step 2 opens "if no arrangement fits", and step 1 DID fit -- it
is what shipped. What it did not do is fit within a page. The reading taken here is that
"fits" is a claim about the surface a student uses and not only about the column, which
is the reading the prompt commissioned.

## B1: chosen, and what it is

Two controls, duplicate and delete, on one line at 44px, in the 6.4rem column that has
been declared since the glyphs were 23.2px. Five lines of markup removed and `moveRow`
deleted with them; `RubricBuilder.svelte` has a `moveRow` of its own on an
instructor-only surface and was not touched.

The `.row-ops` grid is deliberately left at `repeat(2, 44px)` rather than turned into a
flex row: two tracks with two children is one line, and stating it as a grid is what
makes a third control wrap visibly instead of silently taking the row back to 98.3px.

## Two claims that were wrong until they were measured

**The 44px cell floor.** With the 2x2 grid gone, the obvious conclusion was that
`.cell { min-height: 44px }` (added by 0044 on the argument that a 98.3px row made it
free) had become the binding constraint, and the comment was rewritten to say it now cost
11px a row. Deleting that ONE rule and changing nothing else says otherwise: rows
127.4/51.4/62.4 and table 822.3px, identical either way. The 44px BUTTON beside the cell
is what holds a short row at 51.4. The arithmetic that said 11px was comparing two trees
that differed in more than that rule. The comment now carries the isolation.

**The module's collapse state.** The first draft of the new browser row omitted a
click-open step, on the strength of a reading taken at `networkidle` where the module had
not collapsed yet. Every number came back 0px and every presence row read `visible 0`.
The harness caught it; the reading had not.

## B2: the browser rows

`tools/browser-verify/routes/spec-table-rows-12.mjs` is new. It opens the module, reports
the re-opened state, refits, then reports and GATES the page cost:

    12 rows at 375px: table 822.3px (68.5px a row), block 883.8px,
    top of table to Add row 872.6px = 1.31 phone screens (667px tall)
    12 rows at 1440px: table 652.9px (54.4px a row), block 714.5px,
    top of table to Add row 703.3px = 1.05 phone screens (667px tall)

Both axes come from `tapTargets`, which already prints `WxH` beside the threshold: 44x44
controls, 96x44 cells at 375 and 241.5x44 at 1440, 69.2x44 Add row.

**The gate is per ROW, not on the table's total**, and that is a correction made during
the run rather than a design. A 700-950px band tuned on the 375 figure reported the
correct 1440 measurement (652.9px) as a failure -- a true reading judged against the
wrong threshold. Per row the two are 68.5 and 54.4, and the 2x2 is 103.7 and 99.9, so
45-80 separates them at both widths.

`spec-table-empty-1.mjs` gains a presence row pinning the control count at exactly two in
both directions, and its two stale paragraphs are corrected in place.

## B3: the positive control

The component alone was reverted to HEAD (the specs left as built) and the three
spec-table routes re-run. **8 measurements outside threshold, 4 per width, every one of
them the thing that changed:**

- `presence [row action controls in that row]` on `?empty=1`: present 4, threshold 2.
- `presence [row action controls]` on `?rows=12`: present 48, threshold 24.
- `presence [row reorder controls (dropped, step 2)]`: present 24, threshold 0.
- `prepare-eval [page cost]`: 103.7px a row at 375 and 99.9 at 1440, outside 45-80,
  printing table 1244.5px / 1.94 screens and 1199.1px / 1.87.

The two positive-control rows beside the absence row -- 12 delete controls, 12 duplicate
controls -- stayed GREEN in both states, so "0 reorder controls" is not a selector that
matches nothing. `/dev/spec-table` and `/dev/spec-table-open` were untouched in both
states, correctly: neither asserts a control count. Restored from the `cp` copy,
md5 `fa3d3139cf0788a027b323a582a7bf3b`, and re-run to 0 outside threshold.

## Found and NOT fixed, handed on under section 12

**A table cell mounted inside a collapsed module never grows to fit its content.**
`use:autoresize` writes `style.height` once at mount and then only on `input`; a textarea
inside a closed disclosure has `scrollHeight` 0, so it fits to nothing and never re-runs.
A module collapses once it is COMPLETE, so this is the state of every finished table a
student re-opens. Measured at 375 on `?rows=12`: **19 of 60 cells clipped by
`overflow: hidden`**, table 658.8px against 822.3 refitted. At 1440 it is 1 of 60.

The 44px tap floor is SAFE -- `min-height` clamps every cell to at least 44px, measured 0
of 60 under the floor -- so this is not a floor violation and 2.12's "never a standing
finding" does not bite. What is lost is the sight of the writing until the student taps
into the cell. It is reported as a number by the new route on every run rather than left
to be rediscovered. Not fixed here: the fix is a re-fit on visibility, which belongs to
`autoresize` and to whoever owns the disclosure interaction, and this bundle owns the
row-action column.

## Also found: the counts block's `covered` set

A5. `outside` is 0 with `outsideRows: []`, and the measured half's `covered` list held
101 entries against 102 spec files in the tree -- `foundry-admin-refusal.mjs`, added
after the measurement at `b09f1c0`. Honestly stale rather than wrong: the block records
its sha and `dirty: false`, and 0046's own README text says a stale-but-honest measured
half is supported. `npm run verify:counts` prints the gap by name and now names this
bundle's new spec beside it; the full `verify:readme` run at the end of this session
closes both.

## Not verified

- **No signed-in surface was opened.** Everything here is `/dev/spec-table`, which mounts
  the real `SpecRenderer` with no auth and no Supabase. A real assignment on a real class
  page was not loaded, and the local Supabase stack was not started (the prompt said it
  was not needed).
- **No phone.** Every figure is Chromium 141 at a 375x667 viewport. Whether 98px rows were
  a fair price, or 62px are, is Mr. Pina's check with a real device in his hand.
- **Web fonts do not load in the harness** (`fonts.googleapis.com` is blocked), so all
  text is measured in the fallback stack, and `prefers-reduced-motion` is
  `no-preference`, so that path is not exercised.
- **No usage data.** A2's frequency argument rests on what the controls do, on the
  disabled-control count and on the tap cost, not on any record of students pressing them.

## No new automated test, deliberately

CLAUDE.md permits a test only for a guarantee whose regression would be SILENT. This one
is loud: the control count and the page cost are both gated at both widths by the browser
rows, and the positive control above proves they bite. A DOM test asserting the same two
counts would be a second copy of a rule that already has one.
`tests/classroom-spec-table-rows.test.ts` and `tests/dom/spec-table-add-row-mount.test.ts`
both count `td.row-ops` per row and one reads `title="Delete row"`; neither depended on
the four controls and both pass unchanged.
