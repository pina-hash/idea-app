-- 0276_coin_transfers.sql
--
-- IDEA COIN LATER FEATURES, PART TWO (ledger 0402, decision 70): ONE STUDENT
-- SENDS COINS TO ANOTHER.
--
-- A student sets a PIN once (four to six digits, stored hashed: pgcrypto's
-- crypt with a bcrypt salt where the database has it, a salted iterated
-- sha256 where it does not, and the column says which). Five wrong tries lock
-- sending for fifteen minutes. A transfer goes to any student in the economy,
-- named by the Ledger's opaque public id, never an address, with an optional
-- message of up to 200 characters.
--
-- LIMITS (defaults, all on /coin-desk/settings): 20 coins sent a day, and no
-- sending while in debt. A transfer is PUBLIC by default: it appears in the
-- transfer feed on the Ledger and on /market. PRIVATE costs 10 percent of the
-- amount (at least 0.1), a sink, and keeps the transfer out of every public
-- feed; both parties and coin staff still see it. Staff may remove a message
-- from the feed; the amount stays on the record.
--
-- COINS ARE CONSERVED: out -A on the sender, in +A on the recipient, and the
-- fee -F on the sender, so the economy changes by -F exactly.
--
-- The amount is the sender's own choice (it is a gift); it is bounded by the
-- cap and the balance, both checked here before anything is written.
--
-- UNDO: drop the functions this file creates and the two coin_transfer
-- tables, re-paste 0250's coin_public_transactions and coin_public_student,
-- and delete the three coin_transfer_ categories if no row names them.

-- ===== PART A BEGIN =====
-- ===== PART A: TABLES, CATEGORIES, DEFAULTS =====

