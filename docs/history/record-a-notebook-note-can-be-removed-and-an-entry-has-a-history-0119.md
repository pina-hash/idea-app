---
title: "A notebook note can be removed, and an entry has a history (`0119`)"
date: 2026-08-20
branches: []
migrations: ["0119"]
subsystems: ["Digital notebook"]
record_order: 84
---

Migration `0119_notebook_note_delete.sql` (apply manually after `0118`). One
nullable column pair on `notebook_entry_notes` -- `deleted_at` / `deleted_by` --
four RPCs, one refusal added to `notebook_edit_note`, and an exclusion sweep
across five server-side reads. DATA LAYER ONLY: this bundle ships NO controls;
the UI is a separate change.

**WHAT IT CLOSES.** `0116` shipped entry and photo deletion. What had been asked
for was NOTE deletion, and it went in wrong. Since `0078` a student can add a
note and edit a note, and there has never been any way to take one back -- an
"Edited" marker on a note whose whole point is that it should not be there is
not a correction.

### THE CHAIN IS THE MIGRATION

A logical note is not a row: it is every row sharing `note_id`, and which one
counts is a `max()` over the chain (`0078`). So `update ... where note_id = $1`
-- not `where id = $1` -- is the load-bearing line in both write RPCs, and the
same in reverse for both restores.

**Marking only the head fails silently, which is why it is the claim the test
file is built around.** Revision N-1 becomes the new `max()`, and a read
filtering `deleted_at is null` answers with the note as it read BEFORE the last
edit. Nothing errors. The student presses Remove and an older draft of the same
note takes its place. Proved by mutation: pointing the UPDATE at the head row
alone reddens 6 assertions, including the staff read returning revision 2 as a
head and the round trip.

`notebook_edit_note` refuses on a deleted note for the same reason rather than
as politeness. An edit INSERTS a revision, and that revision would carry
`deleted_at` null from the column default while every older revision stayed
marked -- a note that is half deleted, live head over a marked history, which is
the one state the whole-chain rule exists to make unreachable. It refuses rather
than quietly restoring, because restoring is a separate act with its own
refusals -- notably the staff-deleted one, which an edit-that-restores would
route straight around.

### THE FOUR RPCs, ON 0116/0117's EXACT SHAPE

