-- ===== PART armory-reports BEGIN =====
-- ---------------------------------------------------------------------------
-- 0233 PART armory-reports: THE WINDOWS APP'S OWN FEEDBACK AND INCIDENT
-- QUEUES (IDEA Armory website requests v0.3, items 4 and 4b).
--
-- WHY TWO TABLES OF THEIR OWN, AND NOT app_feedback. app_feedback is the one
-- queue for every WEBSITE surface. The Windows app sends a different payload:
-- a required app version, the computer's name, up to 8000 characters, a
-- context object (log lines) of at most 128 KiB, and, for an incident, a
-- report of up to 1 MiB that is kept for 90 days. Mr. Pina's v0.3 request
-- names these tables, and they are shown as their own two tabs in the same
-- /admin/feedback console.
--
-- WHO READS. Rows are read by a site admin directly (RLS is_admin(), select
-- granted to authenticated), so the console can fetch a whole incident report
-- by id. Two admin list functions project the rows WITHOUT the report and add
-- the submitter's shown name; the list of incidents also hides anything older
-- than 90 days even before a submit has pruned it.
--
-- WHO WRITES. Only the two submit functions, which take NO identity parameter:
-- the address comes from armory_current_email(). No client role holds any
-- write privilege on either table.
--
-- REFUSALS, the Armory convention (raise with a SQLSTATE and a jsonb DETAIL):
--   42501  not signed in, or not a site admin on an admin function.
--   22023  bad input. DETAIL {reason, field}; too large is reason too_large
--          with limit and size. Never 54000: PostgREST answers class 54 with
--          HTTP 500, which a retrying client reads as transient.
--   PT429  rate limited (20 notes an hour, 30 incidents an hour, per
--          account). DETAIL {reason: rate_limited, limit, window_seconds,
--          retry_after_seconds}. PostgREST maps a PTxyz code to HTTP xyz.
--
-- RETENTION. Every incident submit deletes every incident older than 90 days
-- (Mr. Pina's v0.3 item 4b), inside the function. Feedback notes are kept.
--
-- ONE RUNTIME DEPENDENCY ON PART armory-core: the two admin lists read the
-- shown name through _armory_person, which that part defines. They are
-- plpgsql, so nothing is resolved until they run, and this part applies on
-- its own.
--
-- UNDO, before any client depends on it: drop the six functions and the two
-- tables by hand in the SQL editor (a person's paste, never a migration).
-- ---------------------------------------------------------------------------

create table if not exists public.armory_app_feedback (
	id uuid primary key default gen_random_uuid(),
	created_at timestamptz not null default now(),
	email text not null check (email <> '' and email = lower(btrim(email))),
	device_name text check (device_name is null or char_length(device_name) between 1 and 120),
	app_version text not null check (char_length(app_version) between 1 and 64),
	kind text not null check (kind in ('bug', 'idea', 'other')),
	body text not null check (char_length(body) between 1 and 8000),
	context jsonb not null default '{}'::jsonb
		-- 128 KiB, by pg_column_size. A CHECK sees the value before it is
		-- compressed, so this is the size as sent, the same number the submit
		-- refuses on. The admin list returns context whole, so it stays small.
		check (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 131072),
	status text not null default 'new' check (status in ('new', 'seen', 'resolved', 'spam')),
	reviewed_at timestamptz,
	reviewed_by text,
	constraint armory_app_feedback_id_email_key unique (id, email)
);

create table if not exists public.armory_app_incidents (
	id uuid primary key default gen_random_uuid(),
	created_at timestamptz not null default now(),
	email text not null check (email <> '' and email = lower(btrim(email))),
	device_name text check (device_name is null or char_length(device_name) between 1 and 120),
	app_version text not null check (char_length(app_version) between 1 and 64),
	kind text not null check (kind ~ '^[A-Za-z][A-Za-z0-9_-]{0,39}$'),
	summary text not null check (char_length(summary) between 1 and 500),
	project_id uuid references public.armory_projects (id) on delete set null,
	report jsonb not null default '{}'::jsonb
		check (jsonb_typeof(report) = 'object' and pg_column_size(report) <= 1048576),
	-- The report's size as sent. pg_column_size on the stored row reads the
	-- COMPRESSED size (measured: 12026 bytes for a 1 MiB report), which is not
	-- what the console downloads, so the submit records it.
	report_bytes integer not null default 0 check (report_bytes between 0 and 1048576),
	feedback_id uuid,
	status text not null default 'new' check (status in ('new', 'seen', 'resolved', 'spam')),
	reviewed_at timestamptz,
	reviewed_by text,
	-- An incident may name only its own reporter's feedback note.
	constraint armory_app_incidents_feedback_is_own
		foreign key (feedback_id, email) references public.armory_app_feedback (id, email)
);

create index if not exists armory_app_feedback_email_created_idx
	on public.armory_app_feedback (email, created_at desc);
create index if not exists armory_app_feedback_created_idx
	on public.armory_app_feedback (created_at desc);
create index if not exists armory_app_incidents_email_created_idx
	on public.armory_app_incidents (email, created_at desc);
create index if not exists armory_app_incidents_created_idx
	on public.armory_app_incidents (created_at);
create index if not exists armory_app_incidents_kind_version_idx
	on public.armory_app_incidents (kind, app_version);

-- Revoked BY NAME (the hosted default privileges grant all seven to both
-- client roles), then select alone back to authenticated for the admin read.
revoke all on public.armory_app_feedback, public.armory_app_incidents
	from public, anon, authenticated, service_role;
grant select on public.armory_app_feedback, public.armory_app_incidents to authenticated;

alter table public.armory_app_feedback enable row level security;
alter table public.armory_app_incidents enable row level security;

drop policy if exists armory_app_feedback_admin_read on public.armory_app_feedback;
create policy armory_app_feedback_admin_read on public.armory_app_feedback
	for select to authenticated using (public.is_admin());
drop policy if exists armory_app_incidents_admin_read on public.armory_app_incidents;
create policy armory_app_incidents_admin_read on public.armory_app_incidents
	for select to authenticated using (public.is_admin());

-- A note from the Windows app. Twenty an hour per account; a context of at
-- most 128 KiB (131072 bytes, the size as sent).
create or replace function public.armory_submit_app_feedback(
	p_kind text, p_body text, p_app_version text, p_device_name text, p_context jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $ar$
declare
	e text := public.armory_current_email();
	v_kind text := lower(regexp_replace(coalesce(p_kind, ''), '^\s+|\s+$', '', 'g'));
	v_body text := regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
	v_version text := regexp_replace(coalesce(p_app_version, ''), '^\s+|\s+$', '', 'g');
	v_device text := nullif(left(regexp_replace(coalesce(p_device_name, ''), '^\s+|\s+$', '', 'g'), 120), '');
	v_context jsonb := coalesce(p_context, '{}'::jsonb);
	v_size integer;
	v_recent integer;
	v_oldest timestamptz;
	v_id uuid;
begin
	if v_kind not in ('bug', 'idea', 'other') then
		raise exception 'The kind of note is bug, idea or other.' using errcode = '22023',
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

	-- The capacity check holds a lock on the account, so two notes at once cannot both pass.
	perform pg_advisory_xact_lock(hashtextextended('armory_app_feedback:' || e, 0));
	select count(*), min(created_at) into v_recent, v_oldest from public.armory_app_feedback
	where email = e and created_at > now() - interval '1 hour';
	if v_recent >= 20 then
		raise exception 'Too many feedback notes from this account in the last hour.' using errcode = 'PT429',
			detail = jsonb_build_object('reason', 'rate_limited', 'limit', 20, 'window_seconds', 3600,
				'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 hour' - now())))::int))::text;
	end if;

	insert into public.armory_app_feedback (email, device_name, app_version, kind, body, context)
	values (e, v_device, v_version, v_kind, v_body, v_context)
	returning id into v_id;
	return v_id;
end $ar$;

-- An automatic incident from the Windows app. Thirty an hour per account; a
-- report of at most 1 MiB; every incident older than 90 days is deleted here.
create or replace function public.armory_submit_app_incident(
	p_kind text, p_summary text, p_app_version text, p_device_name text,
	p_project uuid, p_report jsonb, p_feedback uuid
) returns uuid
language plpgsql security definer set search_path = '' as $ar$
declare
	e text := public.armory_current_email();
	v_kind text := regexp_replace(coalesce(p_kind, ''), '^\s+|\s+$', '', 'g');
	v_summary text := regexp_replace(coalesce(p_summary, ''), '^\s+|\s+$', '', 'g');
	v_version text := regexp_replace(coalesce(p_app_version, ''), '^\s+|\s+$', '', 'g');
	v_device text := nullif(left(regexp_replace(coalesce(p_device_name, ''), '^\s+|\s+$', '', 'g'), 120), '');
	v_report jsonb := coalesce(p_report, '{}'::jsonb);
	v_project uuid;
	v_size integer;
	v_recent integer;
	v_oldest timestamptz;
	v_id uuid;
begin
	if v_kind !~ '^[A-Za-z][A-Za-z0-9_-]{0,39}$' then
		raise exception 'The incident kind is a word of letters, digits, dashes and underscores, at most 40.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'kind', 'field', 'kind')::text;
	end if;
	if v_summary = '' then
		raise exception 'The incident has no summary.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'empty', 'field', 'summary')::text;
	end if;
	if char_length(v_summary) > 500 then
		raise exception 'The summary is % characters; the limit is 500.', char_length(v_summary) using errcode = '22023',
			detail = jsonb_build_object('reason', 'too_long', 'field', 'summary', 'limit', 500, 'size', char_length(v_summary))::text;
	end if;
	if v_version = '' or char_length(v_version) > 64 then
		raise exception 'The app version is required, at most 64 characters.' using errcode = '22023',
			detail = jsonb_build_object('reason', case when v_version = '' then 'empty' else 'too_long' end, 'field', 'app_version')::text;
	end if;
	if jsonb_typeof(v_report) is distinct from 'object' then
		raise exception 'The report must be a JSON object.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'not_object', 'field', 'report')::text;
	end if;
	v_size := pg_column_size(v_report);
	if v_size > 1048576 then
		raise exception 'The report is % bytes; the limit is 1048576.', v_size using errcode = '22023',
			detail = jsonb_build_object('reason', 'too_large', 'field', 'report', 'limit', 1048576, 'size', v_size)::text;
	end if;
	-- Not found and not yours answer identically.
	if p_feedback is not null and not exists (
		select 1 from public.armory_app_feedback where id = p_feedback and email = e
	) then
		raise exception 'That feedback note is not one of yours.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'feedback_not_found', 'field', 'feedback')::text;
	end if;

	perform pg_advisory_xact_lock(hashtextextended('armory_app_incidents:' || e, 0));

	-- Mr. Pina's retention: an incident lives 90 days.
	delete from public.armory_app_incidents where created_at < now() - interval '90 days';

	select count(*), min(created_at) into v_recent, v_oldest from public.armory_app_incidents
	where email = e and created_at > now() - interval '1 hour';
	if v_recent >= 30 then
		raise exception 'Too many incident reports from this account in the last hour.' using errcode = 'PT429',
			detail = jsonb_build_object('reason', 'rate_limited', 'limit', 30, 'window_seconds', 3600,
				'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 hour' - now())))::int))::text;
	end if;

	-- A project id that names nothing (purged, or never existed) is kept as
	-- no project, so a stale label never costs the incident. The key share
	-- makes a purge running now wait, or finish first.
	if p_project is not null then
		select id into v_project from public.armory_projects where id = p_project for key share;
	end if;

	insert into public.armory_app_incidents (email, device_name, app_version, kind, summary, project_id, report, report_bytes, feedback_id)
	values (e, v_device, v_version, v_kind, v_summary, v_project, v_report, v_size, p_feedback)
	returning id into v_id;
	return v_id;
end $ar$;

