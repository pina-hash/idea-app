---
title: "Classroom bundle 2: management, attachments, view-as (`0083`)"
date: 2026-08-10
branches: []
migrations: ["0083"]
subsystems: ["IDEA Classroom"]
record_order: 57
---

## Classroom bundle 2: management, attachments, view-as (`0083`)

Migration `0083_classroom_management.sql` (apply manually after 0082). 0082's
one rule is untouched: ZERO client write grants on any classroom table, every
write a SECURITY DEFINER RPC that re-checks the caller inside its own body.
Every capability below is another such RPC.

- **ONE content editor, mounted everywhere content is seen.**
  `src/lib/classroom/ContentComposer.svelte` was extracted out of
  `ManageConsole.svelte` and is now mounted by the console (create + edit), the
  class STREAM and CLASSWORK cards, and the assignment detail page.
  **SINCE PHASE 3 (`0111`) that console is GONE and those two card sets are one
  unit-grouped view: the composer is mounted by `ClassView` and `ItemDetail`,
  and the one-editor rule is unchanged -- only the surfaces it hangs on moved.**
  Edit and
  delete are on the cards themselves because "fix that announcement" is a
  thought someone has while looking at the announcement; a second editor per
  surface would drift, and the one that drifts is the one nobody is looking at.
  `src/lib/classroom/transports.ts` is the matching single set of REAL
  transports (`createClassroomTransports`), so the three surfaces can never end
  up on different RPC signatures. Switching edit targets REMOUNTS the composer
  through a keyed block rather than reaching into it imperatively.
  **SINCE 0108 that editor is RICH TEXT and every attachment type is staged in
  it, on create as well as edit** -- see "Classroom bundle 8" below; the
  extraction and the one-editor rule here are unchanged, the editor inside it is
  not a textarea any more.
  `canManage && !!transports` is what renders a control -- a read-only surface
  simply gets no transports, which is why the view-as tree has no write path
  even in principle.
- **Section lifecycle: archive-not-delete, with NO silent-loss path.**
  `classroom_sections.active` plus `classroom_set_section_active` and
  `classroom_delete_section`. 0082 declared posts/assignments/enrollments ON
  DELETE CASCADE, so a bare delete would take a term's work with it;
  `classroom_delete_section` therefore REFUSES the instant any of the three
  exists -- a structured `{ok:false, reason:'not_empty', posts, assignments,
  enrollments}` return (the designed path, not an error), so the UI names what
  would be lost and offers archiving, which keeps all of it. Only a genuinely
  empty section can be removed, and only with its LABEL TYPED BACK, checked in
  the RPC (the tournament_delete convention: no client bug or stray PostgREST
  call can destroy a section by id alone; case and surrounding whitespace are
  forgiven, internal spacing is not). `active` is deliberately wired into NO
  RLS policy -- an archived class stays readable to its members, because
  hiding last year's record is a second kind of data loss -- it only drops the
  section out of the composer's publish targets and shows an "Archived" chip.
