-- 0260_cert_engine.sql
--
-- IDEA CERTIFICATION PORTAL, PART ONE OF FIVE (ledger 0391): THE ENGINE.
-- docs/CERTIFICATIONS.md is the spec; docs/certifications/DATA_MODEL.md is
-- the contract this file implements, table for table and function for
-- function. Parts two to five are 0261 (attempts), 0262 (exam), 0263 (awards)
-- and 0264 (ops).
--
-- WHAT IT CREATES, all new and all cert_-prefixed:
--   tables     cert_settings (one row, seeded), cert_certifications,
--              cert_revisions, cert_prerequisites, cert_lessons,
--              cert_exam_questions (the pool WITH its answer keys; no client
--              ever selects it), cert_authority, cert_events (append-only)
--   helpers    _cert_caller, _cert_norm, _cert_refuse, _cert_jt, _cert_jint,
--              _cert_can_certify, _cert_is_certifier, _cert_event,
--              _cert_person_name, _cert_question_check, _cert_project_check,
--              _cert_package_check, _cert_publish_check, _cert_summary_json
--   reads      cert_is_certifier, cert_my_authority, cert_settings,
--              cert_catalog, cert_get, cert_admin_list, cert_admin_get,
--              cert_lesson_document, cert_exam_pool_get, cert_authority_list
--   writes     cert_settings_set, cert_admin_save, cert_admin_publish,
--              cert_admin_hide, cert_admin_retire, cert_admin_delete,
--              cert_lesson_save, cert_lesson_delete, cert_exam_pool_replace,
--              cert_authority_grant, cert_authority_revoke
--   and it RESERVES THE SLUG: the last section re-creates
--              _app_short_link_reserved with 'certifications' added, in
--              0215's shape (0231 section 9b is the newest copy), because
--              /certifications is a real top-level route.
--
-- ADDITIVE AND IDEMPOTENT. Every table is create-if-not-exists, every function
-- is create-or-replace at a signature no earlier file used, every index is
-- if-not-exists, the one added constraint is guarded on pg_constraint, and the
-- settings seed sits inside a do block with on conflict do nothing. No row of
-- any table that existed before this file is written. Re-pasting it is ordinary
-- and changes nothing.
--
-- EVERY TABLE HAS ROW LEVEL SECURITY ON, NO POLICY AND NO CLIENT GRANT. Every
-- read and write is a SECURITY DEFINER function with an empty search_path that
-- re-checks the caller inside its own body: _cert_caller() is the session's
-- lowercase email and RAISES with no session; admin is public.is_admin(); a
-- certifier of one certification is _cert_can_certify(id), which is an admin or
-- a live cert_authority row. Every function revokes from public, anon,
-- authenticated AND service_role BY NAME (0166's shape: on a hosted project a
-- bare revoke from public leaves the direct anon grant the default privileges
-- wrote) and grants back exactly the roles the contract lists; the _cert_*
-- helpers get no grant at all. A refusal a caller renders returns
-- ok:false, reason, message; misuse raises; not found and not yours answer
-- identically.
--
-- THE CATALOG READERS ARE LATE-BOUND, ON PURPOSE. cert_catalog, cert_get,
-- cert_admin_list and cert_admin_get project attempt, award, seat and sitting
-- facts that live in 0261, 0262 and 0263. They are plpgsql, so the relations
-- are resolved when the function first RUNS and not when it is created; this
-- file therefore applies on its own (tests/short-link-reserved-names.test.ts
-- applies it over 0001, 0003, 0020, 0067, 0093, 0137, 0156, 0166, 0196, 0215
-- and 0231 alone), and its self-check calls none of them. Until 0261 to 0263
-- land, a call to one of those four readers errors with a missing relation.
-- They are applied as one bundle on one merge, so that window is minutes, and
-- nothing is published for a student to read in it.
--
-- DEPLOY ORDER: none. The client degrades past every object here.
--
-- UNDO, for a person's paste (nothing here deletes anything on its own):
--   drop function if exists public.cert_authority_revoke(uuid, text);
--   drop function if exists public.cert_authority_grant(uuid, text, text);
--   drop function if exists public.cert_authority_list();
--   drop function if exists public.cert_exam_pool_replace(uuid, jsonb);
--   drop function if exists public.cert_exam_pool_get(uuid);
--   drop function if exists public.cert_lesson_document(uuid);
--   drop function if exists public.cert_lesson_delete(uuid, text);
--   drop function if exists public.cert_lesson_save(uuid, text, text, text, jsonb);
--   drop function if exists public.cert_admin_delete(uuid);
--   drop function if exists public.cert_admin_retire(uuid);
--   drop function if exists public.cert_admin_hide(uuid);
--   drop function if exists public.cert_admin_publish(uuid);
--   drop function if exists public.cert_admin_save(uuid, jsonb, text);
--   drop function if exists public.cert_admin_get(uuid);
--   drop function if exists public.cert_admin_list();
--   drop function if exists public.cert_get(text);
--   drop function if exists public.cert_catalog();
--   drop function if exists public.cert_settings_set(jsonb);
--   drop function if exists public.cert_settings();
--   drop function if exists public.cert_my_authority();
--   drop function if exists public.cert_is_certifier();
--   drop function if exists public._cert_summary_json(uuid, text);
--   drop function if exists public._cert_publish_check(uuid);
--   drop function if exists public._cert_package_check(jsonb);
--   drop function if exists public._cert_project_check(jsonb, text, boolean);
--   drop function if exists public._cert_question_check(jsonb, text);
--   drop function if exists public._cert_person_name(text);
--   drop function if exists public._cert_event(text, text, text, uuid, uuid, jsonb, text);
--   drop function if exists public._cert_is_certifier();
--   drop function if exists public._cert_can_certify(uuid);
--   drop function if exists public._cert_jint(jsonb);
--   drop function if exists public._cert_jt(jsonb, text);
--   drop function if exists public._cert_refuse(text, text);
--   drop function if exists public._cert_norm(text);
--   drop function if exists public._cert_caller();
--   drop table if exists public.cert_events;
--   drop table if exists public.cert_authority;
--   drop table if exists public.cert_exam_questions;
--   drop table if exists public.cert_lessons;
--   drop table if exists public.cert_prerequisites;
--   alter table public.cert_certifications drop constraint if exists cert_certifications_current_revision_fk;
--   drop table if exists public.cert_revisions;
--   drop table if exists public.cert_certifications;
--   drop table if exists public.cert_settings;
--   then re-paste 0231 section 9b to put _app_short_link_reserved back to
--   its 36 names (a moved short link, if any, is recorded in
--   app_short_link_reserved_moves under migration '0260').

-- ===== PART A BEGIN =====
-- ===== PART A: TABLES =====

-- The portal's four numbers an admin edits from the engine page. One row, keyed
-- true; the seed below creates it and nothing else ever inserts.
create table if not exists public.cert_settings (
	id boolean primary key default true check (id),
	school_year_expiry date,
	dormancy_days integer not null default 60 check (dormancy_days between 1 and 3650),
	checkin_timeout_seconds integer not null default 60 check (checkin_timeout_seconds between 10 and 600),
	release_window_minutes integer not null default 10 check (release_window_minutes between 1 and 120),
	updated_at timestamptz,
	updated_by text
);
alter table public.cert_settings enable row level security;
revoke all on table public.cert_settings from public, anon, authenticated;

create table if not exists public.cert_certifications (
	id uuid primary key default gen_random_uuid(),
	code text not null unique
		check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9-]{0,31}$'),
	name text not null,
	level integer not null check (level between 1 and 9),
	category text not null,
	sort_order integer not null default 0,
	state text not null default 'draft' check (state in ('draft', 'published', 'retired')),
	renewal text not null default 'never' check (renewal in ('never', 'school_year')),
	current_revision_id uuid,
	created_at timestamptz not null default now(),
	created_by text,
	updated_at timestamptz not null default now(),
	published_at timestamptz,
	retired_at timestamptz
);
alter table public.cert_certifications enable row level security;
revoke all on table public.cert_certifications from public, anon, authenticated;

-- Immutable: no function here or in any later file updates a row.
create table if not exists public.cert_revisions (
	id uuid primary key default gen_random_uuid(),
	certification_id uuid not null references public.cert_certifications (id) on delete cascade,
	revision integer not null check (revision >= 1),
	package jsonb not null,
	note text,
	created_at timestamptz not null default now(),
	created_by text,
	unique (certification_id, revision)
);
alter table public.cert_revisions enable row level security;
revoke all on table public.cert_revisions from public, anon, authenticated;

do $$
begin
	if not exists (
		select 1 from pg_constraint where conname = 'cert_certifications_current_revision_fk'
	) then
		alter table public.cert_certifications
			add constraint cert_certifications_current_revision_fk
			foreign key (current_revision_id) references public.cert_revisions (id) on delete set null;
	end if;
end
$$;

-- Rewritten from the package on every save; enforced at cert_start.
create table if not exists public.cert_prerequisites (
	certification_id uuid not null references public.cert_certifications (id) on delete cascade,
	requires_id uuid not null references public.cert_certifications (id) on delete cascade,
	primary key (certification_id, requires_id),
	check (certification_id <> requires_id)
);
alter table public.cert_prerequisites enable row level security;
revoke all on table public.cert_prerequisites from public, anon, authenticated;

create table if not exists public.cert_lessons (
	id uuid primary key default gen_random_uuid(),
	certification_id uuid not null references public.cert_certifications (id) on delete cascade,
	slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
	title text not null,
	document text not null check (length(document) <= 1500000),
	manifest jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	updated_by text,
	unique (certification_id, slug)
);
alter table public.cert_lessons enable row level security;
revoke all on table public.cert_lessons from public, anon, authenticated;

