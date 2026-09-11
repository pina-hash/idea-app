-- ===========================================================================
-- 0198 -- AN INSTRUCTOR CAN CLOSE AN ASSIGNMENT, PER ITEM.
--
-- Mr. Pina, 2026-09-10: he wants to close an assignment at the end of a unit so
-- no more work lands after he has graded it.
--
-- WHAT THIS ADDS, AND WHAT IT DELIBERATELY DOES NOT. It adds ONE new object --
-- `classroom_close_assignment` -- and re-signs ONE existing one. There is no
-- new table, no new column, no new state value and no second definition of what
-- a locked assignment is. Closing sets `classroom_submissions.state` to
-- 'submitted', which is the value `classroom_save_response` and
-- `classroom_add_submission_file` have refused on since 0086. Nothing about how
-- a lock is ENFORCED changes here; what changes is who is able to place one.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS MEASURED FIRST, BECAUSE THIS FILE EXISTS ONLY IF THE ANSWER WAS NO
-- ---------------------------------------------------------------------------
--
-- Against the real chain on a real embedded Postgres, as the real roles:
--
--   * `classroom_submit_assignment` is the ONLY function in the schema that
--     writes `state = 'submitted'`, and it resolves its subject through
--     `_classroom_engine_student`, which is the CALLER. A teacher calling it is
--     refused: 'Only a student enrolled in this class can work on this
--     assignment.'
--   * A teacher writing the column directly is refused too -- `permission
--     denied for table classroom_submissions` -- because 0086 grants SELECT
--     only and every write is an RPC.
--
-- So no path existed, for one student or for a class, and this file is the one.
--
-- ---------------------------------------------------------------------------
-- THE DISCRIMINATOR IS `submitted_at`, AND WITHOUT IT THE FEATURE DOES NOT WORK
-- ---------------------------------------------------------------------------
--
-- `classroom_unsubmit_assignment` (0086) lets a student take their own work
-- back, refusing only once a grade has been saved. Measured: with a row put
-- into `submitted` and no grade on it -- which is exactly what an end-of-unit
-- close looks like for every student who never handed anything in -- a student
-- calling `classroom_unsubmit_assignment` gets `{"ok":true,"state":"draft"}`
-- and the close is gone. A lock any student can remove in one call is not a
-- lock.
--
-- The two events are told apart by a column that already exists.
-- `classroom_submit_assignment` stamps `submitted_at` in the same statement it
-- sets the state, and always has; this function deliberately leaves it NULL. So
-- `state = 'submitted' and submitted_at is null` is an instructor's close and
-- nothing else, and `classroom_unsubmit_assignment` refuses that row with a new
-- `closed` reason.
--
-- THAT IS A NARROWING, SO IT ANSWERS FOR THE ROWS ALREADY STORED. A narrowing
-- starts saying no to something already in the table, silently, and only at the
-- next write. Because the pair is unreachable before this file -- the one
-- writer of the state writes the stamp beside it -- the guard is INERT over
-- every existing row. Section 4 does not assume that: it COUNTS the rows that
-- would change answer, under the deployed shape, and RAISES with the number
-- rather than applying if any exist. The client-side mirror of the same
-- predicate is `src/lib/classroom/html-assignment/lock.ts`, named by path
-- rather than by its import alias because a dollar sign inside a SQL comment is
-- the paste trap 0194 cost an apply cycle to: it balances in Postgres and
-- breaks the Supabase editor's own client-side statement splitter.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS NOT
-- ---------------------------------------------------------------------------
--
--   * NOT A UNIT-WIDE LOCK. It is PER ITEM. Closing a whole unit in one act is
--     a later bundle and would need its own answer for what a unit is, which
--     `notebook_unit_items` and `classroom_items` spell differently.
--   * NOT TELEMETRY. It records no presence, no active time and no per-student
--     status beyond the state column that already existed. Anything of that
--     shape is a separate design with its own retention question about minors'
--     data.
--   * NOT A CHANGE TO GRADING. `classroom_grade_submission` writes 'returned'
--     on release and 'draft' otherwise and is not touched here. Returning a
--     grade therefore RE-OPENS a closed student, which is deliberate -- 0086
--     defines 'returned' as graded and released, editable again, and grading
--     must never leave a student locked out of their own work. The order is
--     grade, then close, and the console says so in words.
--   * NOT A SECOND AUTHORIZATION MODEL. The gate is
--     `classroom_can_review_submission`, the same per-student predicate every
--     grading RPC already asks. A caller who may grade a student may close that
--     student's work and no one else's.
--
-- TO UNDO THIS MIGRATION:
--   drop function public.classroom_close_assignment(uuid, text, boolean);
--   and restore `classroom_unsubmit_assignment` from
--   0086_classroom_assignment_engine.sql lines 1281-1310, which is the body
--   section 3 below re-signs with one guard added.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Guard: the objects this file re-signs must already be there.
-- ---------------------------------------------------------------------------

