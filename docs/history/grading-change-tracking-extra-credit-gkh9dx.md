---
title: "Did the work change after I graded it, extra credit beside the rubric rather than inside it, and the rubric-import gap that turned out to be on the edit path (`claude/grading-change-tracking-extra-credit-gkh9dx`, migration 0171)"
date: 2026-09-02
branches: [claude/grading-change-tracking-extra-credit-gkh9dx]
migrations: ["0171"]
subsystems: ["Classroom", "Testing"]
---

Three instructor reports on the grading surface, and the audit changed what two
of them turned out to be.

## A1: post-grade change needed no migration, and that was measured rather than argued

`classroom_submissions` carries `graded_at`, `submitted_at`, `returned_at`,
`score`, `rubric_scores`, `criterion_comments` (0095), `created_at` and
`updated_at`; `classroom_responses` carries a per-block `updated_at`.
Every claim in the prompt about those columns held.

**The decisive question was answered by running the query, not by reading the
schema.** A probe against the embedded-Postgres harness, driving the real RPCs
through the real chain:

| act | what moved |
| --- | --- |
| graded and returned | `graded_at` 15:07:17.422, last response 15:07:17.413 |
| student edits a response | last response 15:07:17.431 -- **after** the grade |
| student resubmits | `submitted_at` 15:07:17.437 -- **after** the grade |
| teacher regrades | `graded_at` 15:07:17.441 -- **past both**, signal clears |

So both acts are derivable, they are DISTINGUISHABLE from each other, and the
signal clears itself. **No migration was written for this.**

Two things the tree corrected:

- **An autosave does not move `classroom_submissions.updated_at`.** The prompt
  warned that if it did, the column could not be relied on. It does not:
  `classroom_save_response` writes `classroom_responses` alone, and
  `classroom_add_submission_file` inserts a file row and touches nothing on the
  submission. Measured -- the value was byte-identical either side of an edit.
  That is also the strongest argument against a stored boolean: the writes that
  change the work have no reason to know grading exists.
- **A returned assignment is editable and resubmittable.** `classroom_save_response`
  and `classroom_submit_assignment` each refuse only state `submitted`, so a
  `returned` row is open on both paths, and since 0160 a resubmission is accepted
  even when the preflight considers it unfinished. The exposure is real and it
  was silent.

## A2: extra credit genuinely needed 0171, and that was measured too

Both doors are shut on the deployed function, put to it directly:

