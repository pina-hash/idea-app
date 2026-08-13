-- 0096_coin_medium.sql
-- A SECOND BALANCE: physical IDEA coins and digital IDEA coins, tracked
-- separately, with exactly one path between them.
--
-- ---------------------------------------------------------------------------
-- THE MODEL, AND WHY THE SINGLE BALANCE WAS ALWAYS THE DIGITAL ONE
-- ---------------------------------------------------------------------------
-- Physical coins are the PRIMARY system: thousands of them exist and are
-- handed to students in class. The digital balance was added later so an
-- absent student could still be awarded, and could then either withdraw
-- physical coins or spend the digital balance directly.
--
-- So the one balance 0070 shipped is really the DIGITAL one, and physical
-- coins stopped being tracked the moment they left the tin. That is the gap
-- this migration closes: every transaction now says which medium it moved,
-- balances derive per medium, and the two are reconciled by one explicit
-- transfer.
--
-- CONVERSION IS ONE WAY: DIGITAL -> PHYSICAL. A payout is the only path, and
-- there is deliberately NO deposit path from physical back into digital. See
-- section 9 (payout as a transfer) and the physical_coin_submission note in
-- section 4 for why that category is NOT a deposit and was re-scoped rather
-- than retired.
--
-- ---------------------------------------------------------------------------
-- MEDIUM IS PER TRANSACTION, NOT PER CATEGORY
-- ---------------------------------------------------------------------------
-- This is the load-bearing modelling decision, and the REAL legacy data is
-- what settles it -- the same category shows up under both media, repeatedly:
--
--     Weekly Wage          34 physical /  9 digital
--     Contract Completion   8 physical /  5 digital
--     Above and Beyond     15 physical /  1 digital
--
-- A student who was in class got handed coins; a student who was absent got a
-- digital credit for the same reason on the same day. So medium cannot live on
-- coin_categories, and every logging RPC takes p_medium.
--
-- IT DEFAULTS TO 'physical', because physical is the primary system and
-- digital is the exception for an absent student. The COLUMN default is
-- 'digital' instead, and that is not a contradiction -- see section 1.
--
-- ---------------------------------------------------------------------------
-- THE SIGNATURE TRAP: EVERY RPC GAINING p_medium IS DROPPED FIRST
-- ---------------------------------------------------------------------------
-- Adding a parameter changes a function's REAL signature even when the
-- parameter has a default -- `create or replace` keys on the exact argument
-- list, so it would CREATE A SECOND OVERLOAD and leave the old arity callable
-- beside it. That is not merely stale: two overloads differing only by a
-- defaulted trailing parameter make PostgREST unable to resolve the call AT
-- ALL, so the old overload surviving BREAKS THE CLIENT rather than quietly
-- serving it. Every function below that gains a parameter is therefore
-- `drop function`ed against its exact current argument types first -- the 0076
-- precedent (which learned it from 0058), applied here to eleven functions.
--
-- ---------------------------------------------------------------------------
-- DEPLOY ORDERING -- READ THIS BEFORE SHIPPING
-- ---------------------------------------------------------------------------
-- THIS MIGRATION IS APPLIED BY HAND, IN THE SUPABASE SQL EDITOR, BEFORE ANY
-- CLIENT THAT NAMES p_medium IS DEPLOYED. The drops above mean the old
-- arities stop existing the moment this runs, and the new ones do not exist
-- until it does -- so a client shipped ahead of the migration calls a
-- signature PostgREST cannot resolve and every coin write fails. Apply first,
-- deploy second.
--
-- Apply manually in the Supabase SQL editor, after 0095.

-- ===========================================================================
-- 1. The column.
--
-- THE COLUMN DEFAULT IS 'digital' WHILE EVERY RPC DEFAULTS TO 'physical', on
-- purpose. The default only ever applies to a RAW insert that names its own
-- column list and omits this one -- which in this schema is exactly one code
-- path: 0084's coin_admin_import_legacy, whose rows are LEGACY HISTORY from
-- the era when the single balance meant digital. A legacy re-import after a
-- rollback therefore lands digital, consistently with the backfill below.
-- Live logging never reaches the default: _coin_insert (section 6) always
-- passes a medium explicitly, and every RPC above it resolves one.
-- ===========================================================================
alter table public.coin_transactions add column if not exists medium text;

-- Backfill: the single balance was the digital one (see the header), so every
-- pre-0096 row is digital by definition. This is a restatement of what those
-- rows already meant, not a reinterpretation of them.
update public.coin_transactions set medium = 'digital' where medium is null;

alter table public.coin_transactions alter column medium set default 'digital';
alter table public.coin_transactions alter column medium set not null;

alter table public.coin_transactions drop constraint if exists coin_transactions_medium_check;
alter table public.coin_transactions
	add constraint coin_transactions_medium_check check (medium in ('physical', 'digital'));

comment on column public.coin_transactions.medium is
	'Which balance this row moved: physical coins in hand, or digital. Per TRANSACTION, never per category -- the same category legitimately appears under both. Backfilled to ''digital'' for every pre-0096 row, which is what the single balance always meant.';

-- Links the two halves of a digital -> physical payout (section 9). Null on
-- every ordinary row. Deliberately NOT unique: a transfer is exactly two rows.
alter table public.coin_transactions add column if not exists transfer_id uuid;

comment on column public.coin_transactions.transfer_id is
	'Shared by the two rows of a digital -> physical payout transfer, so balance derivation stays a plain per-medium sum with no special case.';

create index if not exists coin_transactions_medium_idx
	on public.coin_transactions (student_email, medium);
create index if not exists coin_transactions_transfer_idx
	on public.coin_transactions (transfer_id) where transfer_id is not null;

-- ---------------------------------------------------------------------------
-- BACKFILL REPORT. Every backfilled row is now digital. That is unarguable
-- for the legacy_* import rows and for the three legacy eating-pass refunds
-- (both are 2026-08 import-era bookkeeping). Anything ELSE that was backfilled
-- is real post-import activity logged through /coin-desk, some of which was
-- very likely a physical hand-over that this schema had no way to say. There
-- is no way to tell from the data which -- so this reports the count rather
-- than guessing, and those rows should be reviewed by hand afterward.
-- ---------------------------------------------------------------------------
do $$
declare
	v_total integer;
	v_legacy integer;
	v_refunds integer;
	v_review integer;
