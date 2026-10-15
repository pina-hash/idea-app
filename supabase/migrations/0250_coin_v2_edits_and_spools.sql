-- 0250_coin_v2_edits_and_spools.sql
--
-- IDEA COIN V2, SESSION TWO, PART SEVEN (ledger 0385): EDIT ANY PAST NUMBER
-- (2.15), AND 3D PRINT SPOOLS (2.16).
--
-- EDITING A PAST AMOUNT KEEPS THE LEDGER APPEND-ONLY. A full coin admin types
-- a new value for any row; what is written is a linked `amount_correction`
-- row for the difference, whose meta holds the row it edits and the old and
-- new values. The row's amount as people read it is its own amount plus every
-- correction of it that has not been undone (_coin_effective_rows, 0249).
-- Undo reverses the newest correction (0240's reversal), which puts back the
-- value before it; undoing every one restores the original.
--
-- SPOOLS. A spool bought outright is a grams credit (coin_print_grams, 0246),
-- 1000 g by default; a student's print draws from it before coins. A print
-- paid in cash is recorded with coin_record_cash_purchase (0240), unchanged.
--
-- HISTORIES FOLD. The student's page, the Coin Desk lookup and the public
-- Ledger show an edited row at its new value, marked edited, and never show
-- a correction as a row of its own.
--
-- UNDO: drop the functions this file creates; re-run 0241's coin_my_page and
-- coin_buy_print, 0244's coin_admin_lookup and 0239's coin_public_transactions
-- and coin_public_student. Correction rows stay as history either way.

-- THE FIRST OBJECT IS NEW (the apply probe reads the first created object).
create table if not exists public.coin_edit_log (
	id bigserial primary key,
	transaction_id uuid not null,
	correction_id uuid,
	action text not null check (action in ('edit', 'undo')),
	old_value numeric(12,2),
	new_value numeric(12,2),
	actor_email text not null,
	created_at timestamptz not null default now()
);
create index if not exists coin_edit_log_txn on public.coin_edit_log (transaction_id, created_at);
alter table public.coin_edit_log enable row level security;
revoke all on table public.coin_edit_log from public, anon, authenticated, service_role;
revoke all on sequence public.coin_edit_log_id_seq from public, anon, authenticated, service_role;

-- ===== PART A BEGIN =====
-- ===== PART A: EDITS =====

-- A row's value as people read it now.
create or replace function public._coin_effective_amount(p_transaction_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
	select case when public._coin_is_reversed(t.id) then 0
		else t.amount + coalesce((select sum(c.amount) from public.coin_transactions c
			where c.category_id = 'amount_correction' and c.meta ->> 'edits' = t.id::text
				and not public._coin_is_reversed(c.id)), 0) end
	from public.coin_transactions t where t.id = p_transaction_id;
$$;
revoke all on function public._coin_effective_amount(uuid) from public, anon, authenticated, service_role;

-- A row's edit trail, oldest first.
create or replace function public._coin_edits_of(p_transaction_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'at', c.created_at,
			'old', (c.meta ->> 'old')::numeric, 'new', (c.meta ->> 'new')::numeric,
			'undone', public._coin_is_reversed(c.id)) order by c.created_at, c.id), '[]'::jsonb)
	from public.coin_transactions c
	where c.category_id = 'amount_correction' and c.meta ->> 'edits' = p_transaction_id::text;
$$;
revoke all on function public._coin_edits_of(uuid) from public, anon, authenticated, service_role;

