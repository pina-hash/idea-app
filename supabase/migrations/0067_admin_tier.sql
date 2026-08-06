-- 0067_admin_tier.sql
-- A real ADMIN tier, separate from the domain-derived 'teacher' role.
--
-- THE PROBLEM THIS FIXES. Since 0001, role_for_email has mapped every
-- @boscotech.edu sign-in to 'teacher', and is_teacher() has gated ~90 policies
-- and RPCs across GAUNTLET, FRC, FSP, GREENLINE, feedback, the coin tools and
-- tournaments. So ANY district address, the moment it first signed in,
-- inherited: the ability to change anybody's role (including granting that
-- power onward), student contact data (the FSP/FRC interest roster carries
-- names, emails, phone numbers and parent emails), the IDEA Coin entry tool,
-- every student's graded work, moderation of other people's content, and
-- permanent deletion. That is administrator access handed out by email domain.
--
-- WHAT CHANGES. Privileged access now requires an explicit ADMIN grant.
-- 'teacher' is still assigned automatically from the domain and still marks
-- staff apart from students, but on its own it now grants nothing elevated.
--
-- HOW THE RE-GATE IS DONE, and why it is one function instead of ninety edits:
-- migrations here are applied by hand and are an immutable record, so the
-- policies in 0004..0066 cannot be rewritten in place. Postgres resolves a
-- function by name at CALL time, so redefining the BODY of is_teacher()
-- re-points every one of those call sites at once, atomically, with no chance
-- of missing one. is_admin() below is the honest name and the one new code
-- must use; is_teacher() is kept ONLY as a shim for those existing references.
--
--   !!! is_teacher() NO LONGER MEANS "is a teacher". It means "is an admin".
--   !!! Never write a new is_teacher() call. Use is_admin().
--
-- THE OWNER IS PINNED IN THE SCHEMA. admin_owner_email() is a hardcoded
-- constant and is_admin()/is_owner() fall back to it directly, so the owner
-- keeps full access even if app_admins is emptied or their row is deleted by
-- accident. No other admin can demote the owner, and only the owner can grant
-- or revoke admin.
--
-- IDENTITY IS THE EMAIL, not a user id. Admins are keyed by lowercased email
-- so an account can be authorized BEFORE it has ever signed in (there is no
-- auth.users row to reference until then). Revoking is deleting the row, and a
-- later sign-in does not resurrect it -- only the owner constant self-heals,
-- which is the intended asymmetry.
--
-- Apply manually in the Supabase SQL editor, after 0066.

-- ---------------------------------------------------------------------------
-- 1. The pinned owner
--
-- The single hardcoded account that can never lose admin and is the only one
-- allowed to grant or revoke it. Changing who this is means editing this
-- function in a new migration, deliberately: it is not editable from the app.
-- The literal is repeated once more, in the CHECK constraint in section 5 --
-- a CHECK that called this function would not be re-validated if the function
-- later changed, so the two are kept in step by hand.
-- ---------------------------------------------------------------------------

create or replace function public.admin_owner_email()
returns text
language sql
immutable
set search_path = ''
as $$
	select 'apina@boscotech.edu';
$$;

grant execute on function public.admin_owner_email() to authenticated;

-- The caller's own email, from auth.users (authoritative) rather than
-- profiles.email (a copy written once at signup).
create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select lower(btrim(coalesce(
		(select u.email from auth.users u where u.id = (select auth.uid())),
		''
	)));
$$;

revoke all on function public.current_user_email() from public;

-- ---------------------------------------------------------------------------
-- 2. The admin roster
-- ---------------------------------------------------------------------------

create table if not exists public.app_admins (
	-- Lowercased. The account need not exist yet.
	email text primary key check (email = lower(btrim(email)) and email like '%@%'),
	is_owner boolean not null default false,
	-- Email of whoever granted it; null for the seeded rows.
	granted_by text,
	granted_at timestamptz not null default now(),
	note text check (note is null or char_length(note) <= 200)
);

-- ---------------------------------------------------------------------------
-- 3. The checks
--
-- SECURITY DEFINER for the same reason 0001 gives for is_teacher(): the
-- function is owned by the migration role, which owns app_admins and therefore
-- bypasses its RLS, so is_admin() can be used INSIDE app_admins' own policy
-- without recursing.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when (select auth.uid()) is null then false
		-- The owner is admin unconditionally, table or no table.
		when public.current_user_email() = public.admin_owner_email() then true
		else exists (
			select 1 from public.app_admins a where a.email = public.current_user_email()
		)
	end;
$$;

grant execute on function public.is_admin() to authenticated;

-- Owner-only actions (granting and revoking admin).
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select (select auth.uid()) is not null
		and public.current_user_email() = public.admin_owner_email();
$$;

grant execute on function public.is_owner() to authenticated;

