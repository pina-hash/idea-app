---
title: "A notebook check-in can hang off a classroom item (`0120`)"
date: 2026-08-20
branches: []
migrations: ["0120"]
subsystems: ["Digital notebook", "IDEA Classroom"]
record_order: 86
---

## A notebook check-in can hang off a classroom item (`0120`)

A check-in was a `notebook_sessions` row unioned into the class stream in the
VIEW layer, with no foreign key to `classroom_items` at all. So "read the shop
floor rules" and "photograph your notes on the shop floor rules" were two
separate rows a student had to connect for themselves, on a page where
everything else that belongs together is already one thing.

### THE SHAPE, and what it deliberately is not

A check-in did NOT become a `classroom_items` kind. That would have given it
points, a due date, a submission and a rubric -- a SECOND scoring path for work
already graded once through `notebook_unit_items` -> `classroom_submissions`
(0097), which is the one guarantee that integration exists for. What changed is
one nullable column on the POSTING:

```
notebook_session_postings.item_id uuid null
  -> classroom_postings (item_id, section_id)   on delete set null (item_id)
```

- **The composite key is the point**, and it is the grain `notebook_unit_items`
  already uses. Pointing at `(item_id, section_id)` rather than at
  `classroom_items(id)` makes "the item is posted to the class the check-in runs
  in" a property of the SCHEMA: a period 2 check-in cannot point at a period 5
  material, so no RPC re-checks it and a raw insert cannot route around it.
- **Null is the existing behaviour, so nothing was backfilled.** A posting with
  no `item_id` emits its own stream row exactly as before; one with an `item_id`
  renders as a block on that item and stops emitting a row. Both shapes are live
  at once and every check-in that exists today is the first one.
- **`on delete set null (item_id)`, not cascade.** Unposting the item must not
  delete the check-in's posting: that row is the check-in's presence in the
  class, and the `(session_id, section_id)` key 0098 built means deleting it
  would take the students' filed entries with it. The column-list form is
  PostgreSQL 15+ (this project is 17); the whole-row form cannot be used because
  `section_id` is NOT NULL and would be nulled with it.

**Three RPCs**, all SECURITY DEFINER, all gated on `classroom_manages_section`,
all RAISING rather than returning structured refusals (these are setup
preconditions the UI already prevents, the `notebook_link_unit_item` precedent):

- `notebook_link_session_item(session, section, item)` -- refuses an item not
  posted to that class, a check-in that does not run in it, and anyone who does
  not manage it.
- `notebook_unlink_session_item(session, section)` -- clears the pointer and
  nothing else. The check-in, its postings and every entry filed against it are
  untouched.
- `notebook_create_item_check_in(item, unit, date, label)` -- ONE round trip for
  the composer, because a client-side create-then-link loop can stop halfway
  with nobody able to say how much landed. **It reimplements nothing**: it calls
  `notebook_admin_upsert_session` and then `notebook_link_session_item` per
  section, nested definer calls that read the same JWT claims, so every rule
  those two carry applies here unchanged. The sections are the ITEM's own rather
  than a parameter -- asking twice is how the two come to disagree.

### CREATION COMPLETENESS: the third staged attachable

`ContentComposer` stages a check-in beside the deck and the spec, following the
SPEC's pattern rather than the deck's: no bytes, so it is one RPC inside
`applyStagedExtras`, with no endpoint, no multipart parse, no staged job and no
progress bar. Create-only in the form, exactly as the other two are; on an
existing item the item page owns it, exactly as the item page owns the deck and
the spec. A failure leaves it staged and NAMES it by its own label, which is the
rule `applyStagedExtras` already applied to the other two.

`CheckInStager.svelte` is the one form, mounted by both the composer (which
stages) and the item page's inspector (which writes). It decides nothing: the
parent says what confirm means. Validation is `checkInDraftIssue`, which mirrors
`notebook_admin_upsert_session`'s own three refusals rather than inventing a
fourth -- the RPC is still the boundary.

**SessionManager is untouched.** This adds a path; it does not replace one. The
check-in's date, label and which classes it runs in stay where they were.

### THE READ PATH

- **A select LADDER** (`NOTEBOOK_POSTING_SELECTS`), because a deploy sitting
  between 0119 and 0120 is a real state and PostgREST rejects a whole select that
  names an unknown column. The capability reports itself as `checkInLinksReady`,
  which the pages read to decide whether to offer the WRITE controls at all.
  Degrading costs exactly one thing: every check-in keeps its own stream row,
  which is what they all did last week.
- **The fork lives inside `mergeCheckIns`**, not at its four call sites, so no
  caller can forget it. `streamCheckIns` and `checkInsForItem` are the two halves
  named.
- **FAIL OPEN when the viewer cannot see the item.** Attach a check-in to a
  DRAFT item and a student's RLS-filtered `items` does not contain it -- a naive
  split would render the check-in NOWHERE: gone from the stream because it is
  linked, gone from the item because the item is not there, while the notebook
  and the grid both still expect the work. The load clears `item_id` for any
  check-in whose item is not in its own payload, so the row comes back.
