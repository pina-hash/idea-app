---
title: "Digital notebook (folders + the collapsed feed, `0088`)"
date: 2026-08-11
branches: []
migrations: ["0088"]
subsystems: ["Digital notebook"]
record_order: 26
---

## Digital notebook (folders + the collapsed feed, `0088`)

Migration `0088_notebook_folders.sql` (apply manually after `0087`) plus a
rebuilt `/notebook` feed. The notebook had exactly one view since 0069 -- every
entry ever made, newest first, each rendered at full column width with every
page photo -- which is right when an entry is rare and unusable once a term of
them has piled up. Folders are the organizing layer; the collapsing, searching
and filtering that go with them are UI and needed no schema.

- **A FOLDER IS ORGANIZATION, NOT A RECORD**, and every rule follows from it.
  Deleting one never deletes an entry: `notebook_delete_folder` unfiles its
  entries and removes the folder in one transaction, so the worst a delete
  costs is the filing -- which is why folders get a real delete at all, unlike
  the archive-not-delete rule the rest of this schema runs on (coin sections,
  role holders, greenline tracks), all of which hold history. An entry sits in
  at most ONE folder (not tags: one-of is what makes "Unfiled" a place worth
  going). Folders are per STUDENT; an instructor's view is still the
  session-organized section grid, untouched by any of this.
- **THE COMPOSITE FK IS THE POINT.** `notebook_entries.folder_id` references
  `(id, student_id)`, not `(id)` -- the exact idiom 0069 already uses to tie an
  entry's session to its section -- so "filed into somebody else's folder" is
  UNREPRESENTABLE rather than merely refused by an RPC, and no RPC re-checks
  ownership of a folder it was handed. MATCH SIMPLE skips the check when
  `folder_id` is null, which keeps "unfiled" free. Deliberately NO on-delete
  action on it: `on delete set null` would need PG15's column-list form to
  avoid nulling the not-null `student_id`, and the delete RPC spells the
  teardown out instead (the `tournament_delete` convention).
- **`notebook_folders_id_student_key` is added CONDITIONALLY (a `do $$` guard on
  `pg_constraint`), not dropped and re-added like every other constraint in the
  file** -- and this bit in practice on the first real apply. The entries'
  composite FK DEPENDS on that unique index, so the second run of a
  drop-then-add raises `2BP01: cannot drop constraint ... because other objects
  depend on it` and aborts the rest of the migration. Postgres has no
  `add constraint if not exists`, hence the guard. Migrations here are pasted
  in by hand, so a re-run is ordinary -- someone re-pastes, or a first attempt
  failed partway and gets retried -- and a migration that only works once fails
  exactly then, with the schema half-built. Pinned by an idempotency test that
  re-executes the real file and re-checks the FK and the RPC overload counts
  afterwards; reverting the guard reproduces the original 2BP01 error.
- **Zero client write grants**, as everywhere else in the notebook. Four RPCs,
  none of which takes a student id at all -- the caller is `auth.uid()`, so
  "you can only touch your own" is a property of the signatures:
  `notebook_upsert_folder` (null id creates, set id renames/recolours -- the
  `notebook_admin_upsert_session` convention), `notebook_delete_folder`, and
  `notebook_move_entries(uuid[], uuid)`. **The move takes an ARRAY**, so a
  handful of entries move in ONE transaction rather than a client-side loop
  that can stop halfway with nobody able to say how much landed (the
  `coin_bulk_log_section` reasoning over a much smaller roster); a single move
  is an array of one, so there is one code path.
- **A duplicate folder name is a STRUCTURED refusal** (`{ok:false,
  reason:'duplicate_name'}`), not a raise -- it is the one failure ordinary use
  reaches, and the answer belongs beside the field the student typed in.
  Uniqueness is case- and whitespace-insensitive, enforced by a real unique
  index on `(student_id, lower(btrim(name)))` as well as by the RPC.
- **FOLDER NAMES ARE VISIBLE TO SECTION STAFF, on purpose**, and the UI says so
  where a folder is named. Staff read a folder ONLY through an entry they can
  already read (the policy delegates to `notebook_can_read_entry`, the
  `notebook_entry_photos` / `notebook_entry_notes` pattern), so an EMPTY folder
  is invisible to them -- there is nothing of the student's in it to give it
  context -- and unfiling the last entry takes it back out of staff view.
  `EntryReview` renders it as a quiet italic "Filed under X": context, never a
  review signal.
