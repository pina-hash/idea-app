---
title: "Classroom bundle 7: presentation decks (`0101`)"
date: 2026-08-14
branches: []
migrations: ["0090", "0101"]
subsystems: ["IDEA Classroom"]
record_order: 37
---

Migration `0101_classroom_decks.sql` (apply manually after `0100`). A deck
authored in Claude Design and exported as a "Project HTML" zip is uploaded to a
classroom item, unpacked server-side, stored file-by-file in Drive, and served
back through an RLS-enforcing proxy so it plays inside the classroom. 0082's one
rule is untouched: ZERO client write grants, every write a SECURITY DEFINER RPC
re-checking the caller in its own body.

### THE HIDDEN FILE IS THE WHOLE PROBLEM

An export's images are `<image-slot>` custom elements whose SCALE AND PAN exist
only in `.image-slots.state.json`, a hidden sibling of the entry HTML that
`image-slot.js` fetches at runtime BY THAT EXACT RELATIVE NAME (`{u, s, x, y}`
per slot id; it applies them as inline `left: (50 + x)%` / `top: (50 + y)%` on
the inner `<img>`). Skip it as a dotfile, rename it, or drop it anywhere in the
chain -- unpacker, manifest, proxy -- and **every image renders at its uncropped
default, which looks PLAUSIBLE rather than broken**: nothing errors, nothing is
missing, and the author's manual framing is simply gone. So dotfiles are
ORDINARY FILES at every layer (nothing filters a leading dot from a NAME), and
`classroom_decks.has_state_file` records whether the upload carried one so the
panel can say so.

### No path is ever rewritten

Every reference inside an export is already correct relative to the entry file,
so the tree is stored and served as a UNIT under one per-deck prefix and the
browser's own resolution does the rest. The ONLY path surgery is stripping the
wrapper directory the zip was made from, which moves the whole tree together and
so changes no reference between its files. Measured: one iframe at
`/api/classroom/deck/<id>/index.html` pulls `support.js`, `_ds/<ds-id>/styles.css`,
seven token CSS files, `_ds_bundle.js`, `image-slot.js`, `deck-stage.js`, the
images and the state file -- ~19 requests, all 200, all untouched.

### Traversal is refused THREE times, independently

`normalizeDeckPath`/`deckPathOk` in the unpacker; `_classroom_deck_path_ok` as a
CHECK CONSTRAINT on every stored path AND re-run inside the write RPC; and the
serving route's own check before it queries. The middle one is the load-bearing
statement -- the stored path is what the route resolves, so an escaping path must
be UNREPRESENTABLE, not merely unlikely. **Backslashes are converted to slashes
BEFORE validation**, on purpose: some Windows zippers write `a\b.png`, and a rule
that only looks for `../` would let `..\..\x` through. `deckPathOk` (TS) and
`_classroom_deck_path_ok` (SQL) are ONE rule in two languages -- change both
together. The one deliberate asymmetry: the SQL has no null-byte check, because
Postgres `text` cannot hold one and `chr(0)` is itself an error (found by it
breaking the migration), while a JS string can.

### ONE DECK PER ITEM, following the canonical record

`item_id` is UNIQUE. "Re-upload replaces the deck" is only well-defined if there
is one deck to replace, and the viewer resolves a deck FROM an item. A deck on an
item posted to three classes is one upload all three see; replacing it replaces
it everywhere at once. Editing takes the stricter `_classroom_manages_item` bar
(manage EVERY posted class), the same rule `classroom_add_attachment` applies.

### Two tables, and why the manifest is rows

`classroom_decks` (entry_path, thumbnail_path, drive_folder_id, has_state_file,
slides, counts) + `classroom_deck_files` (`unique (deck_id, path)`). That unique
constraint IS the proxy's index: a served file costs ONE indexed row read --
which is also the authorization -- and ZERO Drive metadata calls. A deck pulls
~30 files per view; listing Drive per file would be 30 round trips to Google for
what the database already holds. Reads delegate to `classroom_can_read_deck` ->
`classroom_can_read_item` (0085), the single visibility question this module
asks, so a draft's deck is unreachable for a student BY CONSTRUCTION and so is
another section's.

