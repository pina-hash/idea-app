-- 0245_coin_v2_queue.sql
--
-- IDEA COIN V2, SESSION TWO, PART TWO (ledger 0386): THE QUEUE.
--
-- ONE LIST FOR EVERYTHING A STUDENT SUBMITS. Every card is one row of
-- coin_requests, of one of seven kinds:
--
--   background      a desktop background (2.6)
--   donation        a want-ad donation (2.7)
--   contract        a contract marked done (2.8, cards written by 0248)
--   role_day        a role-evidence exception (2.5, cards written by 0247)
--   split           the physical part of a split payment (2.3, 0246)
--   reported_coins  a reported count of coins on hand (2.10)
--   dispute         a dispute of an automatic fine (2.11)
--
-- A card is pending until a coin staff member whose scope reaches the student
-- approves or denies it (a reported count may also be validated by a Student
-- Auditor who is not its author). Nothing in the queue expires. A deny reason
-- is shown to the student. Approving an award pays it digitally; approving a
-- dispute posts a reversal of the fine. Every decision is one function,
-- _coin_decide, so Approve, Deny and Approve All cannot disagree.
--
-- PHOTOS live in a NEW PRIVATE BUCKET, coin-uploads, under the uploader's own
-- <uid>/ folder (the storage rule every user-upload bucket keeps). A student
-- reads their own objects; a coin staff member reads an object whose owner is
-- in their scope; any signed-in person reads a want-list item's photo. Every
-- read is a signed URL; nothing is public. Raster images only, at most
-- 20 MiB (COIN_UPLOAD_MAX_BYTES in $lib/coin-balance/uploads).
--
-- THE SETTINGS every session-two file reads are declared here once, in the
-- one validator (_coin_setting_ok, 0240's cases unchanged plus the new ones),
-- and seeded once: a key that already exists is never overwritten.
--
-- UNDO: drop the functions this file creates, the coin_requests,
-- coin_donation_items and coin_auditors tables, the coin-uploads bucket and
-- its three policies, the donation and amount categories this file adds, and
-- re-run 0240's _coin_setting_ok.

-- THE FIRST OBJECT IS NEW (the apply probe reads the first created object).
create table if not exists public.coin_requests (
	id uuid primary key default gen_random_uuid(),
	kind text not null check (kind in ('background', 'donation', 'contract', 'role_day', 'split', 'reported_coins', 'dispute')),
	student_email text not null check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	section_id uuid references public.classroom_sections (id) on delete set null,
	amount numeric(12,2),
	photo_path text check (photo_path is null or char_length(photo_path) <= 300),
	payload jsonb not null default '{}'::jsonb,
	note text check (note is null or char_length(note) <= 1000),
	status text not null default 'pending' check (status in ('pending', 'approved', 'denied', 'cancelled')),
	decided_by text,
	decided_at timestamptz,
	decision_note text check (decision_note is null or char_length(decision_note) <= 500),
	result jsonb,
	created_at timestamptz not null default now(),
	check ((status = 'pending') = (decided_at is null) or status = 'cancelled')
);
create index if not exists coin_requests_pending on public.coin_requests (kind, created_at) where status = 'pending';
create index if not exists coin_requests_student on public.coin_requests (student_email, created_at desc);
create unique index if not exists coin_requests_one_dispute
	on public.coin_requests ((payload ->> 'transaction_id'))
	where kind = 'dispute' and status = 'pending';
alter table public.coin_requests enable row level security;
revoke all on table public.coin_requests from public, anon, authenticated, service_role;

-- ===== PART A BEGIN =====
-- ===== PART A: SETTINGS =====

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
			return false;
	end case;
exception when others then
	return false;
end;
$$;
revoke all on function public._coin_setting_ok(text, jsonb) from public, anon, authenticated, service_role;

do $seed$
declare
	v_defaults jsonb := jsonb_build_object(
		'background_guidance',
			'Your background must be 16:9, at least 1920 by 1080 pixels, sharp and high quality, never grainy, blurry or cheap looking. Think cinematic. It must pass the parent and tour test: you would be happy for a parent or a visitor touring the school to see it on your screen.',
		'background_prompt',
			'A cinematic, ultra high resolution 16:9 desktop wallpaper of [your idea], dramatic lighting, sharp detail, rich color, no text, no logos, no people''s faces.',
		'background_min_width', 1920,
		'background_min_height', 1080,
		'background_min_kb_per_megapixel', 100,
		'background_days_between', 14,
		'donation_cap_coins', 10,
		'donation_cap_days', 14,
		'payday_dates', '[]'::jsonb,
		'no_class_days', jsonb_build_array('2026-11-11', '2027-01-04', '2027-01-18', '2027-02-15',
			'2027-03-15', '2027-04-23', '2027-04-26', '2027-05-31'),
		'role_min_gap_minutes', 45,
		'role_photos_per_day', 2,
		'role_window_start', '07:00',
		'role_window_end', '16:00',
		'role_stipend_anchor', '2026-10-12',
		'role_stipend_weeks', 2,
		'role_instructions', jsonb_build_object(
			'shop_steward', 'At the start of class, photograph the whole shop from the doorway. At the end of class, photograph the same spot again. The shop must be as clean or cleaner than when you started.',
			'quartermaster', 'At the start of class, photograph the tool wall and the supply shelves. At the end of class, photograph the same spot again, with every tool back where it belongs.',
			'safety_officer', 'At the start of class, photograph the safety station (glasses, first aid, extinguisher). At the end of class, photograph the same spot again, stocked and in place.',
			'lab_tech', 'At the start of class, photograph the printers and lab equipment. At the end of class, photograph the same spot again, reset and ready for the next person.'),
		'quarter_ends', jsonb_build_array('2026-12-18', '2027-03-12', '2027-06-03'),
		'debt_relief_fines_since', '2026-10-15',
		'chronic_debt_threshold', -20,
		'chronic_debt_weeks', 3,
		'digest_gain_threshold', 10,
		'tournament_placement_defaults', jsonb_build_array(3, 2, 1)
	);
	v_key text;
begin
	for v_key in select jsonb_object_keys(v_defaults) loop
		insert into public.coin_settings (key, value, updated_by)
		values (v_key, v_defaults -> v_key, 'system')
		on conflict (key) do nothing;
	end loop;
end
$seed$;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: CATEGORIES =====
--
-- Seeded once (the v2s2_catalogue_applied setting), so a re-paste never
-- overwrites an admin's edit. Nothing is deleted: the three old donation
-- tiers become inactive, because the want-ad replaces them.
do $cat$
begin
	if exists (select 1 from public.coin_settings where key = 'v2s2_catalogue_applied') then
		raise notice '0245: the session-two catalogue was already applied; categories left as they are.';
		return;
	end if;
	insert into public.coin_categories
		(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label,
		 formula_key, semester_point_cap, cap_period, cap_count, loggable, active, sort_order, notes, explanation)
	values
		('donation', 'Donation', 'award', 'core', 'variable', null, null, null, null, null, null, null, null,
		 false, true, 214, 'V2 session two: paid from the donation want list when a donation claim is approved.',
		 'Donate an item from the want list and claim it on your coin page with a photo. Each item pays its listed rate per item. An item not on the list is paid what your teacher sets. You can earn at most 10 coins from donations every two weeks; a claim over that pays up to the limit.'),
		('amount_correction', 'Amount Correction', 'adjustment', 'core', 'variable', null, null, null, null, null, null, null, null,
		 false, true, 306, 'System only: a full coin admin edited a past amount. meta.edits names the row; the pair nets to the new value.',
		 null)
	on conflict (id) do nothing;
	update public.coin_categories set active = false
	where id in ('donate_supplies_small', 'donate_supplies_medium', 'donate_supplies_large');
	update public.coin_categories set cap_period = null, cap_count = null, loggable = false,
		explanation = 'Submit a desktop background on your coin page. It must be 16:9, at least 1920 by 1080, sharp, cinematic and high quality, and pass the parent and tour test. Pays 2 coins when your teacher approves it. You can submit one every two weeks. Your approved background is the one your screen is checked against.'
	where id = 'quality_desktop_background';
	insert into public.coin_settings (key, value, updated_by)
	values ('v2s2_catalogue_applied', to_jsonb(now()), 'system')
	on conflict (key) do nothing;
end
$cat$;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE BUCKET =====

create table if not exists public.coin_donation_items (
	id uuid primary key default gen_random_uuid(),
	name text not null check (char_length(btrim(name)) between 1 and 120),
	rate numeric(12,2) check (rate is null or rate >= 0),
	photo_path text check (photo_path is null or char_length(photo_path) <= 300),
	active boolean not null default true,
	sort_order integer not null default 0,
	created_by text not null default 'system',
	created_at timestamptz not null default now()
);
alter table public.coin_donation_items enable row level security;
revoke all on table public.coin_donation_items from public, anon, authenticated, service_role;

do $items$
begin
	if not exists (select 1 from public.coin_donation_items) then
		insert into public.coin_donation_items (name, rate, sort_order)
		values ('Tissue box, small square', 1, 10), ('Tissue box, large rectangle', 2, 20);
	end if;
end
$items$;

-- The owner of an object in coin-uploads, as an email, from the <uid>/ folder.
create or replace function public._coin_upload_owner(p_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_seg text := split_part(coalesce(p_name, ''), '/', 1);
begin
	if v_seg !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
		return null;
	end if;
	return public._notebook_email_for_user(v_seg::uuid);
exception when others then
	return null;
end;
$$;
revoke all on function public._coin_upload_owner(text) from public, anon, authenticated, service_role;

-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: AUDITORS, HELPERS =====

create table if not exists public.coin_auditors (
	student_email text not null check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	assigned_by text not null,
	assigned_at timestamptz not null default now(),
	revoked_at timestamptz,
	revoked_by text,
	id uuid primary key default gen_random_uuid()
);
create unique index if not exists coin_auditors_one_active on public.coin_auditors (student_email) where revoked_at is null;
alter table public.coin_auditors enable row level security;
revoke all on table public.coin_auditors from public, anon, authenticated, service_role;

create or replace function public._coin_is_auditor(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (select 1 from public.coin_auditors a
		where a.student_email = lower(btrim(coalesce(p_email, ''))) and a.revoked_at is null);
$$;
revoke all on function public._coin_is_auditor(text) from public, anon, authenticated, service_role;

-- The class a card belongs to: the student's first economy-on class by label.
create or replace function public._coin_home_section(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
	select x.section_id from public._coin_economy_enrollments() x
	where x.student_email = lower(btrim(coalesce(p_email, '')))
	order by public._coin_classroom_section_label(x.section_id), x.section_id
	limit 1;
$$;
revoke all on function public._coin_home_section(text) from public, anon, authenticated, service_role;

-- The student's shown name, from IDEA Classroom: the class roster's name,
-- then the profile's chosen name, then the profile's full name.
create or replace function public._coin_student_name(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		(select nullif(btrim(e.display_name), '') from public.classroom_enrollments e
			where e.student_email = lower(btrim(coalesce(p_email, ''))) and e.active and nullif(btrim(e.display_name), '') is not null
			order by e.created_at limit 1),
		(select coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), '')) from public.profiles p
			where lower(p.email) = lower(btrim(coalesce(p_email, ''))) limit 1),
		split_part(lower(btrim(coalesce(p_email, ''))), '@', 1)
	);
$$;
revoke all on function public._coin_student_name(text) from public, anon, authenticated, service_role;

-- An uploaded object's size, from the storage catalog; null if it is not there.
create or replace function public._coin_upload_bytes(p_path text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
	select (o.metadata ->> 'size')::bigint from storage.objects o
	where o.bucket_id = 'coin-uploads' and o.name = p_path;
$$;
revoke all on function public._coin_upload_bytes(text) from public, anon, authenticated, service_role;

-- A path the caller may hang off their own card: in their own folder, and
-- actually uploaded.
create or replace function public._coin_own_upload_ok(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select p_path is not null and split_part(p_path, '/', 1) = (select auth.uid())::text
		and p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif)$'
		and public._coin_upload_bytes(p_path) is not null;
$$;
revoke all on function public._coin_own_upload_ok(text) from public, anon, authenticated, service_role;

create or replace function public.coin_auditor_set(p_email text, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can assign Student Auditors.';
	end if;
	if v_email = '' or v_email not like '%@%' or p_on is null then
		return jsonb_build_object('ok', false, 'reason', 'invalid');
	end if;
	if p_on then
		insert into public.coin_auditors (student_email, assigned_by)
		values (v_email, public.current_user_email())
		on conflict do nothing;
	else
		update public.coin_auditors set revoked_at = now(), revoked_by = public.current_user_email()
		where student_email = v_email and revoked_at is null;
	end if;
	return jsonb_build_object('ok', true, 'email', v_email, 'auditor', public._coin_is_auditor(v_email));
end;
$$;
revoke all on function public.coin_auditor_set(text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.coin_auditor_set(text, boolean) to authenticated;

create or replace function public.coin_auditor_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can read the auditor list.';
	end if;
	return coalesce((select jsonb_agg(jsonb_build_object('email', a.student_email,
			'name', public._coin_student_name(a.student_email), 'assigned_at', a.assigned_at, 'assigned_by', a.assigned_by)
			order by public._coin_student_name(a.student_email))
		from public.coin_auditors a where a.revoked_at is null), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_auditor_list() from public, anon, authenticated, service_role;
grant execute on function public.coin_auditor_list() to authenticated;
-- Who may read one object. Named inside a storage policy, so it is evaluated
-- as the querying role and needs an authenticated EXECUTE grant (CLAUDE.md:
-- a function in a USING clause). It answers a boolean about the caller only.
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
		or (public._coin_staff() and public._coin_student_in_scope(public._coin_upload_owner(p_name)))
		or exists (select 1 from public.coin_requests r where r.photo_path = p_name and r.kind = 'reported_coins'
			and public._coin_is_auditor(public.current_user_email()))
	);
$$;
revoke all on function public.coin_can_read_upload(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_can_read_upload(text) to authenticated;

do $bucket$
begin
	begin
		insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
		values ('coin-uploads', 'coin-uploads', false, 20971520,
			array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
		on conflict (id) do update
			set public = false, file_size_limit = 20971520,
				allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

		drop policy if exists "coin uploads insert own folder" on storage.objects;
		create policy "coin uploads insert own folder"
			on storage.objects
			for insert
			to authenticated
			with check (
				bucket_id = 'coin-uploads'
				and split_part(name, '/', 1) = (select auth.uid())::text
			);

		drop policy if exists "coin uploads read" on storage.objects;
		create policy "coin uploads read"
			on storage.objects
			for select
			to authenticated
			using (bucket_id = 'coin-uploads' and public.coin_can_read_upload(name));
	exception when insufficient_privilege then
		raise notice '0245: the storage half was NOT applied (this role cannot write storage.buckets or storage.objects policies). Re-paste 0245 in the SQL editor to finish it; coin photo uploads stay off until then.';
	end;
end;
$bucket$;
-- ===== PART D END =====

-- ===== PART E BEGIN =====
-- ===== PART E: WHAT A STUDENT SUBMITS =====
--
-- Every one goes through the student seam (0241): identity from the session,
-- economy membership, a per-minute rate limit. None takes an email.

create or replace function public._coin_new_request(
	p_kind text, p_email text, p_amount numeric, p_photo text, p_payload jsonb, p_note text
)
returns public.coin_requests
language sql
security definer
set search_path = ''
as $$
	insert into public.coin_requests (kind, student_email, section_id, amount, photo_path, payload, note)
	values (p_kind, p_email, public._coin_home_section(p_email), round(p_amount, 2), p_photo,
		coalesce(p_payload, '{}'::jsonb), nullif(btrim(coalesce(p_note, '')), ''))
	returning *;
$$;
revoke all on function public._coin_new_request(text, text, numeric, text, jsonb, text) from public, anon, authenticated, service_role;

-- A DESKTOP BACKGROUND. The width and height are the browser's measurement of
-- the picture; the size is read from storage. Below the floor it is refused
-- here, before it reaches the queue, and the refusal says why.
create or replace function public.coin_submit_background(p_path text, p_width integer, p_height integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb := public._coin_student_seam('submit_background');
	v_email text;
	v_min_w integer := coalesce((public._coin_setting('background_min_width') #>> '{}')::integer, 1920);
	v_min_h integer := coalesce((public._coin_setting('background_min_height') #>> '{}')::integer, 1080);
	v_kbmp numeric := coalesce((public._coin_setting('background_min_kb_per_megapixel') #>> '{}')::numeric, 100);
	v_days integer := coalesce((public._coin_setting('background_days_between') #>> '{}')::integer, 14);
	v_bytes bigint;
	v_mp numeric;
	v_last timestamptz;
	v_amount numeric;
	v_req public.coin_requests;
begin
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	if not public._coin_own_upload_ok(p_path) then
		return jsonb_build_object('ok', false, 'reason', 'no_upload');
	end if;
	if p_width is null or p_height is null or p_width < 1 or p_height < 1 then
		return jsonb_build_object('ok', false, 'reason', 'size_unknown');
	end if;
	if abs(p_width::numeric * 9 - p_height::numeric * 16) > p_width::numeric * 9 * 0.01 then
		return jsonb_build_object('ok', false, 'reason', 'not_16_9', 'width', p_width, 'height', p_height);
	end if;
	if p_width < v_min_w or p_height < v_min_h then
		return jsonb_build_object('ok', false, 'reason', 'too_small', 'width', p_width, 'height', p_height,
			'min_width', v_min_w, 'min_height', v_min_h);
	end if;
	v_bytes := public._coin_upload_bytes(p_path);
	v_mp := p_width::numeric * p_height::numeric / 1000000;
	if v_bytes / 1024.0 < v_kbmp * v_mp then
		return jsonb_build_object('ok', false, 'reason', 'low_quality', 'kb', round(v_bytes / 1024.0),
			'min_kb', ceil(v_kbmp * v_mp));
	end if;
	select max(r.created_at) into v_last from public.coin_requests r
	where r.student_email = v_email and r.kind = 'background' and r.status in ('pending', 'approved');
	if v_last is not null and v_last > now() - make_interval(days => v_days) then
		return jsonb_build_object('ok', false, 'reason', 'too_soon',
			'next_at', v_last + make_interval(days => v_days));
	end if;
	select c.amount into v_amount from public.coin_categories c where c.id = 'quality_desktop_background' and c.active;
	if v_amount is null then
		return jsonb_build_object('ok', false, 'reason', 'not_available');
	end if;
	v_req := public._coin_new_request('background', v_email, v_amount, p_path,
		jsonb_build_object('width', p_width, 'height', p_height, 'bytes', v_bytes), null);
	return jsonb_build_object('ok', true, 'request_id', v_req.id);
end;
$$;
revoke all on function public.coin_submit_background(text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.coin_submit_background(text, integer, integer) to authenticated;

-- A DONATION. An item from the want list and a quantity, or "Other" with a
-- description (its amount is set at approval). Always with a photo.
create or replace function public.coin_submit_donation(p_item_id uuid, p_quantity integer, p_other text, p_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb := public._coin_student_seam('submit_donation');
	v_email text;
	v_item public.coin_donation_items;
	v_other text := nullif(btrim(coalesce(p_other, '')), '');
	v_req public.coin_requests;
begin
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	if not exists (select 1 from public.coin_categories where id = 'donation' and active) then
		return jsonb_build_object('ok', false, 'reason', 'not_available');
	end if;
	if not public._coin_own_upload_ok(p_path) then
		return jsonb_build_object('ok', false, 'reason', 'no_upload');
	end if;
	if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
		return jsonb_build_object('ok', false, 'reason', 'quantity');
	end if;
	if p_item_id is not null then
		select * into v_item from public.coin_donation_items where id = p_item_id and active;
		if v_item.id is null then
			return jsonb_build_object('ok', false, 'reason', 'unknown_item');
		end if;
	elsif v_other is null or char_length(v_other) > 200 then
		return jsonb_build_object('ok', false, 'reason', 'describe_other');
	end if;
	v_req := public._coin_new_request('donation', v_email,
		case when v_item.rate is not null then v_item.rate * p_quantity end, p_path,
		jsonb_build_object('item_id', v_item.id, 'item', coalesce(v_item.name, v_other),
			'rate', v_item.rate, 'quantity', p_quantity, 'other', v_item.id is null), null);
	return jsonb_build_object('ok', true, 'request_id', v_req.id);
end;
$$;
revoke all on function public.coin_submit_donation(uuid, integer, text, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_submit_donation(uuid, integer, text, text) to authenticated;

-- A REPORTED COUNT OF COINS ON HAND. A count, not an amount of anything: it
-- moves no balance. Validated by an admin or a Student Auditor.
create or replace function public.coin_report_physical(p_count numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb;
	v_email text;
	v_req public.coin_requests;
begin
	if p_count is null or p_count < 0 or p_count > 100000 or p_count <> trunc(p_count) then
		return jsonb_build_object('ok', false, 'reason', 'count');
	end if;
	v_seam := public._coin_student_seam('report_physical');
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	if exists (select 1 from public.coin_requests r where r.student_email = v_email
		and r.kind = 'reported_coins' and r.status = 'pending') then
		return jsonb_build_object('ok', false, 'reason', 'already_pending');
	end if;
	v_req := public._coin_new_request('reported_coins', v_email, null, null,
		jsonb_build_object('count', p_count), null);
	return jsonb_build_object('ok', true, 'request_id', v_req.id);
end;
$$;
revoke all on function public.coin_report_physical(numeric) from public, anon, authenticated, service_role;
grant execute on function public.coin_report_physical(numeric) to authenticated;

-- A DISPUTE of an automatic fine on the caller's own history.
create or replace function public.coin_dispute_fine(p_transaction_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_seam jsonb := public._coin_student_seam('dispute_fine');
	v_email text;
	v_row public.coin_transactions;
	v_kind text;
	v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
	v_req public.coin_requests;
begin
	if not (v_seam ->> 'ok')::boolean then
		return v_seam;
	end if;
	v_email := v_seam ->> 'email';
	if v_reason is null or char_length(v_reason) > 1000 then
		return jsonb_build_object('ok', false, 'reason', 'reason_required');
	end if;
	select * into v_row from public.coin_transactions where id = p_transaction_id;
	select c.kind into v_kind from public.coin_categories c where c.id = v_row.category_id;
	if v_row.id is null or v_row.student_email <> v_email or v_row.actor_email <> 'system'
		or coalesce(v_kind, '') <> 'fine' or v_row.medium <> 'digital' then
		return jsonb_build_object('ok', false, 'reason', 'not_disputable');
	end if;
	if public._coin_is_reversed(v_row.id) then
		return jsonb_build_object('ok', false, 'reason', 'already_reversed');
	end if;
	begin
		v_req := public._coin_new_request('dispute', v_email, -v_row.amount, null,
			jsonb_build_object('transaction_id', v_row.id::text, 'category_id', v_row.category_id,
				'fined_at', v_row.created_at), v_reason);
	exception when unique_violation then
		return jsonb_build_object('ok', false, 'reason', 'already_disputed');
	end;
	return jsonb_build_object('ok', true, 'request_id', v_req.id);
end;
$$;
revoke all on function public.coin_dispute_fine(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_dispute_fine(uuid, text) to authenticated;

-- A student cancels their own pending card (not a split: that one is a
-- payment in progress and is settled by the queue).
create or replace function public.coin_cancel_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_req public.coin_requests;
begin
	if v_email = '' then
		return jsonb_build_object('ok', false, 'reason', 'signed_out');
	end if;
	select * into v_req from public.coin_requests where id = p_request_id for update;
	if v_req.id is null or v_req.student_email <> v_email then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_req.status <> 'pending' or v_req.kind in ('split', 'contract') then
		return jsonb_build_object('ok', false, 'reason', 'not_cancellable');
	end if;
	update public.coin_requests set status = 'cancelled', decided_at = now(), decided_by = v_email
	where id = v_req.id;
	return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.coin_cancel_request(uuid) from public, anon, authenticated, service_role;
grant execute on function public.coin_cancel_request(uuid) to authenticated;
-- ===== PART E END =====

-- ===== PART F BEGIN =====
-- ===== PART F: DECIDING A CARD =====

-- Donation room left in the rolling window.
create or replace function public._coin_donation_room(p_email text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
	select greatest(0,
		coalesce((public._coin_setting('donation_cap_coins') #>> '{}')::numeric, 10)
		- coalesce((select sum(t.amount) from public.coin_transactions t
			where t.student_email = lower(btrim(coalesce(p_email, ''))) and t.category_id = 'donation'
				and t.medium = 'digital' and not public._coin_is_reversed(t.id)
				and t.created_at > now() - make_interval(days =>
					coalesce((public._coin_setting('donation_cap_days') #>> '{}')::integer, 14))), 0));
$$;
revoke all on function public._coin_donation_room(text) from public, anon, authenticated, service_role;

-- THE ONE DECISION. p_actor names who decided (an email); p_amount overrides
-- the filled-in amount where the kind takes one. Refusals are structured.
-- The per-kind work for split, role_day and contract lives in the files that
-- create those features (0246, 0247, 0248) and is called from here.
create or replace function public._coin_decide(p_request_id uuid, p_approve boolean, p_amount numeric, p_note text, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_req public.coin_requests;
	v_amount numeric;
	v_room numeric;
	v_row public.coin_transactions;
	v_result jsonb := '{}'::jsonb;
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_rev jsonb;
begin
	select * into v_req from public.coin_requests where id = p_request_id for update;
	if v_req.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_req.status <> 'pending' then
		return jsonb_build_object('ok', false, 'reason', 'already_decided', 'status', v_req.status);
	end if;
	if p_amount is not null and (p_amount < 0 or p_amount > 100000) then
		return jsonb_build_object('ok', false, 'reason', 'amount');
	end if;

	if p_approve then
		if v_req.kind = 'background' then
			v_amount := round(coalesce(p_amount, v_req.amount, 0), 2);
			if v_amount > 0 then
				v_row := public._coin_insert(v_req.student_email, 'quality_desktop_background', v_amount, null,
					'Desktop background approved.', jsonb_build_object('request_id', v_req.id::text), 'digital', null, p_actor);
				v_result := jsonb_build_object('transaction_id', v_row.id, 'paid', v_amount);
			end if;
		elsif v_req.kind = 'donation' then
			v_amount := round(coalesce(p_amount, v_req.amount), 2);
			if v_amount is null then
				return jsonb_build_object('ok', false, 'reason', 'amount_required');
			end if;
			perform pg_advisory_xact_lock(hashtext('coin_donation:' || v_req.student_email));
			v_room := public._coin_donation_room(v_req.student_email);
			v_result := jsonb_build_object('asked', v_amount, 'room', v_room, 'capped', v_amount > v_room);
			v_amount := least(v_amount, v_room);
			if v_amount > 0 then
				v_row := public._coin_insert(v_req.student_email, 'donation', v_amount, (v_req.payload ->> 'quantity')::numeric,
					'Donation: ' || coalesce(v_req.payload ->> 'item', 'item') || ' x' || coalesce(v_req.payload ->> 'quantity', '1') || '.',
					jsonb_build_object('request_id', v_req.id::text), 'digital', null, p_actor);
				v_result := v_result || jsonb_build_object('transaction_id', v_row.id);
			end if;
			v_result := v_result || jsonb_build_object('paid', v_amount);
		elsif v_req.kind = 'dispute' then
			v_rev := public._coin_reverse((v_req.payload ->> 'transaction_id')::uuid,
				'Dispute approved' || coalesce(': ' || v_note, '.'), p_actor);
			if not coalesce((v_rev ->> 'ok')::boolean, false) and v_rev ->> 'reason' <> 'already_reversed' then
				return v_rev;
			end if;
			v_result := jsonb_build_object('reversal', v_rev);
		elsif v_req.kind = 'reported_coins' then
			v_result := jsonb_build_object('count', (v_req.payload ->> 'count')::numeric, 'validated_by_name',
				public._coin_student_name(p_actor), 'validator_is_auditor', public._coin_is_auditor(p_actor));
		elsif v_req.kind = 'split' then
			v_result := public._coin_decide_split(v_req, true, p_actor);
		elsif v_req.kind = 'role_day' then
			v_result := public._coin_decide_role_day(v_req, true, p_actor);
		elsif v_req.kind = 'contract' then
			v_result := public._coin_decide_contract(v_req, true, coalesce(p_amount, v_req.amount), p_actor);
		end if;
		if coalesce((v_result ->> 'ok')::boolean, true) is false then
			return v_result;
		end if;
	else
		if v_req.kind = 'split' then
			v_result := public._coin_decide_split(v_req, false, p_actor);
		elsif v_req.kind = 'role_day' then
			v_result := public._coin_decide_role_day(v_req, false, p_actor);
		elsif v_req.kind = 'contract' then
			v_result := public._coin_decide_contract(v_req, false, null, p_actor);
		end if;
		if coalesce((v_result ->> 'ok')::boolean, true) is false then
			return v_result;
		end if;
	end if;

	update public.coin_requests
	set status = case when p_approve then 'approved' else 'denied' end,
		decided_by = p_actor, decided_at = now(),
		decision_note = v_note,
		amount = case when p_approve and v_amount is not null then v_amount else amount end,
		result = v_result
	where id = v_req.id;
	return jsonb_build_object('ok', true, 'request_id', v_req.id, 'status',
		case when p_approve then 'approved' else 'denied' end, 'result', v_result);
end;
$$;
revoke all on function public._coin_decide(uuid, boolean, numeric, text, text) from public, anon, authenticated, service_role;

-- A card a coin staff member's scope reaches.
create or replace function public._coin_card_in_scope(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public._coin_staff() and public._coin_student_in_scope(p_email);
$$;
revoke all on function public._coin_card_in_scope(text) from public, anon, authenticated, service_role;

create or replace function public._coin_card_json(r public.coin_requests)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'id', r.id, 'kind', r.kind, 'email', r.student_email,
		'name', public._coin_student_name(r.student_email),
		'section_id', r.section_id,
		'section', public._coin_classroom_section_label(r.section_id),
		'amount', r.amount, 'photo_path', r.photo_path, 'payload', r.payload, 'note', r.note,
		'status', r.status, 'decided_at', r.decided_at, 'decision_note', r.decision_note,
		'result', r.result, 'created_at', r.created_at,
		'balance', public._coin_balance(r.student_email));
$$;
revoke all on function public._coin_card_json(public.coin_requests) from public, anon, authenticated, service_role;

-- THE QUEUE, as one coin staff member sees it: every pending card in their
-- scope, oldest first, and the last two weeks of decisions.
create or replace function public.coin_queue(p_kind text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can read the queue.';
	end if;
	return jsonb_build_object(
		'pending', coalesce((select jsonb_agg(public._coin_card_json(r) order by r.created_at, r.id)
			from public.coin_requests r
			where r.status = 'pending' and (p_kind is null or r.kind = p_kind)
				and public._coin_student_in_scope(r.student_email)), '[]'::jsonb),
		'counts', coalesce((select jsonb_object_agg(k.kind, k.n) from (
			select r.kind, count(*) as n from public.coin_requests r
			where r.status = 'pending' and public._coin_student_in_scope(r.student_email)
			group by r.kind) k), '{}'::jsonb),
		'recent', coalesce((select jsonb_agg(public._coin_card_json(r) order by r.decided_at desc)
			from (select * from public.coin_requests r
				where r.status in ('approved', 'denied') and r.decided_at > now() - interval '14 days'
					and (p_kind is null or r.kind = p_kind)
					and public._coin_student_in_scope(r.student_email)
				order by r.decided_at desc limit 100) r), '[]'::jsonb)
	);
end;
$$;
revoke all on function public.coin_queue(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_queue(text) to authenticated;

create or replace function public.coin_queue_decide(p_request_id uuid, p_approve boolean, p_amount numeric default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can decide a queue card.';
	end if;
	if p_approve is null then
		return jsonb_build_object('ok', false, 'reason', 'invalid');
	end if;
	select r.student_email into v_email from public.coin_requests r where r.id = p_request_id;
	if v_email is null or not public._coin_student_in_scope(v_email) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	return public._coin_decide(p_request_id, p_approve, p_amount, p_note, public.current_user_email());
end;
$$;
revoke all on function public.coin_queue_decide(uuid, boolean, numeric, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_queue_decide(uuid, boolean, numeric, text) to authenticated;

-- APPROVE ALL, per kind: every pending card of that kind in scope, each with
-- its filled-in amount. A card that needs a person's number (an "Other"
-- donation) is skipped and counted. One failure never stops the rest.
create or replace function public.coin_queue_approve_all(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	r record;
	v_call jsonb;
	v_total integer := 0;
	v_ok integer := 0;
	v_skipped integer := 0;
	v_results jsonb := '[]'::jsonb;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can decide a queue card.';
	end if;
	if p_kind is null or p_kind not in ('background', 'donation', 'contract', 'role_day', 'split', 'reported_coins', 'dispute') then
		return jsonb_build_object('ok', false, 'reason', 'invalid');
	end if;
	for r in
		select q.id, q.amount from public.coin_requests q
		where q.kind = p_kind and q.status = 'pending' and public._coin_student_in_scope(q.student_email)
		order by q.created_at, q.id
	loop
		v_total := v_total + 1;
		if p_kind in ('donation', 'contract') and r.amount is null then
			v_skipped := v_skipped + 1;
			continue;
		end if;
		begin
			v_call := public._coin_decide(r.id, true, null, null, public.current_user_email());
		exception when others then
			v_call := jsonb_build_object('ok', false, 'reason', 'error', 'message', sqlerrm);
		end;
		if coalesce((v_call ->> 'ok')::boolean, false) then
			v_ok := v_ok + 1;
		end if;
		v_results := v_results || jsonb_build_array(jsonb_build_object('id', r.id) || v_call);
	end loop;
	return jsonb_build_object('ok', true, 'kind', p_kind, 'total', v_total, 'succeeded', v_ok,
		'skipped', v_skipped, 'refused', v_total - v_ok - v_skipped, 'results', v_results);
end;
$$;
revoke all on function public.coin_queue_approve_all(text) from public, anon, authenticated, service_role;
grant execute on function public.coin_queue_approve_all(text) to authenticated;

-- A STUDENT AUDITOR'S QUEUE: reported counts from classmates (a student who
-- shares a class with the auditor), never their own.
create or replace function public.coin_auditor_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
begin
	if v_email = '' or not public._coin_is_auditor(v_email) then
		return jsonb_build_object('auditor', false);
	end if;
	return jsonb_build_object('auditor', true, 'pending', coalesce((
		select jsonb_agg(jsonb_build_object('id', r.id, 'name', public._coin_student_name(r.student_email),
			'count', (r.payload ->> 'count')::numeric, 'created_at', r.created_at) order by r.created_at)
		from public.coin_requests r
		where r.kind = 'reported_coins' and r.status = 'pending' and r.student_email <> v_email
			and exists (select 1 from public._coin_economy_enrollments() a
				join public._coin_economy_enrollments() b on b.section_id = a.section_id
				where a.student_email = v_email and b.student_email = r.student_email)), '[]'::jsonb));
end;
$$;
revoke all on function public.coin_auditor_queue() from public, anon, authenticated, service_role;
grant execute on function public.coin_auditor_queue() to authenticated;

create or replace function public.coin_auditor_validate(p_request_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_req public.coin_requests;
begin
	if v_email = '' or not public._coin_is_auditor(v_email) then
		raise exception 'Only a Student Auditor can validate a reported count.';
	end if;
	if p_approve is null then
		return jsonb_build_object('ok', false, 'reason', 'invalid');
	end if;
	select * into v_req from public.coin_requests where id = p_request_id;
	if v_req.id is null or v_req.kind <> 'reported_coins' then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v_req.student_email = v_email then
		return jsonb_build_object('ok', false, 'reason', 'own_report');
	end if;
	if not exists (select 1 from public._coin_economy_enrollments() a
		join public._coin_economy_enrollments() b on b.section_id = a.section_id
		where a.student_email = v_email and b.student_email = v_req.student_email) then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	return public._coin_decide(p_request_id, p_approve, null, p_note, v_email);
end;
$$;
revoke all on function public.coin_auditor_validate(uuid, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_auditor_validate(uuid, boolean, text) to authenticated;
-- ===== PART F END =====

-- ===== PART G BEGIN =====
-- ===== PART G: THE WANT LIST, AND WHAT IS PUBLIC =====

create or replace function public.coin_donation_items_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null then
		return '[]'::jsonb;
	end if;
	return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'rate', d.rate,
			'photo_path', d.photo_path, 'active', d.active, 'sort_order', d.sort_order)
			order by d.sort_order, d.name)
		from public.coin_donation_items d where d.active or public._coin_full_staff()), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_donation_items_list() from public, anon, authenticated, service_role;
grant execute on function public.coin_donation_items_list() to authenticated;

-- One want-list item, created (p_id null) or changed. Nothing is deleted; an
-- item is made inactive. A null rate means "Other": set at approval.
create or replace function public.coin_donation_item_save(
	p_id uuid, p_name text, p_rate numeric, p_photo_path text, p_active boolean, p_sort_order integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_name text := nullif(btrim(coalesce(p_name, '')), '');
	v_row public.coin_donation_items;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can change the want list.';
	end if;
	if v_name is null or char_length(v_name) > 120 then
		return jsonb_build_object('ok', false, 'reason', 'name');
	end if;
	if p_rate is not null and (p_rate < 0 or p_rate > 1000) then
		return jsonb_build_object('ok', false, 'reason', 'rate');
	end if;
	if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> (select auth.uid())::text
		and not exists (select 1 from public.coin_donation_items d where d.photo_path = p_photo_path) then
		return jsonb_build_object('ok', false, 'reason', 'photo');
	end if;
	if p_id is null then
		insert into public.coin_donation_items (name, rate, photo_path, active, sort_order, created_by)
		values (v_name, round(p_rate, 2), p_photo_path, coalesce(p_active, true), coalesce(p_sort_order, 0),
			public.current_user_email())
		returning * into v_row;
	else
		update public.coin_donation_items set name = v_name, rate = round(p_rate, 2), photo_path = p_photo_path,
			active = coalesce(p_active, active), sort_order = coalesce(p_sort_order, sort_order)
		where id = p_id returning * into v_row;
		if v_row.id is null then
			return jsonb_build_object('ok', false, 'reason', 'not_found');
		end if;
	end if;
	perform public._coin_audit('donation_item:' || v_row.id, null, to_jsonb(v_row));
	return jsonb_build_object('ok', true, 'item', to_jsonb(v_row));
end;
$$;
revoke all on function public.coin_donation_item_save(uuid, text, numeric, text, boolean, integer) from public, anon, authenticated, service_role;
grant execute on function public.coin_donation_item_save(uuid, text, numeric, text, boolean, integer) to authenticated;

-- A student's approved background, the newest. The one statement of "the
-- background their screen is checked against".
create or replace function public._coin_current_background(p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object('request_id', r.id, 'photo_path', r.photo_path, 'approved_at', r.decided_at,
		'width', (r.payload ->> 'width')::integer, 'height', (r.payload ->> 'height')::integer)
	from public.coin_requests r
	where r.student_email = lower(btrim(coalesce(p_email, ''))) and r.kind = 'background' and r.status = 'approved'
	order by r.decided_at desc limit 1;
$$;
revoke all on function public._coin_current_background(text) from public, anon, authenticated, service_role;

-- PUBLIC: the latest validated count of coins on hand, per student, by the
-- Ledger's opaque id. No email; the count and the day it was validated.
create or replace function public.coin_public_reported_coins()
returns table (student_id text, coins numeric, reported_on date)
language sql
stable
security definer
set search_path = ''
as $$
	select distinct on (ros.public_id) ros.public_id, (r.payload ->> 'count')::numeric,
		public._coin_la_today(r.decided_at)
	from public.coin_requests r
	join public._coin_public_roster() ros on ros.student_email = r.student_email
	where r.kind = 'reported_coins' and r.status = 'approved'
	order by ros.public_id, r.decided_at desc;
$$;
revoke all on function public.coin_public_reported_coins() from public, anon, authenticated, service_role;
grant execute on function public.coin_public_reported_coins() to anon, authenticated;
-- ===== PART G END =====

do $chk$
declare
	r record;
begin
	for r in
		select p.oid::regprocedure::text as sig, pg_get_function_identity_arguments(p.oid) as args, p.proname
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname in ('coin_submit_background', 'coin_submit_donation',
			'coin_report_physical', 'coin_dispute_fine', 'coin_cancel_request')
	loop
		if has_function_privilege('anon', r.sig, 'execute') then
			raise exception '0245: anon must not execute %.', r.sig;
		end if;
		if r.args ~* '(email|amount|cost|price)' then
			raise exception '0245: % takes an identity or an amount (%).', r.sig, r.args;
		end if;
	end loop;
	for r in
		select p.oid::regprocedure::text as sig
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname in ('coin_queue', 'coin_queue_decide', 'coin_queue_approve_all',
			'coin_auditor_set', 'coin_auditor_list', 'coin_auditor_queue', 'coin_auditor_validate',
			'coin_donation_items_list', 'coin_donation_item_save', 'coin_can_read_upload')
			and has_function_privilege('anon', p.oid, 'execute')
	loop
		raise exception '0245: anon must not execute %.', r.sig;
	end loop;
	if has_function_privilege('authenticated', 'public._coin_decide(uuid, boolean, numeric, text, text)', 'execute') then
		raise exception '0245: _coin_decide must be private.';
	end if;
	raise notice '0245: the queue is in place (% pending card(s)); the want list holds % item(s).',
		(select count(*) from public.coin_requests where status = 'pending'),
		(select count(*) from public.coin_donation_items);
end
$chk$;
