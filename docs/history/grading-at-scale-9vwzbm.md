---
title: "Grading at scale: one statement for a whole class, and one console for every class an assignment is posted to (`claude/grading-at-scale-9vwzbm`, 0175)"
date: 2026-09-03
branches: [claude/grading-at-scale-9vwzbm]
migrations: ["0175"]
subsystems: ["IDEA Classroom", "Grading", "Browser harness"]
---

Prompt 0022. Two instructor reports, both about time rather than capability:
grading is per student per assignment, so a class of thirty is thirty passes
through the console, and an instructor teaching the same course to three
sections grades the same assignment three times from three different addresses.

Started from `origin/integration` at `a7cd032`, which is ahead of `main` and
carries prompts 0018 and 0019. **Prompt 0021 is NOT on `integration`** despite
the prompt saying it is: its ledger entry exists only on
`claude/land-maps-viewer-sk70is`. Nothing in this bundle depended on it.

## Phase A, and the two facts that decided the build

**A2, the cost today, counted off the code rather than estimated.** The
per-section console loads once on mount (`loadGrading` = five parallel reads:
the roster RPC, submissions, responses, files, approvals) after a page load
whose server side makes five more. Grading one student is then: one click to
select, one click per rubric criterion, one press to return -- and `grade()`
ends with `await load()`, so **every single grade costs one RPC plus a five-read
reload, six round trips**. For thirty students on a two-criterion rubric that
is **1 page load, 190 round trips and 120 interactions**; three sections of
thirty is **3 page loads, 570 round trips and 360 interactions**, because each
section is a different URL.

After: the cross-class console is **1 page load, and a batch of any size is one
RPC plus one reload**. Ninety students across three classes measured on the
harness comes to **1 page load, about 19 round trips and, for the common case
of one score applied to a group, roughly `R + 4` interactions per group** (one
preset press, one press per criterion, arm, commit) instead of `90 × (R + 2)`.

**A3, the schema fact that decided what "across classes" even means.** An
assignment is ONE `classroom_items` row posted through `classroom_postings`,
and `classroom_submissions` is keyed `(item_id, student_email)` with **no
section column at all**. So the work was never section-scoped: `.eq('item_id',
...)` under the existing policy (`classroom_can_review_submission`) already
returns exactly the rows the caller may review, across every class of theirs the
assignment is in. The only thing that was section-scoped was the ROSTER read,
and 0138 already shipped the widening for it -- `classroom_section_roster(null)`
is every roster the caller manages, gated on `classroom_manages_section` inside
its own definer body.

So this is **one console showing several sections**, not a new cross-section
query, and the read side needed no migration. What it needed was for the class
to stay visible, which is the whole of B2 below.

## The one thing that did need a migration

**A4: the grade write is one student per call, and a client loop is not a safe
substitute.** Thirty calls are thirty TRANSACTIONS, and a loop that dies at
seventeen -- a closed tab, a lid, a dropped connection -- leaves sixteen grades
landed, fourteen not, and the only record of which is which in the memory of the
tab that went away. `0175_classroom_bulk_grading.sql` adds
`classroom_grade_submissions(uuid, jsonb, boolean)`: a loop over
`classroom_grade_submission` with a per-row exception handler, returning
`{ok, total, succeeded, refused, results:[{email, ...}]}` -- the shape
`coin_bulk_payout` already uses.

It reimplements nothing and grants nothing. Every row goes through the
7-argument form 0171 added, so the rubric arithmetic, both refusals, the extra
credit range, the `score` that carries the award and the `graded_at = now()`
stamp are the one implementation they have always been; and
`classroom_can_review_submission` is asked inside that function on every row, so
a student in a section the caller does not manage is refused **by name** while
every other row lands. The exception handler opens a subtransaction, which is
what makes one statement safe over a class: a refusal is a line in the report,
never the end of the batch.

Refused before anything is written, rather than per row: a non-array, an empty
list, more than 200 entries, an entry with no address, and **two spellings of
one address** -- `A@x` and `a@x` are one person, and grading them twice would
silently clobber the first write and report a `total` that counts a person once
per spelling.

## The shape of the surface

