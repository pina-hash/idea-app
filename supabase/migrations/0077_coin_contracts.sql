-- 0077_coin_contracts.sql
-- IDEA Coin contracts: post a job, students self-claim it (with capacity),
-- an admin completes it (splitting the payout evenly across whoever claimed
-- it) or cancels it. Built on 0070's Contract Completion category -- this
-- migration adds no new coin_categories row and no new pricing model; every
-- payout is an ordinary `contract_completion` award, logged the same way a
-- single-student Contract Completion entry always has been
-- (coin_log_transaction), just automated across however many students
-- claimed the work.
--
-- ---------------------------------------------------------------------------
-- THE FORMULA IN THE DOCS IS A HINT AT POSTING TIME, NEVER ENFORCED
-- ---------------------------------------------------------------------------
-- docs/coin-economy/idea_coin_economy_draft_v3.md prices Contract Completion
-- as "~1i¢/hour, +50% for specialized skill" -- guidance for an admin
-- estimating what to pay, not a formula this schema computes. 0070 already
-- made this category `pricing_model = 'variable'` for exactly that reason:
-- the admin enters the whole amount. This migration does not change that.
-- `coin_admin_post_contract` takes a plain `p_payout_amount` the admin
-- typed in; the suggested-formula text is shown client-side as a hint only
-- (src/lib/coin-desk/contracts.ts), the same "informational, never
-- enforced" status every *Preview helper in that file already has for the
-- five dedicated RPCs.
--
-- ---------------------------------------------------------------------------
-- WHY max_contractors NEEDS A LOCK, NOT JUST A COUNT-THEN-INSERT
-- ---------------------------------------------------------------------------
-- coin_contract_claims has no single row to lock for a claimant who does not
-- exist yet, so "count current claims, refuse if at capacity, else insert"
-- is a check-then-act race if run unguarded: two students hitting the last
-- open slot at the same moment could both read the same "one slot left"
-- count and both insert. coin_contract_self_claim closes this the standard
-- Postgres way -- `select ... from coin_contracts where id = ... for update`
-- locks the PARENT row first. A second concurrent call blocks on that same
-- lock until the first transaction commits or rolls back; because Postgres
-- gives each STATEMENT inside a transaction a fresh snapshot under the
-- default READ COMMITTED isolation, the second call's count (taken after
-- the wait resolves) genuinely sees the first call's just-committed claim.
-- This is why the row lock, not merely "the RPC does the check", is what
-- makes the guarantee real -- application-level sequencing on one request
-- says nothing about two concurrent ones. The PK on coin_contract_claims
-- (contract_id, student_email) is a second, independent backstop against a
-- literal double-claim by the SAME student, caught with an explicit
-- unique_violation handler below so it returns the same structured refusal
-- shape as every other refusal here instead of a raw constraint error.
--
-- ---------------------------------------------------------------------------
-- STATUS IS COMPUTED, NEVER STORED -- the coin_wage_tiers / Eating Pass
-- doctrine applied a third time: completed_at and cancelled_at are the only
-- state kept on the row (mutually exclusive, enforced by a CHECK); "open",
-- "full", "completed", "cancelled" are derived wherever a contract is read,
-- from those two columns plus a live count of coin_contract_claims. Nothing
-- can drift out of sync with reality because nothing duplicates it.
--
-- ---------------------------------------------------------------------------
-- READ MODEL: A PUBLIC AGGREGATE VIEW FOR BROWSING, ADMIN RPC FOR THE REST
-- ---------------------------------------------------------------------------
-- Students need to browse EVERY contract (not just their own claims), so
-- coin_contracts itself is broadly readable to any signed-in user -- the
-- coin_categories precedent (a price/job list is not sensitive), not the
-- coin_sections/coin_role_definitions one (admin-only reads). But a live
-- claimed_count needs to count across EVERY student's claim rows, and
-- coin_contract_claims' own RLS is intentionally narrow (own rows or admin,
-- the coin_transactions precedent) so one student browsing the board can't
-- see who ELSE is on a contract. coin_contract_status is the resolution:
-- an OWNER-PRIVILEGED view (not security_invoker, so it can aggregate past
-- the base table's RLS) that exposes only a count and a computed status per
-- contract id -- no student identities, so there is no row-level data being
-- bypassed for it to leak (the 0060 rule -- "an owner-privileged view must
-- carry its own row predicate replacing the RLS it bypasses" -- has nothing
-- to apply to here, since every column it returns is a safe aggregate).
-- The admin side wants claimant IDENTITIES too (who is on this contract),
-- which is exactly what coin_contract_claims' RLS keeps from a student, so
-- coin_admin_list_contracts() is a SEPARATE, is_admin()-gated RPC that joins
-- claimant names in, the coin_role_admin_list_applications precedent.
--
-- Apply manually in the Supabase SQL editor, after 0076.

-- ===========================================================================
-- 1. Contracts.
-- ===========================================================================
create table if not exists public.coin_contracts (
	id uuid primary key default gen_random_uuid(),
	title text not null check (char_length(btrim(title)) between 1 and 200),
	description text check (description is null or char_length(description) <= 2000),
	-- The whole job's payout, split across however many students hold it when
	-- it's completed -- never a per-student rate. Free entry (see the header):
	-- the docs' "~1i¢/hour, +50%" formula is a UI hint, not something this
	-- column enforces.
	payout_amount integer not null check (payout_amount > 0),
	max_contractors integer not null default 1 check (max_contractors > 0),
	-- Null = open to every student. Set = restricted to that section's
	-- roster (coin_section_students, 0073), checked at claim time.
	section_id text references public.coin_sections (id) on delete set null,
	created_by text not null,
	created_at timestamptz not null default now(),
	completed_at timestamptz,
	cancelled_at timestamptz,
	cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 500),
	check (completed_at is null or cancelled_at is null)
);