- a score above a criterion's maximum raises `The score for "Answered" must be
  between 0 and 10.`
- an extra key raises `Score key "extra_credit" is not a rubric criterion.`

`score` is stamped server-side and the CSV never re-derives it, so there was no
client-side place for an award to survive. 0171 is the one migration in the
bundle.

## A3: the reported defect did not reproduce, and the real gap is one path over

The prompt offered three possibilities -- the rubric is dropped, it is imported
and lost, or the control is absent. **At creation, none of them.** 0139 already
built the whole path: `stagedRubricAfterSpec` runs `rubricFromSpec` the moment a
spec is staged, `ContentComposer` holds the result, and `applyStagedExtras`
writes it through `setRubric` as soon as the create call returns an id.
`canStageRubric` is true on the real route, which passes `teacherTransports`
unconditionally.

What has no bridge is the **edit** path: pasting a spec onto an assignment that
already exists writes `classroom_assignment_specs` and nothing else. The two
panels sit beside each other on the item page saying nothing to each other, so
the builder's idle line reads "No rubric yet -- grading needs one" a few pixels
under a spec that contains one.

**The fix is a sentence, not a second import path.** `rubricFromSpec` is the ONE
translator and "Generate from spec" is the one control that runs it; an
automatic carry here would be a second answer to "what does a spec's rubric
become" and could stop agreeing with the composer's. What was missing was never
the mechanism, it was knowing the mechanism had something to offer.

## What was built

- **`postGradeChange` / `postGradeChangeLabel`** in `grading-export.ts` -- the
  one derivation and the one set of words, read by the console's roster chip,
  the console's detail sentence and the workbook. Two kinds, `resubmitted` and
  `edited`, both carried when both are true, because collapsing them to
  "changed" throws away the half that says whether a person meant it. Strictly
  after; an absent or unparseable timestamp does not fire.
- **0171** -- `classroom_submissions.extra_credit` plus a 7-argument
  `classroom_grade_submission` that sums it into `score`.
- **A third rung** on `selectSubmissions`, reporting `extraCreditReady`. Its own
  rung, because folding it into the 0095 rung would cost `criterion_comments` on
  a deployment between the two migrations -- and an override REQUIRES a comment,
  so a grader would see an unexplained number on a schema that has the
  explanation.
- **The Grades tab** gains a per-assignment count, computed in its own page load
  from two extra columns on a read it already makes.
- **`/dev/grading-change`** plus three browser-verify specs.

## Load-bearing decisions

- **BOTH ARITIES SURVIVE.** The deployed console calls the 6-argument form, and
  a drop plus a deploy are mutually blocking. The wide form declares no defaults
  at all (so the old key set cannot bind to it), the narrow form keeps its 0095
  signature verbatim (so the new key set cannot bind to it), and the narrow form
  is a thin wrapper passing null -- one implementation of the grading rule, every
  refusal message unchanged, and no deploy ordering at all.
- **NULL MEANS LEAVE ALONE; ZERO IS HOW AN AWARD IS TAKEN BACK.** Getting this
  backwards is the failure that matters: the old console passes null, so a
  clearing null would silently erase an award every time somebody fixed a typo
  in a comment. Asserted directly.
- **EXTRA CREDIT IS NEVER A CRITERION.** Criterion maxima sum to the module
  total and 0095 derives override-ness from the number, so an award inside
  `rubric_scores` would be read as an unexplained off-level score forever.
- **The workbook's extra-credit column is conditional and its change columns are
  not.** "Did this change after grading" is asked of every graded row and a
  blank cell answers it; extra credit is an award most classes never make, and a
  permanently blank column is noise. It also makes "inert when unused" literal:
  with no award the bytes are identical to the same export with the field
  ignored.
- **The Grades chip says "resubmitted", not "changed".** That page makes one
  read; an edit lives in `classroom_responses`, which would be a row per block
  per student per assignment on a summary tab. A number labelled "changed" that
  could only ever see half the changes reads as complete, which is worse than no
  number.
- **Two tokens for one fact, on purpose.** The console marks it `--amber` (its
  own warning edge; gold is taken by "incomplete"); the Grades panel marks it
  `--gold` (amber is taken there by the routine "to mark" count). Colour is
  never the only signal on either -- both chips carry the whole sentence.

## What was measured

- The A1 probe above, through the real RPCs.
- `svelte-check`: **0 errors, 37 warnings** (31 `state_referenced_locally`,
  5 `css_unused_selector`, 1 `perf_avoid_nested_class`) -- the baseline, held.
  `PUBLIC_SUPABASE_URL`/`_ANON_KEY` were exported before the sync, per the
  no-`.env` rule.
- 0171 applied over seeded pre-migration data graded through the real
  6-argument RPC: no score moved, every existing row is null rather than 0
  (nothing was backfilled), and the file re-applies cleanly.
- The ACL read back from `has_function_privilege`: `anon` holds execute on
  neither arity, `authenticated` on both. Asserted from the catalog, not from
  the migration's own verdict.
- `pg_proc` holds exactly `[6 args, 3 defaults]` and `[7 args, 0 defaults]` --
  the SHAPE, because a count of two passes on exactly the arrangement that
  breaks every call.

## The positive controls

1. **The signal fires and then clears.** A response edited after `graded_at`
   fires `edited`; a regrade moves `graded_at` past it and the signal goes.
   Asserted in the unit suite and again on the real tables.
2. **Extra credit is inert when unused.** Absent, null and 0 all produce
   byte-identical workbooks, no `Extra credit` column appears, and `gradesCsv`
   is untouched -- with the awarded case as the counterpart that DOES grow the
   column.
3. **The harness caught a wrong expectation of mine.** The `/dev/grading-change`
   spec asserted four flagged rows against a fixture that flags three, and the
   run reported 3 from the rendered chips AND 3 from the pure function -- a
   correct measurement of an incorrect claim. Corrected to 3 with a `maxPresent`
   beside the minimum, because a derivation that fired on every graded row would
   satisfy a bare `>= 3`.
4. **The mutant reddens.** `postGradeChange` keyed on `created_at` instead of
   `graded_at` failed **6 of 23** tests. The first attempt at this mutant kept a
   `?? graded_at` fallback and passed all 23 -- a weak mutant that proved
   nothing, and worth recording: the mutation has to be the one the code could
   actually take. Restored from a scratchpad copy (`cp`, never
   `git checkout --`) and verified md5-identical (`17cdca60...`), green again.

## What is NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is a
  placeholder ref; 0171 has not been applied to production and no claim here is
  about live data.
- **No signed-in Bosco Tech session.** The grading console is instructor-only
  and no cloud session holds one, so the real `/classroom/<section>/item/<item>/grade`
  and the real Grades tab were exercised only through the dev harness.
- **No real PostgREST round trip** for the arity selection. The transport omits
  `p_extra_credit` when it has nothing to say, which binds to the 6-argument
  form; that reasoning is from the resolution rules and the SQL-side assertions,
  not from a live call.

## Deliberately not done

- **The two extra-credit mechanisms were not wired together.** `coin_log_extra_credit`
  (0070) already sells extra credit at 2i¢ a point, capped at 21 per student per
  semester for 209H, with nowhere in the gradebook to record what was bought.
  This column is that place, but whether the semester cap should bind here is a
  policy question, and a coin surface is outside this bundle either way.
- **A file attached after grading is not detected.** `classroom_submission_files.created_at`
  exists and would answer it, but the column is not in `SUBMISSION_FILE_SELECT`
  and `SubmissionFileRow` has no field for it. One rung and one field.
- **A file REMOVED after grading cannot be detected by anything.** Nothing
  records a deletion.
- **Extra credit does not require a justification.** An unexplained award is the
  same shape of problem 0095 solved for off-level scores by requiring a comment.
  Making it required is a policy decision, not one to invent inside a migration.
