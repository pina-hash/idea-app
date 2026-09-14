---
title: "Ledger 0264: the IdeaCAD chooser becomes a front door, and three of its seven asks turn out to need a migration"
date: 2026-09-14
branches: [claude/laughing-archimedes-y0lh8j]
migrations: []
subsystems: [ideacad, chooser, verification]
---

`/ideacad` opens on the chooser, so it is the first screen anybody using IdeaCAD sees,
and it had never been measured at any width. This lane rebuilt it: cards that say what a
document IS, an owner line on other people's work, narrowing that survives thirty rows, a
composed empty state, a refusal that reports the server's own sentence, and a command bar
speaking the editor's design language. It also found that three of the seven things it
was asked for cannot be built without a migration it was not permitted, and says below
exactly why, so the next session starts from the schema rather than from a retry.

## What could not be built, and why it is structural rather than missing

The prompt asked for rename, duplicate and delete from the chooser. Against `0201`'s
schema, with no migration available:

* **Rename.** `ideacad_documents` HAS NO NAME COLUMN. A document's title is
  `classroom_items.title` -- the teacher's assignment title, shared by every student in
  the class -- so "renaming a document" from this screen would rename the assignment for
  everyone in it. The renameable unit inside IdeaCAD is `ideacad_concepts.name`, and
  `ideacad_update_concept_meta` renames it from inside the editor.
* **Duplicate.** `unique(item_id, student_email)` on `ideacad_documents` makes a second
  document on one assignment IMPOSSIBLE BY CONSTRUCTION. A duplicate would have to be a
  second assignment. Duplicating a CONCEPT is the available shape and is
  `ideacad_new_concept`, again inside the editor.
* **Delete.** There is no delete path of any kind and that is deliberate: Mr. Pina's
  decision 29 of 2026-09-13 is A DOCUMENT IS ARCHIVED, NEVER DELETED, and `0213`'s census
  refuses to remove a student who has IdeaCAD work at all.

**Archiving IS shipped, which is the honest half of that third ask.**
`ideacad_set_document_archived` already exists, it is exactly "a removal that confirms and
says what will happen", and it is an instructor's deliberate act -- the function's own body
asks `_classroom_manages_item` before it does anything. The chooser offers it on the rows
where the caller manages the assignment and on no others, behind a two-step inline confirm
whose sentence names the owner, the document and the real concept count and then says
**Nothing is deleted** -- which is the opposite of what a reader expects from a control in
that position, and is the whole reason the sentence exists. The Restore confirmation
carries the one consequence that is NOT reversible: `0214` deletes the document's class
grants in the same statement and re-archiving does not bring them back.

**No phantom controls were drawn for the other two.** A control whose only possible
outcome is a refusal must not be offered, so Rename and Duplicate are absent, and both
browser specs assert the three words are absent from the page as a `mustNot`.

The reasoning lives in `src/lib/ideacad/app/types.ts`'s header rather than only here,
because a session reaching for one of the three will open that file and not this one.

## Two defects found on the way in

**The documents read could return NOTHING on a real deployment, silently.** The load
filtered `.is('archived_at', null)`, and `archived_at` is `0214`'s column. PostgREST
rejects a filter naming an unknown column and fails the whole select, so on a deployment
sitting between 0213 and 0214 -- a real state, since every migration here is applied one
file at a time by hand -- the read answered nothing and the chooser told a student with a
term of work that they had no documents. It is a ladder now: the wide rung asks for the
column, the narrow rung does not, and the archive flag is the capability that reports
itself (without `0214` nothing can be archived, so every row's `archivedAt` is null, which
is the truth on that deployment rather than a guess).

