-- 0308_idea_calendar.sql
--
-- THE IDEA CALENDAR (ledger 0439, report 0ccf7bff, with d0041188 folded in).
--
-- One calendar per signed-in person, built from layers that are each on by
-- default and that the viewer can switch off:
--   classes    every class the viewer is in or teaches: a post on the day it
--              opens, an assignment on its due date
--   pacing     an assignment's day-by-day plan (its manifest's `pacing`, spec
--              section 17, with an admin's moves stored here)
--   team       the viewer's own team's tasks and the class's sign-offs
--   no_school  the site's no-school days (0303's table, unchanged)
--   idea       IDEA program events, kept here and edited by a site admin
--   robotics   FRC Team 5669 events a site admin adds here (the Techmen app's
--              own feed is read by the server, not by this file)
-- The Bosco Tech school calendar is the seventh layer; it is read by the
-- server from the school's iCalendar feed and never stored.
--
-- THE ONE VISIBILITY RULE IS `_calendar_feed_email`, keyed on an email so the
-- personal subscription link (no session) and a staff read of one viewer can
-- ask it; every caller-facing function is a wrapper over it, the 0138 shape:
--   * a class is the viewer's when they are ACTIVELY ENROLLED in it or are its
--     TEACHER OF RECORD. Admin rights add no classes: an admin manages every
--     section, and a calendar of the whole school is not his calendar.
--   * a post is shown to a student only once it is live
--     (`_classroom_item_live`, the read rule every class surface uses); its
--     teacher also sees it on its scheduled day, marked scheduled. A draft is
--     shown to nobody.
--   * team tasks are the viewer's own team's, in that class's posted draw
--     (`_classroom_section_team_set`), and nobody else's. A teammate is named by
--     first name, as the team plan names them; no address leaves this file.
--
-- PACING. `_classroom_item_pacing` is the one resolver: the manifest's steps
-- read tolerantly (a step it cannot use is dropped, as `manifestPacing` in
-- `src/lib/classroom/html-assignment/pacing.ts` drops it), a `day` step turned
-- into the Nth school day counted from the day the post opens (weekends and
-- no-school days skipped), then an admin's stored moves laid over by step id.
--
-- PREFERENCES are the viewer's own `profiles.preferences.calendar` (written
-- through the site's one preferences path, read here only for the
-- subscription link, which has no page to filter on).
--
-- PRIVACY OF THE SUBSCRIPTION LINK. `calendar_feed_tokens` holds one secret
-- per person, made, replaced and deleted only by its owner; no client role
-- reads the table. `calendar_feed_by_token` is the one anonymous entry and
-- answers the owner's calendar or nothing.
--
-- DEPLOY ORDERING: none. Every function is new; nothing deployed calls one.
--
-- WHAT UNDOES IT, a person's paste:
--   drop function if exists public.calendar_feed(date, date),
--     public.calendar_feed_for(text, date, date),
--     public.calendar_feed_by_token(text, date, date),
--     public.calendar_feed_link(boolean), public.calendar_feed_link_revoke(),
--     public.calendar_event_save(uuid, text, text, date, date, time, time, text, text),
--     public.calendar_event_move(uuid, date, date), public.calendar_event_remove(uuid),
--     public.calendar_events_list(date, date, text),
--     public.classroom_item_pacing(uuid),
--     public.classroom_item_pacing_set(uuid, text, text, date, text[], boolean),
--     public.classroom_item_pacing_clear(uuid, text),
--     public._calendar_feed_email(text, date, date), public._calendar_prefs(text),
--     public._classroom_item_pacing(uuid), public._calendar_school_day_n(date, integer),
--     public._calendar_try_date(text);
--   drop table if exists public.classroom_item_pacing, public.calendar_feed_tokens,
--     public.calendar_events;

-- ---------------------------------------------------------------------------
-- 1. Tables. The first object is new, so the apply probe can see this landed.
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_events (
	id uuid primary key default gen_random_uuid(),
	layer text not null check (layer in ('idea', 'robotics')),
	title text not null check (char_length(btrim(title)) between 1 and 120),
	starts_on date not null,
	-- The last day of a multi-day event, inclusive. Null is a one-day event.
	ends_on date check (ends_on is null or ends_on >= starts_on),
	-- Wall-clock times in Los Angeles. Both null is an all-day event.
	start_time time,
	end_time time check (end_time is null or start_time is not null),
	location text check (location is null or char_length(btrim(location)) between 1 and 120),
	notes text check (notes is null or char_length(notes) <= 500),
	created_by text not null,
	created_at timestamptz not null default now(),
	updated_by text,
	updated_at timestamptz,
	removed_by text,
	removed_at timestamptz
);
create index if not exists calendar_events_day_idx on public.calendar_events (starts_on);

