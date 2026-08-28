---
title: "An instructor sees the whole notebook of a student they teach (`0106`)"
date: 2026-08-14
branches: []
migrations: ["0106"]
subsystems: ["Digital notebook"]
record_order: 33
---

## An instructor sees the whole notebook of a student they teach (`0106`)

Migration `0106_notebook_instructor_student_access.sql` (apply manually after
`0105`) plus one new read-only route and a link on the compliance grid. Two
gaps, and only the first needed schema.

### The predicate changed, not the data

Staff read access on `notebook_entries` had been section-scoped since `0069`
and stayed that way through `0094`: `using (classroom_manages_section(
section_id))` asks **"does this ENTRY belong to a section I manage"**. A
free-form entry carries `section_id = null` -- `0075` made the free tier's
photo optional and `0078` made a note an entry in its own right -- and
`classroom_manages_section(null)` is `is_admin()`. So an instructor saw a
student's check-in work and nothing else, while the chair tier saw everything:
the student's own writing, which is most of what a notebook IS, had no
instructor surface at all.

Nothing is back-filled and no entry gains a section. The question becomes a
fact about the AUTHOR -- **"is this student enrolled in a section I manage"** --
which is answerable for a free-form entry precisely because it does not depend
on the entry. `notebook_manages_student` is `classroom_enrollments` and
`classroom_manages_section` COMPOSED and nothing else; it deliberately does not
spell out `teacher_email = current_user_email()`, which would be a second copy
of what managing a section means -- the drift `0094` dropped
`notebook_is_section_instructor` to avoid.

- **IT IS A UNION WITH THE OLD PREDICATE, NOT A REPLACEMENT**, and that is
  load-bearing. `0094`'s roster deliberately keeps a student who has LEFT a
  class but filed work in it (`enrolled: false` on the grid) so already-reviewed
  work is not hidden; their enrollment is inactive, so an enrollment-ONLY
  predicate would withdraw access granted since `0069` and leave the grid
  showing a row whose cells could not be opened. Mutation-checked: a strict
  replacement reddens exactly that case.
- `auth.uid() = student_id` is a separate policy and is **untouched**. A student
  gains nothing over a classmate, because `notebook_manages_student` returns
  false for anyone `classroom_manages_section` says no to.
- **Photos, notes and folders follow for free** -- they delegate to
  `notebook_can_read_entry` rather than restating who staff are, and
  `notebook_entry_activity` is `security_invoker` over the entries. Widening the
  one function and the one policy widens all four consistently, which is the
  whole reason that delegation exists. **Excusals are NOT touched:** an excusal
  is a fact about a session, which always has a section.
