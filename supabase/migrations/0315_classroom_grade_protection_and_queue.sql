-- 0315_classroom_grade_protection_and_queue.sql
--
-- GRADING CATCH-UP, PART 1 (ledger 0457, queue items 11 and 13; Mr. Pina,
-- 2026-10-28: "I need to catch up on grading for all my classes, except for
-- the idea 2 9H, block 4, section 3.").
--
-- A. A CLASS CAN ONLY FILL EMPTY GRADES (report 2044c229). FACTS is the grade
--    system of record and he does not grade IDEA209H Block 4 (Mr. Cosso's
--    section): there he never overwrites a grade already in IDEA Classroom,
--    only fills empty ones. A bulk grade on a post shared with Block 4 could
--    overwrite those grades. `classroom_sections.grades_fill_empty_only` is
--    the per-class switch, and `_classroom_grade_protection_check` is the ONE
--    rule, called from every write that changes a grade:
--      classroom_grade_submission (which the bulk, team and typed-score
--      doors all call), classroom_grade_direct (before it stores the typed
--      score), classroom_revoke_grade and classroom_unreturn_grade.
--    THE RULE: in a protected class, a grade that already exists (graded or
--    returned) and that somebody ELSE gave is never changed. An empty grade
--    may be filled, and a grade the caller gave may be corrected, so a held
--    fill can still be returned. A row with no recorded grader counts as
--    somebody else's. A refusal changes nothing and is recorded in
--    `classroom_grade_protection_refusals` with what was proposed, so he has
--    the list of grades it kept. IT FAILS CLOSED: a student in two classes of
--    the post counts as protected if either class is; an unknown caller is
--    never the grader; any error inside the check aborts the grade.
--
-- B. ONE "NEEDS GRADING" READ (gap ba704a08). `classroom_needs_grading`
--    answers, for every class the caller teaches (or the ones named), every
--    past-due assignment with saved student work and no grade yet, with the
--    students waiting, leaving out the classes named in p_exclude. It replaces
--    about twenty connector calls with one, and is the site's grading queue.
--
-- DEPLOY ORDERING: none. Every client call is new and degrades on PGRST202;
-- the four re-created grading functions keep their names, signatures and
-- grants, and answer exactly as before for every class with the switch off,
-- which is every class but the one this file turns on (part D).
--
-- WHAT UNDOES IT, a person's paste: re-run 0305's classroom_grade_submission,
-- 0242's classroom_grade_direct and 0265's classroom_revoke_grade and
-- classroom_unreturn_grade, then
--   drop function if exists public.classroom_needs_grading(uuid[], uuid[]);
--   drop function if exists public.classroom_item_grade_protection(uuid);
--   drop function if exists public.classroom_grade_protection_refusals(uuid, integer);
--   drop function if exists public.classroom_set_grade_protection(uuid, boolean);
--   drop function if exists public._classroom_grade_protection_check(uuid, text, text, jsonb);
--   drop function if exists public._classroom_grade_is_protected(uuid, text);
-- The column and the refusal table stay (the migration role refuses a drop);
-- a person drops them by hand if wanted.

do $pre$
begin
	if to_regprocedure('public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb, numeric)') is null
		or to_regprocedure('public.classroom_grade_direct(uuid, text, numeric, text, boolean, numeric)') is null
		or to_regprocedure('public.classroom_revoke_grade(uuid, text)') is null
		or to_regprocedure('public._classroom_html_team_manifest(uuid)') is null then
		raise exception '0315 cannot apply: the grading functions of 0242, 0265 and 0305 are missing. Apply them first.';
	end if;
end
$pre$;

-- ===== PART A: the switch, the record, the rule =====

-- The first object is new, so the apply probe can see this landed.
create table if not exists public.classroom_grade_protection_refusals (
	id uuid primary key default gen_random_uuid(),
	section_id uuid references public.classroom_sections (id) on delete cascade,
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	student_email text not null,
	-- grade, typed score, revoke, unreturn
	action text not null check (char_length(action) between 1 and 40),
	-- What the grade is now (kept) and what was proposed (refused).
	kept_score numeric,
	kept_graded_by text,
	kept_graded_at timestamptz,
	proposed jsonb,
	refused_by text not null,
	refused_at timestamptz not null default now()
);
create index if not exists classroom_grade_protection_refusals_section_idx
	on public.classroom_grade_protection_refusals (section_id, refused_at desc);
create index if not exists classroom_grade_protection_refusals_item_idx
	on public.classroom_grade_protection_refusals (item_id, student_email);
alter table public.classroom_grade_protection_refusals enable row level security;
revoke all on table public.classroom_grade_protection_refusals from public, anon, authenticated, service_role;

-- THE SWITCH, and the one class it starts on. Added and seeded inside one
-- guard on the column's own existence, so a re-paste never re-seeds.
do $switch$
declare
	v_on integer := 0;
	v_names text;
begin
	if not exists (
		select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'classroom_sections' and column_name = 'grades_fill_empty_only'
	) then
		alter table public.classroom_sections
			add column grades_fill_empty_only boolean not null default false;
		-- HIS STANDING RULE (2026-10-14): IDEA209H Block 4 only fills empty
		-- grades. On in the safe direction only: protection refuses an
		-- overwrite and never writes a grade. Matched on the course and the
		-- block as the site shows them; a class it does not match stays off and
		-- is switched on from the class's Grades page.
		update public.classroom_sections s
		set grades_fill_empty_only = true
		from public.classroom_courses c
		where c.id = s.course_id
			and replace(c.code, ' ', '') = 'IDEA209H'
			and (
				btrim(coalesce(s.block, '')) ~* '^(block\s*)?4$'
				or (s.block is null and btrim(s.label) ~* '^block\s*4$')
			);
		get diagnostics v_on = row_count;
	end if;
	select string_agg(c.code || ' ' || s.label || coalesce(' / ' || s.block, ''), ', ')
	into v_names
	from public.classroom_sections s join public.classroom_courses c on c.id = s.course_id
	where s.grades_fill_empty_only;
	raise notice '0315: % classes switched on now; fill empty grades only is on for: %', v_on, coalesce(v_names, 'none');
end
$switch$;

-- Is this student's grade on this post in a protected class? FAILS CLOSED:
-- protected when ANY class of the post the student is enrolled in is, so a
-- student in two classes is never unprotected by the other one.
create or replace function public._classroom_grade_is_protected(p_item_id uuid, p_student_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $f$
	select s.id
	from public.classroom_postings pg
	join public.classroom_enrollments e on e.section_id = pg.section_id
	join public.classroom_sections s on s.id = pg.section_id
	where pg.item_id = p_item_id
		and e.student_email = lower(btrim(coalesce(p_student_email, '')))
		and s.grades_fill_empty_only
	order by s.id
	limit 1;
$f$;
revoke all on function public._classroom_grade_is_protected(uuid, text) from public, anon, authenticated, service_role;

-- THE ONE RULE (see the header). Null means go ahead; otherwise the refusal to
-- return, already recorded. Called only after the caller's own reviewer gate,
-- so a refusal never answers anything to a caller who could not grade anyway.
create or replace function public._classroom_grade_protection_check(
	p_item_id uuid,
	p_student_email text,
	p_action text,
	p_proposed jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_section uuid;
	v_row public.classroom_submissions;
	v_me text := lower(btrim(coalesce(public.current_user_email(), '')));
begin
	v_section := public._classroom_grade_is_protected(p_item_id, v_email);
	if v_section is null then
		return null;
	end if;
	select * into v_row from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;
	-- Empty: nothing to protect, so filling it is the point. A grade EXISTS
	-- once it was saved (graded_at) or returned; a typed score stored a moment
	-- earlier by classroom_grade_direct in this same call is not one yet.
	if v_row.id is null or (v_row.graded_at is null and v_row.returned_at is null) then
		return null;
	end if;
	-- The caller's own grade may be corrected (a held fill, then returned).
	-- An unknown grader and an unknown caller are never a match.
	if v_me <> '' and lower(btrim(coalesce(v_row.graded_by, ''))) = v_me then
		return null;
	end if;
	insert into public.classroom_grade_protection_refusals
		(section_id, item_id, student_email, action, kept_score, kept_graded_by, kept_graded_at, proposed, refused_by)
	values (v_section, p_item_id, v_email, p_action, v_row.score, v_row.graded_by, v_row.graded_at, p_proposed,
		coalesce(nullif(v_me, ''), 'unknown'));
	return jsonb_build_object(
		'ok', false,
		'reason', 'protected',
		'message', 'This class only fills empty grades, and this student already has a grade someone else gave. It was kept and nothing changed.',
		'kept_score', v_row.score,
		'section_id', v_section
	);
end;
$f$;
revoke all on function public._classroom_grade_protection_check(uuid, text, text, jsonb) from public, anon, authenticated, service_role;

-- THE SWITCH, set from a class's Grades page or the connector. A manager of
-- the class only. Turning it off is allowed: it is his decision per class.
create or replace function public.classroom_set_grade_protection(p_section_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
	v_was boolean;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if p_on is null then
		raise exception 'Say whether the class should only fill empty grades.';
	end if;
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'Only a teacher of record for this class can change how it is graded.';
	end if;
	select s.grades_fill_empty_only into v_was from public.classroom_sections s where s.id = p_section_id for update;
	update public.classroom_sections set grades_fill_empty_only = p_on where id = p_section_id;
	return jsonb_build_object('ok', true, 'section_id', p_section_id, 'on', p_on, 'was', v_was);
end;
$f$;
revoke all on function public.classroom_set_grade_protection(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.classroom_set_grade_protection(uuid, boolean) to authenticated;

-- THE GRADES IT KEPT, newest first, for one class or every class the caller
-- manages. A manager of the class only; names come from the class roster.
create or replace function public.classroom_grade_protection_refusals(p_section_id uuid default null, p_limit integer default 200)
returns table (
	id uuid,
	section_id uuid,
	item_id uuid,
	item_title text,
	student_email text,
	student_name text,
	action text,
	kept_score numeric,
	kept_graded_by text,
	kept_graded_at timestamptz,
	proposed jsonb,
	refused_by text,
	refused_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $f$
	select r.id, r.section_id, r.item_id, coalesce(i.title, ''), r.student_email,
		coalesce((select e.display_name from public.classroom_enrollments e
			where e.section_id = r.section_id and e.student_email = r.student_email), r.student_email),
		r.action, r.kept_score, r.kept_graded_by, r.kept_graded_at, r.proposed, r.refused_by, r.refused_at
	from public.classroom_grade_protection_refusals r
	join public.classroom_items i on i.id = r.item_id
	where (select auth.uid()) is not null
		and (p_section_id is null or r.section_id = p_section_id)
		and public.classroom_manages_section(r.section_id)
	order by r.refused_at desc, r.id
	limit least(greatest(coalesce(p_limit, 200), 1), 1000);
$f$;
revoke all on function public.classroom_grade_protection_refusals(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.classroom_grade_protection_refusals(uuid, integer) to authenticated;

-- WHICH OF A POST'S CLASSES ONLY FILL EMPTY GRADES, for the grading console's
-- banner. Only classes the caller manages are named.
create or replace function public.classroom_item_grade_protection(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce(jsonb_agg(jsonb_build_object('section_id', s.id, 'on', s.grades_fill_empty_only) order by s.id), '[]'::jsonb)
	from public.classroom_postings pg
	join public.classroom_sections s on s.id = pg.section_id
	where pg.item_id = p_item_id
		and (select auth.uid()) is not null
		and public.classroom_manages_section(s.id);
$f$;
revoke all on function public.classroom_item_grade_protection(uuid) from public, anon, authenticated, service_role;
grant execute on function public.classroom_item_grade_protection(uuid) to authenticated;

-- ===== PART B: every grade write asks the rule =====

-- classroom_grade_submission: 0305's body whole, with the 0315 lines marked.
create or replace function public.classroom_grade_submission(
	p_item_id uuid,
	p_student_email text,
	p_scores jsonb,
	p_comment text,
	p_return boolean,
	p_criterion_comments jsonb,
	p_extra_credit numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_criteria jsonb;
	v_crit jsonb;
	v_score numeric := 0;
	v_value jsonb;
	v_missing text[] := '{}';
	v_uncommented text[] := '{}';
	v_key text;
	v_known text[] := '{}';
	v_given numeric;
	v_on_level boolean;
	v_note text;
	v_comments jsonb := '{}'::jsonb;
	v_n integer;
	v_k integer;
	v_now timestamptz := now();
	v_state text;
	v_extra numeric;
	v_direct numeric;
	v_sub_id uuid;
	v_bought numeric := 0;
	-- 0315: grade protection.
	v_blocked jsonb;
	-- 0305: a team assignment.
	v_team uuid;
	v_role_of jsonb := '{}'::jsonb;
	v_roles text[] := '{}';
	v_crit_role text;
	v_role_sum numeric := 0;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'A student email is required.';
	end if;
	if not exists (
		select 1 from public.classroom_items i
		where i.id = p_item_id and i.kind = 'assignment'
	) then
		raise exception 'That assignment does not exist.';
	end if;
	if not public.classroom_can_review_submission(p_item_id, v_email) then
		raise exception 'Only a teacher of record for this student''s class can grade this.';
	end if;

	select s.id, s.direct_score into v_sub_id, v_direct
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;

	-- 0315: A PROTECTED CLASS ONLY FILLS EMPTY GRADES. Asked before anything is
	-- written, after the reviewer gate, so a refusal is recorded and nothing else.
	v_blocked := public._classroom_grade_protection_check(p_item_id, v_email, 'grade', p_scores);
	if v_blocked is not null then
		return v_blocked;
	end if;

	-- 0305: A TEAM ASSIGNMENT IS GRADED BY TEAM, and only through
	-- classroom_grade_team, which names the team for this transaction. Team
	-- criteria are therefore one score copied to every member, with no
	-- per-student path past them; a role criterion is scored only for the
	-- student who owns that role on the team plan, and a student holding two
	-- roles gets the mean of the two role blocks, so every member's maximum is
	-- the same (_classroom_item_out_of). A direct score does not apply.
	if public._classroom_html_team_manifest(p_item_id) is not null then
		select c.team_id into v_team from public._classroom_team_ctx(p_item_id, v_email) c;
		if v_team is null then
			raise exception 'This student is not on a team for this assignment.';
		end if;
		if coalesce(current_setting('idea.team_grade', true), '') <> v_team::text then
			raise exception 'Grade this assignment by team, from its Teams screen.';
		end if;
		v_direct := null;
		v_role_of := public._classroom_role_criteria(p_item_id);
		v_roles := public._classroom_owned_roles(p_item_id, v_team, v_email);
		if v_role_of <> '{}'::jsonb and cardinality(v_roles) = 0 then
			raise exception 'This student owns no role on this assignment. Set the roles on the team plan first.';
		end if;
	end if;

	select r.criteria into v_criteria from public.classroom_rubrics r where r.item_id = p_item_id;
	if v_criteria is null and v_direct is null then
		raise exception 'Create a rubric for this assignment before grading.';
	end if;
	if p_scores is null or jsonb_typeof(p_scores) <> 'object' then
		raise exception 'Scores must be an object keyed by rubric criterion id.';
	end if;
	if p_criterion_comments is not null and jsonb_typeof(p_criterion_comments) not in ('object', 'null') then
		raise exception 'Criterion comments must be an object keyed by rubric criterion id.';
	end if;

	if p_extra_credit is not null then
		if p_extra_credit < 0 then
			raise exception 'Extra credit cannot be negative. To lower a score, score the rubric criteria lower.';
		end if;
		if p_extra_credit > 10000 then
			raise exception 'Extra credit must be 10000 or less.';
		end if;
	end if;

	if v_criteria is not null then
		for v_n in 0 .. jsonb_array_length(v_criteria) - 1 loop
			v_crit := v_criteria->v_n;
			v_key := v_crit->>'id';
			v_known := v_known || v_key;
			-- 0305: another member's role criterion is not this student's.
			v_crit_role := v_role_of->>v_key;
			if v_crit_role is not null and v_crit_role <> all (v_roles) then
				if jsonb_typeof(p_scores->v_key) is distinct from 'null' and p_scores ? v_key then
					raise exception 'The score for "%" belongs to a role this student does not own.', v_crit->>'criterion';
				end if;
				continue;
			end if;
			v_value := p_scores->v_key;
			v_note := nullif(btrim(coalesce(p_criterion_comments->>v_key, '')), '');
			if char_length(coalesce(v_note, '')) > 1000 then
				raise exception 'The comment on "%" is too long (1000 characters max).', v_crit->>'criterion';
			end if;

			if v_value is null or jsonb_typeof(v_value) = 'null' then
				v_missing := v_missing || v_key;
				if v_note is not null then
					v_comments := v_comments || jsonb_build_object(v_key, v_note);
				end if;
				continue;
			end if;

			if jsonb_typeof(v_value) <> 'number' then
				raise exception 'The score for "%" must be a number.', v_crit->>'criterion';
			end if;
			v_given := (p_scores->>v_key)::numeric;
			if v_given < 0 or v_given > (v_crit->>'points')::numeric then
				raise exception 'The score for "%" must be between 0 and %.',
					v_crit->>'criterion', v_crit->>'points';
			end if;
			if v_crit_role is null then
				v_score := v_score + v_given;
			else
				v_role_sum := v_role_sum + v_given;
			end if;

			v_on_level := false;
			if jsonb_typeof(v_crit->'levels') = 'array' then
				for v_k in 0 .. jsonb_array_length(v_crit->'levels') - 1 loop
					if jsonb_typeof(v_crit->'levels'->v_k->'points') = 'number'
						and (v_crit->'levels'->v_k->>'points')::numeric = v_given then
						v_on_level := true;
						exit;
					end if;
				end loop;
			end if;
			if not v_on_level and v_note is null then
				v_uncommented := v_uncommented || v_key;
			end if;
			if v_note is not null then
				v_comments := v_comments || jsonb_build_object(v_key, v_note);
			end if;
		end loop;
	end if;

	for v_key in select jsonb_object_keys(p_scores) loop
		if v_key <> all (v_known) then
			raise exception 'Score key "%" is not a rubric criterion.', v_key;
		end if;
	end loop;
	if p_criterion_comments is not null and jsonb_typeof(p_criterion_comments) = 'object' then
		for v_key in select jsonb_object_keys(p_criterion_comments) loop
			if v_key <> all (v_known) then
				raise exception 'Comment key "%" is not a rubric criterion.', v_key;
			end if;
		end loop;
	end if;

	if array_length(v_uncommented, 1) is not null then
		return jsonb_build_object('ok', false, 'reason', 'override_needs_comment', 'missing', to_jsonb(v_uncommented));
	end if;
	-- A DIRECT SCORE IS A COMPLETE SCORE: the rubric need not be filled in.
	if p_return and v_direct is null and array_length(v_missing, 1) is not null then
		return jsonb_build_object('ok', false, 'reason', 'incomplete_scores', 'missing', to_jsonb(v_missing));
	end if;

	-- 0305: the role blocks this student owns, as their mean.
	if cardinality(v_roles) > 0 then
		v_score := v_score + v_role_sum / cardinality(v_roles);
	end if;

	if p_extra_credit is null then
		select s.extra_credit into v_extra
		from public.classroom_submissions s
		where s.item_id = p_item_id and s.student_email = v_email;
	else
		v_extra := p_extra_credit;
	end if;

	-- BOUGHT POINTS STAY. A grader's extra credit can raise them, never remove them.
	if v_sub_id is not null then
		v_bought := public._coin_purchased_extra_credit(v_sub_id);
		if v_bought > 0 and coalesce(v_extra, 0) < v_bought then
			v_extra := v_bought;
		end if;
	end if;

	if v_direct is not null then
		v_score := v_direct;
	end if;
	v_score := v_score + coalesce(v_extra, 0);

	insert into public.classroom_submissions
		(item_id, student_email, rubric_scores, criterion_comments, score, extra_credit,
		 teacher_comment, graded_by, graded_at, updated_at)
	values (p_item_id, v_email, p_scores, v_comments, v_score, v_extra,
		nullif(btrim(coalesce(p_comment, '')), ''), public.current_user_email(), v_now, v_now)
	on conflict (item_id, student_email) do update
		set rubric_scores = excluded.rubric_scores,
			criterion_comments = excluded.criterion_comments,
			score = excluded.score,
			extra_credit = excluded.extra_credit,
			teacher_comment = excluded.teacher_comment,
			graded_by = excluded.graded_by,
			graded_at = v_now,
			updated_at = v_now
	returning id into v_sub_id;

	if p_return then
		update public.classroom_submissions
		set state = 'returned', returned_at = v_now, updated_at = v_now
		where item_id = p_item_id and student_email = v_email;
	end if;

	select s.state into v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;

	-- PERFECT SCORE, BEST EFFORT. Instrumentation-grade: a coin failure can
	-- never undo a grade, and the nightly run settles anything missed here.
	begin
		perform public._coin_perfect_score_sync(v_sub_id);
	exception when others then
		raise warning 'perfect score sync failed for %: %', v_sub_id, sqlerrm;
	end;

	return jsonb_build_object(
		'ok', true, 'score', v_score, 'state', v_state, 'extra_credit', v_extra, 'direct_score', v_direct
	);
end;
$$;


revoke all on function public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb, numeric)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb, numeric) to authenticated;

-- classroom_grade_direct: 0242's body whole, with the 0315 lines marked.
create or replace function public.classroom_grade_direct(
	p_item_id uuid,
	p_student_email text,
	p_score numeric,
	p_comment text,
	p_return boolean,
	p_extra_credit numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_out numeric;
	v_scores jsonb;
	v_comments jsonb;
	v_blocked jsonb;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_items i where i.id = p_item_id and i.kind = 'assignment') then
		raise exception 'That assignment does not exist.';
	end if;
	if not public.classroom_can_review_submission(p_item_id, v_email) then
		raise exception 'Only a teacher of record for this student''s class can grade this.';
	end if;
	-- 0315: refused before the typed score is stored, never after.
	v_blocked := public._classroom_grade_protection_check(p_item_id, v_email, 'typed score',
		jsonb_build_object('score', p_score));
	if v_blocked is not null then
		return v_blocked;
	end if;
	v_out := public._classroom_item_out_of(p_item_id);
	if p_score is not null then
		if v_out is null or v_out <= 0 then
			return jsonb_build_object('ok', false, 'reason', 'no_total');
		end if;
		if p_score < 0 or p_score > v_out then
			return jsonb_build_object('ok', false, 'reason', 'out_of_range', 'out_of', v_out);
		end if;
	end if;

	insert into public.classroom_submissions (item_id, student_email, direct_score, updated_at)
	values (p_item_id, v_email, p_score, now())
	on conflict (item_id, student_email) do update set direct_score = excluded.direct_score;

	select coalesce(s.rubric_scores, '{}'::jsonb), s.criterion_comments into v_scores, v_comments
	from public.classroom_submissions s where s.item_id = p_item_id and s.student_email = v_email;
	if not exists (select 1 from public.classroom_rubrics r where r.item_id = p_item_id) then
		v_scores := '{}'::jsonb;
		v_comments := null;
	end if;

	return public.classroom_grade_submission(p_item_id, v_email, v_scores, p_comment,
		coalesce(p_return, false), v_comments, p_extra_credit) || jsonb_build_object('out_of', v_out);
end;
$$;
revoke all on function public.classroom_grade_direct(uuid, text, numeric, text, boolean, numeric) from public, anon, authenticated, service_role;
grant execute on function public.classroom_grade_direct(uuid, text, numeric, text, boolean, numeric) to authenticated;

-- classroom_unreturn_grade and classroom_revoke_grade: 0265's bodies whole, with the 0315 lines marked.
create or replace function public.classroom_unreturn_grade(p_item_id uuid, p_student_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_grade_undo_guard(p_item_id, p_student_email);
	v_row public.classroom_submissions;
	v_state text;
	v_coins text;
	v_blocked jsonb;
begin
	select * into v_row from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email
	for update;
	if v_row.id is null or v_row.state <> 'returned' then
		return jsonb_build_object('ok', false, 'reason', 'not_returned');
	end if;
	-- 0315: a grade somebody else returned in a protected class stays returned.
	v_blocked := public._classroom_grade_protection_check(p_item_id, v_email, 'unreturn', null);
	if v_blocked is not null then
		return v_blocked;
	end if;
	v_state := public._classroom_grade_ungraded_state(v_row);
	update public.classroom_submissions
	set state = v_state, returned_at = null, updated_at = now()
	where id = v_row.id;
	v_coins := public._classroom_grade_coin_sync(v_row.id);
	return jsonb_build_object('ok', true, 'state', v_state, 'score', v_row.score, 'coins', v_coins);
end;
$$;
revoke all on function public.classroom_unreturn_grade(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.classroom_unreturn_grade(uuid, text) to authenticated;

create or replace function public.classroom_revoke_grade(p_item_id uuid, p_student_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_grade_undo_guard(p_item_id, p_student_email);
	v_row public.classroom_submissions;
	v_state text;
	v_bought numeric;
	v_id uuid;
	v_coins text;
	v_blocked jsonb;
begin
	select * into v_row from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email
	for update;
	if v_row.id is null
		or (v_row.graded_at is null and v_row.score is null and v_row.direct_score is null
			and v_row.rubric_scores is null and v_row.state <> 'returned') then
		return jsonb_build_object('ok', false, 'reason', 'nothing_to_revoke');
	end if;
	-- 0315: a grade somebody else gave in a protected class stays.
	v_blocked := public._classroom_grade_protection_check(p_item_id, v_email, 'revoke', null);
	if v_blocked is not null then
		return v_blocked;
	end if;

	insert into public.classroom_grade_revocations (submission_id, item_id, student_email, snapshot, revoked_by)
	values (v_row.id, p_item_id, v_email, jsonb_build_object(
		'state', v_row.state,
		'rubric_scores', v_row.rubric_scores,
		'criterion_comments', v_row.criterion_comments,
		'score', v_row.score,
		'direct_score', v_row.direct_score,
		'extra_credit', v_row.extra_credit,
		'teacher_comment', v_row.teacher_comment,
		'graded_by', v_row.graded_by,
		'graded_at', v_row.graded_at,
		'returned_at', v_row.returned_at
	), public.current_user_email())
	returning id into v_id;

	v_bought := coalesce(public._coin_purchased_extra_credit(v_row.id), 0);
	v_state := public._classroom_grade_ungraded_state(v_row);
	update public.classroom_submissions
	set state = v_state,
		rubric_scores = null,
		criterion_comments = null,
		score = null,
		direct_score = null,
		extra_credit = case when v_bought > 0 then v_bought else null end,
		teacher_comment = null,
		graded_by = null,
		graded_at = null,
		returned_at = null,
		updated_at = now()
	where id = v_row.id;

	v_coins := public._classroom_grade_coin_sync(v_row.id);
	return jsonb_build_object('ok', true, 'revocation_id', v_id, 'state', v_state,
		'previous_score', v_row.score, 'coins', v_coins);
end;
$$;
revoke all on function public.classroom_revoke_grade(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.classroom_revoke_grade(uuid, text) to authenticated;

-- ===== PART C: one "needs grading" read =====

-- EVERY PAST-DUE ASSIGNMENT WITH SAVED STUDENT WORK AND NO GRADE YET, by
-- class. Default: every active class the caller is TEACHER OF RECORD for (an
-- admin manages every class, so "manages" would be the whole school); with
-- p_sections, those classes, each one the caller must manage. p_exclude
-- leaves classes out. Saved work is an answer, a file or a turn-in; a
-- student counts only on the class's own active roster (no staff, no test
-- account), the same people the grading console lists. Published and visible
-- posts only. One read, so the connector answers in one call.
create or replace function public.classroom_needs_grading(
	p_sections uuid[] default null,
	p_exclude uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_me text := lower(btrim(coalesce(public.current_user_email(), '')));
	v_out jsonb;
begin
	if (select auth.uid()) is null or v_me = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_sections is not null and exists (
		select 1 from unnest(p_sections) x(id) where not public.classroom_manages_section(x.id)
	) then
		raise exception 'Only a teacher of record for a class can see what it needs graded.';
	end if;

	with classes as (
		select s.id, s.label, s.block, c.code, c.title as course_title
		from public.classroom_sections s
		join public.classroom_courses c on c.id = s.course_id
		where (case when p_sections is null
				then s.teacher_email = v_me and s.active
				else s.id = any (p_sections) end)
			and not (s.id = any (coalesce(p_exclude, '{}'::uuid[])))
	),
	posts as (
		select cl.id as section_id, i.id as item_id, i.title, i.points, i.due_at, i.assignment_schema_version
		from classes cl
		join public.classroom_postings pg on pg.section_id = cl.id
		join public.classroom_items i on i.id = pg.item_id
		where i.kind = 'assignment'
			and i.published
			and (i.publish_at is null or i.publish_at <= now())
			and i.due_at is not null
			and i.due_at < now()
	),
	waiting as (
		select p.section_id, p.item_id, e.student_email, e.display_name,
			sub.state, sub.submitted_at,
			(select count(*) from public.classroom_responses r
				where r.item_id = p.item_id and r.student_email = e.student_email) as answers,
			(select max(r.updated_at) from public.classroom_responses r
				where r.item_id = p.item_id and r.student_email = e.student_email) as last_answer,
			(select count(*) from public.classroom_submission_files f where f.submission_id = sub.id) as files
		from posts p
		join public.classroom_enrollments e on e.section_id = p.section_id and e.active
		left join public.classroom_submissions sub on sub.item_id = p.item_id and sub.student_email = e.student_email
		where not public._classroom_manages_section_email(p.section_id, e.student_email)
			and e.student_email not in (select public._idea_test_emails())
			and (sub.id is null or (sub.graded_at is null and sub.returned_at is null))
	),
	ready as (
		select w.*, p.title, p.points, p.due_at, p.assignment_schema_version
		from waiting w join posts p on p.section_id = w.section_id and p.item_id = w.item_id
		where w.answers > 0 or w.files > 0 or w.submitted_at is not null
	),
	per_item as (
		select r.section_id, r.item_id, r.title, r.points, r.due_at,
			r.assignment_schema_version = 3 as html,
			public._classroom_html_team_manifest(r.item_id) is not null as team,
			jsonb_agg(jsonb_build_object(
				'email', r.student_email,
				'name', r.display_name,
				'turned_in', r.submitted_at is not null,
				'answers', r.answers,
				'files', r.files,
				'last_saved', r.last_answer,
				'saved_after_due', r.last_answer is not null and r.last_answer > r.due_at
			) order by r.display_name, r.student_email) as students,
			count(*) as n
		from ready r
		group by r.section_id, r.item_id, r.title, r.points, r.due_at, r.assignment_schema_version
	)
	select jsonb_build_object(
		'ok', true,
		'classes', coalesce(jsonb_agg(jsonb_build_object(
			'section_id', cl.id,
			'course', cl.code,
			'course_title', cl.course_title,
			'label', cl.label,
			'block', cl.block,
			'waiting', coalesce((select sum(pi.n) from per_item pi where pi.section_id = cl.id), 0),
			'items', coalesce((select jsonb_agg(jsonb_build_object(
					'item_id', pi.item_id, 'title', pi.title, 'points', pi.points, 'due_at', pi.due_at,
					'html', pi.html, 'team', pi.team, 'waiting', pi.n, 'students', pi.students
				) order by pi.due_at, pi.title) from per_item pi where pi.section_id = cl.id), '[]'::jsonb)
		) order by cl.code, cl.label), '[]'::jsonb),
		'excluded', coalesce((
			select jsonb_agg(jsonb_build_object('section_id', s.id, 'course', c.code, 'label', s.label, 'block', s.block) order by c.code, s.label)
			from public.classroom_sections s join public.classroom_courses c on c.id = s.course_id
			where s.id = any (coalesce(p_exclude, '{}'::uuid[])) and public.classroom_manages_section(s.id)
		), '[]'::jsonb)
	)
	into v_out
	from classes cl;
	return v_out;
end;
$f$;
revoke all on function public.classroom_needs_grading(uuid[], uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.classroom_needs_grading(uuid[], uuid[]) to authenticated;

-- ===== PART D: self-check =====
do $check$
declare
	v_n integer;
	v_fn text;
begin
	select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_grade_submission';
	if v_n <> 2 then
		raise exception '0315: expected exactly 2 arities of classroom_grade_submission, found %.', v_n;
	end if;
	foreach v_fn in array array[
		'public.classroom_set_grade_protection(uuid, boolean)',
		'public.classroom_grade_protection_refusals(uuid, integer)',
		'public.classroom_item_grade_protection(uuid)',
		'public.classroom_needs_grading(uuid[], uuid[])',
		'public._classroom_grade_protection_check(uuid, text, text, jsonb)',
		'public._classroom_grade_is_protected(uuid, text)'
	] loop
		if has_function_privilege('anon', v_fn, 'execute') then
			raise exception '0315: % is executable by anon.', v_fn;
		end if;
	end loop;
	if has_function_privilege('authenticated', 'public._classroom_grade_protection_check(uuid, text, text, jsonb)', 'execute') then
		raise exception '0315: the protection rule is callable by a client.';
	end if;
	foreach v_fn in array array['classroom_grade_submission', 'classroom_grade_direct', 'classroom_revoke_grade', 'classroom_unreturn_grade'] loop
		if not exists (
			select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname = v_fn and p.prosrc like '%_classroom_grade_protection_check%'
		) then
			raise exception '0315: % does not ask the protection rule.', v_fn;
		end if;
	end loop;
	raise notice '0315: grade protection is asked by every grade write; % refusals recorded so far.',
		(select count(*) from public.classroom_grade_protection_refusals);
end
$check$;
