---
title: "Autosave stops minting a revision per keystroke burst (`0129`)"
date: 2026-08-22
branches: []
migrations: ["0129"]
subsystems: ["Digital notebook"]
record_order: 114
---

## Autosave stops minting a revision per keystroke burst (`0129`)

### What shipped

The composer's autosave (a0d43ba, code only) wrote through the ordinary note
RPCs, and every one of those APPENDS. So a student writing for ten minutes
turned in an entry whose version list was dozens long: 0119's entry history --
which is assembled from those same rows -- became a wall of "Edited a note"
lines saying nothing, and `notebook_delete_note` walked a chain far longer than
the note it was deleting. The autosave bundle named this as deferred and said
what it would cost ("an RPC that UPDATES a draft's newest revision in place
instead of appending, which is a migration and a hole in an append-only table's
guarantee"). This is that, with the hole made small enough to be honest about.

**`0129_notebook_note_coalesce.sql`** -- two columns, one predicate, one new
RPC, three re-signed ones, a widened view, and a backfill that deletes rows.

- `notebook_entry_notes.autosave` (boolean, default false) and
  `notebook_entry_notes.updated_at` (timestamptz, null).
- `_notebook_note_coalescable(head_id, uid)` -- the predicate, in one place.
- `notebook_edit_note` gains `p_autosave`: REPLACES the head in place when the
  predicate holds, appends otherwise.
- `notebook_add_note` and `notebook_create_note_entry` gain `p_autosave`, which
  only marks the revision they create.
- `notebook_seal_notes(entry_id)` -- new: stamps a boundary on an entry's notes.
- `notebook_submit_entry` seals before it stamps `submitted_at`.
- `notebook_entry_activity` reads `coalesce(updated_at, created_at)`.

Client: a new widest rung on the entry ladder (`NOTEBOOK_COALESCE_SELECT`,
capability `coalescing`), `updated_at` on `NotebookNoteRow`, `changedAt` on
`NoteThread`, `autosave` forwarded through the three note routes, `sealNotes`
wired as a transport, and one clause in the entry history's event label.

### The load-bearing decisions

- **THE FLAG MEANS "REPLACEABLE", NOT "WRITTEN BY AN AUTOSAVE".** That is what
  makes ONE column enough. Sealing clears it; provenance would have to survive
  sealing, and the predicate would then need a second column to ask the question
  it actually asks.
- **THE APPEND-ONLY GUARANTEE IS NARROWED BY AUDIENCE, NOT BY CONVENIENCE.**
  There is still no UPDATE grant and no UPDATE policy on the table: a client
  cannot write `content`, `autosave` or `updated_at` by any door, and the direct
  `update` a client would try is refused by the grants (asserted). The
  replacement happens inside a SECURITY DEFINER function, on a row that is the
  head of its chain, written by the caller themselves, live, and on a DRAFT --
  which 0118 makes invisible to staff. So what append-only exists to protect,
  the version somebody else saw, is never what gets overwritten. `CLAUDE.md`
  states the rule and states what it must never be extended to.
- **THREE THINGS STAMP A BOUNDARY, and only one of them is the client's.** An
  explicit Save draft or Turn in calls `notebook_seal_notes`; an edit that is
  not an autosave appends a boundary revision by being one;
  `notebook_submit_entry` seals ITSELF, which is the rule -- from the moment an
  entry is turned in its notes are readable by staff, and no client may be the
  thing that remembers to freeze them.
- **THE SEAL IS A FUNCTION BECAUSE THE CLICK USUALLY HAS NOTHING TO WRITE.** The
  autosave has already sent those exact words and `EditBaseline` says so, so
  Save draft sends no note -- and without a stamp the head stays replaceable and
  the next keystroke writes over the version the student meant to keep. The
  composer calls it UNCONDITIONALLY rather than only in that case: where a
  revision was written it is already a boundary and the seal is a no-op, and
  branching on which case it is would be two spellings of one rule.
- **THE PREDICATE'S FOURTH CONDITION IS REDUNDANT AND STAYS.** `submitted_at is
  null` duplicates the seal in `notebook_submit_entry`. Opening either alone
  still refuses (measured, below); opening BOTH is what lets a submitted entry's
  note be rewritten. That is the defence-in-depth rule applied rather than
  quoted.
- **`created_at` NEVER MOVES.** A replacement stamps `updated_at`, so the
  history still says when a revision was STARTED and gains a clause saying the
  writing carried on. `NoteThread.editedAt` (a NEW version exists) and
  `changedAt` (the text last changed) are kept apart for the same reason: a
  replacement is the same version still being written, and reporting it as an
  edit is the noise this bundle removes.
- **NO EVENT LOG.** 0119's argument, unchanged: the extra stamp joins the set of
  timestamps the timeline is already assembled from.
- **A NEW RUNG, AND IT LICENSES THE PARAMETER.** `coalescingReady` is what says
  `p_autosave` may be named at all -- the column and the parameter land in the
  same migration, so a rung that came back proves the parameter exists. On a
  project sitting between 0128 and 0129 the composer autosaves exactly as it did
  yesterday (a revision per burst), which is worse and is not broken. The
  alternative, a `PGRST202` retry, spends a failed round trip to learn the same
  thing. `NotebookView`'s `coalescingReady` defaults to FALSE, unlike
  `historyReady`, because the fail-closed direction here is "do not send it".

### The backfill, which is the part to be sure about

**It deletes rows and cannot be undone.** Nothing in the table says which
already-written revisions came from an autosave -- the column that says so is
the one this file adds -- so it uses the only signal the rows carry, TIME, and
bounds itself twice:

- **Nothing before the autosave shipped.** a0d43ba is dated 2026-08-22
  11:26:10Z. Before that commit existed nothing but a person pressing a button
  could write a revision.
- **A run is consecutive revisions of one note, by one author, each within 30
  seconds of the one before it.** The debounce is 800ms and the whole backoff
  curve tops out at 12.8s, so 30s covers a burst including a fully-backed-off
  retry. A deliberate revision costs opening the entry, opening its note editor,
  typing and pressing Save changes.

It keeps the run's FIRST row and gives it the run's LAST content, with
`updated_at` from the last write -- exactly what coalescing would have produced.
Keeping the first row is also what makes it safe: revision 1 is what every other
row's `note_id` points at with `on delete cascade`, so deleting one would take
the whole chain. The block ASSERTS that (lowest revision in the delete set > 1,
and no doomed id is any row's `note_id`) and raises with the counts rather than
applying.

**The delete order is forced by two constraints pulling opposite ways.**
`supersedes_id` cascades, so deleting any row of a run would take every later
revision of that note with it; and it is UNIQUE, so the revision that FOLLOWED
the run cannot be re-pointed at the keeper while the run's second row still
holds that slot. So the pointers inside the delete set are nulled first, which
frees the slot and stops the cascade -- and that means
`notebook_entry_notes_chain` is false for as long as the block runs, so it is
dropped and re-added inside it. One transaction: a raise rolls the drop back
with everything else.

**Revisions are renumbered contiguously**, in two passes, because the unique
index is checked per row: non-root revisions are offset into an empty range
first, so no assignment can land on a number still in use. `revision` therefore
keeps meaning "the Nth version", which is what every revision written from here
on will mean (an append is always head + 1).

**Everything it leaves behind is SEALED.** Nothing written before the migration
becomes replaceable retroactively.

**It runs exactly once**, inside a catalog guard on `autosave`'s own existence,
and says so in the notice when it skips.

### What was measured

**SQL, against a real embedded Postgres with the real migration files applied**
(`tests/notebook-note-coalesce.test.ts`, 27 assertions in two suites).

Suite B boots the chain SHORT of 0129, seeds five note chains through the REAL
pre-0129 RPCs (`notebook_create_note_entry` + `notebook_edit_note` per
revision), stamps their `created_at` onto a fixed schedule as the connection
owner, and then applies the file over that database:

| chain | before | after | why |
| --- | --- | --- | --- |
| burst (3s apart) | 12 | **1** | the case this exists for |
| handwritten (10 min apart) | 4 | **4** | untouched, byte for byte |
| ancient (1s apart, pre-cutoff) | 3 | **3** | the cutoff is the only thing saving it |
| mixed (burst, gap, burst) | 5 | **2** | one per burst, still linked |
| deleted burst | 3 | **1** | collapses and stays marked on every row |

**16 revision rows deleted, 28 -> 12**, and the survivors' ids, `created_at`,
`updated_at`, `supersedes_id` and revision numbers are each asserted against
what the chain held before the file ran. Re-applying the file is a no-op (row
count and an md5 over `id||revision||content` identical).

**Mutation proof, in the PERMISSIVE direction, one condition at a time.** Each
run restored the file and re-checked its md5
(`d7735fab6e52a5673e3e5aa8596a50bc`):

| opened | red |
| --- | --- |
| `n.autosave` -> `true` | **3** (Save draft boundary, deliberate edit boundary, whole-chain delete) |
| `n.author_id = p_uid` -> `true` | **1** (a second author replacing a head) |
| `created_at >= v_cutoff` removed | **2** (pre-autosave revisions, the row count) |
| window 30s -> 1 day | **4** (hand-authored chain, mixed chain, delete-marks-chain, row count) |
| `perform notebook_seal_notes` in submit commented out | **1** (turning in seals) |
| `e.submitted_at is null` -> `true` ALONE | **0 -- and that is the point** |
| `n.deleted_at is null` -> `true` ALONE | **0 -- same** |
| **submit-does-not-seal AND predicate allows submitted** | **1**, on the denial assertion: the head IS rewritten after turn-in |
| **edit does not refuse a deleted chain AND predicate allows one** | **1**, on the denial assertion: the autosave lands on a deleted note |

The last two are the defence-in-depth verification `CLAUDE.md` asks for: neither
redundant condition reddens anything alone, and opening BOTH layers reddens the
thing that actually matters.

**The whole-chain delete, with a positive control, in both suites.** A note with
three revisions (two boundaries and a replaceable head) deletes 3 rows and marks
all 3, while a second chain on the same entry keeps 1 row and 0 marks; after the
backfill the mixed chain deletes 2 of 2 with its own control at 0 of 1. Both
are also read back through the real `noteThreads` / `deletedNoteThreads`.

**The ladder.** `tests/notebook-page-load.test.ts` gained the 0129 rung, a
PRE_COALESCE database (everything but this file), and a **strict-narrowing
assertion for the ENTRY ladder** -- which it did not have, only the posting one
did. Confirmed to bite: dropping `reviewed_at` from the new rung reddens it.

**Browser, `/dev/notebook`, the real component with the harness's transports**
(the harness now mirrors the flag, the predicate, sealing and submit-seals):

- Four autosaves in one sitting logged **one create + three
  `edit-note autosave=true`, each "coalesced into revision 1"**.
- **Save draft with nothing to write logged `notebook_seal_notes ... sealed=1`
  and no note write** -- the case the seal exists for.
- **Turn in logged `seal_notes sealed=1` then `submit_entry`.**
- The entry history renders **one** line for the whole session: `Wrote a note:
  "..." , still being written at 1:43 PM`.
- **0129 toggled OFF**: both writes go out `autosave=false`, no seal RPC, no
  coalescing, and the history line loses its clause -- the pre-0129 notebook
  exactly.
- No console errors.

**1440x900.** No horizontal overflow (`scrollWidth` 1425 == `clientWidth` 1425).
The history line is **878x21, one line**, its label 503px wide ending at x=1134
inside a pane whose right edge is 1372. The History summary is **879x44**. The
composer's actions row is unchanged at **718x44** with Turn in 73x44 and Save
draft 94x44 (the same numbers a0d43ba recorded).

**375x812.** No horizontal overflow (375 == 375). The history line wraps to
**3 lines, 300x71**, label 288px, inside the column; the History summary is
**301x44**.

Transitions were disabled before every geometry read (the pane freezes them at
t=0).

### What is NOT verified

- **Nothing ran against the live Supabase project.** The local `.env` is the
  placeholder project. Every SQL claim is against a real embedded Postgres with
  the real migration files applied, unmodified.
- **No signed-in browser pass.** The real route's transports were exercised only
  through the harness's in-memory answers; the `p_autosave` forwarding and the
  `notebook_seal_notes` call were read from the routes' own bodies and driven in
  SQL, not through a live round trip.
- **The backfill has never met production data.** Its window and its cutoff are
  arguments, not measurements: nobody has counted how many rows on the live
  project fall inside them. The migration reports its own counts at apply time,
  and that is the number to read before deciding it did the right thing --
  because there is no undo.
- **`npm run build` was not run** (the pre-existing Windows EPERM in the Vercel
  adapter's `closeBundle`).
- **No screenshot.** The Browser pane does not composite; every number above is
  a measured geometry read.
- **`svelte-check`: 0 errors, 37 warnings.** `CLAUDE.md`'s baseline says 36; the
  tree measured 37 before this bundle too (the drift is recorded in the autosave
  entry above). No notebook file appears in the warning list.

### Fixed in passing, and said out loud

- **The dev harness's `editNote` was refusing a note on a check-in entry**, a
  rule 0116 removed from the real RPC. A harness stricter than the thing it
  stands in for is the same defect as one that is looser: a drive through it
  would have "proved" a failure the deployed database does not produce, and the
  composer's autosave into a check-in draft goes through exactly that door.

### Deferred

- **A Save draft click ends the composer session** (`continueSaved` calls
  `resetForm`), so typing afterwards creates a SECOND entry rather than
  continuing the one just saved. That is a0d43ba's behaviour, unchanged here and
  inconsistent with `createFromNote`'s draft branch, which keeps the session. It
  is worth a decision; it is not this bundle's.
- **The staff payload and the review console's select still do not carry
  `updated_at`.** Widening a payload is a disclosure decision, and a turned-in
  entry's notes are all sealed, so it could only describe writing that happened
  before anybody could see it.
- **Clearing the note box is still not persisted**, unchanged from a0d43ba: the
  content gate refuses an empty note, so deleting all the text leaves the last
  saved text on the draft.

---

