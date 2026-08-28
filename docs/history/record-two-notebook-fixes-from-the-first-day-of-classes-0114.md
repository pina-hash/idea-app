---
title: "Two notebook fixes from the first day of classes (`0114`)"
date: 2026-08-17
branches: []
migrations: ["0114"]
subsystems: ["Digital notebook"]
record_order: 54
---

## Two notebook fixes from the first day of classes (`0114`)

Two defects reported once real students were on the notebook. They are
unrelated to each other and were fixed together because they were reported
together.

### 1. A NOTEBOOK ENTRY MAY BE WRITING, ON EVERY TIER

A student could not submit an entry without at least one photo. **That was the
form's DEFAULT state, not an edge of it:** the composer opens on the
outstanding check-in nearest today, and a check-in offered a photo stager and
nothing else.

**Four layers were enforcing it, and the audit is the useful part -- three of
them were individually right:**

1. **The composer** offered "Photos" or "Write a note" as an EXCLUSIVE MODE,
   and only on the free-form path. **This was the actual bug.**
2. **`/api/notebook/upload`** requires a `photo` part by construction
   (`readPhotoForm`). Correct and unchanged: it is the PHOTO door.
3. **`notebook_create_entry`** raises on a session-linked call with no file.
   KEPT -- its only content IS a photo, so a call to it with none has nothing
   in it. Only its MESSAGE changed.
4. **`notebook_create_note_entry`** took no session at all, so the note door
   could not reach a check-in. **That is the gap `0114` closes.**

**THERE WAS NO TABLE CONSTRAINT TO UNDO, and that is worth recording rather
than leaving as an absence.** `notebook_entries` has never required a photo:
`notebook_entries_has_target` (the closest thing) was dropped by `0071`, and
`notebook_entry_photos` has no minimum-row rule -- there is nowhere for one to
live, since a CHECK sees only its own row. The whole requirement was
application logic.

- **The note door gains the check-in, rather than the photo door losing its
  photo.** `notebook_create_entry` has no note parameter, so relaxing it would
  let it make an entry with nothing in it and leave "it must have writing" to a
  second call the client might never make. `notebook_create_note_entry` already
  writes the entry AND its first note in ONE transaction (`0078`'s reason: a
  failed note must not strand an empty entry), so extending it keeps "an entry
  made by this door always has writing in it" structural.
- **`p_session_id` is an ADDED parameter, so the four-argument form is DROPPED
  first** -- the `0068` trap, which `0075`'s header correctly says does NOT
  apply to re-defaulting a parameter that is already there. This is the other
  case. Demonstrated by mutation: leaving the old arity callable breaks a plain
  FREE-FORM note too, not just the new shape.
- **The section is resolved by CALLING `_notebook_resolve_session_section`**,
  the same function the photo door uses, never a second copy: one canonical
  check-in runs in N classes since `0098`, and the composite FK accepts only a
  real (session, section) posting pair.
- **Deploy ordering:** apply `0114` BEFORE deploying a client that names
  `p_session_id`. `/api/notebook/note` names it only when a check-in was
  actually picked (the `p_folder_id` rule), so a client shipped ahead of the
  migration keeps saving free-form notes and only the check-in note fails.
- **THE MESSAGES NAME WRITING, NOT A DRIVE FILE ID.** "A Drive file id is
  required" named our storage vendor and one of the two ways out, at a
  fifteen-year-old. Both refusals now read "This entry has nothing in it" and
  say what would fix it. The rules behind them are unchanged.

**The composer's mode picker is GONE.** Both boxes are offered on both tiers
and either one satisfies the form -- which is the same sentence the server
enforces, where the picker was a narrower one. Consequences: a check-in can be
answered in writing (the reported bug); a photographed page can carry a
sentence about it in the SAME action on the free path, which was previously
possible only on a check-in; and the submit hint says which half is missing
rather than naming photos. `noteOnly` is now DERIVED from what is in the form
(no photos + real text) rather than chosen in advance, so nothing has to be
decided before the student knows what they have.