**One console, one optional prop.** `GradingConsole` takes `bulk`; handed in, it
reads across every managed class the assignment is posted to, groups the roster,
offers a tick box per student and a batch bar. Omitted -- which is the
per-section route -- **none of that markup exists**: no checkboxes to leave
unticked, no presets to grey out, no section chips, no cross-section read.
Measured on the harness: 7 tick boxes / 4 presets / 2 groups / 7 section chips
with the transport, against 0 / 0 / 0 / 0 without it and 4 roster rows still
there. Single-section is structural, not a mode.

**The rubric form IS the batch, and that is the answer to "the instructor must
see the work".** The scores, notes, comment and award being applied to a group
are the ones already on screen for the student who is open, so an instructor
reads one student's work, scores it, and then says everyone else they ticked
earned the same. A separate batch form would be a spreadsheet with the work
hidden behind it, which produces worse grades faster. Selection is deliberately
separate from who is open: ticking a name changes nothing about the detail pane.

**The plan is the payload.** `bulkPlan` returns `rows` (the table on screen) and
`grades` (the request body) from ONE call, so a surface cannot show a total it is
not about to write. Mutating them apart is not a thing that can happen in one
function; two functions is exactly how a preview stops describing the write.

**The class travels on every row, not only on the heading.** Grading the wrong
class's student is the failure mode here and it is silent -- nothing refuses it,
because the instructor teaches both. A heading scrolls away, so the chip is on
the row, first in the chip list, and in the plan table as its own column, and in
the selection summary ("6 students selected, across 2 classes: ..."), and beside
every line of the outcome report. The chip is deliberately NEUTRAL: the other
chips on that row carry a verdict about the work (gold special, amber warning,
cyan/green state) and a class is an identity, so inventing a sixth semantic hue
for it would have been a colour doing a word's job. It takes `--text-1` and the
load-bearing boundary, measured **16.19:1**, which makes it the most legible
thing in the row -- which is right for the one fact whose absence is silent.

