# Proposed SQL from the overnight run (ledger 0298)

**These files are proposals, not migrations. Nothing applies them, and nobody should paste them
as they stand.** They were written on the night of 2026-09-25 while the automatic migration apply
(`.github/workflows/migrate.yml`) was failing on a rejected database password, so rule 1 of
`docs/feedback/2026-09-25/OVERNIGHT_BRIEF.md` held: nothing goes under `supabase/migrations/`, and no
shipped code calls an RPC, column or table that production does not have (production holds exactly
the files in `supabase/migrations/`, highest 0224).

Each proposal carries the numbers the brief reserved for it (0228 for decision 37, 0229 for
decision 38), a header saying what it does, what undoes it and its deploy ordering, apply-time
self-checks that raise, and a `tests/db/` test that applies it **from this directory** over the real
chain through 0224. A proposal is only as good as that test: run it before trusting anything here.

## How to apply one later

1. A session with working credentials (or Mr. Pina, by hand) **promotes** it: `git mv` the file to
   `supabase/migrations/` under the same name, and change the one path constant at the top of its
   test. Then check the test's chain filter covers every migration that has landed BELOW the
   proposal's number by then, because that is what production will hold when it applies. 0228's
   test takes every file below 0228 on its own; 0229's pins 0224 on purpose, so if any of 0225 to
   0228 has landed first, raise that bound before trusting a green run.
2. Run that one test file (`npx vitest run tests/db/<its test>`), read the `Tests` summary line and
   stderr, and follow the file's own "PROMOTING IT" notes (a CLAUDE.md edit, a `docs/history/`
   entry, a ledger entry).
3. Land it on `main`. `migrate.yml` applies the lowest unapplied migration on each push, one file per
   push; `node tools/apply-migration.mjs <number>` is the same thing by hand, and a paste into the
   Supabase SQL editor is the fallback. Paste the verification query at the foot of the file
   afterwards.
4. Numbers 0225 to 0227 were allocated to other ledgers (0285, 0296, 0297) and no file exists for
   any of them tonight. Gaps in the sequence are normal in this repository; a proposal promoted here
   applies after whatever lower number has landed by then.

## Order

**0228 first, then 0229.** They touch different subsystems (the classroom answer write and IdeaCAD's
write predicates) and do not depend on each other, so the order is only the lowest-first rule. The
**split-out lock change** described inside 0228 (see below) needs a number of its own from the
ledger and must land **after** 0228: it refuses to apply without 0228's table.

## 0228: an answer's edit history (decision 37)

- **File:** `0228_classroom_response_revisions.sql`. **Test:**
  `tests/db/proposed-0228-response-history.test.ts` (19 tests, green, about 5 s: the full chain
  through 0224 is 220 files).
- **What it does.** A new append-only table, `classroom_response_revisions`, written inside
  `classroom_save_response` (the one function that writes student answers), for a spec assignment
  and a ported HTML worksheet alike. One revision per block per 10-minute burst (measured from the
  start of the burst), frozen at every grade and regrade, with a **baseline** revision that keeps an
  answer stored before the table existed the first time it is overwritten. A save that changes
  nothing records nothing. Teacher and admin read it (the grading console's own
  `classroom_can_review_submission`); a student, a classmate and a teacher of another class read
  nothing; `anon` holds nothing; no client role can write it. Kept for as long as the assignment
  exists: no delete path, no expiry.
- **What it deliberately keeps.** Every refusal the save gives, in the same order, and the success
  payload `{"ok": true}` byte-for-byte: the test puts a 39-case corpus (21 refusals, 18 successes,
  both engines, both locks, grading, approval) to the deployed function, applies the proposal over
  the same database and compares case for case. **0 differences.** So it has **no deploy
  ordering**: it is additive, and the migration and any client deploy may land in either order.
