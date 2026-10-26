-- 0306_classroom_team_board.sql
--
-- THE TEAM BOARD (ledger 0436, IDEA209H Unit 4; decision 71, every rule Mr.
-- Pina's).
--
-- One read for the whole board: every team of every class the caller manages
-- that has a posted team draw, each as its own team plan (classroom_team_plan,
-- 0303 and 0304, so the board and a team's own page can never disagree about
-- a task, a status or a sign-off), plus WHEN each task's linked work was last
-- saved, which is what the burn-up needs and the plan does not carry: a team
-- answer's or a student's own answer's last save, and for a send-back task the
-- approval that cleared it. Whether a task is DONE stays the page's one
-- completion rule; this only says when.
--
-- An admin manages every class, so an admin's board is every team; a teacher's
-- is their own classes. A student has no board.
--
-- And the push for a new sign-off request: `_classroom_signoff_notify` names
-- who a request is for (Mr. Pina alone for an owner-only item, otherwise the
-- class's teacher of record), granted to service_role only, for the server
-- route that sends the notification after the request lands.
--
-- DEPLOY ORDERING: none. Two new functions; nothing deployed calls them.
--
-- WHAT UNDOES IT, a person's paste:
--   drop function if exists public.classroom_team_board();
--   drop function if exists public._classroom_team_task_saved_at(uuid, public.classroom_team_tasks);
--   drop function if exists public._classroom_signoff_notify(uuid);

do $pre$
begin
	if to_regclass('public.classroom_signoff_requests') is null then
		raise exception '0306 cannot apply: classroom_signoff_requests does not exist. Apply 0304 first.';
	end if;
end
$pre$;

-- When a task's linked work was last saved: the team's row for a shared block,
-- the member's own for an individual one, the clearing approval for a send-back.
create or replace function public._classroom_team_task_saved_at(p_team_id uuid, t public.classroom_team_tasks)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $f$
	select case
		when t.kind = 'sendback' then (
			select min(r.decided_at) from public.classroom_signoff_requests r
			where r.team_id = p_team_id and r.checkpoint_key = t.checkpoint_key
				and r.status = 'approved' and r.decided_at > t.created_at)
		when t.item_id is null then null
		when t.member_email <> '' then (
			select r.updated_at from public.classroom_responses r
			where r.item_id = t.item_id and r.block_id = t.block_id and r.student_email = t.member_email)
		else (
			select a.updated_at from public.classroom_team_answers a
			where a.team_id = p_team_id and a.item_id = t.item_id and a.block_id = t.block_id)
	end;
$f$;

create or replace function public.classroom_team_board()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_section record;
	v_team record;
	v_plan jsonb;
	v_teams jsonb := '[]'::jsonb;
	v_sections jsonb := '[]'::jsonb;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	for v_section in
		select s.id, s.label from public.classroom_sections s
		where public.classroom_manages_section(s.id)
			and public._classroom_section_team_set(s.id) is not null
		order by s.label
	loop
		v_sections := v_sections || jsonb_build_array(jsonb_build_object('id', v_section.id, 'label', v_section.label));
		for v_team in
			select t.id from public.classroom_teams t
			where t.team_set_id = public._classroom_section_team_set(v_section.id)
			order by t.team_number
		loop
			v_plan := public.classroom_team_plan(v_section.id, v_team.id);
			continue when v_plan->'team' is null or jsonb_typeof(v_plan->'team') <> 'object';
			v_teams := v_teams || jsonb_build_array(v_plan || jsonb_build_object(
				'section_label', v_section.label,
				'saved_at', coalesce((
					select jsonb_object_agg(t.id, public._classroom_team_task_saved_at(v_team.id, t))
					from public.classroom_team_plans p
					join public.classroom_team_tasks t on t.plan_id = p.id
					where p.team_id = v_team.id and t.removed_at is null
						and public._classroom_team_task_saved_at(v_team.id, t) is not null
				), '{}'::jsonb)
			));
		end loop;
	end loop;
	return jsonb_build_object(
		'ok', true,
		'today', public._classroom_school_today(),
		'sections', v_sections,
		'teams', v_teams,
		'machines', coalesce((select jsonb_agg(jsonb_build_object('id', mt.id, 'label', mt.label) order by mt.sort)
			from public.classroom_machine_tags mt where mt.active), '[]'::jsonb),
		'no_school', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'label', d.label) order by d.day)
			from public.classroom_no_school_days d), '[]'::jsonb)
	);
end;
$f$;

-- Who a sign-off request is for, as account ids: the owner alone for an
-- owner-only request, otherwise the class's teacher of record.
create or replace function public._classroom_signoff_notify(p_request_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce(array_agg(distinct p.id), '{}')
	from public.classroom_signoff_requests r
	join public.classroom_teams t on t.id = r.team_id
	join public.classroom_team_sets ts on ts.id = t.team_set_id
	join public.classroom_sections s on s.id = ts.section_id
	join public.profiles p on lower(p.email) = case when r.owner_only then public.admin_owner_email() else s.teacher_email end
	where r.id = p_request_id and r.status = 'open';
$f$;

revoke all on function public._classroom_team_task_saved_at(uuid, public.classroom_team_tasks) from public, anon, authenticated;
revoke all on function public.classroom_team_board() from public, anon, authenticated;
grant execute on function public.classroom_team_board() to authenticated;
revoke all on function public._classroom_signoff_notify(uuid) from public, anon, authenticated, service_role;
grant execute on function public._classroom_signoff_notify(uuid) to service_role;

do $check$
begin
	if has_function_privilege('anon', 'public.classroom_team_board()', 'execute')
		or has_function_privilege('authenticated', 'public._classroom_signoff_notify(uuid)', 'execute') then
		raise exception '0306: a board function is executable by a role that must not hold it.';
	end if;
	raise notice '0306: % classes with a posted team draw.',
		(select count(*) from public.classroom_sections s where public._classroom_section_team_set(s.id) is not null);
end
$check$;
