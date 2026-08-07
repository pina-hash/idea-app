-- supabase-stub.sql
-- The parts of a Supabase project that live OUTSIDE supabase/migrations and
-- that the migrations therefore assume already exist: the two client roles, the
-- `auth` schema (users table + auth.uid()), and enough of `storage` for 0020's
-- avatars bucket. Applied to a bare embedded Postgres before any migration.
--
-- Nothing here is a substitute for a migration. It is deliberately the SMALLEST
-- stub that lets the real, unmodified migration files run, so that what the
-- tests exercise is the repo's own SQL and not a re-implementation of it.
--
-- The one piece that matters for these tests is auth.uid(): it reads the
-- request.jwt.claims GUC exactly the way Supabase's own definition does, which
-- is what lets a test "sign in" as a user by setting that GUC and switching to
-- the `authenticated` role (see tests/db/harness.ts, asUser).

-- ---------------------------------------------------------------------------
-- Client roles. NOLOGIN + NOINHERIT, like Supabase's: reached via SET ROLE
-- from the connection role, never connected to directly.
-- ---------------------------------------------------------------------------

do $$
begin
	if not exists (select 1 from pg_roles where rolname = 'anon') then
		create role anon nologin noinherit;
	end if;
	if not exists (select 1 from pg_roles where rolname = 'authenticated') then
		create role authenticated nologin noinherit;
	end if;
	if not exists (select 1 from pg_roles where rolname = 'service_role') then
		create role service_role nologin noinherit bypassrls;
	end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- auth
-- ---------------------------------------------------------------------------

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Only the columns this repo's migrations actually read: id (referenced by
-- every actor column), email (role_for_email, current_user_email) and
-- raw_user_meta_data (handle_new_user). Deliberately NOT granted to
-- authenticated -- Supabase does not expose auth.users to clients either, so
-- current_user_email()'s SECURITY DEFINER is doing real work here.
create table if not exists auth.users (
	id uuid primary key default gen_random_uuid(),
	email text unique,
	raw_user_meta_data jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now()
);

-- Supabase's own definition. The claims GUC is what a PostgREST request sets
-- from the verified JWT; the harness sets the same GUC.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
	select coalesce(
		nullif(current_setting('request.jwt.claim.sub', true), ''),
		(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
	)::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
	select coalesce(
		nullif(current_setting('request.jwt.claim.role', true), ''),
		(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
	)::text;
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
	select coalesce(
		nullif(current_setting('request.jwt.claim.email', true), ''),
		(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
	)::text;
$$;

-- ---------------------------------------------------------------------------
-- storage. Only 0020 (the avatars bucket) touches this, and only to create
-- policies that these tests never evaluate; the stub exists so the real 0020
-- applies unmodified.
-- ---------------------------------------------------------------------------

create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
	id text primary key,
	name text not null,
	public boolean not null default false,
	file_size_limit bigint,
	allowed_mime_types text[],
	created_at timestamptz not null default now()
);

create table if not exists storage.objects (
	id uuid primary key default gen_random_uuid(),
	bucket_id text references storage.buckets (id),
	name text,
	owner uuid,
	created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
	select case
		when array_length(string_to_array(name, '/'), 1) is null then '{}'::text[]
		else (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
	end;
$$;
