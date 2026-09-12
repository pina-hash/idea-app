# 13 The spec table's row actions: reordering dropped to give a student back the page
- Raised: 2026-09-05  By: prompt 0048, `claude/spec-table-row-height-7k2kz4`
- Status: open -- MEASURED 2026-09-12 and this entry was RIGHT; the decision it asks
  for is still unanswered, so it stays owed.
- Decision: still blank, deliberately. What Mr. Pina said on 2026-09-12 was that
  drag-to-reorder works for him right now, which CONTRADICTS this entry -- so prompt
  0173 read the component rather than recording either claim. THE ENTRY IS CORRECT:
  the spec table's row reordering is gone, at every width, and gone on `main` too.
  What he is using is reordering on a DIFFERENT surface. That is a report about
  another screen and not an answer to the question below, and no code was changed.
- Measured: 2026-09-12, by reading the source on `origin/integration`.
  `src/lib/classroom/SpecRenderer.svelte` **lines 613-616** are the whole of a spec
  table's row-action cell, and they hold TWO controls: Duplicate row and Delete row.
  There is no `moveRow` function in the file -- the only occurrence of the name is
  **line 1130**, inside the comment explaining its removal -- and `grep -rn moveRow
  src/` finds it nowhere else in the classroom except `RubricBuilder.svelte`.
  **Line 1151** pins the arrangement as `grid-template-columns: repeat(2, 44px)`.
- At what widths: ALL of them. `SpecRenderer.svelte` contains **zero** `@media` and
  **zero** `@container` rules, so there is no width at which a third or fourth
  control appears. The cell is gated only on `canEdit` (**line 127**,
  `!locked && !readonly`), which is about whether the table is editable at all, not
  about the viewport.
