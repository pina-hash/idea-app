---
title: "Five staff capabilities that were live, granted and uncalled get their controls (`claude/notebook-excusal-grid-control-0ub2q2`, code only, no migration)"
date: 2026-08-27
branches: [claude/notebook-excusal-grid-control-0ub2q2]
migrations: []
subsystems: ["Digital notebook"]
record_order: 156
---

An audit named five SECURITY DEFINER functions in the notebook's data layer that
were applied, granted to `authenticated`, gated inside their own bodies, and
called from nowhere in `src/`. All five claims were re-derived here against the
migrations and the catalog before anything was built on them, and **two of the
five turned out not to be admin-gated at all** -- see the tier table below, which
is the finding this bundle most wants a future session to read.

Nothing in this bundle is a migration. Every function, table, grant and policy it
uses has been in the schema since 0069-0120; what was missing was a caller.

### What each one was, and what now calls it

| Function | Tier, from its own body | New surface |
| --- | --- | --- |
| `notebook_admin_set_excusal` | `is_admin()` -- **ADMIN** | `CellExcusal.svelte`, in the review console's entry pane, under both panel branches |
| `notebook_admin_override_entry` | `is_admin()` -- **ADMIN** | `EntryMove.svelte`, between the verdicts and the danger zone |
| `notebook_admin_log` (select) | policy `using (is_admin())` -- **ADMIN** | `AdminLogPanel.svelte`, a fourth console mode |
| `notebook_staff_restore_note` | `classroom_manages_section` OR `notebook_manages_student` -- **INSTRUCTOR** | a staff deleted-notes disclosure in `EntryNotes.svelte` |
| `notebook_link_session_item` | `classroom_manages_section` -- **INSTRUCTOR** | an "Attached item" panel per row in `SessionManager.svelte` |

### THE TIER SPLIT IS NOT WHAT THE NAMES SUGGEST, and that is the finding

The audit described all five as admin-gated. Two are not, and the difference
matters operationally rather than pedantically: three sections of this course run
identical grading and one is taught by a colleague who is an instructor and not
an admin.

- `notebook_staff_restore_note` says `staff` in its own name and means it. Its
  gate is the same one the staff note DELETE beside it asks, which is why the two
  are handed in together and never separately.
- `notebook_link_session_item` asks exactly what `notebook_add_session_postings`
  and `notebook_set_session_guidance` already ask on the same surface.
- **The excusal splits down the middle.** 0098's SELECT policy on
  `notebook_session_excusals` admits the subject and any manager of a section the
  check-in is posted to, while the WRITE is `is_admin()`. So an instructor sees
  that a student was excused and why, and has no control. `CellExcusal` says so
  in words rather than rendering an inert button.

**What that costs the colleague, stated plainly rather than fixed quietly:** they
can attach a check-in to an item and restore a note; they **cannot** excuse a
student from a check-in, cannot correct an entry filed against the wrong check-in
or class, and cannot read the admin log. Every one of those is a capability only
the site admin has, on a course three people teach the same way. Widening any of
them is a migration and a deliberate decision about who may change a state a
student is graded on -- it was not made here.

### The excusal is the one that mattered

`excused` has been a first-class READ state since 0069 -- its own glyph and its
own `--nb-cell-excused` per-plate token in the compliance grid, its own branch in
`checkInStatus`, its own line in the Documentation Check's coverage arithmetic,
its own count on the People panel, its own branch in the console's empty-cell
panel -- and it is what stops a check-in counting as outstanding. Six read sites
were rendering a state no surface in the codebase could produce.

- **The control is in the panel beside the grid, under BOTH branches.** The
  cursor already names the (student, check-in) pair the RPC takes. It renders on
  the empty-cell panel as well as the open-entry one because the empty cell is
  the common case: a student who filed nothing is exactly who is about to be
  excused. It renders on an entry that EXISTS too, because that pair is real --
  `checkInStatus` already decides an entry beats an excusal -- and somebody may
  still need to withdraw the excusal behind it.
- **`note` had never been selected anywhere.** The column has existed since 0069
  with a 500-character CHECK. An excusal recorded in October was unexplainable in
  March. `EXCUSAL_NOTE_MAX` restates the cap client-side and a test asserts it
  against the column's own constraint in both directions, so the restatement
  cannot drift.
- **A recorded excusal with no reason SAYS so** rather than rendering an empty
  line: "nobody wrote one down" and "the field was never read" look identical
  otherwise, and telling them apart is the whole point.
- **`excused` still comes from the GRID**, never from whether a row came back in
  the excusal read. The RPC adjudicates the cell; the extra read carries the note
  and nothing else. A second idea of "is this excused" is what stops matching.
