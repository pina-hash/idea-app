-- ---------------------------------------------------------------------------
-- 0231  IDEA ARMORY: THE FILE VAULT'S SCHEMA, RPCS, AND CONNECT CODES.
--
-- PROPOSED, NOT A MIGRATION YET. This file lives in docs/armory/proposed/ on
-- purpose: .github/workflows/migrate.yml applies the lowest unapplied file in
-- supabase/migrations/ to PRODUCTION on every push to main, so a file placed
-- there goes live within minutes. The router chat assigns the number and Mr.
-- Pina approves it (docs/decisions/entries, armory-migration-number). Until
-- then the only database this file has touched is the test cluster, through
-- tests/db/armory-proposed.ts, which reads it IN PLACE.
--
-- WHAT IT IS. pina-hash/idea-armory server/sql/001 to 004 at b18791d, merged
-- into one file, with these differences, each one deliberate:
--
--   1. No `create extension pgcrypto`. gen_random_uuid() is core PostgreSQL
--      since 13 and nothing here calls a pgcrypto function; extension DDL is
--      also a statement tools/apply-migration.mjs refuses to send.
--   2. 004's columns are folded into the CREATE TABLE statements
--      (armory_files.folder, armory_projects.pinned_release and release_gate),
--      and 004's armory_current_email (empty identity refused, SQLSTATE 42501)
--      is the only definition. Every function body is otherwise 001 to 004's,
--      re-laid out but not reworded; tests/db/armory-proposed.test.ts runs the
--      lock race and the stale-parent commit against it.
--   3. GRANTS NAME THEIR ROLES (the 0166 shape). 001 to 003 revoked the
--      internal helpers from public and anon only, which on a hosted project
--      leaves a DIRECT authenticated grant from the default privileges: any
--      signed-in student could have called armory_add_change, armory_replay
--      or armory_remember through PostgREST and written change-feed rows or
--      operation receipts into a project they are not in. Here every helper
--      is revoked from public, anon and authenticated; only the RPCs the
--      agent calls, plus armory_current_email and armory_is_member (named
--      inside RLS policies, so evaluated as the querying role), are granted
--      back to authenticated. Nothing in this file is executable by anon.
--   4. One new table, armory_connect_codes (contract section 3c): the
--      one-time connect code, kept only as its SHA-256, with RLS on, no
--      policy and no client grant. Only the server's service role reads and
--      writes it.
--   5. armory_change_feed joins the supabase_realtime publication when that
--      publication exists (contract section 4), with the 0062 guard shape.
--   6. /armory is reserved in the short-link guard (section 9b), 0215's shape:
--      `_app_short_link_reserved` re-created with 'armory' added, after moving
--      any existing short link of that name. This is the one existing object
--      the file changes, and tests/db/armory-proposed.test.ts asserts it is
--      the only one.
--   7. Idempotent. Types, tables, constraints and publication membership are
--      guarded, functions are create or replace, policies and triggers are
--      dropped and recreated. Re-pasting the file is a no-op.
--
-- IDENTITY. public.current_user_email() and public.is_admin() are the real
-- 0067 functions. There is no test seam in this file: the idea-armory test
-- stub (armory.test_email) is not carried over, and the suite proves a
-- caller-set setting changes nothing.
--
-- ADDITIVE except 9b. Every other object is new and named armory_*. 9b's
-- reversal is 0215's predicate re-created without 'armory'. To undo the rest
-- before any client depends on it: drop the armory_*
-- functions, tables and the armory_member_role type by hand in the SQL editor
-- (a person's paste, never a migration).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Types and tables.
-- ---------------------------------------------------------------------------

do $$
begin
	if not exists (
		select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
		where n.nspname = 'public' and t.typname = 'armory_member_role'
	) then
		create type public.armory_member_role as enum ('student', 'cad_lead', 'mentor', 'instructor');
	end if;
end
$$;

create table if not exists public.armory_projects (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	part_number_pattern text not null default '5669-{YY}-{SS}{NN}',
	season smallint not null,
	pinned_release smallint not null default 2025 check (pinned_release >= 1995),
	release_gate text not null default 'warn' check (release_gate in ('enforce', 'warn')),
	created_at timestamptz not null default now()
);

create table if not exists public.armory_members (
	project_id uuid not null references public.armory_projects on delete cascade,
	email text not null check (email = lower(btrim(email))),
	role public.armory_member_role not null,
	primary key (project_id, email)
);

create table if not exists public.armory_devices (
	id uuid primary key default gen_random_uuid(),
	owner_email text not null,
	name text not null check (btrim(name) <> ''),
	registered_at timestamptz not null default now(),
	unique (owner_email, id)
);

create table if not exists public.armory_files (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references public.armory_projects,
	folder text not null default '',
	name text not null,
	current_version_id uuid,
	deleted_at timestamptz,
	created_at timestamptz not null default now()
);

-- normalize(..., NFC) is PostgreSQL's Unicode normalization, not an application convention.
create unique index if not exists armory_files_project_normalized_name_key
	on public.armory_files (project_id, lower(normalize(name, NFC)));

create table if not exists public.armory_versions (
	id uuid primary key default gen_random_uuid(),
	file_id uuid not null references public.armory_files,
	parent_version_id uuid references public.armory_versions,
	object_key text not null,
	content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
	byte_length bigint not null check (byte_length >= 0),
	author_email text not null,
	created_at timestamptz not null default now()
);

do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'armory_files_current_version_fk'
			and conrelid = 'public.armory_files'::regclass
	) then
		alter table public.armory_files add constraint armory_files_current_version_fk
			foreign key (current_version_id) references public.armory_versions;
	end if;
end
$$;

create table if not exists public.armory_side_versions (
	id uuid primary key default gen_random_uuid(),
	file_id uuid not null references public.armory_files,
	parent_version_id uuid references public.armory_versions,
	object_key text not null,
	content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
	byte_length bigint not null check (byte_length >= 0),
	author_email text not null,
	reason text not null,
	created_at timestamptz not null default now()
);

