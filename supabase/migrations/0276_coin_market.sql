-- 0275_coin_market.sql
--
-- IDEA COIN LATER FEATURES, PART ONE (ledger 0402, decision 70): THE STUDENT
-- MARKETPLACE, ITS ESCROW, AND ITS REVIEWS.
--
-- A student posts an OFFER (something they sell) or a REQUEST (something they
-- need done). Every trade runs through escrow, so nobody can be scammed:
--
--   1. A claim moves the payer's coins into escrow at once (a hold row).
--   2. The payee delivers and marks it done.
--   3. The payer confirms and the coins go to the payee, minus the sale fee.
--   4. Unconfirmed and undisputed five class days after delivery, the coins
--      release to the payee on their own (coin_autopay_run, 0281).
--
-- The payee may cancel before delivery (a full refund). Either side may
-- dispute; coin staff resolve it as a release, a refund, or a split.
--
-- COINS ARE CONSERVED. A hold, a release, a refund and a fee are four rows
-- that net exactly: hold -A on the payer, release +T and fee -F on the payee,
-- refund +(A - T) on the payer, so the economy changes by -F, and F is a
-- market_fee row. No student action here can create a coin.
--
-- THE SEAM. Every student function goes through _coin_student_seam (0241),
-- takes no email (a person is named by the Ledger's opaque public id), and
-- validates everything before it writes. A price is the poster's own choice,
-- which is the point of a market; it is bounded here and a payer is always
-- checked against it, never the other way round.
--
-- DEBT. A student below zero may post an offer and may be paid; they may not
-- post a paid request or claim an offer (both would spend).
--
-- UNDO: drop the functions this file creates and the three coin_market_
-- tables, delete the four market_ categories if no row names them, and
-- re-paste 0245's coin_can_read_upload and _coin_setting_ok. Nothing else
-- references them.

-- ===== PART A BEGIN =====
-- ===== PART A: THE TABLES =====

create table if not exists public.coin_market_listings (
	id uuid primary key default gen_random_uuid(),
	zone text not null check (zone in ('student', 'official')),
	kind text not null check (kind in ('offer', 'request', 'official')),
	owner_email text not null check (owner_email = lower(btrim(owner_email)) and owner_email like '%@%'),
	title text not null check (char_length(btrim(title)) between 3 and 80),
	description text not null default '' check (char_length(description) <= 1000),
	price numeric(12,2) check (price is null or (price >= 0.1 and price <= 1000)),
	category text not null default 'other'
		check (category in ('service', 'product', 'tutoring', 'design', 'fabrication', 'other')),
	-- How many claims it takes. NULL is one time (one claim).
	quantity integer check (quantity is null or quantity between 1 and 50),
	photo_path text,
	-- An official card's door: a path on this site, never another host.
	link text check (link is null or (link ~ '^/[^/\\]' and char_length(link) <= 300 and position('#' in link) = 0)),
	-- An official card scoped to one class; NULL is every class.
	section_id uuid references public.classroom_sections (id) on delete set null,
	featured_at timestamptz,
	featured_by text,
	hidden_at timestamptz,
	hidden_by text,
	hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 300),
	closed_at timestamptz,
	closed_reason text check (closed_reason is null or closed_reason in ('withdrawn', 'filled', 'removed')),
	expires_at timestamptz not null default (now() + interval '14 days'),
	renewed_count integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	check ((zone = 'official') = (kind = 'official')),
	check (zone = 'official' or price is not null),
	check (zone = 'official' or link is null)
);
create index if not exists coin_market_listings_owner on public.coin_market_listings (owner_email, created_at desc);
create index if not exists coin_market_listings_open on public.coin_market_listings (zone, expires_at)
	where closed_at is null and hidden_at is null;
alter table public.coin_market_listings enable row level security;
revoke all on table public.coin_market_listings from public, anon, authenticated, service_role;

create table if not exists public.coin_market_orders (
	id uuid primary key default gen_random_uuid(),
	listing_id uuid not null references public.coin_market_listings (id) on delete restrict,
	-- Who pays (the buyer of an offer, the poster of a request) and who is paid.
	payer_email text not null check (payer_email = lower(btrim(payer_email))),
	payee_email text not null check (payee_email = lower(btrim(payee_email))),
	amount numeric(12,2) not null check (amount > 0),
	status text not null default 'held'
		check (status in ('held', 'delivered', 'disputed', 'released', 'refunded', 'split')),
	delivered_at timestamptz,
	disputed_at timestamptz,
	dispute_by text,
	dispute_reason text check (dispute_reason is null or char_length(dispute_reason) <= 500),
	-- What the dispute was, before it: held or delivered.
	dispute_from text check (dispute_from is null or dispute_from in ('held', 'delivered')),
	settled_at timestamptz,
	settled_by text,
	resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
	to_payee numeric(12,2) check (to_payee is null or (to_payee >= 0 and to_payee <= amount)),
	fee numeric(12,2) check (fee is null or fee >= 0),
	hold_txn uuid,
	release_txn uuid,
	refund_txn uuid,
	fee_txn uuid,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	check (payer_email <> payee_email)
);
create index if not exists coin_market_orders_listing on public.coin_market_orders (listing_id);
create index if not exists coin_market_orders_payer on public.coin_market_orders (payer_email, created_at desc);
create index if not exists coin_market_orders_payee on public.coin_market_orders (payee_email, created_at desc);
create index if not exists coin_market_orders_open on public.coin_market_orders (status)
	where status in ('held', 'delivered', 'disputed');
alter table public.coin_market_orders enable row level security;
revoke all on table public.coin_market_orders from public, anon, authenticated, service_role;

create table if not exists public.coin_market_reviews (
	id uuid primary key default gen_random_uuid(),
	order_id uuid not null references public.coin_market_orders (id) on delete restrict,
	author_email text not null,
	subject_email text not null,
	stars smallint not null check (stars between 1 and 5),
	body text not null check (char_length(btrim(body)) >= 1 and char_length(body) <= 1000),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	removed_at timestamptz,
	removed_by text,
	removed_reason text check (removed_reason is null or char_length(removed_reason) <= 300),
	-- One review per side of a trade.
	unique (order_id, author_email),
	check (author_email <> subject_email)
);
create index if not exists coin_market_reviews_subject on public.coin_market_reviews (subject_email, created_at desc);
alter table public.coin_market_reviews enable row level security;
revoke all on table public.coin_market_reviews from public, anon, authenticated, service_role;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: CATEGORIES AND DEFAULTS =====
-- Every number below is a default on /coin-desk/settings (the governing rule:
-- nothing is set in stone). The categories carry the rule text a student reads.

