---
title: "The final chunk of a deck upload (code-only; NO migration) -- RETIRED"
date: 2026-08-14
branches: []
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 41
---

## The final chunk of a deck upload (code-only; NO migration) -- RETIRED

**This whole diagnosis belongs to the chunked, direct-to-Drive uploader, which
is gone.** Live testing (see "Deck uploads go back through the server" below)
found the browser could not reach Google's chunked-upload endpoint at all in
this environment, on a small deck as much as a large one -- an environmental
failure the fix documented here could not have addressed, since it never got
past the very first chunk. Kept as the historical record of the investigation;
none of `CHUNK_BYTES` / `chunkContentRange` / `chunkRequestHeaders` /
`uploadZipToDrive` exist in the codebase any more.

A real 43 MB deck uploaded from a classroom, reached 100%, and failed
`chunk_network` on the LAST chunk. `0105`'s staging is fine and untouched:
ingestion is never reached, so this is entirely the transport. What is stored,
how it is served and the viewer are all unchanged.

### Why the last chunk is the only one that can fail this way

Every earlier chunk is answered 308 and changes nothing. The last one FINALIZES
the file: Drive reconciles the bytes against the session's declared length and
content type, commits the object, and answers 200 with metadata. So it is the
only request where a header that merely DISAGREED with the session has anything
to disagree about, and the only one whose failure can mean "the file exists and
the browser could not see the answer".

### The header, and the correction that came out of measuring it

`file.type || 'application/zip'` was the suspect and the fix is NOT the obvious
one. Windows Chrome types a .zip as `application/x-zip-compressed`, so a chunk
could contradict the session's `X-Upload-Content-Type` at exactly the moment
Drive commits — a real hazard. But **removing the header, which Google's
chunked example does, is its own hazard, and the harness proved it**:
SvelteKit's own node adapter DROPS a request body outright when there is no
Content-Type (`get_raw_body` returns null before looking at anything else,
verified against the installed copy), so a header-less chunk arrived at the
stand-in session with `request.body === null` and every byte silently missing.
A school network's filtering proxy is exactly the sort of intermediary that may
do the same to a body it cannot type.

**So a chunk PUT carries `Content-Range` and a `Content-Type` THAT IS THE
SESSION'S OWN**, threaded from the server that opened it (`DECK_ZIP_MIME`,
returned as `content_type` by `/api/classroom/deck/upload-session`) rather than
guessed from the File. It cannot disagree with the session, and the request
stays self-describing to everything in between. No `Authorization`: the session
URI IS the credential. `chunkRequestHeaders` is the one place headers are built
and is asserted by test.

### Correct by construction, then confirmed rather than inferred

- **The arithmetic is pure and exported** (`nextChunk` / `planChunks` /
  `chunkContentRange`), so the boundary cases that stress the last chunk — an
  exact multiple of the chunk size, one byte over, a file under one chunk — are
  assertions rather than hopes. `chunkContentRange` VALIDATES: a zero-length
  slice (`bytes 5-4/10`), an end past the total, or a chunk that disagrees about
  being last is `bad_chunk` here instead of an unreadable rejection there.
- **The declared total is checked against the file** before a byte is sent
  (`declaredSize`, required), so the session's `X-Upload-Content-Length` and
  every Content-Range total cannot come from two different measurements.
- **The session is opened `fields=id,size`**, so Drive's own finalize response
  states the stored length and a short file is `size_mismatch` with numbers in
  it, never a deck that ingests into nonsense. **The server re-checks the same
  figure** against Drive metadata at `begin`, where the credentials are real and
  CORS does not apply — a truncated upload used to reach the planner and be
  reported as "not a zip", which sends the reader looking in the wrong place.

### Every failure asks Drive where it got to, FIRST

On any chunk failure the uploader queries the session status before backing off
or deciding anything, and resumes from THAT answer rather than its own
bookkeeping. For an ordinary chunk that bounds a wifi blip to one re-send; for
the final chunk it is the whole question, since "it never landed" and "it landed,
finalized, and CORS hid the 200" are the same symptom and opposite outcomes.
A probe that itself fails is context, not an outcome.

