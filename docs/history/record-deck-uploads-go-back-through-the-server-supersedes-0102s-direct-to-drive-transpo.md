---
title: "Deck uploads go back through the server (supersedes `0102`'s direct-to-Drive transport)"
date: 2026-08-14
branches: []
migrations: ["0102"]
subsystems: ["IDEA Classroom"]
record_order: 42
---

Code-only; no migration. `0102` and its own header are LEFT IN PLACE as the
historical record, and its table (`classroom_deck_uploads`) and three RPCs
(`classroom_deck_upload_start` / `_claim` / `_cancel`) are UNCHANGED and still
live -- only WHO calls them changed.

### The finding, and why the fix is a revert rather than a repair

Live testing found the direct-to-Drive browser upload **could not work in this
environment at all**: a 3.9 MB deck posted in a single chunk failed exactly
the same way a 43 MB deck failed across seven, and the recovery probe
(`queryStatus`, a plain PUT asking Google how much of the session it holds)
failed too, meaning the browser could not reach Google's chunked-upload
endpoint in ANY capacity. That rules out an off-by-one or a header mismatch --
both would still let a SMALL, single-chunk upload through -- and rules in
something environmental (network policy, a proxy, a firewall) that the
"final chunk" investigation two sections up could never have fixed, because it
never got that far. **Every other file upload in this app already goes
through the server** (attachments, submission files, notebook photos) for
exactly the reason the Drive credentials live there; a deck upload rejoins
that pattern rather than staying the one exception.

### The shape: one multipart POST does what three round trips used to

`/api/classroom/deck` still dispatches on content type, but the JSON `begin`
stage is GONE. In its place, a `multipart/form-data` POST triggers `upload()`,
which does -- in one request, one function -- everything the old
authorize / direct-to-Drive-write / begin sequence did across a browser, a
resumable session and a second server round trip:

1. **Authorize** (`classroom_deck_upload_start`, unchanged) -- refused here
   means nothing has touched Drive yet.
2. **Write the zip to Drive** (`uploadDriveFile`, the same ordinary multipart
   upload every classroom attachment already uses), named
   `deckUploadName(uploadId)` into the SAME staging folder 0102 always used.
3. **Claim the slot** (`classroom_deck_upload_claim`, unchanged) -- binds the
   authorization to the file this server itself just wrote and re-checks
   `_classroom_manages_item` a second time.
4. **Plan the archive and open the staged-ingest job** (0101's `planDeck`,
   then `classroom_deck_ingest_begin`) -- byte-for-byte the same code 0102's
   `begin` stage ran.

Everything after that -- `files` (called repeatedly, 0105's own time-budgeted
staging), `finish`, `abort` -- is **completely unchanged**: unpacking a real
export is still minutes of round trips storing files back out to Drive, still
well past a single serverless request's DURATION limit, and that ceiling was
never the transport's problem to begin with. The client still drives those
stages exactly as it did.

### What "prove the file id" collapsed into

0102's whole "the file id is not trusted, and two things have to agree" story
existed because a BROWSER was asserting a Drive file id it produced somewhere
this server could not see. Once the server writes the file itself, the id
comes back from Google's own upload response -- there is nothing left to
forge and nothing left to prove. `getDriveFileMeta` (the function that read a
file's Drive metadata to compare its name/parent/size against what the
session should have produced) and `startResumableUpload` (the function that
opened a Google resumable session URI) are both DELETED from
`notebook-drive.ts`; neither has a caller left anywhere in the app.

### The size cap moved with the transport, not away from it

`DECK_UPLOAD_MAX_ZIP_BYTES` (`$lib/classroom/deck`, client-safe -- 4 MiB,
matching the existing `MAX_ATTACHMENT_BYTES` convention in
`classroom-attachments.ts` for the identical reason: Vercel's ~4.5 MB
serverless request-body cap, with headroom for the multipart envelope) and
`deckUploadSizeIssue(bytes)` (the ONE message, naming the actual size and the
limit, and telling the uploader to pull large media -- gifs, video -- out of
the deck and attach it to the item separately) are the whole rule.
`$lib/server/classroom-decks.ts` **re-exports both from the client module**
rather than duplicating the number, so the server's defense-in-depth refusal
says exactly what the client's up-front one already said.