create table if not exists public.armory_locks (
	file_id uuid primary key references public.armory_files,
	holder_email text not null,
	holder_device_id uuid not null references public.armory_devices,
	acquired_at timestamptz not null default now(),
	broken_at timestamptz,
	broken_by text,
	broken_holder_email text,
	broken_holder_device_id uuid references public.armory_devices
);

create table if not exists public.armory_tombstones (
	file_id uuid primary key references public.armory_files,
	version_id uuid references public.armory_versions,
	author_email text not null,
	created_at timestamptz not null default now()
);

create table if not exists public.armory_part_number_allocations (
	id uuid primary key default gen_random_uuid(),
	project_id uuid not null references public.armory_projects,
	season smallint not null,
	subsystem smallint not null check (subsystem between 0 and 99),
	sequence integer not null check (sequence between 0 and 99),
	part_number text not null,
	allocated_by text not null,
	allocated_at timestamptz not null default now(),
	unique (project_id, season, subsystem, sequence),
	unique (project_id, part_number)
);

create table if not exists public.armory_change_feed (
	cursor bigint generated always as identity primary key,
	project_id uuid not null references public.armory_projects,
	kind text not null,
	entity_id uuid not null,
	payload jsonb not null default '{}',
	created_at timestamptz not null default now()
);

create table if not exists public.armory_operation_receipts (
	operation_id uuid primary key,
	caller_email text not null,
	rpc_name text not null,
	result jsonb not null,
	completed_at timestamptz not null default now()
);

-- One immutable row per SolidWorks version or side version: the saved release the agent
-- read, or null when no reader could check it ("release not checked").
create table if not exists public.armory_version_releases (
	version_id uuid primary key,
	file_id uuid not null references public.armory_files,
	side boolean not null,
	saved_release smallint check (saved_release is null or saved_release >= 1995),
	release_checked boolean generated always as (saved_release is not null) stored,
	recorded_by text not null,
	created_at timestamptz not null default now()
);

-- Contract section 3c: a connect code is 32 random bytes the browser hands to the
-- agent's loopback listener. Only its SHA-256 is stored, it lives two minutes, and it
-- is bound to the user, the PKCE challenge, the state and the device name. The server's
-- service role is the only reader and writer; no client role holds any privilege here.
create table if not exists public.armory_connect_codes (
	code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
	user_id uuid not null,
	email text not null check (email = lower(btrim(email)) and email <> ''),
	challenge text not null check (challenge ~ '^[A-Za-z0-9_-]{43}$'),
	state text not null check (state ~ '^[A-Za-z0-9_-]+$' and length(state) <= 256),
	device_name text not null check (btrim(device_name) <> '' and length(device_name) <= 100),
	expires_at timestamptz not null,
	used boolean not null default false,
	created_at timestamptz not null default now()
);

create index if not exists armory_connect_codes_expires_idx
	on public.armory_connect_codes (expires_at);

