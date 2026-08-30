---
title: "A spec's rubric now lands on the assignment it was written for, the feedback queue moves reports in batches, and the submission gate turns out to be in SQL (`claude/rubric-spec-import-bug-viu0ky`)"
date: 2026-08-30
branches: [claude/rubric-spec-import-bug-viu0ky]
migrations: []
subsystems: ["Classroom", "Feedback", "FRC"]
---

Four reported defects, taken as a batch. Two were real and are fixed, one is
blocked on a migration this bundle may not write, and one was already fixed
before the report reached here.

## 1. A spec's rubric never reached the assignment (fixed)

**THE ROOT CAUSE IS THAT THERE ARE TWO RECORDS AND NOTHING JOINED THEM.** The
criteria an author writes live inside the spec JSON, written by
`classroom_set_spec` and validated by `_classroom_check_spec`, which is strict
about them: `0095` refuses a module that carries points and has no rubric, and
refuses a rubric whose levels do not sum to the module's points. Grading reads
somewhere else entirely -- `classroom_rubrics`, written only by
`classroom_set_rubric`, loaded by `item/[itemId]/+page.server.ts` as its own
`rubric` and handed to `RubricView` and the grading console. Nothing in the
database bridges the two, and nothing at creation time did either. The ONLY
translator, `rubricFromSpec`, had exactly two callers in `src/`: the dev
harness, and a "Generate from spec" button inside `RubricBuilder` which then
needed a SECOND deliberate press of Save before the composer held anything. So
an assignment created from a spec arrived with a document describing precisely
how the work would be scored, and a grading console with nothing to score
against. **The mechanism to carry it was already there and simply had nobody
driving it**: `0139`'s staged-rubric work (`4ef7c91`) had given `RubricBuilder`
a staging mode and `applyStagedExtras` a fourth attachable, both correct. What
was missing was the one line that put a spec's own rubric into that slot.

`stagedRubricAfterSpec` in `composer-staging.ts` is that line, and it is out
there rather than in the component for the reason the rest of that module
exists: a rubric that fails to arrive is invisible until somebody opens the
grading console days later in front of a pile of submissions. It CALLS
`rubricFromSpec` rather than mirroring it, which is what keeps the levels and
the authored `short` forms intact -- **a flattened import is not a partial
import, it is a broken one**, because every leveled criterion collapses to a
number a grader has to override to reach.

**THE `derived` FLAG IS THE HALF THAT PROTECTS SOMEBODY'S WORK.** A rubric the
spec produced is REPLACED when a corrected spec is pasted over it, because
leaving the first one standing puts a rubric on screen that silently disagrees
with the spec directly above it -- the original defect, one paste later. A
rubric that went through the builder is never touched again. Without the flag
those two cases are indistinguishable and one of them eats what a teacher
typed. `rubricFromSpec`'s own `previous` argument carries the ids already in
play for each slot across the replacement, so a re-paste does not orphan scores.

A spec with no rubric rows stages **null, not `[]`**: `classroom_set_rubric`
refuses a rubric with no criteria, so an empty list would turn a perfectly good
post into a named failure over something the author never asked for.

Scoped to CREATION deliberately. On an EDIT the item page's own `RubricBuilder`
owns the rubric and it may be hand-tuned, so attaching a spec there still leaves
it alone and offers the button.

## 2. Students still cannot submit incomplete work (NOT DONE -- it is a migration)

**THE GATE IS NOT IN THE CLIENT, AND THE CLIENT ALREADY DOES THE RIGHT THING.**
`AssignmentEngine`'s Submit button is disabled by `busy` alone; the preflight
card above it is advisory. What refuses is `classroom_submit_assignment`
(`0086`), which recomputes `_classroom_spec_unmet` server-side and returns
`{ok:false, reason:'incomplete', unmet:[...]}` before writing anything. So the
only change that would let a student submit is a redefinition of that function,
which on this project is a migration applied by hand -- and this bundle was told
to hold the migration slot. Removing a client gate that does not exist would
have delivered nothing while looking like a fix, so nothing was changed.

**THE SIGNAL THE INSTRUCTOR SIDE WOULD NEED ALREADY EXISTS AND NEEDS NO
COLUMN.** `specUnmet` in `assignment-spec.ts` is a pure TypeScript mirror of
`_classroom_spec_unmet`, and the grading console is already handed every input
it takes: the `spec`, and per student the `responses`, `files` and `approvals`.
An incomplete submission is therefore derivable at read time from what the
console already loads. Adding a column would be storing a value that can be
computed, which is the thing "Derived, never stored" exists to prevent -- and a
stored flag would go stale the moment a rubric or a spec block changed.

## 3. Bulk status on the feedback queue (fixed)

`FeedbackConsole` moved reports one at a time. It now takes the class stream's
own selection pattern rather than a new one: a checkbox per row, a bar that
appears only while something is checked, and `runBulk` from `classroom.ts` for
the writes -- the shared implementation, so every id is attempted regardless of
an earlier refusal and the refused ids stay selected for the retry.

