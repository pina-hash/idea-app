-- ===========================================================================
-- 0107_coin_public_adjustment_bucket.sql
--
-- APPLY MANUALLY IN THE SUPABASE SQL EDITOR, AFTER 0106.
--
-- ADJUSTMENTS GET THEIR OWN BUCKET, BECAUSE COUNTING ONE AS AN EARNING IS AN
-- EXPLOIT AND NOT MERELY AN UNTIDY NUMBER.
--
-- 0089 defined `awarded` as EVERY positive row and `spent` as EVERY negative
-- non-fine row. That was right when every row was a priced event. It is not
-- right for an `adjustment`-kind row, which is a CORRECTION OF THE RECORD
-- rather than something the student earned or spent -- and the Ledger's
-- "Lifetime Earned" headline is `awarded - fines`, which the leaderboard's
-- DEFAULT SORT ranks by.
--
-- So a refund climbed the board. In production, Seth Delgadillo was awarded
-- 111i¢ and read 151 because a +40 refund was counted as income; Ezio
-- Veneziano was awarded 57 and read 107. A student could buy something, take
-- a refund, and rank higher for it -- repeatably, since the pair nets to zero
-- in the balance and leaves nothing to notice.
--
-- The mirror case is the same bug with the sign flipped: a NEGATIVE adjustment
-- fell into `spent`, because that bucket was "any negative that is not a fine".
-- A correction taking coins back read as the student having bought something.
--
-- The fix is one bucket, not two special cases. An `adjustment`-kind row is
-- excluded from `awarded` AND from `spent` REGARDLESS OF ITS SIGN, and its
-- signed amount is summed into a new `adjustments` column. The identity the
-- page reconciles with becomes:
--
--     balance = awarded - fines - spent + adjustments
--
-- and Lifetime Earned stays `awarded - fines`, which now excludes adjustments
-- entirely -- which is the whole point.
--
-- WHAT DOES *NOT* MOVE, DELIBERATELY:
--
--   * LEGACY WEALTH DECLARATIONS STILL COUNT TOWARD LIFETIME EARNED. They are
--     `legacy_award` rows (kind `award`) recording coins a student genuinely
--     earned before this system existed. Only kind `adjustment` moves.
--
--   * `fines` is untouched. An adjustment is never fine-kind, so that filter
--     already excluded them and adding a clause would only suggest otherwise.
--
--   * `balance` is untouched. It is the sum of everything and always was.
--
--   * 0103'S TRANSFER EXCLUSION IS UNTOUCHED AND IS NOT REPLACED BY THIS ONE.
--     They answer different questions and BOTH still apply: a transfer is
--     coins changing form, an adjustment is the record being corrected. The
--     new bucket therefore carries `transfer_id is null` too -- without it a
--     live payout's physical half (`payout_physical_credit`, kind
--     `adjustment`) would land in `adjustments` and re-inflate exactly the
--     figure 0103 deflated. A student with both a withdrawal and a refund is
--     the case where the two exclusions have to compose, and they do.
--
-- THE ABSOLUTE RULE OF 0089 IS UNTOUCHED: no email, in any form, through any
-- parameter or field. `adjustments` is an integer.
--
-- SIGNATURE NOTE: `coin_public_leaderboard` gains an OUTPUT column, which is a
-- return-type change, so it is DROPPED first -- `create or replace` alone
-- refuses one (the 0058/0076/0096/0103 trap). Its argument list is empty and
-- unchanged, so no second overload can survive.
--
-- ONE COMPUTATION SITE, ON PURPOSE. `coin_public_student` (the drawer) does
-- NOT compute these buckets and deliberately still does not: the drawer renders
-- the SAME leaderboard row the card does and calls the per-student endpoint
-- only for the eating-pass flag and the history. Giving it its own copy of the
-- bucket rule is precisely the drift this migration exists to end -- two
-- numbers on one screen that disagree.
--
-- DEPLOY ORDERING: apply this BEFORE deploying a client that reads
-- `Adjustments`. A client shipped ahead of it simply does not see the column,
-- renders no Adjustments figure, and falls back to the pre-0107 identity --
-- degraded, not broken.
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
	adjustments integer,
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
			-- TWO exclusions, and neither replaces the other. A transfer's two
			-- halves are coins changing form (0103); an adjustment-kind row is
			-- the record being corrected (this file). Both are excluded from
			-- awarded and from spent.
			coalesce(sum(t.amount) filter (
				where t.amount > 0 and t.transfer_id is null and cat.kind <> 'adjustment'
			), 0)::integer as awarded,
			coalesce(-sum(t.amount) filter (where t.amount < 0 and cat.kind = 'fine'), 0)::integer as fines,
			coalesce(-sum(t.amount) filter (
				where t.amount < 0 and cat.kind not in ('fine', 'adjustment') and t.transfer_id is null
			), 0)::integer as spent,
			-- The new bucket: every adjustment-kind row, at its STORED SIGN, so
			-- a refund reads +N and a clawback reads -N. `transfer_id is null`
			-- keeps a payout's physical credit out of it -- that row is
			-- adjustment-kind but is not a correction, it is half a transfer.
			coalesce(sum(t.amount) filter (
				where cat.kind = 'adjustment' and t.transfer_id is null
			), 0)::integer as adjustments,
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
		coalesce(tt.adjustments, 0),
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