-- ---------------------------------------------------------------------------
-- 2. Immutability, identity and the shared helpers (001, with 004's identity rule).
-- ---------------------------------------------------------------------------

create or replace function public.armory_refuse_version_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Armory versions are immutable' using errcode = '55000'; end $$;

drop trigger if exists armory_versions_immutable on public.armory_versions;
create trigger armory_versions_immutable before update or delete on public.armory_versions
	for each row execute function public.armory_refuse_version_mutation();
drop trigger if exists armory_side_versions_immutable on public.armory_side_versions;
create trigger armory_side_versions_immutable before update or delete on public.armory_side_versions
	for each row execute function public.armory_refuse_version_mutation();
drop trigger if exists armory_version_releases_immutable on public.armory_version_releases;
create trigger armory_version_releases_immutable before update or delete on public.armory_version_releases
	for each row execute function public.armory_refuse_version_mutation();

-- idea-app's current_user_email() returns '' (not null) when no user is signed in.
-- Treat both the same way, so an empty identity can never act.
create or replace function public.armory_current_email() returns text
language plpgsql stable security definer set search_path = '' as $$
declare v text := public.current_user_email();
begin
	if v is null or v = '' then raise exception 'current user email is unavailable' using errcode = '42501'; end if;
	return v;
end $$;

create or replace function public.armory_is_member(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
	select exists(select 1 from public.armory_members where project_id = p_project and email = public.armory_current_email()) $$;

create or replace function public.armory_add_change(p_project uuid, p_kind text, p_entity uuid, p_payload jsonb default '{}') returns bigint
language plpgsql security definer set search_path = '' as $$
declare c bigint;
begin
	insert into public.armory_change_feed(project_id, kind, entity_id, payload) values (p_project, p_kind, p_entity, p_payload) returning cursor into c;
	return c;
end $$;

-- Serialize a stable operation ID before looking for its receipt. This makes simultaneous
-- delivery equivalent to sequential replay. NULL means this is the first delivery.
create or replace function public.armory_replay(p_operation uuid, p_rpc text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e text := public.armory_current_email(); r public.armory_operation_receipts;
begin
	if p_operation is null then raise exception 'operation id is required'; end if;
	perform pg_advisory_xact_lock(hashtextextended(p_operation::text, 0));
	select * into r from public.armory_operation_receipts where operation_id = p_operation;
	if found and (r.caller_email <> e or r.rpc_name <> p_rpc) then raise exception 'operation id was already used by another caller or RPC'; end if;
	if found then return r.result; end if;
	return null;
end $$;

create or replace function public.armory_remember(p_operation uuid, p_rpc text, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
	insert into public.armory_operation_receipts(operation_id, caller_email, rpc_name, result) values (p_operation, public.armory_current_email(), p_rpc, p_result);
	return p_result;
end $$;

create or replace function public.armory_require_device(p_device uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
	if not exists(select 1 from public.armory_devices where id = p_device and owner_email = public.armory_current_email()) then
		raise exception 'device is not registered to caller';
	end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The vault RPCs (002).
-- ---------------------------------------------------------------------------

create or replace function public.armory_register_device(p_name text, p_operation uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r jsonb; d uuid;
begin
	r := public.armory_replay(p_operation, 'armory_register_device');
	if r is not null then return (r->>'device_id')::uuid; end if;
	if btrim(coalesce(p_name, '')) = '' then raise exception 'device name is required'; end if;
	insert into public.armory_devices(owner_email, name) values (public.armory_current_email(), p_name) returning id into d;
	perform public.armory_remember(p_operation, 'armory_register_device', jsonb_build_object('device_id', d));
	return d;
end $$;

create or replace function public.armory_acquire_lock(p_file uuid, p_device uuid, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare e text := public.armory_current_email(); p uuid; r jsonb; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_acquire_lock');
	if r is not null then return (r->>'result')::boolean; end if;
	perform public.armory_require_device(p_device);
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
end $$;

create or replace function public.armory_release_lock(p_file uuid, p_device uuid, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare e text := public.armory_current_email(); p uuid; n int; r jsonb; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_release_lock');
	if r is not null then return (r->>'result')::boolean; end if;
	perform public.armory_require_device(p_device);
	delete from public.armory_locks where file_id = p_file and holder_email = e and holder_device_id = p_device and broken_at is null;
	get diagnostics n = row_count; answer := n > 0;
	if answer then
		select project_id into p from public.armory_files where id = p_file;
		perform public.armory_add_change(p, 'lock_released', p_file, jsonb_build_object('device_id', p_device));
	end if;
	perform public.armory_remember(p_operation, 'armory_release_lock', jsonb_build_object('result', answer));
	return answer;
end $$;

create or replace function public.armory_break_lock(p_file uuid, p_device uuid, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare e text := public.armory_current_email(); p uuid; n int; r jsonb; answer boolean; old_email text; old_device uuid;
begin
	r := public.armory_replay(p_operation, 'armory_break_lock');
	if r is not null then return (r->>'result')::boolean; end if;
	perform public.armory_require_device(p_device);
	select project_id into p from public.armory_files where id = p_file;
	if not exists(select 1 from public.armory_members where project_id = p and email = e and role in ('mentor', 'cad_lead')) then
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
end $$;

create or replace function public.armory_save_side_version(p_file uuid, p_parent uuid, p_key text, p_hash text, p_bytes bigint, p_reason text, p_device uuid, p_operation uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e text := public.armory_current_email(); p uuid; v uuid; r jsonb;
begin
	r := public.armory_replay(p_operation, 'armory_save_side_version');
	if r is not null then return (r->>'version_id')::uuid; end if;
	perform public.armory_require_device(p_device);
	select project_id into p from public.armory_files where id = p_file;
	if not public.armory_is_member(p) then raise exception 'not a project member'; end if;
	insert into public.armory_side_versions(file_id, parent_version_id, object_key, content_sha256, byte_length, author_email, reason)
	values (p_file, p_parent, p_key, p_hash, p_bytes, e, p_reason) returning id into v;
	perform public.armory_add_change(p, 'side_version', v, jsonb_build_object('file_id', p_file, 'device_id', p_device));
	perform public.armory_remember(p_operation, 'armory_save_side_version', jsonb_build_object('version_id', v));
	return v;
end $$;

create or replace function public.armory_commit_version(p_file uuid, p_parent uuid, p_key text, p_hash text, p_bytes bigint, p_device uuid, p_operation uuid)
returns table(version_id uuid, advanced boolean)
language plpgsql security definer set search_path = '' as $$
declare e text := public.armory_current_email(); f public.armory_files; v uuid; a boolean; r jsonb;
begin
	r := public.armory_replay(p_operation, 'armory_commit_version');
	if r is not null then return query select (r->>'version_id')::uuid, (r->>'advanced')::boolean; return; end if;
	perform public.armory_require_device(p_device);
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
end $$;

create or replace function public.armory_tombstone(p_file uuid, p_parent uuid, p_device uuid, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare e text := public.armory_current_email(); f public.armory_files; r jsonb; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_tombstone');
	if r is not null then return (r->>'result')::boolean; end if;
	perform public.armory_require_device(p_device);
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
end $$;

create or replace function public.armory_allocate_part_number(p_project uuid, p_subsystem int, p_season int, p_operation uuid)
returns table(part_number text, subsystem_full boolean)
language plpgsql security definer set search_path = '' as $$
declare e text := public.armory_current_email(); s int; n int; pat text; r jsonb;
begin
	r := public.armory_replay(p_operation, 'armory_allocate_part_number');
	if r is not null then part_number := r->>'part_number'; subsystem_full := (r->>'subsystem_full')::boolean; return next; return; end if;
	if not public.armory_is_member(p_project) then raise exception 'not a project member'; end if;
	if p_subsystem not between 0 and 99 then raise exception 'invalid subsystem'; end if;
	select coalesce(p_season, season), part_number_pattern into s, pat from public.armory_projects where id = p_project for update;
	select x into n from generate_series(0, 99) x
	where not exists(select 1 from public.armory_part_number_allocations where project_id = p_project and season = s and subsystem = p_subsystem and sequence = x)
	limit 1;
	if n is null then
		part_number := null; subsystem_full := true;
	else
		part_number := replace(replace(replace(replace(pat, '{YY}', lpad((s % 100)::text, 2, '0')), '{SS}', lpad(p_subsystem::text, 2, '0')), '{NN}', lpad(n::text, 2, '0')), 'YYYY', s::text);
		insert into public.armory_part_number_allocations(project_id, season, subsystem, sequence, part_number, allocated_by)
		values (p_project, s, p_subsystem, n, part_number, e);
		subsystem_full := false;
	end if;
	perform public.armory_remember(p_operation, 'armory_allocate_part_number', jsonb_build_object('part_number', part_number, 'subsystem_full', subsystem_full));
	return next;
end $$;

create or replace function public.armory_list_changes(p_project uuid, p_after bigint default 0) returns setof public.armory_change_feed
language plpgsql stable security definer set search_path = '' as $$
begin
	if not public.armory_is_member(p_project) then raise exception 'not a project member'; end if;
	return query select * from public.armory_change_feed where project_id = p_project and cursor > p_after order by cursor;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The agent's RPCs (004, contract section 6): projects, members, files, moves.
-- ---------------------------------------------------------------------------

-- VaultPath.TryValidateName in Armory.Core, in SQL. The agent's VaultIgnore list is also
-- refused, because the agent would never sync such a name.
create or replace function public.armory_valid_segment(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare stem text;
begin
	if p is null or p = '' or p in ('.', '..') then return false; end if;
	if p ~ '[\u0001-\u001f\u007f-\u009f<>:"/\\|?*]' then return false; end if;
	if right(p, 1) in ('.', ' ') then return false; end if;
	stem := upper(rtrim(split_part(p, '.', 1), ' '));
	if stem in ('CON', 'PRN', 'AUX', 'NUL', 'CONIN' || chr(36), 'CONOUT' || chr(36)) then return false; end if;
	if length(stem) = 4 and left(stem, 3) in ('COM', 'LPT') and position(substr(stem, 4, 1) in '123456789¹²³') > 0 then return false; end if;
	if left(p, 2) = '~' || chr(36) or lower(p) in ('.armory', 'desktop.ini', 'thumbs.db') then return false; end if;
	return true;
end $$;

create or replace function public.armory_valid_folder(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare s text;
begin
	if p is null then return false; end if;
	if p = '' then return true; end if;
	foreach s in array string_to_array(p, '/') loop
		if not public.armory_valid_segment(s) then return false; end if;
	end loop;
	return true;
end $$;

create or replace function public.armory_derived_operation(p_operation uuid, p_purpose text) returns uuid
language sql immutable set search_path = '' as $$
	select md5(p_operation::text || ':' || p_purpose)::uuid $$;

create or replace function public.armory_require_role(p_project uuid, p_roles public.armory_member_role[], p_message text) returns public.armory_member_role
language plpgsql stable security definer set search_path = '' as $$
declare r public.armory_member_role;
begin
	select role into r from public.armory_members where project_id = p_project and email = public.armory_current_email();
	if r is null or not (r = any(p_roles)) then raise exception '%', p_message using errcode = '42501'; end if;
	return r;
end $$;

create or replace function public.armory_name_taken(p_project uuid, p_name text, p_except uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare f public.armory_files;
begin
	select * into f from public.armory_files
	where project_id = p_project and lower(normalize(name, NFC)) = lower(normalize(p_name, NFC)) and id is distinct from p_except
	limit 1;
	if found then
		raise exception 'A file named "%" already exists in this project.', f.name using errcode = '23505',
			detail = jsonb_build_object('existing_folder', f.folder, 'existing_name', f.name, 'file_id', f.id)::text,
			hint = 'Choose another name, or open the existing file.';
	end if;
end $$;

create or replace function public.armory_create_project(p_name text, p_season smallint, p_operation uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e text := public.armory_current_email(); r jsonb; n text; v uuid; existing text;
begin
	r := public.armory_replay(p_operation, 'armory_create_project');
	if r is not null then return (r->>'project_id')::uuid; end if;
	if not coalesce(public.is_admin(), false) then raise exception 'only a site admin may create an Armory project' using errcode = '42501'; end if;
	n := normalize(coalesce(p_name, ''), NFC);
	if not public.armory_valid_segment(n) then raise exception 'The project name "%" cannot be a Windows folder name.', n using errcode = '22023'; end if;
	if p_season is null or p_season not between 2000 and 2100 then raise exception 'season must be a year from 2000 to 2100' using errcode = '22023'; end if;
	-- Each project is a folder under the vault root, so names are unique without regard to case.
	perform pg_advisory_xact_lock(hashtextextended('armory_project_name:' || lower(n), 0));
	select name into existing from public.armory_projects where lower(normalize(name, NFC)) = lower(n) limit 1;
	if found then raise exception 'A project named "%" already exists.', existing using errcode = '23505', detail = jsonb_build_object('existing_name', existing)::text; end if;
	insert into public.armory_projects(name, season) values (n, p_season) returning id into v;
	insert into public.armory_members(project_id, email, role) values (v, e, 'mentor');
	perform public.armory_add_change(v, 'project_created', v, jsonb_build_object('name', n, 'season', p_season, 'by', e));
	perform public.armory_remember(p_operation, 'armory_create_project', jsonb_build_object('project_id', v));
	return v;
end $$;

create or replace function public.armory_add_member(p_project uuid, p_email text, p_role public.armory_member_role, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare e text := public.armory_current_email(); r jsonb; caller public.armory_member_role; target text; old public.armory_member_role; mentors int; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_add_member');
	if r is not null then return (r->>'result')::boolean; end if;
	-- Serialize every membership change in a project so the last-mentor rule cannot race.
	perform 1 from public.armory_projects where id = p_project for update;
	caller := public.armory_require_role(p_project, array['mentor', 'cad_lead']::public.armory_member_role[], 'only a mentor or CAD lead may add members');
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
end $$;

create or replace function public.armory_remove_member(p_project uuid, p_email text, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare e text := public.armory_current_email(); r jsonb; target text; old public.armory_member_role; mentors int; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_remove_member');
	if r is not null then return (r->>'result')::boolean; end if;
	perform 1 from public.armory_projects where id = p_project for update;
	perform public.armory_require_role(p_project, array['mentor']::public.armory_member_role[], 'only a mentor may remove members');
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
end $$;

create or replace function public.armory_create_file(p_project uuid, p_folder text, p_name text, p_device uuid, p_operation uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e text := public.armory_current_email(); r jsonb; folder_n text; name_n text; v uuid;
begin
	r := public.armory_replay(p_operation, 'armory_create_file');
	if r is not null then return (r->>'file_id')::uuid; end if;
	perform public.armory_require_device(p_device);
	if not public.armory_is_member(p_project) then raise exception 'not a project member' using errcode = '42501'; end if;
	folder_n := normalize(coalesce(p_folder, ''), NFC);
	name_n := normalize(coalesce(p_name, ''), NFC);
	if not public.armory_valid_folder(folder_n) then raise exception 'The folder "%" cannot be a Windows folder path.', folder_n using errcode = '22023'; end if;
	if not public.armory_valid_segment(name_n) then raise exception 'The name "%" cannot be a Windows file name.', name_n using errcode = '22023'; end if;
	perform public.armory_name_taken(p_project, name_n, null);
	begin
		insert into public.armory_files(project_id, folder, name) values (p_project, folder_n, name_n) returning id into v;
	exception when unique_violation then
		-- A concurrent creator won; name the folder where its file now lives.
		perform public.armory_name_taken(p_project, name_n, null);
		raise;
	end;
	perform public.armory_add_change(p_project, 'file_created', v, jsonb_build_object('folder', folder_n, 'name', name_n, 'device_id', p_device, 'by', e));
	perform public.armory_remember(p_operation, 'armory_create_file', jsonb_build_object('file_id', v));
	return v;
end $$;

create or replace function public.armory_move_file(p_file uuid, p_folder text, p_name text, p_device uuid, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare e text := public.armory_current_email(); r jsonb; f public.armory_files; folder_n text; name_n text; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_move_file');
	if r is not null then return (r->>'result')::boolean; end if;
	perform public.armory_require_device(p_device);
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
end $$;

-- ---------------------------------------------------------------------------
-- 5. The SolidWorks release gate (004). Warn (the default) accepts a SolidWorks file
-- whose release could not be read and marks it "release not checked"; enforce refuses
-- it. A release known to be newer than the pin is refused in both modes.
-- ---------------------------------------------------------------------------

create or replace function public.armory_check_release(p_file uuid, p_saved_release smallint) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare f public.armory_files; p public.armory_projects;
begin
	select * into f from public.armory_files where id = p_file;
	if not found then raise exception 'file not found' using errcode = 'P0002'; end if;
	if f.name !~* '\.(sldprt|sldasm|slddrw)$' then return false; end if;
	select * into p from public.armory_projects where id = f.project_id;
	if p_saved_release is not null and p_saved_release > p.pinned_release then
		raise exception 'SolidWorks % cannot upload to a vault pinned to %. Keep this private draft or save to %.', p_saved_release, p.pinned_release, p.pinned_release using errcode = '22023';
	end if;
	if p_saved_release is null and p.release_gate = 'enforce' then
		raise exception 'The saved SolidWorks release is unknown; keep the local draft until it can be read.' using errcode = '22023';
	end if;
	return true;
end $$;

create or replace function public.armory_record_release(p_version uuid, p_file uuid, p_side boolean, p_saved_release smallint) returns void
language plpgsql security definer set search_path = '' as $$
begin
	insert into public.armory_version_releases(version_id, file_id, side, saved_release, recorded_by)
	values (p_version, p_file, p_side, p_saved_release, public.armory_current_email())
	on conflict (version_id) do nothing;
end $$;

create or replace function public.armory_commit_version_with_release(p_file uuid, p_parent uuid, p_key text, p_hash text, p_bytes bigint, p_device uuid, p_operation uuid, p_saved_release smallint)
returns table(version_id uuid, advanced boolean)
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v uuid; a boolean; solidworks boolean;
begin
	r := public.armory_replay(p_operation, 'armory_commit_version_with_release');
	if r is not null then return query select (r->>'version_id')::uuid, (r->>'advanced')::boolean; return; end if;
	solidworks := public.armory_check_release(p_file, p_saved_release);
	if exists(select 1 from public.armory_files where id = p_file and deleted_at is not null) then
		-- A removed file never advances, even for its lock holder: the bytes become a side version.
		v := public.armory_save_side_version(p_file, p_parent, p_key, p_hash, p_bytes, 'file deleted', p_device, public.armory_derived_operation(p_operation, 'commit-deleted'));
		a := false;
	else
		-- armory_commit_version stays the one source of the lock and parent rules.
		select c.version_id, c.advanced into v, a
		from public.armory_commit_version(p_file, p_parent, p_key, p_hash, p_bytes, p_device, public.armory_derived_operation(p_operation, 'commit')) c;
	end if;
	if solidworks then perform public.armory_record_release(v, p_file, not a, p_saved_release); end if;
	perform public.armory_remember(p_operation, 'armory_commit_version_with_release', jsonb_build_object('version_id', v, 'advanced', a));
	return query select v, a;
end $$;

create or replace function public.armory_save_side_version_with_release(p_file uuid, p_parent uuid, p_key text, p_hash text, p_bytes bigint, p_reason text, p_device uuid, p_operation uuid, p_saved_release smallint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v uuid; solidworks boolean;
begin
	r := public.armory_replay(p_operation, 'armory_save_side_version_with_release');
	if r is not null then return (r->>'version_id')::uuid; end if;
	solidworks := public.armory_check_release(p_file, p_saved_release);
	v := public.armory_save_side_version(p_file, p_parent, p_key, p_hash, p_bytes, p_reason, p_device, public.armory_derived_operation(p_operation, 'side'));
	if solidworks then perform public.armory_record_release(v, p_file, true, p_saved_release); end if;
	perform public.armory_remember(p_operation, 'armory_save_side_version_with_release', jsonb_build_object('version_id', v));
	return v;
end $$;

create or replace function public.armory_set_release_gate(p_project uuid, p_mode text, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare e text := public.armory_current_email(); r jsonb; old text; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_set_release_gate');
	if r is not null then return (r->>'result')::boolean; end if;
	perform public.armory_require_role(p_project, array['mentor']::public.armory_member_role[], 'only a mentor may change the release gate');
	if p_mode is null or p_mode not in ('enforce', 'warn') then raise exception 'the release gate is enforce or warn' using errcode = '22023'; end if;
	select release_gate into old from public.armory_projects where id = p_project for update;
	answer := old <> p_mode;
	if answer then
		update public.armory_projects set release_gate = p_mode where id = p_project;
		perform public.armory_add_change(p_project, 'release_gate_changed', p_project, jsonb_build_object('mode', p_mode, 'previous', old, 'by', e));
	end if;
	perform public.armory_remember(p_operation, 'armory_set_release_gate', jsonb_build_object('result', answer));
	return answer;
end $$;

create or replace function public.armory_raise_pinned_release(p_project uuid, p_release smallint, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare e text := public.armory_current_email(); r jsonb; old smallint;
begin
	r := public.armory_replay(p_operation, 'armory_raise_pinned_release');
	if r is not null then return (r->>'result')::boolean; end if;
	perform public.armory_require_role(p_project, array['mentor']::public.armory_member_role[], 'only a mentor may raise the pinned release');
	select pinned_release into old from public.armory_projects where id = p_project for update;
	-- SolidWorksVersionGate.TryRaise: the pin must strictly increase from a valid release.
	if p_release is null or p_release <= old then raise exception 'The pinned release must increase from %.', old using errcode = '22023'; end if;
	update public.armory_projects set pinned_release = p_release where id = p_project;
	perform public.armory_add_change(p_project, 'pinned_release_raised', p_project, jsonb_build_object('release', p_release, 'previous', old, 'by', e));
	perform public.armory_remember(p_operation, 'armory_raise_pinned_release', jsonb_build_object('result', true));
	return true;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Read snapshots (004). They return only what RLS would show a member.
-- ---------------------------------------------------------------------------

create or replace function public.armory_my_projects() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e text := public.armory_current_email();
begin
	return coalesce((
		select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'season', p.season, 'role', m.role,
			'pinned_release', p.pinned_release, 'release_gate', p.release_gate) order by lower(p.name), p.id)
		from public.armory_projects p join public.armory_members m on m.project_id = p.id and m.email = e
	), '[]'::jsonb);
end $$;

create or replace function public.armory_project_files(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
	if not public.armory_is_member(p_project) then raise exception 'not a project member' using errcode = '42501'; end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', f.id, 'folder', f.folder, 'name', f.name, 'deleted', f.deleted_at is not null, 'created_at', f.created_at,
			'current', case when v.id is null then null else jsonb_build_object('id', v.id, 'hash', v.content_sha256, 'bytes', v.byte_length,
				'author', v.author_email, 'created_at', v.created_at, 'saved_release', rel.saved_release, 'release_checked', rel.release_checked) end,
			'lock', case when l.file_id is null then null else jsonb_build_object('holder_email', l.holder_email, 'holder_device_id', l.holder_device_id,
				'holder_device_name', d.name, 'acquired_at', l.acquired_at, 'broken_at', l.broken_at, 'broken_by', l.broken_by,
				'broken_holder_email', l.broken_holder_email, 'broken_holder_device_id', l.broken_holder_device_id) end)
			order by f.folder, lower(f.name), f.id)
		from public.armory_files f
		left join public.armory_versions v on v.id = f.current_version_id
		left join public.armory_version_releases rel on rel.version_id = v.id
		left join public.armory_locks l on l.file_id = f.id
		left join public.armory_devices d on d.id = l.holder_device_id
		where f.project_id = p_project
	), '[]'::jsonb);
end $$;

create or replace function public.armory_file_history(p_file uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p uuid;
begin
	select project_id into p from public.armory_files where id = p_file;
	if p is null or not public.armory_is_member(p) then raise exception 'not a project member' using errcode = '42501'; end if;
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
end $$;

-- ---------------------------------------------------------------------------
-- 7. Function grants, the 0166 shape: revoke from public, anon and authenticated BY
-- NAME, then grant back exactly what is meant. service_role is not touched.
-- ---------------------------------------------------------------------------

-- Internal helpers: called only from inside the security-definer RPCs above, which run as
-- the owner, so no client role holds them.
revoke all on function
	public.armory_refuse_version_mutation(),
	public.armory_add_change(uuid, text, uuid, jsonb),
	public.armory_replay(uuid, text),
	public.armory_remember(uuid, text, jsonb),
	public.armory_require_device(uuid),
	public.armory_valid_segment(text),
	public.armory_valid_folder(text),
	public.armory_derived_operation(uuid, text),
	public.armory_require_role(uuid, public.armory_member_role[], text),
	public.armory_name_taken(uuid, text, uuid),
	public.armory_check_release(uuid, smallint),
	public.armory_record_release(uuid, uuid, boolean, smallint)
from public, anon, authenticated;

-- Named inside RLS policies, so evaluated as the querying role: authenticated keeps them.
revoke all on function
	public.armory_current_email(),
	public.armory_is_member(uuid)
from public, anon, authenticated;
grant execute on function
	public.armory_current_email(),
	public.armory_is_member(uuid)
to authenticated;

-- The RPCs the agent and the website call.
revoke all on function
	public.armory_register_device(text, uuid),
	public.armory_acquire_lock(uuid, uuid, uuid),
	public.armory_release_lock(uuid, uuid, uuid),
	public.armory_break_lock(uuid, uuid, uuid),
	public.armory_save_side_version(uuid, uuid, text, text, bigint, text, uuid, uuid),
	public.armory_commit_version(uuid, uuid, text, text, bigint, uuid, uuid),
	public.armory_tombstone(uuid, uuid, uuid, uuid),
	public.armory_allocate_part_number(uuid, int, int, uuid),
	public.armory_list_changes(uuid, bigint),
	public.armory_create_project(text, smallint, uuid),
	public.armory_add_member(uuid, text, public.armory_member_role, uuid),
	public.armory_remove_member(uuid, text, uuid),
	public.armory_create_file(uuid, text, text, uuid, uuid),
	public.armory_move_file(uuid, text, text, uuid, uuid),
	public.armory_commit_version_with_release(uuid, uuid, text, text, bigint, uuid, uuid, smallint),
	public.armory_save_side_version_with_release(uuid, uuid, text, text, bigint, text, uuid, uuid, smallint),
	public.armory_set_release_gate(uuid, text, uuid),
	public.armory_raise_pinned_release(uuid, smallint, uuid),
	public.armory_my_projects(),
	public.armory_project_files(uuid),
	public.armory_file_history(uuid)
from public, anon, authenticated;
grant execute on function
	public.armory_register_device(text, uuid),
	public.armory_acquire_lock(uuid, uuid, uuid),
	public.armory_release_lock(uuid, uuid, uuid),
	public.armory_break_lock(uuid, uuid, uuid),
	public.armory_save_side_version(uuid, uuid, text, text, bigint, text, uuid, uuid),
	public.armory_commit_version(uuid, uuid, text, text, bigint, uuid, uuid),
	public.armory_tombstone(uuid, uuid, uuid, uuid),
	public.armory_allocate_part_number(uuid, int, int, uuid),
	public.armory_list_changes(uuid, bigint),
	public.armory_create_project(text, smallint, uuid),
	public.armory_add_member(uuid, text, public.armory_member_role, uuid),
	public.armory_remove_member(uuid, text, uuid),
	public.armory_create_file(uuid, text, text, uuid, uuid),
	public.armory_move_file(uuid, text, text, uuid, uuid),
	public.armory_commit_version_with_release(uuid, uuid, text, text, bigint, uuid, uuid, smallint),
	public.armory_save_side_version_with_release(uuid, uuid, text, text, bigint, text, uuid, uuid, smallint),
	public.armory_set_release_gate(uuid, text, uuid),
	public.armory_raise_pinned_release(uuid, smallint, uuid),
	public.armory_my_projects(),
	public.armory_project_files(uuid),
	public.armory_file_history(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Table grants and RLS. No client role writes any armory table directly; every write
-- is an RPC above. Members read their projects' rows.
-- ---------------------------------------------------------------------------

revoke all on
	public.armory_projects, public.armory_members, public.armory_devices, public.armory_files,
	public.armory_versions, public.armory_side_versions, public.armory_locks, public.armory_tombstones,
	public.armory_part_number_allocations, public.armory_change_feed, public.armory_operation_receipts,
	public.armory_version_releases, public.armory_connect_codes
from public, anon, authenticated;

grant select on
	public.armory_projects, public.armory_members, public.armory_devices, public.armory_files,
	public.armory_versions, public.armory_side_versions, public.armory_locks, public.armory_tombstones,
	public.armory_part_number_allocations, public.armory_change_feed, public.armory_operation_receipts,
	public.armory_version_releases
to authenticated;

-- The connect codes belong to the server alone.
revoke all on public.armory_connect_codes from service_role;
grant select, insert, update on public.armory_connect_codes to service_role;

alter table public.armory_projects enable row level security;
alter table public.armory_members enable row level security;
alter table public.armory_devices enable row level security;
alter table public.armory_files enable row level security;
alter table public.armory_versions enable row level security;
alter table public.armory_side_versions enable row level security;
alter table public.armory_locks enable row level security;
alter table public.armory_tombstones enable row level security;
alter table public.armory_part_number_allocations enable row level security;
alter table public.armory_change_feed enable row level security;
alter table public.armory_operation_receipts enable row level security;
alter table public.armory_version_releases enable row level security;
alter table public.armory_connect_codes enable row level security;

drop policy if exists armory_projects_read on public.armory_projects;
create policy armory_projects_read on public.armory_projects for select to authenticated
	using (public.armory_is_member(id));
drop policy if exists armory_members_read on public.armory_members;
create policy armory_members_read on public.armory_members for select to authenticated
	using (public.armory_is_member(project_id));
drop policy if exists armory_devices_read on public.armory_devices;
create policy armory_devices_read on public.armory_devices for select to authenticated
	using (owner_email = public.armory_current_email());
drop policy if exists armory_files_read on public.armory_files;
create policy armory_files_read on public.armory_files for select to authenticated
	using (public.armory_is_member(project_id));
drop policy if exists armory_versions_read on public.armory_versions;
create policy armory_versions_read on public.armory_versions for select to authenticated
	using (exists(select 1 from public.armory_files f where f.id = file_id and public.armory_is_member(f.project_id)));
drop policy if exists armory_side_versions_read on public.armory_side_versions;
create policy armory_side_versions_read on public.armory_side_versions for select to authenticated
	using (exists(select 1 from public.armory_files f where f.id = file_id and public.armory_is_member(f.project_id)));
drop policy if exists armory_locks_read on public.armory_locks;
create policy armory_locks_read on public.armory_locks for select to authenticated
	using (exists(select 1 from public.armory_files f where f.id = file_id and public.armory_is_member(f.project_id)));
drop policy if exists armory_tombstones_read on public.armory_tombstones;
create policy armory_tombstones_read on public.armory_tombstones for select to authenticated
	using (exists(select 1 from public.armory_files f where f.id = file_id and public.armory_is_member(f.project_id)));
drop policy if exists armory_allocations_read on public.armory_part_number_allocations;
create policy armory_allocations_read on public.armory_part_number_allocations for select to authenticated
	using (public.armory_is_member(project_id));
drop policy if exists armory_changes_read on public.armory_change_feed;
create policy armory_changes_read on public.armory_change_feed for select to authenticated
	using (public.armory_is_member(project_id));
drop policy if exists armory_receipts_read on public.armory_operation_receipts;
create policy armory_receipts_read on public.armory_operation_receipts for select to authenticated
	using (caller_email = public.armory_current_email());
drop policy if exists armory_version_releases_read on public.armory_version_releases;
create policy armory_version_releases_read on public.armory_version_releases for select to authenticated
	using (exists(select 1 from public.armory_files f where f.id = file_id and public.armory_is_member(f.project_id)));
-- armory_connect_codes: RLS on and NO policy, so even a stray grant reads nothing.

-- ---------------------------------------------------------------------------
-- 9. Realtime (contract section 4). The 0062 guard shape: publication existence first,
-- so a database with no supabase_realtime still applies this file. RLS above limits what
-- a subscriber receives to their own projects.
-- ---------------------------------------------------------------------------

do $$
begin
	if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
		if not exists (
			select 1 from pg_publication_tables
			where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'armory_change_feed'
		) then
			alter publication supabase_realtime add table public.armory_change_feed;
		end if;
	end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 9b. Reserve the /armory route in the short-link guard (the 0215 shape).
-- /armory is a real top-level route on ideabosco.com, so a short link of that
-- name would never be reached; CLAUDE.md requires `_app_short_link_reserved`
-- and `RESERVED_SLUGS` in src/lib/short-links.ts to name every slug-shaped
-- route directory. The predicate below is 0215's, verbatim, with 'armory'
-- added in order. An existing short link named armory is moved, intact, to the
-- first free armory-link spelling and recorded in 0215's audit table first,
-- exactly as 0215 did for ideacad. Re-applying finds nothing to move.
-- ---------------------------------------------------------------------------

do $$
declare
	r public.app_short_links%rowtype;
	v_candidate text := 'armory-link';
	v_suffix integer := 2;
begin
	select * into r from public.app_short_links where slug = 'armory' for update;
	if found then
		while exists (select 1 from public.app_short_links where slug = v_candidate) loop
			v_candidate := 'armory-link-' || v_suffix::text;
			v_suffix := v_suffix + 1;
		end loop;
		update public.app_short_links set slug = v_candidate where slug = r.slug;
		insert into public.app_short_link_reserved_moves (
			original_slug, moved_slug, target, label, active, created_by, created_at, updated_at, migration
		) values (
			r.slug, v_candidate, r.target, r.label, r.active, r.created_by, r.created_at, r.updated_at, 'armory'
		) on conflict (original_slug) do nothing;
		raise notice 'armory: moved existing short link from "%" to "%"; target=% active=%.', r.slug, v_candidate, r.target, r.active;
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
		'a', 'admin', 'api', 'archive', 'armory', 'assignments', 'auth', 'b', 'classroom',
		'coin-balance', 'coin-desk', 'coin-entry', 'coins', 'contracts',
		'dashboard', 'dev', 'downloads', 'foundry', 'frc', 'fsp', 'fsp-pulse',
		'fsp-tech-selection', 'gauntlet', 'greenline', 'hx', 'ideacad',
		'manifest.webmanifest', 'maps', 'notebook', 'push-sw.js', 'reference',
		'robots.txt', 'sitemap.xml', 'tools', 'tournaments', 'vanguard'
	);
$$;

revoke all on function public._app_short_link_reserved(text) from public, anon, authenticated;
grant execute on function public._app_short_link_reserved(text) to service_role;

-- ---------------------------------------------------------------------------
-- 10. Self-check, by NAME over the objects this file writes and nothing else.
-- ---------------------------------------------------------------------------

do $$
declare
	v_tables text[] := array['armory_projects', 'armory_members', 'armory_devices', 'armory_files',
		'armory_versions', 'armory_side_versions', 'armory_locks', 'armory_tombstones',
		'armory_part_number_allocations', 'armory_change_feed', 'armory_operation_receipts',
		'armory_version_releases', 'armory_connect_codes'];
	v_t text;
	v_anon_fns integer;
	v_auth_helpers integer;
	v_functions integer;
begin
	foreach v_t in array v_tables loop
		if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
			where n.nspname = 'public' and c.relname = v_t and c.relrowsecurity) then
			raise exception 'armory self-check: % is missing or has RLS off', v_t;
		end if;
		if has_table_privilege('anon', 'public.' || v_t, 'select')
			or has_table_privilege('anon', 'public.' || v_t, 'insert')
			or has_table_privilege('authenticated', 'public.' || v_t, 'insert')
			or has_table_privilege('authenticated', 'public.' || v_t, 'update')
			or has_table_privilege('authenticated', 'public.' || v_t, 'delete') then
			raise exception 'armory self-check: a client role can write or anon can read %', v_t;
		end if;
	end loop;

	if has_table_privilege('authenticated', 'public.armory_connect_codes', 'select') then
		raise exception 'armory self-check: authenticated can read armory_connect_codes';
	end if;
	if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'armory_connect_codes') then
		raise exception 'armory self-check: armory_connect_codes carries a policy';
	end if;

	select count(*) into v_functions from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = any(array[
		'armory_refuse_version_mutation', 'armory_current_email', 'armory_is_member', 'armory_add_change',
		'armory_replay', 'armory_remember', 'armory_require_device', 'armory_register_device',
		'armory_acquire_lock', 'armory_release_lock', 'armory_break_lock', 'armory_save_side_version',
		'armory_commit_version', 'armory_tombstone', 'armory_allocate_part_number', 'armory_list_changes',
		'armory_valid_segment', 'armory_valid_folder', 'armory_derived_operation', 'armory_require_role',
		'armory_name_taken', 'armory_create_project', 'armory_add_member', 'armory_remove_member',
		'armory_create_file', 'armory_move_file', 'armory_check_release', 'armory_record_release',
		'armory_commit_version_with_release', 'armory_save_side_version_with_release',
		'armory_set_release_gate', 'armory_raise_pinned_release', 'armory_my_projects',
		'armory_project_files', 'armory_file_history']);
	if v_functions <> 35 then
		raise exception 'armory self-check: expected 35 armory functions (one overload each), found %', v_functions;
	end if;

	select count(*) into v_anon_fns from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname like 'armory\_%' and has_function_privilege('anon', p.oid, 'execute');
	if v_anon_fns <> 0 then
		raise exception 'armory self-check: % armory function(s) are executable by anon', v_anon_fns;
	end if;

	select count(*) into v_auth_helpers from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = any(array['armory_add_change', 'armory_replay', 'armory_remember',
		'armory_require_device', 'armory_record_release', 'armory_check_release', 'armory_name_taken', 'armory_require_role'])
		and has_function_privilege('authenticated', p.oid, 'execute');
	if v_auth_helpers <> 0 then
		raise exception 'armory self-check: % internal helper(s) are executable by authenticated', v_auth_helpers;
	end if;

	if not public._app_short_link_reserved('armory') or public._app_short_link_reserved('open-lab') then
		raise exception 'armory self-check: the short-link guard does not reserve armory, or reserves the open-lab control';
	end if;
	if exists (select 1 from public.app_short_links where slug = 'armory') then
		raise exception 'armory self-check: an app_short_links row still occupies armory';
	end if;
	if has_function_privilege('anon', 'public._app_short_link_reserved(text)', 'execute')
		or has_function_privilege('authenticated', 'public._app_short_link_reserved(text)', 'execute') then
		raise exception 'armory self-check: a client role can execute the private short-link predicate';
	end if;

	raise notice 'armory: 13 tables with RLS on, 35 functions, 0 executable by anon, connect codes service-role only, armory reserved as a short-link slug';
end
$$;
