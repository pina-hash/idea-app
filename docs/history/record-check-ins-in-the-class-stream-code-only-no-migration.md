---
title: "Check-ins in the class stream (code-only; NO migration)"
date: 2026-08-14
branches: []
migrations: []
subsystems: ["IDEA Classroom"]
record_order: 51
---

## Check-ins in the class stream (code-only; NO migration)

A notebook check-in appears in its class's Stream, alongside announcements and
assignments, showing the student's own status and linking into their notebook
with that check-in preselected. Plus an outstanding count on the class page's
notebook link. **No schema change: this reads `0098` and `0069` as they stand.**

### THE CONSTRAINT, and what enforces it

**A CHECK-IN NEVER BECOMES A SUBMITTABLE, SEPARATELY GRADED CLASSROOM ITEM.** A
notebook unit is already graded exactly once, as a Documentation Check
assignment through `notebook_unit_items` -> `classroom_submissions` (`0097`); a
second scoring path for the same work would break the single-number-per-student
guarantee that integration exists for. So a check-in is a NOTICE with a link,
and it carries no submission, rubric, points or due date anywhere in this flow.

That is structural, not a discipline. `ClassCheckIn`
(`src/lib/classroom/class-check-ins.ts`) has no field a grade could attach to,
`StreamEntry` is a DISCRIMINATED UNION (`{kind:'item', item}` vs
`{kind:'check-in', checkIn}`) so an item-shaped read of a check-in is a type
error rather than a wrong render, and the manager's card copy says it in words:
"Recorded in the notebook, not handed in here."

### A SECOND SOURCE MERGED AT THE PAGE, and the schema decides that

Extending the stream query was never available: check-ins live in
`notebook_session_postings` + `notebook_sessions`, which have NO foreign key to
`classroom_items`, so PostgREST has nothing to resolve an embed through. That
constraint agrees with the one above -- the only way to put a check-in in the
stream is as its own kind of thing. The load reads them separately and
`streamEntries` merges.

- **Item order is `streamItems`' and is NOT recomputed.** That function owns
  real rules (pinned block first, then manual `sort_order`, then newest), and a
  merge that re-sorted by timestamp would silently discard a teacher's manual
  ordering. Check-ins are INSERTED into the finished sequence, each before the
  first non-pinned item older than its own `session_date`. **The pinned block is
  skipped** when looking for that slot: it is held at the top by choice, not by
  date. A check-in has no pin and cannot be given one -- pinning is a
  `classroom_items` column.
- **Not a separate section stacked above or below the stream.** That would read
  as a bolted-on second system, and would bury a check-in under a term of
  announcements.

### Status: whose, and how it is pinned to them

`CheckInStatus` is `filed | awaiting_review | flagged | excused | missing`.
**`late` is deliberately absent**: `notebook_get_section_grid` owns the
America/Los_Angeles calendar rule that decides lateness, and re-deriving it here
would be a second copy of a rule with one right answer. A late entry reads as
`filed`; lateness stays a review question on the grid.

A STUDENT'S status comes from two reads pinned to them TWO independent ways,
and both are load-bearing:

1. **RLS.** `notebook_entries` is own-rows-or-section-staff and
   `notebook_session_excusals` is own-row-or-section-staff. That is the
   boundary, and it is the database's.
2. **`.eq('student_id', claims.sub)`.** NOT the usual /coin-balance shape and
   NOT a substitute for the policy. It is there because those policies
   legitimately return OTHER people's rows to a different caller (this
   section's teacher), so a page computing "my status" from whatever came back
   would be correct only for as long as the branch stayed correct.
   Authorization and ATTRIBUTION are different jobs; this filter does the
   second.

