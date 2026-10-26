-- 0312_classroom_presentations.sql
--
-- PRESENTATION CHECK-OFF FROM THE PHONE (ledger 0438, feedback 68d4780e, which
-- replaces fc83019d). Mr. Pina's words, 2026-10-26: "take notes and check
-- students off for presentations on my phone while they are giving the
-- presentations."
--
-- A QUEUE PER CLASS: who presents in what order, who is up, who is done. An
-- entry is one student or one team of the class's posted draw (0223, 0302),
-- because Unit 4 teams present together. Each entry is marked Presented,
-- Absent or Redo, and Start puts it up. The queue may name the assignment the
-- presentation is for; then the phone's notes go on that assignment as the
-- instructor's notes (progressive feedback, 0238, through its own
-- classroom_feedback_post) and its rubric is scored through the grading
-- functions that already exist. Neither is a new write path, so neither is
-- here.
--
-- WHAT IS NOT HERE, ON PURPOSE: anything the projector reads. The queue adds no
-- channel to the projector view (the queue's own rule); the wall and the live
-- tab are untouched.
--
-- THE TABLES CARRY NO POLICY AND NO CLIENT GRANT. Every read and write is a
-- definer function below that asks classroom_manages_section about the queue's
-- own class first, so a student, a visitor and a teacher of another class all
-- read "That presentation list does not exist." identically.
--
-- DEPLOY ORDERING: the site's /present page and the connector entries call
-- these; until this file is applied, the page says the list arrives with the
-- next update and the connector answers "could not find the function".
--
-- WHAT UNDOES IT, a person's paste:
--   drop function if exists public.classroom_presentation_start(uuid, uuid, text, text, bigint);
--   drop function if exists public.classroom_presentation_queue(uuid);
--   drop function if exists public.classroom_presentation_mark(uuid, text);
--   drop function if exists public.classroom_presentation_move(uuid, integer);
--   drop function if exists public.classroom_presentation_close(uuid);
--   drop function if exists public.classroom_presentation_reopen(uuid);
--   drop function if exists public._classroom_presentation_section(uuid);
--   drop table if exists public.classroom_presentation_entries;
--   drop table if exists public.classroom_presentation_queues;
-- (A table drop is a paste by a person, never this file's.)

do $pre$
begin
	if to_regprocedure('public._classroom_section_team_set(uuid)') is null then
		raise exception '0312 cannot apply: _classroom_section_team_set does not exist. Apply 0302 first.';
	end if;
	if to_regprocedure('public._idea_test_emails()') is null then
		raise exception '0312 cannot apply: _idea_test_emails does not exist. Apply 0288 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. The tables
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_presentation_queues (
	id uuid primary key default gen_random_uuid(),
	section_id uuid not null references public.classroom_sections (id) on delete cascade,
	-- The assignment the presentations are for, when there is one: notes and
	-- rubric scores go on it. Null is a plain check-off list.
	item_id uuid references public.classroom_items (id) on delete set null,
	title text not null check (char_length(btrim(title)) between 1 and 120),
	created_by text not null,
	created_at timestamptz not null default now(),
	-- A closed list is kept, not deleted: who presented is a record.
	closed_at timestamptz
);
create index if not exists classroom_presentation_queues_section_idx
	on public.classroom_presentation_queues (section_id, created_at desc);

create table if not exists public.classroom_presentation_entries (
	id uuid primary key default gen_random_uuid(),
	queue_id uuid not null references public.classroom_presentation_queues (id) on delete cascade,
	position integer not null check (position >= 1),
	-- Exactly one of a student and a team.
	student_email text check (student_email is null or (student_email = lower(btrim(student_email)) and student_email like '%@%')),
	team_id uuid references public.classroom_teams (id) on delete cascade,
	status text not null default 'waiting' check (status in ('waiting', 'up', 'presented', 'absent', 'redo')),
	marked_at timestamptz,
	marked_by text,
	constraint classroom_presentation_entries_one_who check ((student_email is null) <> (team_id is null))
);
create index if not exists classroom_presentation_entries_queue_idx
	on public.classroom_presentation_entries (queue_id, position);

alter table public.classroom_presentation_queues enable row level security;
alter table public.classroom_presentation_entries enable row level security;
revoke all on table public.classroom_presentation_queues from public, anon, authenticated;
revoke all on table public.classroom_presentation_entries from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The functions
-- ---------------------------------------------------------------------------

-- The class a queue belongs to, when the caller manages it; null otherwise,
-- so "not yours" and "not there" are one answer.
create or replace function public._classroom_presentation_section(p_queue_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $f$
	select q.section_id from public.classroom_presentation_queues q
	where q.id = p_queue_id and public.classroom_manages_section(q.section_id);
$f$;

-- START A LIST for a class: every active student in roster order (by
-- display name), a random order from a seed, or the class's posted teams in
-- team order. Test accounts and the class's own teachers are left out, as
-- the roster leaves them out. Any open list in the class is closed first, so
-- a class has one list at a time.
create or replace function public.classroom_presentation_start(
	p_section_id uuid,
	p_item_id uuid,
	p_title text,
	p_order text,
	p_seed bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
	v_queue uuid;
	v_order text := lower(coalesce(nullif(btrim(p_order), ''), 'roster'));
	v_set uuid;
	v_title text := nullif(btrim(coalesce(p_title, '')), '');
	v_n integer;
	v_closed integer;
begin
	if p_section_id is null or not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;
	if v_order not in ('roster', 'random', 'teams') then
		raise exception 'The order is roster, random or teams.';
	end if;
	if p_item_id is not null and not exists (
		select 1 from public.classroom_postings pg where pg.item_id = p_item_id and pg.section_id = p_section_id
	) then
		raise exception 'That assignment is not posted in this class.';
	end if;
	if v_title is null then
		v_title := coalesce((select nullif(btrim(i.title), '') from public.classroom_items i where i.id = p_item_id), 'Presentations');
	end if;
	if char_length(v_title) > 120 then
		v_title := left(v_title, 120);
	end if;
	if v_order = 'teams' then
		v_set := public._classroom_section_team_set(p_section_id);
		if v_set is null then
			return jsonb_build_object('ok', false, 'reason', 'no_teams');
		end if;
	end if;

	update public.classroom_presentation_queues set closed_at = now()
	where section_id = p_section_id and closed_at is null;
	get diagnostics v_closed = row_count;

	insert into public.classroom_presentation_queues (section_id, item_id, title, created_by)
	values (p_section_id, p_item_id, v_title, public.current_user_email())
	returning id into v_queue;

	if v_order = 'teams' then
		insert into public.classroom_presentation_entries (queue_id, position, team_id)
		select v_queue, row_number() over (order by t.team_number, t.id), t.id
		from public.classroom_teams t
		where t.team_set_id = v_set
			and exists (select 1 from public.classroom_team_members m where m.team_id = t.id);
	else
		perform setseed(((abs(coalesce(p_seed, (extract(epoch from clock_timestamp()) * 1000)::bigint)) % 2000000) / 2000000.0)::double precision);
		insert into public.classroom_presentation_entries (queue_id, position, student_email)
		select v_queue, row_number() over (order by
				case when v_order = 'random' then random() end,
				lower(e.display_name), e.student_email),
			e.student_email
		from public.classroom_enrollments e
		where e.section_id = p_section_id and e.active
			and e.student_email not in (select public._idea_test_emails())
			and not public._classroom_manages_section_email(p_section_id, e.student_email);
	end if;
	get diagnostics v_n = row_count;
	return jsonb_build_object('ok', true, 'queue_id', v_queue, 'entries', v_n, 'closed', v_closed, 'order', v_order);
end;
$f$;

-- THE CLASS'S OPEN LIST: every entry in order with its names, its status, and
-- which entry is up (the one marked up, else the first still waiting).
-- `{ok: true, queue: null}` when the class has no open list.
create or replace function public.classroom_presentation_queue(p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_queue public.classroom_presentation_queues%rowtype;
	v_up uuid;
begin
	if p_section_id is null or not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;
	select * into v_queue from public.classroom_presentation_queues q
	where q.section_id = p_section_id and q.closed_at is null
	order by q.created_at desc limit 1;
	if v_queue.id is null then
		return jsonb_build_object('ok', true, 'queue', null);
	end if;
	select coalesce(
		(select x.id from public.classroom_presentation_entries x where x.queue_id = v_queue.id and x.status = 'up' order by x.position limit 1),
		(select x.id from public.classroom_presentation_entries x where x.queue_id = v_queue.id and x.status in ('waiting', 'redo') order by (x.status = 'redo'), x.position limit 1)
	) into v_up;
	return jsonb_build_object(
		'ok', true,
		'queue', jsonb_build_object(
			'id', v_queue.id,
			'title', v_queue.title,
			'item_id', v_queue.item_id,
			'item_title', (select i.title from public.classroom_items i where i.id = v_queue.item_id),
			'created_at', v_queue.created_at,
			'up', v_up,
			'entries', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', x.id,
					'position', x.position,
					'status', x.status,
					'marked_at', x.marked_at,
					'kind', case when x.team_id is null then 'student' else 'team' end,
					'team_id', x.team_id,
					'name', case when x.team_id is null
						then coalesce((select e.display_name from public.classroom_enrollments e
							where e.section_id = v_queue.section_id and e.student_email = x.student_email), split_part(x.student_email, '@', 1))
						else (select coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number) from public.classroom_teams t where t.id = x.team_id) end,
					'members', case when x.team_id is null
						then jsonb_build_array(jsonb_build_object('email', x.student_email,
							'name', coalesce((select e.display_name from public.classroom_enrollments e
								where e.section_id = v_queue.section_id and e.student_email = x.student_email), split_part(x.student_email, '@', 1))))
						else coalesce((select jsonb_agg(jsonb_build_object('email', m.student_email,
								'name', coalesce((select e.display_name from public.classroom_enrollments e
									where e.section_id = v_queue.section_id and e.student_email = m.student_email), split_part(m.student_email, '@', 1)))
								order by m.student_email)
							from public.classroom_team_members m where m.team_id = x.team_id), '[]'::jsonb) end
				) order by x.position)
				from public.classroom_presentation_entries x where x.queue_id = v_queue.id
			), '[]'::jsonb)
		)
	);