- **The lock change is split out, not in this file.** Decision 37 item 2 (a student's own completion
  must stop locking saves) done the obvious way ("lock only an instructor's close") would silently
  break the close Mr. Pina asked for in 0198: the test measures that closing an assignment leaves a
  student's own turned-in row **byte-identical** (`changed: false`), so no rule over that row can
  tell "turned in" from "turned in, then closed". Doing it right needs a `closed_at` column and
  re-signs seven live functions (the five that refuse a write as `locked`, at seven checks, plus
  close and unsubmit), so it gets its own file, stated precisely in 0228's header (items a to h),
  which must land after 0228. Item b lists the five: missing `classroom_open_submission` would
  leave every camera upload locked while typing is open. Item h is the backfill for closes given
  before `closed_at` exists, without which a returned-then-closed row silently re-opens.
- **Safety nets inside the file.** It refuses to replace `classroom_save_response` unless the
  deployed body is exactly 0197's (md5, carriage returns ignored), so it cannot silently revert a
  later hotfix; it checks the table's columns, the one overload, every refusal literal, the position
  of the new call (after the last refusal, before the write), the grants, and that the one policy is
  the reviewer rule alone; and it runs a rolled-back fixture that exercises the baseline,
  coalescing, the no-op and the grade boundary on the real server.
- **Measured tonight** (all from the test): mutation proof on the read rule and the boundary, each
  file copy restored from a saved copy and md5-checked. `using (true)` on the policy is refused at
  apply by the self-check; with that check disabled too, the READS test catches it (a teacher saw 23
  rows where 22 belong to their class). A student branch added to the policy (check disabled) is
  caught by the same test (the student read his own 7 revisions where 0 is right). Removing the
  grade boundary is refused at apply; with the fixture's grade half disabled, two boundary tests
  fail. Granting `anon` SELECT is refused at apply.
