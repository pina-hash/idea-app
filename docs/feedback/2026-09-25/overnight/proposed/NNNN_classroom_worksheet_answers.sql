-- NNNN_classroom_worksheet_answers.sql -- PROPOSED, NOT A MIGRATION (ledger 0298).
--
-- NEEDS A NUMBER FROM THE LEDGER BEFORE IT IS PROMOTED. None was reserved for it
-- on the night it was written (0228 and 0229 belong to decisions 37 and 38), so
-- it carries `NNNN` and the README beside it says how to promote it.
--
-- WHAT IT IS FOR. Finishing a ported HTML worksheet is turning it in (decision
-- 37), and that is DERIVED from the student's stored answers and photographs by
-- `hxCompletion` in `src/lib/classroom/html-assignment/progress.ts`. A student's
-- own pages read their own rows, pinned to their address, and pay nothing. A
-- TEACHER's surfaces that summarise a whole class -- the Grades tab's "to mark"
-- count and the home page's to-grade tally -- would have to read every
-- student's answers on every worksheet in the class, and `classroom_responses`
-- is policed PER ROW (`student_email = current_user_email() or
-- classroom_can_review_submission(item_id, student_email)`): the review
-- predicate runs once for every answer. Measured on the test cluster, as a
-- non-admin teacher, one class of 30 and three worksheets of 20, 40 and 60
-- blocks (3,150 answers): a bare count took 507 to 616ms, and the paged read the
-- client makes (`readWorksheetCompletions`) 2.27 to 2.60 SECONDS, against a Grades
-- load of 17 to 44ms. With four classes of 30 on the same worksheets (12,600
-- answers) the count took 4.9 to 5.2 seconds and the paged read gave up.
--
-- WHAT IT DOES. One definer function that answers the same rows the policy would
-- give the caller as a REVIEWER, but asks the manage question ONCE PER POSTING
-- instead of once per row: the (item, section) pairs the caller manages, joined
-- to those sections' enrollments, joined to the answers and the block
-- photographs. That join IS `classroom_can_review_submission`'s own body (0086),
-- written set-wise, so the reach cannot widen: a teacher of one class on a
-- co-posted assignment receives their own class's students and no one else's,
-- exactly as the policy decides today, and enrollment is NOT filtered to active
-- (a student deactivated mid-term still has work to grade), exactly as there.
--
-- IT RETURNS VALUES, NOT A VERDICT, AND THAT IS THE POINT. The completeness rule
-- is `hxCompletion` and there is one of it; a SQL copy of "what counts as an
-- answer" per block type is the second implementation that stops matching. So
-- the client groups these rows by (item, student) and judges them with
-- `worksheetCompletedAt`, the function the student's own read already uses.
--
-- IT RETURNS ONE jsonb, NOT A SET. PostgREST caps a set-returning RPC at
-- `max_rows` (1000 on this project) without an error, which is the truncation
-- `readWorksheetCompletions` pages to avoid; one scalar is one row.
--
-- ONE CLASS OR EVERY CLASS. `p_section_id` narrows the reach to one class the
-- caller manages (the Grades tab is one class; a teacher who teaches the same
-- worksheet to four classes would otherwise receive four classes of answers to
-- count one), and NULL is every class they manage (the home tally). A class
-- the caller does not manage narrows the reach to nothing.
--
-- WHAT IT IS NOT. Not a student path: a caller who manages nothing receives
-- nothing, including their own rows (their own pages read those directly). Not
-- anon's: no session means no managed section. At most 200 items per call.
--
-- GRANTS: the 0166 shape. `revoke all ... from public, anon, authenticated`,
-- then `authenticated` alone; `service_role` untouched. Asserted at apply.
--
-- DEPLOY ORDERING: none. The function is new and additive; a client that calls
-- it degrades on `PGRST202` to what it shows today, so either may land first.
--
-- UNDO: `drop function if exists public.classroom_worksheet_answers(uuid[], uuid);`
-- after the client that calls it is gone or degrades (it does, on PGRST202).