**THERE IS NO BULK RPC AND THIS DOES NOT WANT ONE.** `app_feedback_set_status`
takes a single id, so a batch is N independent writes that cannot be atomic.
That makes a PARTIAL result an ordinary outcome, and the dangerous version of it
is a set left half changed with nothing saying which half, because the next
thing anybody does over dozens of open reports is press the button again over
the same selection. `feedbackBulkSummary` therefore names BOTH halves, with the
server's own first refusal message. **"12 of 30 updated" is precisely the answer
that cannot be acted on.**

A feedback row has no title, so `feedbackRowLabel` names one by route plus the
opening of what was written -- an id names a row to the database and to nobody
else. The list caps at `FEEDBACK_BULK_NAME_LIMIT` and SAYS SO when it cut
anything, the same rule the markdown export follows: a list that silently stops
reads as the whole list.

**"Select all shown" sits beside the count it acts on**, in the export row,
rather than in the bulk bar -- the bar appears only once something is checked,
so a select-all inside it would be a control you can only reach after doing its
job by hand. Every bulk action reads `selectedRows` (the selection intersected
with what is currently visible), so a row hidden by a filter can never be moved
by a press, while narrowing a facet and widening it again does not throw the
selection away.

The console states its tap-target floor once, through `.fbc-control`, so the new
controls carry that class rather than ClassView's per-bar override.

## 4. No way home from the FRC references page (ALREADY PRESENT -- not changed)

Verified rather than assumed, and the report does not hold. `/frc/+layout.svelte`
wraps every page under `/frc` in `FrcShell` unconditionally -- there is no
layout reset under `references/` -- and `FrcShell`'s nav carries
`<a href="/" class="portal">IDEA Portal</a>` with no condition on it, beside
`ReferenceShelf`'s own breadcrumb back to `/frc`. Measured in Chromium through
`/dev/frc`, which mounts the real shell and the real shelf: at 375px and 1440px
all three nav links render visible and non-zero, and a hit test at the centre of
the IDEA Portal link lands on the link itself. **Every section shell carries a
home affordance and FRC's is the odd one only in FORM** -- the classroom,
notebook, GAUNTLET, Foundry, coin-balance and contracts shells all use the
animated IDEA mark as the link, and FRC uses a text link, because its header
carries the FIRST logo and a second mark beside it would compete with a
trademark that may not be altered. Nothing was changed here.

## Verified

- `svelte-check`: **0 errors, 37 warnings**, re-derived after
  `npx svelte-kit sync` with the two `PUBLIC_SUPABASE_*` values exported (a
  fresh cloud checkout has no `.env`). Unchanged from the baseline measured
  before any edit, so no unused selector was introduced by the new CSS.
- `npm test`: **208 files, 4332 tests, all passing** (baseline before the work:
  207 / 4317). The new file is `tests/feedback-bulk-status.test.ts`; the rest
  are additions to `tests/classroom-composer-staging.test.ts`.
- **Mutation proof on the rubric derivation**, since a rubric that fails to
  arrive is invisible: `stagedRubricAfterSpec` short-circuited to return its
  input reddened 2 assertions; the file was restored from a `cp` copy (never
  `git checkout --`, per the rule) and md5-verified identical, and the suite
  went green again.
- **The fixture is put through the real `validateSpec` first**, so the rubric
  assertions cannot be about a spec no author could paste. This bit immediately
  and usefully: the first draft used `type: 'text'`, which the validator
  rejected as an unknown block type.
- **Browser pass in the preinstalled Chromium (141.0.7390.37)** against
  `/dev/feedback` and `/dev/frc` on a local dev server, at 375px and 1440px.
  Bulk bar absent at 0 selected and present at 4; every bulk control and the row
  checkbox measure **44px**; `scrollWidth === clientWidth` at both widths
  (375/375, 1440/1440). A clean batch named all four reports and cleared the
  bar, and the Resolved tab went to 4. A partial batch (harness refusing every
  second write) named the two that moved AND the two that did not with the
  refusal reason, and left exactly the two failures selected.
- The one console error seen during the run, `ERR_CONNECTION_RESET`, is present
  on a plain untouched load of the same page and is the sandbox blocking a
  non-loopback request, not the change.

## NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is a
  placeholder project, so `classroom_set_rubric` accepting a spec-derived rubric
  was not exercised against the real function -- only against
  `rubricFromSpec`'s output, which is byte-for-byte what the builder's own
  button already sends through that RPC today.
- **No signed-in surface was opened.** All four items live behind Google OAuth
  against a Bosco Tech account. The real `/classroom/[sectionId]` composer, the
  real `/classroom/feedback` queue and the real `/frc/references` were read and
  reasoned about from source; only the `/dev` harnesses were driven.
- No screenshot comparison, and `prefers-reduced-motion` was not exercised.

## Deferred

- The incomplete-submission gate (item 2), which needs a migration redefining
  `classroom_submit_assignment` to record and return the unmet list on an
  ACCEPTED submission instead of refusing on it. Whoever writes it should also
  decide whether the instructor side derives incompleteness through `specUnmet`
  at read time -- which needs no column and is what the data already supports --
  rather than storing a flag that can go stale when a spec changes.
- Attaching a spec on an EDIT still leaves the rubric alone. That is deliberate
  (an existing rubric may be hand-tuned and is the author's), but the surface
  says nothing about the difference, so a teacher who expects creation's
  behaviour on an edit gets silence rather than an explanation.
