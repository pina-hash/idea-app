---
title: "Check-ins are multi-section, the Classroom way (`0098`)"
date: 2026-08-13
branches: []
migrations: ["0098"]
subsystems: ["Digital notebook"]
record_order: 31
---

Migration `0098_notebook_session_postings.sql` (apply manually after `0097`).
IDEA209H runs three sections on identical pacing; `notebook_sessions.section_id`
tied a check-in to exactly one, so a five-check-in unit was fifteen manual
creations with three chances per check-in to mistype a date and desynchronize
sections required to stay identical.

### The shape is borrowed from `0085`, not invented

`notebook_sessions` is the CANONICAL record (unit number, date, label) and
`notebook_session_postings` is one row per section, carrying no state of its
own for the reason 0085 gives: the moment a posting could hold its own date the
copies could drift again. Editing edits the canonical record, so every section
sees the change in the same statement -- one date, one label, three grids. The
RPCs mirror their counterparts one for one so the two read as one idea:
`classroom_create_item`/`_update_item` -> `notebook_admin_upsert_session`,
`classroom_add_postings` -> `notebook_add_session_postings`,
`classroom_remove_posting` -> `notebook_remove_session_posting`,
`_classroom_check_publish_targets` -> `_notebook_check_session_targets`,
`_classroom_manages_item` -> `_notebook_manages_session`.

### What it did to existing rows

Live data existed, so nothing is dropped and recreated. Every
`notebook_sessions` row survives with its id, unit, date, label, author and
creation stamp; only the `section_id` COLUMN leaves it. Before that column
goes, each check-in gets exactly ONE posting to the section it already belonged
to -- a single-section check-in is the trivial instance of the new model, not a
special case beside it. **No `notebook_entries` row is written at all**: an
entry already satisfied `(session_id, section_id) = (session.id,
session.section_id)`, which is precisely the posting seeded for it, so the
repointed key is satisfied by construction rather than by repair. Excusals,
photos, notes and folder links are untouched. Counts are reported by `raise
notice` at apply time (the 0096 convention).

### The composite key is repointed, and comes out STRONGER

This **supersedes 0094's "the composite key is preserved exactly" note**: a
canonical check-in has no single section to point at, so
`notebook_entries (session_id, section_id)` now references
`notebook_session_postings (session_id, section_id)` -- the exact idiom 0097
already uses for `notebook_unit_items -> classroom_postings (item_id,
section_id)`. An entry filed against a check-in in a class that check-in does
not run in is now unrepresentable too.

It carries NO on-delete action, and that is what makes the unpost guarantee
structural rather than remembered: removing a posting that still has entries is
refused by the key itself, so the RPC must detach them first.
`_notebook_detach_session_entries(session, section?)` is 0069's
detach-and-relabel rule extracted so the three paths that need it (delete the
check-in, unpost one section, reconcile a section away on edit) share ONE
implementation.