- **Filing AT CREATION.** Both creating RPCs gained `p_folder_id`, so both were
  **DROPPED at their old signature first** -- adding a parameter changes the
  real signature and `create or replace` alone would leave the old arity
  callable as a second overload that silently ignores the folder (the trap this
  repo has already been caught by in 0058 and 0068). **The routes name
  `p_folder_id` ONLY when a folder was actually asked for**, and that is a
  deploy-ordering rule, not tidiness: migrations here are applied by hand, so a
  project on 0078 without 0088 is a real state, and naming a parameter the old
  signature does not have would leave PostgREST unable to resolve the function
  and break note saving and photo upload outright. A folder can only be
  requested once the UI has folders to offer, i.e. once 0088 is applied. **This
  was caught by `notebook-note-route.test.ts`, which runs the chain WITHOUT
  0088** -- not by review.
- **The collapsed feed.** `NotebookEntryCard.svelte` (extracted from
  NotebookView, which was 1100 lines before any of this) renders one entry as
  either a collapsed tab or the full card. Collapsed is a REAL view, not a
  hidden one: thumbnail, title, the note's opening words, date, photo/note
  counts, folder chip and status, which between them answer "is this the one"
  without expanding anything. Everything is collapsed by default. Panel state
  (add photos / add a note) is per-card now rather than one-at-a-time for the
  whole feed -- with entries collapsed a panel can only exist inside an
  expanded card anyway. **Sequencing is still NOT the card's business:** which
  upload creates what, and how a corrected photo lands adjacent to its own
  original, stays in NotebookView and is injected, so it has one implementation
  whether photos join a brand-new entry or one from three weeks ago.
- **Thumbnails, and why note entries get a rendered text tile.** A photo entry
  shows its first page; a note-only entry has no image and never will, so
  rather than a generic icon it renders its own opening words as a miniature
  page (`EntryThumb.svelte`) -- genuinely representative, no storage, no
  request, and the only thing that tells one note apart from the note above it
  at a glance. Photo tiles use a NEW `?size=thumb` on the existing proxy
  (`downloadNotebookThumbnail` serves Drive's own `thumbnailLink`, fetched by
  the school account since that link needs Google credentials the student does
  not have): a collapsed feed asks for one image per entry, and pulling
  megabytes to paint a 64px tile is the exact cost this view exists to remove.
  It is applied strictly AFTER authorization and **falls back to the full image
  whenever Drive has no rendition yet** -- the ordinary state for a photo
  uploaded seconds ago -- so it can only ever make a response smaller, never
  make one appear that would have been refused.
- **SEARCH AND FILTERS RUN OVER THE WHOLE NOTEBOOK, which is why "show older"
  is a RENDER limit and not a query limit.** A student searching their notebook
  means all of it; a server-side page size would silently scope "find the
  gearbox note" to whatever happened to be loaded. The rows are small
  (metadata, note text and photo ids -- never image bytes, which come from the
  proxy on demand and are already lazy), so the cost that actually hurt was
  painting hundreds of full-width photos, which the collapsed view and the
  30-entry render limit are what fix. Revisit if one student's entry count
  reaches the low thousands. Search covers the displayed title, the typed
  title, the check-in label, every CURRENT note revision and the photo
  filenames; superseded revisions are deliberately excluded, since an entry
  surfacing for words the student removed three edits ago -- and then not
  containing them -- reads as a bug. Terms combine with AND, and so do the four
  filter chips (Needs attention / Has photos / Has notes / Check-ins).
- **`src/lib/notebook-folders.ts`** is the pure layer (the notebook.ts /
  curriculum.ts convention): folder types, the colour registry mirroring 0088's
  CHECK, selection (`'all' | 'unfiled' | <id>` -- three states, because
  "unfiled" is somewhere a student goes on purpose and must not collide with
  "no filter"), counts, search, filters, date bucketing (Today / Yesterday /
  Earlier this week / Last week / month / Older -- coarser with age), and
  thumbnail selection. `FolderRail` and `FolderManager` are presentation +
  callbacks; folder writes are injected as `FolderTransports` and the real page
  calls the RPCs directly on the browser client (the `/notebook/review`
  convention) rather than through an API route, because a folder write is one
  RPC call with two strings and has none of the server-side work that justifies
  the photo and note routes.
- **Folder colours** are six `--nb-folder-*` tokens in the design-system layer
  (all >= 4.5:1 on `--nb-bg`), the one `--nb-*` set that is DECORATIVE rather
  than semantic -- they must never be read as status. `gold` is
  `--nb-accent-ink` rather than a seventh hue, so a folder a student wants to
  stand out borrows the platform thread instead of competing with it.