- **Known limit, written in the header (reasoned, not measured):** a save that lands while a grade
  is being written can be absorbed into the pre-grade revision. The window is a few milliseconds
  for one student (before the grade's upsert takes the row, or always when no row exists yet), and
  the whole batch for the last student in a bulk grade. The revision shows it: `saved_at` later
  than the grade while `after_grade_at` is older.
- **Undo** (in this order, by hand): re-run section 4 of
  `supabase/migrations/0197_classroom_html_assignment_write_gate.sql`, then drop the helper, then
  drop the table (which loses every recorded revision).

## 0229: a live class EDIT grant on an IdeaCAD document (decision 38)

- **Files:** `0229_ideacad_class_edit_grant.sql` and its undo, `undo-0229_ideacad_class_edit_grant.sql`
  (named so it can never be taken for a migration). **Test:**
  `tests/db/proposed-0229-class-edit-grant.test.ts` (37 tests, green, about 7 s over the same full
  chain through 0224).
- **What it does.** A teacher can give a whole class edit access to one LIVE IdeaCAD document, blade
  or direct (solid). "The class" is read from `classroom_enrollments` at every write, so a student
  who joins later can edit from the statement that enrolls them, and a student who is deactivated
  loses access in that same statement. It is one new table, `ideacad_section_edit_grants` (keyed
  `(document_id, section_id)`, **no role column**: every row means editor), plus three new functions
  (`ideacad_grant_class_edit`, `ideacad_revoke_class_edit`, `ideacad_class_edit_grants`), all
  returning `{ok: false, reason, message}` refusals, and one private helper,
  `_ideacad_class_edit_reach`, which no client role holds. The grant and the list both report
  `activeStudents` (the class's active students, less the document's owner) from that one helper,
  so the two numbers a teacher sees cannot disagree. It also inserts ONE arm into
  `_ideacad_document_role` and one union arm into `ideacad_shared_with_me` (blade discovery). Every
  write gate already asks the role, so the class editor reaches the concept writers,
  `ideacad_apply_actions`, the part-writer assembly writes, `ideacad_save_direct_document` and realtime
  send and receive, without any write gate being rewritten. The self-check refuses to apply if any of
  those gates has stopped asking the role.
- **What stays exactly as it was.** 0214's archived-only VIEWER share is untouched: its table, its
  three functions and every row in it, which all stay viewers. The test records every answer every
  seeded person gets about every seeded document: the seven gate predicates, realtime send and
  receive, and both discovery reads, 96 entries across 12 people and 3 documents. It then applies the
  file and compares: **0 differences**. It also compares the ACLs of both replaced functions byte for
  byte. There is no deploy ordering. The file is additive, and no deployed client names the new
  functions. The client that offers the control must either degrade on `PGRST202` or ship after the
  apply.
- **Decisions taken for Mr. Pina, each written in the file's header. Read the first one first:**
  1. **A class editor gets exactly what a personal editor gets, and `_ideacad_part_owner` is NOT
     widened.** Decision 38 says both write predicates must admit the class editor "or five assembly
     writes silently stay closed". Claiming a part, adding a concept to a part and setting a part's
     active concept gate on `_ideacad_part_writer`, and open on their own through its wide rung; the
     heartbeat and releasing your own hold gate on the hold itself, so they follow from the claim.
     The test runs all five as a class editor. The four writes
     that gate on `_ideacad_part_owner` directly (add a part, rename or reorder one, reassign one,
     release somebody else's hold) belong to the **assembly owner** (0207: "THE ASSEMBLY OWNER HAS
     FULL CONTROL"). A personal editor cannot do them today. `ideacad_assign_part` overrides a LIVE
     hold, so giving it to thirty students would let any one of them take a part out of a
     classmate's hands mid-edit. The test asserts that the class editor and the personal editor are
     refused the same four. Changing this is one disjunct in `_ideacad_part_owner`, and the
     self-check names the line.
  2. **Only the teacher of the target class (or an admin) may grant**, and only on a document they own
     or manage. A student owner is refused (`not_your_class`); per-person sharing stays their tool.
  3. **Revoking** is open to the document's owner, its manager, or the class's teacher. It is never
     refused because the document or the posting changed since the grant.
  4. **A grant can only add access**: a student with a personal viewer grant who is in an edit class
     is an editor.
  5. **Live documents only**: an archived or trashed document is refused. If a document is archived
     after the grant, the class can still read it but cannot write to it. Restoring it keeps the edit
     grant (restoring still deletes only 0214's viewer rows).
  6. **A blade document can only be granted to a class its assignment is posted to**, because blade
     discovery is keyed on the item. A direct document has no such rule, because
     `ideacad_direct_documents` already lists everything the caller can read.
- **Measured tonight:** mutation proof over nine mutants. The file was copied aside first, restored
  from that copy, and md5-checked (`33114b38...` before and after). Every mutant was killed:
  - dropping the live-roster (`ce.active`) term: 1 failing test;
  - dropping the "who is enrolled" term, so any grant makes everybody an editor: 7 failing tests;
  - skipping the class-teacher check: 1;
  - skipping the archived check: 5;
  - ranking a class edit grant below a personal viewer in discovery: 1;
  - letting anybody revoke: 2;
  - two mutants that change an answer that existed BEFORE the file: 2 failing tests each, both caught
    by the before-and-after comparison.

  The file's own self-check **refuses to apply** the bare `revoke ... from public` form that 0201
  used, and names all three functions. The file's own verification query (section 8) runs in the
  test: every row is ok after the apply, and the query does not pass before it.

  **Adversarial review (same night), eight more mutants, all killed, both files restored
  md5-identical:** the class edit arm without `ce.active`, and without the caller's own enrollment
  term (the permissive one), are now each **refused at apply** by the self-check, which reads the
  edit arm alone (the first draft checked the whole function body, where 0214's viewer arm already
  says `ce.active`, so it passed with the new arm missing both terms); the policy without its
  document-manager arm: 5 failing tests (that arm was not exercised before, because every owner in
  the fixture was also in the granted class); the policy made `using (true)`: 6; the reach count
  including the owner: 13; the list counting on its own with the owner included, which is what the
  first draft shipped (5 from the grant, 6 from the list, for the same class): 6; the undo leaving
  the helper behind: 1; the undo's copy of 0214's role drifting by one term: 2.
- **Known gap, not closed here:** `ideacad_beat_part` checks only that the caller holds the part. A
  deactivated class editor whose tab stays open therefore keeps a held part until they close the tab.
  Every write they try is refused, and the owner's reassign or release clears the hold. A revoked
  personal editor has the same gap today. Closing it narrows `ideacad_beat_part`, so it needs its
  own file.
- **Undo:** paste `undo-0229_ideacad_class_edit_grant.sql` by hand (the apply tool refuses its drop
  table). It re-creates 0214's `_ideacad_document_role` and `ideacad_shared_with_me` **first**,
  copied verbatim from 0214 (the test asserts the copy), then refuses if anything outside 0229
  still names the table or its functions, then drops the four functions and the table. The test
  applies it twice and asserts that **every function in `public` is back to exactly its pre-0229
  source and ACL**, and that 0229 applies again afterwards. **Do not undo by re-pasting 0214's
  sections 4 and 7 whole**: they also hold `_ideacad_can_write_document`, `_ideacad_part_owner` and
  three share functions that 0216 replaced, and pasting them reverts 0216's refusals for direct
  documents. The undo is only correct while 0229 is the last file to replace those two functions.
- **Promoting it also means** two more edits:
  - classify the three client functions in `tests/db/ideacad-grants-anon-execute-surface.test.ts`
    (and `_ideacad_class_edit_reach` as definer), and add the table to its `IDEACAD_SELECT_TABLES`
    (that test fails on an unclassified IdeaCAD function);
  - edit CLAUDE.md's "A CLASS GRANT IS A SECOND TABLE AND IS ALWAYS A VIEWER" paragraph in place,
    naming decision 38.

  **Re-pasting 0214 after this file silently removes the class editor**, so re-paste this file after
  it.

## Unnumbered: a teacher's read of finished worksheets, for the Grades tab and the home tally (decision 37)

- **File:** `NNNN_classroom_worksheet_answers.sql`. **It needs a number from the ledger before it
  is promoted**: none was reserved for it (it came out of the consistency follow-up to Tier A item
  3, after 0228 and 0229 were allocated). **Test:** `tests/db/proposed-worksheet-answers.test.ts`
  (8 tests, green, about 5 s over every migration in `supabase/migrations/`, 0001 to 0224). On
  promotion, change its path constant and bound its chain below the new number.
- **Why it exists.** Finishing a ported HTML worksheet is turning it in, and that is derived from the
  student's answers by `hxCompletion`. Tonight the class page, the home page, My Classes, the to-do,
  the grading console's roster and (new tonight) the Live tab's grid all say Complete. **The Grades
  tab and the teacher's home to-grade tally still do not**, because they summarise a whole class and
  would have to read every student's answers, and `classroom_responses` is policed per row: the
  review predicate runs once for every answer. Measured on the test cluster as a non-admin teacher,
  one class of 30, three worksheets of 20, 40 and 60 blocks (3,150 answers):

  | read | time |
  | --- | --- |
  | the Grades tab's load as it stands | 17 to 44 ms |
  | a bare `count(*)` of those answers through RLS | 507 to 616 ms |
  | the paged read the client makes (`readWorksheetCompletions`) | 2,273 to 2,595 ms |
  | the same with four classes of 30 on those worksheets (12,600 answers) | count 4.9 to 5.2 s; the paged read passed its 10,000-row cap and answered "cannot tell" |
  | **this function, narrowed to the one class** | **36 to 51 ms, at one class and at four** |
  | the client half on its answer (manifests plus `worksheetCompletedAt` for 90 pairs) | 27 to 31 ms |

  So the Grades tab was **left exactly as it is tonight** (the brief's bar was under about 300 ms
  added), and with this function it would add about 70 to 80 ms.
- **What it does.** `classroom_worksheet_answers(p_item_ids uuid[], p_section_id uuid default null)`
  returns one jsonb, `{answers, files}`: the stored answers and the block photographs on those items
  that the caller may review. It asks `classroom_manages_section` **once per posting**, joins those
  sections' enrollments (not filtered to active, exactly as `classroom_can_review_submission` is
  not), and joins the answers to that. That join IS the review predicate's own body, written set-wise,
  so the reach cannot widen. `p_section_id` narrows it to one class (the Grades tab), and NULL means
  every class the caller manages (the home tally). A student, and anyone who manages nothing, get an
  empty answer; `anon` holds no grant. At most 200 items per call.
- **It returns values, not a verdict, on purpose.** The completeness rule is `hxCompletion`, and a
  SQL copy of "what counts as an answer" per block type would be a second one. The client groups the
  rows by `worksheetKey` and judges each pair with `worksheetCompletedAt`, the same judgment the
  student's own read uses (the test does exactly that). **It returns one jsonb rather than a set**,
  because PostgREST caps a set-returning RPC at `max_rows` (1000 here) without an error.
- **Payload.** The answers' values travel: 582 KB for the three worksheets above. The client half
  should therefore ask only for worksheets that can still be waiting to be marked (a worksheet whose
  every active student already has a returned or closed row drops out), which keeps a term's worth of
  finished-and-returned worksheets out of the read.
- **Measured tonight** (all from the test, both directions on a worksheet co-posted to two classes
  with different teachers): each teacher receives exactly what RLS gives them as a reviewer, their
  own class only; an inactive student is still read; an admin receives everybody; a student receives
  nothing although her own read of the table returns her 2 rows; `anon` is refused; the class
  parameter narrows to that class and to nothing for a class the caller does not teach. Mutation
  proof, the file copied aside and restored from that copy, md5-checked (`e230b8e9...` before and
  after): dropping the manage condition, and the bare `revoke ... from public` form, are each
  **refused at apply** by the self-check; with the self-check disabled, dropping the manage condition
  fails 4 tests, reaching every student with an answer on a reached item fails 3, `anon` keeping
  execute fails 1, and ignoring the class parameter fails 1. A comment edit (the control) survives.
- **The client half is not written**, because shipped code may not call a function production does
  not have. When it is promoted: (1) in `student-work.ts`, a sibling of `readWorksheetCompletions`
  that calls this RPC and hands the rows to the same grouping and `worksheetCompletedAt`, answering
  null on `PGRST202` or any error (today's behaviour); (2) in
  `src/routes/classroom/[sectionId]/grades/+page.server.ts`, run it beside the submissions read with
  `p_section_id`, put the answer on the rows with `withWorksheetCompletions`, and let
  `assignmentStandings` in `classroom.ts` count a draft carrying `completed_at` as `awaiting` (the
  tab's own definition is "handed in and not yet returned", so a finished worksheet that is graded but
  not returned stays awaiting, exactly as a spec assignment's graded, unreturned `submitted` row does);
  (3) the home tally in `loadClassroomWork` for the classes a teacher manages, with NULL for the
  class, which `isAwaitingGrade` in `feed.ts` already counts the moment a row carries `completed_at`.
  CLAUDE.md's "THE READ IS PINNED TO THE CALLER'S OWN ADDRESS" paragraph names this as waiting and
  would be edited in place in that bundle.
- **Deploy ordering:** none. The function is new; a client that calls it degrades on `PGRST202`.
- **Undo:** `drop function if exists public.classroom_worksheet_answers(uuid[], uuid);` (nothing else
  names it).
