---
title: "Any file type, up to 200 MB, straight to storage (`0133`, `0134`, `lane/attach-any-type`)"
date: 2026-08-24
branches: [lane/attach-any-type]
migrations: ["0133", "0134"]
subsystems: ["IDEA Classroom"]
record_order: 134
---

## Any file type, up to 200 MB, straight to storage (`0133`, `0134`, `lane/attach-any-type`)

**The report that started it: a SolidWorks part attached to an assignment
failed, and the assignment "did not post at all".** The first half was fully
explained; the second half was not, and is recorded here unresolved rather than
smoothed over.

### Phase 1: where the bytes actually were

Audited before writing anything, because the premise offered ("are they
committed into the repo through the GitHub API?") was not what this codebase
does. Traced from the file input to the resting place:

`<input type=file>` (ContentComposer:1066) -> `stageFiles` -> on Post,
`runSubmit` creates the item FIRST, then `transports.uploadAttachment` ->
`postFormWithProgress` (an XHR multipart POST) -> `/api/classroom/attachment`
-> the whole file buffered into a `Uint8Array` -> `uploadDriveFile` builds a
`multipart/related` body IN FUNCTION MEMORY -> Google Drive, shared-drive
subfolder `IDEA Classroom attachments`. The Drive file id lands in
`classroom_attachments.drive_file_id`.

**They were never in the repo.** `classroom-export.ts` (the `GITHUB_EXPORT_TOKEN`
job that pushes on every item save) contains no reference to attachments,
`drive_file_id` or uploads; it writes authored material TEXT under `materials/`
only. So there was no base64 step and no repo-size ceiling. What there was: the
bytes crossing the serverless function twice, fully buffered, which is where
`MAX_ATTACHMENT_BYTES = 4 MiB` came from.

**Eighteen gates were enumerated with file and line.** The one that refused the
`.SLDPRT` was `resolveMime` (`classroom-attachments.ts:96`) falling through both
twelve-entry allowlists to a 400: *"Attachments must be an image, PDF, text,
CSV, or an Office document."* Also found: `accept="image/*"` on the imageZone
pickers and on the student camera button; no client-side size or type check
anywhere (`stageFiles` filters `size > 0` only); the filename never becoming a
path (it is slugged for a Drive DISPLAY name and stored verbatim in a column
nothing resolves against).

**The non-posting is NOT explained by the attachment path and is not claimed to
be.** The composer creates the item before any upload, catches each upload
individually, keeps failed files staged, reports each by name, sets
`createdItemId` so a retry updates rather than duplicating, and calls `onsaved`
even on failure so the list refreshes. Candidates that could not be
distinguished from source: no class selected (`saveTarget` refuses), or the
`Saved, but 1 thing did not: ...` message being read as a failed post. Left open.

**A student submission path already existed and was a SECOND implementation.**
Same policy module, different component, different failure semantics:
`AssignmentEngine.uploadFiles` was a `for` loop that `return`ed on the FIRST
failure, so files 2..n were never attempted, nothing was re-staged (the input
had already been cleared, so the `File` handles were gone), and there was no
retry. That defect was independent of file types.

### 0133: two private buckets, and why no allowlist is safe there

`classroom-attachments` and `submission-files`, both `public = false`, both
`allowed_mime_types = null`, both `file_size_limit = 209715200`.

**The type list was REPLACED, not widened, and three properties are what pay for
its absence:** the buckets are private (no public URL exists), every read is a
signed URL carrying `download=<name>` so the response is
`Content-Disposition: attachment` on a DIFFERENT origin, and every object is
stored as `application/octet-stream` so a browser is never handed a content type
an uploader chose. A bucket that refused `.exe` and served `.svg` inline would
have had the safety exactly backwards. If any of the three is ever weakened, the
property comes back, not the list.

**The key layout IS the authorization.** `<owner_id>/<uuid>.<ext>`, where the
owner is the item (attachments) or the submission (hand-ins), and every policy
reads the first path segment and asks the classroom's OWN existing predicate
about it -- `classroom_can_read_item`, `_classroom_manages_item`,
`classroom_can_review_submission`. Nothing about who may see a handout is
restated in the migration. The rest of the key is opaque: nothing a person typed
appears in a path, which takes filename sanitization off the security surface
entirely rather than making it careful.

`_classroom_storage_prefix_uuid(text)` is the ONE reader of that layout, used by
the policies and by the write RPCs, and returns NULL for anything that is not a
bare uuid in segment 1 -- every caller is written so NULL fails closed.

**`storage_key` sits BESIDE `drive_file_id` with a CHECK that exactly one is
present.** Nothing was backfilled and nothing moved: every attachment already
posted keeps its Drive handle and keeps serving through the same route, and
`tests/classroom-attachment-route.test.ts` (20 tests over the Drive path,
written before this bundle) passes unchanged, which is the evidence for that.

**Deliberately NOT in scope: `classroom_instructor_attachments`.** Its read rule
is manager-only, so an answer key cannot share the `classroom-attachments`
prefix -- whose objects are readable by the whole class -- and a third bucket was
not authorized. Instructor-only material keeps the Drive path and its 4 MiB
ceiling, and now has its OWN availability flag (below).

### 0134: the race the browser pass exposed

**Found by driving the real UI, not by reading.** Nine files picked at once
became nine concurrent `classroom_open_submission` calls. A student's submission
row is created lazily by the first thing they touch; under READ COMMITTED
several callers read it as missing, several inserted, and the losers came back
with raw SQLSTATE 23505 on
`classroom_submissions_item_id_student_email_key`. **Measured: 7 of 9 files
landed, 2 stranded with a database error on screen.**

The race had been latent since 0086 and 0133 is what fired it: before 0133 the
student side uploaded one file at a time, so the lazy insert could never race
itself. Concurrency is the entire point of 0133, so the fix belongs in the
database: `on conflict (item_id, student_email) do nothing` plus a RE-READ in
both functions that create a submission lazily, with the lock state re-checked
after the re-read (the winner may have been a `submit_assignment`). A
count-then-insert was not available -- there is no parent row to lock before the
first caller holds one -- so the unique index IS the serialization point and the
only question was who apologises for it.

`tests/classroom-submission-open-race.test.ts` is built as a PAIRED
MEASUREMENT: two databases on one cluster, one chain stopping at 0133 and one
with 0134 over it, the same burst fired at both. **The 0133 control produced 25
unique violations across 10 rounds of 4; the 0134 database produced 0, with
every caller returning the same submission id.** Without the control a burst
that happened not to overlap would pass on the broken code too.

### 0134's sibling finding: retryable is not the same as refused

The route was flattening EVERY RPC error into `gate: 'denied',
retryable: false`, so the two stranded files were offered no Retry -- a
transient conflict presented as a permanent refusal.
`classifyRpcError` now whitelists the transient SQLSTATEs (23505, 40001, 40P01,
55P03, 57014, 53300) as retryable and leaves everything else as the considered
refusal it is, verbatim. Almost every raise on this path IS deliberate ("Only a
student enrolled in this class..."), and retrying those is how a UI ends up
asking the same question five times.

### The code half

**One upload path, both sides.** `$lib/classroom/file-upload.ts` does sign ->
PUT -> record, and `transports.uploadAttachment` and
`transports.uploadSubmissionFile` are both three lines around it. Two
implementations of "upload a file" was two sets of failure semantics, which is
how the student side ended up abandoning files.

**One component, both sides.** `FileUploadPanel.svelte` is mounted by
ContentComposer (staged, uploads on save), AssignmentEngine (immediate) and
SpecRenderer per imageZone. It owns the picker, per-file progress, the per-file
error, Retry and Remove. `SpecRenderer`'s `onupload`/`uploadingProgress` props
are gone, replaced by `itemId` + `upload` + `onuploaded`; absence of `upload`
removes every zone control, which is the same presence-gates-the-control
mechanism `fileNotice` uses one level up.

**`putFileWithProgress` is hand-rolled rather than `uploadToSignedUrl`,** and
the reason is measurable: storage-js's helper uses `fetch`, which cannot report
upload progress in any browser. For a 60 MB assembly on school wifi that is
several minutes with nothing on screen, and the thing a person does when a page
looks hung is press the button again.

**`accept` is gone from every plain picker.** The ONE exemption is the camera
button, which keeps `accept="image/*" capture="environment"` because `capture` is
what makes a phone open its camera and an unfiltered capture input opens a file
browser instead -- and it only ever sits BESIDE an unfiltered picker. The deck
zip input keeps `.zip` because that is a statement about what the FEATURE
consumes, not a policy about what a person may hand in; it is exempt by its own
`data-testid` rather than by "contains .zip".

**`isPreviewableFile` no longer reads `File.type`.** It was the last client
branch on it, and it is also the read that is legitimately EMPTY for the most
common camera output. Extension only; an extension that turns out not to decode
simply shows no thumbnail.

**`attachmentsEnabled: driveConfigured()` was a total silent outage waiting to
happen**, and it is what blocked the first local verification attempt. A
deployment without the Google OAuth credentials would have offered no file
picker on any item and no hand-in on any assignment, with the private bucket
sitting there unused. Student-facing files are now unconditional and
`instructorAttachmentsEnabled` carries the Drive dependency alone.

### The download filename, corrected by measurement

The first version passed the name through almost untouched, on the reasoning
that the name somebody typed is the name they should get back. Measured against
a real project, `Estudio (final) café.SLDPRT` came back as

    content-disposition: attachment; filename=Estudio%20%2528final%2529%20caf%25C3%25A9.SLDPRT

`%2528` is a percent-encoded `%28`: the value is escaped into the signed URL's
query string and escaped AGAIN into the header, so a browser saves a name full
of literal percent escapes. Every fixture whose name was `[A-Za-z0-9.-]` came
back clean. `downloadFilename` is now ASCII-only by construction, with
diacritics FOLDED rather than dropped (`café` -> `cafe`), and the fix was
re-measured: `filename=Estudio_final_cafe.SLDPRT`. **What is lost is only the
saved filename's punctuation; the DISPLAY name is stored verbatim and is what
every surface shows.**

### Phase 4: what was measured, and how

Verified against a REAL Supabase project -- the repo's own local stack on 544xx,
with 0133 and 0134 applied by hand through `psql` exactly as production will be.
Another project's stack (`fll-app-skt`) was running on 54321/54322 and was left
strictly alone. A dev-only `/dev/login` route was added to make this possible at
all: production sign-in is Google OAuth, so until now NOTHING behind a session
could be verified locally.

Every fixture picked through the real `<input type=file>` in a real Chrome, on
the real composer and the real hand-in surface.

| fixture | bytes | instructor | student | stored key tail | display name |
|---|---|---|---|---|---|
| `bracket.SLDPRT` | 2,048 | yes | yes | `<uuid>.sldprt` | verbatim |
| `chassis.SLDASM` | 12,582,912 | yes | yes | `<uuid>.sldasm` | verbatim |
| `full-robot.SLDASM` | 62,914,560 | yes | yes | `<uuid>.sldasm` | verbatim |
| `assembly.STEP` | 40,960 | yes | yes | `<uuid>.step` | verbatim |
| `plate.DXF` | 20,480 | yes | yes | `<uuid>.dxf` | verbatim |
| `part.f3d` | 131,072 | yes | yes | `<uuid>.f3d` | verbatim |
| `sketch.dwg` | 65,536 | yes | yes | `<uuid>.dwg` | verbatim |
| `firmware.ino` | 3,072 | yes | yes | `<uuid>.ino` | verbatim |
| `bundle.zip` | 245 | yes | yes | `<uuid>.zip` | verbatim |
| `noextension` | 5,120 | yes | yes | `<uuid>` (no ext) | verbatim |
| `Estudio (final) café.SLDPRT` | 6,144 | yes | yes | `<uuid>.sldprt` | verbatim, accent intact |

Every row: `mime_type = application/octet-stream`, `drive_file_id = null`, and
the object's own recorded size matching the row's. Every download: `HTTP 200`,
`content-type: application/octet-stream`, `content-disposition: attachment`.

**The transport fix is proved by the 12 MB and 60 MB rows existing at all** --
both are far past the old 4 MiB refusal -- and by where the requests went: 11
XHRs to `127.0.0.1:54421` (the Supabase origin) against 11 JSON POSTs to
`/api/classroom/attachment`, and the app route answering
`/api/classroom/attachment/<id>` with a redirect whose final host is
`127.0.0.1:54421`, returning 62,914,560 bytes for the 60 MB file. `maxUploading
AtOnce: 11` with per-file percentages on screen.

**A student cannot read another student's submission file, measured four ways.**
Bruno (same class) and Carla (another section) each: 0 of 11 rows readable; 0 of
3 objects readable while HOLDING Alice's exact storage keys (refused
`Object not found`, indistinguishable from a nonexistent key); writes into
Alice's prefix refused by RLS; and through the app route, `404` with a 9-byte
`Not found` body for Alice's real file ids -- byte-identical to the answer for a
made-up uuid, so an id cannot be probed. Positive controls on the same keys:
Alice 3/3, teacher of record 3/3 and 11/11 rows. **The teacher of record can
READ Alice's objects and cannot WRITE into her prefix** (refused by RLS) --
reviewing is not authoring. `mreed` (Period 9) reads 0.

**An induced failure does not abort the post.** A 250 MB file alongside a good
one: the item was created and published with the good file attached (confirmed
in the table), and the report read *"Saved, but 1 thing did not:
way-too-big.SLDASM: That file is 250.0 MB, and the limit is 200 MB. Nothing
about retrying will change that..."*, with that file still staged, carrying its
own error, and NO Retry offered -- correct, since retrying cannot help. The
other three gates were driven on `/dev/classroom-upload`, which mounts the real
panel with an in-memory transport: `expired` renders the stale-link sentence AND
offers Retry; `denied` and `not_configured` render their own sentences and do
not.

**Layout, measured rather than described.** 1440x900: no horizontal overflow
(`scrollWidth` 1425), panel 902px, rows 902x119, every tap target exactly 44px
high. 375x812: no horizontal overflow (`scrollWidth` 375), panel 317px, rows
317x157, the long filename ellipsising correctly, and every control hit-tested
at the top, middle and bottom of its 44px box -- 7 controls, 21 points, all
true.

**Not verified:** the live production Supabase project (0133 and 0134 are not
applied there; `.env` here is a placeholder and was pointed at the local stack
for this pass and restored byte-identically, md5 checked), a real Google Drive
round trip (the instructor-only path was exercised only in the "Drive not
configured, so the control is absent" direction), the Vercel preview
deployment's own behaviour, and tus resumable uploads -- which were NOT added,
because the 60 MB fixture landed on the ordinary single-request path and the
instruction was not to add tus speculatively.

### Deferred, and stated rather than hidden

- **A public material's storage-backed attachment 404s.**
  `classroom_public_attachment` (0092) projects `drive_file_id` and nothing
  else, and 0133's storage policies are `to authenticated`, so a signed URL
  cannot be minted with no session. Every attachment already on a public
  material is Drive-backed and unaffected. Fixing it is a migration widening
  that RPC plus an anon-readable policy keyed on the same
  published-public-material predicate.
- **Instructor-only material still uploads through the site to Drive**, at
  4 MiB. It needs a third bucket, because its read rule is manager-only.
- **A storage-backed image does not render inline anywhere**, by design. That is
  the third of the three properties, and it means a teacher posting a diagram
  now gets a download row rather than a thumbnail. Worth revisiting only with a
  measurement of whether `<img>` ignores `Content-Disposition` on that origin.
- **Nothing was backfilled.** Drive-backed rows will keep needing the Drive
  credentials and the proxy for as long as they exist.

