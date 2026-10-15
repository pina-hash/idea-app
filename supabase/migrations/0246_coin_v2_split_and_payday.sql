-- 0246_coin_v2_split_and_payday.sql
--
-- IDEA COIN V2, SESSION TWO, PART THREE (ledger 0386): SPLIT PAYMENT AND
-- PAYDAY.
--
-- SPLIT PAYMENT (2.3). Any student purchase may be paid partly in digital
-- coins and partly in physical coins handed over in class. The digital part
-- is charged at once (under the purchase rule: the balance after it is zero
-- or more) as a `split_payment` row, so it can never be mistaken for the item
-- itself; the physical part becomes a pending `split` card in the queue. The
-- item is granted only when that card is approved, and the approval records
-- the physical part as a physical-medium row of the item's own category,
-- which is what grants an Eating Pass, a pay raise's tier or bought extra
-- credit (exactly as coin_record_cash_purchase, 0240, already does). A deny
-- refunds the digital part through a reversal and grants nothing. A student
-- in debt cannot split: physical coins pay the debt first.
--
-- ONE QUOTE. _coin_quote is the one statement of what an item costs a
-- student right now and whether they may have it. The split checkout and the
-- split approval both ask it.
--
-- PAYDAY (2.4). A student asks for coins out, up to their balance. The amount
-- is HELD by a `payout_hold` row, so it leaves what they can spend at once
-- and no purchase rule had to change. Cancelling reverses the hold. On
-- payday the payday screen lists, per class, every open request and every
-- student in debt; Done settles each ticked request with the two-row payout
-- transfer (0096's shape: a digital debit and a physical credit sharing a
-- transfer id), after reversing its hold, and leaves every unticked one held
-- for the next payday. A request settles at most once: its row is locked and
-- stamped in the same statement.
--
-- THE ONE AMOUNT A STUDENT SENDS. coin_request_payout takes the number of
-- coins the student wants out of their own balance. It is not a price and it
-- moves nothing to anybody else: it is bounded by their own balance and can
-- only ever lower it. coin_buy_split takes the part of a server-computed
-- price the student will pay in physical coins, bounded by that price. Both
-- are recorded here because 0241's rule is that no student function takes an
-- amount, and these two are the considered exceptions.
--
-- UNDO: drop the functions this file creates and the coin_payout_requests
-- table; set the split_payment and payout_hold categories inactive.

-- THE FIRST OBJECT IS NEW (the apply probe reads the first created object).
create table if not exists public.coin_payout_requests (
	id uuid primary key default gen_random_uuid(),
	student_email text not null check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	amount numeric(12,2) not null check (amount > 0),
	hold_transaction_id uuid,
	created_at timestamptz not null default now(),
	cancelled_at timestamptz,
	settled_at timestamptz,
	settled_by text,
	paid_amount numeric(12,2),
	transfer_id uuid,
	note text check (note is null or char_length(note) <= 300)
);
create unique index if not exists coin_payout_requests_one_open
	on public.coin_payout_requests (student_email) where cancelled_at is null and settled_at is null;
alter table public.coin_payout_requests enable row level security;
revoke all on table public.coin_payout_requests from public, anon, authenticated, service_role;

-- 3D PRINT GRAMS (2.16): a spool a student bought outright is a grams credit,
-- and a print draws from it before coins. Append-only: a credit is a positive
-- row, a draw a negative one, a refund a positive one.
create table if not exists public.coin_print_grams (
	id uuid primary key default gen_random_uuid(),
	student_email text not null check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	grams numeric(10,2) not null check (grams <> 0),
	source text not null check (source in ('spool', 'print', 'refund', 'correction')),
	transaction_id uuid,
	request_id uuid,
	note text check (note is null or char_length(note) <= 300),
	actor_email text not null,
	created_at timestamptz not null default now()
);
create index if not exists coin_print_grams_student on public.coin_print_grams (student_email, created_at);
alter table public.coin_print_grams enable row level security;
revoke all on table public.coin_print_grams from public, anon, authenticated, service_role;

