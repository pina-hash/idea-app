---
title: "The notebook, surfaced inside IDEA Classroom (`0099`)"
date: 2026-08-13
branches: []
migrations: ["0053", "0099"]
subsystems: ["Digital notebook"]
record_order: 32
---

Migration `0099_notebook_view_as.sql` (apply manually after `0098`) plus three
UI surfaces. The notebook stops being a place you have to already know about:
it is reachable from the class it belongs to, its compliance state is visible
while managing that class, and an admin can look at a student's notebook the
way that student sees it.

### View as student, extended rather than duplicated

**IT LIVES INSIDE THE EXISTING VIEW-AS TREE**:
`/classroom/view-as/[studentEmail]/notebook`. Everything the feature needs was
already there -- the admin 404 gate in the group's `+layout.server.ts` (the
`/admin` rule, so a probe reveals nothing), the `ImpersonationBanner` mounted
once in the `[studentEmail]` layout, and the student picker at
`/classroom/view-as`. A second tree under `/notebook` would have meant a second
guard, a second banner mount and a second picker: three more places for "who may
do this" to drift. **There is no new picker and no new banner**, which is also
why `classroom_view_as_students()` (0083) is untouched.

- **THE GUARD IS `_classroom_view_as_guard` (0083), CALLED, NOT COPIED.** That
  function is signed-in + `is_admin()` + an email-shape check returning the
  normalized address, which is exactly the question this asks too. A
  `_notebook_view_as_guard` would be a second copy of one permission rule, and
  0067's `is_teacher()` naming trap is what a second copy costs. It sits as a
  `declare` INITIALIZER, so `is_admin()` runs before the first statement of the
  body. Test-pinned: `%view_as_guard%` resolves to exactly one function in the
  whole schema, and `notebook_view_as_notebook`'s source names it.
- **ONE function, `notebook_view_as_notebook(p_email)`, and it is STABLE.**
  There is NO notebook view_as write RPC of any kind, so read-only is a property
  of the surface area rather than a discipline. The suite enumerates the
  `notebook_view_as%` namespace out of `pg_proc` and asserts both facts, so a
  second one fails a test rather than passing review -- the same guard 0083's
  own suite puts on `classroom_view_as%`.
- **THE ROUTE TREE IS HANDED NO WRITE TRANSPORTS AT ALL.** Every write prop on
  `NotebookView` is OPTIONAL now, and an omitted one removes the control it
  drives -- right down into each `NotebookEntryCard` (`onAddPhotos` /
  `onAddNote` / `onEditNote` / `onMove` / `onPin` each gate both a control and
  its handler). `readOnly` additionally drops the whole "Add an entry" section
  and short-circuits every handler; it states the intent once rather than
  leaving it to be inferred from six omitted props, but the ABSENCE is the
  mechanism. Browser-measured on the preview: 0 forms, 0 file inputs, 0
  add-photo / add-note / re-file / select / pin controls, 0 note-edit controls,
  0 "Section review" link -- against 1 form and 6 of each on the same fixture
  with transports handed in.
- **IT SHOWS WHAT THAT STUDENT SEES, and one gating rule had to be split for
  that to be true.** `foldersReady` / `pinsReady` mean "the MIGRATION is
  applied", so the folder chip and the pin indicator render from them; whether a
  CONTROL appears is a separate question answered by `onMove` / `onPin`.
  Previously `NotebookView` passed `pinsReady && !!setPinned` down, which in a
  read-only preview would have silently hidden a student's own pins. Measured:
  the preview renders the "Pinned" group, the pinned card styling and every
  folder chip, with **0 pin buttons**.
- **The payload is the student's own reads with the policy's implicit filter
  written out**: their entries (every status, every kind -- a flagged check-in
  entry, a note entry filed in their own folder, a pinned free-form one), their
  photos, EVERY note revision, their folders, their `notebook_entry_activity`
  rows, and the check-ins posted to sections they are ACTIVELY enrolled in.
  Never an instructor-shaped slice. Test-pinned that a class they left and a
  class they were never in are both absent while the admin can read both.
- **`canReview` is FALSE regardless of who the student is**: the "Section
  review" link would be a door out of a read-only preview into a console that
  flags and grades.
