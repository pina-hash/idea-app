-- 0267_profile_avatar_holds.sql
--
-- TURNING OFF A PROFILE PICTURE (ledger 0392, Mr. Pina 2026-10-16: "I need to
-- have the ability to turn off a student's profile picture if it, in case
-- it's inappropriate. This should just be a general moderation tool").
--
-- WHAT WAS MEASURED FIRST. A profile's picture is two stored values,
-- `profiles.avatar` (a preset, an uploaded file, or null) and
-- `profiles.avatar_url` (the Google photo, written once at sign-up by
-- `handle_new_user` and never refreshed). Every surface that shows a picture
-- to somebody else (the rosters, the notebook grid, the leaderboards, the
-- Foundry author page, Armory's people) reads those two columns at query time
-- and copies them nowhere. So clearing both on the row reaches every surface
-- at once, with no other function changed, and the picture falls back to the
-- person's initials. What is missing is the LOCK: the owner holds table-level
-- UPDATE under 0001's "update own profile", so without a guard they could put
-- the picture straight back.
--
-- WHAT IT CREATES, all new (no existing object is redefined):
--   table    profile_avatar_holds  -- one row per hold, released never deleted;
--                                     RLS on, no policy, no client grant
--   helper   _profile_avatar_held(uuid)
--   trigger  enforce_avatar_hold on profiles (before update)
--   client   profile_avatar_hide(text, text)    -- admin: snapshot, clear, lock
--            profile_avatar_restore(text)       -- admin: the snapshot back, unlock
--            profile_avatar_hold_status(text)   -- admin: is this person held
--            profile_avatar_holds()             -- admin: every current hold
--            profile_avatar_my_hold()           -- the caller: is MY picture held
--
-- WHO. Every admin function asks `is_admin()` and answers a non-admin exactly
-- as it answers an address with no account (`not_admin` from the writes, null
-- from the reads), so the functions cannot be used to probe for accounts. The
-- target is an EMAIL, because the classroom's rosters are email-keyed and the
-- admin page takes an address.
--
-- WHAT IS KEPT. The hold stores the two values it cleared, so a restore puts
-- back exactly what was there. An uploaded file stays in the private `avatars`
-- bucket: nothing projects its key once the row is cleared, and deleting it is
-- a separate decision this file does not make.
--
-- THE LOCK. `enforce_avatar_hold` refuses a change to either picture column on
-- a held profile unless the caller has no end-user JWT (the service role) or
-- is a site admin, the `enforce_role_change` pattern. The refusal is a
-- sentence the profile menu shows as it is.
--
-- UNDO: drop the five client functions, the trigger, its function, the helper
-- and `profile_avatar_holds`. Restore any held picture first or its values are
-- lost with the table.

create table if not exists public.profile_avatar_holds (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public.profiles (id) on delete cascade,
	email text not null,
	prev_avatar text,
	prev_avatar_url text,
	reason text,
	hidden_by text not null,
	hidden_at timestamptz not null default now(),
	released_by text,
	released_at timestamptz,
	constraint profile_avatar_holds_reason_len check (reason is null or char_length(reason) <= 300),
	constraint profile_avatar_holds_release_pair check ((released_at is null) = (released_by is null))
);
create unique index if not exists profile_avatar_holds_one_live
	on public.profile_avatar_holds (user_id) where released_at is null;
alter table public.profile_avatar_holds enable row level security;
revoke all on public.profile_avatar_holds from public, anon, authenticated, service_role;

create or replace function public._profile_avatar_held(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.profile_avatar_holds h
		where h.user_id = p_user and h.released_at is null
	);
$$;
revoke all on function public._profile_avatar_held(uuid) from public, anon, authenticated, service_role;

create or replace function public.enforce_avatar_hold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	if (new.avatar is distinct from old.avatar or new.avatar_url is distinct from old.avatar_url)
		and public._profile_avatar_held(old.id) then
		-- Service-role and admin contexts are the moderation itself.
		if (select auth.uid()) is null then return new; end if;
		if public.is_admin() then return new; end if;
		raise exception 'Your profile picture was turned off by a site admin, so it cannot be changed right now. Ask a teacher if you think this is a mistake.';
	end if;
	return new;
end;
$$;
revoke all on function public.enforce_avatar_hold() from public, anon, authenticated, service_role;

drop trigger if exists enforce_avatar_hold on public.profiles;
create trigger enforce_avatar_hold before update on public.profiles
	for each row execute function public.enforce_avatar_hold();

create or replace function public.profile_avatar_hide(p_email text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
	v_profile public.profiles;
begin
	if not public.is_admin() then
		return jsonb_build_object('ok', false, 'reason', 'not_admin');
	end if;
	if v_reason is not null and char_length(v_reason) > 300 then
		return jsonb_build_object('ok', false, 'reason', 'reason_too_long');
	end if;
	select * into v_profile from public.profiles p
	where lower(btrim(coalesce(p.email, ''))) = v_email
	for update;
	if not found or v_email = '' then
		return jsonb_build_object('ok', false, 'reason', 'no_account');
	end if;
	if public._profile_avatar_held(v_profile.id) then
		return jsonb_build_object('ok', false, 'reason', 'already_hidden');
	end if;
	insert into public.profile_avatar_holds (user_id, email, prev_avatar, prev_avatar_url, reason, hidden_by)
	values (v_profile.id, v_email, v_profile.avatar, v_profile.avatar_url, v_reason, public.current_user_email());
	update public.profiles set avatar = null, avatar_url = null where id = v_profile.id;
	return jsonb_build_object('ok', true, 'had_picture', v_profile.avatar is not null or v_profile.avatar_url is not null);
end;
$$;
revoke all on function public.profile_avatar_hide(text, text) from public, anon, authenticated, service_role;
grant execute on function public.profile_avatar_hide(text, text) to authenticated;

create or replace function public.profile_avatar_restore(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_hold public.profile_avatar_holds;
begin
	if not public.is_admin() then
		return jsonb_build_object('ok', false, 'reason', 'not_admin');
	end if;
	select h.* into v_hold from public.profile_avatar_holds h
	join public.profiles p on p.id = h.user_id
	where lower(btrim(coalesce(p.email, ''))) = v_email and h.released_at is null
	for update of h;
	if not found then
		return jsonb_build_object('ok', false, 'reason', 'not_hidden');
	end if;
	update public.profile_avatar_holds
	set released_at = now(), released_by = public.current_user_email()
	where id = v_hold.id;
	update public.profiles
	set avatar = v_hold.prev_avatar, avatar_url = v_hold.prev_avatar_url
	where id = v_hold.user_id;
	return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.profile_avatar_restore(text) from public, anon, authenticated, service_role;
grant execute on function public.profile_avatar_restore(text) to authenticated;

create or replace function public.profile_avatar_hold_status(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_row record;
begin
	if not public.is_admin() then return null; end if;
	select p.id, h.hidden_at, h.hidden_by, h.reason into v_row
	from public.profiles p
	left join public.profile_avatar_holds h on h.user_id = p.id and h.released_at is null
	where lower(btrim(coalesce(p.email, ''))) = v_email;
	if not found or v_email = '' then
		return jsonb_build_object('account', false, 'hidden', false);
	end if;
	return jsonb_build_object(
		'account', true,
		'hidden', v_row.hidden_at is not null,
		'hidden_at', v_row.hidden_at,
		'hidden_by', v_row.hidden_by,
		'reason', v_row.reason
	);
end;
$$;
revoke all on function public.profile_avatar_hold_status(text) from public, anon, authenticated, service_role;
grant execute on function public.profile_avatar_hold_status(text) to authenticated;

create or replace function public.profile_avatar_holds()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public.is_admin() then return null; end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'email', h.email,
			'name', coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''), h.email),
			'hidden_at', h.hidden_at,
			'hidden_by', h.hidden_by,
			'reason', h.reason,
			'had_picture', h.prev_avatar is not null or h.prev_avatar_url is not null
		) order by h.hidden_at desc)
		from public.profile_avatar_holds h
		join public.profiles p on p.id = h.user_id
		where h.released_at is null
	), '[]'::jsonb);
