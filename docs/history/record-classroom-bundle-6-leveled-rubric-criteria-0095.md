---
title: "Classroom bundle 6: leveled rubric criteria (`0095`)"
date: 2026-08-13
branches: []
migrations: ["0095"]
subsystems: ["IDEA Classroom"]
record_order: 61
---

## Classroom bundle 6: leveled rubric criteria (`0095`)

Migration `0095_classroom_leveled_rubrics.sql` (apply manually after `0094`). A
criterion was a name, a point value and ONE descriptor, and the grader typed a
number -- which cannot produce consistent grading across three sections taught
by two instructors. A criterion is now a name plus an ORDERED LIST OF LEVELS
and the grader picks one. 0082's rule is untouched: ZERO client write grants,
every write a SECURITY DEFINER RPC re-checking the caller inside its own body.
This migration adds NO table and NO policy.

- **The constraints, enforced by `_classroom_check_levels`** (one function, both
  doors) and mirrored client-side by `criterionIssues`: three or four levels,
  the TOP level's points equal the criterion maximum, the BOTTOM level is 0,
  points STRICTLY DESCENDING, every level carrying a label and a descriptor.
- **THE MAXIMUM IS THE TOP LEVEL, ALWAYS.** `classroom_rubrics.criteria` keeps
  a `points` field, but it is OUTPUT, never input: `_classroom_normalize_rubric`
  re-derives it from `levels[0]` and discards whatever the client sent, so the
  two can never disagree (test-pinned by sending `points: 999`). The builder has
  no separate points field for the same reason. Schema v1.1 dropped it from the
  spec entirely; a leftover one is accepted only when it agrees with the top
  level.
- **INCOMPLETE CRITERIA, and why they are not an escape hatch.** The migration
  cannot invent grading policy: a flat criterion has one descriptor, so it
  becomes its own TOP level and the lower levels are left for the author. Such a
  criterion is stored `incomplete: true` and flagged in the builder, the grading
  console AND the student's rubric. Two rules keep it honest: the flag is
  SERVER-DERIVED (the normalizer stamps it and strips the client's value --
  test-pinned in both directions), and an incomplete criterion must still
  satisfy everything meaningful (at most four levels, top = maximum, strictly
  descending, every level in range). **SPEC IMPORT IS STRICT with no such
  allowance** -- a spec is authored content, so `_classroom_check_spec` demands
  the full set and refuses a flat criterion BY NAME.
- **OVERRIDES: the comment is enforced server-side, on every write.** A grader
  may still score any in-between value in range, but a score matching NO level
  REQUIRES a comment on that criterion, returned as the structured
  `{ok:false, reason:'override_needs_comment', missing:[...]}`. Override-ness is
  DERIVED from the number (points strictly descend, so at most one level can
  match), never taken from a client flag -- there is nothing to forge. It is
  checked BEFORE the release check and independently of it: an unexplained
  off-level score must not be storable even as a draft.
- **`classroom_submissions.criterion_comments`** (`{criterionId: text}`) is the
  one new column. **The LEVEL is never stored** -- it is read back from the score
  by `levelIndexForScore`, the same rule the RPC uses -- so editing a rubric
  later can never leave a stored index pointing at a level that no longer
  exists. `rubric_scores` keeps its exact shape and no existing row is
  rewritten, which is what makes "no score is lost" provable rather than argued.
- **`classroom_grade_submission` GAINS `p_criterion_comments`, so its 5-argument
  form is DROPPED first** (the 0058/0068 trap: a defaulted parameter would leave
  the old signature callable as a second, comment-blind overload, and PostgREST
  could not resolve the ambiguity). Test-pinned: exactly one row in `pg_proc`.
- **Ids stay stable across regeneration**, which is what keeps entered scores
  aligned: `rubricFromSpec(spec, previous)` prefers an authored criterion id,
  falls back to positional `<module>-r<n>`, and KEEPS the id already in use for
  that slot when it is one the generator could have produced -- never adopting a
  hand-picked id for a different criterion.
- **Fail-soft:** `transports.ts` selects `criterion_comments` and degrades to
  the pre-0095 column list on error, since migrations here are pasted in by hand
  and a deploy between two of them is a real state.
- **Two real bugs found in the browser, neither visible to `svelte-check`:**
  (1) the builder's "+ level" inserted ABOVE the last level, which is right for
  a fresh criterion (bottom already 0) and wrong for a MIGRATED one, where it
  pushed the author's own top level down a rung and silently blanked it -- it
  now appends below when the ladder is not yet closed at 0; (2) the flat-spec
  refusal emitted a second, misleading "rubric sums to 0" error, since a
  criterion with no readable maximum contributes 0 (SQL never showed both, as it
  raises on the first problem).
- **A third bug the TEST found, in the migration itself:** the carry-down loop
  used `jsonb_typeof(x) <> 'number'` on a possibly-absent key, and a NULL
  comparison falls THROUGH the guard -- appending a level with no points at all.
  The documented `is distinct from` trap, re-learned.
- **Verified.** `tests/classroom-leveled-rubrics.test.ts` (38 assertions) boots
  the chain SHORT OF 0095, seeds a REAL flat rubric through 0086's own RPC,
  grades two students against it, then applies the real 0095 file over the top
  (the 0085 canonical-migration shape): scores, totals and states come out
  byte-identical, ids and maxima survive, a pre-existing lower level is carried
  down rather than dropped, every half-migrated criterion is flagged, and
  re-applying is a no-op. Then the constraints at both doors (the rubric door
  flags what the spec door refuses), the override rule, the release gate, and
  the read boundary. **MUTATION-CHECKED FOUR WAYS:** dropping the
  strictly-descending check reddens 2, removing the override refusal reddens 3,
  making the migration touch `rubric_scores` reddens the no-score-lost test, and
  the `classroom_submissions` policy reddens 2 at `using (true)` and 1 at
  `using (false)` -- confirming the new column's exposure is genuinely governed
  by that policy. 0086 restored byte-identical each time. `npm run check` 0
  errors, 36 warnings (the same 36 as HEAD); `npm test` 527/527 across 24 files.
- **Browser-verified** in `/dev/classroom` by driving the REAL components:
  authoring levels on the migrated criterion with the flag clearing live as the
  last descriptor was typed; generation from a spec carrying all four levels
  through; id stability driven through the real `rubricFromSpec` (fresh uses
  authored ids, an existing positional id for the same slot is kept, a
  hand-picked id is not adopted); grading by level selection with the live total
  tracking (16/20 across four picks); an override refused with no comment
  (nothing stored -- the roster chip stayed "Not submitted") and accepted with
  one; the student's rubric BEFORE submitting showing every level with its
  descriptor and the unfinished criterion marked, and AFTER return showing the
  received level ticked per criterion plus the override line and its comment;
  the spec importer refusing a flat criterion by name with Attach disabled; and
  375/375 at phone width with 44x44 builder controls and 285x65 level buttons.
  Zero trapped `window.onerror` and zero console errors throughout.
- **NOT verified: the live Supabase project.** The local `.env` is the
  placeholder project, so 0095 has never been applied anywhere. Apply it by hand
  after 0094 and spot-check with two real accounts that a student sees their own
  level marks and a grader cannot store an off-level score without a comment.
- **`docs/IDEA_MATERIAL_SPEC_v1.md` is at schema v1.1** and references a
  `IDEA_RUBRIC_STANDARDS.md` that is NOT in this repo; the hard constraints are
  summarized in the spec itself, which is what the code enforces.

