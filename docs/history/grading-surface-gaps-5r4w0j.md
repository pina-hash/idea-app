---
title: "Three instructor reports on the grading surface, two of them already shipped four days earlier: the grades tab is ordered by due date now and says so, extra credit gets the ceiling case its range never had, and the one extra-credit gap left is a student's own returned score not adding up (`claude/grading-surface-gaps-5r4w0j`, no migration)"
date: 2026-09-06
branches: [claude/grading-surface-gaps-5r4w0j]
migrations: []
subsystems: ["IDEA Classroom", "Browser harness", "Testing"]
---

Prompt 0092. Three instructor reports from the September feedback pull, all on
the grading surface, all recorded as still open. Started from `origin/main` at
`e06ed58`, in `/home/user/idea-app`. The audit found that two of the three had
been built on 2026-09-02 by `8dfc4e8` ("Grading: say when work changed after it
was graded, and record extra credit"), four days before the prompt was written.
**The prompt's own claims about items ONE and THREE are stale, and the tree
wins.**

That is the entry's main finding, so it goes first: **only item TWO was open.**

## The audit, item by item

### ONE. Extra credit -- BUILT, and it is written, read and exported

`classroom_submissions.extra_credit` is `numeric`, nullable, no default, with
`classroom_submissions_extra_credit_range` (`null or 0..10000`). It is not an
orphan column:

| | Where |
| --- | --- |
| Written | `classroom_grade_submission`'s SEVEN-argument arity (0171), `p_extra_credit`; null means LEAVE ALONE, 0 means take an award back |
| Summed | inside that function -- `v_score := v_score + coalesce(v_extra, 0)` -- so `score` already carries it and nothing may add it on again |
| Selected | `SUBMISSION_SELECT_EXTRA_CREDIT`, its own rung, reporting `extraCreditReady` |
| Rendered | `GradingConsole.svelte`: a labelled number input on `.tap-44`, a refusal sentence, and a total that itemises (`Total: 18 / 20 pts (15 rubric + 3 extra credit)`) |
| Exported | `grading-export.ts`, a conditional workbook column -- absent when the class awarded none, so an unusing class exports the bytes it exported before |
| Withheld | when the payload came off a narrower rung, with `extra-credit-unavailable` saying why rather than blanking the form |

So this is the case the ledger anticipated: "If it IS written somewhere, this
item may be a discoverability problem rather than a missing feature." On the
INSTRUCTOR's side it is not even that -- the control is labelled, on the floor,
and the total decomposes beside it.

**THE ONE PLACE IT DOES NOT ADD UP IS THE STUDENT'S OWN RETURNED CARD, AND THAT
FILE IS NOT THIS BUNDLE'S TO EDIT.** `AssignmentEngine.svelte` renders
`Returned: {score} / {outOf} pts` above a `RubricView` whose criteria sum to
`outOf`. With an award on the row that reads `Returned: 21 / 18 pts` over a
breakdown totalling 18, with nothing anywhere saying where the extra three came
from. The value is already in the payload -- `loadStudentEngineData` calls the
SAME `selectSubmissions` ladder the console does, and `normalizeSubmissionRow`
keeps the three states apart (`undefined` = column not selected, `null` = none
awarded, a number = an award) -- so this needs **no migration, no rung and no
new read**: it is one conditional line in a file prompt 0092 does not own.
Written down here rather than built, because the ownership list is what keeps
parallel lanes from editing each other's surfaces.

### TWO. The sort -- THE ONLY OPEN ITEM, and the prompt misattributes it

The prompt says "prompt 0069 measured it sorted by NAME". **It did not, for this
page.** 0069's own table (`docs/history/instructor-requests-surfaces-j2dfjc.md`,
section 4) measured the GRADING CONSOLE ROSTER by student display name and
`GradesPanel` by "awaiting count, then `due_at desc` as a tiebreak". The feedback
card's path is `/classroom/[sectionId]/grades`, which is `GradesPanel`, so the
name sort is a different surface.

**WHAT "KINDA RANDOM" ACTUALLY WAS.** The comparator was:

```js
(b.awaiting > 0 ? 1 : 0) - (a.awaiting > 0 ? 1 : 0) ||
b.awaiting - a.awaiting ||
Date.parse(b.item.due_at ?? '0') - Date.parse(a.item.due_at ?? '0')
```

