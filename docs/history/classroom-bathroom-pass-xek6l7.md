---
title: "The digital bathroom pass (`0143`)"
date: 2026-08-28
branches: [claude/classroom-bathroom-pass-xek6l7]
migrations: ["0143"]
subsystems: ["IDEA Classroom"]
---

## The digital bathroom pass (`0143`)

A student can now sign themselves out of a class and back in again, from a card
at the top of the class page. One student per section may be out at a time.

**Nothing like this existed, and that was confirmed before anything was
written.** A sweep of `supabase/migrations/`, `src/` and `tests/` for
`bathroom`, `hall_pass`, `attendance`, `presence`, `sign_out` and `restroom`
returned exactly two live hits, neither of them a concept: the
`long_bathroom_break` fine in `coin_categories` (`0070`), and the string
`'attendance'` as a section label inside `dev-reference-fixture.ts`'s sample
syllabus. There is no attendance table, no in-class-presence flag and no
sign-out of any kind anywhere in the schema. So there was no prior shape to be
consistent with and no rows to migrate.

### What the decisions were, and what actually enforces each one

Every decision below was handed to the session already made. They are recorded
here with the mechanism beside them, because the mechanism is the part that can
regress.

**Self-serve.** No approval step, no request state, no instructor grant.
`classroom_hall_pass_open` takes `p_section_id` and nothing else: the student is
`current_user_email()`, so acting as somebody else is not expressible in the
signature. That is the convention every other student-facing classroom write
here already follows, and it is the reason there is no identity parameter to
audit.

**One student out at a time, per section, as a real capacity check.** A
**partial unique index** on `(section_id) where closed_at is null`. Three things
made that the right instrument rather than a lock or a count:

- A count-then-insert is wrong under READ COMMITTED and the codebase already
  says so. Both callers get their own snapshot, both count zero, both go out.
- `select ... for update` on the section row would work, but it leaves the
  invariant resting on every future caller remembering to take the lock. The
  index holds against a caller nobody has written yet.
- Unlike the Foundry play window (`0139`), the predicate here is not volatile.
  `closed_at is null` is a plain column test, so it CAN be an index, where
  `now()` cannot -- which is why `0139` needed `pg_advisory_xact_lock` and this
  does not.

The refusal never names a database object. A bare unique violation carries the
constraint name, the table and the column list; the open RPC catches
`unique_violation`, re-reads the winner, and answers `{ok:false,
reason:'taken'}` (or `'already_out'` when the caller is the one holding it).

**State is derived, never stored.** Being out IS an open row. There is no
boolean, no status column and no enum -- asserted from
`information_schema.columns`, which is pinned to exactly six columns
(`id`, `section_id`, `student_email`, `opened_at`, `closed_at`, `closed_by`).
Elapsed time is arithmetic over `opened_at` at read, in a pure function that
takes `now` as a parameter and reads no clock.

**No auto-close and no time limit.** Nothing expires a pass; there is no cron,
no trigger and no staleness window. This is also honoured in the UI, which is
where it would most easily be lost: `hallPassElapsedLabel` has no ceiling and no
warning tone at any duration, because a surface that started colouring minutes
red would be enforcing a limit the feature deliberately does not have.

**No link to the coin economy.** `coin_categories` prices a
`long_bathroom_break` fine and it stays a separate manual judgement. Nothing in
`0143` reads, writes or references `coin_transactions`. The migration header
states the rule in the form that matters: a duration computed here must never
become an input to one, because the moment a clock charges a student
automatically the pass stops being a pass and becomes a meter.

### Disclosure, which is the part this bundle exists to get right

An enrolled student learns exactly one bit -- whether the pass is taken -- and
never by whom, for how long, or anything about any past pass. An instructor of
the section sees the name, the time out and the history.

**Three independent mechanisms, no one of them trusted alone.**

