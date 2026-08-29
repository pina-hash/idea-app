---
title: "The notebook composer gets real autosave (code only, NO migration)"
date: 2026-08-22
branches: []
migrations: []
subsystems: ["Digital notebook"]
record_order: 111
---

### What shipped

The notebook's compose form had **no persistence mechanism at all**. Nothing was
written until somebody pressed Save draft or Turn in, and `beforeNavigate` raised
a `window.confirm` because there was nothing to flush. Typing a paragraph and
clicking an entry in the feed lost it, and the only warning was a question whose
honest answer is always "then save it".

- **`NotebookView` now owns a `SaveState`** (`$lib/save-state.svelte`) with
  autosave on, at the same 800ms debounce the assignment engine uses. No second
  debounce, no sixth hand-rolled persistence pattern.
- **The write goes through the existing draft path** and reuses `savedDraftId`:
  the first write creates the draft entry through `notebook_create_note_entry`
  with `p_submitted` false, and every later one adds to THAT entry.
- **`guardSaveNavigation` replaces the hand-rolled confirm.** A navigation is
  cancelled, the write flushed, the navigation re-issued, and a question is asked
  only when the flush could not land.
- **`save.attach()` supplies the visibilitychange and pagehide net.**
- **`SaveIndicator` sits in the composer's actions row**, per-instance, flipping
  on the acknowledgement and carrying its clock time.
- **Staged photos are deliberately outside it**, and the surface says so in words
  next to the button.

### The load-bearing decisions

- **AUTOSAVE WRITES TEXT AND ONLY TEXT, AND THE DOOR IS ALWAYS THE NOTE DOOR.**
  Staged photos are `File` handles that exist nowhere but in that browser's
  memory: there is no request that carries one without uploading it, and
  uploading on a debounce would push a student's camera roll into Drive a photo at
  a time while they were still deciding which page they meant. Nothing was built
  that LOOKS like it protects them -- they are carried by the navigation guard and
  by the `type: 'leave'` cancel, and the composer states the asymmetry in a
  sentence that changes when something is staged.
- **A TITLE ALONE CANNOT BE WRITTEN, AND THAT IS THE SCHEMA SPEAKING.** No RPC
  creates an entry out of a title: `notebook_create_note_entry` requires content
  that passes `_notebook_note_content_ok`, and `notebook_create_entry` requires a
  photo. So a form holding nothing but a typed title arms nothing -- an indicator
  reading "Not saved" 800ms into typing a title is a warning that fires when
  nothing is wrong. It stays unsaved work the navigation guard asks about, the
  form's own hint already says what makes it savable, and the title IS carried on
  the create as `custom_label` the moment there is text to create with. Once the
  draft exists a retitle is written through `notebook_set_entry_label`, which is
  why `savedDraftSession` is tracked: that RPC refuses a check-in-linked entry,
  whose title comes from the check-in.
- **`noteId` NOW COMES BACK FROM BOTH CREATING TRANSPORTS, and it is what stops
  the draft filling with note threads.** `notebook_entry_notes` is append-only:
  `notebook_add_note` starts a NEW chain at revision 1 while
  `notebook_edit_note` appends to the one it names. An autosave that could not
  tell which chain it had just written would have to add every time, so ten
  minutes of writing would land as a dozen separate notes each holding a little
  more of one paragraph. Both RPCs already returned `note_id` and both routes
  already passed the object through; `CreateEntryResult` and `NoteSaveResult`
  simply stop dropping it. It is OPTIONAL, and a caller that has written once and
  still has no chain id REFUSES the next write (`noteChainUnknown`) rather than
  adding a second one -- a duplicate note is invisible on the composer and shows
  up only on the entry.
- **AUTOSAVE DOES NOT CALL `onChanged`.** That reloads the whole notebook. Doing
  it on a debounce would re-fetch every entry a student holds each time they
  paused typing, and would render the new draft in the feed underneath a composer
  still holding the same words. The feed picks the draft up on the next real
  refresh, which is also what makes the reload proof below mean something.
- **`busy` AND `inFlight` ARE TWO DIFFERENT FLAGS.** `busy` disables the form; an
  autosave must never do that, because it fires while somebody is typing into the
  box it would grey out. `inFlight` is the mutual exclusion, so a click landing
  mid-autosave cannot create a second entry from the same text. A manual save
  FLUSHES first (`await save.saveNow()`), before it takes `busy`, so the click
  continues the draft the autosave made instead of racing it.
- **`EditBaseline` IS THE COMPARISON, seeded at `null`.** "Is there text in here"
  and "has the server got this text" are different questions, and the second is
  what both the autosave and the navigation guard ask -- so `continueSaved` now
  writes on `noteUnsaved` rather than `hasNote`, and a manual Save draft after an
  autosave sends nothing and mints no revision.
- **`orphanNote` is the one thing autosave will not touch.** `resetForm(true)` is
  the case where the entry saved and its note did not: that text belongs to an
  entry that already exists and may already be turned in, so autosaving it would
  make a SECOND entry out of it. It stays unsaved work the guard asks about, and
  the existing message still says to add it from the entry's own card.
- **`guardSaveNavigation` GAINED `alsoUnsaved` RATHER THAN A SECOND GUARD.** Two
  `beforeNavigate` callbacks on one page are two guards racing to cancel the same
  navigation and two confirms for one move. The residual reporter is asked before
  the guard takes the navigation over and AGAIN after the flush, so whatever the
  flush landed stops counting. The classroom's call is unchanged.

