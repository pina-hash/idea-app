-- 0302_classroom_team_documents.sql
--
-- ONE LIVE SHARED DOCUMENT PER TEAM (ledger 0436, IDEA209H Unit 4; every
-- decision here is Mr. Pina's, confirmed in chat 2026-10-23 to 2026-10-26,
-- with his addendum of 2026-10-26 on posting a draw).
--
-- A ported HTML assignment whose manifest declares `team` (0301) is a team
-- assignment. Inside it:
--
--   * a `team` module holds ONE answer per block per team, which any member
--     may edit;
--   * a `role` module belongs to the team member who owns that role in the
--     team plan, and only that member may edit it; teammates read it live;
--   * an `individual` module (or one with no audience) is each student's own,
--     exactly as every HTML assignment has always been.
--
-- WHICH TEAM, AND POSTING A DRAW IS THE SWITCH. Nothing is bound at upload and
-- nothing is linked by hand. One post can be shared by three sections, and each
-- section resolves its own teams AT EVERY CALL: that section's current posted
-- team draw (0223's `_classroom_team_set_visible`, the most recently posted
-- when two are showing). Before a draw is posted there is no team document,
-- and the page says so; the moment `classroom_post_team_set` returns, every
-- student in the section has one. Unposting, a redraw that is posted, and a
-- hand move (0225, decision 44) take effect the same way.
--
-- WHERE A TEAM ANSWER IS STORED. The team's answer is ONE row per team per
-- block in `classroom_team_answers`, keyed by the TEAM. It is also written to
-- every current member's ordinary `classroom_responses` row in the same
-- statement, so every reader that already exists -- grading, the bulk path,
-- the FACTS export, Missing and Complete, Answers left, the teammate progress
-- of 0290 -- reads a team answer with no change. The member rows are copies the
-- team row decides: when a student moves to another team, a trigger takes the
-- old team's answers out of their rows and puts the new team's in, so work
-- stays with the team and the block it was written in and never follows the
-- student. `classroom_save_response` is still the only function a student
-- calls to answer, widened once more (html-assignments.md: the write gate is
-- one function widened, never a second write path); its signature does not
-- change, so there is no deploy ordering.
--
-- PER-BOX LOCK, NOT CHARACTER MERGING. Focusing a box takes its lock
-- (`classroom_team_box_lock`), and teammates see who is editing. A lock is free
-- again on release (blur) or two minutes after its holder last touched it, so
-- a closed laptop never freezes a box; that expiry is read at call time, never
-- swept. The SERVER refuses a save from anyone but the holder, and a save when
-- nobody holds the box takes the lock first, so a document that never reports
-- focus still works.
--
-- EVERY SAVE WRITES A CHANGE-LOG ROW (`classroom_team_log`): who, when, which
-- block, the value before and after; a move between teams is logged too.
-- Append-only, no client grant; instructors read a box's whole history through
-- `classroom_team_box_history`.
--
-- AFTER THE POST'S DUE DATE THE TEAM'S FIELDS ARE READ-ONLY (`past_due`), and
-- the instructor's close (0198) shuts them as it shuts any worksheet.
--
-- LIVE, FROM THE DATABASE. A post, an unpost, a rename, a move, a team answer,
-- a lock and a role owner each send the payload-free notice of live.ts from a
-- trigger, through Supabase's `realtime.send`, so a change made on the site,
-- through the connector or in the SQL editor reaches every open page the same
-- way. The notice carries a topic and nothing else; every page re-reads through
-- its own role-scoped RPC. Best effort by contract: a database without
-- `realtime.send` sends nothing and the pages' own announces and floors stand.
--
-- PRIVACY. Every new table is RLS on, no policy, no client grant, written and
-- read only through the definer functions below. A student reads their OWN
-- team's document and nothing else; a section manager reads every team in the
-- sections they manage; an admin reads all (through `classroom_manages_section`).
-- tests/db/classroom-team-documents.test.ts counts both directions and is
-- mutation-proven in the permissive direction.
--
-- WHAT UNDOES IT, a person's paste:
--   re-run 0197's classroom_save_response and its two grant lines;
--   drop trigger classroom_team_members_resync on public.classroom_team_members;
--   drop trigger classroom_team_sets_notice on public.classroom_team_sets;
--   drop trigger classroom_teams_notice on public.classroom_teams;
--   drop function if exists each function this file creates;
--   drop table if exists public.classroom_team_box_locks, public.classroom_team_log,
--     public.classroom_team_answers, public.classroom_team_plan_roles,
--     public.classroom_team_plans;
-- Team answers already copied stay in each member's own rows.

do $pre$
begin
	if to_regclass('public.classroom_team_sets') is null then
		raise exception '0302 cannot apply: classroom_team_sets does not exist. Apply 0223 first.';
	end if;
	if to_regprocedure('public._classroom_html_team_roles(jsonb)') is null then
		raise exception '0302 cannot apply: _classroom_html_team_roles does not exist. Apply 0301 first.';
	end if;
	if to_regprocedure('public._classroom_html_block(jsonb, text)') is null then
		raise exception '0302 cannot apply: _classroom_html_block does not exist. Apply 0197 first.';
	end if;
	if to_regprocedure('public._idea_test_emails()') is null then
		raise exception '0302 cannot apply: _idea_test_emails does not exist.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. Tables. The first object is new, so the apply probe can see this landed.