- **A student with no account cannot be excused**, and the control says why
  rather than silently lacking a button. 0094's roster carries a student who is
  enrolled and has never signed in (`student_key` is the email, `id` is null) and
  the RPC refuses a `p_student_id` with no `profiles` row. `excusalBlockedReason`
  is the client mirror and the test asserts the refusal it mirrors.

### The override renders two of nine parameters

`notebook_admin_override_entry` takes nine and was re-signed across four
migrations. Four of them (`p_custom_label`, `p_status`, `p_flag_reason`,
`p_instructor_comment`) restate verdicts the console already has real controls
for -- Flag with its validated reason list, Clear flag, Accept -- so exposing
them would be a second, admin-only path to the same decision with none of the
surrounding rules. What has no other path is the pair the control renders: an
entry filed against the wrong check-in, and one filed in the wrong class.

- **The two `p_set_*` booleans are not user-facing.** They are how the RPC tells
  "leave this alone" from "write null here", and `entryMovePayload` derives each
  from what actually moved -- so a section correction never rewrites the session.
  Null with the flag TRUE detaches, which is a wanted outcome and has its own
  option; the test asserts both directions of that flag, because a control that
  sent null for both would silently never detach anything.
- **A MOVE IS NOT A REVIEW.** Sending no `p_status` is what makes the RPC leave
  `reviewed_by`/`reviewed_at` alone. That is asserted rather than assumed: a
  future edit sending a status "for completeness" would make correcting a
  student's filing silently also record that somebody read it.
- **`entryMoveChanged` drives the button and the handler**, one predicate. An
  unchanged send would succeed at the database and mint an audit row saying an
  admin moved an entry that did not move.

### The log listing, and why an empty result is the honest failure

`notebook_admin_log` had a select grant, an admin-only read policy and
`notebook_admin_log_created_idx on (created_at desc)` -- an index built for a
listing that did not exist. Every irreversible staff action in the notebook has
been writing there since 0069 with nobody able to read it.

- **Its gate is a POLICY, not a function body**, so a non-admin gets an EMPTY
  LIST rather than an error. That is the /admin doctrine and the panel's empty
  state names both possibilities rather than claiming nothing has happened.
- **It resolves no subject uuids.** The columns carry no foreign keys on purpose
  (0069: "a log row must survive the deletion of what it describes"), so a lookup
  would render much of the log as blanks while adding a read of other people's
  rows. The viewer's own id is the one exception, because the console already
  holds it and "You" is most of the rows on a one-admin deployment.
- **`ADMIN_LOG_ACTIONS` is asserted against the table**, not against a retyped
  list: the test reads `distinct action` from rows the other describes actually
  produced and fails on any label it lacks. An unknown action renders as itself,
  and that test is what turns the fallback from a silent gap into a finding.

### The two instructor-tier halves that were missing

- **Staff note restore.** `EntryNotes` has offered a staff DELETE since 0119 and
  the owner-side restore since 0119, and the refusal a student reads on a
  staff-deleted thread ("Ask them to restore it for you") pointed at a capability
  that did not exist. The staff disclosure is its own, gated on
  `onStaffRestore && !canEdit`, and offers Restore on EVERY deleted thread with
  no `deletedBy` branch -- that is the RPC's own rule, and `deleted_by` is not
  even in the console's read (`REVIEW_ENTRY_HISTORY_SELECT` carries `deleted_at`
  alone), so a per-author branch could not have been written honestly.
  - **`EntryReview`'s notes block can no longer be gated on `noteCount`.** That
    counts LIVE threads, so deleting the only note on an entry made the whole
    block vanish, taking the Restore with it in exactly the case it exists for.
    It is gated on either count now, and the disclosure label says how many are
    removed.
- **Attaching a scheduled check-in to an item.** 0120 gave a posting an
  `item_id`, and the only path to it was `notebook_create_item_check_in`, which
  MAKES a new check-in -- so a check-in already on the calendar could only be
  attached by deleting and recreating it, which detaches every entry filed
  against it. The panel is per SECTION because `item_id` is on the posting, and
  the picker is scoped by a `!inner` embed on `classroom_postings`, which is
  exactly the condition the RPC refuses on, so it can never offer something that
  would be turned down.

### Shape decisions

- **A separate transport bundle per capability, not fields on `ReviewTransports`.**
  The console's transports describe what any reviewer may do; these do not
  partition that way. Separate optional bundles carry the tier split as a TYPE
  rather than as a comment, and the presence-gates-the-control rule then does the
  rest: an instructor is handed no `entryMove` and no `adminLog`, so there is no
  write to execute and no tab to reach. `ExcusalTransports.set` being the
  optional half of one object is the same idea one level down.
