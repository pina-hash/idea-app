-- 0280_coin_later_autopay_and_health.sql
--
-- IDEA COIN LATER FEATURES, PART SIX (ledger 0402, decision 70): THE NIGHTLY
-- WORK, THE ECONOMY'S HEALTH, AND THE RULES LIST.
--
--   1. coin_economy_health: what is in circulation, this week's sinks (fees,
--      purchases, fines) against faucets, and what sits in escrow and stocks.
--      Shown on the digest. Section staff see their own students.
--   2. coin_autopay_run (0249's, word for word) also releases marketplace
--      trades left unconfirmed past the window and writes the day's stock
--      closes. Each new step is wrapped, so a failure there never stops pay.
--   3. coin_public_reasons lists the four new rules (the marketplace fee,
--      the private-transfer fee, extra hall pass time, the trading fee) with
--      their explanations, so every new fee, limit and rule is in the rules
--      list a student reads.
--
-- UNDO: re-paste 0249's coin_autopay_run and 0239's coin_public_reasons, and
-- drop coin_economy_health.

-- ===== PART A BEGIN =====
-- ===== PART A: THE ECONOMY'S HEALTH =====

create or replace function public.coin_economy_health(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 60)));
	v_full boolean := public._coin_full_staff();
	v_fee_ids text[] := array['market_fee', 'coin_transfer_private_fee', 'stock_fee'];
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can read the economy''s health.';
	end if;
	return (
		with rows_in as (
			select t.*, c.kind
			from public.coin_transactions t join public.coin_categories c on c.id = t.category_id
			where t.medium = 'digital' and (v_full or public._coin_student_in_scope(t.student_email))
		),
		week as (
			select r.* from rows_in r
			where r.created_at > v_since and r.category_id not in ('reversal', 'amount_correction', 'payout_hold')
				and not public._coin_is_reversed(r.id)
		)
		select jsonb_build_object(
			'since', v_since,
			'scope', case when v_full then 'full' else 'section' end,
			'circulation', (select coalesce(sum(r.amount), 0) from rows_in r),
			'students_in_debt', (select count(*) from (select r.student_email from rows_in r group by 1 having sum(r.amount) < 0) d),
			'faucets', (select coalesce(sum(w.amount), 0) from week w where w.kind = 'award' and w.amount > 0),
			'sinks', jsonb_build_object(
				'fees', (select coalesce(-sum(w.amount), 0) from week w where w.category_id = any(v_fee_ids)),
				'purchases', (select coalesce(-sum(w.amount), 0) from week w where w.kind = 'purchase'
					and not (w.category_id = any(v_fee_ids))),
				'fines', (select coalesce(-sum(w.amount), 0) from week w where w.kind = 'fine')),
			'stock_pnl', (select coalesce(sum(t.pnl), 0) from public.coin_stock_trades t
				where t.side = 'sell' and t.created_at > v_since and (v_full or public._coin_student_in_scope(t.student_email))),
			'escrow', (select coalesce(sum(o.amount), 0) from public.coin_market_orders o
				where o.status in ('held', 'delivered', 'disputed') and (v_full or public._coin_student_in_scope(o.payer_email))),
			'stocks', (select jsonb_build_object('cost_basis', coalesce(sum(p.cost_basis), 0),
					'value', coalesce(round(sum(p.shares * coalesce(l.close, 0)), 2), 0))
				from public.coin_stock_positions p
				left join lateral (select c.close from public.coin_stock_closes c where c.stock_id = p.stock_id
					order by c.day desc limit 1) l on true
				where p.shares > 0 and (v_full or public._coin_student_in_scope(p.student_email)))
		)
	);
end;
$$;
revoke all on function public.coin_economy_health(integer) from public, anon, authenticated, service_role;
grant execute on function public.coin_economy_health(integer) to authenticated;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: AUTOPAY RELEASES TRADES AND CLOSES STOCKS =====

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
	v_market integer := 0;
	v_stocks integer := 0;
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
	-- Ledger 0402: the marketplace's automatic release and the stock closes.
	begin
		v_market := public._coin_market_autorelease(v_run);
	exception when others then
		raise warning 'coin autopay: market auto-release failed: %', sqlerrm;
	end;
	begin
		v_stocks := public._coin_stocks_nightly(v_run);
	exception when others then
		raise warning 'coin autopay: stock closes failed: %', sqlerrm;
	end;
	v_result := jsonb_build_object('wages', v_wages, 'highest_grade', v_highest, 'perfect_score', v_perfect,
		'role_stipend', v_roles, 'debt_relief', v_relief, 'market_released', v_market, 'stock_closes', v_stocks);
	update public.coin_autopay_runs set finished_at = now(), result = v_result where id = v_run;
	return jsonb_build_object('ok', true, 'ran', true, 'run_id', v_run) || v_result;