begin
	select count(*) into v_total from public.coin_transactions;
	select count(*) into v_legacy from public.coin_transactions
		where category_id like 'legacy\_%';
	select count(*) into v_refunds from public.coin_transactions
		where category_id = 'balance_correction' and note like 'Legacy eating pass refund%';
	select count(*) into v_review from public.coin_transactions
		where category_id not like 'legacy\_%'
			and not (category_id = 'balance_correction' and note like 'Legacy eating pass refund%');

	raise notice '0096 backfill: % rows total, % legacy_* import rows, % legacy eating-pass refunds.',
		v_total, v_legacy, v_refunds;
	raise notice '0096 REVIEW BY HAND: % backfilled rows are neither legacy_* nor an eating-pass refund. Each is real post-import activity now recorded as DIGITAL; any that was actually a physical hand-over needs correcting.',
		v_review;
end;
$$;

-- ===========================================================================
-- 2. The physical half of a payout transfer.
--
-- A payout is two linked rows, not one special-cased row (see section 9), so
-- the credit side needs a category of its own. It is:
--   * kind 'adjustment', NOT 'award' -- no new money enters the economy, the
--     same coins change medium. Calling it an award would inflate every
--     "awarded" total by the amount of coin that merely moved.
--   * loggable = false -- SYSTEM ONLY, the eating_pass_revoked precedent.
--     coin_log_transaction refuses it by name, so the only thing that can ever
--     insert one is coin_payout_student. Hand-logging one would mint physical
--     coins out of nothing, which is precisely the deposit path this model
--     does not have.
-- ===========================================================================
insert into public.coin_categories
	(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label,
	 formula_key, semester_point_cap, cap_period, cap_count, loggable, active, sort_order, notes)
values
	('payout_physical_credit', 'Coin Payout (physical credit)', 'adjustment', 'core', 'variable',
	 null, null, null, null, null, null, null, null, false, true, 304,
	 'System-only: the PHYSICAL half of a digital -> physical payout, inserted by coin_payout_student alongside the digital debit and sharing its transfer_id. Never logged directly -- doing so would create physical coins from nothing.')
on conflict (id) do update set
	name = excluded.name,
	kind = excluded.kind,
	pricing_model = excluded.pricing_model,
	loggable = excluded.loggable,
	active = excluded.active,
	notes = excluded.notes;

-- ===========================================================================
-- 3. Re-scoping physical_coin_submission -- NOT a deposit, and NOT retired.
--
-- It reads like the missing physical -> digital path and must not become one.
-- Its real meaning is an admin CORRECTION OF THE PHYSICAL RECORD: "credit
-- physical coins this student demonstrably holds that the ledger is missing".
-- So it always logs medium 'physical' (forced in coin_log_transaction, section
-- 7, regardless of what a caller passes) and it never touches digital.
-- ===========================================================================
update public.coin_categories
set notes = 'Credits PHYSICAL coins the student demonstrably holds that the record is missing -- an admin correction of the physical record, always logged as medium ''physical'' regardless of what a caller passes. NOT a conversion into digital: there is no deposit path, only the one-way digital -> physical payout.'
where id = 'physical_coin_submission';

update public.coin_categories
set notes = 'Converts DIGITAL balance to PHYSICAL coins handed over. The only path between the two media, and it runs one way: coin_payout_student writes this debit and a matching physical credit sharing one transfer_id.'
where id = 'coin_payout';

