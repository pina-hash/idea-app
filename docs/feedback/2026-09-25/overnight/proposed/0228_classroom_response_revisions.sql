-- 0228_classroom_response_revisions.sql
--
-- ===========================================================================
-- STATUS: A PROPOSAL. IT IS NOT A MIGRATION YET AND NOTHING APPLIES IT.
-- ===========================================================================
-- Written overnight on 2026-09-25 (ledger 0298, Tier F) while the automatic
-- apply was blocked on a rejected database password. It lives under
-- docs/feedback/2026-09-25/overnight/proposed/ and NEVER under
-- supabase/migrations/ until a session promotes it (see PROMOTING IT, below).
-- tests/db/proposed-0228-response-history.test.ts applies it from THIS path
-- over the real chain below 0228 (0001 to 0224 on 2026-09-25), so every claim
-- below about what one caller's save does was measured against a real Postgres
-- rather than argued. The claims about CONCURRENT writers -- the per-block
-- advisory lock, and the grade race under KNOWN LIMIT -- are reasoned from the
-- code and were NOT measured: the harness drives one connection at a time.
--
-- ===========================================================================
-- WHAT THIS FILE DOES, IN ONE SENTENCE
-- ===========================================================================
--
-- IT RECORDS EVERY EDIT A STUDENT MAKES TO AN ANSWER, in a new append-only
-- table written inside the ONE function that writes answers, so a teacher can
-- see what an answer said at any point -- in particular what it said when it
-- was graded, and every change made after that, with the time of each.
--
-- That is decision 37 item 3 (docs/decisions/entries/37-assignment-turn-in-model.md):
-- "Editable until graded; after a grade, still editable, and every edit is
-- recorded", with the defaults Mr. Pina did not overrule: visible to the
-- teacher only, kept forever, one revision per block per 10-minute burst,
-- frozen at each grade.
--
-- ===========================================================================
-- WHAT WAS TRUE BEFORE THIS FILE, AND WHY A MIGRATION IS NEEDED AT ALL
-- ===========================================================================
--
-- `classroom_responses` is ONE ROW PER BLOCK, overwritten in place by
-- `classroom_save_response` (0086, widened by 0197), and that function is the
-- only writer of the table anywhere in the chain (swept: no other insert,
-- update or delete names it). Only `updated_at` survives an overwrite. So the
-- client can already derive "this block changed after grading, last at <time>"
-- (`postGradeChange`, and round 1 of ledger 0298 makes it per block), but it
-- cannot derive WHAT the answer said before, how many times it changed, or
-- when each change happened. No read can recover a value nothing stored.
--
-- ===========================================================================
-- THE TABLE: `classroom_response_revisions`
-- ===========================================================================
--
-- One row per revision of one block of one student's answer to one item,
-- numbered 1, 2, 3 ... per (item, student, block). `revision` is the order,
-- and `(item_id, student_email, block_id, revision)` is UNIQUE, so "the
-- current revision" is a plain max() and two writers that somehow raced would
-- collide on the key rather than silently losing one (CLAUDE.md, State
-- modelling). The key is uuid, not an identity column, so no sequence exists
-- to arrive holding client grants (the 0203 hole).
--
--   value           the answer as of the last write this revision absorbed.
--   origin          'save'     a revision a save wrote;
--                   'baseline' the value that was ALREADY STORED when history
--                              began, written the first time that value is
--                              about to be overwritten. Without it, the first
--                              edit after this file lands would destroy the
--                              only copy of the answer as it stood -- which for
--                              graded work is the answer that was graded.
--   started_at      when this revision's burst began. A later write inside the
--                   burst never moves it. For a baseline, the old row's own
--                   `updated_at`.
--   saved_at        when it last absorbed a write. Transaction time, the same
--                   clock `classroom_responses.updated_at` reads, so the two
--                   agree about the latest save.
--   writes          how many saves the burst absorbed. NULL on a baseline and
--                   only there (checked): nobody counted the writes that
--                   produced a value stored before history existed, and a
--                   number there would be invented.
--   after_grade_at  the `graded_at` of this student's submission at the moment
--                   the revision STARTED, or NULL when no grade existed. It is
--                   the answer to "was this edit made after the grade, and
--                   after WHICH grade" and it survives a regrade, which the
--                   single `graded_at` column cannot. A baseline takes the grade
--                   only when its value was written after it (`updated_at >
--                   graded_at`), which is `postGradeChange`'s own derivation.
--                   A BASELINE CAN ONLY KNOW THE LATEST GRADE, because that is
--                   all `graded_at` holds: a value written between two grades
--                   given before this file existed reads NULL (no grade before
--                   it), although an earlier grade did precede it. What it does
--                   say truly is that the value stood at the latest grade.
--
-- ===========================================================================
-- COALESCING: ONE REVISION PER BLOCK PER 10-MINUTE BURST, FROZEN AT A GRADE
-- ===========================================================================
--
-- An autosave fires about every 800ms of typing, so a revision per write would
-- mint dozens per paragraph and turn the history into noise nobody reads. A
-- save therefore REPLACES the head revision in place, and starts a new one,
-- by this rule and no other:
--
--   the head absorbs the write when ALL of
--     * it is a 'save' revision (a baseline is a record, never absorbed into),
--     * the write lands inside 10 minutes of the head's `started_at` (from the
--       START of the burst, not from its last write: measured from the last
--       write, a student typing steadily for an hour would get ONE revision),
--     * the head's `after_grade_at` is the grade still in force (`is not
--       distinct from`, so no-grade-then and no-grade-now absorbs).
--   otherwise a new revision starts, numbered head + 1.
--
-- A GRADE IS THE BOUNDARY, and that is what "frozen at each grade" means. The
-- first write after a grade (or a regrade) finds a head whose `after_grade_at`
-- no longer matches and starts a new revision, so the value that stood when the
-- grade was saved is kept exactly and never overwritten. Grading does not lock
-- anything and this file does not make it: `returned` has been editable since
-- 0086, a draft can be graded, and decision 37 keeps work editable after a
-- grade. The grade is where history is cut, not where writing stops.
--
-- A WRITE THAT CHANGES NOTHING RECORDS NOTHING. A retried save, or a save of
-- the value already stored, is compared against the stored answer (jsonb
-- equality, which ignores key order) and leaves the history untouched -- no
-- new revision and no `writes` bump. `classroom_responses.updated_at` still
-- moves on such a save, because the upsert below is 0197's statement
-- verbatim; that is a pre-existing looseness in the `updated_at`-derived
-- "changed after grading" chip and is deliberately not changed here.
--
-- THIS IS 0129'S NARROWING OF APPEND-ONLY EXTENDED, AND IT IS WRITTEN DOWN AS
-- AN EXTENSION RATHER THAN SLIPPED IN. CLAUDE.md's State modelling rule lets
-- an autosave replace a revision in place only where nobody but the author can
-- read it, and says "Do not extend this to a surface whose writes are visible
-- to anyone but their author". A teacher CAN read this table. What licenses it
-- here is decision 37's explicit granularity (Mr. Pina's default, recorded in
-- the decision entry) plus two facts: the answer row itself has always been
-- overwritten in place, so nothing a teacher glances at mid-burst was ever a
-- record; and the one version a teacher RELIES on -- the graded one -- is
-- frozen by the grade boundary. The grants do not move: no client role may
-- insert, update or delete a revision, and the only replacement happens inside
-- the SECURITY DEFINER helper, to the head, inside its window. Promoting this
-- file means editing that CLAUDE.md paragraph in the same change to name 0228
-- as the second narrowing and decision 37 as its licence.
--
-- ===========================================================================
-- WHO READS IT: THE TEACHER, AND NOBODY ELSE
-- ===========================================================================
--
-- `authenticated` holds SELECT and nothing else; `anon` holds nothing. RLS is
-- on with ONE select policy whose only branch is
-- `classroom_can_review_submission(item_id, student_email)` -- the same
-- per-student predicate the grading console, every grading RPC and 0198's
-- close ask, so an admin (who manages every section) and the teacher of record
-- read it and a teacher of some other class does not. There is deliberately NO
-- student branch: decision 37's default is teacher-only, and a student's own
-- current answer is already theirs in `classroom_responses`. Widening that is
-- one `or student_email = public.current_user_email()` and is Mr. Pina's call,
-- not a default to take.
--
-- KEPT FOREVER MEANS: no delete grant, no delete policy, no delete RPC, no
-- retention sweep and no expiry. The item foreign key cascades, exactly as
-- `classroom_responses`' does, so deleting an ASSIGNMENT deletes its history
-- along with every answer it described; a history that outlived the answers
-- would be a history no surface can reach.
--
-- ===========================================================================
-- THE LOCK IS SPLIT OUT OF THIS FILE, AND WHY
-- ===========================================================================
--
-- Decision 37 item 2 asks for a second change: a student's own completion must
-- stop locking saves. Today `classroom_save_response` and the eight-argument
-- `classroom_add_submission_file` return `{ok:false, reason:'locked'}` for ANY
-- row in state 'submitted'. THIS FILE KEEPS THAT EXACTLY, refusal and order,
-- and the test proves it case for case. The lock change is a separate file,
-- for three reasons:
--
--   1. DONE THE OBVIOUS WAY IT SILENTLY BREAKS THE ONE LOCK MR. PINA ASKED FOR.
--      The obvious widening is "lock only when `submitted_at is null`", i.e.
--      only an instructor's close (0198). But 0198's close LEAVES A STUDENT'S
--      OWN HAND-IN ALONE ("It is already refusing writes") and reports it
--      `changed: false`. Measured in the test: the submission row is
--      byte-identical before and after the close. So after that widening, a
--      student who had turned work in would still be able to write after the
--      end-of-unit close, and no predicate over the row could tell. Doing it
--      right needs a new fact on the row.
--   2. DOING IT RIGHT RE-SIGNS SEVEN LIVE FUNCTIONS, ADDS A COLUMN AND
--      BACKFILLS IT (items b, c, d and h below), which is a different risk from
--      an additive table and deserves its own census, its own test and its own
--      revert.
--   3. HISTORY CANNOT BE BACKFILLED. Every day this table is absent is edits
--      nobody can ever see, so the additive half must not wait on, or be
--      reverted with, the riskier half. This file is useful the day it lands:
--      ported HTML worksheets have no turn-in and are edited freely today, and
--      `returned` spec work is already editable.
--
-- THE FOLLOW-ON FILE, STATED PRECISELY (it needs a number from the ledger;
-- 0229 is decision 38's):
--   a. `alter table public.classroom_submissions add column if not exists
--      closed_at timestamptz;` -- nullable. It is the instructor's close as its
--      own fact, because a close placed over a hand-in is otherwise invisible
--      on the row. Its backfill is item h, and is NOT optional.
--   b. ONE private predicate, `_classroom_submission_locked(state,
--      submitted_at, closed_at)`, true exactly when `state = 'submitted' and
--      (submitted_at is null or closed_at is not null)`, called in place of
--      `v_state = 'submitted'` at EVERY site that refuses a student write with
--      `'reason', 'locked'`. Swept on 2026-09-25 over the chain through 0224,
--      that is SEVEN checks in FIVE live functions, not two:
--        `classroom_save_response` (0197);
--        the eight-argument `classroom_add_submission_file` (0197), at BOTH
--          its first read and its post-insert re-read;
--        `classroom_open_submission` (0134), at BOTH its checks -- this is the
--          SIGN step of every storage-backed photo hand-in
--          (`/api/classroom/submission-file/sign`), so a file left out here
--          locks every camera upload while typing is open;
--        `classroom_delete_submission_file` (0133);
--        `classroom_set_submission_file_caption` (0086).
--      The follow-on must re-derive that list from `prosrc` at apply time and
--      REFUSE if any function still carries the bare `v_state = 'submitted'`
--      lock beside a `'locked'` refusal, because a site missed here is text
--      open and photos shut with nothing on screen saying why.
--      `classroom_submit_assignment` (0160) also reads `v_state = 'submitted'`,
--      but as "already turned in", which is a different question and stays.
--      A 'returned' row stays open, which keeps 0198's "returning a grade
--      re-opens" exactly.
--   c. `classroom_close_assignment` stamps `closed_at = now()` on every row it
--      closes, INCLUDING a student's own hand-in, which keeps its state and its
--      `submitted_at` (the fact that they turned it in themselves survives) and
--      is now reported `changed: true`. Reopening clears `closed_at` on every
--      row it may review, and still reverts only `submitted` rows with a null
--      `submitted_at` to 'draft'.
--   d. `classroom_unsubmit_assignment`'s 'closed' refusal widens to
--      `submitted_at is null or closed_at is not null`. That is a narrowing and
--      is inert over every stored row, because the column is new; the file
--      counts it anyway, under the deployed function, and raises if any row
--      would change answer.
--   e. It REFUSES TO APPLY unless this file's table exists: unlocking graded
--      work without a history is exactly what decision 37 forbids.
--   f. Census, reported and not refused (a widening strands nothing): rows in
--      'submitted' with a `submitted_at`, split graded and ungraded -- the rows
--      that become editable.
--   g. Deploy ordering: every signature is unchanged and the column is
--      additive, so there is none. The client learns the new lock from a
--      select-ladder rung that includes `closed_at`; until that rung comes
--      back it keeps today's predicate (`turned-in` is locked), so a client
--      that ships first never offers a write the database will refuse.
--   h. EVERY CLOSE GIVEN BEFORE THE FOLLOW-ON EXISTS CARRIES NO `closed_at`,
--      so item b alone would silently re-open some of them. Two shapes, and
--      only one can be recovered:
--        * A 'returned' row an instructor then closed. 0198's close turns
--          `returned` into `submitted` and keeps the `submitted_at` of the
--          student's earlier hand-in, so under item b it reads as a student's
--          own turn-in and OPENS. It is recognisable: state 'submitted',
--          `returned_at` set, and `submitted_at` null or not after
--          `returned_at` (a real resubmission re-stamps `submitted_at` past
--          `returned_at`). Backfill `closed_at` on exactly those, from
--          `updated_at` (the nearest time the row holds; a later draft grade
--          moves it), once, inside a catalog guard on the column's own
--          existence.
--        * A student's own hand-in an instructor then closed. 0198 reports it
--          `changed: false` and writes nothing, so there is NO trace and it
--          cannot be told from a hand-in nobody closed. Under decision 37 an
--          ungraded hand-in is meant to be editable anyway, so opening these
--          is the decision's intent, but the census must COUNT the turned-in
--          rows on items that show any close (a `submitted` row with a null
--          `submitted_at` on the same item) and name the number, so the
--          teacher knows how many hand-ins a past close may have meant to
--          hold.
--   `classroom_submit_assignment` and `classroom_grade_submission` are not
--   touched by it. The Submit button's removal, and moving the declaration and
--   preflight onto the page as a visible check, are the client half of
--   decision 37 and belong to the same session.
--
-- ===========================================================================
-- WHAT IT LEAVES ALONE
-- ===========================================================================
--
--   * EVERY REFUSAL `classroom_save_response` GIVES, AND THEIR ORDER. The new
--     call sits after the last refusal and immediately before the upsert, so a
--     refused save writes no revision. Section 7 asserts that position in the
--     installed body, and the test asserts it behaviourally.
--   * The success payload. It is still exactly `{"ok": true}`; the revision
--     number is not returned, so the deployed client's answers compare
--     byte-for-byte (the corpus in the test includes every success).
--   * `classroom_add_submission_file`. Files already carry `created_at`, so
--     "added after grading" is derivable today. A file DELETED after grading
--     leaves no trace (`classroom_delete_submission_file` removes the row); that
--     is an open gap, named here, and not decision 37's wording.
--   * `classroom_save_instructor_response` (0199). A teacher's own working copy
--     is not student work and decision 37 does not ask for its history. 0199's
--     apply-time check reads this function's body off `prosrc` for the six
--     manifest types; they are still there, verbatim.
--   * Grading, close, submit and unsubmit. Not re-signed.
--   * `classroom_responses`, its row shape, its grants and its policy.
--
-- ===========================================================================
-- SIGNATURES, OVERLOADS AND DEPLOY ORDERING
-- ===========================================================================
--
-- `classroom_save_response(uuid, text, jsonb)` is replaced at its UNCHANGED
-- argument list, returning the same jsonb shapes, so the signature trap does
-- not apply and `pg_proc` still holds exactly one row for it (section 7 reads
-- that back). THERE IS NO DEPLOY ORDERING: no client names anything new, so
-- this file and any deploy are independent events. It is ADDITIVE in
-- CLAUDE.md's sense, which matters because `migrate.yml` applies the lowest
-- unapplied migration on a push to main and so races the client deploy. The
-- teacher's history panel, when it is built, reads the table on its own
-- select-ladder rung and treats `PGRST205` (no such table) as "not available
-- on this deployment".
--
-- ===========================================================================
-- THE DIFF GUARD: THIS FILE REFUSES TO REPLACE A FUNCTION IT HAS NOT SEEN
-- ===========================================================================
--
-- CLAUDE.md: "When re-signing a function to change one term, DIFF IT AGAINST
-- THE SOURCE." Section 1 takes the md5 of the DEPLOYED body of
-- `classroom_save_response` (carriage returns removed, so a paste from a
-- Windows checkout hashes the same) and refuses unless it is 0197's body
-- exactly. A body that differs means somebody changed the function after
-- 0197, and replacing it from this file would silently revert that change.
-- On a RE-APPLY the body is this file's own (it names the helper) and the
-- guard stands aside.
--
-- ===========================================================================
-- KNOWN LIMIT: A GRADE RACING A SAVE (reasoned, not measured)
-- ===========================================================================
--
-- The boundary is read from `classroom_submissions.graded_at` inside the save,
-- under FOR SHARE. That makes a save wait for a grade only once the grade has
-- taken the row: `classroom_grade_submission` stamps `graded_at` with its
-- TRANSACTION START (`v_now := now()`) but locks the row only at its upsert,
-- after reading the rubric and checking every score. So there are two windows,
-- both a few milliseconds wide in the single-student case:
--   * no submission row yet (a ported worksheet's student usually has none
--     until the first grade creates one), where there is nothing to lock; and
--   * an existing row, between the grade's start and its upsert. A bulk grade
--     (0175) is ONE transaction for the whole class, so for the last student
--     in it this window is the length of the whole batch.
-- In either, a save can be absorbed into the pre-grade head and commit before
-- the grade does. The tell is on the revision itself: `after_grade_at` older
-- than the grade (or NULL) while `saved_at` is LATER than that grade's
-- `graded_at`. A history panel should mark such a revision "saved while the
-- grade was being written" rather than present it as the graded value.
-- Closing the window would mean grading taking a lock the save also takes, at
-- its start, which is a change to the grading function and is not this file's.
--
-- ===========================================================================
-- PROMOTING IT (the session that ships decision 37's migration half)
-- ===========================================================================
--
--   1. `git mv` this file to supabase/migrations/0228_classroom_response_revisions.sql
--      and change the one PROPOSAL path constant in the test. The test's chain
--      filter takes every file numbered BELOW 0228, so it measures whatever
--      production will hold just before this file, including any of 0225 to
--      0227 that landed first. If it is promoted under another number, move
--      that bound with it.
--   2. Edit CLAUDE.md's append-only paragraph (see COALESCING above) in the
--      same change, and add a docs/history entry.
--   3. No grant list needs an entry: the table is SELECT-only to
--      `authenticated` (not a client write, not an anon grant, not REFERENCES
--      or TRIGGER), the key is uuid (no sequence), and the helper is granted to
--      nobody.
--   4. It applies through `tools/apply-migration.mjs` / `migrate.yml` as the
--      lowest unapplied file. It drops nothing, so the `idea_migrator` guard
--      has nothing to refuse.
--
-- ===========================================================================
-- WHAT UNDOES IT
-- ===========================================================================
--
-- In this order, or every save fails in between:
--   1. Put 0197's body back: re-run section 4 of
--      0197_classroom_html_assignment_write_gate.sql verbatim (its create or
--      replace of classroom_save_response and the revoke and grant after it).
--   2. drop function public._classroom_response_revision(uuid, text, text, jsonb);
--   3. drop table public.classroom_response_revisions;
-- Step 3 loses every recorded revision, and nothing else holds them: count the
-- rows first. `idea_migrator` refuses a dropped table by design, so the undo is
-- a paste by hand, which is the right amount of friction for deleting history.
--
-- There is no dollar sign anywhere in a comment in this file, because the
-- Supabase editor's statement splitter breaks on one (the 0194 paste trap).

-- ---------------------------------------------------------------------------
-- 1. PRECONDITIONS AND THE DIFF GUARD. Refuses rather than half-applying.
-- ---------------------------------------------------------------------------

do $pre$
declare
	v_src text;
	v_md5 text;
begin
	if to_regclass('public.classroom_responses') is null
		or to_regclass('public.classroom_submissions') is null
		or to_regclass('public.classroom_items') is null then
		raise exception '0228: the classroom assignment tables do not exist. Apply 0086 first.';
	end if;
	if to_regprocedure('public.classroom_save_response(uuid, text, jsonb)') is null then
		raise exception '0228: classroom_save_response(uuid, text, jsonb) does not exist. Apply 0086 and 0197 first.';
	end if;
	if to_regprocedure('public._classroom_html_manifest(uuid)') is null
		or to_regprocedure('public._classroom_html_block(jsonb, text)') is null then
		raise exception '0228: 0197''s manifest helpers do not exist. Apply 0197 first.';
	end if;
	if to_regprocedure('public.classroom_can_review_submission(uuid, text)') is null then
		raise exception '0228: classroom_can_review_submission(uuid, text) does not exist. Apply 0086 first.';
	end if;

	select p.prosrc into v_src
	from pg_proc p
	where p.oid = to_regprocedure('public.classroom_save_response(uuid, text, jsonb)');

	if position('_classroom_response_revision' in v_src) > 0 then
		raise notice '0228: classroom_save_response already records revisions; this is a re-apply, so the diff guard stands aside.';
	else
		v_md5 := md5(replace(v_src, chr(13), ''));
		if v_md5 <> 'b717bc0d86be3a3a66d194d62964bd2a' then
			raise exception '0228: the deployed classroom_save_response is not 0197''s body (md5 % of the installed source, expected b717bc0d86be3a3a66d194d62964bd2a). Something changed it after 0197, and replacing it from this file would silently revert that change. Diff pg_get_functiondef(''public.classroom_save_response(uuid, text, jsonb)''::regprocedure) against section 4 of 0197, fold the difference into section 6 of this file, then update the expected md5.',
				v_md5;
		end if;
		raise notice '0228: the deployed classroom_save_response is 0197''s body exactly (md5 b717bc0d86be3a3a66d194d62964bd2a).';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 2. THE CENSUS. Read-only: it selects and raises notices, and writes nothing.
--
--    No stored row changes answer under this file -- every refusal is kept --
--    so this counts what the operator should KNOW rather than what could
--    break: how much work has no history yet, how much graded work already
--    moved after its grade (whose graded value is gone and cannot be
--    recovered), and the rows the split-out lock change would unlock.
-- ---------------------------------------------------------------------------

do $census$
declare
	v_answers bigint;
	v_graded_answers bigint;
	v_moved bigint;
	v_turned_in bigint;
	v_turned_in_graded bigint;
	v_closed_after_return bigint;
	v_closed bigint;
begin
	select count(*) into v_answers from public.classroom_responses;

	select count(*),
		count(*) filter (where r.updated_at > s.graded_at)
	into v_graded_answers, v_moved
	from public.classroom_responses r
	join public.classroom_submissions s
		on s.item_id = r.item_id and s.student_email = r.student_email
	where s.graded_at is not null;

	select count(*) filter (where state = 'submitted' and submitted_at is not null),
		count(*) filter (where state = 'submitted' and submitted_at is not null and graded_at is not null),
		count(*) filter (where state = 'submitted' and submitted_at is not null
			and returned_at is not null and submitted_at <= returned_at),
		count(*) filter (where state = 'submitted' and submitted_at is null)
	into v_turned_in, v_turned_in_graded, v_closed_after_return, v_closed
	from public.classroom_submissions;

	raise notice '0228: % stored answer row(s) have no history yet. Each gets a baseline revision holding its current value the first time it is overwritten; a row never edited again needs none.',
		v_answers;
	raise notice '0228: % answer row(s) belong to graded work, and % of those were saved again after the grade (a re-save of the same value counts too, because it moves updated_at). Where the value did change, the graded value was overwritten before history existed and nothing can recover it; from this file on, the value standing at a grade is kept.',
		v_graded_answers, v_moved;
	raise notice '0228: % submission(s) carry a student turn-in stamp and are locked (% of them graded); % of those are a returned row an instructor then closed; % more are locked by an instructor close alone. This file changes NEITHER lock. The split-out lock change would make the first number editable, less the returned-then-closed rows its item h keeps closed.',
		v_turned_in, v_turned_in_graded, v_closed_after_return, v_closed;
end
$census$;

-- ---------------------------------------------------------------------------
-- 3. THE TABLE.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_response_revisions (
	id uuid primary key default gen_random_uuid(),
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	student_email text not null
		check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	-- The same domain as classroom_responses.block_id, so every answer that can
	-- be stored can have a history.
	block_id text not null check (char_length(block_id) between 1 and 64),
	revision integer not null check (revision >= 1),
	value jsonb not null,
	origin text not null check (origin in ('save', 'baseline')),
	started_at timestamptz not null,
	saved_at timestamptz not null,
	writes integer check (writes is null or writes >= 1),
	after_grade_at timestamptz,
	constraint classroom_response_revisions_saved_after_start check (saved_at >= started_at),
	-- A baseline is the ONLY row with no write count, and it always has none.
	constraint classroom_response_revisions_writes_origin check ((origin = 'baseline') = (writes is null)),
	constraint classroom_response_revisions_one_per_number
		unique (item_id, student_email, block_id, revision)
);

-- ---------------------------------------------------------------------------
-- 4. RLS ON, SELECT ONLY, TEACHER ONLY.
--
--    The revokes NAME THE ROLES. A hosted project's default privileges hand
--    every new table all seven privileges for `anon` and `authenticated` at
--    CREATE time, and RLS covers none of TRUNCATE, REFERENCES or TRIGGER --
--    0201 lost exactly this half. `service_role` is not named, as in 0223.
-- ---------------------------------------------------------------------------

alter table public.classroom_response_revisions enable row level security;

revoke all on table public.classroom_response_revisions from public, anon, authenticated;
grant select on table public.classroom_response_revisions to authenticated;

-- ONE policy, ONE branch. `classroom_can_review_submission` is granted to
-- `authenticated` by 0086 precisely because it is named inside RLS on
-- `classroom_responses`, where it is evaluated as the querying role; this is
-- the same use.
drop policy if exists "classroom response revisions reviewer only" on public.classroom_response_revisions;
create policy "classroom response revisions reviewer only"
	on public.classroom_response_revisions
	for select
	to authenticated
	using (public.classroom_can_review_submission(item_id, student_email));

-- ---------------------------------------------------------------------------
-- 5. THE HELPER THAT WRITES A REVISION.
--
--    Called from exactly one place, `classroom_save_response`, AFTER every
--    refusal and immediately BEFORE the answer is upserted, so it can read the
--    value that is about to be replaced. It checks nobody: the caller has
--    already resolved the student through `_classroom_engine_student`, and it
--    is granted to no client role, so the only way to reach it is through that
--    gate.
--
--    SERIALIZED PER BLOCK with a transaction-scoped advisory lock (the two-key
--    form, whose keyspace no other lock in this schema uses), because the head
--    has to be read and then replaced or succeeded as one step. The unique
--    key on the revision number is the backstop, not the mechanism.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_response_revision(
	p_item_id uuid,
	p_student_email text,
	p_block_id text,
	p_value jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_now timestamptz := now();
	v_graded_at timestamptz;
	v_old_value jsonb;
	v_old_at timestamptz;
	v_had_row boolean;
	v_head public.classroom_response_revisions%rowtype;
	v_has_head boolean;
	v_next integer;
begin
	perform pg_advisory_xact_lock(
		hashtext('classroom_response_revisions'),
		hashtext(p_item_id::text || '/' || p_student_email || '/' || p_block_id)
	);

	-- THE GRADE IN FORCE. FOR SHARE, so a grade being written to an existing
	-- submission row is waited for and then seen, rather than read around.
	select s.graded_at into v_graded_at
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = p_student_email
	for share;

	-- THE VALUE THIS WRITE IS ABOUT TO REPLACE.
	select r.value, r.updated_at into v_old_value, v_old_at
	from public.classroom_responses r
	where r.item_id = p_item_id
		and r.student_email = p_student_email
		and r.block_id = p_block_id;
	v_had_row := found;

	-- A WRITE THAT CHANGES NOTHING RECORDS NOTHING.
	if v_had_row and v_old_value = p_value then
		return;
	end if;

	select v.* into v_head
	from public.classroom_response_revisions v
	where v.item_id = p_item_id
		and v.student_email = p_student_email
		and v.block_id = p_block_id
	order by v.revision desc
	limit 1;
	v_has_head := found;

	if not v_has_head then
		v_next := 1;
		-- THE BASELINE: the answer as it stood before history existed, kept
		-- before this write destroys the only copy of it.
		if v_had_row then
			insert into public.classroom_response_revisions
				(item_id, student_email, block_id, revision, value, origin,
				 started_at, saved_at, writes, after_grade_at)
			values (p_item_id, p_student_email, p_block_id, 1, v_old_value, 'baseline',
				v_old_at, v_old_at, null,
				case when v_graded_at is not null and v_old_at > v_graded_at then v_graded_at end);
			v_next := 2;
		end if;
	elsif v_head.origin = 'save'
		and v_now < v_head.started_at + interval '10 minutes'
		and v_head.after_grade_at is not distinct from v_graded_at then
		-- THE BURST ABSORBS IT. `greatest` because two transactions can commit
		-- out of the order they started in, and `saved_at` must never go back.
		update public.classroom_response_revisions
		set value = p_value,
			saved_at = greatest(v_head.saved_at, v_now),
			writes = v_head.writes + 1
		where id = v_head.id;
		return;
	else
		v_next := v_head.revision + 1;
	end if;

	insert into public.classroom_response_revisions
		(item_id, student_email, block_id, revision, value, origin,
		 started_at, saved_at, writes, after_grade_at)
	values (p_item_id, p_student_email, p_block_id, v_next, p_value, 'save',
		v_now, v_now, 1, v_graded_at);
end;
$$;

-- Granted to nobody: it is reached only from inside the SECURITY DEFINER save,
-- which runs it as the owner. Naming the roles is what makes that true under a
-- hosted project's default privileges; `service_role` is not named, as 0137
-- never names it.
revoke all on function public._classroom_response_revision(uuid, text, text, jsonb)
	from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. THE ANSWER WRITE, RE-SIGNED WITH ONE CALL ADDED.
--
--    0197's body VERBATIM -- diffed against section 4 of that file, and the
--    diff guard in section 1 refuses unless the deployed body is exactly it --
--    with the three lines marked 0228 inserted between the last refusal and
--    the upsert. Nothing above the insertion moved, so every refusal a spec
--    assignment or a ported worksheet gives, and their order, is 0197's.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_save_response(
	p_item_id uuid,
	p_block_id text,
	p_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_manifest jsonb;
	v_spec jsonb;
	v_block jsonb;
	v_module_id text;
	v_type text;
	v_state text;
	v_gated text[];
begin
	-- WHICH ENGINE, FIRST, AND IT READS NOTHING ELSE FOR A V1 ITEM. Null here
	-- means "not a ported document", so the three statements that follow are
	-- 0086's opening verbatim, in 0086's order -- including the fact that an
	-- item with no spec raises before the oversized-value check.
	v_manifest := public._classroom_html_manifest(p_item_id);

	if v_manifest is null then
		select a.spec into v_spec
		from public.classroom_assignment_specs a where a.item_id = p_item_id;
		if v_spec is null then
			raise exception 'This assignment has no interactive spec.';
		end if;
	end if;

	if p_value is null or pg_column_size(p_value) > 100000 then
		raise exception 'That response is too large.';
	end if;

	if p_block_id = '@declaration' then
		if v_manifest is not null then
			raise exception 'This assignment has no declaration.';
		end if;
		if (v_spec->'declarations'->>'academicIntegrity')::boolean is not true then
			raise exception 'This assignment has no declaration.';
		end if;
	elsif v_manifest is not null then
		v_block := public._classroom_html_block(v_manifest, p_block_id);
		if v_block is null then
			raise exception 'Unknown block "%".', p_block_id;
		end if;
		v_type := v_block->>'type';
		if v_type not in ('text', 'longText', 'checkbox', 'radio', 'image', 'table') then
			raise exception 'Block "%" does not take a typed response.', p_block_id;
		end if;
	else
		select b.blk, m.mod->>'id' into v_block, v_module_id
		from jsonb_array_elements(v_spec->'modules') as m(mod),
			jsonb_array_elements(m.mod->'blocks') as b(blk)
		where b.blk->>'id' = p_block_id
		limit 1;
		if v_block is null then
			raise exception 'Unknown block "%".', p_block_id;
		end if;
		v_type := v_block->>'type';
		if v_type not in ('textField', 'table', 'checklist') then
			raise exception 'Block "%" does not take a typed response.', p_block_id;
		end if;

		v_gated := public._classroom_gated_modules(v_spec);
		if v_module_id = any (v_gated) and not exists (
			select 1 from public.classroom_module_approvals a
			where a.item_id = p_item_id and a.student_email = v_email
				and a.module_id = v_spec->'approvalGate'->>'afterModule'
		) then
			return jsonb_build_object('ok', false, 'reason', 'approval_pending', 'module_id', v_module_id);
		end if;
	end if;

	select s.state into v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;
	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'locked');
	end if;

	-- 0228: THE EDIT HISTORY, after every refusal and before the overwrite, so
	-- a refused save records nothing and the replaced value is still readable.
	perform public._classroom_response_revision(p_item_id, v_email, p_block_id, p_value);

	insert into public.classroom_responses (item_id, student_email, block_id, value, updated_at)
	values (p_item_id, v_email, p_block_id, p_value, now())
	on conflict (item_id, student_email, block_id) do update
		set value = excluded.value, updated_at = now();

	return jsonb_build_object('ok', true);
end;
$$;

-- The ACL restated rather than inherited, in 0197's own words and roles.
revoke all on function public.classroom_save_response(uuid, text, jsonb)
	from public, anon, authenticated;
grant execute on function public.classroom_save_response(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. THE SELF-CHECK. Reads the catalog, the ACL and the BEHAVIOUR back rather
--    than trusting that the statements above ran. It raises, so a partial
--    apply cannot look like a clean one, and the fixture it builds is rolled
--    back explicitly.
-- ---------------------------------------------------------------------------

do $checks$
declare
	v_n integer;
	v_src text;
	v_role text;
	v_priv text;
	v_qual text;
	v_cmd text;
	v_roles name[];
	v_missing text;
	v_item constant uuid := '00000000-0000-4000-8000-000000000228'::uuid;
	v_who constant text := 'selfcheck@0228.invalid';
	v_rows integer;
	v_head record;
begin
	-- ---- the table's shape -------------------------------------------------
	--
	-- `create table if not exists` keeps whatever an earlier draft built, so the
	-- columns are read back rather than assumed.
	select string_agg(x.col, ', ') into v_missing
	from (values
		('id', 'uuid', 'NO'),
		('item_id', 'uuid', 'NO'),
		('student_email', 'text', 'NO'),
		('block_id', 'text', 'NO'),
		('revision', 'integer', 'NO'),
		('value', 'jsonb', 'NO'),
		('origin', 'text', 'NO'),
		('started_at', 'timestamp with time zone', 'NO'),
		('saved_at', 'timestamp with time zone', 'NO'),
		('writes', 'integer', 'YES'),
		('after_grade_at', 'timestamp with time zone', 'YES')
	) as x(col, typ, nul)
	where not exists (
		select 1 from information_schema.columns c
		where c.table_schema = 'public'
			and c.table_name = 'classroom_response_revisions'
			and c.column_name = x.col
			and c.data_type = x.typ
			and c.is_nullable = x.nul
	);
	if v_missing is not null then
		raise exception '0228: classroom_response_revisions is missing or mistypes column(s): %. An earlier draft of this file built a different table; reconcile it by hand before re-applying.', v_missing;
	end if;

	-- ---- one overload, no defaults, same return ------------------------------
	select count(*) into v_n from pg_proc p
	where p.pronamespace = 'public'::regnamespace and p.proname = 'classroom_save_response';
	if v_n <> 1 then
		raise exception '0228: pg_proc holds % row(s) for classroom_save_response, expected exactly 1.', v_n;
	end if;
	select count(*) into v_n from pg_proc p
	where p.pronamespace = 'public'::regnamespace and p.proname = '_classroom_response_revision';
	if v_n <> 1 then
		raise exception '0228: pg_proc holds % row(s) for _classroom_response_revision, expected exactly 1.', v_n;
	end if;
	select p.pronargdefaults, p.prosrc into v_n, v_src from pg_proc p
	where p.oid = to_regprocedure('public.classroom_save_response(uuid, text, jsonb)');
	if v_n <> 0 then
		raise exception '0228: classroom_save_response now declares % default(s); it declared none.', v_n;
	end if;
	if (select p.prorettype from pg_proc p
		where p.oid = to_regprocedure('public.classroom_save_response(uuid, text, jsonb)')) <> 'jsonb'::regtype then
		raise exception '0228: classroom_save_response no longer returns jsonb.';
	end if;

	-- ---- the body: every refusal kept, the call where it must be -----------
	--
	-- Matched on literals as written in code, so a comment cannot satisfy it.
	select string_agg(lit, ' | ') into v_missing
	from unnest(array[
		'raise exception ''This assignment has no interactive spec.''',
		'raise exception ''That response is too large.''',
		'raise exception ''This assignment has no declaration.''',
		'raise exception ''Unknown block "%".''',
		'raise exception ''Block "%" does not take a typed response.''',
		'''reason'', ''approval_pending''',
		'''reason'', ''locked''',
		'(''text'', ''longText'', ''checkbox'', ''radio'', ''image'', ''table'')',
		'(''textField'', ''table'', ''checklist'')',
		'public._classroom_html_manifest(p_item_id)',
		'public._classroom_html_block(v_manifest, p_block_id)',
		'public._classroom_gated_modules(v_spec)',
		'perform public._classroom_response_revision(p_item_id, v_email, p_block_id, p_value)'
	]) as lit
	where position(lit in v_src) = 0;
	if v_missing is not null then
		raise exception '0228: classroom_save_response lost a statement it must carry: %', v_missing;
	end if;
	if not (position('''reason'', ''locked''' in v_src)
			< position('perform public._classroom_response_revision' in v_src)
		and position('perform public._classroom_response_revision' in v_src)
			< position('insert into public.classroom_responses' in v_src)) then
		raise exception '0228: the revision call is not between the last refusal and the upsert. A refused save could then write history, or the replaced value would already be gone.';
	end if;

	-- ---- the ACL -----------------------------------------------------------
	if has_function_privilege('anon', 'public.classroom_save_response(uuid, text, jsonb)', 'execute') then
		raise exception '0228: classroom_save_response is executable by anon.';
	end if;
	if not has_function_privilege('authenticated', 'public.classroom_save_response(uuid, text, jsonb)', 'execute') then
		raise exception '0228: classroom_save_response is NOT executable by authenticated. Every student save would fail.';
	end if;
	if has_function_privilege('anon', 'public._classroom_response_revision(uuid, text, text, jsonb)', 'execute')
		or has_function_privilege('authenticated', 'public._classroom_response_revision(uuid, text, text, jsonb)', 'execute') then
		raise exception '0228: _classroom_response_revision is executable by a client role. It would let a caller write another student''s history.';
	end if;

	foreach v_role in array array['anon', 'authenticated'] loop
		foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
			if has_table_privilege(v_role, 'public.classroom_response_revisions', v_priv)
				and not (v_role = 'authenticated' and v_priv = 'SELECT') then
				raise exception '0228: % holds % on classroom_response_revisions. The revoke did not name the roles it needed to.', v_role, v_priv;
			end if;
		end loop;
	end loop;
	if not has_table_privilege('authenticated', 'public.classroom_response_revisions', 'SELECT') then
		raise exception '0228: authenticated cannot SELECT classroom_response_revisions, so no teacher could read the history.';
	end if;

	-- ---- RLS and the one policy --------------------------------------------
	if not (select c.relrowsecurity from pg_class c
		where c.oid = 'public.classroom_response_revisions'::regclass) then
		raise exception '0228: row level security is off on classroom_response_revisions.';
	end if;
	select count(*) into v_n from pg_policy pl
	where pl.polrelid = 'public.classroom_response_revisions'::regclass;
	if v_n <> 1 then
		raise exception '0228: classroom_response_revisions carries % policies, expected exactly 1.', v_n;
	end if;
	select pl.polcmd::text,
		array(select r.rolname from pg_roles r where r.oid = any (pl.polroles) order by r.rolname),
		pg_get_expr(pl.polqual, pl.polrelid)
	into v_cmd, v_roles, v_qual
	from pg_policy pl
	where pl.polrelid = 'public.classroom_response_revisions'::regclass;
	if v_cmd <> 'r' or v_roles <> array['authenticated']::name[] then
		raise exception '0228: the policy on classroom_response_revisions must be FOR SELECT TO authenticated (found cmd %, roles %).', v_cmd, v_roles;
	end if;
	-- TEACHER ONLY: the reviewer predicate is the whole of it. A student branch
	-- (the own-row spelling) or a constant is the leak this refuses.
	if v_qual is null
		or position('classroom_can_review_submission' in v_qual) = 0
		or position('current_user_email' in v_qual) > 0
		or position('auth.' in v_qual) > 0
		or position(' or ' in lower(v_qual)) > 0 then
		raise exception '0228: the policy on classroom_response_revisions is not the reviewer predicate alone (found: %).', coalesce(v_qual, 'no qualifier');
	end if;

	-- ---- the behaviour, on a fixture that is rolled back -------------------
	--
	-- One transaction, so now() is one instant T throughout: every write lands
	-- inside the window, and a grade stamped at T is still a new grade to a
	-- revision that started before it existed.
	begin
		insert into public.classroom_items (id, kind, title, body, author_email)
		values (v_item, 'assignment', '0228 self-check', 'temporary', 'migration@0228.invalid');

		-- An answer stored before history existed.
		insert into public.classroom_responses (item_id, student_email, block_id, value, updated_at)
		values (v_item, v_who, 'b1', '"v0"'::jsonb, now() - interval '1 hour');

		-- First overwrite: a baseline holding v0, then revision 2 holding v1.
		perform public._classroom_response_revision(v_item, v_who, 'b1', '"v1"'::jsonb);
		update public.classroom_responses set value = '"v1"'::jsonb, updated_at = now()
		where item_id = v_item and student_email = v_who and block_id = 'b1';

		select count(*) into v_rows from public.classroom_response_revisions where item_id = v_item;
		if v_rows <> 2 then
			raise exception '0228: the first overwrite wrote % revision(s), expected 2 (the baseline and the save).', v_rows;
		end if;
		if not exists (select 1 from public.classroom_response_revisions
			where item_id = v_item and revision = 1 and origin = 'baseline' and value = '"v0"'::jsonb and writes is null) then
			raise exception '0228: revision 1 is not a baseline holding the value that was stored before history existed.';
		end if;

		-- Inside the window, no grade: absorbed into revision 2.
		perform public._classroom_response_revision(v_item, v_who, 'b1', '"v2"'::jsonb);
		update public.classroom_responses set value = '"v2"'::jsonb, updated_at = now()
		where item_id = v_item and student_email = v_who and block_id = 'b1';
		-- The same value again: nothing recorded.
		perform public._classroom_response_revision(v_item, v_who, 'b1', '"v2"'::jsonb);

		select revision, value, writes into v_head
		from public.classroom_response_revisions where item_id = v_item
		order by revision desc limit 1;
		if v_head.revision <> 2 or v_head.value <> '"v2"'::jsonb or v_head.writes <> 2 then
			raise exception '0228: a write inside the window did not coalesce (head is revision % holding % after % write(s); expected revision 2 holding "v2" after 2).',
				v_head.revision, v_head.value, v_head.writes;
		end if;

		-- A grade: the next write must start revision 3 and leave 2 frozen.
		insert into public.classroom_submissions (item_id, student_email, graded_at)
		values (v_item, v_who, now());
		perform public._classroom_response_revision(v_item, v_who, 'b1', '"v3"'::jsonb);

		select revision, value, after_grade_at into v_head
		from public.classroom_response_revisions where item_id = v_item
		order by revision desc limit 1;
		if v_head.revision <> 3 or v_head.value <> '"v3"'::jsonb or v_head.after_grade_at is distinct from now() then
			raise exception '0228: a write after a grade did not start a new revision carrying the grade (head is revision % holding %).',
				v_head.revision, v_head.value;
		end if;
		if not exists (select 1 from public.classroom_response_revisions
			where item_id = v_item and revision = 2 and value = '"v2"'::jsonb and after_grade_at is null) then
			raise exception '0228: the revision standing at the grade was not frozen with the graded value.';
		end if;

		raise exception 'rollback the 0228 self-check fixture';
	exception
		when sqlstate 'P0001' then
			if position('rollback the 0228 self-check fixture' in sqlerrm) = 0 then
				raise;
			end if;
	end;

	if exists (select 1 from public.classroom_items where id = v_item)
		or exists (select 1 from public.classroom_response_revisions where item_id = v_item) then
		raise exception '0228: the self-check fixture survived its rollback. Remove item 00000000-0000-4000-8000-000000000228 by hand.';
	end if;

	raise notice '0228: classroom_response_revisions is in place, teacher-read only. classroom_save_response records one revision per block per 10-minute burst, frozen at each grade, with a baseline for any answer stored before history existed. Every refusal and the success payload are 0197''s, so there is no deploy ordering.';
end
$checks$;

-- ===========================================================================
-- VERIFICATION QUERY -- paste into the SQL editor after applying
-- ===========================================================================
--
-- select
--   (select count(*) from pg_proc
--      where pronamespace = 'public'::regnamespace
--        and proname = 'classroom_save_response')                          as save_arities,
--   (select count(*) from pg_proc
--      where pronamespace = 'public'::regnamespace
--        and proname = 'classroom_save_response'
--        and prosrc like '%_classroom_response_revision%')                  as save_records_history,
--   has_function_privilege('anon',
--     'public.classroom_save_response(uuid, text, jsonb)', 'execute')      as anon_can_save,
--   has_function_privilege('authenticated',
--     'public.classroom_save_response(uuid, text, jsonb)', 'execute')      as authed_can_save,
--   has_function_privilege('authenticated',
--     'public._classroom_response_revision(uuid, text, text, jsonb)', 'execute')
--                                                                          as authed_can_write_history,
--   has_table_privilege('anon',
--     'public.classroom_response_revisions', 'select')                     as anon_can_read_history,
--   has_table_privilege('authenticated',
--     'public.classroom_response_revisions', 'insert')                     as authed_can_insert_history,
--   (select count(*) from pg_policy
--      where polrelid = 'public.classroom_response_revisions'::regclass)   as history_policies,
--   (select count(*) from public.classroom_response_revisions)             as revisions_stored,
--   (select count(*) from public.classroom_items
--      where id = '00000000-0000-4000-8000-000000000228')                   as selfcheck_leftover;
--
-- EXPECT, immediately after applying: save_arities 1, save_records_history 1,
-- anon_can_save false, authed_can_save true, authed_can_write_history false,
-- anon_can_read_history false, authed_can_insert_history false,
-- history_policies 1, revisions_stored 0, selfcheck_leftover 0.
--
-- `revisions_stored` IS THE ONE WORTH RE-RUNNING LATER. It is 0 on apply and
-- should climb the first time a student types into any assignment. A number
-- that stays at 0 after one has means saves are not reaching the helper.