### What was measured

- **1440x900.** No horizontal overflow (`scrollWidth` 1425 == `clientWidth`
  1425). The indicator renders inside the 44px actions row at 89x19, right edge
  777 of 1440. The failed state's Retry control is **58x44** and hit-tests to
  itself at 10%, 50% and 90% down its own span.
- **375x812.** No horizontal overflow (375 == 375). Actions row 293px wide
  holding Turn in (73x44), Save draft (94x44) and the indicator, right edge 321 of
  375. The failed indicator wraps to 293x90 with Retry still 58x44 and still
  hit-testing to itself at all three points; right edge 334 of 375. The
  photos/autosave sentence wraps to 3 lines inside the column.
- **The backoff curve, sampled at 100ms:** 104ms "Unsaved changes", 909ms
  "Saving...", 1709ms "Retrying (attempt 2 of 5)", 3304ms attempt 3, 6506ms
  attempt 4, 12902ms "Not saved. ... Retry" -- the engine's 800/1600/3200/6400
  curve, and it **never said "Saved"** at any sample.

### Verified in the browser (`/dev/notebook`, the dev harness, real component)

- **Type, navigate inside the route, reload.** Text pasted into the editor and a
  same-route link clicked **120ms later, well inside the debounce**: nothing had
  been sent before the click, the guard cancelled/flushed/re-issued, the URL moved
  to `?probe=1`, **zero confirms**, the editor kept its text. A full page reload
  afterwards shows the entry in the feed under Drafts with the same words.
- **Pagehide.** Same paste, then a `pagehide` event 120ms later: nothing sent
  before it, one `POST /api/notebook/note` after it.
- **A forced write failure.** With the harness's new "note writes fail" toggle,
  five attempts on the curve above, then "Not saved. ..." plus Retry, with the
  text still in the editor. Turning writes back on and pressing Retry landed it.
- **The failed-flush question.** A CROSS-route leave while the endpoint was
  broken: exactly one confirm, and refusing it kept the URL and the text. The same
  move SAME-route asks nothing, which is the documented NotebookView exemption and
  not a missing guard.
- **An empty form creates nothing.** Untouched composer: no request on idle, no
  request on `pagehide`, no confirm, and a cross-route navigation goes straight
  through. A **title with no note** likewise: no request, no entry, indicator
  hidden.
- **One entry, not two.** Autosave created `new-1` from the text; a staged photo
  then joined `new-1` and Turn in submitted `new-1` -- 1 create, 1 upload, 1
  submit, and **0** extra note writes. A Save draft click after an autosave: 1
  create total, 0 extra note writes.
- **A second edit EDITS.** The second autosave logged
  `POST /api/notebook/edit-note note_id="new-1-note"`, not a second add.
- **Staged photos are the guard's, not the autosave's.** One photo staged, no
  text: no request at all, indicator hidden, sentence changed to name the risk; a
  cross-route leave asked once and refusing it kept the photo.

### Mutation proof

`notebook_can_read_entry`'s `e.submitted_at is not null` and the staff SELECT
policy's were both replaced with `true` -- the PERMISSIVE direction -- in
`0118_notebook_draft_state.sql`. **6 assertions reddened**, including the new
autosave-shaped one; the file was restored and md5-checked
(`ea0757c5a474e240096aaafe63b9c343`), and the file is green again at 38/38.

### What is NOT verified

- **Nothing ran against the live Supabase project.** The local `.env` is the
  placeholder project. Every SQL claim is against a real embedded Postgres with
  the real migration files applied.
- **No signed-in browser pass.** The real route's transports were exercised only
  through the harness's in-memory answers; the widened `readEntry` / `readOk`
  passthrough of `note_id` was read from the route's own response shape and the
  RPCs' own `jsonb_build_object`, not from a live round trip.
- **No real Drive upload.**
- **`npm run build` was not run** (the pre-existing Windows EPERM in the Vercel
  adapter's `closeBundle`).
- **No screenshot.** The Browser pane does not composite; every number above is a
  measured geometry or hit-test read.
- **The `svelte-check` baseline in `CLAUDE.md` says 36 warnings; the tree measures
  37 both with and without this change.** The drift predates this bundle. This
  change adds 0 errors and 0 warnings, verified by diffing the warning list
  against a stashed tree.

### Deferred

- **A revision per autosave.** Every text write past the first is a real
  `notebook_entry_notes` revision, so a long writing session leaves a draft whose
  note history has many entries in it. On a draft that history is private to its
  author, and the 800ms debounce means a revision only lands after somebody stops
  changing the text -- but an instructor reading a turned-in entry will see a
  longer version list than they used to. Coalescing would need an RPC that UPDATES
  a draft's newest revision in place instead of appending, which is a migration
  and a hole in an append-only table's guarantee; it is stated here rather than
  half-built.
- **Clearing the note box is not persisted.** The content gate refuses an empty
  note, so deleting all the text leaves the last saved text on the draft. Doing it
  properly means deleting the note from the entry's own card, which already works.
- **The harness now keeps entries it created across a reload** (sessionStorage,
  ids beginning `new-`, with a "forget saved entries" button). Without it the
  harness cannot stand in for a server for the one proof autosave is worth having.
  The committed fixtures are untouched by it.

---