**SQL ORDERING TRAP, hit here:** an RLS policy records a real dependency on
every COLUMN its expression names (0085's lesson), and 0094's excusal policy
reads `notebook_sessions.section_id` -- so the policy has to be dropped before
the column can be, and recreated against the postings afterwards.

### Authorization, deliberately asymmetric

Editing, deleting or widening a check-in requires managing EVERY section it
runs in (`_notebook_manages_session`), because those actions change what all of
them see. Posting to three sections requires managing all three, all-or-nothing
before anything is written. **Unposting ONE section is the weaker action** --
only `classroom_manages_section` for that section, since taking your own class
off a shared check-in is a decision about your class. The last posting is
refused as a structured `{ok:false, reason:'last_posting'}`, not an exception:
"this is the only class it runs in, delete it instead" is information the UI
renders, and a check-in with no postings would appear on no grid.

Reconcile-to-my-own-section-only is NOT a way around that bar -- the edit still
demands every section it currently runs in, which is what stops a shared
check-in being seized and the other class unposted.

### The signature trap, and deploy ordering

`notebook_admin_upsert_session`'s first parameter changes from `uuid` to
`uuid[]`, so the old arity is DROPPED first. **Apply this migration by hand
BEFORE deploying any client that names `p_section_ids`** (the 0096 rule).

### What the grid does NOT do

It still shows ONE section at a time, and a check-in running in three sections
is one column in each of the three. One thing the single-section model got for
free had to be stated explicitly: the cell query is **scoped to the section**,
since a shared check-in also holds the other class's entries and they belong on
that class's grid.

### Surfaces

`SessionManager.svelte` gains a class picker on the CREATE form (defaulting to
the section being viewed, never pre-ticking others) and a per-row "Classes"
panel listing what a check-in runs in, with add and a two-step remove that
names the consequence. **The EDIT form deliberately does not change sections**:
the RPC reconciles, so leaving that in the edit path would make unposting a
class a side effect of fixing a typo. A section the caller does not manage
renders as "not yours to remove" rather than a button the RPC would refuse.
The student's own check-in list reads through the postings, and the entry
submit now names its section explicitly (`_notebook_resolve_session_section`
falls back to the student's own active enrollment, then the only posting).

### Verified

- **`tests/notebook-session-postings.test.ts` (34 assertions)** boots the chain
  SHORT OF 0098, seeds the OLD shape through the REAL pre-0098 RPCs -- including
  a student's real photographed entry -- and applies the real file over the top
  (the 0085/0095/0096 two-halves shape). Covers the migrated rows (ids, fields,
  authorship, one posting each, entry links and photos intact, the column and
  old unique gone), the repointed key with RLS OUT OF THE WAY ENTIRELY, the
  signature and overload counts, a three-section check-in appearing once per
  grid and editing once for all three, each section's entries staying on its
  own grid, every authorization boundary, unpost/reconcile/delete detaching
  rather than destroying, the last-posting refusal, the weaker-unpost
  asymmetry, no client write path, and the file re-applying TWICE more.
- **MUTATION-CHECKED FOUR WAYS, both directions.** Dropping the target
  authorization reddens 4; making it always refuse reddens 6; destroying
  entries on unpost instead of detaching reddens 1; degrading the composite key
  to a plain `(session_id)` reference reddens 4. Migration restored
  byte-identical (md5-checked) and re-verified green each time.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **621/621 across 27 files** (was 587/26).
- **Browser-verified** in `/dev/notebook-review` (harness store reworked to
  mirror 0098, including a sec-b entry filed against a SHARED check-in): the
  create form defaults to the viewed section with the other unticked; ticking
  both created one check-in reported "added to 2 classes" and rendered as a
  column in BOTH grids; **editing its date and label ONCE in Period 2 changed
  Period 4's column too** (`Shaft stackup calcs (moved) U3 · Aug 12` in both);
  section scoping proved by the same shared check-in reading "On time" for
  Patel in Period 4 and "Missing" in Period 2; unposting Period 4 removed that
  column, reported "1 entry was kept and relabelled", and left the entry as a
  free entry (`+1 free`) with Period 2 untouched; the last posting was refused
  with the delete-instead message and nothing removed; re-adding round-tripped;
  and as the instructor the create form offered only their own class while the
  foreign section read "not yours to remove". 375/375 at phone width with the
  form and panel open. `/dev/notebook` still submits a session-linked entry,
  now carrying `section_id` beside `session_id`. Zero window errors throughout.
- **NOT verified: the live Supabase project.** The local `.env` is the
  placeholder project, so `0098` has never been applied anywhere. Apply it by
  hand after `0097`, **read the `raise notice` and check the reported counts
  against what the deployed app actually holds**, and spot-check with two real
  accounts that a teacher of one section cannot post a check-in into another's.
- **Also not verified: screenshots.** The Browser pane does not composite, so
  every visual claim above is a measured DOM or geometry read, not an eyeball.