create or replace function public._coin_spool_grams(p_email text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
	select greatest(coalesce(sum(g.grams), 0), 0)::numeric(10,2) from public.coin_print_grams g
	where g.student_email = lower(btrim(coalesce(p_email, '')));
$$;
revoke all on function public._coin_spool_grams(text) from public, anon, authenticated, service_role;

do $cat$
begin
	insert into public.coin_categories
		(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label,
		 formula_key, semester_point_cap, cap_period, cap_count, loggable, active, sort_order, notes, explanation)
	values
		('split_payment', 'Split Payment (digital part)', 'purchase', 'core', 'variable', null, null, null, null,
		 null, null, null, null, false, true, 307,
		 'System only: the digital part of a purchase split between digital and physical coins. meta.item names the item.',
		 'Any purchase can be split: part paid from your balance now and part in physical coins handed to your teacher. You get the item when your teacher confirms the physical part. If it is denied, the digital part comes back. You cannot split while your balance is below zero.'),
		('payout_hold', 'Coins Out (held for payday)', 'adjustment', 'core', 'variable', null, null, null, null,
		 null, null, null, null, false, true, 308,
		 'System only: coins a student asked to take out, held until payday settles the request or they cancel it.',
		 'Ask for coins out on your coin page, up to your balance. The coins are held right away and handed to you on payday, the first class day of each month. Cancel any time before then and they come back. If you are absent on payday, your request waits for the next one.')
	on conflict (id) do nothing;
end
$cat$;

-- ===== PART A BEGIN =====
-- ===== PART A: THE QUOTE =====

create or replace function public._coin_quote(
	p_email text, p_item text, p_grams numeric, p_section_id uuid, p_submission_id uuid, p_points integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_price numeric;
	v_quote jsonb;
	v_sub public.classroom_submissions;
	v_room jsonb;
	v_pending numeric;
	v_spool numeric;
begin
	if p_item = 'eating_pass' then
		select c.amount into v_price from public.coin_categories c
		where c.id = 'eating_pass' and c.active and c.kind = 'purchase' and c.pricing_model = 'flat';
		if v_price is null then
			return jsonb_build_object('ok', false, 'reason', 'not_available');
		end if;
		if public.coin_eating_pass_active(v_email) then
			return jsonb_build_object('ok', false, 'reason', 'pass_already_active');
		end if;
		return jsonb_build_object('ok', true, 'category_id', 'eating_pass', 'price', v_price, 'meta', '{}'::jsonb);
	elsif p_item = 'pay_raise' then
		if not exists (select 1 from public.coin_categories where id = 'pay_raise' and active) then
			return jsonb_build_object('ok', false, 'reason', 'not_available');
		end if;
		v_quote := public._coin_pay_raise_quote(v_email);
		return jsonb_build_object('ok', true, 'category_id', 'pay_raise', 'price', (v_quote ->> 'cost')::numeric,
			'meta', jsonb_build_object('previous_tier', (v_quote ->> 'tier')::integer,
				'new_tier', (v_quote ->> 'new_tier')::integer));
	elsif p_item = 'three_d_printing' then
		if p_grams is null or p_grams <= 0 or p_grams > 5000 then
			return jsonb_build_object('ok', false, 'reason', 'grams');
		end if;
		if not exists (select 1 from public.coin_categories where id = 'three_d_printing' and active) then
			return jsonb_build_object('ok', false, 'reason', 'not_available');
		end if;
		-- Spool grams first; only what is left costs coins.
		v_spool := least(p_grams, public._coin_spool_grams(v_email));
		return jsonb_build_object('ok', true, 'category_id', 'three_d_printing',
			'price', case when p_grams - v_spool > 0 then public._coin_print_price(p_grams - v_spool) else 0 end,
			'quantity', p_grams, 'meta', jsonb_build_object('grams', p_grams, 'spool_grams', v_spool));
	elsif p_item = 'extra_credit' then
		if p_points is null or p_points < 1 or p_points > 1000 then
			return jsonb_build_object('ok', false, 'reason', 'points');
		end if;
		if not exists (select 1 from public._coin_economy_enrollments() x
			where x.student_email = v_email and x.section_id = p_section_id) then
			return jsonb_build_object('ok', false, 'reason', 'not_your_class');
		end if;
		select * into v_sub from public.classroom_submissions s where s.id = p_submission_id;
		if v_sub.id is null or v_sub.student_email <> v_email or v_sub.state <> 'returned'
			or not exists (select 1 from public.classroom_postings p
				where p.item_id = v_sub.item_id and p.section_id = p_section_id) then
			return jsonb_build_object('ok', false, 'reason', 'not_your_work');
		end if;
		select c.amount into v_price from public.coin_categories c where c.id = 'extra_credit' and c.active;
		if v_price is null then
			return jsonb_build_object('ok', false, 'reason', 'not_available');
		end if;
		v_room := public._coin_extra_credit_room(v_email, p_section_id);
		if v_room ->> 'semester' is null then
			return jsonb_build_object('ok', false, 'reason', 'no_semester');
		end if;
		-- Points already waiting on a split card in this class count against
		-- the cap, so two pending splits cannot both fit it.
		select coalesce(sum((r.payload ->> 'points')::numeric), 0) into v_pending
		from public.coin_requests r
		where r.kind = 'split' and r.status = 'pending' and r.student_email = v_email
			and r.payload ->> 'item' = 'extra_credit' and r.payload ->> 'section_id' = p_section_id::text;
		if p_points > (v_room ->> 'remaining_points')::numeric - v_pending then
			return jsonb_build_object('ok', false, 'reason', 'cap', 'room', v_room);
		end if;
		return jsonb_build_object('ok', true, 'category_id', 'extra_credit', 'price', round(v_price * p_points, 2),
			'quantity', p_points,
			'meta', jsonb_build_object('section_id', p_section_id::text, 'submission_id', v_sub.id::text,
				'item_id', v_sub.item_id::text, 'semester', v_room ->> 'semester'));
	end if;
	return jsonb_build_object('ok', false, 'reason', 'unknown_item');
end;
$$;
revoke all on function public._coin_quote(text, text, numeric, uuid, uuid, integer) from public, anon, authenticated, service_role;

-- What granting an item does beyond the row: a pay raise's tier, bought
-- extra credit's points. An Eating Pass is granted by the row itself.
create or replace function public._coin_grant_item(p_email text, p_category_id text, p_quantity numeric, p_meta jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	if p_category_id = 'pay_raise' then
		insert into public.coin_wage_tiers (student_email) values (p_email) on conflict (student_email) do nothing;
		update public.coin_wage_tiers set tier = (p_meta ->> 'new_tier')::integer, updated_at = now()
		where student_email = p_email;
	elsif p_category_id = 'extra_credit' then
		update public.classroom_submissions s
		set extra_credit = coalesce(s.extra_credit, 0) + p_quantity,
			score = coalesce(s.score, 0) + p_quantity,
			updated_at = now()
		where s.id = (p_meta ->> 'submission_id')::uuid;
	end if;
end;
$$;
revoke all on function public._coin_grant_item(text, text, numeric, jsonb) from public, anon, authenticated, service_role;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: THE SPLIT CHECKOUT =====

create or replace function public.coin_buy_split(
	p_item text,
	p_physical_part numeric,
	p_grams numeric default null,
	p_section_id uuid default null,
	p_submission_id uuid default null,
	p_points integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb := public._coin_student_seam('buy_split');
	v_email text;
	v_quote jsonb;
	v_price numeric;
	v_physical numeric := round(coalesce(p_physical_part, -1), 2);
	v_digital numeric;
	v_balance numeric;
	v_hold public.coin_transactions;
	v_req public.coin_requests;
begin
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	perform pg_advisory_xact_lock(hashtext('coin_split:' || v_email));
	v_balance := public._coin_balance(v_email);
	if v_balance < 0 then
		return jsonb_build_object('ok', false, 'reason', 'in_debt', 'balance', v_balance);
	end if;
	if p_item in ('eating_pass', 'pay_raise') and exists (select 1 from public.coin_requests r
		where r.kind = 'split' and r.status = 'pending' and r.student_email = v_email and r.payload ->> 'item' = p_item) then
		return jsonb_build_object('ok', false, 'reason', 'already_pending');
	end if;
	v_quote := public._coin_quote(v_email, p_item, p_grams, p_section_id, p_submission_id, p_points);
	if not (v_quote ->> 'ok')::boolean then
		return v_quote;
	end if;
	v_price := (v_quote ->> 'price')::numeric;
	if v_physical <= 0 or v_physical > v_price then
		return jsonb_build_object('ok', false, 'reason', 'physical_part', 'price', v_price);
	end if;
	v_digital := v_price - v_physical;
	if v_balance - v_digital < 0 then
		return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance, 'cost', v_digital);
	end if;
	v_req := public._coin_new_request('split', v_email, v_physical, null,
		jsonb_build_object('item', p_item, 'category_id', v_quote ->> 'category_id', 'price', v_price,
			'digital', v_digital, 'physical', v_physical, 'quantity', v_quote -> 'quantity',
			'section_id', p_section_id, 'meta', v_quote -> 'meta',
			'points', p_points, 'grams', p_grams), null);
	if v_digital > 0 then
		v_hold := public._coin_insert(v_email, 'split_payment', -v_digital, null,
			'Split payment, digital part: ' || coalesce((select c.name from public.coin_categories c
				where c.id = v_quote ->> 'category_id'), p_item) || '.',
			jsonb_build_object('item', p_item, 'request_id', v_req.id::text, 'self_service', true), 'digital');
		update public.coin_requests set payload = payload || jsonb_build_object('digital_transaction_id', v_hold.id::text)
		where id = v_req.id;
	end if;
	if coalesce((v_quote -> 'meta' ->> 'spool_grams')::numeric, 0) > 0 then
		insert into public.coin_print_grams (student_email, grams, source, request_id, note, actor_email)
		values (v_email, -(v_quote -> 'meta' ->> 'spool_grams')::numeric, 'print', v_req.id,
			'Drawn for a split-paid print.', v_email);
	end if;
	return jsonb_build_object('ok', true, 'request_id', v_req.id, 'price', v_price, 'digital', v_digital,
		'physical', v_physical, 'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.coin_buy_split(text, numeric, numeric, uuid, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.coin_buy_split(text, numeric, numeric, uuid, uuid, integer) to authenticated;

-- Called by _coin_decide (0245). Approve: record the physical part and grant
-- the item, after asking the quote again (the pass may have been bought
-- since, the tier may have moved). Deny: refund the digital part.
create or replace function public._coin_decide_split(p_req public.coin_requests, p_approve boolean, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_p jsonb := p_req.payload;
	v_item text := v_p ->> 'item';
	v_cat text := v_p ->> 'category_id';
	v_meta jsonb := coalesce(v_p -> 'meta', '{}'::jsonb);
	v_row public.coin_transactions;
	v_rev jsonb;
	v_tier integer;
begin
	if not p_approve then
		if v_p ? 'digital_transaction_id' then
			v_rev := public._coin_reverse((v_p ->> 'digital_transaction_id')::uuid, 'Split payment denied: digital part refunded.', p_actor);
			if not coalesce((v_rev ->> 'ok')::boolean, false) and v_rev ->> 'reason' <> 'already_reversed' then
				return v_rev;
			end if;
		end if;
		if coalesce((v_meta ->> 'spool_grams')::numeric, 0) > 0 then
			insert into public.coin_print_grams (student_email, grams, source, request_id, note, actor_email)
			values (p_req.student_email, (v_meta ->> 'spool_grams')::numeric, 'refund', p_req.id,
				'Split-paid print denied: spool grams returned.', p_actor);
		end if;
		return jsonb_build_object('refund', v_rev);
	end if;
	if v_item = 'eating_pass' and public.coin_eating_pass_active(p_req.student_email) then
		return jsonb_build_object('ok', false, 'reason', 'pass_already_active');
	end if;
	if v_item = 'pay_raise' then
		select greatest(coalesce(w.tier, 1), 1) into v_tier from public.coin_wage_tiers w where w.student_email = p_req.student_email;
		if greatest(coalesce(v_tier, 1), 1) <> (v_meta ->> 'previous_tier')::integer then
			return jsonb_build_object('ok', false, 'reason', 'tier_changed');
		end if;
	end if;
	v_row := public._coin_insert(p_req.student_email, v_cat, -(v_p ->> 'physical')::numeric,
		(v_p ->> 'quantity')::numeric, 'Split payment, physical part confirmed.',
		v_meta || jsonb_build_object('paid_in', 'physical_coins', 'split_request_id', p_req.id::text,
			'digital_part', (v_p ->> 'digital')::numeric, 'price', (v_p ->> 'price')::numeric),
		'physical', null, p_actor);
	perform public._coin_grant_item(p_req.student_email, v_cat, (v_p ->> 'quantity')::numeric, v_meta);
	return jsonb_build_object('physical_transaction_id', v_row.id, 'granted', v_item);
end;
$$;
revoke all on function public._coin_decide_split(public.coin_requests, boolean, text) from public, anon, authenticated, service_role;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: PAYDAY =====

-- The days the school has no class (settings), and whether a day is a class
-- day at all: a weekday, inside a semester, not on that list.
create or replace function public._coin_is_class_day(p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select extract(isodow from p_day) between 1 and 5
		and public._coin_semester_of(p_day) is not null
		and not exists (select 1 from jsonb_array_elements_text(coalesce(public._coin_setting('no_class_days'), '[]'::jsonb)) d
			where d::date = p_day);
$$;
revoke all on function public._coin_is_class_day(date) from public, anon, authenticated, service_role;

-- The next payday on or after a day: the payday_dates list when it holds one,
-- otherwise the first class day of the month (this month's if it has not
-- passed, else next month's).
create or replace function public._coin_next_payday(p_from date default null)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_from date := coalesce(p_from, public._coin_la_today());
	v_listed date;
	v_month date := date_trunc('month', v_from)::date;
	v_day date;
	v_i integer := 0;
begin
	select min(d::date) into v_listed
	from jsonb_array_elements_text(coalesce(public._coin_setting('payday_dates'), '[]'::jsonb)) d
	where d::date >= v_from;
	if jsonb_array_length(coalesce(public._coin_setting('payday_dates'), '[]'::jsonb)) > 0 then
		return v_listed;
	end if;
	while v_i < 14 loop
		v_day := v_month;
		while v_day < (v_month + interval '1 month')::date loop
			if public._coin_is_class_day(v_day) then
				exit;
			end if;
			v_day := v_day + 1;
		end loop;
		if v_day < (v_month + interval '1 month')::date and v_day >= v_from then
			return v_day;
		end if;
		v_month := (v_month + interval '1 month')::date;
		v_i := v_i + 1;
	end loop;
	return null;
end;
$$;
revoke all on function public._coin_next_payday(date) from public, anon, authenticated, service_role;

-- The open request of a student, if any.
create or replace function public._coin_open_payout(p_email text)
returns public.coin_payout_requests
language sql
stable
security definer
set search_path = ''
as $$
	select * from public.coin_payout_requests r
	where r.student_email = lower(btrim(coalesce(p_email, ''))) and r.cancelled_at is null and r.settled_at is null
	limit 1;
$$;
revoke all on function public._coin_open_payout(text) from public, anon, authenticated, service_role;

create or replace function public.coin_request_payout(p_coins numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb;
	v_email text;
	v_coins numeric := round(coalesce(p_coins, 0), 2);
	v_balance numeric;
	v_req public.coin_payout_requests;
	v_hold public.coin_transactions;
begin
	if v_coins <= 0 or v_coins > 100000 then
		return jsonb_build_object('ok', false, 'reason', 'coins');
	end if;
	v_seam := public._coin_student_seam('request_payout');
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	perform pg_advisory_xact_lock(hashtext('coin_payout_request:' || v_email));
	if (public._coin_open_payout(v_email)).id is not null then
		return jsonb_build_object('ok', false, 'reason', 'already_open');
	end if;
	v_balance := public._coin_balance(v_email);
	if v_coins > v_balance then
		return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance, 'cost', v_coins);
	end if;
	insert into public.coin_payout_requests (student_email, amount) values (v_email, v_coins) returning * into v_req;
	v_hold := public._coin_insert(v_email, 'payout_hold', -v_coins, null, 'Coins out, held for payday.',
		jsonb_build_object('payout_request_id', v_req.id::text, 'self_service', true), 'digital');
	update public.coin_payout_requests set hold_transaction_id = v_hold.id where id = v_req.id;
	return jsonb_build_object('ok', true, 'request_id', v_req.id, 'coins', v_coins,
		'payday', public._coin_next_payday(), 'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.coin_request_payout(numeric) from public, anon, authenticated, service_role;
grant execute on function public.coin_request_payout(numeric) to authenticated;

create or replace function public.coin_cancel_payout()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_req public.coin_payout_requests;
	v_rev jsonb;
begin
	if (select auth.uid()) is null or v_email = '' then
		return jsonb_build_object('ok', false, 'reason', 'signed_out');
	end if;
	select * into v_req from public.coin_payout_requests r
	where r.student_email = v_email and r.cancelled_at is null and r.settled_at is null for update;
	if v_req.id is null then
		return jsonb_build_object('ok', false, 'reason', 'none_open');
	end if;
	v_rev := public._coin_reverse(v_req.hold_transaction_id, 'Coins out cancelled.', v_email);
	update public.coin_payout_requests set cancelled_at = now() where id = v_req.id;
	return jsonb_build_object('ok', true, 'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.coin_cancel_payout() from public, anon, authenticated, service_role;
grant execute on function public.coin_cancel_payout() to authenticated;

-- The payout transfer itself (0096's two rows), with no gate: the callers
-- gate. A digital debit and a physical credit sharing one transfer id.
create or replace function public._coin_payout(p_email text, p_amount numeric, p_note text, p_actor text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_transfer uuid := gen_random_uuid();
	v_meta jsonb := jsonb_build_object('transfer_id', v_transfer::text, 'transfer_amount', p_amount);
begin
	perform public._coin_insert(p_email, 'coin_payout', -p_amount, null, p_note,
		v_meta || jsonb_build_object('transfer_side', 'digital_debit'), 'digital', v_transfer, p_actor);
	perform public._coin_insert(p_email, 'payout_physical_credit', p_amount, null, p_note,
		v_meta || jsonb_build_object('transfer_side', 'physical_credit'), 'physical', v_transfer, p_actor);
	return v_transfer;
end;
$$;
revoke all on function public._coin_payout(text, numeric, text, text) from public, anon, authenticated, service_role;

-- THE PAYDAY LIST for one class: open requests, and students in debt.
create or replace function public.coin_payday(p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can open payday.';
	end if;
	if p_section_id is null then
		return jsonb_build_object('payday', public._coin_next_payday(),
			'sections', coalesce((select jsonb_agg(jsonb_build_object('id', s.id,
					'label', public._coin_classroom_section_label(s.id),
					'requests', (select count(*) from public.coin_payout_requests r
						join public._coin_economy_enrollments() x on x.student_email = r.student_email and x.section_id = s.id
						where r.cancelled_at is null and r.settled_at is null),
					'in_debt', (select count(*) from public._coin_economy_enrollments() x
						where x.section_id = s.id and public._coin_balance(x.student_email) < 0))
					order by public._coin_classroom_section_label(s.id))
				from public.classroom_sections s
				where s.active and s.coin_economy_on and s.id in (select public._coin_scope_sections())), '[]'::jsonb));
	end if;
	if not public._coin_section_in_scope(p_section_id) then
		raise exception 'That class is not one of yours.';
	end if;
	return jsonb_build_object(
		'payday', public._coin_next_payday(),
		'section_id', p_section_id,
		'label', public._coin_classroom_section_label(p_section_id),
		'requests', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'email', r.student_email,
				'name', x.display_name, 'coins', r.amount, 'requested_at', r.created_at,
				'balance', public._coin_balance(r.student_email)) order by x.display_name)
			from public.coin_payout_requests r
			join public._coin_economy_enrollments() x on x.student_email = r.student_email and x.section_id = p_section_id
			where r.cancelled_at is null and r.settled_at is null), '[]'::jsonb),
		'debts', coalesce((select jsonb_agg(jsonb_build_object('email', x.student_email, 'name', x.display_name,
				'balance', public._coin_balance(x.student_email)) order by public._coin_balance(x.student_email), x.display_name)
			from public._coin_economy_enrollments() x
			where x.section_id = p_section_id and public._coin_balance(x.student_email) < 0), '[]'::jsonb)
	);
end;
$$;
revoke all on function public.coin_payday(uuid) from public, anon, authenticated, service_role;
grant execute on function public.coin_payday(uuid) to authenticated;

-- DONE. Settles every listed (ticked) request: its hold is reversed and the
-- payout transfer posted for it, once. Unlisted requests stay held for the
-- next payday. A request whose student's balance fell below its amount since
-- (a fine after asking) is paid what the balance allows, and one with nothing
-- left is cancelled, each said in the result.
create or replace function public.coin_payday_settle(p_request_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_id uuid;
	v_req public.coin_payout_requests;
	v_bal numeric;
	v_pay numeric;
	v_transfer uuid;
	v_results jsonb := '[]'::jsonb;
	v_ok integer := 0;
	v_actor text := public.current_user_email();
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can settle payday.';
	end if;
	foreach v_id in array coalesce(p_request_ids, array[]::uuid[]) loop
		select * into v_req from public.coin_payout_requests where id = v_id for update;
		if v_req.id is null or not public._coin_student_in_scope(v_req.student_email) then
			v_results := v_results || jsonb_build_array(jsonb_build_object('id', v_id, 'ok', false, 'reason', 'not_found'));
			continue;
		end if;
		if v_req.settled_at is not null or v_req.cancelled_at is not null then
			v_results := v_results || jsonb_build_array(jsonb_build_object('id', v_id, 'ok', false, 'reason', 'already_closed'));
			continue;
		end if;
		perform public._coin_reverse(v_req.hold_transaction_id, 'Coins out settled on payday.', v_actor);
		v_bal := public._coin_balance(v_req.student_email);
		v_pay := least(v_req.amount, greatest(v_bal, 0));
		if v_pay <= 0 then
			update public.coin_payout_requests set cancelled_at = now(), settled_by = v_actor,
				note = 'Balance below zero on payday; nothing handed out.'
			where id = v_req.id;
			v_results := v_results || jsonb_build_array(jsonb_build_object('id', v_id, 'ok', false, 'reason', 'no_balance'));
			continue;
		end if;
		v_transfer := public._coin_payout(v_req.student_email, v_pay, 'Coins out, payday.', v_actor);
		update public.coin_payout_requests set settled_at = now(), settled_by = v_actor, paid_amount = v_pay,
			transfer_id = v_transfer,
			note = case when v_pay < v_req.amount then 'Paid what the balance allowed.' end
		where id = v_req.id;
		v_ok := v_ok + 1;
		v_results := v_results || jsonb_build_array(jsonb_build_object('id', v_id, 'ok', true, 'paid', v_pay,
			'partial', v_pay < v_req.amount));
	end loop;
	return jsonb_build_object('ok', true, 'settled', v_ok, 'results', v_results);
end;
$$;
revoke all on function public.coin_payday_settle(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.coin_payday_settle(uuid[]) to authenticated;

-- A debt paid in physical coins on payday: the count received, as a
-- debt_payment (an award, so section staff may post it for their students).
create or replace function public.coin_payday_debt_payment(p_email text, p_coins numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can record a debt payment.';
	end if;
	if p_coins is null or p_coins <= 0 or p_coins > 100000 then
		return jsonb_build_object('ok', false, 'reason', 'coins');
	end if;
	return public.coin_log_transaction(p_email, 'debt_payment', p_coins, null, 'Debt paid in physical coins on payday.');
end;
$$;
revoke all on function public.coin_payday_debt_payment(text, numeric) from public, anon, authenticated, service_role;
grant execute on function public.coin_payday_debt_payment(text, numeric) to authenticated;
-- ===== PART C END =====

do $chk$
declare
	r record;
begin
	for r in
		select p.oid::regprocedure::text as sig
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname in ('coin_buy_split', 'coin_request_payout', 'coin_cancel_payout',
			'coin_payday', 'coin_payday_settle', 'coin_payday_debt_payment')
			and has_function_privilege('anon', p.oid, 'execute')
	loop
		raise exception '0246: anon must not execute %.', r.sig;
	end loop;
	for r in
		select p.oid::regprocedure::text as sig, pg_get_function_identity_arguments(p.oid) as args
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname in ('coin_buy_split', 'coin_request_payout', 'coin_cancel_payout')
	loop
		if r.args ~* '(email|amount|cost|price)' then
			raise exception '0246: % takes an identity or an amount (%).', r.sig, r.args;
		end if;
	end loop;
	raise notice '0246: split payment and payday are in place. Next payday: %.', public._coin_next_payday();
end
$chk$;