**`slides` stores LABELS ONLY**, read out of the entry HTML at ingest.
`data-speaker-notes` is never extracted and never stored, so no surface of ours
can show it. (It remains inside the deck's own HTML as authored -- rewriting deck
content to strip it would break the no-rewriting rule and is not what this does.)

### Drive cleanup is a two-part contract

Postgres cannot delete a Drive file, so both write RPCs return the file ids AND
the per-deck folder id that no surviving row references, and the HTTP route
sweeps them -- the `classroom_delete_attachment` `orphaned` convention over a
whole tree. `_classroom_deck_orphans` re-checks every id against the table rather
than assuming, because `classroom_duplicate_item` carries a deck BY REFERENCE:
"the old deck is gone" and "its files are unreferenced" are different questions,
and sweeping on the first would delete a live deck's bytes. `classroom_delete_item`
and `classroom_duplicate_item` are recreated (0090's bodies + decks).

### The zip reader is dependency-free

`src/lib/server/deck-zip.ts` walks the central directory and inflates with Node's
own `zlib.inflateRawSync`. The alternative was `fflate`, which is in node_modules
only as somebody else's TRANSITIVE dependency -- a thing that can vanish in an
unrelated upgrade and take deck ingestion with it. Encryption, Zip64 and
unknown compression methods are refused BY NAME rather than mis-parsed. The
LOCAL header (not the central one) is what locates each entry's bytes; do not
"simplify" that away.

### Serving, and the trust that pays for same-origin

A deck is HTML and JavaScript served from the app's own origin -- it has to be:
the state file's relative fetch must not be cross-origin, and the viewer's iframe
needs same-origin to focus it so the deck's OWN ArrowLeft/ArrowRight navigation
works. So `sandbox="allow-scripts allow-same-origin ..."` is deliberate, and a
deck's scripts run with the viewer's session. **The trust boundary that makes
that acceptable is the one already governing everything a teacher puts in front
of a class**: only the teacher of record for every posted class, or an admin, can
upload one. A CSP on deck HTML (`connect-src 'self'`, plus the Google Fonts /
unpkg / jsdelivr a real deck loads) narrows egress; it is a blast-radius
reduction, NOT a boundary, and is documented as such.

Cache is `private, max-age=600`: a deck file is immutable (a replace mints a NEW
deck id, so every URL changes) but WHO may read it is not. **The stored mime
wins over Drive's**, which reports .js and .json as text/plain -- a stylesheet
served as text/plain is a deck that does not render.

### The viewer HOSTS the deck, it does not drive it

`/classroom/[sectionId]/item/[itemId]/deck`. `deck-stage.js` already implements
arrow navigation, so the only thing the viewer must get right is that the iframe
HAS FOCUS: it is focused on load and every control hands focus straight back.
Nothing sends synthetic keys in and nothing jumps to a slide -- that would mean
guessing at deck-stage's internal state, which is exactly the interference the
slide index must avoid, so the index is READ-ONLY.

### Deliberately not done

**The view-as tree carries no deck**: `classroom_view_as_section`'s payload has
no deck field, so the panel does not render there rather than an admin's own read
being shown under a student's name -- the check-ins precedent. And **the class
stream shows no deck indicator**; the item page is the one surface, which keeps
this change off the stream's load path.

### THE PLATFORM CEILING -- SUPERSEDED BY `0102`

This bundle posted the zip as a multipart body to `/api/classroom/deck`, and
flagged that **Vercel caps a serverless request body at ~4.5 MB** while a real
export is 23.5 MB of kept files -- so every real deck failed at the platform
before any of this code ran, and the flag correctly named direct-to-Drive as
the answer. That transport is GONE and its caps (48 MB zip / 96 MB unpacked)
are raised. See "Deck uploads go direct to Drive (`0102`)" below. Everything
else in this section -- ingestion, storage, serving, the viewer -- is what
still runs, unchanged.

### Verified

- **`tests/classroom-decks.test.ts` (34 tests**, 0001 + 0003 + 0020 + 0067 +
  0053 + 0082 + 0083 + 0085 + 0090 + 0101 on real embedded Postgres). The
  unpacker is driven with REAL zip bytes built header-by-header in the test, not
  a convenient object. Covers: the hidden state file kept (and its real bytes,
  `"s":2.4`, present), the missing-state warning, wrapper stripping, the
  standalone/template skip, four traversal shapes refused, backslash conversion,
  the ambiguous-entry refusal + candidates + honouring the answer, slide labels
  extracted with notes provably absent, `.thumbnail` sniffed as PNG; RLS by list
  AND by id (enrolled student, out-of-section student, draft-vs-student,
  foreign teacher, teacher of record, admin); no write path for student, teacher
  OR admin; no anon grant on either table or any of the three functions; the
  every-posted-section write bar; the CHECK constraint **asserted with RLS out of
  the way entirely** (as the connection owner, so nothing but the constraint can
  be what refuses); replacement reporting exactly the old tree; a second deck's
  shared bytes NOT reported orphaned; delete-item reporting the tree + folder;
  and the proxy driven as the REAL handler (student 200 + bytes, hidden file as
  JSON, stored-mime-wins, out-of-section 404, draft 404, foreign teacher 404,
  anon 401, traversal refused **without touching the database** — proven with a
  client that throws if used — and a real path and an imaginary one answering
  identically for a stranger).
- **MUTATION-CHECKED BOTH WAYS.** Widening "classroom deck files follow their
  deck" to `using (true)` reddens exactly 7 denial assertions; narrowing it to
  `using (false)` reddens exactly 6 allowed paths. Migration restored
  byte-identical (md5-checked) and re-verified green.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **733/733 across 32 files** (was 699/31).
- **Browser-verified** in `/dev/classroom-deck` (404 in production, no auth, no
  Supabase, no Drive), which zips the REAL committed deck at `static/fsp/day2`
  and pushes it through the SHIPPING unpacker, adding a real
  `.image-slots.state.json` because the committed copy is a stub `{}`. Ingest
  read 19 files / 3.0 MB / 10 slides with the wrapper stripped, the standalone
  skipped and the thumbnail resolved. **THE DECISIVE PAIR, measured not
  eyeballed:** with the hidden file, the three framed slots render at exactly
  their authored pan (`frc-arena` `left: 38%` = 50 + −12, `top: 57%` = 50 + 7;
  `frc-robot-action` 68%/41%; `robot-2026` 45%/54%); without it, the same slots
  have no src and no framing at all. Also: the deck renders real content, the
  outer `activeElement` IS the iframe, arrow keys move it (#1 → #2 → #3 → #2),
  the slide index lists all 10 labels, a refused fullscreen (no user gesture
  available here) is caught with no unhandled rejection and returns focus, the
  traversal zip is refused by name with nothing stored, the ambiguous zip offers
  both candidates and honours the pick, and 375/375 at phone width on both
  surfaces with every control at 44px.
- **A REAL HARNESS BUG the browser found:** re-ingesting WITHOUT the state file
  still showed framed images, because the browser was serving the PREVIOUS
  ingest's cached `.image-slots.state.json`. Not a product bug (production mints
  a new deck id per upload, so every URL changes) but the harness had a fixed id;
  it mints a fresh one per ingest now, which is also what production does.
- **NOT verified: the live Supabase project, a real Drive upload, and
  screenshots.** The local `.env` is the placeholder project, so 0101 has never
  been applied anywhere and no zip has ever reached the real shared drive (that
  additionally needs the one-time `/admin/drive-connect` consent). The Browser
  pane does not composite, so every visual claim above is a measured DOM or
  geometry read, and **native fullscreen could not be driven at all** (it needs a
  trusted click). Apply 0101 by hand after 0100, then upload a real export and
  check with two accounts that a student in the class sees the deck framed and a
  student outside it gets nothing.

