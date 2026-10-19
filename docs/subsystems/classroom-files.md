# Classroom files

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Attachments and hand-ins of any type: buckets, signed URLs, keys, the one uploader. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### CLASSROOM FILES -- any type, 200 MB, and the three things that make that safe

**A CLASSROOM ATTACHMENT AND A STUDENT HAND-IN ACCEPT EVERY FILE TYPE, AND
THERE IS NO ALLOWLIST ANYWHERE TO ADD ONE TO** (0133). The bytes go browser to
a PRIVATE Supabase bucket against a signed upload URL our server mints, and
come back through a short-lived signed download URL; the app carries the
AUTHORIZATION and the ROW, never the payload. That is what moved the cap from
4 MiB to 200 MB and made a 60 MB SLDASM an ordinary hand-in.

- **THREE PROPERTIES PAY FOR THE MISSING LIST, and if one is ever weakened the
  PROPERTY comes back rather than the list.** The buckets are private (no
  public URL exists for any object); every read is a signed URL carrying
  `download=<name>`, so the response is `Content-Disposition: attachment` on
  the SUPABASE origin and not ours; and every object is stored as
  `application/octet-stream`. A bucket that refused `.exe` and served `.svg`
  inline would have the safety exactly backwards. **`File.type` is never read
  and never stored** -- it is a guess the uploader chooses, and it decides what
  a browser does with the response.
  - **"NEVER RENDERED INLINE" MEANS NEVER AS A DOCUMENT. IT DOES NOT MEAN NEVER
    IN AN `<img>`, AND THIS RULE USED TO SAY IT DID.** It read "a storage-backed
    image does not render inline anywhere -- a posted diagram is a download row,
    not a thumbnail", which conflated two different things and cost every photo
    a student hands in its thumbnail. What is dangerous is a person's bytes
    being NAVIGATED TO as a document, where `text/html` executes and an SVG
    carries script; that is what the attachment disposition and the foreign
    origin prevent, and neither may be weakened. An `<img>` is not that: the
    element decodes an image or fails, script does not run in it, and an SVG
    loaded through one is inert by specification. **Measured in Chromium rather
    than assumed:** an `<img>` whose response is `application/octet-stream` +
    `Content-Disposition: attachment` + `nosniff`, reached through a 302 to a
    signed URL, decodes -- `naturalWidth` 8 on an 8x5 PNG, identical to the
    no-header control. So a thumbnail costs no server change at all: the `src`
    is the SAME proxy URL as the link beside it. **Do not add an inline branch
    to a serve route to get one.**
  - **WHICH MEANS THE THUMBNAIL DECISION CANNOT ASK `mime_type`, AND
    `isImageFilename` IS THE ONE RULE.** Every stored object is
    `application/octet-stream` by the route's own hand, so a mime-first
    predicate answers false for every hand-in and every handout written since
    0133 -- measured on the classroom harness, 0 of 6 storage-backed files got a
    thumbnail, against 3 of 6 (the three that are genuinely pictures) after.
    `isSubmissionFileImage` reads the STORAGE KEY's extension when there is one
    and the recorded `mime_type` when there is not, so Drive rows are untouched;
    `isImageAttachment` is the same fix as a UNION with the recorded type, which
    is what let it move with no select change at all. **A thumbnail that fails
    to decode falls back to the download row** through the img's own `onerror`,
    on every surface that draws one.
  - `INLINE_TYPES` still exists and governs ONLY Drive-backed rows written
    before 0133, which the old twelve-type allowlist had already filtered.
    Adding a type there can only weaken the legacy path.
- **THE KEY LAYOUT IS THE AUTHORIZATION.** `<owner_id>/<uuid>.<ext>`, where the
  owner is the classroom item, the submission or (0233) the class notice, and
  every storage policy reads the FIRST PATH SEGMENT and asks the classroom's own
  existing predicate about it (`classroom_can_read_item`, `_classroom_manages_item`,
  `classroom_can_review_submission`, `classroom_can_read_quick_post_object`). There is no second authorization model:
  nothing about who may see a handout is restated in the migration.
  `_classroom_storage_prefix_uuid` is the ONE reader of that layout and returns
  NULL for anything that is not a bare uuid in segment 1, with every caller
  written so NULL FAILS CLOSED.
  - **NOTHING A PERSON TYPED APPEARS IN A KEY**, which takes filename
    sanitization off the security surface entirely rather than making it
    careful. The name goes in `filename`, verbatim, and is what every surface
    shows. The extension is kept, lowercased, because it is the only part a
    tool downstream reads.
  - **AND THE WRITE RPC RE-CHECKS THAT THE KEY NAMES ITS OWN ROW.** The storage
    policy answered a question about the OBJECT; the row is a second decision,
    so a caller holding a key minted for one item cannot hang it off another.
- **`drive_file_id` AND `storage_key` SIT SIDE BY SIDE WITH A CHECK THAT EXACTLY
  ONE IS PRESENT, and nothing was backfilled.** A row is a storage row if and
  only if `storage_key` is set; everything posted before 0133 keeps its Drive
  handle and keeps serving through the same route, and the ONE place that
  branches is the serve route. Do not write a migration that moves them: the
  branch is cheaper than the move and the move can only lose bytes.
