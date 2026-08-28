---
title: "Automated tests"
date: 2026-08-07
branches: []
migrations: []
subsystems: ["Build, theme, tests, conventions"]
record_order: 81
---

## Automated tests

`npm test` (vitest, config in `vitest.config.ts`, specs in `tests/`). This is
the **only** automated test suite in the repo, and it is deliberately narrow:
everything else here is verified by dev harnesses and browser passes, which
stays the norm. Tests are for guarantees that are expensive to get wrong
SILENTLY -- ones where a regression breaks nothing visible.

- **`vitest.config.ts` is standalone, NOT an extension of `vite.config.ts`.**
  These are database tests: no Svelte, no DOM, no SvelteKit. Loading the app's
  plugin chain (which shells out to `git log` for the changelog substrate) would
  only add startup cost and failure modes. `tests/**/*.ts` is already inside the
  SvelteKit-generated tsconfig's `include`, so `npm run check` type-checks the
  suite along with everything else. It carries THREE aliases, each the minimum
  needed to import a REAL module rather than a copy of it: `$lib`;
  `$env/dynamic/private` -> `tests/stubs/env-dynamic-private.ts` (a live
  `process.env` read, which is faithfully what the real module does); and
  `virtual:site-versions` -> `tests/stubs/site-versions.ts`, without which
  neither surface that renders the build stamp can be imported at all, and the
  one thing worth asserting about them -- that they render the SAME stamp --
  cannot be asserted. That stub derives its data from the real
  `buildSiteVersions` rather than hard-coding a shape, so it can never certify a
  shape the build does not emit.
- **The fixture is a REAL embedded Postgres with the REAL migration files
  applied, unmodified** (`tests/db/harness.ts`, the approach three prior
  verification passes on the notebook layer proved out and then threw away).
  `embedded-postgres` boots a throwaway cluster on a free port in a temp dir
  (`persistent: false`); `tests/db/supabase-stub.sql` supplies only what lives
  OUTSIDE `supabase/migrations` and is therefore assumed to exist -- the `anon`
  / `authenticated` / `service_role` roles, `auth.users` + `auth.uid()`
  (Supabase's own definition, reading the `request.jwt.claims` GUC), and enough
  of `storage` for 0020's avatars bucket. Nothing in the stub re-implements a
  migration; if a migration would fail on a real project, it fails here.
  Startup is ~7s per file and paid once in `beforeAll`. The default list is the
  notebook's own dependency chain (0001, 0003, 0020, 0067, 0069, 0070, 0071,
  0075, 0078); a suite with a different chain passes its own rather than
  editing the shared constant.
- **`asUser(id, fn)` is how a test "signs in":** set the `request.jwt.claims`
  GUC, then `SET ROLE authenticated`, which is exactly what PostgREST does per
  request. **The role switch is load-bearing** -- the connection role owns these
  tables and would bypass both RLS and the table grants, so a test that forgets
  it passes vacuously. It deliberately does NOT wrap the work in a transaction:
  several tests assert a statement is REJECTED, and inside a transaction the
  first rejection would poison everything after it. The GUC and role are reset
  in a `finally` before the connection returns to the pool.
- **`tests/notebook-security.test.ts`** (33 assertions, migrations 0001 + 0003 +
  0020 + 0067 + 0069 + 0070 + 0071) covers three properties of the notebook data
  layer and nothing else: **RLS isolation** (a student cannot read a classmate's
  `notebook_entries` / `notebook_entry_photos` by listing OR by id, while the
  section's instructor and the admin/chair tier can, and an instructor's reach
  stops at their own section), **no direct writes** (INSERT / UPDATE / DELETE on
  either table is rejected `42501` for a student, an instructor AND an admin --
  the SECURITY DEFINER RPCs are the only door), and **flag integrity**
  (`notebook_add_photo` onto a flagged entry lands on `pending_review`, retains
  `flag_reason` and the instructor comment, and adds a NEW photo row without
  touching the flagged one). Drive naming, label fallbacks and the section
  grid's shape are feature correctness and are deliberately NOT here; adding
  them would dilute what a red run means.
