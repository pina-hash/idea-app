-- 0303_classroom_team_plans.sql
--
-- THE TEAM PLAN AND ITS TRACKER (ledger 0436, IDEA209H Unit 4; decision 71,
-- every rule Mr. Pina's).
--
-- One plan per team (0302's `classroom_team_plans`). A task has a title, an
-- owner, a due date, a linked field (a post and a block), points, an optional
-- machine tag, an optional "needs task X first" and a status.
--
--   * SEEDED, NEVER TYPED: every graded block of the team's posts arrives as a
--     task the first time the plan is read (`_classroom_team_seed_tasks`), its
--     points and linked field fixed. Points are the block's `taskPoints`, or
--     its module's points spread over the module's counted blocks in whole
--     numbers, the remainder on the first. A `role` block's task is owned by
--     the role's owner, read at call time; a `team` block's task is assigned
--     by the team; an `individual` block becomes one task per member, owned by
--     that member. An `optional` block is never a task.
--   * A TEAM'S OWN TASK is 0 points: it counts toward Behind, never toward the
--     share.
--   * STATUS IS DERIVED, NOT STORED, EXCEPT THE ONE A STUDENT SETS. Done is the
--     linked field passing the completion rule (the client's `progress.ts`,
--     the one statement of it), On it is today's start-of-class check-in,
--     Blocked is a one-line reason the owner sets, Behind is past due and not
--     done. Nothing here stores Done.
--   * THE SHARE AND THE BALANCE ARE THE DATABASE'S (`_classroom_team_balance`):
--     each member's planned points against an even share, balanced when every
--     member holds 0.75 to 1.25 times it. The sign-off request (0304) asks it.
--   * A DUE DATE MOVES, LOGGED, NEVER PAST THE LINKED POST'S DUE DATE. An
--     absent student keeps their tasks; their dates may move the same way.
--   * MACHINE TAGS AND NO-SCHOOL DAYS ARE ADMIN-EDITABLE DATA, seeded with the
--     five machines and Nov 11.
--
-- PRIVACY: as 0302. A member reads and edits their own team's plan; a manager
-- of the section reads and edits every team's; nothing carries an address to a
-- student: a member is named by first name and an opaque per-team key.
--
-- DEPLOY ORDERING: none. Every function is new; nothing deployed calls one.
--
-- WHAT UNDOES IT, a person's paste: drop the functions this file creates, then
--   drop table if exists public.classroom_team_checkins, public.classroom_team_tasks,
--     public.classroom_machine_tags, public.classroom_no_school_days;

do $pre$
begin
	if to_regclass('public.classroom_team_plans') is null then
		raise exception '0303 cannot apply: classroom_team_plans does not exist. Apply 0302 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. Tables. The first object is new.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_machine_tags (
	id text primary key check (id ~ '^[a-z][a-z0-9-]{0,23}$'),
	label text not null check (char_length(btrim(label)) between 1 and 40),
	sort integer not null default 0,
	active boolean not null default true
);

create table if not exists public.classroom_no_school_days (
	day date primary key,
	label text not null check (char_length(btrim(label)) between 1 and 80),
	set_by text not null,
	set_at timestamptz not null default now()
);

create table if not exists public.classroom_team_tasks (
	id uuid primary key default gen_random_uuid(),
	plan_id uuid not null references public.classroom_team_plans (id) on delete cascade,
	-- 'seed': a graded block of a team post; 'team': the team's own task;
	-- 'sendback': a failed sign-off item (0304). Only 'seed' carries points.
	kind text not null check (kind in ('seed', 'team', 'sendback')),
	item_id uuid references public.classroom_items (id) on delete cascade,
	block_id text check (block_id is null or char_length(block_id) between 1 and 64),
	-- The member an individual block's task belongs to ('' for every other task).
	member_email text not null default '',
	-- The role whose owner owns this task, read at call time.
	role_id text check (role_id is null or role_id ~ '^[A-Za-z0-9_-]{1,40}$'),
	title text not null check (char_length(btrim(title)) between 1 and 120),
	owner_email text check (owner_email is null or (owner_email = lower(btrim(owner_email)) and owner_email like '%@%')),
	due_on date,
	points integer not null default 0 check (points between 0 and 10000),
	machine text,
	depends_on uuid references public.classroom_team_tasks (id) on delete set null,
	blocked_reason text check (blocked_reason is null or char_length(btrim(blocked_reason)) between 1 and 140),
	blocked_at timestamptz,
	-- Where a send-back task came from (0304).
	source_note text check (source_note is null or char_length(source_note) <= 300),
	created_by text not null,
	created_at timestamptz not null default now(),
	removed_at timestamptz,
	constraint classroom_team_tasks_points_kind check (kind = 'seed' or points = 0),
	constraint classroom_team_tasks_seed_link check (kind <> 'seed' or (item_id is not null and block_id is not null))
);

-- One seeded task per block per member slot: the seed is idempotent on this key.
create unique index if not exists classroom_team_tasks_seed_key
	on public.classroom_team_tasks (plan_id, item_id, block_id, member_email)
	where kind = 'seed';
create index if not exists classroom_team_tasks_plan_idx on public.classroom_team_tasks (plan_id);

create table if not exists public.classroom_team_checkins (
	team_id uuid not null references public.classroom_teams (id) on delete cascade,
	student_email text not null check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	school_day date not null,
	task_ids uuid[] not null default '{}',
	at timestamptz not null default now(),
	primary key (team_id, student_email, school_day)
);

alter table public.classroom_machine_tags enable row level security;
alter table public.classroom_no_school_days enable row level security;
alter table public.classroom_team_tasks enable row level security;
alter table public.classroom_team_checkins enable row level security;
revoke all on table public.classroom_machine_tags from public, anon, authenticated;
revoke all on table public.classroom_no_school_days from public, anon, authenticated;
revoke all on table public.classroom_team_tasks from public, anon, authenticated;
revoke all on table public.classroom_team_checkins from public, anon, authenticated;

-- THE SEEDS, once: the five machines and Veterans Day. A re-paste writes
-- nothing over an admin's edit.
do $seed$
begin
	insert into public.classroom_machine_tags (id, label, sort) values
		('laser', 'Laser cutter', 1), ('router', 'CNC router', 2), ('printer', '3D printer', 3),
		('mill', 'Mill', 4), ('lathe', 'Lathe', 5)
	on conflict (id) do nothing;
	insert into public.classroom_no_school_days (day, label, set_by)
	values ('2026-11-11', 'Veterans Day', 'system')
	on conflict (day) do nothing;
end
$seed$;

-- ---------------------------------------------------------------------------
-- 2. Private helpers.
-- ---------------------------------------------------------------------------

-- A member's opaque key within a team: what a page names a member by, so no
-- address reaches a student.
create or replace function public._classroom_member_key(p_team_id uuid, p_email text)
returns text
language sql
immutable
set search_path = ''
as $f$
	select substr(md5(p_team_id::text || ':' || coalesce(p_email, '')), 1, 16);
$f$;

-- The address behind a key, for a current member of the team, or null.
create or replace function public._classroom_member_by_key(p_team_id uuid, p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $f$
	select m.student_email from public.classroom_team_members m
	where m.team_id = p_team_id and public._classroom_member_key(p_team_id, m.student_email) = p_key;
$f$;

-- Today, as the school sees it.
create or replace function public._classroom_school_today()
returns date
language sql
stable
set search_path = ''
as $f$
	select (now() at time zone 'America/Los_Angeles')::date;
$f$;

-- MAY THE CALLER WORK ON THIS TEAM'S PLAN: a member, or a manager of its section.
create or replace function public._classroom_team_plan_access(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce(public._classroom_team_section(p_team_id) is not null and (
		public._classroom_team_member(p_team_id, public.current_user_email())
		or public.classroom_manages_section(public._classroom_team_section(p_team_id))
	), false);
$f$;

-- THE TASKS A TEAM'S POSTS SEED, written once each (`on conflict do nothing`).
create or replace function public._classroom_team_seed_tasks(p_team_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_plan uuid := public._classroom_team_plan_id(p_team_id);
	v_item record;
	v_mod jsonb;
	v_blk jsonb;
	v_counted jsonb;
	v_n integer;
	v_i integer;
	v_pts integer;
	v_machine text;
	v_title text;
	v_member text;
begin
	for v_item in select * from public._classroom_team_items(p_team_id) loop
		for v_mod in
			select m from jsonb_array_elements(
				case when jsonb_typeof(v_item.manifest->'modules') = 'array' then v_item.manifest->'modules' else '[]'::jsonb end) m
		loop
			select coalesce(jsonb_agg(b order by o), '[]'::jsonb) into v_counted
			from jsonb_array_elements(case when jsonb_typeof(v_mod->'blocks') = 'array' then v_mod->'blocks' else '[]'::jsonb end)
				with ordinality as x(b, o)
			where (x.b->'optional') is distinct from 'true'::jsonb;
			v_n := jsonb_array_length(v_counted);
			continue when v_n = 0;
			v_i := 0;
			for v_blk in select b from jsonb_array_elements(v_counted) b loop
				v_i := v_i + 1;
				if jsonb_typeof(v_blk->'taskPoints') = 'number'
					and (v_blk->>'taskPoints')::numeric >= 0
					and (v_blk->>'taskPoints')::numeric = floor((v_blk->>'taskPoints')::numeric) then
					v_pts := least((v_blk->>'taskPoints')::integer, 10000);
				else
					v_pts := coalesce((v_mod->>'points')::integer, 0) / v_n
						+ case when v_i <= coalesce((v_mod->>'points')::integer, 0) % v_n then 1 else 0 end;
				end if;
				select t.id into v_machine from public.classroom_machine_tags t
				where t.active and t.id = v_blk->>'machine';
				v_title := left(btrim(coalesce(nullif(btrim(v_blk->>'task'), ''), nullif(btrim(v_blk->>'prompt'), ''),
					v_blk->>'field', v_blk->>'id')), 120);
				if v_mod->>'audience' = 'individual' or v_mod->>'audience' is null then
					for v_member in select m.student_email from public.classroom_team_members m where m.team_id = p_team_id loop
						insert into public.classroom_team_tasks (plan_id, kind, item_id, block_id, member_email, title,
							owner_email, due_on, points, machine, created_by)
						values (v_plan, 'seed', v_item.item_id, v_blk->>'id', v_member, v_title,
							v_member, (v_item.due_at at time zone 'America/Los_Angeles')::date, v_pts, v_machine, 'system')
						on conflict (plan_id, item_id, block_id, member_email) where kind = 'seed' do nothing;
					end loop;
				else
					insert into public.classroom_team_tasks (plan_id, kind, item_id, block_id, role_id, title,
						due_on, points, machine, created_by)
					values (v_plan, 'seed', v_item.item_id, v_blk->>'id',
						case when v_mod->>'audience' = 'role' then v_mod->>'role' end,
						v_title, (v_item.due_at at time zone 'America/Los_Angeles')::date, v_pts, v_machine, 'system')
					on conflict (plan_id, item_id, block_id, member_email) where kind = 'seed' do nothing;
				end if;
			end loop;
		end loop;
	end loop;
end;
$f$;

-- A TASK'S OWNER NOW: the role's owner for a role task, else the stored owner.
create or replace function public._classroom_team_task_owner(p_team_id uuid, p_task public.classroom_team_tasks)
returns text
language sql
stable
security definer
set search_path = ''
as $f$
	select case when p_task.role_id is not null and p_task.kind = 'seed'
		then public._classroom_team_role_owner(p_team_id, p_task.role_id)
		else p_task.owner_email end;
$f$;

-- THE SHARE: each current member's planned points (live tasks with points)
-- against an even share, and whether every member is inside 0.75 to 1.25 of it.
create or replace function public._classroom_team_balance(p_team_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	with plan as (select p.id from public.classroom_team_plans p where p.team_id = p_team_id),
	members as (
		select m.student_email from public.classroom_team_members m where m.team_id = p_team_id
	),
	owned as (
		select public._classroom_team_task_owner(p_team_id, t) as owner, t.points
		from public.classroom_team_tasks t, plan
		where t.plan_id = plan.id and t.removed_at is null and t.points > 0
	),
	per as (
		select mb.student_email, coalesce(sum(o.points), 0) as pts
		from members mb left join owned o on o.owner = mb.student_email
		group by mb.student_email
	),
	totals as (
		select (select coalesce(sum(points), 0) from owned) as total, (select count(*) from members) as n
	)
	select jsonb_build_object(
		'total', totals.total,
		'unowned', (select coalesce(sum(points), 0) from owned where owner is null),
		'even', case when totals.n > 0 then round(totals.total::numeric / totals.n, 2) else 0 end,
		'members', coalesce((select jsonb_agg(jsonb_build_object(
			'key', public._classroom_member_key(p_team_id, per.student_email), 'points', per.pts) order by per.student_email)
			from per), '[]'::jsonb),
		'balanced', totals.n > 0 and totals.total > 0
			and not exists (select 1 from owned where owner is null)
			and not exists (
				select 1 from per
				where per.pts < 0.75 * totals.total::numeric / totals.n
					or per.pts > 1.25 * totals.total::numeric / totals.n)
	)
	from totals;
$f$;

-- THE LATEST DATE A TASK MAY BE DUE: its post's due date (school time), or for
-- a task with no post, the latest due date of the team's posts. Null is no cap.
create or replace function public._classroom_team_task_cap(p_team_id uuid, p_task public.classroom_team_tasks)
returns date
language sql
stable
security definer
set search_path = ''
as $f$
	select case
		when p_task.item_id is not null then
			(select (i.due_at at time zone 'America/Los_Angeles')::date from public.classroom_items i where i.id = p_task.item_id)
		else (select max((ti.due_at at time zone 'America/Los_Angeles')::date) from public._classroom_team_items(p_team_id) ti)
	end;
$f$;

-- The team a task belongs to, for a caller who may work on it, else null.
create or replace function public._classroom_team_task_team(p_task_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $f$
	select p.team_id from public.classroom_team_tasks t
	join public.classroom_team_plans p on p.id = t.plan_id
	where t.id = p_task_id and t.removed_at is null and public._classroom_team_plan_access(p.team_id);
$f$;

revoke all on function public._classroom_member_key(uuid, text) from public, anon, authenticated;
revoke all on function public._classroom_member_by_key(uuid, text) from public, anon, authenticated;
revoke all on function public._classroom_school_today() from public, anon, authenticated;
revoke all on function public._classroom_team_plan_access(uuid) from public, anon, authenticated;
revoke all on function public._classroom_team_seed_tasks(uuid) from public, anon, authenticated;
revoke all on function public._classroom_team_task_owner(uuid, public.classroom_team_tasks) from public, anon, authenticated;
revoke all on function public._classroom_team_balance(uuid) from public, anon, authenticated;
revoke all on function public._classroom_team_task_cap(uuid, public.classroom_team_tasks) from public, anon, authenticated;
revoke all on function public._classroom_team_task_team(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The read: one team's plan.
-- ---------------------------------------------------------------------------

-- `p_team_id` null is the caller's own team in the section's current draw.
create or replace function public.classroom_team_plan(p_section_id uuid, p_team_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_me text := public.current_user_email();
	v_set uuid := public._classroom_section_team_set(p_section_id);
	v_team uuid := p_team_id;
	v_today date := public._classroom_school_today();
begin
	if (select auth.uid()) is null or coalesce(v_me, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	if v_team is null then
		if v_set is null then
			return jsonb_build_object('ok', true, 'team', null, 'reason', 'not_posted');
		end if;
		select m.team_id into v_team from public.classroom_team_members m
		where m.team_set_id = v_set and m.student_email = v_me;
		if v_team is null then
			return jsonb_build_object('ok', true, 'team', null, 'reason', 'no_team');
		end if;
	end if;
	if not public._classroom_team_plan_access(v_team)
		or public._classroom_team_section(v_team) <> p_section_id then
		raise exception 'That team does not exist.';
	end if;
	perform public._classroom_team_seed_tasks(v_team);
	return (
		with team as (
			select t.id, t.team_number, s.section_id, s.posted_at, s.created_at as drawn_at,
				coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number) as name
			from public.classroom_teams t join public.classroom_team_sets s on s.id = t.team_set_id
			where t.id = v_team
		), plan as (
			select p.id from public.classroom_team_plans p where p.team_id = v_team
		)
		select jsonb_build_object(
			'ok', true,
			'today', v_today,
			'team', (select jsonb_build_object('id', team.id, 'name', team.name, 'number', team.team_number,
				'section_id', team.section_id, 'drawn_on', (team.drawn_at at time zone 'America/Los_Angeles')::date) from team),
			'me', public._classroom_member_key(v_team, v_me),
			'manager', public.classroom_manages_section(p_section_id),
			'members', coalesce((
				select jsonb_agg(jsonb_build_object(
					'key', public._classroom_member_key(v_team, m.student_email),
					'name', public._classroom_first_name(team.section_id, m.student_email),
					'me', m.student_email = v_me
				) order by (m.student_email = v_me) desc, e.display_name, m.student_email)
				from team join public.classroom_team_members m on m.team_id = team.id
				left join public.classroom_enrollments e on e.section_id = team.section_id and e.student_email = m.student_email
				where m.student_email = v_me or m.student_email not in (select public._idea_test_emails())
			), '[]'::jsonb),
			'roles', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', r.role->>'id', 'title', r.role->>'title',
					'owner', case when o.owner is null then null else public._classroom_member_key(v_team, o.owner) end
				) order by r.ord)
				from jsonb_array_elements(public._classroom_team_roles(v_team)) with ordinality as r(role, ord)
				left join lateral (select public._classroom_team_role_owner(v_team, r.role->>'id') as owner) o on true
			), '[]'::jsonb),
			'items', coalesce((
				select jsonb_agg(jsonb_build_object('id', ti.item_id, 'title', i.title, 'due_at', ti.due_at)
					order by ti.due_at nulls last, ti.created_at)
				from public._classroom_team_items(v_team) ti join public.classroom_items i on i.id = ti.item_id
			), '[]'::jsonb),
			'tasks', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', t.id, 'kind', t.kind, 'title', t.title,
					'item_id', t.item_id, 'block_id', t.block_id, 'role_id', t.role_id,
					'block', case when t.item_id is null then null else
						public._classroom_html_block(h.manifest, t.block_id) end,
					'owner', case when public._classroom_team_task_owner(v_team, t) is null then null
						else public._classroom_member_key(v_team, public._classroom_team_task_owner(v_team, t)) end,
					'fixed_owner', t.kind = 'seed' and (t.role_id is not null or t.member_email <> ''),
					'due_on', t.due_on, 'cap', public._classroom_team_task_cap(v_team, t),
					'points', t.points, 'machine', t.machine, 'depends_on', t.depends_on,
					'blocked', t.blocked_reason, 'note', t.source_note,
					-- The linked answer, the team's for a shared block and the
					-- member's own for an individual one, so the page can apply
					-- the one completion rule. A picture counts by its presence.
					'value', case
						when t.item_id is null then null
						when t.member_email <> '' then (select r.value from public.classroom_responses r
							where r.item_id = t.item_id and r.block_id = t.block_id and r.student_email = t.member_email)
						else (select a.value from public.classroom_team_answers a
							where a.team_id = v_team and a.item_id = t.item_id and a.block_id = t.block_id)
					end,
					'has_image', case when t.item_id is null then false else exists (
						select 1 from public.classroom_submission_files f
						join public.classroom_submissions s on s.id = f.submission_id
						where s.item_id = t.item_id and f.block_id = t.block_id
							and (case when t.member_email <> '' then s.student_email = t.member_email
								else s.student_email in (select m.student_email from public.classroom_team_members m where m.team_id = v_team) end)
					) end,
					'on_it', coalesce((
						select jsonb_agg(public._classroom_member_key(v_team, c.student_email))
						from public.classroom_team_checkins c
						where c.team_id = v_team and c.school_day = v_today and t.id = any (c.task_ids)
					), '[]'::jsonb)
				) order by t.due_on nulls last, t.created_at, t.title)
				from plan join public.classroom_team_tasks t on t.plan_id = plan.id
				left join public.classroom_html_assignments h on h.item_id = t.item_id
				where t.removed_at is null
			), '[]'::jsonb),
			'checked_in', coalesce((
				select jsonb_agg(public._classroom_member_key(v_team, c.student_email))
				from public.classroom_team_checkins c where c.team_id = v_team and c.school_day = v_today
			), '[]'::jsonb),
			'balance', public._classroom_team_balance(v_team),
			'machines', coalesce((select jsonb_agg(jsonb_build_object('id', mt.id, 'label', mt.label) order by mt.sort)
				from public.classroom_machine_tags mt where mt.active), '[]'::jsonb),
			'no_school', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'label', d.label) order by d.day)
				from public.classroom_no_school_days d), '[]'::jsonb)
		)
	);
