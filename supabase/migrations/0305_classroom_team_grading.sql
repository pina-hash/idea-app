-- 0305_classroom_team_grading.sql
--
-- GRADING BY TEAM (ledger 0436, IDEA209H Unit 4; decision 71, every rule Mr.
-- Pina's; rubric standard 1.4).
--
-- A team assignment's rubric is still generated from its manifest, one
-- criterion per manifest criterion. What this file adds is WHO each criterion
-- is scored for, read from the manifest per module:
--   * a TEAM module's criteria (audience "team") are scored
--     ONCE for the team and copied to every member, through the existing bulk
--     path (classroom_grade_submissions, 0175), which calls the one grading
--     rule (classroom_grade_submission) per member. There is no per-student
--     override on a team criterion: a team assignment refuses any grade that
--     does not arrive through classroom_grade_team, which names the team for
--     its own transaction.
--   * a ROLE module's criteria (audience "role") are scored per role block and
--     land only on the student who owns that role on the team plan (0302).
--     A student owning two roles (a team of three) gets the MEAN of the two
--     role blocks, so every student's maximum is the same: the team criteria
--     plus one role block plus the individual criteria
--     (_classroom_item_out_of, re-created here).
--   * an INDIVIDUAL module's criteria (audience "individual" or absent) stay
--     each student's own, scored per member on the same screen.
--
-- Nothing else about grading moves: the completeness rule, the override
-- comment, extra credit, bought points, the returned state and the perfect
-- score sync are the 0242 body, copied whole with the team branch added.
--
-- DEPLOY ORDERING: none. classroom_grade_submission and _classroom_item_out_of
-- keep their signatures; a deployed console grading a team assignment one
-- student at a time is refused with a sentence that names the Teams screen,
-- and no team assignment is posted yet. classroom_grade_team and
-- classroom_team_grading are new.
--
-- WHAT UNDOES IT, a person's paste: re-run 0242's classroom_grade_submission
-- and 0241's _classroom_item_out_of, then
--   drop function if exists public.classroom_grade_team(uuid, uuid, jsonb, jsonb, text, jsonb, boolean);
--   drop function if exists public._classroom_team_criteria(uuid);
--   drop function if exists public._classroom_team_grading_section(uuid, uuid);
--   drop function if exists public.classroom_team_grading(uuid, uuid);
--   drop function if exists public._classroom_owned_roles(uuid, uuid, text);
--   drop function if exists public._classroom_role_criteria(uuid);
-- Grades already written stay as written.

do $pre$
begin
	if to_regprocedure('public._classroom_team_ctx(uuid, text)') is null then
		raise exception '0305 cannot apply: _classroom_team_ctx does not exist. Apply 0302 first.';
	end if;
	if to_regprocedure('public.classroom_grade_submissions(uuid, jsonb, boolean)') is null then
		raise exception '0305 cannot apply: classroom_grade_submissions does not exist. Apply 0175 first.';
	end if;
end
$pre$;

-- Every role criterion of a team assignment, as its stored rubric id mapped to
-- the role: {"<moduleId>-<criterionId>": "<roleId>"}. Empty for anything else.
create or replace function public._classroom_role_criteria(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce((
		select jsonb_object_agg((m->>'id') || '-' || btrim(c->>'id'), m->>'role')
		from jsonb_array_elements(case when jsonb_typeof(t.manifest->'modules') = 'array'
				then t.manifest->'modules' else '[]'::jsonb end) m
		cross join lateral jsonb_array_elements(case when jsonb_typeof(m->'criteria') = 'array'
				then m->'criteria' else '[]'::jsonb end) c
		where m->>'audience' = 'role' and coalesce(m->>'role', '') <> '' and coalesce(btrim(c->>'id'), '') <> ''
	), '{}'::jsonb)
	from (select public._classroom_html_team_manifest(p_item_id) as manifest) t;
$f$;

-- Every TEAM criterion of a team assignment (a module with audience "team"),
-- as stored rubric ids. Anything neither team nor role is each student's own.
create or replace function public._classroom_team_criteria(p_item_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce((
		select array_agg((m->>'id') || '-' || btrim(c->>'id'))
		from jsonb_array_elements(case when jsonb_typeof(t.manifest->'modules') = 'array'
				then t.manifest->'modules' else '[]'::jsonb end) m
		cross join lateral jsonb_array_elements(case when jsonb_typeof(m->'criteria') = 'array'
				then m->'criteria' else '[]'::jsonb end) c
		where m->>'audience' = 'team' and coalesce(btrim(c->>'id'), '') <> ''
	), '{}')
	from (select public._classroom_html_team_manifest(p_item_id) as manifest) t;
$f$;

-- The roles of this assignment that carry criteria and that this student owns
-- on this team's plan, sorted.
create or replace function public._classroom_owned_roles(p_item_id uuid, p_team_id uuid, p_email text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce(array_agg(distinct r.value order by r.value), '{}')
	from jsonb_each_text(public._classroom_role_criteria(p_item_id)) r
	where public._classroom_team_role_owner(p_team_id, r.value) = p_email;
$f$;

-- THE TOTAL, re-created: for a team assignment with role criteria it is the
-- team criteria plus the largest role block, which is every member's maximum
-- (the standard asks role blocks of equal points). Otherwise 0241's rule.
create or replace function public._classroom_item_out_of(p_item_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $f$
	with roles as (select public._classroom_role_criteria(p_item_id) as m),
	crit as (
		select coalesce((c ->> 'points')::numeric, 0) as points, roles.m ->> (c ->> 'id') as role
		from public.classroom_rubrics r
		cross join lateral jsonb_array_elements(case when jsonb_typeof(r.criteria) = 'array'
				then r.criteria else '[]'::jsonb end) c
		cross join roles
		where r.item_id = p_item_id
	)
	select coalesce(
		(select coalesce(sum(points) filter (where role is null), 0)
				+ coalesce((select max(s) from (select sum(points) as s from crit where role is not null group by role) b), 0)
			from crit
			having count(*) > 0),
		(select i.points::numeric from public.classroom_items i where i.id = p_item_id)
	);
$f$;

-- THE ONE GRADING RULE, 0242's body whole, with the team branch marked 0305.
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


-- The one gate both team grading calls share: the team is in its section's
-- posted draw, the caller manages that section, and the post is in it.
create or replace function public._classroom_team_grading_section(p_item_id uuid, p_team_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $f$
	select s.section_id
	from (select public._classroom_team_section(p_team_id) as section_id) s
	where s.section_id is not null
		and public.classroom_manages_section(s.section_id)
		and exists (select 1 from public.classroom_postings pg
			where pg.item_id = p_item_id and pg.section_id = s.section_id)
		and (select t.team_set_id from public.classroom_teams t where t.id = p_team_id)
			is not distinct from public._classroom_section_team_set(s.section_id);
$f$;

-- GRADE ONE TEAM. `p_scores` and `p_criterion_comments` are keyed by rubric
-- criterion id, team and role criteria together; `p_member_scores` is
-- {"<member email>": {"<criterion id>": n}} for the individual criteria only.
-- Each member receives the team criteria, the criteria of the roles they own
-- and their own individual scores, and the bulk path writes them. One comment,
-- copied to every member. A scored role nobody owns, a team or role score
-- given per student, and an individual score given for the team are each
-- refused before anything is written.
create or replace function public.classroom_grade_team(
	p_item_id uuid,
	p_team_id uuid,
	p_scores jsonb,
	p_member_scores jsonb,
	p_comment text,
	p_criterion_comments jsonb,
	p_return boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
	v_role_of jsonb;
	v_team_crit text[];
	v_key text;
	v_role text;
	v_unowned text[] := '{}';
	v_mine jsonb;
	v_grades jsonb := '[]'::jsonb;
	v_member record;
	v_roles text[];
	v_scores jsonb;
	v_notes jsonb;
	v_out jsonb;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if public._classroom_team_grading_section(p_item_id, p_team_id) is null then
		raise exception 'That team does not exist.';
	end if;
	if public._classroom_html_team_manifest(p_item_id) is null then
		return jsonb_build_object('ok', false, 'reason', 'not_team_assignment');
	end if;
	if p_scores is null or jsonb_typeof(p_scores) <> 'object' then
		raise exception 'Scores must be an object keyed by rubric criterion id.';
	end if;
	if p_criterion_comments is not null and jsonb_typeof(p_criterion_comments) not in ('object', 'null') then
		raise exception 'Criterion comments must be an object keyed by rubric criterion id.';
	end if;

	if p_member_scores is not null and jsonb_typeof(p_member_scores) not in ('object', 'null') then
		raise exception 'Student scores must be an object keyed by student.';
	end if;

	v_role_of := public._classroom_role_criteria(p_item_id);
	v_team_crit := public._classroom_team_criteria(p_item_id);
	for v_key in select jsonb_object_keys(p_scores) loop
		if v_key <> all (v_team_crit) and not (v_role_of ? v_key) then
			raise exception 'Score "%" for each student, not for the team.', v_key;
		end if;
	end loop;
	for v_key in select jsonb_object_keys(case when jsonb_typeof(p_member_scores) = 'object' then p_member_scores else '{}'::jsonb end) loop
		if not exists (select 1 from public.classroom_team_members m where m.team_id = p_team_id and m.student_email = v_key) then
			raise exception 'That student is not on this team.';
		end if;
		if jsonb_typeof(p_member_scores -> v_key) <> 'object' then
			raise exception 'Student scores must be an object keyed by rubric criterion id.';
		end if;
		if exists (select 1 from jsonb_object_keys(p_member_scores -> v_key) k
			where k = any (v_team_crit) or v_role_of ? k) then
			raise exception 'A team or role score is given once for the team, not per student.';
		end if;
	end loop;
	for v_key in select jsonb_object_keys(p_scores) loop
		v_role := v_role_of ->> v_key;
		if v_role is not null and jsonb_typeof(p_scores -> v_key) <> 'null'
			and public._classroom_team_role_owner(p_team_id, v_role) is null
			and v_role <> all (v_unowned) then
			v_unowned := v_unowned || v_role;
		end if;
	end loop;
	if cardinality(v_unowned) > 0 then
		return jsonb_build_object('ok', false, 'reason', 'role_unowned', 'roles', to_jsonb(v_unowned));
	end if;

	for v_member in
		select m.student_email from public.classroom_team_members m
		where m.team_id = p_team_id order by m.student_email
	loop
		v_roles := public._classroom_owned_roles(p_item_id, p_team_id, v_member.student_email);
		v_mine := case when jsonb_typeof(p_member_scores -> v_member.student_email) = 'object'
			then p_member_scores -> v_member.student_email else '{}'::jsonb end;
		select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb) || v_mine into v_scores
		from jsonb_each(p_scores) s
		where (v_role_of ->> s.key) is null or (v_role_of ->> s.key) = any (v_roles);
		select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb) into v_notes
		from jsonb_each(case when jsonb_typeof(p_criterion_comments) = 'object' then p_criterion_comments else '{}'::jsonb end) s
		where (v_role_of ->> s.key) is null or (v_role_of ->> s.key) = any (v_roles);
		v_grades := v_grades || jsonb_build_array(jsonb_build_object(
			'student_email', v_member.student_email,
			'scores', v_scores,
			'comment', p_comment,
			'criterion_comments', v_notes
		));
	end loop;
	if jsonb_array_length(v_grades) = 0 then
		return jsonb_build_object('ok', false, 'reason', 'no_members');
	end if;

	-- Names this team for this transaction only; classroom_grade_submission
	-- refuses a team assignment's grade without it.
	perform set_config('idea.team_grade', p_team_id::text, true);
	v_out := public.classroom_grade_submissions(p_item_id, v_grades, coalesce(p_return, false));
	perform set_config('idea.team_grade', '', true);
	return v_out || jsonb_build_object('team_id', p_team_id);
end;
$f$;

-- ONE TEAM'S GRADING SCREEN: the rubric, which criterion belongs to which
-- role, the roles with their owners, and every member's grade as it stands.
create or replace function public.classroom_team_grading(p_item_id uuid, p_team_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_section uuid;
	v_manifest jsonb;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	v_section := public._classroom_team_grading_section(p_item_id, p_team_id);
	if v_section is null then
		raise exception 'That team does not exist.';
	end if;
	v_manifest := public._classroom_html_team_manifest(p_item_id);
	if v_manifest is null then
		return jsonb_build_object('ok', true, 'team', null, 'reason', 'not_team_assignment');
	end if;
	return jsonb_build_object(
		'ok', true,
		'team', (select jsonb_build_object(
				'id', t.id,
				'name', coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number),
				'section_id', v_section,
				'section_label', (select s.label from public.classroom_sections s where s.id = v_section))
			from public.classroom_teams t where t.id = p_team_id),
		'rubric', coalesce((select r.criteria from public.classroom_rubrics r where r.item_id = p_item_id), '[]'::jsonb),
		'role_of', public._classroom_role_criteria(p_item_id),
		'team_criteria', to_jsonb(public._classroom_team_criteria(p_item_id)),
		'out_of', public._classroom_item_out_of(p_item_id),
		'roles', coalesce((
			select jsonb_agg(jsonb_build_object(
				'id', r.role->>'id',
				'title', r.role->>'title',
				'owner', public._classroom_team_role_owner(p_team_id, r.role->>'id'),
				'owner_name', public._classroom_first_name(v_section, public._classroom_team_role_owner(p_team_id, r.role->>'id'))
			) order by r.ord)
			from jsonb_array_elements(case when jsonb_typeof(v_manifest->'team'->'roles') = 'array'
					then v_manifest->'team'->'roles' else '[]'::jsonb end) with ordinality as r(role, ord)
		), '[]'::jsonb),
		'members', coalesce((
			select jsonb_agg(jsonb_build_object(
				'email', m.student_email,
				'name', coalesce((select nullif(btrim(e.display_name), '') from public.classroom_enrollments e
					where e.section_id = v_section and e.student_email = m.student_email), split_part(m.student_email, '@', 1)),
				'roles', to_jsonb(public._classroom_owned_roles(p_item_id, p_team_id, m.student_email)),
				'state', s.state,
				'score', s.score,
				'scores', coalesce(s.rubric_scores, '{}'::jsonb),
				'criterion_comments', coalesce(s.criterion_comments, '{}'::jsonb),
				'comment', s.teacher_comment,
				'graded_at', s.graded_at
			) order by m.student_email)
			from public.classroom_team_members m
			left join public.classroom_submissions s on s.item_id = p_item_id and s.student_email = m.student_email
			where m.team_id = p_team_id
		), '[]'::jsonb)
	);
end;
$f$;

revoke all on function public._classroom_role_criteria(uuid) from public, anon, authenticated;
revoke all on function public._classroom_owned_roles(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public._classroom_team_criteria(uuid) from public, anon, authenticated;
revoke all on function public._classroom_item_out_of(uuid) from public, anon, authenticated, service_role;
revoke all on function public._classroom_team_grading_section(uuid, uuid) from public, anon, authenticated;
revoke all on function public.classroom_grade_team(uuid, uuid, jsonb, jsonb, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.classroom_grade_team(uuid, uuid, jsonb, jsonb, text, jsonb, boolean) to authenticated;
revoke all on function public.classroom_team_grading(uuid, uuid) from public, anon, authenticated;
grant execute on function public.classroom_team_grading(uuid, uuid) to authenticated;

do $check$
declare
	v_n integer;
begin
	select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_grade_submission';
	if v_n <> 2 then
		raise exception '0305: expected exactly 2 arities of classroom_grade_submission, found %.', v_n;
	end if;
	if has_function_privilege('anon', 'public.classroom_grade_team(uuid, uuid, jsonb, jsonb, text, jsonb, boolean)', 'execute')
		or has_function_privilege('anon', 'public.classroom_team_grading(uuid, uuid)', 'execute') then
		raise exception '0305: a team grading function is executable by anon.';
	end if;
	raise notice '0305: % team assignments with role criteria.',
		(select count(*) from public.classroom_html_assignments h
		 where public._classroom_role_criteria(h.item_id) <> '{}'::jsonb);
end
$check$;
