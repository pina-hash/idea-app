---
title: "The notebook can be put back: restore (`0117`)"
date: 2026-08-19
branches: []
migrations: ["0117"]
subsystems: ["Digital notebook"]
record_order: 35
---

Migration `0117_notebook_soft_delete_restore.sql` (apply manually after `0116`)
closes the gap 0116 shipped on purpose and widens one gate that fell short of a
read predicate it should have matched. Three new RPCs, on the exact shape 0116's
own four use (SECURITY DEFINER, `set search_path = ''`, revoked from public,
granted to authenticated, jsonb): `notebook_restore_entry` (owner-only, refuses
an entry someone else deleted by naming who can restore it, refuses one that is
not deleted), `notebook_staff_restore_entry` (same widened gate as the delete
side, logs a `restore_entry` row), `notebook_restore_photo` (owner-only via the
parent entry, refuses when the parent entry is itself deleted -- "restore the
entry first").

**`notebook_staff_delete_entry`'s gate is widened** from
`classroom_manages_section(section_id)` to
`classroom_manages_section(section_id) or notebook_manages_student(student_id)`
-- the exact predicate 0106's read policy already uses. Before this, a teacher of
record could READ a free-form entry of a student they teach (0106) but could not
REMOVE it, only the chair tier could; soft deletion is reversible and logged, so
removing should never be narrower than seeing. Same signature, plain
`create or replace`, no drop needed.

**`_notebook_student_payload` gains a `deleted_entries` key**, deliberately
shallow (id, title, session, upload/deleted timestamps, `deleted_by`) and NEVER
merged into `entries`, which keeps excluding deleted rows exactly as 0116 left
it. Feeds both `notebook_review_student_notebook` and `notebook_view_as_notebook`
again, so the two readers cannot disagree about what a student's trash looks
like.

### Reads stay separate queries, never a relaxed filter

- **The student feed (`/notebook`):** a NEW query in `+page.server.ts` --
  `notebook_entries` where `deleted_at is not null`, `.eq('student_id',
  claims.sub)` EXPLICITLY (unlike every other read on this page, which relies on
  RLS alone -- the /coin-balance doctrine -- because for a STAFF account that
  doctrine genuinely returns rows from every section they manage as well as their
  own; "the caller's deleted entries" is a narrower, deliberate promise than
  that). Gated on the same `deletionReady` 0116 already computes (the columns
  existing), a new rung nowhere near the live-feed ladder. `NOTEBOOK_DELETED_SELECT`
  lives in `$lib/notebook-selects.ts` beside `NOTEBOOK_ENTRY_SELECTS`, explicitly
  NOT one of its rungs.
- **Removed photos:** `removedPhotos()` in `$lib/notebook.ts`, the mirror of
  `livePhotos()`, kept beside `photoPages` and never merged into it.
- **The per-student staff page:** `_notebook_student_payload`'s new key, read by
  `/notebook/review/student/[studentEmail]/+page.server.ts` into its own
  `deletedEntries`, never handed to `NotebookView`.

### UI

- **`DELETED_FILTER`** (`$lib/notebook-folders.ts`) is a chip beside
  `ENTRY_FILTERS` but NOT one of them -- it is not unioned into `EntryFilterId`,
  since it switches the pane to a separately-loaded list rather than narrowing
  `entries`. In `NotebookView.svelte` it toggles `showingDeleted`, which swaps out
  the folder rail / search / other filters / groups for the deleted list (a
  title, when it was deleted, and either a Restore button or, for a staff-deleted
  row, an inline refusal) while staying reachable from the empty state too.
  `restoreEntry` / `restorePhoto` are two more optional transports on
  `NotebookView`, following the 0116 convention exactly (an omitted prop removes
  the control, never merely disables it).
- **`NotebookEntryCard`** (full variant, owner only) grows a closed-by-default
  `<details>` disclosure under its photos listing the entry's own removed photos
  via `onRestorePhoto`, gated on that prop being present -- absent on every
  staff/view-as surface, so the control cannot render where it could never
  succeed.
- **The per-student review page** (`/notebook/review/student/[studentEmail]`)
  grows a "Deleted" section below `NotebookView`, visually separated the way
  EntryReview separates its own delete control (a distinct bordered card, its own
  heading), listing every deleted entry with an unconditional staff Restore
  button -- unconditional because the RPC's own gate decides what actually
  succeeds, not a client-side ownership check.
- Every new control is a real `<button>` (native keyboard reachability), at
  least 44px tall, disabled while its own request is in flight, and surfaces the
  RPC's own message on refusal.

### Verified

- **`tests/notebook-soft-delete-restore.test.ts` (23 assertions)**, the 0116
  harness convention: real embedded Postgres, the notebook chain plus `0116` and
  `0117`. Covers both restore RPCs' full refusal set with a positive control
  beside each ("the same row IS restorable the right way"), the parent-deleted
  refusal on `notebook_restore_photo` with the restore-entry-then-photo control,
  the widened gate in BOTH directions (a teacher of record now reaches a
  free-form entry of a student they teach; a teacher who does not teach that
  student still cannot, and the section-scoped path is unchanged), the
  `deleted_entries` key never overlapping `entries` through both readers, a full
  delete-then-restore round trip landing the grid back at its EXACT pre-delete
  shape, and the boundary (no anon execute, exactly one overload each, no direct
  UPDATE clearing either stamp).
- **`tests/db/postgrest-shim.ts` gained `.not(column, 'is', value)`**, the
  mirror of its existing `.is()`, needed to drive the real `+page.server.ts` load
  (which the notebook suite's "real load against the real chain" tests exercise)
  through its new deleted-entries query.
- Full suite after these changes: `npx svelte-check` 0 errors, 36 warnings (the
  same baseline); `npx vitest run --no-file-parallelism` 1381/1381 across 57
  files.
- **Browser-verified** in `/dev/notebook` (extended with a `trash` graveyard --
  one pre-seeded staff-deleted entry so the refusal state is drivable with one
  account, plus a `deletionReady` toggle -- and a `restorePhoto`/`restoreEntry`
  pair mirroring the delete/remove fakes): a full entry delete -> "Recently
  deleted" chip showing the count -> Restore -> reappearance in its original
  date group, confirmed via the exact RPC calls logged with the entry's real id;
  the pre-seeded staff-deleted row rendering the refusal text with NO Restore
  control; a photo remove -> the disclosure appearing closed by default with the
  removed filename and timestamp -> Restore -> the photo reappearing and the
  disclosure disappearing, confirmed via the logged `notebook_remove_photo` /
  `notebook_restore_photo` calls; the toggle off (0116/0117 unapplied) hiding the
  chip entirely while every other control keeps working; 375px width with no
  horizontal overflow in the deleted view; and every new interactive element
  measuring **exactly 44px tall** (`filter-deleted`, `restore-entry`,
  `restore-photo`).
- **NOT verified: the live Supabase project, and the per-student staff page's
  own "Deleted" section.** The local `.env` is the placeholder project, so
  `0117` has never been applied anywhere. The `[studentEmail]` review page has no
  dev harness of its own (it did not have one before this change either -- its
  base NotebookView render was already unverified in a browser); its restore
  wiring is the same `data.supabase.rpc('notebook_staff_restore_entry', ...)`
  shape every other direct-RPC call on that route family already uses, and the
  RPC itself is covered by the migration test above. Apply `0117` by hand after
  `0116`, then check with two real accounts that a student can restore their own
  deleted entry, cannot restore one an instructor removed, and that an
  instructor can restore either from the per-student page.