end;
$f$;

revoke all on function public.classroom_team_plan(uuid, uuid) from public, anon, authenticated;
grant execute on function public.classroom_team_plan(uuid, uuid) to authenticated;

-- THE SECTION'S CURRENT TEAMS, for a manager's team picker: names and ids,
-- from the one rule of which draw is current. A manager of the section only.
create or replace function public.classroom_section_teams(p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_set uuid := public._classroom_section_team_set(p_section_id);
begin
	if (select auth.uid()) is null or not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;
	return jsonb_build_object('ok', true, 'team_set_id', v_set, 'teams', coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', t.id, 'number', t.team_number,
			'name', coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number)
		) order by t.team_number)
		from public.classroom_teams t where t.team_set_id = v_set
	), '[]'::jsonb));
end;
$f$;

revoke all on function public.classroom_section_teams(uuid) from public, anon, authenticated;
grant execute on function public.classroom_section_teams(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The writes. Every one: the caller may work on the plan, logged, noticed.
-- ---------------------------------------------------------------------------

-- WHO OWNS A ROLE, by member key (the plan's own call; 0302's setter does the work).
create or replace function public.classroom_team_plan_set_role(p_team_id uuid, p_role_id text, p_member_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_email text;
begin
	if not public._classroom_team_plan_access(p_team_id) then
		raise exception 'That team does not exist.';
	end if;
	if p_member_key is not null then
		v_email := public._classroom_member_by_key(p_team_id, p_member_key);
		if v_email is null then
			return jsonb_build_object('ok', false, 'reason', 'not_member');
		end if;
	end if;
	return public.classroom_team_set_role(p_team_id, p_role_id, v_email);
end;
$f$;

-- A TEAM TASK'S OWNER. Never a role task or an individual block's task: those
-- owners are fixed by the role and the block.
create or replace function public.classroom_team_task_set_owner(p_task_id uuid, p_member_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_team uuid := public._classroom_team_task_team(p_task_id);
	v_task public.classroom_team_tasks;
	v_email text;
begin
	if v_team is null then
		raise exception 'That task does not exist.';
	end if;
	select * into v_task from public.classroom_team_tasks where id = p_task_id for update;
	if v_task.kind = 'seed' and (v_task.role_id is not null or v_task.member_email <> '') then
		return jsonb_build_object('ok', false, 'reason', 'fixed_owner');
	end if;
	if p_member_key is not null then
		v_email := public._classroom_member_by_key(v_team, p_member_key);
		if v_email is null then
			return jsonb_build_object('ok', false, 'reason', 'not_member');
		end if;
	end if;
	if v_task.owner_email is not distinct from v_email then
		return jsonb_build_object('ok', true);
	end if;
	update public.classroom_team_tasks set owner_email = v_email where id = p_task_id;
	insert into public.classroom_team_log (team_id, item_id, block_id, kind, actor_email, before, after, note)
	values (v_team, v_task.item_id, v_task.block_id, 'task-owner', public.current_user_email(),
		to_jsonb(v_task.owner_email), to_jsonb(v_email), left(v_task.title, 500));
	perform public._classroom_live_notice('team-' || v_team::text, 'team-doc');
	return jsonb_build_object('ok', true);
end;
$f$;

-- A TASK'S DUE DATE: never past its post's due date, never on a weekend or a
-- no-school day, logged before and after.
create or replace function public.classroom_team_task_set_due(p_task_id uuid, p_due_on date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_team uuid := public._classroom_team_task_team(p_task_id);
	v_task public.classroom_team_tasks;
	v_cap date;
begin
	if v_team is null then
		raise exception 'That task does not exist.';
	end if;
	select * into v_task from public.classroom_team_tasks where id = p_task_id for update;
	if p_due_on is null then
		return jsonb_build_object('ok', false, 'reason', 'no_date');
	end if;
	v_cap := public._classroom_team_task_cap(v_team, v_task);
	if v_cap is not null and p_due_on > v_cap then
		return jsonb_build_object('ok', false, 'reason', 'past_post_due', 'cap', v_cap);
	end if;
	if extract(isodow from p_due_on) in (6, 7)
		or exists (select 1 from public.classroom_no_school_days d where d.day = p_due_on) then
		return jsonb_build_object('ok', false, 'reason', 'not_school_day');
	end if;
	if v_task.due_on is not distinct from p_due_on then
		return jsonb_build_object('ok', true);
	end if;
	update public.classroom_team_tasks set due_on = p_due_on where id = p_task_id;
	insert into public.classroom_team_log (team_id, item_id, block_id, kind, actor_email, before, after, note)
	values (v_team, v_task.item_id, v_task.block_id, 'task-due', public.current_user_email(),
		to_jsonb(v_task.due_on), to_jsonb(p_due_on), left(v_task.title, 500));
	perform public._classroom_live_notice('team-' || v_team::text, 'team-doc');
	return jsonb_build_object('ok', true);
end;
$f$;

-- THE TEAM'S OWN TASK, at 0 points.
create or replace function public.classroom_team_task_add(
	p_team_id uuid,
	p_title text,
	p_member_key text,
	p_due_on date,
	p_depends_on uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_email text;
	v_id uuid;
	v_cap date;
begin
	if not public._classroom_team_plan_access(p_team_id) then
		raise exception 'That team does not exist.';
	end if;
	if coalesce(btrim(p_title), '') = '' or char_length(btrim(p_title)) > 120 then
		return jsonb_build_object('ok', false, 'reason', 'title');
	end if;
	if p_member_key is not null then
		v_email := public._classroom_member_by_key(p_team_id, p_member_key);
		if v_email is null then
			return jsonb_build_object('ok', false, 'reason', 'not_member');
		end if;
	end if;
	select max((ti.due_at at time zone 'America/Los_Angeles')::date) into v_cap from public._classroom_team_items(p_team_id) ti;
	if p_due_on is not null and v_cap is not null and p_due_on > v_cap then
		return jsonb_build_object('ok', false, 'reason', 'past_post_due', 'cap', v_cap);
	end if;
	if p_depends_on is not null and public._classroom_team_task_team(p_depends_on) is distinct from p_team_id then
		return jsonb_build_object('ok', false, 'reason', 'unknown_task');
	end if;
	insert into public.classroom_team_tasks (plan_id, kind, title, owner_email, due_on, depends_on, created_by)
	values (public._classroom_team_plan_id(p_team_id), 'team', btrim(p_title), v_email, p_due_on, p_depends_on,
		public.current_user_email())
	returning id into v_id;
	insert into public.classroom_team_log (team_id, kind, actor_email, after, note)
	values (p_team_id, 'task-add', public.current_user_email(), to_jsonb(v_id), left(btrim(p_title), 500));
	perform public._classroom_live_notice('team-' || p_team_id::text, 'team-doc');
	return jsonb_build_object('ok', true, 'id', v_id);
end;
$f$;

-- TAKE A TEAM'S OWN TASK OFF THE PLAN (never a seeded or sent-back one).
create or replace function public.classroom_team_task_remove(p_task_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_team uuid := public._classroom_team_task_team(p_task_id);
	v_task public.classroom_team_tasks;
begin
	if v_team is null then
		raise exception 'That task does not exist.';
	end if;
	select * into v_task from public.classroom_team_tasks where id = p_task_id for update;
	if v_task.kind <> 'team' then
		return jsonb_build_object('ok', false, 'reason', 'not_removable');
	end if;
	update public.classroom_team_tasks set removed_at = now() where id = p_task_id;
	insert into public.classroom_team_log (team_id, kind, actor_email, before, note)
	values (v_team, 'task-add', public.current_user_email(), to_jsonb(p_task_id), 'removed: ' || left(v_task.title, 480));
	perform public._classroom_live_notice('team-' || v_team::text, 'team-doc');
	return jsonb_build_object('ok', true);
end;
$f$;

-- BLOCKED, the one status a student sets, by the task's owner or a manager;
-- null clears it.
create or replace function public.classroom_team_task_block(p_task_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_team uuid := public._classroom_team_task_team(p_task_id);
	v_task public.classroom_team_tasks;
	v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
	v_me text := public.current_user_email();
begin
	if v_team is null then
		raise exception 'That task does not exist.';
	end if;
	select * into v_task from public.classroom_team_tasks where id = p_task_id for update;
	if public._classroom_team_task_owner(v_team, v_task) is distinct from v_me
		and not public.classroom_manages_section(public._classroom_team_section(v_team)) then
		return jsonb_build_object('ok', false, 'reason', 'not_owner');
	end if;
	if v_reason is not null and char_length(v_reason) > 140 then
		return jsonb_build_object('ok', false, 'reason', 'too_long');
	end if;
	update public.classroom_team_tasks
	set blocked_reason = v_reason, blocked_at = case when v_reason is null then null else now() end
	where id = p_task_id;
	insert into public.classroom_team_log (team_id, item_id, block_id, kind, actor_email, before, after, note)
	values (v_team, v_task.item_id, v_task.block_id,
		case when v_reason is null then 'task-unblocked' else 'task-blocked' end, v_me,
		to_jsonb(v_task.blocked_reason), to_jsonb(v_reason), left(v_task.title, 500));
	perform public._classroom_live_notice('team-' || v_team::text, 'team-doc');
	return jsonb_build_object('ok', true);
end;
$f$;

-- "NEEDS TASK X FIRST": another task of the same team, or null.
create or replace function public.classroom_team_task_depends(p_task_id uuid, p_depends_on uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_team uuid := public._classroom_team_task_team(p_task_id);
begin
	if v_team is null then
		raise exception 'That task does not exist.';
	end if;
	if p_depends_on is not null and (p_depends_on = p_task_id
		or public._classroom_team_task_team(p_depends_on) is distinct from v_team) then
		return jsonb_build_object('ok', false, 'reason', 'unknown_task');
	end if;
	update public.classroom_team_tasks set depends_on = p_depends_on where id = p_task_id;
	perform public._classroom_live_notice('team-' || v_team::text, 'team-doc');
	return jsonb_build_object('ok', true);
end;
$f$;

-- THE START-OF-CLASS CHECK-IN: the tasks the caller is on today, replacing
-- what they tapped earlier today. A member only.
create or replace function public.classroom_team_checkin(p_team_id uuid, p_task_ids uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_me text := public.current_user_email();
	v_ids uuid[];
begin
	if not public._classroom_team_member(p_team_id, v_me) then
		raise exception 'That team does not exist.';
	end if;
	select coalesce(array_agg(distinct t.id), '{}') into v_ids
	from public.classroom_team_tasks t join public.classroom_team_plans p on p.id = t.plan_id
	where p.team_id = p_team_id and t.removed_at is null and t.id = any (coalesce(p_task_ids, '{}'));
	insert into public.classroom_team_checkins (team_id, student_email, school_day, task_ids)
	values (p_team_id, v_me, public._classroom_school_today(), v_ids)
	on conflict (team_id, student_email, school_day) do update set task_ids = excluded.task_ids, at = now();
	insert into public.classroom_team_log (team_id, kind, actor_email, after)
	values (p_team_id, 'checkin', v_me, to_jsonb(v_ids));
	perform public._classroom_live_notice('team-' || p_team_id::text, 'team-doc');
	return jsonb_build_object('ok', true, 'count', coalesce(array_length(v_ids, 1), 0));
end;
$f$;

-- ADMIN: the machine list and the no-school days.
create or replace function public.classroom_machine_tag_set(p_id text, p_label text, p_active boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
begin
	if not public.is_admin() then
		raise exception 'Only a site admin can change the machine list.';
	end if;
	insert into public.classroom_machine_tags (id, label, active, sort)
	values (lower(btrim(p_id)), btrim(p_label), coalesce(p_active, true),
		coalesce((select max(sort) + 1 from public.classroom_machine_tags), 1))
	on conflict (id) do update set label = excluded.label, active = excluded.active;
	return jsonb_build_object('ok', true);
end;
$f$;

create or replace function public.classroom_no_school_day_set(p_day date, p_label text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
begin
	if not public.is_admin() then
		raise exception 'Only a site admin can change the no-school days.';
	end if;
	if p_label is null or btrim(p_label) = '' then
		delete from public.classroom_no_school_days where day = p_day;
	else
		insert into public.classroom_no_school_days (day, label, set_by)
		values (p_day, btrim(p_label), public.current_user_email())
		on conflict (day) do update set label = excluded.label, set_by = excluded.set_by, set_at = now();
	end if;
	return jsonb_build_object('ok', true);
end;
$f$;

revoke all on function public.classroom_team_plan_set_role(uuid, text, text) from public, anon, authenticated;
revoke all on function public.classroom_team_task_set_owner(uuid, text) from public, anon, authenticated;
revoke all on function public.classroom_team_task_set_due(uuid, date) from public, anon, authenticated;
revoke all on function public.classroom_team_task_add(uuid, text, text, date, uuid) from public, anon, authenticated;
revoke all on function public.classroom_team_task_remove(uuid) from public, anon, authenticated;
revoke all on function public.classroom_team_task_block(uuid, text) from public, anon, authenticated;
revoke all on function public.classroom_team_task_depends(uuid, uuid) from public, anon, authenticated;
revoke all on function public.classroom_team_checkin(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.classroom_machine_tag_set(text, text, boolean) from public, anon, authenticated;
revoke all on function public.classroom_no_school_day_set(date, text) from public, anon, authenticated;
grant execute on function public.classroom_team_plan_set_role(uuid, text, text) to authenticated;
grant execute on function public.classroom_team_task_set_owner(uuid, text) to authenticated;
grant execute on function public.classroom_team_task_set_due(uuid, date) to authenticated;
grant execute on function public.classroom_team_task_add(uuid, text, text, date, uuid) to authenticated;
grant execute on function public.classroom_team_task_remove(uuid) to authenticated;
grant execute on function public.classroom_team_task_block(uuid, text) to authenticated;
grant execute on function public.classroom_team_task_depends(uuid, uuid) to authenticated;
grant execute on function public.classroom_team_checkin(uuid, uuid[]) to authenticated;
grant execute on function public.classroom_machine_tag_set(text, text, boolean) to authenticated;
grant execute on function public.classroom_no_school_day_set(date, text) to authenticated;

do $report$
begin
	raise notice '0303: % machine tags, % no-school days.',
		(select count(*) from public.classroom_machine_tags),
		(select count(*) from public.classroom_no_school_days);
end
$report$;