- **A roster row with no account is a normal state** (0094's rule): `user_id`
  null, an empty notebook, and their real check-ins waiting -- which is what
  that student sees on first sign-in. The page says so rather than showing an
  unexplained empty feed.
- **NO PHOTO-PROXY CHANGE, deliberately.** 0083 needed
  `classroom_view_as_can_read_attachment` because an attachment an ADMIN may
  read is not always one the STUDENT may read (a draft, another section). Here
  the two sets are identical by construction -- every photo in the payload hangs
  off an entry belonging to the student whose notebook it is, and a student
  always reads their own -- so an `?as=` parameter would narrow nothing and add
  a surface for nothing.

### The class page's notebook link

`ClassPage.svelte` gains ONE presentational prop, `notebookHref`, rendered on
the hero's existing `.section-line` beside the `Manage` link -- that line is
already where the page names the OTHER surfaces a class has, so a new card or
tab would be a second pattern for the same job. `canManage` alone words it
("Notebook review" vs "My notebook"); WHICH notebook it points at is the
caller's, because only the route knows: `/notebook/review?section=<id>` for a
manager, `/notebook` for a student, `${basePath}/notebook` under view-as.
`/notebook/review` accordingly accepts `?section=`, VALIDATED against the
section list that load already scoped, so a foreign id preselects nothing
rather than a grid the RPC would refuse (`ReviewConsole` takes
`initialSectionId`, seeded once and then owned by the picker).

### Notebook compliance on the manage console

A per-section element in the expanded section panel, between **Roster** and
**Posted here**, loaded lazily on open exactly like those two.

- **A SUMMARY, NOT THE GRID, and that is the judgment call.** The grid proper is
  a wide table that scrolls horizontally in its own container, sized for a
  dedicated console, and it earns that width only because every cell is a button
  into an entry-review panel -- which is review work, not "how is this class
  doing". The panel it would sit in is a 52rem column already holding section
  settings, a roster and a content list. So the console answers the question a
  manager has WHILE managing the class and links through for the answer they
  have to act on.
- **It re-derives nothing.** `gridSummary()` (`notebook-review.ts`) tallies
  through the SAME `cellDisplay` and `summarize` the grid itself renders
  through, over the same `notebook_get_section_grid` payload, and the chips read
  their glyph and label straight out of `CELL_STATES`. There is no second grid
  query and no second copy of who may run one -- that RPC asks
  `classroom_manages_section` itself, so a section the console should not show
  is refused by the DATABASE. `SectionGrid.svelte` is untouched.
- Shows students / check-ins / outstanding, one tally per cell state, and a
  disclosure of the students who are behind or flagged (worst first), then the
  link through. `loadNotebookGrid` is an OPTIONAL prop; null omits the element,
  which is the fail-soft state where the notebook migrations are not applied.

### Verified

- **`tests/notebook-view-as.test.ts` (21 assertions)**, the notebook chain plus
  0053 + 0083 (the guard) + 0091 + 0099 on real embedded Postgres. Covers who
  (a student refused even for their OWN notebook, a plain teacher refused
  INCLUDING for their own student, a foreign teacher refused, the pinned owner
  allowed, a **granted** admin allowed and refused again after `admin_revoke` --
  so the check is provably `is_admin()` and not the owner constant, no anon
  EXECUTE, email normalization, a junk address refused rather than probed);
  what (her entries and nobody else's, every kind of her work unfiltered with
  the flag/folder/pin/notes intact, her folders only, her activity rows, her
  check-ins from her own active enrollments while the admin can read four, a
  shared check-in appearing once per class of HERS against twice for a student
  in both, the never-signed-in and never-enrolled cases); and that read-only is
  structural (the `pg_proc` enumeration + STABLE, the guard reuse, and a digest
  of every entry / folder / posting being byte-identical after three previews).
  Plus the file re-applying twice with the guarantees re-checked.
- **MUTATION-CHECKED BOTH WAYS.** Dropping the `is_admin()` guard (replacing the
  call with plain email normalization) reddens **8** tests; making the function
  always refuse reddens **14**. Migration restored byte-identical (md5-checked)
  and re-verified green each time.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **642/642 across 28 files** (was 621/27).
- **Browser-verified** in `/dev/notebook` (a `view as student (read-only)`
  toggle mounting the REAL component the way the real route does -- `readOnly`
  plus no transports plus the REAL `ImpersonationBanner`) and `/dev/classroom`
  (a fixture mirroring `notebook_get_section_grid`'s own payload AND its own
  refusal, plus `notebook migrations applied` / `grid refuses this section`
  toggles): the read-only measurements above; the same fixture with transports
  restored showing the form, 6 add-photo, 6 add-note, 6 re-file, 6 pin and 3
  note-edit controls, with a real pin and a real re-file reaching
  `notebook_set_entry_pinned` and `notebook_move_entries`; the class-page link
  reading `My notebook -> /notebook` for a student, `Notebook review ->
  /notebook/review?section=s-1` beside `Manage` for a teacher, and the
  basePath-rewritten one under view-as; the compliance element tallying
  `4 students · 3 check-ins · 7 outstanding` over `✓4 ⤴1 ○1 !1 E1 –4` (12 = 4x3)
  with the three students needing a look ordered flagged-first and the
  all-clear student correctly absent, the no-check-ins empty state on the second
  section, the RPC's own refusal message rendered IN PLACE with 0 tallies and
  the rest of the panel intact, and the element absent entirely with the
  migration toggle off; `?section=` preselecting for a chair offered both
  sections and falling back for an instructor offered one; and the review grid's
  six glyphs, their colours, Share Tech Mono and the 30.4px (1.9rem) cell box
  all unchanged, table scrolling in its own container. 375/375 at phone width on
  both new surfaces, and an armed `window.onerror` caught ZERO errors throughout.
- **NOT verified: the live Supabase project.** The local `.env` is the
  placeholder project, so `0099` has never been applied anywhere. Apply it by
  hand after `0098` and spot-check with two real accounts that a non-admin
  cannot reach the preview and that what it shows matches what that student's
  own `/notebook` shows.
- **Also not verified: screenshots, and the signed-in round trip.** The Browser
  pane does not composite, so every visual claim above is a measured DOM or
  geometry read; and the 404-for-a-signed-in-non-admin (as against the 303 an
  anonymous visitor gets at the `/classroom` prefix, curl-checked on all three
  view-as depths) needs a real session.

