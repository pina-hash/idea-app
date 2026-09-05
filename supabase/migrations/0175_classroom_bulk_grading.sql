-- 0175_classroom_bulk_grading.sql
--
-- GRADE MANY STUDENTS IN ONE STATEMENT, across every section of the assignment
-- the caller manages.
--
-- WHY THIS EXISTS AT ALL, since the single-student RPC already works. Grading
-- is one call per student per assignment, so a class of thirty is thirty round
-- trips and an instructor teaching the same course to three sections makes
-- ninety. A client-side loop closes none of that honestly: thirty calls are
-- thirty TRANSACTIONS, and a loop that dies at call seventeen -- a closed tab, a
-- lid, a dropped connection -- leaves sixteen grades landed, fourteen not, and
-- the only record of which is which in the memory of the tab that just went
-- away. One statement is one round trip whose answer either comes back naming
-- every student or does not come back at all.
--
-- IT REIMPLEMENTS NOTHING. Every row goes through
-- `public.classroom_grade_submission` -- the 7-argument form 0171 added -- so
-- the rubric arithmetic, the override-needs-a-comment refusal, the
-- incomplete-scores refusal, the extra-credit range, the `score` that carries
-- the award and the `graded_at = now()` stamp are all the one implementation
-- they have always been. This file adds a loop, a per-row exception handler and
-- a report. That is deliberately all it adds.
--
-- AND IT GRANTS NOTHING. `classroom_grade_submission` asks
-- `classroom_can_review_submission(item, student)` on every row, which is
-- "the item is posted to a section I manage AND this student is enrolled in
-- that section". SECURITY DEFINER nesting does not change what that resolves
-- to: `classroom_manages_section` reads `current_user_email()`, which reads the
-- session's JWT claims, so the inner call is authorized as the ORIGINAL caller
-- however many definer frames sit between them. A batch naming a student in a
-- section the caller does not manage gets that student's row refused with the
-- sentence the single-student path already gives, and every other row still
-- lands. There is no widening here and there must never be one: if this
-- function ever needs an authorization decision of its own, that is the signal
-- it has stopped being a loop over the real one.
--
-- THE REPORT IS THE POINT, not a courtesy. `{total, succeeded, refused,
-- results}` is the shape every bulk RPC in this schema returns
-- (`coin_bulk_payout`, `coin_bulk_log_section`, `classroom_import_roster`), and
-- the per-row exception handler is what makes it true: one student's refusal
-- can never abort the batch and can never be mistaken for the batch failing. A
-- bulk action that half-succeeds silently is worse than thirty deliberate ones.
--
-- WHAT UNDOES IT:
--   drop function public.classroom_grade_submissions(uuid, jsonb, boolean);
-- Nothing else changes: no table, no column, no policy, no grant on anything
-- that existed before. Grades already written through it are ordinary rows
-- written by `classroom_grade_submission` and are indistinguishable from grades
-- entered one at a time, which is exactly what they are.

-- ---------------------------------------------------------------------------
-- 1. The batch.
-- ---------------------------------------------------------------------------
-- Re-appliable over a machine that took an earlier draft: the signature is
-- dropped at its own exact types first, so a parameter that moved cannot
-- survive as a second overload (the signature trap).

drop function if exists public.classroom_grade_submissions(uuid, jsonb, boolean);

