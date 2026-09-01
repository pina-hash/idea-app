---
title: "A table block in the graded-work workbook becomes real rows and real columns instead of one pipe-joined string in one cell, with blank rows dropped and row heights capped (`claude/graded-assignment-json-export-rpbdnp`, no migration)"
date: 2026-09-01
branches: [claude/graded-assignment-json-export-rpbdnp]
migrations: []
subsystems: ["Classroom", "Testing"]
---

**THE FILENAME IS SUFFIXED.** The convention is `docs/history/<branch slug>.md`
and this session's branch already has one: `graded-assignment-json-export-rpbdnp.md`
is the shipped record of `3b12b14`, the bundle this one corrects. CLAUDE.md's
harder rule is that an entry is written once and left alone, so this is a new
file rather than an edit, following the precedent
`anon-coin-public-projections-mrlg0d-queued-migration-sweep.md` set.

`3b12b14`'s JSON was right. Its workbook was not. A `table` block's response is a
list of rows, each a map of column key to value, and the workbook rendered the
whole thing as ONE STRING IN ONE CELL, labels and values joined by pipes and rows
joined by newlines. Real output from a live export:

```
Component: Arm Stock | What you selected: 6061 aluminum 1/2 McMaster-Carr |
Published specification: the tensile strength is 35,00 PSI | Value it clears: It
clears the minimum by about 34,468 PSI
```

Unreadable, unsortable, unfilterable, and it made the row tall enough to fill the
screen. It is the one block type where a spreadsheet should beat JSON, and it was
worse.

## The shape chosen, and why

**A SHEET PER TABLE BLOCK, falling back to one long-form sheet past eight.**

Per sheet is the readable shape and it is what somebody actually wants when they
are looking at one student's bill of materials: real columns, sortable,
filterable, the identity columns every other sheet leads with so a filter on one
student works the same way everywhere. It does not scale, because a tab bar stops
being scannable somewhere around a dozen and five tabs are already spoken for.

**THE THRESHOLD IS EIGHT (`MAX_TABLE_SHEETS`)**, which is comfortably past every
real assignment (one to four table blocks is the normal shape) and keeps the
workbook at thirteen tabs in the worst case. Past it every table goes onto one
`Table rows` sheet instead: student, block, table, row number, column, value, one
row per cell. Less pleasant to scan, works for any number of blocks with any
columns, and a model reads it fine. **The About sheet states which shape the file
took**, so nobody infers it from the tab bar.