- **ONE UPLOAD PATH AND ONE COMPONENT, FIVE ROLES.**
  `$lib/classroom/file-upload.ts` does sign -> PUT -> record for a student-facing
  attachment, a student hand-in, (since 0135) an instructor-only answer key,
  (since 0233) a file on a class notice and (since 0268) a post's thumbnail
  picture alike, gated by a `role` that changes
  only the wording and which pair of routes is called; `ENDPOINTS` is that map, a literal rather than a string built from
  the role, so a typo is a type error and grepping for a route finds its caller.
  A role is THREE things or it is none: a `sign` route naming its own bucket, a
  `record` route naming its own RPC, and a `DENIED_REASON` sentence that says
  whose permission was missing on THAT path.
  `FileUploadPanel.svelte` is the picker, the per-file progress, the per-file
  error and the Retry, mounted by ContentComposer TWICE (student-facing files and
  the instructor-only list, both staged and uploaded on save), by
  AssignmentEngine (immediate), by SpecRenderer per imageZone and by
  QuickPostComposer (staged, uploaded once Post has made the notice). The
  `quick-post` role's own 45 MB guard is `uploadQuickPostFile` in
  `$lib/classroom/quick-posts.ts` and its sign route, because the shared
  uploader's browser guard is the other buckets' 200 MB. **Two
  implementations of "upload a file" is two sets of failure semantics** -- which
  is precisely how the student side ended up with a loop that stopped at the
  first failure and silently abandoned every file after it, with nothing left
  staged to retry.
- **NO `accept` ON A PLAIN PICKER, ON EITHER SIDE.** The ONE exemption is a
  CAMERA button, which keeps `accept="image/*" capture="environment"` because
  `capture` is what makes a phone open its camera at all and an unfiltered
  capture input opens a file browser instead -- and it only ever sits BESIDE an
  unfiltered picker, so it gates nothing. The deck zip input keeps `.zip`, and
  (since 0268) a post's thumbnail picker keeps `image/*`, because that is what
  each FEATURE consumes, not a policy about what a person may hand in.
  `tests/classroom-attachment-mime.test.ts` sweeps for all of them.
- **A REFUSAL NAMES ITS GATE AND "Upload failed" IS NEVER THE WHOLE MESSAGE.**
  `$lib/classroom/upload-errors.ts` is the one vocabulary, shared by the sign
  routes and the browser uploader: a size refusal states the size AND the
  limit, an expired signed URL says the LINK is stale and the file is fine, an
  RLS denial says whose permission was missing. **A TRANSIENT CONFLICT IS NOT A
  REFUSAL** -- `classifyRpcError` whitelists the transient SQLSTATEs as
  retryable and leaves every considered refusal alone, verbatim, because
  retrying "Only a student enrolled in this class..." is how a UI asks the same
  question five times.
- **A FAILED FILE NEVER ABORTS THE POST, AND STAYS STAGED.** The item is
  created first, every file is attempted, only what LANDED is cleared, and the
  failure list names each one. Saving again retries exactly the rest.
- **AN AVAILABILITY FLAG MUST NAME THE DEPENDENCY IT ACTUALLY HAS.**
  `attachmentsEnabled` was `driveConfigured()`, which after 0133 would have
  removed the file picker from every item and the hand-in from every assignment
  on a deployment with no Google credentials, with the bucket sitting there
  unused. Student-facing files are unconditional now, **and since 0135 so is
  `instructorAttachmentsEnabled`**: answer keys got a bucket of their own (they
  could not share the `classroom-attachments` prefix, whose objects the whole
  class may read) and take the same signed-URL path, so NO CLASSROOM FILE
  UPLOADS THROUGH THE FUNCTION ANY MORE. Leaving that flag on
  `driveConfigured()` would have been the same silent outage one surface over.
  **The write-side Drive helpers in `$lib/server/classroom-attachments.ts` now
  have no caller at all** (`readAttachmentForm`, `MAX_DRIVE_ATTACHMENT_BYTES`,
  `attachmentDriveFilename`, `instructorMaterialsFolderId`,
  `submissionsFolderId` and the two folder-name constants); they are left
  standing pending a deletion bundle, and a new route written against one is the
  4 MiB shape these migrations exist to end.
- **A PUBLIC MATERIAL SERVES ITS STORAGE-BACKED ATTACHMENT WITH NO SESSION
  (0135), AND THE GAP THIS RULE USED TO DESCRIBE IS CLOSED.** It took two halves
  and needed both: `classroom_public_attachment` projects `storage_key` beside
  `drive_file_id`, and a SECOND permissive select policy on `storage.objects`
  admits `anon` and `authenticated` to an object in `classroom-attachments`
  whose key prefix names a material that is public and live. The route's
  `?public=1` branch mints on the CALLER'S OWN client, which with no session is
  the `anon` role -- never a service-role client, or the route becomes the
  authorization boundary instead of the database.
  - **THE POLICY NAMES ONE BUCKET AND MUST KEEP NAMING ONE.**
    `submission-files` and `instructor-attachments` have no `anon` policy of any
    kind; 0135 asserts that at apply time and the suite asserts it again from
    `pg_policies`. A private item, an unpublished one and one scheduled for
    later are refused by the predicate, not by the route.
  - **`authenticated` IS IN THAT POLICY ON PURPOSE**: being signed in is not
    being enrolled, and a visitor with a Google account reading a public
    document would otherwise be the only person who could not open its files.
  - **IT IS STILL A DOWNLOAD.** Public makes bytes readable; it does not make a
    person's uploaded `.html` safe to navigate to, so this branch passes
    `download=` exactly as the other two do, and the Drive-configured check
    moved BELOW it -- it used to 503 a storage-backed public attachment on a
    deployment with no Google credentials, refusing a file it never needed Drive
    to serve.