- On `main`, not just here: the removal is commit `be46fe87` ("Assignment tables: two
  row controls on one line, and the page cost measured", 2026-09-05 17:17Z), and
  `git merge-base --is-ancestor be46fe87 origin/main` answers yes. Reading
  `origin/main`'s copy of the file directly, `grep -c "function moveRow"` is **0**
  and lines 613-616 are the same two buttons. So production has no spec-table row
  reordering either.
- What he is most likely using: reordering is alive on FIVE other classroom surfaces,
  all of which an instructor touches far more often than a student's sample table.
  `ClassView.svelte` is the strongest candidate and matches "drag": it has both
  drag-to-reorder (**line 507** onward, via `$lib/classroom/sort-drag`, which is also
  on `main`) and a row menu carrying worded **Move up** / **Move down**
  (**lines 1234** and **1240**) for items within a unit group. The others are
  `ContentComposer.svelte` **2171**/**2180**, `RubricBuilder.svelte`
  **420**-**421** (glyph arrows on a criterion), `FileUploadPanel.svelte`
  **687**/**696**, and `AttachmentList.svelte` **382**/**391**. Note that a spec
  table is a STUDENT's grid, filled in at a bench -- an instructor has little reason
  to be typing in one, which is why the confusion is the expected one rather than a
  surprising one.
- By-catch, reported and not fixed: `RubricBuilder.svelte`'s reorder arrows are
  `1.75rem` squares (**lines 595-596**), rising to `2.75rem` only under
  `@media (max-width: 640px)` (**line 686**). So the one reorder control nearest this
  entry's subject sits at 28px on a desktop, under the 44px floor, with no named
  instructor-only class on its root to claim the 24px floor. That is the shape of
  decisions 09 and 12 and belongs with them, not here.
- Still open, unchanged: whether losing in-place row reordering is a fair price for
  roughly a third of a phone screen per table. His remark was a report that it works,
  not an answer to that -- and it was a report about a surface this entry is not
  about. The default below still stands and the two ways back are still the two ways
  back.
- Default this assistant would pick: keep the change as shipped -- two row actions
  (duplicate, delete) on one line at 44px, reordering gone -- because it is the only
  arrangement measured that returns the row height while moving nothing beside it and
  keeping the most common action at one tap.
- Why it is blocked on him: it is `IDEA_INTERFACE_STANDARDS` 10 (2.12) step 2, which says
  in its own words that carrying fewer controls "changes what the surface can do, so it
  is raised to the surface's owner rather than taken inside the bundle that found it."
  A student who could reorder rows on Monday cannot on Tuesday, and whether that is a
  fair price for roughly a third of a phone screen per table is a judgement about a
  student's morning, not a number.
- What it unblocks: nothing is waiting on it. The change is already on the branch, so
  answering "no" is a revert of one commit rather than a lane.
- Context: `src/lib/classroom/SpecRenderer.svelte`, the comment above `.row-ops`;
  `docs/standards/IDEA_INTERFACE_STANDARDS.md` section 10 (2.12), the four-step conflict
  order; decision 09, which is where that clause came from; the history entry for this
  branch; `tools/browser-verify/routes/spec-table-empty-1.mjs` and
  `spec-table-rows-12.mjs`, which measure it every run.

## The surface

The table block in an assignment spec: the grid a student fills in at a bench, one row
per sample. Each row carried four glyph controls in a column of its own -- move up, move
down, duplicate, delete.

## How it got here

Prompt 0039 measured those four at 23.2x23.2 on 2026-09-04, under the 44px floor and
under the 24px absolute floor too, and recorded it as a permanent finding. Prompt 0043
fixed it under step 1 by laying the four out 2x2 at 44px inside the 6.4rem column that
was already declared: no width cost, no new horizontal scroll, and a row that went from
40.4px to 98.3px. That was the right call on the numbers it had. The number it did not
have is the one below.

## The numbers

Measured on `/dev/spec-table?rows=N` at 375px, filled rows, the module open and
`autoresize` settled, against a 667px phone viewport. "Scroll to Add row" is the distance
from the top of the table to the bottom of the control beneath it.

| rows | before 0043 | 2x2 at 44px (shipped 0043) | two on one line (now) |
|---|---|---|---|
| 3 | 271.9px table / 0.48 screens | 364.7px / 0.62 | 282.9px / 0.50 |
| 6 | 437.0px / 0.73 | 658.0px / 1.06 | 459.0px / 0.76 |
| 12 | 789.3px / 1.26 | 1244.5px / 1.94 | 822.3px / 1.31 |

Read off the 26 real table blocks under `materials/`: `minRows` is 4 in 15 of them, and
the per-page total is 8 in the median case and 16 at the worst. So a busy page is not a
stress case, and at 12 rows step 1 had put roughly two thirds of a phone screen between
a student and the bottom of one table.

## The arrangements tried

All at 375px, 12 rows, each measured on the real component rather than calculated.

| arrangement | typical row | table height | ops column | table scrollWidth | taps to delete a row |
|---|---|---|---|---|---|
| 2x2 at 44px (step 1, shipped) | 97.8px | 1244.5px | 100px | 628px | 1 |
| four on one line at 44px | 62.4px | 822.3px | 192.8px | 721px | 1 |
| three on one line | 62.4px | 822.3px | 146.4px | 674px | 1 |
| **two on one line (chosen)** | **62.4px** | **822.3px** | **100px** | **628px** | **1** |
| one overflow trigger, four behind it | 62.4px | 822.3px | 53.6px | 582px | 2 |
| one control (delete only) | 62.4px | 822.3px | 53.6px | 582px | 1 |
| no column, act on a selected row | 62.4px | 822.3px | 0px | 528px | 2 |

Every one-line arrangement gives the identical row back, because the row-action cell
stops setting the row height the moment it is one line tall. So the choice is not about
height. It is about width and taps, and two controls is the only row in that table whose
width figures (100px, 628px) are exactly what the 2x2 already measured -- nothing beside
it moves. Four on one line widens a table whose wrapper is 293px, which is the widening
step 3 refuses at the narrow width. The overflow menu and the selected-row column each
cost the most common action a second tap.

## What a student loses

Reordering rows in place. There is no replacement affordance: a student who enters
samples out of order retypes them, or duplicates and deletes.

What they do not lose: any credit. No gate reads row order -- `tableRowFilled`,
`blockProgress` and `_classroom_spec_unmet` all count FILLED rows -- and the export
writes rows in stored order either way, so a grader sees exactly what was typed.

## Why this pair was the surplus

Two of any table's move controls are permanently disabled: the first row's up and the
last row's down. On a one-row table that is 2 of 4, and 4 of the 26 real blocks declare
`minRows: 1`. Reordering also costs one tap per position, so it degrades exactly where
it would matter most: 11 taps to bring the last row of a 12-row table to the front. A
control that is dead on a short table and impractical on a long one, charged against
every row of every table, is what step 2 means by surplus.

## If the answer is no

Two ways back, both cheap. Restore `moveRow` and its two glyphs and accept the 98.3px
row again; or keep the height and put all four behind one overflow trigger, which the
table above prices at a 53.6px column and a second tap per action. The first is a
revert. The second is a real build: a menu is not a disclosure, and `CLAUDE.md` says so.
