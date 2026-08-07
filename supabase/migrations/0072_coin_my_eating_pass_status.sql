-- 0072_coin_my_eating_pass_status.sql
-- Closes a duplication risk on /coin-balance (the student-facing counterpart
-- to /coin-desk, 0070): that page used to RE-IMPLEMENT
-- coin_eating_pass_active / coin_eating_pass_strikes in TypeScript, because
-- 0070 never granted execute on either to `authenticated` -- only their
-- SECURITY DEFINER callers (coin_log_transaction, coin_admin_lookup) could
-- reach them. Two independent copies of the same rule is exactly the kind of
-- thing that silently drifts if the SQL is ever tuned later and the TS copy
-- is not; this migration removes the second copy by exposing the real rule
-- instead of re-deriving it.
--
-- coin_my_eating_pass_status() is a THIN, NO-PARAMETER wrapper: it resolves
-- the caller's own identity via current_user_email() -- the exact function
-- coin_transactions' and coin_wage_tiers' own RLS policies already key on --
-- and calls the two existing functions DIRECTLY. There is no new logic here,
-- only a safe way for a signed-in student to read their own answer to a rule
-- that already exists in exactly one place.
--
-- Apply manually in the Supabase SQL editor, after 0071.

create or replace function public.coin_my_eating_pass_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'active', public.coin_eating_pass_active(public.current_user_email()),
		'strikes', public.coin_eating_pass_strikes(public.current_user_email())
	);
$$;

-- No parameters at all -- there is nothing to pass, since the caller can
-- only ever ask about themselves. Revoked from public like every other
-- coin_* function, then granted to authenticated (the read side, like
-- current_user_email() itself): any signed-in user may call this, but it can
-- only ever answer for public.current_user_email(), never another email.
revoke all on function public.coin_my_eating_pass_status() from public;
grant execute on function public.coin_my_eating_pass_status() to authenticated;
