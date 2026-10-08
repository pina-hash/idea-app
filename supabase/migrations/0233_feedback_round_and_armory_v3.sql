-- ---------------------------------------------------------------------------
-- 0233  THE 2026-10-07 FEEDBACK ROUND AND IDEA ARMORY v0.3 (ledger 0368).
--
-- ONE additive migration in six parts, each between its own BEGIN and END
-- markers and each closed by its own self-check over its own objects by name:
--
--   armory-reports    the Windows app's feedback notes and incident reports
--   armory-core       Armory v0.3: admin Force check in, Delete forever with
--                     the orphaned-storage queue, team status and heartbeat,
--                     batch locks, project-row-first lock order, the website
--                     read predicate armory_can_view, people search, summaries
--   feedback-edits    an admin's numbered corrections of a filed report
--   student-overview  one student in one class, for a manager of that class
--   quick-posts       4000-character notices that carry pictures and files
--   foundry-major     an admin marks a Foundry app a major release
--
-- The first object this file creates is the armory_app_feedback table, and
-- that is deliberate: the deploy probe derives 0233's applied-state check from
-- the first object, and it must be one no earlier migration made.
--
-- migrate.yml applies this file on the push that deploys the client, so every
-- surface that reads a new column or function degrades on PGRST202, 42883 and
-- 42703 until it has applied. Undo, before any client depends on it: each part
-- names what undoes it in its own header.
-- ---------------------------------------------------------------------------

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