Not random, and not a name sort. Its PRIMARY key is a live count of other
people's actions: an assignment from May climbs above one from September the
moment one student hands in, and drops back the moment it is marked. So the list
reorders itself between two visits for reasons the reader did not cause, cannot
see, and is not told about -- which is what a person calls random. The page also
never said what it was sorted by, so there was nothing to correct the
impression against.

**WHICH DATE KEY, AND WHY.** Four candidates carry a date per row: `due_at`,
`created_at`, `first_published_at` and `publish_at`. `due_at` is the one a
teacher grading a pile wants, because work becomes markable after it is due and
the pile builds in due order -- `created_at` is posting order, which routinely
differs (next week's lab is posted today). Direction is DESCENDING, newest due
first: the class stream is already newest-first, and last term's lab is the thing
somebody scrolls to rather than lands on.

**`Date.parse('0')` IS 2000-01-01 IN V8, MEASURED, NOT NaN AND NOT ZERO.** So a
due-less assignment was silently sorted as if it were due at the turn of the
century. It landed last, which is where it belongs, so nothing ever looked
wrong -- but the reason it landed last was an accident of how one engine parses a
one-character string, and an accident that happens to be right is not a rule.
Undated rows are now a SEPARATE GROUP, decided by name (`hasDueDate`), placed
after the dated ones and ordered among themselves by `created_at` then `id`.

**THE `id` TIEBREAK IS NOT DEFENSIVE.** `now()` is TRANSACTION time and a roster
import or a duplicate writes several rows in one transaction, so an exact
`created_at` tie is the ordinary case. `Array.prototype.sort` is stable, so a
comparator that runs out of keys leaves the input order -- which here is
`created_at desc` from `itemsForSection`, an order this module cannot see and a
future caller might not preserve. Two rows tying on every stated key would then
swap between two loads with nothing to say why, which is the complaint again.

**WHAT THE CONTROL COSTS, STATED RATHER THAN HIDDEN.** Both keys are offered and
the choice is **per visit and is not remembered**: a teacher who prefers the
marking queue picks it again next time. Persisting it means a new namespace in
`profiles.preferences` and a write path from this page, which is a larger change
than the report asked for and touches modules this bundle does not own. The
DEFAULT is the half that matters and the default is now the date.

**THE PAGE STATES ITS OWN ORDER**, in words, above the list ("Newest due date
first" / "Waiting to be marked first"). That is half the fix on its own.

**THE HEADING IS WITHDRAWN UNDER `queue`**, because there is no date boundary to
draw there, and it is never drawn when one of the two groups is empty --
`undatedBoundary` answers -1 for an all-dated list, an all-undated list and an
empty one alike. A "No due date" heading over the whole list is a label that has
stopped labelling anything.

### THREE. Post-grade edits -- BUILT, and correctly needs no migration

`postGradeChange` in `grading-export.ts` derives it from `graded_at` against
`submitted_at` and every response's `updated_at`. 0171's own header records that
this was measured before the file was written and deliberately got NO schema
change. It NAMES THE ACT (`Resubmitted after grading` / `Edited after grading` /
both), names WHEN (both instants), and CLEARS ITSELF, because every grade stamps
`graded_at = now()` including a regrade.

**IT DOES NOT CRY WOLF, AND THAT IS STRUCTURAL RATHER THAN TUNED.** It fires only
STRICTLY after the grade; an unparseable or absent timestamp contributes nothing;
and there is no grade to be after until somebody grades. What it deliberately
cannot see is written down in its own header: a file attached after grading
(`classroom_submission_files.created_at` is not in any shipped select), a file
REMOVED (nothing records a deletion), and an edit that was edited back
(`updated_at` is a timestamp, not a diff -- the sentence says the work was
TOUCHED, which is what the data supports).

An autosave DOES count, and that is the right answer rather than a leak: the
graded artefact ceasing to be the graded artefact is exactly the report. The
noise floor is that the signal is per SUBMISSION and clears on the next grade,
not per keystroke.

The Grades tab's own chip counts RESUBMISSIONS only and says "resubmitted"
rather than "changed", because an edit lives in `classroom_responses`, which that
page does not read -- a number labelled "changed" that could only see half the
acts would read as complete.

### FOUR. Who sees what

| Surface | Gate | Refusal |
| --- | --- | --- |
| `/classroom/[sectionId]/grades` | `classroom_manages_section` must be `true` | **404**, not a redirect -- an enrolled student can read the section, so a bounce would confirm the tab exists |
| `/classroom/[sectionId]/item/[itemId]/grade` | same, page-level | 303 to the item (convenience; the real boundary is `classroom_can_review_submission` inside every grading RPC plus RLS) |
| the student's returned card | own row through RLS | -- |

A teacher of another section gains nothing: the counts on the Grades tab come
from a plain `classroom_submissions` select run as the CALLER, so RLS
(`classroom_can_review_submission`) is the filter and the tab is a tally of
policy-scoped rows. Nothing in this bundle widens a read, adds a grant, or
changes a policy.

### FIVE. The counts block

`covered` is **133** against **133** route specs in the static region, so the
measured region speaks for this tree. **2 outside threshold**, both `/dev/notebook`
`tap-reach` at 375 and 1440 (toolbar text controls, decision 12, with the owner).
That is prompt 0089's claim, re-derived and confirmed.

## No migration

**0190 was not written and is not needed.** The three answers:

* extra credit already has its column, its constraint, its RPC parameter and its
  arity pair (0171);
* the post-grade comparison is answerable from `graded_at`, `submitted_at` and
  `classroom_responses.updated_at`, all 0086 columns -- 0171's header says so and
  the audit confirmed it;
* an ordering is a client-side comparator over rows the page already reads.

Nothing in this bundle touches SQL. **0190 remains unclaimed.**

## What was measured

**Mutation proof, three controls, every file restored from a `cp` copy and
md5-checked.**

1. **Extra credit refuses at both ends.** Opening BOTH refusal clauses in
   `classroom_grade_submission` (the negative and the ceiling) reddened exactly
   the two RPC-sentence assertions and left the two column-CHECK assertions
   green; opening the CHECK as well (`check (true)`) reddened all four. So the
   two layers are measured apart, which is what defence in depth requires --
   `2 failed | 24 passed`, then `4 failed | 22 passed`. Restored, md5
   `7d550a584d8f8961fd8cb916418af968`, `git diff --stat supabase/migrations/`
   empty, 26/26 green.
2. **The sort is the chosen key.** Replacing the `due` branch with the `queue`
   comparator (the shape a single comparator behind both keys would take)
   reddened 7 of 22, naming the order: "the due order: dated first, newest due
   first, undated after > it is the hand-computed order" and "it renders in the
   DUE order without being asked". Restored, md5
   `9b40d27a121fbdd96035f1bf89fa0498`, 22/22 green.
3. **The post-grade flag does not fire on everything.** Widening
   `ms != null && ms > graded` to `ms != null` -- the OVER-flagging direction,
   which is the one the prompt asked about -- reddened 5 of 26, including "work
   that has not moved since the grade reports nothing" and "IT CLEARS: regrading
   past the change silences it". So the test bites on flagging everything and
   not only on flagging nothing. Restored, md5
   `17cdca60acf9f51817afd72116233e06`, 26/26 green.

**THE CEILING HAD NO CASE UNTIL THIS BUNDLE.** `extra_credit <= 10000` was
asserted nowhere; the negative end had two tests and the top end had none. Three
were added (the RPC's refusal, the boundary value itself so the refusal is a
bound and not an off-by-one, and the column CHECK against a direct write). An
untested ceiling is a number in a comment.

**THE EXPECTED ORDERS WERE HAND-COMPUTED FROM THE FIXTURE'S DATES BEFORE ANYTHING
WAS RUN**, with the reasoning written beside them in both the unit test and the
browser spec, and the run then agreed. Deriving them by calling `orderStandings`
and pinning what came back would be a test that cannot fail.

**The fixture is supplied in an order that is neither answer**, so a comparator
returning 0 for every pair leaves it and fails, rather than passing because the
rows happened to arrive correct. Two rows share `created_at` to the millisecond;
one undated row holds the biggest marking queue, so the two keys disagree at the
TOP rather than somewhere a partial sort could still look right.

**Browser pass, `/dev/grading` at 375px and 1440px** (Chromium 141.0.7390.37,
`--route /dev/grading`, which prefix-matched the four grading harnesses: 20
route/width runs, **352 measurements, 0 outside threshold**, 58.1s):

| | 375 | 1440 |
| --- | --- | --- |
| horizontal scroll | 0px (375 vs 375) | 0px (1440 vs 1440) |
| the order sentence, contrast | 5.88:1 | 5.88:1 |
| the No due date heading, contrast | 5.88:1 | 5.88:1 |
| a sort control, tap target | 87x44, 0/2 under 44 | 87x44, 0/2 under 44 |
| the Grade button | 86.9x45.4, 0/7 under 44 | 86.9x45.4, 0/7 under 44 |
| console errors | 0 | 0 |

The rendered list matched `orderStandings`'s own answer at both widths; the
heading sat at DOM index 4 with 4 dated rows before it and 7 rows in total;
clicking "Needs marking first" reordered the list, restated the sentence, and
withdrew the heading (0 present).

**The two halves of item ONE and item THREE, measured on the sibling harness in
the same run:** the extra-credit input 88x44 at both widths with its label and
note at 5.88:1; the pre-0171 branch withholding it (`present 0`); and the
post-grade chip at **exactly 3 of 5** rows, 5.7:1 -- two rows unflagged, for two
different reasons, which is the positive control that stops a signal that fired
on everybody from satisfying a presence check.

**`--tap-44` IS THE MECHANISM AND THE PANEL DECLARES NO DENSITY CLASS.** Per
`IDEA_INTERFACE_STANDARDS` 10 a surface sits on the 24px floor only when it says
so in a named class on its own root; `GradesPanel` says nothing, so it is
student-facing for the purpose of the rule whatever its audience, and the sort
controls clear 44px at both widths. The floor is `min-height` through `.tap-44`,
never a height in the component.

**THE COUNTS BLOCK WAS REGENERATED TWICE, AND THE FIRST RUN IS WORTH RECORDING.**
The measured region now reads **134 covered against 134 route specs, 268
route/width runs, 4022 measurements, 2 outside threshold, 670.6s**, on commit
`efd7da3` with `dirty: false` -- the two being `/dev/notebook` `tap-reach` at both
widths, unchanged. The run BEFORE it reported **14**, and the twelve extra were
all `/dev/pathways` at 1440 in one block: five `contrast [no match]`, one
`tap-target [0 matched]`, one `tap-reach [0 matched]` and five `presence
[present 0]`, on a page that had reported `HTTP 200` and `app rendered in
1065ms` moments earlier. The tell is in the same run's own network lines --
`net::ERR_ABORTED` on `/dev/pathways` AND on its
`__data.json?x-sveltekit-invalidated=10` -- so the document navigated away after
the harness's `prepare-click` and every selector afterwards was querying a blank
page. The SAME route at 375 in the SAME run passed all sixteen, and
`--route /dev/pathways` on its own came back **2 runs, 32 measurements, 0 outside
threshold**. So it is a run-level instability in that harness and not a finding
about that page; it is recorded here because "12 new outside-threshold rows"
is exactly the shape a real regression takes, and the next reader deserves the
discriminator (a same-route control at the other width, plus a targeted re-run)
rather than the conclusion.

## What was NOT verified

* **The live Supabase project.** `IDEA_MIGRATION_URL` is unset in this container
  and nothing here can reach production. No RPC was called against it, no applied
  state was read, and no claim in this entry is about the deployed database.
* **A real signed-in session.** Everything measured is a `/dev` harness mounting
  the real components against in-memory fixtures. The gates in the audit table
  were read from the route source, not exercised against a real teacher account.
* **The student's returned card with an award on it.** It is not this bundle's
  file and no harness here mounts `AssignmentEngine` in that state.
* **`prefers-reduced-motion: reduce`.** The harness runs at `no-preference`; this
  change adds nothing that moves, so there is nothing new on that path, but it
  was not exercised.
* **Web fonts.** The harness blocks every non-loopback request, so all text above
  was measured in the fallback stack.

## Deferred, and why

* **The student's returned score.** Named above. One conditional line in
  `AssignmentEngine.svelte`; needs no migration and no new read; belongs to
  whoever owns that file.
* **Remembering the sort choice.** A `preferences` namespace and a write path.
  Worth doing only if a teacher asks for it after living with the new default --
  a control nobody re-picks needs no memory.
* **A `classroom-updates.json` entry.** None was written. The Grades tab answers
  404 to a student, so this change has no student-visible effect, and the rule is
  that a change with none needs no entry. The one thing here a student WOULD see
  is the returned-score line, which was deferred above; when it lands it owes an
  entry.
* **A `CLAUDE.md` line for the ordering rule.** `CLAUDE.md` is not in this
  prompt's ownership list, so the rule is recorded here instead. It is a
  candidate: "the grades tab orders by due date and states its own order" is the
  kind of sentence a later bundle would otherwise undo by accident.