-- ===========================================================================
-- 4. ONE balance derivation, called by everything.
--
-- The whole point of this migration is that "the balance" is now three
-- numbers, and there were seventeen inline `sum(amount)` copies of the old one
-- scattered through function bodies. Every one of them is replaced below by a
-- call to this, so a future change to how a balance is derived has exactly one
-- place to happen. p_medium null means the TOTAL.
--
-- No grant: the `_coin_` internal-helper convention (_coin_insert,
-- _coin_public_roster). Only SECURITY DEFINER callers reach it.
-- ===========================================================================
create or replace function public._coin_balance(p_email text, p_medium text default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(sum(t.amount), 0)::integer
	from public.coin_transactions t
	where t.student_email = lower(btrim(coalesce(p_email, '')))
		and (p_medium is null or t.medium = p_medium);
$$;

revoke all on function public._coin_balance(text, text) from public;

-- ===========================================================================
-- 5. The balances view: three numbers, all derived, none stored.
--
-- `balance` keeps its name and becomes the TOTAL (physical + digital), which
-- is the honest reading of "this student's balance" and what every existing
-- reader of this column should now see. Dropped and recreated rather than
-- `create or replace`d because that form can only APPEND columns, and the new
-- ones belong beside the total they decompose.
-- ===========================================================================
drop view if exists public.coin_balances;

create view public.coin_balances
with (security_invoker = true) as
select
	student_email,
	sum(amount)::integer as balance,
	coalesce(sum(amount) filter (where medium = 'physical'), 0)::integer as physical_balance,
	coalesce(sum(amount) filter (where medium = 'digital'), 0)::integer as digital_balance,
	max(created_at) as last_activity_at,
	count(*)::integer as transaction_count
from public.coin_transactions
group by student_email;

grant select on public.coin_balances to authenticated;

-- ===========================================================================
-- 6. The insert helper gains medium and transfer_id.
-- ===========================================================================
drop function if exists public._coin_insert(text, text, integer, numeric, text, jsonb);

create or replace function public._coin_insert(
	p_email text,
	p_category_id text,
	p_signed_amount integer,
	p_quantity numeric,
	p_note text,
	p_meta jsonb,
	p_medium text default 'physical',
	p_transfer_id uuid default null
)
returns public.coin_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_row public.coin_transactions;
	v_medium text := lower(btrim(coalesce(p_medium, 'physical')));
begin
	if v_medium not in ('physical', 'digital') then
		raise exception 'Coin medium must be "physical" or "digital" (got "%").', p_medium;
	end if;
	insert into public.coin_transactions
		(student_email, category_id, amount, quantity, note, meta, actor_email, semester_key, medium, transfer_id)
	values
		(p_email, p_category_id, p_signed_amount, p_quantity, p_note,
		 coalesce(p_meta, '{}'::jsonb), public.current_user_email(), public.coin_semester_key(),
		 v_medium, p_transfer_id)
	returning * into v_row;
	return v_row;
end;
$$;

revoke all on function public._coin_insert(text, text, integer, numeric, text, jsonb, text, uuid) from public;

-- ===========================================================================
-- 7. The generic logger.
--
-- Unchanged from 0087 apart from the medium: same pricing branches, same
-- Weekly Wage tier multiply, same calendar caps, same Eating Pass purchase and
-- strike handling. Two things are new:
--
--   * THE DEBT LOCKOUT IS PER MEDIUM. A digital purchase is blocked while the
--     DIGITAL balance is already negative; a physical purchase while the
--     PHYSICAL balance is. Same already-negative semantics as before (a
--     purchase that would itself dip a non-negative balance negative is still
--     allowed), applied to the balance the purchase actually spends. A student
--     in digital debt can still spend physical coins they are holding, which
--     is the whole reason these are two balances.
--   * physical_coin_submission is FORCED to physical (section 3).
--
-- The response gains `medium` plus all three balances; `balance` keeps its
-- name and now means the total.
-- ===========================================================================
drop function if exists public.coin_log_transaction(text, text, integer, numeric, text);

create or replace function public.coin_log_transaction(
	p_email text,
	p_category_id text,
	p_amount integer default null,
	p_quantity numeric default null,
	p_note text default null,
	p_medium text default 'physical'
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
	v_medium text := lower(btrim(coalesce(p_medium, 'physical')));
	v_magnitude integer;
	v_signed integer;
	v_medium_balance integer;
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
	if v_medium not in ('physical', 'digital') then
		raise exception 'Coin medium must be "physical" or "digital" (got "%").', p_medium;
	end if;

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
		raise exception 'Use coin_log_extra_credit for Extra Credit (it enforces the semester cap).';
	end if;

	-- Physical Coin Submission is a correction of the PHYSICAL record and can
	-- never be anything else -- forced here rather than trusted to the caller,
	-- because a digital one would be the deposit path this model does not have.
	if v_cat.id = 'physical_coin_submission' then
		v_medium := 'physical';
	end if;

	if v_cat.pricing_model = 'flat' then
		v_magnitude := v_cat.amount;

		-- Weekly Wage's stored amount is a BASE rate the student's own wage
		-- tier multiplies (0087). Unchanged by the medium: a wage paid in hand
		-- and a wage credited digitally are both paid at that student's tier.
		if v_cat.id = 'weekly_wage' then
			select tier into v_wage_tier
				from public.coin_wage_tiers
				where student_email = v_email;
			v_wage_tier := greatest(coalesce(v_wage_tier, 1), 1);
			v_magnitude := v_cat.amount * v_wage_tier;
			v_meta := jsonb_build_object(
				'wage_tier', v_wage_tier,
				'base_amount', v_cat.amount
			);
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
		v_magnitude := round(v_cat.amount * p_quantity)::integer;
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

	-- Cadence cap, evaluated on calendar boundaries (never a rolling window).
	-- Deliberately counts BOTH media: "once per calendar month" is a cap on
	-- the event, not on the medium it was paid in.
	if v_cat.cap_period is not null then
		if v_cat.cap_period = 'day' then
			if (
				select count(*) from public.coin_transactions t
				where t.student_email = v_email and t.category_id = v_cat.id
					and t.created_at::date = current_date
			) >= v_cat.cap_count then
				return jsonb_build_object('ok', false, 'reason', 'cap_reached', 'cap_period', 'day');
			end if;
		elsif v_cat.cap_period = 'month' then
			if (
				select count(*) from public.coin_transactions t
				where t.student_email = v_email and t.category_id = v_cat.id
					and date_trunc('month', t.created_at) = date_trunc('month', now())
			) >= v_cat.cap_count then
				return jsonb_build_object('ok', false, 'reason', 'cap_reached', 'cap_period', 'month');
			end if;
		end if;
	end if;

	-- PER-MEDIUM debt lockout: a purchase is blocked only while the balance it
	-- actually spends is already negative. Fines and adjustments still apply
	-- past zero with no cap, exactly as before.
	v_medium_balance := public._coin_balance(v_email, v_medium);
	if v_cat.kind = 'purchase' and v_medium_balance < 0 then
		return jsonb_build_object(
			'ok', false, 'reason', 'debt', 'medium', v_medium,
			'balance', v_medium_balance, 'medium_balance', v_medium_balance
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

	v_row := public._coin_insert(v_email, v_cat.id, v_signed, p_quantity, v_note, v_meta, v_medium);

	if v_strike then
		v_strikes := public.coin_eating_pass_strikes(v_email);
		if v_strikes >= 3 then
			-- The revoke event is a zero-amount marker, so its medium moves no
			-- money either way; it follows the violation that triggered it.
			perform public._coin_insert(
				v_email, 'eating_pass_revoked', 0, null,
				'Automatically revoked: third eating-pass violation since this pass was purchased.',
				jsonb_build_object('strikes', v_strikes), v_medium
			);
		end if;
	end if;

	return jsonb_build_object(
		'ok', true,
		'transaction_id', v_row.id,
		'category_id', v_cat.id,
		'amount', v_signed,
		'medium', v_medium,
		'strike', v_strike,
		'wage_tier', v_wage_tier,
		'balance', public._coin_balance(v_email),
		'physical_balance', public._coin_balance(v_email, 'physical'),
		'digital_balance', public._coin_balance(v_email, 'digital')
	);
end;
$$;

revoke all on function public.coin_log_transaction(text, text, integer, numeric, text, text) from public;
grant execute on function public.coin_log_transaction(text, text, integer, numeric, text, text) to authenticated;

-- ===========================================================================
-- 8. The five dedicated 'formula' RPCs, each gaining p_medium.
--
-- Every formula is untouched. What changes in each is the same three things:
-- the new trailing p_medium (with its drop), the debt check reading that
-- medium's balance instead of the total, and the response carrying all three
-- balances.
-- ===========================================================================

-- Perfect Score on Graded Work: round(points / 25)i¢, minimum 1i¢.
drop function if exists public.coin_log_perfect_score(text, integer, text);

create or replace function public.coin_log_perfect_score(
	p_email text,
	p_points integer,
	p_note text default null,
	p_medium text default 'physical'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_medium text := lower(btrim(coalesce(p_medium, 'physical')));
	v_magnitude integer;
	v_row public.coin_transactions;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if v_medium not in ('physical', 'digital') then
		raise exception 'Coin medium must be "physical" or "digital" (got "%").', p_medium;
	end if;
	if p_points is null or p_points <= 0 then
		raise exception 'Enter the number of points the graded work was worth.';
	end if;
	if not exists (select 1 from public.coin_categories where id = 'perfect_score_graded_work' and active) then
		raise exception 'The Perfect Score category is not configured.';
	end if;

	v_magnitude := greatest(1, round(p_points / 25.0)::integer);

	v_row := public._coin_insert(
		v_email, 'perfect_score_graded_work', v_magnitude, p_points,
		nullif(btrim(coalesce(p_note, '')), ''), jsonb_build_object('points', p_points), v_medium
	);

	return jsonb_build_object(
		'ok', true, 'transaction_id', v_row.id, 'amount', v_magnitude, 'medium', v_medium,
		'balance', public._coin_balance(v_email),
		'physical_balance', public._coin_balance(v_email, 'physical'),
		'digital_balance', public._coin_balance(v_email, 'digital')
	);
end;
$$;

revoke all on function public.coin_log_perfect_score(text, integer, text, text) from public;
grant execute on function public.coin_log_perfect_score(text, integer, text, text) to authenticated;

-- Pay Raise: 40i¢ x the tier being left. The tier itself is medium-agnostic --
-- a raise bought with physical coins raises the same wage.
drop function if exists public.coin_log_pay_raise(text, text);

create or replace function public.coin_log_pay_raise(
	p_email text,
	p_note text default null,
	p_medium text default 'physical'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_medium text := lower(btrim(coalesce(p_medium, 'physical')));
	v_current_tier integer;
	v_new_tier integer;
	v_cost integer;
	v_medium_balance integer;
	v_row public.coin_transactions;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if v_medium not in ('physical', 'digital') then
		raise exception 'Coin medium must be "physical" or "digital" (got "%").', p_medium;
	end if;
	if not exists (select 1 from public.coin_categories where id = 'pay_raise' and active) then
		raise exception 'The Pay Raise category is not configured.';
	end if;

	v_medium_balance := public._coin_balance(v_email, v_medium);
	if v_medium_balance < 0 then
		return jsonb_build_object(
			'ok', false, 'reason', 'debt', 'medium', v_medium,
			'balance', v_medium_balance, 'medium_balance', v_medium_balance
		);
	end if;

	insert into public.coin_wage_tiers (student_email) values (v_email) on conflict (student_email) do nothing;
	select tier into v_current_tier from public.coin_wage_tiers where student_email = v_email for update;

	v_new_tier := v_current_tier + 1;
	v_cost := 40 * v_current_tier;

	v_row := public._coin_insert(
		v_email, 'pay_raise', -v_cost, null, nullif(btrim(coalesce(p_note, '')), ''),
		jsonb_build_object('previous_tier', v_current_tier, 'new_tier', v_new_tier, 'cost', v_cost),
		v_medium
	);

	update public.coin_wage_tiers set tier = v_new_tier, updated_at = now() where student_email = v_email;

	return jsonb_build_object(
		'ok', true, 'transaction_id', v_row.id,
		'previous_tier', v_current_tier, 'new_tier', v_new_tier, 'cost', v_cost, 'medium', v_medium,
		'balance', public._coin_balance(v_email),
		'physical_balance', public._coin_balance(v_email, 'physical'),
		'digital_balance', public._coin_balance(v_email, 'digital')
	);
end;
$$;

revoke all on function public.coin_log_pay_raise(text, text, text) from public;
grant execute on function public.coin_log_pay_raise(text, text, text) to authenticated;

-- Property Damage (Careless): 3i¢ flat + 1i¢ per $0.25 of repair cost.
drop function if exists public.coin_log_property_damage_careless(text, numeric, text);

create or replace function public.coin_log_property_damage_careless(
	p_email text,
	p_cost_dollars numeric,
	p_note text,
	p_medium text default 'physical'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_medium text := lower(btrim(coalesce(p_medium, 'physical')));
	v_base constant integer := 3;
	v_exchange integer;
	v_magnitude integer;
	v_row public.coin_transactions;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if v_medium not in ('physical', 'digital') then
		raise exception 'Coin medium must be "physical" or "digital" (got "%").', p_medium;
	end if;
	if not exists (select 1 from public.coin_categories where id = 'property_damage_careless' and active) then
		raise exception 'The Property Damage (Careless) category is not configured.';
	end if;
	if p_cost_dollars is null or p_cost_dollars < 0 then
		raise exception 'Enter the repair/replacement cost in dollars (0 if none).';
	end if;
	if v_note is null then
		raise exception 'Property Damage (Careless) needs a note describing the incident.';
	end if;

	v_exchange := round(p_cost_dollars / 0.25)::integer;
	v_magnitude := v_base + v_exchange;

	v_row := public._coin_insert(
		v_email, 'property_damage_careless', -v_magnitude, p_cost_dollars, v_note,
		jsonb_build_object('cost_dollars', p_cost_dollars, 'base', v_base, 'exchange', v_exchange),
		v_medium
	);

	return jsonb_build_object(
		'ok', true, 'transaction_id', v_row.id, 'amount', -v_magnitude,
		'base', v_base, 'exchange', v_exchange, 'medium', v_medium,
		'balance', public._coin_balance(v_email),
		'physical_balance', public._coin_balance(v_email, 'physical'),
		'digital_balance', public._coin_balance(v_email, 'digital')
	);
end;
$$;

revoke all on function public.coin_log_property_damage_careless(text, numeric, text, text) from public;
grant execute on function public.coin_log_property_damage_careless(text, numeric, text, text) to authenticated;

-- 3D Printing: material (1i¢/10g) + a time band.
drop function if exists public.coin_log_three_d_printing(text, numeric, numeric, boolean, text);

create or replace function public.coin_log_three_d_printing(
	p_email text,
	p_grams numeric,
	p_hours numeric,
	p_overnight boolean default false,
	p_note text default null,
	p_medium text default 'physical'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_medium text := lower(btrim(coalesce(p_medium, 'physical')));
	v_material integer;
	v_time integer;
	v_magnitude integer;
	v_medium_balance integer;
	v_row public.coin_transactions;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if v_medium not in ('physical', 'digital') then
		raise exception 'Coin medium must be "physical" or "digital" (got "%").', p_medium;
	end if;
	if not exists (select 1 from public.coin_categories where id = 'three_d_printing' and active) then
		raise exception 'The 3D Printing category is not configured.';
	end if;
	if p_grams is null or p_grams < 0 then
		raise exception 'Enter the slicer''s reported weight in grams.';
	end if;
	if p_hours is null or p_hours < 0 then
		raise exception 'Enter the slicer''s reported print time in hours.';
	end if;

	v_medium_balance := public._coin_balance(v_email, v_medium);
	if v_medium_balance < 0 then
		return jsonb_build_object(
			'ok', false, 'reason', 'debt', 'medium', v_medium,
			'balance', v_medium_balance, 'medium_balance', v_medium_balance
		);
	end if;

	v_material := round(p_grams / 10.0)::integer;
	v_time := case
		when p_overnight then 0
		when p_hours < 1 then 0
		when p_hours < 3 then 2
		when p_hours < 6 then 4
		else 6
	end;
	v_magnitude := v_material + v_time;

	v_row := public._coin_insert(
		v_email, 'three_d_printing', -v_magnitude, p_grams, nullif(btrim(coalesce(p_note, '')), ''),
		jsonb_build_object(
			'grams', p_grams, 'hours', p_hours, 'overnight', coalesce(p_overnight, false),
			'material_ic', v_material, 'time_ic', v_time
		),
		v_medium
	);

	return jsonb_build_object(
		'ok', true, 'transaction_id', v_row.id, 'amount', -v_magnitude,
		'material_ic', v_material, 'time_ic', v_time, 'medium', v_medium,
		'balance', public._coin_balance(v_email),
		'physical_balance', public._coin_balance(v_email, 'physical'),
		'digital_balance', public._coin_balance(v_email, 'digital')
	);
end;
$$;

revoke all on function public.coin_log_three_d_printing(text, numeric, numeric, boolean, text, text) from public;
grant execute on function public.coin_log_three_d_printing(text, numeric, numeric, boolean, text, text) to authenticated;

-- Extra Credit (209H only): 2i¢/point, capped per semester.
-- The point cap counts BOTH media -- it is a cap on how much extra credit a
-- student may buy in a semester, not on how they paid for it.
drop function if exists public.coin_log_extra_credit(text, integer, text, text);

create or replace function public.coin_log_extra_credit(
	p_email text,
	p_points integer,
	p_grading_category text,
	p_note text default null,
	p_medium text default 'physical'
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
	v_medium text := lower(btrim(coalesce(p_medium, 'physical')));
	v_used numeric;
	v_cap integer;
	v_cost integer;
	v_medium_balance integer;
	v_row public.coin_transactions;
	v_sem text := public.coin_semester_key();
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if v_medium not in ('physical', 'digital') then
		raise exception 'Coin medium must be "physical" or "digital" (got "%").', p_medium;
	end if;
	if p_points is null or p_points <= 0 then
		raise exception 'Enter a positive number of extra credit points.';
	end if;
	if v_grading not in ('unit_labs', 'unit_assignments', 'documentation') then
		raise exception 'Extra Credit only applies to Unit Labs, Unit Assignments, or Documentation checks (got "%").', p_grading_category;
	end if;

	select * into v_cat from public.coin_categories where id = 'extra_credit';
	if v_cat.id is null or not v_cat.active then
		raise exception 'The Extra Credit category is not configured.';
	end if;
	v_cap := v_cat.semester_point_cap;

	select coalesce(sum(quantity), 0) into v_used
	from public.coin_transactions
	where student_email = v_email and category_id = 'extra_credit' and semester_key = v_sem;

	if v_cap is not null and v_used + p_points > v_cap then
		return jsonb_build_object(
			'ok', false, 'reason', 'cap_exceeded',
			'cap_points', v_cap, 'used_points', v_used, 'remaining_points', greatest(v_cap - v_used, 0)
		);
	end if;

	v_medium_balance := public._coin_balance(v_email, v_medium);
	if v_medium_balance < 0 then
		return jsonb_build_object(
			'ok', false, 'reason', 'debt', 'medium', v_medium,
			'balance', v_medium_balance, 'medium_balance', v_medium_balance
		);
	end if;

	v_cost := round(v_cat.amount * p_points)::integer;

	v_row := public._coin_insert(
		v_email, 'extra_credit', -v_cost, p_points, nullif(btrim(coalesce(p_note, '')), ''),
		jsonb_build_object('grading_category', v_grading), v_medium
	);

	return jsonb_build_object(
		'ok', true, 'transaction_id', v_row.id, 'points', p_points, 'cost', v_cost,
		'used_points', v_used + p_points, 'cap_points', v_cap,
		'remaining_points', greatest(coalesce(v_cap, 0) - (v_used + p_points), 0),
		'medium', v_medium,
		'balance', public._coin_balance(v_email),
		'physical_balance', public._coin_balance(v_email, 'physical'),
		'digital_balance', public._coin_balance(v_email, 'digital')
	);
end;
$$;

revoke all on function public.coin_log_extra_credit(text, integer, text, text, text) from public;
grant execute on function public.coin_log_extra_credit(text, integer, text, text, text) to authenticated;

-- ===========================================================================
-- 9. PAYOUT IS THE ONE TRANSFER, AND THE ONLY PATH BETWEEN THE TWO BALANCES.
--
-- It debits digital and credits physical by the same amount, atomically, as
-- TWO LINKED ROWS sharing one transfer_id -- deliberately not one
-- special-cased row. That is what keeps balance derivation a plain per-medium
-- sum with no exceptions: nothing anywhere has to know that some rows count
-- twice or count differently. The total is unchanged by a payout, which is
-- correct -- the coins did not go anywhere, they changed form.
--
-- BOTH ROWS GO THROUGH _coin_insert DIRECTLY, NOT coin_log_transaction, and
-- that is the second deliberate exception to "every write funnels through the
-- logging RPCs" (0084's historical import being the first). The reason is that
-- a transfer is not a PRICED EVENT: there is no category price to look up and
-- no rule that applies to it. The debt lockout is moot (the digital balance is
-- positive by the guard below and must not be blocked by a negative physical
-- one), there is no cap on a payout, and no Eating Pass logic. The row shape
-- still lives in exactly one place, which is what _coin_insert is for.
--
-- p_amount is optional and defaults to the student's FULL digital balance --
-- the pre-0096 behaviour. A partial payout takes any amount up to it.
-- ===========================================================================
drop function if exists public.coin_payout_student(text, text);

create or replace function public.coin_payout_student(
	p_email text,
	p_note text default null,
	p_amount integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_digital integer;
	v_amount integer;
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

	-- Read fresh, in this function, never passed in by the caller -- the race
	-- 0079 exists to close, now scoped to the DIGITAL balance rather than the
	-- total (a physical balance is coins already in hand; there is nothing to
	-- pay out).
	v_digital := public._coin_balance(v_email, 'digital');
	if v_digital <= 0 then
		return jsonb_build_object('ok', false, 'reason', 'no_balance', 'digital_balance', v_digital, 'balance', v_digital);
	end if;

	v_amount := coalesce(p_amount, v_digital);
	if v_amount <= 0 then
		raise exception 'A payout amount must be positive.';
	end if;
	if v_amount > v_digital then
		return jsonb_build_object(
			'ok', false, 'reason', 'amount_exceeds_digital',
			'requested', v_amount, 'digital_balance', v_digital, 'balance', v_digital
		);
	end if;

	v_meta := jsonb_build_object('transfer_id', v_transfer::text, 'transfer_amount', v_amount);

	-- Digital out...
	v_debit := public._coin_insert(
		v_email, 'coin_payout', -v_amount, null, v_note,
		v_meta || jsonb_build_object('transfer_side', 'digital_debit'), 'digital', v_transfer
	);
	-- ...physical in, same amount, same transaction, same transfer id.
	perform public._coin_insert(
		v_email, 'payout_physical_credit', v_amount, null, v_note,
		v_meta || jsonb_build_object('transfer_side', 'physical_credit'), 'physical', v_transfer
	);

	return jsonb_build_object(
		'ok', true,
		'transaction_id', v_debit.id,
		'transfer_id', v_transfer,
		'amount', v_amount,
		'partial', p_amount is not null and p_amount < v_digital,
		'balance', public._coin_balance(v_email),
		'physical_balance', public._coin_balance(v_email, 'physical'),
		'digital_balance', public._coin_balance(v_email, 'digital')
	);
end;
$$;

revoke all on function public.coin_payout_student(text, text, integer) from public;
grant execute on function public.coin_payout_student(text, text, integer) to authenticated;

-- Pay every student with a positive DIGITAL balance, in one round trip.
-- Roster and refusal logic are 0079's, unchanged apart from being retargeted
-- from the total balance to the digital one. No new parameter, so no drop.
create or replace function public.coin_bulk_payout(
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_student record;
	v_call jsonb;
	v_entry jsonb;
	v_results jsonb := '[]'::jsonb;
	v_total integer := 0;
	v_succeeded integer := 0;
	v_refused integer := 0;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;

	for v_student in
		select student_email
		from public.coin_transactions
		group by student_email
		having coalesce(sum(amount) filter (where medium = 'digital'), 0) > 0
		order by student_email
	loop
		v_total := v_total + 1;
		begin
			-- The single-student RPC, nested: it re-reads THIS student's digital
			-- balance immediately before writing, regardless of what the roster
			-- above saw. A full payout, so no amount is passed.
			v_call := public.coin_payout_student(v_student.student_email, p_note);
		exception when others then
			v_call := jsonb_build_object('ok', false, 'reason', 'error', 'message', sqlerrm);
		end;
		if coalesce((v_call ->> 'ok')::boolean, false) then
			v_succeeded := v_succeeded + 1;
		else
			v_refused := v_refused + 1;
		end if;
		v_entry := jsonb_build_object('email', v_student.student_email) || v_call;
		v_results := v_results || jsonb_build_array(v_entry);
	end loop;

	return jsonb_build_object(
		'ok', true,
		'total', v_total,
		'succeeded', v_succeeded,
		'refused', v_refused,
		'results', v_results
	);
end;
$$;

revoke all on function public.coin_bulk_payout(text) from public;
grant execute on function public.coin_bulk_payout(text) to authenticated;

-- ===========================================================================
-- 10. Admin adjustment and lookup.
-- ===========================================================================
drop function if exists public.coin_admin_adjust_balance(text, integer, text);

create or replace function public.coin_admin_adjust_balance(
	p_email text,
	p_amount integer,
	p_note text,
	p_medium text default 'physical'
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

revoke all on function public.coin_admin_adjust_balance(text, integer, text, text) from public;
grant execute on function public.coin_admin_adjust_balance(text, integer, text, text) to authenticated;

-- Lookup: same signature (no drop needed), three balances instead of one, and
-- each history row now says which medium it moved.
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
			t.quantity, t.note, t.actor_email, t.created_at
		from public.coin_transactions t
		join public.coin_categories c on c.id = t.category_id
		where t.student_email = v_email
		order by t.created_at desc
		limit 25
	) r;

	return jsonb_build_object(
		'email', v_email,
		'balance', public._coin_balance(v_email),
		'physical_balance', public._coin_balance(v_email, 'physical'),
		'digital_balance', public._coin_balance(v_email, 'digital'),
		'wage_tier', coalesce(v_wage_tier, 1),
		'eating_pass_active', public.coin_eating_pass_active(v_email),
		'eating_pass_strikes', public.coin_eating_pass_strikes(v_email),
		'recent_transactions', v_recent
	);
end;
$$;

revoke all on function public.coin_admin_lookup(text) from public;
grant execute on function public.coin_admin_lookup(text) to authenticated;

-- ===========================================================================
-- 11. Bulk logging: a RUN-LEVEL medium plus a per-student override map.
--
-- The shape the real workflow needs: a section's Weekly Wage is one PHYSICAL
-- pass with the two students who were absent flipped to DIGITAL before
-- submitting -- one round trip, not a physical run followed by two
-- single-student digital entries.
--
-- p_medium_overrides is a jsonb object keyed by lowercased email. An email in
-- it that is NOT in the roster is reported back as `unmatched_overrides`
-- rather than silently ignored, since a typo there would otherwise pay the
-- wrong student the wrong way with nothing to notice.
-- ===========================================================================

-- One resolver, shared by both bulk loggers, so they cannot disagree about
-- what an override map means. No grant (the _coin_ internal convention).
create or replace function public._coin_normalize_media(p_medium text, p_overrides jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
	v_run text := lower(btrim(coalesce(p_medium, 'physical')));
	v_out jsonb := '{}'::jsonb;
	v_key text;
	v_val text;
begin
	if v_run not in ('physical', 'digital') then
		raise exception 'Coin medium must be "physical" or "digital" (got "%").', p_medium;
	end if;
	if p_overrides is not null and jsonb_typeof(p_overrides) = 'object' then
		for v_key, v_val in select key, value #>> '{}' from jsonb_each(p_overrides) loop
			if lower(btrim(coalesce(v_val, ''))) not in ('physical', 'digital') then
				raise exception 'Per-student medium override for "%" must be "physical" or "digital" (got "%").', v_key, v_val;
			end if;
			v_out := v_out || jsonb_build_object(lower(btrim(v_key)), lower(btrim(v_val)));
		end loop;
	end if;
	return jsonb_build_object('run', v_run, 'overrides', v_out);
end;
$$;

revoke all on function public._coin_normalize_media(text, jsonb) from public;

drop function if exists public.coin_bulk_log_section(text, text, integer, text);

create or replace function public.coin_bulk_log_section(
	p_section_id text,
	p_category_id text,
	p_amount integer default null,
	p_note text default null,
	p_medium text default 'physical',
	p_medium_overrides jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_section text := lower(nullif(btrim(coalesce(p_section_id, '')), ''));
	v_cat public.coin_categories;
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_media jsonb;
	v_run_medium text;
	v_overrides jsonb;
	v_row_medium text;
	v_seen text[] := array[]::text[];
	v_unmatched jsonb := '[]'::jsonb;
	v_key text;
	v_student record;
	v_call jsonb;
	v_entry jsonb;
	v_results jsonb := '[]'::jsonb;
	v_total integer := 0;
	v_succeeded integer := 0;
	v_refused integer := 0;
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

	v_media := public._coin_normalize_media(p_medium, p_medium_overrides);
	v_run_medium := v_media ->> 'run';
	v_overrides := v_media -> 'overrides';

	select * into v_cat from public.coin_categories where id = p_category_id;
	if v_cat.id is null then
		raise exception 'Unknown coin category "%".', p_category_id;
	end if;
	if not v_cat.active or not v_cat.loggable then
		raise exception '"%" cannot be logged directly.', v_cat.name;
	end if;
	if v_cat.id = 'extra_credit' then
		raise exception 'Extra Credit needs a per-student point count; it cannot be bulk-logged yet.';
	end if;
	if v_cat.pricing_model not in ('flat', 'range', 'variable') then
		raise exception '"%" needs per-student input (%) and cannot be bulk-logged yet -- only flat, range, and variable (one amount applied uniformly) categories can be logged against a whole section.', v_cat.name, v_cat.pricing_model;
	end if;

	-- Shape validation up front, mirroring coin_log_transaction's own checks:
	-- the amount and note are the SAME for every student, so a shape mistake
	-- would fail identically for every row.
	if v_cat.pricing_model = 'range' then
		if p_amount is null or p_amount < v_cat.min_amount or p_amount > v_cat.max_amount then
			raise exception '"%" needs an amount between %i¢ and %i¢.', v_cat.name, v_cat.min_amount, v_cat.max_amount;
		end if;
	elsif v_cat.pricing_model = 'variable' then
		if v_cat.kind = 'adjustment' then
			if p_amount is null or p_amount = 0 then
				raise exception 'A balance adjustment needs a non-zero amount.';
			end if;
			if v_note is null then
				raise exception 'A balance adjustment needs a note explaining why.';
			end if;
		else
			if p_amount is null or p_amount <= 0 then
				raise exception '"%" needs a positive amount.', v_cat.name;
			end if;
			if v_note is null then
				raise exception '"%" needs a note.', v_cat.name;
			end if;
		end if;
	end if;

	for v_student in
		select student_email from public.coin_section_students
		where section_id = v_section
		order by student_email
	loop
		v_total := v_total + 1;
		v_row_medium := coalesce(v_overrides ->> v_student.student_email, v_run_medium);
		v_seen := v_seen || v_student.student_email;
		begin
			v_call := public.coin_log_transaction(
				v_student.student_email, v_cat.id, p_amount, null, p_note, v_row_medium
			);
		exception when others then
			-- A per-student failure must never abort the rest of the section.
			v_call := jsonb_build_object('ok', false, 'reason', 'error', 'message', sqlerrm);
		end;
		if coalesce((v_call ->> 'ok')::boolean, false) then
			v_succeeded := v_succeeded + 1;
		else
			v_refused := v_refused + 1;
		end if;
		v_entry := jsonb_build_object('email', v_student.student_email, 'medium', v_row_medium) || v_call;
		v_results := v_results || jsonb_build_array(v_entry);
	end loop;

	for v_key in select jsonb_object_keys(v_overrides) loop
		if not (v_key = any (v_seen)) then
			v_unmatched := v_unmatched || jsonb_build_array(v_key);
		end if;
	end loop;

	return jsonb_build_object(
		'ok', true,
		'section_id', v_section,
		'category_id', v_cat.id,
		'medium', v_run_medium,
		'unmatched_overrides', v_unmatched,
		'total', v_total,
		'succeeded', v_succeeded,
		'refused', v_refused,
		'results', v_results
	);
end;
$$;

revoke all on function public.coin_bulk_log_section(text, text, integer, text, text, jsonb) from public;
grant execute on function public.coin_bulk_log_section(text, text, integer, text, text, jsonb) to authenticated;

drop function if exists public.coin_bulk_log_role_stipend(text, text, text);

create or replace function public.coin_bulk_log_role_stipend(
	p_role_id text default null,
	p_section_id text default null,
	p_note text default null,
	p_medium text default 'physical',
	p_medium_overrides jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_media jsonb;
	v_run_medium text;
	v_overrides jsonb;
	v_row_medium text;
	v_seen text[] := array[]::text[];
	v_unmatched jsonb := '[]'::jsonb;
	v_key text;
	v_holder record;
	v_call jsonb;
	v_entry jsonb;
	v_results jsonb := '[]'::jsonb;
	v_total integer := 0;
	v_succeeded integer := 0;
	v_refused integer := 0;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if not exists (select 1 from public.coin_categories where id = 'weekly_role_stipend' and active) then
		raise exception 'The Weekly Role Stipend category is not configured.';
	end if;
	if p_role_id is not null and not exists (select 1 from public.coin_role_definitions where id = p_role_id) then
		raise exception 'Unknown coin role "%".', p_role_id;
	end if;
	if p_section_id is not null and not exists (select 1 from public.coin_sections where id = p_section_id) then
		raise exception 'Unknown coin section "%".', p_section_id;
	end if;

	v_media := public._coin_normalize_media(p_medium, p_medium_overrides);
	v_run_medium := v_media ->> 'run';
	v_overrides := v_media -> 'overrides';

	for v_holder in
		select distinct student_email from public.coin_role_holders
		where revoked_at is null
			and (expires_at is null or expires_at > now())
			and (p_role_id is null or role_id = p_role_id)
			and (p_section_id is null or section_id = p_section_id)
		order by student_email
	loop
		v_total := v_total + 1;
		v_row_medium := coalesce(v_overrides ->> v_holder.student_email, v_run_medium);
		v_seen := v_seen || v_holder.student_email;
		begin
			v_call := public.coin_log_transaction(
				v_holder.student_email, 'weekly_role_stipend', null, null, v_note, v_row_medium
			);
		exception when others then
			v_call := jsonb_build_object('ok', false, 'reason', 'error', 'message', sqlerrm);
		end;
		if coalesce((v_call ->> 'ok')::boolean, false) then
			v_succeeded := v_succeeded + 1;
		else
			v_refused := v_refused + 1;
		end if;
		v_entry := jsonb_build_object('email', v_holder.student_email, 'medium', v_row_medium) || v_call;
		v_results := v_results || jsonb_build_array(v_entry);
	end loop;

	for v_key in select jsonb_object_keys(v_overrides) loop
		if not (v_key = any (v_seen)) then
			v_unmatched := v_unmatched || jsonb_build_array(v_key);
		end if;
	end loop;

	return jsonb_build_object(
		'ok', true,
		'role_id', p_role_id,
		'section_id', p_section_id,
		'medium', v_run_medium,
		'unmatched_overrides', v_unmatched,
		'total', v_total,
		'succeeded', v_succeeded,
		'refused', v_refused,
		'results', v_results
	);
end;
$$;

revoke all on function public.coin_bulk_log_role_stipend(text, text, text, text, jsonb) from public;
grant execute on function public.coin_bulk_log_role_stipend(text, text, text, text, jsonb) to authenticated;

-- ===========================================================================
-- 12. The public Ledger reads.
--
-- THE LEDGER PAGE IS NOT EDITED BY THIS MIGRATION, AND MUST KEEP WORKING. It
-- recomputes its own figures client-side from the CSV columns, and it renders
-- the `Bank Balance` stat only when the value parses as a positive number --
-- a slot 0089 deliberately served EMPTY because the Supabase economy had one
-- balance and no physical-coin bookkeeping to put there. It has one now.
--
--   Coin Balance  <- the TOTAL (physical + digital)
--   Bank Balance  <- the DIGITAL balance
--
-- which lights up that already-wired slot with no page edit. The identity the
-- page's own arithmetic relies on still holds: `awarded` is every positive row
-- and `fines + spent` is every negative one, so awarded - fines - spent is
-- still exactly the total, payout transfer rows included.
--
-- The ABSOLUTE RULE of 0089 is untouched: no email, in any form, through any
-- parameter or field. A medium is 'physical' or 'digital'.
-- ===========================================================================
drop function if exists public.coin_public_leaderboard();

create or replace function public.coin_public_leaderboard()
returns table (
	student_id text,
	name text,
	section text,
	awarded integer,
	fines integer,
	spent integer,
	paid_out integer,
	balance integer,
	debt integer,
	weekly_wage integer,
	wage_tier integer,
	physical_balance integer,
	digital_balance integer
)
language sql
stable
security definer
set search_path = ''
as $$
	with base as (
		select coalesce(c.amount, 1) as wage_base
		from public.coin_categories c where c.id = 'weekly_wage'
	),
	totals as (
		select
			t.student_email as email,
			coalesce(sum(t.amount) filter (where t.amount > 0), 0)::integer as awarded,
			coalesce(-sum(t.amount) filter (where t.amount < 0 and cat.kind = 'fine'), 0)::integer as fines,
			coalesce(-sum(t.amount) filter (where t.amount < 0 and cat.kind <> 'fine'), 0)::integer as spent,
			coalesce(-sum(t.amount) filter (
				where t.amount < 0 and t.category_id in ('coin_payout', 'legacy_payout')
			), 0)::integer as paid_out,
			coalesce(sum(t.amount), 0)::integer as balance,
			coalesce(sum(t.amount) filter (where t.medium = 'physical'), 0)::integer as physical_balance,
			coalesce(sum(t.amount) filter (where t.medium = 'digital'), 0)::integer as digital_balance
		from public.coin_transactions t
		join public.coin_categories cat on cat.id = t.category_id
		group by t.student_email
	)
	select
		ros.public_id,
		ros.display_name,
		ros.section,
		coalesce(tt.awarded, 0),
		coalesce(tt.fines, 0),
		coalesce(tt.spent, 0),
		coalesce(tt.paid_out, 0),
		coalesce(tt.balance, 0),
		greatest(0, -coalesce(tt.balance, 0)),
		(coalesce((select base.wage_base from base), 1) * greatest(coalesce(w.tier, 1), 1))::integer,
		greatest(coalesce(w.tier, 1), 1),
		coalesce(tt.physical_balance, 0),
		coalesce(tt.digital_balance, 0)
	from public._coin_public_roster() ros
	left join totals tt on tt.email = ros.student_email
	left join public.coin_wage_tiers w on w.student_email = ros.student_email
	order by coalesce(tt.balance, 0) desc, ros.display_name;
$$;

revoke all on function public.coin_public_leaderboard() from public;
grant execute on function public.coin_public_leaderboard() to anon, authenticated;

-- The public transaction feed gains `medium`. The CSV the Ledger parses is
-- UNCHANGED (src/lib/server/coin-public.ts still emits the same five columns
-- under the same headers) -- this is here so the display pass that renders it
-- needs no migration of its own.
drop function if exists public.coin_public_transactions(integer);

create or replace function public.coin_public_transactions(p_limit integer default 5000)
returns table (
	occurred_at timestamptz,
	name text,
	amount integer,
	type text,
	reason text,
	medium text
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
		t.medium
	from public.coin_transactions t
	join public.coin_categories cat on cat.id = t.category_id
	join public._coin_public_roster() ros on ros.student_email = t.student_email
	order by t.created_at desc, t.id desc
	limit greatest(1, least(coalesce(p_limit, 5000), 20000));
$$;

revoke all on function public.coin_public_transactions(integer) from public;
grant execute on function public.coin_public_transactions(integer) to anon, authenticated;

-- The drawer. `balance` keeps its name and becomes the total; the two media
-- are ADDED beside it. The drawer's layout, its stats and its amount rendering
-- are deliberately NOT redesigned here -- a separate display pass owns that;
-- this only makes the numbers available. The 0089 DISCLOSURE BOUNDARY still
-- holds exactly: still no strike count, still no email.
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
	v_wage_base integer;
	v_history jsonb;
begin
	select ros.student_email, ros.display_name, ros.section
		into v_email, v_name, v_section
		from public._coin_public_roster() ros
		where ros.public_id = lower(btrim(coalesce(p_student_id, '')));

	if v_email is null then
		return jsonb_build_object('ok', false, 'reason', 'unknown_student');
	end if;

	select greatest(coalesce(w.tier, 1), 1) into v_tier
		from public.coin_wage_tiers w where w.student_email = v_email;
	v_tier := greatest(coalesce(v_tier, 1), 1);

	select coalesce(c.amount, 1) into v_wage_base
		from public.coin_categories c where c.id = 'weekly_wage';

	select coalesce(jsonb_agg(row_to_json(h)::jsonb order by h.occurred_at desc), '[]'::jsonb)
		into v_history
		from (
			select
				t.created_at as occurred_at,
				t.amount,
				t.medium,
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
			where t.student_email = v_email
			order by t.created_at desc, t.id desc
			limit 500
		) h;

	return jsonb_build_object(
		'ok', true,
		'student_id', lower(btrim(coalesce(p_student_id, ''))),
		'name', v_name,
		'section', v_section,
		'balance', public._coin_balance(v_email),
		'physical_balance', public._coin_balance(v_email, 'physical'),
		'digital_balance', public._coin_balance(v_email, 'digital'),
		'wage_tier', v_tier,
		'weekly_wage', coalesce(v_wage_base, 1) * v_tier,
		'eating_pass_held', public.coin_eating_pass_active(v_email),
		'history', v_history
	);
end;
$$;

revoke all on function public.coin_public_student(text) from public;
grant execute on function public.coin_public_student(text) to anon, authenticated;
