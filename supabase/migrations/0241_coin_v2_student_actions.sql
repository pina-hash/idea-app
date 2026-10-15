-- 0241_coin_v2_student_actions.sql
--
-- IDEA COIN V2, PART THREE (ledger 0384): A STUDENT BUYS ON THEIR OWN.
--
-- THE SEAM. CLAUDE.md has always said every public coin write is admin-only,
-- and named the retrofit that would let a non-admin move a coin: an
-- authorization seam other than is_admin(). This file builds it, once:
-- _coin_student_seam(action). Every student coin action goes through it, and
-- every one of them is a definer function that TAKES NO EMAIL AND NO AMOUNT.
-- Identity comes from the session (current_user_email()); every price comes
-- from coin_categories and coin_settings; every check runs before the charge;
-- and each action is rate limited per student per minute.
--
-- A student is in the economy when they hold an active, non-manager
-- enrollment in an active classroom section whose economy is on
-- (_coin_economy_enrollments, 0239). Anyone else is refused by the seam.
--
-- THE PURCHASE RULE IS 0239's: refused before any charge unless the balance
-- after it is zero or more.
--
-- UNDO: drop the functions this file creates and the coin_student_actions
-- table. Nothing else references them.

-- ===== PART A BEGIN =====
-- ===== PART A: THE SEAM =====

create table if not exists public.coin_student_actions (
	id bigserial primary key,
	student_email text not null,
	action text not null,
	created_at timestamptz not null default now()
);
create index if not exists coin_student_actions_recent on public.coin_student_actions (student_email, created_at desc);
alter table public.coin_student_actions enable row level security;
revoke all on table public.coin_student_actions from public, anon, authenticated, service_role;
revoke all on sequence public.coin_student_actions_id_seq from public, anon, authenticated, service_role;

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
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: EXTRA CREDIT ARITHMETIC =====

-- What an item is out of: the rubric's total when it has one, its points
-- otherwise. The one statement of it; grading, the cap, Perfect Score and
-- Highest Grade all ask this.
create or replace function public._classroom_item_out_of(p_item_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		(select sum(coalesce((c ->> 'points')::numeric, 0))
			from public.classroom_rubrics r, jsonb_array_elements(r.criteria) c
			where r.item_id = p_item_id and jsonb_typeof(r.criteria) = 'array'
			having count(*) > 0),
		(select i.points::numeric from public.classroom_items i where i.id = p_item_id)
	);
$$;
revoke all on function public._classroom_item_out_of(uuid) from public, anon, authenticated, service_role;