create or replace function public.classroom_worksheet_answers(
	p_item_ids uuid[],
	p_section_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_out jsonb;
begin
	if p_item_ids is null or cardinality(p_item_ids) = 0 then
		return jsonb_build_object('answers', '[]'::jsonb, 'files', '[]'::jsonb);
	end if;
	if cardinality(p_item_ids) > 200 then
		raise exception 'At most 200 assignments can be read at once.';
	end if;

	with reach as (
		-- The postings the caller manages, asked once each: the manage half of
		-- classroom_can_review_submission.
		select distinct pg.item_id, pg.section_id
		from public.classroom_postings pg
		where pg.item_id = any (p_item_ids)
			and (p_section_id is null or pg.section_id = p_section_id)
			and public.classroom_manages_section(pg.section_id)
	),
	pairs as (
		-- The students of those sections: the enrollment half, not filtered to
		-- active, exactly as the review predicate is not.
		select distinct r.item_id, e.student_email
		from reach r
		join public.classroom_enrollments e on e.section_id = r.section_id
	)
	select jsonb_build_object(
		'answers', coalesce((
			select jsonb_agg(
				jsonb_build_object(
					'item_id', a.item_id,
					'student_email', a.student_email,
					'block_id', a.block_id,
					'value', a.value,
					'updated_at', a.updated_at
				)
				order by a.item_id, a.student_email, a.block_id
			)
			from public.classroom_responses a
			join pairs p on p.item_id = a.item_id and p.student_email = a.student_email
		), '[]'::jsonb),
		'files', coalesce((
			select jsonb_agg(
				jsonb_build_object(
					'id', f.id,
					'submission_id', f.submission_id,
					'block_id', f.block_id,
					'caption', f.caption,
					'filename', f.filename,
					'mime_type', f.mime_type,
					'sort_order', f.sort_order,
					'created_at', f.created_at,
					'item_id', s.item_id,
					'student_email', s.student_email
				)
				order by f.id
			)
			from public.classroom_submission_files f
			join public.classroom_submissions s on s.id = f.submission_id
			join pairs p on p.item_id = s.item_id and p.student_email = s.student_email
			where f.block_id is not null
		), '[]'::jsonb)
	)
	into v_out;

	return v_out;
end;
$$;

revoke all on function public.classroom_worksheet_answers(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.classroom_worksheet_answers(uuid[], uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Apply-time self-checks. Each raises, so a file that fails one leaves nothing.
-- ---------------------------------------------------------------------------
do $$
declare
	v_overloads int;
begin
	select count(*) into v_overloads
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_worksheet_answers';
	if v_overloads <> 1 then
		raise exception 'classroom_worksheet_answers: expected exactly one overload, found %', v_overloads;
	end if;
	if has_function_privilege('anon', 'public.classroom_worksheet_answers(uuid[], uuid)', 'execute') then
		raise exception 'classroom_worksheet_answers: anon can execute it; revoke from anon by name (the 0166 shape)';
	end if;
	if not has_function_privilege('authenticated', 'public.classroom_worksheet_answers(uuid[], uuid)', 'execute') then
		raise exception 'classroom_worksheet_answers: authenticated cannot execute it';
	end if;
	if not exists (
		select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'classroom_worksheet_answers'
			and p.prosecdef
			and p.prosrc like '%public.classroom_manages_section(pg.section_id)%'
			and p.prosrc like '%join public.classroom_enrollments e on e.section_id = r.section_id%'
	) then
		raise exception 'classroom_worksheet_answers: the reach is not the review predicate''s own join (manages the posting, enrolled in its section)';
	end if;
	raise notice 'classroom_worksheet_answers: one overload, definer, authenticated only, reach is manages-posting x enrollment';
end;
$$;

-- Verification query, to paste after an apply (every column should read true):
-- select
--   has_function_privilege('authenticated', 'public.classroom_worksheet_answers(uuid[], uuid)', 'execute') as authenticated_can,
--   not has_function_privilege('anon', 'public.classroom_worksheet_answers(uuid[], uuid)', 'execute') as anon_cannot,
--   (select count(*) = 1 from pg_proc where proname = 'classroom_worksheet_answers') as one_overload;