**AND IT WOULD HAVE FAILED OUTRIGHT FOR THE PERSON WITH THE MOST DOCUMENTS.** The
thumbnail and tally reads take a list of document ids, PostgREST puts an `in` list in the
QUERY STRING, and a manager running five IdeaCAD assignments across four sections
legitimately reads several hundred documents -- a few hundred uuids is tens of kilobytes
and the request comes back 414 with the whole read lost. That was found by re-reading this
lane's own diff adversarially rather than by anything failing, and it would have surfaced
only after a year of use, as a chooser answering "no documents" to the one person with the
most of them. The reads are chunked at 100 ids now (`IN_CHUNK`), issued together, with an
errored chunk costing a thumbnail or a tally and never the list. Capping the read with a
`limit` was the rejected alternative: it makes the search and the filters describe a
window rather than the list, so a document that is simply old becomes unfindable with
nothing on screen saying why.

**A manager's chooser was N identical cards.** `_ideacad_can_read_document` admits the
manager of an assignment, so a teacher's list legitimately contains every student's
document on every IdeaCAD assignment they run -- and every one of them carried the same
title, because the title is the assignment's. The load projects `student_email` and
decides `isOwn` server side against `claims.email`; `ideaCadOwnerLabel` draws the address
on somebody else's work and returns NULL for the caller's own, which renders nothing. Both
directions are asserted, because dropping the line makes a manager's list unreadable and
adding it makes a student's list thirty rows of their own address.

## The load-bearing decisions

**THE REFUSAL IS NEVER GENERALISED, AND THERE IS NO FRIENDLY DEFAULT TO FALL BACK ON.**
The prompt carried the measurement: a chooser reported "This document could not be opened"
over the database's "Only a student enrolled in this class can work on this assignment",
and the two sentences point at completely different next actions. `ideaCadOpenRefusal`
hands back what the server said, adds `details` and `hint` when a raw PostgrestError
reaches it, and -- where there genuinely was no text -- says SO, in words, and shows
whatever code there was. There is deliberately no sentence describing the failure, because
such a sentence is indistinguishable on screen from a correctly reported refusal, so
nobody ever finds out the real message was available and dropped. The empty-message case
mattered more than it looked: the old `refusal = ''` rendered as NOTHING beside its
`{#if}`, which is a press that silently does nothing.

**AND IT RENDERS IN THE CARD THAT WAS PRESSED.** The first draft of this lane put the
refusal in a panel at the top of the chooser, which on a list of thirty is a sentence
about a row the reader can no longer see. The refusal carries the key of the control that
produced it, the card renders it, and the top-of-list panel survives as the FALLBACK for
exactly one case: a search or a filter typed after the press, which would otherwise take
the sentence off screen with the card. That path is measured rather than argued -- see
the third browser spec below.

**THE PREVIEW'S INERT CLIENT TURNED OUT TO BE A REFUSAL FIXTURE.** The harness page hands
`IdeaCadApp` a `{}` where a `SupabaseClient` goes, so clicking a card genuinely throws
inside the real store on the real path. `ideacad-preview-chooser-state-refused.mjs` clicks
one and reads what lands on screen: **"Competition blade study / supabase.rpc is not a
function"** -- the runtime's own sentence, verbatim, in the card that was pressed, with
every generic this path has ever produced asserted absent as a `mustNot`. Nothing about
that sentence was planted by the spec, which is what makes it evidence.

**THE THUMBNAIL IS THE PROFILE, DELEGATED TO `profilePolyline`.** A card draws the
active concept's revolve stations, which is the shape a student actually authored, needs
no WebGL context per card in a grid of thirty, and is two numbers per station. It projects
through `ProfilePreview`'s own `profilePolyline` rather than a second copy, because a
thumbnail that drifted would draw the same part two ways on two screens with nothing able
to compare them. `ideaCadProfileSketch` JUDGES NOTHING -- whether a tree is legal is
`validateBladeTree`'s question, asked when the document opens -- so anything it cannot read
answers null and the card says NO PROFILE rather than drawing a picture of a part nobody
is going to get.

**`all` KEEPS THE ARCHIVED ROWS, CHIPPED.** Hiding them makes the archived count
unreachable from the default view and leaves a reader unable to tell a document that is
not there from one that is filtered out.

**EVERY SORT IS TOTAL.** Thirty documents on one assignment share a title exactly and two
saved in the same second share a stamp, so every comparator falls through to the document
id. A list that reshuffles between two renders is one a reader cannot point at.

