-- 0235_armory_app_feedback_v2.sql
--
-- IDEA ARMORY: THE APP'S SEND FEEDBACK MATCHES THE WEBSITE'S (Armory 0.3.2,
-- ledger 0375, pina-hash/idea-armory docs/agent/website-requests-v0.3.2.md,
-- item 5). A student asked for the app's Send feedback to have "the same
-- features as the feedback function on the idea website".
--
-- WHAT THE WEBSITE'S FORM HAS THAT THE APP'S NOTE DID NOT, AND WHAT THIS DOES:
--
--   a praise kind          The website takes bug, idea, praise and other.
--                          Added to the note's kinds.
--   What did you try?      The website's optional second box (0170), at most
--                          1000 characters. Added as p_tried.
--   where it happened      The website captures the page by itself. The app
--                          has no address bar, so it names the area (a
--                          window or view, at most 120 characters). p_area.
--   a screenshot           The website's is one picture in feedback-media.
--                          The app's is the APP WINDOW ONLY, PNG, at most
--                          2 MiB (2097152 bytes), in a new private bucket,
--                          armory-feedback-shots, under the caller's own
--                          folder <auth uid>/<uuid>.png. Storage enforces the
--                          type and the size on the upload itself; the submit
--                          checks the key's shape, that its folder is the
--                          caller's, and that the object is there.
--   your feedback          The website has NO list of a person's own reports
--                          and no replies. The app gets one anyway, because
--                          the app's notes already carry a status:
--                          armory_my_app_feedback(p_limit), the caller's own
--                          notes and their status, newest first.
--   replies                Not built: the website has none either, and who
--                          may answer a student, and where, is Mr. Pina's to
--                          decide. docs/ARMORY.md records it as open.
--
-- THE SIGNATURE. The 0.3.x app calls the five-argument
-- armory_submit_app_feedback. This file adds an EIGHT-argument overload with
-- NO DEFAULTS, so no call can bind to both (CLAUDE.md, the signature trap),
-- and makes the five-argument form a thin wrapper over it that refuses praise
-- with its own 0233 text first. So a deployed app answers exactly as before,
-- refusal text and order included, there is one copy of every rule, and the
-- migration and an app release may land in either order.
--
-- Additive otherwise: three nullable columns, one widened kind check, one
-- bucket with two policies, one new read. The storage half is guarded the
-- 0233 way: it NOTICEs rather than refuses where the applying role cannot
-- write storage.
--
-- UNDO, before any client depends on it (a person's paste): drop the two new
-- functions at their exact argument types, re-run 0233's body of the
-- five-argument function, put the kind check back to three kinds once no row
-- says praise, and drop the three columns and the bucket's two policies.

-- ---------------------------------------------------------------------------
-- 0. Your feedback, first, so the object the deploy probe checks is new here: the caller's own notes, newest first. No identity
-- parameter, so "only your own" is the signature. Never the reviewer's
-- address and never the context; a note an admin marked spam reads closed,
-- so the app never calls a student's note spam.
-- ---------------------------------------------------------------------------

create or replace function public.armory_my_app_feedback(p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $af$
declare
	e text := public.armory_current_email();
	v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
	if e = '' then
		raise exception 'Sign in to see your feedback.' using errcode = '42501';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', r.id, 'created_at', r.created_at, 'kind', r.kind, 'body', r.body, 'tried', r.tried, 'area', r.area,
			'has_screenshot', r.screenshot_path is not null, 'app_version', r.app_version, 'device_name', r.device_name,
			'status', case when r.status = 'spam' then 'closed' else r.status end, 'reviewed_at', r.reviewed_at)
			order by r.created_at desc, r.id)
		from (
			select f.* from public.armory_app_feedback f where f.email = e order by f.created_at desc, f.id limit v_limit
		) r
	), '[]'::jsonb);
end $af$;

-- ---------------------------------------------------------------------------
-- 1. The note's new fields.
-- ---------------------------------------------------------------------------

alter table public.armory_app_feedback add column if not exists tried text
	check (tried is null or char_length(tried) between 1 and 1000);
alter table public.armory_app_feedback add column if not exists area text
	check (area is null or char_length(area) between 1 and 120);
