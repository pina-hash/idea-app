-- 0249_coin_v2_autopay_digest_stats.sql
--
-- IDEA COIN V2, SESSION TWO, PART SIX (ledger 0385): THE ROLE STIPEND AND DEBT
-- RELIEF IN AUTOPAY, THE WEEKLY DIGEST, AND TELEMETRY.
--
-- THE ROLE STIPEND (2.5) is paid by coin_autopay_run now, replacing the
-- button (which stays as a manual override, 0251): per holder and per
-- completed period (role_stipend_weeks weeks from role_stipend_anchor),
-- stipend = the weekly_role_stipend amount x the paying weeks in the period
-- x (valid days / required days). Required days are the days the holder's
-- class meets inside paying weeks (_coin_section_meets: the Foundry schedule
-- where it is on, otherwise every class day). Key (holder, period): paid at
-- most once, even when the amount comes out zero.
--
-- CLEAN-QUARTER HALVING (2.12). At each quarter close (quarter_ends), a
-- student below zero at the end of that quarter who had no fine during it
-- has half of that debt written off, as one `system` debt_relief row, never
-- more than they still owe. The first quarter counts fines from
-- debt_relief_fines_since. Key (student, quarter).
--
-- THE DIGEST (2.13) and TELEMETRY (2.14) are reads. A section coin staff
-- member sees only their own students in both. _coin_effective_rows is the
-- one statement of a student's history as people read it: an undone row and
-- its reversal fold to nothing, and an edited amount (0250) shows its value
-- after the edit.
--
-- THE FRIDAY PUSH. coin_digest_push_due() is granted to service_role alone:
-- it is called by /api/coin/digest-push with the push module's existing
-- service client (src/lib/server/push.ts), answers the subscribed staff's
-- user ids at most once per week and only on a Friday afternoon in Los
-- Angeles, and stamps the week in the same statement.
--
-- UNDO: re-run 0242's coin_autopay_run; drop the functions and the four
-- tables this file creates; set the debt_relief category inactive.

-- THE FIRST OBJECT IS NEW (the apply probe reads the first created object).
create table if not exists public.coin_debt_relief (
	student_email text not null,
	quarter_end date not null,
	debt_at_close numeric(12,2),
	amount numeric(12,2),
	transaction_id uuid,
	created_at timestamptz not null default now(),
	primary key (student_email, quarter_end)
);
alter table public.coin_debt_relief enable row level security;
revoke all on table public.coin_debt_relief from public, anon, authenticated, service_role;

create table if not exists public.coin_role_stipends (
	holder_id uuid not null references public.coin_role_holders (id) on delete cascade,
	period_start date not null,
	period_end date not null,
	valid_days integer not null,
	required_days integer not null,
	amount numeric(12,2) not null,
	transaction_id uuid,
	created_at timestamptz not null default now(),
	primary key (holder_id, period_start)
);
alter table public.coin_role_stipends enable row level security;
revoke all on table public.coin_role_stipends from public, anon, authenticated, service_role;

create table if not exists public.coin_digest_subscribers (
	email text primary key check (email = lower(btrim(email)) and email like '%@%'),
	enabled boolean not null default true,
	updated_at timestamptz not null default now()
);
alter table public.coin_digest_subscribers enable row level security;
revoke all on table public.coin_digest_subscribers from public, anon, authenticated, service_role;

create table if not exists public.coin_digest_sends (
	week_start date primary key,
	sent_at timestamptz not null default now(),
	recipients integer not null default 0
);
alter table public.coin_digest_sends enable row level security;
revoke all on table public.coin_digest_sends from public, anon, authenticated, service_role;

do $cat$
begin
	insert into public.coin_categories
		(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label,
		 formula_key, semester_point_cap, cap_period, cap_count, loggable, active, sort_order, notes, explanation)
	values
		('debt_relief', 'Clean Quarter Debt Relief', 'adjustment', 'core', 'variable', null, null, null, null,
		 null, null, null, null, false, true, 309,
		 'System only: half of a student''s debt written off at a quarter close they finished with no fines.',
		 'If your balance is below zero when a quarter ends and you had no fines at all during that quarter, half of your debt is written off automatically. Fines still cost their full price.')
	on conflict (id) do nothing;
end
$cat$;

