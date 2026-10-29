-- 0324_classroom_team_rows_names_and_tools.sql
--
-- TABLE ROWS INSTEAD OF WHOLE TABLES, TEAM NAMES THAT NAME A CLASSMATE HELD
-- FOR AN OK, AND THE UNIT 4 TEAM TOOLS (ledger 0456; gap 2d621bcc, reports
-- 3d4d8b76 and d23bc63d).
--
-- 1. ROWS, NOT TABLES (gap 2d621bcc: "two students can't edit two separate
--    boxes at the same time" in the weighted objectives matrix). A table block
--    of a team post was one box with one lock, so the 35-cell matrix u4d-wot
--    locked for the whole team. Now:
--      - `classroom_team_box_lock` takes a ROW: `<block>#r<n>` for a table
--        block. Asked for a whole table it takes nothing and answers the
--        table's value, so a document built before this (which names only the
--        block) never shuts the table for a teammate.
--      - the team save merges a table ROW BY ROW (`_classroom_save_team_response`):
--        a row this save changes is taken under that row's lock and written; a
--        row a teammate holds keeps their words, and the save answers which
--        rows were kept. A row nobody changed is never written from a stale
--        copy.
--    Separate boxes never shared a lock: the lock is keyed by box (0302), and
--    the measured case was only ever the table.
-- 2. NAMES THAT TARGET A CLASSMATE ARE HELD (3d4d8b76). `_idea_roster_name_hits`
--    is the one check: a word of the text matching a classmate's given or
--    family name (four letters or more, whole word, any class, the team's own
--    members excepted). A student's team name or tagline that matches is not
--    applied: it is held in `classroom_team_text_holds` for an instructor's OK
--    (`classroom_team_text_holds_list`, `classroom_team_text_hold_decide`), by a
--    trigger on `classroom_teams`, so every write path is covered. A teacher's
--    own write is never held. Tournament entries and market listings are other
--    lanes' files; they call the same function.
-- 3. TEAM TOOLS (d23bc63d): a student reads a shared box's last versions
--    (`classroom_team_box_history_mine`) and puts one back through the ordinary
--    save; the machine week (`classroom_machine_week`) lays every team's machine
--    tasks on a shared calendar for its instructor with clashes flagged; and a
--    shared post can run late in one class (`classroom_item_section_shift_set`):
--    a student's plan steps (`classroom_item_pacing`) and their team's
--    checkpoint dates move by that many school days.
--
-- DEPLOY ORDERING: none. Every changed function keeps its signature; the new
-- reads are called only by a page that degrades when they are missing.
--
-- WHAT UNDOES IT, a person's paste: re-run, with their grant lines, 0302's
-- classroom_team_box_lock and _classroom_save_team_response, 0308's
-- classroom_item_pacing, 0304's _classroom_team_checkpoints and 0323's
-- _classroom_team_phase_open; then
--   drop trigger if exists classroom_teams_name_hold on public.classroom_teams;
--   drop table if exists public.classroom_team_text_holds, public.classroom_item_section_shifts;
-- and drop the functions this file creates.

do $pre$
begin
	if to_regclass('public.classroom_team_post_draws') is null then
		raise exception '0324 cannot apply: 0323 is missing. Apply 0323 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. Tables. The first object is new, so the apply probe can see this landed.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_team_text_holds (
	id uuid primary key default gen_random_uuid(),
	team_id uuid not null references public.classroom_teams (id) on delete cascade,
	field text not null check (field in ('name', 'tagline')),
	text text not null check (char_length(text) between 1 and 200),
	hits text[] not null default '{}',
	held_by text not null,
	held_at timestamptz not null default now(),
	status text not null default 'held' check (status in ('held', 'approved', 'rejected', 'superseded')),
	decided_by text,
	decided_at timestamptz
);

create index if not exists classroom_team_text_holds_open
	on public.classroom_team_text_holds (team_id, field) where status = 'held';