create index if not exists coin_contracts_created_idx on public.coin_contracts (created_at desc);

revoke all on public.coin_contracts from anon, authenticated;
grant select on public.coin_contracts to authenticated;
alter table public.coin_contracts enable row level security;

drop policy if exists "read coin contracts" on public.coin_contracts;
create policy "read coin contracts"
	on public.coin_contracts
	for select
	to authenticated
	using (true);

-- No insert/update/delete policies: every write below goes through a
-- SECURITY DEFINER RPC.

-- ===========================================================================
-- 2. Claims -- one row per student currently on a contract. "Currently
--    claimed" is the row existing; there is no separate status column here
--    either.
-- ===========================================================================
create table if not exists public.coin_contract_claims (
	contract_id uuid not null references public.coin_contracts (id) on delete cascade,
	student_email text not null check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	claimed_at timestamptz not null default now(),
	primary key (contract_id, student_email)
);

create index if not exists coin_contract_claims_student_idx
	on public.coin_contract_claims (student_email);

revoke all on public.coin_contract_claims from anon, authenticated;
grant select on public.coin_contract_claims to authenticated;
alter table public.coin_contract_claims enable row level security;

drop policy if exists "read own or admin coin contract claims" on public.coin_contract_claims;
create policy "read own or admin coin contract claims"
	on public.coin_contract_claims
	for select
	to authenticated
	using (student_email = public.current_user_email() or public.is_admin());

-- No insert/update/delete policies: only coin_contract_self_claim and the
-- admin RPCs below write.

-- ===========================================================================
-- 3. Public status view -- see the header for why this is a view (not an
--    RPC) and why it is safe to grant broadly despite coin_contract_claims'
--    own RLS being narrow.
-- ===========================================================================
create or replace view public.coin_contract_status as
select
	c.id,
	count(k.student_email)::integer as claimed_count,
	case
		when c.completed_at is not null then 'completed'
		when c.cancelled_at is not null then 'cancelled'
		when count(k.student_email) >= c.max_contractors then 'full'
		else 'open'
	end as status