-- ---------------------------------------------------------------------------

-- THE TEAM'S ANSWER, one row per team per block. The member rows in
-- `classroom_responses` are copies this row decides.
create table if not exists public.classroom_team_answers (
	team_id uuid not null references public.classroom_teams (id) on delete cascade,
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	block_id text not null check (char_length(block_id) between 1 and 64),
	value jsonb not null,
	updated_by text not null,
	updated_at timestamptz not null default now(),
	primary key (team_id, item_id, block_id)
);

-- One plan per team (step c of ledger 0436 fills it with tasks). A team is one
-- draw's team, and a draw is drawn for a project, so the team IS the unit's
-- team. In this file it holds what the shared document needs: who owns each role.
create table if not exists public.classroom_team_plans (
	id uuid primary key default gen_random_uuid(),
	team_id uuid not null unique references public.classroom_teams (id) on delete cascade,
	created_at timestamptz not null default now()
);

create table if not exists public.classroom_team_plan_roles (
	plan_id uuid not null references public.classroom_team_plans (id) on delete cascade,
	role_id text not null check (role_id ~ '^[A-Za-z0-9_-]{1,40}$'),
	owner_email text not null
		check (owner_email = lower(btrim(owner_email)) and owner_email like '%@%'),
	set_by text not null,
	set_at timestamptz not null default now(),
	primary key (plan_id, role_id)
);

create table if not exists public.classroom_team_box_locks (
	team_id uuid not null references public.classroom_teams (id) on delete cascade,
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	block_id text not null check (char_length(block_id) between 1 and 64),
	holder_email text not null
		check (holder_email = lower(btrim(holder_email)) and holder_email like '%@%'),
	taken_at timestamptz not null default now(),
	touched_at timestamptz not null default now(),
	primary key (team_id, item_id, block_id)
);

-- THE TEAM'S CHANGE LOG. One table for every event a team record carries, so
-- an instructor reads one history: an answer saved, a role set, a move between
-- teams (this file), and the plan and sign-off events the later steps of
-- ledger 0436 add. Append-only: no client grant of any kind, no update path.
create table if not exists public.classroom_team_log (
	id bigint generated always as identity primary key,
	team_id uuid not null references public.classroom_teams (id) on delete cascade,
	item_id uuid references public.classroom_items (id) on delete cascade,
	block_id text check (block_id is null or char_length(block_id) between 1 and 64),
	kind text not null check (kind in (
		'answer', 'role', 'move-in', 'move-out', 'task-add', 'task-owner', 'task-due',
		'task-blocked', 'task-unblocked', 'checkin', 'signoff-request',
		'signoff-approved', 'signoff-sent-back'
	)),
	actor_email text not null,
	at timestamptz not null default now(),
	before jsonb,
	after jsonb,
	note text check (note is null or char_length(note) <= 500)
);

create index if not exists classroom_team_log_box_idx
	on public.classroom_team_log (team_id, item_id, block_id, at desc);
create index if not exists classroom_team_log_team_idx
	on public.classroom_team_log (team_id, at desc);

alter table public.classroom_team_answers enable row level security;
alter table public.classroom_team_plans enable row level security;
alter table public.classroom_team_plan_roles enable row level security;
alter table public.classroom_team_box_locks enable row level security;
alter table public.classroom_team_log enable row level security;

revoke all on table public.classroom_team_answers from public, anon, authenticated;
revoke all on table public.classroom_team_plans from public, anon, authenticated;
revoke all on table public.classroom_team_plan_roles from public, anon, authenticated;
revoke all on table public.classroom_team_box_locks from public, anon, authenticated;
revoke all on table public.classroom_team_log from public, anon, authenticated;
-- The log's identity sequence is handed to both client roles by the project's
-- default privileges, as every sequence is; 0203's shape takes it back by name.
-- The definer functions that insert run as the owner and need none of it.
revoke all on sequence public.classroom_team_log_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Private helpers. Every one is revoked from every client role by name and
--    called only from the definer functions and triggers below.
-- ---------------------------------------------------------------------------

-- How long a box stays held after its holder last touched it.
create or replace function public._classroom_team_lock_ttl()
returns interval
language sql
immutable
set search_path = ''
as $f$
	select interval '2 minutes';
$f$;