1. **The table is shut.** RLS enabled, **no policy and no grant** to `anon` or
   `authenticated` -- the `student_app_plays` shape (`0139`). Either the missing
   grant or the missing policy alone denies every select. Asserted as a
   `42501` *permission error*, deliberately not as an empty result: a select
   returning zero rows would satisfy the same sentence for the wrong reason,
   because it would mean a policy was filtering, and a policy is a thing that
   can later be widened.
2. **The read function projects by role, by construction.**
   `classroom_hall_pass_state` **builds two different objects in two branches**
   rather than building one and stripping fields. A field cannot leak by being
   forgotten in a strip step that does not exist. The student branch contains no
   expression anywhere that mentions another person's email, name or
   `opened_at`.
3. **Nothing else projects a pass at all.** The manager-only fields on the close
   result are gated on the same `classroom_manages_section` the read uses.

**The types carry the same rule into the client.** `HallPassStudentState` has no
field capable of naming anybody, so `HallPass.svelte` *cannot* render a name on
a student payload -- there is no expression that would produce one. This is also
why the component takes **no `canManage` prop**: the role comes from the
payload's own `scope`, because the payload is what the database actually
decided. A flag threaded down beside it would be a second opinion about who the
viewer is.

**A peer is told "Someone is out", with no duration.** The duration was withheld
on purpose and it is worth writing down why: "out 23 min" beside an empty chair
identifies the person just as well as the name does, to everybody in the room.

**A non-member gets NULL**, which is also what a section id that does not exist
returns, so an id cannot be probed. This is asserted against a real section
holding a real open pass -- a null for an empty section would prove nothing.

### The enrollment is a composite foreign key, not an RPC check

`(section_id, student_email)` references `classroom_enrollments` on its own
primary key, so a pass for somebody off that section's roster is
**unrepresentable** rather than merely refused. Proven as the connection owner,
with RLS and every grant out of the way, so the only thing that can refuse the
insert is the key itself (`23503`), with the same insert for an enrolled student
landing as the positive control.

**It cascades, and that is a deliberate asymmetry with `0138`.**
`classroom_remove_enrollment` refuses to remove a student with responses,
submissions, approvals or notebook entries, because those are work and deleting
the enrollment would strand them. A hall pass is not work. So it cascades, and
removing an enrollment takes that student's pass history with it. Recorded
because it is exactly the kind of thing that reads as an oversight later: adding
hall passes to `0138`'s stranding counts would make a roster correction
refusable because somebody once went to the bathroom.

The open RPC still asks `classroom_is_enrolled`, which is the strictly stronger
question -- it also requires the enrollment to be **active**, which the key
cannot express. That is the one rule the FK does not already make
unrepresentable, which is why it has an assertion of its own.

**An instructor is refused with `not_a_student`, even holding an enrollment
row** -- which instructors routinely do, since they enroll themselves to see a
class the way a student does and roster imports sweep them in (`0138`). The
composite key would happily accept such a row; the manage check asked separately
and first is what refuses. `hallPassCanOpen` mirrors it so no control is offered
whose only possible answer is a refusal.

### Where it lives, and why there

**At the top of the class pane, above the class title**, mounted in
`src/routes/classroom/[sectionId]/+layout.svelte`'s `nav` snippet.

`ClassView`'s `pane-tools` row was the other candidate and is where a "New post"
or "My notebook" belongs -- but it sits below the pane header, and the whole
value of this feature is the second it takes. Below 1024px that pane **is** the
class page at full width, so first-in-the-pane means zero scrolling and one tap
from opening the class. Measured: the card's top edge is at **y=201.3px** in a
812px-tall viewport at 375px, fully above the fold with no scroll.

It is deliberately **not** in `PeoplePanel`. That was read first, and it is the
right home for roster work and the notebook compliance element -- but it is a
manager-only route one navigation away, and a student needing the pass would
never reach it. Putting the instructor's history there and the student's control
in the pane would also have split one small feature across two surfaces with two
reads. The history rides on the same payload as the state, from the manager
branch of the one RPC, so **there is no surface a student could reach that
answers this question emptily and has to be kept empty.**