from public.coin_contracts c
left join public.coin_contract_claims k on k.contract_id = c.id
group by c.id, c.completed_at, c.cancelled_at, c.max_contractors;

grant select on public.coin_contract_status to authenticated;

-- ===========================================================================
-- 4. Self-claim -- the one student-facing write. No email parameter: the
--    caller can only ever act as themselves (current_user_email(), the
--    coin_my_eating_pass_status / coin_balance doctrine), so there is no way
--    to claim on another student's behalf. See the header for the locking
--    argument in full.
-- ===========================================================================
create or replace function public.coin_contract_self_claim(p_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_contract public.coin_contracts;
	v_student_section text;
	v_count integer;
begin
	if v_email is null or v_email = '' then
		raise exception 'You must be signed in to claim a contract.';
	end if;

	-- Row-lock the parent contract for the rest of this transaction -- the
	-- serialization point a concurrent claim on the SAME contract blocks on.
	select * into v_contract from public.coin_contracts where id = p_contract_id for update;
	if v_contract.id is null then
		raise exception 'Unknown contract.';
	end if;

	if v_contract.completed_at is not null or v_contract.cancelled_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'not_open');
	end if;

	if v_contract.section_id is not null then
		select section_id into v_student_section
		from public.coin_section_students where student_email = v_email;
		if v_student_section is distinct from v_contract.section_id then
			return jsonb_build_object('ok', false, 'reason', 'wrong_section', 'section_id', v_contract.section_id);
		end if;
	end if;

	if exists (
		select 1 from public.coin_contract_claims
		where contract_id = p_contract_id and student_email = v_email
	) then
		return jsonb_build_object('ok', false, 'reason', 'already_claimed');
	end if;

	select count(*) into v_count from public.coin_contract_claims where contract_id = p_contract_id;
	if v_count >= v_contract.max_contractors then
		return jsonb_build_object(
			'ok', false, 'reason', 'full',
			'max_contractors', v_contract.max_contractors, 'claimed_count', v_count
		);
	end if;

	begin
		insert into public.coin_contract_claims (contract_id, student_email) values (p_contract_id, v_email);
	exception when unique_violation then
		-- Should be unreachable given the lock above and the exists-check just
		-- run under it; kept as a defensive backstop so a duplicate row can
		-- never surface as a raw constraint error instead of this API's own
		-- refusal shape.
		return jsonb_build_object('ok', false, 'reason', 'already_claimed');
	end;

	return jsonb_build_object(
		'ok', true, 'contract_id', p_contract_id,
		'claimed_count', v_count + 1, 'max_contractors', v_contract.max_contractors
	);
end;
$$;

revoke all on function public.coin_contract_self_claim(uuid) from public;
grant execute on function public.coin_contract_self_claim(uuid) to authenticated;

