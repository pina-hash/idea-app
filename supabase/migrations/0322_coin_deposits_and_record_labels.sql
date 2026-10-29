-- 0322_coin_deposits_and_record_labels.sql
--
-- LEDGER 0455, PART 2: what a coin record says. Mr. Pina's reports of
-- 2026-10-28 (3bcf3c90, 65c46fcf, 218b6169, 636eac71, 649759fe).
--
--   * DEPOSIT. Physical coins a student hands in become digital coins. The
--     category `coin_deposit` (kind award underneath, so every path that
--     treats an award as a credit keeps working) is logged only through
--     coin_log_deposit, which refuses anything under the editable setting
--     `deposit_minimum` (default 5) and writes "Physical to digital" on the
--     record. Physical coins stay untracked cash (IDEA Coin V2 section 1): a
--     deposit adds to the digital balance and records nothing physical. The
--     category is priced 'formula', the existing marker for "use the dedicated
--     function", so coin_log_transaction, the bulk logger and the voice
--     catalog already refuse or skip it.
--   * THE PUBLIC TYPE "Deposit". coin_public_transactions and
--     coin_public_student derive it from the category id, the way they derive
--     Payout (0103); `coinTxnType` in src/lib/coin-format.ts is the same rule.
--   * A CUSTOM RECORD SAYS WHAT IT WAS FOR (65c46fcf, his words: "It shouldn't
--     just say custom ... I should say what the award fine or transaction was
--     for."). On the two public reads a Custom Award, Custom Fine or Custom
--     Purchase gives its note as its reason, cut to 120 characters, and the
--     category name only when it has no note. THIS WIDENS A PUBLIC PAYLOAD,
--     DELIBERATELY AND NARROWLY: only those three categories, whose note is by
--     construction the reason he gave; every other row's note stays off the
--     public reads exactly as before.
--   * Weekly Pay (flat 4, editable on the settings page) for the manual weekly
--     pay he has been logging as Contract Completion, and Donation made
--     loggable from the desk (it was approval-only), each a real category.
--   * coin_transactions_relabel: a full coin admin corrects what past records
--     say (the note, or the category between kinds that keep the sign) in one
--     all-or-nothing call, every change kept in coin_relabel_log. Amounts never
--     change, so no balance moves. It exists so the corrections this lane
--     prepared (17 tournament notes, the past deposits) can run after his yes.
--
-- _coin_setting_ok_0402 is restated word for word with its else branch
-- handing new keys to _coin_setting_ok_0455, the 0276 pattern, so no later
-- file restates the whole list.
--
-- ADDITIVE, NO ORDERING: every function here is new or keeps its signature.
-- IDEMPOTENT: create or replace, if not exists, on conflict do nothing; the
-- seeds run inside one do block and only on the first apply.
--
-- WHAT UNDOES IT: re-run 0276's _coin_setting_ok_0402 and 0277's
-- coin_public_transactions and coin_public_student; drop coin_log_deposit,
-- coin_transactions_relabel and _coin_setting_ok_0455; set the coin_deposit
-- and weekly_pay categories inactive and donation back to loggable = false.
-- Records already written stay as history.

do $pre$
begin
	if to_regprocedure('public.coin_log_transaction(text, text, numeric, numeric, text)') is null then
		raise exception '0322 cannot apply: coin_log_transaction does not exist. Apply 0251 first.';
	end if;
	if to_regprocedure('public._coin_setting_ok_0402(text, jsonb)') is null then
		raise exception '0322 cannot apply: _coin_setting_ok_0402 does not exist. Apply 0276 first.';
	end if;
	if to_regprocedure('public.coin_public_student(text)') is null then
		raise exception '0322 cannot apply: coin_public_student does not exist. Apply 0277 first.';
	end if;
	if to_regclass('public.coin_phrase_aliases') is null then
		raise exception '0322 cannot apply: coin_phrase_aliases does not exist. Apply 0300 first.';
	end if;
end
$pre$;

-- THE FIRST OBJECT IS NEW (the apply probe reads the first created object).
create table if not exists public.coin_relabel_log (
	id bigserial primary key,
	transaction_id uuid not null,
	old_category_id text not null,
	new_category_id text not null,
	old_note text,
	new_note text,
	actor_email text not null,
	created_at timestamptz not null default now()
);
create index if not exists coin_relabel_log_txn on public.coin_relabel_log (transaction_id, created_at);
alter table public.coin_relabel_log enable row level security;
revoke all on table public.coin_relabel_log from public, anon, authenticated, service_role;
revoke all on sequence public.coin_relabel_log_id_seq from public, anon, authenticated, service_role;

-- ===== PART A: THE CATEGORIES AND THE SETTING =====

do $seed$
declare
	v_first boolean := not exists (select 1 from public.coin_categories where id = 'coin_deposit');
	v_added integer := 0;
	v_phrases integer := 0;
	v_setting integer := 0;
begin
	if v_first then
		insert into public.coin_categories
			(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label,
			 formula_key, semester_point_cap, cap_period, cap_count, loggable, active, sort_order, notes, explanation)
		values
			('coin_deposit', 'Deposit', 'award', 'core', 'formula', null, null, null, null,
			 'deposit', null, null, null, true, true, 206,
			 'Ledger 0455: physical coins handed in become digital coins. Logged only through coin_log_deposit, at least the deposit_minimum setting.',
			 'Hand your teacher physical IDEA Coins and they are added to your digital balance. A deposit is at least the minimum your teacher sets.'),
			('weekly_pay', 'Weekly Pay', 'award', 'core', 'flat', 4, null, null, null,
			 null, null, null, null, true, true, 207,
			 'Ledger 0455: the weekly pay Mr. Pina logs by hand, beside the automatic Weekly Wage. The amount is edited on the settings page.',
			 'Pay your teacher gives the class for the week.')
		on conflict (id) do nothing;
		get diagnostics v_added = row_count;
		-- Donation was paid only from an approved want-list claim; staff can now
		-- log one straight from the desk too.
		update public.coin_categories set loggable = true where id = 'donation' and not loggable;

		insert into public.coin_phrase_aliases (phrase, kind, category_id, amount, source, created_by)
		select p.phrase, 'award', p.category_id, null, 'seed', 'system'
		from (values ('donation', 'donation'), ('donated', 'donation'), ('donating', 'donation'),
			('weekly pay', 'weekly_pay')) as p (phrase, category_id)
		where exists (select 1 from public.coin_categories c where c.id = p.category_id)
		on conflict (phrase, kind) do nothing;
		get diagnostics v_phrases = row_count;
	end if;

	insert into public.coin_settings (key, value, updated_by) values ('deposit_minimum', '5'::jsonb, 'system')
	on conflict (key) do nothing;
	get diagnostics v_setting = row_count;
	raise notice '0322: % categories added, % phrases seeded, deposit_minimum % (first apply: %)',
		v_added, v_phrases, case when v_setting = 1 then 'set to 5' else 'already set' end, v_first;
end
$seed$;

create or replace function public._coin_setting_ok_0455(p_key text, p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_n numeric;
begin
	if p_value is null or jsonb_typeof(p_value) <> 'number' then
		return false;
	end if;
	v_n := (p_value #>> '{}')::numeric;
	case p_key
		when 'deposit_minimum' then return v_n = trunc(v_n) and v_n between 1 and 1000;
		else return false;
	end case;
exception when others then
	return false;
end;
$$;
revoke all on function public._coin_setting_ok_0455(text, jsonb) from public, anon, authenticated, service_role;

-- 0276's _coin_setting_ok_0402, word for word, with its else branch handing the
-- keys ledger 0455 adds to _coin_setting_ok_0455.
create or replace function public._coin_setting_ok_0402(p_key text, p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_n numeric;
	v_whole boolean;
begin
	if p_value is null then
		return false;
	end if;
	if p_key = 'banner_style' then
		return jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') in ('ticker', 'spotlight', 'cards');
	end if;
	if jsonb_typeof(p_value) <> 'number' then
		return false;
	end if;
	v_n := (p_value #>> '{}')::numeric;
	v_whole := v_n = trunc(v_n);
	case p_key
		when 'market_sale_fee_percent', 'stock_fee_percent' then return v_n between 0 and 50;
		when 'market_open_listings_max' then return v_whole and v_n between 1 and 50;
		when 'market_listing_days' then return v_whole and v_n between 1 and 120;
		when 'market_auto_release_school_days' then return v_whole and v_n between 1 and 30;
		when 'market_review_edit_hours' then return v_n between 0 and 720;
		when 'market_review_min_chars' then return v_whole and v_n between 1 and 500;
		when 'transfer_daily_cap' then return v_n between 0 and 100000;
		when 'transfer_private_fee_percent' then return v_n between 0 and 100;
		when 'transfer_private_fee_min' then return v_n between 0 and 1000;
		when 'transfer_pin_tries' then return v_whole and v_n between 1 and 20;
		when 'transfer_lock_minutes' then return v_whole and v_n between 1 and 1440;
		when 'hall_pass_block_minutes' then return v_whole and v_n between 1 and 60;
		when 'hall_pass_extra_cap_minutes' then return v_whole and v_n between 0 and 240;
		when 'stock_position_cap' then return v_n between 0 and 100000;
		when 'stock_clamp_percent' then return v_n between 1 and 100;
		when 'stock_floor' then return v_n between 0.01 and 1000;
		when 'stock_ceiling' then return v_n between 1 and 100000;
		when 'stock_base' then return v_n between 0.01 and 1000;
		when 'stock_median_weeks' then return v_whole and v_n between 1 and 52;
		when 'stock_class_window_weeks' then return v_whole and v_n between 1 and 20;
		when 'stock_min_class_students' then return v_whole and v_n between 1 and 50;
		-- Ledger 0455: deposits.
		else return public._coin_setting_ok_0455(p_key, p_value);
	end case;
exception when others then
	return false;
end;
$$;
revoke all on function public._coin_setting_ok_0402(text, jsonb) from public, anon, authenticated, service_role;

-- ===== PART B: A DEPOSIT =====

create or replace function public.coin_log_deposit(p_email text, p_amount numeric, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_note text := nullif(left(btrim(coalesce(p_note, '')), 280), '');
	v_amount numeric := round(p_amount, 2);
	v_min numeric := coalesce((public._coin_setting('deposit_minimum') #>> '{}')::numeric, 5);
	v_row public.coin_transactions;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if not public._coin_full_staff() and not public._coin_student_in_scope(v_email) then
		raise exception 'That student is not in one of your classes.';
	end if;
	if not exists (select 1 from public.coin_categories where id = 'coin_deposit' and active) then
		raise exception 'Deposits are turned off on the settings page.';
	end if;
	if v_amount is null or v_amount <= 0 or v_amount <> trunc(v_amount) or v_amount > 100000 then
		return jsonb_build_object('ok', false, 'reason', 'deposit_amount',
			'message', 'A deposit is a whole number of coins.');
	end if;
	if v_amount < v_min then
		return jsonb_build_object('ok', false, 'reason', 'below_minimum', 'minimum', v_min, 'amount', v_amount,
			'message', format('A deposit is at least %s coins. Nothing was recorded.', v_min));
	end if;
	v_row := public._coin_insert(v_email, 'coin_deposit', v_amount, null,
		'Physical to digital' || coalesce(': ' || v_note, ''),
		jsonb_build_object('deposit', true, 'minimum', v_min), 'digital');
	return jsonb_build_object(
		'ok', true,
		'transaction_id', v_row.id,
		'category_id', 'coin_deposit',
		'amount', v_amount,
		'medium', 'digital',
		'balance', public._coin_balance(v_email)
	);
end;
$$;
revoke all on function public.coin_log_deposit(text, numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_log_deposit(text, numeric, text) to authenticated;

-- ===== PART C: CORRECTING WHAT PAST RECORDS SAY =====

-- p_changes: [{"id": uuid, "category": text (optional), "note": text (optional)}, ...]
create or replace function public.coin_transactions_relabel(p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_el jsonb;
	v_id uuid;
	v_row public.coin_transactions;
	v_old public.coin_categories;
	v_new public.coin_categories;
	v_note text;
	v_seen uuid[] := '{}';
	v_done jsonb := '[]'::jsonb;
	v_actor text := public.current_user_email();
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can correct past coin records.';
	end if;
	if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0
		or jsonb_array_length(p_changes) > 200 then
		return jsonb_build_object('ok', false, 'reason', 'changes',
			'message', 'Send from 1 to 200 changes, each with a record id and a new note or category.');
	end if;
	for v_el in select value from jsonb_array_elements(p_changes) loop
		begin
			v_id := (v_el ->> 'id')::uuid;
		exception when others then
			raise exception 'A change names a record id that is not an id: %.', coalesce(v_el ->> 'id', 'nothing');
		end;
		if v_id is null or v_id = any (v_seen) then
			raise exception 'Every change names a different record (record % is missing or repeated). Nothing was changed.', coalesce(v_id::text, 'id');
		end if;
		v_seen := v_seen || v_id;
		select * into v_row from public.coin_transactions where id = v_id for update;
		if v_row.id is null then
			raise exception 'There is no coin record %. Nothing was changed.', v_id;
		end if;
		if v_row.medium <> 'digital' or v_row.transfer_id is not null or public._coin_is_reversed(v_row.id)
			or v_row.category_id in ('reversal', 'amount_correction', 'payout_hold') then
			raise exception 'Coin record % is a reversal, a correction, a transfer or undone, and cannot be relabeled. Nothing was changed.', v_id;
		end if;
		select * into v_old from public.coin_categories where id = v_row.category_id;
		v_new := v_old;
		if nullif(btrim(coalesce(v_el ->> 'category', '')), '') is not null then
			select * into v_new from public.coin_categories where id = btrim(v_el ->> 'category') and active;
			if v_new.id is null then
				raise exception 'There is no active coin category "%". Nothing was changed.', btrim(v_el ->> 'category');
			end if;
			-- The sign a record carries is its kind's: a credit stays a credit and
			-- a charge stays a charge. A positive correction may become an award
			-- (the deposits logged as balance corrections before Deposit existed).
			if not (v_new.kind = v_old.kind
				or (v_old.kind = 'adjustment' and v_new.kind = 'award' and public._coin_effective_amount(v_row.id) > 0)) then
				raise exception 'Coin record % is a % and cannot become a % (%). Nothing was changed.',
					v_id, v_old.kind, v_new.kind, v_new.name;
			end if;
			if v_new.id in ('coin_payout', 'legacy_payout') or v_old.id in ('coin_payout', 'legacy_payout') then
				raise exception 'A payout is never relabeled. Nothing was changed.';
			end if;
		end if;
		v_note := v_row.note;
		if v_el ? 'note' then
			v_note := nullif(left(btrim(coalesce(v_el ->> 'note', '')), 300), '');
			if v_note is null and v_new.pricing_model in ('variable', 'formula') then
				raise exception 'Coin record % would be a % with no note. Nothing was changed.', v_id, v_new.name;
			end if;
		end if;
		if v_new.id = v_row.category_id and v_note is not distinct from v_row.note then
			continue;
		end if;
		update public.coin_transactions set category_id = v_new.id, note = v_note where id = v_row.id;
		insert into public.coin_relabel_log (transaction_id, old_category_id, new_category_id, old_note, new_note, actor_email)
		values (v_row.id, v_row.category_id, v_new.id, v_row.note, v_note, v_actor);
		v_done := v_done || jsonb_build_object('id', v_row.id, 'from', v_old.name, 'to', v_new.name,
			'old_note', v_row.note, 'note', v_note, 'amount', public._coin_effective_amount(v_row.id));
	end loop;
	return jsonb_build_object('ok', true, 'changed', jsonb_array_length(v_done), 'records', v_done);
end;
$$;
revoke all on function public.coin_transactions_relabel(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.coin_transactions_relabel(jsonb) to authenticated;

-- ===== PART D: THE PUBLIC READS SAY DEPOSIT, AND WHAT A CUSTOM RECORD WAS FOR =====
-- 0277's two public readers, word for word but for two expressions each: the
-- type gains Deposit (by category id, like Payout), and the reason of a Custom
-- Award, Fine or Purchase is its note.

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
			when t.category_id = 'coin_deposit' then 'Deposit'
			when cat.kind = 'fine' then 'Fine'
			when cat.kind = 'award' then 'Award'
			when cat.kind = 'purchase' then 'Purchase'
			else 'Adjustment'
		end,
		case
			when t.category_id in ('custom_award', 'custom_fine', 'custom_purchase')
				and nullif(btrim(coalesce(t.note, '')), '') is not null then left(btrim(t.note), 120)
			else cat.name
		end,
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
					when t.category_id = 'coin_deposit' then 'Deposit'
					when cat.kind = 'fine' then 'Fine'
					when cat.kind = 'award' then 'Award'
					when cat.kind = 'purchase' then 'Purchase'
					else 'Adjustment'
				end as type,
				case
					when t.category_id in ('custom_award', 'custom_fine', 'custom_purchase')
						and nullif(btrim(coalesce(t.note, '')), '') is not null then left(btrim(t.note), 120)
					else cat.name
				end as reason
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

-- ===== SELF-CHECK =====

do $chk$
declare
	v_fn text;
begin
	foreach v_fn in array array['public.coin_log_deposit(text, numeric, text)', 'public.coin_transactions_relabel(jsonb)'] loop
		if has_function_privilege('anon', v_fn, 'execute') then
			raise exception '0322: % is executable by anon.', v_fn;
		end if;
		if not has_function_privilege('authenticated', v_fn, 'execute') then
			raise exception '0322: % is not executable by a signed-in caller.', v_fn;
		end if;
	end loop;
	if has_table_privilege('authenticated', 'public.coin_relabel_log', 'select') or has_table_privilege('anon', 'public.coin_relabel_log', 'select') then
		raise exception '0322: coin_relabel_log is readable by a client.';
	end if;
	if not public._coin_setting_ok('deposit_minimum', '5'::jsonb) or public._coin_setting_ok('deposit_minimum', '0'::jsonb)
		or public._coin_setting_ok('deposit_minimum', '2.5'::jsonb) then
		raise exception '0322: the deposit_minimum rule does not hold.';
	end if;
	if not public._coin_setting_ok('stock_floor', '1'::jsonb) or not public._coin_setting_ok('banner_style', '"ticker"'::jsonb)
		or not public._coin_setting_ok('donation_cap_coins', '10'::jsonb) or public._coin_setting_ok('no_such_setting', '1'::jsonb) then
		raise exception '0322: an older setting key no longer answers as it did.';
	end if;
	if (select pricing_model from public.coin_categories where id = 'coin_deposit') is distinct from 'formula' then
		raise exception '0322: the Deposit category must be priced formula, so only coin_log_deposit writes it.';
	end if;
	raise notice '0322: deposits, Weekly Pay, desk donations, record relabeling and the public labels are in place.';
end
$chk$;