do $cat$
begin
	insert into public.coin_categories
		(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label,
		 formula_key, semester_point_cap, cap_period, cap_count, loggable, active, sort_order, notes, explanation)
	values
		('market_escrow_hold', 'Marketplace: coins held in escrow', 'adjustment', 'core', 'variable', null, null, null, null,
		 null, null, null, null, false, true, 410,
		 'System only: a claim moves the payer''s coins into escrow.',
		 'When you claim a marketplace listing that you pay for, the price is held in escrow at once. It goes to the other student when you confirm, or comes back to you if the trade is cancelled or refunded.'),
		('market_escrow_release', 'Marketplace: payment received', 'adjustment', 'core', 'variable', null, null, null, null,
		 null, null, null, null, false, true, 411,
		 'System only: escrow paid to the payee.',
		 'The coins a buyer held in escrow, paid to you when they confirm, when staff release them, or on their own five class days after you marked the job done.'),
		('market_escrow_refund', 'Marketplace: escrow refunded', 'adjustment', 'core', 'variable', null, null, null, null,
		 null, null, null, null, false, true, 412,
		 'System only: escrow returned to the payer.',
		 'Coins you held in escrow, returned because the trade was cancelled, refunded, or split by staff.'),
		('market_fee', 'Marketplace sale fee', 'purchase', 'core', 'variable', null, null, null, null,
		 null, null, null, null, false, true, 413,
		 'System only: the sale fee, a sink.',
		 'A share of every completed marketplace sale leaves the economy as a fee. Trades go through escrow: the payer''s coins are held when a listing is claimed, the seller marks it done, and the payer confirms. If the payer neither confirms nor disputes within five class days, the coins go to the seller on their own. Either side can dispute, and staff decide.')
	on conflict (id) do nothing;

	insert into public.coin_settings (key, value, updated_by) values
		('market_sale_fee_percent', '0'::jsonb, 'system'),
		('market_open_listings_max', '5'::jsonb, 'system'),
		('market_listing_days', '14'::jsonb, 'system'),
		('market_auto_release_school_days', '5'::jsonb, 'system'),
		('market_review_edit_hours', '24'::jsonb, 'system'),
		('market_review_min_chars', '20'::jsonb, 'system')
	on conflict (key) do nothing;
end
$cat$;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: SETTINGS THE LATER FEATURES ADD =====
-- 0245's _coin_setting_ok, word for word, with its else branch handing the
-- keys ledger 0402 adds to _coin_setting_ok_0402. One function per bundle of
-- keys, so no later file has to restate this whole list again.

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
		else return false;
	end case;
exception when others then
	return false;
end;
$$;
revoke all on function public._coin_setting_ok_0402(text, jsonb) from public, anon, authenticated, service_role;

