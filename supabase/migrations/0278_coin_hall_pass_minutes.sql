-- 0277_coin_hall_pass_minutes.sql
--
-- IDEA COIN LATER FEATURES, PART THREE (ledger 0402, decision 70): A STUDENT
-- BUYS EXTRA HALL PASS TIME FOR TODAY.
--
-- Blocks of 5 minutes at 1 coin each, at most 15 extra minutes a day (all
-- three are defaults: the block size and the cap on /coin-desk/settings, the
-- price on the category). Bought minutes are for ONE class (the hall pass is
-- a class's) and for today, Los Angeles time.
--
-- THE RULE (decision 70): bought minutes add to today's budget in that class.
-- They also push today's warning and fine thresholds later by the same amount,
-- for passes OPENED AFTER the purchase; the fine threshold never goes past the
-- class's auto check-in, so a pass left open to the auto check-in is still
-- fined. Paying never removes a fine already posted.
--
-- This redefines 0237's _classroom_hall_pass_budget and 0243's
-- _classroom_hall_pass_check with the same signatures, each with the bought
-- minutes added and nothing else changed. A purchase reversed from the Coin
-- Desk stops counting in both.
--
-- UNDO: re-paste 0237's _classroom_hall_pass_budget and 0243's
-- _classroom_hall_pass_check, then drop the functions and the table this file
-- creates. A purchase already made stays in the ledger and can be undone.

-- ===== PART A BEGIN =====
-- ===== PART A: THE TABLE, THE CATEGORY, THE DEFAULTS =====

create table if not exists public.coin_hall_pass_minutes (
	id uuid primary key default gen_random_uuid(),
	student_email text not null check (student_email = lower(btrim(student_email))),
	section_id uuid not null references public.classroom_sections (id) on delete cascade,
	on_date date not null,
	minutes integer not null check (minutes between 1 and 240),
	transaction_id uuid not null,
	created_at timestamptz not null default now()
);
create index if not exists coin_hall_pass_minutes_day on public.coin_hall_pass_minutes (student_email, on_date);
create index if not exists coin_hall_pass_minutes_section on public.coin_hall_pass_minutes (section_id, student_email, on_date);
alter table public.coin_hall_pass_minutes enable row level security;
revoke all on table public.coin_hall_pass_minutes from public, anon, authenticated, service_role;

do $cat$
begin
	insert into public.coin_categories
		(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label,
		 formula_key, semester_point_cap, cap_period, cap_count, loggable, active, sort_order, notes, explanation)
	values
		('hall_pass_minutes', 'Extra Hall Pass Time', 'purchase', 'core', 'per_unit', 1, null, null, '5 minutes',
		 null, null, null, null, false, true, 230,
		 'Bought by the student from the hall pass panel or the coin page.',
		 'Buy extra hall pass time for today in one class, in 5 minute blocks, up to 15 extra minutes a day. Bought time adds to today''s budget and moves today''s warning and fine later by the same amount for passes you open after buying, but never past the class''s auto check-in. It never removes a fine already given.')
	on conflict (id) do nothing;

	insert into public.coin_settings (key, value, updated_by) values
		('hall_pass_block_minutes', '5'::jsonb, 'system'),
		('hall_pass_extra_cap_minutes', '15'::jsonb, 'system')
	on conflict (key) do nothing;
end
$cat$;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: MINUTES BOUGHT =====

-- Minutes a student bought in one class on one day, purchases that have been
-- undone left out. With p_before, only purchases made before that instant.
create or replace function public._coin_hall_pass_bought(
	p_section_id uuid,
	p_email text,
	p_day date,
	p_before timestamptz default null
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(sum(m.minutes), 0)::integer
	from public.coin_hall_pass_minutes m
	where m.section_id = p_section_id and m.student_email = lower(btrim(coalesce(p_email, '')))
		and m.on_date = p_day
		and (p_before is null or m.created_at <= p_before)
		and not public._coin_is_reversed(m.transaction_id);
$$;
revoke all on function public._coin_hall_pass_bought(uuid, text, date, timestamptz) from public, anon, authenticated, service_role;

-- Minutes bought today in every class, against the daily cap.
create or replace function public._coin_hall_pass_bought_today(p_email text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(sum(m.minutes), 0)::integer
	from public.coin_hall_pass_minutes m
	where m.student_email = lower(btrim(coalesce(p_email, ''))) and m.on_date = public._coin_la_today()
		and not public._coin_is_reversed(m.transaction_id);
$$;
revoke all on function public._coin_hall_pass_bought_today(text) from public, anon, authenticated, service_role;

-- What the buy control needs: the block, the price, the cap and the room left.
create or replace function public._coin_hall_pass_quote(p_email text, p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_block integer := coalesce((public._coin_setting('hall_pass_block_minutes') #>> '{}')::integer, 5);
	v_cap integer := coalesce((public._coin_setting('hall_pass_extra_cap_minutes') #>> '{}')::integer, 15);
	v_price numeric;
	v_today integer := public._coin_hall_pass_bought_today(p_email);
begin
	select c.amount into v_price from public.coin_categories c where c.id = 'hall_pass_minutes' and c.active;
	return jsonb_build_object(
		'available', v_price is not null and exists (select 1 from public._coin_economy_enrollments() x
			where x.student_email = lower(btrim(coalesce(p_email, ''))) and x.section_id = p_section_id),
		'block_minutes', v_block,
		'price_per_block', v_price,
		'cap_minutes', v_cap,
		'bought_today_minutes', v_today,
		'bought_here_minutes', public._coin_hall_pass_bought(p_section_id, p_email, public._coin_la_today()),
		'room_minutes', greatest(v_cap - v_today, 0),
		'room_blocks', case when v_block > 0 then greatest(v_cap - v_today, 0) / v_block else 0 end,
		'balance', public._coin_balance(p_email));
end;
$$;
revoke all on function public._coin_hall_pass_quote(text, uuid) from public, anon, authenticated, service_role;

create or replace function public.coin_hall_pass_minutes_quote(p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
begin
	if (select auth.uid()) is null or v_email = '' then
		return jsonb_build_object('available', false);
	end if;
	return public._coin_hall_pass_quote(v_email, p_section_id);
end;
$$;
revoke all on function public.coin_hall_pass_minutes_quote(uuid) from public, anon, authenticated, service_role;
grant execute on function public.coin_hall_pass_minutes_quote(uuid) to authenticated;

-- Every class the caller may buy time in, for the coin page.
create or replace function public.coin_hall_pass_minutes_mine()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
begin
	if (select auth.uid()) is null or v_email = '' then
		return '[]'::jsonb;
	end if;
	return coalesce((select jsonb_agg(jsonb_build_object('section_id', x.section_id,
			'label', public._coin_classroom_section_label(x.section_id),
			'quote', public._coin_hall_pass_quote(v_email, x.section_id))
			order by public._coin_classroom_section_label(x.section_id))
		from public._coin_economy_enrollments() x where x.student_email = v_email), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_hall_pass_minutes_mine() from public, anon, authenticated, service_role;
grant execute on function public.coin_hall_pass_minutes_mine() to authenticated;

create or replace function public.coin_buy_hall_pass_minutes(p_section_id uuid, p_blocks integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb;
	v_email text;
	v_block integer := coalesce((public._coin_setting('hall_pass_block_minutes') #>> '{}')::integer, 5);
	v_cap integer := coalesce((public._coin_setting('hall_pass_extra_cap_minutes') #>> '{}')::integer, 15);
	v_price numeric;
	v_minutes integer;
	v_cost numeric;
	v_balance numeric;
	v_today integer;
	v_row public.coin_transactions;
begin
	if p_blocks is null or p_blocks not between 1 and 48 then
		return jsonb_build_object('ok', false, 'reason', 'blocks');
	end if;
	v_seam := public._coin_student_seam('buy_hall_pass_minutes');
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	if not exists (select 1 from public._coin_economy_enrollments() x
		where x.student_email = v_email and x.section_id = p_section_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_your_class');
	end if;
	select c.amount into v_price from public.coin_categories c where c.id = 'hall_pass_minutes' and c.active;
	if v_price is null then
		return jsonb_build_object('ok', false, 'reason', 'not_available');
	end if;
	perform pg_advisory_xact_lock(hashtext('coin_hall_pass_minutes:' || v_email));
	v_minutes := p_blocks * v_block;
	v_today := public._coin_hall_pass_bought_today(v_email);
	if v_today + v_minutes > v_cap then
		return jsonb_build_object('ok', false, 'reason', 'cap', 'cap_minutes', v_cap,
			'bought_today_minutes', v_today, 'room_minutes', greatest(v_cap - v_today, 0));
	end if;
	v_cost := round(v_price * p_blocks, 2);
	v_balance := public._coin_balance(v_email);
	if v_balance - v_cost < 0 then
		return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance, 'cost', v_cost);
	end if;
	v_row := public._coin_insert(v_email, 'hall_pass_minutes', -v_cost, v_minutes,
		'Extra hall pass time, ' || v_minutes || ' minutes, ' || coalesce(public._coin_classroom_section_label(p_section_id), 'your class') || '.',
		jsonb_build_object('section_id', p_section_id::text, 'minutes', v_minutes, 'on_date', public._coin_la_today(),
			'self_service', true), 'digital');
	insert into public.coin_hall_pass_minutes (student_email, section_id, on_date, minutes, transaction_id)
	values (v_email, p_section_id, public._coin_la_today(), v_minutes, v_row.id);
	return jsonb_build_object('ok', true, 'transaction_id', v_row.id, 'cost', v_cost, 'minutes', v_minutes,
		'balance', public._coin_balance(v_email), 'quote', public._coin_hall_pass_quote(v_email, p_section_id));
end;
$$;
revoke all on function public.coin_buy_hall_pass_minutes(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.coin_buy_hall_pass_minutes(uuid, integer) to authenticated;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE BUDGET AND THE CHECK, WITH BOUGHT MINUTES =====

-- 0237's budget, word for word, with each day's bought minutes added to that
-- day's budget (bought_seconds names them in the answer).
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
	v_bought jsonb := '{}'::jsonb;
	v_d date;
	v_debt integer := 0;
	v_used integer;
	v_extra integer;
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

	-- Ledger 0402: minutes bought each day this week, in seconds.
	for r in
		select m.on_date as d, sum(m.minutes)::integer * 60 as s
		from public.coin_hall_pass_minutes m
		where m.section_id = p_section_id and m.student_email = lower(p_email)
			and m.on_date between v_week and v_today
			and not public._coin_is_reversed(m.transaction_id)
		group by 1
	loop
		v_bought := v_bought || jsonb_build_object(r.d::text, r.s);
	end loop;

	v_d := v_week;
	while v_d < v_today loop
		v_used := coalesce((v_days ->> v_d::text)::integer, 0);
		v_extra := coalesce((v_bought ->> v_d::text)::integer, 0);
		v_debt := greatest(0, v_debt + v_used - (v_b + v_extra));
		v_d := v_d + 1;
	end loop;

	v_used := coalesce((v_days ->> v_today::text)::integer, 0);
	v_extra := coalesce((v_bought ->> v_today::text)::integer, 0);
	v_allow := greatest(0, v_b + v_extra - v_debt);
	v_remaining := greatest(0, v_allow - v_used);

	if v_remaining = 0 then
		-- The first day (before the reset) the allowance is above zero again, or the reset.
		v_fdebt := greatest(0, v_debt + v_used - (v_b + v_extra));
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
		'bought_seconds', v_extra,
		'blocked', v_remaining = 0,
		'available_at', v_avail,
		'resets_at', v_reset);
end;
$f$;
revoke all on function public._classroom_hall_pass_budget(uuid, text, timestamptz) from public, anon, authenticated, service_role;

-- 0243's check, word for word, with the thresholds moved later by the minutes
-- bought that day BEFORE the pass opened, and clamped at the auto check-in.
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
	v_bought integer;
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
	-- Ledger 0402: bought minutes move both lines later, never past the auto check-in.
	v_bought := public._coin_hall_pass_bought(v_pass.section_id, v_pass.student_email,
		public._coin_la_today(v_pass.opened_at), v_pass.opened_at);
	v_warn := least(v_warn + v_bought, v_cap);
	v_fine := least(v_fine + v_bought, v_cap);

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
						'minutes', v_minutes, 'autopay', 'hall_pass', 'bought_minutes', v_bought),
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
-- ===== PART C END =====

do $chk$
declare
	r record;
	v_bad text[] := '{}';
begin
	for r in
		select p.oid::regprocedure::text as sig, p.proname, pg_get_function_identity_arguments(p.oid) as args
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname in ('coin_buy_hall_pass_minutes', 'coin_hall_pass_minutes_quote',
			'coin_hall_pass_minutes_mine', '_coin_hall_pass_bought', '_coin_hall_pass_bought_today',
			'_coin_hall_pass_quote', '_classroom_hall_pass_budget', '_classroom_hall_pass_check')
	loop
		if has_function_privilege('anon', r.sig, 'execute') then
			v_bad := array_append(v_bad, 'anon executes ' || r.sig);
		end if;
		if r.proname like '\_%' and has_function_privilege('authenticated', r.sig, 'execute') then
			v_bad := array_append(v_bad, 'a client role executes the private ' || r.sig);
		end if;
		if r.proname like 'coin\_%' and r.args ~* '(email|amount|cost|price)' then
			v_bad := array_append(v_bad, r.sig || ' takes an address or an amount');
		end if;
	end loop;
	if (select count(*) from pg_proc where proname = '_classroom_hall_pass_budget' and pronamespace = 'public'::regnamespace) <> 1
		or (select count(*) from pg_proc where proname = '_classroom_hall_pass_check' and pronamespace = 'public'::regnamespace) <> 1 then
		v_bad := array_append(v_bad, 'a hall pass function has a second overload');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0278 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0278: hall pass time can be bought; the budget and the check count it.';
end
$chk$;
