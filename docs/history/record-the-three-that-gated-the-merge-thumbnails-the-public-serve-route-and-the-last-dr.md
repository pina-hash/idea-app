---
title: "The three that gated the merge: thumbnails, the public serve route, and the last Drive upload"
date: 2026-08-25
branches: []
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 136
---

## The three that gated the merge: thumbnails, the public serve route, and the last Drive upload

**Branch:** `lane/attach-any-type`. **Migrations:** none. 0133, 0134 and 0135
were already applied to production by hand; everything here is the code half
that had been left explicitly undone, listed as "NOT DONE, and not attempted"
at the end of the previous entry.

### Why all three gated the merge rather than following it

None of them is a defect on `main`. Each is a defect that comes into existence
AT the merge, because each is a place where the app still asks a question that
0133 made meaningless.

The shared cause is one line of 0133's design: **every stored object is
`application/octet-stream`, written by the route's own hand, so that nothing
ever branches on a type the uploader chose.** That is correct, and it silently
invalidated every predicate in the client that asked `mime_type` what a file is.

### 1. Thumbnails

`isSubmissionFileImage` was `mime_type.startsWith('image/')`. Against a
storage-backed row that is false for a photograph and false for a 60 MB
assembly, so an `imageZone` -- which IS the photo-evidence block, and is what
Checkpoint 1 grades -- rendered a column of download links.

**Measured, on `/dev/classroom` in a real Chromium, before and after, with the
predicate reverted in place and restored md5-identical between the two runs:**

| | zone items | thumbnails decoded | download rows | plain hand-ins | plain thumbnails |
|---|---|---|---|---|---|
| mime-only predicate | 4 | **0** | 4 | 2 | **0** |
| extension predicate | 4 | **2** | 2 | 2 | **1** |

3 of the 6 seeded files are genuinely pictures and all 3 decode; the other 3
(a `.SLDPRT`, a `.SLDASM`, and a `.png` whose bytes are not a PNG) are download
rows. The third of those is the fallback path: the element is rendered, fails to
decode, and `onerror` drops it back to the row.

**The load-bearing decisions:**

- **No server change, and that was a measurement rather than a guess.** The
  obvious reading of 0133's "nothing a person uploaded is ever rendered inline"
  is that a thumbnail needs an inline branch on the serve route. It does not.
  Measured in Chromium: an `<img>` whose response is
  `application/octet-stream` + `Content-Disposition: attachment` + `nosniff`,
  reached through a 302 to a signed URL, decodes -- `naturalWidth` 8 on an 8x5
  PNG, identical to the plain `image/png` control, and identical again through
  the redirect. Five cases, five decodes. So the `src` is the SAME proxy URL as
  the link beside it, the disposition rule is untouched, and the CLAUDE.md rule
  that said otherwise was conflating "navigated to as a document" with "decoded
  by an image element". That rule is edited in place.
- **Three states of `storage_key`, not two.** A string means storage-backed and
  the key's extension decides. NULL means the column was selected and this row
  is Drive-backed, so its recorded type is real and is the thing it has always
  been thumbnailed by -- nothing was backfilled, so that branch stays. UNDEFINED
  means the column was not selected at all, which is the degraded rung, and
  there `mime_type` is both the only signal and the correct one, because on a
  pre-0133 schema every row is Drive-backed.
- **The rung is its own rung.** `SUBMISSION_FILE_SELECT_STORAGE` adds
  `storage_key` and nothing else; `selectSubmissionFiles` is ONE ladder called
  by the student engine load and by `loadGrading`, so the two surfaces cannot
  end up on different rungs and disagree about which files are pictures. The
  capability is reported as `filesStorageReady` on both payloads, turned on only
  by the wide rung succeeding -- never inferred from the rows, because an
  assignment with no hand-ins returns an empty array on both rungs.
- **`isImageAttachment` had the identical defect and is fixed as a UNION.** A
  teacher's handout is stored octet-stream too. Asking the filename FIRST and
  keeping the recorded type as an OR means every Drive row keeps the thumbnail
  it has today, which is what let this move with no change to `ITEM_SELECT` --
  whose four-rung ladder every classroom read goes through, and which would have
  needed a fifth rung spelled out in full to widen the embedded attachment
  select. This is beyond the letter of the item as scoped and is called out as
  such; the alternative was shipping two predicates that answer differently
  about the same question.
- **One image-extension rule.** There were two byte-identical copies of the
  regex (`classroom.ts`, `FileUploadPanel`) and this was about to add a third.
  `isImageFilename` is now the rule and both call it; the test counts the copies
  and fails at two.

### 2. The public serve route

`?public=1` resolved the row through `classroom_public_attachment` and then read
`drive_file_id` only, so a storage-backed attachment on a published public
material answered 404 to exactly the audience it was published for -- and
answered perfectly for any signed-in teacher checking it, because they never
take that branch.

Both halves of the fix are 0135's and both are the database's: the RPC projects
`storage_key`, and a second permissive policy admits `anon` to an object in
`classroom-attachments` whose prefix names a public, live material. The route
mints on the caller's own client, which with no session IS the `anon` role.

**One thing moved that was not in the brief:** `driveConfigured()` used to gate
the whole public branch, so a deployment with no Google credentials would 503 a
storage-backed public attachment -- refusing a file it never needed Drive to
serve. It is now below the storage branch.

**Proved at the route, with live positive controls beside every negative**
(`tests/classroom-storage-routes.test.ts`, real handlers, real Postgres, real
policies, `anon` for signed-out):

