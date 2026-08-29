---
title: "Digital notebook (written notes, `0078`)"
date: 2026-08-10
branches: []
migrations: ["0078"]
subsystems: ["Digital notebook"]
record_order: 25
---

A note is real content now, and an entry is something a student keeps ADDING
to rather than something they file once. Migration
`0078_notebook_entry_notes.sql` (apply manually after 0077).

- **WHAT THIS REPLACED, and the narrowing that came with it.** 0075 opened a
  "just write a note" tier with nowhere to put the writing: the note went into
  `notebook_entries.custom_label`, a 200-character column whose job is to
  TITLE an entry. **`custom_label` is a short title again and nothing else** --
  the column, its 200-char CHECK, the Drive-filename fallback, the admin
  override's relabel and the delete-session backfill are all untouched; what
  changed is what the app PUTS there. The note route no longer accepts a
  label-only entry, and a titleless note is now the ordinary case (`entryTitle`
  gained a fallback to the first note's opening words, so an untitled note
  entry names itself instead of reading "Untitled entry").
- **ONE ROW PER REVISION, NEVER AN UPDATE.** Editing INSERTS a row that
  supersedes the old one; the old text stays exactly as written. There is no
  UPDATE or DELETE grant or policy on `notebook_entry_notes` at all. This is
  the append-only discipline the rest of the schema already runs on
  (`coin_transactions` has no mutable balance, `tournament_match_events` is
  insert-only, `notebook_entry_photos` only ever gains rows) applied to the one
  kind of content a student can change after an instructor has read it.
- **The chain: `note_id` + `revision`, with `supersedes_id` as the readable
  statement of the same fact.** `note_id` is the LOGICAL note's identity -- the
  id of its own first revision, a self-reference, so a note's identity survives
  every edit and `notebook_edit_note` takes it rather than "whichever revision
  is current". `unique (note_id, revision)` is the SAME shape
  `notebook_entry_photos` already uses for `unique (entry_id, sequence_order)`,
  and it makes "the current text" a plain max() rather than a flag anyone has
  to maintain -- so two concurrent edits collide on the constraint instead of
  silently losing one. `supersedes_id` points at the exact row a revision
  replaced and is UNIQUE, so a chain can never fork; two CHECKs keep the two
  representations agreeing (revision 1 <=> no predecessor <=> `note_id = id`).
  **Which revision is current is DERIVED, never stored** -- no `is_current`
  column, no view: `noteThreads()` groups the rows every surface already
  fetches (they all show the history too), the `coin_balances` /
  `coin_contract_status` convention.
- **ORDER IS BY FIRST REVISION.** Editing a note keeps its place in the entry
  instead of jumping it to the end, so an entry added to over weeks reads as
  one chronological record rather than a list reshuffled by whichever note was
  touched last.
- **EDITING IS REFUSED OUTRIGHT ON A SESSION-LINKED ENTRY, IN THE RPC.** A
  scheduled check-in exists because an instructor asked for it and reviews what
  arrives; rewriting it afterwards would change what was reviewed. A free-form
  entry is a personal record and stays editable, with its history kept
  regardless. `notebook_edit_note` raises on it; the UI renders no edit control
  there, but that is the courtesy, not the rule (the platform rule that nothing
  gradeable is gated client-side only). Detaching a session makes the entry
  free-form and its notes editable again -- the restriction is about what the
  entry IS, not a permanent brand on the note. **Adding** a note to a check-in
  is fine and offered; only editing one is not.
- **CONTENT IS A TYPED DOCUMENT, NOT HTML, and that is a security decision.**
  `content` is jsonb holding the closed shape in `src/lib/notebook-notes.ts`:
  an array of blocks (paragraph / bulleted list / numbered list) whose leaves
  are text runs carrying at most bold, italic and an http/https/mailto link.
  Storing sanitized HTML and rendering it with `{@html}` would make the
  sanitizer the only thing between a student's writing and an instructor's
  browser; **there is no `{@html}` anywhere in the note path.**
  `NoteContent.svelte` walks the document into real Svelte elements (which
  escape text by construction) and re-runs `safeHref` at render time, so a note
  that reached the database some other way can only ever be text.
