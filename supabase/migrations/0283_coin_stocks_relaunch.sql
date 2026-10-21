-- 0283_coin_stocks_relaunch.sql
--
-- IDEA STOCKS RELAUNCH (feedback reports 79e16faa and fbe274c3, Mr. Pina).
--
-- WHAT IT DOES, ONCE:
--   1. Today's price (each stock's latest close) becomes its LAUNCH price,
--      stamped with a launch time. A stock that never had a price launches at
--      the base (stock_base, 10).
--   2. Holdings carry over at their current value: shares are translated by
--      old price over launch price, which is exactly one because the launch
--      price IS the old price, so no share count and no value moves. What each
--      student held, at what price, before and after, is recorded in
--      coin_stock_relaunch. Cost basis is what the student paid and is not
--      touched: no refund, no write-down.
--   3. EVERY STORED CLOSE IS DELETED: the eight weeks the first nightly run
--      backfilled, and every close since. Each chart starts at the launch.
--      Trades are records of coins that moved and are kept.
--
-- THE PRICE FROM HERE ON (formula v2). A tick reads the real site data as it
-- stands at that moment and prices every active stock, about once a minute on
-- class days:
--   a member stock   price = anchor price x signal now / anchor signal. The
--                    anchor is the launch price and the signal measured at the
--                    launch; a stock whose signal was zero or missing at the
--                    launch anchors at its first real reading instead, at the
--                    price it then holds. Signals are the 0279 ones, measured
--                    over a window ending at the tick: a class's grade ratio
--                    over the trailing 4 weeks (at least 3 students), and
--                    person-days of Foundry or GAUNTLET activity over the
--                    trailing 7 days, per day.
--   the index        price = launch price x the mean, over active members, of
--                    member price over member launch price.
--   no data          the price holds and the note says why.
-- THE ONE RULE ON TOP OF THE FORMULA (_coin_stock_rules is its only
-- statement; the page displays what the board returns and computes none of
-- it):
--   launch ramp      week 1 after the launch a price moves at most 5 percent a
--                    day from the day's reference (the last price of the
--                    previous class day, or the launch price), week 2 at most
--                    10, week 3 at most 15, week 4 at most 25. Then no cap.
--   circuit breakers after the ramp only, both directions, each level once a
--                    stock a day: a move of 10 percent from the reference
--                    halts trading in that stock for 15 minutes, 20 percent
--                    for another 15, and 30 percent for the rest of the day.
--                    During a halt every buy and sale is refused in words;
--                    the price itself keeps following the data.
-- Floor and ceiling (stock_floor, stock_ceiling) still bound every price.
-- Nothing is smoothed and no median is taken.
--
-- SCHEDULING. _coin_stocks_tick throttles itself to one tick each 30 seconds,
-- and is called by: pg_cron every minute when the extension is installed (this
-- file schedules the job, see the last block), every trade, the stocks page on
-- load (coin_stocks_tick), and coin_autopay_run. Without pg_cron the prices
-- still update, on the next page load or trade.
--
-- UNDO: select cron.unschedule('coin-stocks-tick') if it was scheduled;
-- restore 0279's and 0281's function bodies by re-pasting PART C through
-- PART G of 0279 (they re-create the v1 functions; then drop the functions
-- this file creates); drop the tables coin_stock_ticks, coin_stock_halts,
-- coin_stock_state and coin_stock_relaunch and the five columns added to
-- coin_stocks and coin_stock_closes. THE DELETED CLOSES DO NOT COME BACK FROM
-- ANY OF THAT: they are only in a database backup taken before the apply, and
-- they were the fabricated history this file exists to remove.

-- ===== PART A BEGIN =====
-- ===== PART A: COLUMNS AND TABLES =====

alter table public.coin_stocks add column if not exists launched_at timestamptz;
alter table public.coin_stocks add column if not exists launch_price numeric(12,4);
alter table public.coin_stocks add column if not exists anchor_price numeric(12,4);
alter table public.coin_stocks add column if not exists anchor_signal numeric;

-- A day's row is live until the day ends: close is the latest price, open the
-- first, high and low the extremes, prev_close the day's reference.
alter table public.coin_stock_closes add column if not exists open numeric(12,4);
alter table public.coin_stock_closes add column if not exists high numeric(12,4);
alter table public.coin_stock_closes add column if not exists low numeric(12,4);
alter table public.coin_stock_closes add column if not exists ticks integer not null default 0;

-- Every price change, with what made it. A tick that changes nothing writes no
-- row here, so the table grows with the data, not with the clock.
create table if not exists public.coin_stock_ticks (
	id bigint generated always as identity primary key,
	stock_id text not null references public.coin_stocks (id) on delete cascade,
	at timestamptz not null,
	day date not null,
	price numeric(12,4) not null check (price > 0),
	raw numeric(12,4),
	signal numeric,
	ref_price numeric(12,4),
	phase text not null check (phase in ('launch', 'ramp', 'open')),
	cap_percent numeric,
	carried boolean not null default false,
	note text,
	inputs jsonb not null default '{}'::jsonb,
	formula_version text not null
);
create index if not exists coin_stock_ticks_stock_at on public.coin_stock_ticks (stock_id, at desc);
alter table public.coin_stock_ticks enable row level security;
revoke all on table public.coin_stock_ticks from public, anon, authenticated, service_role;
-- The identity column's sequence arrives with the project's default grants too.
revoke all on sequence public.coin_stock_ticks_id_seq from public, anon, authenticated, service_role;

create table if not exists public.coin_stock_halts (
	id uuid primary key default gen_random_uuid(),
	stock_id text not null references public.coin_stocks (id) on delete cascade,
	day date not null,
	level integer not null check (level between 1 and 9),
	move_percent numeric(10,2) not null,
	ref_price numeric(12,4) not null,
	price numeric(12,4) not null,
	started_at timestamptz not null,
	ends_at timestamptz not null,
	unique (stock_id, day, level)
);
create index if not exists coin_stock_halts_live on public.coin_stock_halts (stock_id, ends_at desc);
alter table public.coin_stock_halts enable row level security;
revoke all on table public.coin_stock_halts from public, anon, authenticated, service_role;

-- One row: when the last tick ran, for the throttle and the page.
create table if not exists public.coin_stock_state (
	id boolean primary key default true check (id),
	last_tick_at timestamptz,
	last_trigger text,
	last_result jsonb
);
alter table public.coin_stock_state enable row level security;
revoke all on table public.coin_stock_state from public, anon, authenticated, service_role;

-- What each holder had at the relaunch, so "value unchanged" can be checked.
create table if not exists public.coin_stock_relaunch (
	student_email text not null,
	stock_id text not null references public.coin_stocks (id) on delete cascade,
	shares_before numeric(18,6) not null,
	cost_basis numeric(12,2) not null,
	old_price numeric(12,4),
	launch_price numeric(12,4) not null,
	shares_after numeric(18,6) not null,
	value_before numeric(12,2) not null,
	value_after numeric(12,2) not null,
	launched_at timestamptz not null,
	primary key (student_email, stock_id)
);
alter table public.coin_stock_relaunch enable row level security;
revoke all on table public.coin_stock_relaunch from public, anon, authenticated, service_role;