-- THE NARROWING'S COUNT IS TAKEN HERE, BEFORE SECTION 3 REPLACES THE FUNCTION,
-- AND ONLY ON A FIRST APPLY.
--
-- Re-pasting a migration is ordinary, and by section 4 the guard is in place
-- either way -- so a count taken down there could not tell a first apply from a
-- second, and on a second it would be counting the rows THIS FEATURE created
-- and refusing to re-apply over its own work. The question is asked of the
-- DEPLOYED function's own source: a body that does not yet carry the 'closed'
-- refusal is a database this narrowing is new to, and that is the only database
-- whose stored rows can change answer.

do $$
declare
	v_already boolean;
	v_stranded bigint;
begin
	if to_regprocedure('public.classroom_unsubmit_assignment(uuid)') is null then
		raise exception '0198 needs classroom_unsubmit_assignment(uuid); apply 0086 first.';
	end if;
	if to_regprocedure('public.classroom_can_review_submission(uuid, text)') is null then
		raise exception '0198 needs classroom_can_review_submission(uuid, text); apply 0086 first.';
	end if;

	select position('''reason'', ''closed''' in p.prosrc) > 0 into v_already
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_unsubmit_assignment';

	if coalesce(v_already, false) then
		raise notice '0198: classroom_unsubmit_assignment already carries the ''closed'' refusal; this is a re-apply, so the stored-row count is skipped.';
	else
		-- TAKEN AS THE BEHAVIOURAL QUESTION -- which stored rows does the guard
		-- now refuse that the DEPLOYED function accepts -- rather than as a
		-- second hand-written idea of what a close looks like. The pair should be
		-- unreachable before this file, because `classroom_submit_assignment` is
		-- the only writer of the state and stamps the column beside it. If any
		-- exist, this refuses rather than stranding a student mid-edit with an
		-- unsubmit that has silently stopped working, and whoever is applying it
		-- decides what those rows are.
		select count(*) into v_stranded
		from public.classroom_submissions
		where state = 'submitted' and submitted_at is null and graded_at is null;
		if v_stranded > 0 then
			raise exception
				'0198: % submission row(s) are already in state ''submitted'' with no submitted_at, so the new unsubmit guard would refuse work a student can undo today. Inspect them (select item_id, student_email from public.classroom_submissions where state = ''submitted'' and submitted_at is null) and stamp or clear them before applying.',
				v_stranded;
		end if;
		raise notice '0198: 0 stored row(s) change answer under the new unsubmit guard.';
	end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. THE ONE NEW OBJECT.