-- The day an item belongs to, for "this semester".
create or replace function public._coin_item_day(p_item_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
	select public._coin_la_today(coalesce(i.due_at, i.first_published_at, i.created_at))
	from public.classroom_items i where i.id = p_item_id;
$$;
revoke all on function public._coin_item_day(uuid) from public, anon, authenticated, service_role;

-- The extra credit a student may still buy in one class this semester.
create or replace function public._coin_extra_credit_room(p_email text, p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_sem jsonb := public._coin_semester_of(public._coin_la_today());
	v_pct numeric := coalesce((public._coin_setting('extra_credit_cap_percent') #>> '{}')::numeric, 2);
	v_total numeric := 0;
	v_cap numeric := 0;
	v_used numeric := 0;
begin
	if v_sem is null then
		return jsonb_build_object('semester', null, 'total_points', 0, 'cap_points', 0, 'used_points', 0, 'remaining_points', 0);
	end if;
	select coalesce(sum(coalesce(public._classroom_item_out_of(i.id), 0)), 0) into v_total
	from public.classroom_postings p
	join public.classroom_items i on i.id = p.item_id
	where p.section_id = p_section_id and i.kind = 'assignment' and i.published
		and public._coin_item_day(i.id) between (v_sem ->> 'start')::date and (v_sem ->> 'end')::date;
	v_cap := floor(v_total * v_pct / 100);
	select coalesce(sum(t.quantity), 0) into v_used
	from public.coin_transactions t
	where t.student_email = lower(btrim(p_email)) and t.category_id = 'extra_credit'
		and t.meta ->> 'section_id' = p_section_id::text
		and t.meta ->> 'semester' = v_sem ->> 'key'
		and not public._coin_is_reversed(t.id);
	return jsonb_build_object('semester', v_sem ->> 'key', 'total_points', v_total, 'cap_points', v_cap,
		'used_points', v_used, 'remaining_points', greatest(v_cap - v_used, 0));
end;
$$;
revoke all on function public._coin_extra_credit_room(text, uuid) from public, anon, authenticated, service_role;

-- Purchased extra credit on one submission, net of any undo. Read by grading
-- (0242) so a regrade can never take bought points away.
create or replace function public._coin_purchased_extra_credit(p_submission_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(sum(t.quantity), 0)
	from public.coin_transactions t
	where t.category_id = 'extra_credit' and t.meta ->> 'submission_id' = p_submission_id::text
		and not public._coin_is_reversed(t.id);
$$;
revoke all on function public._coin_purchased_extra_credit(uuid) from public, anon, authenticated, service_role;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE STUDENT'S OWN COIN PAGE =====

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
			'active', exists (select 1 from public.coin_categories c where c.id = 'three_d_printing' and c.active)),
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
			select jsonb_agg(jsonb_build_object(
				'id', t.id, 'at', t.created_at, 'amount', t.amount, 'category_id', t.category_id,
				'name', c.name, 'kind', c.kind, 'note', t.note,
				'reverses', t.meta ->> 'reverses', 'reversed', public._coin_is_reversed(t.id),
				'automatic', t.actor_email = 'system')
				order by t.created_at desc, t.id desc)
			from (select * from public.coin_transactions t2 where t2.student_email = v_email and t2.medium = 'digital'
				order by t2.created_at desc, t2.id desc limit 300) t
			join public.coin_categories c on c.id = t.category_id
		), '[]'::jsonb),
		'rules', coalesce((select jsonb_agg(row_to_json(r)::jsonb) from public.coin_public_reasons() r), '[]'::jsonb)
	);
end;
$$;
revoke all on function public.coin_my_page() from public, anon, authenticated, service_role;
grant execute on function public.coin_my_page() to authenticated;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: THE FOUR PURCHASES =====

create or replace function public.coin_buy_eating_pass()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb := public._coin_student_seam('buy_eating_pass');
	v_email text;
	v_price numeric;
	v_balance numeric;
	v_row public.coin_transactions;
begin
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	select c.amount into v_price from public.coin_categories c
	where c.id = 'eating_pass' and c.active and c.kind = 'purchase' and c.pricing_model = 'flat';
	if v_price is null then
		return jsonb_build_object('ok', false, 'reason', 'not_available');
	end if;
	if public.coin_eating_pass_active(v_email) then
		return jsonb_build_object('ok', false, 'reason', 'pass_already_active');
	end if;
	v_balance := public._coin_balance(v_email);
	if v_balance - v_price < 0 then
		return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance, 'cost', v_price);
	end if;
	v_row := public._coin_insert(v_email, 'eating_pass', -v_price, null, 'Bought by the student.',
		jsonb_build_object('self_service', true), 'digital');
	return jsonb_build_object('ok', true, 'transaction_id', v_row.id, 'cost', v_price,
		'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.coin_buy_eating_pass() from public, anon, authenticated, service_role;
grant execute on function public.coin_buy_eating_pass() to authenticated;

create or replace function public.coin_buy_pay_raise()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb := public._coin_student_seam('buy_pay_raise');
begin
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	if not exists (select 1 from public.coin_categories where id = 'pay_raise' and active) then
		return jsonb_build_object('ok', false, 'reason', 'not_available');
	end if;
	return public._coin_apply_pay_raise(v_seam ->> 'email', 'Bought by the student.');
end;
$$;
revoke all on function public.coin_buy_pay_raise() from public, anon, authenticated, service_role;
grant execute on function public.coin_buy_pay_raise() to authenticated;

-- A 3D print. The student enters the weight the slicer reports; that is a
-- measurement, not an amount, and the price is computed here from it.
create or replace function public.coin_buy_print(p_grams numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb;
	v_email text;
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
	v_price := public._coin_print_price(p_grams);
	v_balance := public._coin_balance(v_email);
	if v_balance - v_price < 0 then
		return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance, 'cost', v_price);
	end if;
	v_row := public._coin_insert(v_email, 'three_d_printing', -v_price, p_grams,
		'3D print, ' || trim_scale(p_grams) || ' g.', jsonb_build_object('grams', p_grams, 'self_service', true), 'digital');
	return jsonb_build_object('ok', true, 'transaction_id', v_row.id, 'cost', v_price,
		'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.coin_buy_print(numeric) from public, anon, authenticated, service_role;
grant execute on function public.coin_buy_print(numeric) to authenticated;

-- Extra credit on one of the caller's own returned submissions, in one of
-- their own classes, within that class's cap.
create or replace function public.coin_buy_extra_credit(p_section_id uuid, p_submission_id uuid, p_points integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb;
	v_email text;
	v_sub public.classroom_submissions;
	v_room jsonb;
	v_price numeric;
	v_cost numeric;
	v_balance numeric;
	v_row public.coin_transactions;
begin
	if p_points is null or p_points < 1 or p_points > 1000 then
		return jsonb_build_object('ok', false, 'reason', 'points');
	end if;
	v_seam := public._coin_student_seam('buy_extra_credit');
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	if not exists (select 1 from public._coin_economy_enrollments() x
		where x.student_email = v_email and x.section_id = p_section_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_your_class');
	end if;
	select * into v_sub from public.classroom_submissions s where s.id = p_submission_id for update;
	if v_sub.id is null or v_sub.student_email <> v_email or v_sub.state <> 'returned'
		or not exists (select 1 from public.classroom_postings p
			where p.item_id = v_sub.item_id and p.section_id = p_section_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_your_work');
	end if;
	select c.amount into v_price from public.coin_categories c where c.id = 'extra_credit' and c.active;
	if v_price is null then
		return jsonb_build_object('ok', false, 'reason', 'not_available');
	end if;
	-- One class's purchases serialize, so two at once cannot both fit the cap.
	perform pg_advisory_xact_lock(hashtext('coin_extra_credit:' || v_email || ':' || p_section_id::text));
	v_room := public._coin_extra_credit_room(v_email, p_section_id);
	if v_room ->> 'semester' is null then
		return jsonb_build_object('ok', false, 'reason', 'no_semester');
	end if;
	if p_points > (v_room ->> 'remaining_points')::numeric then
		return jsonb_build_object('ok', false, 'reason', 'cap', 'room', v_room);
	end if;
	v_cost := round(v_price * p_points, 2);
	v_balance := public._coin_balance(v_email);
	if v_balance - v_cost < 0 then
		return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance, 'cost', v_cost);
	end if;
	v_row := public._coin_insert(v_email, 'extra_credit', -v_cost, p_points, 'Bought by the student.',
		jsonb_build_object('section_id', p_section_id::text, 'submission_id', v_sub.id::text,
			'item_id', v_sub.item_id::text, 'semester', v_room ->> 'semester', 'self_service', true),
		'digital');
	update public.classroom_submissions s
	set extra_credit = coalesce(s.extra_credit, 0) + p_points,
		score = coalesce(s.score, 0) + p_points,
		updated_at = now()
	where s.id = v_sub.id;
	return jsonb_build_object('ok', true, 'transaction_id', v_row.id, 'cost', v_cost, 'points', p_points,
		'balance', public._coin_balance(v_email), 'room', public._coin_extra_credit_room(v_email, p_section_id));
end;
$$;
revoke all on function public.coin_buy_extra_credit(uuid, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.coin_buy_extra_credit(uuid, uuid, integer) to authenticated;
-- ===== PART D END =====

do $chk$
declare
	r record;
begin
	for r in
		select p.oid::regprocedure::text as sig, p.pronargs,
			has_function_privilege('anon', p.oid, 'execute') as anon_x,
			pg_get_function_identity_arguments(p.oid) as args
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname in ('coin_buy_eating_pass', 'coin_buy_pay_raise',
			'coin_buy_print', 'coin_buy_extra_credit', 'coin_my_page')
	loop
		if r.anon_x then
			raise exception '0241: anon must not execute %.', r.sig;
		end if;
		-- NO STUDENT ACTION TAKES AN EMAIL OR AN AMOUNT. Asserted on the catalog.
		if r.args ~* '(email|amount|cost|price)' then
			raise exception '0241: % takes an identity or an amount (%).', r.sig, r.args;
		end if;
	end loop;
	raise notice '0241: the student seam is in place; four purchases go through it.';
end
$chk$;
