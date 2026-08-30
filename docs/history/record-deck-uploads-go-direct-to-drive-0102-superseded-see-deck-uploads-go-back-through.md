---
title: "Deck uploads go direct to Drive (`0102`) -- SUPERSEDED, see \"Deck uploads go back through the server\" below"
date: 2026-08-14
branches: []
migrations: ["0102"]
subsystems: ["IDEA Classroom"]
record_order: 38
---

**This transport is RETIRED.** Live testing found the browser could not reach
Google's chunked-upload endpoint AT ALL in this environment -- not for a large
deck across several chunks, not for a small one in a single chunk -- which is
an environmental failure, not a bug in what is documented below. The rest of
this section is kept as the historical record of what 0102 built and why; the
`classroom_deck_uploads` TABLE and its three RPCs
(`classroom_deck_upload_start` / `_claim` / `_cancel`) are UNCHANGED and stay
live, called by the server's own upload handler now instead of by a browser --
see the later section for the current design. `0102` is left in place
(migrations here are never dropped after the fact); only the client-side
chunked uploader and the `/api/classroom/deck/upload-session` route it talked
to are gone.

Migration `0102_classroom_deck_uploads.sql` (apply manually after `0101`). Only
the TRANSPORT of the zip changed: 0101's ingestion, storage, serving and viewer
are untouched and are still what runs.

### The problem, and why it was not ours to tune

0101 posted the zip as a multipart body. **Vercel caps a serverless request
body at ~4.5 MB**, and a real Claude Design export measures 23.5 MB of KEPT
files, so every real deck was refused BY THE PLATFORM before a line of our code
ran. So the bytes stop passing through us: the browser uploads the zip straight
to Drive and hands the server only the resulting file id.

### A credential leaves the server, and two things bound it

**What the browser gets is a Google RESUMABLE UPLOAD SESSION URI**, minted
server-side. It can do exactly one thing: put bytes into the ONE file that
session creates, whose name, type and parent were fixed by the server. It is
not the refresh token, not an access token, carries no scope, and authorizes no
other Drive call -- a resumable PUT takes a body, a `Content-Range` and a
`Content-Type` and nothing else. (That header set is exact and is asserted by
test; see "The final chunk of a deck upload" below for why the Content-Type is
the SESSION's own rather than the File's, and why it is present at all.)

**THE ONE THING WE CANNOT SET IS ITS LIFETIME.** The Drive API exposes no TTL
on a resumable session; Google keeps them for about a week, and that is the
narrowest option available. Reported rather than worked around, as asked. So
the URI is deliberately worth no more than "fill one already-authorized upload
slot", and the slot is what actually expires:
`classroom_deck_uploads` is an authorization row minted only after
`_classroom_manages_item` passes, spendable EXACTLY ONCE, expiring in two
hours. Zero client write grants; own-row SELECT; three SECURITY DEFINER RPCs
(`_start` / `_claim` / `_cancel`).

### A client-supplied file id is not trusted, and the slot alone is not enough

Two independent things must agree before ingestion reads a byte:

1. **THE SLOT.** `classroom_deck_upload_claim` spends the caller's own row --
   once, before it expires -- and returns the ITEM it was opened for. The
   ingest target comes from the row, never the request, so a claim cannot be
   redirected at a second item. One conditional UPDATE, so two racing claims
   cannot both win; "no such slot" and "not yours" both answer `not_found`, so
   probing an id learns nothing.
2. **THE FILE.** Its Drive NAME (`deckupload_<uploadId>.zip`) and PARENT (the
   deck-uploads staging folder) must be the ones the server set when it opened
   the session. A resumable PUT cannot change either, which is what makes "this
   file id came from that upload" checkable at all.
   **A file that fails this check is left completely alone** -- deleting it
   would turn a forged id into a way to destroy an arbitrary file in the shared
   drive.

Authority is asked THREE times (start, claim, and `classroom_replace_deck` when
the deck lands), deliberately: a 150 MB upload takes long enough for a teacher
to lose a section while it runs.

### Memory is bounded by the largest FILE, not the archive

The caps rise to **150 MB zip / 300 MB unpacked / 96 MB per file / 500
entries**, which buffering could not have survived. So `deck-zip.ts` reads
through a **`ZipSource`** instead of a buffer: a zip's index is in its last few
kilobytes and every entry sits at a known offset, so the unpacker takes the
tail, then one entry at a time. `planDeck` reads bytes for exactly ONE file
(the entry HTML, for slide labels) and decides everything else from names and
sizes; `readDeckFile` fetches each file when it is that file's turn, and the
upload loop batches by COUNT **and BYTES** (24 MB) so a big file goes up alone.
`memoryZipSource` is the trivial source for bytes already in hand (the dev
fixture, the test suite).

