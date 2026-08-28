---
title: "Deck ingestion runs in stages (`0105`)"
date: 2026-08-14
branches: []
migrations: ["0105"]
subsystems: ["IDEA Classroom"]
record_order: 40
---

## Deck ingestion runs in stages (`0105`)

Migration `0105_classroom_deck_ingest.sql` (apply manually after `0104`) plus a
rewritten ingest route and client driver. **What is STORED is unchanged**: same
planner, same skipped standalone/template renderings, same hidden
`.image-slots.state.json`, same refused traversal, same
`classroom_replace_deck` writing the same manifest. Only WHEN the work happens
moved.

### What failed, and it was not the transport

A real 43 MB deck uploaded every chunk to Drive successfully, reached 100%, and
then failed. `0102`'s direct-to-Drive transport works; the failure is after it.
Ingestion downloaded the staged zip from Drive and pushed every file BACK to
Drive inside ONE request -- for a deck carrying three 5-8 MB gifs that is well
over a minute of round trips to Google, past the serverless function's DURATION
limit. `0101` had already bounded MEMORY to one file; duration is a different
ceiling and it is the platform's, not ours to raise.

### Stages the CLIENT drives

`POST /api/classroom/deck` dispatches on `stage`:

- **begin** -- claim the slot, prove the Drive file's name and parent, plan the
  archive, create the deck folder, open a job. Bounded: reads the zip's
  directory and one HTML file.
- **files** -- store as many planned files as fit in this request's own budget,
  record them, report progress. Called until complete.
- **finish** -- hand the accumulated manifest to `classroom_replace_deck`, sweep
  the deck this one replaced, delete the staged zip.
- **abort** -- sweep the deck folder and the staged zip.

**TWO BOUNDS PER STAGE, and the second is not redundant.** `STAGE_BUDGET_MS`
(8000, deliberately well under any plausible limit -- the only cost of being
conservative is another round trip) and `STAGE_MAX_FILES` (12), because a deck
of hundreds of tiny files costs two Drive round trips each and almost no bytes,
so it runs long while every byte-based bound stays slack. At least one batch
always runs, so a single file bigger than the budget still makes progress.

### The job, and why it is not a second authorization

`classroom_deck_ingest_jobs` holds the plan, the manifest so far, and
`files_done`. It can only be minted against an upload slot (`0102`) this caller
has already SPENT on this exact Drive file, and `_classroom_deck_job` re-asks
`_classroom_manages_item` on EVERY stage -- which matters more than it did
before, because ingestion now spans minutes and several requests and a teacher
can lose a section while one runs. "Not yours" and "no such job" answer
identically (the `0102` claim convention). Zero client write grants; own-row
SELECT only.

**RESUMPTION IS EXACT, not approximate.** A stage that stored files and died
before recording them leaves bytes on Drive that nothing knows about. So each
file is stored under `deckStagedDriveFilename(index, path)` -- a pure function
of the plan -- and `stage_open` marks a stage that never reported back; the next
stage LISTS the folder once (`listDriveFolderFiles`, new, paged) and ADOPTS
anything already there by name instead of uploading it twice. The index prefix
is what guarantees uniqueness: `deckDriveFilename` truncates at 240 characters,
so two deep paths sharing a long prefix could otherwise be adopted as each
other.

**CLEANUP IS THE FOLDER.** Abandoning a job reports the deck folder and the
staged zip for the route to delete, and deleting the FOLDER takes every file
under it -- recorded or not -- which is what makes "a failed ingest leaves no
orphan" true rather than nearly true. A second `begin` on the same item
abandons any earlier live job and reports ITS ids too, so a teacher who gave up
halfway and started again leaves nothing behind.

### Diagnosis: every failure is named

The client reported one generic message, so the four things that all look like
"the connection dropped" were indistinguishable from a browser with no server
logs. `DeckUploadError` now carries a `code`, everything logs under one
`[deck upload]` console prefix, and `DeckPanel` shows the code beside the
message:

`chunk_status` (a status the protocol does not use, with the range and whether
it was the LAST chunk) · `chunk_network` (status 0 -- a dropped connection and a
refused CORS preflight are indistinguishable from here, and it SAYS so rather
than picking one) · `chunk_timeout` (`xhr.timeout` is now actually set, at 10
minutes: generous, because cutting a slow-but-working chunk short is worse than
the hang, but a request that never settles had no bound at all) ·
`headers_blocked` (a 308 whose `Range` is unreadable -- non-fatal on its own,
and STICKY, so a later failure is relabelled with the real diagnosis) ·
`no_file_id` / `not_confirmed` · `ingest_network` / `ingest_timeout` (our own
60s timeout per stage, so a platform-killed request cannot hang a tab) /
`ingest_status` with the server's own code.

