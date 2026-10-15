-- 0240_coin_v2_settings_and_fines.sql
--
-- IDEA COIN V2, PART TWO (ledger 0384): THE SETTINGS PAGE, THE FINE SCREEN,
-- UNDO, THE DEBT LIST, AND THE COIN-PAID PURCHASE.
--
-- Every function here is ADMIN ONLY (is_admin(), the coin rule), revokes from
-- public, anon, authenticated and service_role by name (0166's shape) and
-- grants back to authenticated alone. Every setting change is written to
-- coin_settings_audit with who and when.
--
-- NOTHING IS DELETED. Undo posts a reversing row; a no-shop mark is cleared
-- by a stamp.
--
-- UNDO: drop the functions this file creates. No table is created here and no
-- existing row is written by the apply.

-- ===== PART A BEGIN =====
-- ===== PART A: SETTINGS =====

-- The settings a person may set, and the shape each must have. One place.
create or replace function public._coin_setting_ok(p_key text, p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_el jsonb;
begin
	if p_value is null then
		return false;
	end if;
	case p_key
		when 'autopay_paused' then
			return jsonb_typeof(p_value) = 'boolean';
		when 'autopay_start', 'highest_grade_anchor', 'no_pay_after' then
			return jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$';
		when 'highest_grade_weeks' then
			return jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 1 and 20
				and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
		when 'hall_pass_warn_minutes', 'hall_pass_fine_minutes' then
			return jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 1 and 240;
		when 'extra_credit_cap_percent' then
			return jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 0 and 100;
		when 'pay_raise_cost_per_tier', 'print_grams_per_coin', 'property_damage_careless_base',
			'property_damage_dollars_per_coin' then
			return jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 0.01 and 100000;
		when 'student_actions_per_minute' then
			return jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 1 and 120;
		when 'no_pay_weeks' then
			if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 200 then
				return false;
			end if;
			for v_el in select * from jsonb_array_elements(p_value) loop
				if jsonb_typeof(v_el) <> 'string' or (v_el #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$'
					or extract(isodow from (v_el #>> '{}')::date) <> 1 then
					return false;
				end if;
			end loop;
			return true;
		when 'semesters' then
			if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 20 then
				return false;
			end if;
			for v_el in select * from jsonb_array_elements(p_value) loop
				if jsonb_typeof(v_el) <> 'object'
					or coalesce(v_el ->> 'key', '') !~ '^[a-z0-9-]{1,30}$'
					or coalesce(v_el ->> 'start', '') !~ '^\d{4}-\d{2}-\d{2}$'
					or coalesce(v_el ->> 'end', '') !~ '^\d{4}-\d{2}-\d{2}$'
					or (v_el ->> 'end')::date < (v_el ->> 'start')::date then
					return false;
				end if;
			end loop;
			return true;
		when 'fine_buttons' then
			if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 30 then
				return false;
			end if;
			for v_el in select * from jsonb_array_elements(p_value) loop
				if jsonb_typeof(v_el) <> 'string' or (v_el #>> '{}') !~ '^[a-z0-9_]+$' then
					return false;
				end if;
			end loop;
			return true;
		else
			return false;
	end case;
exception when others then
	return false;
end;
$$;
revoke all on function public._coin_setting_ok(text, jsonb) from public, anon, authenticated, service_role;

create or replace function public._coin_audit(p_key text, p_old jsonb, p_new jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
	insert into public.coin_settings_audit (key, old_value, new_value, changed_by)
	values (p_key, p_old, p_new, coalesce(nullif(public.current_user_email(), ''), 'system'));
$$;
revoke all on function public._coin_audit(text, jsonb, jsonb) from public, anon, authenticated, service_role;

-- The semester a date falls in, from the settings, or null.
create or replace function public._coin_semester_of(p_day date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select s
	from jsonb_array_elements(coalesce(public._coin_setting('semesters'), '[]'::jsonb)) s
	where p_day between (s ->> 'start')::date and (s ->> 'end')::date
	order by (s ->> 'start')::date
	limit 1;
$$;
revoke all on function public._coin_semester_of(date) from public, anon, authenticated, service_role;

create or replace function public.coin_settings_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public.is_admin() then
		raise exception 'Only site admins can read the coin settings.';
	end if;
	return jsonb_build_object(
		'settings', coalesce((select jsonb_object_agg(s.key, s.value) from public.coin_settings s
			where s.key not like 'v2\_%'), '{}'::jsonb),
		'categories', coalesce((select jsonb_agg(jsonb_build_object(
				'id', c.id, 'name', c.name, 'kind', c.kind, 'pricing_model', c.pricing_model,
				'amount', c.amount, 'min_amount', c.min_amount, 'max_amount', c.max_amount,
				'unit_label', c.unit_label, 'cap_period', c.cap_period, 'cap_count', c.cap_count,
				'loggable', c.loggable, 'active', c.active, 'sort_order', c.sort_order,
				'explanation', c.explanation)
			order by c.kind, c.sort_order, c.name)
			from public.coin_categories c where c.id not like 'legacy\_%'), '[]'::jsonb),
		'sections', coalesce((select jsonb_agg(jsonb_build_object(
				'id', s.id,
				'label', public._coin_classroom_section_label(s.id),
				'teacher_email', s.teacher_email,
				'economy_on', s.coin_economy_on,
				'auto_checkin_minutes',
					((public._classroom_hall_pass_section_limits(s.id)) ->> 'auto_checkin_minutes')::integer)
			order by public._coin_classroom_section_label(s.id))
			from public.classroom_sections s where s.active), '[]'::jsonb),
		'audit', coalesce((select jsonb_agg(row_to_json(a)::jsonb order by a.changed_at desc)
			from (select key, old_value, new_value, changed_by, changed_at
				from public.coin_settings_audit order by changed_at desc, id desc limit 100) a), '[]'::jsonb)
	);
end;
$$;
revoke all on function public.coin_settings_get() from public, anon, authenticated, service_role;
grant execute on function public.coin_settings_get() to authenticated;

create or replace function public.coin_settings_set(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_old jsonb;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can change the coin settings.';
	end if;
	if not public._coin_setting_ok(p_key, p_value) then
		return jsonb_build_object('ok', false, 'reason', 'invalid', 'key', p_key);
	end if;
	select s.value into v_old from public.coin_settings s where s.key = p_key for update;
	if v_old is not distinct from p_value then
		return jsonb_build_object('ok', true, 'changed', false, 'key', p_key, 'value', p_value);
	end if;
	insert into public.coin_settings (key, value, updated_by, updated_at)
	values (p_key, p_value, public.current_user_email(), now())
	on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
	perform public._coin_audit(p_key, v_old, p_value);
	return jsonb_build_object('ok', true, 'changed', true, 'key', p_key, 'value', p_value);
end;
$$;
revoke all on function public.coin_settings_set(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.coin_settings_set(text, jsonb) to authenticated;

-- One category's editable fields. A null argument leaves that field alone, so
-- the form sends only what moved. The pricing model is not editable: it is
-- the shape every logger switches on.
create or replace function public.coin_settings_set_category(
	p_id text,
	p_name text,
	p_amount numeric,
	p_min_amount numeric,
	p_max_amount numeric,
	p_cap_period text,
	p_cap_count integer,
	p_active boolean,
	p_explanation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_old public.coin_categories;
	v_new public.coin_categories;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can change coin categories.';
	end if;
	select * into v_old from public.coin_categories where id = p_id for update;
	if v_old.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if p_amount is not null and p_amount < 0
		or p_min_amount is not null and p_min_amount < 0
		or p_max_amount is not null and p_max_amount < 0 then
		return jsonb_build_object('ok', false, 'reason', 'negative');
	end if;
	if p_name is not null and char_length(btrim(p_name)) not between 1 and 120 then
		return jsonb_build_object('ok', false, 'reason', 'name');
	end if;
	if p_explanation is not null and char_length(p_explanation) > 1500 then
		return jsonb_build_object('ok', false, 'reason', 'explanation_too_long');
	end if;

	begin
		update public.coin_categories c set
			name = coalesce(nullif(btrim(p_name), ''), c.name),
			amount = case when c.pricing_model in ('flat', 'per_unit') then coalesce(round(p_amount, 2), c.amount) else c.amount end,
			min_amount = case when c.pricing_model = 'range' then coalesce(round(p_min_amount, 2), c.min_amount) else c.min_amount end,
			max_amount = case when c.pricing_model = 'range' then coalesce(round(p_max_amount, 2), c.max_amount) else c.max_amount end,
			cap_period = case when p_cap_period = 'none' then null when p_cap_period is null then c.cap_period else p_cap_period end,
			cap_count = case when p_cap_period = 'none' then null when p_cap_count is null then c.cap_count else p_cap_count end,
			active = coalesce(p_active, c.active),
			explanation = case when p_explanation is null then c.explanation else nullif(btrim(p_explanation), '') end
		where c.id = p_id
		returning * into v_new;
	exception when check_violation then
		return jsonb_build_object('ok', false, 'reason', 'shape', 'message', sqlerrm);
	end;

	if to_jsonb(v_old) is distinct from to_jsonb(v_new) then
		perform public._coin_audit('category:' || p_id, to_jsonb(v_old), to_jsonb(v_new));
	end if;
	return jsonb_build_object('ok', true, 'category', to_jsonb(v_new));
end;
$$;
revoke all on function public.coin_settings_set_category(text, text, numeric, numeric, numeric, text, integer, boolean, text)
	from public, anon, authenticated, service_role;
grant execute on function public.coin_settings_set_category(text, text, numeric, numeric, numeric, text, integer, boolean, text)
	to authenticated;

create or replace function public.coin_settings_set_section_economy(p_section_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_old boolean;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can change the coin settings.';
	end if;
	if p_on is null then
		return jsonb_build_object('ok', false, 'reason', 'invalid');
	end if;
	select s.coin_economy_on into v_old from public.classroom_sections s where s.id = p_section_id for update;
	if not found then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_old is distinct from p_on then
		update public.classroom_sections set coin_economy_on = p_on where id = p_section_id;
		perform public._coin_audit('section_economy:' || p_section_id, to_jsonb(v_old), to_jsonb(p_on));
	end if;
	return jsonb_build_object('ok', true, 'section_id', p_section_id, 'economy_on', p_on);
end;
$$;
revoke all on function public.coin_settings_set_section_economy(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.coin_settings_set_section_economy(uuid, boolean) to authenticated;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: THE FINE SCREEN =====

-- The sections the fine screen offers, with which one is in session now (the
-- Foundry class schedule, where a teacher turned it on).
create or replace function public.coin_fine_sections()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public.is_admin() then
		raise exception 'Only site admins can use the fine screen.';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', s.id,
			'label', public._coin_classroom_section_label(s.id),
			'teacher_email', s.teacher_email,
			'in_session', s.foundry_schedule_enabled
				and exists (select 1 from public._foundry_schedule_window(s.id, now())),
			'students', (select count(*) from public._coin_economy_enrollments() x where x.section_id = s.id))
			order by public._coin_classroom_section_label(s.id))
		from public.classroom_sections s
		where s.active and s.coin_economy_on
	), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_fine_sections() from public, anon, authenticated, service_role;
grant execute on function public.coin_fine_sections() to authenticated;

create or replace function public.coin_fine_roster(p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_today date := public._coin_la_today();
begin
	if not public.is_admin() then
		raise exception 'Only site admins can use the fine screen.';
	end if;
	return jsonb_build_object(
		'section_id', p_section_id,
		'label', public._coin_classroom_section_label(p_section_id),
		'students', coalesce((
			select jsonb_agg(jsonb_build_object(
				'email', x.student_email,
				'display_name', x.display_name,
				'balance', public._coin_balance(x.student_email),
				'out_on_pass', exists (select 1 from public.classroom_hall_passes h
					where h.section_id = p_section_id and h.student_email = x.student_email and h.closed_at is null),
				'no_shop', exists (select 1 from public.coin_no_shop n
					where n.student_email = x.student_email and n.on_date = v_today and n.cleared_at is null),
				'eating_pass', public.coin_eating_pass_active(x.student_email))
				order by x.display_name, x.student_email)
			from public._coin_economy_enrollments() x
			where x.section_id = p_section_id
		), '[]'::jsonb)
	);
end;
$$;
revoke all on function public.coin_fine_roster(uuid) from public, anon, authenticated, service_role;
grant execute on function public.coin_fine_roster(uuid) to authenticated;

-- PROPERTY DAMAGE, ONE BUTTON. An accident is free the first time this
-- semester (logged) and a repeat after that; careless damage asks the cost.
create or replace function public._coin_property_damage(p_email text, p_careless_cost numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_sem jsonb := public._coin_semester_of(public._coin_la_today());
	v_prior integer;
begin
	if p_careless_cost is not null then
		return public.coin_log_property_damage_careless(p_email, p_careless_cost, null, 'digital');
	end if;
	select count(*) into v_prior from public.coin_transactions t
	where t.student_email = lower(btrim(p_email))
		and t.category_id in ('property_damage_first_accident', 'property_damage_repeat_accident')
		and not public._coin_is_reversed(t.id)
		and (v_sem is null or public._coin_la_today(t.created_at)
			between (v_sem ->> 'start')::date and (v_sem ->> 'end')::date);
	return public.coin_log_transaction(p_email,
		case when v_prior = 0 then 'property_damage_first_accident' else 'property_damage_repeat_accident' end);
end;
$$;
revoke all on function public._coin_property_damage(text, numeric) from public, anon, authenticated, service_role;

-- One press on the fine screen: a fine or an award, for one student or
-- several. p_category_id 'property_damage' is the one button that resolves to
-- one of three categories. Each student's result carries its transaction id,
-- which is what Undo reverses.
create or replace function public.coin_fine_log(
	p_emails text[],
	p_category_id text,
	p_amount numeric default null,
	p_careless_cost numeric default null,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_emails text[];
	v_email text;
	v_call jsonb;
	v_results jsonb := '[]'::jsonb;
	v_ok integer := 0;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	select coalesce(array_agg(e order by e), array[]::text[]) into v_emails
	from (select distinct lower(btrim(x)) as e from unnest(coalesce(p_emails, array[]::text[])) x
		where nullif(btrim(coalesce(x, '')), '') is not null) s;
	if array_length(v_emails, 1) is null then
		return jsonb_build_object('ok', false, 'reason', 'no_students');
	end if;
	if array_length(v_emails, 1) > 60 then
		return jsonb_build_object('ok', false, 'reason', 'too_many');
	end if;
	foreach v_email in array v_emails loop
		begin
			if p_category_id = 'property_damage' then
				v_call := public._coin_property_damage(v_email, p_careless_cost);
			else
				v_call := public.coin_log_transaction(v_email, p_category_id, p_amount, null,
					coalesce(nullif(btrim(coalesce(p_note, '')), ''),
						case when exists (select 1 from public.coin_categories c where c.id = p_category_id
							and c.pricing_model = 'variable') then 'Logged on the fine screen.' end), 'digital');
			end if;
		exception when others then
			v_call := jsonb_build_object('ok', false, 'reason', 'error', 'message', sqlerrm);
		end;
		if coalesce((v_call ->> 'ok')::boolean, false) then
			v_ok := v_ok + 1;
		end if;
		v_results := v_results || jsonb_build_array(jsonb_build_object('email', v_email) || v_call);
	end loop;
	return jsonb_build_object('ok', true, 'total', array_length(v_emails, 1), 'succeeded', v_ok,
		'refused', array_length(v_emails, 1) - v_ok, 'results', v_results);
end;
$$;
revoke all on function public.coin_fine_log(text[], text, numeric, numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_fine_log(text[], text, numeric, numeric, text) to authenticated;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: UNDO =====
--
-- A REVERSAL IS A ROW, NEVER A DELETE. It carries the exact opposite amount,
-- names the row it cancels in meta.reverses, and a unique index (0239) makes a
-- second reversal of the same row impossible. Whatever the original row
-- changed beyond the balance is put back too: a Shop Safety bar, a pay raise's
-- tier, a bought extra credit's points.

create or replace function public._coin_reverse(p_transaction_id uuid, p_note text, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_row public.coin_transactions;
	v_rev public.coin_transactions;
	v_points numeric;
begin
	select * into v_row from public.coin_transactions where id = p_transaction_id for update;
	if v_row.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_row.category_id = 'reversal' then
		return jsonb_build_object('ok', false, 'reason', 'is_reversal');
	end if;
	if v_row.medium <> 'digital' or v_row.transfer_id is not null then
		return jsonb_build_object('ok', false, 'reason', 'not_reversible');
	end if;
	if public._coin_is_reversed(v_row.id) then
		return jsonb_build_object('ok', false, 'reason', 'already_reversed');
	end if;

	v_rev := public._coin_insert(v_row.student_email, 'reversal', -v_row.amount, null,
		coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Undo'),
		jsonb_build_object('reverses', v_row.id::text, 'reversed_category', v_row.category_id),
		'digital', null, p_actor);

	if v_row.category_id = 'shop_safety_violation' then
		update public.coin_no_shop
		set cleared_at = now(), cleared_by = coalesce(p_actor, public.current_user_email())
		where source_transaction_id = v_row.id and cleared_at is null;
	elsif v_row.category_id = 'pay_raise' then
		update public.coin_wage_tiers
		set tier = greatest(1, tier - 1), updated_at = now()
		where student_email = v_row.student_email and tier = (v_row.meta ->> 'new_tier')::integer;
	elsif v_row.category_id = 'extra_credit' and v_row.meta ? 'submission_id' then
		v_points := coalesce(v_row.quantity, 0);
		update public.classroom_submissions s
		set extra_credit = greatest(0, coalesce(s.extra_credit, 0) - v_points),
			score = coalesce(s.score, 0) - least(v_points, coalesce(s.extra_credit, 0)),
			updated_at = now()
		where s.id = (v_row.meta ->> 'submission_id')::uuid;
	end if;

	return jsonb_build_object('ok', true, 'transaction_id', v_rev.id, 'reverses', v_row.id,
		'amount', v_rev.amount, 'balance', public._coin_balance(v_row.student_email));
exception when unique_violation then
	return jsonb_build_object('ok', false, 'reason', 'already_reversed');
end;
$$;
revoke all on function public._coin_reverse(uuid, text, text) from public, anon, authenticated, service_role;

create or replace function public.coin_reverse_transaction(p_transaction_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not public.is_admin() then
		raise exception 'Only site admins can undo IDEA Coin transactions.';
	end if;
	return public._coin_reverse(p_transaction_id, p_note, null);
end;
$$;
revoke all on function public.coin_reverse_transaction(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_reverse_transaction(uuid, text) to authenticated;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: DEBT, CASH PURCHASES, NO SHOP =====

create or replace function public.coin_debt_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public.is_admin() then
		raise exception 'Only site admins can read the debt list.';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object('email', d.email, 'name', d.name, 'section', d.section, 'balance', d.balance)
			order by d.balance, d.name)
		from (
			select b.student_email as email, b.balance,
				coalesce(ros.display_name, b.student_email) as name, ros.section
			from (
				select t.student_email, sum(t.amount) as balance
				from public.coin_transactions t where t.medium = 'digital'
				group by t.student_email
				having sum(t.amount) < 0
			) b
			left join public._coin_public_roster() ros on ros.student_email = b.student_email
		) d
	), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_debt_list() from public, anon, authenticated, service_role;
grant execute on function public.coin_debt_list() to authenticated;

-- A PURCHASE PAID IN PHYSICAL COINS. Recorded as a physical-medium purchase
-- row, so it is in the history and moves no balance. Refused while the
-- balance is negative: physical coins in hand pay the debt first
-- (debt_payment). What the purchase grants is still granted: an Eating Pass
-- becomes active, a pay raise raises the tier.
create or replace function public.coin_record_cash_purchase(
	p_email text,
	p_category_id text,
	p_quantity numeric default null,
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
	v_price numeric;
	v_meta jsonb := jsonb_build_object('paid_in', 'physical_coins');
	v_quote jsonb;
	v_row public.coin_transactions;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if public._coin_balance(v_email) < 0 then
		return jsonb_build_object('ok', false, 'reason', 'in_debt', 'balance', public._coin_balance(v_email));
	end if;
	select * into v_cat from public.coin_categories where id = p_category_id;
	if v_cat.id is null or v_cat.kind <> 'purchase' or not v_cat.active
		or v_cat.id in ('coin_payout', 'extra_credit') then
		return jsonb_build_object('ok', false, 'reason', 'not_purchasable');
	end if;
	if v_cat.id = 'pay_raise' then
		v_quote := public._coin_pay_raise_quote(v_email);
		v_price := (v_quote ->> 'cost')::numeric;
		v_meta := v_meta || jsonb_build_object('previous_tier', (v_quote ->> 'tier')::integer,
			'new_tier', (v_quote ->> 'new_tier')::integer, 'cost', v_price);
	elsif v_cat.id = 'three_d_printing' then
		if p_quantity is null or p_quantity <= 0 then
			return jsonb_build_object('ok', false, 'reason', 'grams_required');
		end if;
		v_price := public._coin_print_price(p_quantity);
		v_meta := v_meta || jsonb_build_object('grams', p_quantity);
	elsif v_cat.pricing_model = 'flat' then
		v_price := v_cat.amount;
	elsif v_cat.pricing_model = 'per_unit' then
		if p_quantity is null or p_quantity <= 0 then
			return jsonb_build_object('ok', false, 'reason', 'quantity_required');
		end if;
		v_price := round(v_cat.amount * p_quantity, 2);
	elsif v_cat.pricing_model in ('variable', 'range') then
		if p_quantity is null or p_quantity <= 0 then
			return jsonb_build_object('ok', false, 'reason', 'amount_required');
		end if;
		v_price := round(p_quantity, 2);
	else
		return jsonb_build_object('ok', false, 'reason', 'not_purchasable');
	end if;
	if v_cat.id = 'eating_pass' and public.coin_eating_pass_active(v_email) then
		return jsonb_build_object('ok', false, 'reason', 'pass_already_active');
	end if;

	v_row := public._coin_insert(v_email, v_cat.id, -v_price, p_quantity,
		coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Paid in physical coins.'), v_meta, 'physical');
	if v_cat.id = 'pay_raise' then
		insert into public.coin_wage_tiers (student_email) values (v_email) on conflict (student_email) do nothing;
		update public.coin_wage_tiers set tier = (v_quote ->> 'new_tier')::integer, updated_at = now()
		where student_email = v_email;
	end if;
	return jsonb_build_object('ok', true, 'transaction_id', v_row.id, 'price', v_price,
		'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.coin_record_cash_purchase(text, text, numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_record_cash_purchase(text, text, numeric, text) to authenticated;

create or replace function public.coin_no_shop_set(p_email text, p_on boolean, p_on_date date default null, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_day date := coalesce(p_on_date, public._coin_la_today());
begin
	if not public.is_admin() then
		raise exception 'Only site admins can change a no-shop mark.';
	end if;
	if v_email = '' or v_email not like '%@%' or p_on is null then
		return jsonb_build_object('ok', false, 'reason', 'invalid');
	end if;
	if p_on then
		insert into public.coin_no_shop (student_email, on_date, reason, set_by)
		values (v_email, v_day, nullif(btrim(coalesce(p_reason, '')), ''), public.current_user_email())
		on conflict (student_email, on_date) do update set cleared_at = null, cleared_by = null,
			reason = coalesce(excluded.reason, public.coin_no_shop.reason);
	else
		update public.coin_no_shop set cleared_at = now(), cleared_by = public.current_user_email()
		where student_email = v_email and on_date = v_day and cleared_at is null;
	end if;
	return jsonb_build_object('ok', true, 'email', v_email, 'on_date', v_day, 'no_shop', p_on);
end;
$$;
revoke all on function public.coin_no_shop_set(text, boolean, date, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_no_shop_set(text, boolean, date, text) to authenticated;

-- Today's no-shop marks for a set of students: the live-class panel's read.
-- Manager of the section or admin; names only what the caller can already see.
create or replace function public.coin_no_shop_today(p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if p_section_id is null or not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object('email', n.student_email, 'name', e.display_name, 'reason', n.reason)
			order by e.display_name)
		from public.coin_no_shop n
		join public.classroom_enrollments e on e.student_email = n.student_email and e.section_id = p_section_id
		where n.on_date = public._coin_la_today() and n.cleared_at is null
	), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_no_shop_today(uuid) from public, anon, authenticated, service_role;
grant execute on function public.coin_no_shop_today(uuid) to authenticated;
-- ===== PART D END =====

do $chk$
declare
	r record;
begin
	for r in
		select p.oid::regprocedure::text as sig,
			has_function_privilege('anon', p.oid, 'execute') as anon_x
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname in ('coin_settings_get', 'coin_settings_set',
			'coin_settings_set_category', 'coin_settings_set_section_economy', 'coin_fine_sections',
			'coin_fine_roster', 'coin_fine_log', 'coin_reverse_transaction', 'coin_debt_list',
			'coin_record_cash_purchase', 'coin_no_shop_set', 'coin_no_shop_today')
	loop
		if r.anon_x then
			raise exception '0240: anon must not execute %.', r.sig;
		end if;
	end loop;
	raise notice '0240: settings, fine screen, undo, debt list and cash purchases are in place.';
end
$chk$;