-- The console's list of notes, newest first, with the submitter's shown name.
create or replace function public.armory_app_feedback_admin_list(p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $ar$
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
			'submitter_name', n.name)
			order by r.created_at desc, r.id)
		from picked r left join names n on n.email = r.email
	), '[]'::jsonb);
end $ar$;

-- The console's list of incidents, newest first. It NEVER carries the report
-- (up to 1 MiB a row): report_bytes says how large it was when sent, and the
-- report itself is read by id.
create or replace function public.armory_app_incidents_admin_list(p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $ar$
declare v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 1000);
begin
	if not coalesce(public.is_admin(), false) then
		raise exception 'Only a site admin can read Armory incidents.' using errcode = '42501';
	end if;
	return coalesce((
		with picked as (
			select i.id, i.created_at, i.email, i.device_name, i.app_version, i.kind, i.summary, i.project_id,
				i.feedback_id, i.status, i.reviewed_at, i.reviewed_by, i.report_bytes
			from public.armory_app_incidents i
			where i.created_at >= now() - interval '90 days'
			order by i.created_at desc, i.id limit v_limit
		), names as (
			select x.email, public._armory_person(x.email)->>'name' as name
			from (select distinct picked.email from picked) x
		)
		select jsonb_agg(jsonb_build_object(
			'id', r.id, 'created_at', r.created_at, 'email', r.email, 'device_name', r.device_name,
			'app_version', r.app_version, 'kind', r.kind, 'summary', r.summary, 'project_id', r.project_id,
			'feedback_id', r.feedback_id, 'status', r.status, 'reviewed_at', r.reviewed_at, 'reviewed_by', r.reviewed_by,
			'report_bytes', r.report_bytes, 'project_name', p.name, 'feedback_body', fb.body, 'submitter_name', n.name)
			order by r.created_at desc, r.id)
		from picked r
		left join public.armory_projects p on p.id = r.project_id
		left join public.armory_app_feedback fb on fb.id = r.feedback_id
		left join names n on n.email = r.email
	), '[]'::jsonb);
end $ar$;

-- Status moves, the 0188 shape: admin only, stamps who and when, and a status
-- is never a delete.
create or replace function public.armory_app_feedback_set_status(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $ar$
declare v_status text := lower(regexp_replace(coalesce(p_status, ''), '^\s+|\s+$', '', 'g'));
begin
	if not coalesce(public.is_admin(), false) then
		raise exception 'Only a site admin can triage Armory feedback.' using errcode = '42501';
	end if;
	if v_status not in ('new', 'seen', 'resolved', 'spam') then
		raise exception 'Status must be new, seen, resolved or spam.' using errcode = '22023';
	end if;
	update public.armory_app_feedback
	set status = v_status, reviewed_at = now(), reviewed_by = public.current_user_email()
	where id = p_id;
	if not found then
		raise exception 'That Armory feedback note does not exist.' using errcode = 'P0002';
	end if;
	return jsonb_build_object('ok', true, 'id', p_id, 'status', v_status);
end $ar$;

create or replace function public.armory_app_incident_set_status(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $ar$
declare v_status text := lower(regexp_replace(coalesce(p_status, ''), '^\s+|\s+$', '', 'g'));
begin
	if not coalesce(public.is_admin(), false) then
		raise exception 'Only a site admin can triage Armory incidents.' using errcode = '42501';
	end if;
	if v_status not in ('new', 'seen', 'resolved', 'spam') then
		raise exception 'Status must be new, seen, resolved or spam.' using errcode = '22023';
	end if;
	update public.armory_app_incidents
	set status = v_status, reviewed_at = now(), reviewed_by = public.current_user_email()
	where id = p_id;
	if not found then
		raise exception 'That Armory incident does not exist.' using errcode = 'P0002';
	end if;
	return jsonb_build_object('ok', true, 'id', p_id, 'status', v_status);
end $ar$;

-- Grants, the 0166 shape: revoked from the three client-facing names, then
-- execute back to authenticated. The admin gates are inside the bodies.
revoke all on function
	public.armory_submit_app_feedback(text, text, text, text, jsonb),
	public.armory_submit_app_incident(text, text, text, text, uuid, jsonb, uuid),
	public.armory_app_feedback_admin_list(integer),
	public.armory_app_incidents_admin_list(integer),
	public.armory_app_feedback_set_status(uuid, text),
	public.armory_app_incident_set_status(uuid, text)
from public, anon, authenticated;
grant execute on function
	public.armory_submit_app_feedback(text, text, text, text, jsonb),
	public.armory_submit_app_incident(text, text, text, text, uuid, jsonb, uuid),
	public.armory_app_feedback_admin_list(integer),
	public.armory_app_incidents_admin_list(integer),
	public.armory_app_feedback_set_status(uuid, text),
	public.armory_app_incident_set_status(uuid, text)
to authenticated;

-- Self-check, BY NAME over this part's own objects and nothing else.
do $ar$
declare
	v_tables text[] := array['armory_app_feedback', 'armory_app_incidents'];
	v_functions text[] := array[
		'armory_submit_app_feedback(text, text, text, text, jsonb)',
		'armory_submit_app_incident(text, text, text, text, uuid, jsonb, uuid)',
		'armory_app_feedback_admin_list(integer)',
		'armory_app_incidents_admin_list(integer)',
		'armory_app_feedback_set_status(uuid, text)',
		'armory_app_incident_set_status(uuid, text)'];
	v_privs text[] := array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'];
	v_t text;
	v_f text;
	v_p text;
	v_n integer;
begin
	foreach v_t in array v_tables loop
		if not exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relname = v_t and c.relkind = 'r' and c.relrowsecurity) then
			raise exception '0233 armory-reports: public.% is missing or has RLS off', v_t;
		end if;
		foreach v_p in array v_privs loop
			if pg_catalog.has_table_privilege('anon', 'public.' || v_t, v_p) then
				raise exception '0233 armory-reports: anon holds % on public.%', v_p, v_t;
			end if;
			if v_p <> 'select' and pg_catalog.has_table_privilege('authenticated', 'public.' || v_t, v_p) then
				raise exception '0233 armory-reports: authenticated holds % on public.%', v_p, v_t;
			end if;
		end loop;
		if not pg_catalog.has_table_privilege('authenticated', 'public.' || v_t, 'select') then
			raise exception '0233 armory-reports: authenticated cannot read public.% (the admin read needs it)', v_t;
		end if;
		select count(*) into v_n from pg_catalog.pg_policies where schemaname = 'public' and tablename = v_t;
		if v_n <> 1 then
			raise exception '0233 armory-reports: public.% carries % policies, expected the one admin read', v_t, v_n;
		end if;
	end loop;
	foreach v_f in array v_functions loop
		select count(*) into v_n from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = split_part(v_f, '(', 1);
		if v_n <> 1 then
			raise exception '0233 armory-reports: expected exactly one %, found %', split_part(v_f, '(', 1), v_n;
		end if;
		if pg_catalog.has_function_privilege('anon', 'public.' || v_f, 'execute') then
			raise exception '0233 armory-reports: anon can execute public.%', v_f;
		end if;
		if not pg_catalog.has_function_privilege('authenticated', 'public.' || v_f, 'execute') then
			raise exception '0233 armory-reports: authenticated cannot execute public.%', v_f;
		end if;
	end loop;
	raise notice '0233 armory-reports: % tables with RLS and one admin read each, % functions, 0 executable by anon',
		cardinality(v_tables), cardinality(v_functions);
end
$ar$;
-- ===== PART armory-reports END =====
-- ===== PART armory-core BEGIN =====
-- ---------------------------------------------------------------------------
-- 0233 PART armory-core: IDEA ARMORY v0.3 ON THE SERVER. Items 1, 2, 3, 5 and
-- 6 of the website requests, and the reads the website needs to show a
-- project to a site admin who is not in it.
--
-- WHAT IT ADDS
--   Item 1, live updates: ALREADY SHIPPED by 0231 (the change feed is in the
--     supabase_realtime publication, granted, RLS on, a member policy). This
--     part re-runs 0231's guarded add and prints whether the table is in the
--     publication, so the applied record states it.
--   Item 2, Force check in: armory_break_lock admits a site admin and a null
--     device (the website has no computer); the refusal text is unchanged.
--     armory_my_projects gains can_take_back and stays MEMBERSHIP-ONLY,
--     because the app syncs exactly what it lists.
--   Item 3, Delete forever: armory_purge_project (site admin, archived first,
--     the name typed exactly) and armory_purge_folder (site admin or mentor,
--     removed files only). A project purge cannot write a feed row (the feed's
--     project key and its member RLS die with the project), so it leaves a
--     receipt that armory_project_purged answers from. Stored file contents
--     are content-addressed and shared between files and projects, so only a
--     hash no surviving version names is queued, in armory_orphaned_blobs, for
--     the website's storage sweep (armory_orphans_pending, then a DELETE and a
--     HEAD in storage, then armory_orphans_swept).
--   Item 5, team status: armory_devices.last_seen, app_version and state,
--     armory_heartbeat, armory_team_status.
--   Item 6, the deadlock between a folder operation and a checkout: every
--     per-file writer now takes its project row FOR KEY SHARE before any other
--     row lock, so it queues behind a folder operation or a purge (which take
--     the project FOR UPDATE) instead of crossing it. Measured before this
--     part: a folder rename against a checkout ended in 40P01.
--     armory_lock_files and armory_release_locks batch the single-file calls.
--   The website's reads: armory_can_view (member, or site admin) gates the
--     ten member-read policies and the four read functions, each keeping its
--     own refusal text and SQLSTATE. armory_project_summaries,
--     armory_people_search and armory_purge_preview are new.
--
-- THE IMMUTABILITY EXEMPTION, AND WHY IT HAS TWO HALVES. Versions, side
-- versions and their release rows refuse every UPDATE and DELETE. A purge has
-- to delete them, so the trigger now lets a DELETE through when the row's
-- file carries purging_at AND the deleting role is a member of the table's
-- owner. The second half is not decoration: service_role holds DELETE on these
-- tables (the hosted default privileges, which 0231 did not narrow) and UPDATE
-- on armory_files, so a marker alone could be set and then used by any server
-- holding that key. Inside the security-definer purge the role is the owner.
-- A custom setting was the rejected alternative: any role can set one.
--
-- EVERY FUNCTION THIS PART REPLACES KEEPS ITS SIGNATURE, so no client is
-- ordered against the apply. A 0.2.x Windows app reads exactly the answers it
-- read before, refusal text and SQLSTATE included, except one deliberate
-- change: armory_break_lock with a null device used to refuse 'device is not
-- registered to caller' and now reaches the role check. armory_add_member and
-- armory_remove_member admit a site admin with a mentor's reach (the website
-- offers a site admin the people of every project); every member's call
-- answers exactly as before.
--
-- TRUNCATE. It skips a row-level trigger, so on the three immutable history
-- tables it is a way past armory_refuse_version_mutation that needs neither the
-- marker nor the owner. service_role held it by the hosted default privileges
-- and no app path truncates anything, so this part revokes it there.
--
-- UNDO, before any client depends on it: paste back the 0231 and 0232 bodies
-- of the functions replaced here and the 0231 policy expressions, then drop
-- the new functions and the two new tables by hand. The columns and indexes
-- may stay. A purge itself cannot be undone; that is what it is for.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Columns, indexes and the two new tables.
-- ---------------------------------------------------------------------------

alter table public.armory_devices add column if not exists last_seen timestamptz;
alter table public.armory_devices add column if not exists app_version text
	check (app_version is null or char_length(app_version) between 1 and 40);
-- A word, not a fixed list, so an app release that adds a state is not refused.
-- Known: idle, syncing, offline-soon.
alter table public.armory_devices add column if not exists state text
	check (state is null or state ~ '^[A-Za-z][A-Za-z0-9_-]{0,31}$');
-- Set only inside a purge, on rows deleted in the same transaction.
alter table public.armory_files add column if not exists purging_at timestamptz;

