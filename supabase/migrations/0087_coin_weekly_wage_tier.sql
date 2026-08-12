-- 0087_coin_weekly_wage_tier.sql
-- Weekly Wage pays the student's OWN wage tier, closing the gap 0070 shipped
-- with and a later audit pass re-confirmed: coin_wage_tiers was real but
-- DECORATIVE. A Pay Raise purchase recorded a real cost (40i¢ x the tier being
-- left) and persisted a real tier bump, but nothing ever paid it out --
-- weekly_wage was a plain 'flat' 1i¢ category and no code path, generic or
-- dedicated, read coin_wage_tiers when logging one.
--
-- ---------------------------------------------------------------------------
-- THE RATE IS 1i¢ x TIER, AND THAT NUMBER COMES FROM THE SOURCE DOCS
-- ---------------------------------------------------------------------------
-- docs/coin-economy/idea_coin_economy_draft_v3.md Part 4 prices Pay Raise by
-- justifying it as "a permanent +1i¢/week against a ~130-week horizon". A
-- permanent +1i¢ PER RAISE against a 1i¢ base is exactly tier x base:
--   tier 1 = 1i¢/week (the base every student starts at)
--   tier 2 = 2i¢/week (after one Pay Raise)
--   tier 3 = 3i¢/week ...
-- The quick reference's "1i¢/week, base" says the same thing from the other
-- side -- "base" is the tier-1 rate, not the only rate. So the category's
-- stored `amount` stays 1 and keeps its meaning: it is the BASE rate, and the
-- tier multiplies it. Re-pricing the base later needs no change here.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A SPECIAL CASE INSIDE coin_log_transaction, NOT A NEW
-- pricing_model, A 'formula' CATEGORY, OR A DEDICATED RPC
-- ---------------------------------------------------------------------------
-- Weekly Wage is the single most BULK-logged category in the whole economy --
-- paying a class its wage one email at a time is the exact problem 0073 was
-- built to solve. That constrains the fix:
--
--   * 'formula' is wrong. coin_log_transaction refuses every formula category
--     by design (0070), and isBulkEligible (src/lib/coin-desk/sections.ts)
--     only admits flat/range/variable -- so re-tagging weekly_wage as formula
--     would REMOVE it from bulk logging entirely, which is backwards.
--   * A dedicated coin_log_weekly_wage RPC has the same problem: it would need
--     its own bulk sibling, and coin_bulk_log_section would have to learn to
--     route to it. Two logging paths for one category is exactly the kind of
--     duplicate that quietly stops matching.
--
-- Putting it in the flat branch of coin_log_transaction instead means
-- coin_bulk_log_section (0073) gets it for FREE and correctly: that function
-- reimplements no pricing at all, it calls coin_log_transaction once per
-- student, so a section-wide Weekly Wage now pays each student at THEIR OWN
-- tier in one round trip -- which a single "amount typed once for the whole
-- section" bulk model could never have expressed. This mirrors how 0070
-- already special-cases eating_pass and eating_violation by category id in
-- this same function.
--
-- ---------------------------------------------------------------------------
-- A STUDENT WITH NO coin_wage_tiers ROW IS TIER 1, AND STAYS THAT WAY
-- ---------------------------------------------------------------------------
-- The row is only created by coin_log_pay_raise, so most students have none.
-- The read coalesces to 1, so they are paid the base rate exactly as before --
-- and this function deliberately does NOT insert a row on their behalf. A
-- wage tier is derived state a Pay Raise owns; logging a wage should not
-- provision one, and tier 1 with no row is already the correct answer.
--
-- Everything else in coin_log_transaction is unchanged from 0070: the range /
-- per_unit / variable branches, the calendar cadence caps, the debt lockout,
-- the Eating Pass purchase and strike handling, and the insert itself. The
-- response gains a `wage_tier` field (null for every other category) so a
-- caller can show what rate was actually applied without a second read.
--
-- Apply manually in the Supabase SQL editor, after 0086.

create or replace function public.coin_log_transaction(
	p_email text,
	p_category_id text,
	p_amount integer default null,
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
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_magnitude integer;
	v_signed integer;
	v_balance integer;
	v_pass_active boolean;
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

	if v_cat.pricing_model = 'flat' then
		v_magnitude := v_cat.amount;

		-- Weekly Wage is the one flat category whose rate scales per student:
		-- the stored amount is the BASE rate and the student's wage tier
		-- multiplies it, which is what a Pay Raise actually bought. No row
		-- means tier 1, i.e. the base rate, exactly as before this migration.
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

	select coalesce(sum(amount), 0) into v_balance from public.coin_transactions where student_email = v_email;

	-- Debt lockout: only while ALREADY negative, and only for purchases.
	-- Fines and adjustments still apply past zero with no cap (the docs'
	-- own framing); a purchase that would itself dip a non-negative balance
	-- into the negative is allowed, matching the docs' literal condition.
	if v_cat.kind = 'purchase' and v_balance < 0 then
		return jsonb_build_object('ok', false, 'reason', 'debt', 'balance', v_balance);
	end if;

	if v_cat.id = 'eating_pass' then
		if public.coin_eating_pass_active(v_email) then
			return jsonb_build_object('ok', false, 'reason', 'pass_already_active');
		end if;
	elsif v_cat.id = 'eating_violation' then
		v_pass_active := public.coin_eating_pass_active(v_email);
		v_strike := v_pass_active;
		v_meta := jsonb_build_object('strike', v_strike);
	end if;

	v_row := public._coin_insert(v_email, v_cat.id, v_signed, p_quantity, v_note, v_meta);

	if v_strike then
		v_strikes := public.coin_eating_pass_strikes(v_email);
		if v_strikes >= 3 then
			perform public._coin_insert(
				v_email, 'eating_pass_revoked', 0, null,
				'Automatically revoked: third eating-pass violation since this pass was purchased.',
				jsonb_build_object('strikes', v_strikes)
			);
		end if;
	end if;

	select coalesce(sum(amount), 0) into v_balance from public.coin_transactions where student_email = v_email;

	return jsonb_build_object(
		'ok', true,
		'transaction_id', v_row.id,
		'category_id', v_cat.id,
		'amount', v_signed,
		'strike', v_strike,
		'wage_tier', v_wage_tier,
		'balance', v_balance
	);
end;
$$;

revoke all on function public.coin_log_transaction(text, text, integer, numeric, text) from public;
grant execute on function public.coin_log_transaction(text, text, integer, numeric, text) to authenticated;

-- The Weekly Wage row's notes line still described the flat behaviour. The
-- price list is admin-editable since 0080, so this is a targeted update of the
-- one column rather than a re-seed of the row.
update public.coin_categories
set notes = 'The floor, not the engine: guaranteed just for being enrolled. Pays the student''s own wage tier (this amount x tier); a Pay Raise buys a permanent +1i¢/week. See 0084.'
where id = 'weekly_wage';