- The item page adds NO query: `data.checkIns` is the layout's, page data merges
  over layout data, and the two surfaces therefore cannot disagree about a
  student's status.

### THE THIRTEEN BRANCH POINTS, and the three the audit missed

The prompt's audit listed thirteen places that branch on the check-in kind. All
thirteen were walked:

| # | branch point | what happened |
| --- | --- | --- |
| 1 | `StreamEntry` union declaration | unchanged -- a check-in is still its own kind of entry |
| 2 | the insertion walk (`mergeCheckIns`) | CHANGED: it merges `streamCheckIns(checkIns)`, so a linked one cannot reach the stream through any caller |
| 3 | entry construction (`splice`) | unchanged |
| 4 | ClassView's render branch | unchanged |
| 5 | `checkInRow` snippet | unchanged -- only unlinked check-ins reach it |
| 6 | ClassView's `mergeCheckIns` call | unchanged (the filter is inside the function) |
| 7 | the layout load's `canManage` branch | unchanged; the ladder and the fail-open rule are new, and sit outside it so both branches get them |
| 8 | the `checkIns` pass-down | unchanged to ClassView; NEW pass-down to ItemDetail, narrowed by `checkInsForItem` |
| 9 | the view-as page that passes none | unchanged, and now also passes no `checkIns` to ItemDetail -- the block simply does not render there, exactly as the deck does not |
| 10 | PeoplePanel's per-student summary | unchanged: it reads the GRID, which knows nothing about items |
| 11 | `notebook-folders.ts`'s check-ins filter chip | unchanged: it filters on `entry.session_id`, and 0120 touches no entry |
| 12 | `NotebookEntryCard`'s `canEdit` gate | unchanged: `freeForm` is `entry.session_id === null`, same reason |
| 13 | `EntryNotes`' `canEdit` mirror | unchanged, same reason |

**Three the audit did not name, found by walking the callers:**

1. **`outstandingCheckIns` / the notebook badge.** It counts every check-in
   including linked ones, and that is the DECISION rather than an oversight: a
   linked check-in is still work the student owes, and the badge counts what is
   owed regardless of which surface renders it.
2. **ClassView's empty state** (`!items.length && !checkIns.length`). It now asks
   `streamCheckIns`, because a check-in rendered on an item is not an answer to
   "is this class empty" -- the item it renders on is already content on the page.
3. **`/dev/classroom`'s `CHECK_INS` fixture.** A real construction site of
   `ClassCheckIn`, which the required `item_id` field forced to decide; one of
   its five is now attached to an item, so the harness exercises both shapes.

`class-check-ins.ts`'s header argued on SCHEMA grounds that a check-in could not
be a classroom item, citing the absent foreign key. That described the old
schema and has been rewritten: the reason a check-in must not become a
`classroom_items` kind is the SECOND SCORING PATH, which no schema change
affects. The layout load's own copy of that paragraph was rewritten with it.

### VERIFIED

**`tests/notebook-session-item-link.test.ts` -- 21 tests**, real embedded
Postgres, the real chain applied unmodified:

- **The composite key, with RLS and the RPCs out of the way entirely** (as the
  connection owner, which bypasses both): a raw `update` pointing a P1 check-in
  at a P3-only item is refused by the KEY, and the same statement with a P1 item
  succeeds. The catalog is read directly for the shape: `confrelid` is
  `classroom_postings`, both column lists are `item_id,section_id`, `confdeltype`
  is `n`, and `confdelsetcols` is `item_id` alone.
- **Unposting**: the check-in's posting SURVIVES with a null `item_id`, the other
  class's posting keeps its link, and the student's entry is still attached.
- **Authorization**: another class's teacher and an enrolled student are both
  refused on link and unlink; the pinned owner is allowed, which is the positive
  control that the refusals are about WHO.
- **`notebook_create_item_check_in`**: creates one canonical check-in and one
  linked posting per section the item is posted to; refuses an item whose classes
  the caller does not fully manage and writes NOTHING when it does (session count
  before == after); refuses an item posted nowhere; and inherits the unit-range
  and label rules from the RPC it calls rather than restating them.
- **Re-applying**: the file is applied twice more in-test; the constraint and the
  index are still exactly one each, and each of the three functions has exactly
  ONE `pg_proc` row (the signature trap), all SECURITY DEFINER with a pinned
  `search_path`.
- **Grading is untouched, asserted rather than assumed.** With unit 1 linked to a
  Documentation Check assignment, the standard rubric installed and a real grade
  released, four things are captured before attaching check-ins and compared
  after: `notebook_unit_items`, the whole `notebook_get_section_grid` payload
  (less its own `generated_at`), `classroom_submissions`, and the FACTS
  `gradesCsv` STRING. All four are byte-identical, including when a check-in is
  attached to the very assignment the unit is graded through. Positive controls
  beside them: one submission exists, the CSV carries the score, the summary has
  two students. And a check-in filed against a MATERIAL creates 0 submissions, 0
  responses and 0 rubrics.

**`tests/classroom-notebook-checkins.test.ts` -- 28 tests** (6 new), driving the
REAL layout load through the PostgREST shim:

- **Both shapes on one page**: with a linked and an unlinked check-in in the same
  class on the same day, the linked one is ABSENT from `mergeCheckIns`' output and
  PRESENT in `checkInsForItem`; the unlinked one is still in the stream and the
  material itself is still a row. Asserted through the function ClassView
  actually calls, not `streamEntries` (which drops materials by design).
- **A DRAFT against a linked check-in reads as `draft`, never `filed`**, with a
  classmate's properly filed entry against the SAME check-in as the control, and
  it still counts as outstanding.
- **Fail open**: a check-in attached to an unpublished item keeps its stream row
  for the student who cannot see the item, while the teacher who can still reads
  it on the item.
- **The ladder**: on a database carrying everything EXCEPT 0120,
  `checkInLinksReady` is false, the check-in still arrives, and it is in the
  stream.

**Two mutation proofs, both permissive, both restored md5-identically and
re-verified green:**

- `streamCheckIns` returning every check-in (the exclusion opened): **1 red** --
  "renders on the item and NOT in the stream".
- the load's fail-open fallback removed: **1 red** -- "keeps its stream row when
  the viewer cannot see the item".

**`tests/classroom-composer-staging.test.ts`**: five new tests for the staged
check-in -- created against the item that now exists and cleared; STAYS STAGED
and named by its own label when refused; a throw is a refusal rather than an
unhandled rejection; "not available here" when the transport is absent; and it is
still attempted when the deck before it failed, with only the failure left
staged.

**`tests/notebook-page-load.test.ts`**: the new rung gets the same catalog
coverage the old one has (its embed resolves through a real key), plus that the
ladder narrows strictly -- the wide rung is the narrow one plus `item_id`.

**Driven in the browser** (`/dev/classroom-split`, `/dev/classroom`), every claim
a measured DOM read:

- **The composer, end to end**: staging refuses an empty unit ("Give the check-in
  a unit number.") and an out-of-range one ("Unit number must be a whole number
  between 0 and 1000."), then stages "Bearing teardown Unit 3 · 2026-09-04 ·
  attaches on save".
- **The failure that must leave it staged**: with the transport refusing, Post
  created the item (`created: ['i-created-1']`), the check-in did not land
  (`checkIns: []`), the message read *"Saved, but 1 thing did not: notebook
  check-in "Bearing teardown": The server refused that check-in. What is left is
  still here -- save again to retry."*, the staged line was still on screen and
  the typed title was still in the field.
- **The retry**: with the failure cleared, saving again UPDATED the same item
  (`created` still length 1, `updated: ['i-created-1']`) and the check-in landed
  with the right unit, date and label. The success notice read "Announcement
  posted to 1 class. Check-in scheduled."
- **The class page**: the two unlinked check-ins are rows in the stream
  ("Gearbox build", "Bearing teardown") and the linked one ("Shaft stackup") is
  not -- both shapes measured on one page.
- **A student's item page**: the block reads "Notebook check-in / Shaft stackup /
  Hard to read / Unit 3 · Aug 10 / Open your notebook", the link is
  `/notebook?checkin=ns-2&section=s-1` (both ids, exactly what the stream row
  carries), and the management surface is structurally absent: 0 inspector lines,
  0 detach controls, 0 stagers, 0 form fields.
- **A teacher's item page**: the inspector carries the line and a Detach control;
  arming it shows what it costs ("It goes back to being its own row in the class.
  The check-in, and every entry filed against it, stay exactly as they are.")
  without writing anything; a refused detach reports "The server refused that."
  and stays armed; the real one calls `unlink(ns-2, s-1)`. On an item with no
  check-in the stager appears instead and attaches
  `createForItem('i-3', {5, 2026-10-02, 'Truss photos'})`.
- **Layout**: at 375px the block is 343px wide with a 44px tap target and no
  horizontal overflow; at 1440px it is 896px, directly under the hero (y=274
  against the hero's bottom at 254) and above the written body.

`npx svelte-check`: **0 errors, 36 warnings** (the baseline).

### NOT VERIFIED

- **The live Supabase project.** The local `.env` is the placeholder project, so
  `0120` has never been applied anywhere: every SQL claim above is the embedded
  Postgres running the real file, and every UI claim is a dev harness with the
  transports answered in memory. Nothing here has run against real class data.
- **A real Drive round trip, a signed-in session, and the real
  `/classroom/<id>/item/<id>` route**, for the same reason.
- **No screenshots** -- the Browser pane does not composite; every visual claim
  is a geometry or text read.
- **Attaching an EXISTING check-in to an item is deliberately not built.** The
  composer creates one and attaches it; the item page creates one and attaches
  it, or detaches what is there. A picker over check-ins that already exist would
  be a third authoring surface for the same act, and `notebook_link_session_item`
  is what it would call when somebody wants it.

**Undoing it:** `alter table public.notebook_session_postings drop column
item_id` (which takes the constraint and the index with it), and drop the three
functions. Every check-in returns to its own stream row, which is where they all
were; nothing else stored changes. The client degrades on its own if the column
goes without the code -- that is what the ladder's narrow rung is.

---

