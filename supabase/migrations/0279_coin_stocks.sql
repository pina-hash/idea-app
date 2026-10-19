-- 0278_coin_stocks.sql
--
-- IDEA COIN LATER FEATURES, PART FOUR (ledger 0402, decision 70): A STOCK
-- MARKET WHOSE EVERY PRICE TRACES BACK TO RECORDED SITE DATA.
--
-- THE STOCKS (defined here, each switched on or off by a full coin admin):
--   class:<section>  one per economy-on class. The signal is the class grade
--                    ratio over the trailing 4 weeks: sum of (score minus
--                    extra credit) over sum of out-of, on work returned in the
--                    window. Fewer than 3 students with returned work is no
--                    data, so a price never stands for one student's grades.
--   foundry          distinct people active in the IDEA Foundry each day (a
--                    portal play started, or a version uploaded), as a
--                    trailing 7-day average. People, not minutes, so one
--                    student cannot pump it.
--   gauntlet         distinct people who submitted a GAUNTLET answer each
--                    day, as a trailing 7-day average.
--   idea             the master index: the equal-weighted mean of the day's
--                    closes of every other active stock.
-- Rejected, with the reason recorded in decision 70: an on-time submission
-- rate (a ported worksheet has no turn-in, so it would read every worksheet
-- as late) and tournament matches (they come in bursts, so the median of a
-- class day is zero and a price would be undefined most days).
--
-- THE PRICE (formula v1, every number a default): price = 10 x (signal /
-- the median of the signal over the trailing 8 weeks), its daily move
-- clamped to plus or minus 10 percent, floor 1, ceiling 100. A close is
-- computed for each class day once the day is over, by coin_autopay_run, and
-- STORES ITS INPUTS AND THE FORMULA VERSION. A class day with no data carries
-- the previous close and says so in its note; nothing is invented, filled or
-- smoothed.
--
-- TRADING: the house is the counterparty, at the last close. Buy and sell in
-- coin amounts, fractional shares allowed, a 2 percent fee each way (a sink),
-- at most 50 coins of cost basis in one stock, only on class days. No
-- shorting: a student sells only shares they hold. Selling is allowed in
-- debt; buying is not. A portfolio's value is never part of the balance.
--
-- COINS. A buy moves coins out of the balance into a position at cost; a sale
-- moves them back at the day's price. The difference (gain or loss) is the
-- house's, logged on every sale (coin_stock_trades.pnl and the row's meta),
-- and the fees are sinks. So balances plus positions at cost change only by
-- fees and logged gains and losses.
--
-- UNDO: drop the functions this file creates and the four coin_stock tables,
-- and delete the three stock_ categories if no row names them.

-- ===== PART A BEGIN =====
-- ===== PART A: THE TABLES =====