create or replace function public.coin_edit_amount(p_transaction_id uuid, p_new_amount numeric, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_row public.coin_transactions;
	v_now numeric;
	v_new numeric := round(p_new_amount, 2);
	v_corr public.coin_transactions;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can edit a past amount.';
	end if;
	if v_new is null or abs(v_new) > 100000 then
		return jsonb_build_object('ok', false, 'reason', 'amount');
	end if;
	select * into v_row from public.coin_transactions where id = p_transaction_id for update;
	if v_row.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_row.medium <> 'digital' or v_row.transfer_id is not null
		or v_row.category_id in ('reversal', 'amount_correction', 'payout_hold') then
		return jsonb_build_object('ok', false, 'reason', 'not_editable');
	end if;
	if public._coin_is_reversed(v_row.id) then
		return jsonb_build_object('ok', false, 'reason', 'reversed');
	end if;
	v_now := public._coin_effective_amount(v_row.id);
	if v_now = v_new then
		return jsonb_build_object('ok', true, 'changed', false, 'amount', v_now);
	end if;
	v_corr := public._coin_insert(v_row.student_email, 'amount_correction', v_new - v_now, null,
		coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Amount edited.'),
		jsonb_build_object('edits', v_row.id::text, 'old', v_now, 'new', v_new, 'original', v_row.amount,
			'edited_category', v_row.category_id), 'digital');
	insert into public.coin_edit_log (transaction_id, correction_id, action, old_value, new_value, actor_email)
	values (v_row.id, v_corr.id, 'edit', v_now, v_new, public.current_user_email());
	return jsonb_build_object('ok', true, 'changed', true, 'amount', v_new, 'correction_id', v_corr.id,
		'balance', public._coin_balance(v_row.student_email));
end;
$$;
revoke all on function public.coin_edit_amount(uuid, numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_edit_amount(uuid, numeric, text) to authenticated;

create or replace function public.coin_edit_undo(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_corr public.coin_transactions;
	v_rev jsonb;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can undo an edit.';
	end if;
	select * into v_corr from public.coin_transactions c
	where c.category_id = 'amount_correction' and c.meta ->> 'edits' = p_transaction_id::text
		and not public._coin_is_reversed(c.id)
	order by c.created_at desc, c.id desc limit 1;
	if v_corr.id is null then
		return jsonb_build_object('ok', false, 'reason', 'no_edit');
	end if;
	v_rev := public._coin_reverse(v_corr.id, 'Edit undone.', null);
	if not coalesce((v_rev ->> 'ok')::boolean, false) then
		return v_rev;
	end if;
	insert into public.coin_edit_log (transaction_id, correction_id, action, old_value, new_value, actor_email)
	values (p_transaction_id, v_corr.id, 'undo', (v_corr.meta ->> 'new')::numeric, (v_corr.meta ->> 'old')::numeric,
		public.current_user_email());
	return jsonb_build_object('ok', true, 'amount', public._coin_effective_amount(p_transaction_id),
		'balance', public._coin_balance(v_corr.student_email));
end;
$$;
revoke all on function public.coin_edit_undo(uuid) from public, anon, authenticated, service_role;
grant execute on function public.coin_edit_undo(uuid) to authenticated;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: SPOOLS =====

create or replace function public.coin_record_spool(p_email text, p_grams numeric default 1000, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_grams numeric := round(coalesce(p_grams, 1000), 2);
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can record a spool.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		return jsonb_build_object('ok', false, 'reason', 'email');
	end if;
	if v_grams = 0 or v_grams > 10000 or v_grams < -10000 then
		return jsonb_build_object('ok', false, 'reason', 'grams');
	end if;
	if v_grams < 0 and public._coin_spool_grams(v_email) + v_grams < 0 then
		return jsonb_build_object('ok', false, 'reason', 'below_zero');
	end if;
	insert into public.coin_print_grams (student_email, grams, source, note, actor_email)
	values (v_email, v_grams, case when v_grams > 0 then 'spool' else 'correction' end,
		coalesce(nullif(btrim(coalesce(p_note, '')), ''), case when v_grams > 0 then 'Spool bought outright.' else 'Grams corrected.' end),
		public.current_user_email());
	return jsonb_build_object('ok', true, 'grams_left', public._coin_spool_grams(v_email));
end;
$$;
revoke all on function public.coin_record_spool(text, numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_record_spool(text, numeric, text) to authenticated;

-- 0241's print purchase, drawing spool grams first. A print a spool covers
-- whole still writes its row (amount 0), so it is in the history.
create or replace function public.coin_buy_print(p_grams numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb;
	v_email text;
	v_spool numeric;
	v_price numeric;
	v_balance numeric;
	v_row public.coin_transactions;
begin
	if p_grams is null or p_grams <= 0 or p_grams > 5000 then
		return jsonb_build_object('ok', false, 'reason', 'grams');
	end if;
	v_seam := public._coin_student_seam('buy_print');
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	if not exists (select 1 from public.coin_categories where id = 'three_d_printing' and active) then
		return jsonb_build_object('ok', false, 'reason', 'not_available');
	end if;
	perform pg_advisory_xact_lock(hashtext('coin_split:' || v_email));
	v_spool := least(p_grams, public._coin_spool_grams(v_email));
	v_price := case when p_grams - v_spool > 0 then public._coin_print_price(p_grams - v_spool) else 0 end;
	v_balance := public._coin_balance(v_email);
	if v_balance - v_price < 0 then
		return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance, 'cost', v_price);
	end if;
	v_row := public._coin_insert(v_email, 'three_d_printing', -v_price, p_grams,
		'3D print, ' || trim_scale(p_grams) || ' g' || case when v_spool > 0 then ', ' || trim_scale(v_spool) || ' g from your spool' else '' end || '.',
		jsonb_build_object('grams', p_grams, 'spool_grams', v_spool, 'self_service', true), 'digital');
	if v_spool > 0 then
		insert into public.coin_print_grams (student_email, grams, source, transaction_id, note, actor_email)
		values (v_email, -v_spool, 'print', v_row.id, '3D print.', v_email);
	end if;
	return jsonb_build_object('ok', true, 'transaction_id', v_row.id, 'cost', v_price, 'spool_grams', v_spool,
		'grams_left', public._coin_spool_grams(v_email), 'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.coin_buy_print(numeric) from public, anon, authenticated, service_role;
grant execute on function public.coin_buy_print(numeric) to authenticated;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: HISTORIES FOLD =====

-- One row as a history shows it: its value now, whether it was edited and
-- how, whether it was undone, and whether its student may dispute it.
create or replace function public._coin_history_row(t public.coin_transactions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'id', t.id, 'at', t.created_at, 'created_at', t.created_at,
		'amount', coalesce(public._coin_effective_amount(t.id), t.amount) + case when public._coin_is_reversed(t.id) then t.amount else 0 end,
		'original_amount', t.amount,
		'edited', exists (select 1 from public.coin_transactions c where c.category_id = 'amount_correction'
			and c.meta ->> 'edits' = t.id::text and not public._coin_is_reversed(c.id)),
		'edits', public._coin_edits_of(t.id),
		'category_id', t.category_id, 'name', c.name, 'category_name', c.name, 'kind', c.kind,
		'note', t.note, 'medium', t.medium, 'transfer_id', t.transfer_id, 'quantity', t.quantity,
		'actor_email', t.actor_email,
		'reverses', t.meta ->> 'reverses', 'reversed', public._coin_is_reversed(t.id),
		'automatic', t.actor_email = 'system',
		'disputable', t.actor_email = 'system' and c.kind = 'fine' and t.medium = 'digital'
			and not public._coin_is_reversed(t.id),
		'dispute', (select jsonb_build_object('status', r.status, 'decision_note', r.decision_note)
			from public.coin_requests r where r.kind = 'dispute' and r.payload ->> 'transaction_id' = t.id::text
			order by r.created_at desc limit 1))
	from public.coin_categories c where c.id = t.category_id;
$$;
revoke all on function public._coin_history_row(public.coin_transactions) from public, anon, authenticated, service_role;

-- A row a history lists: not a correction, and not the undo of one.
create or replace function public._coin_listed(t public.coin_transactions)
returns boolean
language sql
immutable
set search_path = ''
as $$
	select t.category_id <> 'amount_correction'
		and not (t.category_id = 'reversal' and coalesce(t.meta ->> 'reversed_category', '') = 'amount_correction');
$$;
revoke all on function public._coin_listed(public.coin_transactions) from public, anon, authenticated, service_role;

-- 0241's page, with the history folded and the spool grams added.
create or replace function public.coin_my_page()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_quote jsonb;
	v_revoked timestamptz;
begin
	if (select auth.uid()) is null or v_email = '' then
		return jsonb_build_object('signed_in', false);
	end if;
	v_quote := public._coin_pay_raise_quote(v_email);
	select max(t.created_at) into v_revoked from public.coin_transactions t
	where t.student_email = v_email and t.category_id = 'eating_pass_revoked' and not public._coin_is_reversed(t.id);
	return jsonb_build_object(
		'signed_in', true,
		'in_economy', exists (select 1 from public._coin_economy_enrollments() x where x.student_email = v_email),
		'balance', public._coin_balance(v_email),
		'wage_tier', (v_quote ->> 'tier')::integer,
		'weekly_wage', (v_quote ->> 'wage_now')::numeric,
		'pay_raise', v_quote,
		'eating_pass', jsonb_build_object(
			'active', public.coin_eating_pass_active(v_email),
			'strikes', public.coin_eating_pass_strikes(v_email),
			'revoked_at', v_revoked,
			'price', (select c.amount from public.coin_categories c where c.id = 'eating_pass' and c.active)),
		'no_shop_today', exists (select 1 from public.coin_no_shop n where n.student_email = v_email
			and n.on_date = public._coin_la_today() and n.cleared_at is null),
		'print', jsonb_build_object(
			'grams_per_coin', coalesce((public._coin_setting('print_grams_per_coin') #>> '{}')::numeric, 10),
			'active', exists (select 1 from public.coin_categories c where c.id = 'three_d_printing' and c.active),
			'spool_grams', public._coin_spool_grams(v_email)),
		'extra_credit', jsonb_build_object(
			'price_per_point', (select c.amount from public.coin_categories c where c.id = 'extra_credit' and c.active),
			'classes', coalesce((
				select jsonb_agg(jsonb_build_object(
					'section_id', x.section_id,
					'label', public._coin_classroom_section_label(x.section_id),
					'room', public._coin_extra_credit_room(v_email, x.section_id),
					'submissions', coalesce((
						select jsonb_agg(jsonb_build_object(
							'submission_id', s.id, 'item_id', i.id, 'title', i.title,
							'score', s.score, 'extra_credit', coalesce(s.extra_credit, 0),
							'out_of', public._classroom_item_out_of(i.id))
							order by s.returned_at desc nulls last)
						from public.classroom_submissions s
						join public.classroom_items i on i.id = s.item_id
						join public.classroom_postings p on p.item_id = i.id and p.section_id = x.section_id
						where s.student_email = v_email and s.state = 'returned'
					), '[]'::jsonb))
					order by public._coin_classroom_section_label(x.section_id))
				from public._coin_economy_enrollments() x where x.student_email = v_email
			), '[]'::jsonb)),
		'history', coalesce((
			select jsonb_agg(public._coin_history_row(t) order by t.created_at desc, t.id desc)
			from (select * from public.coin_transactions t2 where t2.student_email = v_email and t2.medium = 'digital'
				and public._coin_listed(t2)
				order by t2.created_at desc, t2.id desc limit 300) t
		), '[]'::jsonb),
		'rules', coalesce((select jsonb_agg(row_to_json(r)::jsonb) from public.coin_public_reasons() r), '[]'::jsonb)
	);
end;
$$;
revoke all on function public.coin_my_page() from public, anon, authenticated, service_role;
grant execute on function public.coin_my_page() to authenticated;

-- 0244's lookup, folded.
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
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can look up IDEA Coin balances.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid email.';
	end if;
	if not public._coin_student_in_scope(v_email) then
		raise exception 'That student is not in one of your classes.';
	end if;
	select coalesce(tier, 1) into v_wage_tier from public.coin_wage_tiers where student_email = v_email;
	return jsonb_build_object(
		'email', v_email,
		'name', public._coin_student_name(v_email),
		'balance', public._coin_balance(v_email),
		'wage_tier', coalesce(v_wage_tier, 1),
		'eating_pass_active', public.coin_eating_pass_active(v_email),
		'eating_pass_strikes', public.coin_eating_pass_strikes(v_email),
		'no_shop_today', exists (select 1 from public.coin_no_shop n where n.student_email = v_email
			and n.on_date = public._coin_la_today() and n.cleared_at is null),
		'spool_grams', public._coin_spool_grams(v_email),
		'can_edit', public._coin_full_staff(),
		'recent_transactions', coalesce((select jsonb_agg(public._coin_history_row(t) order by t.created_at desc, t.id desc)
			from (select * from public.coin_transactions t2 where t2.student_email = v_email and public._coin_listed(t2)
				order by t2.created_at desc, t2.id desc limit 50) t), '[]'::jsonb)
	);
end;
$$;
revoke all on function public.coin_admin_lookup(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_admin_lookup(text) to authenticated;

-- The public feed: 0239's shape; an edited row at its value now, and a
-- correction never as a row of its own.
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
		public._coin_effective_amount(t.id),
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
		and t.category_id not in ('reversal', 'amount_correction')
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
			select t.created_at as occurred_at, public._coin_effective_amount(t.id) as amount, t.category_id,
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
				and t.category_id not in ('reversal', 'amount_correction') and not public._coin_is_reversed(t.id)
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
		'roles', coalesce((select jsonb_agg(d.name order by d.sort_order) from public.coin_role_holders rh
			join public.coin_role_definitions d on d.id = rh.role_id
			where rh.student_email = v_email and rh.revoked_at is null
				and (rh.expires_at is null or rh.expires_at > now())), '[]'::jsonb),
		'reported_coins', (select jsonb_build_object('coins', (r.payload ->> 'count')::numeric,
				'reported_on', public._coin_la_today(r.decided_at))
			from public.coin_requests r where r.student_email = v_email and r.kind = 'reported_coins'
				and r.status = 'approved' order by r.decided_at desc limit 1),
		'history', v_history
	);
end;
$$;
revoke all on function public.coin_public_student(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_public_student(text) to anon, authenticated;
-- ===== PART C END =====

do $chk$
declare
	r record;
begin
	for r in
		select p.oid::regprocedure::text as sig
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname in ('coin_edit_amount', 'coin_edit_undo', 'coin_record_spool', 'coin_buy_print',
			'coin_my_page', 'coin_admin_lookup')
			and has_function_privilege('anon', p.oid, 'execute')
	loop
		raise exception '0250: anon must not execute %.', r.sig;
	end loop;
	if not has_function_privilege('anon', 'public.coin_public_student(text)', 'execute') then
		raise exception '0250: coin_public_student must stay public (the Ledger).';
	end if;
	raise notice '0250: amounts are editable by a linked correction; % gram(s) of spool credit on record.',
		(select coalesce(sum(grams), 0) from public.coin_print_grams);
end
$chk$;
