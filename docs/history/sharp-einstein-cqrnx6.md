---
title: "`classroom_remove_enrollment` counted four kinds of student work and IdeaCAD was not one of them, so a finished part could be stranded by a routine roster removal with nothing raised; 0213 widens the census and stops there (`claude/sharp-einstein-cqrnx6`, migration 0213)"
date: 2026-09-13
branches: [claude/sharp-einstein-cqrnx6]
migrations: ["0213"]
subsystems: ["Classroom", "IdeaCAD", "Database"]
---

Ledger 0206 found this on 2026-09-13 and REPORTED it rather than fixing it, which
was right: the fix it pointed at is decision 29's archive, and that is a bundle.
What it also said, in decision 29's own Build line, is that the archive is not the
first move:

> **The smallest useful first move is none of those**: widen
> `classroom_remove_enrollment`'s four-way census to count IdeaCAD work, which
> closes the live silent-loss gap below and needs no new state.

This bundle is that sentence and nothing else.

## The four claims, verified before anything was built

All four hold. Each was read out of the migration files rather than taken from
the prompt.

**It is a hard delete.** `0138_classroom_manager_exclusion_and_enrollment_removal.sql`
ends `classroom_remove_enrollment` with `delete from public.classroom_enrollments
e where e.section_id = ... and e.student_email = ...`. There is no soft-delete
stamp on that table and no restore path; 0138's own header says the table carries
a SELECT grant and nothing else, which is what makes this function the only door.

**It counts four kinds of work**, each scoped to the SECTION through
`classroom_postings`: `classroom_responses`, `classroom_submissions`,
`classroom_module_approvals`, and `notebook_entries` (the last through 0094's
`_notebook_user_id_for_email` bridge, and deliberately without `deleted_at is
null`). They are returned under `counts` as `responses`, `submissions`,
`approvals`, `notebook_entries`, and summed into `total`.

**IdeaCAD is absent from that census.** Zero occurrences of `ideacad` in the
function body, asserted in the test as an absence WITH the positive control
beside it in the same reading -- the four tables it does name are all there, so
an empty read cannot be what produced the absence.

**`ideacad_roster` reads the enrollment.** `0201_ideacad_blade_editor.sql` builds
its rows as `select distinct ce.student_email from classroom_postings cp join
classroom_enrollments ce on ce.section_id = cp.section_id where cp.item_id = ...`
and LEFT JOINS `ideacad_documents` onto that. The enrollment is the driving set.
Delete it and the address leaves the set, so the left join never reaches the
document: the row is still in the table, its concepts are still in
`ideacad_concepts`, and the only function that lists a class's IdeaCAD work
cannot see any of it.

**The defect was reproduced rather than argued.** The suite boots the real chain
short of 0213, gives a student a document and nothing else, and removes him: the
call answers `{ok: true}`, the enrollment is gone, the document row is still
there, and `ideacad_roster` no longer lists him while still listing the student
beside him. That last clause is the positive control -- an empty roster would
have produced the same absence.

## The decisions

**THE UNIT COUNTED IS THE DOCUMENT, NOT THE CONCEPT.** `ideacad_documents`
carries `unique(item_id, student_email)`, `ideacad_concepts` cascades off it and
`ideacad_predictions` is keyed on it, so one document row is exactly one thing
that becomes unlistable and everything else goes with it. Counting concepts would
report a bigger number for the same single loss and would say nothing more about
what is in the way.

**A DOCUMENT OPENED AND NEVER WORKED IN STILL COUNTS, AND THIS IS THE ONE
JUDGEMENT WORTH ARGUING WITH.** `ideacad_open_document` inserts the document row
AND seeds `Concept 1` on the FIRST OPEN, so unlike the other four categories a
row here can exist because somebody loaded a page. The two ways to be wrong are
not symmetric: refusing a removal that had nothing behind it costs a manager a
conversation and is reversible, while passing one that strands a term of
modelling is the defect and is not. The narrowing, if it is ever wanted, is a
predicate over what a student actually changed -- and that is a second definition
of "is this work", which is the thing the file is careful not to write.

**THE GRANT SHAPE IS 0166's AND NOT 0201's.** `revoke ... from public` alone is
not a narrowing on this project: the hosted bootstrap writes a DIRECT `anon`
grant into every new function's ACL, and 0201 used the bare form and put ten
anon-executable functions on production for 0202 to repair. So the file revokes
from `public, anon, authenticated, service_role` by name and grants back
`authenticated` alone -- 0138's own end state restated, a no-op on production
where `create or replace` preserves the ACL, and the whole of the narrowing on a
database where the function does not yet exist.

