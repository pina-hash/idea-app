-- 0295_coin_contracts_retired.sql
--
-- CONTRACTS ARE RETIRED (ledger 0432, feedback 00463d19, connector gap
-- 3f52bae9). Mr. Pina, 2026-10-23: "No more Coin Desk contracts: everything
-- is on the marketplace now." Jobs live on the IDEA Market; a Coin Desk
-- contract is no longer posted, claimed, finished or paid.
--
-- WHAT THIS FILE DOES
--
--   1. CLOSES EVERY OPEN OR FULL CONTRACT AND PAYS NOBODY. The IDEA Coin
--      Launcher contract closes as DONE (completed_at): its student was paid
--      20 by hand as a Contract Completion on 2026-10-21, so there is no
--      second payout. Every other contract still open closes as cancelled,
--      with the reason saying where jobs went; claims are kept as the record,
--      exactly as a cancel always kept them. Any contract card still waiting
--      in the coin queue is set to cancelled with nothing paid, because
--      approving it is the one path left that would pay.
--   2. CLOSES THE WAY IN. Every function that posts, edits, assigns, cancels, resets,
--      restores, claims, finishes or completes a contract loses its client
--      grant (every overload, found in the catalog), so nothing can open or
--      pay a contract again. The reads stay, so a student's coin history and
--      the old Ledger still show what happened.
--   3. THE STUDENT SEAM SAYS WHO IS ASKING. Gap 3f52bae9's "not_in_economy"
--      was the seam answering for the CALLER: the connector ran a student's
--      own "I finished this contract" action as Mr. Pina, and a staff account
--      is never a coin member. The seam now answers 'staff_account' to coin
--      staff, so a student action reached from a staff account says so in
--      words instead of claiming the student is outside the economy. Nothing
--      changes for a student: the new branch runs only where the old one
--      already refused.
--
-- The connector's half (no student action reachable as a staff tool) is in
-- tools/connector/gates.mjs, tested by tests/connector-coverage.test.ts.
--
-- SEED DATA RULE: the closing writes run inside a do block (CLAUDE.md:
-- tools/apply-migration.mjs refuses top-level DML). RE-APPLYING writes
-- nothing: every update is keyed on the row still being open or pending.
--
-- WHAT UNDOES IT: grant execute back to authenticated on the functions named
-- in part 2, and re-paste 0241's _coin_student_seam. The closed contracts stay
-- closed; reopening one is coin_admin_restore_contract after the grant.

do $pre$
begin
	if to_regclass('public.coin_contracts') is null or to_regclass('public.coin_contract_claims') is null then
		raise exception '0295 cannot apply: the coin contract tables do not exist. Apply 0077 first.';
	end if;
	if to_regclass('public.coin_requests') is null then
		raise exception '0295 cannot apply: coin_requests does not exist. Apply 0245 first.';
	end if;
	if to_regprocedure('public._coin_student_seam(text)') is null or to_regprocedure('public._coin_staff()') is null then
		raise exception '0295 cannot apply: the coin student seam or the coin staff gate is missing. Apply 0241 and 0244 first.';
	end if;
end
$pre$;

-- 1. Close every open or full contract; pay nobody.
do $close$
declare
	v_requests integer;
	v_done integer;
	v_cancelled integer;
begin
	update public.coin_requests
	set status = 'cancelled', decided_at = now(), decided_by = 'system',
		decision_note = 'Contracts are retired. Nothing was paid; jobs are on the IDEA Market now.'
	where kind = 'contract' and status = 'pending';
	get diagnostics v_requests = row_count;

	update public.coin_contracts
	set completed_at = now()
	where completed_at is null and cancelled_at is null and title ilike '%coin launcher%';
	get diagnostics v_done = row_count;

	update public.coin_contracts
	set cancelled_at = now(), cancel_reason = 'Contracts are retired. Jobs are posted on the IDEA Market now.'
	where completed_at is null and cancelled_at is null;
	get diagnostics v_cancelled = row_count;

	raise notice '0295: % waiting contract cards cancelled unpaid, % contract closed as done (the IDEA Coin Launcher), % contracts closed as cancelled',
		v_requests, v_done, v_cancelled;