end;
$f$;

-- MARK ONE ENTRY: up (Start; any other entry up goes back to waiting),
-- presented, absent, redo, or waiting (a mark taken back). Answers the status
-- it had, so the connector's undo puts it back.
create or replace function public.classroom_presentation_mark(p_entry_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
	v_entry public.classroom_presentation_entries%rowtype;
	v_status text := lower(btrim(coalesce(p_status, '')));
begin
	select * into v_entry from public.classroom_presentation_entries x where x.id = p_entry_id;
	if v_entry.id is null or public._classroom_presentation_section(v_entry.queue_id) is null then
		raise exception 'That presentation list does not exist.';
	end if;
	if v_status not in ('waiting', 'up', 'presented', 'absent', 'redo') then
		raise exception 'Mark it presented, absent, redo, up or waiting.';
	end if;
	if v_status = 'up' then
		update public.classroom_presentation_entries set status = 'waiting'
		where queue_id = v_entry.queue_id and status = 'up' and id <> p_entry_id;
	end if;
	update public.classroom_presentation_entries
	set status = v_status,
		marked_at = case when v_status in ('presented', 'absent', 'redo') then now() else null end,
		marked_by = case when v_status in ('presented', 'absent', 'redo') then public.current_user_email() else null end
	where id = p_entry_id;
	return jsonb_build_object('ok', true, 'entry_id', p_entry_id, 'status', v_status, 'previous', v_entry.status);
end;
$f$;

-- MOVE ONE ENTRY to a new place in the order (1 is first); the rest close up.
-- Answers the place it had, so undo moves it back.
create or replace function public.classroom_presentation_move(p_entry_id uuid, p_position integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
	v_entry public.classroom_presentation_entries%rowtype;
	v_count integer;
	v_to integer;
begin
	select * into v_entry from public.classroom_presentation_entries x where x.id = p_entry_id;
	if v_entry.id is null or public._classroom_presentation_section(v_entry.queue_id) is null then
		raise exception 'That presentation list does not exist.';
	end if;
	select count(*) into v_count from public.classroom_presentation_entries x where x.queue_id = v_entry.queue_id;
	v_to := greatest(1, least(coalesce(p_position, v_entry.position), v_count));
	if v_to = v_entry.position then
		return jsonb_build_object('ok', true, 'entry_id', p_entry_id, 'position', v_to, 'previous', v_entry.position);
	end if;
	with ordered as (
		select x.id, row_number() over (order by
			case when x.id = p_entry_id then v_to * 2 - (case when v_to < v_entry.position then 1 else -1 end) else x.position * 2 end) as n
		from public.classroom_presentation_entries x where x.queue_id = v_entry.queue_id
	)
	update public.classroom_presentation_entries x set position = o.n
	from ordered o where o.id = x.id and x.position <> o.n;
	return jsonb_build_object('ok', true, 'entry_id', p_entry_id, 'position', v_to, 'previous', v_entry.position);
end;
$f$;

-- CLOSE THE LIST (kept as a record) and the reverse, for the connector's undo.
create or replace function public.classroom_presentation_close(p_queue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
begin
	if public._classroom_presentation_section(p_queue_id) is null then
		raise exception 'That presentation list does not exist.';
	end if;
	update public.classroom_presentation_queues set closed_at = coalesce(closed_at, now()) where id = p_queue_id;
	return jsonb_build_object('ok', true, 'queue_id', p_queue_id);
end;
$f$;

create or replace function public.classroom_presentation_reopen(p_queue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
	v_section uuid := public._classroom_presentation_section(p_queue_id);
begin
	if v_section is null then
		raise exception 'That presentation list does not exist.';
	end if;
	-- One open list per class: the reopened one replaces any newer open one.
	update public.classroom_presentation_queues set closed_at = now()
	where section_id = v_section and closed_at is null and id <> p_queue_id;
	update public.classroom_presentation_queues set closed_at = null where id = p_queue_id;
	return jsonb_build_object('ok', true, 'queue_id', p_queue_id);
end;
$f$;

revoke all on function public._classroom_presentation_section(uuid) from public, anon, authenticated;
revoke all on function public.classroom_presentation_start(uuid, uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.classroom_presentation_start(uuid, uuid, text, text, bigint) to authenticated;
revoke all on function public.classroom_presentation_queue(uuid) from public, anon, authenticated;
grant execute on function public.classroom_presentation_queue(uuid) to authenticated;
revoke all on function public.classroom_presentation_mark(uuid, text) from public, anon, authenticated;
grant execute on function public.classroom_presentation_mark(uuid, text) to authenticated;
revoke all on function public.classroom_presentation_move(uuid, integer) from public, anon, authenticated;
grant execute on function public.classroom_presentation_move(uuid, integer) to authenticated;
revoke all on function public.classroom_presentation_close(uuid) from public, anon, authenticated;
grant execute on function public.classroom_presentation_close(uuid) to authenticated;
revoke all on function public.classroom_presentation_reopen(uuid) from public, anon, authenticated;
grant execute on function public.classroom_presentation_reopen(uuid) to authenticated;

do $check$
begin
	if has_table_privilege('authenticated', 'public.classroom_presentation_entries', 'select')
		or has_table_privilege('anon', 'public.classroom_presentation_queues', 'select') then
		raise exception '0312: a presentation table is readable by a client role.';
	end if;
	if has_function_privilege('anon', 'public.classroom_presentation_queue(uuid)', 'execute')
		or has_function_privilege('anon', 'public.classroom_presentation_mark(uuid, text)', 'execute')
		or has_function_privilege('authenticated', 'public._classroom_presentation_section(uuid)', 'execute') then
		raise exception '0312: a presentation function is executable by a role that must not hold it.';
	end if;
	raise notice '0312: % presentation lists.', (select count(*) from public.classroom_presentation_queues);
end
$check$;