-- THE PAYLOAD-FREE NOTICE OF live.ts, sent from the database. `p_key` is the
-- live channel's key: a section id, or 'team-' and a team id for one team's
-- document. Best effort: a database without `realtime.send`, or a send that
-- fails, changes nothing about the write that called it.
create or replace function public._classroom_live_notice(p_key text, p_topic text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $f$
begin
	if p_key is null or to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null then
		return;
	end if;
	execute 'select realtime.send($1, $2, $3, false)'
		using jsonb_build_object('topic', p_topic), 'changed', 'classroom-live:' || p_key;
exception when others then
	return;
end;
$f$;

-- The name a teammate sees: the first word of the roster name, or the address's
-- local part when the roster has none. Never the address.
create or replace function public._classroom_first_name(p_section_id uuid, p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce(
		(select nullif(split_part(btrim(e.display_name), ' ', 1), '')
		 from public.classroom_enrollments e
		 where e.section_id = p_section_id and e.student_email = p_email),
		split_part(coalesce(p_email, ''), '@', 1)
	);
$f$;

-- The team manifest of an item, or null when the item is not a team
-- assignment. `_classroom_html_manifest` is CALLED, not restated.
create or replace function public._classroom_html_team_manifest(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_manifest jsonb := public._classroom_html_manifest(p_item_id);
begin
	if v_manifest is null or jsonb_typeof(v_manifest->'team') is distinct from 'object' then
		return null;
	end if;
	return v_manifest;
end;
$f$;

-- WHO WRITES A BLOCK OF A TEAM MANIFEST: {"audience":"team"} or
-- {"audience":"role","role":"<id>"}, or null for an individual or header
-- block and for any manifest without `team`.
create or replace function public._classroom_html_team_block(p_manifest jsonb, p_block_id text)
returns jsonb
language sql
immutable
security definer
set search_path = ''
as $f$
	select case
		when jsonb_typeof(p_manifest->'team') is distinct from 'object' then null
		else (
			select case m.mod->>'audience'
				when 'team' then jsonb_build_object('audience', 'team')
				when 'role' then jsonb_build_object('audience', 'role', 'role', m.mod->>'role')
				else null end
			from jsonb_array_elements(
				case when jsonb_typeof(p_manifest->'modules') = 'array'
					then p_manifest->'modules' else '[]'::jsonb end) as m(mod),
				jsonb_array_elements(
					case when jsonb_typeof(m.mod->'blocks') = 'array'
						then m.mod->'blocks' else '[]'::jsonb end) as b(blk)
			where b.blk->>'id' = p_block_id
			limit 1
		)
	end;
$f$;

-- THE SECTION'S CURRENT TEAMS: its posted draw that is showing now, the most
-- recently posted when two are. Derived at every call, never stored, so a post,
-- an unpost and a redraw are each the switch.
create or replace function public._classroom_section_team_set(p_section_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $f$
	select s.id
	from public.classroom_team_sets s
	where s.section_id = p_section_id and public._classroom_team_set_visible(s.id)
	order by s.posted_at desc, s.created_at desc, s.id
	limit 1;
$f$;

-- WHICH TEAM A STUDENT IS ON FOR AN ITEM: a section the item is posted to and
-- the student is actively enrolled in, that section's current draw, and the
-- student's team in it. `team_id` null with `team_set_id` null is "no draw is
-- posted"; with a draw, it is "not on a team in it".
create or replace function public._classroom_team_ctx(p_item_id uuid, p_email text)
returns table (section_id uuid, team_set_id uuid, team_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_section uuid;
	v_set uuid;
	v_first_section uuid;
	v_first_set uuid;
	v_team uuid;
begin
	if coalesce(p_email, '') = '' then
		return;
	end if;
	for v_section in
		select pg.section_id
		from public.classroom_postings pg
		join public.classroom_enrollments e
			on e.section_id = pg.section_id and e.student_email = p_email and e.active
		where pg.item_id = p_item_id
		order by pg.section_id
	loop
		v_set := public._classroom_section_team_set(v_section);
		if v_first_section is null then
			v_first_section := v_section;
			v_first_set := v_set;
		end if;
		continue when v_set is null;
		select m.team_id into v_team
		from public.classroom_team_members m
		where m.team_set_id = v_set and m.student_email = p_email;
		if v_team is not null then
			section_id := v_section;
			team_set_id := v_set;
			team_id := v_team;
			return next;
			return;
		end if;
		if v_first_set is null then
			v_first_section := v_section;
			v_first_set := v_set;
		end if;
	end loop;
	if v_first_section is not null then
		section_id := v_first_section;
		team_set_id := v_first_set;
		team_id := null;
		return next;
	end if;
end;
$f$;

-- THE SECTION A TEAM BELONGS TO.
create or replace function public._classroom_team_section(p_team_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $f$
	select s.section_id
	from public.classroom_teams t join public.classroom_team_sets s on s.id = t.team_set_id
	where t.id = p_team_id;
$f$;

-- The plan row for a team, created on first use (`on conflict do nothing` and a
-- re-read: the lazy-create race rule).
create or replace function public._classroom_team_plan_id(p_team_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_id uuid;
begin
	insert into public.classroom_team_plans (team_id) values (p_team_id)
	on conflict (team_id) do nothing;
	select p.id into v_id from public.classroom_team_plans p where p.team_id = p_team_id;
	return v_id;
end;
$f$;

-- Who owns a role on a team, or null.
create or replace function public._classroom_team_role_owner(p_team_id uuid, p_role_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $f$
	select r.owner_email
	from public.classroom_team_plans p
	join public.classroom_team_plan_roles r on r.plan_id = p.id
	where p.team_id = p_team_id and r.role_id = p_role_id;
$f$;

-- THE TEAM ASSIGNMENTS A TEAM WORKS ON: every published team item posted to
-- the team's section that is not older than its draw (due after the draw was
-- made, or with no due date). The plan's tasks and roles come from these.
create or replace function public._classroom_team_items(p_team_id uuid)
returns table (item_id uuid, manifest jsonb, due_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $f$
	select i.id, h.manifest, i.due_at, i.created_at
	from public.classroom_teams t
	join public.classroom_team_sets s on s.id = t.team_set_id
	join public.classroom_postings pg on pg.section_id = s.section_id
	join public.classroom_items i on i.id = pg.item_id
	join public.classroom_html_assignments h on h.item_id = i.id
	where t.id = p_team_id
		and i.kind = 'assignment'
		and i.assignment_schema_version = 3
		and jsonb_typeof(h.manifest->'team') = 'object'
		and public._classroom_item_live(i.published, i.publish_at)
		and (i.due_at is null or i.due_at >= s.created_at);
$f$;

-- THE ROLES A TEAM'S ASSIGNMENTS DECLARE: every role of every team item, in
-- first appearance, the first title winning. [{id, title}].
create or replace function public._classroom_team_roles(p_team_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	with roles as (
		select r.role->>'id' as id, r.role->>'title' as title,
			row_number() over (order by ti.created_at, ti.item_id, r.ord) as seen
		from public._classroom_team_items(p_team_id) ti
		cross join lateral jsonb_array_elements(
			case when jsonb_typeof(ti.manifest->'team'->'roles') = 'array'
				then ti.manifest->'team'->'roles' else '[]'::jsonb end
		) with ordinality as r(role, ord)
		where (r.role->>'id') = any (public._classroom_html_team_roles(ti.manifest))
	), firsts as (
		select distinct on (id) id, title, seen from roles order by id, seen
	)
	select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title) order by seen), '[]'::jsonb)
	from firsts;
$f$;

-- WHETHER THIS STUDENT MAY WRITE THIS TEAM BLOCK NOW, as a refusal or null.
-- The ONE statement of the rule; the lock take and the save both ask it.
create or replace function public._classroom_team_block_refusal(
	p_item_id uuid,
	p_email text,
	p_team_id uuid,
	p_owner jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_due timestamptz;
	v_owner text;
	v_state text;
begin
	select i.due_at into v_due from public.classroom_items i where i.id = p_item_id;
	if v_due is not null and now() > v_due then
		return jsonb_build_object('ok', false, 'reason', 'past_due');
	end if;
	select s.state into v_state from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = p_email;
	if v_state = 'submitted' then
		return jsonb_build_object('ok', false, 'reason', 'locked');
	end if;
	if p_owner->>'audience' = 'role' then
		v_owner := public._classroom_team_role_owner(p_team_id, p_owner->>'role');
		if v_owner is null then
			return jsonb_build_object('ok', false, 'reason', 'no_owner', 'role', p_owner->>'role');
		end if;
		if v_owner <> p_email then
			return jsonb_build_object('ok', false, 'reason', 'not_owner', 'role', p_owner->>'role',
				'by', public._classroom_first_name(public._classroom_team_section(p_team_id), v_owner));
		end if;
	end if;
	return null;
end;
$f$;

-- TAKE OR REFRESH A BOX'S LOCK FOR THIS STUDENT. Null when the caller now
-- holds it, or the 'held' refusal naming who does.
create or replace function public._classroom_team_take_lock(
	p_team_id uuid,
	p_item_id uuid,
	p_block_id text,
	p_email text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_holder text;
	v_touched timestamptz;
begin
	insert into public.classroom_team_box_locks as l (team_id, item_id, block_id, holder_email)
	values (p_team_id, p_item_id, p_block_id, p_email)
	on conflict (team_id, item_id, block_id) do update
		set holder_email = excluded.holder_email,
			taken_at = case when l.holder_email = excluded.holder_email then l.taken_at else now() end,
			touched_at = now()
		where l.holder_email = excluded.holder_email
			or l.touched_at < now() - public._classroom_team_lock_ttl()
	returning l.holder_email into v_holder;
	if v_holder is not null then
		return null;
	end if;
	select l.holder_email, l.touched_at into v_holder, v_touched
	from public.classroom_team_box_locks l
	where l.team_id = p_team_id and l.item_id = p_item_id and l.block_id = p_block_id;
	return jsonb_build_object('ok', false, 'reason', 'held',
		'by', public._classroom_first_name(public._classroom_team_section(p_team_id), v_holder),
		'until', v_touched + public._classroom_team_lock_ttl());
end;
$f$;

-- THE TEAM WRITE, called by classroom_save_response once it has resolved the
-- block, refused a too-large value and checked the caller's own close. Granted
-- to nobody; the save is the only way in.
create or replace function public._classroom_save_team_response(
	p_item_id uuid,
	p_email text,
	p_block_id text,
	p_value jsonb,
	p_owner jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_ctx record;
	v_refusal jsonb;
	v_before jsonb;
begin
	select * into v_ctx from public._classroom_team_ctx(p_item_id, p_email);
	if v_ctx.team_id is null then
		return jsonb_build_object('ok', false,
			'reason', case when v_ctx.team_set_id is null then 'not_posted' else 'no_team' end);
	end if;
	v_refusal := public._classroom_team_block_refusal(p_item_id, p_email, v_ctx.team_id, p_owner);
	if v_refusal is not null then
		return v_refusal;
	end if;
	v_refusal := public._classroom_team_take_lock(v_ctx.team_id, p_item_id, p_block_id, p_email);
	if v_refusal is not null then
		return v_refusal;
	end if;

	select a.value into v_before from public.classroom_team_answers a
	where a.team_id = v_ctx.team_id and a.item_id = p_item_id and a.block_id = p_block_id
	for update;
	if v_before is not distinct from p_value then
		return jsonb_build_object('ok', true);
	end if;

	insert into public.classroom_team_answers (team_id, item_id, block_id, value, updated_by)
	values (v_ctx.team_id, p_item_id, p_block_id, p_value, p_email)
	on conflict (team_id, item_id, block_id) do update
		set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

	insert into public.classroom_responses (item_id, student_email, block_id, value, updated_at)
	select p_item_id, m.student_email, p_block_id, p_value, now()
	from public.classroom_team_members m
	where m.team_id = v_ctx.team_id
	on conflict (item_id, student_email, block_id) do update
		set value = excluded.value, updated_at = now();

	insert into public.classroom_team_log (team_id, item_id, block_id, kind, actor_email, before, after)
	values (v_ctx.team_id, p_item_id, p_block_id, 'answer', p_email, v_before, p_value);

	perform public._classroom_live_notice('team-' || v_ctx.team_id::text, 'team-doc');
	return jsonb_build_object('ok', true);
end;
$f$;

revoke all on function public._classroom_team_lock_ttl() from public, anon, authenticated;
revoke all on function public._classroom_live_notice(text, text) from public, anon, authenticated;
revoke all on function public._classroom_first_name(uuid, text) from public, anon, authenticated;
revoke all on function public._classroom_html_team_manifest(uuid) from public, anon, authenticated;
revoke all on function public._classroom_html_team_block(jsonb, text) from public, anon, authenticated;
revoke all on function public._classroom_section_team_set(uuid) from public, anon, authenticated;
revoke all on function public._classroom_team_ctx(uuid, text) from public, anon, authenticated;
revoke all on function public._classroom_team_section(uuid) from public, anon, authenticated;
revoke all on function public._classroom_team_plan_id(uuid) from public, anon, authenticated;
revoke all on function public._classroom_team_role_owner(uuid, text) from public, anon, authenticated;
revoke all on function public._classroom_team_items(uuid) from public, anon, authenticated;
revoke all on function public._classroom_team_roles(uuid) from public, anon, authenticated;
revoke all on function public._classroom_team_block_refusal(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public._classroom_team_take_lock(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public._classroom_save_team_response(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Triggers: a move keeps work with its team, and every change to a draw
--    tells the open pages.
-- ---------------------------------------------------------------------------

-- A STUDENT JOINS OR LEAVES A TEAM. The old team's answers come out of their
-- rows (only rows that still hold exactly the team's value, so nothing else
-- they wrote is touched), the new team's go in, their box locks on the old
-- team are released, and a move is logged on both teams.
create or replace function public._classroom_team_members_resync()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_actor text := coalesce(nullif(public.current_user_email(), ''), 'system');
	v_section uuid;
begin
	if tg_op in ('UPDATE', 'DELETE') and (tg_op = 'DELETE' or old.team_id is distinct from new.team_id) then
		delete from public.classroom_responses r
		using public.classroom_team_answers a
		where a.team_id = old.team_id
			and r.item_id = a.item_id and r.block_id = a.block_id
			and r.student_email = old.student_email
			and r.value = a.value;
		delete from public.classroom_team_box_locks l
		where l.team_id = old.team_id and l.holder_email = old.student_email;
		insert into public.classroom_team_log (team_id, kind, actor_email, before, note)
		values (old.team_id, 'move-out', v_actor, to_jsonb(old.student_email), 'left the team');
		perform public._classroom_live_notice('team-' || old.team_id::text, 'team-doc');
	end if;
	if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or old.team_id is distinct from new.team_id) then
		insert into public.classroom_responses (item_id, student_email, block_id, value, updated_at)
		select a.item_id, new.student_email, a.block_id, a.value, now()
		from public.classroom_team_answers a
		where a.team_id = new.team_id
		on conflict (item_id, student_email, block_id) do update
			set value = excluded.value, updated_at = now();
		-- A draw being saved inserts its members too, and that is not a move:
		-- an insert is logged only into a draw that is already posted (a
		-- latecomer added by hand, decision 44).
		if tg_op = 'UPDATE' or exists (
			select 1 from public.classroom_team_sets s
			where s.id = new.team_set_id and s.posted_at is not null
		) then
			insert into public.classroom_team_log (team_id, kind, actor_email, after, note)
			values (new.team_id, 'move-in', v_actor, to_jsonb(new.student_email), 'joined the team');
		end if;
		perform public._classroom_live_notice('team-' || new.team_id::text, 'team-doc');
	end if;
	select s.section_id into v_section from public.classroom_team_sets s
	where s.id = coalesce(new.team_set_id, old.team_set_id);
	perform public._classroom_live_notice(v_section::text, 'teams');
	return null;
end;
$f$;

revoke all on function public._classroom_team_members_resync() from public, anon, authenticated;

drop trigger if exists classroom_team_members_resync on public.classroom_team_members;
create trigger classroom_team_members_resync
	after insert or update or delete on public.classroom_team_members
	for each row execute function public._classroom_team_members_resync();

-- A draw posted, unposted, retired or renamed, or a team renamed: the section
-- hears 'teams'.
create or replace function public._classroom_team_sets_notice()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $f$
begin
	perform public._classroom_live_notice(coalesce(new.section_id, old.section_id)::text, 'teams');
	return null;
end;
$f$;

create or replace function public._classroom_teams_notice()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_section uuid;
begin
	select s.section_id into v_section from public.classroom_team_sets s
	where s.id = coalesce(new.team_set_id, old.team_set_id);
	perform public._classroom_live_notice(v_section::text, 'teams');
	return null;
end;
$f$;

revoke all on function public._classroom_team_sets_notice() from public, anon, authenticated;
revoke all on function public._classroom_teams_notice() from public, anon, authenticated;

drop trigger if exists classroom_team_sets_notice on public.classroom_team_sets;
create trigger classroom_team_sets_notice
	after insert or update or delete on public.classroom_team_sets
	for each row execute function public._classroom_team_sets_notice();

drop trigger if exists classroom_teams_notice on public.classroom_teams;
create trigger classroom_teams_notice
	after insert or update or delete on public.classroom_teams
	for each row execute function public._classroom_teams_notice();

-- ---------------------------------------------------------------------------
-- 4. The answer write: 0197's classroom_save_response, with ONE branch added
--    just before its insert (marked 0302). Everything above the branch --
--    which engine, the size refusal, the block and type checks and the
--    caller's own close -- runs in 0197's order, so a spec assignment and an
--    individual block answer exactly as before.
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
	v_team_owner jsonb;
begin
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

	-- 0302: A TEAM OR ROLE BLOCK OF A TEAM ASSIGNMENT IS WRITTEN FOR THE WHOLE
	-- TEAM, by its one writer. Null for every other block, which falls through
	-- to 0197's insert unchanged.
	if v_manifest is not null then
		v_team_owner := public._classroom_html_team_block(v_manifest, p_block_id);
		if v_team_owner is not null then
			return public._classroom_save_team_response(p_item_id, v_email, p_block_id, p_value, v_team_owner);
		end if;
	end if;

	insert into public.classroom_responses (item_id, student_email, block_id, value, updated_at)
	values (p_item_id, v_email, p_block_id, p_value, now())
	on conflict (item_id, student_email, block_id) do update
		set value = excluded.value, updated_at = now();

	return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.classroom_save_response(uuid, text, jsonb)
	from public, anon, authenticated;
grant execute on function public.classroom_save_response(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The student's calls: take or release a box, read the team document, set
--    a role's owner.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_team_box_lock(p_item_id uuid, p_block_id text, p_take boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_manifest jsonb := public._classroom_html_team_manifest(p_item_id);
	v_owner jsonb;
	v_ctx record;
	v_refusal jsonb;
	v_released integer;
begin
	v_owner := case when v_manifest is null then null
		else public._classroom_html_team_block(v_manifest, p_block_id) end;
	if v_owner is null then
		raise exception 'That box is not shared with a team.';
	end if;
	select * into v_ctx from public._classroom_team_ctx(p_item_id, v_email);
	if v_ctx.team_id is null then
		return jsonb_build_object('ok', false,
			'reason', case when v_ctx.team_set_id is null then 'not_posted' else 'no_team' end);
	end if;
	if not coalesce(p_take, false) then
		delete from public.classroom_team_box_locks l
		where l.team_id = v_ctx.team_id and l.item_id = p_item_id and l.block_id = p_block_id
			and l.holder_email = v_email;
		get diagnostics v_released = row_count;
		if v_released > 0 then
			perform public._classroom_live_notice('team-' || v_ctx.team_id::text, 'team-doc');
		end if;
		return jsonb_build_object('ok', true, 'released', true);
	end if;
	v_refusal := public._classroom_team_block_refusal(p_item_id, v_email, v_ctx.team_id, v_owner);
	if v_refusal is not null then
		return v_refusal;
	end if;
	v_refusal := public._classroom_team_take_lock(v_ctx.team_id, p_item_id, p_block_id, v_email);
	if v_refusal is not null then
		return v_refusal;
	end if;
	perform public._classroom_live_notice('team-' || v_ctx.team_id::text, 'team-doc');
	return jsonb_build_object('ok', true,
		'until', now() + public._classroom_team_lock_ttl(),
		'value', (select a.value from public.classroom_team_answers a
			where a.team_id = v_ctx.team_id and a.item_id = p_item_id and a.block_id = p_block_id));
end;
$f$;

revoke all on function public.classroom_team_box_lock(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.classroom_team_box_lock(uuid, text, boolean) to authenticated;

-- THE ONE PAYLOAD A TEAM DOCUMENT IS DRAWN FROM, for one team. Private: the
-- student read and the manager read below each decide WHICH team first.
-- `p_me` is the viewer's address, used only to mark what is theirs.
create or replace function public._classroom_team_document(
	p_item_id uuid,
	p_team_id uuid,
	p_me text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	with team as (
		select t.id, t.team_number, s.section_id,
			coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number) as name
		from public.classroom_teams t join public.classroom_team_sets s on s.id = t.team_set_id
		where t.id = p_team_id
	)
	select jsonb_build_object(
		'ok', true,
		'team', (select jsonb_build_object('id', team.id, 'name', team.name, 'number', team.team_number,
			'section_id', team.section_id) from team),
		'members', coalesce((
			select jsonb_agg(jsonb_build_object(
				'name', public._classroom_first_name(team.section_id, m.student_email),
				'me', m.student_email = p_me,
				'active', coalesce(e.active, false)
			) order by (m.student_email = p_me) desc, e.display_name, m.student_email)
			from team
			join public.classroom_team_members m on m.team_id = team.id
			left join public.classroom_enrollments e
				on e.section_id = team.section_id and e.student_email = m.student_email
			where m.student_email = p_me or m.student_email not in (select public._idea_test_emails())
		), '[]'::jsonb),
		'roles', coalesce((
			select jsonb_agg(jsonb_build_object(
				'id', r.role->>'id',
				'title', r.role->>'title',
				'owner', case when o.owner_email is null then null
					else public._classroom_first_name(team.section_id, o.owner_email) end,
				'mine', o.owner_email is not null and o.owner_email = p_me
			) order by r.ord)
			from team,
				jsonb_array_elements(public._classroom_team_roles(p_team_id)) with ordinality as r(role, ord)
			left join lateral (
				select public._classroom_team_role_owner(p_team_id, r.role->>'id') as owner_email
			) o on true
		), '[]'::jsonb),
		'values', coalesce((
			select jsonb_object_agg(a.block_id, jsonb_build_object(
				'value', a.value,
				'by', public._classroom_first_name(team.section_id, a.updated_by),
				'at', a.updated_at
			))
			from team
			join public.classroom_team_answers a on a.team_id = team.id and a.item_id = p_item_id
		), '{}'::jsonb),
		'locks', coalesce((
			select jsonb_object_agg(l.block_id, jsonb_build_object(
				'by', public._classroom_first_name(team.section_id, l.holder_email),
				'mine', l.holder_email = p_me,
				'until', l.touched_at + public._classroom_team_lock_ttl()
			))
			from team
			join public.classroom_team_box_locks l on l.team_id = team.id and l.item_id = p_item_id
			where l.touched_at >= now() - public._classroom_team_lock_ttl()
		), '{}'::jsonb),
		'past_due', coalesce((select i.due_at is not null and now() > i.due_at
			from public.classroom_items i where i.id = p_item_id), false),
		'now', now()
	);
$f$;

revoke all on function public._classroom_team_document(uuid, uuid, text) from public, anon, authenticated;

-- A student's own team's document. When they have none, `team` is null and
-- `reason` says which: 'not_posted' (no draw is showing in their class) or
-- 'no_team' (a draw is showing and they are not on it). `section_id` names the
-- live channel the page listens on for the switch either way.
create or replace function public.classroom_team_document(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_ctx record;
begin
	if public._classroom_html_team_manifest(p_item_id) is null then
		return jsonb_build_object('ok', true, 'team', null, 'reason', 'not_team_assignment');
	end if;
	select * into v_ctx from public._classroom_team_ctx(p_item_id, v_email);
	if v_ctx.team_id is null then
		return jsonb_build_object('ok', true, 'team', null, 'section_id', v_ctx.section_id,
			'reason', case when v_ctx.team_set_id is null then 'not_posted' else 'no_team' end);
	end if;
	return public._classroom_team_document(p_item_id, v_ctx.team_id, v_email);
end;
$f$;

revoke all on function public.classroom_team_document(uuid) from public, anon, authenticated;
grant execute on function public.classroom_team_document(uuid) to authenticated;

-- SET (OR CLEAR) WHO OWNS A ROLE, from the team plan. Any member of the team,
-- or a manager of its section. The owner must be a member of the team, and
-- the role must be one the team's assignments declare.
create or replace function public.classroom_team_set_role(
	p_team_id uuid,
	p_role_id text,
	p_owner_email text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_me text := public.current_user_email();
	v_section uuid := public._classroom_team_section(p_team_id);
	v_owner text := nullif(lower(btrim(coalesce(p_owner_email, ''))), '');
	v_plan uuid;
	v_before text;
begin
	if (select auth.uid()) is null or coalesce(v_me, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	if v_section is null or not (
		public._classroom_team_member(p_team_id, v_me) or public.classroom_manages_section(v_section)
	) then
		raise exception 'That team does not exist.';
	end if;
	if not exists (
		select 1 from jsonb_array_elements(public._classroom_team_roles(p_team_id)) r(role)
		where r.role->>'id' = p_role_id
	) then
		return jsonb_build_object('ok', false, 'reason', 'unknown_role');
	end if;
	if v_owner is not null and not public._classroom_team_member(p_team_id, v_owner) then
		return jsonb_build_object('ok', false, 'reason', 'not_member');
	end if;
	v_plan := public._classroom_team_plan_id(p_team_id);
	select r.owner_email into v_before from public.classroom_team_plan_roles r
	where r.plan_id = v_plan and r.role_id = p_role_id;
	if v_before is not distinct from v_owner then
		return jsonb_build_object('ok', true);
	end if;
	if v_owner is null then
		delete from public.classroom_team_plan_roles r where r.plan_id = v_plan and r.role_id = p_role_id;
	else
		insert into public.classroom_team_plan_roles (plan_id, role_id, owner_email, set_by)
		values (v_plan, p_role_id, v_owner, v_me)
		on conflict (plan_id, role_id) do update
			set owner_email = excluded.owner_email, set_by = excluded.set_by, set_at = now();
	end if;
	insert into public.classroom_team_log (team_id, kind, actor_email, before, after, note)
	values (p_team_id, 'role', v_me, to_jsonb(v_before), to_jsonb(v_owner), p_role_id);
	perform public._classroom_live_notice('team-' || p_team_id::text, 'team-doc');
	return jsonb_build_object('ok', true);
end;
$f$;

revoke all on function public.classroom_team_set_role(uuid, text, text) from public, anon, authenticated;
grant execute on function public.classroom_team_set_role(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The instructor's calls: which teams an item has, one team's document,
--    and one box's whole history.
-- ---------------------------------------------------------------------------

-- Every team of every section the caller manages that this team item is
-- posted to (an admin manages every section), from each section's current
-- posted draw. Names only, never an address.
create or replace function public.classroom_item_teams(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_out jsonb := '[]'::jsonb;
	v_section record;
	v_set uuid;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if public._classroom_html_team_manifest(p_item_id) is null then
		return jsonb_build_object('ok', true, 'team_assignment', false, 'sections', '[]'::jsonb);
	end if;
	for v_section in
		select s.id, s.label
		from public.classroom_postings pg
		join public.classroom_sections s on s.id = pg.section_id
		where pg.item_id = p_item_id and public.classroom_manages_section(s.id)
		order by s.label
	loop
		v_set := public._classroom_section_team_set(v_section.id);
		v_out := v_out || jsonb_build_array(jsonb_build_object(
			'section_id', v_section.id,
			'label', v_section.label,
			'team_set_id', v_set,
			'set_label', (select ts.label from public.classroom_team_sets ts where ts.id = v_set),
			'teams', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', t.id,
					'number', t.team_number,
					'name', coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number),
					'members', (
						select coalesce(jsonb_agg(public._classroom_first_name(v_section.id, m.student_email)
							order by m.student_email), '[]'::jsonb)
						from public.classroom_team_members m where m.team_id = t.id
					)
				) order by t.team_number)
				from public.classroom_teams t where t.team_set_id = v_set
			), '[]'::jsonb)
		));
	end loop;
	return jsonb_build_object('ok', true, 'team_assignment', true, 'sections', v_out);
end;
$f$;

revoke all on function public.classroom_item_teams(uuid) from public, anon, authenticated;
grant execute on function public.classroom_item_teams(uuid) to authenticated;

-- One team's document, for a manager of the team's section.
create or replace function public.classroom_team_document_for(p_item_id uuid, p_team_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_section uuid := public._classroom_team_section(p_team_id);
begin
	if v_section is null
		or not public.classroom_manages_section(v_section)
		or not exists (select 1 from public.classroom_postings pg
			where pg.item_id = p_item_id and pg.section_id = v_section) then
		raise exception 'That team does not exist.';
	end if;
	if public._classroom_html_team_manifest(p_item_id) is null then
		return jsonb_build_object('ok', true, 'team', null, 'reason', 'not_team_assignment');
	end if;
	return public._classroom_team_document(p_item_id, p_team_id, '');
end;
$f$;

revoke all on function public.classroom_team_document_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.classroom_team_document_for(uuid, uuid) to authenticated;

-- A box's whole history, oldest first, for a manager of the team's section.
create or replace function public.classroom_team_box_history(p_item_id uuid, p_team_id uuid, p_block_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_section uuid := public._classroom_team_section(p_team_id);
begin
	if v_section is null or not public.classroom_manages_section(v_section) then
		raise exception 'That team does not exist.';
	end if;
	return jsonb_build_object('ok', true, 'entries', coalesce((
		select jsonb_agg(jsonb_build_object(
			'at', l.at,
			'by', coalesce(
				(select e.display_name from public.classroom_enrollments e
				 where e.section_id = v_section and e.student_email = l.actor_email),
				split_part(l.actor_email, '@', 1)),
			'before', l.before,
			'after', l.after
		) order by l.at, l.id)
		from public.classroom_team_log l
		where l.team_id = p_team_id and l.item_id = p_item_id and l.block_id = p_block_id
			and l.kind = 'answer'
	), '[]'::jsonb));
end;
$f$;

revoke all on function public.classroom_team_box_history(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.classroom_team_box_history(uuid, uuid, text) to authenticated;

do $report$
begin
	raise notice '0302: % team draws (% posted and showing), % HTML assignments with a team key.',
		(select count(*) from public.classroom_team_sets),
		(select count(*) from public.classroom_team_sets s where public._classroom_team_set_visible(s.id)),
		(select count(*) from public.classroom_html_assignments h
		 where jsonb_typeof(h.manifest->'team') = 'object');
end
$report$;