create function public.classroom_grade_submissions(
	p_item_id uuid,
	-- An ARRAY, one object per student:
	--   { "student_email": "...", "scores": {...}, "comment": "...",
	--     "criterion_comments": {...}, "extra_credit": 3 }
	-- Every key but `student_email` is optional. An ABSENT `extra_credit`, and a
	-- present one that is json null, both mean LEAVE WHATEVER IS STORED ALONE --
	-- 0171's own contract, restated nowhere: it is passed straight through as
	-- SQL null and the single-row function decides.
	p_grades jsonb,
	-- ONE decision for the whole batch. Returning is an act an instructor
	-- performs on a group; a per-row flag would let one commit both release and
	-- withhold, which nothing on any surface asks for and which no reader of the
	-- result could tell apart.
	p_return boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_n integer;
	v_row jsonb;
	v_email text;
	v_by_email jsonb := '{}'::jsonb;
	v_rec record;
	v_call jsonb;
	v_extra numeric;
	v_results jsonb := '[]'::jsonb;
	v_total integer := 0;
	v_succeeded integer := 0;
	v_refused integer := 0;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if p_grades is null or jsonb_typeof(p_grades) is distinct from 'array' then
		raise exception 'Grades must be an array, one entry per student.';
	end if;
	if jsonb_array_length(p_grades) = 0 then
		raise exception 'Select at least one student to grade.';
	end if;
	-- A CEILING, not a policy about class size. Three sections of thirty is
	-- ninety; this is generous against that and still bounds one statement's
	-- work, so a malformed caller cannot ask for an unbounded loop inside a
	-- transaction that holds row locks on every submission it touches.
	if jsonb_array_length(p_grades) > 200 then
		raise exception 'Grade at most 200 students in one batch (% given).',
			jsonb_array_length(p_grades);
	end if;

	-- -------------------------------------------------------------------
	-- Normalize and dedupe BEFORE anything is written.
	--
	-- A balance, an enrollment and a grade are all keyed on the address, so
	-- `A@x` and `a@x` are one person. Two entries for one student would grade
	-- them twice -- the second silently clobbering the first -- and report a
	-- `total` that counts a person once per spelling. This refuses instead,
	-- naming the address, and it refuses before the loop so nothing is half
	-- written when it does.
	-- -------------------------------------------------------------------
	for v_n in 0 .. jsonb_array_length(p_grades) - 1 loop
		v_row := p_grades -> v_n;
		if jsonb_typeof(v_row) is distinct from 'object' then
			raise exception 'Entry % is not an object.', v_n + 1;
		end if;
		v_email := lower(btrim(coalesce(v_row ->> 'student_email', '')));
		if v_email = '' or v_email not like '%@%' then
			raise exception 'Entry % has no student email.', v_n + 1;
		end if;
		if v_by_email ? v_email then
			raise exception 'Student % appears twice in this batch. Grade each student once.', v_email;
		end if;
		v_by_email := v_by_email || jsonb_build_object(v_email, v_row);
	end loop;

	-- -------------------------------------------------------------------
	-- The writes, in address order so two identical batches report in the
	-- same order and a diff of two runs is readable.
	-- -------------------------------------------------------------------
	for v_rec in select key, value from jsonb_each(v_by_email) order by key loop
		v_total := v_total + 1;
		begin
			-- `? 'extra_credit'` and NOT `jsonb_typeof(...) <> 'number'`: an
			-- absent key makes that comparison NULL rather than true, the guard
			-- falls through, and the fall-through ACCEPTS (the 0125 lesson).
			-- Absent means leave alone; present-and-null means leave alone;
			-- present-and-anything-else is this row's own refusal.
			if v_rec.value ? 'extra_credit'
				and jsonb_typeof(v_rec.value -> 'extra_credit') is distinct from 'null'
			then
				if jsonb_typeof(v_rec.value -> 'extra_credit') is distinct from 'number' then
					raise exception 'Extra credit must be a number of 0 or more. Leave it blank to award none.';
				end if;
				v_extra := (v_rec.value ->> 'extra_credit')::numeric;
			else
				v_extra := null;
			end if;

			-- THE ONE IMPLEMENTATION OF THE GRADING RULE, called per row.
			v_call := public.classroom_grade_submission(
				p_item_id,
				v_rec.key,
				coalesce(v_rec.value -> 'scores', '{}'::jsonb),
				nullif(btrim(coalesce(v_rec.value ->> 'comment', '')), ''),
				p_return,
				coalesce(v_rec.value -> 'criterion_comments', '{}'::jsonb),
				v_extra
			);
		exception when others then
			-- The exception handler opens a SUBTRANSACTION, so a row that raises
			-- rolls back its own work and nothing else. That is what makes one
			-- statement safe to run over a class: a refusal is a line in the
			-- report, never the end of the batch.
			v_call := jsonb_build_object('ok', false, 'reason', 'error', 'message', sqlerrm);
		end;

		if coalesce((v_call ->> 'ok')::boolean, false) then
			v_succeeded := v_succeeded + 1;
		else
			v_refused := v_refused + 1;
		end if;
		-- The address FIRST, so a result can never be read as belonging to the
		-- wrong student even if the inner call returned nothing recognisable.
		v_results := v_results || jsonb_build_array(jsonb_build_object('email', v_rec.key) || v_call);
	end loop;

	return jsonb_build_object(
		'ok', true,
		'total', v_total,
		'succeeded', v_succeeded,
		'refused', v_refused,
		'results', v_results
	);
end;
$$;

-- NAMES THE ROLES. `revoke ... from public` alone removes one ACL entry and
-- leaves the direct `anon` grant a hosted Supabase project writes into every
-- new function's proacl at creation time. 0137 is a one-time repair of what was
-- already there and does not cover a function created after it.
revoke all on function public.classroom_grade_submissions(uuid, jsonb, boolean)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_grade_submissions(uuid, jsonb, boolean)
	to authenticated;

comment on function public.classroom_grade_submissions(uuid, jsonb, boolean) is
	'Grade many students on one assignment in one statement. Loops classroom_grade_submission per row with a per-row exception handler; returns {ok, total, succeeded, refused, results:[{email, ...}]}. Adds no authorization of its own -- every row is gated by classroom_can_review_submission inside the single-row function.';

-- ---------------------------------------------------------------------------
-- 2. Self-check. Asserts the CATALOG and the ACL, not its own verdict.
-- ---------------------------------------------------------------------------

do $$
declare
	v_arities integer;
	v_anon boolean;
	v_auth boolean;
begin
	select count(*) into v_arities
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_grade_submissions';
	if v_arities <> 1 then
		raise exception '0175: expected exactly 1 classroom_grade_submissions, found %. A surviving overload is the signature trap.', v_arities;
	end if;

	-- The batch is new; the single-row function it calls must already be here,
	-- at the 7-argument arity, or every row would raise at the first call.
	if not exists (
		select 1 from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
			and p.proname = 'classroom_grade_submission'
			and pg_get_function_identity_arguments(p.oid)
				= 'p_item_id uuid, p_student_email text, p_scores jsonb, p_comment text, p_return boolean, p_criterion_comments jsonb, p_extra_credit numeric'
	) then
		raise exception '0175: classroom_grade_submission''s 7-argument form is missing. Apply 0171 first.';
	end if;

	v_anon := has_function_privilege('anon',
		'public.classroom_grade_submissions(uuid, jsonb, boolean)', 'execute');
	v_auth := has_function_privilege('authenticated',
		'public.classroom_grade_submissions(uuid, jsonb, boolean)', 'execute');
	if v_anon then
		raise exception '0175: anon can execute classroom_grade_submissions. The revoke did not name every role.';
	end if;
	if not v_auth then
		raise exception '0175: authenticated cannot execute classroom_grade_submissions.';
	end if;

	raise notice '0175: classroom_grade_submissions created. arities=%, anon=%, authenticated=%',
		v_arities, v_anon, v_auth;
end
$$;
