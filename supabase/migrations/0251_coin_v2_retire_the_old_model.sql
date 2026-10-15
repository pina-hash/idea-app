-- 0251_coin_v2_retire_the_old_model.sql
--
-- IDEA COIN V2, SESSION TWO, PART EIGHT (ledger 0386): EVERYTHING MIGRATES TO
-- THE NEW SYSTEM OR IS REMOVED. Mr. Pina: "no bloat".
--
-- WHAT MOVES TO IDEA CLASSROOM. The public roster (_coin_public_roster: every
-- Ledger name and class) reads classroom_enrollments and profiles only: a
-- student's shown name is their class roster's name, then their profile's
-- chosen name, then its full name; their class is their economy-on class.
-- coin_me and the public role board read the same. coin_students,
-- coin_sections and coin_section_students drive nothing any more.
--
-- WHAT IS REMOVED. The coin-section RPCs, the Sheets import (finished), the
-- two-medium plumbing the writers kept only so pre-V2 clients resolved
-- (p_medium, _coin_normalize_media, _coin_digital_only; no client sends it),
-- the bulk payout (payday replaced it), the one-step contract completion and
-- the old contract and role list functions (the queue and the new admin reads
-- replaced them), the coin-section stipend button (coin_role_stipend_manual
-- replaces it, by class), coin_my_eating_pass_status (no caller), and the
-- physical and digital columns of coin_balances.
--
-- WHAT IS KEPT. Every history row (the ledger is append-only), the legacy_*
-- categories (history rows name them), _coin_insert's medium (the payout
-- transfer and a cash purchase write physical rows), and _coin_balance's
-- medium (0233's student overview reads the physical history by name).
--
-- DEAD TABLES ARE MADE UNREACHABLE, NOT DROPPED. tools/apply-migration.mjs
-- refuses `drop table` and has no sanctioned path for it, so each dead table
-- loses every grant by name and is listed, with the one statement that would
-- drop it, in coin_v2_retired (the first object below).
--
-- EVERY DROP IS GUARDED. Postgres records no dependency from one plpgsql body
-- to another, so before dropping a function this file sweeps pg_proc.prosrc
-- for a caller and refuses if one is left (CLAUDE.md).
--
-- UNDO: re-run the 0073, 0084, 0100, 0239, 0072, 0076 and 0077 definitions of
-- the dropped functions and the 0239 coin_balances view, and re-grant the
-- dead tables (select to authenticated).

-- THE FIRST OBJECT IS NEW (the apply probe reads the first created object).
create table if not exists public.coin_v2_retired (
	name text primary key,
	kind text not null check (kind in ('table', 'function', 'column', 'view')),
	note text not null,
	drop_statement text,
	retired_at timestamptz not null default now()
);
alter table public.coin_v2_retired enable row level security;
revoke all on table public.coin_v2_retired from public, anon, authenticated, service_role;

-- ===== PART A BEGIN =====
-- ===== PART A: NAMES AND CLASSES FROM IDEA CLASSROOM =====

create or replace function public._coin_public_roster()
returns table (
	student_email text,
	public_id text,
	display_name text,
	section text,
	section_color text
)
language sql
stable
security definer
set search_path = ''
as $$
	with salt as (select s.salt from public.coin_public_id_secret s where s.id limit 1),
	enr as (
		select distinct on (x.student_email) x.student_email,
			public._coin_classroom_section_label(x.section_id) as label, x.display_name
		from public._coin_economy_enrollments() x
		order by x.student_email, public._coin_classroom_section_label(x.section_id)
	),
	emails as (
		select t.student_email as email from public.coin_transactions t
		union
		select enr.student_email from enr
	)
	select
		e.email,
		md5((select salt.salt from salt) || e.email),
		coalesce(
			nullif(btrim(enr.display_name), ''),
			nullif(btrim(p.display_name), ''),
			nullif(btrim(p.full_name), ''),
			public._coin_public_name_fallback()
		),
		enr.label,
		null::text
	from emails e
	left join enr on enr.student_email = e.email
	left join public.profiles p on lower(p.email) = e.email;
$$;
revoke all on function public._coin_public_roster() from public, anon, authenticated, service_role;

create or replace function public.coin_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_role text;
begin
	if v_email is null or v_email = '' then
		return jsonb_build_object('signed_in', false);
	end if;
	select p.role into v_role from public.profiles p where p.id = auth.uid();
	return jsonb_build_object(
		'signed_in', true,
		'is_student', coalesce(v_role, '') = 'student',
		'name', public._coin_student_name(v_email),
		'section', public._coin_classroom_section_label(public._coin_home_section(v_email)),
		'student_id', md5((select s.salt from public.coin_public_id_secret s where s.id limit 1) || v_email)
	);
end;
$$;
revoke all on function public.coin_me() from public, anon, authenticated, service_role;
grant execute on function public.coin_me() to authenticated;

-- The public role board (0089's columns): every economy-on class and every
-- active role switched on there, with its cap and its open seats.
create or replace function public.coin_public_roles()
returns table (
	section_id text,
	section text,
	role_id text,
	role text,
	description text,
	capacity integer,
	held integer,
	open integer
)
language sql
stable
security definer
set search_path = ''
as $$
	select s.id::text, public._coin_classroom_section_label(s.id), d.id, d.name, d.description,
		public._coin_role_class_cap(d.id, s.id), public._coin_role_class_held(d.id, s.id),
		greatest(0, public._coin_role_class_cap(d.id, s.id) - public._coin_role_class_held(d.id, s.id))
	from public.classroom_sections s
	cross join public.coin_role_definitions d
	where s.active and s.coin_economy_on and d.active and public._coin_role_class_cap(d.id, s.id) > 0
	order by public._coin_classroom_section_label(s.id), d.sort_order, d.name;
$$;
revoke all on function public.coin_public_roles() from public, anon, authenticated, service_role;
grant execute on function public.coin_public_roles() to anon, authenticated;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: THE WRITERS WITHOUT p_medium =====
--
-- Same bodies, one parameter fewer. A client that never sent p_medium (none
-- does: LogView.svelte says so) resolves the narrow form exactly as it
-- resolved the wide one, so there is no deploy ordering. Each old signature is
-- dropped first (THE SIGNATURE TRAP).

drop function if exists public.coin_log_transaction(text, text, numeric, numeric, text, text);
create or replace function public.coin_log_transaction(
	p_email text,
	p_category_id text,
	p_amount numeric default null,
	p_quantity numeric default null,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
-- 0251 coin_log_transaction: no medium argument; every write is digital.
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_cat public.coin_categories;
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_magnitude numeric;
	v_signed numeric;
	v_balance numeric;
	v_strike boolean := false;
	v_meta jsonb := '{}'::jsonb;
	v_strikes integer;
	v_wage_tier integer;
	v_row public.coin_transactions;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;

	select * into v_cat from public.coin_categories where id = p_category_id;
	if v_cat.id is null then
		raise exception 'Unknown coin category "%".', p_category_id;
	end if;
	if not public._coin_full_staff() then
		if not public._coin_student_in_scope(v_email) then
			raise exception 'That student is not in one of your classes.';
		end if;
		if v_cat.kind not in ('fine', 'award') then
			raise exception 'Only a full coin admin can log "%".', v_cat.name;
		end if;
	end if;
	if not v_cat.active or not v_cat.loggable then
		raise exception '"%" cannot be logged directly.', v_cat.name;
	end if;
	if v_cat.pricing_model = 'formula' then
		raise exception '"%" needs its dedicated logging function, not coin_log_transaction.', v_cat.name;
	end if;
	if v_cat.id = 'extra_credit' then
		raise exception 'Use coin_log_extra_credit for Extra Credit (it enforces the cap).';
	end if;

	if v_cat.pricing_model = 'flat' then
		v_magnitude := v_cat.amount;
		if v_cat.id = 'weekly_wage' then
			select tier into v_wage_tier from public.coin_wage_tiers where student_email = v_email;
			v_wage_tier := greatest(coalesce(v_wage_tier, 1), 1);
			v_magnitude := v_cat.amount * v_wage_tier;
			v_meta := jsonb_build_object('wage_tier', v_wage_tier, 'base_amount', v_cat.amount);
		end if;
	elsif v_cat.pricing_model = 'range' then
		if p_amount is null then
			raise exception '"%" needs an amount between %i¢ and %i¢.', v_cat.name, v_cat.min_amount, v_cat.max_amount;
		end if;
		if p_amount < v_cat.min_amount or p_amount > v_cat.max_amount then
			raise exception '"%" must be between %i¢ and %i¢ (got %i¢).', v_cat.name, v_cat.min_amount, v_cat.max_amount, p_amount;
		end if;
		v_magnitude := p_amount;
	elsif v_cat.pricing_model = 'per_unit' then
		if p_quantity is null or p_quantity <= 0 then
			raise exception '"%" needs a positive quantity (%).', v_cat.name, coalesce(v_cat.unit_label, 'units');
		end if;
		v_magnitude := round(v_cat.amount * p_quantity, 2);
	elsif v_cat.pricing_model = 'variable' then
		if v_cat.kind = 'adjustment' then
			if p_amount is null or p_amount = 0 then
				raise exception 'A balance adjustment needs a non-zero amount.';
			end if;
			if v_note is null then
				raise exception 'A balance adjustment needs a note explaining why.';
			end if;
			v_signed := p_amount;
		else
			if p_amount is null or p_amount <= 0 then
				raise exception '"%" needs a positive amount.', v_cat.name;
			end if;
			if v_note is null then
				raise exception '"%" needs a note.', v_cat.name;
			end if;
			v_magnitude := p_amount;
		end if;
	end if;

	if v_signed is null then
		v_signed := case v_cat.kind
			when 'fine' then -v_magnitude
			when 'purchase' then -v_magnitude
			else v_magnitude
		end;
	end if;
	v_signed := round(v_signed, 2);

	if v_cat.cap_period is not null then
		if v_cat.cap_period = 'day' then
			if (
				select count(*) from public.coin_transactions t
				where t.student_email = v_email and t.category_id = v_cat.id
					and public._coin_la_today(t.created_at) = public._coin_la_today()
					and not public._coin_is_reversed(t.id)
			) >= v_cat.cap_count then
				return jsonb_build_object('ok', false, 'reason', 'cap_reached', 'cap_period', 'day');
			end if;
		elsif v_cat.cap_period = 'month' then
			if (
				select count(*) from public.coin_transactions t
				where t.student_email = v_email and t.category_id = v_cat.id
					and date_trunc('month', t.created_at at time zone 'America/Los_Angeles')
						= date_trunc('month', now() at time zone 'America/Los_Angeles')
					and not public._coin_is_reversed(t.id)
			) >= v_cat.cap_count then
				return jsonb_build_object('ok', false, 'reason', 'cap_reached', 'cap_period', 'month');
			end if;
		end if;
	end if;

	v_balance := public._coin_balance(v_email);
	if v_cat.kind = 'purchase' and v_balance + v_signed < 0 then
		return jsonb_build_object(
			'ok', false, 'reason', 'insufficient', 'balance', v_balance, 'cost', -v_signed
		);
	end if;

	if v_cat.id = 'eating_pass' then
		if public.coin_eating_pass_active(v_email) then
			return jsonb_build_object('ok', false, 'reason', 'pass_already_active');
		end if;
	elsif v_cat.id = 'eating_violation' then
		v_strike := public.coin_eating_pass_active(v_email);
		v_meta := jsonb_build_object('strike', v_strike);
	end if;

	v_row := public._coin_insert(v_email, v_cat.id, v_signed, p_quantity, v_note, v_meta, 'digital');

	if v_cat.id = 'shop_safety_violation' then
		insert into public.coin_no_shop (student_email, on_date, reason, source_transaction_id, set_by)
		values (v_email, public._coin_la_today(), 'Shop Safety fine', v_row.id, public.current_user_email())
		on conflict (student_email, on_date) do update
			set cleared_at = null, cleared_by = null,
				source_transaction_id = excluded.source_transaction_id;
	end if;

	if v_strike then
		v_strikes := public.coin_eating_pass_strikes(v_email);
		if v_strikes >= 3 then
			perform public._coin_insert(
				v_email, 'eating_pass_revoked', 0, null,
				'Automatically revoked: third eating-pass violation since this pass was purchased.',
				jsonb_build_object('strikes', v_strikes), 'digital'
			);
		end if;
	end if;

	return jsonb_build_object(
		'ok', true,
		'transaction_id', v_row.id,
		'category_id', v_cat.id,
		'amount', v_signed,
		'medium', 'digital',
		'strike', v_strike,
		'wage_tier', v_wage_tier,
		'balance', public._coin_balance(v_email)
	);
end;
$$;
revoke all on function public.coin_log_transaction(text, text, numeric, numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_log_transaction(text, text, numeric, numeric, text) to authenticated;

drop function if exists public.coin_log_property_damage_careless(text, numeric, text, text);
create or replace function public.coin_log_property_damage_careless(
	p_email text,
	p_cost_dollars numeric,
	p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
-- 0251 coin_log_property_damage_careless: no medium argument; every write is digital.
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_base numeric := coalesce((public._coin_setting('property_damage_careless_base') #>> '{}')::numeric, 3);
	v_per numeric := coalesce((public._coin_setting('property_damage_dollars_per_coin') #>> '{}')::numeric, 0.25);
	v_exchange numeric;
	v_magnitude numeric;
	v_row public.coin_transactions;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if not public._coin_student_in_scope(v_email) then
		raise exception 'That student is not in one of your classes.';
	end if;
	if not exists (select 1 from public.coin_categories where id = 'property_damage_careless' and active) then
		raise exception 'The Property Damage (Careless) category is not configured.';
	end if;
	if p_cost_dollars is null or p_cost_dollars < 0 then
		raise exception 'Enter the repair or replacement cost in dollars (0 if none).';
	end if;
	if v_per <= 0 then
		v_per := 0.25;
	end if;
	v_exchange := round(p_cost_dollars / v_per);
	v_magnitude := v_base + v_exchange;
	v_row := public._coin_insert(
		v_email, 'property_damage_careless', -v_magnitude, p_cost_dollars,
		coalesce(v_note, 'Careless damage, repair cost ' || p_cost_dollars || ' dollars.'),
		jsonb_build_object('cost_dollars', p_cost_dollars, 'base', v_base, 'exchange', v_exchange), 'digital'
	);
	return jsonb_build_object('ok', true, 'transaction_id', v_row.id, 'amount', -v_magnitude,
		'base', v_base, 'exchange', v_exchange, 'medium', 'digital', 'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.coin_log_property_damage_careless(text, numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_log_property_damage_careless(text, numeric, text) to authenticated;

drop function if exists public.coin_log_perfect_score(text, integer, text, text);
create or replace function public.coin_log_perfect_score(
	p_email text,
	p_points integer,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_magnitude numeric;
	v_row public.coin_transactions;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can log this.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if p_points is null or p_points <= 0 then
		raise exception 'Enter the number of points the graded work was worth.';
	end if;
	if not exists (select 1 from public.coin_categories where id = 'perfect_score_graded_work' and active) then
		raise exception 'The Perfect Score category is not configured.';
	end if;
	v_magnitude := greatest(1, round(p_points / 25.0));
	v_row := public._coin_insert(
		v_email, 'perfect_score_graded_work', v_magnitude, p_points,
		nullif(btrim(coalesce(p_note, '')), ''), jsonb_build_object('points', p_points), 'digital'
	);
	return jsonb_build_object('ok', true, 'transaction_id', v_row.id, 'amount', v_magnitude,
		'medium', 'digital', 'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.coin_log_perfect_score(text, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_log_perfect_score(text, integer, text) to authenticated;

drop function if exists public.coin_log_pay_raise(text, text, text);
create or replace function public.coin_log_pay_raise(
	p_email text,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can log this.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if not exists (select 1 from public.coin_categories where id = 'pay_raise' and active) then
		raise exception 'The Pay Raise category is not configured.';
	end if;
	return public._coin_apply_pay_raise(v_email, p_note);
end;
$$;
revoke all on function public.coin_log_pay_raise(text, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_log_pay_raise(text, text) to authenticated;

drop function if exists public.coin_log_three_d_printing(text, numeric, numeric, boolean, text, text);
create or replace function public.coin_log_three_d_printing(
	p_email text,
	p_grams numeric,
	p_hours numeric,
	p_overnight boolean default false,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_magnitude numeric;
	v_balance numeric;
	v_row public.coin_transactions;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can log this.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if not exists (select 1 from public.coin_categories where id = 'three_d_printing' and active) then
		raise exception 'The 3D Printing category is not configured.';
	end if;
	if p_grams is null or p_grams <= 0 then
		raise exception 'Enter the slicer''s reported weight in grams.';
	end if;
	v_magnitude := public._coin_print_price(p_grams);
	v_balance := public._coin_balance(v_email);
	if v_balance - v_magnitude < 0 then
		return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance, 'cost', v_magnitude);
	end if;
	v_row := public._coin_insert(
		v_email, 'three_d_printing', -v_magnitude, p_grams, nullif(btrim(coalesce(p_note, '')), ''),
		jsonb_build_object('grams', p_grams, 'hours', p_hours, 'material_ic', v_magnitude, 'time_ic', 0), 'digital'
	);
	return jsonb_build_object('ok', true, 'transaction_id', v_row.id, 'amount', -v_magnitude,
		'material_ic', v_magnitude, 'time_ic', 0, 'medium', 'digital', 'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.coin_log_three_d_printing(text, numeric, numeric, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_log_three_d_printing(text, numeric, numeric, boolean, text) to authenticated;

drop function if exists public.coin_log_extra_credit(text, integer, text, text, text);
create or replace function public.coin_log_extra_credit(
	p_email text,
	p_points integer,
	p_grading_category text,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_cat public.coin_categories;
	v_grading text := lower(btrim(coalesce(p_grading_category, '')));
	v_cost numeric;
	v_balance numeric;
	v_row public.coin_transactions;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can log this.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if p_points is null or p_points <= 0 then
		raise exception 'Enter a positive number of extra credit points.';
	end if;
	select * into v_cat from public.coin_categories where id = 'extra_credit';
	if v_cat.id is null or not v_cat.active then
		raise exception 'The Extra Credit category is not configured.';
	end if;
	v_cost := round(v_cat.amount * p_points, 2);
	v_balance := public._coin_balance(v_email);
	if v_balance - v_cost < 0 then
		return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance, 'cost', v_cost);
	end if;
	v_row := public._coin_insert(
		v_email, 'extra_credit', -v_cost, p_points, nullif(btrim(coalesce(p_note, '')), ''),
		jsonb_build_object('grading_category', nullif(v_grading, ''), 'logged_by_admin', true), 'digital'
	);
	return jsonb_build_object('ok', true, 'transaction_id', v_row.id, 'points', p_points, 'cost', v_cost,
		'medium', 'digital', 'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.coin_log_extra_credit(text, integer, text, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_log_extra_credit(text, integer, text, text) to authenticated;
drop function if exists public.coin_admin_adjust_balance(text, numeric, text, text);
create or replace function public.coin_admin_adjust_balance(p_email text, p_amount numeric, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
-- 0251 coin_admin_adjust_balance: no medium argument; every write is digital.
begin
	return public.coin_log_transaction(lower(btrim(coalesce(p_email, ''))), 'balance_correction', p_amount, null, p_note);
end;
$$;
revoke all on function public.coin_admin_adjust_balance(text, numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_admin_adjust_balance(text, numeric, text) to authenticated;

drop function if exists public.coin_bulk_log_students(text[], text, numeric, text, text, jsonb);
create or replace function public.coin_bulk_log_students(
	p_emails text[],
	p_category_id text,
	p_amount numeric default null,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_cat public.coin_categories;
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_emails text[];
	v_email text;
	v_call jsonb;
	v_results jsonb := '[]'::jsonb;
	v_total integer := 0;
	v_succeeded integer := 0;
	v_refused integer := 0;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can bulk-log IDEA Coin transactions.';
	end if;
	select * into v_cat from public.coin_categories where id = p_category_id;
	if v_cat.id is null then
		raise exception 'Unknown coin category "%".', p_category_id;
	end if;
	if not v_cat.active or not v_cat.loggable then
		raise exception '"%" cannot be logged directly.', v_cat.name;
	end if;
	if v_cat.id = 'extra_credit' then
		raise exception 'Extra Credit needs a per-student point count; it cannot be bulk-logged.';
	end if;
	if v_cat.pricing_model not in ('flat', 'range', 'variable') then
		raise exception '"%" needs per-student input (%) and cannot be bulk-logged.', v_cat.name, v_cat.pricing_model;
	end if;
	if v_cat.pricing_model = 'range' then
		if p_amount is null or p_amount < v_cat.min_amount or p_amount > v_cat.max_amount then
			raise exception '"%" needs an amount between %i¢ and %i¢.', v_cat.name, v_cat.min_amount, v_cat.max_amount;
		end if;
	elsif v_cat.pricing_model = 'variable' then
		if v_cat.kind = 'adjustment' then
			if p_amount is null or p_amount = 0 then
				raise exception 'A balance adjustment needs a non-zero amount.';
			end if;
		elsif p_amount is null or p_amount <= 0 then
			raise exception '"%" needs a positive amount.', v_cat.name;
		end if;
		if v_note is null then
			raise exception '"%" needs a note.', v_cat.name;
		end if;
	end if;
	select coalesce(array_agg(e order by e), array[]::text[]) into v_emails
	from (
		select distinct lower(btrim(x)) as e
		from unnest(coalesce(p_emails, array[]::text[])) as x
		where nullif(btrim(coalesce(x, '')), '') is not null
	) s;
	foreach v_email in array v_emails loop
		v_total := v_total + 1;
		begin
			v_call := public.coin_log_transaction(v_email, v_cat.id, p_amount, null, p_note);
		exception when others then
			v_call := jsonb_build_object('ok', false, 'reason', 'error', 'message', sqlerrm);
		end;
		if coalesce((v_call ->> 'ok')::boolean, false) then
			v_succeeded := v_succeeded + 1;
		else
			v_refused := v_refused + 1;
		end if;
		v_results := v_results || jsonb_build_array(jsonb_build_object('email', v_email) || v_call);
	end loop;
	return jsonb_build_object('ok', true, 'category_id', v_cat.id, 'total', v_total, 'succeeded', v_succeeded,
		'refused', v_refused, 'results', v_results);
end;
$$;
revoke all on function public.coin_bulk_log_students(text[], text, numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_bulk_log_students(text[], text, numeric, text) to authenticated;

-- The stipend button, kept as a manual override (2.5), by class. It pays the
-- weekly_role_stipend amount once to every active holder of the chosen role
-- and class (null means every one).
create or replace function public.coin_role_stipend_manual(p_role_id text, p_section_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_holder record;
	v_call jsonb;
	v_results jsonb := '[]'::jsonb;
	v_total integer := 0;
	v_ok integer := 0;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can pay a role stipend by hand.';
	end if;
	if nullif(btrim(coalesce(p_note, '')), '') is null then
		return jsonb_build_object('ok', false, 'reason', 'note_required');
	end if;
	for v_holder in
		select distinct h.student_email from public.coin_role_holders h
		where h.revoked_at is null and (h.expires_at is null or h.expires_at > now())
			and (p_role_id is null or h.role_id = p_role_id)
			and (p_section_id is null or h.class_section_id = p_section_id)
		order by h.student_email
	loop
		v_total := v_total + 1;
		begin
			v_call := public.coin_log_transaction(v_holder.student_email, 'weekly_role_stipend', null, null, p_note);
		exception when others then
			v_call := jsonb_build_object('ok', false, 'reason', 'error', 'message', sqlerrm);
		end;
		if coalesce((v_call ->> 'ok')::boolean, false) then
			v_ok := v_ok + 1;
		end if;
		v_results := v_results || jsonb_build_array(jsonb_build_object('email', v_holder.student_email) || v_call);
	end loop;
	return jsonb_build_object('ok', true, 'total', v_total, 'succeeded', v_ok, 'refused', v_total - v_ok, 'results', v_results);
end;
$$;
revoke all on function public.coin_role_stipend_manual(text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_role_stipend_manual(text, uuid, text) to authenticated;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: DROPS, EACH BEHIND A CALLER GUARD =====

do $drop$
declare
	v_sig text;
	v_name text;
	v_callers text;
	v_dropped integer := 0;
	v_sigs text[] := array[
		'public.coin_admin_upsert_section(text, text, text, boolean, text)',
		'public.coin_admin_list_sections()',
		'public.coin_admin_list_section_students(text)',
		'public.coin_admin_set_student_section(text, text)',
		'public.coin_admin_assign_section_students(text, text[])',
		'public.coin_bulk_log_section(text, text, numeric, text, text, jsonb)',
		'public.coin_admin_save_import_mappings(jsonb)',
		'public.coin_admin_create_import_batch(jsonb)',
		'public.coin_admin_import_legacy(uuid, jsonb)',
		'public.coin_admin_rollback_import(uuid)',
		'public.coin_admin_import_reconcile(uuid)',
		'public.coin_admin_reimport_legacy(uuid, jsonb)',
		'public.coin_my_eating_pass_status()',
		'public.coin_bulk_payout(text)',
		'public.coin_payout_student(text, text, numeric)',
		'public.coin_admin_complete_contract(uuid, text)',
		'public.coin_admin_post_contract(text, text, integer, integer, text)',
		'public.coin_admin_list_contracts()',
		'public.coin_role_admin_list_applications(text)',
		'public.coin_role_admin_list_holders(text, text, boolean)',
		'public.coin_role_admin_capacity(text, text)',
		'public.coin_bulk_log_role_stipend(text, text, text, text, jsonb)',
		'public.coin_bulk_log_role_stipend(text, text, text)',
		'public._coin_role_capacity(text, text)',
		'public._coin_role_active_holder_count(text, text)',
		'public.coin_public_sections()',
		'public._coin_normalize_media(text, jsonb)',
		'public._coin_digital_only(text)'
	];
begin
	foreach v_sig in array v_sigs loop
		if to_regprocedure(v_sig) is null then
			continue;
		end if;
		v_name := split_part(split_part(v_sig, '(', 1), '.', 2);
		select string_agg(p.oid::regprocedure::text, ', ') into v_callers
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.oid <> to_regprocedure(v_sig)
			and p.prosrc ~ ('\m' || v_name || '\s*\(')
			and p.oid not in (select to_regprocedure(x) from unnest(v_sigs) x where to_regprocedure(x) is not null);
		if v_callers is not null then
			raise exception '0251: % still has a caller: %. Refusing to drop it.', v_sig, v_callers;
		end if;
		execute 'drop function ' || v_sig;
		insert into public.coin_v2_retired (name, kind, note)
		values (v_sig, 'function', 'Dropped by 0251 (IDEA Coin V2 session two).')
		on conflict (name) do nothing;
		v_dropped := v_dropped + 1;
	end loop;
	raise notice '0251: % function(s) dropped, each with no caller left.', v_dropped;
end
$drop$;

-- coin_balances without the two medium columns. Its one client reader (the
-- payout panel) is gone; balance keeps its name.
drop view if exists public.coin_balances;
create view public.coin_balances
with (security_invoker = true) as
select
	student_email,
	coalesce(sum(amount) filter (where medium = 'digital'), 0)::numeric(12,2) as balance,
	max(created_at) as last_activity_at,
	count(*)::integer as transaction_count
from public.coin_transactions
group by student_email;
revoke all on public.coin_balances from public, anon, authenticated, service_role;
grant select on public.coin_balances to authenticated;

-- THE DEAD TABLES: unreachable by any client role, and listed.
do $dead$
declare
	v_t text;
	v_note jsonb := jsonb_build_object(
		'coin_sections', 'The pre-V2 coin class list. Classes are IDEA Classroom sections now. Still the foreign-key target of coin_role_applications, coin_role_holders and coin_contracts (their old section_id columns, now history), so drop those constraints first.',
		'coin_section_students', 'The pre-V2 coin roster. Rosters are IDEA Classroom enrollments now.',
		'coin_students', 'The legacy Sheets name directory. Names come from IDEA Classroom now.',
		'coin_import_mappings', 'The finished Sheets import''s name mappings.',
		'coin_import_batches', 'The finished Sheets import''s batches. coin_contracts.import_batch names their ids.'
	);
begin
	foreach v_t in array array['coin_sections', 'coin_section_students', 'coin_students', 'coin_import_mappings', 'coin_import_batches'] loop
		if to_regclass('public.' || v_t) is null then
			continue;
		end if;
		execute format('revoke all on table public.%I from public, anon, authenticated, service_role', v_t);
		insert into public.coin_v2_retired (name, kind, note, drop_statement)
		values ('public.' || v_t, 'table', v_note ->> v_t, format('drop table public.%I cascade;', v_t))
		on conflict (name) do nothing;
	end loop;
	insert into public.coin_v2_retired (name, kind, note, drop_statement)
	values ('public.coin_balances.physical_balance', 'column', 'Removed with the view rebuild; no drop needed.', null),
		('public.coin_balances.digital_balance', 'column', 'Removed with the view rebuild; no drop needed.', null)
	on conflict (name) do nothing;
end
$dead$;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: THE LAST SWEEP AND THE SELF-CHECK =====

do $sweep$
declare
	r record;
	v_def text;
begin
	for r in
		select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname like 'coin\_%' and p.prokind = 'f'
			and p.prosrc like '%public.is_admin()%'
	loop
		v_def := replace(pg_get_functiondef(r.oid), 'public.is_admin()', 'public._coin_full_staff()');
		execute v_def;
	end loop;
end
$sweep$;

do $chk$
declare
	v_bad text;
	v_n integer;
begin
	-- No function or view reads a retired table or names a dropped function.
	select string_agg(p.oid::regprocedure::text, ', ') into v_bad
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
		and p.prosrc ~ '\m(coin_sections|coin_section_students|coin_students|coin_import_mappings|coin_import_batches|_coin_normalize_media|_coin_digital_only|coin_payout_student|coin_bulk_payout|coin_admin_list_sections|coin_bulk_log_section|coin_public_sections)\M';
	if v_bad is not null then
		raise exception '0251: these still read a retired object: %.', v_bad;
	end if;
	select string_agg(v.viewname, ', ') into v_bad from pg_views v
	where v.schemaname = 'public'
		and v.definition ~ '\m(coin_sections|coin_section_students|coin_students|coin_import_mappings|coin_import_batches)\M';
	if v_bad is not null then
		raise exception '0251: these views still read a retired table: %.', v_bad;
	end if;
	select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname like 'coin\_%'
		and exists (select 1 from unnest(coalesce(p.proargnames, array[]::text[])) a where a = 'p_medium');
	if v_n <> 0 then
		raise exception '0251: % coin function(s) still take p_medium.', v_n;
	end if;
	select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname like 'coin\_%' and p.prosrc like '%public.is_admin()%';
	if v_n <> 0 then
		raise exception '0251: % coin function(s) still gate on is_admin().', v_n;
	end if;
	if has_table_privilege('authenticated', 'public.coin_sections', 'select')
		or has_table_privilege('anon', 'public.coin_students', 'select') then
		raise exception '0251: a retired table is still readable by a client role.';
	end if;
	if has_function_privilege('anon', 'public.coin_log_transaction(text, text, numeric, numeric, text)', 'execute') then
		raise exception '0251: anon must not execute coin_log_transaction.';
	end if;
	raise notice '0251: the old coin model is retired. % object(s) listed in coin_v2_retired.',
		(select count(*) from public.coin_v2_retired);
end
$chk$;
-- ===== PART D END =====