-- The minute tick reads these by time.
create index if not exists submissions_created_at_idx on public.submissions (created_at);
create index if not exists classroom_submissions_returned_at_idx on public.classroom_submissions (returned_at)
	where state = 'returned';
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: THE RULE, IN ONE PLACE =====

-- The launch ramp and the circuit breakers. Every number the price rule uses
-- beyond the settings is here and nowhere else; coin_stocks_board hands this
-- object to the page, which only displays it.
create or replace function public._coin_stock_rules()
returns jsonb
language sql
stable
set search_path = ''
as $$
	select jsonb_build_object(
		'formula_version', 'v2',
		'ramp', jsonb_build_array(
			jsonb_build_object('week', 1, 'cap_percent', 5),
			jsonb_build_object('week', 2, 'cap_percent', 10),
			jsonb_build_object('week', 3, 'cap_percent', 15),
			jsonb_build_object('week', 4, 'cap_percent', 25)),
		'halts', jsonb_build_array(
			jsonb_build_object('level', 1, 'move_percent', 10, 'minutes', 15),
			jsonb_build_object('level', 2, 'move_percent', 20, 'minutes', 15),
			jsonb_build_object('level', 3, 'move_percent', 30, 'minutes', null)),
		'tick_seconds', 60,
		'throttle_seconds', 30);
$$;
revoke all on function public._coin_stock_rules() from public, anon, authenticated, service_role;

-- Where a stock stands in the ramp at a moment, measured from its launch.
create or replace function public._coin_stock_phase(p_launched_at timestamptz, p_at timestamptz)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
	v_ramp jsonb := public._coin_stock_rules() -> 'ramp';
	v_weeks integer := jsonb_array_length(public._coin_stock_rules() -> 'ramp');
	v_week integer;
begin
	if p_launched_at is null then
		return jsonb_build_object('phase', 'launch', 'week', null, 'cap_percent', null);
	end if;
	v_week := greatest(floor(extract(epoch from (p_at - p_launched_at)) / 604800)::integer + 1, 1);
	if v_week <= v_weeks then
		return jsonb_build_object('phase', 'ramp', 'week', v_week,
			'cap_percent', (v_ramp -> (v_week - 1) ->> 'cap_percent')::numeric,
			'next_at', p_launched_at + make_interval(days => v_week * 7),
			'ramp_ends', p_launched_at + make_interval(days => v_weeks * 7));
	end if;
	return jsonb_build_object('phase', 'open', 'week', v_week, 'cap_percent', null,
		'ramp_ends', p_launched_at + make_interval(days => v_weeks * 7));
end;
$$;
revoke all on function public._coin_stock_phase(timestamptz, timestamptz) from public, anon, authenticated, service_role;