- **`tests/notebook-photo-route.test.ts`** (11 assertions, same fixture) drives
  the REAL `/api/notebook/photo/[photo_id]` handler -- imported from the route
  file, not reimplemented -- against real policies. It covers the owner (200 +
  the exact bytes), **a different student (404)**, that student's identical
  answer for a real id and an imaginary one, the section instructor (200), a
  DIFFERENT section's instructor (404), the chair tier (200), denial in both
  directions, no session (401), a malformed id (404 without touching the
  database, enforced by a client that throws if used), and an authorized
  caller whose Drive fetch fails (502, not 404). Only PostgREST's wire format
  is shimmed, translated to the equivalent SQL under `asUser`; the shim
  ASSERTS the table, columns and filter it was handed, so a change to the
  route's query fails the file loudly instead of quietly testing something
  else. Drive is a local mock server via the exported `DRIVE_ENDPOINTS`.
- **`tests/notebook-entry-photo-rule.test.ts`** (9 assertions) pins 0075's
  conditional: the free tier accepts a label with NO photo (0 photo rows,
  `photo_id` null) and the fully-unlabeled-but-photographed 0071 case, while
  the SESSION tier still rejects a photo-less entry -- with or without a
  label -- and leaves nothing half-made. It also asserts there is still
  exactly ONE `notebook_create_entry` in `pg_proc` (a defaulted parameter
  must not leave a second overload, unlike 0068's ADDED one) and that
  `notebook_add_photo` gives an entry with zero photos `sequence_order` 1 and
  the next one 2. It earns its place because this rule spans two tables, so
  no constraint enforces it and an inverted branch would look exactly like a
  working notebook until someone tried to grade an empty check-in.
- **`tests/notebook-note-route.test.ts`** (7 assertions) drives the REAL
  `/api/notebook/note` POST handler against the real RPC. The shim forwards
  the route's OWN argument object verbatim into a named-parameter SQL call
  and asserts only the function NAME, so the route cannot pass by sending
  something the database would have refused. Covers the happy path (0 photos,
  1 note, correct `student_id`, null session), a note with no title, **401
  with no session and not one row written**, the empty-note refusals
  (including a title with no content, since 0078 narrowed `custom_label` to a
  title), the SANITIZER end to end (a body carrying a `javascript:` link, a
  heading and an image stores exactly two plain paragraphs), an optional
  section, and the input gates. It exists because the auth check, the argument
  object and the normalize call are all easy to break with no symptom for the
  signed-in developer testing it.
- **`tests/notebook-notes.test.ts`** (32 assertions, 0078) is the written-note
  layer's own suite, and every guarantee in it fails SILENTLY: a note that can
  be edited on a scheduled check-in still saves, still renders, and still looks
  correct to the student doing it -- the only symptom is that reviewed work
  changed after it was reviewed. Covers the three RPCs (entry + first revision
  in one transaction; a titleless note; several notes on one entry over time;
  a note on a check-in ALLOWED while the edit is REFUSED and writes nothing;
  the edit re-allowed once the entry is detached; another student's and the
  instructor's edits refused; `notebook_add_note` leaving a flagged entry
  flagged), the CHAIN itself (three revisions linked by `supersedes_id`, every
  earlier text intact, one `note_id` throughout), the DB content gate against
  15 shapes a caller skipping the route could send, and privileges (no
  insert/update/delete for a student, reads scoped by `notebook_can_read_entry`,
  no `anon` execute grant). Mutation-checked: replacing the session-linked
  raise with a no-op reddens exactly that test, and the migration was restored
  byte-identical.
- **`tests/notebook-note-content.test.ts`** (37 assertions) covers
  `normalizeNoteDoc`, the sanitizer, and needs no fixture -- it is pure. A
  sanitizer's failure mode is invisible: content that should have been stripped
  and was not looks completely normal to whoever wrote it and only becomes a
  problem in an instructor's browser later, so there is nothing to eyeball in a
  harness. The point of most cases is not "this attack is blocked" but "this
  input cannot produce a node type the renderer does not know", since the
  renderer walks the result into real elements and never interprets it as
  markup. Mutation-checked: dropping the `safeHref` call reddens 9 of them, and
  the module was restored byte-identical.
- **`tests/notebook-photo-mime.test.ts`** (5 assertions) is the one file here
  that needs NO fixture -- it is pure, and covers the upload routes' media-type
  allowlist. It is kept, against this repo's default, because the camera fix
  WIDENED what the server accepts: `File.type` is legitimately empty for HEIC
  off an iPhone (the File API requires that), so keying the allowlist on the
  declared type alone silently refused real camera photos, and the fix
  consults the filename instead. The refusals are therefore the half that
  earns its place -- a pdf and an extensionless file are both still rejected,
  and the size cap still fires. Mutation-checked BOTH ways: making the
  extension fallback accept anything reddens the refusal test, and removing
  the fallback entirely (the pre-fix behaviour) reddens the two acceptance
  tests, with the file restored byte-identical afterwards.
- **`tests/notebook-folders.test.ts`** (28 assertions, the notebook chain plus
  `0088`) covers exactly three things, each of which fails SILENTLY: whose
  folder an entry can be filed into (the COMPOSITE foreign key, asserted with
  RLS out of the way entirely -- running as the connection owner, so nothing
  but the key itself can refuse it), who can read a folder NAME (staff only
  through an entry they can already read, so an empty folder is invisible and
  unfiling the last entry withdraws it again), and the OVERLOAD TRAP on the two
  creating RPCs that gained a parameter. Deliberately NOT covered: which folder
  the picker defaults to, how the rail counts, what search matches -- pure
  functions and a dev harness, and pulling them in would dilute what a red run
  means. Mutation-checked BOTH ways: degrading the composite FK to a plain
  `(id)` reference reddens 2 tests, opening the staff read policy to
  `using (true)` reddens 5; migration restored byte-identical. It also asserts
  the file RE-APPLIES cleanly over its own objects, which is the one guarantee
  here that broke in the field rather than in review.
- **`tests/notebook-session-postings.test.ts`** (34 assertions) is the
  migration-over-real-data suite for `0098`: it boots the chain SHORT OF that
  file, seeds the OLD single-section shape through the REAL pre-0098 RPCs, and
  applies the real file over the top (the `0085`/`0095`/`0096` two-halves
  shape). What earns its place is what fails SILENTLY -- a migration that
  quietly re-created a check-in or dropped an entry's link to one looks exactly
  like a working notebook, and unposting a class that destroyed that class's
  work would be found weeks later. Mutation-checked FOUR ways, both directions
  (see that section above).
  **NOTE ON THE SHARED CHAIN:** `0098` is IN it, so every notebook suite seeds
  the current shape -- but `notebook-classroom-sections.test.ts` deliberately
  filters it back out, because that file is about what `0094` did at the moment
  it ran and re-executes `0094`'s own file at the end.
- **`tests/notebook-view-as.test.ts` (21 assertions)** covers `0099`'s
  admin-only, read-only notebook preview: who may run it, that the payload is
  that student's OWN notebook rather than an instructor-shaped slice of it, and
  that read-only is STRUCTURAL -- exactly one `notebook_view_as%` function in
  `pg_proc`, and it STABLE, so a write RPC added to the family fails a test
  rather than passing review. Mutation-checked both ways: dropping the
  `is_admin()` guard reddens 8, making it always refuse reddens 14. See "The
  notebook, surfaced inside IDEA Classroom" above.
- **`tests/notebook-page-load.test.ts` (11 tests) is the only suite here that
  can see a STALE POSTGREST EMBED, and it exists because none of the others
  could.** A select string names embedded resources, PostgREST resolves them
  against foreign keys, and a migration that repoints a key invalidates one with
  no compile-time signal anywhere -- which is how `/notebook` came to report the
  notebook tables missing on a fully-migrated database. Every SQL-level suite
  stayed green through it and HAD to: SQL does not need a foreign key to join
  two tables. So `tests/db/postgrest-shim.ts` resolves embeds the way PostgREST
  does, against the real catalog, and answers PGRST200 when no key relates the
  two tables; the suite drives the REAL page load through it against the full
  chain and against a database with genuinely no notebook tables. Its cheapest
  and most durable assertion needs neither: every table embedded in the shipped
  select strings must have a real relationship to its parent. Mutation-checked
  both ways (7 red reproducing the original bug, 3 red for a stale embed on one
  rung). See "The student notebook's availability check" above.
- **`tests/coin-public-medium.test.ts` (11 tests)** covers `0103`'s one
  silently-failing guarantee: a payout moved coins between two media the same
  student already held, so it is neither income nor spending. The trap worth
  remembering is that the page's own `awarded - fines - spent` reconciliation
  landed on the RIGHT total the entire time the two components were wrong,
  because the inflation cancels -- the arithmetic a reader would check it with
  agreed with the bug. Mutation-checked both ways; see "The coin display layer"
  above.
- **`tests/coin-public-adjustments.test.ts` (12 tests)** is that same failure
  mode a second time, and this one was an EXPLOIT: a refund counted as an
  earning on a board whose default sort ranks by earnings. Its fixture is the
  REAL archive imported through the REAL `0100` RPC plus the three real
  refunds, and it asserts all six figures for each of the three students
  production was measured on -- one of whom has a withdrawal and NO adjustment,
  so `0103`'s exclusion and `0107`'s are shown to compose rather than to
  overlap. Mutation-checked three ways; see "Adjustments are their own bucket"
  above.
- **`tests/coin-legacy-reimport.test.ts` (25 tests) is the one suite here whose
  FIXTURE IS REAL COMMITTED DATA, and it exists because its predecessor passed
  while being wrong.** It parses the two archived CSVs
  (`docs/coin-economy/archive/2026-08-11-*.csv`) into the snapshot shape,
  imports them through the REAL `0100` RPC, and asserts every student's physical
  and digital balance against the SHEET'S OWN two balance columns -- the one
  expectation the import does not produce. `0084`'s check compared the import's
  sum against a restatement of the import's own sign rule and so reported 0
  mismatches while ~474i&cent; of physical coins were being digitized. **When
  adding a test here, the question to ask is not "does this pass" but "where
  does the expected value come from".** Mutation-checked five ways; see "The
  legacy import, redone with media (`0100`)" above. Reading fixture data out of
  `docs/` is fine and is NOT a reintroduction of the retired system: those CSVs
  are data, and nothing in the archived `legacy-system/` code is imported.
- **One assertion exists purely to keep the rest honest:** the suite asserts
  that `instructorA` and a plain `@boscotech.edu` account are NOT admins. Given
  0067's naming trap, if `teacher` ever silently re-acquired privilege every
  "an instructor cannot see other sections" assertion would still pass while
  meaning nothing.
- **Mutation-checked, not just green.** Sabotaging the "students read own
  notebook entries" policy in 0069 turns the suite red and restoring it turns it
  green (verified, migration restored byte-identical). Worth knowing for the
  next time: **commenting the `USING` clause out entirely fails CLOSED** (the
  policy then grants no rows, 1 test red) -- the mutation that models the real
  regression is `using (true)`, which reproduces an actual leak and reddens 4
  isolation tests, including the unattached staff account suddenly seeing every
  student's work. Mutate in the permissive direction when checking this suite
  still bites. `notebook-photo-route.test.ts` was put through the same
  exercise, and it found something worth keeping: opening EITHER policy leaves
  that file fully green, because the route's two hurdles are independent --
  only opening BOTH reddens its 5 denial assertions (verified, then the
  migration restored byte-identical). See the notebook UI section.
  `notebook-entry-photo-rule.test.ts` was mutation-checked too, in ITS
  permissive direction: deleting 0075's session-tier "a Drive file id is
  required" raise turns exactly the two session assertions red and nothing
  else (verified, then the migration restored byte-identical).