A MANAGER takes neither read (`status: null` on every card): their policy would
hand them the whole class, and a teacher has no personal status on their own
class's check-in. **Verified as genuinely two guarantees:** opening the RLS
policy to `using (true)` alone leaves the suite green, and removing the
`.eq` alone leaves it green; only BOTH together redden it (3 tests, including
`expected 'filed' to be 'missing'` -- one student reading another's state). The
`using (false)` direction reddens 4. Migration and route restored byte-identical
(md5) after each.

### The outstanding count

**OUTSTANDING MEANS "STILL NEEDS SOMETHING FROM YOU", which is TWO states:**
`missing` (file a page) and `flagged` (an entry exists, the instructor asked for
another look -- `notebook_add_photo` flipping it back to `pending_review` is
that loop). `awaiting_review` is deliberately NOT outstanding: the student has
done their part. `excused` and `filed` are done.

- **STUDENT:** derived from the SAME `checkIns` array the cards render, by
  `outstandingCheckIns` in the component -- so the badge and the cards under it
  read one list and cannot disagree. The load does not return a student number.
- **MANAGER:** the CLASS's total, from `notebook_get_section_grid` +
  `gridSummary().outstanding` -- the same call and the same summarizer the
  manage console's compliance element already uses (`0099`), so the two
  surfaces cannot report different totals for one class. Manager-only, in
  parallel with the other loads, fail-soft to no badge. The cost is honest: it
  returns the whole roster x check-ins grid to count part of it, and a lighter
  count would mean re-deriving the roster and the cell rules outside the one
  function that owns them.
- **ZERO RENDERS NOTHING** (`outstandingBadge`), for a manager as well as a
  student: absence is the correct signal for nothing due, and a zero badge is a
  notification that there is no notification.

### The deep link, and the shared-check-in bug it exposed

`/notebook?checkin=<session>&section=<class>`, validated in the notebook's own
server load against `sessions` -- the list it just built from the student's own
classes -- so the parameter can only ever pick something the page was already
offering and grants no reach of its own (the `/notebook/review` `?section=`
precedent). `NotebookView` reads it ONCE at setup and seeds `sessionTouched`,
which is what makes the nearest-outstanding default effect stand down; it
applies only while the check-in is still OUTSTANDING.

**BOTH IDS RIDE THE LINK, and that fixed a real pre-existing crash.** Since
`0098` an entry is filed against a (check-in, class) PAIR, and a student
enrolled in two classes that share a check-in gets TWO postings with the SAME
id. The quick-picks were keyed `(s.id)`, so that student's notebook died on
`each_key_duplicate` -- reproduced in the browser, the page rendering as a bare
"IDEA" shell. Fixed three ways together: the key is the pair, `chooseSession`
takes the pair, and `selectedSectionId` is held beside the id instead of being
looked up from it (`sessions.find(s => s.id === ...)` silently resolved to
whichever posting sorted first, filing under a class the student did not pick).
The pending-capture marker carries the section too.

### Deliberately NOT done: the homepage ClassroomFeed

Check-ins are NOT in the home feed, and the reason is not only the type.

- **It would reshape the feed's data model.** `FeedEntry` is `{item:
  ClassroomItem, reason, count?}`, and `item` is load-bearing in `compare`
  (`due_at`/`created_at`), `feedIndicator`, and `ClassroomFeed.svelte`'s row
  key, href and icon. Admitting check-ins means turning that struct into a
  discriminated union and following it through all three.
- **THE STRONGER REASON IS THE TEACHER SIDE.** Ranking a check-in needs, per
  section, its check-ins plus the caller's own entries and excusals -- three
  more reads on the site's landing page for every signed-in user. And for a
  MANAGER there is no per-student status at all, so "outstanding" would mean
  `notebook_get_section_grid` ONCE PER SECTION on the homepage. A
  student-only feed feature would be an asymmetry the module has nowhere else.

The class stream is where a check-in has its context, and the badge on the
notebook link is the at-a-glance signal. Revisit if the homepage is ever the
place students say they miss them.

**Also not done: the view-as tree.** Its whole payload is
`classroom_view_as_section`, which returns items only, and a check-in STATUS is
per student -- so showing one would mean reading the ADMIN'S own notebook rows
under the student's name (wrong) or a new view-as RPC (real scope, and `0099`'s
rule is that view-as reads are one admin-gated function, never an assembled
query). `checkIns` is simply not passed there.

### Verified

- **`tests/classroom-notebook-checkins.test.ts` (16 tests)** drives the REAL
  class page `load` through the PostgREST shim against the real chain
  (`0001`..`0098`, `0097` included so the constraint has real tables to be
  asserted empty). THE CONSTRAINT: the whole flow -- teacher page, both
  students' pages, a real filing -- leaves `classroom_items`,
  `classroom_postings`, `classroom_submissions`, `classroom_rubrics` and
  `notebook_unit_items` all at zero, and a `ClassCheckIn` is asserted to carry
  none of `points`/`due_at`/`kind`/`rubric`/`submission`/`published`. Kept
  honest by the last test, which posts a REAL announcement and asserts the same
  counters read 1 -- so the zeros are a measurement, not an always-empty read.
  Plus the three-section fan-out (all three streams, each carrying its own
  posting), status isolation (filed vs missing on one check-in in one class;
  per-class scoping of a shared check-in; an excusal reaching only its subject;
  a manager's nulls; a foreign class 404ing), the count's full lifecycle
  (missing -> filed -> flagged -> awaiting_review), and a class with no
  check-ins rendering an untouched stream.
- **`tests/db/postgrest-shim.ts` gained named-argument RPCs**, which is what
  lets the real load (`classroom_manages_section`,
  `notebook_get_section_grid`) be driven at all. Built in NAMED notation
  because that is what PostgREST does, so a caller naming a parameter the
  shipped function does not have fails loudly.
- **`tests/notebook-page-load.test.ts` grew 5 assertions** for the deep link
  (a real check-in resolves; absent is null; another student's check-in refuses
  even though they can READ the row; junk resolves to null without failing the
  page; no section falls back to the only posting). Its `runLoad` now passes a
  real `URL` -- the load's event contract grew, and that suite caught it.
- `npm run check`: 0 errors, 36 warnings (the same 36 as HEAD). `npm test`:
  **699/699 across 31 files** (was 678/30).
- **Browser-verified** in `/dev/classroom` and `/dev/notebook` (both extended:
  a check-in fixture whose session ids match the existing notebook-grid
  fixture, a shared check-in posted to two of one student's classes, a `class
  has check-ins` toggle, and `?checkin=&section=` driven from the harness's own
  URL). The student stream interleaves by date
  (`Bridge sketch Aug 12 / Gearbox build Aug 12 / Welcome Aug 11 / Shaft
  stackup Aug 10 / Bearing teardown Aug 8 / Sketchbook check Aug 4`) with a
  badge of **2** -- missing + flagged, the filed one correctly not counted;
  the teacher's reads **7**, which is `late 1 + pending 1 + flagged 1 +
  missing 4` off the same grid the manage console summarizes, with every card
  carrying no status; Period 2's student shows `Excused` + `Not filed yet` and
  a badge of 1; and with the toggle OFF the stream drops to exactly its 3
  items in exactly their original order with no badge. **The deep link end to
  end:** `?checkin=ses-4&section=sec-2` selects the SECOND of the two shared
  postings and a real submit through the real picker sends
  `{session_id: ses-4, section_id: sec-2}`, while `&section=sec-1` selects the
  first and sends `sec-1` -- so the class genuinely follows the link rather
  than being a constant. 375/375 at phone width with no overflow and the
  `.section-line` links unchanged at 14px. Zero trapped errors across eight
  views; `/dev/home-feed` renders its identical ranking and Reference shelf.
- **NOT verified: the live Supabase project, and no screenshots.** The local
  `.env` is the placeholder project, so none of this has been exercised
  against real classes; the Browser pane does not composite, so every visual
  claim above is a measured DOM or geometry read. Spot-check with two real
  student accounts in one class that each sees only their own status.