**EVERY DOWNSTREAM CONSUMER WAS AUDITED AND NONE NEEDED CHANGING** -- reported
because "we checked" is the deliverable: `entryTitle` already walks session
label -> title -> filename -> **note text** -> placeholder (and for a
session-linked text entry the check-in label wins, which is right);
`entryThumb` returns its `note` text-tile kind for a zero-photo entry and
`empty` only when there is nothing at all; `NotebookPhotos` guards on
`pages.length`; `EntryReview` renders the writing and shows its "no photos and
no written notes" line only when BOTH are absent; `photoCountLabel(0)` is "No
photos yet", a real state since `0075`. The one that could have failed silently
is the GRID: `notebook_get_section_grid` counts ENTRIES, never photos, so a
written check-in reads on-time -- and since a Documentation Check's presence
score is `summarize()` over those same cells, a photo-keyed grid would have
marked a written answer missing on a real grade. Pinned by test, and
mutation-checked against the definition that actually runs (`0098`'s, not
`0094`'s -- mutating the older copy changed nothing, which is how the first
version of that assertion was found to be vacuous).

### 2. THE NOTEBOOK HAD TWO SCROLLBARS

A regression from the two-pane pass. **Measured before anything was changed**,
at 1440x900:

| surface | document | nested regions |
|---|---|---|
| `/dev/notebook` | scrolls, 1313 / 900 | `.cr-nav` 922/730 (max-h 732px), `.cr-detail` 1177/732, plus the folder rail scrolling HORIZONTALLY 579/260 |
| same, read-only | scrolls, 1336 / 900 | `.cr-nav` 907/730, the rail again |
| `/dev/notebook-review` | scrolls, 1927 / 900 | none at 900; at a 600-tall viewport `.cr-nav` 456/432 |
| classroom control | 904 / 900 | `.cr-nav` 1349/730 |

**WHERE THE NOTEBOOK DIVERGES FROM THE CLASSROOM, which the shell's default
geometry assumes.** The panes are `max-height: calc(100vh - --cr-chrome-h)`
with `--cr-chrome-h: 10.5rem` (168px). The classroom's chrome above its split
measures **172px** (masthead + breadcrumb + tabs) and nothing sits below it, so
its document overflows by 4px. The notebook's is **355px** (masthead 81 + shell
padding 48 + hero 226) with a version badge and 72px of padding BELOW -- so a
viewport-height pane plus that chrome is ~1185px against a 900px viewport, and
the page scrolls around a pane that also scrolls.

- **IT CANNOT BE FIXED BY TUNING `--cr-chrome-h`, and that is what decided the
  design.** The notebook's chrome is not a constant (the hero wraps, notices
  and fail-soft cards appear), and **`.nb-root` is not always the top of the
  page**: `/classroom/view-as/<email>/notebook` mounts the whole notebook under
  the CLASSROOM's shell and impersonation banner. Any viewport arithmetic in
  the stylesheet is wrong there by the height of somebody else's chrome. A
  full-height flex column has the same problem for the same reason.
- **`scroll="page"` on the shared shell** is the answer: neither pane bounds
  itself, the document owns the scroll, and the surface has ONE region at every
  width. `panes` stays the default and the classroom's computed geometry is
  byte-identical (re-measured: doc 904/900, split 732 tall, nav 32..448, detail
  472..1393, `.cr-nav` still the one region at max-height 732px).
- **A STICKY, INTERNALLY-SCROLLING DETAIL PANE WAS TRIED FIRST AND REJECTED ON
  A MEASUREMENT.** It keeps the open thing beside the list for free, and it is
  what the review console had before it moved onto this shell. But it scrolls
  internally the moment it is taller than the screen, and the notebook's compose
  form measures **1207px against a 900px viewport** -- its DEFAULT state, since
  the composer opens on load. It would have answered a report about two
  scrollbars with two scrollbars.
- **THE COST IS PAID IN ONE PLACE.** With nothing pinned, opening something
  from a row far down a long list renders it at the top of a column already
  scrolled past, and the click reads as doing nothing. `revealDetailPane`
  (`$lib/shell/reveal.ts`) brings the pane into view -- `behavior: 'instant'`,
  because app.css sets a global `scroll-behavior: smooth` and an animation is
  what a throttled window never finishes (the DrawingViewer lesson). **The half
  that fails silently is the other one**: `shouldReveal` refuses to move a page
  that is already showing the pane, which looks identical to a page that simply
  moved, so it is a pure function with its own assertions.
- **The folder rail stopped being a scroller inside a scroller.** Its
  horizontal chip strip is right for a full-width band on a phone, where
  vertical room is scarce; inside a 26rem navigation pane it was a bar nested in
  a bar. It WRAPS above the breakpoint and is unchanged below it.
  `overflow-x: visible` rather than `auto`, because `auto` on a wrapping flex
  row still reserves the gutter.
- **Nothing is hidden.** Per the standing rule, a region loses its scrollbar
  only by no longer scrolling -- which is what these do. A test asserts
  `split.css` contains no `scrollbar-width: none` and no display-none scrollbar
  pseudo-element.

