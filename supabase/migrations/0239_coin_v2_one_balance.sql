-- 0239_coin_v2_one_balance.sql
--
-- IDEA COIN V2, PART ONE (ledger 0383): ONE BALANCE, AND IT IS DIGITAL.
--
-- Mr. Pina's V2 (docs/coin-economy/IDEA_COIN_V2.md): physical coins become
-- untracked cash. The digital balance is the only number a student has.
-- Physical rows stay in the history and stop counting toward anything.
--
-- WHAT THIS FILE DOES
--   1. Widens every coin amount to numeric(12,2) (fractional coins). The one
--      view over the column (coin_balances) is dropped and recreated.
--   2. _coin_balance answers the DIGITAL sum for p_medium null, which is now
--      what "the balance" means everywhere. Physical rows are history.
--   3. _coin_insert takes a numeric amount and an optional actor ('system' for
--      every automatic row), and defaults to digital.
--   4. Every public coin logger is rewritten: numeric amounts, digital only,
--      and the V2 debt rule (a purchase is refused before any charge unless
--      the balance AFTER it is zero or more; fines and awards post at any
--      balance).
--   5. The public Ledger projections answer the balance and nothing else.
--   6. Song approval obeys the same purchase rule (0145 allowed an overdraw).
--   7. Tournament results stop minting coins (session two adds the transfer).
--   8. The categories: an explanation column, the fine button merges, the V2
--      default prices, and a `reversal` category for Undo.
--   9. The settings table and the no-shop record the later parts read.
--
-- THE SIGNATURE TRAP. Every function whose argument TYPES change (an integer
-- amount becoming numeric) is dropped at its exact old signature first, so no
-- second overload survives. Parameters a deployed client names keep their
-- names (p_medium included), so a PostgREST call resolves to the new form; a
-- medium other than digital is now REFUSED with a sentence.
--
-- NOTHING IS CONVERTED. The starting balance is the old digital balance. No
-- conversion row is written.
--
-- UNDO: re-run the 0096, 0103, 0107, 0145 and 0212 bodies of the functions
-- re-created here, recreate 0096's coin_balances view, and widen nothing back
-- (a numeric column holding whole numbers is harmless). The settings and
-- no-shop tables can be dropped; nothing else references them.

-- ===== PART A BEGIN =====
-- ===== PART A: FRACTIONAL AMOUNTS =====

drop view if exists public.coin_balances;

do $a$
begin
	if (select data_type from information_schema.columns
		where table_schema = 'public' and table_name = 'coin_transactions' and column_name = 'amount') <> 'numeric' then
		alter table public.coin_transactions alter column amount type numeric(12,2);
	end if;
	if (select data_type from information_schema.columns
		where table_schema = 'public' and table_name = 'coin_categories' and column_name = 'amount') <> 'numeric' then
		alter table public.coin_categories alter column amount type numeric(12,2);
		alter table public.coin_categories alter column min_amount type numeric(12,2);
		alter table public.coin_categories alter column max_amount type numeric(12,2);
	end if;
end
$a$;

-- THE BALANCE IS THE DIGITAL SUM. The view keeps its column names so every
-- reader still resolves; `balance` is the digital sum and the two medium
-- columns stay only as history for a reader that has not been redeployed.
create view public.coin_balances
with (security_invoker = true) as
select
	student_email,
	coalesce(sum(amount) filter (where medium = 'digital'), 0)::numeric(12,2) as balance,
	coalesce(sum(amount) filter (where medium = 'physical'), 0)::numeric(12,2) as physical_balance,
	coalesce(sum(amount) filter (where medium = 'digital'), 0)::numeric(12,2) as digital_balance,
	max(created_at) as last_activity_at,
	count(*)::integer as transaction_count
from public.coin_transactions
group by student_email;

revoke all on public.coin_balances from public, anon, authenticated, service_role;
grant select on public.coin_balances to authenticated;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: SETTINGS, NO-SHOP, AND THE CATEGORY COLUMNS =====
--
-- coin_settings is one row per named value, edited only through 0240's
-- admin functions, every change written to coin_settings_audit. No client
-- grant on either: the reads go through definer functions.

create table if not exists public.coin_settings (
	key text primary key check (key ~ '^[a-z0-9_:]+$' and char_length(key) <= 80),
	value jsonb not null,
	updated_by text not null default 'system',
	updated_at timestamptz not null default now()
);
alter table public.coin_settings enable row level security;
revoke all on table public.coin_settings from public, anon, authenticated, service_role;

create table if not exists public.coin_settings_audit (
	id bigserial primary key,
	key text not null,
	old_value jsonb,
	new_value jsonb,
	changed_by text not null,
	changed_at timestamptz not null default now()
);
alter table public.coin_settings_audit enable row level security;
revoke all on table public.coin_settings_audit from public, anon, authenticated, service_role;
revoke all on sequence public.coin_settings_audit_id_seq from public, anon, authenticated, service_role;

-- NO SHOP TODAY: one row per student per school day (America/Los_Angeles).
-- Written by the Shop Safety fine and by an admin; cleared by stamping
-- cleared_at, never deleted. It lapses by itself: only today's row counts.
create table if not exists public.coin_no_shop (
	student_email text not null check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	on_date date not null,
	reason text check (reason is null or char_length(reason) <= 300),
	source_transaction_id uuid,
	set_by text not null,
	created_at timestamptz not null default now(),
	cleared_at timestamptz,
	cleared_by text,
	primary key (student_email, on_date)
);
alter table public.coin_no_shop enable row level security;
revoke all on table public.coin_no_shop from public, anon, authenticated, service_role;

alter table public.coin_categories add column if not exists explanation text;
do $b$
begin
	if not exists (select 1 from pg_catalog.pg_constraint where conname = 'coin_categories_explanation_len') then
		alter table public.coin_categories add constraint coin_categories_explanation_len
			check (explanation is null or char_length(explanation) <= 1500);
	end if;
end
$b$;

