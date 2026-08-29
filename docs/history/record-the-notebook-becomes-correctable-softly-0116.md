---
title: "The notebook becomes correctable, softly (`0116`)"
date: 2026-08-19
branches: []
migrations: ["0116"]
subsystems: ["Digital notebook"]
record_order: 34
---

Migration `0116_notebook_soft_delete.sql` (apply manually after `0115`). A
student can remove an entry, remove one photo from an entry, and retitle a
free-form entry; an instructor can remove a student's entry. **DATA LAYER ONLY
-- this bundle ships NO controls**; the UI is a separate change.

### Nothing is destroyed, and that is not caution

A photo is the ONLY record of a physical notebook page, and every mutation this
subsystem has ever had is append-only: a note revises by INSERTING a revision
(`0078`), photos have only ever been added (`0069`). So deletion is a STAMP --
`notebook_entries.deleted_at` / `deleted_by`, `notebook_entry_photos.removed_at`
/ `removed_by` -- and no row and no Drive file is touched.

**THE COST IS THAT THE RLS POLICIES ARE UNCHANGED, SO A MARKED ROW IS STILL
SELECTABLE.** What decides whether a deletion is visible is not the stamp, it is
eleven filters. A stamp with no filter behind it is worse than no stamp, because
the row looks deleted to whoever set it and is not.

**`notebook_can_read_entry` IS DELIBERATELY LEFT ALONE** -- a deleted entry stays
readable to its owner and to the staff who could read it before. It is the
delegation target for photos, notes and folders, so making it false would make a
deleted entry's contents unfetchable, which is a hard delete wearing a stamp. It
is a VISIBILITY question; the exclusions are a LISTING question, and every list
states its own `deleted_at is null` where a reader can see it.

**NO RESTORE RPC SHIPPED**, said out loud rather than left to be found: the row
survives so a reversal is a one-line update in the SQL editor, but nothing a
student or instructor can reach un-deletes an entry. That was the scope given; it
is worth closing.

### The four RPCs, and the refusals that are the point

All follow `notebook_set_entry_pinned` (`0091`): SECURITY DEFINER,
`set search_path = ''`, revoked from public, granted to authenticated, returning
jsonb. **No new table grant, no new policy, still no DELETE grant anywhere.**

- **`notebook_delete_entry`** -- owner only (the WHERE clause IS the
  authorization). REFUSES an entry an instructor has already REVIEWED, naming who
  can still remove it: once staff have read it, the student is no longer the only
  party to the record. Already-deleted is checked FIRST, because both can be true
  and "already gone" is the more useful answer.
- **`notebook_staff_delete_entry`** -- `classroom_manages_section(section_id)`,
  no reviewed-state refusal (this IS the instructor), and it writes a
  `notebook_admin_log` row, which is the whole reason it is a separate function.
  **A FREE-FORM entry carries `section_id = null`, so that gate is `is_admin()`**
  -- a teacher of record cannot staff-delete one, only the chair tier can. That is
  narrower than the READ predicate (`0106`) on purpose: removing is stronger than
  looking, and a free-form entry was never filed in anyone's class. Not-found and
  not-yours answer identically (the `0102` claim convention).
- **`notebook_remove_photo`** -- owner only, resolved THROUGH the parent entry
  (photos carry no `student_id`). **REFUSES the last photo of an entry with no
  notes**, so an entry cannot be emptied into a shell; an already-removed sibling
  does not count as remaining. It locks the entry too, so two concurrent removals
  cannot each see the other as remaining.
- **`notebook_set_entry_label`** -- owner only, free-form entries only. A
  check-in entry's title IS the check-in's label (`entryTitle` walks it first), so
  a `custom_label` written there would be stored and never shown. Length is the
  column's own rule (null, or 1-200 trimmed); a blank clears it, and **clearing is
  refused on an otherwise-empty entry** -- the same shell rule.

**`notebook_edit_note` lost its session-linked refusal.** That rule protected a
record an instructor had read -- but an edit overwrites nothing, it INSERTS a
revision superseding the current one, every earlier version stays readable, and
EntryNotes renders the history. The storage model already keeps what the refusal
defended; it was only costing a student the ability to fix a typo in a check-in
note. Ownership, content validation and the lock are untouched.

### The exclusion sweep, built by enumeration