**AFTER, measured on the same surfaces:** `/dev/notebook` 1440x900 -- document
1736/900, **zero nested regions**; read-only -- document 1470/900, **zero**;
`/dev/notebook-review` at both 900 and a 600-tall viewport -- **zero** (the grid
pane no longer caps at 432); at 375 the only region left on either surface is a
deliberate horizontal one (the folder rail on a phone, the compliance table in
its own container), `document.scrollWidth` 375 with no overflow. The reveal was
driven for real: scrolled to 820, clicked the last row, page landed at 432 with
the pane top at viewport 0; clicked a row with the pane already showing at top
232 and the page **did not move**.

### Verified

- **`tests/notebook-text-only-entry.test.ts` (11 tests)**, the chain plus
  `0114` on real embedded Postgres. Covers the seam rather than the happy path:
  the note door reaching a check-in with 0 photos and 1 note in one call; the
  section resolving from the POSTING and a section the check-in does not run in
  being refused; the free-form note unchanged; exactly one arity surviving; the
  GRID counting it as filed and on time; the section instructor reading it; both
  doors refusing an entry with nothing in it, with messages that name writing
  and never a Drive file id; an empty note leaving no half-made entry; and the
  caller-is-the-owner signature.
- **MUTATION-CHECKED FIVE WAYS**, each reddening only what it should:
  reproducing the pre-`0114` world (the note door ignores the session) reddens
  **3**; leaving the four-argument arity callable reddens **2** (including a
  plain free-form note -- the trap demonstrated rather than argued); restoring
  the old messages reddens **2**; making the grid require a photo reddens
  exactly the grid test -- **but only when mutated in `0098`'s definition, which
  is the one that runs; the same mutation in `0094`'s reddened nothing, and is
  how that assertion was found to be vacuous.**
- **`tests/notebook-shell.test.ts` grew 8 assertions** for the scroll fix and
  the reveal rule. **MUTATION-CHECKED FIVE MORE WAYS**, one red each:
  `shouldReveal` always true; `page-flow` re-bounding the detail pane with a
  sticky internal scroller; the folder rail keeping its bar; the feed dropping
  `scroll="page"`; and the reveal never being called. Every file restored
  byte-identical (git-verified for the two mutated migrations).
- **Two existing suites were corrected rather than worked around.**
  `notebook-entry-photo-rule` pinned `/Drive file id is required/`; it pins the
  new message and states why the RULE is unchanged. `notebook-notes` pinned the
  four-argument signature in its anon-grant check -- the same line that had
  already been caught pinning a DEAD three-argument one -- and names the
  five-argument one now. `notebook-folders` excludes `0114` from its chain,
  because its re-apply test pastes `0088` a second time and doing that ON TOP of
  `0114` puts the old arity back beside the new one: a true fact about running
  migrations out of order, and not that test's subject.
- **Browser-driven end to end** in `/dev/notebook`: with a check-in selected and
  no photo, typing into the editor enabled the submit ("Save what you wrote")
  and a real click issued exactly `POST /api/notebook/note session_id="ses-4"
  section_id="sec-1"` -- the PAIR -- with the notice reading "Check-in saved.";
  the entry then rendered in the feed titled by its CHECK-IN with a note text
  tile, and opened in the detail pane with **0 photo frames, 0 broken images**
  and no "empty entry" message. The still-refused case reads "Add a photo or
  write something to save this entry. Either one is enough." A real photo staged
  through the real file input and corrector, plus text, issued `upload` then
  `add-note` against the returned id -- the combination the free path could not
  previously express. In `/dev/notebook-review` a text-only check-in reads **on
  time** in the grid and its panel shows the writing with "No photos yet" and
  the full flag/resolve form.
- **The locked grid contract is unchanged**, re-measured: 30.39px cells, Share
  Tech Mono 14.4px, 4px radius, all six glyphs at their exact colours. The
  read-only mount still renders **0 forms, 0 file inputs, 0 note editors**.
- `npx svelte-check`: **0 errors, 36 warnings** (the same 36 as HEAD).
- **NOT verified: the live Supabase project, and no screenshots.** The local
  `.env` is the placeholder project, so `0114` has never been applied anywhere
  and the signed-in round trip could not be driven -- the four real notebook
  routes were probed signed out only. Apply `0114` by hand after `0113` **before
  deploying**, then check with a real student account that a check-in saves with
  writing and no photo, and that it reads as filed on the teacher's grid. The
  Browser pane does not composite, so every visual claim above is a measured DOM
  or computed-style read.