- **THREE GATES, because the first one is not a boundary on its own.** (1)
  `normalizeNoteDoc` in `$lib/server/notebook-notes.ts` -- SvelteKit refuses to
  bundle `$lib/server` into client code, so there is no build where the
  browser's copy is the one enforcing anything. It is a whitelist TRANSLATOR,
  not a stripper: the result is BUILT from the node types it names, so an
  unknown one cannot survive into it. A block it does not know is flattened to
  a paragraph and an unsafe link keeps its TEXT and loses its href -- the
  student's words are theirs either way. (2) `_notebook_note_content_ok` in
  SQL, because these RPCs are granted to `authenticated` like every other
  student write and a caller can reach them through PostgREST without going
  near the route: unknown block types, unknown keys, non-text runs, non-http
  links and anything past 20,000 characters are all rejected there. (3) the
  renderer above.
- **EDITOR: Tiptap 3** (`@tiptap/core` + `@tiptap/pm` + `@tiptap/starter-kit`,
  3.29.2, added as runtime dependencies). Picked over the alternatives because
  it is the one option that is both genuinely maintained and genuinely
  CONSTRAINED: it is not a contenteditable wrapper handing back whatever the
  browser produced, it is a ProseMirror schema, so the document can only
  contain node and mark types `NoteEditor.svelte` switched on. StarterKit is
  configured with everything out of scope OFF -- headings, blockquotes, code,
  code blocks, horizontal rules, strike, underline, hard breaks -- leaving
  exactly bold, italic, both list kinds and links. It is framework-agnostic, so
  Svelte 5 needs no wrapper (`svelte-tiptap` v3 exists and does support Svelte
  5, but everything it adds is bubble/floating menus this fixed toolbar does
  not want, i.e. a dependency for nothing). Dynamically imported, browser-only,
  on mount: ProseMirror is the heaviest thing on the page and no other notebook
  surface should pay for it. It hands back ProseMirror JSON, not HTML -- the
  server translates. `npm audit` shows the same 7 pre-existing advisories as
  before; none are Tiptap's.