end
$close$;

-- 2. Close the way in: no client may post, change, claim, finish or pay a contract.
do $grants$
declare
	f regprocedure;
	n integer := 0;
begin
	for f in
		select p.oid::regprocedure from pg_catalog.pg_proc p
		join pg_catalog.pg_namespace s on s.oid = p.pronamespace and s.nspname = 'public'
		where p.proname in (
			'coin_contract_post', 'coin_contract_self_claim', 'coin_contract_mark_done',
			'coin_admin_post_contract', 'coin_admin_edit_contract', 'coin_admin_assign_contract',
			'coin_admin_reset_contract', 'coin_admin_restore_contract', 'coin_admin_complete_contract', 'coin_admin_cancel_contract')
	loop
		execute format('revoke all on function %s from public, anon, authenticated', f);
		n := n + 1;
	end loop;
	raise notice '0295: % contract write functions closed to every client', n;
end
$grants$;

-- 3. The student seam: 0241's body, with a staff caller named as such.
create or replace function public._coin_student_seam(p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_limit integer := coalesce((public._coin_setting('student_actions_per_minute') #>> '{}')::integer, 10);
	v_recent integer;
begin
	if (select auth.uid()) is null or v_email is null or v_email = '' then
		return jsonb_build_object('ok', false, 'reason', 'signed_out');
	end if;
	if not exists (select 1 from public._coin_economy_enrollments() x where x.student_email = v_email) then
		-- 0295: a staff account is never a member; say that, not "not in the economy".
		if public._coin_staff() then
			return jsonb_build_object('ok', false, 'reason', 'staff_account');
		end if;
		return jsonb_build_object('ok', false, 'reason', 'not_in_economy');
	end if;
	-- One student's actions serialize here, so the count below is exact.
	perform pg_advisory_xact_lock(hashtext('coin_student_seam:' || v_email));
	select count(*) into v_recent from public.coin_student_actions a
	where a.student_email = v_email and a.created_at > now() - interval '1 minute';
	if v_recent >= v_limit then
		return jsonb_build_object('ok', false, 'reason', 'rate_limited');
	end if;
	insert into public.coin_student_actions (student_email, action) values (v_email, p_action);
	delete from public.coin_student_actions a
	where a.student_email = v_email and a.created_at < now() - interval '1 day';
	return jsonb_build_object('ok', true, 'email', v_email);
end;
$$;
revoke all on function public._coin_student_seam(text) from public, anon, authenticated, service_role;

do $post$
declare
	v_open integer;
	v_granted integer;
begin
	select count(*) into v_open from public.coin_contracts where completed_at is null and cancelled_at is null;
	if v_open > 0 then
		raise exception '0295 self-check failed: % contracts are still open.', v_open;
	end if;
	select count(*) into v_granted from pg_catalog.pg_proc p
	join pg_catalog.pg_namespace s on s.oid = p.pronamespace and s.nspname = 'public'
	where p.proname in ('coin_contract_post', 'coin_contract_self_claim', 'coin_contract_mark_done',
			'coin_admin_post_contract', 'coin_admin_edit_contract', 'coin_admin_assign_contract',
			'coin_admin_reset_contract', 'coin_admin_restore_contract', 'coin_admin_complete_contract', 'coin_admin_cancel_contract')
		and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'));
	if v_granted > 0 then
		raise exception '0295 self-check failed: % contract write functions are still executable by a client.', v_granted;
	end if;
	if has_function_privilege('authenticated', 'public._coin_student_seam(text)', 'execute') then
		raise exception '0295 self-check failed: the student seam is executable by a client.';
	end if;
end
$post$;
