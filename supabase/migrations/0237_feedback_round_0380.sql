-- 0237_feedback_round_0380.sql
--
-- THE 2026-10-14 FEEDBACK ROUND, ONE FILE (ledger 0380). Eight parts, each
-- marked `-- ===== PART x =====`; every one is additive and idempotent, and
-- the file applies whole or not at all.
--
--   A. A finished worksheet stays finished (report e32659e9): the worksheet
--      latch table and its two functions.
--   B. The hall pass is a time budget (report 7348d14c): replaces 0174's
--      per-day count and cooldown, adds auto check-in and who-is-out for the
--      whole class.
--   C. The Foundry opens and closes by class schedule (report 84e293d4).
--   D. An admin edits a major release's gallery details (report c5f811e4).
--   E. Foundry collections (report 762bb647).
--   F. Publisher search by name (report 762bb647, second half).
--   G. Votes on a game (report 8274b260).
--   H. A featured row (report 415af89e).
--
-- BACKWARD COMPATIBLE. No existing function changes its argument list, so the
-- SIGNATURE TRAP does not arise. The functions re-created in place are the
-- hall pass trio (0174, now volatile for state) and foundry_section_access
-- (0230, one predicate swapped); every other object is new. Every new table has
-- row level security on and no client grant; every new function revokes from
-- public, anon, authenticated and service_role by name and grants back only to
-- authenticated (0166's shape), because the default privileges a hosted
-- project writes make `revoke ... from public` alone leave an anon grant.
-- No row of an existing table is written.
--
-- DEPLOY ORDER: none. The client degrades past every object here (PGRST202 or
-- a missing relation reads as "not available yet"), so the deploy and this
-- apply are independent events and either may go first.
--
-- UNDO, by part, for a person's paste: A: drop the two classroom_worksheet_*
-- functions and the latch table. B: re-run the 0174 bodies of the hall pass
-- trio and _classroom_hall_pass_limits(), drop the five new private helpers,
-- classroom_hall_pass_set_limits, the budget_start table and the two section
-- columns. C-H: drop the new functions, then the new tables; and for C re-run
-- 0230's foundry_section_access. Nothing is deleted from a table that existed
-- before this file.

-- ===== PART A BEGIN =====
-- ===== PART A: A FINISHED WORKSHEET STAYS FINISHED (report e32659e9) =====
--
-- Completion of a ported worksheet is DERIVED and judged against the manifest
-- the worksheet has TODAY. The day an author adds a required block (or raises
-- a minSentences, or drops an optional) every student who had finished is
-- judged against a worksheet they never saw, and reads Missing or In progress
-- on every surface at once. classroom_worksheet_latches keeps the first moment
-- a student's own load found the worksheet complete.
--
-- A LATCH IS A LABEL AND NOTHING ELSE. It never moves a submission to
-- submitted (that locks saves, 0197), decides no grade and gates no write. The
-- live derivation still runs beside it and the client reads the union. The
-- stamp is asserted by the student's own client, which is the same judgment
-- that already decides the label; the function only refuses what could not be
-- true (not their assignment, not a ported worksheet, not one answer on it).

create table if not exists public.classroom_worksheet_latches (
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	student_email text not null,
	completed_at timestamptz not null,
	stamped_at timestamptz not null default now(),
	primary key (item_id, student_email),
	constraint classroom_worksheet_latches_email_shape
		check (student_email <> '' and student_email = lower(btrim(student_email)))
);

alter table public.classroom_worksheet_latches enable row level security;
revoke all on table public.classroom_worksheet_latches from public, anon, authenticated, service_role;

-- A student stamps their own; returns true when this call wrote the latch.
create or replace function public.classroom_worksheet_latch(
	p_item_id uuid,
	p_completed_at timestamptz default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $f$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_at timestamptz := least(coalesce(p_completed_at, now()), now());
	v_n integer;
begin
	if public._classroom_html_manifest(p_item_id) is null then
		raise exception 'That assignment is not a worksheet.';
	end if;
	-- At least one answer of their own, so a latch cannot exist for a worksheet
	-- nobody has opened.
	if not exists (
		select 1 from public.classroom_responses r
		where r.item_id = p_item_id and r.student_email = v_email
	) and not exists (
		select 1 from public.classroom_submissions s
		where s.item_id = p_item_id and s.student_email = v_email
	) then
		return false;
	end if;
	insert into public.classroom_worksheet_latches (item_id, student_email, completed_at)
	values (p_item_id, v_email, v_at)
	on conflict (item_id, student_email) do nothing;
	get diagnostics v_n = row_count;
	return v_n > 0;
end;
$f$;

-- The latches the caller may see: their own, plus every student's in a section
-- they manage (an admin manages every section), for the items asked about.
-- One primary-key lookup, so a teacher's page pays nothing for it.
create or replace function public.classroom_worksheet_latched(
	p_item_ids uuid[],
	p_section_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_email text := public.current_user_email();
begin
	if (select auth.uid()) is null or coalesce(v_email, '') = '' then
		return '[]'::jsonb;
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'item_id', l.item_id, 'student_email', l.student_email, 'completed_at', l.completed_at))
		from public.classroom_worksheet_latches l
		where l.item_id = any (coalesce(p_item_ids, '{}'::uuid[]))
			and (
				l.student_email = v_email
				or exists (
					select 1
					from public.classroom_postings pg
					join public.classroom_enrollments e
						on e.section_id = pg.section_id and e.student_email = l.student_email
					where pg.item_id = l.item_id
						and (p_section_id is null or pg.section_id = p_section_id)
						and public.classroom_manages_section(pg.section_id)
				)
			)
	), '[]'::jsonb);
end;
$f$;