-- The school's day, once. Every "today" in V2 asks this.
create or replace function public._coin_la_today(p_at timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
	select (p_at at time zone 'America/Los_Angeles')::date;
$$;
revoke all on function public._coin_la_today(timestamptz) from public, anon, authenticated, service_role;

-- One setting, or the fallback. Private.
create or replace function public._coin_setting(p_key text, p_fallback jsonb default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce((select s.value from public.coin_settings s where s.key = p_key), p_fallback);
$$;
revoke all on function public._coin_setting(text, jsonb) from public, anon, authenticated, service_role;

-- The defaults. Seeded once: a key that exists is never overwritten, so a
-- re-paste of this file cannot undo an admin's edit.
do $seed$
declare
	v_defaults jsonb := jsonb_build_object(
		'autopay_paused', false,
		'autopay_start', '2026-10-12',
		'highest_grade_weeks', 2,
		'highest_grade_anchor', '2026-10-12',
		'semesters', jsonb_build_array(
			jsonb_build_object('key', '2026-fall', 'start', '2026-08-17', 'end', '2026-12-18'),
			jsonb_build_object('key', '2027-spring', 'start', '2027-01-05', 'end', '2027-06-03')
		),
		'no_pay_weeks', jsonb_build_array('2026-11-23', '2026-12-21', '2026-12-28', '2027-03-29'),
		'no_pay_after', '2027-06-04',
		'hall_pass_warn_minutes', 10,
		'hall_pass_fine_minutes', 20,
		'fine_buttons', jsonb_build_array(
			'shop_safety_violation', 'coin_theft', 'classmate_trust_violation', 'eating_violation',
			'leaving_without_permission', 'property_damage', 'disruptive_behavior', 'printer_not_reset',
			'off_task_device_use', 'inappropriate_screen_content', 'classroom_standards_violation'
		),
		'extra_credit_cap_percent', 2,
		'pay_raise_cost_per_tier', 100,
		'print_grams_per_coin', 10,
		'property_damage_careless_base', 3,
		'property_damage_dollars_per_coin', 0.25,
		'student_actions_per_minute', 10
	);
	v_key text;
begin
	for v_key in select jsonb_object_keys(v_defaults) loop
		insert into public.coin_settings (key, value, updated_by)
		values (v_key, v_defaults -> v_key, 'system')
		on conflict (key) do nothing;
	end loop;
end
$seed$;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE CATALOGUE =====
--
-- Run ONCE (guarded by the `v2_catalogue_applied` setting) so a re-paste
-- cannot overwrite prices an admin has since edited. Every merged category
-- is set inactive, never deleted, so its history keeps its name.

do $cat$
begin
	if exists (select 1 from public.coin_settings where key = 'v2_catalogue_applied') then
		raise notice '0239: the V2 catalogue was already applied; categories left as they are.';
		return;
	end if;

	insert into public.coin_categories
		(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label,
		 formula_key, semester_point_cap, cap_period, cap_count, loggable, active, sort_order, notes)
	values
		('inappropriate_screen_content', 'Inappropriate Screen Content', 'fine', 'core', 'flat',
		 2, null, null, null, null, null, null, null, true, true, 112,
		 'V2: anything not school-appropriate on screen, including an unapproved background.'),
		('reversal', 'Reversal (Undo)', 'adjustment', 'core', 'variable',
		 null, null, null, null, null, null, null, null, false, true, 305,
		 'System only: posted by Undo and by an admin reversal. Cancels exactly one earlier row; meta.reverses names it.')
	on conflict (id) do nothing;

	update public.coin_categories set name = 'Shop Safety', amount = 12 where id = 'shop_safety_violation';
	update public.coin_categories set active = false where id in ('shop_not_cleaned_up', 'mint_tampering_known', 'unauthorized_printing');
	update public.coin_categories set name = 'Coin Integrity', amount = 12 where id = 'coin_theft';
	update public.coin_categories set name = 'Classmate Trust', amount = 5 where id = 'classmate_trust_violation';
	update public.coin_categories set name = 'Eating', amount = 5 where id = 'eating_violation';
	update public.coin_categories set name = 'Left Without Permission', amount = 5 where id = 'leaving_without_permission';
	update public.coin_categories set name = 'Disruptive', amount = 3 where id = 'disruptive_behavior';
	update public.coin_categories set name = 'Printer Not Reset', amount = 3 where id = 'printer_not_reset';
	update public.coin_categories set name = 'Off-Task', amount = 2 where id = 'off_task_device_use';
	update public.coin_categories set name = 'Classroom Standards', amount = 1 where id = 'classroom_standards_violation';
	update public.coin_categories set name = 'Long Hall Pass' where id = 'long_bathroom_break';
	update public.coin_categories set name = 'Property Damage (First Accident)', amount = 0 where id = 'property_damage_first_accident';
	update public.coin_categories set name = 'Property Damage (Repeat Accident)', amount = 5 where id = 'property_damage_repeat_accident';

	update public.coin_categories set name = 'Highest Grade in Section', amount = 2 where id = 'highest_grade_weekly';
	update public.coin_categories set amount = 2 where id in ('quality_desktop_background', 'weekly_role_stipend', 'song_request');
	update public.coin_categories set active = false where id in ('platform_cosmetic_unlock', 'text_printing', 'physical_coin_submission');
	update public.coin_categories set loggable = false where id = 'coin_payout';

	insert into public.coin_settings (key, value, updated_by)
	values ('v2_catalogue_applied', to_jsonb(now()), 'system')
	on conflict (key) do nothing;
end
$cat$;

-- THE EXPLANATIONS. Written once each, only where none is set yet, so an
-- admin's own wording survives a re-paste.
do $exp$
declare
	v_texts jsonb := jsonb_build_object(
		'shop_safety_violation', 'Breaking a shop safety rule, or leaving the shop without cleaning up. Costs 12 coins. You are also not allowed in the shop for the rest of that school day. It can happen again any day.',
		'coin_theft', 'Taking coins that are not yours, or tampering with the coin mint when you are the known suspect. Costs 12 coins each time.',
		'classmate_trust_violation', 'Framing a classmate, or tampering with a classmate''s computer or work. Costs 5 coins each time.',
		'eating_violation', 'Eating in class without an Eating Pass, or breaking the Eating Pass rules. Costs 5 coins each time. If you hold a pass, each one is also a strike, and a third strike since you bought the pass cancels it.',
		'leaving_without_permission', 'Leaving the room with no signal at all. Tapping the hall pass counts as permission. Costs 5 coins each time.',
		'property_damage_first_accident', 'Your first accidental damage to class property this semester. It is logged but costs nothing.',
		'property_damage_repeat_accident', 'A second or later accident that damages class property in the same semester. Costs 5 coins each time.',
		'property_damage_careless', 'Damage to class property from careless use. Costs 3 coins plus 1 coin for every 25 cents of repair or replacement cost.',
		'disruptive_behavior', 'Outbursts, arguing, or anything else that disrupts class. Costs 3 coins each time.',
		'printer_not_reset', 'Leaving a 3D printer, or its flash drive, not ready for the next person. Costs 3 coins each time.',
		'off_task_device_use', 'Using a device for something other than class work, or printing without permission. Costs 2 coins each time.',
		'inappropriate_screen_content', 'Anything on your screen that is not school appropriate, including a desktop background that was not approved. Costs 2 coins, and it is charged again each time it is seen until it is fixed.',
		'classroom_standards_violation', 'Not following classroom standards: seating, furniture, tidiness and similar. Costs 1 coin each time.',
		'long_bathroom_break', 'A hall pass that lasts 20 minutes or more. It is charged automatically when the pass ends, once per pass. At 10 minutes the pass is marked with a warning, which costs nothing. A pass your teacher opened or closed is never charged.',
		'mint_tampering_unknown', 'Tampering with the coin mint when nobody knows who did it. Logged for the record. It costs no single student anything.',
		'weekly_wage', 'Paid automatically for every school week you are enrolled in a class with the coin economy on. Your wage is 1 coin times your wage tier. Weeks with no school do not pay.',
		'highest_grade_weekly', 'Paid automatically to the student or students with the highest grade in each class at the end of every two-week period. Your grade here is your returned work this semester, without extra credit. Ties are all paid. Pays 2 coins each time.',
		'perfect_score_graded_work', 'Paid automatically when your teacher returns work with a full score on an assignment marked for this award. You get 1 coin for every 25 points the work is worth, at least 1. Extra credit does not count toward the full score. If the score is later lowered, the award is taken back; if it goes back to full, it is paid again.',
		'quality_desktop_background', 'Awarded for a quality desktop background your teacher approves. 2 coins, at most once a month.',
		'above_and_beyond', 'Awarded when you go above and beyond what was asked. 1 to 3 coins, decided by your teacher.',
		'weekly_role_stipend', 'Paid every two weeks to students who hold a class role. 2 coins each time. It is separate from your wage and a pay raise does not change it.',
		'donate_supplies_small', 'Awarded for donating a small amount of supplies, about 1 to 5 dollars. 1 coin.',
		'donate_supplies_medium', 'Awarded for donating supplies worth about 5 to 15 dollars. 3 coins.',
		'donate_supplies_large', 'Awarded for donating supplies worth 15 dollars or more. The amount is set when it is logged.',
		'correct_answer_in_class', 'Awarded for a correct answer in class. 1 coin, at most once a day.',
		'contract_completion', 'Paid when a contract you claimed is completed. The contract''s payout is split evenly between everyone who claimed it.',
		'competition_winnings', 'Coins won in a competition or tournament. Mr. Pina awards these after the event.',
		'debt_payment', 'Physical coins you hand back to pay down a negative balance. Each coin handed over adds 1 coin to your balance.',
		'eating_pass', 'Lets you eat in class following the Eating Pass rules. Costs 150 coins. You can buy it yourself if your balance stays at zero or more and you do not already hold one. A third eating strike cancels it.',
		'extra_credit', 'Buy extra credit points on your own returned work. Costs 2 coins per point. Each class caps your purchases at 2 percent of that class''s total points this semester. Bought points do not count toward Highest Grade or Perfect Score.',
		'three_d_printing', 'Pay for a 3D print. Enter the weight in grams your slicer reports (material HIPS, generic ABS profile). The price is 1 coin per 10 grams, rounded. Print time is never charged.',
		'song_request', 'Request a song in class. Costs 2 coins when your teacher approves it. It is only approved if your balance stays at zero or more.',
		'pay_raise', 'Raise your wage tier by 1. Costs 100 coins times your current tier. It raises your weekly wage only, never a role stipend.'
	);
	v_id text;
begin
	for v_id in select jsonb_object_keys(v_texts) loop
		update public.coin_categories
		set explanation = v_texts ->> v_id
		where id = v_id and explanation is null;
	end loop;
end
$exp$;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: THE BALANCE AND THE ROW SHAPE =====

drop function if exists public._coin_balance(text, text);

-- THE BALANCE IS THE DIGITAL SUM. p_medium null (the balance) and 'digital'
-- answer the same number. 'physical' still answers the physical history sum
-- for a reader that asks for it by name; nothing in V2 does.
create or replace function public._coin_balance(p_email text, p_medium text default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(sum(t.amount), 0)::numeric(12,2)
	from public.coin_transactions t
	where t.student_email = lower(btrim(coalesce(p_email, '')))
		and t.medium = coalesce(nullif(lower(btrim(coalesce(p_medium, ''))), ''), 'digital');
$$;
revoke all on function public._coin_balance(text, text) from public, anon, authenticated, service_role;

drop function if exists public._coin_insert(text, text, integer, numeric, text, jsonb, text, uuid);

-- p_actor null stamps the caller (current_user_email()); 'system' is what
-- every automatic row carries, so a classmate whose page load triggered a
-- check is never recorded as the actor.
create or replace function public._coin_insert(
	p_email text,
	p_category_id text,
	p_signed_amount numeric,
	p_quantity numeric,
	p_note text,
	p_meta jsonb,
	p_medium text default 'digital',
	p_transfer_id uuid default null,
	p_actor text default null
)
returns public.coin_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_row public.coin_transactions;
	v_medium text := lower(btrim(coalesce(p_medium, 'digital')));
	v_actor text := coalesce(nullif(btrim(coalesce(p_actor, '')), ''), public.current_user_email());
begin
	if v_medium not in ('physical', 'digital') then
		raise exception 'Coin medium must be "physical" or "digital" (got "%").', p_medium;
	end if;
	if v_actor is null or v_actor = '' then
		v_actor := 'system';
	end if;
	insert into public.coin_transactions
		(student_email, category_id, amount, quantity, note, meta, actor_email, semester_key, medium, transfer_id)
	values
		(p_email, p_category_id, round(p_signed_amount, 2), p_quantity, p_note,
		 coalesce(p_meta, '{}'::jsonb), v_actor, public.coin_semester_key(),
		 v_medium, p_transfer_id)
	returning * into v_row;
	return v_row;
end;
$$;
revoke all on function public._coin_insert(text, text, numeric, numeric, text, jsonb, text, uuid, text)
	from public, anon, authenticated, service_role;

-- A row that a reversal has cancelled. One definition, read by the strike
-- count, the pass check and every history that collapses undone pairs.
create or replace function public._coin_is_reversed(p_txn_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.coin_transactions r
		where r.category_id = 'reversal' and r.meta ->> 'reverses' = p_txn_id::text
	);
$$;
revoke all on function public._coin_is_reversed(uuid) from public, anon, authenticated, service_role;

create unique index if not exists coin_transactions_one_reversal
	on public.coin_transactions ((meta ->> 'reverses'))
	where category_id = 'reversal';

-- The medium a V2 writer accepts: digital, or nothing (which is digital).
create or replace function public._coin_digital_only(p_medium text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
	if p_medium is not null and lower(btrim(p_medium)) not in ('', 'digital') then
		raise exception 'IDEA Coins are digital only now. Reload the page to get the current Coin Desk.';
	end if;
	return 'digital';
end;
$$;
revoke all on function public._coin_digital_only(text) from public, anon, authenticated, service_role;

-- The bulk loggers' resolver keeps its name and shape and now admits only
-- digital, for the run and for every override.
create or replace function public._coin_normalize_media(p_medium text, p_overrides jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_key text;
	v_val text;
begin
	perform public._coin_digital_only(p_medium);
	if p_overrides is not null and jsonb_typeof(p_overrides) = 'object' then
		for v_key, v_val in select key, value #>> '{}' from jsonb_each(p_overrides) loop
			perform public._coin_digital_only(v_val);
		end loop;
	end if;
	return jsonb_build_object('run', 'digital', 'overrides', '{}'::jsonb);
end;
$$;
revoke all on function public._coin_normalize_media(text, jsonb) from public, anon, authenticated, service_role;

-- Eating Pass state ignores reversed rows: an undone purchase is no pass and
-- an undone violation is no strike.
create or replace function public.coin_eating_pass_active(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		(
			select t.category_id = 'eating_pass'
			from public.coin_transactions t
			where t.student_email = lower(btrim(p_email))
				and t.category_id in ('eating_pass', 'eating_pass_revoked')
				and not public._coin_is_reversed(t.id)
			order by t.created_at desc, t.id desc
			limit 1
		),
		false
	);
$$;

create or replace function public.coin_eating_pass_strikes(p_email text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
	select count(*)::integer
	from public.coin_transactions t
	where t.student_email = lower(btrim(p_email))
		and t.category_id = 'eating_violation'
		and (t.meta ->> 'strike')::boolean is true
		and not public._coin_is_reversed(t.id)
		and t.created_at >= coalesce(
			(
				select max(t2.created_at)
				from public.coin_transactions t2
				where t2.student_email = lower(btrim(p_email)) and t2.category_id = 'eating_pass'
					and not public._coin_is_reversed(t2.id)
			),
			'-infinity'::timestamptz
		);
$$;
-- ===== PART D END =====

-- ===== PART E BEGIN =====
-- ===== PART E: THE GENERIC LOGGER =====

drop function if exists public.coin_log_transaction(text, text, integer, numeric, text, text);

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
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	perform public._coin_digital_only(p_medium);

	select * into v_cat from public.coin_categories where id = p_category_id;
	if v_cat.id is null then
		raise exception 'Unknown coin category "%".', p_category_id;
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

	-- THE V2 PURCHASE RULE: refused before any charge unless the balance
	-- after the purchase is zero or more. Fines and awards post at any balance.
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

	-- SHOP SAFETY BARS THE SHOP FOR THE REST OF THE SCHOOL DAY.
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
revoke all on function public.coin_log_transaction(text, text, numeric, numeric, text, text)
	from public, anon, authenticated, service_role;
grant execute on function public.coin_log_transaction(text, text, numeric, numeric, text, text) to authenticated;

drop function if exists public.coin_admin_adjust_balance(text, integer, text, text);
create or replace function public.coin_admin_adjust_balance(
	p_email text,
	p_amount numeric,
	p_note text,
	p_medium text default 'digital'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	return public.coin_log_transaction(
		lower(btrim(coalesce(p_email, ''))), 'balance_correction', p_amount, null, p_note, p_medium
	);
end;
$$;
revoke all on function public.coin_admin_adjust_balance(text, numeric, text, text)
	from public, anon, authenticated, service_role;
grant execute on function public.coin_admin_adjust_balance(text, numeric, text, text) to authenticated;
-- ===== PART E END =====

-- ===== PART F BEGIN =====
-- ===== PART F: THE FORMULA LOGGERS (admin) =====
-- Same signatures as 0096, so no drop; the medium default moves to digital
-- and anything else is refused.

create or replace function public.coin_log_perfect_score(
	p_email text,
	p_points integer,
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
	v_magnitude numeric;
	v_row public.coin_transactions;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	perform public._coin_digital_only(p_medium);
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

-- The Pay Raise rule, once: cost and new tier for a student. Read by the admin
-- logger and the student purchase alike.
create or replace function public._coin_pay_raise_quote(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	with t as (
		select greatest(coalesce((select w.tier from public.coin_wage_tiers w
			where w.student_email = lower(btrim(p_email))), 1), 1) as tier
	)
	select jsonb_build_object(
		'tier', t.tier,
		'new_tier', t.tier + 1,
		'cost', round(coalesce((public._coin_setting('pay_raise_cost_per_tier') #>> '{}')::numeric, 100) * t.tier, 2),
		'wage_now', round(coalesce((select c.amount from public.coin_categories c where c.id = 'weekly_wage'), 1) * t.tier, 2),
		'wage_after', round(coalesce((select c.amount from public.coin_categories c where c.id = 'weekly_wage'), 1) * (t.tier + 1), 2)
	)
	from t;
$$;
revoke all on function public._coin_pay_raise_quote(text) from public, anon, authenticated, service_role;

-- The raise itself, after every check. Private; the two callers are the admin
-- logger below and 0241's student purchase.
create or replace function public._coin_apply_pay_raise(p_email text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_tier integer;
	v_cost numeric;
	v_balance numeric;
	v_row public.coin_transactions;
begin
	insert into public.coin_wage_tiers (student_email) values (v_email) on conflict (student_email) do nothing;
	select tier into v_tier from public.coin_wage_tiers where student_email = v_email for update;
	v_tier := greatest(coalesce(v_tier, 1), 1);
	v_cost := round(coalesce((public._coin_setting('pay_raise_cost_per_tier') #>> '{}')::numeric, 100) * v_tier, 2);
	v_balance := public._coin_balance(v_email);
	if v_balance - v_cost < 0 then
		return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance, 'cost', v_cost);
	end if;
	v_row := public._coin_insert(
		v_email, 'pay_raise', -v_cost, null, nullif(btrim(coalesce(p_note, '')), ''),
		jsonb_build_object('previous_tier', v_tier, 'new_tier', v_tier + 1, 'cost', v_cost), 'digital'
	);
	update public.coin_wage_tiers set tier = v_tier + 1, updated_at = now() where student_email = v_email;
	return jsonb_build_object('ok', true, 'transaction_id', v_row.id, 'previous_tier', v_tier,
		'new_tier', v_tier + 1, 'cost', v_cost, 'medium', 'digital', 'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public._coin_apply_pay_raise(text, text) from public, anon, authenticated, service_role;

create or replace function public.coin_log_pay_raise(
	p_email text,
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
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	perform public._coin_digital_only(p_medium);
	if not exists (select 1 from public.coin_categories where id = 'pay_raise' and active) then
		raise exception 'The Pay Raise category is not configured.';
	end if;
	return public._coin_apply_pay_raise(v_email, p_note);
end;
$$;

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
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
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

-- 3D printing is by weight only: round-half-up(grams / grams per coin).
-- The hours and overnight arguments stay so a deployed client still resolves,
-- and are recorded but never charged.
create or replace function public._coin_print_price(p_grams numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
	select round(p_grams / greatest(coalesce((public._coin_setting('print_grams_per_coin') #>> '{}')::numeric, 10), 0.01));
$$;
revoke all on function public._coin_print_price(numeric) from public, anon, authenticated, service_role;

create or replace function public.coin_log_three_d_printing(
	p_email text,
	p_grams numeric,
	p_hours numeric,
	p_overnight boolean default false,
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
	v_magnitude numeric;
	v_balance numeric;
	v_row public.coin_transactions;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	perform public._coin_digital_only(p_medium);
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

create or replace function public.coin_log_extra_credit(
	p_email text,
	p_points integer,
	p_grading_category text,
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
	v_grading text := lower(btrim(coalesce(p_grading_category, '')));
	v_cost numeric;
	v_balance numeric;
	v_row public.coin_transactions;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	perform public._coin_digital_only(p_medium);
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
-- ===== PART F END =====

-- ===== PART G BEGIN =====
-- ===== PART G: PAYOUT, BULK, LOOKUP =====

drop function if exists public.coin_payout_student(text, text, integer);

-- THE PAYOUT TRANSFER STAYS: a digital debit and a physical credit sharing one
-- transfer id. The physical half is history; the debit now really lowers the
-- one balance, which is what handing coins over means in V2.
create or replace function public.coin_payout_student(
	p_email text,
	p_note text default null,
	p_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_balance numeric;
	v_amount numeric;
	v_transfer uuid := gen_random_uuid();
	v_note text := coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Coin payout.');
	v_meta jsonb;
	v_debit public.coin_transactions;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	v_balance := public._coin_balance(v_email);
	if v_balance <= 0 then
		return jsonb_build_object('ok', false, 'reason', 'no_balance', 'balance', v_balance);
	end if;
	v_amount := round(coalesce(p_amount, v_balance), 2);
	if v_amount <= 0 then
		raise exception 'A payout amount must be positive.';
	end if;
	if v_amount > v_balance then
		return jsonb_build_object('ok', false, 'reason', 'amount_exceeds_digital',
			'requested', v_amount, 'balance', v_balance);
	end if;
	v_meta := jsonb_build_object('transfer_id', v_transfer::text, 'transfer_amount', v_amount);
	v_debit := public._coin_insert(
		v_email, 'coin_payout', -v_amount, null, v_note,
		v_meta || jsonb_build_object('transfer_side', 'digital_debit'), 'digital', v_transfer
	);
	perform public._coin_insert(
		v_email, 'payout_physical_credit', v_amount, null, v_note,
		v_meta || jsonb_build_object('transfer_side', 'physical_credit'), 'physical', v_transfer
	);
	return jsonb_build_object('ok', true, 'transaction_id', v_debit.id, 'transfer_id', v_transfer,
		'amount', v_amount, 'partial', p_amount is not null and p_amount < v_balance,
		'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.coin_payout_student(text, text, numeric) from public, anon, authenticated, service_role;
grant execute on function public.coin_payout_student(text, text, numeric) to authenticated;

create or replace function public.coin_bulk_payout(p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_student record;
	v_call jsonb;
	v_results jsonb := '[]'::jsonb;
	v_total integer := 0;
	v_succeeded integer := 0;
	v_refused integer := 0;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	for v_student in
		select student_email from public.coin_transactions
		group by student_email
		having coalesce(sum(amount) filter (where medium = 'digital'), 0) > 0
		order by student_email
	loop
		v_total := v_total + 1;
		begin
			v_call := public.coin_payout_student(v_student.student_email, p_note);
		exception when others then
			v_call := jsonb_build_object('ok', false, 'reason', 'error', 'message', sqlerrm);
		end;
		if coalesce((v_call ->> 'ok')::boolean, false) then
			v_succeeded := v_succeeded + 1;
		else
			v_refused := v_refused + 1;
		end if;
		v_results := v_results || jsonb_build_array(jsonb_build_object('email', v_student.student_email) || v_call);
	end loop;
	return jsonb_build_object('ok', true, 'total', v_total, 'succeeded', v_succeeded,
		'refused', v_refused, 'results', v_results);
end;
$$;
revoke all on function public.coin_bulk_payout(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_bulk_payout(text) to authenticated;

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
	if not public.is_admin() then
		raise exception 'Only site admins can look up IDEA Coin balances.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid email.';
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

-- The bulk loggers: numeric amounts, digital only. Parameter names kept.
drop function if exists public.coin_bulk_log_students(text[], text, integer, text, text, jsonb);
create or replace function public.coin_bulk_log_students(
	p_emails text[],
	p_category_id text,
	p_amount numeric default null,
	p_note text default null,
	p_medium text default 'digital',
	p_medium_overrides jsonb default '{}'::jsonb
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
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	perform public._coin_normalize_media(p_medium, p_medium_overrides);
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
			v_call := public.coin_log_transaction(v_email, v_cat.id, p_amount, null, p_note, 'digital');
		exception when others then
			v_call := jsonb_build_object('ok', false, 'reason', 'error', 'message', sqlerrm);
		end;
		if coalesce((v_call ->> 'ok')::boolean, false) then
			v_succeeded := v_succeeded + 1;
		else
			v_refused := v_refused + 1;
		end if;
		v_results := v_results || jsonb_build_array(jsonb_build_object('email', v_email, 'medium', 'digital') || v_call);
	end loop;

	return jsonb_build_object('ok', true, 'category_id', v_cat.id, 'medium', 'digital',
		'unmatched_overrides', '[]'::jsonb, 'total', v_total, 'succeeded', v_succeeded,
		'refused', v_refused, 'results', v_results);
end;
$$;
revoke all on function public.coin_bulk_log_students(text[], text, numeric, text, text, jsonb)
	from public, anon, authenticated, service_role;
grant execute on function public.coin_bulk_log_students(text[], text, numeric, text, text, jsonb) to authenticated;

drop function if exists public.coin_bulk_log_section(text, text, integer, text, text, jsonb);
create or replace function public.coin_bulk_log_section(
	p_section_id text,
	p_category_id text,
	p_amount numeric default null,
	p_note text default null,
	p_medium text default 'digital',
	p_medium_overrides jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_section text := lower(nullif(btrim(coalesce(p_section_id, '')), ''));
	v_emails text[];
	v_result jsonb;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_section is null then
		raise exception 'Choose a section.';
	end if;
	if not exists (select 1 from public.coin_sections where id = v_section) then
		raise exception 'Unknown coin section "%".', v_section;
	end if;
	select coalesce(array_agg(student_email order by student_email), array[]::text[]) into v_emails
	from public.coin_section_students where section_id = v_section;
	v_result := public.coin_bulk_log_students(v_emails, p_category_id, p_amount, p_note, p_medium, p_medium_overrides);
	return v_result || jsonb_build_object('section_id', v_section);
end;
$$;
revoke all on function public.coin_bulk_log_section(text, text, numeric, text, text, jsonb)
	from public, anon, authenticated, service_role;
grant execute on function public.coin_bulk_log_section(text, text, numeric, text, text, jsonb) to authenticated;

create or replace function public.coin_bulk_log_role_stipend(
	p_role_id text default null,
	p_section_id text default null,
	p_note text default null,
	p_medium text default 'digital',
	p_medium_overrides jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_holder record;
	v_call jsonb;
	v_results jsonb := '[]'::jsonb;
	v_total integer := 0;
	v_succeeded integer := 0;
	v_refused integer := 0;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	perform public._coin_normalize_media(p_medium, p_medium_overrides);
	if not exists (select 1 from public.coin_categories where id = 'weekly_role_stipend' and active) then
		raise exception 'The Weekly Role Stipend category is not configured.';
	end if;
	if p_role_id is not null and not exists (select 1 from public.coin_role_definitions where id = p_role_id) then
		raise exception 'Unknown coin role "%".', p_role_id;
	end if;
	if p_section_id is not null and not exists (select 1 from public.coin_sections where id = p_section_id) then
		raise exception 'Unknown coin section "%".', p_section_id;
	end if;
	for v_holder in
		select distinct student_email from public.coin_role_holders
		where revoked_at is null
			and (expires_at is null or expires_at > now())
			and (p_role_id is null or role_id = p_role_id)
			and (p_section_id is null or section_id = p_section_id)
		order by student_email
	loop
		v_total := v_total + 1;
		begin
			v_call := public.coin_log_transaction(v_holder.student_email, 'weekly_role_stipend', null, null, v_note, 'digital');
		exception when others then
			v_call := jsonb_build_object('ok', false, 'reason', 'error', 'message', sqlerrm);
		end;
		if coalesce((v_call ->> 'ok')::boolean, false) then
			v_succeeded := v_succeeded + 1;
		else
			v_refused := v_refused + 1;
		end if;
		v_results := v_results || jsonb_build_array(jsonb_build_object('email', v_holder.student_email, 'medium', 'digital') || v_call);
	end loop;
	return jsonb_build_object('ok', true, 'role_id', p_role_id, 'section_id', p_section_id, 'medium', 'digital',
		'unmatched_overrides', '[]'::jsonb, 'total', v_total, 'succeeded', v_succeeded,
		'refused', v_refused, 'results', v_results);
end;
$$;
revoke all on function public.coin_bulk_log_role_stipend(text, text, text, text, jsonb)
	from public, anon, authenticated, service_role;
grant execute on function public.coin_bulk_log_role_stipend(text, text, text, text, jsonb) to authenticated;
-- ===== PART G END =====

-- ===== PART H BEGIN =====
-- ===== PART H: THE PUBLIC LEDGER =====
--
-- THE ABSOLUTE RULE OF 0089 HOLDS: no email, in any form, through any
-- parameter or field. The roster now takes a student's section from IDEA
-- Classroom (active, non-manager enrollment in a section whose economy is on),
-- falling back to the old coin section for a student no class lists.

alter table public.classroom_sections add column if not exists coin_economy_on boolean not null default true;

-- One label for a classroom section on the Ledger: the course code, then the
-- section's own label.
create or replace function public._coin_classroom_section_label(p_section_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select btrim(coalesce(nullif(btrim(c.code), ''), c.title, '') || ' ' || s.label)
	from public.classroom_sections s
	join public.classroom_courses c on c.id = s.course_id
	where s.id = p_section_id;
$$;
revoke all on function public._coin_classroom_section_label(uuid) from public, anon, authenticated, service_role;

-- Every active, non-manager enrollment in an economy-on section. THE ONE
-- STATEMENT of "who is in the economy, and in which class". Private.
create or replace function public._coin_economy_enrollments()
returns table (student_email text, section_id uuid, display_name text, enrolled_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
	select e.student_email, e.section_id, e.display_name, e.created_at
	from public.classroom_enrollments e
	join public.classroom_sections s on s.id = e.section_id
	where e.active and s.active and s.coin_economy_on
		and not public._classroom_manages_section_email(e.section_id, e.student_email);
$$;
revoke all on function public._coin_economy_enrollments() from public, anon, authenticated, service_role;

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
		select r.student_email from public.coin_section_students r
		union
		select enr.student_email from enr
	)
	select
		e.email,
		md5((select salt.salt from salt) || e.email),
		coalesce(
			nullif(btrim(cs.display_name), ''),
			nullif(btrim(p.display_name), ''),
			nullif(btrim(p.full_name), ''),
			nullif(btrim(enr.display_name), ''),
			public._coin_public_name_fallback()
		),
		coalesce(
			enr.label,
			nullif(btrim(sec.label), ''),
			nullif(btrim(r.section_id), ''),
			nullif(btrim(cs.legacy_section), '')
		),
		case when enr.label is null then sec.color end
	from emails e
	left join enr on enr.student_email = e.email
	left join public.coin_students cs on cs.student_email = e.email
	left join public.profiles p on lower(p.email) = e.email
	left join public.coin_section_students r on r.student_email = e.email
	left join public.coin_sections sec on sec.id = r.section_id;
$$;
revoke all on function public._coin_public_roster() from public, anon, authenticated, service_role;

create or replace function public.coin_public_sections()
returns table (section text, color text)
language sql
stable
security definer
set search_path = ''
as $$
	select distinct ros.section, null::text
	from public._coin_public_roster() ros
	where ros.section is not null
	order by ros.section;
$$;

drop function if exists public.coin_public_leaderboard();
create or replace function public.coin_public_leaderboard()
returns table (
	student_id text,
	name text,
	section text,
	balance numeric,
	weekly_wage numeric,
	wage_tier integer,
	eating_pass boolean
)
language sql
stable
security definer
set search_path = ''
as $$
	with base as (
		select coalesce(c.amount, 1) as wage_base from public.coin_categories c where c.id = 'weekly_wage'
	),
	totals as (
		select t.student_email as email,
			coalesce(sum(t.amount) filter (where t.medium = 'digital'), 0)::numeric(12,2) as balance
		from public.coin_transactions t
		group by t.student_email
	)
	select
		ros.public_id,
		ros.display_name,
		ros.section,
		coalesce(tt.balance, 0)::numeric(12,2),
		(coalesce((select base.wage_base from base), 1) * greatest(coalesce(w.tier, 1), 1))::numeric(12,2),
		greatest(coalesce(w.tier, 1), 1),
		public.coin_eating_pass_active(ros.student_email)
	from public._coin_public_roster() ros
	left join totals tt on tt.email = ros.student_email
	left join public.coin_wage_tiers w on w.student_email = ros.student_email
	order by coalesce(tt.balance, 0) desc, ros.display_name;
$$;
revoke all on function public.coin_public_leaderboard() from public, anon, authenticated, service_role;
grant execute on function public.coin_public_leaderboard() to anon, authenticated;

-- The public feed: digital rows only (physical rows are history that no
-- longer counts), with the category id so the page keys on an id, never on a
-- name. Reversal pairs are left out entirely.
drop function if exists public.coin_public_transactions(integer);
create or replace function public.coin_public_transactions(p_limit integer default 5000)
returns table (
	occurred_at timestamptz,
	name text,
	amount numeric,
	type text,
	reason text,
	category_id text
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		t.created_at,
		ros.display_name,
		t.amount,
		case
			when t.category_id in ('coin_payout', 'legacy_payout') then 'Payout'
			when cat.kind = 'fine' then 'Fine'
			when cat.kind = 'award' then 'Award'
			when cat.kind = 'purchase' then 'Purchase'
			else 'Adjustment'
		end,
		cat.name,
		t.category_id
	from public.coin_transactions t
	join public.coin_categories cat on cat.id = t.category_id
	join public._coin_public_roster() ros on ros.student_email = t.student_email
	where t.medium = 'digital'
		and t.category_id <> 'reversal'
		and not public._coin_is_reversed(t.id)
	order by t.created_at desc, t.id desc
	limit greatest(1, least(coalesce(p_limit, 5000), 20000));
$$;
revoke all on function public.coin_public_transactions(integer) from public, anon, authenticated, service_role;
grant execute on function public.coin_public_transactions(integer) to anon, authenticated;

create or replace function public.coin_public_student(p_student_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text;
	v_name text;
	v_section text;
	v_tier integer;
	v_wage_base numeric;
	v_history jsonb;
begin
	select ros.student_email, ros.display_name, ros.section
		into v_email, v_name, v_section
		from public._coin_public_roster() ros
		where ros.public_id = lower(btrim(coalesce(p_student_id, '')));
	if v_email is null then
		return jsonb_build_object('ok', false, 'reason', 'unknown_student');
	end if;
	select greatest(coalesce(w.tier, 1), 1) into v_tier from public.coin_wage_tiers w where w.student_email = v_email;
	v_tier := greatest(coalesce(v_tier, 1), 1);
	select coalesce(c.amount, 1) into v_wage_base from public.coin_categories c where c.id = 'weekly_wage';
	select coalesce(jsonb_agg(row_to_json(h)::jsonb order by h.occurred_at desc), '[]'::jsonb)
		into v_history
		from (
			select t.created_at as occurred_at, t.amount, t.category_id,
				case
					when t.category_id in ('coin_payout', 'legacy_payout') then 'Payout'
					when cat.kind = 'fine' then 'Fine'
					when cat.kind = 'award' then 'Award'
					when cat.kind = 'purchase' then 'Purchase'
					else 'Adjustment'
				end as type,
				cat.name as reason
			from public.coin_transactions t
			join public.coin_categories cat on cat.id = t.category_id
			where t.student_email = v_email and t.medium = 'digital'
				and t.category_id <> 'reversal' and not public._coin_is_reversed(t.id)
			order by t.created_at desc, t.id desc
			limit 500
		) h;
	return jsonb_build_object(
		'ok', true,
		'student_id', lower(btrim(coalesce(p_student_id, ''))),
		'name', v_name,
		'section', v_section,
		'balance', public._coin_balance(v_email),
		'wage_tier', v_tier,
		'weekly_wage', coalesce(v_wage_base, 1) * v_tier,
		'eating_pass_held', public.coin_eating_pass_active(v_email),
		'history', v_history
	);
end;
$$;
revoke all on function public.coin_public_student(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_public_student(text) to anon, authenticated;

-- The rules list carries the explanation. Its shape gains one column.
drop function if exists public.coin_public_reasons();
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
		and (c.loggable or c.id in ('weekly_wage', 'highest_grade_weekly', 'perfect_score_graded_work', 'long_bathroom_break'))
		and c.id not in ('coin_payout', 'legacy_award', 'legacy_fine', 'legacy_purchase', 'legacy_payout')
	order by c.kind, c.sort_order, c.name;
$$;
revoke all on function public.coin_public_reasons() from public, anon, authenticated, service_role;
grant execute on function public.coin_public_reasons() to anon, authenticated;
-- ===== PART H END =====

-- ===== PART I BEGIN =====
-- ===== PART I: SONGS AND TOURNAMENTS =====

-- Song approval follows the purchase rule: refused unless the balance after
-- the charge is zero or more. Everything else is 0145's.
create or replace function public.classroom_song_approve(p_request_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_req public.classroom_song_requests;
	v_name text;
	v_price numeric;
	v_balance numeric;
	v_txn public.coin_transactions;
	v_decided timestamptz;
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_request_id is null then
		raise exception 'That request does not exist.';
	end if;
	select * into v_req from public.classroom_song_requests where id = p_request_id for update;
	if v_req.id is null or not public.classroom_manages_section(v_req.section_id) then
		raise exception 'That request does not exist.';
	end if;
	if v_req.decided_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'already_decided', 'request_id', v_req.id,
			'status', public._classroom_song_status(v_req.decided_at, v_req.rejection_reason));
	end if;
	select e.display_name into v_name from public.classroom_enrollments e
	where e.section_id = v_req.section_id and e.student_email = v_req.student_email;
	v_name := coalesce(v_name, v_req.student_email);

	select c.amount into v_price from public.coin_categories c
	where c.id = 'song_request' and c.active and c.kind = 'purchase' and c.pricing_model = 'flat';
	if v_price is null then
		return jsonb_build_object('ok', false, 'reason', 'not_priced', 'request_id', v_req.id, 'student_name', v_name);
	end if;

	v_balance := public._coin_balance(v_req.student_email);
	if v_balance - v_price < 0 then
		return jsonb_build_object('ok', false, 'reason', 'debt', 'request_id', v_req.id,
			'student_email', v_req.student_email, 'student_name', v_name, 'medium', 'digital',
			'balance', v_balance, 'price', v_price);
	end if;

	v_txn := public._coin_insert(v_req.student_email, 'song_request', -v_price, null,
		'Song request approved in class.',
		jsonb_build_object('song_request_id', v_req.id, 'section_id', v_req.section_id), 'digital');

	update public.classroom_song_requests r
	set decided_at = now(), decided_by = v_email, charge_transaction_id = v_txn.id
	where r.id = v_req.id
	returning r.decided_at into v_decided;

	return jsonb_build_object('ok', true, 'request_id', v_req.id, 'section_id', v_req.section_id,
		'status', 'approved', 'decided_at', v_decided, 'student_email', v_req.student_email,
		'student_name', v_name, 'charged', v_price, 'transaction_id', v_txn.id, 'medium', 'digital',
		'balance', public._coin_balance(v_req.student_email));
end;
$$;
revoke all on function public.classroom_song_approve(uuid) from public, anon, authenticated, service_role;
grant execute on function public.classroom_song_approve(uuid) to authenticated;

-- TOURNAMENTS STOP MINTING. Every earned reward is still recorded, one row per
-- member, with no coin row and awaiting_transfer set. Session two adds the
-- admin screen that transfers them. Nothing already paid is clawed back.
alter table public.tournament_reward_ledger add column if not exists awaiting_transfer boolean not null default false;

create or replace function public._tournament_award(
	p_tournament_id uuid,
	p_entry_id uuid,
	p_amount integer,
	p_reason text,
	p_match_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.tournament_reward_ledger
		(tournament_id, entry_id, user_id, amount, reason, match_id, member_id, awaiting_transfer)
	select x.tournament_id, x.entry_id, x.user_id, x.amount, x.reason, x.match_id, x.member_id, true
	from (
		select p_tournament_id as tournament_id, e.id as entry_id, m.user_id, p_amount as amount,
			p_reason as reason, p_match_id as match_id, m.id as member_id,
			(m.user_id is not null and m.user_id = e.user_id) as is_captain,
			m.created_at as member_created
		from public.tournament_entries e
		join public.tournament_entry_members m on m.entry_id = e.id
		where e.id = p_entry_id
		union all
		select p_tournament_id, e.id, e.user_id, p_amount, p_reason, p_match_id, null::uuid,
			true, e.created_at
		from public.tournament_entries e
		where e.id = p_entry_id
			and not exists (select 1 from public.tournament_entry_members m where m.entry_id = e.id)
	) x
	order by x.is_captain desc, x.member_created asc, x.member_id asc;
end;
$$;
revoke all on function public._tournament_award(uuid, uuid, integer, text, uuid) from public, anon, authenticated, service_role;
-- ===== PART I END =====

-- ===== PART J BEGIN =====
-- ===== PART J: SELF-CHECK =====
do $chk$
declare
	v_n integer;
	v_type text;
begin
	select data_type into v_type from information_schema.columns
	where table_schema = 'public' and table_name = 'coin_transactions' and column_name = 'amount';
	if v_type <> 'numeric' then
		raise exception '0239: coin_transactions.amount is %, expected numeric.', v_type;
	end if;
	select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname in ('coin_log_transaction', '_coin_balance', '_coin_insert',
		'coin_payout_student', 'coin_admin_adjust_balance', 'coin_bulk_log_students', 'coin_bulk_log_section',
		'coin_public_leaderboard', 'coin_public_transactions', 'coin_public_reasons');
	if v_n <> 10 then
		raise exception '0239: expected exactly one arity of each of 10 rewritten coin functions, found %.', v_n;
	end if;
	if has_function_privilege('anon', 'public.coin_log_transaction(text, text, numeric, numeric, text, text)', 'execute') then
		raise exception '0239: anon must not execute coin_log_transaction.';
	end if;
	if not has_function_privilege('anon', 'public.coin_public_leaderboard()', 'execute') then
		raise exception '0239: anon must execute coin_public_leaderboard (the public Ledger).';
	end if;
	select count(*) into v_n from public.coin_transactions where medium = 'physical';
	raise notice '0239: one balance. % physical row(s) stay as history and no longer count.', v_n;
end
$chk$;
-- ===== PART J END =====