create table if not exists public.calendar_feed_tokens (
	email text primary key check (email = lower(btrim(email)) and email like '%@%'),
	token text not null unique check (token ~ '^[0-9a-f]{64}'),
	created_at timestamptz not null default now()
);

-- An admin's change to one pacing step of one post, keyed by the step id. Wins
-- over the manifest; a row with no manifest step behind it is a step of its own.
create table if not exists public.classroom_item_pacing (
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	step_id text not null check (step_id ~ '^[A-Za-z0-9_-]{1,40}'),
	title text check (title is null or char_length(btrim(title)) between 1 and 120),
	day date,
	modules text[],
	removed boolean not null default false,
	set_by text not null,
	set_at timestamptz not null default now(),
	primary key (item_id, step_id)
);

alter table public.calendar_events enable row level security;
alter table public.calendar_feed_tokens enable row level security;
alter table public.classroom_item_pacing enable row level security;
revoke all on table public.calendar_events from public, anon, authenticated;
revoke all on table public.calendar_feed_tokens from public, anon, authenticated;
revoke all on table public.classroom_item_pacing from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Private helpers.
-- ---------------------------------------------------------------------------

-- A real calendar day written YYYY-MM-DD, or null.
create or replace function public._calendar_try_date(p_text text)
returns date
language plpgsql
immutable
set search_path = ''
as $f$
begin
	if p_text is null or p_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' or char_length(p_text) <> 10 then
		return null;
	end if;
	return p_text::date;
exception when others then
	return null;
end;
$f$;

-- THE NTH SCHOOL DAY on or after a day: 1 is the first weekday on or after it
-- that is not a no-school day. Null past 400 days.
create or replace function public._calendar_school_day_n(p_from date, p_n integer)
returns date
language sql
stable
security definer
set search_path = ''
as $f$
	select d::date
	from generate_series(p_from, p_from + 400, interval '1 day') d
	where extract(isodow from d) < 6
		and not exists (select 1 from public.classroom_no_school_days n where n.day = d::date)
	order by d
	offset greatest(coalesce(p_n, 1), 1) - 1
	limit 1;
$f$;