The consequence, stated plainly: the card renders on the class page and on item
pages (where at 375px the list pane is hidden), and **not** on `/people`,
`/grades` or the deck viewer, which render outside the split. The class page is
the entry point and that is where the decision put it.

### Two clocks, both threaded, neither read by a component

`now` is read once in the layout and handed down; nothing in `HallPass.svelte`
or `$lib/classroom/hall-pass.ts` calls `Date.now()`. So every figure in one
paint is measured against one instant and each label is assertable at a pinned
one. The elapsed label ticks at 30s; **re-asking the server is a separate
interval** (`HALL_PASS_POLL_MS`, 45s, paused while the tab is hidden and re-asked
on becoming visible), because "how long has it been" and "is it still true" do
not want the same answer rate. The visibility transition is the one that
matters: this surface spends most of its life in a pocket.

Times of day are rendered in **America/Los_Angeles**, the calendar the classroom
already adjudicates in (`0140`), and not in the viewer's local zone -- an
instructor reading "out since 10:42" is matching it against a bell schedule.

### What was measured

**Mutation proofs, all three in the permissive direction, migration restored
byte-identically after each (md5 `9c94deba36f9960fa0b3a35601d2fb74`).**

- **Capacity check** -- partial unique index removed (and the migration's own
  self-check relaxed so the mutation reached the tests rather than failing at
  apply time). 4 of 5 assertions reddened: the burst of four produced **4
  simultaneous open passes instead of 1**, the second opener never blocked
  (the `pg_stat_activity` poll timed out at 10s, so `blocked` was false), and a
  student's second tap succeeded instead of answering `already_out`.
- **Name disclosure** -- the student branch's guard flipped to `if true`, so a
  student received the manager projection. 4 of 16 reddened: the key-set
  assertion, `scope` reading `manager`, and a 3-row `history` arriving where
  `undefined` was expected. Two narrower variants were then run to check *which*
  assertion bites: a name nested inside an existing key was caught by the `mine`
  type check, and a name leaked through `section_id` (an existing key not
  asserted before the sweep) was caught by the string sweep alone, which is what
  that sweep exists for.
- **Close gate** -- `if not v_manages and v_holder is distinct from v_email`
  flipped to `if false`, plus the section gate widened so a student of another
  section reached it. 2 of 16 reddened; both "the pass is still open" positive
  controls flipped, which is the assertion that matters -- a gate that threw on
  everything, holder included, would have passed the two refusal assertions on
  its own.

Restored and green: **21/21** across the two new files.

