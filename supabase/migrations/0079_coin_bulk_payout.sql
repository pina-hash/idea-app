-- 0079_coin_bulk_payout.sql
-- IDEA Coin bulk payout: pay every student with a positive balance, one at a
-- time or all at once, converting their digital balance to physical coins
-- handed over. Reuses the EXISTING coin_payout category (0070, purchase-kind,
-- 'variable' pricing, already loggable through the single-student Coin Desk
-- flow) as the actual write -- this migration adds no new category and no new
-- pricing model, only two RPCs that resolve WHO to pay and HOW MUCH, freshly,
-- at the moment they run.
--
-- ---------------------------------------------------------------------------
-- THE RACE THIS EXISTS TO CLOSE
-- ---------------------------------------------------------------------------
-- A payout list loaded in the browser is a snapshot. Between that load and an
-- admin clicking "Pay" (or "Pay All"), another admin could log a fine or an
-- award against the same student -- the balance the client is holding is
-- already stale by the time the button is pressed. Neither RPC below ever
-- takes a client-supplied amount: coin_payout_student re-reads
-- sum(coin_transactions.amount) for the student INSIDE this function, in the
-- same statement that decides what to log, so whatever it pays is exactly
-- the ledger's answer at that instant -- never a number carried over from
-- when the list was fetched.
--
-- ---------------------------------------------------------------------------
-- coin_bulk_payout NESTS coin_payout_student -- the coin_bulk_log_role_stipend
-- SHAPE, NOT A NEW ONE
-- ---------------------------------------------------------------------------
-- coin_bulk_payout's roster (every student with sum(amount) > 0, read fresh
-- at the top of the loop) is itself a snapshot the instant the loop starts,
-- but that snapshot only decides WHO to attempt -- it is coin_payout_student,
-- called once per student INSIDE the loop, that re-reads that one student's
-- balance again immediately before writing. So a fine landing on student #7
-- while student #3 is being paid is picked up correctly when the loop
-- reaches #7, exactly the guarantee 0074's coin_bulk_log_role_stipend already
-- established for a different roster (active role holders instead of
-- positive balances). Both RPCs return the same structured
-- {ok, total, succeeded, refused, results} shape, so one student having
-- nothing left to pay by the time they're reached (results in a graceful
-- 'no_balance' refusal, never an exception) can never obscure whether the
-- rest of the list succeeded.
--
-- Apply manually in the Supabase SQL editor, after 0078.

-- ===========================================================================
-- Pay ONE student: whatever their balance is RIGHT NOW, converted to zero.
-- ===========================================================================
create or replace function public.coin_payout_student(
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
	v_balance integer;
	v_note text := coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Coin payout.');
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;

	-- Read fresh, in this statement, never passed in by the caller.
	select coalesce(sum(amount), 0) into v_balance
	from public.coin_transactions
	where student_email = v_email;

	if v_balance <= 0 then
		return jsonb_build_object('ok', false, 'reason', 'no_balance', 'balance', v_balance);
	end if;

	-- coin_log_transaction's own 'purchase' branch negates the magnitude for
	-- us (kind = 'purchase' -> signed = -magnitude), so passing the CURRENT
	-- positive balance as the amount converts it to exactly zero. This is the
	-- SAME RPC the single-student "Coin Payout" category entry already calls
	-- -- no second write path, no re-derived enforcement.
	return public.coin_log_transaction(v_email, 'coin_payout', v_balance, null, v_note);
end;
$$;

revoke all on function public.coin_payout_student(text, text) from public;
grant execute on function public.coin_payout_student(text, text) to authenticated;

-- ===========================================================================
-- Pay EVERY student with a positive balance, in one round trip.
-- ===========================================================================
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
		having sum(amount) > 0
		order by student_email
	loop
		v_total := v_total + 1;
		begin
			-- The single-student RPC above, nested -- exactly the pattern
			-- coin_bulk_log_role_stipend already relies on: SECURITY DEFINER
			-- nesting does not change what is_admin() resolves to, so this
			-- inner call is authorized as the same admin who called us, and it
			-- re-reads THIS student's balance fresh, right here, regardless of
			-- what it was when the outer roster was selected above.
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
