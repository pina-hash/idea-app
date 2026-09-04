---
title: "Managing a notebook check-in after it exists: what an edit destroys, what a delete destroys, and which of those anybody was told (`claude/notebook-check-in-management-y5z4b4`, no migration)"
date: 2026-09-04
branches: [claude/notebook-check-in-management-y5z4b4]
migrations: []
subsystems: ["Notebook", "Components and UI", "Testing", "Database conventions"]
---

Prompt 0031 came from an instructor report: there is no way to edit or manage a
notebook check-in once it has been created. The prompt said the pattern for such
reports in this repository is four out of four already existing and being
unreachable, and told the session to assume it exists until the audit says
otherwise.

It existed. All of it. The bundle is therefore not the feature the prompt
described but the one the audit found underneath it, which is a different and
narrower thing: the operations were fine and the *sentences around them* were
missing or wrong.

## The audit

**Every operation the prompt asked for is a deployed, guarded RPC.**

| Operation | Function | Guard |
| --- | --- | --- |
| Create | `notebook_admin_upsert_session(uuid[], integer, date, text, uuid default null)` | `_notebook_check_session_targets` |
| **Edit / reschedule** | the *same* function, with the trailing `p_id` | `_notebook_manages_session` **and** `_notebook_check_session_targets` |
| Guidance prompt | `notebook_set_session_guidance` | `_notebook_manages_session` |
| **Delete** | `notebook_admin_delete_session(uuid)` | `_notebook_manages_session` |

The trailing `p_id` is the whole difference between creating a check-in and
editing one, and it has been there since 0098. **No migration was needed and
0177 was not written.** The prompt permitted one only if Phase A proved the RPCs
could not express an edit; they express it exactly.

**And it is reachable**, which is the half the prompt's own fallback ("the
bundle becomes making it reachable") did not anticipate: `SessionManager.svelte`
is a complete check-in manager -- list, add, edit, delete, guidance, class
posting, item linking -- mounted by `ReviewConsole` behind the Check-ins mode at
`/notebook/review`, gated on `sectionManages`.

### What an edit could destroy, counted from the schema

This is the question the prompt said the design turns on, and the schema answers
it precisely. A check-in can have, by the time somebody wants to change it:

- `notebook_entries` filed against it, on the composite key `(session_id,
  section_id)` -- **no cascade**;
- `notebook_entry_photos` and `notebook_entry_notes`, which cascade from the
  **entry**, not from the check-in;
- `notebook_session_excusals`, `session_id ... on delete cascade`;
- `notebook_session_postings`, `session_id ... on delete cascade`.

So the answer to "is an edit safe" is **yes, and more safely than anyone
expected**: `_notebook_detach_session_entries` nulls `session_id` and copies the
check-in's label into the entry's `custom_label` *before* the row is deleted, so
a delete leaves the student's entry, their photos and their writing intact and
carrying the name they filed it under. Written work is genuinely never destroyed
by any of these paths.

**The exception is the excusal, and it is a real one.** It is the one thing a
delete truly destroys, there is no restore path for it, `notebook_admin_delete_session`
counts it internally as `v_excused` and logs it -- and returns only
`detached_entries` to the caller. Nothing on any screen has ever mentioned it.

## What was actually wrong

Two things, both of them sentences rather than behaviour.

**A rename landed silently under work that already existed.** An edit changes
the label in place; the entries stay attached, by design and correctly. But
every student who had already filed then saw a different name over the page they
filed, and nothing warned the instructor that anybody had filed at all.

**The delete confirm stated the rule with no number in it.** It read "Entries
already filed against it are kept and relabelled" -- true, and useless at the
moment it is read, because the one instant a teacher can still change their mind
is the one instant they could not see how much was on it. The count appeared
only *afterwards*, in the note reporting what had been detached.

## The edit policy, and what was rejected

**An edit is classified by what it moves, and the classification decides whether
answers are named.** `checkInEditKind` in `admin-actions.ts`:

- **`schedule`** -- the day and/or the unit moved, nothing else. No warning about
  filed work at all, and the save button reads **Reschedule**. This is B2's
  requirement expressed as a condition rather than as a second form: moving a
  date touches no answer and asks nothing new.
- **`identity`** -- the name moved. The warning renders, naming how many students
  have filed and how many excusals are on it. A rename that *also* moves the day
  is `identity`; the more serious of the two wins, because a reschedule riding
  along does not make a rename safer.
- Whitespace alone is `none`, because the RPC stores `btrim(label)` and a form
  that only added spaces has changed nothing.

**Rejected: refusing an edit once answers exist.** A typo fix is the most common
edit there is, and the only route left would be delete-and-recreate -- which
detaches every entry filed against it. Refusing the safe act to force the
destructive one is backwards, and `SessionManager`'s own header already calls
delete-and-recreate "the workaround" that 0120 exists to remove.

**Rejected: versioning.** A check-in has no answer-to-version binding to
preserve -- a student files a photograph of a notebook page, not an answer keyed
to the wording -- and a second version would put a second column on every
affected grid, which is the duplicate-column problem `ItemDetail` already refuses
by date.

**Rejected: a separate reschedule form.** Two forms for one row is two places
for the same three fields to drift. The classification makes a reschedule
separate in *consequence*, which is what B2 asked for, without a second copy of
the form.

### The limit of this design, stated plainly

The warning is to the **instructor**. It makes the rename a deliberate act, and
it is where "silently" is removed. What it does not do is give the **student**
side a record: an entry filed under the old name keeps pointing at the renamed
check-in, and only a *detach* stamps the old label onto the entry.

Closing that half means having a rename copy the outgoing label into
`custom_label` on the entries already filed -- exactly what
`_notebook_detach_session_entries` already does, applied to rename instead of to
detach. **That is a migration and it was not written**, because 0177 was
licensed only if the RPCs could not express an edit, and they can. It is the
obvious next bundle and it is small.