-- The halt in force on a stock at a moment, or null.
create or replace function public._coin_stock_halt(p_stock_id text, p_at timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object('level', h.level, 'move_percent', h.move_percent, 'started_at', h.started_at,
		'until', h.ends_at, 'rest_of_day', h.ends_at >= ((h.day + 1)::timestamp at time zone 'America/Los_Angeles'))
	from public.coin_stock_halts h
	where h.stock_id = p_stock_id and h.started_at <= p_at and h.ends_at > p_at
	order by h.ends_at desc, h.level desc
	limit 1;
$$;
revoke all on function public._coin_stock_halt(text, timestamptz) from public, anon, authenticated, service_role;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE SIGNALS, OVER A WINDOW ENDING AT THE TICK =====

drop function if exists public._coin_stock_signal_class(uuid, date);
drop function if exists public._coin_stock_signal_people(text, date);

create or replace function public._coin_stock_signal(p_stock public.coin_stocks, p_at timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_weeks integer := coalesce((public._coin_setting('stock_class_window_weeks') #>> '{}')::integer, 4);
	v_min integer := coalesce((public._coin_setting('stock_min_class_students') #>> '{}')::integer, 3);
	v_from timestamptz;
	v_earned numeric;
	v_out numeric;
	v_students integer;
	v_items integer;
	v_pd integer;
	v_people integer;
begin
	if p_stock.kind = 'class' then
		if p_stock.section_id is null then
			return jsonb_build_object('has_data', false, 'inputs', '{}'::jsonb, 'why_not', 'This class no longer exists.');
		end if;
		v_from := p_at - make_interval(days => v_weeks * 7);
		select coalesce(sum(o.earned), 0), coalesce(sum(o.out_of), 0), count(distinct o.student_email), count(distinct o.item_id)
		into v_earned, v_out, v_students, v_items
		from (
			select s.student_email, s.item_id,
				coalesce(s.score, 0) - coalesce(s.extra_credit, 0) as earned,
				public._classroom_item_out_of(s.item_id) as out_of
			from public.classroom_submissions s
			join public.classroom_postings p on p.item_id = s.item_id and p.section_id = p_stock.section_id
			join public.classroom_enrollments e on e.section_id = p_stock.section_id and e.student_email = s.student_email and e.active
			where s.state = 'returned' and s.returned_at > v_from and s.returned_at <= p_at
				and not public._classroom_manages_section_email(p_stock.section_id, s.student_email)
		) o
		where o.out_of is not null and o.out_of > 0;
		return jsonb_build_object(
			'has_data', v_out > 0 and v_students >= v_min,
			'signal', case when v_out > 0 and v_students >= v_min then round(v_earned / v_out, 6) end,
			'inputs', jsonb_build_object('earned', v_earned, 'out_of', v_out, 'students', v_students,
				'items', v_items, 'window_start', v_from, 'window_end', p_at, 'min_students', v_min),
			'why_not', case when v_out <= 0 then 'No work was returned in this class in the last ' || v_weeks || ' weeks.'
				when v_students < v_min then 'Fewer than ' || v_min || ' students had work returned in the last ' || v_weeks || ' weeks.' end);
	end if;

	v_from := p_at - interval '7 days';
	if p_stock.kind = 'foundry' then
		select count(*), count(distinct x.who) into v_pd, v_people from (
			select pl.player as who, public._coin_la_today(pl.started_at) as d from public.student_app_plays pl
			where pl.player is not null and pl.started_at > v_from and pl.started_at <= p_at
			union
			select a.owner, public._coin_la_today(v.created_at) from public.student_app_versions v
			join public.student_apps a on a.id = v.app_id
			where v.created_at > v_from and v.created_at <= p_at
		) x;
	elsif p_stock.kind = 'gauntlet' then
		select count(*), count(distinct x.who) into v_pd, v_people from (
			select distinct s.user_id as who, public._coin_la_today(s.created_at) as d from public.submissions s
			where s.created_at > v_from and s.created_at <= p_at
		) x;
	else
		return jsonb_build_object('has_data', false, 'inputs', '{}'::jsonb, 'why_not', 'This kind of stock has no signal.');
	end if;
	return jsonb_build_object('has_data', true, 'signal', round(v_pd / 7.0, 6),
		'inputs', jsonb_build_object('person_days', v_pd, 'people', v_people, 'window_start', v_from, 'window_end', p_at));
end;
$$;
revoke all on function public._coin_stock_signal(public.coin_stocks, timestamptz) from public, anon, authenticated, service_role;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: ONE PRICE, ONE TICK =====

drop function if exists public._coin_stock_close(text, date);
drop function if exists public._coin_stock_num(public.coin_stocks, text, numeric);

-- Price one stock at a moment and write it: the day's row, a tick row when
-- the price changed, and any circuit breaker the move trips.
create or replace function public._coin_stock_price(p_stock_id text, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_s public.coin_stocks;
	v_day date := public._coin_la_today(p_at);
	v_floor numeric := coalesce((public._coin_setting('stock_floor') #>> '{}')::numeric, 1);
	v_ceiling numeric := coalesce((public._coin_setting('stock_ceiling') #>> '{}')::numeric, 100);
	v_base numeric := coalesce((public._coin_setting('stock_base') #>> '{}')::numeric, 10);
	v_rules jsonb := public._coin_stock_rules();
	v_ref numeric;
	v_last numeric;
	v_sig jsonb;
	v_signal numeric;
	v_raw numeric;
	v_price numeric;
	v_carried boolean := false;
	v_note text;
	v_inputs jsonb := '{}'::jsonb;
	v_members jsonb;
	v_mean numeric;
	v_phase jsonb;
	v_cap numeric;
	v_move numeric;
	v_lvl jsonb;
	v_halts integer := 0;
	v_prev_price numeric;
	v_prev_day date;
	v_changed boolean;
begin
	select * into v_s from public.coin_stocks s where s.id = p_stock_id for update;
	if v_s.id is null then
		return null;
	end if;
	if v_s.launched_at is null or v_s.launch_price is null then
		update public.coin_stocks s
		set launched_at = coalesce(s.launched_at, p_at),
			launch_price = coalesce(s.launch_price, (select c.close from public.coin_stock_closes c where c.stock_id = s.id order by c.day desc limit 1), v_base),
			anchor_price = coalesce(s.anchor_price, s.launch_price, (select c.close from public.coin_stock_closes c where c.stock_id = s.id order by c.day desc limit 1), v_base)
		where s.id = p_stock_id
		returning * into v_s;
	end if;

	select c.close into v_ref from public.coin_stock_closes c
	where c.stock_id = p_stock_id and c.day < v_day order by c.day desc limit 1;
	v_ref := coalesce(v_ref, v_s.launch_price);
	select c.close into v_last from public.coin_stock_closes c where c.stock_id = p_stock_id and c.day = v_day;
	v_last := coalesce(v_last, v_ref);

	if v_s.kind = 'index' then
		select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'ticker', m.ticker, 'price', l.close,
				'launch_price', m.launch_price, 'ratio', round(l.close / m.launch_price, 6)) order by m.sort_order, m.id), '[]'::jsonb),
			avg(l.close / m.launch_price)
		into v_members, v_mean
		from public.coin_stocks m
		cross join lateral (select c.close from public.coin_stock_closes c where c.stock_id = m.id order by c.day desc limit 1) l
		where m.active and m.kind <> 'index' and m.launch_price > 0;
		v_inputs := jsonb_build_object('members', v_members,
			'rule', 'launch price times the average of each member''s price over its launch price');
		if v_mean is null then
			v_note := 'No member stock has a price, so the price holds.';
		else
			v_signal := round(v_mean, 6);
			v_raw := coalesce(v_s.anchor_price, v_s.launch_price) * v_mean;
		end if;
	else
		v_sig := public._coin_stock_signal(v_s, p_at);
		v_inputs := coalesce(v_sig -> 'inputs', '{}'::jsonb);
		if not coalesce((v_sig ->> 'has_data')::boolean, false) then
			v_note := coalesce(v_sig ->> 'why_not', 'No data.') || ' The price holds.';
		else
			v_signal := (v_sig ->> 'signal')::numeric;
			if coalesce(v_s.anchor_signal, 0) <= 0 then
				if v_signal > 0 then
					update public.coin_stocks s set anchor_signal = v_signal, anchor_price = v_last where s.id = p_stock_id;
					v_s.anchor_signal := v_signal;
					v_s.anchor_price := v_last;
					v_raw := v_last;
					v_note := 'First real reading since the launch: the price moves with the signal from here.';
				else
					v_note := 'The signal is zero and there is no earlier reading to compare it with, so the price holds.';
				end if;
			else
				v_raw := v_s.anchor_price * v_signal / v_s.anchor_signal;
			end if;
		end if;
	end if;

	v_phase := public._coin_stock_phase(v_s.launched_at, p_at);
	if v_raw is null then
		v_price := v_last;
		v_carried := true;
	else
		v_price := v_raw;
		if v_phase ->> 'phase' = 'ramp' and v_ref > 0 then
			v_cap := (v_phase ->> 'cap_percent')::numeric / 100;
			v_price := least(greatest(v_price, v_ref * (1 - v_cap)), v_ref * (1 + v_cap));
			if round(v_price, 4) <> round(v_raw, 4) then
				v_note := coalesce(v_note || ' ', '') || 'The data says ' || trim_scale(round(v_raw, 2))
					|| '; in launch week ' || (v_phase ->> 'week') || ' a price moves at most '
					|| (v_phase ->> 'cap_percent') || '% a day from ' || trim_scale(round(v_ref, 2)) || '.';
			end if;
		end if;
		v_price := least(greatest(v_price, v_floor), v_ceiling);
	end if;
	v_price := round(v_price, 4);
	v_raw := round(least(v_raw, 99999999), 4);
	v_inputs := v_inputs || jsonb_build_object('ref', v_ref, 'floor', v_floor, 'ceiling', v_ceiling,
		'anchor_price', v_s.anchor_price, 'anchor_signal', v_s.anchor_signal, 'launch_price', v_s.launch_price,
		'phase', v_phase ->> 'phase', 'week', v_phase -> 'week', 'cap_percent', v_phase -> 'cap_percent');

	insert into public.coin_stock_closes as c (stock_id, day, close, prev_close, target, signal, median, carried, note, inputs,
		formula_version, computed_at, open, high, low, ticks)
	values (p_stock_id, v_day, v_price, v_ref, v_raw, v_signal, null, v_carried, v_note, v_inputs,
		'v2', p_at, v_price, v_price, v_price, 1)
	on conflict (stock_id, day) do update set
		close = excluded.close, target = excluded.target, signal = excluded.signal, carried = excluded.carried,
		note = excluded.note, inputs = excluded.inputs, formula_version = 'v2', computed_at = excluded.computed_at,
		open = coalesce(c.open, c.close), high = greatest(coalesce(c.high, c.close), excluded.close),
		low = least(coalesce(c.low, c.close), excluded.close), ticks = c.ticks + 1
	where c.close is distinct from excluded.close or c.signal is distinct from excluded.signal
		or c.carried is distinct from excluded.carried or c.note is distinct from excluded.note;

	select t.price, t.day into v_prev_price, v_prev_day from public.coin_stock_ticks t
	where t.stock_id = p_stock_id order by t.at desc, t.id desc limit 1;
	v_changed := v_prev_price is null or v_prev_price <> v_price or v_prev_day <> v_day;
	if v_changed then
		insert into public.coin_stock_ticks (stock_id, at, day, price, raw, signal, ref_price, phase, cap_percent, carried,
			note, inputs, formula_version)
		values (p_stock_id, p_at, v_day, v_price, v_raw, v_signal, v_ref, v_phase ->> 'phase',
			(v_phase ->> 'cap_percent')::numeric, v_carried, v_note, v_inputs, 'v2');
	end if;

	-- The circuit breakers: after the ramp only, each level once a day.
	if v_phase ->> 'phase' = 'open' and v_ref > 0 then
		v_move := (v_price - v_ref) / v_ref * 100;
		for v_lvl in select value from jsonb_array_elements(v_rules -> 'halts') order by (value ->> 'level')::integer loop
			if abs(v_move) >= (v_lvl ->> 'move_percent')::numeric and not exists (
				select 1 from public.coin_stock_halts h
				where h.stock_id = p_stock_id and h.day = v_day and h.level = (v_lvl ->> 'level')::integer
			) then
				insert into public.coin_stock_halts (stock_id, day, level, move_percent, ref_price, price, started_at, ends_at)
				values (p_stock_id, v_day, (v_lvl ->> 'level')::integer, round(v_move, 2), v_ref, v_price, p_at,
					case when jsonb_typeof(v_lvl -> 'minutes') = 'number'
						then p_at + make_interval(mins => (v_lvl ->> 'minutes')::integer)
						else (v_day + 1)::timestamp at time zone 'America/Los_Angeles' end)
				on conflict (stock_id, day, level) do nothing;
				v_halts := v_halts + 1;
			end if;
		end loop;
	end if;

	return jsonb_build_object('stock_id', p_stock_id, 'price', v_price, 'raw', v_raw, 'carried', v_carried,
		'changed', v_changed, 'halts', v_halts);
end;
$$;
revoke all on function public._coin_stock_price(text, timestamptz) from public, anon, authenticated, service_role;

-- One class stock per economy-on class, named for it. A new one launches at
-- the base when it is created; its first real reading anchors it.
drop function if exists public._coin_stock_sync();
create or replace function public._coin_stock_sync(p_at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_n integer;
	v_base numeric := coalesce((public._coin_setting('stock_base') #>> '{}')::numeric, 10);
begin
	insert into public.coin_stocks (id, kind, ticker, name, section_id, sort_order, launched_at, launch_price, anchor_price)
	select 'class:' || s.id::text, 'class',
		left(upper(regexp_replace(coalesce(c.code, 'CLASS'), '[^A-Za-z0-9]', '', 'g')), 8)
			|| left(regexp_replace(coalesce(s.block, s.label, ''), '[^0-9]', '', 'g'), 3),
		coalesce(public._coin_classroom_section_label(s.id), 'A class'),
		s.id, 100, p_at, v_base, v_base
	from public.classroom_sections s
	left join public.classroom_courses c on c.id = s.course_id
	where s.active and s.coin_economy_on
	on conflict (id) do nothing;
	get diagnostics v_n = row_count;
	return v_n;
end;
$$;
revoke all on function public._coin_stock_sync(timestamptz) from public, anon, authenticated, service_role;

-- Every active stock at one moment: members first, then the index. One
-- stock's failure is a warning, never the end of the tick.
create or replace function public._coin_stocks_tick_at(p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_s record;
	v_r jsonb;
	v_n integer := 0;
	v_changed integer := 0;
	v_halts integer := 0;
	v_failed integer := 0;
begin
	perform public._coin_stock_sync(p_at);
	for v_s in select s.id from public.coin_stocks s where s.active
		order by (s.kind = 'index'), s.sort_order, s.id loop
		begin
			v_r := public._coin_stock_price(v_s.id, p_at);
			v_n := v_n + 1;
			if coalesce((v_r ->> 'changed')::boolean, false) then
				v_changed := v_changed + 1;
			end if;
			v_halts := v_halts + coalesce((v_r ->> 'halts')::integer, 0);
		exception when others then
			v_failed := v_failed + 1;
			raise warning 'coin stocks: pricing % failed: %', v_s.id, sqlerrm;
		end;
	end loop;
	return jsonb_build_object('at', p_at, 'stocks', v_n, 'changed', v_changed, 'halts', v_halts, 'failed', v_failed);
end;
$$;
revoke all on function public._coin_stocks_tick_at(timestamptz) from public, anon, authenticated, service_role;

-- The throttled tick every caller uses: class days only, one at a time, at
-- most one each 30 seconds.
create or replace function public._coin_stocks_tick(p_trigger text default 'page')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_last timestamptz;
	v_r jsonb;
	v_throttle integer := (public._coin_stock_rules() ->> 'throttle_seconds')::integer;
begin
	if not public._coin_is_class_day(public._coin_la_today()) then
		return jsonb_build_object('ran', false, 'reason', 'closed');
	end if;
	if not pg_try_advisory_xact_lock(hashtext('coin_stocks_tick')) then
		return jsonb_build_object('ran', false, 'reason', 'busy');
	end if;
	insert into public.coin_stock_state (id) values (true) on conflict (id) do nothing;
	select st.last_tick_at into v_last from public.coin_stock_state st where st.id for update;
	if v_last is not null and v_last > now() - make_interval(secs => v_throttle) then
		return jsonb_build_object('ran', false, 'reason', 'recent', 'at', v_last);
	end if;
	v_r := public._coin_stocks_tick_at(now());
	update public.coin_stock_state st set last_tick_at = now(),
		last_trigger = left(coalesce(p_trigger, 'page'), 20), last_result = v_r
	where st.id;
	return jsonb_build_object('ran', true) || v_r;
end;
$$;
revoke all on function public._coin_stocks_tick(text) from public, anon, authenticated, service_role;

-- The stocks page asks for a tick on load. Counts only.
create or replace function public.coin_stocks_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_r jsonb;
begin
	if (select auth.uid()) is null then
		return jsonb_build_object('ran', false, 'reason', 'signed_out');
	end if;
	v_r := public._coin_stocks_tick('page');
	return jsonb_build_object('ran', v_r -> 'ran', 'reason', v_r -> 'reason', 'changed', v_r -> 'changed', 'halts', v_r -> 'halts');
end;
$$;
revoke all on function public.coin_stocks_tick() from public, anon, authenticated, service_role;
grant execute on function public.coin_stocks_tick() to authenticated;

-- coin_autopay_run (0281) still calls this by name; it is now the tick.
create or replace function public._coin_stocks_nightly(p_run bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
	return coalesce((public._coin_stocks_tick('autopay') ->> 'changed')::integer, 0);
end;
$$;
revoke all on function public._coin_stocks_nightly(bigint) from public, anon, authenticated, service_role;
-- ===== PART D END =====

-- ===== PART E BEGIN =====
-- ===== PART E: TRADING, AT THE CURRENT PRICE, NEVER DURING A HALT =====

create or replace function public.coin_stock_buy(p_stock_id text, p_coins numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb;
	v_email text;
	v_s public.coin_stocks;
	v_last public.coin_stock_closes;
	v_halt jsonb;
	v_pct numeric := coalesce((public._coin_setting('stock_fee_percent') #>> '{}')::numeric, 2);
	v_cap numeric := coalesce((public._coin_setting('stock_position_cap') #>> '{}')::numeric, 50);
	v_fee numeric;
	v_net numeric;
	v_shares numeric;
	v_balance numeric;
	v_held numeric := 0;
	v_basis numeric := 0;
	v_buy public.coin_transactions;
	v_fee_row public.coin_transactions;
	v_meta jsonb;
begin
	if p_coins is null or p_coins < 0.5 or p_coins > 100000 or p_coins <> round(p_coins, 2) then
		return jsonb_build_object('ok', false, 'reason', 'coins');
	end if;
	v_seam := public._coin_student_seam('stock_buy');
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	select * into v_s from public.coin_stocks s where s.id = p_stock_id;
	if v_s.id is null or not v_s.active then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if not public._coin_is_class_day(public._coin_la_today()) then
		return jsonb_build_object('ok', false, 'reason', 'market_closed');
	end if;
	begin
		perform public._coin_stocks_tick('trade');
	exception when others then
		raise warning 'coin stocks: tick before a buy failed: %', sqlerrm;
	end;
	v_halt := public._coin_stock_halt(p_stock_id, now());
	if v_halt is not null then
		return jsonb_build_object('ok', false, 'reason', 'halted') || v_halt;
	end if;
	v_last := public._coin_stock_last(p_stock_id);
	if v_last.stock_id is null then
		return jsonb_build_object('ok', false, 'reason', 'no_price');
	end if;
	perform pg_advisory_xact_lock(hashtext('coin_stock:' || v_email));
	v_balance := public._coin_balance(v_email);
	if v_balance < 0 then
		return jsonb_build_object('ok', false, 'reason', 'in_debt', 'balance', v_balance);
	end if;
	if v_balance - p_coins < 0 then
		return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance, 'cost', p_coins);
	end if;
	v_fee := round(p_coins * v_pct / 100, 2);
	v_net := p_coins - v_fee;
	select p.shares, p.cost_basis into v_held, v_basis from public.coin_stock_positions p
	where p.student_email = v_email and p.stock_id = p_stock_id for update;
	v_held := coalesce(v_held, 0);
	v_basis := coalesce(v_basis, 0);
	if v_basis + v_net > v_cap then
		return jsonb_build_object('ok', false, 'reason', 'cap', 'cap', v_cap, 'cost_basis', v_basis,
			'room', greatest(round((v_cap - v_basis) / (1 - v_pct / 100), 2), 0));
	end if;
	v_shares := round(v_net / v_last.close, 6);
	if v_shares <= 0 then
		return jsonb_build_object('ok', false, 'reason', 'coins');
	end if;
	v_meta := jsonb_build_object('stock_id', p_stock_id, 'shares', v_shares, 'price', v_last.close, 'price_day', v_last.day,
		'price_at', v_last.computed_at, 'formula_version', v_last.formula_version);
	v_buy := public._coin_insert(v_email, 'stock_buy', -v_net, v_shares,
		left('Bought ' || trim_scale(v_shares) || ' shares of ' || v_s.ticker || ' at ' || trim_scale(v_last.close) || '.', 500),
		v_meta, 'digital');
	if v_fee > 0 then
		v_fee_row := public._coin_insert(v_email, 'stock_fee', -v_fee, null,
			'Trading fee, ' || trim_scale(v_pct) || '%: ' || v_s.ticker || '.', v_meta, 'digital');
	end if;
	insert into public.coin_stock_positions (student_email, stock_id, shares, cost_basis)
	values (v_email, p_stock_id, v_shares, v_net)
	on conflict (student_email, stock_id) do update set shares = public.coin_stock_positions.shares + excluded.shares,
		cost_basis = public.coin_stock_positions.cost_basis + excluded.cost_basis, updated_at = now();
	insert into public.coin_stock_trades (student_email, stock_id, side, shares, price, price_day, gross, fee, basis_moved,
		trade_txn, fee_txn)
	values (v_email, p_stock_id, 'buy', v_shares, v_last.close, v_last.day, v_net, v_fee, v_net, v_buy.id, v_fee_row.id);
	return jsonb_build_object('ok', true, 'shares', v_shares, 'price', v_last.close, 'fee', v_fee, 'invested', v_net,
		'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.coin_stock_buy(text, numeric) from public, anon, authenticated, service_role;
grant execute on function public.coin_stock_buy(text, numeric) to authenticated;

create or replace function public.coin_stock_sell(p_stock_id text, p_coins numeric, p_all boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb;
	v_email text;
	v_s public.coin_stocks;
	v_last public.coin_stock_closes;
	v_halt jsonb;
	v_pct numeric := coalesce((public._coin_setting('stock_fee_percent') #>> '{}')::numeric, 2);
	v_pos public.coin_stock_positions;
	v_shares numeric;
	v_gross numeric;
	v_fee numeric;
	v_moved numeric;
	v_pnl numeric;
	v_sell public.coin_transactions;
	v_fee_row public.coin_transactions;
	v_meta jsonb;
begin
	if not coalesce(p_all, false) and (p_coins is null or p_coins < 0.01 or p_coins > 100000 or p_coins <> round(p_coins, 2)) then
		return jsonb_build_object('ok', false, 'reason', 'coins');
	end if;
	v_seam := public._coin_student_seam('stock_sell');
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	select * into v_s from public.coin_stocks s where s.id = p_stock_id;
	if v_s.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if not public._coin_is_class_day(public._coin_la_today()) then
		return jsonb_build_object('ok', false, 'reason', 'market_closed');
	end if;
	begin
		perform public._coin_stocks_tick('trade');
	exception when others then
		raise warning 'coin stocks: tick before a sale failed: %', sqlerrm;
	end;
	v_halt := public._coin_stock_halt(p_stock_id, now());
	if v_halt is not null then
		return jsonb_build_object('ok', false, 'reason', 'halted') || v_halt;
	end if;
	v_last := public._coin_stock_last(p_stock_id);
	if v_last.stock_id is null then
		return jsonb_build_object('ok', false, 'reason', 'no_price');
	end if;
	perform pg_advisory_xact_lock(hashtext('coin_stock:' || v_email));
	select * into v_pos from public.coin_stock_positions p
	where p.student_email = v_email and p.stock_id = p_stock_id for update;
	if v_pos.student_email is null or v_pos.shares <= 0 then
		return jsonb_build_object('ok', false, 'reason', 'no_position');
	end if;
	if coalesce(p_all, false) then
		v_shares := v_pos.shares;
	else
		v_shares := round(p_coins / v_last.close, 6);
		-- NO SHORTING: never more shares than are held. A rounding hair over
		-- the holding is the holding.
		if v_shares > v_pos.shares + 0.000001 then
			return jsonb_build_object('ok', false, 'reason', 'no_short', 'shares_held', v_pos.shares,
				'value', round(v_pos.shares * v_last.close, 2));
		end if;
		v_shares := least(v_shares, v_pos.shares);
	end if;
	v_gross := round(v_shares * v_last.close, 2);
	if v_gross <= 0 then
		return jsonb_build_object('ok', false, 'reason', 'coins');
	end if;
	v_fee := round(v_gross * v_pct / 100, 2);
	v_moved := case when v_shares >= v_pos.shares then v_pos.cost_basis
		else round(v_pos.cost_basis * v_shares / v_pos.shares, 2) end;
	v_pnl := v_gross - v_moved;
	v_meta := jsonb_build_object('stock_id', p_stock_id, 'shares', v_shares, 'price', v_last.close,
		'price_day', v_last.day, 'price_at', v_last.computed_at, 'formula_version', v_last.formula_version,
		'cost_basis_moved', v_moved, 'pnl', v_pnl);
	v_sell := public._coin_insert(v_email, 'stock_sell', v_gross, v_shares,
		left('Sold ' || trim_scale(v_shares) || ' shares of ' || v_s.ticker || ' at ' || trim_scale(v_last.close) || '.', 500),
		v_meta, 'digital');
	if v_fee > 0 then
		v_fee_row := public._coin_insert(v_email, 'stock_fee', -v_fee, null,
			'Trading fee, ' || trim_scale(v_pct) || '%: ' || v_s.ticker || '.', v_meta, 'digital');
	end if;
	update public.coin_stock_positions p
	set shares = case when v_shares >= p.shares then 0 else p.shares - v_shares end,
		cost_basis = greatest(p.cost_basis - v_moved, 0), updated_at = now()
	where p.student_email = v_email and p.stock_id = p_stock_id;
	insert into public.coin_stock_trades (student_email, stock_id, side, shares, price, price_day, gross, fee, basis_moved,
		pnl, trade_txn, fee_txn)
	values (v_email, p_stock_id, 'sell', v_shares, v_last.close, v_last.day, v_gross, v_fee, v_moved, v_pnl, v_sell.id, v_fee_row.id);
	return jsonb_build_object('ok', true, 'shares', v_shares, 'price', v_last.close, 'gross', v_gross, 'fee', v_fee,
		'pnl', v_pnl, 'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.coin_stock_sell(text, numeric, boolean) from public, anon, authenticated, service_role;
grant execute on function public.coin_stock_sell(text, numeric, boolean) to authenticated;
-- ===== PART E END =====

-- ===== PART F BEGIN =====
-- ===== PART F: READS =====

-- One stock for a page: the day's row as last, the launch, where it is in the
-- ramp, any halt, and its price changes since the launch as the series.
create or replace function public._coin_stock_json(s public.coin_stocks, p_series integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'id', s.id, 'kind', s.kind, 'ticker', s.ticker, 'name', s.name, 'active', s.active,
		'section_id', s.section_id,
		'last', (select jsonb_build_object('day', c.day, 'close', c.close, 'prev', c.prev_close, 'carried', c.carried,
				'at', c.computed_at, 'open', c.open, 'high', c.high, 'low', c.low,
				'change_percent', case when c.prev_close > 0 then round((c.close - c.prev_close) / c.prev_close * 100, 2) end)
			from public.coin_stock_closes c where c.stock_id = s.id order by c.day desc limit 1),
		'launch', jsonb_build_object('at', s.launched_at, 'price', s.launch_price),
		'phase', public._coin_stock_phase(s.launched_at, now()),
		'halt', public._coin_stock_halt(s.id, now()),
		'series', coalesce((select jsonb_agg(jsonb_build_object('at', x.at, 'close', x.price) order by x.at, x.id)
			from (select t.id, t.at, t.price from public.coin_stock_ticks t where t.stock_id = s.id
				order by t.at desc, t.id desc limit greatest(p_series, 1)) x), '[]'::jsonb));
$$;
revoke all on function public._coin_stock_json(public.coin_stocks, integer) from public, anon, authenticated, service_role;

create or replace function public.coin_stocks_board()
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
		return jsonb_build_object('signed_in', false);
	end if;
	return jsonb_build_object(
		'signed_in', true,
		'in_economy', exists (select 1 from public._coin_economy_enrollments() x where x.student_email = v_email),
		'balance', public._coin_balance(v_email),
		'open_today', public._coin_is_class_day(public._coin_la_today()),
		'launched_at', (select min(s.launched_at) from public.coin_stocks s where s.kind <> 'class'),
		'last_tick_at', (select st.last_tick_at from public.coin_stock_state st where st.id),
		'rules', public._coin_stock_rules() || jsonb_build_object(
			'fee_percent', coalesce((public._coin_setting('stock_fee_percent') #>> '{}')::numeric, 2),
			'position_cap', coalesce((public._coin_setting('stock_position_cap') #>> '{}')::numeric, 50),
			'floor', coalesce((public._coin_setting('stock_floor') #>> '{}')::numeric, 1),
			'ceiling', coalesce((public._coin_setting('stock_ceiling') #>> '{}')::numeric, 100),
			'base', coalesce((public._coin_setting('stock_base') #>> '{}')::numeric, 10),
			'class_window_weeks', coalesce((public._coin_setting('stock_class_window_weeks') #>> '{}')::numeric, 4),
			'min_class_students', coalesce((public._coin_setting('stock_min_class_students') #>> '{}')::numeric, 3)),
		'stocks', coalesce((select jsonb_agg(public._coin_stock_json(s, 240) order by (s.kind = 'index') desc, s.sort_order, s.ticker)
			from public.coin_stocks s where s.active), '[]'::jsonb),
		'portfolio', public._coin_portfolio(v_email),
		'leaderboard', coalesce((select jsonb_agg(jsonb_build_object('name', public._coin_market_name(b.email),
				'value', b.value, 'me', b.email = v_email) order by b.value desc)
			from (select p.student_email as email, round(sum(p.shares * coalesce(l.close, 0)), 2) as value
				from public.coin_stock_positions p
				left join lateral (select c.close from public.coin_stock_closes c where c.stock_id = p.stock_id
					order by c.day desc limit 1) l on true
				where p.shares > 0
				group by p.student_email
				order by 2 desc limit 20) b), '[]'::jsonb));
end;
$$;
revoke all on function public.coin_stocks_board() from public, anon, authenticated, service_role;
grant execute on function public.coin_stocks_board() to authenticated;

-- One stock: its days since the launch (open, high, low, close), its latest
-- price changes with the inputs that made each, and its halts.
create or replace function public.coin_stock_detail(p_stock_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_s public.coin_stocks;
	v_email text := public.current_user_email();
begin
	if (select auth.uid()) is null or v_email = '' then
		return jsonb_build_object('ok', false, 'reason', 'signed_out');
	end if;
	select * into v_s from public.coin_stocks s where s.id = p_stock_id and (s.active or public._coin_full_staff());
	if v_s.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	return jsonb_build_object('ok', true, 'stock', public._coin_stock_json(v_s, 1000),
		'launch', jsonb_build_object('at', v_s.launched_at, 'price', v_s.launch_price,
			'anchor_price', v_s.anchor_price, 'anchor_signal', v_s.anchor_signal),
		'days', coalesce((select jsonb_agg(jsonb_build_object('day', c.day, 'open', coalesce(c.open, c.close), 'high', coalesce(c.high, c.close),
				'low', coalesce(c.low, c.close), 'close', c.close, 'prev', c.prev_close, 'changes', c.ticks) order by c.day desc)
			from (select * from public.coin_stock_closes c2 where c2.stock_id = v_s.id order by c2.day desc limit 60) c), '[]'::jsonb),
		'ticks', coalesce((select jsonb_agg(jsonb_build_object('at', t.at, 'price', t.price, 'raw', t.raw, 'signal', t.signal,
				'ref', t.ref_price, 'phase', t.phase, 'cap_percent', t.cap_percent, 'carried', t.carried, 'note', t.note,
				'inputs', t.inputs, 'formula_version', t.formula_version) order by t.at desc, t.id desc)
			from (select * from public.coin_stock_ticks t2 where t2.stock_id = v_s.id order by t2.at desc, t2.id desc limit 60) t), '[]'::jsonb),
		'halts', coalesce((select jsonb_agg(jsonb_build_object('day', h.day, 'level', h.level, 'move_percent', h.move_percent,
				'started_at', h.started_at, 'until', h.ends_at) order by h.started_at desc)
			from (select * from public.coin_stock_halts h2 where h2.stock_id = v_s.id order by h2.started_at desc limit 20) h), '[]'::jsonb),
		'position', (select jsonb_build_object('shares', p.shares, 'cost_basis', p.cost_basis)
			from public.coin_stock_positions p where p.student_email = v_email and p.stock_id = v_s.id and p.shares > 0),
		'trades', coalesce((select jsonb_agg(jsonb_build_object('at', t.created_at, 'side', t.side, 'shares', t.shares,
				'price', t.price, 'gross', t.gross, 'fee', t.fee, 'pnl', t.pnl) order by t.created_at desc)
			from (select * from public.coin_stock_trades t2 where t2.student_email = v_email and t2.stock_id = v_s.id
				order by t2.created_at desc limit 30) t), '[]'::jsonb));
end;
$$;
revoke all on function public.coin_stock_detail(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_stock_detail(text) to authenticated;

-- A stock's own numbers are gone in v2 (the price has no base, clamp or
-- median per stock), so this now switches a stock on or off and refuses any
-- non-empty params object.
create or replace function public.coin_stock_admin_set(p_stock_id text, p_active boolean, p_params jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can manage the stocks.';
	end if;
	if not exists (select 1 from public.coin_stocks s where s.id = p_stock_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if p_params is not null and (jsonb_typeof(p_params) <> 'object' or p_params <> '{}'::jsonb) then
		return jsonb_build_object('ok', false, 'reason', 'params');
	end if;
	update public.coin_stocks s set active = coalesce(p_active, s.active), params = coalesce(p_params, s.params),
		updated_at = now()
	where s.id = p_stock_id;
	return jsonb_build_object('ok', true, 'stock_id', p_stock_id);
end;
$$;
revoke all on function public.coin_stock_admin_set(text, boolean, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.coin_stock_admin_set(text, boolean, jsonb) to authenticated;
-- ===== PART F END =====

-- ===== PART G BEGIN =====
-- ===== PART G: THE RELAUNCH, ONCE =====

do $launch$
declare
	v_now timestamptz := now();
	v_today date := public._coin_la_today(now());
	v_closes integer;
	v_stocks integer;
	v_positions integer;
	v_before numeric;
	v_after numeric;
	v_s public.coin_stocks;
	v_sig jsonb;
	v_signal numeric;
	v_inputs jsonb;
begin
	if exists (select 1 from public.coin_stocks s where s.launched_at is not null and s.kind <> 'class') then
		raise notice '0283: the market already launched at %; nothing was deleted or launched again.',
			(select min(s.launched_at) from public.coin_stocks s where s.kind <> 'class');
		return;
	end if;

	-- Every economy-on class has its stock before the launch.
	perform public._coin_stock_sync(v_now);

	-- 1. Today's price is the launch price.
	update public.coin_stocks s
	set launched_at = v_now,
		launch_price = coalesce((select c.close from public.coin_stock_closes c where c.stock_id = s.id order by c.day desc limit 1),
			coalesce((public._coin_setting('stock_base') #>> '{}')::numeric, 10)),
		anchor_price = null, anchor_signal = null, updated_at = now();
	update public.coin_stocks s set anchor_price = s.launch_price;
	get diagnostics v_stocks = row_count;

	-- 2. Holdings at their current value.
	insert into public.coin_stock_relaunch (student_email, stock_id, shares_before, cost_basis, old_price, launch_price,
		shares_after, value_before, value_after, launched_at)
	select p.student_email, p.stock_id, p.shares, p.cost_basis, l.close, s.launch_price,
		round(p.shares * coalesce(l.close, s.launch_price) / s.launch_price, 6),
		round(p.shares * coalesce(l.close, 0), 2),
		round(round(p.shares * coalesce(l.close, s.launch_price) / s.launch_price, 6) * s.launch_price, 2),
		v_now
	from public.coin_stock_positions p
	join public.coin_stocks s on s.id = p.stock_id
	left join lateral (select c.close from public.coin_stock_closes c where c.stock_id = p.stock_id order by c.day desc limit 1) l on true
	where p.shares > 0
	on conflict (student_email, stock_id) do nothing;
	get diagnostics v_positions = row_count;
	update public.coin_stock_positions p set shares = r.shares_after, updated_at = now()
	from public.coin_stock_relaunch r
	where r.student_email = p.student_email and r.stock_id = p.stock_id and r.shares_after <> p.shares;
	select coalesce(sum(r.value_before), 0), coalesce(sum(r.value_after), 0) into v_before, v_after from public.coin_stock_relaunch r;
	if abs(v_before - v_after) > 0.01 * greatest(v_positions, 1) then
		raise exception '0283 refused: holdings were worth % before the relaunch and % after it.', v_before, v_after;
	end if;

	-- 3. Every stored close goes: the chart starts at the launch.
	delete from public.coin_stock_closes;
	get diagnostics v_closes = row_count;
	delete from public.coin_stock_ticks;
	delete from public.coin_stock_halts;

	-- 4. The launch row and the first tick of each stock, with the signal it
	-- launched on as its anchor.
	for v_s in select * from public.coin_stocks s order by (s.kind = 'index'), s.sort_order, s.id loop
		v_signal := null;
		v_inputs := '{}'::jsonb;
		if v_s.kind = 'index' then
			v_signal := 1;
		else
			v_sig := public._coin_stock_signal(v_s, v_now);
			v_inputs := coalesce(v_sig -> 'inputs', '{}'::jsonb);
			if coalesce((v_sig ->> 'has_data')::boolean, false) and (v_sig ->> 'signal')::numeric > 0 then
				v_signal := (v_sig ->> 'signal')::numeric;
			end if;
		end if;
		update public.coin_stocks s set anchor_signal = v_signal where s.id = v_s.id;
		v_inputs := v_inputs || jsonb_build_object('launch', true, 'launch_price', v_s.launch_price, 'anchor_signal', v_signal);
		insert into public.coin_stock_closes (stock_id, day, close, prev_close, target, signal, carried, note, inputs,
			formula_version, computed_at, open, high, low, ticks)
		values (v_s.id, v_today, v_s.launch_price, v_s.launch_price, v_s.launch_price, v_signal, false,
			'Launch price: the price the stock had when the market relaunched.', v_inputs, 'v2', v_now,
			v_s.launch_price, v_s.launch_price, v_s.launch_price, 1);
		insert into public.coin_stock_ticks (stock_id, at, day, price, raw, signal, ref_price, phase, cap_percent, carried,
			note, inputs, formula_version)
		values (v_s.id, v_now, v_today, v_s.launch_price, v_s.launch_price, v_signal, v_s.launch_price, 'launch', null, false,
			'Launch price: the price the stock had when the market relaunched.', v_inputs, 'v2');
	end loop;

	insert into public.coin_stock_state (id, last_tick_at, last_trigger, last_result)
	values (true, v_now, 'launch', jsonb_build_object('stocks', v_stocks))
	on conflict (id) do update set last_tick_at = excluded.last_tick_at, last_trigger = excluded.last_trigger,
		last_result = excluded.last_result;

	raise notice '0283: relaunched % stocks at %; % stored closes deleted; % holdings carried over, worth % before and % after.',
		v_stocks, v_now, v_closes, v_positions, v_before, v_after;
end
$launch$;

-- The words students read about stocks, where nobody has edited them since
-- 0279 wrote them.
do $words$
declare
	v_n integer;
	v_m integer;
begin
	update public.coin_categories c
	set explanation = 'Each stock price comes straight from real site data and updates about every minute on class days. You buy and sell with the house at the current price, on class days only, with a fee each way and a limit on how many coins you can have in one stock. In the first four weeks after the launch a price can only move so far in a day; after that, a big move pauses trading in that stock for a while. You cannot short a stock (sell shares you do not own): a short can lose more coins than anyone holds, and the economy has no one to collect that debt from. You cannot buy while in debt, but you can sell. Shares are never part of your balance.'
	where c.id = 'stock_fee' and c.explanation = 'Each stock price is made from real site data and changes once a class day. You buy and sell with the house at the last closing price, on class days only, with a fee each way and a limit on how many coins you can have in one stock. You cannot short a stock (sell shares you do not own): a short can lose more coins than anyone holds, and the economy has no one to collect that debt from. You cannot buy while in debt, but you can always sell. Shares are never part of your balance.';
	get diagnostics v_n = row_count;
	update public.coin_categories c
	set explanation = 'Coins from selling shares, at the stock''s current price.',
		notes = 'System only: coins from selling shares, at the current price.'
	where c.id = 'stock_sell' and c.explanation = 'Coins from selling shares, at the stock''s last closing price.';
	get diagnostics v_m = row_count;
	raise notice '0283: % stock explanations reworded.', v_n + v_m;
end
$words$;
-- ===== PART G END =====

-- ===== PART H BEGIN =====
-- ===== PART H: THE MINUTE JOB =====

-- pg_cron runs the tick every minute where the extension is installed. It is
-- not installed by this file (extension changes are made in the dashboard).
-- Re-pasting this file after enabling pg_cron schedules the job; scheduling
-- by name replaces an existing job of that name.
do $cron$
begin
	if exists (select 1 from pg_namespace where nspname = 'cron') then
		begin
			perform cron.schedule('coin-stocks-tick', '* * * * *', 'select public._coin_stocks_tick(''cron'')');
			raise notice '0283: the stock tick runs every minute (pg_cron job coin-stocks-tick).';
		exception when others then
			raise notice '0283: pg_cron is installed but the minute job could not be scheduled: %. Prices still update on page loads and trades.', sqlerrm;
		end;
	else
		raise notice '0283: pg_cron is not installed, so prices update only on page loads and trades. Enable pg_cron (Database, Extensions) and paste this file again to tick every minute.';
	end if;
end
$cron$;
-- ===== PART H END =====

do $chk$
declare
	r record;
	v_bad text[] := '{}';
	v_names text[] := array['_coin_stock_rules', '_coin_stock_phase', '_coin_stock_halt', '_coin_stock_signal',
		'_coin_stock_price', '_coin_stock_sync', '_coin_stocks_tick_at', '_coin_stocks_tick', '_coin_stocks_nightly',
		'coin_stocks_tick', 'coin_stock_buy', 'coin_stock_sell', '_coin_stock_json', 'coin_stocks_board',
		'coin_stock_detail', 'coin_stock_admin_set'];
begin
	for r in
		select p.oid::regprocedure::text as sig, p.proname
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = any(v_names)
	loop
		if has_function_privilege('anon', r.sig, 'execute') then
			v_bad := array_append(v_bad, 'anon executes ' || r.sig);
		end if;
		if r.proname like '\_%' and has_function_privilege('authenticated', r.sig, 'execute') then
			v_bad := array_append(v_bad, 'a client role executes the private ' || r.sig);
		end if;
		if r.proname not like '\_%' and not has_function_privilege('authenticated', r.sig, 'execute') then
			v_bad := array_append(v_bad, 'authenticated lost ' || r.sig);
		end if;
	end loop;
	for r in select x as name from unnest(v_names) x loop
		if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.name) <> 1 then
			v_bad := array_append(v_bad, r.name || ' is not exactly one function');
		end if;
	end loop;
	if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
		and p.proname in ('_coin_stock_close', '_coin_stock_num', '_coin_stock_signal_class', '_coin_stock_signal_people')) then
		v_bad := array_append(v_bad, 'a v1 pricing function survived');
	end if;
	if exists (select 1 from public.coin_stocks s where s.launched_at is null or s.launch_price is null) then
		v_bad := array_append(v_bad, 'a stock has no launch');
	end if;
	if exists (select 1 from public.coin_stock_closes c join public.coin_stocks s on s.id = c.stock_id
		where c.day < public._coin_la_today(s.launched_at)) then
		v_bad := array_append(v_bad, 'a close older than its stock''s launch survived');
	end if;
	if not has_function_privilege('anon', 'public.coin_public_stocks()', 'execute') then
		v_bad := array_append(v_bad, 'the public stock tile lost its anon grant');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0283 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0283: % stocks launched, % closes, % ticks, formula v2.',
		(select count(*) from public.coin_stocks), (select count(*) from public.coin_stock_closes),
		(select count(*) from public.coin_stock_ticks);
end
$chk$;
