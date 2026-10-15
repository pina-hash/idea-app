-- 0244_coin_v2_staff_scope.sql
--
-- IDEA COIN V2, SESSION TWO, PART ONE (ledger 0386): WHO HOLDS WHICH COIN
-- POWERS. Decision 68 (docs/decisions/entries/68-*), Mr. Pina's words: Mr.
-- Cosso's coin powers are "scoped to his own section".
--
-- TWO TIERS, BOTH STATED ONCE, BOTH ENFORCED HERE:
--
--   FULL COIN STAFF    admin_owner_email(), plus anyone on coin_full_admins
--                      (editable on /coin-desk/settings, empty by default) who
--                      is also a site admin. Everything.
--   SECTION COIN STAFF every other site admin, and every section's
--                      teacher_email. The fine screen, the Award button, the
--                      queue, payday, the digest and the student telemetry
--                      view, over the students in the sections whose
--                      teacher_email is theirs. Nothing else: no settings, no
--                      amount edits, no autopay reversals, no other section.
--
-- WHY A SECTION'S teacher_email AND NOT classroom_manages_section. For a site
-- admin, classroom_manages_section is true for EVERY section (0138), so "the
-- sections he manages" would be the whole school and the decision would mean
-- nothing for Mr. Cosso, who is an admin (0067's seed). A coin scope therefore
-- reads the section's own teacher of record. Nobody's non-coin admin powers
-- change: is_admin() is not touched.
--
-- HOW THE NARROWING IS APPLIED. Two shapes, deliberately:
--   1. The functions a section coin staff member may call (the fine screen,
--      the generic logger for a fine or an award, Undo, the lookup, the no-shop
--      toggle, the debt list) are rewritten here, in full, with their scope
--      checks written out. Their bodies are 0239/0240's with the gate changed
--      and nothing else.
--   2. Every OTHER coin function's gate is a pure narrowing of is_admin() to
--      _coin_full_staff(), which implies is_admin(). That is done by the
--      sweep at the end of this file (and again by 0251 after the later files
--      create theirs): it reads each public coin_* function's own definition
--      off the catalog, replaces public.is_admin() with
--      public._coin_full_staff(), and recreates it. Reading the body back
--      rather than retyping it is what makes it a one-term change with no
--      reconstruction risk (CLAUDE.md: diff it against the source). The
--      self-check asserts the result.
--
-- UNDO: re-run the 0239 and 0240 bodies of the functions re-created in part B,
-- run the sweep in reverse (_coin_full_staff() back to is_admin()), drop the
-- functions this file creates and the coin_full_admins table.

-- THE FIRST OBJECT IS NEW (the apply probe reads the first created object).
create table if not exists public.coin_full_admins (
	email text primary key check (email = lower(btrim(email)) and email like '%@boscotech.edu'),
	added_by text not null,
	added_at timestamptz not null default now(),
	note text check (note is null or char_length(note) <= 300)
);
alter table public.coin_full_admins enable row level security;
revoke all on table public.coin_full_admins from public, anon, authenticated, service_role;

-- ===== PART A BEGIN =====
-- ===== PART A: THE TWO TIERS =====

create or replace function public._coin_full_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when (select auth.uid()) is null then false
		else public.is_admin() and (
			public.current_user_email() = lower(public.admin_owner_email())
			or exists (select 1 from public.coin_full_admins f where f.email = public.current_user_email())
		)
	end;
$$;
revoke all on function public._coin_full_staff() from public, anon, authenticated, service_role;

-- The sections a coin staff member's powers reach. Full staff: every section.
-- Anyone else: the sections whose teacher of record they are.
create or replace function public._coin_scope_sections()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
	select s.id from public.classroom_sections s
	where public._coin_full_staff()
		or (public.current_user_email() <> '' and s.teacher_email = public.current_user_email());
$$;
revoke all on function public._coin_scope_sections() from public, anon, authenticated, service_role;

-- Any coin staff at all (full, or teacher of record of an active section).
create or replace function public._coin_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public._coin_full_staff() or (
		public.current_user_email() <> '' and exists (
			select 1 from public.classroom_sections s
			where s.active and s.teacher_email = public.current_user_email()));
$$;
revoke all on function public._coin_staff() from public, anon, authenticated, service_role;

create or replace function public._coin_section_in_scope(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select p_section_id is not null and (public._coin_full_staff() or exists (
		select 1 from public.classroom_sections s
		where s.id = p_section_id and public.current_user_email() <> ''
			and s.teacher_email = public.current_user_email()));
$$;
revoke all on function public._coin_section_in_scope(uuid) from public, anon, authenticated, service_role;

-- A student is in a section coin staff member's scope when they hold an
-- active, non-manager enrollment in one of that member's sections. Full staff
-- reach every address.
create or replace function public._coin_student_in_scope(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public._coin_full_staff() or (
		public.current_user_email() <> '' and exists (
			select 1 from public.classroom_enrollments e
			join public.classroom_sections s on s.id = e.section_id
			where e.student_email = lower(btrim(coalesce(p_email, '')))
				and e.active
				and s.teacher_email = public.current_user_email()
				and not public._classroom_manages_section_email(e.section_id, e.student_email)));
$$;
revoke all on function public._coin_student_in_scope(text) from public, anon, authenticated, service_role;

-- What the Coin Desk asks before it draws itself: which tier, and which
-- classes. A caller who is no coin staff gets {scope: null} and nothing else.
create or replace function public.coin_staff_scope()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public._coin_staff() then
		return jsonb_build_object('scope', null);
	end if;
	return jsonb_build_object(
		'scope', case when public._coin_full_staff() then 'full' else 'section' end,
		'sections', coalesce((select jsonb_agg(jsonb_build_object(
				'id', s.id, 'label', public._coin_classroom_section_label(s.id))
				order by public._coin_classroom_section_label(s.id))
			from public.classroom_sections s
			where s.active and s.id in (select public._coin_scope_sections())), '[]'::jsonb)
	);
end;
$$;
revoke all on function public.coin_staff_scope() from public, anon, authenticated, service_role;
grant execute on function public.coin_staff_scope() to authenticated;

-- The full-admin list, edited on the settings page by full staff only.
create or replace function public.coin_full_admin_set(p_email text, p_on boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_had boolean;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can change who holds full coin powers.';
	end if;
	if p_on is null or v_email !~ '^[^@\s]+@boscotech\.edu$' then
		return jsonb_build_object('ok', false, 'reason', 'invalid');
	end if;
	if v_email = lower(public.admin_owner_email()) then
		return jsonb_build_object('ok', false, 'reason', 'owner');
	end if;
	v_had := exists (select 1 from public.coin_full_admins where email = v_email);
	if p_on and not v_had then
		insert into public.coin_full_admins (email, added_by, note)
		values (v_email, public.current_user_email(), nullif(btrim(coalesce(p_note, '')), ''));
		perform public._coin_audit('coin_full_admin:' || v_email, 'false'::jsonb, 'true'::jsonb);
	elsif not p_on and v_had then
		delete from public.coin_full_admins where email = v_email;
		perform public._coin_audit('coin_full_admin:' || v_email, 'true'::jsonb, 'false'::jsonb);
	end if;
	return jsonb_build_object('ok', true, 'email', v_email, 'full', p_on,
		'is_site_admin', public._admin_is_email(v_email));
end;
$$;
revoke all on function public.coin_full_admin_set(text, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_full_admin_set(text, boolean, text) to authenticated;

create or replace function public.coin_full_admin_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can read this list.';
	end if;
	return jsonb_build_object(
		'owner', lower(public.admin_owner_email()),
		'full_admins', coalesce((select jsonb_agg(jsonb_build_object('email', f.email, 'added_by', f.added_by,
				'added_at', f.added_at, 'note', f.note, 'is_site_admin', public._admin_is_email(f.email))
				order by f.email) from public.coin_full_admins f), '[]'::jsonb),
		'site_admins', coalesce((select jsonb_agg(a.email order by a.email) from public.app_admins a), '[]'::jsonb)
	);
end;
$$;
revoke all on function public.coin_full_admin_list() from public, anon, authenticated, service_role;
grant execute on function public.coin_full_admin_list() to authenticated;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: THE FUNCTIONS SECTION STAFF MAY CALL =====

create or replace function public.coin_fine_sections()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can use the fine screen.';
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
		where s.active and s.coin_economy_on and s.id in (select public._coin_scope_sections())
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
	if not public._coin_staff() then
		raise exception 'Only coin staff can use the fine screen.';
	end if;
	if not public._coin_section_in_scope(p_section_id) then
		raise exception 'That class is not one of yours.';
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

-- The generic logger. 0239's body; the one change is the gate. Full staff log
-- anything. Section staff log a fine or an award for one of their own
-- students and nothing else (no purchase, no adjustment).
create or replace function public.coin_log_transaction(
	p_email text,
	p_category_id text,
	p_amount numeric default null,
	p_quantity numeric default null,
	p_note text default null,
	p_medium text default 'digital'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
	perform public._coin_digital_only(p_medium);

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
revoke all on function public.coin_log_transaction(text, text, numeric, numeric, text, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_log_transaction(text, text, numeric, numeric, text, text) to authenticated;

create or replace function public.coin_log_property_damage_careless(
	p_email text,
	p_cost_dollars numeric,
	p_note text,
	p_medium text default 'digital'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
	perform public._coin_digital_only(p_medium);
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
revoke all on function public.coin_log_property_damage_careless(text, numeric, text, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_log_property_damage_careless(text, numeric, text, text) to authenticated;

-- PROPERTY DAMAGE, ONE BUTTON (0240's body). Its inner calls name no medium,
-- so 0251 can retire the p_medium arguments without touching it again.
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
		return public.coin_log_property_damage_careless(p_email, p_careless_cost, null);
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
	if not public._coin_staff() then
		raise exception 'Only coin staff can log IDEA Coin transactions.';
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
			if not public._coin_student_in_scope(v_email) then
				v_call := jsonb_build_object('ok', false, 'reason', 'out_of_scope');
			elsif p_category_id = 'property_damage' then
				v_call := public._coin_property_damage(v_email, p_careless_cost);
			else
				v_call := public.coin_log_transaction(v_email, p_category_id, p_amount, null,
					coalesce(nullif(btrim(coalesce(p_note, '')), ''),
						case when exists (select 1 from public.coin_categories c where c.id = p_category_id
							and c.pricing_model = 'variable') then 'Logged on the fine screen.' end));
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

-- Undo. Full staff undo any reversible row. Section staff undo a fine or an
-- award a person logged for one of their own students; an automatic row
-- (actor 'system': autopay, the hall pass fine) is a full coin admin's to
-- reverse, which is "no autopay reversals" from decision 68.
create or replace function public.coin_reverse_transaction(p_transaction_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_row public.coin_transactions;
	v_kind text;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can undo IDEA Coin transactions.';
	end if;
	if not public._coin_full_staff() then
		select * into v_row from public.coin_transactions where id = p_transaction_id;
		if v_row.id is null or not public._coin_student_in_scope(v_row.student_email) then
			return jsonb_build_object('ok', false, 'reason', 'not_found');
		end if;
		select c.kind into v_kind from public.coin_categories c where c.id = v_row.category_id;
		if v_row.actor_email = 'system' or coalesce(v_kind, '') not in ('fine', 'award') then
			return jsonb_build_object('ok', false, 'reason', 'full_admin_only');
		end if;
	end if;
	return public._coin_reverse(p_transaction_id, p_note, null);
end;
$$;
revoke all on function public.coin_reverse_transaction(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_reverse_transaction(uuid, text) to authenticated;

create or replace function public.coin_admin_lookup(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_wage_tier integer;
	v_recent jsonb;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can look up IDEA Coin balances.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid email.';
	end if;
	if not public._coin_student_in_scope(v_email) then
		raise exception 'That student is not in one of your classes.';
	end if;
	select coalesce(tier, 1) into v_wage_tier from public.coin_wage_tiers where student_email = v_email;
	select coalesce(jsonb_agg(row_to_json(r) order by r.created_at desc), '[]'::jsonb) into v_recent
	from (
		select t.id, t.category_id, c.name as category_name, t.amount, t.medium, t.transfer_id,
			t.quantity, t.note, t.actor_email, t.created_at, t.meta ->> 'reverses' as reverses,
			public._coin_is_reversed(t.id) as reversed
		from public.coin_transactions t
		join public.coin_categories c on c.id = t.category_id
		where t.student_email = v_email
		order by t.created_at desc
		limit 50
	) r;
	return jsonb_build_object(
		'email', v_email,
		'balance', public._coin_balance(v_email),
		'wage_tier', coalesce(v_wage_tier, 1),
		'eating_pass_active', public.coin_eating_pass_active(v_email),
		'eating_pass_strikes', public.coin_eating_pass_strikes(v_email),
		'no_shop_today', exists (select 1 from public.coin_no_shop n where n.student_email = v_email
			and n.on_date = public._coin_la_today() and n.cleared_at is null),
		'recent_transactions', v_recent
	);
end;
$$;
revoke all on function public.coin_admin_lookup(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_admin_lookup(text) to authenticated;

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
	if not public._coin_staff() then
		raise exception 'Only coin staff can change a no-shop mark.';
	end if;
	if v_email = '' or v_email not like '%@%' or p_on is null then
		return jsonb_build_object('ok', false, 'reason', 'invalid');
	end if;
	if not public._coin_student_in_scope(v_email) then
		return jsonb_build_object('ok', false, 'reason', 'out_of_scope');
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

create or replace function public.coin_debt_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can read the debt list.';
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
			where public._coin_student_in_scope(b.student_email)
		) d
	), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_debt_list() from public, anon, authenticated, service_role;
grant execute on function public.coin_debt_list() to authenticated;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE NARROWING SWEEP =====
--
-- Every public coin_* function that still names public.is_admin() is a
-- full-coin-admin function now. The body is read back off the catalog and the
-- one term replaced; nothing is retyped. Grants survive (create or replace
-- keeps the ACL). Re-runnable: a narrowed body no longer matches.
do $sweep$
declare
	r record;
	v_def text;
	v_n integer := 0;
begin
	for r in
		select p.oid, p.oid::regprocedure::text as sig
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname like 'coin\_%' and p.prokind = 'f'
			and p.prosrc like '%public.is_admin()%'
	loop
		v_def := pg_get_functiondef(r.oid);
		v_def := replace(v_def, 'public.is_admin()', 'public._coin_full_staff()');
		execute v_def;
		v_n := v_n + 1;
	end loop;
	raise notice '0244: % coin function(s) narrowed from is_admin() to _coin_full_staff().', v_n;
end
$sweep$;
-- ===== PART C END =====

do $chk$
declare
	r record;
	v_n integer;
begin
	select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname like 'coin\_%' and p.prosrc like '%public.is_admin()%';
	if v_n <> 0 then
		raise exception '0244: % coin function(s) still gate on is_admin().', v_n;
	end if;
	for r in
		select p.oid::regprocedure::text as sig
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname in ('coin_staff_scope', 'coin_full_admin_set', 'coin_full_admin_list',
			'coin_fine_sections', 'coin_fine_roster', 'coin_fine_log', 'coin_log_transaction',
			'coin_reverse_transaction', 'coin_admin_lookup', 'coin_no_shop_set', 'coin_debt_list')
			and has_function_privilege('anon', p.oid, 'execute')
	loop
		raise exception '0244: anon must not execute %.', r.sig;
	end loop;
	for r in
		select p.oid::regprocedure::text as sig
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname in ('_coin_full_staff', '_coin_staff', '_coin_scope_sections',
			'_coin_section_in_scope', '_coin_student_in_scope')
			and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
	loop
		raise exception '0244: % must be private.', r.sig;
	end loop;
	raise notice '0244: coin staff scope in place. % full coin admin(s) listed beside the owner.',
		(select count(*) from public.coin_full_admins);
end
$chk$;
