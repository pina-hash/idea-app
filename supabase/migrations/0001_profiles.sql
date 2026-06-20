-- 0001_profiles.sql
-- Profiles + role model for the IDEA portal.
--
-- Roles are derived from the sign-in email domain and are extensible:
--   @boscotech.edu -> teacher
--   @boscotech.net -> student
--   anything else  -> visitor
-- Future roles (for example 'parent') can be added to the CHECK constraint
-- and the domain logic without a rebuild.
--
-- Apply manually in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
	id uuid primary key references auth.users (id) on delete cascade,
	email text,
	full_name text,
	avatar_url text,
	role text not null default 'visitor'
		check (role in ('student', 'teacher', 'visitor')),
	created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Role derivation helper (single source of truth for domain logic)
-- ---------------------------------------------------------------------------
create or replace function public.role_for_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
	select case
		when p_email like '%@boscotech.edu' then 'teacher'
		when p_email like '%@boscotech.net' then 'student'
		else 'visitor'
	end;
$$;

-- ---------------------------------------------------------------------------
-- New-user trigger: create a profile from auth metadata on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.profiles (id, email, full_name, avatar_url, role)
	values (
		new.id,
		new.email,
		new.raw_user_meta_data ->> 'full_name',
		new.raw_user_meta_data ->> 'avatar_url',
		public.role_for_email(new.email)
	)
	on conflict (id) do nothing;

	return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
	after insert on auth.users
	for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Backfill: create profiles for existing users that lack one
-- ---------------------------------------------------------------------------
insert into public.profiles (id, email, full_name, avatar_url, role)
select
	u.id,
	u.email,
	u.raw_user_meta_data ->> 'full_name',
	u.raw_user_meta_data ->> 'avatar_url',
	public.role_for_email(u.email)
from auth.users u
where not exists (
	select 1 from public.profiles p where p.id = u.id
);

-- ---------------------------------------------------------------------------
-- Privileges
-- Profiles are created only by the trigger above, never by clients, so we
-- grant clients select/update only. Row visibility is further restricted by
-- the RLS policies below.
-- ---------------------------------------------------------------------------
revoke all on public.profiles from anon, authenticated;
grant select, update on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Teacher check (security definer to avoid recursive RLS evaluation)
-- ---------------------------------------------------------------------------
create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.profiles
		where id = (select auth.uid()) and role = 'teacher'
	);
$$;

-- ---------------------------------------------------------------------------
-- No-self-role-change guard (enforced server-side, not in client code)
-- A user may never change their own role. Teachers may change other users'
-- roles. Service-role / admin contexts (no JWT) bypass the guard.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.role is distinct from old.role then
		-- Admin / service-role contexts have no end-user JWT; allow them.
		if (select auth.uid()) is null then
			return new;
		end if;
		-- Nobody may change their own role.
		if new.id = (select auth.uid()) then
			raise exception 'You cannot change your own role';
		end if;
		-- Only teachers may change another user''s role.
		if not public.is_teacher() then
			raise exception 'Only teachers can change roles';
		end if;
	end if;
	return new;
end;
$$;

drop trigger if exists enforce_role_change on public.profiles;
create trigger enforce_role_change
	before update on public.profiles
	for each row execute function public.enforce_role_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- SELECT: own profile.
drop policy if exists "select own profile" on public.profiles;
create policy "select own profile"
	on public.profiles
	for select
	to authenticated
	using (id = (select auth.uid()));

-- SELECT: teachers can read all profiles.
drop policy if exists "teachers select all profiles" on public.profiles;
create policy "teachers select all profiles"
	on public.profiles
	for select
	to authenticated
	using (public.is_teacher());

-- UPDATE: own profile (role change is blocked by the guard trigger).
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile"
	on public.profiles
	for update
	to authenticated
	using (id = (select auth.uid()))
	with check (id = (select auth.uid()));

-- UPDATE: teachers can update any profile (used for role assignment).
drop policy if exists "teachers update any profile" on public.profiles;
create policy "teachers update any profile"
	on public.profiles
	for update
	to authenticated
	using (public.is_teacher())
	with check (public.is_teacher());

-- No INSERT or DELETE policies: clients cannot create or delete profiles.
-- Inserts happen only via the security-definer trigger; deletes cascade from
-- auth.users.