-- ===== PART A BEGIN =====
-- ===== PART A: THE HISTORY AS PEOPLE READ IT =====

create or replace function public._coin_effective_rows(p_email text)
returns table (
	id uuid, created_at timestamptz, category_id text, amount numeric, original_amount numeric,
	edited boolean, reversed boolean, actor_email text, note text, quantity numeric
)
language sql
stable
security definer
set search_path = ''
as $$
	select t.id, t.created_at, t.category_id,
		case when public._coin_is_reversed(t.id) then 0
			else t.amount + coalesce((select sum(c.amount) from public.coin_transactions c
				where c.category_id = 'amount_correction' and c.meta ->> 'edits' = t.id::text
					and not public._coin_is_reversed(c.id)), 0) end,
		t.amount,
		exists (select 1 from public.coin_transactions c where c.category_id = 'amount_correction'
			and c.meta ->> 'edits' = t.id::text and not public._coin_is_reversed(c.id)),
		public._coin_is_reversed(t.id),
		t.actor_email, t.note, t.quantity
	from public.coin_transactions t
	where t.student_email = lower(btrim(coalesce(p_email, ''))) and t.medium = 'digital'
		and t.category_id not in ('reversal', 'amount_correction');
$$;
revoke all on function public._coin_effective_rows(text) from public, anon, authenticated, service_role;