- **Three real bugs found in the browser, none of which `svelte-check` could
  see.** (1) The feed's `<li>`s are GRID items, whose automatic minimum size is
  their MIN-CONTENT -- and a collapsed row is a nowrap flex line, so each item
  refused to shrink below the untruncated title and forced the whole page
  wider than a 375px viewport (measured: layout viewport 487 against a 375
  window, with a control page reading a clean 375). `overflow: hidden` and an
  ellipsis do NOT reduce min-content; `.entries > li { min-width: 0 }` is what
  does. (2) `FolderManager` read the folder's entry count AFTER the delete, by
  which time the folder was gone from the count map, so the confirmation
  silently dropped its "and your N entries are safe" half at the one moment it
  mattered. (3) The folder chip rendered from stale props with filing turned
  off. Also fixed while measuring: the bulk-select checkbox was a 17px tap
  target, now a 44x133 padded label.
- **Verified.** `tests/notebook-folders.test.ts` (27 assertions, 0001 + 0003 +
  0020 + 0067 + 0069 + 0070 + 0071 + 0075 + 0078 + 0088 applied UNMODIFIED to a
  real embedded Postgres) covers only what fails SILENTLY: the composite FK
  refusing a foreign folder **with RLS out of the way entirely** (running as
  the connection owner, so nothing but the key itself can refuse it), the
  overload count on both creating RPCs, who can read a folder name (owner yes;
  another student no, by list AND by id; the section instructor yes but not an
  empty folder and not after the last entry is unfiled; a teacher who teaches
  nothing no; the chair yes), no direct INSERT/UPDATE/DELETE for student,
  instructor OR chair, no anon EXECUTE, delete-unfiles-rather-than-deletes with
  photos and notes intact, and the duplicate-name refusal at both the RPC and
  the index. MUTATION-CHECKED BOTH WAYS: degrading the composite FK to a plain
  `(id)` reference reddens 2 tests, opening the staff policy to `using (true)`
  reddens 5; migration restored byte-identical and re-verified green.
  `tests/notebook-photo-route.test.ts` gained 4 assertions for `?size=thumb`
  (serves the rendition, rewrites Drive's `=s220` to the size the feed renders
  at, falls back to the full image with no rendition, and grants NOTHING -- a
  stranger, a signed-out caller and an imaginary id answer exactly as they do
  without the parameter). Browser-verified in `/dev/notebook` (extended with
  folders, an in-memory mirror of 0088's real semantics, a 0088-applied toggle
  and 40 filler entries): rail counts and filtering, search over note text and
  filenames, AND-combining chips, expand/collapse all, a bulk move of 2 landing
  as ONE `notebook_move_entries` call with both ids, per-entry re-filing, the
  create flow posting `folder_id` with a blank title sent as null, the note-only
  entry rendering its text tile and naming itself from its own words, the
  picker then following the last filing, **"theodolite" found at position 35
  with only 30 rendered** (the search-covers-everything guarantee), "Show
  older" clearing the remaining 17, the folder manager's duplicate refusal /
  create / two-step delete naming the real cost, the 0088-unapplied fail-soft
  leaving the feed, search, filters and both add-panels working, 375/375 at
  phone width in every state including a 39-character folder name, and an armed
  `window.onerror` catching ZERO errors throughout. `npm run check`: 0 errors,
  no new warnings. **NOT verified: the live Supabase project** -- the local
  `.env` is the placeholder project, so 0088 has never been applied anywhere;
  apply it by hand after 0087 and spot-check the staff-visibility boundary with
  two real accounts. **Also not verified: screenshots** -- the Browser pane in
  this environment does not composite, so every visual claim above is a
  measured computed-style or geometry read, not an eyeball.
- **`npm test` note (pre-existing, not caused by this change):** this machine
  cannot run all 18 DB test files in parallel -- each boots its own embedded
  Postgres and they starve each other's `beforeAll`. HEAD fails the same way (9
  files). Run DB suites with `--no-file-parallelism`; all 8 notebook suites pass
  that way (165/165).
- **`npm run build` note (pre-existing, machine-level, NOT a code failure):** on
  Windows the build compiles fully and then dies in the Vercel adapter's
  `closeBundle` with `EPERM` writing
  `.vercel/output/functions/![-]\catchall.func` -- a path Windows cannot create.
  Confirmed identical at `8586064` (pre-Phase-2), and it survives deleting
  `.vercel` and `.svelte-kit/output`. It does NOT stop the build from doing the
  one check a build is wanted for here: SvelteKit's illegal-import pass runs
  during compile, so a `$lib/server` leak into client code still fails loudly
  before this point. Vercel builds on Linux and is unaffected.