create table if not exists public.classroom_item_section_shifts (
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	section_id uuid not null references public.classroom_sections (id) on delete cascade,
	days integer not null check (days between 1 and 30),
	set_by text not null,
	set_at timestamptz not null default now(),
	primary key (item_id, section_id)
);

alter table public.classroom_team_text_holds enable row level security;
alter table public.classroom_item_section_shifts enable row level security;
revoke all on table public.classroom_team_text_holds from public, anon, authenticated;
revoke all on table public.classroom_item_section_shifts from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Rows, not tables.
-- ---------------------------------------------------------------------------

-- A TABLE ANSWER'S ROWS: the stored `{text: "[[...],[...]]"}` read as a jsonb
-- array of arrays, or null for anything else.
create or replace function public._classroom_table_rows(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $f$
declare
	v_text text := case jsonb_typeof(p_value)
		when 'object' then p_value->>'text'
		when 'string' then p_value #>> '{}'
		else null end;
	v_rows jsonb;
begin
	if v_text is null then
		return null;
	end if;
	begin
		v_rows := v_text::jsonb;
	exception when others then
		return null;
	end;
	if jsonb_typeof(v_rows) <> 'array'
		or exists (select 1 from jsonb_array_elements(v_rows) r where jsonb_typeof(r) <> 'array') then
		return null;
	end if;
	return v_rows;
end;
$f$;

-- ROWS BACK TO THE DOCUMENT'S OWN SPELLING: compact JSON of strings, exactly as
-- the kit writes it (`JSON.stringify`), so a merged table reads back equal.
create or replace function public._classroom_table_text(p_rows jsonb)
returns text
language sql
immutable
set search_path = ''
as $f$
	select '[' || coalesce(string_agg(
		'[' || coalesce((
			select string_agg(to_json(c.cell)::text, ',' order by c.ord)
			from jsonb_array_elements_text(r.row) with ordinality as c(cell, ord)
		), '') || ']', ',' order by r.ord), '') || ']'
	from jsonb_array_elements(p_rows) with ordinality as r(row, ord);
$f$;

revoke all on function public._classroom_table_rows(jsonb) from public, anon, authenticated;
revoke all on function public._classroom_table_text(jsonb) from public, anon, authenticated;

-- 0302's box lock, taking a table ROW (marked 0324). `<block>#r<n>` names row
-- n of a table block; a whole table is never locked.
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
	v_base text := split_part(coalesce(p_block_id, ''), '#', 1);
	v_row text := nullif(split_part(coalesce(p_block_id, ''), '#', 2), '');
	v_table boolean;
	v_owner jsonb;
	v_ctx record;
	v_refusal jsonb;
	v_released integer;
	v_value jsonb;
begin
	v_owner := case when v_manifest is null then null
		else public._classroom_html_team_block(v_manifest, v_base) end;
	if v_owner is null then
		raise exception 'That box is not shared with a team.';
	end if;
	v_table := coalesce(public._classroom_html_block(v_manifest, v_base)->>'type' = 'table', false);
	if v_row is not null and (not v_table or v_row !~ '^r[0-9]{1,3}$') then
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
	select a.value into v_value from public.classroom_team_answers a
	where a.team_id = v_ctx.team_id and a.item_id = p_item_id and a.block_id = v_base;
	-- 0324: a whole table is never locked; its rows are, one at a time.
	if v_table and v_row is null then
		return jsonb_build_object('ok', true, 'until', null, 'rows', true, 'value', v_value);
	end if;
	v_refusal := public._classroom_team_take_lock(v_ctx.team_id, p_item_id, p_block_id, v_email);
	if v_refusal is not null then
		return v_refusal;
	end if;
	perform public._classroom_live_notice('team-' || v_ctx.team_id::text, 'team-doc');
	return jsonb_build_object('ok', true,
		'until', now() + public._classroom_team_lock_ttl(),
		'value', v_value);
end;
$f$;

revoke all on function public.classroom_team_box_lock(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.classroom_team_box_lock(uuid, text, boolean) to authenticated;

-- 0302's team write, merging a table row by row (marked 0324). Every other
-- block is written exactly as 0302 wrote it.
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
	v_value jsonb := p_value;
	v_new jsonb;
	v_old jsonb;
	v_merged jsonb := '[]'::jsonb;
	v_kept integer[] := '{}';
	v_i integer;
	v_n integer;
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

	-- 0324: A TABLE IS WRITTEN ROW BY ROW. Each row this save changes is taken
	-- under that row's lock; a row a teammate holds keeps their words.
	if public._classroom_html_block(public._classroom_html_manifest(p_item_id), p_block_id)->>'type' = 'table' then
		v_new := public._classroom_table_rows(p_value);
	end if;
	if v_new is not null then
		select a.value into v_before from public.classroom_team_answers a
		where a.team_id = v_ctx.team_id and a.item_id = p_item_id and a.block_id = p_block_id
		for update;
		if v_before is not distinct from p_value then
			return jsonb_build_object('ok', true);
		end if;
		v_old := coalesce(public._classroom_table_rows(v_before), '[]'::jsonb);
		v_n := greatest(jsonb_array_length(v_new), jsonb_array_length(v_old));
		for v_i in 0 .. v_n - 1 loop
			if v_i >= jsonb_array_length(v_new) then
				v_merged := v_merged || jsonb_build_array(v_old->v_i);
			elsif (v_old->v_i) is not distinct from (v_new->v_i) then
				v_merged := v_merged || jsonb_build_array(v_new->v_i);
			elsif public._classroom_team_take_lock(v_ctx.team_id, p_item_id, p_block_id || '#r' || v_i, p_email) is null then
				v_merged := v_merged || jsonb_build_array(v_new->v_i);
			else
				v_merged := v_merged || jsonb_build_array(coalesce(v_old->v_i, v_new->v_i));
				v_kept := v_kept || v_i;
			end if;
		end loop;
		if v_merged is distinct from v_new then
			v_value := jsonb_build_object('text', public._classroom_table_text(v_merged));
		end if;
		if v_value is not distinct from v_before then
			return jsonb_build_object('ok', true, 'kept_rows', to_jsonb(v_kept));
		end if;
	else
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
	end if;

	insert into public.classroom_team_answers (team_id, item_id, block_id, value, updated_by)
	values (v_ctx.team_id, p_item_id, p_block_id, v_value, p_email)
	on conflict (team_id, item_id, block_id) do update
		set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

	insert into public.classroom_responses (item_id, student_email, block_id, value, updated_at)
	select p_item_id, m.student_email, p_block_id, v_value, now()
	from public.classroom_team_members m
	where m.team_id = v_ctx.team_id
	on conflict (item_id, student_email, block_id) do update
		set value = excluded.value, updated_at = now();

	insert into public.classroom_team_log (team_id, item_id, block_id, kind, actor_email, before, after)
	values (v_ctx.team_id, p_item_id, p_block_id, 'answer', p_email, v_before, v_value);

	perform public._classroom_live_notice('team-' || v_ctx.team_id::text, 'team-doc');
	return case when cardinality(v_kept) > 0
		then jsonb_build_object('ok', true, 'kept_rows', to_jsonb(v_kept))
		else jsonb_build_object('ok', true) end;
end;
$f$;

revoke all on function public._classroom_save_team_response(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Names that target a classmate (3d4d8b76).
-- ---------------------------------------------------------------------------

-- THE ONE CHECK: the roster names a text names. Every word of four letters or
-- more in the text, matched whole and without case against the given and
-- family names of every student actively enrolled in any class, the names of
-- `p_except` (the writer's own team) left out. The roster's own spelling of
-- each hit, distinct. Empty is "names nobody".
create or replace function public._idea_roster_name_hits(p_text text, p_except text[] default '{}')
returns text[]
language sql
stable
security definer
set search_path = ''
as $f$
	with words as (
		select distinct lower(w) as w
		from regexp_split_to_table(coalesce(p_text, ''), '[^[:alpha:]'']+') w
		where char_length(w) >= 4
	), names as (
		select distinct lower(n) as n, n as spelled
		from public.classroom_enrollments e,
			regexp_split_to_table(btrim(coalesce(e.display_name, '')), '[^[:alpha:]'']+') n
		where e.active and char_length(n) >= 4
			and e.student_email <> all (coalesce(p_except, '{}'))
			and lower(n) not in (
				select lower(x)
				from public.classroom_enrollments mine,
					regexp_split_to_table(btrim(coalesce(mine.display_name, '')), '[^[:alpha:]'']+') x
				where mine.student_email = any (coalesce(p_except, '{}'))
			)
	)
	select coalesce(array_agg(distinct names.spelled order by names.spelled), '{}')
	from words join names on names.n = words.w;
$f$;

revoke all on function public._idea_roster_name_hits(text, text[]) from public, anon, authenticated;

-- A STUDENT'S TEAM NAME OR TAGLINE THAT NAMES A CLASSMATE IS HELD. The change
-- is not applied; the text waits in `classroom_team_text_holds` for an
-- instructor. A manager of the class is never held, and nor is the system.
create or replace function public._classroom_teams_name_hold()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_me text := coalesce(public.current_user_email(), '');
	v_section uuid;
	v_members text[];
	v_hits text[];
begin
	if v_me = '' then
		return new;
	end if;
	select s.section_id into v_section from public.classroom_team_sets s where s.id = new.team_set_id;
	if v_section is null or coalesce(public.classroom_manages_section(v_section), false) then
		return new;
	end if;
	select coalesce(array_agg(m.student_email), '{}') into v_members
	from public.classroom_team_members m where m.team_id = new.id;
	if new.name is distinct from old.name and coalesce(btrim(new.name), '') <> '' then
		v_hits := public._idea_roster_name_hits(new.name, v_members);
		if cardinality(v_hits) > 0 then
			update public.classroom_team_text_holds set status = 'superseded'
			where team_id = new.id and field = 'name' and status = 'held';
			insert into public.classroom_team_text_holds (team_id, field, text, hits, held_by)
			values (new.id, 'name', left(new.name, 200), v_hits, v_me);
			new.name := old.name;
		end if;
	end if;
	if new.tagline is distinct from old.tagline and coalesce(btrim(new.tagline), '') <> '' then
		v_hits := public._idea_roster_name_hits(new.tagline, v_members);
		if cardinality(v_hits) > 0 then
			update public.classroom_team_text_holds set status = 'superseded'
			where team_id = new.id and field = 'tagline' and status = 'held';
			insert into public.classroom_team_text_holds (team_id, field, text, hits, held_by)
			values (new.id, 'tagline', left(new.tagline, 200), v_hits, v_me);
			new.tagline := old.tagline;
		end if;
	end if;
	return new;
end;
$f$;

revoke all on function public._classroom_teams_name_hold() from public, anon, authenticated;

drop trigger if exists classroom_teams_name_hold on public.classroom_teams;
create trigger classroom_teams_name_hold
	before update of name, tagline on public.classroom_teams
	for each row execute function public._classroom_teams_name_hold();

-- THE HELD TEXTS an instructor may decide: every held name and tagline of the
-- classes the caller manages, oldest first.
create or replace function public.classroom_team_text_holds_list()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select jsonb_build_object('ok', true, 'holds', coalesce(jsonb_agg(jsonb_build_object(
		'id', h.id, 'field', h.field, 'text', h.text, 'hits', to_jsonb(h.hits), 'at', h.held_at,
		'by', public._classroom_first_name(s.section_id, h.held_by),
		'team', coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number),
		'section', (select c.label from public.classroom_sections c where c.id = s.section_id)
	) order by h.held_at), '[]'::jsonb))
	from public.classroom_team_text_holds h
	join public.classroom_teams t on t.id = h.team_id
	join public.classroom_team_sets s on s.id = t.team_set_id
	where (select auth.uid()) is not null and h.status = 'held'
		and public.classroom_manages_section(s.section_id);
$f$;

-- OK A HELD TEXT (it is applied, as the instructor's own write) or turn it down.
create or replace function public.classroom_team_text_hold_decide(p_hold_id uuid, p_approve boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_hold public.classroom_team_text_holds;
	v_section uuid;
begin
	select * into v_hold from public.classroom_team_text_holds where id = p_hold_id for update;
	select s.section_id into v_section
	from public.classroom_teams t join public.classroom_team_sets s on s.id = t.team_set_id
	where t.id = v_hold.team_id;
	if v_hold.id is null or v_section is null or not coalesce(public.classroom_manages_section(v_section), false) then
		raise exception 'That held name does not exist.';
	end if;
	if v_hold.status <> 'held' then
		return jsonb_build_object('ok', false, 'reason', 'decided', 'status', v_hold.status);
	end if;
	update public.classroom_team_text_holds
	set status = case when p_approve then 'approved' else 'rejected' end,
		decided_by = public.current_user_email(), decided_at = now()
	where id = p_hold_id;
	if p_approve then
		if v_hold.field = 'name' then
			update public.classroom_teams set name = left(v_hold.text, 40) where id = v_hold.team_id;
		else
			update public.classroom_teams set tagline = left(v_hold.text, 48) where id = v_hold.team_id;
		end if;
	end if;
	return jsonb_build_object('ok', true, 'status', case when p_approve then 'approved' else 'rejected' end);
end;
$f$;

revoke all on function public.classroom_team_text_holds_list() from public, anon, authenticated;
grant execute on function public.classroom_team_text_holds_list() to authenticated;
revoke all on function public.classroom_team_text_hold_decide(uuid, boolean) from public, anon, authenticated;
grant execute on function public.classroom_team_text_hold_decide(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Team tools (d23bc63d).
-- ---------------------------------------------------------------------------

-- A SHARED BOX'S LAST VERSIONS, FOR ITS TEAM: newest first, at most ten, each
-- with who saved it. A student puts one back through the ordinary save, so the
-- lock and the owner rule decide it like any other write.
create or replace function public.classroom_team_box_history_mine(p_item_id uuid, p_block_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_manifest jsonb := public._classroom_html_team_manifest(p_item_id);
	v_team uuid;
begin
	if v_manifest is null or public._classroom_html_team_block(v_manifest, p_block_id) is null then
		raise exception 'That box is not shared with a team.';
	end if;
	select c.team_id into v_team from public._classroom_team_ctx(p_item_id, v_email) c;
	if v_team is null then
		return jsonb_build_object('ok', true, 'entries', '[]'::jsonb);
	end if;
	return jsonb_build_object('ok', true, 'entries', coalesce((
		select jsonb_agg(jsonb_build_object(
			'at', x.at,
			'by', nullif(public._classroom_team_display_name(v_team, x.actor_email), ''),
			'value', x.after
		) order by x.at desc, x.id desc)
		from (
			select l.id, l.at, l.actor_email, l.after
			from public.classroom_team_log l
			where l.team_id = v_team and l.item_id = p_item_id and l.block_id = p_block_id and l.kind = 'answer'
			order by l.at desc, l.id desc
			limit 10
		) x
	), '[]'::jsonb));
end;
$f$;

revoke all on function public.classroom_team_box_history_mine(uuid, text) from public, anon, authenticated;
grant execute on function public.classroom_team_box_history_mine(uuid, text) to authenticated;

-- THE MACHINE WEEK: every team task with a machine and a day in the week from
-- `p_from` (Monday of this week when null), across the classes the caller
-- manages, each with its class, team, owner and whether another team has the
-- same machine that day.
create or replace function public.classroom_machine_week(p_from date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_from date := coalesce(p_from, date_trunc('week', public._classroom_school_today())::date);
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	return jsonb_build_object('ok', true, 'from', v_from, 'to', v_from + 6,
		'machines', coalesce((select jsonb_agg(jsonb_build_object('id', mt.id, 'label', mt.label) order by mt.sort)
			from public.classroom_machine_tags mt where mt.active), '[]'::jsonb),
		'bookings', coalesce((
			select jsonb_agg(jsonb_build_object(
				'day', b.due_on, 'machine', b.machine, 'section', b.section_label, 'team', b.team_name,
				'task', b.title, 'owner', b.owner_name, 'blocked', b.blocked, 'clash', b.teams_that_day > 1
			) order by b.due_on, b.machine, b.section_label, b.team_name, b.title)
			from (
				select t.due_on, t.machine, t.title, t.blocked_reason is not null as blocked,
					c.label as section_label,
					coalesce(nullif(btrim(tm.name), ''), 'Team ' || tm.team_number) as team_name,
					nullif(public._classroom_team_display_name(tm.id, public._classroom_team_task_owner(tm.id, t)), '') as owner_name,
					-- How many teams have this machine this day (a window cannot count distinct).
					dense_rank() over (partition by t.machine, t.due_on order by tm.id)
						+ dense_rank() over (partition by t.machine, t.due_on order by tm.id desc) - 1 as teams_that_day
				from public.classroom_team_tasks t
				join public.classroom_team_plans p on p.id = t.plan_id
				join public.classroom_teams tm on tm.id = p.team_id
				join public.classroom_team_sets s on s.id = tm.team_set_id
				join public.classroom_sections c on c.id = s.section_id
				where s.archived_at is null and t.removed_at is null and t.machine is not null
					and t.due_on between v_from and v_from + 6
					and public.classroom_manages_section(s.section_id)
			) b
		), '[]'::jsonb));
end;
$f$;

revoke all on function public.classroom_machine_week(date) from public, anon, authenticated;
grant execute on function public.classroom_machine_week(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. One shared post running late in one class (d23bc63d.2).
-- ---------------------------------------------------------------------------

-- A DAY MOVED LATER BY N SCHOOL DAYS: the Nth school day after it, by 0308's
-- one school-day rule (`_calendar_school_day_n`), never a second copy of it.
create or replace function public._classroom_shift_school_days(p_day date, p_days integer)
returns date
language sql
stable
security definer
set search_path = ''
as $f$
	select case when p_day is null or coalesce(p_days, 0) <= 0 then p_day
		else public._calendar_school_day_n(p_day + 1, p_days) end;
$f$;

-- How many school days one class runs a post late (0 when it does not).
create or replace function public._classroom_item_shift(p_item_id uuid, p_section_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce((select s.days from public.classroom_item_section_shifts s
		where s.item_id = p_item_id and s.section_id = p_section_id), 0);
$f$;

-- SET IT: a manager of the class, a whole number of school days from 0 to 30;
-- 0 removes it.
create or replace function public.classroom_item_section_shift_set(p_item_id uuid, p_section_id uuid, p_days integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
begin
	if not coalesce(public.classroom_manages_section(p_section_id), false)
		or not exists (select 1 from public.classroom_postings pg where pg.item_id = p_item_id and pg.section_id = p_section_id) then
		raise exception 'That post is not in a class you teach.';
	end if;
	if p_days is null or p_days not between 0 and 30 then
		return jsonb_build_object('ok', false, 'reason', 'range');
	end if;
	if p_days = 0 then
		delete from public.classroom_item_section_shifts where item_id = p_item_id and section_id = p_section_id;
	else
		insert into public.classroom_item_section_shifts (item_id, section_id, days, set_by)
		values (p_item_id, p_section_id, p_days, public.current_user_email())
		on conflict (item_id, section_id) do update set days = excluded.days, set_by = excluded.set_by, set_at = now();
	end if;
	perform public._classroom_live_notice(p_section_id::text, 'teams');
	return jsonb_build_object('ok', true, 'days', p_days);
end;
$f$;

-- THE SHIFTS OF ONE POST, for an instructor: [{section_id, days}] for each
-- class of the post the caller manages (0 where it runs on time).
create or replace function public.classroom_item_section_shifts(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select jsonb_build_object('ok', true, 'shifts', coalesce(jsonb_agg(jsonb_build_object(
		'section_id', pg.section_id, 'days', public._classroom_item_shift(p_item_id, pg.section_id)
	) order by pg.section_id), '[]'::jsonb))
	from public.classroom_postings pg
	where (select auth.uid()) is not null and pg.item_id = p_item_id
		and public.classroom_manages_section(pg.section_id);
$f$;

revoke all on function public.classroom_item_section_shifts(uuid) from public, anon, authenticated;
grant execute on function public.classroom_item_section_shifts(uuid) to authenticated;

revoke all on function public._classroom_shift_school_days(date, integer) from public, anon, authenticated;
revoke all on function public._classroom_item_shift(uuid, uuid) from public, anon, authenticated;
revoke all on function public.classroom_item_section_shift_set(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.classroom_item_section_shift_set(uuid, uuid, integer) to authenticated;

-- 0308's pacing read for the item page, each step moved by the caller's own
-- class's shift (marked 0324). A student enrolled in a class that runs the post
-- late reads its own dates; an instructor reads the post's.
create or replace function public.classroom_item_pacing(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_shift integer := 0;
begin
	if not public.classroom_can_read_item(p_item_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	select coalesce(max(public._classroom_item_shift(p_item_id, pg.section_id)), 0) into v_shift
	from public.classroom_postings pg
	join public.classroom_enrollments e on e.section_id = pg.section_id and e.active
		and e.student_email = public.current_user_email()
	where pg.item_id = p_item_id;
	return jsonb_build_object(
		'ok', true,
		'today', public._classroom_school_today(),
		'due_at', (select i.due_at from public.classroom_items i where i.id = p_item_id),
		'shift', v_shift,
		'pacing', case when v_shift = 0 then public._classroom_item_pacing(p_item_id) else coalesce((
			select jsonb_agg(s || jsonb_build_object('day', public._classroom_shift_school_days((s->>'day')::date, v_shift))
				order by public._classroom_shift_school_days((s->>'day')::date, v_shift), ord)
			from jsonb_array_elements(public._classroom_item_pacing(p_item_id)) with ordinality as x(s, ord)
		), '[]'::jsonb) end);
end;
$f$;

revoke all on function public.classroom_item_pacing(uuid) from public, anon, authenticated;
grant execute on function public.classroom_item_pacing(uuid) to authenticated;

-- 0304's team checkpoints, each date moved by the team's class's shift on the
-- post that declared it (marked 0324), so the plan, the panel, the queue and the
-- phases read one date for the class.
create or replace function public._classroom_team_checkpoints(p_team_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	with rows as (
		select c.*, ti.created_at as item_created
		from public._classroom_team_items(p_team_id) ti
		join public.classroom_signoff_checkpoints c on c.item_id = ti.item_id
	), keys as (
		select distinct on (checkpoint_key) checkpoint_key, title, due_on, gate, item_id as anchor
		from rows order by checkpoint_key, item_created, item_id
	), shifted as (
		select k.*, public._classroom_shift_school_days(k.due_on,
			public._classroom_item_shift(k.anchor, public._classroom_team_section(p_team_id))) as day
		from keys k
	)
	select coalesce(jsonb_agg(jsonb_build_object(
		'key', k.checkpoint_key, 'title', k.title, 'date', k.day, 'gate', k.gate, 'anchor', k.anchor,
		'items', coalesce((
			select jsonb_agg(i.item || jsonb_build_object('source', r.item_id) order by r.item_created, i.ord)
			from rows r cross join lateral jsonb_array_elements(r.items) with ordinality as i(item, ord)
			where r.checkpoint_key = k.checkpoint_key
		), '[]'::jsonb)
	) order by k.day nulls last, k.checkpoint_key), '[]'::jsonb)
	from shifted k;
$f$;

revoke all on function public._classroom_team_checkpoints(uuid) from public, anon, authenticated;

-- 0323's phase rule, on the class's own date (marked 0324).
create or replace function public._classroom_team_phase_open(p_team_id uuid, p_item_id uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
	with cp as (
		select public._classroom_shift_school_days(coalesce(
			(select c.due_on from public.classroom_signoff_checkpoints c
			 where c.item_id = p_item_id and c.checkpoint_key = p_key),
			(select public._calendar_try_date(k->>'date')
			 from jsonb_array_elements(case when jsonb_typeof(public._classroom_html_team_manifest(p_item_id)->'team'->'checkpoints') = 'array'
				then public._classroom_html_team_manifest(p_item_id)->'team'->'checkpoints' else '[]'::jsonb end) k
			 where k->>'id' = p_key limit 1)),
			public._classroom_item_shift(p_item_id, public._classroom_team_section(p_team_id))) as day,
			exists (select 1
				from jsonb_array_elements(case when jsonb_typeof(public._classroom_html_team_manifest(p_item_id)->'team'->'checkpoints') = 'array'
					then public._classroom_html_team_manifest(p_item_id)->'team'->'checkpoints' else '[]'::jsonb end) k
				where k->>'id' = p_key)
			or exists (select 1 from public.classroom_signoff_checkpoints c
				where c.item_id = p_item_id and c.checkpoint_key = p_key) as declared
	)
	select not cp.declared
		or public._classroom_signoff_state(p_team_id, p_key) = 'approved'
		or (cp.day is not null and cp.day <= public._classroom_school_today())
	from cp;
$f$;

revoke all on function public._classroom_team_phase_open(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Self-check and counts.
-- ---------------------------------------------------------------------------

do $check$
declare
	v_fn text;
begin
	foreach v_fn in array array[
		'public.classroom_team_text_holds_list()',
		'public.classroom_team_text_hold_decide(uuid, boolean)',
		'public.classroom_team_box_history_mine(uuid, text)',
		'public.classroom_machine_week(date)',
		'public.classroom_item_section_shift_set(uuid, uuid, integer)',
		'public.classroom_item_section_shifts(uuid)'
	] loop
		if has_function_privilege('anon', v_fn, 'execute') then
			raise exception '0324: % is executable by anon.', v_fn;
		end if;
	end loop;
	if has_function_privilege('authenticated', 'public._idea_roster_name_hits(text, text[])', 'execute') then
		raise exception '0324: the roster name check is executable by a client.';
	end if;
	raise notice '0324: % team table boxes now lock by row; % team names or taglines already name a classmate (not held: only new writes are checked).',
		(select count(*) from public.classroom_html_assignments h,
			jsonb_array_elements(case when jsonb_typeof(h.manifest->'modules') = 'array' then h.manifest->'modules' else '[]'::jsonb end) m,
			jsonb_array_elements(case when jsonb_typeof(m->'blocks') = 'array' then m->'blocks' else '[]'::jsonb end) b
		 where jsonb_typeof(h.manifest->'team') = 'object' and m->>'audience' in ('team', 'role') and b->>'type' = 'table'),
		(select count(*) from public.classroom_teams t
		 where cardinality(public._idea_roster_name_hits(concat_ws(' ', t.name, t.tagline),
			(select coalesce(array_agg(m.student_email), '{}') from public.classroom_team_members m where m.team_id = t.id))) > 0);
end
$check$;