**THE COUNTS ARE TAKEN OVER THE WHOLE LIST, NEVER THE NARROWED ONE.** Computing them
after the filter leaves every inactive tab reading 0 and looks entirely plausible.

**THE CONTROLS APPEAR AT SIX ROWS** (`IDEACAD_CHOOSER_CONTROLS_AT`). Below that a filter
row over two cards costs a reader more than it saves, and "Shared with me" beside a list
with nothing shared in it is a control whose only outcome is an empty list. The number is
a judgement, not a measurement, and is written down once so the component and its test
read the same one.

**`now` IS READ ONCE AND THREADED.** A component that reads its own clock per row
silently disagrees with the ordering beside it, and a label that cannot be given an
instant cannot be asserted at one either. It is deliberately not live: a chooser whose
timestamps tick is a list that redraws under somebody reading it.

**THE MANAGER PROBE IS ASKED ONLY WHERE ITS ANSWER CAN CHANGE WHAT IS DRAWN.**
`_classroom_manages_item` is not a question a browser can ask and no read this page makes
projects it. `ideacad_archive` IS that question -- it raises for anyone who is not a
manager -- and it writes nothing, so it doubles as the probe. It is asked only for items
carrying a document the caller does not own, which is the only population where archiving
is on the table: a student owns every document in their own list and makes zero extra
round trips. It fails closed, so a pre-`0214` deployment, a refusal and any other error
all leave the control ABSENT rather than present-and-refusing.

**THE PURE LAYER WENT INTO `app/types.ts` RATHER THAN A NEW MODULE BESIDE IT.** The
ledger's grant named two files in `app/` by name rather than the directory, so a third
file would have been outside it. `types.ts` is now that subsystem's plain-data-and-
arithmetic module and says so in its header. A later lane holding a wider grant should
feel free to split it; nothing about the code depends on the two living together.

## What was measured