- `_notebook_manages_student_email` is the email-keyed core (the roster is
  email-keyed; the notebook stays uuid-keyed, `0094`'s rule) and carries **NO
  GRANT** -- granted it would be a probe for who is on a roster.
  `is_admin()` is spelled out inside it rather than left to
  `classroom_manages_section`, because the enrollment scan is what would carry
  it and a student with no enrollment at all has nothing for that scan to find.

### One payload, two guards

`0099` built the render-a-student's-notebook payload for an ADMIN. An
instructor opening a name on the grid wants the identical screen, so the SHAPE
is extracted into the no-grant `_notebook_student_payload` and both callers
share it. `notebook_view_as_notebook` keeps `_classroom_view_as_guard`
(`is_admin()`); `notebook_review_student_notebook` has its own -- teacher of
record of a section this student is ACTIVELY enrolled in, or the chair. Sharing
the guard either way would lock instructors out or hand an admin surface to
every teacher. It is still the only function in the `notebook_view_as%`
namespace, which that suite enumerates.

**The payload can never be a wider door than the ordinary read**: it returns all
of that student's entries, which is exactly what the policy now allows either
caller to select directly. Test-pinned against the caller's own visible set.

**It raises rather than answering null**, because an empty notebook is a REAL
state (`0094`: enrolled, never signed in) and the two must not be confusable.

### Surfaces

`/notebook/review/student/[studentEmail]` mounts the SAME `NotebookView` with no
write transports, and `0106` ships no write counterpart -- read-only is a
property of the surface area, not a discipline. It is NOT under
`/classroom/view-as`: that tree's layout guard is `is_admin()`, so sharing it
would mean loosening it for every page under it or branching it per child. It
404s on refusal (the `/admin` rule), and inherits the `/notebook` authed-prefix
303 for anonymous visitors (curl-checked).

The grid's student name becomes that link. `ReviewConsole.studentNotebookHref`
MIRRORS the RPC's guard rather than guessing: a chair gets every row, an
instructor gets everyone except a student who has LEFT -- so no link ever points
at a 404, and that student's filed work stays reachable cell by cell.

### Notes on check-in entries: a UI gap, not a data-layer one

**`notebook_add_note` (0078) already permitted this** -- it takes an entry id
and checks only ownership -- and every entry card already offered "Add a note"
on any tier. What was missing was doing it in the SAME action as the upload,
which matters on a check-in and not on the free path: a free entry can be saved
as a note instead, while a check-in must have a page. So an optional Note field
now sits beside the photo stager on the check-in path, sent through `addNote`
immediately after `notebook_create_entry` returns.

- **The photo requirement is unchanged**; the note is absent from `canSubmit`,
  so a photo alone still saves and a note alone leaves submit disabled.
- **Editing stays refused**, matching `notebook_edit_note`: the saved entry
  renders the note with no edit control and the "cannot be edited" hint.
- **ONE editor block serves both jobs.** A second instance inside the `{:else}`
  would sit at a different DOM position, so switching between "write a note" and
  a check-in would remount Tiptap and silently drop the draft.
- The note is sent FIRST, before the slow photo uploads, and a failure keeps the
  draft (`resetForm(keepNote)`) rather than clearing text the student cannot get
  back.

### Verified

- **`tests/notebook-instructor-access.test.ts` (25 tests)**, on real embedded
  Postgres. Every "can" has a matching "cannot" over the SAME shape of row --
  free-form, no section, differing only by whose roster the author is on. Covers
  the free-form entry reaching its instructor and no other, per-teacher totals,
  the unattached-staff and student boundaries, the departed student in both
  directions, the delegated photo/note/folder surfaces, the RPC's every refusal,
  the payload never exceeding the direct read, no anon grant, the two no-grant
  helpers reachable by nobody, no write counterpart, and the file re-applying
  twice.
- **MUTATION-CHECKED FOUR WAYS.** Widening the predicate to any staff reddens
  12; reproducing the pre-`0106` world reddens 6 (including the headline);
  dropping the RPC's own guard reddens 4; making it a strict replacement instead
  of a union reddens 2. Migration restored byte-identical (md5-checked).
- **`tests/notebook-security.test.ts` was REWRITTEN, not worked around**, for
  the two assertions the new rule genuinely changes: its `bob` is enrolled in
  BOTH sections, so both instructors now read his whole notebook. The boundary
  either side of him is unchanged and still asserted.
- **`0106` is in the shared harness chain**, so every notebook suite runs the
  real current policy. The two suites explicitly pinned to an earlier
  migration's world (`notebook-classroom-sections`, `notebook-session-postings`)
  filter it out alongside what they already filter.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **831/831 across 36 files** (was 806/35).
- **Browser-verified** in `/dev/notebook` and `/dev/notebook-review`: a note
  typed on a check-in left submit DISABLED until a photo was staged, then a real
  submit issued exactly `POST upload (session_id, section_id)` followed by
  `POST add-note entry_id=...`; the saved entry showed the note with **0 edit
  controls**, "Add a note" still offered and the cannot-be-edited hint present; a
  draft typed in note mode SURVIVED switching to a check-in (label changing
  "Note" -> "Note (optional)", stager returning); the read-only preview measured
  **0 forms, 0 file inputs, 0 note editors, 0 add-note/add-photo/pin controls**;
  the grid linked the four enrolled students and left the `left`-chipped one
  plain as an instructor, and linked all five as chair; the locked density
  contract held (every cell exactly 30.39px = 1.9rem, Share Tech Mono, all six
  glyphs ✓ ⤴ ○ ! E –, table scrolling in its own container); 375/375 at phone
  width with a real cell click still opening the panel; zero window errors.
- **NOT verified: the live Supabase project.** The local `.env` is the
  placeholder project, so `0106` has never been applied anywhere. Apply it by
  hand after `0105` and spot-check with two real accounts that a teacher sees a
  free-form entry of their own student and nothing of a student they do not
  teach.
- **Also not verified: screenshots.** The Browser pane does not composite, so
  every visual claim above is a measured DOM or computed-style read. **And the
  grid's name link is a 22px inline target rather than 44px** -- deliberately,
  because the row geometry is a locked contract and inflating it to reach 44
  would break a documented invariant to satisfy a guideline meant for standalone
  controls.