## Where the counts come from

Off `notebook_get_section_grid`'s own cells, via `checkInLoadIndex` -- the
payload the console already holds to draw the grid, passed down in **one line**
in `ReviewConsole`. No new read, no new RPC, no new transport. A second question
to the database would be a second answer that can disagree with the grid
underneath it, and a teacher reading "3 students have answered" over four filled
cells has no way to tell which is lying.

**A check-in the grid does not cover reports `null`, never zero.** The unit
filter is the ordinary state of that console, so a check-in in another unit has
no cells in the payload -- and a `Record` defaulting a missing key to
`{answered: 0}` would answer "nobody has filed against this" for a check-in with
thirty entries on it. `grid.sessions` is the discriminator rather than the cells,
because a covered check-in with an empty roster genuinely has zero and the cells
alone cannot tell that from not being covered. This is the roster's
`manages`-undefined rule in a second place: cannot tell must never read as no.

`answered` counts **students**, not entries. "12 students have already filed" is
what an instructor is deciding about; summing `entry_count` would silently
triple-count the student who filed three pages.

## What was measured

- **Full suite: 254 files, 5334 tests, all passing** (from 253/5309 on
  `integration`; the 25 are this bundle's).
- **`svelte-check`: 0 errors, 37 warnings, 31/5/1** -- the baseline, re-derived
  after exporting the two `PUBLIC_SUPABASE_*` placeholders. It briefly read 38:
  the harness derived a grid payload from live `$state`, which was a
  `state_referenced_locally` warning correctly objecting to something that was
  also semantically wrong (a grid payload is a snapshot of one read, not a view
  that follows local edits).
- **Browser, 375 and 1440: 30 measurements, 0 outside threshold.** Ten verdicts,
  four fixture states. Contrast on the filed count 6.84:1 against the row it
  sits on; Edit and Delete both 44px on the minor axis at both widths.
- **Full harness pass: 190 runs, 2652 measurements, 0 outside threshold**, on
  `789374d`, `dirty: false`. The baseline after 0028 was zero outside threshold
  and it still is, so no row here is new.
- Every click in the browser driver landed **on the first attempt, ~26ms**,
  printed rather than asserted.

### The three controls, each proven by mutation

Restored from `cp` copies and md5-checked; never `git checkout --`.

1. **An edit never re-points an answer.** Making the edit call
   `_notebook_detach_session_entries` reddens exactly the two assertions about
   the link, and nothing else.
2. **A non-instructor is refused every operation.** Opening
   `_notebook_manages_session` alone reddened only two of four -- the edit path
   re-checks its targets independently, which is the defence in depth `CLAUDE.md`
   already describes. Opening **both** layers flips all four refusals to allowed.
3. **A delete keeps written work and destroys excusals.** Making the detach
   `delete` instead of `update` reddens the survival assertions, including the
   one that reads the student's note content back.

Two browser breaks as well: widening the warning to every edit reddens the
reschedule control, and defaulting an uncovered check-in to zero reddens the
cannot-tell control. A check that has never failed has not been tested.

### The mutation found a defect in the test itself

Sharing one check-in across the four refusal cases meant that with both guards
open, the student's now-succeeding delete removed the row before the stranger's
turn -- so the stranger's attempt threw `That session does not exist.` and its
refusal assertion went on passing **over an open guard**. Each case owns its own
fixture now. A refusal that survives its own mutation because a neighbouring
case destroyed the fixture is not a refusal that was tested.

## What is NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder project and no session here can apply a migration, call an RPC or
  hold a Bosco Tech session. Every RPC claim above is against the embedded
  Postgres fixture with the real migration files applied.
- **No signed-in surface was driven.** `/notebook/review` needs a Google session
  the harness does not hold, so the real Check-ins tab was never opened in a
  browser by this session. What was driven is the real `SessionManager` on a
  `/dev` route. The one case that matters most -- editing a check-in a real
  student has really answered, on production -- is Mr. Pina's.
- **`prefers-reduced-motion` is `no-preference`** in the harness, and web fonts
  are blocked, so text was measured in the fallback stack.

## Handed over, out of this bundle's scope

- **`ItemDetail.svelte`'s duplicate-date refusal tells an instructor to "edit the
  existing one instead" and never says where.** The destination is
  `/notebook/review` -> Check-ins, which is a different area of the app from the
  classroom item page they are standing on. One sentence would fix it.
- **There is no classroom-side route to the manager.** `sectionTabs` in
  `src/lib/classroom/nav.ts` has exactly three tabs (`class`, `people`,
  `grades`), and adding a fourth touches `SectionTabId`, `sectionTabs`,
  `activeTab` and `classroomMeasure` -- four sites, not the one-line consequence
  that would have made it takeable here. The prompt's
  `src/routes/classroom/**/check-ins/**` was left empty deliberately rather than
  landing a page nothing links to.
- **`notebook_admin_delete_session` does not report the excusals it destroyed**,
  though it counts them as `v_excused` and logs them. Returning that count
  beside `detached_entries` would let the confirmation afterwards say what
  actually happened rather than only what was predicted. That is a migration.

## A note on the prompt's file list

`src/lib/notebook/CheckInStager.svelte` and `src/lib/notebook/transports.ts` do
not exist, and `src/routes/classroom/**/check-ins/**` is an empty namespace. The
notebook-side check-in editor is `SessionManager.svelte`; the author confirmed
the owned list meant that file and that the name had been guessed from its
classroom sibling. `src/lib/classroom/CheckInStager.svelte` does exist and is
create-only -- it stages a draft for an item that does not exist yet and was not
the surface in question.