**Every function and view in the schema naming either table was walked**, and
each is either filtered or is a WRITE against a row the caller already named
(`add_photo`, `add_note`, `flag`, `resolve`, `override`, `move`, `pin`), which
cannot put a deleted row into a list. Server side: the `notebook_entry_activity`
view (entries AND its photo sub-select), `_notebook_section_roster`'s holders
branch, `notebook_get_section_grid` (`free_entries`, the `latest` distinct-on and
the `counts` badge), `_notebook_student_payload` (entries and photos -- so BOTH
the instructor reader and the admin view-as preview), and the two COUNTS a person
reads: `_notebook_detach_session_entries` and `notebook_delete_folder`.

**THOSE LAST TWO STILL MOVE EVERY ROW, DELETED ONES INCLUDED, AND MUST.** A
deleted entry still carries the composite key to `notebook_session_postings`
(`0098`) and the composite folder link (`0088`), so leaving it attached would
trade a wrong count for a foreign-key violation. Only the RETURNED COUNT changed,
which is the number a teacher or a student reads.

Client side: a new WIDEST rung on each select ladder, `livePhotos` in
`notebook.ts` (the one place a removed photo is dropped -- `orderedPhotos` and
`photoPages` are both built on it, so every render, count and copy site inherits
it), and the review console refusing to open a deleted entry.

**PeoplePanel needed no change**: its summary is `notebook_get_section_grid` +
`gridSummary`, so it inherits the grid's filters -- there is no second query.

### The ladder rule, and why the filter rides one rung

`deleted_at` does not exist on a project without `0116`, and PostgREST rejects a
filter naming an unknown column exactly as it rejects a select for one. So
`.is('deleted_at', null)` applied unconditionally would fail EVERY rung including
the scalar probe `configured` is decided on, and report a fully working notebook
as missing -- **the `0098` failure verbatim**. The feed asks
`rung.capability === 'deletion'` and filters only then; the class page's status
read, whose fallback is hand-written, tries the filtered read and falls back to
the unfiltered one. Without that fallback every check-in card would read
"missing" on a pre-`0116` project with nothing raised anywhere.

New rungs are ADDED, never edited into existing ones: both new selects are
written out in full because they widen the PHOTO EMBED as well as the column
list, and every rung below them is byte-identical to its own constant.

### Verified

- **`tests/notebook-soft-delete.test.ts` (46 tests)** on real embedded Postgres,
  plus additions to `notebook-page-load` (the feed's exclusion, and a THIRD
  database on the chain minus `0116` proving the degrade),
  `classroom-notebook-checkins` (a deleted entry stops counting as filed, plus a
  fourth database for its own fallback) and `notebook-shell` (the pure client
  half).
- **EVERY EXCLUSION ASSERTION CARRIES A POSITIVE CONTROL and reports both
  counts** -- the row that must be GONE and the row that must still be THERE, in
  the same assertion, with the raw and filtered counts read from the table. A scan
  reading the wrong property comes back clean, and clean is what nobody
  investigates.
- **MUTATION-CHECKED 26 WAYS, EVERY ONE CAUGHT**, each in the permissive
  direction and each file restored byte-identically (md5): the ten exclusion
  filters one at a time (1-2 red each, always the test that owns the claim), the
  nine refusals (the reviewed guard 1, the owner WHERE 9, the manages gate 10, the
  shell guard 2, photo ownership 2, the live-sibling count 1, the session refusal
  1, the length rule 1, the clear-shell guard 1), and seven client mutations
  (`livePhotos` 5, filtering on every rung 1, never filtering 3, the class page's
  missing fallback 1, its missing filter 2, the review console guard 1, and the
  new columns riding an EXISTING rung 2).
- **`tests/db/postgrest-shim.ts` gained `.is()`**, which is how a null test is
  expressed over the wire. It takes only the `IS` operator's three real operands
  and refuses anything else, and a filter on a column that does not exist still
  falls through to the SQL error -- which is what the degrade paths are written
  against.
- **One existing assertion was GENERALIZED, none deleted**: `notebook-page-load`
  asserted a linked entry carried exactly one photo, and the fixture now gives it
  a second, removed one. It reads through `livePhotos` -- the same claim, expressed
  as what the page shows.
- `npx svelte-check`: **0 errors, 36 warnings** (the same 36 as HEAD).
  `npx vitest run --no-file-parallelism`: **1349/1349 across 55 files**.
- **NOT verified: the live Supabase project, and nothing was driven in a
  browser.** The local `.env` is the placeholder project, so `0116` has never been
  applied anywhere -- and there is no UI to drive yet, which is the point of the
  split. Apply it by hand after `0115`, then check with two real accounts that a
  student cannot delete a reviewed entry and that a deleted entry leaves its
  instructor's grid.