- **RPCs.** `notebook_add_note(entry, content)` and
  `notebook_edit_note(note, content)` are the two the feature is about, plus
  `notebook_create_note_entry(content, title?, section?)`. **The third exists
  because 0075's rule is that a free-form entry needs a photo or a label**, and
  a titleless note satisfies neither -- so create-then-add would either be
  refused or force this migration to relax a rule it has no quarrel with. As
  one function the entry and its first note are one transaction, so a failed
  note cannot strand an empty entry in the feed. `notebook_add_note`
  deliberately does NOT touch entry status, unlike `notebook_add_photo`, which
  flips a flagged entry to `pending_review`: a flag asks for a PAGE ("not
  dated", "hard to read"), and a note is not a page.
- **Routes:** `/api/notebook/add-note` and `/api/notebook/edit-note` (named to
  match `/api/notebook/add-photo`), and `/api/notebook/note` reworked -- it
  takes `content` now, `custom_label` is an optional title, and `session_id` is
  gone from its contract (a note entry is free-form by definition; to write a
  note about a check-in, add one to that entry). All three 401 without a
  session and run their RPC under the caller's own cookie session.
- **PhotoStager.svelte: the capture flow was EXTRACTED, not copied.** An entry
  you can keep adding to needs the identical picker/screening/correction/
  thumbnail flow from a second place (the entry's own panel), and duplicating
  the Android capture-path decision, the empty/truncated-file screen, the
  one-at-a-time correction queue and the blob-URL bookkeeping is exactly the
  kind of duplicate that quietly stops matching. It moved out of
  `NotebookView.svelte` verbatim and both callers mount it. The one thing it
  does NOT do is read the pending-capture marker it writes: a page can hold
  several stagers and only one reader can consume a marker that clears itself,
  so NotebookView stays the single reader and decides where the student lands
  (a marker carrying an `entryId` reopens that entry's panel).
- **UI.** Notes render under an entry's photos via `EntryNotes.svelte` (the
  student feed and the instructor panel mount the same component, the
  NotebookPhotos convention); each entry carries "Add photos" / "Add a note"
  controls that open an inline panel; an edited note shows "Edited <when>" plus
  a disclosure listing the genuine earlier rows with their own timestamps --
  not a silent "edited" tag over an overwrite. `EntryReview.svelte` renders the
  same block read-only. **Save is disabled on an unchanged edit** (compared
  against the document the editor itself serialized at mount, via `onready`, so
  a harmless normalization cannot read as a change): minting a revision
  identical to the one it replaced would make a note say "Edited" with an
  earlier version that says the same thing, which is noise in the one place an
  instructor goes to see what changed.
- **Fail-soft is per-migration, not per-page.** On a project with 0069 applied
  and 0078 not, PostgREST rejects the whole entry select for an unknown
  relationship -- which would blank a notebook full of perfectly readable
  photos. Both loads drop the notes embed and retry, and `notesReady` turns the
  note half off with an explanation while photos keep working. Migrations here
  are applied by hand, so a deploy sitting between two of them is a real state.
- **Two real bugs found in the browser, neither visible to `svelte-check`:**
  (1) the toolbar's active states never updated -- the first cut derived them
  from a counter bumped on every transaction, and a sentinel dependency sitting
  next to a NON-reactive read (the editor's selection) is exactly the kind of
  indirection that looks correct and is not; the states are pushed from
  Tiptap's own `onUpdate`/`onSelectionUpdate`/`onTransaction` now. (2) Save was
  enabled on an untouched edit, because Tiptap emits an update at mount.
- **Verified** in `/dev/notebook` and `/dev/notebook-review` (404 in
  production, no auth/Supabase/Drive), with the REAL sanitizer behind a
  dev-only `/dev/notebook/normalize` endpoint so the harness stores what the
  real routes would store rather than re-implementing normalization: a
  long-idle entry seeded with notes written 20 days apart (one already revised
  twice) renders as ONE entry with its notes in written order, "2 earlier
  versions" expanding to the genuine prior text and timestamps; a real edit
  through the real editor kept the note in FIRST place while the other three
  stayed put, stamped "Edited", and grew its history by exactly one version; a
  note added from the entry's own panel landed as a 4th note with the count
  chip updating; a new free-form entry saved with a BLANK title posted
  `custom_label=null` and named itself from the note's opening words; the
  session-linked entry showed 1 note, 0 edit controls and the "cannot be
  edited" hint while still offering "Add a note"; bold/italic/list/link all
  round-tripped through the real normalizer into the real renderer
  (`<ol><li>...<strong>...`); Save was disabled untouched, enabled after
  typing, and disabled again after undoing back to the original; the
  0078-unapplied toggle hid the note mode and every add-note control while
  photos and existing entries kept rendering; the instructor panel showed the
  same note read-only with its history and the review form intact; the grid's
  six cell states, glyphs and completion counts were unchanged; all three note
  routes answered 401 signed out; no horizontal overflow at 375px with 44px
  toolbar targets; and an armed `window.onerror` caught ZERO errors across the
  full interaction sweep. `npm run check`: 0 errors, no new warnings.
  `npm test`: 153/153. **NOT verified: the live Supabase project** -- 0078 has
  never been applied anywhere (the local `.env` is the placeholder project), so
  the real signed-in round trip is a deploy-then-verify step; the RPCs
  themselves are covered against a real embedded Postgres (see "Automated
  tests").

