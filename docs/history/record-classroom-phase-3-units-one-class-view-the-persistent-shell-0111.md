---
title: "Classroom Phase 3: units, one class view, the persistent shell (`0111`)"
date: 2026-08-16
branches: []
migrations: ["0111"]
subsystems: ["IDEA Classroom"]
record_order: 46
---

Migration `0111_classroom_units.sql` (apply manually after `0110`) plus a
navigation rework. The module had grown feature by feature, so every capability
owned a route with no structure between them, and the Stream/Classwork pair was
inherited from Google Classroom rather than fitted to these courses.

**`0111` TOUCHES NO EXISTING FUNCTION, POLICY OR GRANT.** It adds one table, one
nullable column and five new functions. That is what makes "no permission
boundary moved" checkable rather than argued: there is nothing in the file that
could have moved one.

### Units belong to the COURSE; the assignment belongs to the canonical item

`classroom_units` (name, `sort_order`) is scoped to `course_id`, and
`classroom_items.unit_id` is a column on the CANONICAL record -- never on a
posting, which since `0085` deliberately carries no state of its own. So an item
posted to three classes is filed ONCE and all three read the same answer by
construction rather than by three writes staying in step.

That forces the unit to be reachable from every class the item appears in, which
is why it belongs to the course rather than the section: IDEA209H runs three
sections on identical pacing (the fact `0098` exists for), so "Unit 1" is a fact
about the course. A section-scoped unit would mean creating "Unit 1" three times
and having an item filed into one read as unfiled in the other two.

- **ACCEPTED DEGRADATION:** an item posted across sections of DIFFERENT courses
  carries the unit of whichever course it was filed under and reads as unfiled in
  the other. Honest, and rare -- the "Not in a unit" group renders it fine.