- **A teacher may now hand their OWN section to another @boscotech.edu
  teacher** (`classroom_upsert_section`'s edit branch, recreated). This reads
  like a loosening of 0082's admin-only reassignment and is not: the caller
  must already manage the section, so the only new power is GIVING AWAY access
  you already hold, never taking it. Creating a section for someone else stays
  admin-only and the domain check is unchanged, so a section can never land on
  a student. The 0082 test asserting "a teacher cannot reassign" was replaced
  by one asserting the giver genuinely LOSES it afterwards; the takeover
  assertion (the one that protects anyone) is unchanged.
- **Enrollment corrections:** `classroom_update_enrollment` fixes a typo'd
  email or display name IN PLACE. The email is half the enrollment PK, so the
  correction is an UPDATE of that key -- the point being that a typo leaves no
  dead roster row for a student who never existed. Emails stay lowercased on
  write; correcting onto an email already enrolled returns
  `{ok:false, reason:'already_enrolled'}` rather than merging two students.
- **Attachments (`classroom_attachments`).** Metadata only; the BYTES go to
  the school shared drive through the EXISTING notebook Drive module (one
  OAuth egress point, one token cache, `supportsAllDrives=true` on every call
  including the folder LOOKUP -- without it a shared-drive-nested folder is
  invisible and every upload would mint a duplicate folder), in a
  create-if-missing subfolder (`ensureDriveSubfolder`) so the admin browsing
  that folder by eye is not looking at notebook pages and handouts
  interleaved. `notebook-drive.ts` gained the generic `uploadDriveFile` /
  `downloadDriveFile` / `ensureDriveSubfolder` / `deleteDriveFile` behind the
  unchanged notebook wrappers.
  - **Visibility DELEGATES to the parent** (`classroom_can_read_post`, new,
    mirroring 0082's `classroom_can_read_assignment`): there is no `published`
    column on attachments and there must never be one, because a second copy
    of the draft rule is a second thing to keep in sync. Unpublishing a post
    hides its files in the same statement.
  - **ONE Drive file, N rows.** A multi-section publish makes N independent
    content rows and the same handout belongs on all of them, so the bytes go
    up ONCE and `classroom_add_attachment(kind, ids[], ...)` writes one row per
    owner against that single file id (all-or-nothing on authorization).
    `classroom_delete_attachment` therefore reports `orphaned`, and the route
    removes the blob only when the LAST row referencing it goes;
    `classroom_delete_post` / `_delete_assignment` were recreated to report
    `orphaned_drive_file_ids` for the same reason (the cascade takes the rows,
    so nothing would ever look at those files again). Deleting content
    consequently goes through `/api/classroom/delete-content`, not a direct
    browser RPC call -- the database cannot talk to Drive and the browser
    cannot hold the credentials.
  - **Serving is an RLS-enforcing proxy**, `/api/classroom/attachment/[id]`,
    modelled on the notebook photo route: the row is read under the caller's
    OWN session, an empty result is 404 and never 403, Drive-side sharing is
    never relied on. Unlike the notebook route there is deliberately no
    `!inner` embed as a second hurdle -- an attachment has exactly one owner
    (post XOR assignment) so neither embed could be inner, and the delegation
    IS the hurdle. The upload allowlist is broader than the notebook's
    (handouts are PDFs) and narrower than "anything": **no SVG and no HTML**,
    which from the app's own origin are script containers; anything outside
    `INLINE_TYPES` is served `application/octet-stream` with a download
    disposition. `File.type` is not trusted alone (it is REQUIRED to be empty
    when the platform cannot type a file -- the notebook's HEIC lesson), so the
    filename extension is the fallback.
  - **Ctrl+V of a screenshot attaches it.** The composer's paste handler reads
    `clipboardData.items` (not `.files`, which several browsers leave empty for
    synthesised clipboard blobs), names the blob, and stages it; anything that
    is not an image falls through with NO preventDefault, so pasting text into
    the body is untouched. Files are staged locally and uploaded AFTER the
    create/update RPC hands back the ids it touched, because an attachment row
    stores a file id against a content id -- the content has to exist first.
- **View as student (admin only).** There is no way to obtain a
  @boscotech.net session for testing, so an admin renders the ordinary student
  experience for any enrolled email at `/classroom/view-as` (picker) ->
  `/classroom/view-as/<email>` -> `/<sectionId>` -> `/assignment/<id>`, under a
  sticky banner naming the student with an exit control.
  - **The gate is in the DATABASE, on every read.** Each of
    `classroom_view_as_students` / `_sections` / `_section` / `_assignment` /
    `_can_read_attachment` opens with `is_admin()`, so a non-admin calling one
    straight through PostgREST is refused -- "non-admins can never reach any
    form of it" does not depend on a page load. The `+layout.server.ts` guard
    404s (the /admin rule, so probing reveals nothing) but is convenience.
  - **Read-only is STRUCTURAL, not a discipline.** 0083 ships no view_as write
    RPC of any kind and the tree is handed no transports, so there is no write
    to execute while impersonating. A test asserts the complete list of
    `classroom_view_as*` functions and that every one is declared STABLE.
  - **It only ever NARROWS.** An admin can already read every section, draft
    and roster row through 0082's own policies; filtering to one student's
    ACTIVE enrollments and PUBLISHED content can reveal nothing new. The
    attachment proxy's `?as=<email>` exists for the same reason -- so an
    impersonated page is answered as that student would be, not as the admin
    driving it.
- **Verified.** `tests/classroom-security.test.ts` grew to 43 assertions
  (attachment visibility following its parent in both directions, no direct
  write path for student/teacher/admin, the all-or-nothing multi-target
  attach, the orphan report, the section-delete refusal with counts + the
  typed-label confirmation, archive being soft, hand-over-then-lose-it,
  enrollment correction incl. lowercasing and the already_enrolled refusal,
  every view_as RPC refusing a student AND a plain teacher, drafts absent from
  the impersonated view while the admin can read them directly, a deactivated
  enrollment dropping the class, and the anon boundary over all ten new
  functions). `tests/classroom-attachment-route.test.ts` (16) drives the REAL
  proxy handlers against real Postgres with a mocked Drive: served to an
  enrolled student / teacher / admin, **404 on a DRAFT's attachment and on
  another section's**, identical answers for a real and an imaginary id, 401
  signed out, 404 on a malformed id with a client that throws if used, 502 when
  the caller is allowed but Drive fails, the `?as=` behaviour in both
  directions, and the delete path's orphan sweep (nothing swept while a sibling
  row remains). MUTATION-CHECKED BOTH WAYS: the attachments policy at
  `using (true)` reddens exactly the 4 denial assertions, at `using (false)`
  exactly the 5 happy paths; migration restored byte-identical.
  `tests/classroom-attachment-mime.test.ts` (8, pure) pins the upload gate and
  the inline allowlist, mutation-checked by admitting SVG (reddens the refusal
  test) and by removing the extension fallback (reddens the acceptance test).
  `npm run check`: 0 errors, no new warnings. `npm test`: 212/212.
  Browser-verified in `/dev/classroom`: a real synthesized PNG pasted into the
  composer was intercepted, named and staged while a TEXT paste was left
  untouched; publishing to two sections issued ONE `uploadAttachment` carrying
  BOTH post ids; the file rendered on the student class page at its true
  240x120 with no remove control; editing from a stream card opened the shared
  composer prefilled with the existing attachment and a Remove control and the
  edit landed; two-step delete armed then removed; the section danger zone
  stayed disabled on a wrong label, enabled on a case/space-tolerant match, and
  the server still refused with "2 posts, 3 assignments, 3 enrolled students";
  archiving flipped the chip and dropped the section from the publish targets;
  an enrollment correction lowercased `  Ben.Okafor@BoscoTech.net ` in place
  with nothing left behind; the view-as loop showed the banner, only the
  enrolled class, no drafts, and ZERO edit controls or composers on all three
  screens. Every `/classroom*` page 303s signed out and all five
  `/api/classroom/*` methods answer 401. Phone width exactly 375/375 on all six
  surfaces; zero console errors. **NOT verified: the live Supabase project** --
  the local `.env` is the placeholder project, so 0083 has never been applied
  anywhere, and a real Drive upload additionally needs the one-time
  `/admin/drive-connect` consent.