alter table public.armory_app_feedback add column if not exists screenshot_path text
	check (screenshot_path is null
		or screenshot_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$');

-- The kind check widens to four. Guarded on the catalog so a re-paste is a
-- no-op: the constraint is replaced only while it still lacks praise.
do $af$
declare v_name text;
begin
	select c.conname into v_name from pg_catalog.pg_constraint c
	where c.conrelid = 'public.armory_app_feedback'::regclass and c.contype = 'c'
		and pg_catalog.pg_get_constraintdef(c.oid) like '%kind%' and pg_catalog.pg_get_constraintdef(c.oid) like '%idea%';
	if v_name is not null and pg_catalog.pg_get_constraintdef(
		(select oid from pg_catalog.pg_constraint where conrelid = 'public.armory_app_feedback'::regclass and conname = v_name)) not like '%praise%' then
		execute format('alter table public.armory_app_feedback drop constraint %I', v_name);
		alter table public.armory_app_feedback add constraint armory_app_feedback_kind_check
			check (kind in ('bug', 'idea', 'praise', 'other'));
	end if;
end $af$;

-- ---------------------------------------------------------------------------
-- 2. The submit, wide, with no defaults.
-- ---------------------------------------------------------------------------

create or replace function public.armory_submit_app_feedback(
	p_kind text, p_body text, p_app_version text, p_device_name text, p_context jsonb,
	p_tried text, p_area text, p_screenshot text
) returns uuid
language plpgsql security definer set search_path = '' as $af$
declare
	e text := public.armory_current_email();
	v_kind text := lower(regexp_replace(coalesce(p_kind, ''), '^\s+|\s+$', '', 'g'));
	v_body text := regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
	v_version text := regexp_replace(coalesce(p_app_version, ''), '^\s+|\s+$', '', 'g');
	v_device text := nullif(left(regexp_replace(coalesce(p_device_name, ''), '^\s+|\s+$', '', 'g'), 120), '');
	v_context jsonb := coalesce(p_context, '{}'::jsonb);
	v_tried text := nullif(regexp_replace(coalesce(p_tried, ''), '^\s+|\s+$', '', 'g'), '');
	v_area text := nullif(regexp_replace(coalesce(p_area, ''), '^\s+|\s+$', '', 'g'), '');
	v_shot text := nullif(regexp_replace(coalesce(p_screenshot, ''), '^\s+|\s+$', '', 'g'), '');
	v_size integer;
	v_recent integer;
	v_oldest timestamptz;
	v_id uuid;
begin
	-- The 0233 checks, in 0233's order and words, then the three new fields.
	if v_kind not in ('bug', 'idea', 'praise', 'other') then
		raise exception 'The kind of note is bug, idea, praise or other.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'kind', 'field', 'kind')::text;
	end if;
	if v_body = '' then
		raise exception 'The note has nothing in it.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'empty', 'field', 'body')::text;
	end if;
	if char_length(v_body) > 8000 then
		raise exception 'The note is % characters; the limit is 8000.', char_length(v_body) using errcode = '22023',
			detail = jsonb_build_object('reason', 'too_long', 'field', 'body', 'limit', 8000, 'size', char_length(v_body))::text;
	end if;
	if v_version = '' or char_length(v_version) > 64 then
		raise exception 'The app version is required, at most 64 characters.' using errcode = '22023',
			detail = jsonb_build_object('reason', case when v_version = '' then 'empty' else 'too_long' end, 'field', 'app_version')::text;
	end if;
	if jsonb_typeof(v_context) is distinct from 'object' then
		raise exception 'The context must be a JSON object.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'not_object', 'field', 'context')::text;
	end if;
	v_size := pg_column_size(v_context);
	if v_size > 131072 then
		raise exception 'The context is % bytes; the limit is 131072.', v_size using errcode = '22023',
			detail = jsonb_build_object('reason', 'too_large', 'field', 'context', 'limit', 131072, 'size', v_size)::text;
	end if;
	if char_length(coalesce(v_tried, '')) > 1000 then
		raise exception 'What you tried is % characters; the limit is 1000.', char_length(v_tried) using errcode = '22023',
			detail = jsonb_build_object('reason', 'too_long', 'field', 'tried', 'limit', 1000, 'size', char_length(v_tried))::text;
	end if;
	if char_length(coalesce(v_area, '')) > 120 then
		raise exception 'The area is % characters; the limit is 120.', char_length(v_area) using errcode = '22023',
			detail = jsonb_build_object('reason', 'too_long', 'field', 'area', 'limit', 120, 'size', char_length(v_area))::text;
	end if;
	if v_shot is not null then
		-- The key is <the caller's auth uid>/<uuid>.png, lowercase, nothing else.
		if v_shot !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'
			or auth.uid() is null or split_part(v_shot, '/', 1) <> auth.uid()::text then
			raise exception 'The screenshot key must be your own folder, then a uuid, then .png.' using errcode = '22023',
				detail = jsonb_build_object('reason', 'bad_path', 'field', 'screenshot')::text;
		end if;
		if not exists (select 1 from storage.objects o where o.bucket_id = 'armory-feedback-shots' and o.name = v_shot) then
			raise exception 'The screenshot was not uploaded. Upload it first, then send the note.' using errcode = '22023',
				detail = jsonb_build_object('reason', 'not_found', 'field', 'screenshot')::text;
		end if;
		if exists (select 1 from public.armory_app_feedback f where f.screenshot_path = v_shot) then
			raise exception 'That screenshot is already on another note.' using errcode = '22023',
				detail = jsonb_build_object('reason', 'in_use', 'field', 'screenshot')::text;
		end if;
	end if;

	-- The capacity check holds a lock on the account, so two notes at once cannot both pass.
	perform pg_advisory_xact_lock(hashtextextended('armory_app_feedback:' || e, 0));
	select count(*), min(created_at) into v_recent, v_oldest from public.armory_app_feedback
	where email = e and created_at > now() - interval '1 hour';
	if v_recent >= 20 then
		raise exception 'Too many feedback notes from this account in the last hour.' using errcode = 'PT429',
			detail = jsonb_build_object('reason', 'rate_limited', 'limit', 20, 'window_seconds', 3600,
				'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 hour' - now())))::int))::text;
	end if;

	insert into public.armory_app_feedback (email, device_name, app_version, kind, body, context, tried, area, screenshot_path)
	values (e, v_device, v_version, v_kind, v_body, v_context, v_tried, v_area, v_shot)
	returning id into v_id;
	return v_id;