-- Reads are admin-only: this is the list of who can administer the site, and
-- it carries staff emails. Writes have no client path at all -- only the
-- definer RPCs in section 6.
revoke all on public.app_admins from anon, authenticated;
grant select on public.app_admins to authenticated;
alter table public.app_admins enable row level security;

drop policy if exists "admins read the roster" on public.app_admins;
create policy "admins read the roster"
	on public.app_admins
	for select
	to authenticated
	using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. THE RE-GATE. See the header: this one body change re-points every
-- is_teacher() reference in 0001..0066 at the admin check.
-- ---------------------------------------------------------------------------

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	-- DEPRECATED NAME, LIVE BEHAVIOUR: this is the admin check. It keeps the
	-- old name only because ~90 already-applied policies and RPCs reference it
	-- and applied migrations are not rewritten. Do not call it in new code.
	select public.is_admin();
$$;

-- ---------------------------------------------------------------------------
-- 5. Seed: the owner plus the initial admin. Idempotent, and safe to run
-- before either account has ever signed in.
-- ---------------------------------------------------------------------------

insert into public.app_admins (email, is_owner, note)
values
	('apina@boscotech.edu', true, 'Owner. Pinned in admin_owner_email(); cannot be revoked.'),
	('wcosso@boscotech.edu', false, 'Seeded with the admin tier (0067).')
on conflict (email) do update set is_owner = excluded.is_owner;

-- At most one owner row, and it must be the pinned address.
create unique index if not exists app_admins_single_owner
	on public.app_admins ((true)) where is_owner;

alter table public.app_admins drop constraint if exists app_admins_owner_is_pinned;
alter table public.app_admins add constraint app_admins_owner_is_pinned
	check (not is_owner or email = 'apina@boscotech.edu');

-- ---------------------------------------------------------------------------
-- 6. Managing admins. Owner-only, enforced inside the function.
-- ---------------------------------------------------------------------------

create or replace function public.admin_grant(p_email text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
begin
	if not public.is_owner() then
		raise exception 'Only the site owner can grant admin access.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid email address.';
	end if;
	-- Deliberate: admin is for staff accounts. A student or outside address
	-- holding admin would defeat the point of this migration.
	if v_email not like '%@boscotech.edu' then
		raise exception 'Admin access is limited to @boscotech.edu accounts (got "%").', v_email;
	end if;

	insert into public.app_admins (email, is_owner, granted_by, note)
	values (v_email, false, public.current_user_email(), nullif(btrim(coalesce(p_note, '')), ''))
	on conflict (email) do update
		set granted_by = excluded.granted_by,
			granted_at = now(),
			note = coalesce(excluded.note, public.app_admins.note);

	return jsonb_build_object('email', v_email, 'granted', true);
end;
$$;

create or replace function public.admin_revoke(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
begin
	if not public.is_owner() then
		raise exception 'Only the site owner can revoke admin access.';
	end if;
	if v_email = public.admin_owner_email() then
		raise exception 'The site owner cannot be removed.';
	end if;
	delete from public.app_admins where email = v_email;
	return jsonb_build_object('email', v_email, 'revoked', true);
end;
$$;

-- The roster, for the admin page.
create or replace function public.admin_list()
returns table (email text, is_owner boolean, granted_by text, granted_at timestamptz, note text)
language sql
stable
security definer
set search_path = ''
as $$
	select a.email, a.is_owner, a.granted_by, a.granted_at, a.note
	from public.app_admins a
	where public.is_admin()
	order by a.is_owner desc, a.email;
$$;

revoke all on function public.admin_grant(text, text) from public;
revoke all on function public.admin_revoke(text) from public;
revoke all on function public.admin_list() from public;
grant execute on function public.admin_grant(text, text) to authenticated;
grant execute on function public.admin_revoke(text) to authenticated;
grant execute on function public.admin_list() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Role changes are an admin action, and the owner's role is untouchable.
--
-- Recreated from 0001 with two changes: the privilege check reads as
-- is_admin() (is_teacher() would resolve there anyway, but the intent should
-- be readable at the call site), and nobody -- not even the owner -- can alter
-- the owner's profile role, so the account that must stay staff cannot be
-- demoted by a stray update.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if new.role is distinct from old.role then
		-- Service-role / admin contexts have no end-user JWT; allow them.
		if (select auth.uid()) is null then
			return new;
		end if;
		if new.id = (select auth.uid()) then
			raise exception 'You cannot change your own role';
		end if;
		if not public.is_admin() then
			raise exception 'Only site admins can change roles';
		end if;
		if lower(btrim(coalesce(old.email, ''))) = public.admin_owner_email() then
			raise exception 'The site owner''s role cannot be changed';
		end if;
	end if;
	return new;
end;
$$;

drop trigger if exists enforce_role_change on public.profiles;
create trigger enforce_role_change
	before update on public.profiles
	for each row execute function public.enforce_role_change();