create index if not exists armory_change_feed_project_cursor_idx on public.armory_change_feed (project_id, cursor desc);
create index if not exists armory_versions_file_idx on public.armory_versions (file_id);
create index if not exists armory_side_versions_file_idx on public.armory_side_versions (file_id);
create index if not exists armory_versions_sha_idx on public.armory_versions (content_sha256);
create index if not exists armory_side_versions_sha_idx on public.armory_side_versions (content_sha256);

-- One row per purged project. No member address is kept.
create table if not exists public.armory_purged_projects (
	project_id uuid primary key,
	name text not null,
	purged_at timestamptz not null default now(),
	purged_by text not null,
	counts jsonb not null default '{}'::jsonb
);

-- Stored contents no surviving version names, waiting for the storage sweep.
-- A swept row stays as the record of what was removed; a row whose hash was
-- named again before the sweep is marked kept and never removed.
create table if not exists public.armory_orphaned_blobs (
	content_sha256 text primary key check (content_sha256 ~ '^[0-9a-f]{64}$'),
	byte_length bigint not null default 0 check (byte_length >= 0),
	reason text not null check (reason in ('project_purged', 'folder_purged')),
	queued_by text not null,
	queued_at timestamptz not null default now(),
	swept_at timestamptz,
	kept_at timestamptz
);

revoke all on public.armory_purged_projects, public.armory_orphaned_blobs
	from public, anon, authenticated, service_role;
alter table public.armory_purged_projects enable row level security;
alter table public.armory_orphaned_blobs enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Private helpers: one person projection, one read predicate, the hash
-- questions the purge and the sweep ask.
-- ---------------------------------------------------------------------------

-- The ONE shown-identity projection for Armory: the chosen display name, else
-- the full name (never both); the chosen avatar, and the Google photo only when
-- no avatar was chosen; the pathway. By user id, so a search can call it per
-- row without the email bridge.
create or replace function public._armory_person_of(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $ac$
	select jsonb_build_object(
		'name', coalesce(
			nullif(regexp_replace(coalesce(pr.display_name, ''), '^\s+|\s+$', '', 'g'), ''),
			nullif(regexp_replace(coalesce(pr.full_name, ''), '^\s+|\s+$', '', 'g'), '')),
		'avatar', pr.avatar,
		'avatar_url', case when pr.avatar is null then pr.avatar_url end,
		'pathway', pr.pathway,
		'has_account', true)
	from public.profiles pr
	where pr.id = p_user
$ac$;

-- The same, by address, through the one uuid/email bridge (0094). Null when the
-- address has no account.
create or replace function public._armory_person(p_email text) returns jsonb
language sql stable security definer set search_path = '' as $ac$
	select public._armory_person_of(public._notebook_user_id_for_email(p_email))
$ac$;

-- Who may READ a project on the website: a member, or a site admin. Named in
-- RLS policies, so authenticated holds it. Writes never ask it.
create or replace function public.armory_can_view(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $ac$
	select public.armory_is_member(p_project) or coalesce(public.is_admin(), false)
$ac$;

-- Does any version or side version name this content?
create or replace function public._armory_hash_referenced(p_hash text) returns boolean
language sql stable security definer set search_path = '' as $ac$
	select exists (select 1 from public.armory_versions where content_sha256 = p_hash)
		or exists (select 1 from public.armory_side_versions where content_sha256 = p_hash)
$ac$;

-- The contents of these files that no version or side version of any OTHER
-- file names: exactly what deleting them frees.
create or replace function public._armory_unreferenced_hashes(p_files uuid[])
returns table (content_sha256 text, byte_length bigint)
language sql stable security definer set search_path = '' as $ac$
	select h.content_sha256, max(h.byte_length)::bigint
	from (
		select v.content_sha256, v.byte_length from public.armory_versions v where v.file_id = any(p_files)
		union all
		select s.content_sha256, s.byte_length from public.armory_side_versions s where s.file_id = any(p_files)
	) h
	where not exists (select 1 from public.armory_versions v2
			where v2.content_sha256 = h.content_sha256 and not (v2.file_id = any(p_files)))
		and not exists (select 1 from public.armory_side_versions s2
			where s2.content_sha256 = h.content_sha256 and not (s2.file_id = any(p_files)))
	group by h.content_sha256
$ac$;

-- Files OUTSIDE the set whose immutable history names a version of a file in
-- it (a parent, a tombstone, a current version). Deleting the set would break
-- that history, so the purge refuses instead.
create or replace function public._armory_referenced_elsewhere(p_files uuid[])
returns table (file_id uuid, path text)
language sql stable security definer set search_path = '' as $ac$
	with doomed as (
		select v.id from public.armory_versions v where v.file_id = any(p_files)
	), refs as (
		select s.file_id from public.armory_side_versions s
		where not (s.file_id = any(p_files)) and s.parent_version_id in (select id from doomed)
		union
		select v.file_id from public.armory_versions v
		where not (v.file_id = any(p_files)) and v.parent_version_id in (select id from doomed)
		union
		select t.file_id from public.armory_tombstones t
		where not (t.file_id = any(p_files)) and t.version_id in (select id from doomed)
		union
		select f.id from public.armory_files f
		where not (f.id = any(p_files)) and f.current_version_id in (select id from doomed)
	)
	select f.id, case when f.folder = '' then f.name else f.folder || '/' || f.name end
	from refs r join public.armory_files f on f.id = r.file_id
$ac$;

-- ---------------------------------------------------------------------------
-- 3. The immutability trigger, with the purge exemption (both halves).
-- ---------------------------------------------------------------------------

create or replace function public.armory_refuse_version_mutation() returns trigger
language plpgsql set search_path = '' as $ac$
begin
	if tg_op = 'DELETE'
		and exists (select 1 from pg_catalog.pg_class c
			where c.oid = tg_relid and pg_catalog.pg_has_role(current_user, c.relowner, 'MEMBER'))
		and exists (select 1 from public.armory_files f where f.id = old.file_id and f.purging_at is not null) then
		return old;
	end if;
	raise exception 'Armory versions are immutable' using errcode = '55000';
end $ac$;

-- ---------------------------------------------------------------------------
-- 4. Per-file writers take the project row first (item 6). Each body is the
-- 0231 or 0232 body with only the lines marked 0233 added or changed.
-- ---------------------------------------------------------------------------

create or replace function public.armory_acquire_lock(p_file uuid, p_device uuid, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); p uuid; r jsonb; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_acquire_lock');
	if r is not null then return (r->>'result')::boolean; end if;
	perform public.armory_require_device(p_device);
	select project_id into p from public.armory_files where id = p_file;
	-- 0233: the project row first, then the file again, in case a purge removed it while this waited.
	perform 1 from public.armory_projects where id = p for key share;
	select project_id into p from public.armory_files where id = p_file;
	if e = '' or not public.armory_is_member(p) then raise exception 'not a project member'; end if;
	insert into public.armory_locks(file_id, holder_email, holder_device_id) values (p_file, e, p_device)
	on conflict (file_id) do update set holder_email = excluded.holder_email, holder_device_id = excluded.holder_device_id,
		acquired_at = now(), broken_at = null, broken_by = null, broken_holder_email = null, broken_holder_device_id = null
	where public.armory_locks.broken_at is not null;
	answer := exists(select 1 from public.armory_locks where file_id = p_file and holder_email = e and holder_device_id = p_device and broken_at is null);
	if answer then perform public.armory_add_change(p, 'lock_acquired', p_file, jsonb_build_object('holder', e, 'device_id', p_device)); end if;
	perform public.armory_remember(p_operation, 'armory_acquire_lock', jsonb_build_object('result', answer));
	return answer;
end $ac$;

create or replace function public.armory_release_lock(p_file uuid, p_device uuid, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); p uuid; n int; r jsonb; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_release_lock');
	if r is not null then return (r->>'result')::boolean; end if;
	perform public.armory_require_device(p_device);
	-- 0233: the project is read, and its row taken, before the lock row is touched.
	select project_id into p from public.armory_files where id = p_file;
	perform 1 from public.armory_projects where id = p for key share;
	delete from public.armory_locks where file_id = p_file and holder_email = e and holder_device_id = p_device and broken_at is null;
	get diagnostics n = row_count; answer := n > 0;
	if answer then
		perform public.armory_add_change(p, 'lock_released', p_file, jsonb_build_object('device_id', p_device));
	end if;
	perform public.armory_remember(p_operation, 'armory_release_lock', jsonb_build_object('result', answer));
	return answer;
end $ac$;

create or replace function public.armory_break_lock(p_file uuid, p_device uuid, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); p uuid; n int; r jsonb; answer boolean; old_email text; old_device uuid;
begin
	r := public.armory_replay(p_operation, 'armory_break_lock');
	if r is not null then return (r->>'result')::boolean; end if;
	-- 0233: the website has no computer, so a null device is allowed; a named device must still be the caller's.
	if p_device is not null then perform public.armory_require_device(p_device); end if;
	select project_id into p from public.armory_files where id = p_file;
	perform 1 from public.armory_projects where id = p for key share;
	-- 0233: a site admin may force a check in on any project. The refusal text is 0231's, unchanged.
	if not (coalesce(public.is_admin(), false)
		or exists(select 1 from public.armory_members where project_id = p and email = e and role in ('mentor', 'cad_lead'))) then
		raise exception 'only a mentor or cad_lead may break a lock';
	end if;
	select holder_email, holder_device_id into old_email, old_device from public.armory_locks where file_id = p_file and broken_at is null for update;
	update public.armory_locks set broken_at = now(), broken_by = e, broken_holder_email = holder_email, broken_holder_device_id = holder_device_id
	where file_id = p_file and broken_at is null;
	get diagnostics n = row_count; answer := n > 0;
	if answer then
		perform public.armory_add_change(p, 'lock_broken', p_file, jsonb_build_object('by', e, 'former_holder', old_email, 'former_device_id', old_device));
	end if;
	perform public.armory_remember(p_operation, 'armory_break_lock', jsonb_build_object('result', answer));
	return answer;
end $ac$;

create or replace function public.armory_save_side_version(p_file uuid, p_parent uuid, p_key text, p_hash text, p_bytes bigint, p_reason text, p_device uuid, p_operation uuid) returns uuid
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); p uuid; v uuid; r jsonb;
begin
	r := public.armory_replay(p_operation, 'armory_save_side_version');
	if r is not null then return (r->>'version_id')::uuid; end if;
	perform public.armory_require_device(p_device);
	select project_id into p from public.armory_files where id = p_file;
	-- 0233: the project row first, then the file again, in case a purge removed it while this waited.
	perform 1 from public.armory_projects where id = p for key share;
	select project_id into p from public.armory_files where id = p_file;
	if not public.armory_is_member(p) then raise exception 'not a project member'; end if;
	insert into public.armory_side_versions(file_id, parent_version_id, object_key, content_sha256, byte_length, author_email, reason)
	values (p_file, p_parent, p_key, p_hash, p_bytes, e, p_reason) returning id into v;
	perform public.armory_add_change(p, 'side_version', v, jsonb_build_object('file_id', p_file, 'device_id', p_device));
	perform public.armory_remember(p_operation, 'armory_save_side_version', jsonb_build_object('version_id', v));
	return v;
end $ac$;

create or replace function public.armory_commit_version(p_file uuid, p_parent uuid, p_key text, p_hash text, p_bytes bigint, p_device uuid, p_operation uuid)
returns table(version_id uuid, advanced boolean)
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); f public.armory_files; v uuid; a boolean; r jsonb; p uuid;
begin
	r := public.armory_replay(p_operation, 'armory_commit_version');
	if r is not null then return query select (r->>'version_id')::uuid, (r->>'advanced')::boolean; return; end if;
	perform public.armory_require_device(p_device);
	-- 0233: the project row before the file row.
	select project_id into p from public.armory_files where id = p_file;
	perform 1 from public.armory_projects where id = p for key share;
	select * into f from public.armory_files where id = p_file for update;
	if not found then raise exception 'file not found'; end if;
	if not exists(select 1 from public.armory_locks where file_id = p_file and holder_email = e and holder_device_id = p_device and broken_at is null) then
		insert into public.armory_side_versions(file_id, parent_version_id, object_key, content_sha256, byte_length, author_email, reason)
		values (p_file, p_parent, p_key, p_hash, p_bytes, e, 'caller does not hold lock') returning id into v;
		a := false;
		perform public.armory_add_change(f.project_id, 'side_version', v, jsonb_build_object('file_id', p_file, 'device_id', p_device));
	elsif f.current_version_id is distinct from p_parent then
		insert into public.armory_side_versions(file_id, parent_version_id, object_key, content_sha256, byte_length, author_email, reason)
		values (p_file, p_parent, p_key, p_hash, p_bytes, e, 'stale parent') returning id into v;
		a := false;
		perform public.armory_add_change(f.project_id, 'side_version', v, jsonb_build_object('file_id', p_file, 'device_id', p_device));
	else
		insert into public.armory_versions(file_id, parent_version_id, object_key, content_sha256, byte_length, author_email)
		values (p_file, p_parent, p_key, p_hash, p_bytes, e) returning id into v;
		update public.armory_files set current_version_id = v where id = p_file;
		a := true;
		perform public.armory_add_change(f.project_id, 'version', v, jsonb_build_object('file_id', p_file, 'device_id', p_device));
	end if;
	perform public.armory_remember(p_operation, 'armory_commit_version', jsonb_build_object('version_id', v, 'advanced', a));
	return query select v, a;