- **HYBRID READ, about round trips rather than correctness:** at or under 32 MB
  the staged zip is pulled down ONCE and read from memory; above it, every read
  is a ranged request. Ranged reading costs ~2 requests per file, which on an
  ordinary 30-file deck is 60 round trips to save memory that was never at risk.
- **THE REMAINING CEILING IS FUNCTION DURATION, not memory.** A 150 MB deck is
  pulled from Drive and pushed back file by file inside one request; that, not
  any number here, is what would bite first if these caps were raised much
  further.

### The client half

`src/lib/classroom/deck-upload.ts` chunks the file (8 MiB, the 256 KiB multiple
Google requires) over **XHR, for the one reason that `fetch` cannot report
upload progress in a browser.** A failed chunk retries with backoff, first
asking Google how much it holds so a wifi blip resumes rather than restarting.
**The `Range` header may not be readable cross-origin**, so an unreadable one
falls back to re-sending from our own bookkeeping -- the protocol is idempotent
per range, so that costs bandwidth, never correctness. Cancelling aborts the
transfer AND DELETEs the session so Google discards the partial upload, which
is why a cancelled upload leaves no file at all.

`DeckPanel` shows a three-phase bar (`preparing` / `uploading` with real byte
counts / `processing`, which reports nothing and says so with a sweep) plus a
Cancel control; a cancel reads as a notice, never an error.

### Retired

**The through-server upload path is GONE, not left as a fallback** --
`readDeckZipForm` and the multipart branch of the POST route are deleted. A
second way in would be a second thing to keep authorized, and its only
advantage would be for decks the new path handles anyway.

### Verified

- **`tests/classroom-decks.test.ts` (54 tests**, chain + `0102`): who may open a
  slot (student, foreign teacher and the every-posted-section bar all refused;
  no client write path for student, teacher OR admin; no anon grant on the table
  or any of the three RPCs; a slot visible to its maker and nobody else); the
  claim (once only, item from the ROW, `not_found` for someone else's, expired,
  cancelled, one Drive file backing at most one claim); and the REAL ingest
  handler driven end to end against a mock Drive -- a real staged export
  ingesting with `.image-slots.state.json` in the manifest and the staged zip
  swept, **a right-folder/wrong-name AND a right-name/wrong-folder file both
  refused with NEITHER deleted**, another teacher's slot refused without
  spending it, traversal still refused with nothing stored, the ambiguous-entry
  candidates still handed back, the size cap refused on metadata alone, and the
  anon/malformed cases.
- **MUTATION-CHECKED BOTH WAYS.** The new policy at `using (true)` and at
  `using (false)` each redden exactly the one test that exercises it; dropping
  the ingest route's name/parent binding reddens exactly the forged-file test.
  Migration and route restored byte-identical (md5-checked) and re-verified.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **753/753 across 32 files** (was 733).
- **Browser-verified** in `/dev/classroom-deck`, which now drives the SHIPPING
  uploader end to end: it serves the REAL fixture zip (optionally padded to
  ~39 MB), the browser uploads it in chunks to a stand-in resumable session, and
  the SHIPPING planner unpacks what ACTUALLY ARRIVED. A 40,890,927-byte zip went
  up as **5 chunks with exactly contiguous Content-Ranges**, progress read
  0 → 21 → 41 → 62 → 82 → 100% and then the indeterminate unpack phase, and 20
  files ingested. **The decisive pair still holds through the new transport:**
  with the hidden file the three slots render at their authored pan
  (`frc-arena` 38%/57%, `frc-robot-action` 68%/41%, `robot-2026` 45%/54%);
  without it all three are unfilled with no framing. Cancel was driven twice --
  at 0% and MID-TRANSFER at 41% after 16 MB -- and each time the session was
  discarded server-side (a later ingest for it answers "could not be found"),
  nothing was stored, the previous deck was untouched, and it read as a notice
  rather than an error. Traversal and ambiguous-entry refusals both still
  render, the entry-page answer re-uploads and ingests, all four API methods
  401 signed out, 375/375 at phone width with a 44px Cancel target, and an armed
  `window.onerror` caught ZERO errors throughout.
- **NOT verified: the live Supabase project, a real Google resumable session,
  and screenshots.** The local `.env` is the placeholder project, so `0102` has
  never been applied anywhere and no browser has ever uploaded to real Drive.
  **Two things specifically need a real deployment to confirm:** that Google
  accepts the chunk PUTs from a browser WITHOUT an Authorization header (the
  session URI being the credential -- the documented behaviour, and the only
  design compatible with not handing a scoped token to the client), and whether
  it exposes `Range` cross-origin (if not, a recovery re-sends a chunk, which
  is handled). Apply `0102` by hand after `0101`, then upload a real large
  export and check that the deck renders framed.

