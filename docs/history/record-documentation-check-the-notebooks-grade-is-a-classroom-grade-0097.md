---
title: "Documentation Check: the notebook's grade is a Classroom grade (`0097`)"
date: 2026-08-13
branches: []
migrations: ["0053", "0097"]
subsystems: ["Digital notebook"]
record_order: 30
---

## Documentation Check: the notebook's grade is a Classroom grade (`0097`)

Migration `0097_notebook_documentation_check.sql` (apply manually after
`0096`). A notebook unit is graded as an ordinary IDEA Classroom assignment,
so a Documentation Check lands in `classroom_submissions` beside every other
grade and exports through the existing FACTS CSV. **The notebook's own CSV
export is GONE** -- see the removal bullet below.

### The one new thing is a LINK, and nothing else

The gap was never grading machinery, it was that a Documentation Check had
nowhere to land. So `0097` adds no grading RPC, no rubric table and no
permission rule of its own:

- **`classroom_grade_submission` (`0086`, re-signed by `0095`) stays the only
  writer of a score**, called from the notebook exactly as `/classroom/.../
  grade` calls it. A second one would be a second copy of the rubric
  validation, the override rule and the release gate.
- **The four criteria are an ordinary rubric**, installed through the existing
  `classroom_set_rubric` and editable afterwards like any other.
- **Authorization is `classroom_can_review_submission`** -- the caller manages
  a section the item is posted to AND that the student is enrolled in. `0097`
  adds no parallel check and could not weaken that one if it tried.

### Why a join table, and the composite FK that carries it

A notebook unit is **(section, unit number)** -- unit numbers are scoped to a
section by construction, since `notebook_sessions` carries both. A Classroom
ITEM is section-agnostic: `0085` made one canonical record posted to N sections
through `classroom_postings` precisely so an edit reaches every class at once.
So "Unit 1 Documentation Check for Block 2" is a fact about a PAIR -- a row,
not a column on either side. Three sections running the same unit hold three
rows and may each point at their own item, or all at one item posted to all
three, which `classroom_postings` already models and the link inherits free.

**`notebook_unit_items` (PK `(section_id, unit_number)`) references
`classroom_postings (item_id, section_id)`** -- that table's own unique
constraint -- so "linked to an item this class is not posted to" is
UNREPRESENTABLE rather than merely refused by an RPC (the `0069` / `0088` /
`0094` idiom a third time), and the refusal survives a raw insert by a table
owner. Unposting the item, or deleting either side, cascades the link away with
no bookkeeping: a link to a class that can no longer see the item is not a link
worth keeping. Test-pinned with RLS OUT OF THE WAY ENTIRELY (as the connection
owner), so nothing but the key itself can be what refuses it.

- **AN UNLINKED UNIT IS A NORMAL STATE.** Most units have no Documentation
  Check item, the panel says so plainly, and the grid above it is untouched.
- Zero client write grants. Two `is_admin()`-free SECURITY DEFINER RPCs gated
  on `classroom_manages_section`: `notebook_link_unit_item` (upsert, so
  re-pointing a unit is the same call) and `notebook_unlink_unit_item`, which
  removes the LINK and nothing else -- the assignment, its rubric and every
  grade already written are ordinary Classroom rows the notebook never owned.
  Reads are manager-only; students are deliberately given none, since the item
  itself is what they see in Classroom.
- The RPC additionally refuses a non-assignment BY NAME (only an assignment
  carries points, a rubric and a submission row) and refuses an unposted item
  with a sentence rather than a constraint-violation string. `classroom_items`
  has no way to change an item's kind after creation, so the kind check cannot
  go stale.

### The four criteria, and the one that is pre-filled

`src/lib/notebook-documentation-check.ts` is the pure layer (the
notebook-review.ts convention). IDEA209H Unit 1's rubric, **25 points**:
presence for every lab and testing session (7), raw data recorded in the
moment (6), dated and legible (6), specific enough to reconstruct (6). All
four carry real `0095` levels, so the server stores them COMPLETE.

- **Only the presence criterion's ID is load-bearing**
  (`doc-check-presence`): it is how the grading view knows which criterion the
  grid can answer. Everything else is content a teacher may edit; a rubric with
  no such criterion simply pre-fills nothing and says so.
- **The pre-fill is `summarize()`'s own arithmetic, not a second copy.**
  `notebook-review.ts` renamed `suggestedScore` -> `presenceScore` and its
  meaning narrowed: it was a suggested FINAL grade with a blank column beside
  it, and it is the presence CRITERION now. `presenceScoreFor` only rescales it
  if a teacher changes the criterion's maximum, so the two cannot disagree at
  the default 7.
