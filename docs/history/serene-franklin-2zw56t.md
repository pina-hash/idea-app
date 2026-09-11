---
title: "Prompt 0143: the grading console stops needing a reload, grading is proved not to lock anybody out, and a teacher can close an assignment (`claude/serene-franklin-2zw56t`, migration 0198)"
date: 2026-09-11
branches: [claude/serene-franklin-2zw56t]
migrations: ["0198"]
subsystems: ["Classroom", "HTML assignments", "Grading", "Live notices", "Migrations", "Testing"]
---

Three things, all Mr. Pina's decisions of 2026-09-10, and they turned out to be
one item of work, one measurement and one migration rather than three builds.

## ONE: live, without a reload

`src/lib/classroom/live.ts` already solved this and the work was adding a topic,
not building a system. `responses` joins `hall-pass` and `song-queue`; the
grading console subscribes, debounces a burst to 250ms, and re-runs its own
`load()`.

**The prompt asked me to confirm `classroom_responses` is subject to the same
reasoning rather than assume it, and the honest answer is that it is NOT, for
the half the header actually argues.** The two tables behind the existing tools
have RLS on with NO POLICY and no client grant, so `postgres_changes` delivers
nothing to anybody. `classroom_responses` is different: `0086` gives it
`grant select on public.classroom_responses to authenticated` and an
own-row-or-reviewer policy, so a grader genuinely could SELECT the rows an event
would carry.

It reaches the same conclusion by two other routes, both measured:

1. **No migration puts it in the `supabase_realtime` publication.** Three files
   in this repo add a table to that publication (`0006`, `0017`, `0043`) and
   none is this one, so `postgres_changes` on `classroom_responses` delivers
   nothing today regardless of the grant.
2. **Even published, the event would be a second read path.** A row event
   carries the answer's `value` down a socket; the console reads through
   `loadGrading`'s role-scoped projection, and `0138`'s manager exclusion -- a
   person who can manage the section is not a student row in it -- lives in that
   projection and not in the table. A console patching a local copy from raw
   rows would be reading answers its own read had deliberately reshaped.

So the notice stays payload-free and means "re-ask the server". The header in
`live.ts` now says all of this, because the next person to look will have the
same question and the grant is what makes the obvious answer wrong.

**The poll is the floor and it is unconditional.** `GRADING_POLL_MS` is 60s,
between the hall pass's 45 and the song queue's 90. Its effect depends on
nothing -- not the bus, not the section, not the channel status -- because an
interval that re-ran whenever the channel changed state would stop being a floor
at exactly the moment the channel is unreliable. A console handed no bus still
refreshes, which is the point: a write made from the SQL editor announces
nothing.

## TWO: grade to `returned`, which was already true

Measured against real Postgres through the real RPCs:

```
grade(release=false) -> {"ok":true,"score":5,"state":"draft"}      column: draft
grade(release=true)  -> {"ok":true,"score":10,"state":"returned"}  column: returned
```

`classroom_grade_submission` has never written `submitted`, and the console has
always called it with `p_return => true`. So no grading code changed.

**What made the item worth doing anyway is item three.** `0198` introduces the
first object in the schema that CAN write `submitted`, which is exactly the
moment "grading never locks a student out" becomes able to regress silently --
the column would say `submitted`, the roster would look plausible, and only the
student would find out. It is now asserted in `tests/db/`, both directions,
including that a save still lands after a returned grade.

**And the interaction between the two decisions is stated rather than left to be
discovered.** Releasing a grade writes `returned`, which is editable again by
`0086`'s own definition -- so it RE-OPENS a student the instructor had closed. A
DRAFT grade does not:

```
draft-grading a CLOSED student -> submitted   (still shut, save refused)
releasing a CLOSED student     -> returned    (open, save lands)
```

That is the workflow: grade the class as drafts, release, then close. The
control says so in words (`ASSIGNMENT_CLOSE_ORDER_NOTE`), because a teacher
cannot be expected to infer it from two features.

## THREE: the lock, and the hole in the decided mechanism

**The measurement said no path existed.** A teacher calling
`classroom_submit_assignment` is refused -- it resolves its subject through
`_classroom_engine_student`, which is the caller -- and a direct UPDATE is
`permission denied for table classroom_submissions`. The catalog census, taken
on the WRITE form rather than on any mention of the literal:

```
functions WRITING state = 'submitted': classroom_close_assignment, classroom_submit_assignment
(functions merely READING that state: 7)
```

The seven is the positive control: a census predicate that matched the read form
would have matched seven functions and the assertion would have been about
nothing.

### The hole

`classroom_unsubmit_assignment` (0086) refuses only a row that has already been
graded. So a close placed on UNGRADED work came straight back off:

```
state after a simulated instructor lock: submitted
student calls classroom_unsubmit_assignment: {"ok":true,"state":"draft"}
state afterwards: draft
```

That is most of what an end-of-unit close is for -- the students who never
handed anything in are exactly the ones whose late work is being kept out. A
lock any student can remove in one call is not a lock.

### The fix needed no new column

A student's own submit has ALWAYS stamped `submitted_at` in the same statement
it sets the state, and it is the only writer of that state. So
`state = 'submitted' AND submitted_at IS NULL` is an instructor's close and
nothing else -- unreachable for every row stored before `0198`, which makes the
new guard on `classroom_unsubmit_assignment` inert over all of them.