**A TAB NAME COMES FROM THE BLOCK'S OWN MODULE TITLE**, through `sheetName`
(31 characters, no `[]:*?/\`) and then `uniqueSheetName`, which re-truncates the
base to make room for a ` 2` suffix rather than appending past the cap. A name
over 31 characters is a workbook that does not open, and two tables in one
module is ordinary. The five fixed sheet names plus `Table rows` seed the
taken-set, so a module called "Grades" cannot collide with the Grades sheet.

**THE RESPONSES SHEET KEEPS EVERY NON-TABLE BLOCK EXACTLY AS IT WAS**, and a
table's cell there is now a pointer: `2 rows, in the "Photo Evidence" sheet.`,
or `No rows filled in.` when nothing survived. Nothing is lost by looking in the
wrong place.

## The blank-row rule

**`tableRowFilled`, and it is now the ONE implementation.** A row where every
cell is blank (whitespace counts as blank) is a row the student left, and it is
dropped. A row with any cell filled is real and stays whole, empty cells and all
-- the fixture's `Speed Reduction` row, which has a component and a part and no
justification, is real work.

That predicate existed as THREE copies of the same expression before this bundle
(`blockProgress`, `blockStarted`, and the export's own table value). It is now
exported from `assignment-spec.ts` and all four callers read it, which is what
makes it impossible for a table reporting "3 of 4 rows" on screen to then export
four. **This is the whole reason the drop is safe**: the count the console
already shows and the rows the workbook writes are the same question asked once.

**It is a RENDERING rule and the JSON is untouched.** `blockValue` still carries
`rows` verbatim, blanks included, because the JSON is the faithful record of what
was stored. Dropping there would be rewriting a student's submission.

**The number is stated inside the file**, on the About sheet
(`Blank table rows dropped`), because a change to the data is something to say
rather than do quietly.

## Row height and wrapping

**A cap of 90 points, six wrapped lines at 15pt (`MAX_ROW_HEIGHT_PT`).**

The file format has no maximum height: a row is either auto-fit or an explicit
`ht`. So `xlsx.ts` gained `maxRowHeight`, estimates the lines a row wants from
each cell's own length against its column's width (hard newlines counted
properly), and writes `min(estimate, cap)` with `customHeight="1"`. Nothing is
lost -- a reader still shows the whole cell when the row is expanded -- and the
sheet stays scannable. **The estimate says it is an estimate**: a column width in
this format is "how many `0` characters fit" and the text is proportional, so it
is within a line either way, and the cap bounds the error in the direction that
matters.

**Column widths on a table sheet are fitted to the content**, floor 12 and
ceiling 44, because these columns are the student's own and nothing knows in
advance whether one holds `3` or a paragraph about material selection.

## What was deliberately not touched

**THE LaTeX A STUDENT TYPED.** The fixture carries `$\sigma = F/A$` inside the
paragraph cell on purpose, and the test asserts the cell comes back byte for byte
out of the workbook. The export renders; it never rewrites. An escaping bug in
the writer would redden the same assertion.

## `src/lib/xlsx-read.ts`, and why it exists

Every claim worth making here is a claim about the BYTES: the sheet names, a
table sheet's real header row, how many rows survived, whether any row is past
the cap. Two surfaces have to make those claims -- the vitest suite and the
`/dev/grading-incomplete` browser harness -- and a second parser in one of them
is the copy that stops agreeing about what the file says. So the reader is one
module both import, the deliberate mirror of `xlsx.ts` exactly as
`$lib/foundry/zip.ts` is the mirror of `zip-write.ts`.

It reads only what this repo writes (inline strings, plain numbers, no shared
strings, no style resolution) and its header says so: it is an instrument aimed
at `buildXlsx`, not a general reader, and it grows in the same edit `xlsx.ts`
does or every assertion built on it silently starts reading empty cells.

## What was measured

- **`svelte-check`: 0 errors, 37 warnings, 31 / 5 / 1.** Baseline, re-derived.
- **Full suite: 225 files, 4648 tests, all passing**, 190.8s (4637 before; the
  11 new tests are this bundle's).
- **`npm run verify:browser -- --route grading-incomplete`: 4 route/width runs,
  94 measurements, 0 outside threshold** (86 before). The workbook figures are
  read by INFLATING the captured bytes in the page through `$lib/xlsx-read`,
  not by weighing the Blob:
  - Sheet names, out of the file:
    `Grades | Unmet checks | Responses | Three Views | Design Reflection | Files | About this export`.
  - `Design Reflection`'s header row, out of the file:
    `Student | Name | Row | Component | What you selected | Why it clears`.
  - 3 rows on that sheet, against 3 blank rows dropped across the two tables
    (Alice's `t1` trailing row, Alice's `t2` trailing row, Carla's `t2` trailing
    row). The partly filled `Speed Reduction` row is one of the three kept.
  - Tallest row anywhere in the workbook: **90.0pt**, exactly at the cap, which
    is the paragraph row. `<= 90` asserted alongside it, so the check bites in
    both directions.
  - Every check from `3b12b14` still passes unchanged: 0px horizontal overflow
    at 375 and 1440, the four produced files and their names, identity both ways
    out of the bytes, student counts 5/5/1 against the roster on screen, unmet 9
    against 9, the empty record present, 0 console errors.
- **In the vitest fixture** (two tables, different columns, a blank trailing row
  on each, a paragraph cell): 5 stored table rows, **2 blank, 3 kept**, with the
  expected value taken from the fixture through `tableRowFilled` rather than
  from the exporter.
- **Mutation proof.** The flattened pipe-joined rendering put back into
  `answerCell`. 2 of 33 assertions reddened: "leaves a POINTER on the Responses
  sheet, never the old dump" and the long-form fallback's own pointer check.
  Restored from a `cp` copy in the scratchpad, never `git checkout --`; md5
  `24ad428c43678567dc044218dc60e0ad` before and after, suite back to 33/33.

## Not verified

- **Nothing was run against the live Supabase project**, and there was no
  signed-in pass. Same as `3b12b14`.
- **The workbook still has not been opened in Google Sheets or Excel.** What is
  proven is what the bytes contain: the parts, the sheet names and their
  relationships, the header rows, the row counts, the explicit `ht` on every
  body row, the frozen pane and the autofilter. Whether Sheets honours a
  `customHeight` row exactly as intended has not been observed by anybody.
- **The row-height figure is an estimate by construction**, not a rendered
  measurement. 90pt is what the file asks for; what a reader paints was not
  measured.
- Contrast figures are in the fallback font stack (the harness blocks Google
  Fonts).

## Deferred

- Scope 3 (every assignment for a whole section) is still not here, for the
  reason `graded-assignment-json-export-rpbdnp.md` gives.
- The long-form fallback is exercised by a unit test with nine synthetic table
  blocks and by nothing in the browser harness, because the harness fixture is
  a realistic assignment and forcing nine table blocks into it would make every
  other measurement on that route describe a spec nobody would author.