**The concurrency is proven, not assumed.** This mattered more than usual here:
because the pass *stays open*, a burst of N with `Promise.all` produces exactly
one winner and N-1 refusals **on code with no capacity check at all**, so the
obvious test proves nothing. So `classroom-hall-pass-race.test.ts` forces and
then observes the overlap: student A opens inside an explicit **uncommitted**
transaction; student B calls the same RPC on a second connection and must block;
the test polls `pg_stat_activity` for `wait_event_type = 'Lock'` scoped to
`current_database()` (the cluster is shared, so an unscoped read would see a
neighbour's lock) and asserts B's promise is **still unsettled** at that moment.
That is the proof of overlap. A commits; B's insert then fails the unique check
and comes back as a structured refusal. The sequence cannot pass without the
index: with nothing to block on, the poll times out and the file reddens before
reaching any outcome assertion, which is what the mutation above confirmed.

**Browser, at 375px and 1440px.** `npm run verify:browser` drives `/dev` routes
only, and this session was not permitted to touch `src/routes/dev/`, so the
harness could not be extended to cover the card. Instead the **real component**
was imported from the running Vite dev server and mounted with Svelte's own
`mount` as the first child of the **real classroom nav pane** on
`/dev/classroom-split/s-1?manage=1` -- the same room (`.cr-root`), the same
tokens, the same pane width. No markup was hand-rolled. Transitions were frozen
(`transition:none`, never `animation`, per the pane rule).

Four states x two widths:

| state | control | size | min-height | hit | contrast |
| --- | --- | --- | --- | --- | --- |
| student, free | Sign out | 112.2 x **44.0** | 44px | 5/5 | 7.91:1 |
| student, taken by another | Sign out (`aria-disabled`) | 112.2 x **44.0** | 44px | 5/5 | 9.31:1 |
| student, own pass | Sign back in | 146.5 x **44.0** | 44px | 5/5 | 7.91:1 |
| manager, someone out | Sign back in | 146.5 x **44.0** | 44px | 5/5 | 7.91:1 |
| manager, someone out | Recent passes (disclosure) | 341 x **44.0** @375 | 44px | 5/5 | 15.42:1 |

Every control clears the 44px floor exactly, via `.tap-44`'s `min-height` and
never a fixed height. The hit fraction is a real `elementFromPoint` test down
each control's full span, five samples, not a computed height. Horizontal
overflow is **0px** at both widths in all four states. Worst text contrast is
**5.91:1** (the status chip at 12.48px); worst control contrast 7.91:1. One
console error in every run, including on the **bare harness page with nothing
mounted**: the documented `fonts.googleapis.com` proxy reset, so text is
measured in the fallback stack.

**The `aria-disabled` control was driven, not reasoned about.** Clicking "Sign
out" while the pass is taken produced the sentence "Someone else has the pass
right now. Try again when they are back." on the **first attempt**, with
`role="status"`, **zero** RPC calls (the predicate short-circuits, so the
refusal costs no round trip), and nothing in the card's full text naming
anybody. The click retried against its own effect rather than waiting on a
timer, per the paint-is-not-interactivity rule.

`npm run verify:browser` was also run unchanged as a regression check.

**Baselines.** `svelte-check` 0 errors / 37 warnings, mix 31 / 5 / 1 across 20
files, before and after, with no warning in any new file. Full suite 138 files /
3174 tests before; 140 / 3195 after.

### What was NOT verified

- **The migration has not been applied.** It is authored here and applied by
  hand from the Supabase SQL editor. Nothing in this session touched a live
  database, and the local `.env` is the placeholder project.
- **No signed-in surface was driven.** The card was measured through the real
  component mounted into a `/dev` route; the actual `/classroom/<section>` page
  needs a Bosco Tech Google session, which an automated run cannot hold. The
  layout wiring (the load's degrade, the mount position, the transports) is
  verified by type-check and by reading, not by a browser on the real route.
- **The poll was not observed over time.** `HALL_PASS_POLL_MS` and the
  visibilitychange handler are not exercised by any measurement here.
- **`prefers-reduced-motion` is `no-preference`** in the harness, so that path
  is not exercised. Nothing in this card animates, so there is little to exercise.
- **Two callers pressing "sign back in" at once** is handled by `for update` in
  the close RPC and is covered only by the ordinary `not_open` refusal
  assertion, not by a concurrency proof of its own.

### Deferred, deliberately

- **The close RPC takes a section, not a pass id.** So a manager clearing the
  pass in the same instant a student returns and a second student leaves would
  close the second student's pass. The window is milliseconds and the outcome
  (nobody out) is what they meant; the result names whoever was actually closed.
  Passing an expected pass id would fix it and would put a handle in a student's
  payload, which the disclosure rule spends real effort keeping out.
- **No global one-pass-per-student rule.** The decision was per section, and per
  section is what shipped: a stale open pass in period 1 does not block period 2.
  A second index on `(student_email) where closed_at is null` would add it and
  would need a third refusal reason with different words.
- **No instructor surface outside the class pane.** `/people` would be the
  natural home for a longer history than the 20 rows the state RPC returns.