end $ac$;

create or replace function public.armory_tombstone(p_file uuid, p_parent uuid, p_device uuid, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); f public.armory_files; r jsonb; answer boolean; p uuid;
begin
	r := public.armory_replay(p_operation, 'armory_tombstone');
	if r is not null then return (r->>'result')::boolean; end if;
	perform public.armory_require_device(p_device);
	-- 0233: the project row before the file row.
	select project_id into p from public.armory_files where id = p_file;
	perform 1 from public.armory_projects where id = p for key share;
	select * into f from public.armory_files where id = p_file for update;
	answer := f.current_version_id is not distinct from p_parent
		and exists(select 1 from public.armory_locks where file_id = p_file and holder_email = e and holder_device_id = p_device and broken_at is null);
	if answer then
		insert into public.armory_tombstones(file_id, version_id, author_email) values (p_file, p_parent, e) on conflict do nothing;
		update public.armory_files set deleted_at = now() where id = p_file;
		perform public.armory_add_change(f.project_id, 'tombstone', p_file, jsonb_build_object('device_id', p_device));
	end if;
	perform public.armory_remember(p_operation, 'armory_tombstone', jsonb_build_object('result', answer));
	return answer;
end $ac$;

create or replace function public.armory_move_file(p_file uuid, p_folder text, p_name text, p_device uuid, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); r jsonb; f public.armory_files; folder_n text; name_n text; answer boolean; p uuid;
begin
	r := public.armory_replay(p_operation, 'armory_move_file');
	if r is not null then return (r->>'result')::boolean; end if;
	perform public.armory_require_device(p_device);
	-- 0233: the project row before the file row.
	select project_id into p from public.armory_files where id = p_file;
	perform 1 from public.armory_projects where id = p for key share;
	select * into f from public.armory_files where id = p_file for update;
	if not found or not public.armory_is_member(f.project_id) then raise exception 'not a project member' using errcode = '42501'; end if;
	folder_n := normalize(coalesce(p_folder, ''), NFC);
	name_n := normalize(coalesce(p_name, ''), NFC);
	if not public.armory_valid_folder(folder_n) then raise exception 'The folder "%" cannot be a Windows folder path.', folder_n using errcode = '22023'; end if;
	if not public.armory_valid_segment(name_n) then raise exception 'The name "%" cannot be a Windows file name.', name_n using errcode = '22023'; end if;
	answer := f.deleted_at is null
		and exists(select 1 from public.armory_locks where file_id = p_file and holder_email = e and holder_device_id = p_device and broken_at is null);
	if answer and (f.folder <> folder_n or f.name <> name_n) then
		perform public.armory_name_taken(f.project_id, name_n, p_file);
		begin
			update public.armory_files set folder = folder_n, name = name_n where id = p_file;
		exception when unique_violation then
			perform public.armory_name_taken(f.project_id, name_n, p_file);
			raise;
		end;
		perform public.armory_add_change(f.project_id, 'file_moved', p_file,
			jsonb_build_object('old_folder', f.folder, 'old_name', f.name, 'folder', folder_n, 'name', name_n, 'device_id', p_device, 'by', e));
	end if;
	perform public.armory_remember(p_operation, 'armory_move_file', jsonb_build_object('result', answer));
	return answer;
end $ac$;

create or replace function public.armory_create_file(p_project uuid, p_folder text, p_name text, p_device uuid, p_operation uuid) returns uuid
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); r jsonb; folder_n text; name_n text; v uuid; dead public.armory_files; holder text;
begin
	r := public.armory_replay(p_operation, 'armory_create_file');
	if r is not null then return (r->>'file_id')::uuid; end if;
	perform public.armory_require_device(p_device);
	if not public.armory_is_member(p_project) then raise exception 'not a project member' using errcode = '42501'; end if;
	-- 0233: the project row before the revival path locks a removed file (which a folder purge also locks).
	perform 1 from public.armory_projects where id = p_project for key share;
	folder_n := normalize(coalesce(p_folder, ''), NFC);
	name_n := normalize(coalesce(p_name, ''), NFC);
	if not public.armory_valid_folder(folder_n) then raise exception 'The folder "%" cannot be a Windows folder path.', folder_n using errcode = '22023'; end if;
	if not public.armory_valid_segment(name_n) then raise exception 'The name "%" cannot be a Windows file name.', name_n using errcode = '22023'; end if;
	-- Serialize creators of one name, so a revival and a concurrent create cannot both win.
	perform pg_advisory_xact_lock(hashtextextended('armory_file_name:' || p_project::text || ':' || lower(name_n), 0));
	perform public.armory_live_name_taken(p_project, name_n, null);
	select * into dead from public.armory_files
	where project_id = p_project and lower(normalize(name, NFC)) = lower(name_n) and deleted_at is not null
	for update;
	if found then
		select holder_email into holder from public.armory_locks where file_id = dead.id and broken_at is null;
		delete from public.armory_locks where file_id = dead.id;
		delete from public.armory_tombstones where file_id = dead.id;
		update public.armory_files set deleted_at = null, folder = folder_n, name = name_n where id = dead.id;
		v := dead.id;
		perform public.armory_add_change(p_project, 'file_revived', v, jsonb_build_object('folder', folder_n, 'name', name_n,
			'old_folder', dead.folder, 'old_name', dead.name, 'released_checkout_of', holder, 'device_id', p_device, 'by', e));
	else
		begin
			insert into public.armory_files(project_id, folder, name) values (p_project, folder_n, name_n) returning id into v;
		exception when unique_violation then
			-- A concurrent creator won; name the folder where its file now lives.
			perform public.armory_name_taken(p_project, name_n, null);
			raise;
		end;
		perform public.armory_add_change(p_project, 'file_created', v, jsonb_build_object('folder', folder_n, 'name', name_n, 'device_id', p_device, 'by', e));
	end if;
	perform public.armory_remember(p_operation, 'armory_create_file', jsonb_build_object('file_id', v));
	return v;
end $ac$;

-- ---------------------------------------------------------------------------
-- 5. A site admin's reach (item 2 and the website's reads). Each body is the
-- 0231 or 0232 body with only the marked lines changed.
-- ---------------------------------------------------------------------------

-- The people of a project. 0231's bodies with only the marked lines changed:
-- a site admin manages any project's members with a mentor's reach, because
-- the website offers them the people search everywhere. Everyone else meets
-- 0231's role check, its text and its SQLSTATE, unchanged.
create or replace function public.armory_add_member(p_project uuid, p_email text, p_role public.armory_member_role, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); r jsonb; caller public.armory_member_role; target text; old public.armory_member_role; mentors int; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_add_member');
	if r is not null then return (r->>'result')::boolean; end if;
	-- Serialize every membership change in a project so the last-mentor rule cannot race.
	perform 1 from public.armory_projects where id = p_project for update;
	-- 0233: a site admin acts as a mentor of any project; a project that does not exist is said so.
	if coalesce(public.is_admin(), false) then
		if not exists (select 1 from public.armory_projects where id = p_project) then
			raise exception 'project not found' using errcode = 'P0002';
		end if;
		caller := 'mentor';
	else
		caller := public.armory_require_role(p_project, array['mentor', 'cad_lead']::public.armory_member_role[], 'only a mentor or CAD lead may add members');
	end if;
	if p_role is null then raise exception 'a role is required' using errcode = '22023'; end if;
	target := lower(btrim(coalesce(p_email, '')));
	if target !~ '^[^@[:space:]]+@[^@[:space:]]+$' then raise exception 'a valid email is required' using errcode = '22023'; end if;
	if p_role in ('mentor', 'cad_lead') and caller <> 'mentor' then raise exception 'only a mentor may grant mentor or cad_lead' using errcode = '42501'; end if;
	select role into old from public.armory_members where project_id = p_project and email = target;
	if old in ('mentor', 'cad_lead') and caller <> 'mentor' then raise exception 'only a mentor may change a mentor or cad_lead' using errcode = '42501'; end if;
	if old = 'mentor' and p_role <> 'mentor' then
		select count(*) into mentors from public.armory_members where project_id = p_project and role = 'mentor';
		if mentors <= 1 then raise exception 'A project always keeps at least one mentor.' using errcode = 'P0001'; end if;
	end if;
	if old is null then
		insert into public.armory_members(project_id, email, role) values (p_project, target, p_role);
		answer := true;
		perform public.armory_add_change(p_project, 'member_added', p_project, jsonb_build_object('email', target, 'role', p_role, 'by', e));
	elsif old <> p_role then
		update public.armory_members set role = p_role where project_id = p_project and email = target;
		answer := true;
		perform public.armory_add_change(p_project, 'member_role_changed', p_project, jsonb_build_object('email', target, 'role', p_role, 'previous_role', old, 'by', e));
	else
		answer := false;
	end if;
	perform public.armory_remember(p_operation, 'armory_add_member', jsonb_build_object('result', answer));
	return answer;
end $ac$;

create or replace function public.armory_remove_member(p_project uuid, p_email text, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); r jsonb; target text; old public.armory_member_role; mentors int; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_remove_member');
	if r is not null then return (r->>'result')::boolean; end if;
	perform 1 from public.armory_projects where id = p_project for update;
	-- 0233: a site admin removes from any project; a project that does not exist is said so.
	if coalesce(public.is_admin(), false) then
		if not exists (select 1 from public.armory_projects where id = p_project) then
			raise exception 'project not found' using errcode = 'P0002';
		end if;
	else
		perform public.armory_require_role(p_project, array['mentor']::public.armory_member_role[], 'only a mentor may remove members');
	end if;
	target := lower(btrim(coalesce(p_email, '')));
	select role into old from public.armory_members where project_id = p_project and email = target;
	if old = 'mentor' then
		select count(*) into mentors from public.armory_members where project_id = p_project and role = 'mentor';
		if mentors <= 1 then raise exception 'A project always keeps at least one mentor.' using errcode = 'P0001'; end if;
	end if;
	answer := old is not null;
	if answer then
		delete from public.armory_members where project_id = p_project and email = target;
		perform public.armory_add_change(p_project, 'member_removed', p_project, jsonb_build_object('email', target, 'role', old, 'by', e));
	end if;
	perform public.armory_remember(p_operation, 'armory_remove_member', jsonb_build_object('result', answer));
	return answer;