**A `files` stage is retried on a transport failure and NOT on a refusal** -- a
refusal is an answer -- which is safe precisely because every stage is
resumable.

### Verified

- **`tests/classroom-decks.test.ts` (63 tests**, chain + `0104` + `0105`). The
  headline derives the expected manifest INDEPENDENTLY -- the shipping planner
  over the same archive -- and requires the staged run to have stored exactly
  that, with plan ORDER asserted where it is observable (each file's Drive
  name). Plus: a stage rolled back to the state a killed request leaves
  (bytes on Drive, nothing recorded) resuming to the same manifest **with the
  folder holding no duplicates**; an abandoned job leaving no deck, no folder
  and no file; a second upload sweeping the first attempt's folder; `finish`
  refusing an incomplete job; every stage refusing a foreign teacher and a
  student; no write path for student/teacher/admin and no anon grant.
- **MUTATION-CHECKED.** The job policy at `using (true)` and at `using (false)`
  each redden exactly the read-scoping test; dropping the `created_by` filter
  from `_classroom_deck_job` reddens the ownership test; **removing the
  adoption listing leaves the folder holding 42 files where the manifest is 30**
  -- the duplicates it exists to prevent. Migration and route restored
  byte-identical (md5-checked).
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **782/782 across 34 files** (was 764/33).
- **Browser-verified** in `/dev/classroom-deck`, whose harness now drives the
  SAME four stages and gained fault injectors (a stage that 502s, one that never
  answers, one that stores files and dies before recording them) plus
  `?status=` / `?noRange=1` on the chunk endpoint -- these failures cannot be
  produced by a well-behaved same-origin stand-in, and they are the ones the
  live report was about. A **39 MB** zip went up in chunks and unpacked across
  **five** stages (`4/20 → 8/20 → 12/20 → 16/20 → 20/20`) to a 20-file deck; the
  interrupted stage was retried and completed; the two injected failures read
  as `drive_upload` and `ingest_timeout` in the panel, distinctly. Driving the
  shipping uploader directly produced `chunk_status` (503, with range and
  `isLast`), `chunk_network` (status 0, last chunk) and `headers_blocked`
  (carrying `originalCode: chunk_network` and naming the CORS exposure). **The
  regression that matters held**: the deck renders with its framing intact --
  `frc-arena` at `left: 38% / top: 57%`, `frc-robot-action` 68%/41%,
  `robot-2026` 45%/54%, matching the authored `{s, x, y}` exactly. Traversal
  still refused by name, the ambiguous-entry question still asked and answered
  (`handout.html` stored as the entry), the no-state warning still surfaced.
  0 trapped window errors throughout.
- **A REAL FINDING worth keeping.** A server that rejects a chunk BEFORE reading
  its body makes the browser abandon the send, and the status never becomes
  readable -- so it surfaces as `chunk_network`, not `chunk_status`. That is a
  plausible reading of the original report, and it is why the harness's injector
  drains the body first: otherwise it would produce the wrong failure and prove
  the wrong thing.
- **NOT verified: the live Supabase project, real Drive, and screenshots.** The
  local `.env` is the placeholder project, so `0105` has never been applied and
  no stage has ever talked to real Drive. **Apply `0104` then `0105` by hand
  BEFORE deploying** -- the client names `stage`, and against the old route
  every deck upload would fail at `begin`.
- **WHAT TO WATCH ON THE NEXT LIVE ATTEMPT.** The progress line should read
  "Unpacking N of M files" and CLIMB; if it sticks at one number the stage
  budget is not being reached and the bound to look at is `STAGE_MAX_FILES`. If
  it fails, the code in the panel is the diagnosis: `ingest_timeout` means a
  stage still outruns the platform (lower `STAGE_BUDGET_MS`), `ingest_network`
  means the request died rather than answered, `drive_upload` means Drive
  refused a file, `chunk_*` means the failure is back in the transport after
  all, and `headers_blocked` means Google is not exposing `Range` to this
  browser. The console carries the same under `[deck upload]` with the numbers.