create table if not exists public.coin_stocks (
	id text primary key check (id ~ '^[a-z0-9_:-]{1,60}$'),
	kind text not null check (kind in ('class', 'foundry', 'gauntlet', 'index')),
	ticker text not null check (char_length(ticker) between 1 and 12),
	name text not null check (char_length(name) between 1 and 120),
	section_id uuid references public.classroom_sections (id) on delete set null,
	active boolean not null default true,
	-- Per-stock overrides of the formula's numbers: base, clamp_percent,
	-- median_weeks. Empty is the global default.
	params jsonb not null default '{}'::jsonb check (jsonb_typeof(params) = 'object'),
	sort_order integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
alter table public.coin_stocks enable row level security;
revoke all on table public.coin_stocks from public, anon, authenticated, service_role;

create table if not exists public.coin_stock_closes (
	stock_id text not null references public.coin_stocks (id) on delete cascade,
	day date not null,
	close numeric(12,4) not null check (close > 0),
	prev_close numeric(12,4),
	target numeric(12,4),
	signal numeric,
	median numeric,
	carried boolean not null default false,
	note text,
	inputs jsonb not null default '{}'::jsonb,
	formula_version text not null,
	computed_at timestamptz not null default now(),
	primary key (stock_id, day)
);
alter table public.coin_stock_closes enable row level security;
revoke all on table public.coin_stock_closes from public, anon, authenticated, service_role;

create table if not exists public.coin_stock_positions (
	student_email text not null check (student_email = lower(btrim(student_email))),
	stock_id text not null references public.coin_stocks (id) on delete restrict,
	shares numeric(18,6) not null default 0 check (shares >= 0),
	cost_basis numeric(12,2) not null default 0 check (cost_basis >= 0),
	updated_at timestamptz not null default now(),
	primary key (student_email, stock_id)
);
alter table public.coin_stock_positions enable row level security;
revoke all on table public.coin_stock_positions from public, anon, authenticated, service_role;

create table if not exists public.coin_stock_trades (
	id uuid primary key default gen_random_uuid(),
	student_email text not null,
	stock_id text not null references public.coin_stocks (id) on delete restrict,
	side text not null check (side in ('buy', 'sell')),
	shares numeric(18,6) not null check (shares > 0),
	price numeric(12,4) not null check (price > 0),
	price_day date not null,
	-- A buy: the coins that bought shares. A sale: the shares' value at price.
	gross numeric(12,2) not null check (gross > 0),
	fee numeric(12,2) not null default 0 check (fee >= 0),
	basis_moved numeric(12,2) not null default 0,
	pnl numeric(12,2) not null default 0,
	trade_txn uuid,
	fee_txn uuid,
	created_at timestamptz not null default now()
);
create index if not exists coin_stock_trades_student on public.coin_stock_trades (student_email, created_at desc);
alter table public.coin_stock_trades enable row level security;
revoke all on table public.coin_stock_trades from public, anon, authenticated, service_role;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: CATEGORIES, DEFAULTS, THE FIXED STOCKS =====

do $seed$
begin
	insert into public.coin_categories
		(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label,
		 formula_key, semester_point_cap, cap_period, cap_count, loggable, active, sort_order, notes, explanation)
	values
		('stock_buy', 'Stocks: shares bought', 'adjustment', 'core', 'variable', null, null, null, null,
		 null, null, null, null, false, true, 430,
		 'System only: coins moved into a stock position.',
		 'Coins you put into a stock. They are not in your balance while you hold the shares.'),
		('stock_sell', 'Stocks: shares sold', 'adjustment', 'core', 'variable', null, null, null, null,
		 null, null, null, null, false, true, 431,
		 'System only: coins from selling shares, at the last close.',
		 'Coins from selling shares, at the stock''s last closing price.'),
		('stock_fee', 'Stock trading fee', 'purchase', 'core', 'variable', null, null, null, null,
		 null, null, null, null, false, true, 432,
		 'System only: the trading fee, a sink.',
		 'Each stock price is made from real site data and changes once a class day. You buy and sell with the house at the last closing price, on class days only, with a fee each way and a limit on how many coins you can have in one stock. You cannot short a stock (sell shares you do not own): a short can lose more coins than anyone holds, and the economy has no one to collect that debt from. You cannot buy while in debt, but you can always sell. Shares are never part of your balance.')
	on conflict (id) do nothing;

	insert into public.coin_settings (key, value, updated_by) values
		('stock_fee_percent', '2'::jsonb, 'system'),
		('stock_position_cap', '50'::jsonb, 'system'),
		('stock_clamp_percent', '10'::jsonb, 'system'),
		('stock_floor', '1'::jsonb, 'system'),
		('stock_ceiling', '100'::jsonb, 'system'),
		('stock_base', '10'::jsonb, 'system'),
		('stock_median_weeks', '8'::jsonb, 'system'),
		('stock_class_window_weeks', '4'::jsonb, 'system'),
		('stock_min_class_students', '3'::jsonb, 'system')
	on conflict (key) do nothing;

	insert into public.coin_stocks (id, kind, ticker, name, sort_order) values
		('idea', 'index', 'IDEA', 'IDEA index', 0),
		('foundry', 'foundry', 'FNDRY', 'IDEA Foundry', 10),
		('gauntlet', 'gauntlet', 'GNTLT', 'GAUNTLET', 20)
	on conflict (id) do nothing;
end
$seed$;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE SIGNALS (each answers its inputs, never only a number) =====

create or replace function public._coin_stock_num(p_stock public.coin_stocks, p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce((p_stock.params ->> p_key)::numeric, (public._coin_setting('stock_' || p_key) #>> '{}')::numeric, p_default);
$$;
revoke all on function public._coin_stock_num(public.coin_stocks, text, numeric) from public, anon, authenticated, service_role;

-- A class: its grade ratio over the window ending p_day.
create or replace function public._coin_stock_signal_class(p_section_id uuid, p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_weeks integer := coalesce((public._coin_setting('stock_class_window_weeks') #>> '{}')::integer, 4);
	v_min integer := coalesce((public._coin_setting('stock_min_class_students') #>> '{}')::integer, 3);
	v_from date := p_day - v_weeks * 7 + 1;
	v_earned numeric;
	v_out numeric;
	v_students integer;
	v_items integer;
begin
	select coalesce(sum(o.earned), 0), coalesce(sum(o.out_of), 0), count(distinct o.student_email), count(distinct o.item_id)
	into v_earned, v_out, v_students, v_items
	from (
		select s.student_email, s.item_id,
			coalesce(s.score, 0) - coalesce(s.extra_credit, 0) as earned,
			public._classroom_item_out_of(s.item_id) as out_of
		from public.classroom_submissions s
		join public.classroom_postings p on p.item_id = s.item_id and p.section_id = p_section_id
		join public.classroom_enrollments e on e.section_id = p_section_id and e.student_email = s.student_email and e.active
		where s.state = 'returned' and s.returned_at is not null
			and public._coin_la_today(s.returned_at) between v_from and p_day
			and not public._classroom_manages_section_email(p_section_id, s.student_email)
	) o
	where o.out_of is not null and o.out_of > 0;
	return jsonb_build_object(
		'has_data', v_out > 0 and v_students >= v_min,
		'signal', case when v_out > 0 and v_students >= v_min then round(v_earned / v_out, 6) end,
		'inputs', jsonb_build_object('earned', v_earned, 'out_of', v_out, 'students', v_students,
			'items', v_items, 'window_start', v_from, 'window_end', p_day, 'min_students', v_min),
		'why_not', case when v_out <= 0 then 'No work was returned in this class in the window.'
			when v_students < v_min then 'Fewer than ' || v_min || ' students had work returned in the window.' end);
end;
$$;
revoke all on function public._coin_stock_signal_class(uuid, date) from public, anon, authenticated, service_role;

-- People active each day for seven days, and the average.
create or replace function public._coin_stock_signal_people(p_kind text, p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_daily jsonb := '[]'::jsonb;
	v_d date;
	v_n integer;
	v_sum integer := 0;
begin
	for v_d in select generate_series(p_day - 6, p_day, interval '1 day')::date loop
		if p_kind = 'foundry' then
			select count(*) into v_n from (
				select pl.player as who from public.student_app_plays pl
				where pl.player is not null and public._coin_la_today(pl.started_at) = v_d
				union
				select a.owner from public.student_app_versions v join public.student_apps a on a.id = v.app_id
				where public._coin_la_today(v.created_at) = v_d
			) people;
		else
			select count(distinct s.user_id) into v_n from public.submissions s
			where public._coin_la_today(s.created_at) = v_d;
		end if;
		v_sum := v_sum + v_n;
		v_daily := v_daily || jsonb_build_array(jsonb_build_object('day', v_d, 'people', v_n));
	end loop;
	return jsonb_build_object('has_data', true, 'signal', round(v_sum / 7.0, 6),
		'inputs', jsonb_build_object('daily', v_daily, 'window_start', p_day - 6, 'window_end', p_day));
end;
$$;
revoke all on function public._coin_stock_signal_people(text, date) from public, anon, authenticated, service_role;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: ONE CLOSE, AND THE NIGHTLY RUN =====

-- The close for one stock on one class day, written once. Formula v1.
create or replace function public._coin_stock_close(p_stock_id text, p_day date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_s public.coin_stocks;
	v_base numeric;
	v_clamp numeric;
	v_weeks integer;
	v_floor numeric := coalesce((public._coin_setting('stock_floor') #>> '{}')::numeric, 1);
	v_ceiling numeric := coalesce((public._coin_setting('stock_ceiling') #>> '{}')::numeric, 100);
	v_prev numeric;
	v_sig jsonb;
	v_signal numeric;
	v_median numeric;
	v_target numeric;
	v_close numeric;
	v_carried boolean := false;
	v_note text;
	v_inputs jsonb;
begin
	select * into v_s from public.coin_stocks s where s.id = p_stock_id;
	if v_s.id is null then
		return null;
	end if;
	if exists (select 1 from public.coin_stock_closes c where c.stock_id = p_stock_id and c.day = p_day) then
		return jsonb_build_object('existing', true);
	end if;
	v_base := public._coin_stock_num(v_s, 'base', 10);
	v_clamp := public._coin_stock_num(v_s, 'clamp_percent', 10) / 100;
	v_weeks := public._coin_stock_num(v_s, 'median_weeks', 8)::integer;
	select c.close into v_prev from public.coin_stock_closes c
	where c.stock_id = p_stock_id and c.day < p_day order by c.day desc limit 1;

	if v_s.kind = 'index' then
		select coalesce(jsonb_agg(jsonb_build_object('id', c.stock_id, 'close', c.close) order by c.stock_id), '[]'::jsonb),
			avg(c.close)
		into v_inputs, v_close
		from public.coin_stock_closes c join public.coin_stocks m on m.id = c.stock_id
		where c.day = p_day and m.active and m.kind <> 'index';
		v_inputs := jsonb_build_object('members', v_inputs, 'rule', 'equal-weighted mean of the day''s closes');
		if v_close is null then
			v_close := coalesce(v_prev, v_base);
			v_carried := true;
			v_note := 'No member stock closed this day, so the previous close carries.';
		end if;
		insert into public.coin_stock_closes (stock_id, day, close, prev_close, target, carried, note, inputs, formula_version)
		values (p_stock_id, p_day, round(v_close, 4), v_prev, round(v_close, 4), v_carried, v_note, v_inputs, 'v1')
		on conflict do nothing;
		return jsonb_build_object('close', round(v_close, 4), 'carried', v_carried);
	end if;

	if v_s.kind = 'class' and v_s.section_id is null then
		v_sig := jsonb_build_object('has_data', false, 'inputs', '{}'::jsonb, 'why_not', 'This class no longer exists.');
	elsif v_s.kind = 'class' then
		v_sig := public._coin_stock_signal_class(v_s.section_id, p_day);
	else
		v_sig := public._coin_stock_signal_people(v_s.kind, p_day);
	end if;
	v_inputs := v_sig -> 'inputs';
	if not coalesce((v_sig ->> 'has_data')::boolean, false) then
		v_close := coalesce(v_prev, v_base);
		v_carried := true;
		v_note := coalesce(v_sig ->> 'why_not', 'No data this day') || ' The previous close carries.';
	else
		v_signal := (v_sig ->> 'signal')::numeric;
		select percentile_cont(0.5) within group (order by x.v) into v_median
		from (
			select c.signal as v from public.coin_stock_closes c
			where c.stock_id = p_stock_id and not c.carried and c.signal is not null
				and c.day >= p_day - v_weeks * 7 and c.day < p_day
			union all
			select v_signal
		) x;
		if v_median is null or v_median <= 0 then
			v_close := coalesce(v_prev, v_base);
			v_carried := true;
			v_note := 'The median of the signal over the window is zero, so there is no price. The previous close carries.';
		else
			v_target := v_base * v_signal / v_median;
			v_close := v_target;
			if v_prev is not null then
				v_close := least(greatest(v_close, v_prev * (1 - v_clamp)), v_prev * (1 + v_clamp));
			end if;
			v_close := least(greatest(v_close, v_floor), v_ceiling);
		end if;
	end if;
	insert into public.coin_stock_closes (stock_id, day, close, prev_close, target, signal, median, carried, note, inputs, formula_version)
	values (p_stock_id, p_day, round(v_close, 4), v_prev, round(v_target, 4),
		case when v_carried then null else v_signal end, v_median, v_carried, v_note,
		v_inputs || jsonb_build_object('base', v_base, 'clamp_percent', v_clamp * 100, 'median_weeks', v_weeks,
			'floor', v_floor, 'ceiling', v_ceiling),
		'v1')
	on conflict do nothing;
	return jsonb_build_object('close', round(v_close, 4), 'carried', v_carried);
end;
$$;
revoke all on function public._coin_stock_close(text, date) from public, anon, authenticated, service_role;

-- One class stock per economy-on class, named for it. New ones start on.
create or replace function public._coin_stock_sync()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_n integer;
begin
	insert into public.coin_stocks (id, kind, ticker, name, section_id, sort_order)
	select 'class:' || s.id::text, 'class',
		left(upper(regexp_replace(coalesce(c.code, 'CLASS'), '[^A-Za-z0-9]', '', 'g')), 8)
			|| left(regexp_replace(coalesce(s.block, s.label, ''), '[^0-9]', '', 'g'), 3),
		coalesce(public._coin_classroom_section_label(s.id), 'A class'),
		s.id, 100
	from public.classroom_sections s
	left join public.classroom_courses c on c.id = s.course_id
	where s.active and s.coin_economy_on
	on conflict (id) do nothing;
	get diagnostics v_n = row_count;
	return v_n;
end;
$$;
revoke all on function public._coin_stock_sync() from public, anon, authenticated, service_role;

-- Every class day that is over and has no close yet, oldest first: the
-- members, then the index. A stock with no closes starts at the median
-- window's start, so its first price already has a history behind it.
create or replace function public._coin_stocks_nightly(p_run bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_today date := public._coin_la_today();
	v_weeks integer := coalesce((public._coin_setting('stock_median_weeks') #>> '{}')::integer, 8);
	v_start date;
	v_d date;
	v_s record;
	v_n integer := 0;
	v_r jsonb;
begin
	perform public._coin_stock_sync();
	select coalesce(min(coalesce(last.day + 1, v_today - v_weeks * 7)), v_today)
	into v_start
	from public.coin_stocks s
	left join lateral (select max(c.day) as day from public.coin_stock_closes c where c.stock_id = s.id) last on true
	where s.active;
	v_start := greatest(v_start, v_today - v_weeks * 7);
	v_d := v_start;
	while v_d < v_today loop
		if public._coin_is_class_day(v_d) then
			for v_s in select s.id from public.coin_stocks s where s.active and s.kind <> 'index' order by s.sort_order, s.id loop
				v_r := public._coin_stock_close(v_s.id, v_d);
				if v_r is not null and not coalesce((v_r ->> 'existing')::boolean, false) then
					v_n := v_n + 1;
				end if;
			end loop;
			for v_s in select s.id from public.coin_stocks s where s.active and s.kind = 'index' loop
				v_r := public._coin_stock_close(v_s.id, v_d);
				if v_r is not null and not coalesce((v_r ->> 'existing')::boolean, false) then
					v_n := v_n + 1;
				end if;
			end loop;
		end if;
		v_d := v_d + 1;
	end loop;
	return v_n;
end;
$$;
revoke all on function public._coin_stocks_nightly(bigint) from public, anon, authenticated, service_role;
-- ===== PART D END =====

-- ===== PART E BEGIN =====
-- ===== PART E: TRADING WITH THE HOUSE =====

create or replace function public._coin_stock_last(p_stock_id text)
returns public.coin_stock_closes
language sql
stable
security definer
set search_path = ''
as $$
	select * from public.coin_stock_closes c where c.stock_id = p_stock_id order by c.day desc limit 1;
$$;
revoke all on function public._coin_stock_last(text) from public, anon, authenticated, service_role;

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
	v_meta := jsonb_build_object('stock_id', p_stock_id, 'shares', v_shares, 'price', v_last.close, 'price_day', v_last.day);
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

-- Sell shares worth p_coins at the last close, or everything held (p_all).
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
		'price_day', v_last.day, 'cost_basis_moved', v_moved, 'pnl', v_pnl);
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
				'change_percent', case when c.prev_close > 0 then round((c.close - c.prev_close) / c.prev_close * 100, 2) end)
			from public.coin_stock_closes c where c.stock_id = s.id order by c.day desc limit 1),
		'series', coalesce((select jsonb_agg(jsonb_build_object('day', x.day, 'close', x.close, 'carried', x.carried) order by x.day)
			from (select c.day, c.close, c.carried from public.coin_stock_closes c where c.stock_id = s.id
				order by c.day desc limit greatest(p_series, 1)) x), '[]'::jsonb));
$$;
revoke all on function public._coin_stock_json(public.coin_stocks, integer) from public, anon, authenticated, service_role;

-- A student's holdings at the last close.
create or replace function public._coin_portfolio(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'positions', coalesce(jsonb_agg(jsonb_build_object('stock_id', p.stock_id, 'ticker', s.ticker, 'name', s.name,
			'shares', p.shares, 'cost_basis', p.cost_basis, 'price', l.close,
			'value', round(p.shares * coalesce(l.close, 0), 2)) order by s.sort_order, s.ticker)
			filter (where p.shares > 0), '[]'::jsonb),
		'value', coalesce(round(sum(p.shares * coalesce(l.close, 0)) filter (where p.shares > 0), 2), 0),
		'cost_basis', coalesce(sum(p.cost_basis) filter (where p.shares > 0), 0))
	from public.coin_stock_positions p
	join public.coin_stocks s on s.id = p.stock_id
	left join lateral (select c.close from public.coin_stock_closes c where c.stock_id = p.stock_id order by c.day desc limit 1) l on true
	where p.student_email = lower(btrim(coalesce(p_email, '')));
$$;
revoke all on function public._coin_portfolio(text) from public, anon, authenticated, service_role;

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
		'rules', jsonb_build_object(
			'fee_percent', coalesce((public._coin_setting('stock_fee_percent') #>> '{}')::numeric, 2),
			'position_cap', coalesce((public._coin_setting('stock_position_cap') #>> '{}')::numeric, 50),
			'clamp_percent', coalesce((public._coin_setting('stock_clamp_percent') #>> '{}')::numeric, 10),
			'floor', coalesce((public._coin_setting('stock_floor') #>> '{}')::numeric, 1),
			'ceiling', coalesce((public._coin_setting('stock_ceiling') #>> '{}')::numeric, 100),
			'base', coalesce((public._coin_setting('stock_base') #>> '{}')::numeric, 10),
			'median_weeks', coalesce((public._coin_setting('stock_median_weeks') #>> '{}')::numeric, 8)),
		'stocks', coalesce((select jsonb_agg(public._coin_stock_json(s, 60) order by (s.kind = 'index') desc, s.sort_order, s.ticker)
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

-- One stock, with every close's inputs: "How this price is made".
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
	return jsonb_build_object('ok', true, 'stock', public._coin_stock_json(v_s, 160),
		'closes', coalesce((select jsonb_agg(jsonb_build_object('day', c.day, 'close', c.close, 'prev', c.prev_close,
				'target', c.target, 'signal', c.signal, 'median', c.median, 'carried', c.carried, 'note', c.note,
				'inputs', c.inputs, 'formula_version', c.formula_version) order by c.day desc)
			from (select * from public.coin_stock_closes c2 where c2.stock_id = v_s.id order by c2.day desc limit 60) c), '[]'::jsonb),
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

create or replace function public.coin_my_portfolio()
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
		return null;
	end if;
	return public._coin_portfolio(v_email);
end;
$$;
revoke all on function public.coin_my_portfolio() from public, anon, authenticated, service_role;
grant execute on function public.coin_my_portfolio() to authenticated;

-- The Ledger's tile: every active stock's last close and the index's series.
-- Aggregates only; no person.
create or replace function public.coin_public_stocks()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'stocks', coalesce((select jsonb_agg(public._coin_stock_json(s, 1) - 'series' - 'section_id'
				order by (s.kind = 'index') desc, s.sort_order, s.ticker)
			from public.coin_stocks s where s.active), '[]'::jsonb),
		'index', (select public._coin_stock_json(s, 40) - 'section_id' from public.coin_stocks s where s.id = 'idea' and s.active));
$$;
revoke all on function public.coin_public_stocks() from public, anon, authenticated, service_role;
grant execute on function public.coin_public_stocks() to anon, authenticated;
-- ===== PART F END =====

-- ===== PART G BEGIN =====
-- ===== PART G: STAFF =====

create or replace function public.coin_stock_admin_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can manage the stocks.';
	end if;
	return coalesce((select jsonb_agg(public._coin_stock_json(s, 1) || jsonb_build_object('params', s.params,
			'holders', (select count(*) from public.coin_stock_positions p where p.stock_id = s.id and p.shares > 0),
			'closes', (select count(*) from public.coin_stock_closes c where c.stock_id = s.id))
			order by (s.kind = 'index') desc, s.sort_order, s.ticker)
		from public.coin_stocks s), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_stock_admin_list() from public, anon, authenticated, service_role;
grant execute on function public.coin_stock_admin_list() to authenticated;

-- Switch a stock on or off, and set its own numbers (base, clamp_percent,
-- median_weeks; an empty object is the global default). A stock switched
-- off keeps its holders: they can still sell at its last close.
create or replace function public.coin_stock_admin_set(p_stock_id text, p_active boolean, p_params jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_k text;
	v_v jsonb;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can manage the stocks.';
	end if;
	if not exists (select 1 from public.coin_stocks s where s.id = p_stock_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if p_params is not null then
		if jsonb_typeof(p_params) <> 'object' then
			return jsonb_build_object('ok', false, 'reason', 'params');
		end if;
		for v_k, v_v in select key, value from jsonb_each(p_params) loop
			if v_k not in ('base', 'clamp_percent', 'median_weeks') or jsonb_typeof(v_v) <> 'number'
				or not public._coin_setting_ok('stock_' || v_k, v_v) then
				return jsonb_build_object('ok', false, 'reason', 'params', 'key', v_k);
			end if;
		end loop;
	end if;
	update public.coin_stocks s set active = coalesce(p_active, s.active), params = coalesce(p_params, s.params),
		updated_at = now()
	where s.id = p_stock_id;
	return jsonb_build_object('ok', true, 'stock_id', p_stock_id);
end;
$$;
revoke all on function public.coin_stock_admin_set(text, boolean, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.coin_stock_admin_set(text, boolean, jsonb) to authenticated;
-- ===== PART G END =====

do $chk$
declare
	r record;
	v_bad text[] := '{}';
begin
	for r in
		select p.oid::regprocedure::text as sig, p.proname, pg_get_function_identity_arguments(p.oid) as args
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and (p.proname like 'coin\_stock%' or p.proname like '\_coin\_stock%'
			or p.proname in ('coin_my_portfolio', 'coin_public_stocks', '_coin_portfolio'))
	loop
		if has_function_privilege('anon', r.sig, 'execute') and r.proname <> 'coin_public_stocks' then
			v_bad := array_append(v_bad, 'anon executes ' || r.sig);
		end if;
		if r.proname not like '\_%' and r.args ~* 'email' then
			v_bad := array_append(v_bad, r.sig || ' takes an address');
		end if;
		if r.proname like '\_%' and has_function_privilege('authenticated', r.sig, 'execute') then
			v_bad := array_append(v_bad, 'a client role executes the private ' || r.sig);
		end if;
	end loop;
	if not has_function_privilege('anon', 'public.coin_public_stocks()', 'execute') then
		v_bad := array_append(v_bad, 'the public stock tile lost its anon grant');
	end if;
	if (select count(*) from public.coin_stocks where id in ('idea', 'foundry', 'gauntlet')) <> 3 then
		v_bad := array_append(v_bad, 'a fixed stock is missing');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0279 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0279: the stock market is in place: % stocks, formula v1.', (select count(*) from public.coin_stocks);
end
$chk$;
