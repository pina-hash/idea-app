-- 0243_coin_v2_hall_pass_fine.sql
--
-- IDEA COIN V2, PART FIVE (ledger 0384, decision 67): A LONG HALL PASS IS
-- WARNED AT 10 MINUTES AND FINED AT 20.
--
-- Mr. Pina's decision 67 OVERRIDES 0143's header and src/lib/classroom/
-- hall-pass.ts, which said a pass has no coin link and shows no warning at
-- any duration. In his words: "a logged warning if it goes over 10" and an
-- automatic fine at "at least 20 minutes".
--
-- THE RULE, ONCE (_classroom_hall_pass_check):
--   duration = least(closed_at - opened_at, the section's auto check-in cap)
--   at or over the warning threshold: one `warning` event per pass
--   at or over the fine threshold:    one `fine` event per pass, posting one
--                                     long_bathroom_break fine at its current
--                                     amount, actor 'system'
-- Idempotent by the primary key (pass_id, kind). A pass is judged when it is
-- CLOSED, so a pass an instructor opened (opened_by set) or closed (closed_by
-- is neither the student nor 'auto') is never warned or fined. A pass that
-- started before this file was applied is never judged. A section whose
-- auto check-in is below the fine threshold therefore never fines, and the
-- settings page says so. A section with its economy off is warned, not fined.
--
-- EVERY PATH CHECKS: the sweep (run by the state read and both opens),
-- close_mine and close_by_id. The two close functions keep their exact
-- signatures and 0144's bodies, plus one call each.
--
-- UNDO: re-run 0237's _classroom_hall_pass_sweep and 0144's two close bodies,
-- then drop the functions and the events table this file creates. A fine
-- already posted stays in the ledger and can be undone from the Coin Desk.

create table if not exists public.classroom_hall_pass_events (
	pass_id uuid not null references public.classroom_hall_passes (id) on delete cascade,
	kind text not null check (kind in ('warning', 'fine')),
	minutes numeric not null,
	transaction_id uuid,
	created_at timestamptz not null default now(),
	primary key (pass_id, kind)
);
alter table public.classroom_hall_pass_events enable row level security;
revoke all on table public.classroom_hall_pass_events from public, anon, authenticated, service_role;

do $from$
begin
	insert into public.coin_settings (key, value, updated_by)
	values ('v2_hall_pass_from', to_jsonb(now()), 'system')
	on conflict (key) do nothing;
end
$from$;

create or replace function public._classroom_hall_pass_check(p_pass_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_pass public.classroom_hall_passes;
	v_from timestamptz := coalesce((public._coin_setting('v2_hall_pass_from') #>> '{}')::timestamptz, now());
	v_cap integer;
	v_minutes numeric;
	v_warn numeric := coalesce((public._coin_setting('hall_pass_warn_minutes') #>> '{}')::numeric, 10);
	v_fine numeric := coalesce((public._coin_setting('hall_pass_fine_minutes') #>> '{}')::numeric, 20);
	v_amount numeric;
	v_row public.coin_transactions;
	v_out jsonb := '{}'::jsonb;
begin
	select * into v_pass from public.classroom_hall_passes where id = p_pass_id;
	if v_pass.id is null or v_pass.closed_at is null or v_pass.opened_at < v_from then
		return v_out;
	end if;
	-- AN INSTRUCTOR'S PASS IS NEVER WARNED OR FINED.
	if v_pass.opened_by is not null
		or v_pass.closed_by is null
		or v_pass.closed_by not in (v_pass.student_email, 'auto') then
		return v_out;
	end if;
	v_cap := ((public._classroom_hall_pass_section_limits(v_pass.section_id)) ->> 'auto_checkin_minutes')::integer;
	v_minutes := round(extract(epoch from least(v_pass.closed_at - v_pass.opened_at, make_interval(mins => v_cap))) / 60.0, 1);

	if v_minutes >= v_warn then
		insert into public.classroom_hall_pass_events (pass_id, kind, minutes)
		values (v_pass.id, 'warning', v_minutes) on conflict do nothing;
		v_out := v_out || jsonb_build_object('warning', true);
	end if;

	if v_minutes >= v_fine
		and exists (select 1 from public.classroom_sections s where s.id = v_pass.section_id and s.coin_economy_on) then
		select c.amount into v_amount from public.coin_categories c
		where c.id = 'long_bathroom_break' and c.active and c.pricing_model = 'flat';
		if v_amount is not null then
			insert into public.classroom_hall_pass_events (pass_id, kind, minutes)
			values (v_pass.id, 'fine', v_minutes) on conflict do nothing;
			if found then
				v_row := public._coin_insert(v_pass.student_email, 'long_bathroom_break', -v_amount, v_minutes,
					'Hall pass lasted ' || trim_scale(v_minutes) || ' minutes.',
					jsonb_build_object('pass_id', v_pass.id::text, 'section_id', v_pass.section_id::text,
						'minutes', v_minutes, 'autopay', 'hall_pass'),
					'digital', null, 'system');
				update public.classroom_hall_pass_events set transaction_id = v_row.id
				where pass_id = v_pass.id and kind = 'fine';
				v_out := v_out || jsonb_build_object('fine', true);
			end if;
		end if;
	end if;
	return v_out;
end;
$$;
revoke all on function public._classroom_hall_pass_check(uuid) from public, anon, authenticated, service_role;

-- Every recently closed pass in one section, judged. Cheap: the window is two
-- days and a judged pass costs two key lookups.
create or replace function public._classroom_hall_pass_check_section(p_section_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_id uuid;
begin
	for v_id in
		select h.id from public.classroom_hall_passes h
		where h.section_id = p_section_id and h.closed_at is not null
			and h.closed_at > now() - interval '2 days'
			and not exists (select 1 from public.classroom_hall_pass_events e where e.pass_id = h.id and e.kind = 'fine')
	loop
		perform public._classroom_hall_pass_check(v_id);
	end loop;
end;
$$;
revoke all on function public._classroom_hall_pass_check_section(uuid) from public, anon, authenticated, service_role;

-- 0237's sweep, plus the check. Same signature.
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
	begin
		perform public._classroom_hall_pass_check_section(p_section_id);
	exception when others then
		raise warning 'hall pass check failed for section %: %', p_section_id, sqlerrm;
	end;
	return v_n;
end;
$f$;
revoke all on function public._classroom_hall_pass_sweep(uuid) from public, anon, authenticated, service_role;

-- 0144's instructor close, plus the check.
create or replace function public.classroom_hall_pass_close_by_id(p_pass_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_section uuid;
	v_holder text;
	v_name text;
	v_opened timestamptz;
	v_already timestamptz;
	v_closed timestamptz;
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_pass_id is null then
		raise exception 'That pass does not exist.';
	end if;
	select h.section_id, h.student_email, h.opened_at, h.closed_at
	into v_section, v_holder, v_opened, v_already
	from public.classroom_hall_passes h
	where h.id = p_pass_id
	for update;
	if v_section is null or not public.classroom_manages_section(v_section) then
		raise exception 'That pass does not exist.';
	end if;
	if v_already is not null then
		return jsonb_build_object('ok', false, 'reason', 'already_closed');
	end if;
	update public.classroom_hall_passes h
	set closed_at = now(), closed_by = v_email
	where h.id = p_pass_id
	returning h.closed_at into v_closed;
	begin
		perform public._classroom_hall_pass_check(p_pass_id);
	exception when others then
		raise warning 'hall pass check failed for %: %', p_pass_id, sqlerrm;
	end;
	select e.display_name into v_name
	from public.classroom_enrollments e
	where e.section_id = v_section and e.student_email = v_holder;
	return jsonb_build_object(
		'ok', true,
		'pass_id', p_pass_id,
		'section_id', v_section,
		'opened_at', v_opened,
		'closed_at', v_closed,
		'closed_by_manager', true,
		'student_email', v_holder,
		'student_name', coalesce(v_name, v_holder)
	);
end;
$$;
revoke all on function public.classroom_hall_pass_close_by_id(uuid) from public, anon, authenticated, service_role;
grant execute on function public.classroom_hall_pass_close_by_id(uuid) to authenticated;

-- 0144's student close, plus the check.
create or replace function public.classroom_hall_pass_close_mine(p_section_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_id uuid;
	v_holder text;
	v_opened timestamptz;
	v_closed timestamptz;
	v_check jsonb := '{}'::jsonb;
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_section_id is null or not public.classroom_can_read_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;
	select h.id, h.student_email, h.opened_at
	into v_id, v_holder, v_opened
	from public.classroom_hall_passes h
	where h.section_id = p_section_id and h.closed_at is null
	for update;
	if v_id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_open');
	end if;
	if v_holder is distinct from v_email then
		return jsonb_build_object('ok', false, 'reason', 'not_yours');
	end if;
	update public.classroom_hall_passes h
	set closed_at = now(), closed_by = v_email
	where h.id = v_id
	returning h.closed_at into v_closed;
	begin
		v_check := public._classroom_hall_pass_check(v_id);
	exception when others then
		raise warning 'hall pass check failed for %: %', v_id, sqlerrm;
	end;
	return jsonb_build_object(
		'ok', true,
		'pass_id', v_id,
		'section_id', p_section_id,
		'opened_at', v_opened,
		'closed_at', v_closed,
		'closed_by_manager', false,
		'student_email', null,
		'student_name', null,
		'warned', coalesce((v_check ->> 'warning')::boolean, false),
		'fined', coalesce((v_check ->> 'fine')::boolean, false)
	);
end;
$$;
revoke all on function public.classroom_hall_pass_close_mine(uuid) from public, anon, authenticated, service_role;
grant execute on function public.classroom_hall_pass_close_mine(uuid) to authenticated;

-- The warnings and fines in a class: every one for a manager, a student's own
-- for a student. A student's rows carry no name and no address.
create or replace function public.classroom_hall_pass_events(p_section_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_manages boolean;
	v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
	if v_email = '' or p_section_id is null then
		return null;
	end if;
	v_manages := public.classroom_manages_section(p_section_id);
	if not v_manages and not public.classroom_is_enrolled(p_section_id) then
		return null;
	end if;
	perform public._classroom_hall_pass_sweep(p_section_id);
	return jsonb_build_object(
		'scope', case when v_manages then 'manager' else 'student' end,
		'warn_minutes', coalesce((public._coin_setting('hall_pass_warn_minutes') #>> '{}')::numeric, 10),
		'fine_minutes', coalesce((public._coin_setting('hall_pass_fine_minutes') #>> '{}')::numeric, 20),
		'events', coalesce((
			select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc)
			from (
				select ev.pass_id, ev.kind, ev.minutes, ev.created_at, h.opened_at,
					case when v_manages then coalesce(en.display_name, h.student_email) end as student_name,
					case when v_manages then h.student_email end as student_email,
					case when ev.transaction_id is not null then
						(select -t.amount from public.coin_transactions t where t.id = ev.transaction_id) end as fine_amount
				from public.classroom_hall_pass_events ev
				join public.classroom_hall_passes h on h.id = ev.pass_id
				left join public.classroom_enrollments en on en.section_id = h.section_id and en.student_email = h.student_email
				where h.section_id = p_section_id and (v_manages or h.student_email = v_email)
				order by ev.created_at desc
				limit v_limit
			) x
		), '[]'::jsonb)
	);
end;
$$;
revoke all on function public.classroom_hall_pass_events(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.classroom_hall_pass_events(uuid, integer) to authenticated;

do $chk$
declare
	r record;
begin
	for r in
		select p.oid::regprocedure::text as sig,
			has_function_privilege('anon', p.oid, 'execute') as anon_x,
			has_function_privilege('authenticated', p.oid, 'execute') as auth_x
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname like 'classroom_hall_pass%'
	loop
		if r.anon_x or not r.auth_x then
			raise exception '0243: grant is wrong on % (anon %, authenticated %).', r.sig, r.anon_x, r.auth_x;
		end if;
	end loop;
	raise notice '0243: a hall pass is warned at the warning threshold and fined at the fine threshold, once each.';
end
$chk$;