--
-- `p_student_email` null means EVERY student the caller may review on this
-- item, which is the end-of-unit act; a named address is the single-student
-- form. One function rather than two, because the rule about who may do it and
-- what a close writes is one rule, and two functions is the copy that stops
-- agreeing.
--
-- `p_closed => false` REOPENS, and it is on the same object for the same
-- reason. A close with no way back is a trap: the mistake is one press and the
-- only route out would be grading everybody. Reopening touches ONLY rows this
-- function could have written -- `submitted` with a null `submitted_at` -- so a
-- student's own hand-in is never quietly torn up by an instructor reopening an
-- item, and a `returned` row is left exactly where grading put it.
--
-- IT REPORTS PER STUDENT, in the bulk shape 0175 already uses, so one student's
-- refusal never obscures whether the rest landed. `refused` here means the
-- caller may not review that student -- the only refusal this can produce --
-- and it is reported rather than silently skipped, because a roster that
-- quietly lost a name is how a class gets closed with one student still able to
-- write.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_close_assignment(
	p_item_id uuid,
	p_student_email text default null,
	p_closed boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_now timestamptz := now();
	v_target text;
	v_email text;
	v_before text;
	v_after text;
	v_results jsonb := '[]'::jsonb;
	v_total integer := 0;
	v_changed integer := 0;
	v_refused integer := 0;
	v_unchanged integer := 0;
	v_closed boolean := coalesce(p_closed, true);
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if p_item_id is null then
		raise exception 'An assignment is required.';
	end if;
	if not exists (
		select 1 from public.classroom_items i
		where i.id = p_item_id and i.kind = 'assignment'
	) then
		raise exception 'That assignment does not exist.';
	end if;

	v_target := nullif(lower(btrim(coalesce(p_student_email, ''))), '');

	-- THE ROSTER COMES FROM THE ROSTER, never from whoever happens to have a
	-- submission row. A student who has not opened the assignment is exactly the
	-- student a close is for: with no row at all `classroom_save_response` reads
	-- no state and accepts the write, so closing has to CREATE the row. Taking
	-- the list from `classroom_submissions` would close the assignment for
	-- everyone who had already started and leave it open for everyone who had
	-- not, which is precisely backwards.
	for v_email in
		select distinct e.student_email
		from public.classroom_postings pg
		join public.classroom_enrollments e on e.section_id = pg.section_id
		where pg.item_id = p_item_id
			and (v_target is null or e.student_email = v_target)
		order by e.student_email
	loop
		v_total := v_total + 1;

		-- THE SAME PER-STUDENT GATE EVERY GRADING RPC ASKS, asked per row rather
		-- than once for the item: a co-posted item legitimately puts students
		-- from a section this caller does not manage on the enrollment join, and
		-- they are not this caller's to close.
		if not public.classroom_can_review_submission(p_item_id, v_email) then
			v_refused := v_refused + 1;
			v_results := v_results || jsonb_build_object(
				'student_email', v_email, 'ok', false, 'reason', 'not_yours'
			);
			continue;
		end if;

		select s.state into v_before
		from public.classroom_submissions s
		where s.item_id = p_item_id and s.student_email = v_email;

		if v_closed then
			-- A STUDENT'S OWN HAND-IN IS LEFT ALONE. It is already refusing
			-- writes, it carries a `submitted_at` this function must not
			-- manufacture, and overwriting it would erase the one fact that says
			-- they turned it in themselves.
			if v_before = 'submitted' then
				v_unchanged := v_unchanged + 1;
				v_results := v_results || jsonb_build_object(
					'student_email', v_email, 'ok', true, 'state', 'submitted', 'changed', false
				);
				continue;
			end if;

			-- `submitted_at` IS LEFT NULL ON PURPOSE. See the header: it is the
			-- whole discriminator, and stamping it here would make an instructor's
			-- close indistinguishable from a hand-in the student never made --
			-- which would both lie to the roster and hand the student the
			-- unsubmit that section 3 exists to take away.
			insert into public.classroom_submissions (item_id, student_email, state, updated_at)
			values (p_item_id, v_email, 'submitted', v_now)
			on conflict (item_id, student_email) do update
				set state = 'submitted', updated_at = v_now;

			v_changed := v_changed + 1;
			v_results := v_results || jsonb_build_object(
				'student_email', v_email, 'ok', true, 'state', 'submitted', 'changed', true,
				'was', coalesce(v_before, 'none')
			);
		else
			-- REOPEN ONLY WHAT A CLOSE PUT THERE. The predicate is the
			-- discriminator again, stated once more rather than widened: a
			-- `submitted` row carrying a stamp is the student's and stays.
			update public.classroom_submissions
			set state = 'draft', updated_at = v_now
			where item_id = p_item_id
				and student_email = v_email
				and state = 'submitted'
				and submitted_at is null;

			if found then
				v_changed := v_changed + 1;
				v_results := v_results || jsonb_build_object(
					'student_email', v_email, 'ok', true, 'state', 'draft', 'changed', true,
					'was', 'submitted'
				);
			else
				v_unchanged := v_unchanged + 1;
				select s.state into v_after
				from public.classroom_submissions s
				where s.item_id = p_item_id and s.student_email = v_email;
				v_results := v_results || jsonb_build_object(
					'student_email', v_email, 'ok', true,
					'state', coalesce(v_after, 'none'), 'changed', false
				);
			end if;
		end if;
	end loop;

	if v_target is not null and v_total = 0 then
		return jsonb_build_object(
			'ok', false, 'reason', 'not_enrolled', 'total', 0,
			'changed', 0, 'unchanged', 0, 'refused', 0, 'results', '[]'::jsonb
		);
	end if;

	return jsonb_build_object(
		'ok', true,
		'closed', v_closed,
		'total', v_total,
		'changed', v_changed,
		'unchanged', v_unchanged,
		'refused', v_refused,
		'results', v_results
	);
end;
$$;

-- THE NARROWING NAMES THE ROLES. A hosted Supabase project writes a DIRECT
-- grant to anon, authenticated and service_role into every new function's acl
-- at creation time, so `revoke ... from public` alone would leave this granted
-- to anon. 0137 is a one-time repair of what was already there and does not
-- cover a function created after it.
revoke all on function public.classroom_close_assignment(uuid, text, boolean)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_close_assignment(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. `classroom_unsubmit_assignment`, RE-SIGNED WITH ONE GUARD.
--
-- DIFFED AGAINST THE SOURCE rather than reconstructed from memory: this is
-- 0086's body verbatim with a single `if` inserted between the two refusals it
-- already had. The signature, the language, the security, the search_path, the
-- two existing refusal reasons and their ORDER are unchanged, so a student who
-- has genuinely submitted reads exactly what they have always read.
--
-- ITS ARITY DOES NOT MOVE, so there is no signature trap and no deploy
-- ordering: the running client calls `classroom_unsubmit_assignment(uuid)`
-- before and after.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_unsubmit_assignment(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_row public.classroom_submissions%rowtype;
begin
	select s.* into v_row
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;
	if not found or v_row.state <> 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'not_submitted');
	end if;
	-- 0198: THE INSTRUCTOR'S CLOSE IS NOT THE STUDENT'S TO UNDO. A row in
	-- 'submitted' with no `submitted_at` was never handed in by this student --
	-- see the header for why that pair is exactly and only a close -- so there
	-- is nothing here for them to take back. It is a structured refusal and not
	-- a raise: the student did nothing wrong, and the surface has a sentence for
	-- it.
	if v_row.submitted_at is null then
		return jsonb_build_object('ok', false, 'reason', 'closed');
	end if;
	if v_row.graded_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'graded');
	end if;

	update public.classroom_submissions
	set state = 'draft', updated_at = now()
	where id = v_row.id;

	return jsonb_build_object('ok', true, 'state', 'draft');
end;
$$;

-- Restated rather than inherited: `create or replace` preserves an existing
-- acl, which on production is the end state 0086 and 0137 already left, but
-- naming the roles makes this file independent of that and covers a database
-- where this replace is a create.
revoke all on function public.classroom_unsubmit_assignment(uuid) from public, anon, authenticated;
grant execute on function public.classroom_unsubmit_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Self-check. Asserts the acl and the catalog, never its own verdict, and
--    COUNTS the rows the narrowing in section 3 would change the answer for.
-- ---------------------------------------------------------------------------

do $$
declare
	v_arities integer;
	v_defaults integer;
	v_anon boolean;
	v_auth boolean;
	v_service boolean;
	v_unsub_anon boolean;
	v_unsub_auth boolean;
	v_guarded boolean;
	v_closed bigint;
begin
	select count(*) into v_arities
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_close_assignment';
	if v_arities <> 1 then
		raise exception '0198: expected exactly 1 arity of classroom_close_assignment, found %.', v_arities;
	end if;

	select p.pronargdefaults into v_defaults
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_close_assignment';
	if v_defaults <> 2 then
		raise exception '0198: classroom_close_assignment must default its last 2 parameters; it defaults %.', v_defaults;
	end if;

	v_anon := has_function_privilege('anon',
		'public.classroom_close_assignment(uuid, text, boolean)', 'execute');
	v_auth := has_function_privilege('authenticated',
		'public.classroom_close_assignment(uuid, text, boolean)', 'execute');
	v_service := has_function_privilege('service_role',
		'public.classroom_close_assignment(uuid, text, boolean)', 'execute');
	if v_anon then
		raise exception '0198: anon must not hold execute on classroom_close_assignment.';
	end if;
	if v_service then
		raise exception '0198: service_role must not hold execute on classroom_close_assignment.';
	end if;
	if not v_auth then
		raise exception '0198: authenticated must hold execute on classroom_close_assignment.';
	end if;

	v_unsub_anon := has_function_privilege('anon',
		'public.classroom_unsubmit_assignment(uuid)', 'execute');
	v_unsub_auth := has_function_privilege('authenticated',
		'public.classroom_unsubmit_assignment(uuid)', 'execute');
	if v_unsub_anon then
		raise exception '0198: anon must not hold execute on classroom_unsubmit_assignment.';
	end if;
	if not v_unsub_auth then
		raise exception '0198: authenticated must hold execute on classroom_unsubmit_assignment.';
	end if;

	-- THE GUARD IS ASSERTED FROM THE CATALOG, not from the fact that section 3
	-- ran: a self-check that trusted its own file would pass on a database where
	-- the replace silently did not take.
	select position('''reason'', ''closed''' in p.prosrc) > 0 into v_guarded
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_unsubmit_assignment';
	if not coalesce(v_guarded, false) then
		raise exception '0198: classroom_unsubmit_assignment does not carry the ''closed'' refusal.';
	end if;

	select count(*) into v_closed
	from public.classroom_submissions
	where state = 'submitted' and submitted_at is null;
	raise notice '0198: classroom_close_assignment created; % row(s) currently read as instructor-closed.', v_closed;
end
$$;