-- ===== PART feedback-edits BEGIN =====
-- ===========================================================================
-- PART 30. FEEDBACK EDITS (report d362bfb3, Mr. Pina, 2026-10-07; decision D2
-- of the round: site admins only; kind, message and what-you-tried; every edit
-- a numbered revision; the reporter's original stays and is one tap away).
--
-- WHAT THIS DOES NOT DO IS THE POINT OF IT. 0053 made app_feedback an
-- append-only log on purpose ("a truer record than a silently edited one"),
-- and CLAUDE.md lists it among the tables where editing INSERTS a superseding
-- row. So the reporter's own columns (kind, message, tried, meta) are never
-- updated by anything here. A correction is a ROW in app_feedback_edits keyed
-- (feedback_id, revision); the latest one is projected beside the original by
-- the console read, and the console, the exports and the round digest read the
-- latest through one reader each (rowMessage, rowKind and rowTried in
-- src/lib/feedback/console.ts).
--
-- THE CHECKS USE THE REGEX OPERATOR AND NO FUNCTION, so the CHECK-runs-as-the-
-- writing-role trap (0131) cannot open: there is no predicate to grant.
--
-- WHAT UNDOES IT, by hand in the SQL editor: drop the function
-- public.app_feedback_edit(uuid, text, text, text, integer) and the table
-- public.app_feedback_edits, then re-paste 0230's definition of the wide
-- app_feedback_admin_list(text, integer, text) to put the list back without
-- the edit key. No existing row is changed by this part.
-- ===========================================================================

create table if not exists public.app_feedback_edits (
	feedback_id uuid not null references public.app_feedback (id) on delete cascade,
	revision integer not null,
	kind text not null,
	message text not null,
	tried text,
	edited_by text not null,
	edited_at timestamptz not null default now(),
	constraint app_feedback_edits_pkey primary key (feedback_id, revision),
	constraint app_feedback_edits_revision_positive check (revision >= 1),
	constraint app_feedback_edits_kind check (kind in ('bug', 'idea', 'praise', 'other')),
	-- A blank of newlines and tabs is empty to the admin who typed it, which is
	-- why this is the regex and not a btrim length (CLAUDE.md, SQL traps).
	constraint app_feedback_edits_message_shape check (message ~ '\S' and char_length(message) <= 2000),
	constraint app_feedback_edits_tried_shape check (tried is null or (tried ~ '\S' and char_length(tried) <= 1000)),
	constraint app_feedback_edits_editor check (edited_by <> '')
);

-- NO POLICY AND NO CLIENT GRANT. Nothing reads this table but the definer
-- console read below and nothing writes it but app_feedback_edit, so either
-- missing piece denies on its own.
alter table public.app_feedback_edits enable row level security;
revoke all on table public.app_feedback_edits from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The one writer. Structured refusals for what an admin can fix in the form;
-- raises for misuse (no session, not an admin, no such report).
-- ---------------------------------------------------------------------------
create or replace function public.app_feedback_edit(
	p_id uuid,
	p_kind text,
	p_message text,
	p_tried text,
	p_base_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fe$
declare
	v_kind text := lower(public._app_feedback_trim(p_kind));
	v_message text := public._app_feedback_trim(p_message);
	v_tried text := nullif(public._app_feedback_trim(p_tried), '');
	v_row public.app_feedback%rowtype;
	v_rev integer;
	v_cur_kind text;
	v_cur_message text;
	v_cur_tried text;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can edit feedback.';
	end if;

	-- THE ROW LOCK SERIALIZES TWO ADMINS EDITING ONE REPORT, so the revision
	-- read below is the one the insert follows. The primary key is the backstop.
	select * into v_row from public.app_feedback f where f.id = p_id for update;
	if not found then
		raise exception 'That feedback does not exist.';
	end if;

	if v_kind not in ('bug', 'idea', 'praise', 'other') then
		return jsonb_build_object('ok', false, 'reason', 'kind');
	end if;
	if v_message = '' then
		return jsonb_build_object('ok', false, 'reason', 'empty');
	end if;
	if char_length(v_message) > public._app_feedback_message_max() then
		return jsonb_build_object('ok', false, 'reason', 'too_long', 'max', public._app_feedback_message_max());
	end if;
	if v_tried is not null and char_length(v_tried) > public._app_feedback_tried_max() then
		return jsonb_build_object('ok', false, 'reason', 'tried_too_long', 'max', public._app_feedback_tried_max());
	end if;

	-- WHAT THE REPORT SAYS NOW: the latest revision, else the reporter's own
	-- words at revision 0, read the way the console reads them (the column,
	-- then the meta blob a pre-0170 path left the answer in).
	select e.revision, e.kind, e.message, e.tried
	into v_rev, v_cur_kind, v_cur_message, v_cur_tried
	from public.app_feedback_edits e
	where e.feedback_id = p_id
	order by e.revision desc
	limit 1;
	if not found then
		v_rev := 0;
		v_cur_kind := v_row.kind;
		v_cur_message := public._app_feedback_trim(v_row.message);
		v_cur_tried := coalesce(
			nullif(public._app_feedback_trim(v_row.tried), ''),
			nullif(public._app_feedback_trim(v_row.meta ->> 'tried'), '')
		);
	end if;

	-- A SAVE THAT CHANGES NOTHING STAMPS NOTHING, whatever revision the form
	-- was opened on. Asked BEFORE the staleness test on purpose: a retry of a
	-- save whose answer was lost on the way back finds its own words already
	-- there and is told so, rather than being told somebody else got in first.
	if v_kind is not distinct from v_cur_kind
		and v_message is not distinct from v_cur_message
		and v_tried is not distinct from v_cur_tried then
		return jsonb_build_object('ok', true, 'changed', false, 'id', p_id, 'revision', v_rev);
	end if;

	-- SOMEBODY ELSE SAVED FIRST. The form was opened on an older revision, so
	-- writing over it would discard their correction without anyone seeing it.
	if p_base_revision is distinct from v_rev then
		return jsonb_build_object('ok', false, 'reason', 'stale', 'revision', v_rev);
	end if;

	insert into public.app_feedback_edits (feedback_id, revision, kind, message, tried, edited_by)
	values (p_id, v_rev + 1, v_kind, v_message, v_tried, public.current_user_email());

	return jsonb_build_object('ok', true, 'changed', true, 'id', p_id, 'revision', v_rev + 1);
end;
$fe$;

revoke all on function public.app_feedback_edit(uuid, text, text, text, integer)
	from public, anon, authenticated, service_role;
grant execute on function public.app_feedback_edit(uuid, text, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- The console read, the WIDE form, replaced at its own signature (same three
-- parameter names, still NO defaults, still jsonb), so the narrow two-argument
-- wrapper 0230 left standing delegates to it unchanged and inherits the key.
-- Its body is 0230's verbatim plus the lateral read of the latest revision.
-- EVERY ROW CARRIES `edit`, null when never edited: the key's presence is the
-- client's proof that this part is applied, which is what licenses the Edit
-- control. message, kind and tried stay the reporter's own.
-- ---------------------------------------------------------------------------
create or replace function public.app_feedback_admin_list(p_app text, p_limit integer, p_horizon text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fe$
declare
	v_app text := nullif(btrim(coalesce(p_app, '')), '');
	v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
	v_h text := nullif(lower(btrim(coalesce(p_horizon, ''))), '');
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can read the feedback queue.';
	end if;
	if v_h is not null and v_h not in ('now', 'long_term') then
		raise exception 'Horizon must be now or long_term.';
	end if;

	return coalesce((
		select jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc)
		from (
			select f.id, f.app, f.context, f.kind, f.message, f.meta,
				f.status, f.created_at, f.reviewed_at, f.reviewed_by,
				-- Stated, not inferred (0127).
				(f.user_id is null) as anonymous,
				-- What somebody typed, never a verified identity (0127).
				f.contact,
				-- 0170: what they tried, and the key of the one screenshot.
				f.tried,
				f.screenshot_path,
				-- 0230: fold in soon, or a big idea for later.
				f.horizon,
				case when f.user_id is null then null else
					coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''),
						split_part(coalesce(p.email, ''), '@', 1))
				end as submitter_name,
				case when f.user_id is null then null else p.email end as submitter_email,
				-- 0233: an admin's correction, the latest revision, or null.
				case when le.revision is null then null else
					jsonb_build_object(
						'revision', le.revision,
						'kind', le.kind,
						'message', le.message,
						'tried', le.tried,
						'edited_by', le.edited_by,
						'edited_at', le.edited_at
					)
				end as edit
			from public.app_feedback f
			left join public.profiles p on p.id = f.user_id
			left join lateral (
				select e.revision, e.kind, e.message, e.tried, e.edited_by, e.edited_at
				from public.app_feedback_edits e
				where e.feedback_id = f.id
				order by e.revision desc
				limit 1
			) le on true
			where (v_app is null or f.app = v_app)
				and (v_h is null or f.horizon = v_h)
			order by f.created_at desc
			limit v_limit
		) t
	), '[]'::jsonb);
end;
$fe$;

revoke all on function public.app_feedback_admin_list(text, integer, text)
	from public, anon, authenticated, service_role;
grant execute on function public.app_feedback_admin_list(text, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The part's own self-check, BY NAME over its own objects and nothing else.
-- ---------------------------------------------------------------------------
do $fe$
declare
	v_rls boolean;
	v_policies integer;
	v_overloads integer;
	v_priv text;
	v_role text;
	v_src text;
begin
	select c.relrowsecurity into v_rls
	from pg_catalog.pg_class c
	join pg_catalog.pg_namespace n on n.oid = c.relnamespace
	where n.nspname = 'public' and c.relname = 'app_feedback_edits' and c.relkind = 'r';
	if v_rls is null then
		raise exception '0233 feedback-edits: table public.app_feedback_edits is missing.';
	end if;
	if not v_rls then
		raise exception '0233 feedback-edits: public.app_feedback_edits does not have row level security enabled.';
	end if;

	select count(*) into v_policies
	from pg_catalog.pg_policies p
	where p.schemaname = 'public' and p.tablename = 'app_feedback_edits';
	if v_policies <> 0 then
		raise exception '0233 feedback-edits: public.app_feedback_edits carries % policy/policies; it must have none.', v_policies;
	end if;

	foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
		foreach v_priv in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
			if has_table_privilege(v_role, 'public.app_feedback_edits', v_priv) then
				raise exception '0233 feedback-edits: % holds % on public.app_feedback_edits; the revoke must name the roles.', v_role, v_priv;
			end if;
		end loop;
	end loop;

	select count(*) into v_overloads
	from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'app_feedback_edit';
	if v_overloads <> 1 then
		raise exception '0233 feedback-edits: app_feedback_edit has % overloads; it must have exactly one.', v_overloads;
	end if;
	if has_function_privilege('anon', 'public.app_feedback_edit(uuid, text, text, text, integer)', 'execute') then
		raise exception '0233 feedback-edits: anon can execute app_feedback_edit; revoke from anon BY NAME, per 0166.';
	end if;
	if not has_function_privilege('authenticated', 'public.app_feedback_edit(uuid, text, text, text, integer)', 'execute') then
		raise exception '0233 feedback-edits: authenticated cannot execute app_feedback_edit; the grant is missing.';
	end if;

	select count(*) into v_overloads
	from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'app_feedback_admin_list';
	if v_overloads <> 2 then
		raise exception '0233 feedback-edits: app_feedback_admin_list has % overloads; it must have exactly two.', v_overloads;
	end if;
	if to_regprocedure('public.app_feedback_admin_list(text, integer)') is null then
		raise exception '0233 feedback-edits: the narrow app_feedback_admin_list(text, integer) is gone; the deployed console calls it.';
	end if;
	if (select p.pronargdefaults from pg_catalog.pg_proc p
		where p.oid = 'public.app_feedback_admin_list(text, integer, text)'::regprocedure) <> 0 then
		raise exception '0233 feedback-edits: the wide app_feedback_admin_list declares a default; no payload may bind to both forms.';
	end if;
	select p.prosrc into v_src from pg_catalog.pg_proc p
	where p.oid = 'public.app_feedback_admin_list(text, integer, text)'::regprocedure;
	if position('app_feedback_edits' in v_src) = 0 then
		raise exception '0233 feedback-edits: the wide app_feedback_admin_list does not read the edits.';
	end if;
	if has_function_privilege('anon', 'public.app_feedback_admin_list(text, integer, text)', 'execute') then
		raise exception '0233 feedback-edits: anon can execute the wide app_feedback_admin_list.';
	end if;
	if not has_function_privilege('authenticated', 'public.app_feedback_admin_list(text, integer, text)', 'execute') then
		raise exception '0233 feedback-edits: authenticated cannot execute the wide app_feedback_admin_list.';
	end if;

	raise notice '0233 feedback-edits: % edit revision(s) over % report(s); app_feedback_edit and the wide list checked.',
		(select count(*) from public.app_feedback_edits),
		(select count(distinct e.feedback_id) from public.app_feedback_edits e);
end;
$fe$;
-- ===== PART feedback-edits END =====

-- ===== PART student-overview BEGIN =====
-- ---------------------------------------------------------------------------
-- PART 40. ONE STUDENT IN ONE CLASS, FOR A MANAGER OF THAT CLASS
-- (reports 792eb6b1 and 63fb1c49, Mr. Pina, 2026-10-03 and 2026-10-07: "a per
-- student page with all their work and stats", "for parent teacher
-- conferences to show the student's activity in the class").
--
-- WHAT THIS IS. classroom_student_overview(p_section_id, p_student_email) is
-- the ONE new read behind the per-student page at
-- /classroom/<section>/people/<email>. Everything else that page shows comes
-- from reads a manager can already make under RLS (submissions, presence rows,
-- the notebook grid, the team board, IdeaCAD documents), each with an
-- attribution filter on the one student. This function answers the four
-- things a manager could NOT read before: the student's whole hall pass
-- history in this class, which of this class's items they opened, their song
-- request counts in this class, and their IDEA Coin balance and history.
--
-- THE GATE IS classroom_manages_section (the 0138 wrapper, which folds
-- is_admin in), asked first and inside the definer. EVERY REFUSAL IS NULL AND
-- THEY ARE IDENTICAL: no session, a null argument, a section the caller does
-- not manage, an address with no enrollment row in this section, and an
-- address that can itself MANAGE the section (0138: a person who manages a
-- section is never a student row in it). So an address cannot be probed: a
-- classmate who does not exist and a teacher's own address answer the same.
-- An INACTIVE enrollment (a student who left) is answered, because the work
-- they did in this class is still theirs and the page labels them as not on
-- the live roster.
--
-- SCOPE. Hall passes, song requests and item views are THIS SECTION's only:
-- passes and songs by their own section_id, item views through
-- classroom_postings, so an item the student opened in another class never
-- appears. COINS ARE SCHOOL-WIDE, because the coin economy is, and they are
-- projected exactly as the public IDEA Coin Ledger already projects them to
-- anyone (0096 coin_public_student: when, amount, medium, category name, the
-- newest 500), plus only the ids the one history renderer needs to collapse a
-- transfer (id, category_id, category_kind, transfer_id). NEVER the note and
-- NEVER actor_email: those are the two coin columns that are not public.
--
-- IT REVERSES ONE SENTENCE, ON MR. PINA'S REQUEST. 0085 wrote of
-- classroom_item_views: "which items a student has opened is about the
-- student, not about the class, and no surface in this module shows it to
-- anyone else". Mr. Pina asked for "any telemetry collected from them", so the
-- student's own teacher now sees the LAST-opened time per item of this class.
-- NO POLICY IS ADDED TO THE TABLE: this definer read is the only door, and it
-- answers only for the section's manager. Recorded as a decision of the
-- 2026-10-07 round.
--
-- IT ADDS NOTHING TO PRESENCE AND GRADES NOTHING. presence_limits carries
-- 0200's windows built by the SAME five helpers classroom_presence_state uses
-- (a test pins the two objects equal), so the page's coverage sentence names
-- this deployment's retention. The presence table itself is read by the page
-- under its own RLS, unchanged (0200: do not make the presence table read
-- work, and presence is never a grade input).
--
-- THE HALL PASS ROWS ARE THE MANAGER HISTORY'S OWN SHAPE (0174: pass_id,
-- student_email, student_name, opened_at, closed_at, closed_by, opened_by),
-- so the existing renderers read them verbatim. The newest 500 with a total
-- beside them, and no flag at any duration: a long pass is a conversation, not
-- a number this decides is too big.
--
-- ADDITIVE: no table, no column, no policy, no table grant, no DML. A client
-- deployed first degrades on PGRST202 alone, so there is no deploy ordering.
--
-- UNDO:
--   drop function if exists public.classroom_student_overview(uuid, text);
-- Nothing else references it.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_student_overview(
	p_section_id uuid,
	p_student_email text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $so$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_enr public.classroom_enrollments%rowtype;
	v_uid uuid;
	v_pass_total integer;
	v_passes jsonb;
	v_views jsonb;
	v_songs jsonb;
	v_coin_total integer;
	v_coin_rows jsonb;
begin
	if coalesce(public.current_user_email(), '') = '' or p_section_id is null or v_email = '' then
		return null;
	end if;
	if not public.classroom_manages_section(p_section_id) then
		return null;
	end if;

	select e.* into v_enr
	from public.classroom_enrollments e
	where e.section_id = p_section_id and e.student_email = v_email;
	if not found then
		return null;
	end if;

	-- A person who manages the section is never a student row in it (0138),
	-- whatever their enrollment says. Same NULL as every other refusal.
	if public._classroom_manages_section_email(p_section_id, v_email) then
		return null;
	end if;

	v_uid := public._notebook_user_id_for_email(v_email);

	select count(*)::integer into v_pass_total
	from public.classroom_hall_passes h
	where h.section_id = p_section_id and h.student_email = v_email;

	select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.opened_at desc), '[]'::jsonb)
	into v_passes
	from (
		select h.id as pass_id, h.student_email, v_enr.display_name as student_name,
			h.opened_at, h.closed_at, h.closed_by, h.opened_by
		from public.classroom_hall_passes h
		where h.section_id = p_section_id and h.student_email = v_email
		order by h.opened_at desc
		limit 500
	) x;

	select coalesce(jsonb_agg(jsonb_build_object('item_id', v.item_id, 'viewed_at', v.viewed_at)
		order by v.viewed_at desc), '[]'::jsonb)
	into v_views
	from public.classroom_item_views v
	where v.student_email = v_email
		and exists (
			select 1 from public.classroom_postings pg
			where pg.item_id = v.item_id and pg.section_id = p_section_id
		);

	select jsonb_build_object(
		'requested', count(*),
		'approved', count(*) filter (where public._classroom_song_status(r.decided_at, r.rejection_reason) = 'approved'),
		'rejected', count(*) filter (where public._classroom_song_status(r.decided_at, r.rejection_reason) = 'rejected'),
		'pending', count(*) filter (where public._classroom_song_status(r.decided_at, r.rejection_reason) = 'pending'))
	into v_songs
	from public.classroom_song_requests r
	where r.section_id = p_section_id and r.student_email = v_email;

	select count(*)::integer into v_coin_total
	from public.coin_transactions t
	where t.student_email = v_email;

	select coalesce(jsonb_agg(row_to_json(c)::jsonb order by c.created_at desc, c.id desc), '[]'::jsonb)
	into v_coin_rows
	from (
		select t.id, t.category_id, cat.name as category_name, cat.kind as category_kind,
			t.amount, t.medium, t.transfer_id, t.created_at
		from public.coin_transactions t
		join public.coin_categories cat on cat.id = t.category_id
		where t.student_email = v_email
		order by t.created_at desc, t.id desc
		limit 500
	) c;

	return jsonb_build_object(
		'section_id', p_section_id,
		'student_email', v_email,
		'display_name', v_enr.display_name,
		'active', v_enr.active,
		'enrolled_at', v_enr.created_at,
		'has_account', v_uid is not null,
		'user_id', v_uid,
		'at', now(),
		'hall_passes', jsonb_build_object(
			'total', v_pass_total,
			'entries', v_passes,
			'limits', public._classroom_hall_pass_limits()),
		'item_views', v_views,
		'songs', v_songs,
		'coins', jsonb_build_object(
			'balance', public._coin_balance(v_email),
			'physical_balance', public._coin_balance(v_email, 'physical'),
			'digital_balance', public._coin_balance(v_email, 'digital'),
			'total', v_coin_total,
			'transactions', v_coin_rows),
		'presence_limits', jsonb_build_object(
			'input_window_seconds', extract(epoch from public._classroom_presence_input_window())::integer,
			'away_window_seconds', extract(epoch from public._classroom_presence_away_window())::integer,
			'heartbeat_seconds', extract(epoch from public._classroom_presence_heartbeat())::integer,
			'min_gap_seconds', extract(epoch from public._classroom_presence_min_gap())::integer,
			'retention_days', extract(day from public._classroom_presence_retention())::integer)
	);
end;
$so$;

comment on function public.classroom_student_overview(uuid, text) is
'One student in one class, for a manager of that class (2026-10-07 round, the per-student page). NULL for every refusal, identically: no session, not a manager of the section, no enrollment row, or an address that manages the section. Hall passes, item views and song counts are this section only; coins are school-wide and projected as the public Ledger projects them, never with the note or who logged them. Item views reach the section manager through this read alone (reversing a sentence of 0085 on request); no policy was added to the table.';

-- The 0166 shape: name every role, grant back exactly one.
revoke all on function public.classroom_student_overview(uuid, text)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_student_overview(uuid, text) to authenticated;

-- The self-check, over THIS function's own name only (the 0214 lesson: never a
-- prefix sweep over somebody else's objects).
do $so_check$
declare
	v_rows integer;
	v_anon boolean;
	v_auth boolean;
	v_definer boolean;
	v_path boolean;
begin
	select count(*)::integer into v_rows
	from pg_catalog.pg_proc p
	join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_student_overview';
	if v_rows <> 1 then
		raise exception '0233 student-overview: expected exactly one classroom_student_overview, found %', v_rows;
	end if;

	v_anon := has_function_privilege('anon', 'public.classroom_student_overview(uuid, text)', 'execute');
	v_auth := has_function_privilege('authenticated', 'public.classroom_student_overview(uuid, text)', 'execute');
	if v_anon then
		raise exception '0233 student-overview: anon can execute classroom_student_overview';
	end if;
	if not v_auth then
		raise exception '0233 student-overview: authenticated cannot execute classroom_student_overview';
	end if;

	select p.prosecdef,
		coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false)
	into v_definer, v_path
	from pg_catalog.pg_proc p
	where p.oid = 'public.classroom_student_overview(uuid, text)'::regprocedure;
	if not v_definer then
		raise exception '0233 student-overview: classroom_student_overview is not security definer';
	end if;
	if not v_path then
		raise exception '0233 student-overview: classroom_student_overview has no pinned search_path';
	end if;

	raise notice '0233 student-overview: % function, anon execute %, authenticated execute %, security definer %, search_path pinned %',
		v_rows, v_anon, v_auth, v_definer, v_path;