`src/lib/classroom/html-assignment/lock.ts` is the one client-side statement of
that predicate, three-valued (`open` / `closed` / `turned-in`) so every renderer
is exhaustive over it and a fourth state would be a type error rather than a
blank chip.

### What 0198 is, and what it is one object more than

**It CREATES one object and RE-SIGNS one.** `classroom_close_assignment` is the
new one. `classroom_unsubmit_assignment` is `0086`'s body verbatim -- diffed
against the source, not reconstructed -- with a single `if` inserted between the
two refusals it already had, in their existing order, so a student who genuinely
submitted reads exactly what they have always read. Its arity does not move, so
there is no signature trap and no deploy ordering.

That is one more object touched than "ONE OBJECT" reads as permitting, and it is
named in the ledger rather than buried: without it the feature does not work.

**The narrowing answers for the rows already stored, and the count is taken in
section 1 rather than section 4.** By the time section 4 runs, section 3 has
replaced the function either way, so a count there could not tell a first apply
from a second -- and on a second it would be counting rows this feature itself
created and refusing to re-apply over its own work. Section 1 asks the DEPLOYED
function's own `prosrc` whether it already carries the `closed` refusal, and
only counts when it does not.

Proved by breaking it. With the pre-0198 body put back and a stranded row
manufactured:

```
0198: 3 submission row(s) are already in state 'submitted' with no submitted_at,
so the new unsubmit guard would refuse work a student can undo today. ...
```

and, separately, the file re-applied cleanly over a database already holding two
instructor-closed rows.

### Other decisions inside the migration

- **The roster comes from the roster.** A student with no submission row at all
  is the case a close is FOR -- `classroom_save_response` reads no state for
  them and accepts the write -- so the close creates the row. Taking the list
  from `classroom_submissions` would have closed the assignment for everyone who
  had started and left it open for everyone who had not, which is backwards.
- **The gate is per student and is the grading gate.**
  `classroom_can_review_submission`, asked per row rather than once for the item,
  because a co-posted item legitimately puts students of a section this caller
  does not manage on the enrollment join. A refusal is REPORTED, not skipped.
- **A student's own hand-in is left alone**, and its stamp survives a
  class-wide close, which is what keeps the hand-in theirs.
- **Reopening is on the same object**, because a close with no way back is a
  trap -- the mistake is one press and the only route out would be grading
  everybody. It touches only rows a close could have written.

## The student is told, and the sentence that was already wrong

`HX_REFUSALS.locked` read *"This is submitted, so edits are locked. Unsubmit to
keep working."* On a ported document **neither half is true**: there is no
turn-in (finishing the work IS the hand-in), so the student never submitted
anything, and there is no unsubmit control anywhere on that surface. It was
already shipping and already wrong; it now points at the one closed sentence.

`HtmlAssignmentFrame` gained a `lock` prop that renders the notice ABOVE the
document and folds into a `shut` derived, so a caller passing `lock` and
forgetting `readOnly` cannot leave a worksheet that takes typing and drops it.
Absence is still the primary mechanism -- a surface that must not write hands
down no callbacks -- and this is belt and braces on the one case where a student
could type yesterday and cannot today.

**Two files outside the ownership list were edited because `0198` makes their
existing sentences false**, and both are named in the ledger:
`AssignmentEngine.svelte` (the spec engine told a closed student to unsubmit and
offered the button, which the RPC now refuses) and one expression in
`ItemDetail.svelte`.

## Measured

- **svelte-check: 0 errors, 37 warnings** at 31 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`, re-derived after
  exporting the two `$env/static/public` values and re-syncing. Unchanged from
  the stated baseline.
- **Suite: 377 files, 7423 tests, all passing**, from 375 / 7383. The +2 files
  and +40 tests are exactly this bundle's two new files (14 + 26).
- **One expected break, generalized rather than deleted.**
  `tests/classroom-live.test.ts` spelled the topic list out as
  `['hall-pass', 'song-queue']`, which a legitimate third topic necessarily
  breaks. It now asserts the RULE -- the two originals still head the list in
  order, the list is unique, every declared topic parses, and a negative control
  that nothing else does -- and was **re-mutated to confirm it still bites**:
  making `isClassroomLiveTopic` return true for every string reddens 2 of its 7
  assertions. `live.ts` was restored from a copy and re-verified green.

## Not verified

- **The migration was NOT applied.** This container cannot reach the production
  database. Everything above is against a real embedded Postgres with the real
  migration files applied unmodified.
- **No signed-in production surface was opened.** The browser pass drives `/dev`
  routes only.
- The harness blocks non-loopback requests, so text is measured in the FALLBACK
  font stack, and `prefers-reduced-motion` is `no-preference`, so that path is
  not exercised.

## Deferred, deliberately

- **A unit-wide lock.** `0198` is per item. A unit-wide close needs its own
  answer for what a unit is, which `notebook_unit_items` and `classroom_items`
  spell differently.
- **Telemetry of any kind.** No presence, no active time, no per-student status
  beyond the `state` column that has existed since 0086. It is a separate design
  with its own retention question about minors' data.
- **`CLAUDE.md`'s "THE CLIENT ANSWER PATH IS STILL NOT WIRED" paragraph is
  STALE** and was not edited here -- that file is not this bundle's. Ledger 0141
  wired it: `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte` builds
  an `HxAnswersStore` and hands it down. Worth a correction in a bundle that
  owns the file.
