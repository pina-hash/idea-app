-- 0248_coin_v2_contracts_and_tournaments.sql
--
-- IDEA COIN V2, SESSION TWO, PART FIVE (ledger 0385): CONTRACTS THROUGH THE
-- QUEUE (2.8) AND THE TOURNAMENT TRANSFER (2.9).
--
-- CONTRACTS. A contract pays digital and carries a pay type, set when it is
-- posted: `hourly` (the student reports hours, paid at the contract's rate),
-- `flat` (the payout split between its claimants) or `quality` (a base, which
-- Mr. Pina adjusts at approval). The student marks the work done and that
-- writes a `contract` card with the amount filled in; the approver may change
-- the amount, then approves, and the coins are paid then. When every claimant
-- of a contract has an approved card, the contract is completed. A contract
-- may be a RESTITUTION JOB (debt_only): visible to and claimable by only a
-- student whose balance is below zero. Restriction to one class is an IDEA
-- Classroom section now (class_section_id); the old coin-section column is
-- history and is no longer read.
--
-- TOURNAMENTS. A concluded tournament with rewards awaiting transfer is
-- listed with every participant, amounts filled in from the recorded earned
-- amounts (and from placement, by the tournament_placement_defaults setting,
-- where no rule set one). A team entry is split among its members or
-- duplicated to each, chosen on the screen. Transfer posts
-- competition_winnings digitally per student, once (the settlement row is
-- the lock); Paid physically records that the coins were handed over and
-- moves nothing. Either way the tournament keeps its record. A participant
-- with no account is listed and skipped.
--
-- UNDO: drop the functions and the coin_tournament_settlements table this
-- file creates; the new contract columns may stay (nothing else reads them).

-- THE FIRST OBJECT IS NEW (the apply probe reads the first created object).
create table if not exists public.coin_tournament_settlements (
	tournament_id uuid primary key references public.tournaments (id) on delete cascade,
	outcome text not null check (outcome in ('transferred', 'paid_physically')),
	mode text check (mode is null or mode in ('split', 'duplicate')),
	detail jsonb not null default '{}'::jsonb,
	settled_by text not null,
	settled_at timestamptz not null default now()
);
alter table public.coin_tournament_settlements enable row level security;
revoke all on table public.coin_tournament_settlements from public, anon, authenticated, service_role;

alter table public.coin_contracts add column if not exists pay_type text not null default 'flat';
alter table public.coin_contracts add column if not exists hourly_rate numeric(12,2);
alter table public.coin_contracts add column if not exists debt_only boolean not null default false;
alter table public.coin_contracts add column if not exists class_section_id uuid references public.classroom_sections (id) on delete set null;
do $c$
begin
	if not exists (select 1 from pg_catalog.pg_constraint where conname = 'coin_contracts_pay_type') then
		alter table public.coin_contracts add constraint coin_contracts_pay_type
			check (pay_type in ('hourly', 'flat', 'quality')
				and (pay_type <> 'hourly' or (hourly_rate is not null and hourly_rate > 0)));
	end if;
end
$c$;
alter table public.coin_contract_claims add column if not exists done_at timestamptz;
alter table public.coin_contract_claims add column if not exists hours numeric(8,2);
alter table public.coin_contract_claims add column if not exists request_id uuid;
alter table public.coin_contract_claims add column if not exists paid_at timestamptz;

-- ===== PART A BEGIN =====
-- ===== PART A: CONTRACTS =====

-- Can this student see (and claim) this contract?
create or replace function public._coin_contract_visible(c public.coin_contracts, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select (not c.debt_only or public._coin_balance(p_email) < 0)
		and (c.class_section_id is null or exists (select 1 from public._coin_economy_enrollments() x
			where x.student_email = p_email and x.section_id = c.class_section_id));
$$;
revoke all on function public._coin_contract_visible(public.coin_contracts, text) from public, anon, authenticated, service_role;

create or replace function public.coin_contract_post(
	p_title text,
	p_description text,
	p_pay_type text,
	p_payout_amount integer,
	p_hourly_rate numeric,
	p_max_contractors integer,
	p_section_id uuid,
	p_debt_only boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_title text := nullif(btrim(coalesce(p_title, '')), '');
	v_id uuid;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can post a contract.';
	end if;
	if v_title is null or char_length(v_title) > 200 then
		return jsonb_build_object('ok', false, 'reason', 'title');
	end if;
	if coalesce(p_pay_type, '') not in ('hourly', 'flat', 'quality') then
		return jsonb_build_object('ok', false, 'reason', 'pay_type');
	end if;
	if p_pay_type = 'hourly' and (p_hourly_rate is null or p_hourly_rate <= 0 or p_hourly_rate > 1000) then
		return jsonb_build_object('ok', false, 'reason', 'hourly_rate');
	end if;
	if p_pay_type <> 'hourly' and (p_payout_amount is null or p_payout_amount <= 0) then
		return jsonb_build_object('ok', false, 'reason', 'payout');
	end if;
	if p_max_contractors is null or p_max_contractors < 1 or p_max_contractors > 50 then
		return jsonb_build_object('ok', false, 'reason', 'max_contractors');
	end if;
	if p_section_id is not null and not exists (select 1 from public.classroom_sections where id = p_section_id) then
		return jsonb_build_object('ok', false, 'reason', 'unknown_class');
	end if;
	insert into public.coin_contracts (title, description, payout_amount, max_contractors, section_id, created_by,
		pay_type, hourly_rate, debt_only, class_section_id)
	values (v_title, nullif(btrim(coalesce(p_description, '')), ''),
		case when p_pay_type = 'hourly' then coalesce(p_payout_amount, 1) else p_payout_amount end,
		p_max_contractors, null, public.current_user_email(), p_pay_type,
		case when p_pay_type = 'hourly' then round(p_hourly_rate, 2) end, coalesce(p_debt_only, false), p_section_id)
	returning id into v_id;
	return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.coin_contract_post(text, text, text, integer, numeric, integer, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.coin_contract_post(text, text, text, integer, numeric, integer, uuid, boolean) to authenticated;

-- Claiming: same signature as 0077's; the class and the restitution rule are
-- the V2 ones.
create or replace function public.coin_contract_self_claim(p_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_contract public.coin_contracts;
	v_count integer;
begin
	if v_email is null or v_email = '' then
		raise exception 'You must be signed in to claim a contract.';
	end if;
	select * into v_contract from public.coin_contracts where id = p_contract_id for update;
	if v_contract.id is null then
		raise exception 'Unknown contract.';
	end if;
	if v_contract.completed_at is not null or v_contract.cancelled_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'not_open');
	end if;
	if not public._coin_contract_visible(v_contract, v_email) then
		return jsonb_build_object('ok', false, 'reason',
			case when v_contract.debt_only then 'debt_only' else 'wrong_section' end);
	end if;
	if exists (select 1 from public.coin_contract_claims where contract_id = p_contract_id and student_email = v_email) then
		return jsonb_build_object('ok', false, 'reason', 'already_claimed');
	end if;
	select count(*) into v_count from public.coin_contract_claims where contract_id = p_contract_id;
	if v_count >= v_contract.max_contractors then
		return jsonb_build_object('ok', false, 'reason', 'full', 'max_contractors', v_contract.max_contractors,
			'claimed_count', v_count);
	end if;
	insert into public.coin_contract_claims (contract_id, student_email) values (p_contract_id, v_email);
	return jsonb_build_object('ok', true, 'contract_id', p_contract_id, 'claimed_count', v_count + 1,
		'max_contractors', v_contract.max_contractors);
end;
$$;
revoke all on function public.coin_contract_self_claim(uuid) from public, anon, authenticated, service_role;
grant execute on function public.coin_contract_self_claim(uuid) to authenticated;

-- What a contract would pay one claimant now.
create or replace function public._coin_contract_amount(c public.coin_contracts, p_hours numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
	select case c.pay_type
		when 'hourly' then round(coalesce(c.hourly_rate, 0) * coalesce(p_hours, 0), 2)
		else round(c.payout_amount::numeric / greatest((select count(*) from public.coin_contract_claims k
			where k.contract_id = c.id), 1), 2)
	end;
$$;
revoke all on function public._coin_contract_amount(public.coin_contracts, numeric) from public, anon, authenticated, service_role;

-- The student marks their part done: a queue card with the amount filled in.
create or replace function public.coin_contract_mark_done(p_contract_id uuid, p_hours numeric default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb := public._coin_student_seam('contract_done');
	v_email text;
	v_contract public.coin_contracts;
	v_claim public.coin_contract_claims;
	v_req public.coin_requests;
begin
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	select * into v_contract from public.coin_contracts where id = p_contract_id for update;
	if v_contract.id is null or v_contract.completed_at is not null or v_contract.cancelled_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'not_open');
	end if;
	select * into v_claim from public.coin_contract_claims where contract_id = p_contract_id and student_email = v_email;
	if v_claim.contract_id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_claimed');
	end if;
	if v_claim.done_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'already_done');
	end if;
	if v_contract.pay_type = 'hourly' and (p_hours is null or p_hours <= 0 or p_hours > 200) then
		return jsonb_build_object('ok', false, 'reason', 'hours');
	end if;
	v_req := public._coin_new_request('contract', v_email, public._coin_contract_amount(v_contract, p_hours), null,
		jsonb_build_object('contract_id', v_contract.id::text, 'title', v_contract.title, 'pay_type', v_contract.pay_type,
			'hours', p_hours, 'hourly_rate', v_contract.hourly_rate, 'payout_amount', v_contract.payout_amount,
			'debt_only', v_contract.debt_only), p_note);
	update public.coin_contract_claims set done_at = now(), hours = p_hours, request_id = v_req.id
	where contract_id = p_contract_id and student_email = v_email;
	return jsonb_build_object('ok', true, 'request_id', v_req.id, 'amount', v_req.amount);
end;
$$;
revoke all on function public.coin_contract_mark_done(uuid, numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_contract_mark_done(uuid, numeric, text) to authenticated;

-- Called by _coin_decide (0245). Approve pays; deny hands the work back.
create or replace function public._coin_decide_contract(p_req public.coin_requests, p_approve boolean, p_amount numeric, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_contract_id uuid := (p_req.payload ->> 'contract_id')::uuid;
	v_row public.coin_transactions;
	v_amount numeric := round(coalesce(p_amount, 0), 2);
	v_left integer;
begin
	if not p_approve then
		update public.coin_contract_claims set done_at = null, request_id = null
		where contract_id = v_contract_id and student_email = p_req.student_email;
		return jsonb_build_object('handed_back', true);
	end if;
	if p_amount is null then
		return jsonb_build_object('ok', false, 'reason', 'amount_required');
	end if;
	if v_amount > 0 then
		v_row := public._coin_insert(p_req.student_email, 'contract_completion', v_amount, (p_req.payload ->> 'hours')::numeric,
			'Contract completion: ' || coalesce(p_req.payload ->> 'title', 'contract') || '.',
			jsonb_build_object('request_id', p_req.id::text, 'contract_id', v_contract_id::text,
				'pay_type', p_req.payload ->> 'pay_type'), 'digital', null, p_actor);
	end if;
	update public.coin_contract_claims set paid_at = now()
	where contract_id = v_contract_id and student_email = p_req.student_email;
	select count(*) into v_left from public.coin_contract_claims k where k.contract_id = v_contract_id and k.paid_at is null;
	if v_left = 0 then
		update public.coin_contracts set completed_at = now() where id = v_contract_id and completed_at is null;
	end if;
	return jsonb_build_object('transaction_id', v_row.id, 'paid', v_amount, 'contract_completed', v_left = 0);
end;
$$;
revoke all on function public._coin_decide_contract(public.coin_requests, boolean, numeric, text) from public, anon, authenticated, service_role;

-- A student's contracts: what they may claim, and what they hold.
create or replace function public.coin_my_contracts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
begin
	if (select auth.uid()) is null or v_email = '' then
		return '[]'::jsonb;
	end if;
	return coalesce((select jsonb_agg(jsonb_build_object(
			'id', c.id, 'title', c.title, 'description', c.description, 'pay_type', c.pay_type,
			'payout_amount', c.payout_amount, 'hourly_rate', c.hourly_rate, 'debt_only', c.debt_only,
			'max_contractors', c.max_contractors,
			'claimed_count', (select count(*) from public.coin_contract_claims k where k.contract_id = c.id),
			'section', public._coin_classroom_section_label(c.class_section_id),
			'mine', k.contract_id is not null, 'done_at', k.done_at, 'paid_at', k.paid_at,
			'request_status', (select r.status from public.coin_requests r where r.id = k.request_id),
			'estimate', public._coin_contract_amount(c, k.hours),
			'created_at', c.created_at)
			order by (k.contract_id is not null) desc, c.created_at desc)
		from public.coin_contracts c
		left join public.coin_contract_claims k on k.contract_id = c.id and k.student_email = v_email
		where (k.contract_id is not null and k.paid_at is null and c.cancelled_at is null)
			or (c.completed_at is null and c.cancelled_at is null and public._coin_contract_visible(c, v_email))), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_my_contracts() from public, anon, authenticated, service_role;
grant execute on function public.coin_my_contracts() to authenticated;

-- The Coin Desk's list, claimants and their card state included.
create or replace function public.coin_contracts_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can manage contracts.';
	end if;
	return coalesce((select jsonb_agg(jsonb_build_object(
			'id', c.id, 'title', c.title, 'description', c.description, 'pay_type', c.pay_type,
			'payout_amount', c.payout_amount, 'hourly_rate', c.hourly_rate, 'debt_only', c.debt_only,
			'max_contractors', c.max_contractors, 'section_id', c.class_section_id,
			'section', public._coin_classroom_section_label(c.class_section_id),
			'created_at', c.created_at, 'completed_at', c.completed_at, 'cancelled_at', c.cancelled_at,
			'cancel_reason', c.cancel_reason,
			'status', case when c.completed_at is not null then 'completed' when c.cancelled_at is not null then 'cancelled'
				when (select count(*) from public.coin_contract_claims k where k.contract_id = c.id) >= c.max_contractors then 'full'
				else 'open' end,
			'claimants', coalesce((select jsonb_agg(jsonb_build_object('email', k.student_email,
					'name', public._coin_student_name(k.student_email), 'claimed_at', k.claimed_at,
					'done_at', k.done_at, 'hours', k.hours, 'paid_at', k.paid_at,
					'request_status', (select r.status from public.coin_requests r where r.id = k.request_id))
					order by k.claimed_at)
				from public.coin_contract_claims k where k.contract_id = c.id), '[]'::jsonb))
			order by c.created_at desc)
		from public.coin_contracts c), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_contracts_admin() from public, anon, authenticated, service_role;
grant execute on function public.coin_contracts_admin() to authenticated;

-- The PUBLIC board: 0157's thirteen columns, in order. A restitution job is
-- never on it, and the class comes from IDEA Classroom.
create or replace function public.coin_public_contracts()
returns table (
	id uuid,
	title text,
	description text,
	payout_amount integer,
	max_contractors integer,
	claimed_count integer,
	status text,
	section text,
	contractors text,
	created_at timestamptz,
	completed_at timestamptz,
	cancelled_at timestamptz,
	cancel_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		c.id, c.title, c.description, c.payout_amount, c.max_contractors,
		coalesce(k.n, 0)::integer,
		case
			when c.completed_at is not null then 'Completed'
			when c.cancelled_at is not null then 'Cancelled'
			when coalesce(k.n, 0) > 0 then 'In Progress'
			else 'Open'
		end,
		public._coin_classroom_section_label(c.class_section_id),
		coalesce(k.names, ''),
		c.created_at, c.completed_at, c.cancelled_at, c.cancel_reason
	from public.coin_contracts c
	left join lateral (
		select count(*) as n,
			string_agg(coalesce(ros.display_name, public._coin_public_name_fallback()), ' | ' order by cl.claimed_at) as names
		from public.coin_contract_claims cl
		left join public._coin_public_roster() ros on ros.student_email = cl.student_email
		where cl.contract_id = c.id
	) k on true
	where not c.debt_only
	order by c.created_at desc;
$$;
revoke all on function public.coin_public_contracts() from public, anon, authenticated, service_role;
grant execute on function public.coin_public_contracts() to anon, authenticated;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: THE TOURNAMENT TRANSFER =====

-- Placement of an entry in a complete tournament: 1, 2, 3 or null.
create or replace function public._coin_tournament_placement(p_tournament_id uuid, p_entry_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
	with t as (select * from public.tournaments where id = p_tournament_id),
	final as (
		select m.* from public.tournament_bracket_matches m, t
		where m.tournament_id = p_tournament_id and m.status = 'complete' and m.winner_id = t.champion_entry_id
			and m.winner_to_match_id is null
		order by m.completed_at desc nulls last limit 1
	),
	third as (
		select case when m.winner_id = m.entry_a_id then m.entry_b_id else m.entry_a_id end as entry_id
		from public.tournament_bracket_matches m
		join public.tournament_bracket_matches gf on gf.id = m.winner_to_match_id
		where m.tournament_id = p_tournament_id and m.bracket = 'losers' and gf.bracket = 'grand_final'
			and m.winner_to_pos = 'b' and m.winner_id is not null
	)
	select case
		when p_entry_id = (select champion_entry_id from t) then 1
		when p_entry_id = (select case when f.winner_id = f.entry_a_id then f.entry_b_id else f.entry_a_id end from final f) then 2
		when p_entry_id in (select entry_id from third) then 3
	end;
$$;
revoke all on function public._coin_tournament_placement(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.coin_tournament_transfers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_defaults jsonb := coalesce(public._coin_setting('tournament_placement_defaults'), '[3, 2, 1]'::jsonb);
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can transfer tournament rewards.';
	end if;
	return coalesce((select jsonb_agg(jsonb_build_object(
			'id', t.id, 'name', t.name, 'updated_at', t.updated_at,
			'has_placement_rules', exists (select 1 from public.tournament_reward_rules rr
				where rr.tournament_id = t.id and rr.trigger_type = 'placement'),
			'entries', coalesce((select jsonb_agg(jsonb_build_object(
					'entry_id', e.id, 'name', e.display_name,
					'earned', coalesce((select sum(x.amount) from (select distinct on (l.reason, l.match_id) l.amount
						from public.tournament_reward_ledger l
						where l.entry_id = e.id and l.awaiting_transfer and l.coin_transaction_id is null
						order by l.reason, l.match_id, l.id) x), 0),
					'placement', public._coin_tournament_placement(t.id, e.id),
					'placement_default', case when not exists (select 1 from public.tournament_reward_rules rr
							where rr.tournament_id = t.id and rr.trigger_type = 'placement')
						and public._coin_tournament_placement(t.id, e.id) is not null
						then (v_defaults ->> (public._coin_tournament_placement(t.id, e.id) - 1))::numeric else 0 end,
					'members', case when exists (select 1 from public.tournament_entry_members m where m.entry_id = e.id)
						then (select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', m.name,
								'has_account', m.user_id is not null and public._notebook_email_for_user(m.user_id) is not null)
								order by (m.user_id = e.user_id) is true desc, m.user_id is null, m.created_at)
							from public.tournament_entry_members m where m.entry_id = e.id)
						else jsonb_build_array(jsonb_build_object('user_id', e.user_id, 'name', e.display_name,
							'has_account', e.user_id is not null and public._notebook_email_for_user(e.user_id) is not null)) end)
					order by public._coin_tournament_placement(t.id, e.id) nulls last, e.display_name)
				from public.tournament_entries e where e.tournament_id = t.id), '[]'::jsonb))
			order by t.updated_at desc)
		from public.tournaments t
		where t.status = 'complete'
			and not exists (select 1 from public.coin_tournament_settlements s where s.tournament_id = t.id)
			and (exists (select 1 from public.tournament_reward_ledger l
					where l.tournament_id = t.id and l.awaiting_transfer and l.coin_transaction_id is null)
				or (not exists (select 1 from public.tournament_reward_ledger l where l.tournament_id = t.id)
					and t.updated_at >= '2026-10-14'::date))), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_tournament_transfers() from public, anon, authenticated, service_role;
grant execute on function public.coin_tournament_transfers() to authenticated;

-- FINISH ONE TOURNAMENT. p_outcome 'transferred' posts each listed amount to
-- its student (by account, never an address sent in); 'paid_physically'
-- posts nothing. The settlement row is written first, so a second call is
-- refused and nothing is paid twice.
create or replace function public.coin_tournament_settle(
	p_tournament_id uuid, p_outcome text, p_mode text, p_amounts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_el jsonb;
	v_uid uuid;
	v_amount numeric;
	v_email text;
	v_row public.coin_transactions;
	v_results jsonb := '[]'::jsonb;
	v_paid integer := 0;
	v_skipped integer := 0;
	v_name text;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can transfer tournament rewards.';
	end if;
	if coalesce(p_outcome, '') not in ('transferred', 'paid_physically') then
		return jsonb_build_object('ok', false, 'reason', 'invalid');
	end if;
	select t.name into v_name from public.tournaments t where t.id = p_tournament_id and t.status = 'complete';
	if v_name is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	begin
		insert into public.coin_tournament_settlements (tournament_id, outcome, mode, settled_by)
		values (p_tournament_id, p_outcome, case when p_mode in ('split', 'duplicate') then p_mode end, public.current_user_email());
	exception when unique_violation then
		return jsonb_build_object('ok', false, 'reason', 'already_settled');
	end;
	if p_outcome = 'transferred' then
		if jsonb_typeof(coalesce(p_amounts, '[]'::jsonb)) <> 'array' then
			raise exception 'Amounts must be a list.';
		end if;
		for v_el in select * from jsonb_array_elements(coalesce(p_amounts, '[]'::jsonb)) loop
			v_uid := nullif(v_el ->> 'user_id', '')::uuid;
			v_amount := round(coalesce((v_el ->> 'amount')::numeric, 0), 2);
			if v_amount < 0 or v_amount > 10000 then
				raise exception 'Each amount must be between 0 and 10000.';
			end if;
			if v_uid is null or v_amount = 0 then
				v_skipped := v_skipped + 1;
				continue;
			end if;
			if not exists (select 1 from public.tournament_entries e where e.tournament_id = p_tournament_id and e.user_id = v_uid)
				and not exists (select 1 from public.tournament_entry_members m where m.tournament_id = p_tournament_id and m.user_id = v_uid) then
				raise exception 'Every person paid must be a participant in this tournament.';
			end if;
			v_email := public._notebook_email_for_user(v_uid);
			if v_email is null then
				v_skipped := v_skipped + 1;
				continue;
			end if;
			v_row := public._coin_insert(v_email, 'competition_winnings', v_amount, null,
				'Tournament: ' || v_name || '.', jsonb_build_object('tournament_id', p_tournament_id::text,
					'mode', p_mode), 'digital');
			v_paid := v_paid + 1;
			v_results := v_results || jsonb_build_array(jsonb_build_object('user_id', v_uid, 'amount', v_amount,
				'transaction_id', v_row.id));
		end loop;
	end if;
	update public.coin_tournament_settlements set detail = jsonb_build_object('paid', v_paid, 'skipped', v_skipped,
		'results', v_results) where tournament_id = p_tournament_id;
	return jsonb_build_object('ok', true, 'outcome', p_outcome, 'paid', v_paid, 'skipped', v_skipped);
end;
$$;
revoke all on function public.coin_tournament_settle(uuid, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.coin_tournament_settle(uuid, text, text, jsonb) to authenticated;

-- PUBLIC: how a tournament's rewards were settled, for its own page.
create or replace function public.tournament_reward_settlement(p_tournament_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce((select jsonb_build_object('outcome', s.outcome, 'settled_at', s.settled_at)
		from public.coin_tournament_settlements s where s.tournament_id = p_tournament_id), 'null'::jsonb);
$$;
revoke all on function public.tournament_reward_settlement(uuid) from public, anon, authenticated, service_role;
grant execute on function public.tournament_reward_settlement(uuid) to anon, authenticated;
-- ===== PART B END =====

do $chk$
declare
	r record;
begin
	for r in
		select p.oid::regprocedure::text as sig
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname in ('coin_contract_post', 'coin_contract_mark_done', 'coin_my_contracts',
			'coin_contracts_admin', 'coin_tournament_transfers', 'coin_tournament_settle', 'coin_contract_self_claim')
			and has_function_privilege('anon', p.oid, 'execute')
	loop
		raise exception '0248: anon must not execute %.', r.sig;
	end loop;
	if exists (select 1 from public.coin_public_contracts() c join public.coin_contracts k on k.id = c.id where k.debt_only) then
		raise exception '0248: a restitution job is on the public board.';
	end if;
	raise notice '0248: contracts pay through the queue; % tournament(s) await a transfer.',
		(select count(*) from public.tournaments t where t.status = 'complete'
			and exists (select 1 from public.tournament_reward_ledger l where l.tournament_id = t.id and l.awaiting_transfer
				and l.coin_transaction_id is null));
end
$chk$;