end;
$so_check$;
-- ===== PART student-overview END =====

-- ===== PART quick-posts BEGIN =====
-- ===========================================================================
-- 0233 PART quick-posts (ledger 0368, report R04, Mr. Pina: "quick post should
-- support images and files and longer text limits ... embedded images and
-- files so that students can pull them up in window and navigate them ... if
-- its a longer one it should be collapsible").
--
-- WHAT THIS PART DOES, all of it additive:
--   1. classroom_quick_post_files: one row per file on a notice. RLS on, no
--      policy, no client grant; written only by classroom_quick_post_add_file
--      and read only through classroom_quick_posts and classroom_quick_post_file.
--   2. The body ceiling goes from 1000 characters to 4000, in the CHECK and in
--      classroom_quick_post_create, whose signature does not change. Every row
--      already stored passes the wider check.
--   3. The files live in a NEW PRIVATE BUCKET, quick-post-files, 45 MiB a file
--      (the project's real ceiling on the Free plan, 0185), with no mime list:
--      the CLASSROOM FILES shape (0133). Objects are uploaded as
--      application/octet-stream and read back only through a signed URL that
--      carries download=, so nothing anybody uploads is ever navigated to as a
--      document on a host of ours.
--   4. THE KEY LAYOUT IS THE AUTHORIZATION: <post id>/<uuid>.<ext>. The two
--      storage policies read the FIRST PATH SEGMENT through
--      _classroom_storage_prefix_uuid (0133) and ask a quick-post predicate
--      about it. The write predicate is the post's AUTHOR, while the post is
--      still up; the read predicate is the notice's own audience (a manager of
--      a class it went to, an active enrollee while it is live, its author).
--   5. classroom_quick_posts (the read) gains per-post files and a top-level
--      files_ready and limits, so a client deployed before this applies never
--      offers what the database would refuse: it falls back to 1000 characters
--      and no files when the keys are absent.
--
-- WHO MAY ATTACH: only the teacher who posted the notice, while it is up
-- (decision taken for this round). Archive, never delete: there is no delete
-- function, no delete grant and no delete policy; a file row goes only with
-- its post's cascade, and a post is never deleted (0230 stamps a take down).
--
-- THE STORAGE HALF IS GUARDED. This is the first migration applied by
-- migrate.yml that writes a storage.buckets row and storage.objects policies,
-- and whether the applying role (idea_migrator) may do that has never been
-- measured (supabase/roles/idea_migrator.sql says so). So the bucket and the
-- two policies sit in ONE sub-block that catches insufficient_privilege, says
-- so in a NOTICE and lets the rest of the round apply. files_ready in the read
-- is computed from pg_policies, so the file picker stays off until a person
-- re-pastes 0233 in the SQL editor, which is idempotent and finishes the
-- storage half. Nothing is half-applied either way: the sub-block is a
-- savepoint, all or nothing.
--
-- DEPLOY ORDERING: none. Every signature is unchanged or new.
-- ===========================================================================

-- 1. THE FILE ROWS. No uploader column: only the post's author may attach,
--    and the RPC refuses anyone else, so it would always equal the post's own
--    author_email (one fewer address-bearing column).
create table if not exists public.classroom_quick_post_files (
	id uuid primary key default gen_random_uuid(),
	post_id uuid not null references public.classroom_quick_posts (id) on delete cascade,
	-- The object key, <post id>/<uuid>.<ext>. Nothing a person typed is in it.
	storage_key text not null,
	-- What people see, verbatim (trimmed). Never part of the key.
	filename text not null,
	size_bytes bigint,
	sort_order integer not null,
	created_at timestamptz not null default now(),
	constraint classroom_quick_post_files_key_unique unique (storage_key),
	constraint classroom_quick_post_files_key_shape check (
		storage_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(\.[a-z0-9]{1,12})?$'
		and public._classroom_storage_prefix_uuid(storage_key) is not distinct from post_id
	),
	constraint classroom_quick_post_files_name_shape check (char_length(filename) between 1 and 255),
	constraint classroom_quick_post_files_size check (size_bytes is null or size_bytes >= 0)
);

create index if not exists classroom_quick_post_files_post_idx
	on public.classroom_quick_post_files (post_id, sort_order);

alter table public.classroom_quick_post_files enable row level security;
revoke all on table public.classroom_quick_post_files from public, anon, authenticated;

-- 2. THE BODY CEILING, 1000 -> 4000. A widening: every stored row passes.
alter table public.classroom_quick_posts drop constraint if exists classroom_quick_posts_body_shape;
alter table public.classroom_quick_posts add constraint classroom_quick_posts_body_shape
	check (char_length(body) between 1 and 4000 and body ~ '[^[:space:]]');

-- CREATE, the same signature and the 0230 body with the two 1000s at 4000.
create or replace function public.classroom_quick_post_create(
	p_section_ids uuid[],
	p_body text,
	p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $qp$
declare
	v_email text := public.current_user_email();
	v_now timestamptz := now();
	v_ids uuid[];
	v_id uuid;
	v_body text;
	v_post uuid;
begin
	if v_email = '' then
		raise exception 'You must be signed in to post a class notice.';
	end if;

	select coalesce(array_agg(distinct x order by x), '{}'::uuid[])
	into v_ids
	from unnest(coalesce(p_section_ids, '{}'::uuid[])) as x
	where x is not null;

	if cardinality(v_ids) = 0 then
		return jsonb_build_object('ok', false, 'reason', 'no_classes');
	end if;
	if cardinality(v_ids) > 50 then
		raise exception 'Post to at most 50 classes at a time.';
	end if;

	foreach v_id in array v_ids loop
		-- The existence check is not a second authorization rule: an admin
		-- manages every id, real or not, and the foreign key would otherwise
		-- answer an invented id with a constraint error naming the table.
		if not exists (select 1 from public.classroom_sections s where s.id = v_id)
			or public.classroom_manages_section(v_id) is not true then
			raise exception 'Only a teacher of every chosen class can post to it.';
		end if;
	end loop;

	v_body := regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
	if v_body = '' then
		return jsonb_build_object('ok', false, 'reason', 'empty');
	end if;
	if char_length(v_body) > 4000 then
		return jsonb_build_object('ok', false, 'reason', 'too_long', 'limit', 4000);
	end if;
	if p_expires_at is not null and p_expires_at <= v_now then
		return jsonb_build_object('ok', false, 'reason', 'expiry_passed');
	end if;
	if p_expires_at is not null and p_expires_at > v_now + interval '366 days' then
		return jsonb_build_object('ok', false, 'reason', 'expiry_too_far');
	end if;

	insert into public.classroom_quick_posts (author_email, body, created_at, expires_at)
	values (v_email, v_body, v_now, p_expires_at)
	returning id into v_post;

	insert into public.classroom_quick_post_sections (post_id, section_id)
	select v_post, x from unnest(v_ids) as x;

	return jsonb_build_object(
		'ok', true,
		'id', v_post,
		'section_ids', to_jsonb(v_ids),
		'created_at', v_now,
		'expires_at', p_expires_at
	);
end;
$qp$;

revoke all on function public.classroom_quick_post_create(uuid[], text, timestamptz)
	from public, anon, authenticated;
grant execute on function public.classroom_quick_post_create(uuid[], text, timestamptz) to authenticated;

-- 3. WHO MAY READ A NOTICE'S FILES: its own audience. A manager of any class
--    it went to (an admin manages every section, through the manage rule); an
--    ACTIVE enrollee of one of its classes while it is live; and its author.
--    The empty address is refused, and a null post id answers false, so a key
--    with no uuid prefix fails closed. Private: called from definers only.
create or replace function public._classroom_quick_post_readable(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $qp$
	select coalesce(
		p_post_id is not null
		and public.current_user_email() <> ''
		and exists (
			select 1
			from public.classroom_quick_posts p
			where p.id = p_post_id
				and (
					p.author_email = public.current_user_email()
					or exists (
						select 1 from public.classroom_quick_post_sections t
						where t.post_id = p.id
							and (
								public.classroom_manages_section(t.section_id) is true
								or (
									public.classroom_is_enrolled(t.section_id) is true
									and p.taken_down_at is null
									and (p.expires_at is null or p.expires_at > now())
								)
							)
					)
				)
		),
		false
	);
$qp$;

revoke all on function public._classroom_quick_post_readable(uuid) from public, anon, authenticated;

-- WHO MAY WRITE ONE: the post's author, while it is still up. Private.
create or replace function public._classroom_quick_post_writable(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $qp$
	select coalesce(
		p_post_id is not null
		and public.current_user_email() <> ''
		and exists (
			select 1
			from public.classroom_quick_posts p
			where p.id = p_post_id
				and p.author_email = public.current_user_email()
				and p.taken_down_at is null
				and (p.expires_at is null or p.expires_at > now())
		),
		false
	);
$qp$;

revoke all on function public._classroom_quick_post_writable(uuid) from public, anon, authenticated;

-- The two object predicates the storage policies name. A function named
-- directly in an RLS clause is evaluated as the QUERYING role, so these two
-- hold an authenticated EXECUTE grant and nothing else.
create or replace function public.classroom_can_read_quick_post_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $qp$
	select public._classroom_quick_post_readable(public._classroom_storage_prefix_uuid(p_name));
$qp$;

revoke all on function public.classroom_can_read_quick_post_object(text) from public, anon, authenticated;
grant execute on function public.classroom_can_read_quick_post_object(text) to authenticated;

create or replace function public.classroom_can_write_quick_post_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $qp$
	select public._classroom_quick_post_writable(public._classroom_storage_prefix_uuid(p_name));
$qp$;

revoke all on function public.classroom_can_write_quick_post_object(text) from public, anon, authenticated;
grant execute on function public.classroom_can_write_quick_post_object(text) to authenticated;

-- 4. RECORD A FILE that has already landed in the bucket. No identity
--    parameter, no defaults. In order: not signed in raises; the post is
--    locked FOR UPDATE (the ten-file cap needs the parent row lock); a post
--    that does not exist and one that is not the caller's answer the same
--    'Not found.'; a key that is not this post's raises; the SAME key again
--    answers the row it already made (a retry after a dropped connection);
--    an ended or taken-down notice and an eleventh file are refusals a
--    teacher can meet by ordinary use, so they return {ok:false, reason}.
--    The name is trimmed the way a person means it (the regular expression,
--    never btrim) and an empty one becomes 'file'.
create or replace function public.classroom_quick_post_add_file(
	p_post_id uuid,
	p_storage_key text,
	p_filename text,
	p_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $qp$
declare
	v_email text := public.current_user_email();
	v_post public.classroom_quick_posts%rowtype;
	v_existing public.classroom_quick_post_files%rowtype;
	v_count integer;
	v_name text;
	v_id uuid;
begin
	if v_email = '' then
		raise exception 'You must be signed in to attach a file to a class notice.';
	end if;

	select * into v_post from public.classroom_quick_posts p where p.id = p_post_id for update;
	if not found or v_post.author_email <> v_email then
		raise exception 'Not found.';
	end if;

	if p_storage_key is null
		or p_storage_key !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}(\.[a-z0-9]{1,12})?$'
		or public._classroom_storage_prefix_uuid(p_storage_key) is distinct from p_post_id then
		raise exception 'That storage key does not belong to this notice.';
	end if;

	select * into v_existing from public.classroom_quick_post_files f
	where f.storage_key = p_storage_key and f.post_id = p_post_id;
	if found then
		return jsonb_build_object(
			'ok', true,
			'already', true,
			'file', jsonb_build_object('id', v_existing.id, 'filename', v_existing.filename, 'size_bytes', v_existing.size_bytes)
		);
	end if;

	if v_post.taken_down_at is not null or (v_post.expires_at is not null and v_post.expires_at <= now()) then
		return jsonb_build_object('ok', false, 'reason', 'ended');
	end if;

	select count(*)::integer into v_count from public.classroom_quick_post_files f where f.post_id = p_post_id;
	if v_count >= 10 then
		return jsonb_build_object('ok', false, 'reason', 'too_many_files', 'limit', 10);
	end if;

	if p_size_bytes is not null and p_size_bytes < 0 then
		raise exception 'A file size cannot be negative.';
	end if;

	v_name := left(regexp_replace(coalesce(p_filename, ''), '^\s+|\s+$', '', 'g'), 255);
	if v_name = '' then
		v_name := 'file';
	end if;

	insert into public.classroom_quick_post_files (post_id, storage_key, filename, size_bytes, sort_order)
	values (p_post_id, p_storage_key, v_name, p_size_bytes, v_count + 1)
	on conflict (storage_key) do nothing
	returning id into v_id;

	if v_id is null then
		-- The key is taken by a row this post does not own. The shape check
		-- above already ties a key to its post, so this is a race nobody
		-- should be able to produce; it still refuses rather than writes.
		raise exception 'That storage key does not belong to this notice.';
	end if;

	return jsonb_build_object(
		'ok', true,
		'already', false,
		'file', jsonb_build_object('id', v_id, 'filename', v_name, 'size_bytes', p_size_bytes)
	);
end;
$qp$;

revoke all on function public.classroom_quick_post_add_file(uuid, text, text, bigint)
	from public, anon, authenticated;
grant execute on function public.classroom_quick_post_add_file(uuid, text, text, bigint) to authenticated;

-- 5. ONE FILE, for the route that mints its signed URL. The notice's own
--    audience, else 'Not found.', identical for a file that does not exist
--    and one the caller may not read. The route then signs on the CALLER's
--    session, so the storage select policy asks again: two refusals.
create or replace function public.classroom_quick_post_file(p_file_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $qp$
declare
	v_file public.classroom_quick_post_files%rowtype;
begin
	if public.current_user_email() = '' then
		raise exception 'You must be signed in to open a class notice file.';
	end if;

	select * into v_file from public.classroom_quick_post_files f where f.id = p_file_id;
	if not found or not public._classroom_quick_post_readable(v_file.post_id) then
		raise exception 'Not found.';
	end if;

	return jsonb_build_object('ok', true, 'storage_key', v_file.storage_key, 'filename', v_file.filename);
end;
$qp$;

revoke all on function public.classroom_quick_post_file(uuid) from public, anon, authenticated;
grant execute on function public.classroom_quick_post_file(uuid) to authenticated;

-- 6. THE STORAGE HALF, GUARDED (see the header). The bucket's size literal is
--    written out (47185920, which is portal_upload_max_bytes()) because
--    tests/upload-limits.test.ts reads every storage.buckets literal and
--    checks it against the registry. No update, delete or anon policy: keys
--    are fresh uuids, nothing legitimately overwrites one, and this bucket is
--    never public.
do $qp$
begin
	begin
		insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
		values ('quick-post-files', 'quick-post-files', false, 47185920, null)
		on conflict (id) do update
			set public = false, file_size_limit = 47185920, allowed_mime_types = null;

		drop policy if exists "quick post files insert by author" on storage.objects;
		create policy "quick post files insert by author"
			on storage.objects
			for insert
			to authenticated
			with check (
				bucket_id = 'quick-post-files'
				and public.classroom_can_write_quick_post_object(name)
			);

		drop policy if exists "quick post files readable by the class" on storage.objects;
		create policy "quick post files readable by the class"
			on storage.objects
			for select
			to authenticated
			using (
				bucket_id = 'quick-post-files'
				and public.classroom_can_read_quick_post_object(name)
			);
	exception when insufficient_privilege then
		raise notice '0233 quick-posts: the storage half was NOT applied (this role cannot write storage.buckets or storage.objects policies). Re-paste 0233 in the SQL editor to finish it; quick posts stay text-only until then.';
	end;
end;
$qp$;

-- 7. THE READ, the 0230 body with files on each post and two top-level keys.
--    files never carries a storage key or an address. files_ready is the
--    insert policy's presence, so the picker is offered exactly when the
--    storage half landed; limits is what the composer counts against.
create or replace function public.classroom_quick_posts(p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $qp$
declare
	v_email text := public.current_user_email();
	v_manages boolean;
	v_posts jsonb;
	v_ready boolean;
begin
	if v_email = '' then
		raise exception 'You must be signed in to read class notices.';
	end if;

	v_manages := public.classroom_manages_section(p_section_id) is true;
	if not v_manages and not public.classroom_is_enrolled(p_section_id) then
		raise exception 'Not found.';
	end if;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', x.id,
			'body', x.body,
			'created_at', x.created_at,
			'expires_at', x.expires_at,
			'section_ids', case when v_manages then (
				select coalesce(jsonb_agg(t2.section_id order by t2.section_id), '[]'::jsonb)
				from public.classroom_quick_post_sections t2
				where t2.post_id = x.id
					and public.classroom_manages_section(t2.section_id)
			) end,
			'can_take_down', case
				when v_manages then public._classroom_quick_post_can_take_down(x.id, v_email)
				else false
			end,
			'files', (
				select coalesce(jsonb_agg(jsonb_build_object(
						'id', f.id,
						'filename', f.filename,
						'size_bytes', f.size_bytes
					) order by f.sort_order, f.created_at, f.id), '[]'::jsonb)
				from public.classroom_quick_post_files f
				where f.post_id = x.id
			)
		) order by x.created_at desc, x.id), '[]'::jsonb)
	into v_posts
	from (
		select p.id, p.body, p.created_at, p.expires_at
		from public.classroom_quick_posts p
		join public.classroom_quick_post_sections t on t.post_id = p.id
		where t.section_id = p_section_id
			and p.taken_down_at is null
			and (p.expires_at is null or p.expires_at > now())
		order by p.created_at desc, p.id
		limit 20
	) x;

	v_ready := exists (
		select 1 from pg_catalog.pg_policies pol
		where pol.schemaname = 'storage'
			and pol.tablename = 'objects'
			and pol.policyname = 'quick post files insert by author'
	);

	return jsonb_build_object(
		'ok', true,
		'manages', v_manages,
		'now', now(),
		'posts', v_posts,
		'files_ready', v_ready,
		'limits', jsonb_build_object(
			'max_chars', 4000,
			'max_files', 10,
			'max_bytes', public.portal_upload_max_bytes()
		)
	);
end;
$qp$;

revoke all on function public.classroom_quick_posts(uuid) from public, anon, authenticated;
grant execute on function public.classroom_quick_posts(uuid) to authenticated;

-- 8. SELF-CHECK over this part's own objects, by name. A raise is a refusal:
--    the whole file rolls back.
do $qp$
declare
	v_fn text;
	v_bad text[] := '{}';
	v_live integer;
	v_long integer;
	v_files integer;
	v_storage boolean;
begin
	foreach v_fn in array array[
		'public.classroom_quick_post_create(uuid[], text, timestamptz)',
		'public.classroom_quick_posts(uuid)',
		'public.classroom_quick_post_add_file(uuid, text, text, bigint)',
		'public.classroom_quick_post_file(uuid)',
		'public.classroom_can_read_quick_post_object(text)',
		'public.classroom_can_write_quick_post_object(text)'
	] loop
		if has_function_privilege('anon', v_fn, 'execute') then
			v_bad := v_bad || ('anon executes ' || v_fn);
		end if;
		if not has_function_privilege('authenticated', v_fn, 'execute') then
			v_bad := v_bad || ('authenticated cannot execute ' || v_fn);
		end if;
	end loop;
	foreach v_fn in array array[
		'public._classroom_quick_post_readable(uuid)',
		'public._classroom_quick_post_writable(uuid)'
	] loop
		if has_function_privilege('anon', v_fn, 'execute') or has_function_privilege('authenticated', v_fn, 'execute') then
			v_bad := v_bad || ('a client role executes the private ' || v_fn);
		end if;
	end loop;
	foreach v_fn in array array['classroom_quick_posts', 'classroom_quick_post_create', 'classroom_quick_post_add_file', 'classroom_quick_post_file'] loop
		if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname = v_fn) <> 1 then
			v_bad := v_bad || ('not exactly one overload of ' || v_fn);
		end if;
	end loop;
	if has_table_privilege('anon', 'public.classroom_quick_post_files', 'select')
		or has_table_privilege('anon', 'public.classroom_quick_post_files', 'insert')
		or has_table_privilege('authenticated', 'public.classroom_quick_post_files', 'select')
		or has_table_privilege('authenticated', 'public.classroom_quick_post_files', 'insert')
		or has_table_privilege('authenticated', 'public.classroom_quick_post_files', 'update')
		or has_table_privilege('authenticated', 'public.classroom_quick_post_files', 'delete') then
		v_bad := v_bad || 'a client role holds a privilege on classroom_quick_post_files'::text;
	end if;
	if not exists (
		select 1 from pg_catalog.pg_constraint c
		where c.conrelid = 'public.classroom_quick_posts'::regclass
			and c.conname = 'classroom_quick_posts_body_shape'
			and pg_catalog.pg_get_constraintdef(c.oid) like '%4000%'
	) then
		v_bad := v_bad || 'the body ceiling is not 4000'::text;
	end if;

	v_storage := exists (
		select 1 from pg_catalog.pg_policies pol
		where pol.schemaname = 'storage' and pol.tablename = 'objects'
			and pol.policyname = 'quick post files insert by author'
	);
	if v_storage then
		if not exists (
			select 1 from storage.buckets b
			where b.id = 'quick-post-files' and b.public = false and b.allowed_mime_types is null
				and b.file_size_limit = public.portal_upload_max_bytes()
		) then
			v_bad := v_bad || 'the quick-post-files bucket is not private, unlisted and at the portal ceiling'::text;
		end if;
		if exists (
			select 1 from pg_catalog.pg_policies pol
			where pol.schemaname = 'storage' and pol.tablename = 'objects'
				and (coalesce(pol.qual, '') || coalesce(pol.with_check, '')) like '%quick-post-files%'
				and (pol.roles && array['anon', 'public']::name[])
		) then
			v_bad := v_bad || 'a policy on the quick-post-files bucket names anon or public'::text;
		end if;
		if not exists (
			select 1 from pg_catalog.pg_policies pol
			where pol.schemaname = 'storage' and pol.tablename = 'objects'
				and pol.policyname = 'quick post files readable by the class'
		) then
			v_bad := v_bad || 'the read policy is missing beside the insert policy'::text;
		end if;
	end if;

	if cardinality(v_bad) > 0 then
		raise exception '0233 quick-posts self-check refused (% problem(s)): %', cardinality(v_bad), array_to_string(v_bad, '; ');
	end if;

	select count(*)::integer into v_live from public.classroom_quick_posts p
	where p.taken_down_at is null and (p.expires_at is null or p.expires_at > now());
	select count(*)::integer into v_long from public.classroom_quick_posts p where char_length(p.body) > 1000;
	select count(*)::integer into v_files from public.classroom_quick_post_files;
	raise notice '0233 quick-posts: % live notice(s), % over 1000 characters, % file row(s); storage half %.',
		v_live, v_long, v_files, case when v_storage then 'applied' else 'NOT applied (re-paste 0233 in the SQL editor)' end;
end;
$qp$;

-- UNDO (refuses rather than destroys). In the SQL editor, in this order:
--   1. drop policy if exists "quick post files insert by author" on storage.objects;
--      drop policy if exists "quick post files readable by the class" on storage.objects;
--   2. drop function if exists public.classroom_quick_post_file(uuid);
--      drop function if exists public.classroom_quick_post_add_file(uuid, text, text, bigint);
--      drop function if exists public.classroom_can_read_quick_post_object(text);
--      drop function if exists public.classroom_can_write_quick_post_object(text);
--      drop function if exists public._classroom_quick_post_readable(uuid);
--      drop function if exists public._classroom_quick_post_writable(uuid);
--   3. Re-run the read and the create sections of 0230 verbatim (it restores
--      the 1000 literal in the create and drops files_ready and limits, which
--      the client reads as no files and 1000 characters).
--   4. Restore the 1000-character CHECK ONLY if no stored body exceeds 1000:
--      count them first and stop if the count is not zero, because putting the
--      old check back over a longer notice refuses the whole statement.
--   5. The file table and the bucket's objects are left for a person to remove
--      by hand, after reading what is in them. Nothing here deletes them.
-- ===== PART quick-posts END =====

-- ===== PART foundry-major BEGIN =====
-- ===========================================================================
-- FOUNDRY: MAJOR RELEASES (report 927b1c69, Mr. Pina, 2026-10-07).
--
-- An administrator marks ONE APP a major release: a high-effort original game,
-- as opposed to a port, which the gallery then shows in a "Major releases"
-- section above the full list. It is curation of an app, never of a person,
-- and it is not the trusted-publisher roster (0173, decision 06), which is
-- per student and keyed by address.
--
-- WHAT THIS PART DOES, IN ORDER (the order matters: the list function is
-- `language sql`, whose body is validated at create time, so the column has
-- to exist first):
--
--   A. Two columns on student_apps, a stamp and an actor, the hidden_at /
--      hidden_by shape 0130 uses. THE ACTOR IS A UUID, NEVER AN ADDRESS:
--      student_apps carries a table-wide select grant to authenticated (0130),
--      so any column on it is directly readable on every row the population
--      policy admits. No read function projects the actor.
--   B. foundry_list_apps re-projected with major_release_at. It returns a
--      table, so a new column needs a DROP at its exact, unchanged argument
--      types first; the argument list does not move, so this is not the
--      signature trap and there is no deploy ordering. The body is 0173's
--      text PATCHED with two insertions and nothing else, never retyped:
--      0173's own header records what a retyped copy silently lost (the
--      owner-or-admin gate on the submitted id, the signed-in clause and the
--      created_at tiebreaker).
--   C. foundry_get_app gains one key. It returns jsonb, so no drop: the same
--      signature, 0173's text with one inserted line.
--   D. foundry_set_app_major, the one writer. Admin only, no identity
--      parameter, idempotent both ways, and it NEVER moves updated_at:
--      curation is not an edit, and updated_at drives the gallery's
--      "Recently updated" order and the list function's own order.
--   E. A self-check over this part's own three functions, by name.
--
-- WHAT A CLIENT SEES BEFORE THIS APPLIES: no major_release_at key at all, which
-- the client reads as "cannot tell" and offers no control for. The write
-- answers PGRST202 and the console says so in a sentence. Additive, so the
-- migration and the deploy may land in either order.
--
-- UNDO: drop the write function (foundry_set_app_major(uuid, boolean)), then
-- re-paste 0173's section 4 (the list drop plus create, and the get). The two
-- columns stay; dropping them is a hand paste the apply tool refuses:
--   alter table public.student_apps drop column major_release_by,
--     drop column major_release_at;
-- ===========================================================================

-- A. THE COLUMNS.
alter table public.student_apps
	add column if not exists major_release_at timestamptz,
	add column if not exists major_release_by uuid references auth.users (id) on delete set null;

-- An actor with no stamp is a half-written record. Guarded on pg_constraint,
-- because Postgres has no add-constraint-if-not-exists.
do $fm$
begin
	if not exists (
		select 1 from pg_catalog.pg_constraint
		where conname = 'student_apps_major_release_by_needs_at'
			and conrelid = 'public.student_apps'::regclass
	) then
		alter table public.student_apps
			add constraint student_apps_major_release_by_needs_at
			check (major_release_by is null or major_release_at is not null);
	end if;
end;
$fm$;

-- B. THE LIST, re-projected. 0173's text with two insertions: the column in
-- the returned table after hidden_at, and a.major_release_at in the select.
-- The stamp is projected to EVERY caller, because it is what the gallery
-- shows; the actor is projected by nothing.
drop function if exists public.foundry_list_apps(uuid, boolean, boolean);

create or replace function public.foundry_list_apps(
	p_owner uuid default null,
	p_include_hidden boolean default false,
	p_include_unpublished boolean default false
)
returns table (
	id uuid,
	slug text,
	title text,
	tagline text,
	description text,
	cover_path text,
	build_notes text,
	owner uuid,
	owner_display_name text,
	owner_full_name text,
	owner_class text,
	published_version_id uuid,
	published_ordinal integer,
	version_count integer,
	submitted_version_id uuid,
	-- 0173. The app's OWN published version when it was auto-published by a
	-- trusted author and nobody has reviewed it yet. Null otherwise, which is
	-- every app that went through the queue.
	live_unreviewed_version_id uuid,
	metadata_flagged_at timestamptz,
	hidden_at timestamptz,
	major_release_at timestamptz,
	created_at timestamptz,
	updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fl$
	select
		a.id, a.slug, a.title, a.tagline, a.description, a.cover_path, a.build_notes,
		a.owner, p.display_name, p.full_name,
		public._foundry_author_class(a.owner),
		a.published_version_id,
		(select pv.ordinal from public.student_app_versions pv where pv.id = a.published_version_id),
		(select count(*)::integer from public.student_app_versions v where v.app_id = a.id),
		-- The review trail is the owner's and the staff's. Everyone else gets
		-- null here rather than a hint that something is sitting in the queue.
		case
			when a.owner = (select auth.uid()) or public.is_admin() then (
				select sv.id from public.student_app_versions sv
				where sv.app_id = a.id and sv.status = 'submitted'
			)
		end,
		-- 0173, decision 06. GATED THE SAME WAY the submitted id above is, and
		-- for the same reason: whether a build is waiting to be looked at is
		-- the owner's business and staff's, and nobody else's.
		--
		-- STRICTLY THE APP'S OWN PUBLISHED VERSION. A superseded auto-published
		-- build is history rather than a queue item, and offering a reviewer a
		-- take-down control for something already taken down is a control whose
		-- only possible answer is a refusal.
		case
			when a.owner = (select auth.uid()) or public.is_admin() then (
				select sv.id from public.student_app_versions sv
				where sv.id = a.published_version_id
					and sv.auto_published_at is not null
					and sv.reviewed_at is null
			)
		end,
		a.metadata_flagged_at, a.hidden_at, a.major_release_at, a.created_at, a.updated_at
	from public.student_apps a
	left join public.profiles p on p.id = a.owner
	where (select auth.uid()) is not null
		and public._foundry_app_in_population(
			a.owner, a.hidden_at, a.published_version_id,
			p_include_hidden, p_include_unpublished
		)
		and (p_owner is null or a.owner = p_owner)
	order by a.updated_at desc, a.created_at desc;
$fl$;

revoke all on function public.foundry_list_apps(uuid, boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function public.foundry_list_apps(uuid, boolean, boolean) to authenticated;

-- C. ONE APP, with one more key: 0173's text with major_release_at inserted
-- after hidden_at. v_app is the whole row, so the column is already in it.
create or replace function public.foundry_get_app(
	p_slug text,
	p_include_hidden boolean default false,
	p_include_unpublished boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fg$
declare
	v_uid uuid := (select auth.uid());
	v_slug text := lower(public._foundry_norm(p_slug));
	v_app record;
	v_privileged boolean;
	v_versions jsonb;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select a.*, p.display_name as owner_display_name, p.full_name as owner_full_name
	into v_app
	from public.student_apps a
	left join public.profiles p on p.id = a.owner
	where a.slug = v_slug
		and public._foundry_app_in_population(
			a.owner, a.hidden_at, a.published_version_id,
			p_include_hidden, p_include_unpublished
		);

	if not found then
		return null;
	end if;

	v_privileged := (v_app.owner = v_uid) or public.is_admin();

	select coalesce(jsonb_agg(rows.payload order by rows.ordinal desc), '[]'::jsonb)
	into v_versions
	from (
		select v.ordinal, jsonb_build_object(
			'id', v.id,
			'ordinal', v.ordinal,
			'status', v.status,
			'manifest', v.manifest,
			'byte_size', v.byte_size,
			'file_count', v.file_count,
			'created_at', v.created_at,
			-- The zip and the review trail are privileged. A reader of a
			-- published app gets the build, never the paperwork around it.
			'zip_path', case when v_privileged then v.zip_path end,
			'reviewed_by', case when v_privileged then v.reviewed_by end,
			'reviewed_at', case when v_privileged then v.reviewed_at end,
			-- 0173. When a trusted author's submit published this without a
			-- review. Privileged beside the rest of the paperwork: a reader of a
			-- published app gets the build, never how it got there.
			'auto_published_at', case when v_privileged then v.auto_published_at end,
			'review_note', case when v_privileged then v.review_note end,
			'reject_reason', case when v_privileged then v.reject_reason end
		) as payload
		from public.student_app_versions v
		where v.app_id = v_app.id
			and (v_privileged or v.id = v_app.published_version_id)
	) rows;

	return jsonb_build_object(
		'id', v_app.id,
		'slug', v_app.slug,
		'title', v_app.title,
		'tagline', v_app.tagline,
		'description', v_app.description,
		'cover_path', v_app.cover_path,
		'build_notes', v_app.build_notes,
		'owner', v_app.owner,
		'owner_display_name', v_app.owner_display_name,
		'owner_full_name', v_app.owner_full_name,
		'owner_class', public._foundry_author_class(v_app.owner),
		'published_version_id', v_app.published_version_id,
		'metadata_flagged_at', v_app.metadata_flagged_at,
		'hidden_at', v_app.hidden_at,
		'major_release_at', v_app.major_release_at,
		'created_at', v_app.created_at,
		'updated_at', v_app.updated_at,
		'versions', v_versions
	);
end;
$fg$;

revoke all on function public.foundry_get_app(text, boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function public.foundry_get_app(text, boolean, boolean) to authenticated;

-- D. THE WRITE.
--
-- RAISES for misuse (no session, not an admin, a null flag). Answers a
-- STRUCTURED refusal for the states an admin has to be shown in words:
-- not_found, and when marking, hidden and not_published. A mark on something
-- that is not on the gallery would show nothing, so marking needs a published,
-- unhidden app; UNMARKING IS ALWAYS ALLOWED, a hidden app included. Hiding
-- keeps the flag and restoring brings the app back into the section, because
-- hiding is reversible shelving.
--
-- IDEMPOTENT BOTH WAYS: a second mark or a second unmark (a double click, two
-- tabs) answers ok with changed false and keeps the original stamp, so the
-- console can say "it already was" rather than claim a write.
--
-- THE ROW LOCK is the same for-update every single-app admin write here takes.
create or replace function public.foundry_set_app_major(
	p_app_id uuid,
	p_major boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fm$
declare
	v_uid uuid := (select auth.uid());
	v_app public.student_apps%rowtype;
	v_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site administrator can make an app a major release.';
	end if;
	if p_major is null then
		raise exception 'A major release or not? That has to be one or the other.';
	end if;

	select a.* into v_app from public.student_apps a where a.id = p_app_id for update;
	if not found then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;

	if p_major then
		if v_app.major_release_at is not null then
			return jsonb_build_object(
				'ok', true, 'app_id', p_app_id,
				'major_release_at', v_app.major_release_at, 'changed', false
			);
		end if;
		if v_app.hidden_at is not null then
			return jsonb_build_object('ok', false, 'reason', 'hidden');
		end if;
		if v_app.published_version_id is null then
			return jsonb_build_object('ok', false, 'reason', 'not_published');
		end if;
	elsif v_app.major_release_at is null then
		return jsonb_build_object(
			'ok', true, 'app_id', p_app_id, 'major_release_at', null, 'changed', false
		);
	end if;

	-- updated_at is deliberately not in this list.
	update public.student_apps a set
		major_release_at = case when p_major then now() else null end,
		major_release_by = case when p_major then v_uid else null end
	where a.id = p_app_id
	returning a.major_release_at into v_at;

	return jsonb_build_object(
		'ok', true, 'app_id', p_app_id, 'major_release_at', v_at, 'changed', true
	);
end;
$fm$;

revoke all on function public.foundry_set_app_major(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.foundry_set_app_major(uuid, boolean) to authenticated;

-- E. THE SELF-CHECK, over this part's own three functions by name and nothing
-- else: a prefix sweep would be asserting something about other migrations.
do $fm$
declare
	v_n integer;
	v_major integer;
begin
	select count(*) into v_n
	from pg_catalog.pg_proc p
	join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
		and p.proname in ('foundry_list_apps', 'foundry_get_app', 'foundry_set_app_major');
	if v_n <> 3 then
		raise exception 'foundry-major: expected one function each for foundry_list_apps, foundry_get_app and foundry_set_app_major, found % in all.', v_n;
	end if;

	if pg_catalog.pg_get_function_result('public.foundry_list_apps(uuid, boolean, boolean)'::regprocedure)
		not like '%major_release_at timestamp with time zone%' then
		raise exception 'foundry-major: foundry_list_apps does not project major_release_at.';
	end if;

	if pg_catalog.has_function_privilege('anon', 'public.foundry_set_app_major(uuid, boolean)', 'EXECUTE')
		or pg_catalog.has_function_privilege('anon', 'public.foundry_list_apps(uuid, boolean, boolean)', 'EXECUTE')
		or pg_catalog.has_function_privilege('anon', 'public.foundry_get_app(text, boolean, boolean)', 'EXECUTE') then
		raise exception 'foundry-major: a Foundry read or the major-release write is executable by anon.';
	end if;

	if not pg_catalog.has_function_privilege('authenticated', 'public.foundry_set_app_major(uuid, boolean)', 'EXECUTE') then
		raise exception 'foundry-major: foundry_set_app_major is not executable by authenticated.';
	end if;

	select count(*) into v_major from public.student_apps where major_release_at is not null;
	raise notice 'foundry-major: % app(s) marked as a major release (none on a first apply; a re-apply keeps them).', v_major;
end;
$fm$;
-- ===== PART foundry-major END =====