* **`npx svelte-check` on the merged tree: 0 errors, 37 warnings in 20 files, mix 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class` --
  which is EXACTLY what CLAUDE.md's verification line states.**
* **AND THE INTERESTING PART IS THAT THE BRANCH POINT DID NOT MEASURE THAT.** The
  baseline was re-derived in a clean `git worktree` at `eabed62`, because a baseline
  measured on the tree under test is not a baseline, and it came back **2 errors, 37
  warnings in 22 files** -- the errors `src/lib/ideacad/viewport/picking.ts:80`
  (`Vector2Like` not assignable to `Vector2`) and `tests/ideacad-tree-ops.test.ts:51`
  (`'body' is possibly 'undefined'`). This entry said, for several hours, that CLAUDE.md's
  line was stale on both counts. **It was not: the LANE was behind.** `origin/main` had
  already fixed both, and merging it took this tree to 0 / 37 / 20 and turned the five
  `tests/dom/ideacad-ui-mount.test.ts` failures and the `tests/ideacad-tree-ops.test.ts`
  one green with no change of this lane's. The lesson is not about those two errors, it
  is about the instrument: **a baseline taken at a branch point is a statement about the
  branch point and NOT about `main`**, and a lane that reports "CLAUDE.md is stale" on the
  strength of one is doing the same thing the six previous drift corrections warn about,
  in the opposite direction -- reading a number rather than measuring against the tree the
  claim is about. Re-measure against `origin/main` before saying that line has drifted
  again.
* **`npm test` at the branch point: 9161 passed, 7 failed, 6 skipped, against a baseline
  of 9120 passed / 7 failed / 6 skipped measured before any change** -- the same seven,
  none of them this lane's. **Six of those seven are gone on the merged tree**: `main`'s
  fixes take the five `tests/dom/ideacad-ui-mount.test.ts` failures and the
  `tests/ideacad-tree-ops.test.ts` one green, leaving the migration-tooling three
  (`apply-migration-guard`, `apply-migration-trace`, `db/migrations-applied-record`),
  which are about applied state this container cannot reach. Counted off the summary line
  and never off the exit code, which was 0 on every run that had failures in it.
* **41 new assertions**, 32 pure (`tests/ideacad-chooser.test.ts`) and 9 over a real SSR
  render of the real component (`tests/ideacad-chooser-render.test.ts`). Every absence
  claim carries a positive control on the same fixture, so a zero can never be a page that
  failed to render.
* **`npm run verify:browser`, three new specs, 375px and 1440px: 140 measurements, 0
  outside threshold**, 0 console errors, 0px horizontal overflow at every width.
  Contrast is measured against the REAL card ground and not the page plate -- the owner
  line 7.29:1, the meta line 7.29:1, the DOCUMENT code line 7.93:1, the Archived chip
  6.36:1, a filter tab 7.27:1, the profile polyline 16.19:1 against a 3:1 floor because
  it is a graphical object. Tap targets at 44px with no 24px relief claimed, because a
  student picking their own document is a student-facing surface at every width.
* **The browser pass earned its place on the first run**: "Exit to IDEA" measured
  **41.8 x 51 at 375px** -- tall enough and too narrow, which a height-only floor cannot
  see, caused by this lane's own mobile rule trimming the padding and swapping the label
  for "Exit". The floor is a `min-width` as well as a `min-height` now and it measures
  44.0 x 51.
* **Mutation proof, six mutants, all KILLED, every restore md5-identical:** a generalised
  refusal (5 failed), counts over the narrowed rows (1), an owner line on the caller's own
  rows (1), the name sort's tie break dropped (1), a one-station tree accepted as a
  thumbnail (1), and `canArchive` ignored on the real component (1). The script copies the
  file into memory and restores from that copy -- never `git checkout --`, which is a
  discard-to-HEAD -- concatenates stdout and stderr before looking for the summary, and
  treats a missing summary as an instrument failure rather than a pass.

## What was NOT verified

* **Nothing was run against the live Supabase project.** This container cannot reach it;
  the `.env` used for the sync and the browser pass is the placeholder project. So the new
  `ideacad_archive` probe, the archive and restore round trips, the select ladder's narrow
  rung and the `claims.email` projection are verified against the schema as committed and
  against the pure layer, and not against production data.
* **No signed-in surface was driven.** `/ideacad` itself needs a Bosco Tech Google
  session; what was measured is `/ideacad/preview/chooser`, which mounts the identical
  `IdeaCadApp` with an inert client. `/dev/login` against a local stack was not run.
* **`prefers-reduced-motion: no-preference` throughout**, and web fonts do not load under
  the harness (`fonts.googleapis.com` is blocked), so every text measurement above is in
  the fallback stack.
* **The two-step confirm was never PRESSED in a browser.** Its armed state is asserted
  absent on the first frame and its sentences are pinned by text; what a click does is
  proven only by the code path. The OPEN press IS driven, in
  `ideacad-preview-chooser-state-refused.mjs`, so the refusal path is measured end to end
  and the archive path is not.

## Deferred

* Rename, duplicate and a student-facing removal all need a migration. If they are wanted,
  the shapes are: a `name` column on `ideacad_documents` defaulting to the item title; a
  relaxation of `unique(item_id, student_email)` plus a copy RPC; and an owner-scoped arm
  of `ideacad_set_document_archived`. Each is a decision for Mr. Pina before it is a
  migration, and the third contradicts decision 29 as it currently stands.
* The chooser's filter and sort are not remembered between visits. `profiles.preferences`
  already has an `ideacad` namespace (this page writes `panes` into it) and
  `ideaCadChooserFilterFrom` / `ideaCadChooserSortFrom` already drop an unrecognised stored
  value, so the reader half is built; only the write is missing.
* IdeaCAD's harness routes live under `/ideacad/preview/` rather than `/dev/`, so these are
  the first two browser specs in the repository whose path is not `/dev/*`. Every property
  the convention stands for holds (dev-only 404, no session, no Supabase, the real
  component), but moving the routes is a lane with a wider grant than this one had.
