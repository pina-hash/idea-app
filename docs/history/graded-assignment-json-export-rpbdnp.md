---
title: "Graded work leaves the grading console as JSON for a model and as a formatted workbook for a person, with identity as a switch recorded inside the file; scope 3 refused as a different query shape (`claude/graded-assignment-json-export-rpbdnp`, no migration)"
date: 2026-08-31
branches: [claude/graded-assignment-json-export-rpbdnp]
migrations: []
subsystems: ["Classroom", "Testing"]
---

The grading console had exactly one export, `gradesCsv`: last name, first name,
score, out of. That is a FACTS gradebook import and is four columns wide on
purpose. Nothing in the app could hand somebody the WORK -- what was asked, what
came back, which checks were unmet, which rubric level was chosen and why -- so a
teacher wanting a second read on a class had nothing to give one.

Three controls now sit beside the CSV, all in `.roster-head`'s own card:
**JSON: this student**, **JSON: whole class**, **Spreadsheet: whole class**.

## What was built

- `src/lib/classroom/grading-export.ts` -- the pure builder. Takes the section,
  the item, the stored spec, the stored rubric and `studentWorkRows(...).rows`,
  and returns one object. `gradingExportJson` serializes it tab-indented (the
  repo's own JSON style); `gradingExportSheets` reshapes the SAME object into
  five tables; `gradingExportFilename` names the file.
- `src/lib/xlsx.ts` -- a minimal XLSX writer over `buildZip` from
  `$lib/foundry/zip-write.ts`. Inline strings, one style per role, a frozen bold
  header, per-column widths, an autofilter. No dependency.
- `GradingConsole.svelte` -- the three controls, the identity checkbox, the
  confirmation sentence, and ONE `download` helper the CSV now shares (it had
  its own inline copy).
- `/dev/grading-incomplete` -- the existing harness, extended rather than
  replaced, plus two `tools/browser-verify` route specs.
- `tests/grading-export.test.ts` -- 22 assertions, and the reason for each is
  below.

## The load-bearing decisions

**IT ADDS NO READ, NO RPC AND NO GRANT, AND THAT IS THE WHOLE AUTHORIZATION
STORY.** Every field in the export is already on screen in the console: the
export is built from the `GradingData` the console's own `loadGrading`
transport returned, which RLS scoped with `classroom_can_review_submission`
plus the roster read. So "export exactly what the caller can already read" is
not a check the exporter performs, it is a property of where its input comes
from. No service role, no definer function, no new select. A field that would
need one is a field this module does not have.

**SCOPE 3 -- EVERY ASSIGNMENT FOR A WHOLE SECTION -- IS DELIBERATELY NOT HERE,
AND THE REASON IS THE SAME SENTENCE.** The console is handed ONE item, one
spec and one rubric. All assignments would need `itemsForSection` filtered to
`kind === 'assignment'`, then per assignment a `classroom_assignment_specs`
select, a `classroom_rubrics` select and a `loadGrading` (which is itself five
parallel queries) -- roughly `7n` round trips, thirty-odd assignments in a real
section, from a browser, on a page a teacher is mid-grading on. That is a
different query shape and a real slow-load risk, not another argument to
`buildGradingExport`. **The JSON shape already anticipates it**: the top level
carries `assignments: [...]` and `counts.assignments`, so a third scope is a
longer array and not a new format. `ExportScope`'s own comment records this so
the next session does not rediscover it.

**IDENTITY IS A SWITCH, DEFAULTED ON, AND THE STATE IS WRITTEN INSIDE THE
FILE.** `export.identity` and `export.identityNote` are top-level and present
in BOTH states, and the workbook repeats them on its own "About this export"
sheet -- a spreadsheet gets forwarded without the message it arrived in. Off,
every student becomes `Student <n>`.
  - **THE LABEL IS ASSIGNED FROM THE WHOLE ROSTER, NEVER FROM WHAT WAS
    EXPORTED**, so `Student 3` is the same person in a one-student export and in
    that assignment's class export. Labelling within the exported subset would
    make a single-student file always say `Student 1`, which is stable and
    useless.
  - **A GRADER'S ADDRESS IS AN IDENTITY TOO.** `graded_by` and the item's
    author ride the same switch, so `omitted` means no addresses in the file
    rather than no STUDENT addresses in the file. That was the easy thing to
    miss: the switch is about students and `graded_by` is right there in the
    submission row.
  - **THE FILENAME CARRIES IT** (`-anon`), because two class exports of one
    assignment are otherwise indistinguishable in a downloads folder.

**THE UNMET LIST IS `specUnmet`, NOT A SECOND WALK OF THE SPEC.** The console's
own Incomplete chip reads that pure mirror of `_classroom_spec_unmet`; a second
implementation inside the exporter is exactly the copy that stops agreeing with
the screen. And only work that was HANDED IN can be incomplete, mirroring
`incompleteCount` -- everyone still working is unfinished by definition.

**A STUDENT WHO HANDED IN NOTHING IS IN THE FILE WITH AN EMPTY RECORD.** Every
block of the spec is listed for them, `started: false`, empty value. An export
listing four of five students reads as a class of four, and "was asked and left
blank" has to be tellable from "was never asked".

**THE WORKBOOK IS DERIVED FROM THE JSON OBJECT, NOT FROM THE CONSOLE'S ROWS.**
One builder, two renderings, so the two files cannot disagree about a number or
about whether a name is in them. Five sheets: Grades (one row per student, with
a score AND a level column per criterion), Unmet checks, Responses, Files, About.

**WHY XLSX AND NOT A SECOND CSV.** A CSV opens in Sheets but carries no frozen
header, no widths, no wrapping -- and this data has a paragraph of a student's
writing beside a single digit -- and it cannot carry more than one table, which
would have made this five downloads. The format's minimum is six XML parts in a
zip and `buildZip` was already here, spec-correct with CRC-32. `npm install` in
this repo reformats a 4,649-line lockfile, so not-a-dependency was worth the XML.
Sheet element order (`dimension`, `sheetViews`, `sheetFormatPr`, `cols`,
`sheetData`, `autoFilter`) is the schema's and not a preference; out of order the
part is invalid and the workbook does not open at all.

## What was measured

- **`svelte-check`: 0 errors, 37 warnings, 31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`.** Baseline, re-derived
  after `svelte-kit sync` with the two `$env/static/public` placeholders
  exported.
- **Full suite: 225 files, 4637 tests, all passing**, 188s.
- **`npm run verify:browser -- --route grading-incomplete`: 4 route/width runs,
  86 measurements, 0 outside threshold.**
  - Horizontal scroll 0px at 375 and 1440 on both routes.
  - Tap targets, smallest dimension: JSON this student 199.4x44, JSON whole
    class 190.7x44, Spreadsheet 251.3x44, the identity switch measured AT ITS
    LABEL 268.6x44 (375px) and 1333.6x44 (1440px), Export CSV 130.1x44. The
    three buttons inherit `.cr-root .cr-console .btn`'s `min-height: 44px`; the
    switch has its own `min-height` on the label, because the checkbox inside
    it is 18px and no sizing of the box would change what a finger hits.
  - Contrast: the identity sentence 6.84:1, the group heading 6.84:1, the
    switch label 14.5:1, the confirmation 7.44:1, all on rgb(22, 26, 24).
  - Four real files produced by pressing the real controls, named
    `...-student-1.json`, `...-class.json`, `...-class.xlsx`,
    `...-class-anon.json`.
  - Identity both ways, read out of the produced bytes:
    `["anon.json:false","class.xlsx:not-read","class.json:true","1.json:true"]`.
    The two `true`s are what make the `false` mean something.
  - Counts: roster on screen 5, students in each file `[5, 5, 1]`. Unmet checks
    summed off the console's own chips 9, against 9 parsed back out of the class
    JSON.
  - The empty record: 5 students in the anonymous class file, 1 of them not
    handed in (Dara), present rather than dropped.
  - 0 console errors at both widths.
- **Mutation proof.** `rubric: null` forced into `buildGradingExport`'s
  assignment output (the permissive direction: the file still builds and still
  looks plausible). 2 of 22 assertions reddened -- "carries the spec and the
  rubric AS STORED" and the Grades sheet's per-criterion columns. Restored from
  a `cp` copy in the scratchpad, never `git checkout --`; md5 `7bd56f23d09db0a85a2ab8b7ed4129b1`
  before and after, suite back to 22/22.

## Two defects the harness found, both real

- **A duplicate-key crash on a second press of one control.** The capture list
  was keyed on `name + size`, and two presses of the same export produce two
  files with the same name and the same size. At 375px a `clickUntil` retried
  twelve times and produced 11 `each_key_duplicate` console errors. A monotonic
  id fixes it. It is harness-only code, but it is the shape of the bug worth
  knowing: a key derived from content is not a key.
- **45px of horizontal overhang at 375px**, entirely from the harness page's own
  oracle tables, which predate this bundle. Each table is now in its own
  `overflow-x: auto` box, which is what CLAUDE.md already asks for and what took
  both widths to 0px.

## Not verified

- **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder project; no RPC, no migration, no real roster. Every claim here is
  against the dev harness's in-memory fixture and the embedded-Postgres suite.
- **The workbook was never opened in Google Sheets or in Excel.** What is proven
  is that the bytes are a readable zip carrying the six parts, that the five
  sheets are named and related correctly, and that the frozen pane and autofilter
  are in the sheet XML -- read back through this repo's own
  `readCentralDirectory` / `inflateEntry`. Whether Sheets renders it the way it
  is meant to has not been observed by anybody.
- **`prefers-reduced-motion` is `no-preference`** in the harness, and web fonts
  are blocked, so every contrast figure above is measured in the fallback stack.
- **No signed-in pass.** The real `/classroom/[sectionId]/item/[itemId]/grade`
  needs a Bosco Tech Google session; the console is mounted here through the dev
  harness, which mounts the REAL component.

## Deferred

- **Scope 3**, per above. It wants a session that can decide how many round
  trips a class export is allowed and whether the answer is a paged, staged
  client-driven job (the long-running-job convention) rather than one press.
- **No `classroom-updates.json` entry**, deliberately: nothing a student sees
  changes. The controls are on an admin/manager surface only.
- The `About this export` sheet says in words that the spec and rubric are NOT
  in the workbook and that the JSON beside it is the file to hand a model. A
  future bundle could put the spec on its own sheet; it was left out because a
  spec is a nested document and flattening one into a grid loses the structure
  that makes it readable.