-- THE ONE PACING RESOLVER for a post: its manifest steps, then an admin's moves.
create or replace function public._classroom_item_pacing(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	with item as (
		select i.id,
			(coalesce(i.publish_at, i.first_published_at, i.created_at) at time zone 'America/Los_Angeles')::date as opens_on,
			public._classroom_html_manifest(i.id) as manifest
		from public.classroom_items i where i.id = p_item_id
	), declared as (
		select coalesce(array_agg(m->>'id'), '{}') as ids
		from item, jsonb_array_elements(
			case when jsonb_typeof(item.manifest->'modules') = 'array' then item.manifest->'modules' else '[]'::jsonb end) m
		where jsonb_typeof(m) = 'object'
	), raw as (
		select s.step, s.ord
		from item, jsonb_array_elements(
			case when jsonb_typeof(item.manifest->'pacing') = 'array' then item.manifest->'pacing' else '[]'::jsonb end
		) with ordinality as s(step, ord)
	), readable as (
		select r.ord, r.step->>'id' as id,
			left(btrim(r.step->>'title'), 120) as title,
			case when jsonb_typeof(r.step->'day') = 'number' then (r.step->>'day')::numeric end as day_n,
			public._calendar_try_date(case when jsonb_typeof(r.step->'date') = 'string' then r.step->>'date' end) as fixed,
			r.step
		from raw r
		where jsonb_typeof(r.step) = 'object'
			and coalesce(r.step->>'id', '') ~ '^[A-Za-z0-9_-]{1,40}'
			and char_length(r.step->>'id') <= 40
			and jsonb_typeof(r.step->'title') = 'string'
			and btrim(r.step->>'title') <> ''
			and (jsonb_typeof(r.step->'modules') is null or jsonb_typeof(r.step->'modules') in ('array', 'null'))
	), valid as (
		-- Exactly one of day (a whole number 1 to 60) or date (a real day);
		-- an explicit null counts as absent, as it does in the TypeScript reader.
		select * from readable
		where (coalesce(jsonb_typeof(step->'day'), 'null') = 'null') <> (coalesce(jsonb_typeof(step->'date'), 'null') = 'null')
			and (coalesce(jsonb_typeof(step->'day'), 'null') = 'null'
				or (day_n is not null and day_n = floor(day_n) and day_n between 1 and 60))
			and (coalesce(jsonb_typeof(step->'date'), 'null') = 'null' or fixed is not null)
	), firsts as (
		-- A repeated id: the first one wins, as in the reader. At most 40.
		select distinct on (id) * from valid order by id, ord
	), manifest_steps as (
		select f.id, f.title, f.ord,
			coalesce(f.fixed, public._calendar_school_day_n((select opens_on from item), f.day_n::integer)) as day,
			coalesce((
				select jsonb_agg(m order by o)
				from (
					select distinct on (x.m) x.m, x.o
					from jsonb_array_elements_text(
						case when jsonb_typeof(f.step->'modules') = 'array' then f.step->'modules' else '[]'::jsonb end
					) with ordinality as x(m, o)
					where x.m = any ((select d2.ids from declared d2)::text[])
					order by x.m, x.o
				) d
			), '[]'::jsonb) as modules
		from firsts f
		where f.id in (select id from firsts order by ord limit 40)
	), merged as (
		select coalesce(o.step_id, s.id) as id,
			coalesce(o.title, s.title) as title,
			coalesce(o.day, s.day) as day,
			coalesce(to_jsonb(o.modules), s.modules, '[]'::jsonb) as modules,
			case when s.id is null then 'set' when o.step_id is null then 'manifest' else 'moved' end as source,
			coalesce(s.ord, 1000) as ord,
			coalesce(o.removed, false) as removed
		from manifest_steps s
		full join (select * from public.classroom_item_pacing where item_id = p_item_id) o on o.step_id = s.id
	)
	select coalesce(jsonb_agg(jsonb_build_object(
		'id', id, 'title', title, 'day', day, 'modules', modules, 'source', source
	) order by day, ord, id), '[]'::jsonb)
	from merged
	where not removed and day is not null and title is not null;
$f$;

-- The viewer's own calendar choices, as stored by the site's preferences path.
create or replace function public._calendar_prefs(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce((
		select case when jsonb_typeof(p.preferences->'calendar') = 'object' then p.preferences->'calendar' end
		from public.profiles p where lower(p.email) = lower(btrim(p_email))
		order by p.created_at limit 1
	), '{}'::jsonb);
$f$;

-- THE ONE VISIBILITY RULE: everything one person's calendar holds between two
-- days, every layer, as events. The callers below decide who may ask.
create or replace function public._calendar_feed_email(p_email text, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_from date := coalesce(p_from, public._classroom_school_today() - 7);
	v_to date := coalesce(p_to, public._classroom_school_today() + 42);
begin
	if v_email = '' or v_email not like '%@%' then
		return jsonb_build_object('ok', false, 'reason', 'no_viewer');
	end if;
	if v_to < v_from then
		v_to := v_from;
	end if;
	if v_to - v_from > 400 then
		v_to := v_from + 400;
	end if;
	return (
		with sections as (
			select s.id, s.label, s.block, c.code as course, c.title as course_title,
				(s.teacher_email = v_email) as teaches
			from public.classroom_sections s
			join public.classroom_courses c on c.id = s.course_id
			where coalesce(s.active, true)
				and (s.teacher_email = v_email or exists (
					select 1 from public.classroom_enrollments e
					where e.section_id = s.id and e.student_email = v_email and e.active))
		), items as (
			select i.id, i.kind, i.title, i.due_at, i.created_at,
				(coalesce(i.publish_at, i.first_published_at, i.created_at) at time zone 'America/Los_Angeles')::date as opens_on,
				not public._classroom_item_live(i.published, i.publish_at) as scheduled,
				array_agg(distinct pg.section_id) as section_ids
			from public.classroom_postings pg
			join sections s on s.id = pg.section_id
			join public.classroom_items i on i.id = pg.item_id
			where i.kind in ('assignment', 'material')
				and (public._classroom_item_live(i.published, i.publish_at)
					or (s.teaches and coalesce(i.published, false)))
			group by i.id
		), my_teams as (
			select s.id as section_id, m.team_id
			from sections s
			join public.classroom_team_members m
				on m.team_set_id = public._classroom_section_team_set(s.id) and m.student_email = v_email
		), events as (
			-- classes: the day a post opens
			select jsonb_build_object('id', 'open:' || it.id, 'layer', 'classes', 'kind', 'open',
				'title', it.title, 'day', it.opens_on, 'item_id', it.id, 'item_kind', it.kind,
				'section_ids', to_jsonb(it.section_ids), 'scheduled', it.scheduled) as e
			from items it where it.opens_on between v_from and v_to
			union all
			-- classes: an assignment's due date
			select jsonb_build_object('id', 'due:' || it.id, 'layer', 'classes', 'kind', 'due',
				'title', it.title, 'day', (it.due_at at time zone 'America/Los_Angeles')::date, 'at', it.due_at,
				'item_id', it.id, 'section_ids', to_jsonb(it.section_ids), 'scheduled', it.scheduled)
			from items it
			where it.kind = 'assignment' and it.due_at is not null
				and (it.due_at at time zone 'America/Los_Angeles')::date between v_from and v_to
			union all
			-- pacing: each step of each post's plan
			select jsonb_build_object('id', 'pace:' || it.id || ':' || (p->>'id'), 'layer', 'pacing', 'kind', 'pacing',
				'title', p->>'title', 'day', p->>'day', 'item_id', it.id, 'item_title', it.title,
				'step_id', p->>'id', 'modules', p->'modules', 'section_ids', to_jsonb(it.section_ids),
				'scheduled', it.scheduled)
			from items it, jsonb_array_elements(public._classroom_item_pacing(it.id)) p
			where it.kind = 'assignment' and (p->>'day')::date between v_from and v_to
			union all
			-- team: a sign-off, once per class and key, from the stored checklist
			-- or, before any team has opened its plan, from the manifest
			select distinct on (cp.section_id, cp.key) jsonb_build_object(
				'id', 'signoff:' || cp.section_id || ':' || cp.key, 'layer', 'team', 'kind', 'signoff',
				'title', cp.title, 'day', cp.day, 'gate', cp.gate, 'item_id', cp.item_id,
				'section_ids', jsonb_build_array(cp.section_id),
				'state', (select public._classroom_signoff_state(mt.team_id, cp.key)
					from my_teams mt where mt.section_id = cp.section_id))
			from (
				select sid as section_id, it.id as item_id, it.created_at, x.key, x.title, x.day, x.gate
				from items it cross join lateral unnest(it.section_ids) sid
				cross join lateral (
					select c.checkpoint_key as key, c.title, c.due_on as day, c.gate
					from public.classroom_signoff_checkpoints c where c.item_id = it.id
					union all
					select k->>'id', k->>'title', public._calendar_try_date(k->>'date'), k->>'gate'
					from jsonb_array_elements(case when jsonb_typeof(public._classroom_html_manifest(it.id)->'team'->'checkpoints') = 'array'
						then public._classroom_html_manifest(it.id)->'team'->'checkpoints' else '[]'::jsonb end) k
					where jsonb_typeof(k) = 'object'
						and coalesce(k->>'id', '') ~ '^[A-Za-z0-9_-]{1,40}'
						and coalesce(btrim(k->>'title'), '') <> ''
						and not exists (select 1 from public.classroom_signoff_checkpoints c
							where c.item_id = it.id and c.checkpoint_key = k->>'id')
				) x
				where not it.scheduled
			) cp
			where cp.day between v_from and v_to
			union all
			-- team: the viewer's own team's tasks
			select jsonb_build_object('id', 'task:' || t.id, 'layer', 'team', 'kind', 'task',
				'title', t.title, 'day', t.due_on, 'item_id', t.item_id,
				'section_ids', jsonb_build_array(mt.section_id),
				'owner', case when public._classroom_team_task_owner(mt.team_id, t) is null then null
					else public._classroom_first_name(mt.section_id, public._classroom_team_task_owner(mt.team_id, t)) end,
				'mine', public._classroom_team_task_owner(mt.team_id, t) = v_email,
				'blocked', t.blocked_reason is not null)
			from my_teams mt
			join public.classroom_team_plans pl on pl.team_id = mt.team_id
			join public.classroom_team_tasks t on t.plan_id = pl.id
			where t.removed_at is null and t.due_on between v_from and v_to
			union all
			-- no_school
			select jsonb_build_object('id', 'noschool:' || d.day, 'layer', 'no_school', 'kind', 'no_school',
				'title', d.label, 'day', d.day)
			from public.classroom_no_school_days d where d.day between v_from and v_to
			union all
			-- idea and robotics: the program's own events
			select jsonb_build_object('id', 'event:' || ev.id, 'event_id', ev.id, 'layer', ev.layer, 'kind', 'event',
				'title', ev.title, 'day', ev.starts_on, 'end_day', ev.ends_on,
				'start_time', to_char(ev.start_time, 'HH24:MI'), 'end_time', to_char(ev.end_time, 'HH24:MI'),
				'location', ev.location, 'notes', ev.notes)
			from public.calendar_events ev
			where ev.removed_at is null
				and ev.starts_on <= v_to and coalesce(ev.ends_on, ev.starts_on) >= v_from
		)
		select jsonb_build_object(
			'ok', true,
			'today', public._classroom_school_today(),
			'from', v_from, 'to', v_to,
			'sections', coalesce((select jsonb_agg(jsonb_build_object(
				'id', s.id, 'label', s.label, 'block', s.block, 'course', s.course,
				'course_title', s.course_title, 'teaches', s.teaches) order by s.course, s.label) from sections s), '[]'::jsonb),
			'events', coalesce((select jsonb_agg(e order by e->>'day', e->>'start_time' nulls first, e->>'id') from events), '[]'::jsonb)
		)
	);
end;
$f$;

revoke all on function public._calendar_try_date(text) from public, anon, authenticated;
revoke all on function public._calendar_school_day_n(date, integer) from public, anon, authenticated;
revoke all on function public._classroom_item_pacing(uuid) from public, anon, authenticated;
revoke all on function public._calendar_prefs(text) from public, anon, authenticated;
revoke all on function public._calendar_feed_email(text, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reads.
-- ---------------------------------------------------------------------------

-- The caller's own calendar, with their saved choices.
create or replace function public.calendar_feed(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_me text := public.current_user_email();
	v_feed jsonb;
begin
	if (select auth.uid()) is null or coalesce(v_me, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	v_feed := public._calendar_feed_email(v_me, p_from, p_to);
	return v_feed || jsonb_build_object(
		'prefs', public._calendar_prefs(v_me),
		'link', exists (select 1 from public.calendar_feed_tokens t where t.email = lower(btrim(v_me))),
		'admin', public.is_admin());
end;
$f$;

-- ONE PERSON'S CALENDAR, AS THEY SEE IT, for a site admin (the connector's
-- "what is on her calendar"). The person is named by address; nothing new is
-- disclosed, since an admin already manages every class it is drawn from.
create or replace function public.calendar_feed_for(p_email text, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
begin
	if not public.is_admin() then
		raise exception 'Only a site admin can read another person''s calendar.';
	end if;
	return public._calendar_feed_email(p_email, p_from, p_to) || jsonb_build_object('prefs', public._calendar_prefs(p_email));
end;
$f$;

-- THE SUBSCRIPTION LINK'S READ, with no session: the token's owner's calendar,
-- or a bare refusal that says nothing about why.
create or replace function public.calendar_feed_by_token(p_token text, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_email text;
begin
	if p_token is null or p_token !~ '^[0-9a-f]{64}' or char_length(p_token) <> 64 then
		return jsonb_build_object('ok', false);
	end if;
	select t.email into v_email from public.calendar_feed_tokens t where t.token = p_token;
	if v_email is null then
		return jsonb_build_object('ok', false);
	end if;
	return public._calendar_feed_email(v_email, p_from, p_to) || jsonb_build_object('prefs', public._calendar_prefs(v_email));
end;
$f$;

-- A post's day-by-day plan and its due date, for anyone who may read the post.
create or replace function public.classroom_item_pacing(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
begin
	if not public.classroom_can_read_item(p_item_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	return jsonb_build_object(
		'ok', true,
		'today', public._classroom_school_today(),
		'due_at', (select i.due_at from public.classroom_items i where i.id = p_item_id),
		'pacing', public._classroom_item_pacing(p_item_id));
end;
$f$;

-- The program's events between two days, with ids, for a site admin choosing one to change.
create or replace function public.calendar_events_list(p_from date default null, p_to date default null, p_layer text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
begin
	if not public.is_admin() then
		raise exception 'Only a site admin can list the calendar''s events.';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object('id', e.id, 'layer', e.layer, 'title', e.title,
			'starts_on', e.starts_on, 'ends_on', e.ends_on,
			'start_time', to_char(e.start_time, 'HH24:MI'), 'end_time', to_char(e.end_time, 'HH24:MI'),
			'location', e.location, 'notes', e.notes) order by e.starts_on, e.start_time nulls first, e.title)
		from public.calendar_events e
		where e.removed_at is null
			and (p_layer is null or e.layer = p_layer)
			and e.starts_on <= coalesce(p_to, public._classroom_school_today() + 120)
			and coalesce(e.ends_on, e.starts_on) >= coalesce(p_from, public._classroom_school_today() - 7)
	), '[]'::jsonb);
end;
$f$;

-- ---------------------------------------------------------------------------
-- 4. Writes.
-- ---------------------------------------------------------------------------

-- The caller's own subscription link: the existing one, or a new one when there
-- is none or `p_reset` asks for a fresh one (the old one stops working at once).
create or replace function public.calendar_feed_link(p_reset boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_me text := lower(btrim(public.current_user_email()));
	v_token text;
begin
	if (select auth.uid()) is null or coalesce(v_me, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	if coalesce(p_reset, false) then
		delete from public.calendar_feed_tokens where email = v_me;
	end if;
	insert into public.calendar_feed_tokens (email, token)
	values (v_me, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
	on conflict (email) do nothing;
	select t.token into v_token from public.calendar_feed_tokens t where t.email = v_me;
	return jsonb_build_object('ok', true, 'token', v_token);
end;
$f$;

create or replace function public.calendar_feed_link_revoke()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_me text := lower(btrim(public.current_user_email()));
begin
	if (select auth.uid()) is null or coalesce(v_me, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	delete from public.calendar_feed_tokens where email = v_me;
	return jsonb_build_object('ok', true);
end;
$f$;

-- ADD OR EDIT A PROGRAM EVENT (a site admin). No id adds one.
create or replace function public.calendar_event_save(
	p_id uuid,
	p_layer text,
	p_title text,
	p_starts_on date,
	p_ends_on date default null,
	p_start_time time default null,
	p_end_time time default null,
	p_location text default null,
	p_notes text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_me text := public.current_user_email();
	v_id uuid := p_id;
	v_ends date := case when p_ends_on = p_starts_on then null else p_ends_on end;
begin
	if not public.is_admin() then
		raise exception 'Only a site admin can change the calendar''s events.';
	end if;
	if p_layer is null or p_layer not in ('idea', 'robotics') then
		return jsonb_build_object('ok', false, 'reason', 'layer', 'message', 'Choose IDEA or Robotics for the event.');
	end if;
	if coalesce(btrim(p_title), '') = '' or char_length(btrim(p_title)) > 120 then
		return jsonb_build_object('ok', false, 'reason', 'title', 'message', 'Give the event a name of up to 120 characters.');
	end if;
	if p_starts_on is null then
		return jsonb_build_object('ok', false, 'reason', 'day', 'message', 'Give the event a day.');
	end if;
	if v_ends is not null and v_ends < p_starts_on then
		return jsonb_build_object('ok', false, 'reason', 'ends', 'message', 'The last day is before the first day.');
	end if;
	if p_end_time is not null and p_start_time is null then
		return jsonb_build_object('ok', false, 'reason', 'time', 'message', 'Give a start time before an end time.');
	end if;
	if v_id is null then
		insert into public.calendar_events (layer, title, starts_on, ends_on, start_time, end_time, location, notes, created_by)
		values (p_layer, btrim(p_title), p_starts_on, v_ends, p_start_time, p_end_time,
			nullif(btrim(left(coalesce(p_location, ''), 120)), ''), nullif(btrim(left(coalesce(p_notes, ''), 500)), ''), v_me)
		returning id into v_id;
	else
		update public.calendar_events set layer = p_layer, title = btrim(p_title), starts_on = p_starts_on,
			ends_on = v_ends, start_time = p_start_time, end_time = p_end_time,
			location = nullif(btrim(left(coalesce(p_location, ''), 120)), ''),
			notes = nullif(btrim(left(coalesce(p_notes, ''), 500)), ''),
			updated_by = v_me, updated_at = now()
		where id = v_id and removed_at is null;
		if not found then
			return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'That event does not exist.');
		end if;
	end if;
	return jsonb_build_object('ok', true, 'id', v_id);
end;
$f$;

-- MOVE A PROGRAM EVENT to another first day; a multi-day event keeps its length
-- unless a last day is given.
create or replace function public.calendar_event_move(p_id uuid, p_starts_on date, p_ends_on date default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_row public.calendar_events;
	v_ends date;
begin
	if not public.is_admin() then
		raise exception 'Only a site admin can change the calendar''s events.';
	end if;
	select * into v_row from public.calendar_events where id = p_id and removed_at is null for update;
	if v_row.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'That event does not exist.');
	end if;
	if p_starts_on is null then
		return jsonb_build_object('ok', false, 'reason', 'day', 'message', 'Give the event a day.');
	end if;
	v_ends := coalesce(p_ends_on, case when v_row.ends_on is null then null else p_starts_on + (v_row.ends_on - v_row.starts_on) end);
	if v_ends is not null and v_ends < p_starts_on then
		return jsonb_build_object('ok', false, 'reason', 'ends', 'message', 'The last day is before the first day.');
	end if;
	update public.calendar_events
	set starts_on = p_starts_on, ends_on = case when v_ends = p_starts_on then null else v_ends end,
		updated_by = public.current_user_email(), updated_at = now()
	where id = p_id;
	return jsonb_build_object('ok', true, 'id', p_id, 'was', jsonb_build_object('starts_on', v_row.starts_on, 'ends_on', v_row.ends_on));
end;
$f$;

-- REMOVE A PROGRAM EVENT. Kept, stamped, never shown again.
create or replace function public.calendar_event_remove(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
begin
	if not public.is_admin() then
		raise exception 'Only a site admin can change the calendar''s events.';
	end if;
	update public.calendar_events set removed_at = now(), removed_by = public.current_user_email()
	where id = p_id and removed_at is null;
	if not found then
		return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'That event does not exist.');
	end if;
	return jsonb_build_object('ok', true, 'id', p_id);
end;
$f$;

-- MOVE, RETITLE, HIDE OR ADD ONE PACING STEP OF A POST (a site admin). A null
-- title, day or modules keeps the manifest's; `p_remove` hides the step.
create or replace function public.classroom_item_pacing_set(
	p_item_id uuid,
	p_step_id text,
	p_title text default null,
	p_day date default null,
	p_modules text[] default null,
	p_remove boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
begin
	if not public.is_admin() then
		raise exception 'Only a site admin can change an assignment''s pacing.';
	end if;
	if not exists (select 1 from public.classroom_items i where i.id = p_item_id and i.kind = 'assignment') then
		return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'That assignment does not exist.');
	end if;
	if coalesce(p_step_id, '') !~ '^[A-Za-z0-9_-]{1,40}' or char_length(p_step_id) > 40 then
		return jsonb_build_object('ok', false, 'reason', 'step', 'message', 'A step id is letters, digits, - and _, up to 40 characters.');
	end if;
	if p_title is not null and (btrim(p_title) = '' or char_length(btrim(p_title)) > 120) then
		return jsonb_build_object('ok', false, 'reason', 'title', 'message', 'A step title is 1 to 120 characters.');
	end if;
	-- A new step (not in the manifest, never set before) needs a title and a day.
	if not coalesce(p_remove, false)
		and not exists (select 1 from jsonb_array_elements(public._classroom_item_pacing(p_item_id)) s where s->>'id' = p_step_id)
		and not exists (select 1 from public.classroom_item_pacing o where o.item_id = p_item_id and o.step_id = p_step_id)
		and (p_title is null or p_day is null) then
		return jsonb_build_object('ok', false, 'reason', 'new_step', 'message', 'A new step needs a title and a day.');
	end if;
	insert into public.classroom_item_pacing (item_id, step_id, title, day, modules, removed, set_by)
	values (p_item_id, p_step_id, nullif(btrim(p_title), ''), p_day, p_modules, coalesce(p_remove, false), public.current_user_email())
	on conflict (item_id, step_id) do update set
		title = coalesce(excluded.title, public.classroom_item_pacing.title),
		day = coalesce(excluded.day, public.classroom_item_pacing.day),
		modules = coalesce(excluded.modules, public.classroom_item_pacing.modules),
		removed = excluded.removed,
		set_by = excluded.set_by, set_at = now();
	return jsonb_build_object('ok', true, 'pacing', public._classroom_item_pacing(p_item_id));
end;
$f$;

-- PUT ONE STEP BACK to what the manifest says (or drop a step an admin added).
create or replace function public.classroom_item_pacing_clear(p_item_id uuid, p_step_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
begin
	if not public.is_admin() then
		raise exception 'Only a site admin can change an assignment''s pacing.';
	end if;
	delete from public.classroom_item_pacing where item_id = p_item_id and step_id = p_step_id;
	return jsonb_build_object('ok', true, 'pacing', public._classroom_item_pacing(p_item_id));
end;
$f$;

-- ---------------------------------------------------------------------------
-- 5. Grants: each function names its roles (the 0166 shape).
-- ---------------------------------------------------------------------------

revoke all on function public.calendar_feed(date, date) from public, anon, authenticated;
revoke all on function public.calendar_feed_for(text, date, date) from public, anon, authenticated;
revoke all on function public.calendar_feed_by_token(text, date, date) from public, anon, authenticated;
revoke all on function public.classroom_item_pacing(uuid) from public, anon, authenticated;
revoke all on function public.calendar_events_list(date, date, text) from public, anon, authenticated;
revoke all on function public.calendar_feed_link(boolean) from public, anon, authenticated;
revoke all on function public.calendar_feed_link_revoke() from public, anon, authenticated;
revoke all on function public.calendar_event_save(uuid, text, text, date, date, time, time, text, text) from public, anon, authenticated;
revoke all on function public.calendar_event_move(uuid, date, date) from public, anon, authenticated;
revoke all on function public.calendar_event_remove(uuid) from public, anon, authenticated;
revoke all on function public.classroom_item_pacing_set(uuid, text, text, date, text[], boolean) from public, anon, authenticated;
revoke all on function public.classroom_item_pacing_clear(uuid, text) from public, anon, authenticated;
grant execute on function public.calendar_feed(date, date) to authenticated;
grant execute on function public.calendar_feed_for(text, date, date) to authenticated;
-- The subscription link is read by a phone's calendar app, which has no session.
grant execute on function public.calendar_feed_by_token(text, date, date) to anon, authenticated;
grant execute on function public.classroom_item_pacing(uuid) to authenticated;
grant execute on function public.calendar_events_list(date, date, text) to authenticated;
grant execute on function public.calendar_feed_link(boolean) to authenticated;
grant execute on function public.calendar_feed_link_revoke() to authenticated;
grant execute on function public.calendar_event_save(uuid, text, text, date, date, time, time, text, text) to authenticated;
grant execute on function public.calendar_event_move(uuid, date, date) to authenticated;
grant execute on function public.calendar_event_remove(uuid) to authenticated;
grant execute on function public.classroom_item_pacing_set(uuid, text, text, date, text[], boolean) to authenticated;
grant execute on function public.classroom_item_pacing_clear(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Self-check, on this file's own objects only.
-- ---------------------------------------------------------------------------

do $check$
declare
	v_bad text[] := '{}';
	v_fn text;
begin
	foreach v_fn in array array[
		'public._calendar_try_date(text)', 'public._calendar_school_day_n(date, integer)',
		'public._classroom_item_pacing(uuid)', 'public._calendar_prefs(text)',
		'public._calendar_feed_email(text, date, date)', 'public.calendar_feed_link(boolean)',
		'public.calendar_event_save(uuid, text, text, date, date, time, time, text, text)',
		'public.classroom_item_pacing_set(uuid, text, text, date, text[], boolean)'
	] loop
		if has_function_privilege('anon', v_fn, 'execute') then
			v_bad := array_append(v_bad, 'anon can execute ' || v_fn);
		end if;
	end loop;
	foreach v_fn in array array['public._calendar_feed_email(text, date, date)', 'public._classroom_item_pacing(uuid)'] loop
		if has_function_privilege('authenticated', v_fn, 'execute') then
			v_bad := array_append(v_bad, 'a signed-in caller can execute ' || v_fn);
		end if;
	end loop;
	if not has_function_privilege('anon', 'public.calendar_feed_by_token(text, date, date)', 'execute') then
		v_bad := array_append(v_bad, 'the subscription read is not open to anon');
	end if;
	if has_table_privilege('authenticated', 'public.calendar_feed_tokens', 'select')
		or has_table_privilege('anon', 'public.calendar_feed_tokens', 'select') then
		v_bad := array_append(v_bad, 'a client role can read the subscription tokens');
	end if;
	if public._calendar_try_date('2026-02-30') is not null or public._calendar_try_date('2026-11-02') <> date '2026-11-02' then
		v_bad := array_append(v_bad, 'the date reader is wrong');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0308 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0308: % program events, % subscription links, % pacing changes; grants as named.',
		(select count(*) from public.calendar_events),
		(select count(*) from public.calendar_feed_tokens),
		(select count(*) from public.classroom_item_pacing);
end
$check$;