end $af$;

-- The five-argument form a 0.3.x app calls: 0233's refusal for a kind it never
-- took, then the wide form with nothing new. Same signature, same OID.
create or replace function public.armory_submit_app_feedback(
	p_kind text, p_body text, p_app_version text, p_device_name text, p_context jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $af$
begin
	if lower(regexp_replace(coalesce(p_kind, ''), '^\s+|\s+$', '', 'g')) not in ('bug', 'idea', 'other') then
		raise exception 'The kind of note is bug, idea or other.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'kind', 'field', 'kind')::text;
	end if;
	return public.armory_submit_app_feedback(p_kind, p_body, p_app_version, p_device_name, p_context, null::text, null::text, null::text);
end $af$;

-- ---------------------------------------------------------------------------
-- 4. The console's list carries the three new fields (0233's body plus them).
-- ---------------------------------------------------------------------------

create or replace function public.armory_app_feedback_admin_list(p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $af$
declare v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 1000);
begin
	if not coalesce(public.is_admin(), false) then
		raise exception 'Only a site admin can read Armory feedback.' using errcode = '42501';
	end if;
	return coalesce((
		with picked as (
			select f.* from public.armory_app_feedback f order by f.created_at desc, f.id limit v_limit
		), names as (
			select x.email, public._armory_person(x.email)->>'name' as name
			from (select distinct picked.email from picked) x
		)
		select jsonb_agg(jsonb_build_object(
			'id', r.id, 'created_at', r.created_at, 'email', r.email, 'device_name', r.device_name,
			'app_version', r.app_version, 'kind', r.kind, 'body', r.body, 'context', r.context,
			'status', r.status, 'reviewed_at', r.reviewed_at, 'reviewed_by', r.reviewed_by,
			'submitter_name', n.name, 'tried', r.tried, 'area', r.area, 'screenshot_path', r.screenshot_path)
			order by r.created_at desc, r.id)
		from picked r left join names n on n.email = r.email
	), '[]'::jsonb);