end $ac$;

create or replace function public.armory_set_project_archived(p_project uuid, p_archived boolean, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); r jsonb; was timestamptz; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_set_project_archived');
	if r is not null then return (r->>'result')::boolean; end if;
	-- 0233: a site admin may archive or restore any project (a purge needs it archived first).
	if not coalesce(public.is_admin(), false) then
		perform public.armory_require_role(p_project, array['mentor']::public.armory_member_role[], 'only a mentor may archive or restore the project');
	end if;
	if p_archived is null then raise exception 'archived is true or false' using errcode = '22023'; end if;
	select archived_at into was from public.armory_projects where id = p_project for update;
	if not found then raise exception 'project not found' using errcode = 'P0002'; end if;
	answer := (was is not null) <> p_archived;
	if answer then
		update public.armory_projects set archived_at = case when p_archived then now() else null end where id = p_project;
		perform public.armory_add_change(p_project, case when p_archived then 'project_archived' else 'project_restored' end, p_project,
			jsonb_build_object('archived', p_archived, 'by', e));
	end if;
	perform public.armory_remember(p_operation, 'armory_set_project_archived', jsonb_build_object('result', answer));
	return answer;
end $ac$;

-- Membership only: the app syncs exactly the projects this lists.
create or replace function public.armory_my_projects() returns jsonb
language plpgsql stable security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); v_admin boolean := coalesce(public.is_admin(), false);
begin
	return coalesce((
		select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'season', p.season, 'role', m.role,
			'pinned_release', p.pinned_release, 'release_gate', p.release_gate,
			'archived', p.archived_at is not null, 'archived_at', p.archived_at,
			'can_take_back', m.role in ('mentor', 'cad_lead') or v_admin) order by lower(p.name), p.id)
		from public.armory_projects p join public.armory_members m on m.project_id = p.id and m.email = e
	), '[]'::jsonb);
end $ac$;

create or replace function public.armory_project_files(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $ac$
begin
	-- 0233: a member, or a site admin.
	if not public.armory_can_view(p_project) then raise exception 'not a project member' using errcode = '42501'; end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', f.id, 'folder', f.folder, 'name', f.name, 'deleted', f.deleted_at is not null, 'created_at', f.created_at,
			'current', case when v.id is null then null else jsonb_build_object('id', v.id, 'hash', v.content_sha256, 'bytes', v.byte_length,
				'author', v.author_email, 'created_at', v.created_at, 'saved_release', rel.saved_release, 'release_checked', rel.release_checked) end,
			'lock', case when l.file_id is null then null else jsonb_build_object('holder_email', l.holder_email, 'holder_device_id', l.holder_device_id,
				'holder_device_name', d.name, 'acquired_at', l.acquired_at, 'broken_at', l.broken_at, 'broken_by', l.broken_by,
				'broken_holder_email', l.broken_holder_email, 'broken_holder_device_id', l.broken_holder_device_id) end,
			'side_versions', (select count(*) from public.armory_side_versions sv where sv.file_id = f.id))
			order by f.folder, lower(f.name), f.id)
		from public.armory_files f
		left join public.armory_versions v on v.id = f.current_version_id
		left join public.armory_version_releases rel on rel.version_id = v.id
		left join public.armory_locks l on l.file_id = f.id
		left join public.armory_devices d on d.id = l.holder_device_id
		where f.project_id = p_project
	), '[]'::jsonb);
end $ac$;

create or replace function public.armory_file_history(p_file uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $ac$
declare p uuid;
begin
	select project_id into p from public.armory_files where id = p_file;
	-- 0233: a member, or a site admin.
	if p is null or not public.armory_can_view(p) then raise exception 'not a project member' using errcode = '42501'; end if;
	return coalesce((select jsonb_agg(h order by (h->>'created_at')::timestamptz desc, h->>'id') from (
		select jsonb_build_object('id', v.id, 'kind', 'version', 'author', v.author_email, 'created_at', v.created_at, 'bytes', v.byte_length,
			'hash', v.content_sha256, 'parent', v.parent_version_id, 'reason', null, 'saved_release', rel.saved_release, 'release_checked', rel.release_checked) h
		from public.armory_versions v left join public.armory_version_releases rel on rel.version_id = v.id where v.file_id = p_file
		union all
		select jsonb_build_object('id', s.id, 'kind', 'side_version', 'author', s.author_email, 'created_at', s.created_at, 'bytes', s.byte_length,
			'hash', s.content_sha256, 'parent', s.parent_version_id, 'reason', s.reason, 'saved_release', rel.saved_release, 'release_checked', rel.release_checked)
		from public.armory_side_versions s left join public.armory_version_releases rel on rel.version_id = s.id where s.file_id = p_file
		union all
		select jsonb_build_object('id', t.file_id, 'kind', 'tombstone', 'author', t.author_email, 'created_at', t.created_at, 'bytes', 0,
			'hash', null, 'parent', t.version_id, 'reason', null, 'saved_release', null, 'release_checked', null)
		from public.armory_tombstones t where t.file_id = p_file
	) x(h)), '[]'::jsonb);
end $ac$;

-- 0231 raises here with NO errcode (P0001), and an app reads that; it stays so.
create or replace function public.armory_list_changes(p_project uuid, p_after bigint default 0) returns setof public.armory_change_feed
language plpgsql stable security definer set search_path = '' as $ac$
begin
	if not public.armory_can_view(p_project) then raise exception 'not a project member'; end if;
	return query select * from public.armory_change_feed where project_id = p_project and cursor > p_after order by cursor;
end $ac$;

create or replace function public.armory_project_checkouts(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $ac$
begin
	-- 0233: a member, or a site admin; holder_name through the one person projection.
	if not public.armory_can_view(p_project) then raise exception 'not a project member' using errcode = '42501'; end if;
	return coalesce((
		with held as (
			select f.id, f.folder, f.name, l.holder_email, l.acquired_at, d.name as device_name
			from public.armory_files f
			join public.armory_locks l on l.file_id = f.id and l.broken_at is null
			left join public.armory_devices d on d.id = l.holder_device_id
			where f.project_id = p_project and f.deleted_at is null
		), holders as (
			select x.holder_email, public._armory_person(x.holder_email)->>'name' as holder_name
			from (select distinct held.holder_email from held) x
		)
		select jsonb_agg(jsonb_build_object(
			'file_id', h.id, 'folder', h.folder, 'name', h.name, 'holder_email', h.holder_email,
			'holder_name', n.holder_name, 'device_name', h.device_name, 'since', h.acquired_at)
			order by h.acquired_at, h.folder, lower(h.name), h.id)
		from held h left join holders n on n.holder_email = h.holder_email
	), '[]'::jsonb);
end $ac$;

-- The ten member-read policies of 0231 admit armory_can_view. Same names, same
-- roles; only the predicate moves. The devices and receipts policies stay
-- own-row, and armory_connect_codes keeps no policy.
alter policy armory_projects_read on public.armory_projects
	using (public.armory_can_view(id));
alter policy armory_members_read on public.armory_members
	using (public.armory_can_view(project_id));
alter policy armory_files_read on public.armory_files
	using (public.armory_can_view(project_id));
alter policy armory_versions_read on public.armory_versions
	using (exists(select 1 from public.armory_files f where f.id = file_id and public.armory_can_view(f.project_id)));
alter policy armory_side_versions_read on public.armory_side_versions
	using (exists(select 1 from public.armory_files f where f.id = file_id and public.armory_can_view(f.project_id)));
alter policy armory_locks_read on public.armory_locks
	using (exists(select 1 from public.armory_files f where f.id = file_id and public.armory_can_view(f.project_id)));
alter policy armory_tombstones_read on public.armory_tombstones
	using (exists(select 1 from public.armory_files f where f.id = file_id and public.armory_can_view(f.project_id)));
alter policy armory_allocations_read on public.armory_part_number_allocations
	using (public.armory_can_view(project_id));
alter policy armory_changes_read on public.armory_change_feed
	using (public.armory_can_view(project_id));
alter policy armory_version_releases_read on public.armory_version_releases
	using (exists(select 1 from public.armory_files f where f.id = file_id and public.armory_can_view(f.project_id)));

-- ---------------------------------------------------------------------------
-- 6. New reads for the website: summaries, team status, people search.
-- ---------------------------------------------------------------------------

-- Every project the caller is a member of; every project for a site admin, with
-- role null where the admin is not a member. A separate function from
-- armory_my_projects on purpose: that one decides what a computer syncs.
create or replace function public.armory_project_summaries(p_project uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); v_admin boolean := coalesce(public.is_admin(), false);
begin
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', p.id, 'name', p.name, 'season', p.season, 'role', m.role,
			'pinned_release', p.pinned_release, 'release_gate', p.release_gate,
			'archived', p.archived_at is not null, 'archived_at', p.archived_at, 'created_at', p.created_at,
			'files', (select count(*) from public.armory_files f where f.project_id = p.id and f.deleted_at is null),
			'removed', (select count(*) from public.armory_files f where f.project_id = p.id and f.deleted_at is not null),
			'checked_out', (select count(*) from public.armory_files f join public.armory_locks l on l.file_id = f.id and l.broken_at is null
				where f.project_id = p.id and f.deleted_at is null),
			'mine', (select count(*) from public.armory_files f join public.armory_locks l on l.file_id = f.id and l.broken_at is null
				where f.project_id = p.id and f.deleted_at is null and l.holder_email = e),
			'members', (select count(*) from public.armory_members mm where mm.project_id = p.id),
			'versions', (select count(*) from public.armory_versions v join public.armory_files f on f.id = v.file_id where f.project_id = p.id),
			'side_versions', (select count(*) from public.armory_side_versions s join public.armory_files f on f.id = s.file_id where f.project_id = p.id),
			'bytes', st.bytes,
			'stored', st.stored,
			'last_change_at', (select c.created_at from public.armory_change_feed c where c.project_id = p.id order by c.cursor desc limit 1))
			order by lower(p.name), p.id)
		from public.armory_projects p
		left join public.armory_members m on m.project_id = p.id and m.email = e
		cross join lateral (
			select coalesce(sum(b.byte_length), 0)::bigint as bytes, count(*)::int as stored
			from (
				select x.h, max(x.byte_length) as byte_length from (
					select v.content_sha256 as h, v.byte_length from public.armory_versions v
					join public.armory_files f on f.id = v.file_id where f.project_id = p.id
					union all
					select s.content_sha256, s.byte_length from public.armory_side_versions s
					join public.armory_files f on f.id = s.file_id where f.project_id = p.id
				) x group by x.h
			) b
		) st
		where (m.email is not null or v_admin) and (p_project is null or p.id = p_project)
	), '[]'::jsonb);
end $ac$;

-- One entry per member: who they are, which computers have been heard from, and
-- what they have checked out in THIS project. A member with no account carries
-- has_account false and no name or picture.
create or replace function public.armory_team_status(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $ac$
begin
	if not public.armory_can_view(p_project) then raise exception 'not a project member' using errcode = '42501'; end if;
	return coalesce((
		select jsonb_agg(
			jsonb_build_object('email', m.email, 'role', m.role)
			|| coalesce(public._armory_person(m.email), jsonb_build_object('has_account', false))
			|| jsonb_build_object(
				'devices_total', (select count(*) from public.armory_devices d where d.owner_email = m.email),
				'devices', coalesce((
					select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'registered_at', d.registered_at,
						'last_seen', d.last_seen, 'app_version', d.app_version, 'state', d.state)
						order by d.last_seen desc nulls last, d.registered_at desc, d.id)
					from public.armory_devices d
					where d.owner_email = m.email
						and (d.last_seen >= now() - interval '30 days'
							or d.registered_at >= now() - interval '30 days'
							or exists (select 1 from public.armory_locks l join public.armory_files f on f.id = l.file_id
								where l.holder_device_id = d.id and l.broken_at is null
									and f.project_id = p_project and f.deleted_at is null))
				), '[]'::jsonb),
				'checkouts', coalesce((
					select jsonb_agg(jsonb_build_object('file_id', f.id, 'folder', f.folder, 'name', f.name,
						'path', case when f.folder = '' then f.name else f.folder || '/' || f.name end,
						'since', l.acquired_at, 'device_id', l.holder_device_id)
						order by l.acquired_at, f.folder, lower(f.name), f.id)
					from public.armory_locks l join public.armory_files f on f.id = l.file_id
					where f.project_id = p_project and f.deleted_at is null and l.broken_at is null and l.holder_email = m.email
				), '[]'::jsonb))
			order by m.email)
		from public.armory_members m where m.project_id = p_project
	), '[]'::jsonb);