- **`src/lib/notebook/admin-actions.ts` is the pure module** -- shapes, labels,
  the note cap, and the small amount of arithmetic. It imports `ReviewResult`
  from `notebook-review.ts` rather than defining a second result type.
- **The route decides from `data.isChair`**, which is `isAdmin()` resolved
  server-side by `notebookAccess`, not `role === 'teacher'`. Hiding is
  presentation; each function refusing is the boundary, and both were tested.

### Verification

- **`svelte-check`: 0 errors, 37 warnings before and after** (31
  `state_referenced_locally`, 5 `css_unused_selector`, 1
  `perf_avoid_nested_class`). The baseline had to be established first: this
  container had no `.env`, which made `svelte-kit sync` fail and reported 11
  phantom `$env/static/public` errors. One was written from `.env.example`; it is
  gitignored and uncommitted.
- **Full suite: 121 files, 2765 tests, all passing** (120 / 2733 before).
  `tests/notebook-staff-actions.test.ts` adds 32.
- **Both database-side gates mutation-proved in the PERMISSIVE direction**, and
  both migration files restored and md5-verified byte-identical afterwards:
  - `notebook_admin_set_excusal`'s `if not public.is_admin()` to `if not true`
    (0098) reddens exactly two tests -- the instructor refusal and the student
    refusal -- and nothing else. Commenting the check out would have left
    `if not <nothing>`, a syntax error that fails closed and proves nothing.
  - the log policy's `using (public.is_admin())` to `using (true)` (0069) reddens
    exactly the two "reads nothing" tests. Dropping the policy would fail closed
    (RLS on, no policy = deny) and redden nothing.
- **Every gate is asserted in both directions**, each with its positive control:
  the fixture itself asserts that the owner IS an admin, the teacher of record is
  NOT, and that the teacher DOES manage P1 -- so no refusal below can pass
  because the fixture is broken. The grant premise is re-derived from `pg_proc`
  and `has_function_privilege` AFTER 0137, which is the migration that could have
  swept any of them.
- **The audit row is asserted per action, by COUNT before and after**, never by
  "a row with this action exists" -- several describes write to the same table.

### What was NOT verified

- **Nothing ran against the live Supabase project.** The local `.env` is a
  placeholder and this repo cannot apply a migration, run an RPC or sign in
  against production. Every claim above is from the embedded Postgres running the
  real migration files.
- **NO BROWSER PASS, AND NO DEV HARNESS WAS ADDED.** CLAUDE.md requires an
  interactive verification through a dev-guarded harness for work like this. The
  existing harness is `src/routes/dev/notebook-review/`, which is outside this
  session's declared file ownership, so it was not touched and no new one was
  written. No browser was available in this container either. **Everything below
  is therefore unverified visually:** that `CellExcusal` and `EntryMove` render
  legibly in the 34rem detail pane at 1440px and at 375px, that the fourth mode
  button fits the console bar without wrapping badly, that the admin log table
  scrolls inside its own container rather than widening the page, that the two
  new `<select>` controls hit the 44px floor in practice, and that the staff
  deleted-notes disclosure reads correctly on all three notebook plates. The
  contrast of every token used was taken from existing per-plate values rather
  than measured fresh.
- **The new components were not measured for contrast on the light or IDEA
  plates.** They read `--text-1/-2/-3`, `--boundary`, `--hairline`,
  `--surface-1/-2`, `--nb-error`, `--nb-warn`, `--nb-ok` and `--nb-cell-excused`,
  all of which the room already declares per plate -- but "reads a per-plate
  token" is not the same as "was measured", and CLAUDE.md is explicit that a
  shared component entering a room must be measured there.

### Deferred, and what is still missing

- **The classroom-side item page has no attach control.** `ClassCheckInTransports`
  carries `createForItem` and `unlink` and no `link`, so attaching an existing
  check-in is reachable only from the review console's Check-ins mode. Adding it
  there means editing `ContentComposer.svelte`, which was outside this session's
  file ownership. It is the more natural second home.
- **The log has no paging, filtering or export.** It reads the newest 50. Older
  pages are in the table and nothing offers them.
- **`adminLogActor` renders a raw uuid for anybody but the viewer.** Resolving it
  is a disclosure decision about reading other people's `profiles` rows, not a
  rendering one.
- **Excusing is one student at a time.** A whole-class excusal (a field trip is
  rarely one student) would be a bulk RPC with the `{total, succeeded, refused,
  results}` shape, which is a migration.

---