-- A balance as of the end of one Los Angeles day.
create or replace function public._coin_balance_on(p_email text, p_day date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(sum(t.amount), 0)::numeric(12,2) from public.coin_transactions t
	where t.student_email = lower(btrim(coalesce(p_email, ''))) and t.medium = 'digital'
		and public._coin_la_today(t.created_at) <= p_day;
$$;
revoke all on function public._coin_balance_on(text, date) from public, anon, authenticated, service_role;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: AUTOPAY GAINS THE STIPEND AND THE RELIEF =====

create or replace function public._coin_autopay_roles(p_run bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_today date := public._coin_la_today();
	v_weeks integer := greatest(coalesce((public._coin_setting('role_stipend_weeks') #>> '{}')::integer, 2), 1);
	v_anchor date := public._coin_week_start(coalesce((public._coin_setting('role_stipend_anchor') #>> '{}')::date, v_today));
	v_start date := public._coin_week_start(coalesce((public._coin_setting('autopay_start') #>> '{}')::date, v_today));
	v_rate numeric;
	v_p date;
	v_end date;
	v_pay_weeks integer;
	v_w date;
	v_h public.coin_role_holders;
	v_required integer;
	v_valid integer;
	v_d date;
	v_amount numeric;
	v_row public.coin_transactions;
	v_n integer := 0;
begin
	select c.amount into v_rate from public.coin_categories c where c.id = 'weekly_role_stipend' and c.active;
	if v_rate is null then
		return 0;
	end if;
	v_p := v_anchor;
	while v_p + v_weeks * 7 - 1 < v_today loop
		v_end := v_p + v_weeks * 7 - 1;
		if v_end >= v_start then
			v_pay_weeks := 0;
			v_w := v_p;
			while v_w <= v_end loop
				if public._coin_week_pays(v_w) then
					v_pay_weeks := v_pay_weeks + 1;
				end if;
				v_w := v_w + 7;
			end loop;
			for v_h in
				select * from public.coin_role_holders h
				where h.class_section_id is not null
					and public._coin_la_today(h.since) <= v_end
					and (h.revoked_at is null or public._coin_la_today(h.revoked_at) >= v_p)
					and (h.expires_at is null or public._coin_la_today(h.expires_at) >= v_p)
					and not exists (select 1 from public.coin_role_stipends s where s.holder_id = h.id and s.period_start = v_p)
			loop
				v_required := 0;
				v_valid := 0;
				v_d := v_p;
				while v_d <= v_end loop
					if public._coin_week_pays(public._coin_week_start(v_d)) and public._coin_section_meets(v_h.class_section_id, v_d) then
						v_required := v_required + 1;
						if (public._coin_role_day_status(v_h.id, v_d) ->> 'valid')::boolean then
							v_valid := v_valid + 1;
						end if;
					end if;
					v_d := v_d + 1;
				end loop;
				v_amount := case when v_required > 0 then round(v_rate * v_pay_weeks * v_valid / v_required, 2) else 0 end;
				insert into public.coin_role_stipends (holder_id, period_start, period_end, valid_days, required_days, amount)
				values (v_h.id, v_p, v_end, v_valid, v_required, v_amount)
				on conflict do nothing;
				if found and v_amount > 0 then
					v_row := public._coin_insert(v_h.student_email, 'weekly_role_stipend', v_amount, v_valid,
						'Role stipend, ' || to_char(v_p, 'FMMon FMDD') || ' to ' || to_char(v_end, 'FMMon FMDD') || ': '
							|| v_valid || ' of ' || v_required || ' days proven.',
						jsonb_build_object('autopay', 'role_stipend', 'holder_id', v_h.id::text, 'role_id', v_h.role_id,
							'period_start', v_p, 'period_end', v_end, 'valid_days', v_valid, 'required_days', v_required,
							'autopay_run', p_run),
						'digital', null, 'system');
					update public.coin_role_stipends set transaction_id = v_row.id where holder_id = v_h.id and period_start = v_p;
					v_n := v_n + 1;
				end if;
			end loop;
		end if;
		v_p := v_p + v_weeks * 7;
	end loop;
	return v_n;
end;
$$;
revoke all on function public._coin_autopay_roles(bigint) from public, anon, authenticated, service_role;

create or replace function public._coin_autopay_relief(p_run bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_today date := public._coin_la_today();
	v_since date := coalesce((public._coin_setting('debt_relief_fines_since') #>> '{}')::date, date '2026-10-15');
	v_q date;
	v_prev date := null;
	v_from date;
	v_s record;
	v_now numeric;
	v_amount numeric;
	v_row public.coin_transactions;
	v_n integer := 0;
begin
	if not exists (select 1 from public.coin_categories where id = 'debt_relief' and active) then
		return 0;
	end if;
	for v_q in
		select d::date from jsonb_array_elements_text(coalesce(public._coin_setting('quarter_ends'), '[]'::jsonb)) d order by 1
	loop
		v_from := greatest(coalesce(v_prev + 1, v_since), v_since);
		v_prev := v_q;
		if v_q >= v_today or v_q < v_since then
			continue;
		end if;
		for v_s in
			select t.student_email, sum(t.amount) as at_close
			from public.coin_transactions t
			where t.medium = 'digital' and public._coin_la_today(t.created_at) <= v_q
			group by t.student_email
			having sum(t.amount) < 0
		loop
			if exists (select 1 from public.coin_debt_relief r where r.student_email = v_s.student_email and r.quarter_end = v_q) then
				continue;
			end if;
			if exists (select 1 from public.coin_transactions f
				join public.coin_categories c on c.id = f.category_id
				where f.student_email = v_s.student_email and c.kind = 'fine' and f.medium = 'digital'
					and public._coin_la_today(f.created_at) between v_from and v_q
					and not public._coin_is_reversed(f.id)) then
				continue;
			end if;
			v_now := public._coin_balance(v_s.student_email);
			v_amount := case when v_now < 0 then least(round(-v_s.at_close / 2, 2), -v_now) else 0 end;
			insert into public.coin_debt_relief (student_email, quarter_end, debt_at_close, amount)
			values (v_s.student_email, v_q, v_s.at_close, v_amount)
			on conflict do nothing;
			if found and v_amount > 0 then
				v_row := public._coin_insert(v_s.student_email, 'debt_relief', v_amount, null,
					'Clean quarter: half of your debt at ' || to_char(v_q, 'FMMonth FMDD') || ' written off.',
					jsonb_build_object('autopay', 'debt_relief', 'quarter_end', v_q, 'debt_at_close', v_s.at_close,
						'autopay_run', p_run), 'digital', null, 'system');
				update public.coin_debt_relief set transaction_id = v_row.id
				where student_email = v_s.student_email and quarter_end = v_q;
				v_n := v_n + 1;
			end if;
		end loop;
	end loop;
	return v_n;
end;
$$;
revoke all on function public._coin_autopay_relief(bigint) from public, anon, authenticated, service_role;

-- 0242's entry point, with the two new kinds of pay. Same signature, grants
-- kept (anon on purpose: see 0242).
create or replace function public.coin_autopay_run(p_trigger text default 'page')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_admin boolean := public._coin_full_staff();
	v_trigger text := case when lower(coalesce(p_trigger, '')) in ('nightly', 'page', 'admin')
		then lower(p_trigger) else 'page' end;
	v_run bigint;
	v_wages integer;
	v_highest integer;
	v_perfect integer;
	v_roles integer;
	v_relief integer;
	v_result jsonb;
begin
	if v_trigger = 'admin' and not v_admin then
		v_trigger := 'page';
	end if;
	if public._coin_autopay_paused() then
		return jsonb_build_object('ok', true, 'ran', false, 'reason', 'paused');
	end if;
	if not pg_try_advisory_xact_lock(hashtext('coin_autopay_run')) then
		return jsonb_build_object('ok', true, 'ran', false, 'reason', 'busy');
	end if;
	if v_trigger <> 'admin' and exists (select 1 from public.coin_autopay_runs r
		where r.started_at > now() - interval '2 minutes') then
		return jsonb_build_object('ok', true, 'ran', false, 'reason', 'recent');
	end if;

	insert into public.coin_autopay_runs (trigger) values (v_trigger) returning id into v_run;
	v_wages := public._coin_autopay_wages(v_run);
	v_highest := public._coin_autopay_highest(v_run);
	v_perfect := public._coin_autopay_perfect(v_run);
	v_roles := public._coin_autopay_roles(v_run);
	v_relief := public._coin_autopay_relief(v_run);
	v_result := jsonb_build_object('wages', v_wages, 'highest_grade', v_highest, 'perfect_score', v_perfect,
		'role_stipend', v_roles, 'debt_relief', v_relief);
	update public.coin_autopay_runs set finished_at = now(), result = v_result where id = v_run;
	return jsonb_build_object('ok', true, 'ran', true, 'run_id', v_run) || v_result;
end;
$$;
revoke all on function public.coin_autopay_run(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_autopay_run(text) to anon, authenticated;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE DIGEST =====

create or replace function public.coin_digest(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 60)));
	v_gain numeric := coalesce((public._coin_setting('digest_gain_threshold') #>> '{}')::numeric, 10);
	v_floor numeric := coalesce((public._coin_setting('chronic_debt_threshold') #>> '{}')::numeric, -20);
	v_weeks integer := coalesce((public._coin_setting('chronic_debt_weeks') #>> '{}')::integer, 3);
	v_full boolean := public._coin_full_staff();
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can read the digest.';
	end if;
	return jsonb_build_object(
		'since', v_since,
		'scope', case when v_full then 'full' else 'section' end,
		'autopay', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'at', t.created_at, 'email', t.student_email,
				'name', public._coin_student_name(t.student_email), 'category_id', t.category_id, 'category', c.name,
				'amount', t.amount, 'note', t.note, 'reversed', public._coin_is_reversed(t.id),
				'reversible', v_full and not public._coin_is_reversed(t.id)) order by t.created_at desc)
			from public.coin_transactions t join public.coin_categories c on c.id = t.category_id
			where t.actor_email = 'system' and t.category_id <> 'reversal' and t.created_at > v_since
				and public._coin_student_in_scope(t.student_email)), '[]'::jsonb),
		'gainers', coalesce((select jsonb_agg(jsonb_build_object('email', g.student_email,
				'name', public._coin_student_name(g.student_email), 'gained', g.net,
				'balance', public._coin_balance(g.student_email)) order by g.net desc)
			from (select t.student_email, sum(t.amount) as net from public.coin_transactions t
				where t.medium = 'digital' and t.created_at > v_since group by t.student_email
				having sum(t.amount) > v_gain) g
			where public._coin_student_in_scope(g.student_email)), '[]'::jsonb),
		'chronic_debt', coalesce((select jsonb_agg(jsonb_build_object('email', s.student_email,
				'name', public._coin_student_name(s.student_email), 'balance', public._coin_balance(s.student_email))
				order by public._coin_balance(s.student_email))
			from (select distinct t.student_email from public.coin_transactions t where t.medium = 'digital') s
			where public._coin_student_in_scope(s.student_email)
				and public._coin_balance(s.student_email) < v_floor
				and not exists (select 1 from generate_series(1, v_weeks) w
					where public._coin_balance_on(s.student_email, public._coin_la_today() - 7 * w) >= v_floor)), '[]'::jsonb),
		'queue', (select count(*) from public.coin_requests r where r.status = 'pending'
			and public._coin_student_in_scope(r.student_email)),
		'money', (select jsonb_build_object(
				'in', coalesce(sum(t.amount) filter (where t.amount > 0), 0),
				'out', coalesce(-sum(t.amount) filter (where t.amount < 0), 0))
			from public.coin_transactions t
			where t.medium = 'digital' and t.created_at > v_since
				and t.category_id not in ('reversal', 'payout_hold', 'amount_correction')
				and not public._coin_is_reversed(t.id)
				and public._coin_student_in_scope(t.student_email)),
		'notify', coalesce((select d.enabled from public.coin_digest_subscribers d where d.email = public.current_user_email()), false)
	);
end;
$$;
revoke all on function public.coin_digest(integer) from public, anon, authenticated, service_role;
grant execute on function public.coin_digest(integer) to authenticated;

create or replace function public.coin_digest_notify_set(p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can get the digest.';
	end if;
	if p_on is null then
		return jsonb_build_object('ok', false, 'reason', 'invalid');
	end if;
	insert into public.coin_digest_subscribers (email, enabled) values (public.current_user_email(), p_on)
	on conflict (email) do update set enabled = excluded.enabled, updated_at = now();
	return jsonb_build_object('ok', true, 'notify', p_on);
end;
$$;
revoke all on function public.coin_digest_notify_set(boolean) from public, anon, authenticated, service_role;
grant execute on function public.coin_digest_notify_set(boolean) to authenticated;

-- service_role only. Friday from 1 p.m. in Los Angeles, once a week.
create or replace function public.coin_digest_push_due()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_local timestamp := now() at time zone 'America/Los_Angeles';
	v_week date := public._coin_week_start(v_local::date);
	v_ids jsonb;
begin
	if extract(isodow from v_local) <> 5 or v_local::time < time '13:00' then
		return jsonb_build_object('due', false, 'reason', 'not_friday_afternoon');
	end if;
	insert into public.coin_digest_sends (week_start) values (v_week) on conflict do nothing;
	if not found then
		return jsonb_build_object('due', false, 'reason', 'already_sent');
	end if;
	select coalesce(jsonb_agg(u.id), '[]'::jsonb) into v_ids
	from public.coin_digest_subscribers d
	join auth.users u on lower(btrim(u.email)) = d.email
	where d.enabled;
	update public.coin_digest_sends set recipients = jsonb_array_length(v_ids) where week_start = v_week;
	return jsonb_build_object('due', true, 'week_start', v_week, 'user_ids', v_ids);
end;
$$;
revoke all on function public.coin_digest_push_due() from public, anon, authenticated, service_role;
grant execute on function public.coin_digest_push_due() to service_role;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: TELEMETRY AND EXPORT =====

create or replace function public._coin_stats(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	with e as (select * from public._coin_effective_rows(p_email)),
	daily as (
		select public._coin_la_today(created_at) as day, sum(amount) as net from e group by 1
	),
	series as (
		select day, sum(net) over (order by day) as balance from daily
	),
	weeks as (
		select public._coin_week_start(public._coin_la_today(created_at)) as week_start,
			coalesce(sum(amount) filter (where amount > 0), 0) as earned,
			coalesce(-sum(amount) filter (where amount < 0), 0) as spent
		from e where created_at > now() - interval '84 days' and amount <> 0
		group by 1
	)
	select jsonb_build_object(
		'balance', public._coin_balance(p_email),
		'series', coalesce((select jsonb_agg(jsonb_build_object('day', s.day, 'balance', s.balance) order by s.day)
			from series s), '[]'::jsonb),
		'weeks', coalesce((select jsonb_agg(jsonb_build_object('week_start', w.week_start, 'earned', w.earned, 'spent', w.spent)
			order by w.week_start) from weeks w), '[]'::jsonb),
		'categories', coalesce((select jsonb_agg(jsonb_build_object('category_id', x.category_id, 'name', c.name,
				'kind', c.kind, 'total', x.total, 'count', x.n) order by c.kind, abs(x.total) desc)
			from (select category_id, sum(amount) as total, count(*) filter (where amount <> 0 or not reversed) as n
				from e group by category_id) x join public.coin_categories c on c.id = x.category_id), '[]'::jsonb),
		'events', coalesce((select jsonb_agg(jsonb_build_object('id', ev.id, 'at', ev.created_at, 'category_id', ev.category_id,
				'name', c.name, 'kind', c.kind, 'amount', ev.amount, 'original_amount', ev.original_amount,
				'edited', ev.edited, 'reversed', ev.reversed) order by ev.created_at desc)
			from (select * from e where not reversed order by created_at desc limit 500) ev
			join public.coin_categories c on c.id = ev.category_id where c.kind in ('fine', 'award', 'purchase')), '[]'::jsonb)
	);
$$;
revoke all on function public._coin_stats(text) from public, anon, authenticated, service_role;

create or replace function public.coin_my_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null or public.current_user_email() = '' then
		return jsonb_build_object('signed_in', false);
	end if;
	return public._coin_stats(public.current_user_email());
end;
$$;
revoke all on function public.coin_my_stats() from public, anon, authenticated, service_role;
grant execute on function public.coin_my_stats() to authenticated;

create or replace function public.coin_student_stats(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can read a student''s coin stats.';
	end if;
	if not public._coin_student_in_scope(v_email) then
		raise exception 'That student is not in one of your classes.';
	end if;
	return public._coin_stats(v_email) || jsonb_build_object('email', v_email, 'name', public._coin_student_name(v_email),
		'background', public._coin_current_background(v_email));
end;
$$;
revoke all on function public.coin_student_stats(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_student_stats(text) to authenticated;

-- RAW ROWS, for a person or Claude to read. One student (staff in scope, or
-- the student themselves), one class (staff whose scope holds the class), or
-- the whole economy (full coin admins only).
create or replace function public.coin_export(p_scope text, p_email text default null, p_section_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_me text := public.current_user_email();
begin
	if p_scope = 'student' then
		if not (v_email = v_me and v_me <> '') and not (public._coin_staff() and public._coin_student_in_scope(v_email)) then
			raise exception 'That student is not one you can export.';
		end if;
	elsif p_scope = 'class' then
		if not (public._coin_staff() and public._coin_section_in_scope(p_section_id)) then
			raise exception 'That class is not one of yours.';
		end if;
	elsif p_scope = 'economy' then
		if not public._coin_full_staff() then
			raise exception 'Only a full coin admin can export the whole economy.';
		end if;
	else
		raise exception 'Choose student, class or economy.';
	end if;
	return jsonb_build_object('scope', p_scope, 'exported_at', now(), 'rows', coalesce((
		select jsonb_agg(jsonb_build_object('id', t.id, 'created_at', t.created_at, 'email', t.student_email,
			'name', public._coin_student_name(t.student_email), 'category_id', t.category_id, 'category', c.name,
			'kind', c.kind, 'amount', t.amount, 'medium', t.medium, 'quantity', t.quantity, 'note', t.note,
			'actor', t.actor_email, 'transfer_id', t.transfer_id, 'meta', t.meta) order by t.created_at, t.id)
		from public.coin_transactions t join public.coin_categories c on c.id = t.category_id
		where (p_scope = 'student' and t.student_email = v_email)
			or (p_scope = 'class' and t.student_email in (select x.student_email from public._coin_economy_enrollments() x
				where x.section_id = p_section_id))
			or p_scope = 'economy'), '[]'::jsonb));
end;
$$;
revoke all on function public.coin_export(text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.coin_export(text, text, uuid) to authenticated;
-- ===== PART D END =====

do $chk$
declare
	r record;
begin
	for r in
		select p.oid::regprocedure::text as sig
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname in ('coin_digest', 'coin_digest_notify_set', 'coin_my_stats',
			'coin_student_stats', 'coin_export', 'coin_digest_push_due')
			and has_function_privilege('anon', p.oid, 'execute')
	loop
		raise exception '0249: anon must not execute %.', r.sig;
	end loop;
	if has_function_privilege('authenticated', 'public.coin_digest_push_due()', 'execute') then
		raise exception '0249: coin_digest_push_due must be service_role only.';
	end if;
	if not has_function_privilege('anon', 'public.coin_autopay_run(text)', 'execute') then
		raise exception '0249: coin_autopay_run must stay callable with no credential (0242).';
	end if;
	raise notice '0249: autopay pays the role stipend and clean-quarter relief; the digest and telemetry are in place.';
end
$chk$;