- **FILING IS NOT AN EDIT.** `classroom_set_item_unit` never stamps `edited_at`,
  for the reason `classroom_set_item_pinned` does not: it changes where an item
  sits, not what it says, so it must never raise a student's Updated badge
  (`0104`'s whole subject). Test-pinned.
- **A DUPLICATE LANDS UNFILED**, and `classroom_duplicate_item` is deliberately
  NOT recreated to change that -- recreating it would mean copying `0101`'s body
  forward, the "diff it against the source" trap `0109` wrote down.
- **Deleting a unit UNFILES its items** (`on delete set null`), which is what
  makes a real delete safe to offer at all -- the notebook-folder doctrine.
- Reads mirror `classroom_courses` exactly (`using (true)`): a unit is a name in
  the shared catalog, and scoping it tighter than the course it belongs to would
  be inconsistent for no gain. Zero client write grants; four SECURITY DEFINER
  RPCs gated on `_classroom_manages_course` (an admin, or the teacher of record
  of at least one section of it). Filing takes the stricter
  `_classroom_manages_item` bar, because the unit lives on the canonical record.
- `unit_id` gets its OWN rung in `selectItemsWithDoc` (`ITEM_SELECT_UNITS`),
  never folded into `ITEM_SELECT_SCHEDULED` -- the deploy-ordering rule that
  constant documents. Degrading costs the GROUPING and nothing else:
  `classGroups` treats an item with no unit column as unfiled, so a pre-0111
  deployment renders the one chronological list it always had.

### One class view, not two tabs

`ClassView.svelte` replaces `ClassPage.svelte` (deleted). Stream duplicated the
home feed, which already ranks by urgency and does it better; Classwork grouped
by due-date buckets these courses are not organized into.

- `classGroups(items, units)` groups by unit in the teacher's order, unfiled
  LAST -- the authored structure is the page's spine, and new content must not
  push Unit 1 down. Within a group: pinned first, then manual order, then newest,
  which is `streamItems`' own rule, so a class with no units reads as the Stream
  did. **An empty unit shows for a MANAGER** (it is a file-into target) and is
  hidden from a student.
- **COMPACT ROWS**: one line carrying kind (glyph AND word, never colour alone),
  title, due date, status and attachment/link counts, expanding in place for
  detail. Measured **50px per row at desktop** -- thirty items in ~1500px.
- **A STUDENT ALWAYS SEES THEIR OWN STANDING** on an assignment: not started, in
  progress, submitted, or returned with the score. `studentWorkMap` reads one
  RLS-scoped submissions select with NO student filter (the /coin-balance
  doctrine), run only for a non-manager -- a manager's own policy would hand them
  the whole class, and they have no personal standing on their own assignment.
  **No row at all IS "not started"**, and it renders rather than staying silent.
- **MANAGEMENT BEHIND ONE MENU.** Edit / Pin / Copy / Move / Grade / Delete moved
  off the row into a per-item menu (two clicks to any of them), with the two-step
  delete kept. Four buttons per row gave managing the class the same visual
  weight as the class. **Filing stays ON the row** as a labelled select: the
  brief asks for it to be fast, and it is the one action a teacher repeats.
- **CHECK-INS RIDE THE UNFILED GROUP.** They have no classroom unit, so the label
  is literally true of them; matching a notebook unit NUMBER against a freely
  named classroom unit would be a guess dressed as a link.
- Collapse is persisted per USER in `profiles.preferences.classroomUnits`,
  **keyed `<sectionId>::<groupId>`** -- a unit id is the same in every section of
  its course, so without the section in the key, folding Unit 1 in Period 2 would
  fold it in Period 4 as well.
- The **export-failure chip (`0110`) moved here** from the retired console, which
  is where a manager used to see their content listed. It was not dropped.

### The persistent shell

`+layout.server.ts` loads the caller's sections ONCE for every /classroom route
and `ClassroomShell.svelte` renders the masthead, the section switcher, the
breadcrumb trail and the section tabs. Every page dropped its own `.app-header`.

- **THE LAYOUT'S KEYS ARE PREFIXED `nav*`.** Layout and page data merge with page
  keys winning, and several pages here return their own `sections` (a manager's
  full list; an EMPTY array for a student) -- a shell reading `data.sections`
  would render an empty switcher on exactly the pages a student uses most. The
  `userProfile` convention, applied again.
- Routing knowledge lives in `$lib/classroom/nav.ts` (pure) and the layout; the
  shell takes finished props, so the harness mounts it with no router.
- **view-as gets a MINIMAL shell** (no switcher): that tree renders somebody
  else's classroom under an impersonation banner, and a switcher listing the
  ADMIN'S own classes beside a student's name would be actively misleading.
- **A `z-index` FIX THE BROWSER FOUND, and it is the documented trap:**
  `.cr-root .app-header` and `main` both sat at `z-index: 1` in the same stacking
  context, so `main` won the tie and painted over anything the masthead dropped
  below it -- the switcher menu was visible with three of its five rows not
  clickable at phone width. The header is `z-index: 2` now; every masthead
  dropdown in the module benefits. The notebook's theme picker hit this exactly.

### Teacher tabs, and the manage console dissolved

`/classroom/[sectionId]/people` and `/grades` are real routes, so tab state is in
the URL and the back button works. **Both 404 a non-manager, never redirect** --
an enrolled student can legitimately read the section, so a bounce would confirm
the tab exists while a 404 says nothing (the `/admin` rule). Students are offered
no tabs at all.

- **People** = the roster (add, correct, deactivate, CSV import) plus the class's
  own settings, both moved out of the global console into the class they belong
  to. Its CSV importer is section-scoped: the file carries only `email, name` and
  the class comes from the page, mapped onto the SAME `RosterRow` the SAME
  `classroom_import_roster` takes -- no new write path and no new authority.
- **Grades** lists every assignment with what is waiting to be marked and a
  direct path into the console, computed from rows the caller could already read
  (`classroom_can_review_submission` is the same policy the console runs under).
  It replaces opening each assignment in turn to find out.
- **`/classroom/manage` is a 308 to `/classroom/admin`**, which keeps only what
  genuinely has no single class to live in: courses, creating a class, and the
  feedback and view-as doors. `ManageConsole.svelte` is DELETED, not left as a
  second way to do the same things.
- **NOTHING THE CONSOLE DID WAS DROPPED**, which is the part worth checking when
  a page is dissolved: its notebook compliance summary (`0099`) moved to People
  with the roster it describes, and its export-failure chip (`0110`) moved to the
  class view's rows, where a manager now sees their content listed. Both were
  re-verified in the browser against the same fixtures they were verified on.

### Verified

- **`tests/classroom-units.test.ts` (18 tests)** drives the REAL loads from the
  REAL routes against real embedded Postgres through the PostgREST shim. The
  teacher-tab denial is asserted for EVERY section in the fixture and for both
  students, with a CONTROL (the same student reading the class page) so the
  assertions are not indistinguishable from "these routes 404 everybody". The
  consistency claim is four independent reads of one fact -- teacher and student,
  both classes -- checked at the column AND through `classGroups`, plus refile,
  unfile, the `wrong_course` refusal, and that filing never stamps `edited_at`.
  **MUTATION-CHECKED BOTH WAYS:** removing the People gate reddens 2, dropping
  the `unit_id` rung reddens 6; both restored byte-identical (md5).
- **A REAL BUG THE BROWSER FOUND, and `svelte-check` could not:** the unfiled
  group was built with `streamEntries`, whose first half is `streamItems` --
  which DROPS MATERIALS (right for the Stream, since a syllabus resurfacing in a
  feed is what pinning was for). Every material silently vanished from the class
  view. The insertion half is now `mergeCheckIns`, and `streamEntries` is a thin
  wrapper over it so its own suite is untouched.
- **A PRE-EXISTING SHIM GAP found and fixed:** `tests/db/postgrest-shim.ts` could
  not parse PostgREST's `alias:table!inner(...)` form, so `itemsForSection` --
  the module's most-used read -- had ALWAYS resolved to PGRST200 and returned
  nothing through it, and no suite noticed. The shim resolves the alias and
  applies filters written against an embed now, which makes every existing
  item assertion that runs through it meaningful.
- **TWO ASSERTIONS IN `classroom-item-doc.test.ts` WERE CHANGED**, and they are
  the only existing test edits: they hardcoded the degrade chain's LENGTH (3 and
  2), which adding a rung necessarily changes. They assert the walk's SHAPE now
  (widest first, one column given up at a time, ending on the plain select), so
  the next migration's rung cannot break a test about degrading. No access
  assertion moved.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **1051/1051 across 43 files** (was 1033/42).