| case | result | control |
|---|---|---|
| signed out, `?public=1`, public material | **302** to a signed URL | -- |
| signed out, `?public=1`, PRIVATE material | **404**, 0 storage calls | manager 302 on the same row |
| signed out, `?public=1`, UNPUBLISHED public material | **404**, 0 storage calls | manager 302 on the same row |
| signed out, no flag | **401** | -- |
| signed-in visitor, enrolled in nothing, `?public=1` | **302** | same visitor, no flag: **404** |
| enrolled student, no flag, both materials | **302, 302** | -- |
| legacy Drive-backed public attachment | **200**, bytes byte-for-byte | 0 storage calls |
| every storage call made on the public branch | bucket = `classroom-attachments`, count > 0 | swept, not spot-checked |

The database half was already proven by `tests/classroom-instructor-storage.test.ts`
(0135); what is new here is that the ROUTES ask.

### 3. Instructor-only uploads

The last multipart POST through the function. An answer key was capped at 4 MiB
and filtered by a twelve-type allowlist, on the one surface no student ever
sees -- so the SLDASM the assignment is built from, the full-resolution scan of
the marked exemplar and the setup video were all refused.

It now takes the same three steps as everything else: `/sign` mints into
`instructor-attachments`, the browser PUTs, `/record` writes the row through
0135's widened RPC with `application/octet-stream` and the key. `ContentComposer`
mounts a second `FileUploadPanel` in the instructor section and its hand-rolled
staging is deleted -- a `File[]`, a non-reactive object-URL map, a revision
counter, an `onDestroy` to revoke them, a `uploadProgress` record keyed by array
index, its own markup and its own failure-line formatting: a second
implementation of the panel that had drifted into being worse than the original,
with no per-file error and no Retry.

**Measured in a real Chromium, on `/dev/classroom`'s composer:**

- both panels present (`data-role` `attachment` and `instructor`), legacy
  `ul.staged` markup count **0**;
- the instructor picker carries **no `accept`** and is `multiple`;
- staged: `Bracket answer key.SLDPRT` (4 KB), `Full assembly.SLDASM`
  (**62,914,560 bytes**) and `exemplar.png` (85 B) -- **3 staged, 0 refusals, 1
  thumbnail**. Both of the first two were refused outright by the old path;
- on save, **3** `uploadInstructorAttachment` calls, one per file, concurrently,
  0 errors, and the panel unmounts with the created item.

Route-level, against the real policies: a manager mints, an enrolled student is
refused (`gate: denied`), a signed-out caller gets 401, 300 MB is refused with
`gate: too_large` naming the 200 MB cap, and a key naming another item is
refused before the database sees it. **The count:** over a set of four
instructor rows on one item, the manager reads **4**, an enrolled student reads
**0**, a teacher of another section **0**, a signed-in visitor **0**, signed out
**0** -- the last of those refused one layer earlier, at the GRANT, since `anon`
holds no SELECT on that table at all.

**`instructorAttachmentsEnabled` stopped being `driveConfigured()`.** Leaving it
would have been the same silent outage 0133 fixed for student-facing files, one
surface over: no answer-key picker at all on a deployment with no Google
credentials, with the bucket sitting there working.

### The harness was the thing hiding all of this

`/dev/classroom` seeded hand-in rows as `image/svg+xml` with no `storage_key` --
a shape the record route can no longer produce. So it exercised the pre-0133
branch of the predicate and could not have shown the regression. It now seeds
what 0133 actually writes, and seeds all three outcomes side by side (a picture,
a CAD file, a picture whose bytes do not decode) on both the student's own view
and the graded one. Its `uploadSubmissionFile` stopped passing `file.type`
through for the same reason. **A harness fed input its real producer cannot emit
proves nothing about the real producer.**

### What was NOT verified

- **Nothing against the live Supabase project.** The local `.env` is a
  placeholder (`example-ref`), so no signed URL was ever minted by real
  storage-api, no real `Content-Disposition` header was read back, and the
  double-encoding measurement recorded in the previous entry was not repeated.
  Every SQL claim here is against embedded Postgres with the real migration
  files applied unmodified; the storage shim evaluates the real policies as the
  real roles, but it is a shim.
- **The `<img>` measurement was against a local server, not against Supabase.**
  What was measured is that Chromium decodes those headers, which is a fact
  about the browser; that Supabase sends exactly those headers is taken from the
  previous bundle's measurement.
- **No visual/screenshot review.** Every geometry claim is a computed-style,
  `naturalWidth` or hit-test read.
- **The three-way `?public=1` behaviour was probed against the running dev
  server only as a status code** (401 -> 404 for a signed-out public request on
  an id the placeholder project cannot resolve). That shows the branch is
  reachable; it does not show a real public attachment serving. The route test
  is what shows that.

### Deferred

- **The dead Drive write helpers are still there.** `readAttachmentForm`,
  `MAX_DRIVE_ATTACHMENT_BYTES`, `attachmentDriveFilename`,
  `instructorMaterialsFolderId`, `submissionsFolderId`,
  `INSTRUCTOR_MATERIALS_FOLDER_NAME` and `SUBMISSIONS_FOLDER_NAME` have no
  caller in `src/` at all now. They are left standing because removing them
  deletes passing tests and is a deletion bundle of its own, and because the
  instruction for this branch was explicitly not to remove the Drive path. Their
  comments are corrected to say they are dead rather than claiming a caller.
  `postFormWithProgress` WAS removed, because its last caller was the instructor
  upload and a dormant helper for the shape this bundle just deleted is an
  invitation to write the 4 MiB path again.
- **The Drive READ path stays and must.** Nothing was backfilled, so every
  attachment, hand-in and answer key posted before its migration still resolves
  through `downloadDriveFile` and `INLINE_TYPES`. `GOOGLE_DRIVE_REFRESH_TOKEN`
  is still required for those rows, for the notebook photo upload, for classroom
  DECKS (which still POST their zip through the function) and for the
  delete-content sweep. It is no longer required for any classroom UPLOAD.

---