create table if not exists public.coin_transfer_pins (
	student_email text primary key check (student_email = lower(btrim(student_email))),
	pin_algo text not null check (pin_algo in ('bf', 'sha256')),
	pin_hash text not null,
	failed_count integer not null default 0 check (failed_count >= 0),
	locked_until timestamptz,
	set_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
alter table public.coin_transfer_pins enable row level security;
revoke all on table public.coin_transfer_pins from public, anon, authenticated, service_role;

create table if not exists public.coin_transfers (
	id uuid primary key default gen_random_uuid(),
	from_email text not null check (from_email = lower(btrim(from_email))),
	to_email text not null check (to_email = lower(btrim(to_email))),
	amount numeric(12,2) not null check (amount > 0),
	message text check (message is null or char_length(message) <= 200),
	private boolean not null default false,
	fee numeric(12,2) not null default 0 check (fee >= 0),
	out_txn uuid,
	in_txn uuid,
	fee_txn uuid,
	message_removed_at timestamptz,
	message_removed_by text,
	message_removed_reason text check (message_removed_reason is null or char_length(message_removed_reason) <= 300),
	created_at timestamptz not null default now(),
	check (from_email <> to_email)
);
create index if not exists coin_transfers_from on public.coin_transfers (from_email, created_at desc);
create index if not exists coin_transfers_to on public.coin_transfers (to_email, created_at desc);
create index if not exists coin_transfers_feed on public.coin_transfers (created_at desc) where not private;
alter table public.coin_transfers enable row level security;
revoke all on table public.coin_transfers from public, anon, authenticated, service_role;

do $cat$
begin
	insert into public.coin_categories
		(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label,
		 formula_key, semester_point_cap, cap_period, cap_count, loggable, active, sort_order, notes, explanation)
	values
		('coin_transfer_out', 'Coins sent to a classmate', 'adjustment', 'core', 'variable', null, null, null, null,
		 null, null, null, null, false, true, 420,
		 'System only: a student-to-student transfer, the sending side.',
		 'Coins you sent to another student.'),
		('coin_transfer_in', 'Coins from a classmate', 'adjustment', 'core', 'variable', null, null, null, null,
		 null, null, null, null, false, true, 421,
		 'System only: a student-to-student transfer, the receiving side.',
		 'Coins another student sent you.'),
		('coin_transfer_private_fee', 'Private transfer fee', 'purchase', 'core', 'variable', null, null, null, null,
		 null, null, null, null, false, true, 422,
		 'System only: the private-transfer fee, a sink.',
		 'You can send coins to any student in the economy with your transfer PIN. Five wrong PIN tries lock sending for 15 minutes. You can send up to the daily limit, and not while you are in debt. Transfers are public on the Ledger unless you pay a fee to keep one private.')
	on conflict (id) do nothing;

	insert into public.coin_settings (key, value, updated_by) values
		('transfer_daily_cap', '20'::jsonb, 'system'),
		('transfer_private_fee_percent', '10'::jsonb, 'system'),
		('transfer_private_fee_min', '0.1'::jsonb, 'system'),
		('transfer_pin_tries', '5'::jsonb, 'system'),
		('transfer_lock_minutes', '15'::jsonb, 'system')
	on conflict (key) do nothing;
end
$cat$;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: THE PIN =====

-- A hash of a PIN: bcrypt through pgcrypto when this database has it
-- (Supabase installs it in the extensions schema), otherwise a salted sha256
-- iterated five thousand times. Returns the algorithm and the hash.
create or replace function public._coin_pin_hash(p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_hash text;
	v_salt text;
	i integer;
begin
	if to_regprocedure('extensions.crypt(text,text)') is not null
		and to_regprocedure('extensions.gen_salt(text,integer)') is not null then
		execute format('select extensions.crypt(%L, extensions.gen_salt(%L, 8))', p_pin, 'bf') into v_hash;
		return jsonb_build_object('algo', 'bf', 'hash', v_hash);
	end if;
	v_salt := md5(gen_random_uuid()::text);
	v_hash := v_salt || ':' || p_pin;
	for i in 1..5000 loop
		v_hash := encode(sha256(convert_to(v_hash || v_salt, 'UTF8')), 'hex');
	end loop;
	return jsonb_build_object('algo', 'sha256', 'hash', v_salt || ':' || v_hash);
end;
$$;
revoke all on function public._coin_pin_hash(text) from public, anon, authenticated, service_role;

create or replace function public._coin_pin_matches(p_pin text, p_algo text, p_hash text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_ok boolean;
	v_salt text := split_part(coalesce(p_hash, ''), ':', 1);
	v_h text;
	i integer;
begin
	if p_pin is null or p_hash is null then
		return false;
	end if;
	if p_algo = 'bf' then
		if to_regprocedure('extensions.crypt(text,text)') is null then
			return false;
		end if;
		execute format('select extensions.crypt(%L, %L) = %L', p_pin, p_hash, p_hash) into v_ok;
		return coalesce(v_ok, false);
	end if;
	v_h := v_salt || ':' || p_pin;
	for i in 1..5000 loop
		v_h := encode(sha256(convert_to(v_h || v_salt, 'UTF8')), 'hex');
	end loop;
	return v_salt || ':' || v_h = p_hash;
end;
$$;
revoke all on function public._coin_pin_matches(text, text, text) from public, anon, authenticated, service_role;

-- Checks a PIN and keeps the count of wrong tries. Writes its count even when
-- the answer is no, so the lockout holds whatever the caller does next.
create or replace function public._coin_pin_check(p_email text, p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_row public.coin_transfer_pins;
	v_tries integer := coalesce((public._coin_setting('transfer_pin_tries') #>> '{}')::integer, 5);
	v_lock integer := coalesce((public._coin_setting('transfer_lock_minutes') #>> '{}')::integer, 15);
	v_failed integer;
begin
	select * into v_row from public.coin_transfer_pins p where p.student_email = p_email for update;
	if v_row.student_email is null then
		return jsonb_build_object('ok', false, 'reason', 'no_pin');
	end if;
	if v_row.locked_until is not null and v_row.locked_until > now() then
		return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', v_row.locked_until);
	end if;
	if public._coin_pin_matches(coalesce(p_pin, ''), v_row.pin_algo, v_row.pin_hash) then
		update public.coin_transfer_pins set failed_count = 0, locked_until = null, updated_at = now()
		where student_email = p_email;
		return jsonb_build_object('ok', true);
	end if;
	v_failed := v_row.failed_count + 1;
	if v_failed >= v_tries then
		update public.coin_transfer_pins
		set failed_count = 0, locked_until = now() + make_interval(mins => v_lock), updated_at = now()
		where student_email = p_email;
		return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', now() + make_interval(mins => v_lock));
	end if;
	update public.coin_transfer_pins set failed_count = v_failed, locked_until = null, updated_at = now()
	where student_email = p_email;
	return jsonb_build_object('ok', false, 'reason', 'wrong_pin', 'tries_left', v_tries - v_failed);
end;
$$;
revoke all on function public._coin_pin_check(text, text) from public, anon, authenticated, service_role;

-- Set the PIN, or change it with the old one.
create or replace function public.coin_transfer_pin_set(p_pin text, p_old_pin text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb;
	v_email text;
	v_check jsonb;
	v_h jsonb;
begin
	if p_pin is null or p_pin !~ '^\d{4,6}$' then
		return jsonb_build_object('ok', false, 'reason', 'pin_shape');
	end if;
	v_seam := public._coin_student_seam('transfer_pin_set');
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	if exists (select 1 from public.coin_transfer_pins p where p.student_email = v_email) then
		v_check := public._coin_pin_check(v_email, p_old_pin);
		if not (v_check ->> 'ok')::boolean then
			return v_check;
		end if;
	end if;
	v_h := public._coin_pin_hash(p_pin);
	insert into public.coin_transfer_pins (student_email, pin_algo, pin_hash)
	values (v_email, v_h ->> 'algo', v_h ->> 'hash')
	on conflict (student_email) do update set pin_algo = excluded.pin_algo, pin_hash = excluded.pin_hash,
		failed_count = 0, locked_until = null, set_at = now(), updated_at = now();
	return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.coin_transfer_pin_set(text, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_transfer_pin_set(text, text) to authenticated;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: SENDING =====

create or replace function public._coin_transfer_fee(p_amount numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
	select greatest(
		round(p_amount * coalesce((public._coin_setting('transfer_private_fee_percent') #>> '{}')::numeric, 10) / 100, 2),
		coalesce((public._coin_setting('transfer_private_fee_min') #>> '{}')::numeric, 0.1));
$$;
revoke all on function public._coin_transfer_fee(numeric) from public, anon, authenticated, service_role;

create or replace function public._coin_transfer_sent_today(p_email text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(sum(t.amount), 0) from public.coin_transfers t
	where t.from_email = p_email and public._coin_la_today(t.created_at) = public._coin_la_today();
$$;
revoke all on function public._coin_transfer_sent_today(text) from public, anon, authenticated, service_role;

create or replace function public.coin_transfer_send(
	p_to text,
	p_amount numeric,
	p_message text,
	p_private boolean,
	p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb;
	v_email text;
	v_to text;
	v_msg text := nullif(btrim(coalesce(p_message, '')), '');
	v_private boolean := coalesce(p_private, false);
	v_cap numeric := coalesce((public._coin_setting('transfer_daily_cap') #>> '{}')::numeric, 20);
	v_sent numeric;
	v_fee numeric := 0;
	v_balance numeric;
	v_pin jsonb;
	v_id uuid := gen_random_uuid();
	v_meta jsonb;
	v_out public.coin_transactions;
	v_in public.coin_transactions;
	v_fee_row public.coin_transactions;
begin
	if p_amount is null or p_amount < 0.1 or p_amount > 100000 or p_amount <> round(p_amount, 2) then
		return jsonb_build_object('ok', false, 'reason', 'amount');
	end if;
	if v_msg is not null and char_length(v_msg) > 200 then
		return jsonb_build_object('ok', false, 'reason', 'message');
	end if;
	if coalesce(btrim(p_to), '') = '' then
		return jsonb_build_object('ok', false, 'reason', 'recipient');
	end if;
	v_seam := public._coin_student_seam('transfer_send');
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	select x.student_email into v_to from public._coin_economy_enrollments() x
	where public._coin_market_pid(x.student_email) = lower(btrim(p_to)) limit 1;
	if v_to is null then
		return jsonb_build_object('ok', false, 'reason', 'recipient');
	end if;
	if v_to = v_email then
		return jsonb_build_object('ok', false, 'reason', 'self');
	end if;
	-- The PIN comes before anything about money, so a wrong PIN learns nothing.
	v_pin := public._coin_pin_check(v_email, p_pin);
	if not (v_pin ->> 'ok')::boolean then
		return v_pin;
	end if;
	perform pg_advisory_xact_lock(hashtext('coin_transfer:' || v_email));
	v_balance := public._coin_balance(v_email);
	if v_balance < 0 then
		return jsonb_build_object('ok', false, 'reason', 'in_debt', 'balance', v_balance);
	end if;
	v_sent := public._coin_transfer_sent_today(v_email);
	if v_sent + p_amount > v_cap then
		return jsonb_build_object('ok', false, 'reason', 'cap', 'cap', v_cap, 'sent_today', v_sent,
			'room', greatest(v_cap - v_sent, 0));
	end if;
	if v_private then
		v_fee := public._coin_transfer_fee(p_amount);
	end if;
	if v_balance - p_amount - v_fee < 0 then
		return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance, 'cost', p_amount + v_fee);
	end if;
	v_meta := jsonb_build_object('coin_transfer', v_id::text, 'private_transfer', v_private);
	v_out := public._coin_insert(v_email, 'coin_transfer_out', -p_amount, null,
		left('To ' || public._coin_market_name(v_to) || coalesce(': ' || v_msg, '.'), 500), v_meta, 'digital', null, v_email);
	v_in := public._coin_insert(v_to, 'coin_transfer_in', p_amount, null,
		left('From ' || public._coin_market_name(v_email) || coalesce(': ' || v_msg, '.'), 500), v_meta, 'digital', null, v_email);
	if v_fee > 0 then
		v_fee_row := public._coin_insert(v_email, 'coin_transfer_private_fee', -v_fee, null,
			'Fee to keep a transfer private.', v_meta, 'digital', null, v_email);
	end if;
	insert into public.coin_transfers (id, from_email, to_email, amount, message, private, fee, out_txn, in_txn, fee_txn)
	values (v_id, v_email, v_to, p_amount, v_msg, v_private, v_fee, v_out.id, v_in.id, v_fee_row.id);
	return jsonb_build_object('ok', true, 'transfer_id', v_id, 'amount', p_amount, 'fee', v_fee,
		'private', v_private, 'balance', public._coin_balance(v_email),
		'sent_today', v_sent + p_amount, 'cap', v_cap);
end;
$$;
revoke all on function public.coin_transfer_send(text, numeric, text, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_transfer_send(text, numeric, text, boolean, text) to authenticated;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: READS =====

create or replace function public._coin_transfer_json(t public.coin_transfers, p_show_private boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object('id', t.id, 'at', t.created_at, 'amount', t.amount,
		'from', jsonb_build_object('id', public._coin_market_pid(t.from_email), 'name', public._coin_market_name(t.from_email)),
		'to', jsonb_build_object('id', public._coin_market_pid(t.to_email), 'name', public._coin_market_name(t.to_email)),
		'message', case when t.message_removed_at is null then t.message end,
		'message_removed', t.message_removed_at is not null,
		'private', case when p_show_private then t.private else false end,
		'fee', case when p_show_private then t.fee else 0 end);
$$;
revoke all on function public._coin_transfer_json(public.coin_transfers, boolean) from public, anon, authenticated, service_role;

-- The sending sheet's state, and the caller's own transfers (private ones too).
create or replace function public.coin_transfer_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_pin public.coin_transfer_pins;
begin
	if (select auth.uid()) is null or v_email = '' then
		return jsonb_build_object('signed_in', false);
	end if;
	select * into v_pin from public.coin_transfer_pins p where p.student_email = v_email;
	return jsonb_build_object(
		'signed_in', true,
		'in_economy', exists (select 1 from public._coin_economy_enrollments() x where x.student_email = v_email),
		'has_pin', v_pin.student_email is not null,
		'locked_until', case when v_pin.locked_until > now() then v_pin.locked_until end,
		'balance', public._coin_balance(v_email),
		'sent_today', public._coin_transfer_sent_today(v_email),
		'rules', jsonb_build_object(
			'daily_cap', coalesce((public._coin_setting('transfer_daily_cap') #>> '{}')::numeric, 20),
			'private_fee_percent', coalesce((public._coin_setting('transfer_private_fee_percent') #>> '{}')::numeric, 10),
			'private_fee_min', coalesce((public._coin_setting('transfer_private_fee_min') #>> '{}')::numeric, 0.1),
			'pin_tries', coalesce((public._coin_setting('transfer_pin_tries') #>> '{}')::integer, 5),
			'lock_minutes', coalesce((public._coin_setting('transfer_lock_minutes') #>> '{}')::integer, 15)),
		'mine', coalesce((select jsonb_agg(public._coin_transfer_json(t, true) ||
				jsonb_build_object('direction', case when t.from_email = v_email then 'out' else 'in' end)
				order by t.created_at desc)
			from (select * from public.coin_transfers t2 where t2.from_email = v_email or t2.to_email = v_email
				order by t2.created_at desc limit 50) t), '[]'::jsonb));
end;
$$;
revoke all on function public.coin_transfer_status() from public, anon, authenticated, service_role;
grant execute on function public.coin_transfer_status() to authenticated;

-- Everyone a student may send to: the economy, by name and public id.
create or replace function public.coin_transfer_directory()
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
	return coalesce((select jsonb_agg(jsonb_build_object('id', public._coin_market_pid(d.email),
			'name', public._coin_market_name(d.email), 'classes', public._coin_market_classes(d.email))
			order by public._coin_market_name(d.email))
		from (select distinct x.student_email as email from public._coin_economy_enrollments() x
			where x.student_email <> v_email) d), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_transfer_directory() from public, anon, authenticated, service_role;
grant execute on function public.coin_transfer_directory() to authenticated;

-- The public feed: never a private transfer, never a removed message.
create or replace function public.coin_public_transfers(p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(jsonb_agg(public._coin_transfer_json(t, false) order by t.created_at desc), '[]'::jsonb)
	from (select * from public.coin_transfers t2 where not t2.private
		order by t2.created_at desc limit greatest(1, least(coalesce(p_limit, 50), 200))) t;
$$;
revoke all on function public.coin_public_transfers(integer) from public, anon, authenticated, service_role;
grant execute on function public.coin_public_transfers(integer) to anon, authenticated;

-- Staff: every transfer touching their students, private ones included.
create or replace function public.coin_transfer_moderation()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can read every transfer.';
	end if;
	return coalesce((select jsonb_agg(public._coin_transfer_json(t, true) ||
			jsonb_build_object('message_removed_reason', t.message_removed_reason, 'raw_message', t.message)
			order by t.created_at desc)
		from (select * from public.coin_transfers t2
			where public._coin_student_in_scope(t2.from_email) or public._coin_student_in_scope(t2.to_email)
			order by t2.created_at desc limit 300) t), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_transfer_moderation() from public, anon, authenticated, service_role;
grant execute on function public.coin_transfer_moderation() to authenticated;

create or replace function public.coin_transfer_remove_message(p_transfer_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_t public.coin_transfers;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can remove a transfer message.';
	end if;
	if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
		return jsonb_build_object('ok', false, 'reason', 'remove_reason');
	end if;
	select * into v_t from public.coin_transfers t where t.id = p_transfer_id for update;
	if v_t.id is null or not (public._coin_student_in_scope(v_t.from_email) or public._coin_student_in_scope(v_t.to_email)) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_t.message_removed_at is not null or v_t.message is null then
		return jsonb_build_object('ok', true, 'changed', false);
	end if;
	update public.coin_transfers
	set message_removed_at = now(), message_removed_by = public.current_user_email(),
		message_removed_reason = left(btrim(p_reason), 300)
	where id = v_t.id;
	-- The amount record stays, and so do the ledger rows: coin_transactions is
	-- append-only, and its notes are read only by the two parties and staff.
	return jsonb_build_object('ok', true, 'changed', true);
end;
$$;
revoke all on function public.coin_transfer_remove_message(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_transfer_remove_message(uuid, text) to authenticated;
-- ===== PART D END =====

-- ===== PART E BEGIN =====
-- ===== PART E: A PRIVATE TRANSFER STAYS OUT OF THE PUBLIC LEDGER =====
-- 0250's two public readers, each with one more condition: a row a private
-- transfer wrote (its out, its in and its fee) is never public.

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
		and coalesce(t.meta ->> 'private_transfer', 'false') <> 'true'
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
				and coalesce(t.meta ->> 'private_transfer', 'false') <> 'true'
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
-- ===== PART E END =====

do $chk$
declare
	r record;
	v_bad text[] := '{}';
	v_h jsonb;
begin
	for r in
		select p.oid::regprocedure::text as sig, p.proname, pg_get_function_identity_arguments(p.oid) as args
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and (p.proname like 'coin\_transfer%' or p.proname like '\_coin\_transfer%'
			or p.proname like '\_coin\_pin\_%')
	loop
		if has_function_privilege('anon', r.sig, 'execute') then
			v_bad := array_append(v_bad, 'anon executes ' || r.sig);
		end if;
		if r.proname not like '\_%' and r.args ~* 'email' then
			v_bad := array_append(v_bad, r.sig || ' takes an address');
		end if;
		if r.proname like '\_%' and has_function_privilege('authenticated', r.sig, 'execute') then
			v_bad := array_append(v_bad, 'a client role executes the private ' || r.sig);
		end if;
	end loop;
	if not has_function_privilege('anon', 'public.coin_public_transfers(integer)', 'execute')
		or not has_function_privilege('anon', 'public.coin_public_transactions(integer)', 'execute') then
		v_bad := array_append(v_bad, 'a public feed lost its anon grant');
	end if;
	v_h := public._coin_pin_hash('2468');
	if not public._coin_pin_matches('2468', v_h ->> 'algo', v_h ->> 'hash')
		or public._coin_pin_matches('2469', v_h ->> 'algo', v_h ->> 'hash') then
		v_bad := array_append(v_bad, 'the PIN hash does not round-trip');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0277 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0277: transfers are in place; the PIN hashes with %; private transfers are out of the public ledger.', v_h ->> 'algo';
end
$chk$;