- **Browser-verified** in `/dev/classroom` (extended with units, a unit-transport
  mirror of 0111's semantics, seeded submissions covering all four student
  states, People/Grades/Admin/Shell views and a `units (0111) applied` toggle):
  filing three items moved them into their unit groups and the SAME item posted
  to two classes read Unit 2 in BOTH; the four student states rendered in
  distinct tones with drafts and teacher controls absent; the menu carried all
  seven actions at 36px with the two-step delete arming and writing nothing, and
  dismissing on an outside press; units created, reordered (the class view's
  group order following immediately), the duplicate name refused by name, and a
  delete reporting "1 item moved to Not in a unit" with the item surviving; a
  two-column CSV landing in the class being viewed; the shell's switcher,
  crumbs and tabs correct across six pathnames with students getting no tabs;
  and the 0111-off toggle rendering one bare chronological list with everything
  else working. **375/375 with zero overflow on all six surfaces**, 40px on every
  control this pass added, and an armed `window.onerror` caught ZERO errors
  across ten views.
- **NOT verified: the live Supabase project, and no screenshots.** The local
  `.env` is the placeholder project, so `0111` has never been applied anywhere.
  **Apply it by hand after `0110` BEFORE deploying** -- without it the class view
  degrades to one ungrouped list (never broken), but the unit controls would call
  functions that do not exist. Then check with two real accounts that a student
  cannot open `/classroom/<id>/people` and that an item posted to two classes
  reads the same unit in both. The Browser pane does not composite, so every
  visual claim above is a measured DOM or computed-style read.