end $ac$;

-- Find a school account to add to a project: a site admin, or a mentor of the
-- project whose own address is a school teacher account. The search is a
-- name-to-address directory of every school account, and a mentor can grant
-- mentor to a student address, so a student holding the mentor role (or a
-- mentor on another domain) is refused and uses Add by email. Matches the SHOWN
-- name and the address's local part, never a full name a display name
-- replaced; returns no account id; at most 25.
create or replace function public.armory_people_search(p_project uuid, p_query text, p_limit integer default 12) returns jsonb
language plpgsql stable security definer set search_path = '' as $ac$
declare
	e text := public.armory_current_email();
	v_q text := lower(regexp_replace(coalesce(p_query, ''), '^\s+|\s+$', '', 'g'));
	v_words text[];
	v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 25);
begin
	if not (coalesce(public.is_admin(), false)
		or (public.role_for_email(e) = 'teacher'
			and exists (select 1 from public.armory_members m where m.project_id = p_project and m.email = e and m.role = 'mentor'))) then
		raise exception 'only a teacher mentor or a site admin may search for people' using errcode = '42501';
	end if;
	if char_length(regexp_replace(v_q, '\s', '', 'g')) < 2 then return '[]'::jsonb; end if;
	v_words := regexp_split_to_array(v_q, '\s+');
	return coalesce((
		select jsonb_agg(jsonb_build_object('email', s.email, 'name', s.j->>'name', 'avatar', s.j->>'avatar',
			'avatar_url', s.j->>'avatar_url', 'pathway', s.j->>'pathway', 'member_role', mm.role)
			order by s.rank, s.sort_name, s.email)
		from (
			select x.email, x.j,
				case when left(x.hay, char_length(v_q)) = v_q or left(x.local_part, char_length(v_q)) = v_q then 0 else 1 end as rank,
				lower(coalesce(x.j->>'name', x.email)) as sort_name
			from (
				select u.email, pj.j, split_part(u.email, '@', 1) as local_part,
					lower(coalesce(pj.j->>'name', '') || ' ' || translate(split_part(u.email, '@', 1), '._-', '   ')
						|| ' ' || split_part(u.email, '@', 1)) as hay
				from (
					select distinct on (lower(btrim(au.email))) lower(btrim(au.email)) as email, au.id
					from auth.users au
					where au.email is not null and btrim(au.email) <> ''
					order by lower(btrim(au.email)), au.id
				) u
				cross join lateral (select public._armory_person_of(u.id) as j) pj
				where pj.j is not null and public.role_for_email(u.email) in ('student', 'teacher')
			) x
			where (select bool_and(strpos(x.hay, w) > 0) from unnest(v_words) w)
			order by rank, sort_name, x.email
			limit v_limit
		) s
		left join public.armory_members mm on mm.project_id = p_project and mm.email = s.email
	), '[]'::jsonb);
end $ac$;

-- ---------------------------------------------------------------------------
-- 7. Liveness and batches.
-- ---------------------------------------------------------------------------

-- The Windows app says it is running. Writes no feed row; a call within 20
-- seconds that changes nothing writes nothing at all. An empty or null version
-- or state keeps what is stored, so a bare liveness ping never erases them.
create or replace function public.armory_heartbeat(p_device uuid, p_app_version text, p_state text) returns void
language plpgsql security definer set search_path = '' as $ac$
declare
	v_version text := nullif(regexp_replace(coalesce(p_app_version, ''), '^\s+|\s+$', '', 'g'), '');
	v_state text := nullif(regexp_replace(coalesce(p_state, ''), '^\s+|\s+$', '', 'g'), '');
begin
	perform public.armory_require_device(p_device);
	if v_version is not null and char_length(v_version) > 40 then
		raise exception 'The app version is at most 40 characters.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'too_long', 'field', 'app_version', 'limit', 40)::text;
	end if;
	if v_state is not null and v_state !~ '^[A-Za-z][A-Za-z0-9_-]{0,31}$' then
		raise exception 'The state is one word.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'state', 'field', 'state')::text;
	end if;
	update public.armory_devices
	set last_seen = now(), app_version = coalesce(v_version, app_version), state = coalesce(v_state, state)
	where id = p_device
		and (last_seen is null or last_seen < now() - interval '20 seconds'
			or (v_version is not null and app_version is distinct from v_version)
			or (v_state is not null and state is distinct from v_state));
end $ac$;

