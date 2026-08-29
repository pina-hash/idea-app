---
title: "Classroom (Google Classroom replacement, `0082`)"
date: 2026-08-10
branches: []
migrations: ["0081", "0082"]
subsystems: ["IDEA Classroom"]
record_order: 56
---

The classroom module: courses, sections, email-keyed enrollments, and
section-scoped posts (announcements) + assignments with linked resources.
Migration `0082_classroom.sql` (apply manually after 0081). This bundle is
CONTENT + ROSTER ONLY -- deliberately no submission or response tables; the
assignment engine and file submission are later bundles that attach by FK to
`classroom_assignments (id)` with no schema rework (an assignment is one row
PER SECTION, so a student's submission references their own section's row).

- **Keyed by lowercased email, not user id** -- the coin-economy convention
  (0070/0073): `classroom_enrollments` PK is `(section_id, student_email)`, so
  a roster imports before a student has ever signed in and their classes are
  simply there on first login. `classroom_sections.teacher_email` applies the
  same idiom to staff.
- **Teacher authority is PER SECTION, by teacher of record** --
  `classroom_manages_section()` = `teacher_email = current_user_email()` OR
  `is_admin()`. This is deliberately NOT the 0067 admin tier: a teacher
  manages exactly their own sections, and `is_admin()` is the cross-section
  override (which is what gives the pinned owner, apina@boscotech.edu,
  visibility and control across all sections). `classroom_is_staff()` (any
  @boscotech.edu email) gates only self-scoped setup: creating a course
  (create-or-get -- an existing code returns the existing row UNTOUCHED, so
  two teachers setting up IDEA100 converge and neither can rename it; explicit
  course edits are admin-only) and creating a section for YOURSELF (assigning
  a section to another teacher is admin-only). Never `is_teacher()` -- the
  0067 naming trap.
- **RLS, and where draft/published is enforced.** Students read ONLY published
  posts/assignments of sections they are ACTIVELY enrolled in -- the
  `published` check lives in the student SELECT policies themselves, never in
  app code; the manager policies carry no such check, so teachers see drafts.
  Resources delegate to `classroom_can_read_assignment()` (the
  notebook_can_read_entry pattern) so a draft's resources can never leak
  independently. Enrollments: own rows or manager -- a student never reads a
  classmate's roster row. Sections: `classroom_can_read_section()` (manager or
  enrolled). `classroom_courses` is a shared catalog readable by any signed-in
  user. ZERO client write grants or policies on any classroom table; every
  write is a SECURITY DEFINER RPC re-checking the caller inside. 0082 also
  re-grants execute on `current_user_email()` (the 0070 lesson -- the
  enrollments policy references it directly as the querying role).
- **Multi-section publish = one RPC call, one row per selected section**,
  sharing a freshly minted `group_id`; the caller must manage EVERY selected
  section or the whole call raises (one transaction, nothing partial lands --
  test-verified). Rows are thereafter independent: edits/deletes are per
  section (`classroom_update_post` takes the full new state; assignment
  updates full-replace resources when given, the tournament_set_reward_rules
  convention), and the manage console says so when editing one copy.
- **Roster import** (`classroom_import_roster`): one round trip, rows of
  `{email, name, course_code, section_label}` resolved case-insensitively,
  structured per-row results (`{total, succeeded, refused, results}`, the
  coin_bulk convention: `bad_email` / `course_not_found` /
  `section_not_found` / `not_your_section`, per-row exception handler so one
  bad row never aborts the rest). Idempotent BY CONSTRUCTION: the enrollment
  PK upserts, so re-running a file never duplicates (test-verified, count
  pinned). Enrollment removal is `active = false`, never delete (the
  archive-not-delete convention); `classroom_set_enrollment` is the
  single-student path.
- **Routes** (`/classroom` is in `authedPrefixes`; anonymous 303 to `/`,
  live-verified on all three depths). **SUPERSEDED BY PHASE 3 (`0111`) IN TWO
  PLACES, both recorded here as the original design: the Stream/Classwork pair
  is now ONE unit-grouped view, and `/classroom/manage` is a 308 to
  `/classroom/admin` with rosters and section settings moved into the section's
  own People tab. Everything else in this bullet still runs.** `/classroom` (My
  Classes -- ONE RLS-scoped sections select serves students and teachers alike,
  no role branch in the query); `/classroom/[sectionId]` (Stream = posts +
  assignment posts newest-first, Classwork = grouped Upcoming / No due date /
  Past due; an unreadable section is a 404, indistinguishable from absent);
  `/classroom/[sectionId]/assignment/[assignmentId]` (detail with a
  clearly-marked ENGINE SLOT card where the interactive engine + submission
  UI mount later -- nothing else on the page moves when that lands);
  `/classroom/manage` (teacher console; the page gate is `profiles.role ===
  'teacher'` as CONVENIENCE -- the staff marker, not privilege -- redirecting
  non-teachers to /classroom; the RPCs are the boundary). `canManage` chrome
  comes from the `classroom_manages_section` RPC, so the UI can never
  disagree with what the database will allow.