**TWO MIGRATIONS MUST NOT REDEFINE THE SAME OBJECT, so 0213 names exactly one:**
`classroom_remove_enrollment(uuid, text)`. It leaves `_admin_is_email`,
`is_admin`, `_classroom_manages_section_email`, `classroom_manages_section`,
`classroom_section_roster` and `_notebook_section_roster` -- all 0138's -- alone,
and touches nothing 0201 owns. The signature does not move, so the signature trap
does not arise and there is no drop; the self-check asserts `pg_proc` holds
exactly one row for the name, which is what would catch it if that stopped being
true.

**THE PRECONDITION IS A REFUSAL, AND IT EXISTS BECAUSE plpgsql RESOLVES A TABLE
AT RUN TIME.** A `create or replace` naming `public.ideacad_documents` on a
database without 0201 succeeds quietly and then fails at EVERY removal attempt,
including the ones that would otherwise have been allowed -- a widened refusal
turned into a total outage of the People tab's Remove control. Section 1 raises
instead, names the file to apply first, and changes nothing. That refusal is only
ever exercised on a database nobody has, so it has its own control: a second
`startTestDb` on a chain stopped short of 0201, with the positive control (0138
present, `ideacad_documents` absent) in the same reading, asserting the raise
names 0201 and the deployed `prosrc` is byte-identical afterwards.

**THERE IS NO DEPLOY ORDERING, in the direction that matters.** The `counts`
object gains a key and loses none, so an un-redeployed client reads the four it
knows and ignores the fifth, and `total` -- which both the database and the
surface treat as the refusal -- is the sum of five either way. The reverse order
cannot break anything: a label for a key the database does not send renders
nothing.

## The one file under `src/`, and why the prompt's carve-out applies

**The refusal message lives in `src/lib/classroom/classroom.ts`, so the widening
is not complete without two lines there.** `enrollmentWorkSummary` iterates
`Object.keys(WORK_LABELS)`, so a fifth key it has never heard of is INVISIBLE to
it. Measured against the code as it stood: a refusal whose only nonzero count is
`ideacad_documents` produces `parts.length === 0`, the function returns the empty
string, and `PeoplePanel` renders "Not removed.  in this class are attached to
this enrollment, and deleting it would strand those." -- a refusal with no
subject and a hole where the reason should be. So `EnrollmentWorkCounts` gains
`ideacad_documents?: number` and `WORK_LABELS` gains
`['IdeaCAD document', 'IdeaCAD documents']`. **Optional on purpose**: a
deployment carrying 0138's four-count census and not yet 0213's fifth is a real
state, the key is simply absent there, and every count is already read through
`?? 0`, so the sentence is short and still true rather than `NaN`.

`PeoplePanel.svelte` needed nothing. Its notebook-bin sentence is keyed on
`counts.notebook_entries` and is right to stay that way.

## What was measured

- **The new test, `tests/db/classroom-remove-enrollment-ideacad.test.ts`: 18
  tests, all green**, against a real embedded Postgres with the real chain.
  Seeded pre-migration data through the real RPCs, the defect reproduced, the
  four existing refusals captured off the DEPLOYED 0138 function, 0213 applied
  over the top and applied AGAIN (re-appliable), then compared case for case.
  - A student whose only work is IdeaCAD is refused, `ideacad_documents` is
    **2** against an independent query over the table (two rather than one
    deliberately: a count that is always 1 cannot be told from a boolean), the
    total is 2, the enrollment survives, and `enrollmentWorkSummary` says
    `2 IdeaCAD documents`.
  - A student with no work at all is still removed, `{ok: true}`, row gone.
  - Each of the four existing categories refuses with the SAME reason, the same
    four counts and the same total as before 0213, with the new key at 0.
  - The count is section-scoped like the other four: IdeaCAD work in P9 does not
    refuse a P1 removal, and the P9 enrollment and document are both still there
    afterwards.
  - `not_enrolled` still answers `not_enrolled`.
  - Exactly one arity; `anon` cannot execute, `authenticated` can.
  - 0213 does NOT repair an orphan an earlier removal already made.
- **The expected values do not come from the thing under test.** The four
  baselines are read off the deployed 0138 function before 0213 exists; the new
  count is compared against an independent query over `ideacad_documents`. The
  before/after pair IS the mutation proof, with 0138's own shipped body as the
  mutant.
- **The instrument was controlled.** Judging by vitest's exit code was measured
  to be wrong here exactly as `tools/run-tests.mjs` says: with one assertion
  deliberately falsified, `npx vitest run` **exited 0** while the summary line
  read `Tests 1 failed | 15 passed (16)`. The summary line is the verdict. The
  file was restored from a COPY, never with `git checkout --`, and md5-verified
  identical.