-- Check out many files: armory_acquire_lock per file, in id order (two batches
-- over the same files then take their locks in the same order), one refusal
-- never stopping the rest.
create or replace function public.armory_lock_files(p_files uuid[], p_device uuid, p_operation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $ac$
declare r jsonb; ids uuid[]; f uuid; got boolean; results jsonb := '[]'::jsonb; n_ok int := 0; n_bad int := 0;
begin
	r := public.armory_replay(p_operation, 'armory_lock_files');
	if r is not null then return r; end if;
	perform public.armory_require_device(p_device);
	select array_agg(distinct x order by x) into ids from unnest(coalesce(p_files, '{}'::uuid[])) x where x is not null;
	if ids is null or cardinality(ids) > 500 then
		raise exception 'A batch is 1 to 500 files.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'count', 'total', coalesce(cardinality(ids), 0), 'limit', 500)::text;
	end if;
	foreach f in array ids loop
		begin
			got := public.armory_acquire_lock(f, p_device, public.armory_derived_operation(p_operation, 'lock:' || f::text));
			results := results || jsonb_build_array(jsonb_build_object('file_id', f, 'ok', true, 'acquired', got));
			n_ok := n_ok + 1;
		exception when others then
			results := results || jsonb_build_array(jsonb_build_object('file_id', f, 'ok', false, 'code', sqlstate, 'message', sqlerrm));
			n_bad := n_bad + 1;
		end;
	end loop;
	return public.armory_remember(p_operation, 'armory_lock_files',
		jsonb_build_object('total', cardinality(ids), 'succeeded', n_ok, 'refused', n_bad, 'results', results));
end $ac$;

create or replace function public.armory_release_locks(p_files uuid[], p_device uuid, p_operation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $ac$
declare r jsonb; ids uuid[]; f uuid; got boolean; results jsonb := '[]'::jsonb; n_ok int := 0; n_bad int := 0;
begin
	r := public.armory_replay(p_operation, 'armory_release_locks');
	if r is not null then return r; end if;
	perform public.armory_require_device(p_device);
	select array_agg(distinct x order by x) into ids from unnest(coalesce(p_files, '{}'::uuid[])) x where x is not null;
	if ids is null or cardinality(ids) > 500 then
		raise exception 'A batch is 1 to 500 files.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'count', 'total', coalesce(cardinality(ids), 0), 'limit', 500)::text;
	end if;
	foreach f in array ids loop
		begin
			got := public.armory_release_lock(f, p_device, public.armory_derived_operation(p_operation, 'release:' || f::text));
			results := results || jsonb_build_array(jsonb_build_object('file_id', f, 'ok', true, 'released', got));
			n_ok := n_ok + 1;
		exception when others then
			results := results || jsonb_build_array(jsonb_build_object('file_id', f, 'ok', false, 'code', sqlstate, 'message', sqlerrm));
			n_bad := n_bad + 1;
		end;
	end loop;
	return public.armory_remember(p_operation, 'armory_release_locks',
		jsonb_build_object('total', cardinality(ids), 'succeeded', n_ok, 'refused', n_bad, 'results', results));
end $ac$;

-- ---------------------------------------------------------------------------
-- 8. Delete forever (item 3).
-- ---------------------------------------------------------------------------

-- The one deletion path for a set of files. The caller holds the project row
-- FOR UPDATE and every file in the set FOR UPDATE. Refuses rather than break
-- another file's history; queues only contents nothing else names; then marks
-- the files and deletes their rows in key order.
create or replace function public._armory_purge_files(p_project uuid, p_files uuid[], p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $ac$
declare
	e text := public.armory_current_email();
	v_names text[];
	v_total int;
	n_files int;
	n_versions int;
	n_sides int;
	n_released int;
	n_blobs int;
	n_bytes bigint;
begin
	if p_files is null or cardinality(p_files) = 0 then
		return jsonb_build_object('files', 0, 'versions', 0, 'side_versions', 0, 'checkouts_released', 0, 'blobs_queued', 0, 'bytes_queued', 0);
	end if;
	select array_agg(x.path order by x.path), count(*) into v_names, v_total from public._armory_referenced_elsewhere(p_files) x;
	if v_total > 0 then
		raise exception 'The history of % other file(s) names a version of a file being deleted: %.', v_total, array_to_string(v_names[1:10], ', ')
			using errcode = '55006',
			detail = jsonb_build_object('reason', 'referenced_elsewhere', 'names', to_jsonb(v_names[1:10]), 'total', v_total)::text,
			hint = 'Delete those files first, or ask for the history to be repaired by hand.';
	end if;

	select count(*), coalesce(sum(u.byte_length), 0) into n_blobs, n_bytes from public._armory_unreferenced_hashes(p_files) u;
	insert into public.armory_orphaned_blobs (content_sha256, byte_length, reason, queued_by)
	select u.content_sha256, u.byte_length, p_reason, e from public._armory_unreferenced_hashes(p_files) u
	on conflict (content_sha256) do update set byte_length = excluded.byte_length, reason = excluded.reason,
		queued_by = excluded.queued_by, queued_at = now(), swept_at = null, kept_at = null;

	select count(*) into n_released from public.armory_locks where file_id = any(p_files) and broken_at is null;
	select count(*) into n_versions from public.armory_versions where file_id = any(p_files);
	select count(*) into n_sides from public.armory_side_versions where file_id = any(p_files);

	update public.armory_files set purging_at = now(), current_version_id = null
	where id = any(p_files) and project_id = p_project;
	get diagnostics n_files = row_count;
	if n_files <> cardinality(p_files) then
		raise exception 'armory purge: % of % files belong to the project', n_files, cardinality(p_files);
	end if;
	delete from public.armory_locks where file_id = any(p_files);
	delete from public.armory_tombstones where file_id = any(p_files);
	delete from public.armory_version_releases where file_id = any(p_files);
	delete from public.armory_side_versions where file_id = any(p_files);
	delete from public.armory_versions where file_id = any(p_files);
	delete from public.armory_files where id = any(p_files);

	return jsonb_build_object('files', n_files, 'versions', n_versions, 'side_versions', n_sides,
		'checkouts_released', n_released, 'blobs_queued', n_blobs, 'bytes_queued', n_bytes);
end $ac$;

-- What a purge would cost, in real counts, before the confirm. A null folder
-- previews the whole project (site admin); a folder previews that folder (site
-- admin or mentor). Takes no lock and changes nothing.
create or replace function public.armory_purge_preview(p_project uuid, p_folder text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $ac$
declare
	e text := public.armory_current_email();
	v_admin boolean := coalesce(public.is_admin(), false);
	proj public.armory_projects;
	folder_n text;
	ids uuid[];
	n_live int;
	v_live_names text[];
	n_release int;
	n_block int;
	v_block_names text[];
	n_ref int;
	n_blobs int;
	n_bytes bigint;
	n_versions int;
	n_sides int;
begin
	if p_folder is null then
		if not v_admin then raise exception 'only a site admin may delete an Armory project forever' using errcode = '42501'; end if;
	else
		if not (v_admin or exists (select 1 from public.armory_members where project_id = p_project and email = e and role = 'mentor')) then
			raise exception 'only a mentor or a site admin may delete a removed folder forever' using errcode = '42501';
		end if;
		folder_n := normalize(p_folder, NFC);
		if folder_n = '' or not public.armory_valid_folder(folder_n) then
			raise exception 'The folder "%" cannot be a Windows folder path.', folder_n using errcode = '22023';
		end if;
	end if;
	select * into proj from public.armory_projects where id = p_project;
	if not found then raise exception 'project not found' using errcode = 'P0002'; end if;

	select coalesce(array_agg(f.id), '{}'::uuid[]) into ids from public.armory_files f
	where f.project_id = p_project
		and (folder_n is null or f.folder = folder_n or left(f.folder, length(folder_n) + 1) = folder_n || '/');

	select count(*), (array_agg(case when f.folder = '' then f.name else f.folder || '/' || f.name end
			order by f.folder, lower(f.name)))[1:10]
		into n_live, v_live_names
	from public.armory_files f where f.id = any(ids) and f.deleted_at is null;

	if folder_n is null then
		select count(*) into n_release from public.armory_locks l where l.file_id = any(ids) and l.broken_at is null;
		n_block := 0;
	else
		select count(*) into n_release from public.armory_locks l join public.armory_files f on f.id = l.file_id
		where f.id = any(ids) and l.broken_at is null and f.deleted_at is not null and l.acquired_at <= f.deleted_at;
		select count(*), (array_agg(case when f.folder = '' then f.name else f.folder || '/' || f.name end
				order by f.folder, lower(f.name)))[1:10]
			into n_block, v_block_names
		from public.armory_locks l join public.armory_files f on f.id = l.file_id
		where f.id = any(ids) and l.broken_at is null and f.deleted_at is not null and l.acquired_at > f.deleted_at;
	end if;

	select count(*) into n_ref from public._armory_referenced_elsewhere(ids);
	select count(*), coalesce(sum(u.byte_length), 0) into n_blobs, n_bytes from public._armory_unreferenced_hashes(ids) u;
	select count(*) into n_versions from public.armory_versions where file_id = any(ids);
	select count(*) into n_sides from public.armory_side_versions where file_id = any(ids);

	return jsonb_build_object(
		'name', proj.name, 'folder', folder_n, 'archived', proj.archived_at is not null,
		'files', cardinality(ids), 'live_files', n_live, 'live_names', coalesce(to_jsonb(v_live_names), '[]'::jsonb),
		'versions', n_versions, 'side_versions', n_sides,
		'checkouts', n_release, 'blocking_checkouts', n_block, 'blocking_names', coalesce(to_jsonb(v_block_names), '[]'::jsonb),
		'referenced_elsewhere', n_ref, 'blobs', n_blobs, 'bytes', n_bytes,
		'can_purge', case when folder_n is null then proj.archived_at is not null and n_ref = 0
			else cardinality(ids) > 0 and n_live = 0 and n_block = 0 and n_ref = 0 end);
end $ac$;

-- Delete an archived project and everything in it, forever. Site admin only,
-- and the name typed exactly is the server-side confirm.
create or replace function public.armory_purge_project(p_project uuid, p_confirm_name text, p_operation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); r jsonb; proj public.armory_projects; ids uuid[]; res jsonb;
begin
	r := public.armory_replay(p_operation, 'armory_purge_project');
	if r is not null then return r; end if;
	if not coalesce(public.is_admin(), false) then
		raise exception 'only a site admin may delete an Armory project forever' using errcode = '42501';
	end if;
	select * into proj from public.armory_projects where id = p_project for update;
	if not found then raise exception 'project not found' using errcode = 'P0002'; end if;
	if proj.archived_at is null then
		raise exception 'Archive "%" before deleting it forever.', proj.name using errcode = '55000',
			detail = jsonb_build_object('reason', 'not_archived')::text;
	end if;
	if normalize(coalesce(p_confirm_name, ''), NFC) is distinct from proj.name then
		raise exception 'Type the project name exactly to delete it forever.' using errcode = '22023',
			detail = jsonb_build_object('reason', 'name_mismatch')::text;
	end if;
	perform 1 from public.armory_files where project_id = p_project order by id for update;
	select coalesce(array_agg(id order by id), '{}'::uuid[]) into ids from public.armory_files where project_id = p_project;
	res := public._armory_purge_files(p_project, ids, 'project_purged');
	delete from public.armory_part_number_allocations where project_id = p_project;
	delete from public.armory_change_feed where project_id = p_project;
	delete from public.armory_members where project_id = p_project;
	delete from public.armory_projects where id = p_project;
	res := jsonb_build_object('name', proj.name) || res;
	insert into public.armory_purged_projects (project_id, name, purged_by, counts)
	values (p_project, proj.name, e, res)
	on conflict (project_id) do nothing;
	return public.armory_remember(p_operation, 'armory_purge_project', res);
end $ac$;

-- Delete the REMOVED files at or under a folder, forever. Site admin or a
-- mentor of the project. Refuses while a file there is live, or while someone
-- checked one out after it was removed; the remover's own leftover checkout is
-- released and counted.
create or replace function public.armory_purge_folder(p_project uuid, p_folder text, p_operation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $ac$
declare
	e text := public.armory_current_email();
	r jsonb;
	folder_n text;
	ids uuid[];
	v_names text[];
	v_total int;
	res jsonb;
begin
	r := public.armory_replay(p_operation, 'armory_purge_folder');
	if r is not null then return r; end if;
	if not (coalesce(public.is_admin(), false)
		or exists (select 1 from public.armory_members where project_id = p_project and email = e and role = 'mentor')) then
		raise exception 'only a mentor or a site admin may delete a removed folder forever' using errcode = '42501';
	end if;
	folder_n := normalize(coalesce(p_folder, ''), NFC);
	if folder_n = '' or not public.armory_valid_folder(folder_n) then
		raise exception 'The folder "%" cannot be a Windows folder path.', folder_n using errcode = '22023';
	end if;
	perform 1 from public.armory_projects where id = p_project for update;
	if not found then raise exception 'project not found' using errcode = 'P0002'; end if;
	-- 0232's folder predicate, case-sensitive, every file whether removed or not.
	select array_agg(x.id order by x.folder, lower(x.name), x.id) into ids from (
		select f.id, f.folder, f.name from public.armory_files f
		where f.project_id = p_project and (f.folder = folder_n or left(f.folder, length(folder_n) + 1) = folder_n || '/')
		order by f.folder, lower(f.name), f.id
		for update
	) x;

	select array_agg(case when f.folder = '' then f.name else f.folder || '/' || f.name end order by f.folder, lower(f.name)), count(*)
		into v_names, v_total
	from public.armory_files f where f.id = any(coalesce(ids, '{}'::uuid[])) and f.deleted_at is null;
	if v_total > 0 then
		raise exception 'The folder "%" still has % file(s) in it: %.', folder_n, v_total, array_to_string(v_names[1:10], ', ')
			using errcode = '55006',
			detail = jsonb_build_object('reason', 'live', 'names', to_jsonb(v_names[1:10]), 'total', v_total)::text,
			hint = 'Only removed files can be deleted forever. Remove the folder first.';
	end if;

	select array_agg(case when f.folder = '' then f.name else f.folder || '/' || f.name end order by f.folder, lower(f.name)), count(*)
		into v_names, v_total
	from public.armory_files f join public.armory_locks l on l.file_id = f.id
	where f.id = any(coalesce(ids, '{}'::uuid[])) and l.broken_at is null and l.acquired_at > f.deleted_at;
	if v_total > 0 then
		raise exception 'Someone checked out % removed file(s) in "%": %.', v_total, folder_n, array_to_string(v_names[1:10], ', ')
			using errcode = '55006',
			detail = jsonb_build_object('reason', 'checked_out', 'names', to_jsonb(v_names[1:10]), 'total', v_total)::text,
			hint = 'Ask them to check the files in, or force a check in first.';
	end if;

	if ids is null then
		res := jsonb_build_object('files', 0, 'versions', 0, 'side_versions', 0, 'checkouts_released', 0, 'blobs_queued', 0, 'bytes_queued', 0);
	else
		res := public._armory_purge_files(p_project, ids, 'folder_purged');
		perform public.armory_add_change(p_project, 'folder_purged', p_project,
			jsonb_build_object('folder', folder_n, 'files', cardinality(ids), 'file_ids', to_jsonb(ids), 'by', e));
	end if;
	res := jsonb_build_object('folder', folder_n) || res;
	return public.armory_remember(p_operation, 'armory_purge_folder', res);
end $ac$;

-- When a project the app holds stops answering, it asks this: a time means the
-- project was deleted forever (drop the local copy quietly); null means it is
-- still there and the caller was removed from it.
create or replace function public.armory_project_purged(p_project uuid) returns timestamptz
language plpgsql stable security definer set search_path = '' as $ac$
begin
	perform public.armory_current_email();
	return (select pp.purged_at from public.armory_purged_projects pp where pp.project_id = p_project);
end $ac$;

-- ---------------------------------------------------------------------------
-- 9. The storage sweep queue. Site admin only. The website lists pending
-- hashes, removes each object from storage, confirms it is gone, then marks it
-- swept. A hash that a version names again is never listed.
-- ---------------------------------------------------------------------------

create or replace function public.armory_orphans_count() returns integer
language plpgsql stable security definer set search_path = '' as $ac$
begin
	if not coalesce(public.is_admin(), false) then
		raise exception 'only a site admin may clean up Armory storage' using errcode = '42501';
	end if;
	return (select count(*)::int from public.armory_orphaned_blobs o
		where o.swept_at is null and o.kept_at is null and not public._armory_hash_referenced(o.content_sha256));
end $ac$;

create or replace function public.armory_orphans_pending(p_limit integer default 200) returns text[]
language plpgsql security definer set search_path = '' as $ac$
declare v_limit integer := least(greatest(coalesce(p_limit, 200), 0), 1000);
begin
	if not coalesce(public.is_admin(), false) then
		raise exception 'only a site admin may clean up Armory storage' using errcode = '42501';
	end if;
	update public.armory_orphaned_blobs set kept_at = now()
	where swept_at is null and kept_at is null and public._armory_hash_referenced(content_sha256);
	return coalesce((
		select array_agg(q.content_sha256 order by q.queued_at, q.content_sha256) from (
			select o.content_sha256, o.queued_at from public.armory_orphaned_blobs o
			where o.swept_at is null and o.kept_at is null
			order by o.queued_at, o.content_sha256
			limit v_limit
		) q
	), '{}'::text[]);
end $ac$;

create or replace function public.armory_orphans_swept(p_hashes text[]) returns integer
language plpgsql security definer set search_path = '' as $ac$
declare v_again text[]; n int;
begin
	if not coalesce(public.is_admin(), false) then
		raise exception 'only a site admin may clean up Armory storage' using errcode = '42501';
	end if;
	-- Named again between the listing and now: kept, and said loudly, because the
	-- website may already have removed the object a version now needs.
	with again as (
		update public.armory_orphaned_blobs set kept_at = now()
		where content_sha256 = any(coalesce(p_hashes, '{}'::text[])) and swept_at is null and kept_at is null
			and public._armory_hash_referenced(content_sha256)
		returning content_sha256
	)
	select array_agg(again.content_sha256) into v_again from again;
	if v_again is not null then
		raise warning 'armory: % stored file(s) were named by a version again after they were listed for removal: %',
			cardinality(v_again), array_to_string(v_again, ', ');
	end if;
	update public.armory_orphaned_blobs set swept_at = now()
	where content_sha256 = any(coalesce(p_hashes, '{}'::text[])) and swept_at is null and kept_at is null;
	get diagnostics n = row_count;
	return n;
end $ac$;

-- ---------------------------------------------------------------------------
-- 10. Item 1: the change feed in the realtime publication (0231's guarded add,
-- re-run), and a notice saying where it stands.
-- ---------------------------------------------------------------------------

do $ac$
declare v_state text;
begin
	if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
		if not exists (
			select 1 from pg_catalog.pg_publication_tables
			where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'armory_change_feed'
		) then
			alter publication supabase_realtime add table public.armory_change_feed;
			v_state := 'yes, added now';
		else
			v_state := 'yes, already';
		end if;
	else
		v_state := 'no publication on this database';
	end if;
	raise notice '0233 armory-core: armory_change_feed in supabase_realtime: %', v_state;
end
$ac$;

-- ---------------------------------------------------------------------------
-- 11. Grants, the 0166 shape: revoked from public, anon and authenticated BY
-- NAME, then execute back to authenticated where a client calls it.
-- ---------------------------------------------------------------------------

-- Private: called only from inside the definer functions above, or a trigger.
-- service_role is named too, unlike 0231's helpers: _armory_purge_files runs as
-- the owner, so it is the one path past the immutability trigger, and the hosted
-- default privileges would otherwise hand it to any server holding that key,
-- around the purge's admin gate.
revoke all on function
	public._armory_person_of(uuid),
	public._armory_person(text),
	public._armory_hash_referenced(text),
	public._armory_unreferenced_hashes(uuid[]),
	public._armory_referenced_elsewhere(uuid[]),
	public._armory_purge_files(uuid, uuid[], text)
from public, anon, authenticated, service_role;
revoke all on function public.armory_refuse_version_mutation() from public, anon, authenticated;

-- TRUNCATE skips the row-level immutability trigger, so on the three history
-- tables it would empty a project's history with no marker and no owner test.
-- service_role held it by the hosted default privileges and no app path uses
-- it. The owner keeps it, as an owner always does.
revoke truncate on public.armory_versions, public.armory_side_versions, public.armory_version_releases
	from service_role;

-- Named inside RLS policies, so evaluated as the querying role.
revoke all on function public.armory_can_view(uuid) from public, anon, authenticated;
grant execute on function public.armory_can_view(uuid) to authenticated;

revoke all on function
	public.armory_acquire_lock(uuid, uuid, uuid),
	public.armory_release_lock(uuid, uuid, uuid),
	public.armory_break_lock(uuid, uuid, uuid),
	public.armory_save_side_version(uuid, uuid, text, text, bigint, text, uuid, uuid),
	public.armory_commit_version(uuid, uuid, text, text, bigint, uuid, uuid),
	public.armory_tombstone(uuid, uuid, uuid, uuid),
	public.armory_move_file(uuid, text, text, uuid, uuid),
	public.armory_create_file(uuid, text, text, uuid, uuid),
	public.armory_add_member(uuid, text, public.armory_member_role, uuid),
	public.armory_remove_member(uuid, text, uuid),
	public.armory_set_project_archived(uuid, boolean, uuid),
	public.armory_my_projects(),
	public.armory_project_files(uuid),
	public.armory_file_history(uuid),
	public.armory_list_changes(uuid, bigint),
	public.armory_project_checkouts(uuid),
	public.armory_project_summaries(uuid),
	public.armory_team_status(uuid),
	public.armory_people_search(uuid, text, integer),
	public.armory_heartbeat(uuid, text, text),
	public.armory_lock_files(uuid[], uuid, uuid),
	public.armory_release_locks(uuid[], uuid, uuid),
	public.armory_purge_preview(uuid, text),
	public.armory_purge_project(uuid, text, uuid),
	public.armory_purge_folder(uuid, text, uuid),
	public.armory_project_purged(uuid),
	public.armory_orphans_count(),
	public.armory_orphans_pending(integer),
	public.armory_orphans_swept(text[])
from public, anon, authenticated;
grant execute on function
	public.armory_acquire_lock(uuid, uuid, uuid),
	public.armory_release_lock(uuid, uuid, uuid),
	public.armory_break_lock(uuid, uuid, uuid),
	public.armory_save_side_version(uuid, uuid, text, text, bigint, text, uuid, uuid),
	public.armory_commit_version(uuid, uuid, text, text, bigint, uuid, uuid),
	public.armory_tombstone(uuid, uuid, uuid, uuid),
	public.armory_move_file(uuid, text, text, uuid, uuid),
	public.armory_create_file(uuid, text, text, uuid, uuid),
	public.armory_add_member(uuid, text, public.armory_member_role, uuid),
	public.armory_remove_member(uuid, text, uuid),
	public.armory_set_project_archived(uuid, boolean, uuid),
	public.armory_my_projects(),
	public.armory_project_files(uuid),
	public.armory_file_history(uuid),
	public.armory_list_changes(uuid, bigint),
	public.armory_project_checkouts(uuid),
	public.armory_project_summaries(uuid),
	public.armory_team_status(uuid),
	public.armory_people_search(uuid, text, integer),
	public.armory_heartbeat(uuid, text, text),
	public.armory_lock_files(uuid[], uuid, uuid),
	public.armory_release_locks(uuid[], uuid, uuid),
	public.armory_purge_preview(uuid, text),
	public.armory_purge_project(uuid, text, uuid),
	public.armory_purge_folder(uuid, text, uuid),
	public.armory_project_purged(uuid),
	public.armory_orphans_count(),
	public.armory_orphans_pending(integer),
	public.armory_orphans_swept(text[])
to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Self-check, BY NAME over this part's own objects and nothing else.
-- ---------------------------------------------------------------------------

do $ac$
declare
	v_private text[] := array[
		'_armory_person_of(uuid)', '_armory_person(text)', '_armory_hash_referenced(text)',
		'_armory_unreferenced_hashes(uuid[])', '_armory_referenced_elsewhere(uuid[])',
		'_armory_purge_files(uuid, uuid[], text)', 'armory_refuse_version_mutation()'];
	v_client text[] := array[
		'armory_can_view(uuid)',
		'armory_acquire_lock(uuid, uuid, uuid)', 'armory_release_lock(uuid, uuid, uuid)', 'armory_break_lock(uuid, uuid, uuid)',
		'armory_save_side_version(uuid, uuid, text, text, bigint, text, uuid, uuid)',
		'armory_commit_version(uuid, uuid, text, text, bigint, uuid, uuid)', 'armory_tombstone(uuid, uuid, uuid, uuid)',
		'armory_move_file(uuid, text, text, uuid, uuid)', 'armory_create_file(uuid, text, text, uuid, uuid)',
		'armory_add_member(uuid, text, public.armory_member_role, uuid)', 'armory_remove_member(uuid, text, uuid)',
		'armory_set_project_archived(uuid, boolean, uuid)', 'armory_my_projects()', 'armory_project_files(uuid)',
		'armory_file_history(uuid)', 'armory_list_changes(uuid, bigint)', 'armory_project_checkouts(uuid)',
		'armory_project_summaries(uuid)', 'armory_team_status(uuid)', 'armory_people_search(uuid, text, integer)',
		'armory_heartbeat(uuid, text, text)', 'armory_lock_files(uuid[], uuid, uuid)', 'armory_release_locks(uuid[], uuid, uuid)',
		'armory_purge_preview(uuid, text)', 'armory_purge_project(uuid, text, uuid)', 'armory_purge_folder(uuid, text, uuid)',
		'armory_project_purged(uuid)', 'armory_orphans_count()', 'armory_orphans_pending(integer)', 'armory_orphans_swept(text[])'];
	v_policies text[] := array['armory_projects_read', 'armory_members_read', 'armory_files_read', 'armory_versions_read',
		'armory_side_versions_read', 'armory_locks_read', 'armory_tombstones_read', 'armory_allocations_read',
		'armory_changes_read', 'armory_version_releases_read'];
	v_privs text[] := array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'];
	v_f text;
	v_t text;
	v_p text;
	v_n integer;
begin
	foreach v_f in array v_private || v_client loop
		select count(*) into v_n from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = split_part(v_f, '(', 1);
		if v_n <> 1 then
			raise exception '0233 armory-core: expected exactly one %, found %', split_part(v_f, '(', 1), v_n;
		end if;
		if pg_catalog.has_function_privilege('anon', 'public.' || v_f, 'execute') then
			raise exception '0233 armory-core: anon can execute public.%', v_f;
		end if;
	end loop;
	foreach v_f in array v_private loop
		if pg_catalog.has_function_privilege('authenticated', 'public.' || v_f, 'execute') then
			raise exception '0233 armory-core: authenticated can execute the private public.%', v_f;
		end if;
		if v_f like '\_armory%' and pg_catalog.has_function_privilege('service_role', 'public.' || v_f, 'execute') then
			raise exception '0233 armory-core: service_role can execute the private public.%', v_f;
		end if;
	end loop;
	foreach v_f in array v_client loop
		if not pg_catalog.has_function_privilege('authenticated', 'public.' || v_f, 'execute') then
			raise exception '0233 armory-core: authenticated cannot execute public.%', v_f;
		end if;
	end loop;

	foreach v_t in array array['armory_purged_projects', 'armory_orphaned_blobs'] loop
		if not exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relname = v_t and c.relkind = 'r' and c.relrowsecurity) then
			raise exception '0233 armory-core: public.% is missing or has RLS off', v_t;
		end if;
		foreach v_p in array v_privs loop
			if pg_catalog.has_table_privilege('anon', 'public.' || v_t, v_p)
				or pg_catalog.has_table_privilege('authenticated', 'public.' || v_t, v_p) then
				raise exception '0233 armory-core: a client role holds % on public.%', v_p, v_t;
			end if;
		end loop;
		if exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = v_t) then
			raise exception '0233 armory-core: public.% carries a policy', v_t;
		end if;
	end loop;

	foreach v_p in array v_policies loop
		if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and policyname = v_p
			and qual like '%armory_can_view%' and qual not like '%armory_is_member%') then
			raise exception '0233 armory-core: policy % does not read armory_can_view', v_p;
		end if;
	end loop;

	foreach v_t in array array['armory_versions', 'armory_side_versions', 'armory_version_releases'] loop
		if pg_catalog.has_table_privilege('service_role', 'public.' || v_t, 'truncate') then
			raise exception '0233 armory-core: service_role holds truncate on public.%', v_t;
		end if;
	end loop;

	select count(*) into v_n from pg_catalog.pg_attribute a
	where not a.attisdropped and a.attnum > 0 and (
		(a.attrelid = 'public.armory_devices'::regclass and a.attname in ('last_seen', 'app_version', 'state'))
		or (a.attrelid = 'public.armory_files'::regclass and a.attname = 'purging_at'));
	if v_n <> 4 then
		raise exception '0233 armory-core: expected 4 new columns, found %', v_n;
	end if;

	-- The purge deletes through the immutability trigger only if the function's
	-- owner is a member of each history table's owner. Refuse rather than ship a
	-- purge that would always answer 55000.
	select count(*) into v_n from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	cross join (values ('public.armory_versions'::regclass), ('public.armory_side_versions'::regclass),
		('public.armory_version_releases'::regclass)) t(rel)
	join pg_catalog.pg_class c on c.oid = t.rel
	where n.nspname = 'public' and p.proname = '_armory_purge_files'
		and pg_catalog.pg_has_role(p.proowner, c.relowner, 'MEMBER');
	if v_n <> 3 then
		raise exception '0233 armory-core: the purge function''s owner is not a member of all three history tables'' owners (% of 3)', v_n;
	end if;

	raise notice '0233 armory-core: % client functions and % private, 0 executable by anon; 2 tables with RLS and no policy; 10 read policies on armory_can_view; 4 columns; 0 of 3 history tables truncatable by service_role',
		cardinality(v_client), cardinality(v_private);
end
$ac$;
-- ===== PART armory-core END =====