- **Refused client-side, before anything is sent.** `DeckPanel.svelte` checks
  `deckUploadSizeIssue(file.size)` the instant a file is picked, and
  `deckTransports.uploadDeck` checks it again as the first line of its own
  body -- so a caller that bypassed the panel (the dev harness, a future
  surface) is still refused before touching the network. "Do not silently
  attempt an upload the platform will reject" is therefore never a race with
  the request itself; it is a synchronous no.
- **Refused server-side too**, in two layers: a `Content-Length`-header
  precheck before the body is even parsed (`MAX_REQUEST_BYTES`, the cap plus
  a margin for multipart overhead), and `deckUploadSizeIssue(file.size)`
  again once the form is parsed, for a caller with no `Content-Length` or one
  that lied. Both answer 413 with the SAME message the client would have
  shown, and neither reaches `classroom_deck_upload_start` or Drive.

### Real progress, on a request that is short again

`src/lib/classroom/deck-upload.ts` was rewritten from the ground up: gone are
`CHUNK_BYTES`, `nextChunk` / `planChunks` / `chunkContentRange` /
`chunkRequestHeaders`, `parseReceived`, the `DeckUploadTransport` chunk-PUT
interface, and `uploadZipToDrive` -- there is no chunking left to do. In their
place, `postDeckZip(opts)` is ONE XHR POST (still XHR rather than `fetch`,
for the one reason that survives the rewrite: `fetch` cannot report upload
progress) carrying real `xhr.upload.onprogress` bytes for the `uploading`
phase, with a pluggable `url` (defaulting to `/api/classroom/deck`, overridden
by the dev harness, which has no session or Drive to point the real one at)
and a `DeckPostTransport` test seam mirroring the old chunk transport's shape.
`DeckUploadError`'s code union shrank to `'cancelled' | 'network' |
'timeout'` -- the only failures a single request can have on this side; every
other refusal (`too_large`, `session_refused`, `claim_refused`, `plan_refused`,
`drive_upload`, ...) arrives as an ordinary JSON body with its own `code`,
handled as data rather than thrown. The `unpacking` phase (file-count
progress from the `files` stage loop) and `storing` phase are untouched.

`DeckUploadResult.detail` and `deckUploadDetailLine` (the chunk-diagnosis line
-- "chunk 6/6 · bytes .../... · final · Drive held ...") are REMOVED along
with the mechanism they explained; `DeckPanel.svelte` dropped its
`errorDetail` state and the `.deck-detail` CSS rule that rendered it. The
panel's hint text now states the size cap and the gif/video guidance
directly, and its `.deck-hint` renders `DECK_UPLOAD_MAX_ZIP_BYTES` rather
than a hardcoded number.

### Removed entirely, not left dormant

Per the standing rule that a retired transport is not kept around as an
unused option: `/api/classroom/deck/upload-session/` (the route that opened
the resumable session) is DELETED, along with
`/dev/classroom-deck/upload/+server.ts` and
`/dev/classroom-deck/upload/[upload_id]/+server.ts` (the dev harness's
resumable-session emulation) and the matching `devUploadStart` /
`devUploadSession` / `devUploadCancel` / `devUploadChunk` /
`devUploadTakeFinalFailure` / `devUploadedBytes` / `devUploadFinalized` /
`ingestUploadedZip` functions in `dev-deck-fixture.ts`. `tests/classroom-deck-upload.test.ts`
(the pure chunk-arithmetic suite -- boundary cases, header construction,
resume-from-Drive's-own-count) is deleted outright: none of what it pinned
exists any more.

### The dev harness now drives the REAL `postDeckZip`

`/dev/classroom-deck` no longer calls `uploadZipToDrive` against a stand-in
resumable session; it calls the SAME `postDeckZip` production code points at
`/api/classroom/deck`, just aimed at `/dev/classroom-deck/ingest` via
`postDeckZip`'s `url` option. That dev endpoint's `begin`-equivalent now reads
a real multipart form (`id`, optional `entry_path`, the zip as `file`) and
calls `devIngestBegin` directly -- mirroring the real route's collapse of
authorize + write + plan into one request, minus the parts there is no
session or Drive to authorize against. The `files` / `finish` / `abort` JSON
stages, and their `fail` / `hang` fault injectors, are unchanged; both
injectors now also work on the initial multipart call (`fail-upload` /
`hang-upload` in the fault picker), demonstrating that a failure during the
combined upload step leaves nothing behind exactly as one during unpacking
does. The old "pad to ~36 MB, force a multi-chunk transfer" toggle is gone
with the chunking it existed to exercise; the harness's "oversize" toggle
pads PAST `DECK_UPLOAD_MAX_ZIP_BYTES` instead, so the real client-side
`deckUploadSizeIssue` refusal is demonstrated against real bytes rather than
asserted as a pure function in isolation.

### Verified

- **`tests/classroom-decks.test.ts`** (63 tests, same real-Postgres +
  real-migrations harness as before, migrations unchanged) was reworked
  rather than patched: the mock Drive HTTP server's `/upload` endpoint now
  captures and stores the FULL uploaded bytes (parsed out of the real
  multipart-related body by boundary, not truncated at 4096 characters the
  way it used to be for metadata-only reads), because the staged zip is
  written through that SAME generic endpoint every individual deck file
  already used -- there is no separate "staged" bucket pre-seeded by test
  code any more. New helpers `uploadForm` / `callUpload` / `beginUpload` post
  REAL `FormData` (with a real `File`) through the REAL route handler exactly
  as a browser would. Covers: a real zip ingested in one multipart upload
  with the hidden state file surviving and the staged zip swept from the
  correct staging folder; the upload refused for a student, a foreign
  teacher, and anonymously, with Drive touched for none of them; an oversize
  zip refused with `code: 'too_large'` before any Drive write; a traversing
  zip refused with the staged file it DID write cleaned up; the
  ambiguous-entry-page candidates handed back; a malformed `item_id` and a
  missing `file` field both refused without reaching Drive; the JSON stages'
  own auth and malformed-id refusals; and the full staged-ingestion suite
  (multi-stage manifest correctness, resuming an interrupted stage, abandoning
  a job leaving no orphan, superseding an earlier unfinished attempt, the
  job-ownership boundary) re-driven through the new multipart entry point
  with IDENTICAL assertions to before. The RPC-level suites
  (`classroom_deck_upload_start` / `_claim` / `_cancel` authorization,
  refusal reasons, the one-file-one-claim unique index, the anon/write
  boundary) are UNTOUCHED, since those RPCs are unchanged -- they are simply
  narrated as "called by the server itself now" rather than by a browser.
- `npm run check`: 0 errors, 36 warnings (the same 36 as before this change).
- `npm test`: **819/819 across 36 files** (was 843/37 -- the retired pure
  chunk-arithmetic suite accounts for the one fewer file and its tests).
- **Browser-verified** end to end through `/dev/classroom-deck`: a real zip
  under the 4 MB cap uploaded with visible byte progress during `uploading`
  and file-count progress during `unpacking`, landed with its hidden state
  file intact and both framed test images cropped exactly as authored; the
  oversize toggle refused instantly with the exact size/limit message and
  the log showing no upload was attempted; `fail-upload` / `hang-upload`
  each left nothing stored; the ambiguous-entry and traversal zip shapes
  behaved exactly as before.
- **NOT verified: the live Supabase project.** The local `.env` is the
  placeholder project, so no real request has reached real Drive through this
  path. Deploy and upload a real Claude Design export under 4 MB to confirm
  the live round trip; a deck over that needs its large media pulled out and
  attached to the item separately first, per the panel's own hint.