### The diagnosis a live report can be built from

`DeckUploadError.detail` carries `chunkIndex`, the byte range, `declaredTotal`,
`isLastChunk`, the status query's outcome and `driveReceived`;
`deckUploadDetailLine` renders it under the message as raw figures (rounding to
megabytes would lose the off-by-one that is the point of reading them).

### Verified

- **`tests/classroom-deck-upload.test.ts` (24 tests, pure — no fixture, no
  browser).** Boundary arithmetic at every size around a chunk edge; the final
  chunk's Content-Range against the specification (inclusive end, declared
  total); the complete header set, including that the SESSION's type is used
  whatever the File claims; and the transfer itself through a fake
  `DeckUploadTransport` (the module's documented seam, since node has no XHR) —
  resuming the final chunk from Drive's count, noticing that it finalized when
  the answer was unreadable, resuming a PARTIAL upload from an odd offset
  without re-sending what Drive holds, the full diagnosis, and both
  `size_mismatch` directions.
- **MUTATION-CHECKED FOUR WAYS.** An off-by-one on the inclusive end byte
  reddens 9; putting a fixed Content-Type back reddens 1; never asking Drive
  after a failure reddens 5; dropping the stored-size confirmation reddens 1.
  Module restored byte-identical (md5-checked) each time.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **806/806 across 35 files** (was 782/34).
- **Browser-verified** in `/dev/classroom-deck` over CDP, with every chunk PUT's
  real headers read off the wire: a **39 MB** deck in 5 chunks, the final one
  `bytes 33554432-40890926/40890927` answered **200**, ingesting 20 files, every
  PUT carrying exactly `content-range` + `content-type: application/zip` and no
  `authorization`. **The recovery, in order:** final chunk 503 -> status query
  `bytes */40890927` -> the SAME final chunk re-sent -> 200 -> deck stored.
  Refused every time, it reports *"The final chunk (bytes 33554432-40890926 of
  40890927) failed... Drive was holding 33554432 of 40890927 bytes"* with the
  detail line `chunk 5 · bytes ... · final chunk · Drive held 33554432`. **The
  regression that matters held**: `frc-arena` renders at `left: 38% / top: 57%`,
  `frc-robot-action` 68%/41%, `robot-2026` 45%/54% — the authored framing, so
  the hidden state file survives the round trip. Traversal and ambiguous-entry
  refusals and the no-state warning all unchanged; 375/375 at phone width with
  the diagnosis line wrapping inside its column; 0 window errors throughout.
- **A REAL FINDING the harness produced, worth keeping.** Chrome
  TRANSPARENTLY RETRIES an idempotent PUT whose connection resets before any
  response byte arrives, so a one-shot reset is absorbed BELOW this code and is
  invisible from the page — the upload just succeeds, with one request in the
  network log. The recoverable fault injector therefore answers with a readable
  503 (`fail_last_drain`), and only the always-fails one abandons the send. Two
  flavours, deliberately not interchangeable.
- **NOT verified: the live Supabase project, real Drive, and screenshots.** The
  local `.env` is the placeholder project, so no chunk has ever reached real
  Drive from here and the server-side size check at `begin` has run only against
  the shipped code path, not a real Drive metadata read. The Chrome extension
  was unavailable, so the visual claims above are measured DOM and network reads
  driven over CDP, not an eyeball.
- **WHAT TO WATCH ON THE NEXT LIVE ATTEMPT.** If it succeeds, the header change
  was the cause. If it fails again, the panel now says which chunk and what
  Drive was holding, and that number is the fork: `Drive held <total>` means the
  file finalized and only the ANSWER was lost (a CORS exposure problem — look at
  `headers_blocked`); `Drive held <the offset before the last chunk>` means the
  final chunk genuinely never landed, which points at Drive rejecting it rather
  than the network; `Drive progress unreadable` means the status query could not
  be read either, so the school's network path is interfering with both.
  `size_mismatch` from the server means the bytes arrived short. The console
  carries the same under `[deck upload]`.