create or replace function public._coin_setting_ok(p_key text, p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_el jsonb;
	v_n numeric;
begin
	if p_value is null then
		return false;
	end if;
	case p_key
		when 'autopay_paused' then
			return jsonb_typeof(p_value) = 'boolean';
		when 'autopay_start', 'highest_grade_anchor', 'no_pay_after', 'role_stipend_anchor', 'debt_relief_fines_since' then
			return jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
				and (p_value #>> '{}')::date is not null;
		when 'highest_grade_weeks' then
			return jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 1 and 20
				and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
		when 'hall_pass_warn_minutes', 'hall_pass_fine_minutes' then
			return jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 1 and 240;
		when 'extra_credit_cap_percent' then
			return jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 0 and 100;
		when 'pay_raise_cost_per_tier', 'print_grams_per_coin', 'property_damage_careless_base',
			'property_damage_dollars_per_coin' then
			return jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 0.01 and 100000;
		when 'student_actions_per_minute' then
			return jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 1 and 120;
		-- Session two (0245 onward).
		when 'background_guidance', 'background_prompt' then
			return jsonb_typeof(p_value) = 'string' and char_length(p_value #>> '{}') <= 4000;
		when 'background_min_width', 'background_min_height' then
			return jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 100 and 20000
				and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
		when 'background_min_kb_per_megapixel' then
			return jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 0 and 10000;
		when 'background_days_between', 'donation_cap_days', 'chronic_debt_weeks', 'role_stipend_weeks' then
			v_n := (p_value #>> '{}')::numeric;
			return jsonb_typeof(p_value) = 'number' and v_n between 1 and 120 and v_n = trunc(v_n);
		when 'donation_cap_coins', 'digest_gain_threshold' then
			return jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 0 and 100000;
		when 'chronic_debt_threshold' then
			return jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between -100000 and 0;
		when 'role_min_gap_minutes' then
			return jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between 0 and 600;
		when 'role_photos_per_day' then
			v_n := (p_value #>> '{}')::numeric;
			return jsonb_typeof(p_value) = 'number' and v_n between 2 and 10 and v_n = trunc(v_n);
		when 'role_window_start', 'role_window_end' then
			return jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '^([01]\d|2[0-3]):[0-5]\d$';
		when 'role_instructions' then
			if jsonb_typeof(p_value) <> 'object' then
				return false;
			end if;
			for v_el in select value from jsonb_each(p_value) loop
				if jsonb_typeof(v_el) <> 'string' or char_length(v_el #>> '{}') > 4000 then
					return false;
				end if;
			end loop;
			return true;
		when 'tournament_placement_defaults' then
			if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) <> 3 then
				return false;
			end if;
			for v_el in select * from jsonb_array_elements(p_value) loop
				if jsonb_typeof(v_el) <> 'number' or (v_el #>> '{}')::numeric not between 0 and 1000 then
					return false;
				end if;
			end loop;
			return true;
		when 'no_class_days', 'quarter_ends', 'payday_dates' then
			if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 300 then
				return false;
			end if;
			for v_el in select * from jsonb_array_elements(p_value) loop
				if jsonb_typeof(v_el) <> 'string' or (v_el #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$'
					or (v_el #>> '{}')::date is null then
					return false;
				end if;
			end loop;
			return true;
		when 'no_pay_weeks' then
			if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 200 then
				return false;
			end if;
			for v_el in select * from jsonb_array_elements(p_value) loop
				if jsonb_typeof(v_el) <> 'string' or (v_el #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$'
					or extract(isodow from (v_el #>> '{}')::date) <> 1 then
					return false;
				end if;
			end loop;
			return true;
		when 'semesters' then
			if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 20 then
				return false;
			end if;
			for v_el in select * from jsonb_array_elements(p_value) loop
				if jsonb_typeof(v_el) <> 'object'
					or coalesce(v_el ->> 'key', '') !~ '^[a-z0-9-]{1,30}$'
					or coalesce(v_el ->> 'start', '') !~ '^\d{4}-\d{2}-\d{2}$'
					or coalesce(v_el ->> 'end', '') !~ '^\d{4}-\d{2}-\d{2}$'
					or (v_el ->> 'end')::date < (v_el ->> 'start')::date then
					return false;
				end if;
			end loop;
			return true;
		when 'fine_buttons' then
			if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 30 then
				return false;
			end if;
			for v_el in select * from jsonb_array_elements(p_value) loop
				if jsonb_typeof(v_el) <> 'string' or (v_el #>> '{}') !~ '^[a-z0-9_]+$' then
					return false;
				end if;
			end loop;
			return true;
		else
			-- Ledger 0402: the marketplace, transfers, hall pass time, stocks and the banner.
			return public._coin_setting_ok_0402(p_key, p_value);
	end case;
exception when others then
	return false;
end;
$$;
revoke all on function public._coin_setting_ok(text, jsonb) from public, anon, authenticated, service_role;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: NAMES, PUBLIC IDS, CLASS DAYS =====

-- A student as the market names them: the roster's name, then a chosen
-- display name, then the account name, never an address (the Ledger's order,
-- _coin_public_roster, 0251).
create or replace function public._coin_market_name(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		(select nullif(btrim(x.display_name), '') from public._coin_economy_enrollments() x
			where x.student_email = lower(btrim(coalesce(p_email, '')))
			order by public._coin_classroom_section_label(x.section_id) limit 1),
		(select coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''))
			from public.profiles p where lower(p.email) = lower(btrim(coalesce(p_email, ''))) limit 1),
		'A student');
$$;
revoke all on function public._coin_market_name(text) from public, anon, authenticated, service_role;

-- The Ledger's opaque id for an address (0089's salt), so a person is named
-- without their address on every market surface.
create or replace function public._coin_market_pid(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select md5((select s.salt from public.coin_public_id_secret s where s.id limit 1) || lower(btrim(coalesce(p_email, ''))));
$$;
revoke all on function public._coin_market_pid(text) from public, anon, authenticated, service_role;

-- The address behind a public id, among students in the economy and anyone
-- who has posted a listing. NULL when it names nobody.
create or replace function public._coin_market_email_for(p_pid text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select c.email from (
		select x.student_email as email from public._coin_economy_enrollments() x
		union
		select l.owner_email from public.coin_market_listings l
	) c
	where public._coin_market_pid(c.email) = lower(btrim(coalesce(p_pid, '')))
	limit 1;
$$;
revoke all on function public._coin_market_email_for(text) from public, anon, authenticated, service_role;

-- The class labels a student is in (economy-on), for the class filter.
create or replace function public._coin_market_classes(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(jsonb_agg(jsonb_build_object('section_id', x.section_id,
			'label', public._coin_classroom_section_label(x.section_id))
			order by public._coin_classroom_section_label(x.section_id)), '[]'::jsonb)
	from public._coin_economy_enrollments() x where x.student_email = lower(btrim(coalesce(p_email, '')));
$$;
revoke all on function public._coin_market_classes(text) from public, anon, authenticated, service_role;

-- Class days strictly after p_from up to and including p_to (Los Angeles).
create or replace function public._coin_class_days_between(p_from date, p_to date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
	select count(*)::integer from generate_series(p_from + 1, p_to, interval '1 day') d
	where p_to > p_from and public._coin_is_class_day(d::date);
$$;
revoke all on function public._coin_class_days_between(date, date) from public, anon, authenticated, service_role;

-- A seller's standing: average stars and the count of reviews that stand.
create or replace function public._coin_market_rating(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object('average', round(avg(r.stars)::numeric, 2), 'count', count(*))
	from public.coin_market_reviews r
	where r.subject_email = lower(btrim(coalesce(p_email, ''))) and r.removed_at is null;
$$;
revoke all on function public._coin_market_rating(text) from public, anon, authenticated, service_role;

-- Claims a listing still takes.
create or replace function public._coin_market_remaining(p_listing_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
	select greatest(coalesce(l.quantity, 1) - (select count(*) from public.coin_market_orders o
		where o.listing_id = l.id and o.status in ('held', 'delivered', 'disputed', 'released', 'split'))::integer, 0)
	from public.coin_market_listings l where l.id = p_listing_id;
$$;
revoke all on function public._coin_market_remaining(uuid) from public, anon, authenticated, service_role;

-- A listing anyone may still claim.
create or replace function public._coin_market_listing_open(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce((select l.zone = 'student' and l.closed_at is null and l.hidden_at is null and l.expires_at > now()
		from public.coin_market_listings l where l.id = p_listing_id), false)
		and coalesce(public._coin_market_remaining(p_listing_id), 0) > 0;
$$;
revoke all on function public._coin_market_listing_open(uuid) from public, anon, authenticated, service_role;
-- ===== PART D END =====

-- ===== PART E BEGIN =====
-- ===== PART E: SETTLING A TRADE (THE ONE WRITER OF RELEASE, REFUND AND FEE) =====

-- Pays p_to_payee of the escrow to the payee, minus the fee on that part, and
-- returns the rest to the payer. Every outcome of a trade goes through here:
-- confirm, auto-release, cancel, and every staff decision.
create or replace function public._coin_market_settle(
	p_order_id uuid,
	p_to_payee numeric,
	p_status text,
	p_actor text,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_o public.coin_market_orders;
	v_title text;
	v_pct numeric := coalesce((public._coin_setting('market_sale_fee_percent') #>> '{}')::numeric, 0);
	v_to numeric;
	v_fee numeric := 0;
	v_back numeric;
	v_rel public.coin_transactions;
	v_ref public.coin_transactions;
	v_fee_row public.coin_transactions;
	v_meta jsonb;
begin
	if p_status not in ('released', 'refunded', 'split') then
		raise exception 'A trade settles as released, refunded or split.';
	end if;
	select * into v_o from public.coin_market_orders o where o.id = p_order_id for update;
	if v_o.id is null or v_o.status not in ('held', 'delivered', 'disputed') then
		return jsonb_build_object('ok', false, 'reason', 'not_open');
	end if;
	v_to := round(least(greatest(coalesce(p_to_payee, 0), 0), v_o.amount), 2);
	v_back := v_o.amount - v_to;
	select l.title into v_title from public.coin_market_listings l where l.id = v_o.listing_id;
	v_meta := jsonb_build_object('market_order', v_o.id::text, 'listing_id', v_o.listing_id::text);
	if v_to > 0 then
		v_rel := public._coin_insert(v_o.payee_email, 'market_escrow_release', v_to, null,
			left('Marketplace: ' || coalesce(v_title, 'a trade') || '.', 500), v_meta, 'digital', null, p_actor);
		if v_pct > 0 then
			v_fee := round(v_to * v_pct / 100, 2);
			if v_fee > 0 then
				v_fee_row := public._coin_insert(v_o.payee_email, 'market_fee', -v_fee, null,
					left('Sale fee, ' || trim_scale(v_pct) || '%: ' || coalesce(v_title, 'a trade') || '.', 500),
					v_meta || jsonb_build_object('fee_percent', v_pct), 'digital', null, p_actor);
			end if;
		end if;
	end if;
	if v_back > 0 then
		v_ref := public._coin_insert(v_o.payer_email, 'market_escrow_refund', v_back, null,
			left('Marketplace refund: ' || coalesce(v_title, 'a trade') || '.', 500), v_meta, 'digital', null, p_actor);
	end if;
	update public.coin_market_orders o
	set status = p_status, settled_at = now(), settled_by = p_actor, to_payee = v_to, fee = v_fee,
		release_txn = v_rel.id, refund_txn = v_ref.id, fee_txn = v_fee_row.id,
		resolution_note = coalesce(left(nullif(btrim(coalesce(p_note, '')), ''), 500), o.resolution_note),
		updated_at = now()
	where o.id = v_o.id;
	return jsonb_build_object('ok', true, 'order_id', v_o.id, 'status', p_status,
		'to_payee', v_to, 'fee', v_fee, 'refunded', v_back);
end;
$$;
revoke all on function public._coin_market_settle(uuid, numeric, text, text, text) from public, anon, authenticated, service_role;

-- Autopay's part: every delivered trade the payer left alone for the set
-- number of class days, released. Returns how many.
create or replace function public._coin_market_autorelease(p_run bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_days integer := coalesce((public._coin_setting('market_auto_release_school_days') #>> '{}')::integer, 5);
	v_today date := public._coin_la_today();
	v_id uuid;
	v_n integer := 0;
	v_r jsonb;
begin
	for v_id in
		select o.id from public.coin_market_orders o
		where o.status = 'delivered' and o.delivered_at is not null
			and public._coin_class_days_between(public._coin_la_today(o.delivered_at), v_today) >= v_days
		order by o.delivered_at
		limit 500
	loop
		v_r := public._coin_market_settle(v_id, (select o.amount from public.coin_market_orders o where o.id = v_id),
			'released', 'system', 'Released automatically: no confirmation or dispute in time.');
		if (v_r ->> 'ok')::boolean then
			v_n := v_n + 1;
		end if;
	end loop;
	return v_n;
end;
$$;
revoke all on function public._coin_market_autorelease(bigint) from public, anon, authenticated, service_role;
-- ===== PART E END =====

-- ===== PART F BEGIN =====
-- ===== PART F: WHAT A SIGNED-IN PERSON READS =====

create or replace function public._coin_market_listing_json(l public.coin_market_listings, p_viewer text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'id', l.id, 'zone', l.zone, 'kind', l.kind, 'title', l.title, 'description', l.description,
		'price', l.price, 'category', l.category, 'quantity', l.quantity,
		'remaining', public._coin_market_remaining(l.id),
		'photo_path', l.photo_path, 'link', l.link, 'section_id', l.section_id,
		'section', case when l.section_id is null then null else public._coin_classroom_section_label(l.section_id) end,
		'featured', l.featured_at is not null,
		'hidden', l.hidden_at is not null,
		'hidden_reason', case when l.owner_email = p_viewer or public._coin_staff() then l.hidden_reason end,
		'closed', l.closed_at is not null, 'closed_reason', l.closed_reason,
		'expired', l.expires_at <= now(), 'expires_at', l.expires_at, 'created_at', l.created_at,
		'mine', l.owner_email = p_viewer,
		'owner', case when l.zone = 'official' then jsonb_build_object('name', 'IDEA staff')
			else jsonb_build_object('id', public._coin_market_pid(l.owner_email),
				'name', public._coin_market_name(l.owner_email),
				'classes', public._coin_market_classes(l.owner_email),
				'rating', public._coin_market_rating(l.owner_email)) end);
$$;
revoke all on function public._coin_market_listing_json(public.coin_market_listings, text) from public, anon, authenticated, service_role;

create or replace function public._coin_market_order_json(o public.coin_market_orders, p_viewer text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_l public.coin_market_listings;
	v_side text := case when o.payer_email = p_viewer then 'payer' when o.payee_email = p_viewer then 'payee' end;
	v_other text := case when o.payer_email = p_viewer then o.payee_email else o.payer_email end;
	v_review public.coin_market_reviews;
	v_hours numeric := coalesce((public._coin_setting('market_review_edit_hours') #>> '{}')::numeric, 24);
	v_days integer := coalesce((public._coin_setting('market_auto_release_school_days') #>> '{}')::integer, 5);
begin
	select * into v_l from public.coin_market_listings l where l.id = o.listing_id;
	select * into v_review from public.coin_market_reviews r
	where r.order_id = o.id and r.author_email = p_viewer;
	return jsonb_build_object(
		'id', o.id, 'listing_id', o.listing_id, 'title', v_l.title, 'kind', v_l.kind,
		'amount', o.amount, 'status', o.status, 'side', v_side,
		'other', jsonb_build_object('id', public._coin_market_pid(v_other), 'name', public._coin_market_name(v_other)),
		'created_at', o.created_at, 'delivered_at', o.delivered_at, 'disputed_at', o.disputed_at,
		'dispute_reason', o.dispute_reason, 'settled_at', o.settled_at, 'to_payee', o.to_payee, 'fee', o.fee,
		'resolution_note', o.resolution_note,
		'class_days_since_delivery', case when o.status = 'delivered' and o.delivered_at is not null
			then public._coin_class_days_between(public._coin_la_today(o.delivered_at), public._coin_la_today()) end,
		'auto_release_days', v_days,
		'can_deliver', v_side = 'payee' and o.status = 'held',
		'can_cancel', v_side = 'payee' and o.status = 'held',
		'can_confirm', v_side = 'payer' and o.status = 'delivered',
		'can_dispute', v_side is not null and o.status in ('held', 'delivered'),
		'can_review', v_side is not null and o.status = 'released'
			and (v_review.id is null or (v_review.removed_at is null and v_review.created_at > now() - make_interval(secs => (v_hours * 3600)::double precision))),
		'my_review', case when v_review.id is null then null else jsonb_build_object('id', v_review.id,
			'stars', v_review.stars, 'body', v_review.body, 'created_at', v_review.created_at,
			'removed', v_review.removed_at is not null) end);
end;
$$;
revoke all on function public._coin_market_order_json(public.coin_market_orders, text) from public, anon, authenticated, service_role;

-- The whole board, for any signed-in person. Hidden, closed, expired and
-- filled listings are drawn only for the person who posted them.
create or replace function public.coin_market_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_in boolean;
	v_sections uuid[];
begin
	if (select auth.uid()) is null or v_email = '' then
		return jsonb_build_object('signed_in', false);
	end if;
	v_in := exists (select 1 from public._coin_economy_enrollments() x where x.student_email = v_email);
	select coalesce(array_agg(x.section_id), '{}') into v_sections
	from public._coin_economy_enrollments() x where x.student_email = v_email;
	return jsonb_build_object(
		'signed_in', true,
		'in_economy', v_in,
		'staff', public._coin_staff(),
		'me', jsonb_build_object('id', public._coin_market_pid(v_email), 'name', public._coin_market_name(v_email),
			'balance', public._coin_balance(v_email),
			'open_listings', (select count(*) from public.coin_market_listings l where l.owner_email = v_email
				and l.zone = 'student' and l.closed_at is null and l.hidden_at is null and l.expires_at > now())),
		'rules', jsonb_build_object(
			'fee_percent', coalesce((public._coin_setting('market_sale_fee_percent') #>> '{}')::numeric, 0),
			'max_open', coalesce((public._coin_setting('market_open_listings_max') #>> '{}')::integer, 5),
			'listing_days', coalesce((public._coin_setting('market_listing_days') #>> '{}')::integer, 14),
			'auto_release_days', coalesce((public._coin_setting('market_auto_release_school_days') #>> '{}')::integer, 5),
			'review_min_chars', coalesce((public._coin_setting('market_review_min_chars') #>> '{}')::integer, 20),
			'review_edit_hours', coalesce((public._coin_setting('market_review_edit_hours') #>> '{}')::numeric, 24)),
		'listings', coalesce((select jsonb_agg(public._coin_market_listing_json(l, v_email)
				order by (l.featured_at is not null) desc, l.created_at desc)
			from public.coin_market_listings l
			where l.zone = 'student' and (
				l.owner_email = v_email
				or (l.closed_at is null and l.hidden_at is null and l.expires_at > now()
					and public._coin_market_remaining(l.id) > 0))), '[]'::jsonb),
		'official', coalesce((select jsonb_agg(public._coin_market_listing_json(l, v_email)
				order by (l.featured_at is not null) desc, l.created_at desc)
			from public.coin_market_listings l
			where l.zone = 'official' and l.closed_at is null and l.hidden_at is null and l.expires_at > now()
				and (l.section_id is null or l.section_id = any(v_sections) or public._coin_section_in_scope(l.section_id))), '[]'::jsonb),
		'orders', coalesce((select jsonb_agg(public._coin_market_order_json(o, v_email) order by o.created_at desc)
			from (select * from public.coin_market_orders o2
				where o2.payer_email = v_email or o2.payee_email = v_email
				order by o2.created_at desc limit 100) o), '[]'::jsonb)
	);
end;
$$;
revoke all on function public.coin_market_board() from public, anon, authenticated, service_role;
grant execute on function public.coin_market_board() to authenticated;

-- One student's market profile: name, stars, the ten newest reviews that
-- stand, and what they have open.
create or replace function public.coin_market_profile(p_student_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_viewer text := public.current_user_email();
	v_email text;
begin
	if (select auth.uid()) is null or v_viewer = '' then
		return jsonb_build_object('ok', false, 'reason', 'signed_out');
	end if;
	v_email := public._coin_market_email_for(p_student_id);
	if v_email is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	return jsonb_build_object(
		'ok', true,
		'id', public._coin_market_pid(v_email),
		'name', public._coin_market_name(v_email),
		'classes', public._coin_market_classes(v_email),
		'rating', public._coin_market_rating(v_email),
		'reviews', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'stars', r.stars, 'body', r.body,
				'at', r.created_at, 'author', public._coin_market_name(r.author_email)) order by r.created_at desc)
			from (select * from public.coin_market_reviews r2 where r2.subject_email = v_email and r2.removed_at is null
				order by r2.created_at desc limit 10) r), '[]'::jsonb),
		'listings', coalesce((select jsonb_agg(public._coin_market_listing_json(l, v_viewer) order by l.created_at desc)
			from public.coin_market_listings l
			where l.owner_email = v_email and l.zone = 'student' and l.closed_at is null and l.hidden_at is null
				and l.expires_at > now()), '[]'::jsonb));
end;
$$;
revoke all on function public.coin_market_profile(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_market_profile(text) to authenticated;
-- ===== PART F END =====

-- ===== PART G BEGIN =====
-- ===== PART G: A STUDENT'S MARKET ACTIONS (all through the seam) =====

create or replace function public.coin_market_post(
	p_kind text,
	p_title text,
	p_description text,
	p_price numeric,
	p_category text,
	p_quantity integer,
	p_photo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb;
	v_email text;
	v_max integer := coalesce((public._coin_setting('market_open_listings_max') #>> '{}')::integer, 5);
	v_days integer := coalesce((public._coin_setting('market_listing_days') #>> '{}')::integer, 14);
	v_open integer;
	v_balance numeric;
	v_title text := btrim(coalesce(p_title, ''));
	v_desc text := btrim(coalesce(p_description, ''));
	v_id uuid;
begin
	-- Everything that needs no lookup is refused before the seam counts it.
	if p_kind is null or p_kind not in ('offer', 'request') then
		return jsonb_build_object('ok', false, 'reason', 'kind');
	end if;
	if char_length(v_title) not between 3 and 80 then
		return jsonb_build_object('ok', false, 'reason', 'title');
	end if;
	if char_length(v_desc) > 1000 then
		return jsonb_build_object('ok', false, 'reason', 'description');
	end if;
	if p_price is null or p_price < 0.1 or p_price > 1000 or p_price <> round(p_price, 2) then
		return jsonb_build_object('ok', false, 'reason', 'price');
	end if;
	if coalesce(p_category, '') not in ('service', 'product', 'tutoring', 'design', 'fabrication', 'other') then
		return jsonb_build_object('ok', false, 'reason', 'category');
	end if;
	if p_quantity is not null and p_quantity not between 1 and 50 then
		return jsonb_build_object('ok', false, 'reason', 'quantity');
	end if;
	v_seam := public._coin_student_seam('market_post');
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	if p_photo_path is not null and not public._coin_own_upload_ok(p_photo_path) then
		return jsonb_build_object('ok', false, 'reason', 'photo');
	end if;
	select count(*) into v_open from public.coin_market_listings l
	where l.owner_email = v_email and l.zone = 'student' and l.closed_at is null and l.hidden_at is null
		and l.expires_at > now();
	if v_open >= v_max then
		return jsonb_build_object('ok', false, 'reason', 'too_many', 'max', v_max);
	end if;
	-- A paid request spends: refused in debt, and refused when this one price
	-- would leave the poster below zero.
	if p_kind = 'request' then
		v_balance := public._coin_balance(v_email);
		if v_balance < 0 then
			return jsonb_build_object('ok', false, 'reason', 'in_debt', 'balance', v_balance);
		end if;
		if v_balance - p_price < 0 then
			return jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', v_balance, 'cost', p_price);
		end if;
	end if;
	insert into public.coin_market_listings (zone, kind, owner_email, title, description, price, category, quantity,
		photo_path, expires_at)
	values ('student', p_kind, v_email, v_title, v_desc, p_price, p_category, p_quantity, p_photo_path,
		now() + make_interval(days => v_days))
	returning id into v_id;
	return jsonb_build_object('ok', true, 'listing_id', v_id);
end;
$$;
revoke all on function public.coin_market_post(text, text, text, numeric, text, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_market_post(text, text, text, numeric, text, integer, text) to authenticated;

-- Withdraw (close) or renew one's own listing.
create or replace function public.coin_market_listing_set(p_listing_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb;
	v_email text;
	v_l public.coin_market_listings;
	v_days integer := coalesce((public._coin_setting('market_listing_days') #>> '{}')::integer, 14);
	v_max integer := coalesce((public._coin_setting('market_open_listings_max') #>> '{}')::integer, 5);
	v_open integer;
begin
	if p_action is null or p_action not in ('withdraw', 'renew') then
		return jsonb_build_object('ok', false, 'reason', 'action');
	end if;
	v_seam := public._coin_student_seam('market_listing_' || p_action);
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	select * into v_l from public.coin_market_listings l where l.id = p_listing_id for update;
	if v_l.id is null or v_l.owner_email <> v_email or v_l.zone <> 'student' then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_l.closed_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'closed');
	end if;
	if p_action = 'withdraw' then
		update public.coin_market_listings set closed_at = now(), closed_reason = 'withdrawn', updated_at = now()
		where id = v_l.id;
		return jsonb_build_object('ok', true, 'listing_id', v_l.id, 'closed', true);
	end if;
	if v_l.hidden_at is not null then
		return jsonb_build_object('ok', false, 'reason', 'hidden');
	end if;
	if v_l.expires_at <= now() then
		-- An expired listing counts against the limit again once renewed.
		select count(*) into v_open from public.coin_market_listings l
		where l.owner_email = v_email and l.zone = 'student' and l.closed_at is null and l.hidden_at is null
			and l.expires_at > now();
		if v_open >= v_max then
			return jsonb_build_object('ok', false, 'reason', 'too_many', 'max', v_max);
		end if;
	end if;
	update public.coin_market_listings
	set expires_at = now() + make_interval(days => v_days), renewed_count = renewed_count + 1, updated_at = now()
	where id = v_l.id;
	return jsonb_build_object('ok', true, 'listing_id', v_l.id, 'expires_at', now() + make_interval(days => v_days));
end;
$$;
revoke all on function public.coin_market_listing_set(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_market_listing_set(uuid, text) to authenticated;

-- Claim a listing. An offer: the claimer pays and their coins are held. A
-- request: the poster pays, and their coins are held the moment somebody
-- takes the job.
create or replace function public.coin_market_claim(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb;
	v_email text;
	v_l public.coin_market_listings;
	v_payer text;
	v_payee text;
	v_balance numeric;
	v_hold public.coin_transactions;
	v_id uuid := gen_random_uuid();
begin
	v_seam := public._coin_student_seam('market_claim');
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	-- The listing's row lock is the capacity lock: two claims for the last
	-- slot serialize here and the second sees the first.
	select * into v_l from public.coin_market_listings l where l.id = p_listing_id for update;
	if v_l.id is null or v_l.zone <> 'student' then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_l.owner_email = v_email then
		return jsonb_build_object('ok', false, 'reason', 'own_listing');
	end if;
	if not public._coin_market_listing_open(v_l.id) then
		return jsonb_build_object('ok', false, 'reason', 'not_open');
	end if;
	if v_l.kind = 'offer' then
		v_payer := v_email;
		v_payee := v_l.owner_email;
	else
		v_payer := v_l.owner_email;
		v_payee := v_email;
	end if;
	-- The payer's balance must cover the price and stay at or above zero.
	-- Serialize the payer, so two holds at once cannot both fit.
	perform pg_advisory_xact_lock(hashtext('coin_market_payer:' || v_payer));
	v_balance := public._coin_balance(v_payer);
	if v_balance < 0 then
		return jsonb_build_object('ok', false, 'reason', case when v_payer = v_email then 'in_debt' else 'poster_cannot_pay' end,
			'balance', case when v_payer = v_email then v_balance end);
	end if;
	if v_balance - v_l.price < 0 then
		return jsonb_build_object('ok', false, 'reason', case when v_payer = v_email then 'insufficient' else 'poster_cannot_pay' end,
			'balance', case when v_payer = v_email then v_balance end, 'cost', v_l.price);
	end if;
	v_hold := public._coin_insert(v_payer, 'market_escrow_hold', -v_l.price, null,
		left('Held in escrow: ' || v_l.title || '.', 500),
		jsonb_build_object('market_order', v_id::text, 'listing_id', v_l.id::text), 'digital', null, v_email);
	insert into public.coin_market_orders (id, listing_id, payer_email, payee_email, amount, hold_txn)
	values (v_id, v_l.id, v_payer, v_payee, v_l.price, v_hold.id);
	if public._coin_market_remaining(v_l.id) = 0 then
		update public.coin_market_listings set closed_at = now(), closed_reason = 'filled', updated_at = now()
		where id = v_l.id;
	end if;
	return jsonb_build_object('ok', true, 'order_id', v_id, 'amount', v_l.price,
		'balance', public._coin_balance(v_email));
end;
$$;
revoke all on function public.coin_market_claim(uuid) from public, anon, authenticated, service_role;
grant execute on function public.coin_market_claim(uuid) to authenticated;

-- One side moves an open trade: deliver, cancel (the payee, before
-- delivery), confirm (the payer, after delivery), or dispute (either side).
create or replace function public.coin_market_order_act(p_order_id uuid, p_action text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb;
	v_email text;
	v_o public.coin_market_orders;
	v_r jsonb;
begin
	if p_action is null or p_action not in ('deliver', 'cancel', 'confirm', 'dispute') then
		return jsonb_build_object('ok', false, 'reason', 'action');
	end if;
	if p_action = 'dispute' and char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
		return jsonb_build_object('ok', false, 'reason', 'dispute_reason');
	end if;
	v_seam := public._coin_student_seam('market_order_' || p_action);
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	select * into v_o from public.coin_market_orders o where o.id = p_order_id for update;
	if v_o.id is null or v_email not in (v_o.payer_email, v_o.payee_email) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if p_action = 'deliver' then
		if v_email <> v_o.payee_email or v_o.status <> 'held' then
			return jsonb_build_object('ok', false, 'reason', 'not_now', 'status', v_o.status);
		end if;
		update public.coin_market_orders set status = 'delivered', delivered_at = now(), updated_at = now()
		where id = v_o.id;
		return jsonb_build_object('ok', true, 'order_id', v_o.id, 'status', 'delivered');
	elsif p_action = 'cancel' then
		if v_email <> v_o.payee_email or v_o.status <> 'held' then
			return jsonb_build_object('ok', false, 'reason', 'not_now', 'status', v_o.status);
		end if;
		v_r := public._coin_market_settle(v_o.id, 0, 'refunded', v_email, 'Cancelled by the seller before delivery.');
		-- A cancelled claim gives its slot back.
		update public.coin_market_listings set closed_at = null, closed_reason = null, updated_at = now()
		where id = v_o.listing_id and closed_reason = 'filled' and public._coin_market_remaining(id) > 0;
		return v_r;
	elsif p_action = 'confirm' then
		if v_email <> v_o.payer_email or v_o.status <> 'delivered' then
			return jsonb_build_object('ok', false, 'reason', 'not_now', 'status', v_o.status);
		end if;
		return public._coin_market_settle(v_o.id, v_o.amount, 'released', v_email, null);
	else
		if v_o.status not in ('held', 'delivered') then
			return jsonb_build_object('ok', false, 'reason', 'not_now', 'status', v_o.status);
		end if;
		update public.coin_market_orders
		set status = 'disputed', disputed_at = now(), dispute_by = v_email, dispute_from = v_o.status,
			dispute_reason = left(btrim(p_reason), 500), updated_at = now()
		where id = v_o.id;
		return jsonb_build_object('ok', true, 'order_id', v_o.id, 'status', 'disputed');
	end if;
end;
$$;
revoke all on function public.coin_market_order_act(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_market_order_act(uuid, text, text) to authenticated;

-- One review per side of a released trade, editable for the set hours.
create or replace function public.coin_market_review(p_order_id uuid, p_stars integer, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb;
	v_email text;
	v_o public.coin_market_orders;
	v_min integer := coalesce((public._coin_setting('market_review_min_chars') #>> '{}')::integer, 20);
	v_hours numeric := coalesce((public._coin_setting('market_review_edit_hours') #>> '{}')::numeric, 24);
	v_body text := btrim(coalesce(p_body, ''));
	v_old public.coin_market_reviews;
	v_id uuid;
begin
	if p_stars is null or p_stars not between 1 and 5 then
		return jsonb_build_object('ok', false, 'reason', 'stars');
	end if;
	if char_length(v_body) < v_min or char_length(v_body) > 1000 then
		return jsonb_build_object('ok', false, 'reason', 'body', 'min', v_min);
	end if;
	v_seam := public._coin_student_seam('market_review');
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	select * into v_o from public.coin_market_orders o where o.id = p_order_id;
	if v_o.id is null or v_email not in (v_o.payer_email, v_o.payee_email) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	-- Only a released trade: never a refunded one, never a split.
	if v_o.status <> 'released' then
		return jsonb_build_object('ok', false, 'reason', 'not_released', 'status', v_o.status);
	end if;
	select * into v_old from public.coin_market_reviews r where r.order_id = v_o.id and r.author_email = v_email for update;
	if v_old.id is not null then
		if v_old.removed_at is not null then
			return jsonb_build_object('ok', false, 'reason', 'removed');
		end if;
		if v_old.created_at <= now() - make_interval(secs => (v_hours * 3600)::double precision) then
			return jsonb_build_object('ok', false, 'reason', 'locked', 'hours', v_hours);
		end if;
		update public.coin_market_reviews set stars = p_stars, body = v_body, updated_at = now() where id = v_old.id;
		return jsonb_build_object('ok', true, 'review_id', v_old.id, 'edited', true);
	end if;
	insert into public.coin_market_reviews (order_id, author_email, subject_email, stars, body)
	values (v_o.id, v_email, case when v_email = v_o.payer_email then v_o.payee_email else v_o.payer_email end, p_stars, v_body)
	on conflict (order_id, author_email) do nothing
	returning id into v_id;
	if v_id is null then
		return jsonb_build_object('ok', false, 'reason', 'already_reviewed');
	end if;
	return jsonb_build_object('ok', true, 'review_id', v_id, 'edited', false);
end;
$$;
revoke all on function public.coin_market_review(uuid, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_market_review(uuid, integer, text) to authenticated;
-- ===== PART G END =====

-- ===== PART H BEGIN =====
-- ===== PART H: STAFF: DISPUTES, FEATURING, HIDING, REVIEWS, OFFICIAL CARDS =====
-- Section coin staff reach the listings and reviews of their own students,
-- and a dispute only when both sides are theirs; a full coin admin reaches
-- everything (decision 68).

create or replace function public._coin_market_order_in_scope(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public._coin_full_staff() or coalesce((select public._coin_student_in_scope(o.payer_email)
		and public._coin_student_in_scope(o.payee_email) from public.coin_market_orders o where o.id = p_order_id), false);
$$;
revoke all on function public._coin_market_order_in_scope(uuid) from public, anon, authenticated, service_role;

create or replace function public.coin_market_moderation()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_full boolean := public._coin_full_staff();
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can moderate the marketplace.';
	end if;
	return jsonb_build_object(
		'scope', case when v_full then 'full' else 'section' end,
		'disputes', coalesce((select jsonb_agg(jsonb_build_object(
				'id', o.id, 'title', l.title, 'kind', l.kind, 'amount', o.amount, 'status', o.status,
				'payer', public._coin_market_name(o.payer_email), 'payee', public._coin_market_name(o.payee_email),
				'payer_email', o.payer_email, 'payee_email', o.payee_email,
				'disputed_by', case when o.dispute_by = o.payer_email then 'payer' else 'payee' end,
				'reason', o.dispute_reason, 'from', o.dispute_from, 'disputed_at', o.disputed_at,
				'delivered_at', o.delivered_at, 'created_at', o.created_at) order by o.disputed_at)
			from public.coin_market_orders o join public.coin_market_listings l on l.id = o.listing_id
			where o.status = 'disputed' and public._coin_market_order_in_scope(o.id)), '[]'::jsonb),
		'listings', coalesce((select jsonb_agg(public._coin_market_listing_json(l, '') ||
				jsonb_build_object('owner_email', l.owner_email, 'hidden_reason', l.hidden_reason)
				order by l.created_at desc)
			from (select * from public.coin_market_listings l2
				where l2.zone = 'student' and public._coin_student_in_scope(l2.owner_email)
					and (l2.closed_at is null or l2.closed_at > now() - interval '30 days')
				order by l2.created_at desc limit 300) l), '[]'::jsonb),
		'official', coalesce((select jsonb_agg(public._coin_market_listing_json(l, '') order by l.created_at desc)
			from public.coin_market_listings l
			where l.zone = 'official' and l.closed_at is null
				and (v_full or public._coin_section_in_scope(l.section_id))), '[]'::jsonb),
		'reviews', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'stars', r.stars, 'body', r.body,
				'at', r.created_at, 'author', public._coin_market_name(r.author_email),
				'subject', public._coin_market_name(r.subject_email), 'removed', r.removed_at is not null,
				'removed_reason', r.removed_reason) order by r.created_at desc)
			from (select * from public.coin_market_reviews r2 where public._coin_student_in_scope(r2.subject_email)
				order by r2.created_at desc limit 200) r), '[]'::jsonb),
		'open_orders', (select count(*) from public.coin_market_orders o where o.status in ('held', 'delivered', 'disputed')
			and public._coin_market_order_in_scope(o.id)),
		'escrow', (select coalesce(sum(o.amount), 0) from public.coin_market_orders o
			where o.status in ('held', 'delivered', 'disputed') and public._coin_market_order_in_scope(o.id))
	);
end;
$$;
revoke all on function public.coin_market_moderation() from public, anon, authenticated, service_role;
grant execute on function public.coin_market_moderation() to authenticated;

create or replace function public.coin_market_resolve(p_order_id uuid, p_outcome text, p_to_payee numeric default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_o public.coin_market_orders;
	v_to numeric;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can settle a marketplace dispute.';
	end if;
	if p_outcome is null or p_outcome not in ('release', 'refund', 'split') then
		return jsonb_build_object('ok', false, 'reason', 'outcome');
	end if;
	select * into v_o from public.coin_market_orders o where o.id = p_order_id;
	if v_o.id is null or not public._coin_market_order_in_scope(v_o.id) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_o.status not in ('held', 'delivered', 'disputed') then
		return jsonb_build_object('ok', false, 'reason', 'not_open', 'status', v_o.status);
	end if;
	if p_outcome = 'release' then
		v_to := v_o.amount;
	elsif p_outcome = 'refund' then
		v_to := 0;
	else
		if p_to_payee is null or p_to_payee <= 0 or p_to_payee >= v_o.amount or p_to_payee <> round(p_to_payee, 2) then
			return jsonb_build_object('ok', false, 'reason', 'split_amount', 'amount', v_o.amount);
		end if;
		v_to := p_to_payee;
	end if;
	return public._coin_market_settle(v_o.id, v_to,
		case p_outcome when 'release' then 'released' when 'refund' then 'refunded' else 'split' end,
		public.current_user_email(), p_note);
end;
$$;
revoke all on function public.coin_market_resolve(uuid, text, numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_market_resolve(uuid, text, numeric, text) to authenticated;

-- Feature, unfeature, hide (with a reason the poster sees) or unhide.
create or replace function public.coin_market_listing_staff(p_listing_id uuid, p_action text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_l public.coin_market_listings;
	v_me text := public.current_user_email();
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can moderate the marketplace.';
	end if;
	if p_action is null or p_action not in ('feature', 'unfeature', 'hide', 'unhide', 'remove') then
		return jsonb_build_object('ok', false, 'reason', 'action');
	end if;
	select * into v_l from public.coin_market_listings l where l.id = p_listing_id for update;
	if v_l.id is null
		or (v_l.zone = 'student' and not public._coin_student_in_scope(v_l.owner_email))
		or (v_l.zone = 'official' and not (public._coin_full_staff() or public._coin_section_in_scope(v_l.section_id))) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if p_action = 'hide' and char_length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
		return jsonb_build_object('ok', false, 'reason', 'hide_reason');
	end if;
	update public.coin_market_listings l set
		featured_at = case p_action when 'feature' then now() when 'unfeature' then null else l.featured_at end,
		featured_by = case p_action when 'feature' then v_me when 'unfeature' then null else l.featured_by end,
		hidden_at = case p_action when 'hide' then now() when 'unhide' then null else l.hidden_at end,
		hidden_by = case p_action when 'hide' then v_me when 'unhide' then null else l.hidden_by end,
		hidden_reason = case p_action when 'hide' then left(btrim(p_reason), 300) when 'unhide' then null else l.hidden_reason end,
		closed_at = case p_action when 'remove' then now() else l.closed_at end,
		closed_reason = case p_action when 'remove' then 'removed' else l.closed_reason end,
		updated_at = now()
	where l.id = v_l.id;
	return jsonb_build_object('ok', true, 'listing_id', v_l.id, 'action', p_action);
end;
$$;
revoke all on function public.coin_market_listing_staff(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_market_listing_staff(uuid, text, text) to authenticated;

create or replace function public.coin_market_review_remove(p_review_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_r public.coin_market_reviews;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can remove a review.';
	end if;
	if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 300 then
		return jsonb_build_object('ok', false, 'reason', 'remove_reason');
	end if;
	select * into v_r from public.coin_market_reviews r where r.id = p_review_id for update;
	if v_r.id is null or not public._coin_student_in_scope(v_r.subject_email) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_r.removed_at is not null then
		return jsonb_build_object('ok', true, 'review_id', v_r.id, 'changed', false);
	end if;
	update public.coin_market_reviews
	set removed_at = now(), removed_by = public.current_user_email(), removed_reason = left(btrim(p_reason), 300)
	where id = v_r.id;
	return jsonb_build_object('ok', true, 'review_id', v_r.id, 'changed', true);
end;
$$;
revoke all on function public.coin_market_review_remove(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_market_review_remove(uuid, text) to authenticated;

-- An official card: staff only. A card for every class needs a full coin
-- admin; section staff post to their own classes.
create or replace function public.coin_market_official_save(
	p_id uuid,
	p_title text,
	p_description text,
	p_link text,
	p_price numeric,
	p_section_id uuid,
	p_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_me text := public.current_user_email();
	v_title text := btrim(coalesce(p_title, ''));
	v_link text := nullif(btrim(coalesce(p_link, '')), '');
	v_l public.coin_market_listings;
	v_id uuid;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can post to the official zone.';
	end if;
	if p_section_id is null and not public._coin_full_staff() then
		return jsonb_build_object('ok', false, 'reason', 'full_admin_only');
	end if;
	if p_section_id is not null and not public._coin_section_in_scope(p_section_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if char_length(v_title) not between 3 and 80 then
		return jsonb_build_object('ok', false, 'reason', 'title');
	end if;
	if char_length(coalesce(p_description, '')) > 1000 then
		return jsonb_build_object('ok', false, 'reason', 'description');
	end if;
	if v_link is not null and (v_link !~ '^/[^/\\]' or char_length(v_link) > 300 or position('#' in v_link) > 0) then
		return jsonb_build_object('ok', false, 'reason', 'link');
	end if;
	if p_price is not null and (p_price < 0.1 or p_price > 1000) then
		return jsonb_build_object('ok', false, 'reason', 'price');
	end if;
	if p_days is null or p_days not between 1 and 365 then
		return jsonb_build_object('ok', false, 'reason', 'days');
	end if;
	if p_id is null then
		insert into public.coin_market_listings (zone, kind, owner_email, title, description, price, link, section_id,
			expires_at, category)
		values ('official', 'official', v_me, v_title, btrim(coalesce(p_description, '')), p_price, v_link, p_section_id,
			now() + make_interval(days => p_days), 'other')
		returning id into v_id;
		return jsonb_build_object('ok', true, 'listing_id', v_id, 'created', true);
	end if;
	select * into v_l from public.coin_market_listings l where l.id = p_id and l.zone = 'official' for update;
	if v_l.id is null or not (public._coin_full_staff() or public._coin_section_in_scope(v_l.section_id)) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	update public.coin_market_listings set title = v_title, description = btrim(coalesce(p_description, '')),
		link = v_link, price = p_price, section_id = p_section_id, expires_at = now() + make_interval(days => p_days),
		updated_at = now()
	where id = v_l.id;
	return jsonb_build_object('ok', true, 'listing_id', v_l.id, 'created', false);
end;
$$;
revoke all on function public.coin_market_official_save(uuid, text, text, text, numeric, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.coin_market_official_save(uuid, text, text, text, numeric, uuid, integer) to authenticated;
-- ===== PART H END =====

-- ===== PART I BEGIN =====
-- ===== PART I: A LISTING'S PHOTO IS READABLE BY ANYONE SIGNED IN =====
-- 0245's predicate, plus one line: an object a live listing names. No storage
-- policy is written, so this half needs no storage privilege.

create or replace function public.coin_can_read_upload(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select (select auth.uid()) is not null and (
		split_part(coalesce(p_name, ''), '/', 1) = (select auth.uid())::text
		or exists (select 1 from public.coin_donation_items d where d.photo_path = p_name)
		or exists (select 1 from public.coin_market_listings ml where ml.photo_path = p_name and ml.hidden_at is null)
		or (public._coin_staff() and public._coin_student_in_scope(public._coin_upload_owner(p_name)))
		or exists (select 1 from public.coin_requests r where r.photo_path = p_name and r.kind = 'reported_coins'
			and public._coin_is_auditor(public.current_user_email()))
	);
$$;
revoke all on function public.coin_can_read_upload(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_can_read_upload(text) to authenticated;
-- ===== PART I END =====


do $chk$
declare
	r record;
	v_bad text[] := '{}';
begin
	for r in
		select p.oid::regprocedure::text as sig, p.proname, pg_get_function_identity_arguments(p.oid) as args
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and (p.proname like 'coin\_market\_%' or p.proname like '\_coin\_market\_%')
	loop
		if has_function_privilege('anon', r.sig, 'execute') then
			v_bad := array_append(v_bad, 'anon executes ' || r.sig);
		end if;
		-- No market function takes an address.
		if r.proname not like '\_%' and r.args ~* 'email' then
			v_bad := array_append(v_bad, r.sig || ' takes an address');
		end if;
		if r.proname like '\_%' and has_function_privilege('authenticated', r.sig, 'execute') then
			v_bad := array_append(v_bad, 'a client role executes the private ' || r.sig);
		end if;
	end loop;
	if not public._coin_setting_ok('market_sale_fee_percent', '0'::jsonb)
		or public._coin_setting_ok('market_sale_fee_percent', '"x"'::jsonb)
		or not public._coin_setting_ok('autopay_paused', 'true'::jsonb) then
		v_bad := array_append(v_bad, 'the settings rule lost a key');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0276 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0276: the marketplace, its escrow and reviews are in place; no client role executes a private helper.';
end
$chk$;