end;
$$;
revoke all on function public.coin_autopay_run(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_autopay_run(text) to anon, authenticated;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE RULES LIST NAMES THE NEW RULES =====

create or replace function public.coin_public_reasons()
returns table (type text, reason text, detail text, sort_order integer, category_id text, explanation text)
language sql
stable
security definer
set search_path = ''
as $$
	select
		initcap(c.kind),
		c.name,
		btrim(
			case
				when c.id = 'weekly_wage' then trim_scale(c.amount) || ' i¢ times your wage tier, every school week'
				when c.id = 'pay_raise' then trim_scale(coalesce((public._coin_setting('pay_raise_cost_per_tier') #>> '{}')::numeric, 100)) || ' i¢ times your current tier'
				when c.id = 'three_d_printing' then '1 i¢ per ' || trim_scale(coalesce((public._coin_setting('print_grams_per_coin') #>> '{}')::numeric, 10)) || ' grams'
				-- Ledger 0402's four rules.
				when c.id = 'market_fee' then trim_scale(coalesce((public._coin_setting('market_sale_fee_percent') #>> '{}')::numeric, 0)) || '% of each sale, released after '
					|| trim_scale(coalesce((public._coin_setting('market_auto_release_school_days') #>> '{}')::numeric, 5)) || ' class days'
				when c.id = 'coin_transfer_private_fee' then trim_scale(coalesce((public._coin_setting('transfer_private_fee_percent') #>> '{}')::numeric, 10)) || '% of a private transfer, at least '
					|| trim_scale(coalesce((public._coin_setting('transfer_private_fee_min') #>> '{}')::numeric, 0.1)) || ' i¢; up to '
					|| trim_scale(coalesce((public._coin_setting('transfer_daily_cap') #>> '{}')::numeric, 20)) || ' i¢ sent a day'
				when c.id = 'hall_pass_minutes' then trim_scale(c.amount) || ' i¢ per ' || trim_scale(coalesce((public._coin_setting('hall_pass_block_minutes') #>> '{}')::numeric, 5))
					|| ' minutes, up to ' || trim_scale(coalesce((public._coin_setting('hall_pass_extra_cap_minutes') #>> '{}')::numeric, 15)) || ' extra minutes a day'
				when c.id = 'stock_fee' then trim_scale(coalesce((public._coin_setting('stock_fee_percent') #>> '{}')::numeric, 2)) || '% of each trade; at most '
					|| trim_scale(coalesce((public._coin_setting('stock_position_cap') #>> '{}')::numeric, 50)) || ' i¢ in one stock'
				when c.pricing_model = 'flat' then trim_scale(c.amount) || ' i¢'
				when c.pricing_model = 'range' then trim_scale(c.min_amount) || '-' || trim_scale(c.max_amount) || ' i¢'
				when c.pricing_model = 'per_unit' then trim_scale(c.amount) || ' i¢ per ' || coalesce(c.unit_label, 'unit')
				when c.pricing_model = 'variable' then 'Amount set when logged'
				else 'Calculated'
			end
		),
		c.sort_order,
		c.id,
		c.explanation
	from public.coin_categories c
	where c.active and c.kind in ('fine', 'award', 'purchase')
		and (c.loggable or c.id in ('weekly_wage', 'highest_grade_weekly', 'perfect_score_graded_work', 'long_bathroom_break',
			'market_fee', 'coin_transfer_private_fee', 'hall_pass_minutes', 'stock_fee'))
		and c.id not in ('coin_payout', 'legacy_award', 'legacy_fine', 'legacy_purchase', 'legacy_payout')
	order by c.kind, c.sort_order, c.name;
$$;
revoke all on function public.coin_public_reasons() from public, anon, authenticated, service_role;
grant execute on function public.coin_public_reasons() to anon, authenticated;
-- ===== PART C END =====

do $chk$
declare
	v_bad text[] := '{}';
begin
	if has_function_privilege('anon', 'public.coin_economy_health(integer)', 'execute') then
		v_bad := array_append(v_bad, 'anon executes the economy health read');
	end if;
	if not has_function_privilege('anon', 'public.coin_public_reasons()', 'execute')
		or not has_function_privilege('anon', 'public.coin_autopay_run(text)', 'execute') then
		v_bad := array_append(v_bad, 'a public function lost its grant');
	end if;
	if (select count(*) from public.coin_public_reasons() r where r.category_id in
		('market_fee', 'coin_transfer_private_fee', 'hall_pass_minutes', 'stock_fee')) <> 4 then
		v_bad := array_append(v_bad, 'the rules list does not name the four new rules');
	end if;
	if (select count(*) from pg_proc where proname = 'coin_autopay_run' and pronamespace = 'public'::regnamespace) <> 1 then
		v_bad := array_append(v_bad, 'coin_autopay_run has a second overload');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0281 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0281: autopay releases trades and closes stocks; the economy health read and the rules list are in place.';
end
$chk$;