**An export is always one class.** `gradesCsv` writes a FACTS gradebook import,
which is per-class by definition, and every filename ends in a section slug. On a
console holding three classes, "the whole class" would have been three classes in
a file naming one -- a wrong import that looks exactly like a right one. The
export panel therefore picks a section (defaulting to the route's), and the CSV,
the JSON, the workbook and the filename all read that one derived roster. An
open student from another class is refused by name rather than silently
exported.

**Reachability.** The per-section console carries an unconditional link to
`/classroom/grading/<itemId>`. Unconditional because the only thing that could
make it conditional is a posting count that page does not have, and a path
nobody can find is a path that was not built. It is a `.tap-44` control, not a
bare inline link: the prose exemption is for a link inside a sentence, and this
measured **18px** before.

## What was measured

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived after
  `svelte-kit sync` with the two `PUBLIC_SUPABASE_*` placeholders exported. One
  new warning was introduced and suppressed at its site rather than carried:
  `exportSectionId` seeds from the `section` prop on purpose.
- **`npm test`: 244 files, 5205 tests, all passing.** 49 of those are the new
  pure suite and 31 the new db suite.
- **`npm run verify:browser -- --route grading-bulk`: 8 route/width runs, 140
  measurements, 0 outside threshold**, at 375 and 1440. Contrast worst case
  **5.88:1** (`--text-2` meta on the roster card); every tap target 44px or
  better (tick box 44x54 at 1440 and 44x126 at 375, presets 164.8x44, export
  picker 65.1px). No horizontal scroll at either width. No console errors.
- The scripted drives retried against their own effect rather than a timer, and
  reported attempts: opening a student took **4-5 attempts / 595-753ms**, every
  step after it **1 attempt**.

## The three controls, and the one that was vacuous

Each mutation was restored from a `cp` copy, never `git checkout --`, and each
file md5-checked afterwards.

1. **Break the per-student failure reporting.** Two mutants on the SQL:
   counting every row as a success, and dropping refused rows from `results`.
   Each reddened **7 of 31** db assertions. Two more on the client:
   `bulkOutcome` filtering refusals out of the list reddened 2, and
   `bulkOutcome` writing "Returned." on every row **passed all 47 assertions**.
   That one is the finding: the suite asserted the ORDER of the outcome rows and
   the wording of `bulkRefusalSentence` separately, and never that `bulkOutcome`
   calls the second -- so the exact silent half-success this feature exists to
   prevent was uncovered. Two assertions were added and the same mutant now
   reddens both. **49 tests, and the count is 49 because one of them was
   worthless.**
2. **Open the cross-section clause.** On the database: opening
   `classroom_can_review_submission`'s manage clause reddened exactly the two
   boundary assertions and nothing else, and the fixture proves the shape is
   real -- the assignment IS posted to Period 3 and Finn IS enrolled there, so
   the only thing between the teacher and his grade is the gate. On the client:
   opening `managedPostedSections` reddened 1, and the harness's own `?leak=1`
   is a permanent positive control that makes Period 4 appear with its two
   students in a real browser.
3. **The 0011 signal after a bulk grade.** In the database: grading two students
   in one batch put `graded_at` after every response for both; one of them then
   editing moved only her own past it (`[[alice, true], [bruno, false]]`); and
   grading her again in bulk cleared it. In the browser: after a batch,
   **0 of 7** rows carried the changed chip; after Alice edited one response,
   **exactly 1 of 7** did, and it was hers, agreeing with the oracle printed
   beside the console.

## What is NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is a
  placeholder ref; 0175 has not been applied to production, and no claim here is
  about live data.
- **No signed-in surface was driven.** `/classroom/grading/<itemId>` needs a
  Bosco Tech Google session no cloud session holds, so the page load's own gate
  (404 when the caller manages none of the assignment's classes) was reasoned
  from the code and from the RLS, not exercised in a browser. The console
  underneath it is what the harness drives, mounted identically.
- **The local Supabase stack was not started.** The db suite ran against the
  embedded Postgres with the real migration files.
- **Timings are container timings**, not a school desktop's.

## Deferred

- **`gradesCsv` has no Section column** and could not gain one here: it lives in
  `assignment-spec.ts`, outside this bundle's files. The section picker makes
  every exported file unambiguous instead, which is the better answer anyway --
  a gradebook import is per class -- but a genuinely cross-class spreadsheet
  would want the column.
- **A batch cannot give two students different scores in one commit.** The RPC
  accepts a per-student payload and would take it; the surface applies one
  rubric to the selection, which is the common case the reports were about.
  Per-row editing in the plan table is a real next step and is a surface change
  only.
- **No progress is shown during a large commit.** One statement means one
  request, so there is nothing to report until it answers; at 200 rows that may
  be worth a spinner.

## For Mr. Pina

**Apply first:** `supabase/migrations/0175_classroom_bulk_grading.sql`.

Paste it into the Supabase SQL editor. It is idempotent and safe to re-paste.
The notice pane should end with one line:

```
NOTICE:  0175: classroom_grade_submissions created. arities=1, anon=f, authenticated=t
```

If instead it raises `0175: classroom_grade_submission's 7-argument form is
missing. Apply 0171 first.`, then 0171 has not been applied to this project and
nothing from 0175 landed -- apply 0171, then re-paste this.

`supabase db push` is never run on this project.

**What undoes it:** `drop function public.classroom_grade_submissions(uuid,
jsonb, boolean);`. Nothing else changes: no table, no column, no policy, and no
grant on anything that existed before. Grades written through it are ordinary
rows written by `classroom_grade_submission` and are indistinguishable from
grades entered one at a time.

**Ordering:** the migration and the deploy are independent. The batch RPC has no
caller until this branch ships, and the cross-class page degrades to its load
error if the function is missing rather than breaking the per-section console,
which is untouched by 0175.

**The check that matters is yours.** Everything above is a fixture. What none of
it can tell you is whether grading a real class in bulk is actually faster with
real work in front of you -- whether the rubric you fill in for one student is
genuinely the one the next eight deserve, or whether reading each submission
properly means the batch collapses back into grading one at a time with extra
steps. Grade one real assignment across two real blocks and see. Two specific
things to watch: whether "Not graded yet" is the selection you actually reach
for after a partial pass, and whether the plan table before the commit is
something you read or something you click past.