`notebook_delete_note` / `notebook_restore_note` (owner, resolved through the
parent entry rather than through `author_id`, so the two stay the same set if
they ever stop being); `notebook_staff_delete_note` / `notebook_staff_restore_note`
(gated `classroom_manages_section(section_id) or notebook_manages_student(student_id)`,
which is `0117`'s widened gate, and both logged). SECURITY DEFINER, `set
search_path = ''`, revoked from public, granted to `authenticated`, returning
jsonb. No new table grant and no new policy: `notebook_entry_notes` still holds
`authenticated:SELECT` and nothing else, asserted in the test.

**REFUSAL ORDER IS DECIDED, NOT INCIDENTAL.** `notebook_restore_note` runs
not-found -> not-deleted -> staff-deleted -> parent-entry-deleted. Not-deleted
before staff-deleted is `0117`'s lesson (a live note has `deleted_by` null, and
judging that first reports "your instructor removed that" for a note nobody
removed). Staff-deleted before entry-deleted is `0116`'s lesson pointed the
other way: both can be true, the staff refusal is TERMINAL and the entry one is
ACTIONABLE, so answering "restore the entry first" only to refuse again
afterwards sends a student on an errand with nothing at the end of it. Asserted
directly, with both conditions true at once.

The staff pair folds a DRAFT into the same message as not-found and not-managed,
which is `0118`'s convention: naming a draft to a manager would confirm that a
student is holding unturned-in work, which is exactly what a draft is private
about. Its positive control turns the entry in and runs the identical call.

**THE SHELL GUARD IS `notebook_remove_photo`'s, FROM THE OTHER SIDE**, and it
excludes by `note_id`, not by row id: the question is what the entry still holds
once the whole chain is gone, and a chain excluded by its head alone leaves its
own older revisions counted as content. A DRAFT MAY BE EMPTIED. Proved by
mutation in both directions.

**NO SHELL GUARD ON THE STAFF PATH, deliberately.** An instructor CAN leave a
turned-in entry with nothing in it. They can already remove the entry outright,
so the guard would protect nothing they could not route around; the act is
logged and reversible; and refusing an instructor because of what a student's
entry would look like afterwards makes a moderation tool argue with the person
moderating. Recorded here because an empty submitted entry is now a state staff
can produce, and the log row is what says who.

### THE HISTORY READ ADDS NO TABLE

Everything a per-entry timeline needs is already a timestamp on a row that has
to exist anyway: `upload_timestamp` / `submitted_at` / `reviewed_at` /
`deleted_at` on the entry, `created_at` / `removed_at` on a photo, `created_at`
/ `revision` / `deleted_at` on a note. An event-log table would be a SECOND
record of the same facts, free to disagree with them -- a write that forgets to
log, a log row for a write that rolled back, a backfill with no events for
anything older than itself. So `src/lib/notebook-history.ts` assembles it
client-side, pure, the way `noteThreads` already derives a note from its
revisions.

**WHAT IT CANNOT SHOW, and no column was added for it.** A title change writes
no timestamp -- `notebook_set_entry_label` overwrites `custom_label` in place --
so A RENAME IS INVISIBLE to the timeline. Filing into a folder and pinning are
the same: state, not events. A column added in passing, to a migration about
note deletion, is how a schema grows fields nobody can explain.

Notes reach the timeline through `noteThreads` / `deletedNoteThreads` rather
than off the raw rows, so the chain rule is applied once where it is already
written down. A deleted note keeps its full revision history there -- it is what
a student is reading when they decide whether to restore it -- and a removed
photo keeps its `photo_added`.

### THE EXCLUSION SWEEP, AND WHY THIS ONE IS DIFFERENT

Every live function and view whose body names `notebook_entry_notes` was walked
(11, each resolved to the migration that most recently defined it). **FOUR OF
THE FIVE TARGETS ARE COUNTS THAT GATE A REFUSAL, not lists that render**, which
is this migration's particular hazard: a deleted note left in a count does not
show anything wrong, it silently OPENS a guard.

CHANGED, all five diffed against their current definitions rather than retyped:

| Function / view | Current def | What the deleted note would have done |
| --- | --- | --- |
| `notebook_entry_activity` | 0116 | Made an entry look recently worked on |
| `notebook_submit_entry` | 0118 | Let a genuinely empty entry be turned in |
| `notebook_remove_photo` | 0118 | Let the last photo go, emptying the entry |
| `notebook_set_entry_label` | 0116 | Let the last title be cleared |
| `_notebook_student_payload` | 0118 | Shown a removed note to both staff readers |

Plus `notebook_edit_note` (0116's body, one refusal added) and
`notebook_delete_note`'s own guard.

CHECKED AND LEFT ALONE, with the reason recorded in the migration's own 4f
section: `notebook_get_section_grid` (counts entries, names the notes table
nowhere -- asserted against `pg_get_functiondef`), `notebook_view_as_notebook`
and `notebook_review_student_notebook` (a guard plus one delegation to the
payload, so the filter belongs in the payload once), `notebook_add_note` and
`notebook_create_note_entry` (inserts against an entry the caller named),
`_notebook_note_content_ok` / `_notebook_note_run_len` (pure jsonb validators),
`notebook_can_read_entry` and the notes RLS policy (0116's doctrine: a deleted
note stays READABLE so a restore can show what it is restoring; visibility is a
different question from listing), and `notebook_delete_folder` /
`_notebook_detach_session_entries` / `_notebook_section_roster` (opened, not
inferred from their names -- none names the table).

### THE CLIENT HALF: ONE FUNNEL

`noteThreads` now drops deleted rows, and `deletedNoteThreads` is its mirror --
the `livePhotos` / `removedPhotos` pair, applied to notes. That is the whole
client-side exclusion: every surface that renders, counts, previews, titles or
copies an entry's notes already goes through `noteThreads`, so one filter covers
all of them and a new consumer inherits it. Both share a private `buildThreads`,
so the derivation cannot drift between the live list and the deleted one.

Three raw-row counts were routed through it, found by grepping for
`notes.length` rather than from memory: `NotebookEntryCard`'s note count (a
hand-rolled `new Set(notes.map(n => n.note_id)).size` that collapsed revisions
correctly and could not have dropped a deleted chain), `EntryReview`'s two
gates (which would have rendered an empty "Written notes" block AND suppressed
the "no photos and no written notes" line on the same entry), and
`notebook-folders.ts`'s "Has notes" filter chip. The dev harness's three
emulated guards were routed through it too -- a harness looser than the RPC it
stands in for lets a drive pass that the real page would refuse.

**LADDER: two new widest rungs, both written out in full** rather than composed,
because each widens an EMBED and a rung below must stay byte-identical. The
feed's `NOTEBOOK_HISTORY_SELECT` (capability `history`, `excludeDeleted: true`)
carries note `deleted_at`/`deleted_by`, photo `created_at` and entry
`reviewed_at` -- ONE rung for all three, because they land in one migration and
cannot be independently missing. The console's `REVIEW_ENTRY_HISTORY_SELECT` is
deliberately NARROWER: `deleted_at` only, since the console renders no history
and offers no restore.

**The deleted notes the feed carries are NOT filtered server-side, and that is
the decision.** They have to ARRIVE for the removed-notes disclosure and the
history to exist at all; `noteThreads` drops them at the one funnel. The staff
RPC read (`_notebook_student_payload`) DOES exclude in the database, because
there the filter has somewhere to live that no caller can forget.

`reviewed_at` is mapped `historyReady ? (... ?? null) : undefined` -- ABSENT, not
null, on a narrower rung, so the timeline emits no review event rather than one
claiming the entry was never looked at. Same rule as `0118`'s `submitted_at`
fallback, in the other direction.

### VERIFIED

- `tests/notebook-note-delete.test.ts`: **31 tests**, real embedded Postgres,
  the real chain `0001`..`0119` applied unmodified. Every refusal carries a
  positive control -- the same row, done the RIGHT way -- so no assertion can
  pass merely because the call always fails.
- **Five mutation proofs, all in the PERMISSIVE direction, each restored
  md5-identically and re-verified green:** the chain UPDATE pointed at the head
  row (**6 red**); `_notebook_student_payload`'s filter removed (**2 red**); all
  five note-count guards made permissive at once (**5 red**, one per named
  assertion); the shell guard excluding the head row instead of the chain
  (**1 red**); and `noteThreads` no longer dropping deleted chains (**3 red**).
- **The ladder rule was GENERALIZED, not deleted.** `0119` put a `deleted_at`
  inside the notes EMBED, so the regex over the whole select string had drifted
  from asking about the ENTRY's own column. It now strips embeds first, with a
  second assertion proving the stripper actually strips. Re-mutated: flipping
  the history rung to `excludeDeleted: false` reddens 3.
- `tests/notebook-history.test.ts`: **7 tests**, pure. The two guarantees that
  fail silently -- absent-is-not-null (a pre-0119 read emits 2 events, and the
  same entry from a wide read emits all three extra kinds) and a deleted note
  keeping its revisions.
- `tests/notebook-page-load.test.ts`: `0119` added to `FULL_CHAIN`, a new
  `PRE_HISTORY_CHAIN` degrade block (every note live, `reviewed_at` undefined,
  every lower capability unaffected), and a feed block asserting a deleted note
  ARRIVES on the row and is ABSENT from `noteThreads`, with the live sibling
  beside it as the control.
- The `0116`, `0117` and `0118` suites re-run UNCHANGED: **184/184**.
- `npx svelte-check`: **0 errors, 36 warnings** (the baseline).
  `npx vitest run --no-file-parallelism`: **1495/1495 across 63 files**.
- **NOT verified: the live Supabase project, and nothing was driven in a
  browser.** The local `.env` is the placeholder project, so `0119` has never
  been applied anywhere -- and there is no UI to drive yet, which is the point of
  the split. No `classroom-updates.json` entry either: nothing a student can see
  changes until the controls ship.
- **Two PRE-EXISTING gaps found while walking and deliberately NOT fixed here**,
  because they are `0116`'s sweep rather than this one's: `notebook-folders.ts`'s
  "Has photos" filter chip and `EntryReview`'s `{#if entry.photos.length}` both
  count REMOVED photos as present. Same class of bug, different migration.

**Undoing it:** `notebook_edit_note`, `notebook_entry_activity`,
`notebook_submit_entry`, `notebook_remove_photo`, `notebook_set_entry_label` and
`_notebook_student_payload` revert to their `0116` / `0118` bodies; the four new
RPCs drop; the two columns and the partial index drop. Dropping the columns
loses every deletion stamp, which is a real loss of record -- clearing them
(`update ... set deleted_at = null, deleted_by = null`) restores every note
instead, and is the reversible half.