- **An excusal is still NOT counted as covered** (the grid's rule, unchanged)
  and is reported instead -- which is why the evidence line exists.
- **THE EVIDENCE LINE DOES TWO JOBS, which is why it is ALWAYS attached** as
  the presence criterion's own comment: it makes a low number explainable
  ("3 of 5 check-ins filed · 1 excused (not counted as covered)"), and it
  satisfies `0095`'s override rule for free. A computed score can land between
  the criterion's levels (4 of 7 is not one of 7/5/3/0) and an off-level score
  REQUIRES a comment explaining it -- the derivation IS that explanation, so an
  instructor is never asked to justify arithmetic the grid did for them.
  Blanking the field refills it rather than blocking the save; the refusal path
  is still live for the three judged criteria (browser-verified both ways).
- **NOTHING AUTO-SUBMITS.** The presence score arrives filled in; every
  criterion, and the decision to save at all, is the instructor's.

### Surfaces

`src/lib/notebook/DocumentationCheck.svelte` mounts under the grid in
`ReviewConsole` (presentation + injected `DocCheckTransports`, so the harness
answers it in memory). Unlinked -> a picker of the assignments **posted to this
section** (an `!inner` embed, so the picker can never offer what the link RPC
would refuse). Linked with no rubric -> a one-click install of the standard
four. Linked and rubric'd -> the roster with each student's counts, excusals
and flags by type as context, level buttons per criterion, an "Other" numeric
override, a comment to the student, Save draft and Return.

- **A roster row with no email is surfaced as ungradeable, not dropped.**
  `classroom_grade_submission` takes an email; a student holding entries with
  no active enrollment can have none.
- `docCheck` null omits the panel entirely, which is the fail-soft state on a
  deployment where `0097` is not applied (the load probes the table with a
  head-count; the grid, the check-in manager and every review action are
  untouched by its absence).

### What was REMOVED

`buildCsv`, `csvFilename`, `csvCell` and `CSV_HEADERS` are gone from
`notebook-review.ts`, with the Export CSV button, the "About the suggested
score" card and the harness's CSV preview. Confirmed by grep that nothing else
referenced them -- `assignment-spec.ts` has its own private `csvCell`.
`gradesCsv` in `assignment-spec.ts` is the ONE export path now; a second export
of the same grade in a different shape is exactly the kind of duplicate that
quietly stops matching.

### Verified

- **`tests/notebook-documentation-check.test.ts` (21 tests, 0001 + 0003 + 0020
  + 0053 + 0067 + 0069 + 0070 + 0071 + 0075 + 0078 + 0082 + 0083 + 0085 + 0086
  + 0088 + 0094 + 0095 + 0097 applied UNMODIFIED to real embedded Postgres).**
  It drives the SHIPPING pure code with the REAL RPC's real output --
  `summarize`, `presenceScoreFor`, `DOC_CHECK_CRITERIA`, `studentWorkRows` and
  `gradesCsv` are imported from `$lib` -- so the pre-fill and the export are
  measured end to end rather than asserted from a fixture that agrees with
  itself. Covers the link (upsert not duplicate, a foreign section refused, a
  material refused by name, an unposted item refused, the composite FK with RLS
  out of the way, the cascade on unposting, unlink leaving the item standing),
  who may read or write it (manager and admin yes, another teacher and a
  student no; no direct INSERT/UPDATE/DELETE for student, teacher OR admin; no
  anon grant on the table or either RPC), the pre-fill against a REAL grid
  (alice 3 of 4 -> 5; **bruno 1 filed + 1 EXCUSED stays covered 1 -> 2**, which
  would read 2 -> 4 if an excusal ever silently counted), the saved grade
  (`rubric_scores` keyed by exactly the four ids, `score` = their sum, state
  returned, evidence stored), the off-level refusal writing NOTHING, and the
  migration re-applying twice with the FK, the policy and both RPC overload
  counts re-checked.
- **THE FACTS CSV, END TO END.** After grading, the test runs the REAL
  `loadGrading` reads as the teacher, feeds them through the REAL
  `studentWorkRows` + `gradesCsv`, and asserts the Documentation Check's CSV
  reads `Alvarez,Alice,20,25` under the same `Last,First,Score,Out of` header
  and the same BOM as a SECOND ordinary assignment's (`Alvarez,Alice,40,40`) --
  one student, two assignments, one export path, the Documentation Check
  indistinguishable from ordinary classwork in it.
- **MUTATION-CHECKED FOUR WAYS, both directions.** Dropping
  `classroom_can_review_submission` from `0095`'s grading RPC reddens exactly
  the 2 cross-section tests; making it always refuse reddens 6; degrading the
  composite FK to a plain `(item_id)` reference reddens 2; opening the read
  policy to `using (true)` reddens 3. Both migrations restored byte-identical
  (md5-checked) and re-verified green.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **587/587 across 26 files** (was 566/25).
- **Browser-verified** in `/dev/notebook-review` (extended with an in-memory
  mirror of `0097` plus `classroom_can_review_submission` and the `0095`
  grading rules, and a `0097 applied` toggle): "all units" says pick one; the
  picker offers only the two ASSIGNMENTS posted to this section, never the
  material or the other class's; Link -> Install the standard rubric -> the
  roster reading each student's real counts (`Ruiz, Ana 3 of 3`; `Okafor, Ben
  2 of 3, flagged: illegible x1`; `Tran, Chloe 1 of 3, 1 excused`); Chloe's
  editor pre-filling presence at exactly **2 / 7** with the excusal in its
  evidence line and the other three unscored; Return with only presence scored
  refused ("3 left") writing nothing; scoring the three and returning storing
  **exactly the four ids, score 17 = 2+6+3+6**, state returned, evidence
  attached; blanking the presence note saving anyway (refilled) while an
  off-level 4 on a judged criterion with no note being REFUSED and marking that
  criterion, with nothing written; the transport refusing a grade for a student
  in another class and accepting the identical call for its own; the two-step
  unlink leaving both grades and the rubric intact; the `0097` toggle removing
  the panel while the grid, the check-ins and all 7 cell buttons keep working.
  375/375 at phone width with no control below the console's own 39px baseline,
  and an armed `window.onerror` catching ZERO errors throughout. The Classroom
  grading console was re-driven in `/dev/classroom` as a regression: roster,
  status chips and the CSV control unchanged.
- **NOT verified: the live Supabase project.** The local `.env` is the
  placeholder project, so `0097` has never been applied anywhere. Apply it by
  hand after `0096` and spot-check with two real accounts that a teacher of one
  section cannot grade another's student, and that a returned Documentation
  Check appears on the student's own classwork page.
- **Also not verified: screenshots.** The Browser pane in this environment does
  not composite, so every visual claim above is a measured computed-style or
  geometry read, not an eyeball.