-- ===========================================================================
-- 5. Admin: post a contract.
-- ===========================================================================
create or replace function public.coin_admin_post_contract(
	p_title text,
	p_description text default null,
	p_payout_amount integer default null,
	p_max_contractors integer default 1,
	p_section_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_title text := nullif(btrim(coalesce(p_title, '')), '');
	v_description text := nullif(btrim(coalesce(p_description, '')), '');
	v_section text := nullif(btrim(coalesce(p_section_id, '')), '');
	v_id uuid;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can post a contract.';
	end if;
	if v_title is null then
		raise exception 'A contract needs a title.';
	end if;
	if p_payout_amount is null or p_payout_amount <= 0 then
		raise exception 'A contract needs a positive payout amount.';
	end if;
	if p_max_contractors is null or p_max_contractors <= 0 then
		raise exception 'Max contractors must be at least 1.';
	end if;
	if v_section is not null and not exists (select 1 from public.coin_sections where id = v_section) then
		raise exception 'Unknown coin section "%".', v_section;
	end if;

	insert into public.coin_contracts (title, description, payout_amount, max_contractors, section_id, created_by)
	values (v_title, v_description, p_payout_amount, p_max_contractors, v_section, public.current_user_email())
	returning id into v_id;

	return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.coin_admin_post_contract(text, text, integer, integer, text) from public;
grant execute on function public.coin_admin_post_contract(text, text, integer, integer, text) to authenticated;

-- ===========================================================================
-- 6. Admin: list every contract, claimant identities included -- the read
--    coin_contract_status deliberately withholds from a plain student.
-- ===========================================================================
create or replace function public.coin_admin_list_contracts()
returns table (
	id uuid,
	title text,
	description text,
	payout_amount integer,
	max_contractors integer,
	section_id text,
	created_by text,
	created_at timestamptz,
	completed_at timestamptz,
	cancelled_at timestamptz,
	cancel_reason text,
	claimed_count integer,
	status text,
	claimants jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		c.id, c.title, c.description, c.payout_amount, c.max_contractors, c.section_id,
		c.created_by, c.created_at, c.completed_at, c.cancelled_at, c.cancel_reason,
		count(k.student_email)::integer as claimed_count,
		case
			when c.completed_at is not null then 'completed'
			when c.cancelled_at is not null then 'cancelled'
			when count(k.student_email) >= c.max_contractors then 'full'
			else 'open'
		end as status,
		coalesce(
			(
				select jsonb_agg(
					jsonb_build_object(
						'student_email', k2.student_email,
						'claimed_at', k2.claimed_at,
						'display_name', p.display_name,
						'full_name', p.full_name
					)
					order by k2.claimed_at
				)
				from public.coin_contract_claims k2
				left join public.profiles p on lower(btrim(coalesce(p.email, ''))) = k2.student_email
				where k2.contract_id = c.id
			),
			'[]'::jsonb
		) as claimants
	from public.coin_contracts c
	left join public.coin_contract_claims k on k.contract_id = c.id
	where public.is_admin()
	group by c.id
	order by c.created_at desc;
$$;

revoke all on function public.coin_admin_list_contracts() from public;
grant execute on function public.coin_admin_list_contracts() to authenticated;

-- ===========================================================================
-- 7. Admin: complete a contract -- splits payout_amount evenly across
--    whoever currently holds it and logs each share as an ordinary
--    Contract Completion award (coin_log_transaction, never a direct
--    write), then closes the contract.
-- ===========================================================================
create or replace function public.coin_admin_complete_contract(
	p_contract_id uuid,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_contract public.coin_contracts;
	v_count integer;
	v_share integer;
	v_note text;
	v_claimant record;
	v_call jsonb;
	v_results jsonb := '[]'::jsonb;
	v_succeeded integer := 0;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can complete a contract.';
	end if;

	select * into v_contract from public.coin_contracts where id = p_contract_id for update;
	if v_contract.id is null then
		raise exception 'Unknown contract.';
	end if;
	if v_contract.completed_at is not null then
		raise exception 'This contract was already completed.';
	end if;
	if v_contract.cancelled_at is not null then
		raise exception 'This contract was cancelled and cannot be completed.';
	end if;

	select count(*) into v_count from public.coin_contract_claims where contract_id = p_contract_id;
	if v_count = 0 then
		raise exception 'No one has claimed this contract yet -- there is no one to pay.';
	end if;

	-- Even split, rounded with Postgres round() -- half rounds away from
	-- zero, the SAME convention 3D Printing's material charge and Property
	-- Damage's exchange rate already use elsewhere in this schema (see
	-- coin_log_three_d_printing / coin_log_property_damage_careless). Every
	-- claimant gets the identical rounded share; when payout_amount does not
	-- divide evenly the total actually paid can differ from payout_amount by
	-- a coin or two either way. Accepted deliberately: singling out which
	-- claimant gets an odd leftover coin is a judgment call this migration
	-- does not make, the same way per-unit rates round elsewhere in this
	-- schema without a reconciliation step.
	v_share := round(v_contract.payout_amount::numeric / v_count)::integer;
	v_note := coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Contract completion: ' || v_contract.title);

	for v_claimant in
		select student_email from public.coin_contract_claims
		where contract_id = p_contract_id
		order by student_email
	loop
		begin
			-- The EXISTING Contract Completion category, the same one a single-
			-- student entry already used before this migration -- no new
			-- pricing model, no duplicated debt/cap logic to drift.
			v_call := public.coin_log_transaction(v_claimant.student_email, 'contract_completion', v_share, null, v_note);
		exception when others then
			v_call := jsonb_build_object('ok', false, 'reason', 'error', 'message', sqlerrm);
		end;
		if coalesce((v_call ->> 'ok')::boolean, false) then
			v_succeeded := v_succeeded + 1;
		end if;
		v_results := v_results || jsonb_build_array(jsonb_build_object('email', v_claimant.student_email) || v_call);
	end loop;

	update public.coin_contracts set completed_at = now() where id = p_contract_id;

	return jsonb_build_object(
		'ok', true, 'contract_id', p_contract_id, 'share', v_share, 'claimant_count', v_count,
		'succeeded', v_succeeded, 'results', v_results
	);
end;
$$;

revoke all on function public.coin_admin_complete_contract(uuid, text) from public;
grant execute on function public.coin_admin_complete_contract(uuid, text) to authenticated;

-- ===========================================================================
-- 8. Admin: cancel a contract -- no payout, ever (see coin_admin_complete_
--    contract for the only path that pays anyone). Claims are left in place
--    as a historical record, the revoke-not-delete convention this schema
--    uses everywhere (coin_role_holders, coin_section_students).
-- ===========================================================================
create or replace function public.coin_admin_cancel_contract(
	p_contract_id uuid,
	p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_contract public.coin_contracts;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can cancel a contract.';
	end if;

	select * into v_contract from public.coin_contracts where id = p_contract_id for update;
	if v_contract.id is null then
		raise exception 'Unknown contract.';
	end if;
	if v_contract.completed_at is not null then
		raise exception 'This contract was already completed and cannot be cancelled.';
	end if;
	if v_contract.cancelled_at is not null then
		raise exception 'This contract was already cancelled.';
	end if;

	update public.coin_contracts
		set cancelled_at = now(), cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')
		where id = p_contract_id;

	return jsonb_build_object('ok', true, 'contract_id', p_contract_id);
end;
$$;

revoke all on function public.coin_admin_cancel_contract(uuid, text) from public;
grant execute on function public.coin_admin_cancel_contract(uuid, text) to authenticated;

-- ===========================================================================
-- 9. Admin: reset a contract -- clears every claim and returns it to open.
--    Only valid while it is still neither completed nor cancelled (both are
--    genuinely terminal; there is no "un-complete" or "un-cancel" here,
--    matching that no other RPC in this schema reopens a closed record).
-- ===========================================================================
create or replace function public.coin_admin_reset_contract(p_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_contract public.coin_contracts;
	v_cleared integer;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can reset a contract.';
	end if;

	select * into v_contract from public.coin_contracts where id = p_contract_id for update;
	if v_contract.id is null then
		raise exception 'Unknown contract.';
	end if;
	if v_contract.completed_at is not null or v_contract.cancelled_at is not null then
		raise exception 'Cannot reset a contract that has already been completed or cancelled.';
	end if;

	delete from public.coin_contract_claims where contract_id = p_contract_id;
	get diagnostics v_cleared = row_count;

	return jsonb_build_object('ok', true, 'contract_id', p_contract_id, 'cleared', v_cleared);
end;
$$;

revoke all on function public.coin_admin_reset_contract(uuid) from public;
grant execute on function public.coin_admin_reset_contract(uuid) to authenticated;