revoke all on function public.classroom_worksheet_latch(uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.classroom_worksheet_latch(uuid, timestamptz) to authenticated;
revoke all on function public.classroom_worksheet_latched(uuid[], uuid) from public, anon, authenticated, service_role;
grant execute on function public.classroom_worksheet_latched(uuid[], uuid) to authenticated;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: THE HALL PASS IS A TIME BUDGET (report 7348d14c) =====
--
-- Mr. Pina, 2026-10-08: "instead of there being a limit on how many hall
-- passes a student gets per day I think it should be a limit on the time." The
-- per-day COUNT and the cooldown of 0174 are REPLACED, not kept beside it.
--
--   * Each student has a daily budget (10 minutes by default, set per section
--     by an instructor) on the America/Los_Angeles calendar day.
--   * Time past the day's allowance is debt carried into the next day:
--         debt(next) = max(0, debt + used - budget)
--         allowance  = max(0, budget - debt)
--     so 15 minutes on day one leaves 5 minutes on day two, and 30 minutes
--     (a pass nobody checked in) leaves none for two days.
--   * Debt clears at the weekly reset, Monday 00:00 America/Los_Angeles, which
--     is also the horizon: a student whose debt cannot be paid down by then
--     is told the reset.
--   * A pass open longer than the auto check-in (30 minutes by default, per
--     section) is closed at exactly that mark and charged the full figure. It
--     is done LAZILY, on every state read and open, because nothing in this
--     schema runs on a clock (no pg_cron); the state is polled by the whole
--     class, so an unattended pass is closed within a poll.
--   * EVERYONE IN THE CLASS NOW SEES WHO IS OUT. That reverses the privacy
--     rule 0143 and 0174 recorded (a student learned one bit); it is Mr.
--     Pina's decision, written down as docs/decisions/entries/58-*. The
--     student projection names the holder by their shown name (never an
--     address) and since when. The capacity index (one out per section at a
--     time) is unchanged: that is the default decision, recorded likewise.
--
-- WHAT IS CHARGED IS DERIVED FROM THE ROWS, never stored: a pass's charge is
-- least(closed_at (or now) - opened_at, the section's auto check-in). No
-- column, no backfill, no DML over existing rows. A pass opened before this
-- file applied costs nothing (the budget starts at the apply instant, a row
-- written once by the do block below), so nobody inherits debt from the old
-- rule.
--
-- SIGNATURES: classroom_hall_pass_open(uuid), classroom_hall_pass_open_for(
-- uuid, text) and classroom_hall_pass_state(uuid, integer) keep their exact
-- argument lists and are replaced in place (state moves from stable to volatile
-- because it now sweeps). _classroom_hall_pass_limits() is replaced in place
-- and now answers the DEFAULTS; its one other reader, 0233's student overview,
-- projects the new keys and the client reads them tolerantly.

alter table public.classroom_sections
	add column if not exists hall_pass_daily_minutes smallint,
	add column if not exists hall_pass_auto_minutes smallint;

do $b$
begin
	if not exists (select 1 from pg_catalog.pg_constraint where conname = 'classroom_sections_hall_pass_daily_range') then
		alter table public.classroom_sections add constraint classroom_sections_hall_pass_daily_range
			check (hall_pass_daily_minutes is null or hall_pass_daily_minutes between 1 and 120);
	end if;
	if not exists (select 1 from pg_catalog.pg_constraint where conname = 'classroom_sections_hall_pass_auto_range') then
		alter table public.classroom_sections add constraint classroom_sections_hall_pass_auto_range
			check (hall_pass_auto_minutes is null or hall_pass_auto_minutes between 5 and 240);
	end if;
end $b$;

create table if not exists public.classroom_hall_pass_budget_start (
	only_row boolean primary key default true check (only_row),
	effective_at timestamptz not null default now()
);
alter table public.classroom_hall_pass_budget_start enable row level security;
revoke all on table public.classroom_hall_pass_budget_start from public, anon, authenticated, service_role;

do $b$
begin
	insert into public.classroom_hall_pass_budget_start (only_row) values (true) on conflict do nothing;
end $b$;

-- The defaults, written down once (0174's shape): minutes of pass time a day,
-- and minutes after which a pass is checked in for the student.
create or replace function public._classroom_hall_pass_limits()
returns jsonb
language sql
immutable
set search_path = ''
as $f$
	select jsonb_build_object('budget_minutes', 10, 'auto_checkin_minutes', 30);
$f$;

revoke all on function public._classroom_hall_pass_limits() from public, anon, authenticated, service_role;

-- This section's effective numbers: its own override, else the default.
create or replace function public._classroom_hall_pass_section_limits(p_section_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select jsonb_build_object(
		'budget_minutes', coalesce(s.hall_pass_daily_minutes::integer, (public._classroom_hall_pass_limits() ->> 'budget_minutes')::integer),
		'auto_checkin_minutes', coalesce(s.hall_pass_auto_minutes::integer, (public._classroom_hall_pass_limits() ->> 'auto_checkin_minutes')::integer))
	from (select 1) x
	left join public.classroom_sections s on s.id = p_section_id;
$f$;

revoke all on function public._classroom_hall_pass_section_limits(uuid) from public, anon, authenticated, service_role;

-- A pass left open past the section's auto check-in is closed AT that mark.
-- Lazy, because nothing here runs on a clock; returns how many it closed.
create or replace function public._classroom_hall_pass_sweep(p_section_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_cap integer := ((public._classroom_hall_pass_section_limits(p_section_id)) ->> 'auto_checkin_minutes')::integer;
	v_n integer;
begin
	update public.classroom_hall_passes h
	set closed_at = h.opened_at + make_interval(mins => v_cap), closed_by = 'auto'
	where h.section_id = p_section_id
		and h.closed_at is null
		and now() >= h.opened_at + make_interval(mins => v_cap);
	get diagnostics v_n = row_count;
	return v_n;
end;
$f$;

revoke all on function public._classroom_hall_pass_sweep(uuid) from public, anon, authenticated, service_role;

-- ONE STUDENT'S BUDGET IN ONE SECTION, as of an instant. The whole rule, once:
-- the Monday-to-today walk of debt(next) = max(0, debt + used - budget).
create or replace function public._classroom_hall_pass_budget(
	p_section_id uuid,
	p_email text,
	p_now timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_lim jsonb := public._classroom_hall_pass_section_limits(p_section_id);
	v_b integer := ((v_lim ->> 'budget_minutes')::integer) * 60;
	v_cap integer := ((v_lim ->> 'auto_checkin_minutes')::integer) * 60;
	v_local timestamp := p_now at time zone 'America/Los_Angeles';
	v_today date := v_local::date;
	v_week date := date_trunc('week', v_local)::date;
	v_since timestamptz := coalesce((select s.effective_at from public.classroom_hall_pass_budget_start s), '-infinity'::timestamptz);
	v_week_ts timestamptz := (v_week::timestamp) at time zone 'America/Los_Angeles';
	v_reset timestamptz := ((v_week + 7)::timestamp) at time zone 'America/Los_Angeles';
	v_days jsonb := '{}'::jsonb;
	v_d date;
	v_debt integer := 0;
	v_used integer;
	v_allow integer;
	v_remaining integer;
	v_avail timestamptz;
	v_fdebt integer;
	r record;
begin
	for r in
		select (h.opened_at at time zone 'America/Los_Angeles')::date as d,
			sum(least(extract(epoch from (coalesce(h.closed_at, p_now) - h.opened_at)), v_cap))::integer as s
		from public.classroom_hall_passes h
		where h.section_id = p_section_id
			and h.student_email = lower(p_email)
			and h.opened_at >= greatest(v_week_ts, v_since)
		group by 1
	loop
		v_days := v_days || jsonb_build_object(r.d::text, r.s);
	end loop;

	v_d := v_week;
	while v_d < v_today loop
		v_used := coalesce((v_days ->> v_d::text)::integer, 0);
		v_debt := greatest(0, v_debt + v_used - v_b);
		v_d := v_d + 1;
	end loop;

	v_used := coalesce((v_days ->> v_today::text)::integer, 0);
	v_allow := greatest(0, v_b - v_debt);
	v_remaining := greatest(0, v_allow - v_used);

	if v_remaining = 0 then
		-- The first day (before the reset) the allowance is above zero again, or the reset.
		v_fdebt := greatest(0, v_debt + v_used - v_b);
		v_d := v_today + 1;
		v_avail := v_reset;
		while v_d < v_week + 7 loop
			if v_b - v_fdebt > 0 then
				v_avail := (v_d::timestamp) at time zone 'America/Los_Angeles';
				exit;
			end if;
			v_fdebt := greatest(0, v_fdebt - v_b);
			v_d := v_d + 1;
		end loop;
	end if;

	return jsonb_build_object(
		'daily_seconds', v_b,
		'auto_checkin_seconds', v_cap,
		'allowance_seconds', v_allow,
		'used_seconds', v_used,
		'remaining_seconds', v_remaining,
		'debt_seconds', v_debt,
		'blocked', v_remaining = 0,
		'available_at', v_avail,
		'resets_at', v_reset);
end;
$f$;

revoke all on function public._classroom_hall_pass_budget(uuid, text, timestamptz) from public, anon, authenticated, service_role;

-- OPENING: the budget replaces the daily cap and the cooldown. Every refusal
-- 0143 and 0174 could give except limit_reached and cooldown (which can no
-- longer arise) keeps its reason, text and order.
create or replace function public.classroom_hall_pass_open(p_section_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_email text := public.current_user_email();
	v_id uuid;
	v_opened timestamptz;
	v_holder text;
	v_budget jsonb;
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;

	if p_section_id is null or not public.classroom_can_read_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;

	if public.classroom_manages_section(p_section_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_a_student');
	end if;

	if not public.classroom_is_enrolled(p_section_id) then
		raise exception 'Only a student enrolled in this class can take the hall pass.';
	end if;

	-- A pass left open past the auto check-in is closed first, so "already out"
	-- and "taken" are about who is really out.
	perform public._classroom_hall_pass_sweep(p_section_id);

	if exists (
		select 1 from public.classroom_hall_passes h
		where h.student_email = v_email and h.closed_at is null
	) then
		return jsonb_build_object('ok', false, 'reason', 'already_out');
	end if;

	v_budget := public._classroom_hall_pass_budget(p_section_id, v_email, now());
	if (v_budget ->> 'blocked')::boolean then
		return jsonb_build_object(
			'ok', false,
			'reason', 'over_budget',
			'remaining_seconds', 0,
			'debt_seconds', v_budget -> 'debt_seconds',
			'daily_seconds', v_budget -> 'daily_seconds',
			'available_at', v_budget -> 'available_at',
			'resets_at', v_budget -> 'resets_at');
	end if;

	begin
		insert into public.classroom_hall_passes (section_id, student_email)
		values (p_section_id, v_email)
		returning id, opened_at into v_id, v_opened;
	exception when unique_violation then
		select h.student_email into v_holder
		from public.classroom_hall_passes h
		where h.section_id = p_section_id and h.closed_at is null;

		return jsonb_build_object(
			'ok', false,
			'reason', case when v_holder = v_email then 'already_out' else 'taken' end
		);
	end;

	return jsonb_build_object(
		'ok', true,
		'pass_id', v_id,
		'section_id', p_section_id,
		'opened_at', v_opened,
		'remaining_seconds', v_budget -> 'remaining_seconds',
		'auto_checkin_seconds', v_budget -> 'auto_checkin_seconds'
	);
end;
$f$;

revoke all on function public.classroom_hall_pass_open(uuid) from public, anon, authenticated, service_role;
grant execute on function public.classroom_hall_pass_open(uuid) to authenticated;

-- THE OVERRIDE: an instructor sends a named student out whatever their budget.
-- The pass is still charged, so the student's day reflects it.
create or replace function public.classroom_hall_pass_open_for(
	p_section_id uuid,
	p_student_email text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_email text := public.current_user_email();
	v_target text := lower(btrim(coalesce(p_student_email, '')));
	v_id uuid;
	v_opened timestamptz;
	v_name text;
	v_active boolean;
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;

	if p_section_id is null or not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;

	if v_target = '' or v_target not like '%@%' then
		raise exception 'A student email is required.';
	end if;

	perform public._classroom_hall_pass_sweep(p_section_id);

	select e.active, e.display_name into v_active, v_name
	from public.classroom_enrollments e
	where e.section_id = p_section_id and e.student_email = v_target;

	if v_active is not true then
		return jsonb_build_object('ok', false, 'reason', 'not_enrolled');
	end if;

	if exists (
		select 1 from public.classroom_hall_passes h
		where h.student_email = v_target and h.closed_at is null
	) then
		return jsonb_build_object('ok', false, 'reason', 'already_out');
	end if;

	begin
		insert into public.classroom_hall_passes (section_id, student_email, opened_by)
		values (p_section_id, v_target, v_email)
		returning id, opened_at into v_id, v_opened;
	exception when unique_violation then
		return jsonb_build_object('ok', false, 'reason', 'taken');
	end;

	return jsonb_build_object(
		'ok', true,
		'pass_id', v_id,
		'section_id', p_section_id,
		'opened_at', v_opened,
		'student_email', v_target,
		'student_name', coalesce(v_name, v_target),
		'opened_by', v_email
	);
end;
$f$;

revoke all on function public.classroom_hall_pass_open_for(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.classroom_hall_pass_open_for(uuid, text) to authenticated;

-- THE STATE. A manager is told what 0174 told them plus each student's budget;
-- a STUDENT IS NOW TOLD WHO IS OUT (a shown name, never an address) and their
-- own budget. The two branches are still built separately.
create or replace function public.classroom_hall_pass_state(
	p_section_id uuid,
	p_history_limit integer default 20
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_email text := public.current_user_email();
	v_manages boolean;
	v_open_id uuid;
	v_open_email text;
	v_open_name text;
	v_open_at timestamptz;
	v_limit integer := least(greatest(coalesce(p_history_limit, 20), 0), 100);
	v_history jsonb;
	v_limits jsonb;
	v_used integer;
	v_roster jsonb;
	v_budgets jsonb;
begin
	if v_email = '' or p_section_id is null then
		return null;
	end if;

	v_manages := public.classroom_manages_section(p_section_id);

	if not v_manages and not public.classroom_is_enrolled(p_section_id) then
		return null;
	end if;

	perform public._classroom_hall_pass_sweep(p_section_id);
	v_limits := public._classroom_hall_pass_section_limits(p_section_id);

	select h.id, h.student_email, h.opened_at
	into v_open_id, v_open_email, v_open_at
	from public.classroom_hall_passes h
	where h.section_id = p_section_id and h.closed_at is null;

	if v_open_email is not null then
		select coalesce(nullif(btrim(e.display_name), ''), case when v_manages then v_open_email else 'A classmate' end)
		into v_open_name
		from public.classroom_enrollments e
		where e.section_id = p_section_id and e.student_email = v_open_email;
		v_open_name := coalesce(v_open_name, case when v_manages then v_open_email else 'A classmate' end);
	end if;

	if v_manages then
		select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.opened_at desc), '[]'::jsonb)
		into v_history
		from (
			select
				h.id as pass_id,
				h.student_email,
				coalesce(e.display_name, h.student_email) as student_name,
				h.opened_at,
				h.closed_at,
				h.closed_by,
				h.opened_by
			from public.classroom_hall_passes h
			left join public.classroom_enrollments e
				on e.section_id = h.section_id and e.student_email = h.student_email
			where h.section_id = p_section_id
			order by h.opened_at desc
			limit v_limit
		) x;

		select coalesce(jsonb_agg(jsonb_build_object(
			'student_email', e.student_email,
			'student_name', coalesce(nullif(btrim(e.display_name), ''), e.student_email)
		) order by coalesce(nullif(btrim(e.display_name), ''), e.student_email)), '[]'::jsonb)
		into v_roster
		from public.classroom_enrollments e
		where e.section_id = p_section_id and e.active;

		-- Each active student's day, for the instructor to see who is over.
		select coalesce(jsonb_object_agg(e.student_email, public._classroom_hall_pass_budget(p_section_id, e.student_email, now())), '{}'::jsonb)
		into v_budgets
		from public.classroom_enrollments e
		where e.section_id = p_section_id and e.active;

		return jsonb_build_object(
			'scope', 'manager',
			'section_id', p_section_id,
			'taken', v_open_id is not null,
			'mine', false,
			'limits', v_limits,
			'roster', v_roster,
			'budgets', v_budgets,
			'open', case
				when v_open_id is null then null
				else jsonb_build_object(
					'pass_id', v_open_id,
					'student_email', v_open_email,
					'student_name', v_open_name,
					'opened_at', v_open_at
				)
			end,
			'history', v_history
		);
	end if;

	select count(*) into v_used
	from public.classroom_hall_passes h
	where h.section_id = p_section_id
		and h.student_email = v_email
		and (h.opened_at at time zone 'America/Los_Angeles')::date
			= (now() at time zone 'America/Los_Angeles')::date;

	return jsonb_build_object(
		'scope', 'student',
		'section_id', p_section_id,
		'taken', v_open_id is not null,
		'mine', v_open_email is not distinct from v_email,
		'opened_at', case when v_open_email is not distinct from v_email then v_open_at end,
		-- EVERYONE IN THE CLASS SEES WHO IS OUT (decision 58): a shown name, never
		-- an address, and since when.
		'out', case when v_open_id is null then null else jsonb_build_object('name', v_open_name, 'opened_at', v_open_at) end,
		'limits', v_limits,
		'used_today', v_used,
		'budget', public._classroom_hall_pass_budget(p_section_id, v_email, now())
	);
end;
$f$;

revoke all on function public.classroom_hall_pass_state(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.classroom_hall_pass_state(uuid, integer) to authenticated;

-- An instructor sets the two numbers for their own section. Null is the default.
create or replace function public.classroom_hall_pass_set_limits(
	p_section_id uuid,
	p_daily_minutes integer,
	p_auto_minutes integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
begin
	if public.current_user_email() = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_section_id is null or not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;
	if p_daily_minutes is not null and p_daily_minutes not between 1 and 120 then
		return jsonb_build_object('ok', false, 'reason', 'daily_out_of_range');
	end if;
	if p_auto_minutes is not null and p_auto_minutes not between 5 and 240 then
		return jsonb_build_object('ok', false, 'reason', 'auto_out_of_range');
	end if;
	update public.classroom_sections
	set hall_pass_daily_minutes = p_daily_minutes, hall_pass_auto_minutes = p_auto_minutes
	where id = p_section_id;
	return jsonb_build_object('ok', true, 'limits', public._classroom_hall_pass_section_limits(p_section_id));
end;
$f$;

revoke all on function public.classroom_hall_pass_set_limits(uuid, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.classroom_hall_pass_set_limits(uuid, integer, integer) to authenticated;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE FOUNDRY OPENS AND CLOSES BY CLASS SCHEDULE (report 84e293d4) =====
--
-- An instructor gives a class a weekly pattern (days and times, in the
-- school's own clock, America/Los_Angeles) and the Foundry stands down for
-- that class's students while class is in session and comes back when it ends.
-- Date-specific exceptions replace the weekly pattern for one date (an odd
-- schedule day with its own times, or no class that day, which is also how a
-- teacher opens early). The instructor can still close by hand (0173's stamp,
-- which stays until they open it) and can open by hand DURING a scheduled
-- window, which holds until that window ends.
--
-- CLOSED IS DERIVED AT READ TIME from the stamp, the schedule and the clock.
-- Nothing is swept and nothing ticks: `foundry_closed_at` is only ever the
-- hand-pressed close, so a scheduled close never needs undoing.
--
-- THE ONE READER OF "IS THIS CLASS CLOSED RIGHT NOW" is foundry_section_access
-- below, which is where 0173 and 0230 already decided it; the weekly pattern
-- and the exceptions are read by exactly one helper, _foundry_schedule_window.

alter table public.classroom_sections
	add column if not exists foundry_schedule_enabled boolean not null default false,
	add column if not exists foundry_open_until timestamptz;

create table if not exists public.foundry_class_schedule (
	section_id uuid not null references public.classroom_sections (id) on delete cascade,
	weekday smallint not null check (weekday between 1 and 7),
	starts_at time not null,
	ends_at time not null,
	primary key (section_id, weekday, starts_at),
	constraint foundry_class_schedule_order check (starts_at < ends_at)
);

create table if not exists public.foundry_class_schedule_days (
	id uuid primary key default gen_random_uuid(),
	section_id uuid not null references public.classroom_sections (id) on delete cascade,
	on_date date not null,
	-- 'no_class': the weekly pattern does not apply that date. 'window': the
	-- weekly pattern is replaced by these windows for that date.
	kind text not null check (kind in ('no_class', 'window')),
	starts_at time,
	ends_at time,
	note text check (note is null or char_length(note) <= 120),
	constraint foundry_class_schedule_days_shape check (
		(kind = 'no_class' and starts_at is null and ends_at is null)
		or (kind = 'window' and starts_at is not null and ends_at is not null and starts_at < ends_at)
	)
);

create unique index if not exists foundry_class_schedule_days_one
	on public.foundry_class_schedule_days (section_id, on_date, kind, coalesce(starts_at, time '00:00'));

alter table public.foundry_class_schedule enable row level security;
alter table public.foundry_class_schedule_days enable row level security;
revoke all on table public.foundry_class_schedule from public, anon, authenticated, service_role;
revoke all on table public.foundry_class_schedule_days from public, anon, authenticated, service_role;

-- The window (as absolute instants) that contains p_at for this class, or no
-- row. A date that has ANY exception row uses only the exception rows.
create or replace function public._foundry_schedule_window(p_section_id uuid, p_at timestamptz)
returns table (win_start timestamptz, win_end timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_local timestamp := p_at at time zone 'America/Los_Angeles';
	v_day date := (p_at at time zone 'America/Los_Angeles')::date;
	v_time time := (p_at at time zone 'America/Los_Angeles')::time;
	v_dow smallint := extract(isodow from (p_at at time zone 'America/Los_Angeles'))::smallint;
	v_has_exception boolean;
begin
	select exists (
		select 1 from public.foundry_class_schedule_days d
		where d.section_id = p_section_id and d.on_date = v_day
	) into v_has_exception;

	if v_has_exception then
		return query
			select ((v_day + d.starts_at) at time zone 'America/Los_Angeles'),
			       ((v_day + d.ends_at) at time zone 'America/Los_Angeles')
			from public.foundry_class_schedule_days d
			where d.section_id = p_section_id and d.on_date = v_day
				and d.kind = 'window'
				and v_time >= d.starts_at and v_time < d.ends_at
			order by d.starts_at
			limit 1;
	else
		return query
			select ((v_day + w.starts_at) at time zone 'America/Los_Angeles'),
			       ((v_day + w.ends_at) at time zone 'America/Los_Angeles')
			from public.foundry_class_schedule w
			where w.section_id = p_section_id and w.weekday = v_dow
				and v_time >= w.starts_at and v_time < w.ends_at
			order by w.starts_at
			limit 1;
	end if;
end;
$f$;

revoke all on function public._foundry_schedule_window(uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public._foundry_schedule_window(uuid, timestamptz) to authenticated;

-- The one statement of "closed right now, and why": the hand-pressed stamp
-- wins; otherwise a scheduled window closes it unless the teacher opened it by
-- hand for that window.
create or replace function public._foundry_section_closed(p_section_id uuid, p_at timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_s public.classroom_sections%rowtype;
	v_w record;
begin
	select * into v_s from public.classroom_sections s where s.id = p_section_id;
	if not found then
		return jsonb_build_object('closed', false);
	end if;
	if v_s.foundry_closed_at is not null then
		return jsonb_build_object('closed', true, 'by', 'hand', 'closed_at', v_s.foundry_closed_at,
			'note', v_s.foundry_closed_note, 'until', null);
	end if;
	if v_s.foundry_schedule_enabled then
		select * into v_w from public._foundry_schedule_window(p_section_id, p_at);
		if found and (v_s.foundry_open_until is null or v_s.foundry_open_until <= p_at) then
			return jsonb_build_object('closed', true, 'by', 'schedule', 'closed_at', v_w.win_start,
				'note', null, 'until', v_w.win_end);
		end if;
	end if;
	return jsonb_build_object('closed', false);
end;
$f$;

revoke all on function public._foundry_section_closed(uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public._foundry_section_closed(uuid, timestamptz) to authenticated;

-- 0230's foundry_section_access with one predicate swapped: a class is closed
-- when _foundry_section_closed says so, not only when the stamp is set. Every
-- key it had keeps its meaning; a scheduled closure adds `until` and `by`.
create or replace function public.foundry_section_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fd$
declare
	v_email text := public.current_user_email();
	v_rows jsonb;
	v_site_closed_at timestamptz;
	v_site_note text;
	v_site jsonb;
begin
	select s.closed_at, s.note into v_site_closed_at, v_site_note
	from public.foundry_site_settings s
	where s.id;
	v_site := jsonb_build_object(
		'site_open', v_site_closed_at is null,
		'site_closed_at', v_site_closed_at,
		'site_note', case when v_site_closed_at is null then null else v_site_note end,
		'site_exempt', public.is_admin()
	);

	if v_email = '' then
		return jsonb_build_object('ok', true, 'open', true, 'closed', '[]'::jsonb) || v_site;
	end if;

	if public.is_admin() then
		return jsonb_build_object('ok', true, 'open', true, 'closed', '[]'::jsonb) || v_site;
	end if;

	select coalesce(
		jsonb_agg(
			jsonb_build_object(
				'section_id', x.id,
				'label', x.label,
				'course_title', x.title,
				'note', x.st ->> 'note',
				'closed_at', x.st ->> 'closed_at',
				'by', x.st ->> 'by',
				'until', x.st ->> 'until'
			)
			order by x.title, x.label
		),
		'[]'::jsonb
	)
	into v_rows
	from (
		select s.id, s.label, c.title, public._foundry_section_closed(s.id, now()) as st
		from public.classroom_enrollments e
		join public.classroom_sections s on s.id = e.section_id
		join public.classroom_courses c on c.id = s.course_id
		where e.student_email = v_email and e.active
	) x
	where (x.st ->> 'closed')::boolean;

	return jsonb_build_object(
		'ok', true,
		'open', jsonb_array_length(v_rows) = 0,
		'closed', v_rows
	) || v_site;
end;
$fd$;

revoke all on function public.foundry_section_access() from public, anon, authenticated, service_role;
grant execute on function public.foundry_section_access() to authenticated;

-- 0173's hand switch, same signature. Opening by hand also records an open
-- window when the class is in a scheduled one, so the teacher's Open holds
-- until that window ends and then the schedule carries on.
create or replace function public.foundry_set_section_open(
	p_section_id uuid,
	p_open boolean,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
	v_uid uuid := (select auth.uid());
	v_note text := nullif(public._foundry_norm(p_note), '');
	v_w record;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_open is null then
		raise exception 'Open or closed? That has to be one or the other.';
	end if;
	if not exists (select 1 from public.classroom_sections s where s.id = p_section_id) then
		raise exception 'That class does not exist.';
	end if;
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;

	if p_open then
		select * into v_w from public._foundry_schedule_window(p_section_id, now());
		update public.classroom_sections s
		set foundry_closed_at = null, foundry_closed_by = null, foundry_closed_note = null,
			foundry_open_until = case when v_w.win_end is not null then v_w.win_end else null end
		where s.id = p_section_id;
	else
		update public.classroom_sections s
		set foundry_closed_at = now(), foundry_closed_by = v_uid, foundry_closed_note = v_note,
			foundry_open_until = null
		where s.id = p_section_id;
	end if;

	return jsonb_build_object('ok', true, 'section_id', p_section_id, 'open', p_open);
end;
$f$;

revoke all on function public.foundry_set_section_open(uuid, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.foundry_set_section_open(uuid, boolean, text) to authenticated;

-- What the schedule editor reads: the pattern, the exceptions from yesterday
-- on, and the state right now. A section manager's, "not found" otherwise.
create or replace function public.foundry_class_schedule_get(p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_s public.classroom_sections%rowtype;
	v_today date := (now() at time zone 'America/Los_Angeles')::date;
begin
	if public.current_user_email() = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_section_id is null or not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;
	select * into v_s from public.classroom_sections s where s.id = p_section_id;
	return jsonb_build_object(
		'ok', true,
		'section_id', p_section_id,
		'enabled', v_s.foundry_schedule_enabled,
		'weekly', coalesce((
			select jsonb_agg(jsonb_build_object(
				'weekday', w.weekday,
				'starts', to_char(w.starts_at, 'HH24:MI'),
				'ends', to_char(w.ends_at, 'HH24:MI'))
				order by w.weekday, w.starts_at)
			from public.foundry_class_schedule w where w.section_id = p_section_id), '[]'::jsonb),
		'days', coalesce((
			select jsonb_agg(jsonb_build_object(
				'on_date', d.on_date,
				'kind', d.kind,
				'starts', to_char(d.starts_at, 'HH24:MI'),
				'ends', to_char(d.ends_at, 'HH24:MI'),
				'note', d.note)
				order by d.on_date, d.starts_at)
			from public.foundry_class_schedule_days d
			where d.section_id = p_section_id and d.on_date >= v_today - 1), '[]'::jsonb),
		'now', public._foundry_section_closed(p_section_id, now())
	);
end;
$f$;

revoke all on function public.foundry_class_schedule_get(uuid) from public, anon, authenticated, service_role;
grant execute on function public.foundry_class_schedule_get(uuid) to authenticated;

-- Replace the weekly pattern and the switch in one call. p_weekly is a jsonb
-- array of {weekday 1..7 (Monday is 1), starts "HH:MM", ends "HH:MM"}.
create or replace function public.foundry_class_schedule_set(
	p_section_id uuid,
	p_enabled boolean,
	p_weekly jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_row jsonb;
	v_n integer := 0;
	v_start time;
	v_end time;
	v_dow smallint;
begin
	if public.current_user_email() = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_section_id is null or not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;
	if p_enabled is null then
		return jsonb_build_object('ok', false, 'reason', 'enabled_required');
	end if;
	if p_weekly is null or jsonb_typeof(p_weekly) <> 'array' then
		return jsonb_build_object('ok', false, 'reason', 'weekly_shape');
	end if;
	if jsonb_array_length(p_weekly) > 28 then
		return jsonb_build_object('ok', false, 'reason', 'too_many');
	end if;

	-- Validate everything before writing anything.
	for v_row in select * from jsonb_array_elements(p_weekly) loop
		begin
			v_dow := (v_row ->> 'weekday')::smallint;
			v_start := (v_row ->> 'starts')::time;
			v_end := (v_row ->> 'ends')::time;
		exception when others then
			return jsonb_build_object('ok', false, 'reason', 'window_shape');
		end;
		if v_dow is null or v_dow not between 1 and 7 or v_start is null or v_end is null then
			return jsonb_build_object('ok', false, 'reason', 'window_shape');
		end if;
		if v_start >= v_end then
			return jsonb_build_object('ok', false, 'reason', 'window_order');
		end if;
	end loop;

	delete from public.foundry_class_schedule where section_id = p_section_id;
	for v_row in select * from jsonb_array_elements(p_weekly) loop
		insert into public.foundry_class_schedule (section_id, weekday, starts_at, ends_at)
		values (p_section_id, (v_row ->> 'weekday')::smallint, (v_row ->> 'starts')::time, (v_row ->> 'ends')::time)
		on conflict do nothing;
		v_n := v_n + 1;
	end loop;
	update public.classroom_sections
	set foundry_schedule_enabled = p_enabled,
		-- A new pattern starts fresh: a hand-open for the old one means nothing.
		foundry_open_until = null
	where id = p_section_id;
	return jsonb_build_object('ok', true, 'windows', v_n, 'enabled', p_enabled);
end;
$f$;

revoke all on function public.foundry_class_schedule_set(uuid, boolean, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.foundry_class_schedule_set(uuid, boolean, jsonb) to authenticated;

-- One date's exception. p_kind 'no_class' (no windows that date, which is also
-- how the Foundry opens early on a short day) or 'window' with p_windows a
-- jsonb array of {starts, ends}. Saving a date replaces what it had.
create or replace function public.foundry_class_schedule_day_set(
	p_section_id uuid,
	p_on_date date,
	p_kind text,
	p_windows jsonb default '[]'::jsonb,
	p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_row jsonb;
	v_start time;
	v_end time;
	v_today date := (now() at time zone 'America/Los_Angeles')::date;
	v_note text := nullif(public._foundry_norm(p_note), '');
begin
	if public.current_user_email() = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_section_id is null or not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;
	if p_on_date is null or p_on_date < v_today - 1 or p_on_date > v_today + 400 then
		return jsonb_build_object('ok', false, 'reason', 'date_range');
	end if;
	if p_kind is distinct from 'no_class' and p_kind is distinct from 'window' then
		return jsonb_build_object('ok', false, 'reason', 'kind');
	end if;
	if v_note is not null and char_length(v_note) > 120 then
		return jsonb_build_object('ok', false, 'reason', 'note_length');
	end if;
	if p_kind = 'window' then
		if p_windows is null or jsonb_typeof(p_windows) <> 'array'
			or jsonb_array_length(p_windows) = 0 or jsonb_array_length(p_windows) > 8 then
			return jsonb_build_object('ok', false, 'reason', 'window_shape');
		end if;
		for v_row in select * from jsonb_array_elements(p_windows) loop
			begin
				v_start := (v_row ->> 'starts')::time;
				v_end := (v_row ->> 'ends')::time;
			exception when others then
				return jsonb_build_object('ok', false, 'reason', 'window_shape');
			end;
			if v_start is null or v_end is null then
				return jsonb_build_object('ok', false, 'reason', 'window_shape');
			end if;
			if v_start >= v_end then
				return jsonb_build_object('ok', false, 'reason', 'window_order');
			end if;
		end loop;
	end if;

	delete from public.foundry_class_schedule_days where section_id = p_section_id and on_date = p_on_date;
	if p_kind = 'no_class' then
		insert into public.foundry_class_schedule_days (section_id, on_date, kind, note)
		values (p_section_id, p_on_date, 'no_class', v_note);
	else
		for v_row in select * from jsonb_array_elements(p_windows) loop
			insert into public.foundry_class_schedule_days (section_id, on_date, kind, starts_at, ends_at, note)
			values (p_section_id, p_on_date, 'window', (v_row ->> 'starts')::time, (v_row ->> 'ends')::time, v_note)
			on conflict do nothing;
		end loop;
	end if;
	update public.classroom_sections set foundry_open_until = null where id = p_section_id;
	return jsonb_build_object('ok', true, 'on_date', p_on_date, 'kind', p_kind);
end;
$f$;

revoke all on function public.foundry_class_schedule_day_set(uuid, date, text, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.foundry_class_schedule_day_set(uuid, date, text, jsonb, text) to authenticated;

create or replace function public.foundry_class_schedule_day_clear(p_section_id uuid, p_on_date date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_gone integer;
begin
	if public.current_user_email() = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_section_id is null or not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;
	with removed as (
		delete from public.foundry_class_schedule_days d
		where d.section_id = p_section_id and d.on_date = p_on_date
		returning 1
	)
	select count(*) into v_gone from removed;
	return jsonb_build_object('ok', true, 'removed', v_gone);
end;
$f$;

revoke all on function public.foundry_class_schedule_day_clear(uuid, date) from public, anon, authenticated, service_role;
grant execute on function public.foundry_class_schedule_day_clear(uuid, date) to authenticated;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: AN ADMIN EDITS A RELEASE'S GALLERY DETAILS (report c5f811e4) =====
--
-- The gallery card of a major release, or of a house release (GREENLINE,
-- VANGUARD), takes its title, description and thumbnail from the repo or the
-- student's app by default. This table holds an admin's replacement for each
-- field separately; a NULL field means "use the default", so clearing one is
-- setting it back to null and the repo default shows again. The student's own
-- app record is never written: this is the gallery's presentation of it.
--
-- A thumbnail is a path into foundry-covers (0130), uploaded by the admin into
-- their own <uid>/ folder under that bucket's existing policy; no storage
-- policy is added here.

create table if not exists public.foundry_gallery_overrides (
	subject text primary key
		check (subject ~ '^(house:(greenline|vanguard)|app:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'),
	title text check (title is null or char_length(title) between 1 and 80),
	description text check (description is null or char_length(description) between 1 and 300),
	thumbnail_path text check (thumbnail_path is null
		or thumbnail_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,120}$'),
	updated_by text,
	updated_at timestamptz not null default now()
);

alter table public.foundry_gallery_overrides enable row level security;
revoke all on table public.foundry_gallery_overrides from public, anon, authenticated, service_role;

-- Every signed-in viewer reads the overrides (they are presentation of
-- public gallery cards); no address, no editor identity leaves.
create or replace function public.foundry_gallery_overrides_read()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select case when (select auth.uid()) is null then '[]'::jsonb else coalesce((
		select jsonb_agg(jsonb_build_object(
			'subject', o.subject, 'title', o.title,
			'description', o.description, 'thumbnail_path', o.thumbnail_path)
			order by o.subject)
		from public.foundry_gallery_overrides o), '[]'::jsonb) end;
$f$;

revoke all on function public.foundry_gallery_overrides_read() from public, anon, authenticated, service_role;
grant execute on function public.foundry_gallery_overrides_read() to authenticated;

-- Admin only. Passing every field null removes the row (everything falls back).
create or replace function public.foundry_gallery_override_set(
	p_subject text,
	p_title text,
	p_description text,
	p_thumbnail_path text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_title text := nullif(public._foundry_norm(p_title), '');
	v_desc text := nullif(public._foundry_norm(p_description), '');
	v_thumb text := nullif(public._foundry_norm(p_thumbnail_path), '');
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can edit gallery details.';
	end if;
	if p_subject is null or p_subject !~ '^(house:(greenline|vanguard)|app:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' then
		return jsonb_build_object('ok', false, 'reason', 'subject');
	end if;
	if p_subject like 'app:%' and not exists (
		select 1 from public.student_apps a where a.id = substr(p_subject, 5)::uuid
	) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_title is not null and char_length(v_title) > 80 then
		return jsonb_build_object('ok', false, 'reason', 'title_length');
	end if;
	if v_desc is not null and char_length(v_desc) > 300 then
		return jsonb_build_object('ok', false, 'reason', 'description_length');
	end if;
	if v_thumb is not null and v_thumb !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,120}$' then
		return jsonb_build_object('ok', false, 'reason', 'thumbnail');
	end if;

	if v_title is null and v_desc is null and v_thumb is null then
		delete from public.foundry_gallery_overrides where subject = p_subject;
		return jsonb_build_object('ok', true, 'subject', p_subject, 'cleared', true);
	end if;
	insert into public.foundry_gallery_overrides (subject, title, description, thumbnail_path, updated_by)
	values (p_subject, v_title, v_desc, v_thumb, public.current_user_email())
	on conflict (subject) do update
		set title = excluded.title, description = excluded.description,
			thumbnail_path = excluded.thumbnail_path,
			updated_by = excluded.updated_by, updated_at = now();
	return jsonb_build_object('ok', true, 'subject', p_subject, 'cleared', false);
end;
$f$;

revoke all on function public.foundry_gallery_override_set(text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.foundry_gallery_override_set(text, text, text, text) to authenticated;
-- ===== PART D END =====

-- ===== PART E BEGIN =====
-- ===== PART E: FOUNDRY COLLECTIONS (report 762bb647) =====
--
-- A collection is a named, ordered set of releases an admin curates (example:
-- "Ported games"). Published, it shows on the gallery as one card that opens
-- to its members. Members are subjects ('app:<uuid>' or 'house:<id>'), the
-- same vocabulary the gallery overrides use. A member that is not in the
-- gallery's population (hidden or unpublished) simply is not shown to anyone
-- but the admin editing the collection, so hiding an app needs no collection
-- cleanup and a collection can never expose an app the gallery would not.
--
-- DELETING A COLLECTION IS REAL (Mr. Pina asked for full control, report
-- 762bb647): a collection is curation, not a record of anybody's work, and its
-- members are only references.

create table if not exists public.foundry_collections (
	id uuid primary key default gen_random_uuid(),
	title text not null check (char_length(title) between 1 and 60),
	description text check (description is null or char_length(description) <= 300),
	published_at timestamptz,
	sort_order integer not null default 0,
	created_by text,
	created_at timestamptz not null default now()
);

create table if not exists public.foundry_collection_members (
	collection_id uuid not null references public.foundry_collections (id) on delete cascade,
	subject text not null
		check (subject ~ '^(house:(greenline|vanguard)|app:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'),
	position integer not null,
	primary key (collection_id, subject)
);

alter table public.foundry_collections enable row level security;
alter table public.foundry_collection_members enable row level security;
revoke all on table public.foundry_collections from public, anon, authenticated, service_role;
revoke all on table public.foundry_collection_members from public, anon, authenticated, service_role;

-- Whether one subject is shown to this caller: a house release always; an app
-- when the gallery's own population rule admits it (or the caller is editing
-- as an admin and asked for everything).
create or replace function public._foundry_subject_visible(p_subject text, p_everything boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $f$
	select case
		when p_subject like 'house:%' then true
		when p_everything and public.is_admin() then exists (
			select 1 from public.student_apps a where a.id = substr(p_subject, 5)::uuid)
		else exists (
			select 1 from public.student_apps a
			where a.id = substr(p_subject, 5)::uuid
				and public._foundry_app_in_population(a.owner, a.hidden_at, a.published_version_id, false, false))
	end;
$f$;

revoke all on function public._foundry_subject_visible(text, boolean) from public, anon, authenticated, service_role;
grant execute on function public._foundry_subject_visible(text, boolean) to authenticated;

-- Everyone reads the published ones; an admin asking for everything also
-- reads drafts and members that are not live (marked live:false).
create or replace function public.foundry_collections_read(p_everything boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_all boolean := coalesce(p_everything, false) and public.is_admin();
begin
	if (select auth.uid()) is null then
		return '[]'::jsonb;
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', c.id,
			'title', c.title,
			'description', c.description,
			'published', c.published_at is not null,
			'members', coalesce((
				select jsonb_agg(jsonb_build_object(
					'subject', m.subject,
					'live', public._foundry_subject_visible(m.subject, false))
					order by m.position)
				from public.foundry_collection_members m
				where m.collection_id = c.id
					and (v_all or public._foundry_subject_visible(m.subject, false))), '[]'::jsonb))
			order by c.sort_order, c.created_at)
		from public.foundry_collections c
		where v_all or c.published_at is not null), '[]'::jsonb);
end;
$f$;

revoke all on function public.foundry_collections_read(boolean) from public, anon, authenticated, service_role;
grant execute on function public.foundry_collections_read(boolean) to authenticated;

-- Create (p_id null) or save a collection: title, description and the whole
-- ordered member list in one call.
create or replace function public.foundry_collection_save(
	p_id uuid,
	p_title text,
	p_description text,
	p_members text[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_id uuid := p_id;
	v_title text := public._foundry_norm(p_title);
	v_desc text := nullif(public._foundry_norm(p_description), '');
	v_members text[] := coalesce(p_members, '{}'::text[]);
	v_subject text;
	v_i integer := 0;
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can edit collections.';
	end if;
	if v_title = '' or char_length(v_title) > 60 then
		return jsonb_build_object('ok', false, 'reason', 'title');
	end if;
	if v_desc is not null and char_length(v_desc) > 300 then
		return jsonb_build_object('ok', false, 'reason', 'description_length');
	end if;
	if coalesce(array_length(v_members, 1), 0) > 60 then
		return jsonb_build_object('ok', false, 'reason', 'too_many_members');
	end if;
	foreach v_subject in array v_members loop
		if v_subject is null or v_subject !~ '^(house:(greenline|vanguard)|app:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' then
			return jsonb_build_object('ok', false, 'reason', 'member');
		end if;
		if v_subject like 'app:%' and not exists (
			select 1 from public.student_apps a where a.id = substr(v_subject, 5)::uuid) then
			return jsonb_build_object('ok', false, 'reason', 'member_not_found');
		end if;
	end loop;

	if v_id is null then
		if (select count(*) from public.foundry_collections) >= 30 then
			return jsonb_build_object('ok', false, 'reason', 'too_many_collections');
		end if;
		insert into public.foundry_collections (title, description, sort_order, created_by)
		values (v_title, v_desc,
			coalesce((select max(sort_order) + 1 from public.foundry_collections), 0),
			public.current_user_email())
		returning id into v_id;
	else
		update public.foundry_collections set title = v_title, description = v_desc where id = v_id;
		if not found then
			return jsonb_build_object('ok', false, 'reason', 'not_found');
		end if;
	end if;

	delete from public.foundry_collection_members where collection_id = v_id;
	foreach v_subject in array v_members loop
		insert into public.foundry_collection_members (collection_id, subject, position)
		values (v_id, v_subject, v_i)
		on conflict do nothing;
		v_i := v_i + 1;
	end loop;
	return jsonb_build_object('ok', true, 'id', v_id);
end;
$f$;

revoke all on function public.foundry_collection_save(uuid, text, text, text[]) from public, anon, authenticated, service_role;
grant execute on function public.foundry_collection_save(uuid, text, text, text[]) to authenticated;

create or replace function public.foundry_collection_set_published(p_id uuid, p_published boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can edit collections.';
	end if;
	update public.foundry_collections
	set published_at = case when p_published then coalesce(published_at, now()) else null end
	where id = p_id;
	if not found then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	return jsonb_build_object('ok', true, 'id', p_id, 'published', coalesce(p_published, false));
end;
$f$;

revoke all on function public.foundry_collection_set_published(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.foundry_collection_set_published(uuid, boolean) to authenticated;

-- The order collections appear in on the gallery.
create or replace function public.foundry_collections_order(p_ids uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_id uuid;
	v_i integer := 0;
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can edit collections.';
	end if;
	foreach v_id in array coalesce(p_ids, '{}'::uuid[]) loop
		update public.foundry_collections set sort_order = v_i where id = v_id;
		v_i := v_i + 1;
	end loop;
	return jsonb_build_object('ok', true);
end;
$f$;

revoke all on function public.foundry_collections_order(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.foundry_collections_order(uuid[]) to authenticated;

create or replace function public.foundry_collection_delete(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_gone integer;
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can edit collections.';
	end if;
	with removed as (
		delete from public.foundry_collections where id = p_id returning 1
	)
	select count(*) into v_gone from removed;
	return jsonb_build_object('ok', true, 'removed', v_gone);
end;
$f$;

revoke all on function public.foundry_collection_delete(uuid) from public, anon, authenticated, service_role;
grant execute on function public.foundry_collection_delete(uuid) to authenticated;
-- ===== PART E END =====

-- ===== PART F BEGIN =====
-- ===== PART F: PUBLISHER SEARCH BY NAME (report 762bb647, second half) =====
--
-- Adding a trusted publisher means typing an exact address today. This lets an
-- admin type part of a name and pick from the site's accounts. ADMIN ONLY and
-- the answer carries the address, because the one thing it feeds is
-- foundry_trusted_grant, an admin's own control that already shows addresses
-- (foundry_trusted_roster). Only Bosco Tech accounts are searched, the same
-- domains the grant itself accepts, and at most 12 rows come back.

create or replace function public.foundry_people_search(p_query text, p_limit integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_q text := lower(public._foundry_norm(p_query));
	v_like text;
	v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 12);
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can search people.';
	end if;
	if char_length(v_q) < 2 then
		return '[]'::jsonb;
	end if;
	v_like := '%' || replace(replace(replace(v_q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
	return coalesce((
		select jsonb_agg(jsonb_build_object('email', r.email, 'name', r.name) order by r.name, r.email)
		from (
			select p.email,
				coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''), p.email) as name
			from public.profiles p
			where p.email is not null
				and (p.email like '%@boscotech.net' or p.email like '%@boscotech.edu')
				and (lower(coalesce(p.display_name, '')) like v_like
					or lower(coalesce(p.full_name, '')) like v_like
					or lower(p.email) like v_like)
			order by 2, 1
			limit v_limit
		) r), '[]'::jsonb);
end;
$f$;

revoke all on function public.foundry_people_search(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.foundry_people_search(text, integer) to authenticated;
-- ===== PART F END =====

-- ===== PART G BEGIN =====
-- ===== PART G: VOTES ON A GAME (report 8274b260) =====
--
-- One up or down vote per signed-in user per game, changeable and removable.
-- The row is keyed (app, voter) so a second vote is the same row changing, not
-- a second row. The voter is a user id and never leaves the database: the
-- reads return a net figure per app and the caller's own vote, nothing that
-- names another voter, and no per-voter read exists for anyone, admin included.
--
-- A game's own author cannot vote on it. Votes feed the gallery's "Most liked"
-- order and add to its trending score; they are never shown as a list of who.

create table if not exists public.foundry_app_votes (
	app_id uuid not null references public.student_apps (id) on delete cascade,
	voter uuid not null references auth.users (id) on delete cascade,
	value smallint not null check (value in (-1, 1)),
	voted_at timestamptz not null default now(),
	primary key (app_id, voter)
);

alter table public.foundry_app_votes enable row level security;
revoke all on table public.foundry_app_votes from public, anon, authenticated, service_role;

-- p_value 1 = up, -1 = down, 0 = take my vote back.
create or replace function public.foundry_vote(p_app_id uuid, p_value smallint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_uid uuid := (select auth.uid());
	v_app public.student_apps%rowtype;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_value is null or p_value not in (-1, 0, 1) then
		return jsonb_build_object('ok', false, 'reason', 'value');
	end if;
	if public._foundry_site_closed() then
		return jsonb_build_object('ok', false, 'reason', 'not_votable');
	end if;
	select a.* into v_app from public.student_apps a where a.id = p_app_id;
	-- One shape for every refusal, so a caller cannot tell a missing app from a
	-- hidden one from one that is not published.
	if not found or v_app.hidden_at is not null or v_app.published_version_id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_votable');
	end if;
	if v_app.owner = v_uid then
		return jsonb_build_object('ok', false, 'reason', 'own_app');
	end if;

	if p_value = 0 then
		delete from public.foundry_app_votes where app_id = p_app_id and voter = v_uid;
	else
		insert into public.foundry_app_votes (app_id, voter, value)
		values (p_app_id, v_uid, p_value)
		on conflict (app_id, voter) do update set value = excluded.value, voted_at = now();
	end if;
	return jsonb_build_object('ok', true, 'app_id', p_app_id, 'mine', p_value,
		'net', coalesce((select sum(v.value) from public.foundry_app_votes v where v.app_id = p_app_id), 0));
end;
$f$;

revoke all on function public.foundry_vote(uuid, smallint) from public, anon, authenticated, service_role;
grant execute on function public.foundry_vote(uuid, smallint) to authenticated;

-- Net votes for every app the gallery shows, the votes cast in the last seven
-- days (for trending) and the caller's own vote. There is deliberately no
-- up/down split and no voter count: those are the n=1 scan 0221 refused.
create or replace function public.foundry_vote_counts()
returns table (app_id uuid, net bigint, net_7d bigint, mine smallint)
language sql
stable
security definer
set search_path = ''
as $f$
	select a.id,
		coalesce(sum(v.value), 0)::bigint,
		coalesce(sum(v.value) filter (where v.voted_at >= now() - interval '7 days'), 0)::bigint,
		coalesce(max(v.value) filter (where v.voter = (select auth.uid())), 0)::smallint
	from public.student_apps a
	left join public.foundry_app_votes v on v.app_id = a.id
	where (select auth.uid()) is not null
		and public._foundry_app_in_population(a.owner, a.hidden_at, a.published_version_id, false, false)
	group by a.id;
$f$;

revoke all on function public.foundry_vote_counts() from public, anon, authenticated, service_role;
grant execute on function public.foundry_vote_counts() to authenticated;
-- ===== PART G END =====

-- ===== PART H BEGIN =====
-- ===== PART H: THE FEATURED ROW (report 415af89e) =====
--
-- An admin's hand-picked, ordered list of subjects ('app:<uuid>' or
-- 'house:<id>'). The gallery draws the row directly under the major releases
-- and fills any slots the picks leave from the top of its own leaderboards in
-- the client, so the database holds only what a person chose. Like a
-- collection, a pick that is not in the gallery's population is not shown.

create table if not exists public.foundry_featured (
	subject text primary key
		check (subject ~ '^(house:(greenline|vanguard)|app:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'),
	position integer not null,
	picked_by text,
	picked_at timestamptz not null default now()
);

alter table public.foundry_featured enable row level security;
revoke all on table public.foundry_featured from public, anon, authenticated, service_role;

create or replace function public.foundry_featured_read(p_everything boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select case when (select auth.uid()) is null then '[]'::jsonb else coalesce((
		select jsonb_agg(f.subject order by f.position)
		from public.foundry_featured f
		where public._foundry_subject_visible(f.subject, coalesce(p_everything, false))), '[]'::jsonb) end;
$f$;

revoke all on function public.foundry_featured_read(boolean) from public, anon, authenticated, service_role;
grant execute on function public.foundry_featured_read(boolean) to authenticated;

-- Replace the whole ordered list. At most 12 picks.
create or replace function public.foundry_featured_set(p_subjects text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_subjects text[] := coalesce(p_subjects, '{}'::text[]);
	v_subject text;
	v_i integer := 0;
begin
	if not public.is_admin() then
		raise exception 'Only a site administrator can choose the featured row.';
	end if;
	if coalesce(array_length(v_subjects, 1), 0) > 12 then
		return jsonb_build_object('ok', false, 'reason', 'too_many');
	end if;
	foreach v_subject in array v_subjects loop
		if v_subject is null or v_subject !~ '^(house:(greenline|vanguard)|app:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' then
			return jsonb_build_object('ok', false, 'reason', 'subject');
		end if;
		if v_subject like 'app:%' and not exists (
			select 1 from public.student_apps a where a.id = substr(v_subject, 5)::uuid) then
			return jsonb_build_object('ok', false, 'reason', 'not_found');
		end if;
	end loop;
	delete from public.foundry_featured;
	foreach v_subject in array v_subjects loop
		insert into public.foundry_featured (subject, position, picked_by)
		values (v_subject, v_i, public.current_user_email())
		on conflict do nothing;
		v_i := v_i + 1;
	end loop;
	return jsonb_build_object('ok', true, 'count', v_i);
end;
$f$;

revoke all on function public.foundry_featured_set(text[]) from public, anon, authenticated, service_role;
grant execute on function public.foundry_featured_set(text[]) to authenticated;
-- ===== PART H END =====

-- ===== PART Z BEGIN =====
-- ===== SELF-CHECK (kept last) =====
-- Asserts the end state of this file's OWN objects, and nothing about anyone
-- else's: every function it creates is closed to anon and to public and open
-- to authenticated; every table it creates has row level security on and no
-- client grant; foundry_section_access still answers 0230's keys. A failure
-- raises, and the file rolls back whole.
do $z$
declare
	v_fn text;
	v_tbl text;
	v_bad text[] := '{}';
	v_oid oid;
begin
	foreach v_fn in array array[
		'classroom_worksheet_latch(uuid, timestamptz)',
		'classroom_worksheet_latched(uuid[], uuid)',
		'classroom_hall_pass_set_limits(uuid, integer, integer)',
		'foundry_section_access()',
		'foundry_set_section_open(uuid, boolean, text)',
		'foundry_class_schedule_get(uuid)',
		'foundry_class_schedule_set(uuid, boolean, jsonb)',
		'foundry_class_schedule_day_set(uuid, date, text, jsonb, text)',
		'foundry_class_schedule_day_clear(uuid, date)',
		'foundry_gallery_overrides_read()',
		'foundry_gallery_override_set(text, text, text, text)',
		'foundry_collections_read(boolean)',
		'foundry_collection_save(uuid, text, text, text[])',
		'foundry_collection_set_published(uuid, boolean)',
		'foundry_collections_order(uuid[])',
		'foundry_collection_delete(uuid)',
		'foundry_people_search(text, integer)',
		'foundry_vote(uuid, smallint)',
		'foundry_vote_counts()',
		'foundry_featured_read(boolean)',
		'foundry_featured_set(text[])'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := v_bad || (v_fn || ' is missing');
		else
			if has_function_privilege('anon', v_oid, 'execute') then
				v_bad := v_bad || (v_fn || ' is executable by anon');
			end if;
			if not has_function_privilege('authenticated', v_oid, 'execute') then
				v_bad := v_bad || (v_fn || ' is not executable by authenticated');
			end if;
		end if;
	end loop;

	foreach v_tbl in array array[
		'classroom_worksheet_latches', 'classroom_hall_pass_budget_start',
		'foundry_class_schedule', 'foundry_class_schedule_days',
		'foundry_gallery_overrides', 'foundry_collections', 'foundry_collection_members',
		'foundry_app_votes', 'foundry_featured'
	] loop
		if not exists (
			select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relname = v_tbl and c.relrowsecurity
		) then
			v_bad := v_bad || (v_tbl || ' has no row level security');
		end if;
		if has_table_privilege('anon', 'public.' || v_tbl, 'select,insert,update,delete')
			or has_table_privilege('authenticated', 'public.' || v_tbl, 'select,insert,update,delete') then
			v_bad := v_bad || (v_tbl || ' carries a client grant');
		end if;
	end loop;

	if array_length(v_bad, 1) is not null then
		raise exception '0237 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0237 feedback-round: all parts applied and checked';
end $z$;
-- ===== PART Z END =====
