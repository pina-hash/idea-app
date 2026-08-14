-- ===========================================================================
-- 0103_coin_public_medium_display.sql
--
-- APPLY MANUALLY IN THE SUPABASE SQL EDITOR, AFTER 0102.
--
-- The DISPLAY PASS 0096 deferred. That migration split the economy into two
-- balances and made a payout a TRANSFER -- two linked rows sharing one
-- transfer_id, a digital debit and an equal physical credit -- and it noted in
-- its own header that a separate pass would own how the public Ledger renders
-- them. This is that pass's server half. It changes NO stored data and NO
-- write path: three read functions, and nothing else.
--
-- 1. THE TRANSFER PAIR BECOMES IDENTIFIABLE FROM A PUBLIC READ.
--    `coin_public_transactions` and `coin_public_student` gain `transfer_id`,
--    so the page can collapse a pair into the one event it actually was
--    instead of showing a student a debit and a credit for coins that never
--    left their account. There is deliberately no heuristic pairing on the
--    page (same name, same second, opposite media): the id is the real key
--    and it is already stored.
--
-- 2. A TRANSFER STOPS INFLATING `awarded` AND `spent`.
--    THIS IS THE LOAD-BEARING FIX AND IT IS A WRONG NUMBER, NOT AN ERROR.
--    0089 defined awarded as every positive row and spent as every negative
--    non-fine row, which was exactly right when every row was a real event.
--    Since 0096 a payout writes one of each, so a student who withdrew 40i¢
--    reads as having earned 40 more and spent 40 more than they did -- and
--    the Ledger's "Lifetime Earned" headline is computed from those very
--    columns. Coins that only changed form are neither earned nor spent, so
--    both aggregates now skip `transfer_id is not null`.
--
--    `paid_out` deliberately still counts the digital debit: "how much has
--    this student withdrawn" is a real question and that is its answer.
--    `balance` is untouched -- it is the sum of everything, and a transfer
--    nets to zero inside it either way.
--
--    THE PAGE'S OWN ARITHMETIC STILL HOLDS. It recomputes
--    `awarded - fines - spent` client-side, and because a transfer removes
--    exactly +N from awarded and N from spent, that identity still lands on
--    the total. It was only ever the two components that were wrong.
--
-- 3. The leaderboard's per-medium columns were already there (0096); the CSV
--    layer above it now carries them, so the page reads physical and digital
--    rather than inferring one from the other.
--
-- THE ABSOLUTE RULE OF 0089 IS UNTOUCHED: no email, in any form, through any
-- parameter or field. A transfer id is a random uuid and a medium is
-- 'physical' or 'digital'.
--
-- SIGNATURE NOTE: `coin_public_transactions` gains an output column, which is
-- a return-type change, so it is DROPPED first (the 0058/0076/0096 trap --
-- `create or replace` alone refuses a changed return type). Its argument list
-- is unchanged, so no second overload can survive. `coin_public_leaderboard`
-- and `coin_public_student` keep their exact signatures.
--
-- DEPLOY ORDERING: apply this BEFORE deploying a client that reads
-- `transfer_id`. A client shipped ahead of it simply does not see the field
-- and renders each half of a transfer as its own row -- the pre-0103
-- behaviour, degraded but not broken.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The leaderboard: transfers out of `awarded` and `spent`.
-- ---------------------------------------------------------------------------
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
			-- A transfer's two halves are excluded from BOTH of these: the
			-- physical credit is not income and the digital debit is not
			-- spending. See this file's header.
			coalesce(sum(t.amount) filter (
				where t.amount > 0 and t.transfer_id is null
			), 0)::integer as awarded,
			coalesce(-sum(t.amount) filter (where t.amount < 0 and cat.kind = 'fine'), 0)::integer as fines,
			coalesce(-sum(t.amount) filter (
				where t.amount < 0 and cat.kind <> 'fine' and t.transfer_id is null
			), 0)::integer as spent,
			-- Withdrawals ARE counted here: this column answers "how much has
			-- left the digital balance as coins in hand", which a transfer is
			-- precisely an instance of.
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

-- ---------------------------------------------------------------------------
-- 2. The public feed carries the transfer key.
-- ---------------------------------------------------------------------------
drop function if exists public.coin_public_transactions(integer);

create or replace function public.coin_public_transactions(p_limit integer default 5000)
returns table (
	occurred_at timestamptz,
	name text,
	amount integer,
	type text,
	reason text,
	medium text,
	transfer_id uuid
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
			when t.transfer_id is not null then 'Payout'
			when t.category_id in ('coin_payout', 'legacy_payout') then 'Payout'
			when cat.kind = 'fine' then 'Fine'
			when cat.kind = 'award' then 'Award'
			when cat.kind = 'purchase' then 'Purchase'
			else 'Adjustment'
		end,
		cat.name,
		t.medium,
		t.transfer_id
	from public.coin_transactions t
	join public.coin_categories cat on cat.id = t.category_id
	join public._coin_public_roster() ros on ros.student_email = t.student_email
	order by t.created_at desc, t.id desc
	limit greatest(1, least(coalesce(p_limit, 5000), 20000));
$$;

revoke all on function public.coin_public_transactions(integer) from public;
grant execute on function public.coin_public_transactions(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The drawer's history carries it too.
--
-- The `transfer_id is not null` branch on `type` matters most here: a live
-- payout's physical credit is category `payout_physical_credit`, whose kind is
-- `adjustment`, so without it one half of a pair reads as 'Payout' and the
-- other as 'Adjustment' -- indistinguishable from a real balance correction,
-- and unpairable by type alone. Both halves are 'Payout' now, and the id is
-- what actually joins them.
-- ---------------------------------------------------------------------------
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
				t.transfer_id,
				case
					when t.transfer_id is not null then 'Payout'
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