- **`svelte-check`: 0 errors, 37 warnings in 20 files, 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`.** Re-derived at the branch point
  (`origin/integration` `34a44f2d`) by restoring only the changed file from
  `git show` and measuring: **identical, 37 in 20 at 31/5/1.** The change moved
  neither number and the `CLAUDE.md` baseline line is accurate as written, so it
  was not edited.
- **Full suite: 8690 of 8691 passed, 457 of 458 files.** The one failure is
  below and is not this bundle's to fix.
- **Paste trap: 0 dollar signs in any comment line, and four balanced
  dollar-quote pairs** (`$guard$`, `$fn$`, `$check$`, `$report$`) on code lines.
  Both halves of the instrument were put to a PLANTED CONTROL -- a comment
  carrying `$bad$` and a stray unbalanced `$odd$` on a code line -- and both were
  found, so the reported zero is a zero the instrument was looking for.

## NOT verified

- **Nothing was applied to production, and nothing here could be.** The local
  `.env` is a placeholder project and a cloud session's egress proxy carries no
  bytes to 5432. 0213 is Mr. Pina's to paste.
- **No browser pass** -- the prompt excluded it. The two-line change in
  `classroom.ts` is a data addition to a pure function covered by the database
  test's own assertion on `enrollmentWorkSummary`; the rendered sentence in
  `PeoplePanel` was not driven.
- **The apply-time report in section 4 has never run against real data.** It
  names the enrollments this widening newly refuses, and on the test fixture it
  answers over a fixture. What it reports on production is unknown until it runs.

## The one red test, which is not this bundle's and was not touched

`tests/db/migrations-applied-record.test.ts` > "has a record for every migration
from 0193 onward, and no gaps" FAILS, and it fails on the EXISTENCE of a new
migration file rather than on anything about this one.

**Proven, not inferred:** with `0213_*.sql` moved out of
`supabase/migrations/` the file is green at 23 of 23; moved back, byte-identical
by md5, it is `1 failed | 22 passed`.

The assertion requires a file under `docs/migrations-applied/` for every
migration numbered 0193 or higher. That directory's own README opens **"One file
per migration that actually applied to the production database. Nothing here is
a plan."** 0213 has not been applied, so there is no honest record to write for
it -- writing one would assert a production apply that has not happened, in the
one directory built to make that claim checkable.

**So this will go red for every migration lane, at the moment the lane writes its
file, until somebody pastes it.** Ledger 0207 is holding 0212 and has not pushed
its migration yet; when it does, it reddens the same way.

**It was not fixed here because it is not this bundle's to fix.** Ledger 0197
owns `docs/migrations-applied/**` AND `tests/db/migrations-applied*`, and its
status is `pushed` -- still in flight. An Owns intersection is exactly the
collision the prompt ledger exists to prevent, so both halves were left alone.

**The generalization, stated so the next bundle does not have to rediscover it:**
the assertion is really about GAPS, and a missing record at the TOP of the range
is not a gap -- it is a migration nobody has applied yet. Requiring no gaps
BELOW the highest recorded number keeps everything the test is for (a skipped
record is still caught) and stops it ratcheting on every new migration. Reading
the applied set from `origin/main` would also work and is stronger, but it needs
git in a test that currently needs none.

## What the census does NOT solve

Stated here rather than discovered later, because the refusal is easy to read as
a fix.

- **It does not make a removed student's document reachable.** Decision 29 is
  ANSWERED -- the document and all its work is ARCHIVED, not deleted, and stays
  accessible to the admin instructor; if the instructor shares an archived
  document with a class, those students get access to it too. Mr. Pina's reason
  is on the record: he regularly brings up past student work to show current
  students, and work from students who have since left is exactly what he wants
  to be able to show. None of that is built here.
- **It does not help anyone already stranded.** Nothing in 0213 goes looking for
  an orphan, and the test asserts that as a property rather than leaving it to be
  assumed: the student removed before the migration is still unlistable after it.
  How many such documents exist on production is unknown and unknowable from this
  repository.
- **It does nothing about deactivation, which is the ordinary path.** 0082 says
  enrollments are normally retired with `active = false` rather than deleted, and
  a deactivated student already loses write access to their own document through
  `_classroom_engine_student`'s `e.active` gate while `ideacad_roster` keeps
  listing them. That path was never broken and is untouched.
- **It is not a lifecycle state.** `ideacad_documents` still has six columns and
  no `archived_at`, no `deleted_at`, no `status`. Decision 29's four pieces -- the
  archive state and the pass over every read that does not know about it, the
  archive path, an instructor read keyed on the ITEM rather than on the
  enrollment, and the instructor-shares-to-a-class grant that reverses 0205's
  owner-only default -- are all still open.