- **Components** (`src/lib/classroom/`): `classroom.ts` (client-safe types +
  pure helpers: stream merge, classwork grouping, RFC4180-lite CSV parse with
  header detection, datetime-local conversions, the
  `ClassroomManageTransports` interface) plus presentation-only `MyClasses` /
  `ClassPage` / `AssignmentDetail` / `ManageConsole` (injected transports,
  the ReviewConsole convention -- the real manage page wires them to the 0082
  RPCs on `data.supabase`, the harness answers in memory). Class cards carry
  the ONE shared gold accent (`--acc` = `--gold`, measured `rgb(200,168,72)`
  on icon/code/CTA), never a per-card color; the homepage launcher card
  (`classroom`, `requiresAuth`) declares the brass/gold `theme`
  explicitly per the notebook card's lesson. Registered in
  `site-manifest.ts` (own version badge, `contains: ['classroom']`).
- **Two real bugs found in the browser during verification, both invisible to
  svelte-check:** (1) the composer's success message was set BEFORE
  `resetComposer()`, which nulls it -- the confirmation flashed away on the
  same tick (the coin-desk runLookup lesson, re-learned); (2) `bind:value` on
  the points `<input type="number">` coerced to a number so
  `asgPoints.trim()` threw (the ReviewConsole unit-field trap, re-hit), and
  with no try/finally the throw left `composerBusy` stuck and both submit
  buttons disabled forever -- the state is `string | number` now and
  `submitComposer` clears busy in a `finally`.
- **Verified** two ways. `tests/classroom-security.test.ts` (23 assertions,
  0001+0003+0020+0067+0082 applied UNMODIFIED to a real embedded Postgres):
  student read scoping by list AND by id (posts, assignments, resources,
  sections, enrollments), drafts invisible to students / visible to the
  teacher, un-publishing closes an already-visible read (resources included),
  no direct INSERT/UPDATE/DELETE for students OR teachers (42501 across all
  six tables), students refused by every write RPC's internal check, the
  teacher-of-record boundary (foreign-section publish refused incl. the
  all-or-nothing multi-section case with a row-count pin, foreign
  edit/delete/enroll/roster-read refused, section takeover and reassignment
  refused), the pinned owner reading and publishing across sections, roster
  import idempotency + per-row refusals, the anon boundary
  (has_function_privilege / has_table_privilege), and the keep-it-honest
  assertion that plain teachers are NOT admins. MUTATION-CHECKED both ways:
  the student posts policy opened to `using (true)` reddens exactly the 3
  leak assertions, dropping `published and` from the assignments policy
  reddens exactly the 3 draft assertions; both restored byte-identical and
  re-verified green. Browser-verified in `/dev/classroom` (404 in
  production, no auth/Supabase; in-memory store + verbatim transport log)
  driving the REAL components: all four student/empty/fail-soft home states,
  stream order + draft absence, classwork grouping with amber past-due,
  teacher draft chips, assignment detail (chips, pre-wrap description,
  noopener resource links, dashed engine slot), and the full manage loop --
  create-or-get course, new course/section landing live in the composer
  targets, case-insensitive duplicate-label refusal, no-target refusal,
  multi-section publish (one copy per section, confirmed in both section
  panels AND the student view), draft save -> publish toggle flipping the
  chip, editing ONE copy leaving the sibling section's copy untouched,
  two-step delete, roster add (mixed-case email normalized) + deactivate/
  reactivate, and CSV import end to end (header row skipped, quoted
  "Reyes, Eva" field parsed, 1 imported + not_your_section +
  course_not_found refused by name, re-run leaving the roster count
  unchanged). Phone width measured exactly 375/375 on home, class,
  assignment, and manage (widest panels open); zero console errors after the
  fixes. **NOT verified: the live Supabase project** -- the local `.env` is
  the placeholder project, so 0082 has never been applied anywhere; apply it
  by hand in the SQL editor and spot-check the student/teacher boundary with
  two real accounts before real rosters go in.