end;
$$;
revoke all on function public.profile_avatar_holds() from public, anon, authenticated, service_role;
grant execute on function public.profile_avatar_holds() to authenticated;

create or replace function public.profile_avatar_my_hold()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_at timestamptz;
begin
	if v_uid is null then return jsonb_build_object('held', false); end if;
	select h.hidden_at into v_at from public.profile_avatar_holds h
	where h.user_id = v_uid and h.released_at is null;
	return jsonb_build_object('held', v_at is not null, 'hidden_at', v_at);
end;
$$;
revoke all on function public.profile_avatar_my_hold() from public, anon, authenticated, service_role;
grant execute on function public.profile_avatar_my_hold() to authenticated;

-- ===== PART Z BEGIN =====
do $z$
declare
	v_bad text[] := '{}';
	v_fn text;
	v_oid oid;
begin
	foreach v_fn in array array[
		'profile_avatar_hide(text,text)', 'profile_avatar_restore(text)', 'profile_avatar_hold_status(text)',
		'profile_avatar_holds()', 'profile_avatar_my_hold()'
	] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, v_fn || ' is missing');
		elsif has_function_privilege('anon', v_oid, 'execute') then
			v_bad := array_append(v_bad, v_fn || ' is executable by anon');
		elsif not has_function_privilege('authenticated', v_oid, 'execute') then
			v_bad := array_append(v_bad, v_fn || ' is not executable by authenticated');
		end if;
	end loop;
	foreach v_fn in array array['_profile_avatar_held(uuid)', 'enforce_avatar_hold()'] loop
		v_oid := to_regprocedure('public.' || v_fn);
		if v_oid is null then
			v_bad := array_append(v_bad, v_fn || ' is missing');
		elsif has_function_privilege('anon', v_oid, 'execute')
			or has_function_privilege('authenticated', v_oid, 'execute') then
			v_bad := array_append(v_bad, v_fn || ' is executable by a client');
		end if;
	end loop;
	if has_table_privilege('anon', 'public.profile_avatar_holds', 'select,insert,update,delete,truncate,references,trigger')
		or has_table_privilege('authenticated', 'public.profile_avatar_holds', 'select,insert,update,delete,truncate,references,trigger') then
		v_bad := array_append(v_bad, 'profile_avatar_holds carries a client grant');
	end if;
	if not exists (
		select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relname = 'profile_avatar_holds' and c.relrowsecurity
	) then
		v_bad := array_append(v_bad, 'profile_avatar_holds has no row level security');
	end if;
	if not exists (
		select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
		where c.relname = 'profiles' and t.tgname = 'enforce_avatar_hold' and not t.tgisinternal
	) then
		v_bad := array_append(v_bad, 'the enforce_avatar_hold trigger is not on profiles');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0267 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0267 avatar holds: 1 table (RLS on, no client grant), 1 guard trigger on profiles, 5 client functions closed to anon, 2 private functions closed to every client.';
end $z$;
-- ===== PART Z END =====