end $af$;

-- ---------------------------------------------------------------------------
-- 5. Grants, the 0166 shape: revoked from every client role by name, then
-- the one role that calls each.
-- ---------------------------------------------------------------------------

revoke all on function
	public.armory_submit_app_feedback(text, text, text, text, jsonb, text, text, text),
	public.armory_submit_app_feedback(text, text, text, text, jsonb),
	public.armory_my_app_feedback(integer),
	public.armory_app_feedback_admin_list(integer)
from public, anon, authenticated;
grant execute on function
	public.armory_submit_app_feedback(text, text, text, text, jsonb, text, text, text),
	public.armory_submit_app_feedback(text, text, text, text, jsonb),
	public.armory_my_app_feedback(integer),
	public.armory_app_feedback_admin_list(integer)
to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The storage half, guarded. Private; 2097152 bytes; PNG only. A person
-- uploads into their own folder; a site admin reads any. No update, delete
-- or anon policy: keys are fresh uuids and nothing overwrites one.
-- ---------------------------------------------------------------------------

do $af$
begin
	begin
		insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
		values ('armory-feedback-shots', 'armory-feedback-shots', false, 2097152, array['image/png'])
		on conflict (id) do update
			set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/png'];

		drop policy if exists "armory feedback shots insert own folder" on storage.objects;
		create policy "armory feedback shots insert own folder"
			on storage.objects
			for insert
			to authenticated
			with check (
				bucket_id = 'armory-feedback-shots'
				and (storage.foldername(name))[1] = auth.uid()::text
			);

		drop policy if exists "armory feedback shots admin read" on storage.objects;
		create policy "armory feedback shots admin read"
			on storage.objects
			for select
			to authenticated
			using (
				bucket_id = 'armory-feedback-shots'
				and public.is_admin()
			);
	exception when insufficient_privilege then
		raise notice '0235: the storage half was NOT applied (this role cannot write storage.buckets or storage.objects policies). Re-paste 0235 in the SQL editor to finish it; screenshots are refused as not_found until then.';
	end;
end;
$af$;

-- ---------------------------------------------------------------------------
-- 7. Self-check, BY NAME over this file's own objects.
-- ---------------------------------------------------------------------------

do $af$
declare
	v_f text;
	v_n integer;
begin
	select count(*) into v_n from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'armory_submit_app_feedback';
	if v_n <> 2 then
		raise exception '0235: expected exactly two public.armory_submit_app_feedback, found %', v_n;
	end if;
	if (select pronargdefaults from pg_catalog.pg_proc
		where oid = 'public.armory_submit_app_feedback(text, text, text, text, jsonb, text, text, text)'::regprocedure) <> 0 then
		raise exception '0235: the eight-argument armory_submit_app_feedback must have no defaults';
	end if;
	foreach v_f in array array[
		'armory_submit_app_feedback(text, text, text, text, jsonb, text, text, text)',
		'armory_submit_app_feedback(text, text, text, text, jsonb)',
		'armory_my_app_feedback(integer)',
		'armory_app_feedback_admin_list(integer)'] loop
		if pg_catalog.has_function_privilege('anon', 'public.' || v_f, 'execute') then
			raise exception '0235: anon can execute public.%', v_f;
		end if;
		if not pg_catalog.has_function_privilege('authenticated', 'public.' || v_f, 'execute') then
			raise exception '0235: authenticated cannot execute public.%', v_f;
		end if;
	end loop;
	select count(*) into v_n from pg_catalog.pg_attribute
	where attrelid = 'public.armory_app_feedback'::regclass and attname in ('tried', 'area', 'screenshot_path') and not attisdropped;
	if v_n <> 3 then
		raise exception '0235: expected the three new columns, found %', v_n;
	end if;
	raise notice '0235 armory-feedback-v2: 2 submit overloads (wide has no defaults), my_app_feedback, admin list; 0 executable by anon; 3 columns; kind check takes praise';
end $af$;