-- THE POOL, WITH ITS KEYS. A student's browser never receives a row of it:
-- draws and scoring run inside 0262's definer functions, and the one reader
-- that returns the answer column is cert_exam_pool_get, which is admin-only.
create table if not exists public.cert_exam_questions (
	id uuid primary key default gen_random_uuid(),
	certification_id uuid not null references public.cert_certifications (id) on delete cascade,
	topic text not null,
	type text not null check (type in ('multiple_choice', 'multiple_select', 'numeric', 'short')),
	prompt text not null,
	options jsonb,
	answer jsonb not null,
	explain text,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create index if not exists cert_exam_questions_cert_topic_idx
	on public.cert_exam_questions (certification_id, topic) where active;
alter table public.cert_exam_questions enable row level security;
revoke all on table public.cert_exam_questions from public, anon, authenticated;

-- One whole power per person per certification; a grant is revoked by a
-- stamp, never deleted, so the history of who could certify is kept.
create table if not exists public.cert_authority (
	certification_id uuid not null references public.cert_certifications (id) on delete cascade,
	email text not null check (email = lower(btrim(email)) and email like '%@%'),
	granted_by text,
	granted_at timestamptz not null default now(),
	note text,
	revoked_at timestamptz,
	revoked_by text,
	primary key (certification_id, email)
);
alter table public.cert_authority enable row level security;
revoke all on table public.cert_authority from public, anon, authenticated;

-- THE ONE EVENT LOG. Append-only: nothing updates or deletes a row. It drives
-- the badge, the telemetry and the exports.
create table if not exists public.cert_events (
	id bigserial primary key,
	at timestamptz not null default now(),
	kind text not null,
	actor_email text,
	subject_email text,
	certification_id uuid,
	attempt_id uuid,
	reason text,
	payload jsonb not null default '{}'::jsonb
);
create index if not exists cert_events_at_idx on public.cert_events (at desc);
create index if not exists cert_events_subject_idx on public.cert_events (subject_email, at desc);
create index if not exists cert_events_cert_idx on public.cert_events (certification_id, at desc);
alter table public.cert_events enable row level security;
revoke all on table public.cert_events from public, anon, authenticated;
revoke all on sequence public.cert_events_id_seq from public, anon, authenticated;

-- The settings row. Inside a do block because tools/apply-migration.mjs
-- refuses a top-level insert; on conflict do nothing so a re-paste keeps what
-- an admin has set since.
do $$
begin
	insert into public.cert_settings (id) values (true) on conflict (id) do nothing;
end
$$;
-- ===== PART A END =====

-- ===== PART B BEGIN =====
-- ===== PART B: THE GATES AND THE SMALL HELPERS =====

-- The caller's lowercase email. RAISES with no session, so a function that
-- starts here can never answer for somebody who is not there.
create or replace function public._cert_caller()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_email text := lower(btrim(coalesce(public.current_user_email(), '')));
begin
	if v_email = '' then
		raise exception 'cert: no session';
	end if;
	return v_email;
end;
$fn$;
revoke all on function public._cert_caller() from public, anon, authenticated, service_role;

-- What a person typed, with whitespace trimmed the way a person means empty
-- (btrim strips spaces only, so it is not used here).
create or replace function public._cert_norm(p text)
returns text
language sql
immutable
set search_path = ''
as $fn$
	select regexp_replace(coalesce(p, ''), '^\s+|\s+$', '', 'g');
$fn$;
revoke all on function public._cert_norm(text) from public, anon, authenticated, service_role;

-- The one spelling of a refusal a caller renders.
create or replace function public._cert_refuse(p_reason text, p_message text)
returns jsonb
language sql
immutable
set search_path = ''
as $fn$
	select jsonb_build_object('ok', false, 'reason', p_reason, 'message', p_message);
$fn$;
revoke all on function public._cert_refuse(text, text) from public, anon, authenticated, service_role;

-- Is this jsonb value of this type? False, never null, for an absent key
-- (jsonb_typeof of a null is null, and a null in a gate accepts the write).
create or replace function public._cert_jt(j jsonb, p_type text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
	select coalesce(jsonb_typeof(j) = p_type, false);
$fn$;
revoke all on function public._cert_jt(jsonb, text) from public, anon, authenticated, service_role;

-- A whole number. The case keeps the cast behind the type test.
create or replace function public._cert_jint(j jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
	select case
		when jsonb_typeof(j) = 'number' then (j #>> '{}')::numeric = floor((j #>> '{}')::numeric)
		else false
	end;
$fn$;
revoke all on function public._cert_jint(jsonb) from public, anon, authenticated, service_role;

-- A certifier of ONE certification: an admin, or a live authority row for the
-- caller. Answers false, never raises, with no session.
create or replace function public._cert_can_certify(p_cert uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_email text := lower(btrim(coalesce(public.current_user_email(), '')));
begin
	if public.is_admin() then
		return true;
	end if;
	if v_email = '' or p_cert is null then
		return false;
	end if;
	return exists (
		select 1 from public.cert_authority a
		where a.certification_id = p_cert and a.email = v_email and a.revoked_at is null
	);
end;
$fn$;
revoke all on function public._cert_can_certify(uuid) from public, anon, authenticated, service_role;

-- A certifier of ANY certification: the desk gate.
create or replace function public._cert_is_certifier()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_email text := lower(btrim(coalesce(public.current_user_email(), '')));
begin
	if public.is_admin() then
		return true;
	end if;
	if v_email = '' then
		return false;
	end if;
	return exists (
		select 1 from public.cert_authority a where a.email = v_email and a.revoked_at is null
	);
end;
$fn$;
revoke all on function public._cert_is_certifier() from public, anon, authenticated, service_role;

-- One row into the event log.
create or replace function public._cert_event(
	p_kind text, p_actor text, p_subject text, p_cert uuid, p_attempt uuid, p_payload jsonb, p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_id bigint;
begin
	insert into public.cert_events (kind, actor_email, subject_email, certification_id, attempt_id, reason, payload)
	values (p_kind, p_actor, p_subject, p_cert, p_attempt, p_reason, coalesce(p_payload, '{}'::jsonb))
	returning id into v_id;
	return v_id;
end;
$fn$;
revoke all on function public._cert_event(text, text, text, uuid, uuid, jsonb, text) from public, anon, authenticated, service_role;

-- The name a reader sees for a person: their chosen display name, else their
-- full name, never their address (the Foundry rule). auth.users is the
-- authority on who holds an address; profiles.email is a copy written once.
create or replace function public._cert_person_name(p_email text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_name text;
begin
	if public._cert_norm(p_email) = '' then
		return null;
	end if;
	select coalesce(nullif(public._cert_norm(p.display_name), ''), nullif(public._cert_norm(p.full_name), ''))
	into v_name
	from auth.users u
	join public.profiles p on p.id = u.id
	where lower(btrim(u.email)) = lower(btrim(p_email))
	order by u.id
	limit 1;
	return v_name;
end;
$fn$;
revoke all on function public._cert_person_name(text) from public, anon, authenticated, service_role;
-- ===== PART B END =====

-- ===== PART C BEGIN =====
-- ===== PART C: THE PACKAGE SHAPE AND THE PUBLISH CHECK =====

-- A practice question or a quick check: prompt, options, the index of the
-- right one, an optional explanation. Every problem names where it is.
create or replace function public._cert_question_check(q jsonb, p_label text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $fn$
declare
	v_bad text[] := '{}'::text[];
	v_n integer;
	v_opt jsonb;
begin
	if not public._cert_jt(q, 'object') then
		return array[p_label || ': must be an object'];
	end if;
	if not public._cert_jt(q -> 'prompt', 'string') or public._cert_norm(q ->> 'prompt') = '' then
		v_bad := array_append(v_bad, (p_label || '.prompt: must be a non-empty string'));
	end if;
	if not public._cert_jt(q -> 'options', 'array') then
		v_bad := array_append(v_bad, (p_label || '.options: must be an array of 2 to 8 strings'));
	else
		v_n := jsonb_array_length(q -> 'options');
		if v_n < 2 or v_n > 8 then
			v_bad := array_append(v_bad, (p_label || '.options: must hold 2 to 8 options'));
		end if;
		for v_opt in select value from jsonb_array_elements(q -> 'options') loop
			if not public._cert_jt(v_opt, 'string') or public._cert_norm(v_opt #>> '{}') = '' then
				v_bad := array_append(v_bad, (p_label || '.options: every option is a non-empty string'));
				exit;
			end if;
		end loop;
		if not public._cert_jint(q -> 'answer') then
			v_bad := array_append(v_bad, (p_label || '.answer: must be the index of the right option'));
		elsif (q ->> 'answer')::integer < 0 or (q ->> 'answer')::integer >= v_n then
			v_bad := array_append(v_bad, (p_label || '.answer: index out of range'));
		end if;
	end if;
	if (q ? 'explain') and jsonb_typeof(q -> 'explain') not in ('string', 'null') then
		v_bad := array_append(v_bad, (p_label || '.explain: must be a string'));
	end if;
	return v_bad;
end;
$fn$;
revoke all on function public._cert_question_check(jsonb, text) from public, anon, authenticated, service_role;

-- A project spec: objective, spec, acceptance, references, steps (guided
-- only), self_inspection, evidence.
create or replace function public._cert_project_check(p jsonb, p_label text, p_steps boolean)
returns text[]
language plpgsql
immutable
set search_path = ''
as $fn$
declare
	v_bad text[] := '{}'::text[];
	v_item jsonb;
	v_i integer := 0;
begin
	if not public._cert_jt(p, 'object') then
		return array[p_label || ': must be an object'];
	end if;
	if not public._cert_jt(p -> 'objective', 'string') then
		v_bad := array_append(v_bad, (p_label || '.objective: must be a string'));
	end if;
	if not public._cert_jt(p -> 'spec', 'string') then
		v_bad := array_append(v_bad, (p_label || '.spec: must be a string'));
	end if;
	if not public._cert_jt(p -> 'acceptance', 'array') then
		v_bad := array_append(v_bad, (p_label || '.acceptance: must be an array of strings'));
	else
		for v_item in select value from jsonb_array_elements(p -> 'acceptance') loop
			if not public._cert_jt(v_item, 'string') then
				v_bad := array_append(v_bad, (p_label || '.acceptance: every line is a string'));
				exit;
			end if;
		end loop;
	end if;
	if (p ? 'references') and not public._cert_jt(p -> 'references', 'array') then
		v_bad := array_append(v_bad, (p_label || '.references: must be an array'));
	elsif p ? 'references' then
		for v_item in select value from jsonb_array_elements(p -> 'references') loop
			if not public._cert_jt(v_item, 'object') or not public._cert_jt(v_item -> 'label', 'string')
				or not public._cert_jt(v_item -> 'href', 'string') then
				v_bad := array_append(v_bad, (p_label || '.references: every reference is a label and an href'));
				exit;
			elsif (v_item ->> 'href') !~ '^https?://' then
				v_bad := array_append(v_bad, (p_label || '.references: an href starts with http:// or https://'));
				exit;
			end if;
		end loop;
	end if;
	if p ? 'steps' then
		if not public._cert_jt(p -> 'steps', 'array') then
			v_bad := array_append(v_bad, (p_label || '.steps: must be an array'));
		elsif not p_steps and jsonb_array_length(p -> 'steps') > 0 then
			v_bad := array_append(v_bad, (p_label || '.steps: only the guided project has steps'));
		else
			v_i := 0;
			for v_item in select value from jsonb_array_elements(p -> 'steps') loop
				if not public._cert_jt(v_item, 'object') or not public._cert_jt(v_item -> 'title', 'string')
					or not public._cert_jt(v_item -> 'body', 'string') then
					v_bad := array_append(v_bad, (p_label || '.steps[' || v_i || ']: needs a title and a body'));
				elsif coalesce(v_item ->> 'fade', '') not in ('full', 'goal', 'hint') then
					v_bad := array_append(v_bad, (p_label || '.steps[' || v_i || '].fade: must be full, goal or hint'));
				elsif (v_item ? 'hint') and jsonb_typeof(v_item -> 'hint') not in ('string', 'null') then
					v_bad := array_append(v_bad, (p_label || '.steps[' || v_i || '].hint: must be a string'));
				end if;
				v_i := v_i + 1;
			end loop;
		end if;
	end if;
	if not public._cert_jt(p -> 'self_inspection', 'array') then
		v_bad := array_append(v_bad, (p_label || '.self_inspection: must be an array of strings'));
	else
		for v_item in select value from jsonb_array_elements(p -> 'self_inspection') loop
			if not public._cert_jt(v_item, 'string') then
				v_bad := array_append(v_bad, (p_label || '.self_inspection: every item is a string'));
				exit;
			end if;
		end loop;
	end if;
	if not public._cert_jt(p -> 'evidence', 'array') then
		v_bad := array_append(v_bad, (p_label || '.evidence: must be an array'));
	else
		v_i := 0;
		for v_item in select value from jsonb_array_elements(p -> 'evidence') loop
			if not public._cert_jt(v_item, 'object') or not public._cert_jt(v_item -> 'label', 'string')
				or not public._cert_jt(v_item -> 'required', 'boolean') then
				v_bad := array_append(v_bad, (p_label || '.evidence[' || v_i || ']: needs a kind, a label and required'));
			elsif coalesce(v_item ->> 'kind', '') not in ('photo', 'file', 'text', 'link', 'youtube') then
				v_bad := array_append(v_bad, (p_label || '.evidence[' || v_i || '].kind: must be photo, file, text, link or youtube'));
			end if;
			v_i := v_i + 1;
		end loop;
	end if;
	return v_bad;
end;
$fn$;
revoke all on function public._cert_project_check(jsonb, text, boolean) from public, anon, authenticated, service_role;

-- EVERY PROBLEM WITH THE PACKAGE'S SHAPE: types, ranges, part references,
-- topic ids unique, minimums within the exam length, prerequisites known codes
-- other than itself. Empty when sound. Completeness is _cert_publish_check's.
create or replace function public._cert_package_check(p jsonb)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_bad text[] := '{}'::text[];
	v_code text;
	v_parts jsonb;
	v_training jsonb;
	v_exam jsonb;
	v_item jsonb;
	v_keys text[] := '{}'::text[];
	v_topic_ids text[] := '{}'::text[];
	v_key text;
	v_i integer := 0;
	v_sum integer := 0;
	v_per integer;
	v_part text;
	v_pre text;
begin
	if not public._cert_jt(p, 'object') then
		return array['package: must be a JSON object'];
	end if;
	if (p ->> 'format') is distinct from 'idea-certification' then
		v_bad := array_append(v_bad, 'format: must be "idea-certification"');
	end if;
	if (p -> 'version') is distinct from '1'::jsonb then
		v_bad := array_append(v_bad, 'version: must be 1');
	end if;

	-- Identity.
	if not public._cert_jt(p -> 'code', 'string') then
		v_bad := array_append(v_bad, 'code: must be a string');
	else
		v_code := upper(btrim(p ->> 'code'));
		if v_code !~ '^[A-Z0-9][A-Z0-9-]{0,31}$' then
			v_bad := array_append(v_bad, 'code: uppercase letters, digits and hyphens, 1 to 32 characters, starting with a letter or digit');
		end if;
	end if;
	if not public._cert_jt(p -> 'name', 'string') or public._cert_norm(p ->> 'name') = '' then
		v_bad := array_append(v_bad, 'name: must be a non-empty string');
	end if;
	if not public._cert_jint(p -> 'level') then
		v_bad := array_append(v_bad, 'level: must be a whole number from 1 to 9');
	elsif (p ->> 'level')::numeric not between 1 and 9 then
		v_bad := array_append(v_bad, 'level: must be from 1 to 9');
	end if;
	if not public._cert_jt(p -> 'category', 'string') or public._cert_norm(p ->> 'category') = '' then
		v_bad := array_append(v_bad, 'category: must be a non-empty string');
	end if;
	if not public._cert_jint(p -> 'sort_order') then
		v_bad := array_append(v_bad, 'sort_order: must be a whole number');
	end if;
	if coalesce(p ->> 'renewal', '') not in ('never', 'school_year') then
		v_bad := array_append(v_bad, 'renewal: must be never or school_year');
	end if;
	foreach v_part in array array['definition', 'allows', 'does_not_allow', 'study_guide'] loop
		if not public._cert_jt(p -> v_part, 'string') then
			v_bad := array_append(v_bad, (v_part || ': must be a string'));
		end if;
	end loop;

	-- Prerequisites: known codes, never itself.
	if not public._cert_jt(p -> 'prerequisites', 'array') then
		v_bad := array_append(v_bad, 'prerequisites: must be an array of codes');
	else
		for v_item in select value from jsonb_array_elements(p -> 'prerequisites') loop
			if not public._cert_jt(v_item, 'string') then
				v_bad := array_append(v_bad, 'prerequisites: every entry is a code string');
			else
				v_pre := upper(btrim(v_item #>> '{}'));
				if v_code is not null and v_pre = v_code then
					v_bad := array_append(v_bad, 'prerequisites: a certification cannot require itself');
				elsif not exists (select 1 from public.cert_certifications c where c.code = v_pre) then
					v_bad := array_append(v_bad, ('prerequisites: unknown code ' || v_pre));
				end if;
			end if;
		end loop;
	end if;

	-- Parts.
	v_parts := p -> 'parts';
	if not public._cert_jt(v_parts, 'object') then
		v_bad := array_append(v_bad, 'parts: must be an object with guided, exam, autonomous and checkout');
		v_parts := '{}'::jsonb;
	else
		foreach v_part in array array['guided', 'exam', 'autonomous', 'checkout'] loop
			if not public._cert_jt(v_parts -> v_part, 'boolean') then
				v_bad := array_append(v_bad, ('parts.' || v_part || ': must be true or false'));
			end if;
		end loop;
	end if;

	-- Training.
	v_training := p -> 'training';
	if not public._cert_jt(v_training, 'object') or not public._cert_jt(v_training -> 'items', 'array') then
		v_bad := array_append(v_bad, 'training: must be an object with an items array');
	else
		v_i := 0;
		for v_item in select value from jsonb_array_elements(v_training -> 'items') loop
			if not public._cert_jt(v_item, 'object') then
				v_bad := array_append(v_bad, ('training.items[' || v_i || ']: must be an object'));
			elsif not public._cert_jt(v_item -> 'title', 'string') or public._cert_norm(v_item ->> 'title') = '' then
				v_bad := array_append(v_bad, ('training.items[' || v_i || '].title: must be a non-empty string'));
			elsif (v_item ->> 'kind') = 'video' then
				if not public._cert_jt(v_item -> 'youtube_id', 'string') or (v_item ->> 'youtube_id') !~ '^[A-Za-z0-9_-]{11}$' then
					v_bad := array_append(v_bad, ('training.items[' || v_i || '].youtube_id: must be an 11 character YouTube id'));
				elsif (v_item ->> 'key') is distinct from ('yt:' || (v_item ->> 'youtube_id')) then
					v_bad := array_append(v_bad, ('training.items[' || v_i || '].key: must be yt: followed by the youtube_id'));
				elsif (v_item ? 'start') and jsonb_typeof(v_item -> 'start') <> 'null'
					and (not public._cert_jint(v_item -> 'start') or (v_item ->> 'start')::numeric < 0) then
					v_bad := array_append(v_bad, ('training.items[' || v_i || '].start: must be a whole number of seconds'));
				end if;
			elsif (v_item ->> 'kind') = 'lesson' then
				if not public._cert_jt(v_item -> 'slug', 'string') or (v_item ->> 'slug') !~ '^[a-z0-9][a-z0-9-]{0,63}$' then
					v_bad := array_append(v_bad, ('training.items[' || v_i || '].slug: lowercase letters, digits and hyphens'));
				elsif (v_item ->> 'key') is distinct from ('lesson:' || (v_item ->> 'slug')) then
					v_bad := array_append(v_bad, ('training.items[' || v_i || '].key: must be lesson: followed by the slug'));
				end if;
			else
				v_bad := array_append(v_bad, ('training.items[' || v_i || '].kind: must be video or lesson'));
			end if;
			v_key := v_item ->> 'key';
			if v_key is not null then
				if v_key = any (v_keys) then
					v_bad := array_append(v_bad, ('training.items: duplicate key ' || v_key));
				end if;
				v_keys := v_keys || v_key;
			end if;
			v_i := v_i + 1;
		end loop;
		if (v_training ? 'quick_checks') and not public._cert_jt(v_training -> 'quick_checks', 'array') then
			v_bad := array_append(v_bad, 'training.quick_checks: must be an array');
		elsif v_training ? 'quick_checks' then
			v_i := 0;
			for v_item in select value from jsonb_array_elements(v_training -> 'quick_checks') loop
				v_bad := v_bad || public._cert_question_check(v_item, 'training.quick_checks[' || v_i || ']');
				if public._cert_jt(v_item, 'object') then
					if not public._cert_jt(v_item -> 'id', 'string') or public._cert_norm(v_item ->> 'id') = '' then
						v_bad := array_append(v_bad, ('training.quick_checks[' || v_i || '].id: must be a non-empty string'));
					end if;
					if not ((v_item ->> 'after') = any (v_keys)) then
						v_bad := array_append(v_bad, ('training.quick_checks[' || v_i || '].after: must name a training item key'));
					end if;
				end if;
				v_i := v_i + 1;
			end loop;
		end if;
	end if;

	-- Practice quiz and common mistakes.
	if not public._cert_jt(p -> 'practice_quiz', 'array') then
		v_bad := array_append(v_bad, 'practice_quiz: must be an array');
	else
		v_i := 0;
		for v_item in select value from jsonb_array_elements(p -> 'practice_quiz') loop
			v_bad := v_bad || public._cert_question_check(v_item, 'practice_quiz[' || v_i || ']');
			if public._cert_jt(v_item, 'object')
				and (not public._cert_jt(v_item -> 'id', 'string') or public._cert_norm(v_item ->> 'id') = '') then
				v_bad := array_append(v_bad, ('practice_quiz[' || v_i || '].id: must be a non-empty string'));
			end if;
			v_i := v_i + 1;
		end loop;
	end if;
	if not public._cert_jt(p -> 'common_mistakes', 'array') then
		v_bad := array_append(v_bad, 'common_mistakes: must be an array');
	else
		v_i := 0;
		for v_item in select value from jsonb_array_elements(p -> 'common_mistakes') loop
			if not public._cert_jt(v_item, 'object') or not public._cert_jt(v_item -> 'title', 'string')
				or not public._cert_jt(v_item -> 'body', 'string') then
				v_bad := array_append(v_bad, ('common_mistakes[' || v_i || ']: needs a title and a body'));
			end if;
			v_i := v_i + 1;
		end loop;
	end if;

	-- Exam configuration (the pool is a table, not a package key).
	v_exam := p -> 'exam';
	if (v_parts -> 'exam') = 'true'::jsonb and not public._cert_jt(v_exam, 'object') then
		v_bad := array_append(v_bad, 'exam: required while parts.exam is true');
	elsif v_exam is not null and jsonb_typeof(v_exam) not in ('object', 'null') then
		v_bad := array_append(v_bad, 'exam: must be an object or null');
	elsif public._cert_jt(v_exam, 'object') then
		if not public._cert_jint(v_exam -> 'time_limit_minutes') then
			v_bad := array_append(v_bad, 'exam.time_limit_minutes: must be a whole number of minutes');
		elsif (v_exam ->> 'time_limit_minutes')::numeric not between 1 and 600 then
			v_bad := array_append(v_bad, 'exam.time_limit_minutes: must be from 1 to 600');
		end if;
		if not public._cert_jint(v_exam -> 'questions_per_exam') then
			v_bad := array_append(v_bad, 'exam.questions_per_exam: must be a whole number');
			v_per := null;
		elsif (v_exam ->> 'questions_per_exam')::numeric not between 1 and 200 then
			v_bad := array_append(v_bad, 'exam.questions_per_exam: must be from 1 to 200');
			v_per := null;
		else
			v_per := (v_exam ->> 'questions_per_exam')::integer;
		end if;
		if not public._cert_jt(v_exam -> 'topics', 'array') then
			v_bad := array_append(v_bad, 'exam.topics: must be an array');
		else
			v_i := 0;
			v_sum := 0;
			for v_item in select value from jsonb_array_elements(v_exam -> 'topics') loop
				if not public._cert_jt(v_item, 'object') or not public._cert_jt(v_item -> 'id', 'string')
					or (v_item ->> 'id') !~ '^[a-z0-9][a-z0-9-]{0,63}$' then
					v_bad := array_append(v_bad, ('exam.topics[' || v_i || '].id: lowercase letters, digits and hyphens'));
				else
					if (v_item ->> 'id') = any (v_topic_ids) then
						v_bad := array_append(v_bad, ('exam.topics: duplicate id ' || (v_item ->> 'id')));
					end if;
					v_topic_ids := v_topic_ids || (v_item ->> 'id');
					if not public._cert_jt(v_item -> 'name', 'string') or public._cert_norm(v_item ->> 'name') = '' then
						v_bad := array_append(v_bad, ('exam.topics[' || v_i || '].name: must be a non-empty string'));
					end if;
					if not public._cert_jint(v_item -> 'minimum') then
						v_bad := array_append(v_bad, ('exam.topics[' || v_i || '].minimum: must be a whole number'));
					elsif (v_item ->> 'minimum')::numeric < 0 then
						v_bad := array_append(v_bad, ('exam.topics[' || v_i || '].minimum: cannot be negative'));
					else
						v_sum := v_sum + (v_item ->> 'minimum')::integer;
					end if;
				end if;
				v_i := v_i + 1;
			end loop;
			if v_per is not null and v_sum > v_per then
				v_bad := array_append(v_bad, ('exam.topics: the minimums add up to ' || v_sum || ', more than questions_per_exam (' || v_per || ')'));
			end if;
		end if;
	end if;

	-- Projects and checkout.
	if (v_parts -> 'guided') = 'true'::jsonb and not public._cert_jt(p -> 'guided_project', 'object') then
		v_bad := array_append(v_bad, 'guided_project: required while parts.guided is true');
	elsif public._cert_jt(p -> 'guided_project', 'object') then
		v_bad := v_bad || public._cert_project_check(p -> 'guided_project', 'guided_project', true);
	elsif (p ? 'guided_project') and jsonb_typeof(p -> 'guided_project') <> 'null' then
		v_bad := array_append(v_bad, 'guided_project: must be an object or null');
	end if;
	if (v_parts -> 'autonomous') = 'true'::jsonb and not public._cert_jt(p -> 'autonomous_project', 'object') then
		v_bad := array_append(v_bad, 'autonomous_project: required while parts.autonomous is true');
	elsif public._cert_jt(p -> 'autonomous_project', 'object') then
		v_bad := v_bad || public._cert_project_check(p -> 'autonomous_project', 'autonomous_project', false);
	elsif (p ? 'autonomous_project') and jsonb_typeof(p -> 'autonomous_project') <> 'null' then
		v_bad := array_append(v_bad, 'autonomous_project: must be an object or null');
	end if;
	if (v_parts -> 'checkout') = 'true'::jsonb and not public._cert_jt(p -> 'checkout', 'object') then
		v_bad := array_append(v_bad, 'checkout: required while parts.checkout is true');
	elsif public._cert_jt(p -> 'checkout', 'object') then
		if not public._cert_jt(p -> 'checkout' -> 'card', 'string') or not public._cert_jt(p -> 'checkout' -> 'filming_guide', 'string') then
			v_bad := array_append(v_bad, 'checkout: needs a card and a filming_guide, both strings');
		end if;
	elsif (p ? 'checkout') and jsonb_typeof(p -> 'checkout') <> 'null' then
		v_bad := array_append(v_bad, 'checkout: must be an object or null');
	end if;

	return v_bad;
end;
$fn$;
revoke all on function public._cert_package_check(jsonb) from public, anon, authenticated, service_role;

-- EVERY REASON THE CURRENT REVISION CANNOT PUBLISH: the shape problems plus
-- completeness. A pool must hold every topic's minimum in ACTIVE questions and
-- at least 2 x questions_per_exam in all (Mr. Pina: roughly twice as many as
-- one exam uses; decision D6).
create or replace function public._cert_publish_check(p_cert uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	c public.cert_certifications%rowtype;
	v_pkg jsonb;
	v_bad text[] := '{}'::text[];
	v_parts jsonb;
	v_proj jsonb;
	v_label text;
	v_item jsonb;
	v_per integer;
	v_total integer;
	v_have integer;
	v_min integer;
	v_topics integer := 0;
	v_pre record;
begin
	select * into c from public.cert_certifications where id = p_cert;
	if not found then
		return array['certification: not found'];
	end if;
	if c.current_revision_id is null then
		return array['revision: this certification has never been saved'];
	end if;
	select package into v_pkg from public.cert_revisions where id = c.current_revision_id;
	v_bad := public._cert_package_check(v_pkg);
	if array_length(v_bad, 1) is not null then
		return v_bad;
	end if;
	v_parts := v_pkg -> 'parts';

	foreach v_label in array array['definition', 'allows', 'does_not_allow', 'study_guide'] loop
		if public._cert_norm(v_pkg ->> v_label) = '' then
			v_bad := array_append(v_bad, (v_label || ': is empty'));
		end if;
	end loop;
	if jsonb_array_length(v_pkg -> 'training' -> 'items') = 0 then
		v_bad := array_append(v_bad, 'training: needs at least one video or lesson');
	end if;
	if jsonb_array_length(v_pkg -> 'practice_quiz') = 0 then
		v_bad := array_append(v_bad, 'practice_quiz: needs at least one question');
	end if;
	if jsonb_array_length(v_pkg -> 'common_mistakes') = 0 then
		v_bad := array_append(v_bad, 'common_mistakes: needs at least one entry');
	end if;

	-- Every lesson item names a stored lesson.
	for v_item in select value from jsonb_array_elements(v_pkg -> 'training' -> 'items') loop
		if (v_item ->> 'kind') = 'lesson' and not exists (
			select 1 from public.cert_lessons l where l.certification_id = p_cert and l.slug = (v_item ->> 'slug')
		) then
			v_bad := array_append(v_bad, ('training: lesson ' || (v_item ->> 'slug') || ' has no document yet'));
		end if;
	end loop;

	-- Every prerequisite is published or retired.
	for v_pre in
		select q.code, q.state from public.cert_prerequisites pr
		join public.cert_certifications q on q.id = pr.requires_id
		where pr.certification_id = p_cert
	loop
		if v_pre.state not in ('published', 'retired') then
			v_bad := array_append(v_bad, ('prerequisites: ' || v_pre.code || ' is not published'));
		end if;
	end loop;

	-- Each enabled part is complete.
	foreach v_label in array array['guided', 'autonomous'] loop
		if (v_parts -> v_label) = 'true'::jsonb then
			v_proj := v_pkg -> (v_label || '_project');
			if public._cert_norm(v_proj ->> 'objective') = '' then
				v_bad := array_append(v_bad, (v_label || '_project.objective: is empty'));
			end if;
			if public._cert_norm(v_proj ->> 'spec') = '' then
				v_bad := array_append(v_bad, (v_label || '_project.spec: is empty'));
			end if;
			if jsonb_array_length(v_proj -> 'acceptance') = 0 then
				v_bad := array_append(v_bad, (v_label || '_project.acceptance: needs at least one line'));
			end if;
			if jsonb_array_length(v_proj -> 'evidence') = 0 then
				v_bad := array_append(v_bad, (v_label || '_project.evidence: needs at least one item'));
			end if;
		end if;
	end loop;
	if (v_parts -> 'checkout') = 'true'::jsonb then
		if public._cert_norm(v_pkg -> 'checkout' ->> 'card') = '' then
			v_bad := array_append(v_bad, 'checkout.card: is empty');
		end if;
		if public._cert_norm(v_pkg -> 'checkout' ->> 'filming_guide') = '' then
			v_bad := array_append(v_bad, 'checkout.filming_guide: is empty');
		end if;
	end if;
	if (v_parts -> 'exam') = 'true'::jsonb then
		v_per := (v_pkg -> 'exam' ->> 'questions_per_exam')::integer;
		if (v_pkg -> 'exam' ->> 'time_limit_minutes')::integer < 1 then
			v_bad := array_append(v_bad, 'exam.time_limit_minutes: needs a time limit');
		end if;
		for v_item in select value from jsonb_array_elements(v_pkg -> 'exam' -> 'topics') loop
			v_min := (v_item ->> 'minimum')::integer;
			if v_min >= 1 then
				v_topics := v_topics + 1;
			end if;
			select count(*) into v_have from public.cert_exam_questions q
			where q.certification_id = p_cert and q.active and q.topic = (v_item ->> 'id');
			if v_have < v_min then
				v_bad := array_append(v_bad, ('exam pool: topic ' || (v_item ->> 'id') || ' holds ' || v_have || ' active question(s), fewer than its minimum of ' || v_min));
			end if;
		end loop;
		if v_topics = 0 then
			v_bad := array_append(v_bad, 'exam.topics: needs at least one topic with a minimum of 1 or more');
		end if;
		select count(*) into v_total from public.cert_exam_questions q
		where q.certification_id = p_cert and q.active
			and q.topic in (select t ->> 'id' from jsonb_array_elements(v_pkg -> 'exam' -> 'topics') t);
		-- Mr. Pina's rule: the pool holds roughly twice as many questions as one exam uses.
		if v_total < 2 * v_per then
			v_bad := array_append(v_bad, ('exam pool: ' || v_total || ' active question(s) across the topics, fewer than twice the ' || v_per || ' one exam draws'));
		end if;
	end if;

	return v_bad;
end;
$fn$;
revoke all on function public._cert_publish_check(uuid) from public, anon, authenticated, service_role;
-- ===== PART C END =====

-- ===== PART D BEGIN =====
-- ===== PART D: THE READS =====

-- The desk gate.
create or replace function public.cert_is_certifier()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
	return public._cert_is_certifier();
end;
$fn$;
revoke all on function public.cert_is_certifier() from public, anon, authenticated, service_role;
grant execute on function public.cert_is_certifier() to authenticated;

create or replace function public.cert_my_authority()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_admin boolean := public.is_admin();
begin
	return jsonb_build_object(
		'admin', v_admin,
		'certifications', coalesce((
			select jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'name', c.name) order by c.category, c.sort_order, c.level, c.code)
			from public.cert_certifications c
			where (v_admin and c.state <> 'draft')
				or exists (select 1 from public.cert_authority a where a.certification_id = c.id and a.email = v_me and a.revoked_at is null)
		), '[]'::jsonb)
	);
end;
$fn$;
revoke all on function public.cert_my_authority() from public, anon, authenticated, service_role;
grant execute on function public.cert_my_authority() to authenticated;

create or replace function public.cert_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	s public.cert_settings%rowtype;
begin
	perform public._cert_caller();
	select * into s from public.cert_settings where id;
	return jsonb_build_object(
		'school_year_expiry', s.school_year_expiry,
		'dormancy_days', coalesce(s.dormancy_days, 60),
		'checkin_timeout_seconds', coalesce(s.checkin_timeout_seconds, 60),
		'release_window_minutes', coalesce(s.release_window_minutes, 10)
	);
end;
$fn$;
revoke all on function public.cert_settings() from public, anon, authenticated, service_role;
grant execute on function public.cert_settings() to authenticated;

-- The CertSummary shape for one certification, as the caller sees it. Reads
-- 0261's attempts and 0263's awards, so it is late-bound (see the header).
create or replace function public._cert_summary_json(p_cert uuid, p_me text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_out jsonb;
begin
	select jsonb_build_object(
		'id', c.id,
		'code', c.code,
		'name', c.name,
		'level', c.level,
		'category', c.category,
		'sort_order', c.sort_order,
		'renewal', c.renewal,
		'state', c.state,
		'definition', coalesce(r.package ->> 'definition', ''),
		'allows', coalesce(r.package ->> 'allows', ''),
		'does_not_allow', coalesce(r.package ->> 'does_not_allow', ''),
		'parts', coalesce(r.package -> 'parts', '{"guided": true, "exam": true, "autonomous": true, "checkout": true}'::jsonb),
		'prerequisites', coalesce((
			select jsonb_agg(jsonb_build_object('code', q.code, 'name', q.name, 'held', public._cert_holds(p_me, q.id))
				order by q.category, q.sort_order, q.level, q.code)
			from public.cert_prerequisites pr
			join public.cert_certifications q on q.id = pr.requires_id
			where pr.certification_id = c.id
		), '[]'::jsonb),
		'holders_count', (
			select count(*) from public.cert_awards a
			where a.certification_id = c.id and a.status = 'active' and (a.expires_at is null or a.expires_at > now())
		),
		'avg_completion_days', (
			select case when count(*) >= 3
				then round((avg(extract(epoch from (t.finished_at - t.started_at))) / 86400.0)::numeric, 1)
			end
			from public.cert_attempts t
			where t.certification_id = c.id and t.state = 'complete' and t.finished_at is not null
		),
		'my', jsonb_build_object(
			'state', coalesce(my.state, 'none'),
			'attempt_id', my.id,
			'held', public._cert_holds(p_me, c.id),
			'expired', (not public._cert_holds(p_me, c.id)) and exists (
				select 1 from public.cert_awards a
				where a.certification_id = c.id and a.email = p_me and a.status = 'active'
					and a.expires_at is not null and a.expires_at <= now()
			)
		)
	)
	into v_out
	from public.cert_certifications c
	left join public.cert_revisions r on r.id = c.current_revision_id
	left join lateral (
		select t.id, t.state from public.cert_attempts t
		where t.certification_id = c.id and t.email = p_me
		order by t.started_at desc limit 1
	) my on true
	where c.id = p_cert;
	return v_out;
end;
$fn$;
revoke all on function public._cert_summary_json(uuid, text) from public, anon, authenticated, service_role;

-- Every published certification, for the catalog page.
create or replace function public.cert_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
begin
	return coalesce((
		select jsonb_agg(public._cert_summary_json(c.id, v_me) order by c.cat_sort, c.category, c.sort_order, c.level, c.code)
		from (
			select x.id, x.code, x.level, x.sort_order, x.category,
				min(x.sort_order) over (partition by x.category) as cat_sort
			from public.cert_certifications x
			where x.state = 'published'
		) c
	), '[]'::jsonb);
end;
$fn$;
revoke all on function public.cert_catalog() from public, anon, authenticated, service_role;
grant execute on function public.cert_catalog() to authenticated;

-- The whole published certification for its page: the kit, the projects, the
-- exam CONFIGURATION (never a question), the caller's own attempt, training
-- progress, cooldown, seat and the open windows. Null for a draft or an
-- unknown code, so the route answers 404; a certifier also gets a retired one.
create or replace function public.cert_get(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	c public.cert_certifications%rowtype;
	v_pkg jsonb;
	v_attempt uuid;
	v_out jsonb;
begin
	select * into c from public.cert_certifications where code = upper(btrim(coalesce(p_code, '')));
	if not found or c.state = 'draft' then
		return null;
	end if;
	if c.state = 'retired' and not public._cert_can_certify(c.id) then
		return null;
	end if;
	select package into v_pkg from public.cert_revisions where id = c.current_revision_id;
	select t.id into v_attempt from public.cert_attempts t
	where t.certification_id = c.id and t.email = v_me
	order by t.started_at desc limit 1;

	v_out := public._cert_summary_json(c.id, v_me) || jsonb_build_object(
		'revision_id', c.current_revision_id,
		'package', v_pkg,
		'lessons', coalesce((
			select jsonb_agg(jsonb_build_object('id', l.id, 'slug', l.slug, 'title', l.title) order by l.slug)
			from public.cert_lessons l where l.certification_id = c.id
		), '[]'::jsonb),
		'my_attempt', case when v_attempt is null then null else public._cert_attempt_json(v_attempt) end,
		'my_training', coalesce((
			select jsonb_agg(jsonb_build_object(
				'item_key', tp.item_key, 'covered_seconds', tp.covered_seconds,
				'duration_seconds', tp.duration_seconds, 'completed_at', tp.completed_at) order by tp.item_key)
			from public.cert_training_progress tp
			where tp.certification_id = c.id and tp.email = v_me
		), '[]'::jsonb),
		'cooldown_until', case when v_attempt is null then null else public._cert_cooldown_until(v_attempt) end,
		'seat', (
			select jsonb_build_object('id', s.id, 'state', s.state, 'sitting_id', s.sitting_id,
				'scheduled_at', s.scheduled_at, 'requested_at', s.requested_at, 'decision_note', s.decision_note)
			from public.cert_seats s
			where s.attempt_id = v_attempt and s.state in ('requested', 'approved', 'booked')
			order by s.requested_at desc limit 1
		),
		'sittings', coalesce((
			select jsonb_agg(jsonb_build_object(
				'id', w.id, 'starts_at', w.starts_at, 'ends_at', w.ends_at, 'seat_limit', w.seat_limit,
				'seats_taken', (select count(*) from public.cert_seats s where s.sitting_id = w.id and s.state in ('booked', 'used')),
				'location', w.location, 'note', w.note,
				'certification', case when w.certification_id is null then null
					else jsonb_build_object('code', c.code, 'name', c.name) end,
				'state', w.state) order by w.starts_at)
			from public.cert_sittings w
			where w.state = 'open' and w.ends_at > now()
				and (w.certification_id is null or w.certification_id = c.id)
		), '[]'::jsonb)
	);
	return v_out;
end;
$fn$;
revoke all on function public.cert_get(text) from public, anon, authenticated, service_role;
grant execute on function public.cert_get(text) to authenticated;

-- The engine's list: every certification the caller may certify, every state.
create or replace function public.cert_admin_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_admin boolean := public.is_admin();
begin
	if not public._cert_is_certifier() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', c.id, 'code', c.code, 'name', c.name, 'level', c.level, 'category', c.category,
			'sort_order', c.sort_order, 'state', c.state, 'renewal', c.renewal,
			'revision', r.revision, 'revision_id', c.current_revision_id,
			'created_at', c.created_at, 'updated_at', c.updated_at,
			'published_at', c.published_at, 'retired_at', c.retired_at,
			'holders_count', (select count(*) from public.cert_awards a
				where a.certification_id = c.id and a.status = 'active' and (a.expires_at is null or a.expires_at > now())),
			'active_attempts', (select count(*) from public.cert_attempts t
				where t.certification_id = c.id and t.state in ('active', 'dormant')),
			'pending_reviews', (select count(*) from public.cert_submissions s
				join public.cert_attempts t on t.id = s.attempt_id
				where t.certification_id = c.id and s.state = 'pending'),
			'publish_problems', to_jsonb(public._cert_publish_check(c.id))
		) order by c.category, c.sort_order, c.level, c.code)
		from public.cert_certifications c
		left join public.cert_revisions r on r.id = c.current_revision_id
		where v_admin or exists (
			select 1 from public.cert_authority a where a.certification_id = c.id and a.email = v_me and a.revoked_at is null
		)
	), '[]'::jsonb);
end;
$fn$;
revoke all on function public.cert_admin_list() from public, anon, authenticated, service_role;
grant execute on function public.cert_admin_list() to authenticated;

-- One certification for the engine page: its current package, every revision,
-- its lessons, a pool SUMMARY (counts, never a question), the publish problems,
-- the authority list (admin only) and the prerequisite codes.
create or replace function public.cert_admin_get(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	c public.cert_certifications%rowtype;
	v_admin boolean;
begin
	perform public._cert_caller();
	select * into c from public.cert_certifications where id = p_id;
	if not found or not public._cert_can_certify(c.id) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	v_admin := public.is_admin();
	return jsonb_build_object(
		'id', c.id, 'code', c.code, 'name', c.name, 'level', c.level, 'category', c.category,
		'sort_order', c.sort_order, 'state', c.state, 'renewal', c.renewal,
		'current_revision_id', c.current_revision_id,
		'created_at', c.created_at, 'updated_at', c.updated_at,
		'published_at', c.published_at, 'retired_at', c.retired_at,
		'package', (select r.package from public.cert_revisions r where r.id = c.current_revision_id),
		'revisions', coalesce((
			select jsonb_agg(jsonb_build_object('id', r.id, 'revision', r.revision, 'note', r.note,
				'created_at', r.created_at, 'created_by', r.created_by) order by r.revision desc)
			from public.cert_revisions r where r.certification_id = c.id
		), '[]'::jsonb),
		'lessons', coalesce((
			select jsonb_agg(jsonb_build_object('id', l.id, 'slug', l.slug, 'title', l.title, 'updated_at', l.updated_at) order by l.slug)
			from public.cert_lessons l where l.certification_id = c.id
		), '[]'::jsonb),
		'pool_summary', jsonb_build_object(
			'total', (select count(*) from public.cert_exam_questions q where q.certification_id = c.id and q.active),
			'by_topic', coalesce((
				select jsonb_object_agg(x.topic, x.n)
				from (select q.topic, count(*) as n from public.cert_exam_questions q
					where q.certification_id = c.id and q.active group by q.topic) x
			), '{}'::jsonb)
		),
		'publish_problems', to_jsonb(public._cert_publish_check(c.id)),
		'authority', case when v_admin then coalesce((
			select jsonb_agg(a.email order by a.email) from public.cert_authority a
			where a.certification_id = c.id and a.revoked_at is null
		), '[]'::jsonb) else null end,
		'prerequisites', coalesce((
			select jsonb_agg(q.code order by q.code) from public.cert_prerequisites pr
			join public.cert_certifications q on q.id = pr.requires_id where pr.certification_id = c.id
		), '[]'::jsonb),
		'holders_count', (select count(*) from public.cert_awards a
			where a.certification_id = c.id and a.status = 'active' and (a.expires_at is null or a.expires_at > now())),
		'active_attempts', (select count(*) from public.cert_attempts t
			where t.certification_id = c.id and t.state in ('active', 'dormant'))
	);
end;
$fn$;
revoke all on function public.cert_admin_get(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_admin_get(uuid) to authenticated;

-- A lesson's bytes, for the serving route: published or retired, or the
-- caller is its certifier; null otherwise.
create or replace function public.cert_lesson_document(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	l public.cert_lessons%rowtype;
	v_state text;
begin
	perform public._cert_caller();
	select * into l from public.cert_lessons where id = p_id;
	if not found then
		return null;
	end if;
	select state into v_state from public.cert_certifications where id = l.certification_id;
	if v_state not in ('published', 'retired') and not public._cert_can_certify(l.certification_id) then
		return null;
	end if;
	return jsonb_build_object('id', l.id, 'title', l.title, 'document', l.document,
		'updated_at', l.updated_at, 'manifest', l.manifest);
end;
$fn$;
revoke all on function public.cert_lesson_document(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_lesson_document(uuid) to authenticated;

-- THE ONE READER THAT RETURNS A KEY. Admin only, for the pool editor.
create or replace function public.cert_exam_pool_get(p_cert uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
	perform public._cert_caller();
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if not exists (select 1 from public.cert_certifications where id = p_cert) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object('id', q.id, 'topic', q.topic, 'type', q.type, 'prompt', q.prompt,
			'options', q.options, 'answer', q.answer, 'explain', q.explain, 'active', q.active,
			'updated_at', q.updated_at) order by q.topic, q.created_at, q.id)
		from public.cert_exam_questions q where q.certification_id = p_cert
	), '[]'::jsonb);
end;
$fn$;
revoke all on function public.cert_exam_pool_get(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_exam_pool_get(uuid) to authenticated;

create or replace function public.cert_authority_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
	perform public._cert_caller();
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object('certification_id', a.certification_id, 'code', c.code, 'name', c.name,
			'email', a.email, 'person_name', public._cert_person_name(a.email),
			'granted_at', a.granted_at, 'granted_by', a.granted_by, 'note', a.note)
			order by c.category, c.sort_order, c.code, a.email)
		from public.cert_authority a
		join public.cert_certifications c on c.id = a.certification_id
		where a.revoked_at is null
	), '[]'::jsonb);
end;
$fn$;
revoke all on function public.cert_authority_list() from public, anon, authenticated, service_role;
grant execute on function public.cert_authority_list() to authenticated;
-- ===== PART D END =====

-- ===== PART E BEGIN =====
-- ===== PART E: THE WRITES (ADMIN) =====

create or replace function public.cert_settings_set(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	s public.cert_settings%rowtype;
	v_bad text[] := '{}'::text[];
	v_expiry date;
	v_dorm integer;
	v_checkin integer;
	v_release integer;
begin
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if not public._cert_jt(p, 'object') then
		raise exception 'cert_settings_set: expected an object';
	end if;
	insert into public.cert_settings (id) values (true) on conflict (id) do nothing;
	select * into s from public.cert_settings where id;

	v_expiry := s.school_year_expiry;
	v_dorm := s.dormancy_days;
	v_checkin := s.checkin_timeout_seconds;
	v_release := s.release_window_minutes;

	if p ? 'school_year_expiry' then
		if jsonb_typeof(p -> 'school_year_expiry') = 'null' then
			v_expiry := null;
		elsif public._cert_jt(p -> 'school_year_expiry', 'string') and (p ->> 'school_year_expiry') ~ '^\d{4}-\d{2}-\d{2}$' then
			begin
				v_expiry := (p ->> 'school_year_expiry')::date;
			exception when others then
				v_bad := array_append(v_bad, 'school_year_expiry: not a real date');
			end;
		else
			v_bad := array_append(v_bad, 'school_year_expiry: must be a date written YYYY-MM-DD, or null');
		end if;
	end if;
	if p ? 'dormancy_days' then
		if not public._cert_jint(p -> 'dormancy_days') then
			v_bad := array_append(v_bad, 'dormancy_days: must be a whole number of days');
		elsif (p ->> 'dormancy_days')::numeric not between 1 and 3650 then
			v_bad := array_append(v_bad, 'dormancy_days: must be from 1 to 3650');
		else
			v_dorm := (p ->> 'dormancy_days')::integer;
		end if;
	end if;
	if p ? 'checkin_timeout_seconds' then
		if not public._cert_jint(p -> 'checkin_timeout_seconds') then
			v_bad := array_append(v_bad, 'checkin_timeout_seconds: must be a whole number of seconds');
		elsif (p ->> 'checkin_timeout_seconds')::numeric not between 10 and 600 then
			v_bad := array_append(v_bad, 'checkin_timeout_seconds: must be from 10 to 600');
		else
			v_checkin := (p ->> 'checkin_timeout_seconds')::integer;
		end if;
	end if;
	if p ? 'release_window_minutes' then
		if not public._cert_jint(p -> 'release_window_minutes') then
			v_bad := array_append(v_bad, 'release_window_minutes: must be a whole number of minutes');
		elsif (p ->> 'release_window_minutes')::numeric not between 1 and 120 then
			v_bad := array_append(v_bad, 'release_window_minutes: must be from 1 to 120');
		else
			v_release := (p ->> 'release_window_minutes')::integer;
		end if;
	end if;
	if array_length(v_bad, 1) is not null then
		return public._cert_refuse('invalid', 'Some settings are not valid.') || jsonb_build_object('problems', to_jsonb(v_bad));
	end if;

	update public.cert_settings
	set school_year_expiry = v_expiry, dormancy_days = v_dorm, checkin_timeout_seconds = v_checkin,
		release_window_minutes = v_release, updated_at = now(), updated_by = v_me
	where id;
	perform public._cert_event('settings.changed', v_me, null, null, null, jsonb_build_object(
		'school_year_expiry', v_expiry, 'dormancy_days', v_dorm,
		'checkin_timeout_seconds', v_checkin, 'release_window_minutes', v_release), null);
	return jsonb_build_object('ok', true) || public.cert_settings();
end;
$fn$;
revoke all on function public.cert_settings_set(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.cert_settings_set(jsonb) to authenticated;

-- A new draft (p_id null, code must be new) or a new revision of an existing
-- certification (code may not change once published). Refuses a package the
-- shape check faults; rewrites the prerequisites; moves the identity columns.
create or replace function public.cert_admin_save(p_id uuid, p_package jsonb, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_bad text[];
	v_code text;
	v_pkg jsonb;
	c public.cert_certifications%rowtype;
	v_id uuid;
	v_rev integer;
	v_rev_id uuid;
	v_pre text;
begin
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	v_bad := public._cert_package_check(p_package);
	if array_length(v_bad, 1) is not null then
		return public._cert_refuse('invalid', 'The package has problems.') || jsonb_build_object('problems', to_jsonb(v_bad));
	end if;
	v_code := upper(btrim(p_package ->> 'code'));
	v_pkg := p_package || jsonb_build_object('code', v_code);

	if p_id is null then
		if exists (select 1 from public.cert_certifications where code = v_code) then
			return public._cert_refuse('code_taken', 'A certification with the code ' || v_code || ' already exists.');
		end if;
		insert into public.cert_certifications (code, name, level, category, sort_order, renewal, created_by)
		values (v_code, public._cert_norm(v_pkg ->> 'name'), (v_pkg ->> 'level')::integer,
			public._cert_norm(v_pkg ->> 'category'), (v_pkg ->> 'sort_order')::integer, v_pkg ->> 'renewal', v_me)
		returning id into v_id;
		v_rev := 1;
	else
		select * into c from public.cert_certifications where id = p_id for update;
		if not found then
			return public._cert_refuse('not_found', 'Not found.');
		end if;
		v_id := c.id;
		if c.code <> v_code then
			if c.state <> 'draft' or c.published_at is not null then
				return public._cert_refuse('code_locked', 'The code cannot change once a certification has been published.');
			end if;
			if exists (select 1 from public.cert_certifications where code = v_code and id <> c.id) then
				return public._cert_refuse('code_taken', 'A certification with the code ' || v_code || ' already exists.');
			end if;
		end if;
		select coalesce(max(revision), 0) + 1 into v_rev from public.cert_revisions where certification_id = c.id;
		update public.cert_certifications
		set code = v_code, name = public._cert_norm(v_pkg ->> 'name'), level = (v_pkg ->> 'level')::integer,
			category = public._cert_norm(v_pkg ->> 'category'), sort_order = (v_pkg ->> 'sort_order')::integer,
			renewal = v_pkg ->> 'renewal', updated_at = now()
		where id = c.id;
	end if;

	insert into public.cert_revisions (certification_id, revision, package, note, created_by)
	values (v_id, v_rev, v_pkg, nullif(public._cert_norm(p_note), ''), v_me)
	returning id into v_rev_id;
	update public.cert_certifications set current_revision_id = v_rev_id, updated_at = now() where id = v_id;

	delete from public.cert_prerequisites where certification_id = v_id;
	for v_pre in select upper(btrim(value #>> '{}')) from jsonb_array_elements(v_pkg -> 'prerequisites') loop
		insert into public.cert_prerequisites (certification_id, requires_id)
		select v_id, q.id from public.cert_certifications q where q.code = v_pre
		on conflict do nothing;
	end loop;

	perform public._cert_event('catalog.saved', v_me, null, v_id, null,
		jsonb_build_object('code', v_code, 'revision', v_rev, 'revision_id', v_rev_id), nullif(public._cert_norm(p_note), ''));
	return jsonb_build_object('ok', true, 'id', v_id, 'revision_id', v_rev_id, 'revision', v_rev,
		'publish_problems', to_jsonb(public._cert_publish_check(v_id)));
end;
$fn$;
revoke all on function public.cert_admin_save(uuid, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.cert_admin_save(uuid, jsonb, text) to authenticated;

create or replace function public.cert_admin_publish(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	c public.cert_certifications%rowtype;
	v_bad text[];
begin
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	select * into c from public.cert_certifications where id = p_id for update;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if c.state = 'retired' then
		return public._cert_refuse('retired', 'A retired certification is not published again. Save it as a new one if it is coming back.');
	end if;
	v_bad := public._cert_publish_check(c.id);
	if array_length(v_bad, 1) is not null then
		return public._cert_refuse('incomplete', 'This certification is not complete enough to publish.') || jsonb_build_object('problems', to_jsonb(v_bad));
	end if;
	update public.cert_certifications
	set state = 'published', published_at = coalesce(published_at, now()), updated_at = now()
	where id = c.id;
	perform public._cert_event('catalog.published', v_me, null, c.id, null, jsonb_build_object('code', c.code), null);
	return jsonb_build_object('ok', true, 'notify', '[]'::jsonb, 'sync', true);
end;
$fn$;
revoke all on function public.cert_admin_publish(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_admin_publish(uuid) to authenticated;

-- Published back to draft, ONLY with no awards and no live attempts (D7).
create or replace function public.cert_admin_hide(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	c public.cert_certifications%rowtype;
	v_awards integer;
	v_attempts integer;
begin
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	select * into c from public.cert_certifications where id = p_id for update;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if c.state <> 'published' then
		return public._cert_refuse('not_published', 'Only a published certification can be hidden.');
	end if;
	select count(*) into v_awards from public.cert_awards a where a.certification_id = c.id;
	select count(*) into v_attempts from public.cert_attempts t where t.certification_id = c.id and t.state in ('active', 'dormant');
	if v_awards > 0 or v_attempts > 0 then
		return public._cert_refuse('in_use', 'This certification has ' || v_awards || ' award(s) and ' || v_attempts
			|| ' attempt(s) in progress, so it cannot go back to a draft. Retire it instead.')
			|| jsonb_build_object('awards', v_awards, 'active_attempts', v_attempts);
	end if;
	update public.cert_certifications set state = 'draft', updated_at = now() where id = c.id;
	perform public._cert_event('catalog.hidden', v_me, null, c.id, null, jsonb_build_object('code', c.code), null);
	return jsonb_build_object('ok', true, 'sync', true);
end;
$fn$;
revoke all on function public.cert_admin_hide(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_admin_hide(uuid) to authenticated;

-- Published to retired: no new starts, every award untouched, every live
-- attempt keeps working.
create or replace function public.cert_admin_retire(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	c public.cert_certifications%rowtype;
begin
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	select * into c from public.cert_certifications where id = p_id for update;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if c.state <> 'published' then
		return public._cert_refuse('not_published', 'Only a published certification can be retired.');
	end if;
	update public.cert_certifications set state = 'retired', retired_at = now(), updated_at = now() where id = c.id;
	perform public._cert_event('catalog.retired', v_me, null, c.id, null, jsonb_build_object('code', c.code), null);
	return jsonb_build_object('ok', true, 'sync', true);
end;
$fn$;
revoke all on function public.cert_admin_retire(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_admin_retire(uuid) to authenticated;

-- ONLY a draft that was never published and has no attempts. The revisions,
-- lessons, pool and prerequisites go with it by cascade.
create or replace function public.cert_admin_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	c public.cert_certifications%rowtype;
begin
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	select * into c from public.cert_certifications where id = p_id for update;
	if not found then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if c.state <> 'draft' or c.published_at is not null
		or exists (select 1 from public.cert_attempts t where t.certification_id = c.id) then
		return public._cert_refuse('not_deletable', 'Only a draft that was never published and has no attempts can be deleted. Retire it instead.');
	end if;
	perform public._cert_event('catalog.deleted', v_me, null, c.id, null, jsonb_build_object('code', c.code, 'name', c.name), null);
	update public.cert_certifications set current_revision_id = null where id = c.id;
	delete from public.cert_certifications where id = c.id;
	return jsonb_build_object('ok', true);
end;
$fn$;
revoke all on function public.cert_admin_delete(uuid) from public, anon, authenticated, service_role;
grant execute on function public.cert_admin_delete(uuid) to authenticated;

-- Upsert a lesson by (certification, slug). The manifest must be an object;
-- the block-shape validation runs in TypeScript at save and import time (this
-- file applies over a chain with no classroom tables, and a lesson's manifest
-- decides no write and stores no answer).
create or replace function public.cert_lesson_save(p_cert uuid, p_slug text, p_title text, p_document text, p_manifest jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_slug text := lower(public._cert_norm(p_slug));
	v_title text := public._cert_norm(p_title);
	v_id uuid;
begin
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if not exists (select 1 from public.cert_certifications where id = p_cert) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if v_slug !~ '^[a-z0-9][a-z0-9-]{0,63}$' then
		return public._cert_refuse('invalid', 'A lesson slug is lowercase letters, digits and hyphens, up to 64 characters.');
	end if;
	if v_title = '' then
		return public._cert_refuse('invalid', 'A lesson needs a title.');
	end if;
	if public._cert_norm(p_document) = '' then
		return public._cert_refuse('invalid', 'A lesson needs a document.');
	end if;
	if length(p_document) > 1500000 then
		return public._cert_refuse('invalid', 'A lesson document is at most 1,500,000 characters.');
	end if;
	if not public._cert_jt(coalesce(p_manifest, '{}'::jsonb), 'object') then
		return public._cert_refuse('invalid', 'A lesson manifest is a JSON object.');
	end if;
	insert into public.cert_lessons (certification_id, slug, title, document, manifest, updated_by)
	values (p_cert, v_slug, v_title, p_document, coalesce(p_manifest, '{}'::jsonb), v_me)
	on conflict (certification_id, slug) do update
		set title = excluded.title, document = excluded.document, manifest = excluded.manifest,
			updated_at = now(), updated_by = excluded.updated_by
	returning id into v_id;
	perform public._cert_event('catalog.saved', v_me, null, p_cert, null, jsonb_build_object('lesson', v_slug), null);
	return jsonb_build_object('ok', true, 'id', v_id);
end;
$fn$;
revoke all on function public.cert_lesson_save(uuid, text, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.cert_lesson_save(uuid, text, text, text, jsonb) to authenticated;

create or replace function public.cert_lesson_delete(p_cert uuid, p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_slug text := lower(public._cert_norm(p_slug));
	v_pkg jsonb;
begin
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if not exists (select 1 from public.cert_lessons where certification_id = p_cert and slug = v_slug) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	select r.package into v_pkg from public.cert_certifications c
	join public.cert_revisions r on r.id = c.current_revision_id where c.id = p_cert;
	if exists (
		select 1 from jsonb_array_elements(coalesce(v_pkg -> 'training' -> 'items', '[]'::jsonb)) i
		where (i ->> 'kind') = 'lesson' and (i ->> 'slug') = v_slug
	) then
		return public._cert_refuse('in_use', 'The current revision still names this lesson in its training. Remove it there first.');
	end if;
	delete from public.cert_lessons where certification_id = p_cert and slug = v_slug;
	perform public._cert_event('catalog.saved', v_me, null, p_cert, null, jsonb_build_object('lesson_deleted', v_slug), null);
	return jsonb_build_object('ok', true);
end;
$fn$;
revoke all on function public.cert_lesson_delete(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.cert_lesson_delete(uuid, text) to authenticated;

-- Replace the pool whole: rows whose id is present are updated, rows absent are
-- set inactive (never deleted, because a stored draw may name them), new rows
-- are inserted. Every question is validated against the current package's
-- topics before anything is written.
create or replace function public.cert_exam_pool_replace(p_cert uuid, p_questions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_pkg jsonb;
	v_topics text[];
	v_bad text[] := '{}'::text[];
	q jsonb;
	v_i integer := 0;
	v_type text;
	v_keys text[];
	v_opt jsonb;
	v_ans jsonb;
	v_ids uuid[] := '{}'::uuid[];
	v_id uuid;
	v_label text;
	v_total integer;
begin
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	select r.package into v_pkg from public.cert_certifications c
	join public.cert_revisions r on r.id = c.current_revision_id where c.id = p_cert;
	if v_pkg is null then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if not public._cert_jt(p_questions, 'array') then
		raise exception 'cert_exam_pool_replace: expected an array of questions';
	end if;
	select coalesce(array_agg(t ->> 'id'), '{}'::text[]) into v_topics
	from jsonb_array_elements(coalesce(v_pkg -> 'exam' -> 'topics', '[]'::jsonb)) t;

	for q in select value from jsonb_array_elements(p_questions) loop
		v_label := 'questions[' || v_i || ']';
		v_i := v_i + 1;
		if not public._cert_jt(q, 'object') then
			v_bad := array_append(v_bad, (v_label || ': must be an object'));
			continue;
		end if;
		if not ((q ->> 'topic') = any (v_topics)) then
			v_bad := array_append(v_bad, (v_label || '.topic: ' || coalesce(q ->> 'topic', '(none)') || ' is not a topic of the current revision'));
		end if;
		v_type := q ->> 'type';
		if coalesce(v_type, '') not in ('multiple_choice', 'multiple_select', 'numeric', 'short') then
			v_bad := array_append(v_bad, (v_label || '.type: must be multiple_choice, multiple_select, numeric or short'));
			continue;
		end if;
		if not public._cert_jt(q -> 'prompt', 'string') or public._cert_norm(q ->> 'prompt') = '' then
			v_bad := array_append(v_bad, (v_label || '.prompt: must be a non-empty string'));
		end if;
		if (q ? 'explain') and jsonb_typeof(q -> 'explain') not in ('string', 'null') then
			v_bad := array_append(v_bad, (v_label || '.explain: must be a string'));
		end if;
		if (q ? 'active') and not public._cert_jt(q -> 'active', 'boolean') then
			v_bad := array_append(v_bad, (v_label || '.active: must be true or false'));
		end if;
		if (q ? 'id') and jsonb_typeof(q -> 'id') <> 'null' then
			if not public._cert_jt(q -> 'id', 'string') or (q ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
				v_bad := array_append(v_bad, (v_label || '.id: must be the uuid of an existing question'));
			elsif not exists (select 1 from public.cert_exam_questions x where x.id = (q ->> 'id')::uuid and x.certification_id = p_cert) then
				v_bad := array_append(v_bad, (v_label || '.id: names no question of this certification'));
			elsif ((q ->> 'id')::uuid) = any (v_ids) then
				v_bad := array_append(v_bad, (v_label || '.id: appears twice'));
			else
				v_ids := v_ids || (q ->> 'id')::uuid;
			end if;
		end if;
		v_ans := q -> 'answer';
		if v_type in ('multiple_choice', 'multiple_select') then
			v_keys := '{}'::text[];
			if not public._cert_jt(q -> 'options', 'array') or jsonb_array_length(q -> 'options') < 2 or jsonb_array_length(q -> 'options') > 8 then
				v_bad := array_append(v_bad, (v_label || '.options: a choice question has 2 to 8 options'));
			else
				for v_opt in select value from jsonb_array_elements(q -> 'options') loop
					if not public._cert_jt(v_opt, 'object') or not public._cert_jt(v_opt -> 'key', 'string')
						or (v_opt ->> 'key') !~ '^[a-z]$' or not public._cert_jt(v_opt -> 'text', 'string')
						or public._cert_norm(v_opt ->> 'text') = '' then
						v_bad := array_append(v_bad, (v_label || '.options: every option is a single lowercase letter key and a non-empty text'));
						exit;
					end if;
					if (v_opt ->> 'key') = any (v_keys) then
						v_bad := array_append(v_bad, (v_label || '.options: duplicate key ' || (v_opt ->> 'key')));
					end if;
					v_keys := v_keys || (v_opt ->> 'key');
				end loop;
				if v_type = 'multiple_choice' then
					if not public._cert_jt(v_ans, 'string') or not ((v_ans #>> '{}') = any (v_keys)) then
						v_bad := array_append(v_bad, (v_label || '.answer: must be one of the option keys'));
					end if;
				else
					if not public._cert_jt(v_ans, 'array') or jsonb_array_length(v_ans) < 1 then
						v_bad := array_append(v_bad, (v_label || '.answer: must be an array of option keys'));
					elsif exists (select 1 from jsonb_array_elements(v_ans) a where jsonb_typeof(a) <> 'string' or not ((a #>> '{}') = any (v_keys))) then
						v_bad := array_append(v_bad, (v_label || '.answer: every entry must be one of the option keys'));
					elsif (select count(distinct a #>> '{}') from jsonb_array_elements(v_ans) a) <> jsonb_array_length(v_ans) then
						v_bad := array_append(v_bad, (v_label || '.answer: a key appears twice'));
					end if;
				end if;
			end if;
		else
			if (q ? 'options') and jsonb_typeof(q -> 'options') <> 'null' then
				v_bad := array_append(v_bad, (v_label || '.options: a numeric or short question has no options'));
			end if;
			if v_type = 'numeric' then
				if not public._cert_jt(v_ans, 'object') or not public._cert_jt(v_ans -> 'value', 'number')
					or not public._cert_jt(v_ans -> 'tolerance', 'number') then
					v_bad := array_append(v_bad, (v_label || '.answer: a numeric answer is a value and a tolerance, both numbers'));
				elsif (v_ans ->> 'tolerance')::numeric < 0 then
					v_bad := array_append(v_bad, (v_label || '.answer.tolerance: cannot be negative'));
				elsif (v_ans ? 'unit') and jsonb_typeof(v_ans -> 'unit') not in ('string', 'null') then
					v_bad := array_append(v_bad, (v_label || '.answer.unit: must be a string'));
				end if;
			else
				if not public._cert_jt(v_ans, 'object') or not public._cert_jt(v_ans -> 'accept', 'array')
					or jsonb_array_length(v_ans -> 'accept') < 1 then
					v_bad := array_append(v_bad, (v_label || '.answer: a short answer lists every spelling it accepts'));
				elsif exists (select 1 from jsonb_array_elements(v_ans -> 'accept') a where jsonb_typeof(a) <> 'string' or public._cert_norm(a #>> '{}') = '') then
					v_bad := array_append(v_bad, (v_label || '.answer.accept: every spelling is a non-empty string'));
				end if;
			end if;
		end if;
	end loop;
	if array_length(v_bad, 1) is not null then
		return public._cert_refuse('invalid', 'Some questions have problems.') || jsonb_build_object('problems', to_jsonb(v_bad));
	end if;

	-- Everything checked; now write. Absent rows go inactive.
	update public.cert_exam_questions set active = false, updated_at = now()
	where certification_id = p_cert and active and not (id = any (v_ids));
	for q in select value from jsonb_array_elements(p_questions) loop
		if (q ? 'id') and jsonb_typeof(q -> 'id') <> 'null' then
			update public.cert_exam_questions
			set topic = q ->> 'topic', type = q ->> 'type', prompt = public._cert_norm(q ->> 'prompt'),
				options = case when (q ->> 'type') in ('multiple_choice', 'multiple_select') then q -> 'options' else null end,
				answer = q -> 'answer', explain = nullif(public._cert_norm(q ->> 'explain'), ''),
				active = coalesce((q ->> 'active')::boolean, true), updated_at = now()
			where id = (q ->> 'id')::uuid;
		else
			insert into public.cert_exam_questions (certification_id, topic, type, prompt, options, answer, explain, active)
			values (p_cert, q ->> 'topic', q ->> 'type', public._cert_norm(q ->> 'prompt'),
				case when (q ->> 'type') in ('multiple_choice', 'multiple_select') then q -> 'options' else null end,
				q -> 'answer', nullif(public._cert_norm(q ->> 'explain'), ''), coalesce((q ->> 'active')::boolean, true));
		end if;
	end loop;

	select count(*) into v_total from public.cert_exam_questions where certification_id = p_cert and active;
	perform public._cert_event('catalog.saved', v_me, null, p_cert, null, jsonb_build_object('pool_total', v_total), null);
	return jsonb_build_object('ok', true, 'total', v_total,
		'by_topic', coalesce((select jsonb_object_agg(x.topic, x.n) from (
			select topic, count(*) as n from public.cert_exam_questions where certification_id = p_cert and active group by topic) x), '{}'::jsonb),
		'publish_problems', to_jsonb(public._cert_publish_check(p_cert)));
end;
$fn$;
revoke all on function public.cert_exam_pool_replace(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.cert_exam_pool_replace(uuid, jsonb) to authenticated;

-- Grant one person whole authority over one certification. Upsert, un-revokes.
create or replace function public.cert_authority_grant(p_cert uuid, p_email text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_email text := lower(public._cert_norm(p_email));
begin
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if not exists (select 1 from public.cert_certifications where id = p_cert) then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	if v_email !~ '^[^@\s]+@boscotech\.(edu|net)$' then
		return public._cert_refuse('invalid', 'Authority is granted to a Bosco Tech account (boscotech.edu or boscotech.net).');
	end if;
	insert into public.cert_authority (certification_id, email, granted_by, note)
	values (p_cert, v_email, v_me, nullif(public._cert_norm(p_note), ''))
	on conflict (certification_id, email) do update
		set granted_by = excluded.granted_by, granted_at = now(), note = excluded.note,
			revoked_at = null, revoked_by = null;
	perform public._cert_event('authority.granted', v_me, v_email, p_cert, null, '{}'::jsonb, nullif(public._cert_norm(p_note), ''));
	return jsonb_build_object('ok', true);
end;
$fn$;
revoke all on function public.cert_authority_grant(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.cert_authority_grant(uuid, text, text) to authenticated;

create or replace function public.cert_authority_revoke(p_cert uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_me text := public._cert_caller();
	v_email text := lower(public._cert_norm(p_email));
	v_n integer;
begin
	if not public.is_admin() then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	update public.cert_authority set revoked_at = now(), revoked_by = v_me
	where certification_id = p_cert and email = v_email and revoked_at is null;
	get diagnostics v_n = row_count;
	if v_n = 0 then
		return public._cert_refuse('not_found', 'Not found.');
	end if;
	perform public._cert_event('authority.revoked', v_me, v_email, p_cert, null, '{}'::jsonb, null);
	return jsonb_build_object('ok', true);
end;
$fn$;
revoke all on function public.cert_authority_revoke(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.cert_authority_revoke(uuid, text) to authenticated;
-- ===== PART E END =====

-- ===== PART F BEGIN =====
-- ===== PART F: RESERVE /certifications IN THE SHORT-LINK GUARD (0215's shape) =====
-- /certifications is a real top-level route, so a short link of that name would
-- never be reached; CLAUDE.md requires the predicate and RESERVED_SLUGS in
-- src/lib/short-links.ts to name every slug-shaped route directory. 0231
-- section 9b's list, verbatim, with 'certifications' added in order. An
-- existing short link named certifications is moved, intact, to the first free
-- certifications-link spelling and recorded in 0215's audit table first.
-- Re-applying finds nothing to move.

do $$
declare
	r public.app_short_links%rowtype;
	v_candidate text := 'certifications-link';
	v_suffix integer := 2;
begin
	select * into r from public.app_short_links where slug = 'certifications' for update;
	if found then
		while exists (select 1 from public.app_short_links where slug = v_candidate) loop
			v_candidate := 'certifications-link-' || v_suffix::text;
			v_suffix := v_suffix + 1;
		end loop;
		update public.app_short_links set slug = v_candidate where slug = r.slug;
		insert into public.app_short_link_reserved_moves (
			original_slug, moved_slug, target, label, active, created_by, created_at, updated_at, migration
		) values (
			r.slug, v_candidate, r.target, r.label, r.active, r.created_by, r.created_at, r.updated_at, '0260'
		) on conflict (original_slug) do nothing;
		raise notice '0260: moved existing short link from "%" to "%"; target=% active=%.', r.slug, v_candidate, r.target, r.active;
	end if;
end
$$;

create or replace function public._app_short_link_reserved(p_slug text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
	select p_slug in (
		'a', 'admin', 'api', 'archive', 'armory', 'assignments', 'auth', 'b',
		'certifications', 'classroom',
		'coin-balance', 'coin-desk', 'coin-entry', 'coins', 'contracts',
		'dashboard', 'dev', 'downloads', 'foundry', 'frc', 'fsp', 'fsp-pulse',
		'fsp-tech-selection', 'gauntlet', 'greenline', 'hx', 'ideacad',
		'manifest.webmanifest', 'maps', 'notebook', 'push-sw.js', 'reference',
		'robots.txt', 'sitemap.xml', 'tools', 'tournaments', 'vanguard'
	);
$$;

revoke all on function public._app_short_link_reserved(text) from public, anon, authenticated;
grant execute on function public._app_short_link_reserved(text) to service_role;
-- ===== PART F END =====

-- ===== PART Z BEGIN =====
-- ===== SELF-CHECK (kept last) =====
-- The end state of this file's OWN objects and nothing else: every client
-- function is closed to anon and open to authenticated; every private helper is
-- closed to both; every table has row level security on and no client grant;
-- the settings row exists; the slug predicate has 37 names, reserves
-- certifications and not the open-lab control. A failure raises and the whole
-- file rolls back.
do $z$
declare
	v_fn text;
	v_tbl text;
	v_bad text[] := '{}'::text[];
	v_oid oid;
	v_count integer;
begin
	foreach v_fn in array array[
		'cert_is_certifier()',
		'cert_my_authority()',
		'cert_settings()',
		'cert_settings_set(jsonb)',
		'cert_catalog()',
		'cert_get(text)',
		'cert_admin_list()',
		'cert_admin_get(uuid)',
		'cert_admin_save(uuid, jsonb, text)',
		'cert_admin_publish(uuid)',
		'cert_admin_hide(uuid)',
		'cert_admin_retire(uuid)',
		'cert_admin_delete(uuid)',
		'cert_lesson_save(uuid, text, text, text, jsonb)',
		'cert_lesson_delete(uuid, text)',
		'cert_lesson_document(uuid)',
		'cert_exam_pool_get(uuid)',
		'cert_exam_pool_replace(uuid, jsonb)',
		'cert_authority_list()',
		'cert_authority_grant(uuid, text, text)',
		'cert_authority_revoke(uuid, text)'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, (v_fn || ' is missing'));
		else
			if has_function_privilege('anon', v_oid, 'execute') then
				v_bad := array_append(v_bad, (v_fn || ' is executable by anon'));
			end if;
			if not has_function_privilege('authenticated', v_oid, 'execute') then
				v_bad := array_append(v_bad, (v_fn || ' is not executable by authenticated'));
			end if;
		end if;
	end loop;

	foreach v_fn in array array[
		'_cert_caller()',
		'_cert_norm(text)',
		'_cert_refuse(text, text)',
		'_cert_jt(jsonb, text)',
		'_cert_jint(jsonb)',
		'_cert_can_certify(uuid)',
		'_cert_is_certifier()',
		'_cert_event(text, text, text, uuid, uuid, jsonb, text)',
		'_cert_person_name(text)',
		'_cert_question_check(jsonb, text)',
		'_cert_project_check(jsonb, text, boolean)',
		'_cert_package_check(jsonb)',
		'_cert_publish_check(uuid)',
		'_cert_summary_json(uuid, text)'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, (v_fn || ' is missing'));
		elsif has_function_privilege('anon', v_oid, 'execute')
			or has_function_privilege('authenticated', v_oid, 'execute')
			or has_function_privilege('service_role', v_oid, 'execute') then
			v_bad := array_append(v_bad, (v_fn || ' is executable by a client'));
		end if;
	end loop;

	foreach v_tbl in array array[
		'cert_settings', 'cert_certifications', 'cert_revisions', 'cert_prerequisites',
		'cert_lessons', 'cert_exam_questions', 'cert_authority', 'cert_events'
	] loop
		if not exists (
			select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relname = v_tbl and c.relrowsecurity
		) then
			v_bad := array_append(v_bad, (v_tbl || ' has no row level security'));
		end if;
		if has_table_privilege('anon', 'public.' || v_tbl, 'select,insert,update,delete,truncate,references,trigger')
			or has_table_privilege('authenticated', 'public.' || v_tbl, 'select,insert,update,delete,truncate,references,trigger') then
			v_bad := array_append(v_bad, (v_tbl || ' carries a client grant'));
		end if;
		if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = v_tbl) then
			v_bad := array_append(v_bad, (v_tbl || ' carries a policy'));
		end if;
	end loop;
	if has_sequence_privilege('anon', 'public.cert_events_id_seq', 'usage,select,update')
		or has_sequence_privilege('authenticated', 'public.cert_events_id_seq', 'usage,select,update') then
		v_bad := array_append(v_bad, 'cert_events_id_seq carries a client grant');
	end if;

	if not exists (select 1 from public.cert_settings where id) then
		v_bad := array_append(v_bad, 'the settings row was not seeded');
	end if;

	-- The slug reservation.
	if not public._app_short_link_reserved('certifications') then
		v_bad := array_append(v_bad, 'certifications is not reserved');
	end if;
	if public._app_short_link_reserved('open-lab') then
		v_bad := array_append(v_bad, 'the negative control open-lab is reserved');
	end if;
	if exists (select 1 from public.app_short_links where slug = 'certifications') then
		v_bad := array_append(v_bad, 'an app_short_links row still occupies certifications');
	end if;
	select count(*) into v_count
	from pg_proc p, lateral regexp_matches(p.prosrc, '''([^'']*)''', 'g') as m
	where p.proname = '_app_short_link_reserved' and p.pronamespace = 'public'::regnamespace;
	if v_count <> 37 then
		v_bad := array_append(v_bad, ('the short-link predicate has ' || v_count || ' literals instead of 37'));
	end if;
	if has_function_privilege('anon', 'public._app_short_link_reserved(text)', 'execute')
		or has_function_privilege('authenticated', 'public._app_short_link_reserved(text)', 'execute') then
		v_bad := array_append(v_bad, 'a client role can execute the private short-link predicate');
	end if;

	if array_length(v_bad, 1) is not null then
		raise exception '0260 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0260 cert engine: 8 tables with RLS on and no client grant, 21 client functions closed to anon, 14 private helpers closed to every client, settings seeded, certifications reserved (37 names).';
end $z$;
-- ===== PART Z END =====
