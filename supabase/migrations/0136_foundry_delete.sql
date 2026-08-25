-- 0136_foundry_delete.sql
-- IDEA FOUNDRY: real deletion, for the owner and for an admin.
--
-- WHAT WAS MISSING. 0130 shipped `foundry_set_app_hidden`, which is ADMIN ONLY
-- and which HIDES rather than deletes: the rows stay, the bundle stays in
-- storage, and restoring is the same function with `p_hidden = false`. There
-- was no path of any kind by which a STUDENT could remove their own app. On a
-- school platform holding a student's own work, that is the half that matters:
-- shelving somebody else's project is a staff decision, and throwing your own
-- away is not.
--
-- HIDE AND DELETE BOTH STAY, AND THEY ARE DIFFERENT DECISIONS.
--
--   hide    shelved but kept. Off the gallery, off the serving route, files
--           intact, reversible by the same function that did it. It is a
--           staff judgement about whether the school shows something.
--   delete  gone. The app row, every version row, every file row and every
--           stored object. There is no undo and nothing to restore from.
--
-- Collapsing them into one verb would mean either a "delete" a student cannot
-- trust (their work is still sitting there) or a "hide" staff cannot reverse.
--
-- ---------------------------------------------------------------------------
-- THE TWO-SYSTEM PROBLEM, WHICH IS THE ONLY HARD PART.
--
-- Rows live in Postgres. Bytes live in Storage. There is no transaction across
-- them, so one of the two writes can land without the other and SOMETHING has
-- to be the acceptable failure. There are exactly three arrangements and two
-- of them are worse:
--
--   objects first, then rows   a failure between them leaves a ROW POINTING AT
--                              BYTES THAT NO LONGER EXIST. The app is still in
--                              the gallery, still in the student's list, still
--                              resolvable by the serving route -- and every
--                              file it asks for 404s. That is a BROKEN APP,
--                              indistinguishable from a corrupted upload, and
--                              the student is the one who finds it.
--
--   one call doing both        not available. The database cannot delete a
--                              Storage object and the Storage API cannot join
--                              a transaction.
--
--   rows first, then objects   a failure between them leaves an ORPHANED
--                              OBJECT: bytes in a private bucket that no row
--                              anywhere names. Nothing serves it (the route's
--                              allowlist IS `student_app_files`, and that row
--                              is gone), nothing lists it (the bucket carries
--                              no storage policy at all, so only the service
--                              role reaches it), and nothing renders it. It
--                              costs storage and nothing else.
--
-- SO: ROWS FIRST, AND THE RPC HANDS BACK THE PATHS IT JUST ORPHANED. That is
-- why these two functions RETURN a delete plan rather than merely reporting
-- success -- the paths only exist while the rows do, so the last thing the
-- transaction does is publish them to the caller, who then removes the
-- objects with the service role (`$lib/server/foundry-bundle.ts`, the one
-- module in the app that holds that key).
--
-- WHAT THE CALLER OWES: it must not treat a failed object sweep as a failed
-- delete. The app IS deleted. The route logs the exact orphaned paths so an
-- administrator can remove them by hand, and tells the person the truth:
-- their app is gone, and some bytes were left behind.
--
-- WHY THE ROUTE IS NOT THE AUTHORIZATION BOUNDARY, even though it holds the
-- service key: it calls these functions AS THE CALLER, over the caller's own
-- client, so `auth.uid()` and `is_admin()` below are the real thing. The
-- service role is used for one job only -- removing the exact paths the
-- database just returned -- and can therefore never remove an object the
-- database did not authorize.
--
-- ---------------------------------------------------------------------------
-- WHO MAY DO WHAT.
--
--   foundry_delete_app       the OWNER, or an admin. Real deletion of the app
--                            and everything under it, including its published
--                            version -- deleting your own work is allowed to
--                            take the live build with it, because the thing
--                            being removed is the app.
--
--   foundry_delete_version   the OWNER, or an admin, and NEVER the version the
--                            app currently publishes. A rejected build, a
--                            superseded one, a draft that was a mistake: those
--                            are clutter and they go. The live one is the app
--                            as far as every visitor is concerned, and
--                            deleting it out from under a still-listed app is
--                            the broken-app state this file exists to avoid.
--                            The way to remove a live build is to make another
--                            approved version live first (0130's
--                            `foundry_set_published_version`), or to delete
--                            the whole app.
--
-- A HIDDEN APP IS NOT THE OWNER'S TO DELETE, and that is deliberate rather
-- than an omission. 0130 already refuses an owner's EDIT of a hidden app
-- ("hidden by staff and cannot be edited"); a hidden app is one staff have
-- shelved and have not finished with, and a student deleting it removes the
-- thing that is under discussion. An admin can delete it, and an admin can
-- restore it. The refusal says who to ask.
--
-- NEITHER FUNCTION TAKES AN IDENTITY PARAMETER. The caller is `auth.uid()`, so
-- "can only act as themselves" is a property of the SIGNATURE and not a check
-- that could be got wrong. Both are SECURITY DEFINER with `set search_path =
-- ''` and granted to `authenticated` alone, following 0130's nine write RPCs
-- in every respect EXCEPT the revoke, which names the roles rather than only
-- `public` -- see the section below for why 0130's form does not close a
-- function on this project.
--
-- NOT-FOUND AND NOT-YOURS ANSWER IDENTICALLY, so an id cannot be probed by
-- watching which refusal comes back. That is 0130's rule and it is kept.
--
-- ---------------------------------------------------------------------------
-- `revoke ... FROM public` IS NOT ENOUGH ON A SUPABASE PROJECT, AND THIS FILE
-- LEARNED THAT THE HARD WAY: the first draft raised its own self-check on
-- production and rolled itself back entirely.
--
-- A hosted project bootstraps
--
--   alter default privileges in schema public
--     grant execute on functions to anon, authenticated, service_role;
--
-- which writes a DIRECT grant to each of those three roles into every new
-- function's `proacl` AT CREATION TIME. That is not the SQL default. The SQL
-- default is one grant to PUBLIC, and `revoke all on function f from public`
-- removes exactly that one entry and nothing else -- so on a real project the
-- function comes out of `create` already granted to `anon`, the revoke does
-- not touch it, and it stays granted.
--
-- Measured on this database's own catalog, on a function created each way and
-- then put through the identical `revoke ... from public`:
--
--   no default privileges configured
--     proacl  postgres=X/postgres | authenticated=X/postgres
--     anon    false
--
--   WITH the Supabase defaults
--     proacl  postgres=X/postgres | anon=X/postgres
--             | authenticated=X/postgres | service_role=X/postgres
--     anon    TRUE
--
--   revoking from the roles as well as from public
--     proacl  postgres=X/postgres | authenticated=X/postgres
--     anon    false
--
-- So both revokes below NAME THE ROLES. That end state is independent of
-- whatever default privileges the database happens to carry, which is the
-- point: a narrowing that only works under one privilege configuration is a
-- narrowing that silently does nothing under the other.
--
-- 0130's OWN WRITE RPCs USE THE `from public` FORM AND ARE THEREFORE STILL
-- GRANTED TO `anon` ON PRODUCTION. That is a real finding and it is NOT fixed
-- here: those functions are live and students call them today, and re-granting
-- eleven applied functions is its own migration with its own verification. It
-- is written up in docs/HISTORY.md under this bundle. What limits it is that
-- every one of them opens with `if v_uid is null then raise` -- `auth.uid()`
-- is null for an `anon` caller -- so the exposure is a reachable function that
-- refuses, not an unauthorized write. It should still be closed.
--
-- ---------------------------------------------------------------------------
-- WHAT UNDOES THIS MIGRATION. It creates two functions and nothing else -- no
-- table, no column, no policy, no row, no grant to a role that did not already
-- hold one. So the reversal is exact and loses nothing:
--
--   drop function if exists public.foundry_delete_version(uuid);
--   drop function if exists public.foundry_delete_app(uuid);
--
-- Dropping a function takes its ACL with it, so the revokes below need no
-- separate undo.
--
-- After that, deletion stops existing again and `foundry_set_app_hidden` is
-- once more the only way anything leaves the gallery, which is the state 0130
-- and 0135 left behind. NOTHING ALREADY DELETED COMES BACK: this file adds a
-- capability, and the undo removes the capability, not its consequences.
--
-- Apply manually in the Supabase SQL editor, after 0135.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. Delete one app, and everything under it.
--
-- THE ROW DELETE IS ONE STATEMENT AND THE CASCADES DO THE REST. 0130 declares
-- `student_app_versions.app_id -> student_apps on delete cascade` and
-- `student_app_files.version_id -> student_app_versions on delete cascade`, so
-- deleting the app row takes both child tables with it. This function does NOT
-- re-implement that walk; it only reads what is about to go, so it can hand
-- the paths back.
--
-- `published_version_id` IS CLEARED FIRST, and that is not decoration. It is a
-- COMPOSITE foreign key from `student_apps` into `student_app_versions`, so
-- the app row references a row the same statement is cascading away. Clearing
-- the pointer first makes the ordering explicit rather than resting on how
-- Postgres happens to sequence a cascade against a self-referencing pair.
-- `_foundry_published_version_check` fires on that update and returns
-- immediately for a NULL, so nothing in the trigger can refuse it.
--
-- THE COVER IS ONLY REPORTED IF NOTHING ELSE POINTS AT IT. `cover_path` is
-- free text a student can set to any legal path through
-- `foundry_update_app_metadata`, so two of their apps CAN name one object.
-- Removing bytes a surviving app still renders would break that app's card to
-- tidy up this one, so the path is handed back only when no other app holds
-- it. An unreferenced cover object left behind is the same harmless orphan as
-- any other.
-- ---------------------------------------------------------------------------

create or replace function public.foundry_delete_app(p_app_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_admin boolean := public.is_admin();
	v_app public.student_apps%rowtype;
	v_version_ids uuid[];
	v_zip_paths text[];
	v_cover text;
	v_files integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	-- THE LOCK IS THE SERIALIZATION POINT, and it is taken before anything is
	-- read. Without it a concurrent `foundry_create_version` could insert a row
	-- between the plan being gathered and the delete landing, and its zip and
	-- its extracted bundle would be orphaned with nobody holding the paths.
	select a.* into v_app from public.student_apps a where a.id = p_app_id for update;
	if not found then
		raise exception 'That app does not exist.';
	end if;
	if v_app.owner <> v_uid and not v_admin then
		raise exception 'That app does not exist.';
	end if;

	if v_app.hidden_at is not null and not v_admin then
		raise exception 'That app has been hidden by staff, so it is not yours to delete. Ask an instructor.';
	end if;

	select
		coalesce(array_agg(v.id order by v.ordinal), '{}'::uuid[]),
		coalesce(array_agg(v.zip_path order by v.ordinal), '{}'::text[])
	into v_version_ids, v_zip_paths
	from public.student_app_versions v
	where v.app_id = p_app_id;

	select count(*)::integer into v_files
	from public.student_app_files f
	where f.version_id = any (v_version_ids);

	-- Only if this app is the last thing naming it. See the header.
	v_cover := null;
	if v_app.cover_path is not null then
		if not exists (
			select 1 from public.student_apps o
			where o.id <> p_app_id and o.cover_path = v_app.cover_path
		) then
			v_cover := v_app.cover_path;
		end if;
	end if;

	update public.student_apps a set published_version_id = null where a.id = p_app_id;
	delete from public.student_apps a where a.id = p_app_id;

	-- THE PLAN. Bundle objects live at `<app id>/<version id>/<path>` in
	-- `foundry-bundles`, so the version ids ARE the prefixes; the zips are
	-- whole paths in `foundry-uploads`; the cover is a whole path in
	-- `foundry-covers`. The caller needs no knowledge of the layout beyond
	-- that, and this is the only place the three buckets are named together.
	return jsonb_build_object(
		'ok', true,
		'app_id', p_app_id,
		'slug', v_app.slug,
		'title', v_app.title,
		'version_ids', to_jsonb(v_version_ids),
		'zip_paths', to_jsonb(v_zip_paths),
		'cover_path', v_cover,
		'versions_deleted', coalesce(array_length(v_version_ids, 1), 0),
		'files_deleted', coalesce(v_files, 0)
	);
end;
$$;

-- REVOKED FROM THE ROLES THAT ACTUALLY HOLD IT, NOT ONLY FROM `public`.
-- See the header section on default privileges: `revoke ... from public`
-- alone leaves `anon` a direct EXECUTE on a real Supabase project.
revoke all on function public.foundry_delete_app(uuid) from public, anon, authenticated, service_role;
grant execute on function public.foundry_delete_app(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 2. Delete one version that is not the published one.
--
-- THE APP ROW IS LOCKED, NOT THE VERSION ROW, and the reason is the check this
-- function exists to make. "Is this the published one" is a fact about
-- `student_apps.published_version_id`, so a concurrent
-- `foundry_set_published_version` pointing the app AT this version between the
-- check and the delete is exactly the race -- and that function takes the same
-- app-row lock. Locking the version would guard the wrong row.
--
-- A SUBMITTED VERSION MAY BE DELETED. It is refused by nothing here, and that
-- is a decision: 0130 already lets the owner WITHDRAW a submission back to a
-- draft with one press, so refusing the delete would be a rule with a
-- two-click bypass, and the reviewer's queue row vanishing is a state the
-- withdraw path already produces.
-- ---------------------------------------------------------------------------

create or replace function public.foundry_delete_version(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_admin boolean := public.is_admin();
	v_version public.student_app_versions%rowtype;
	v_app public.student_apps%rowtype;
	v_files integer;
	v_deleted integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select v.* into v_version
	from public.student_app_versions v
	where v.id = p_version_id;
	if not found then
		raise exception 'That version does not exist.';
	end if;

	select a.* into v_app
	from public.student_apps a
	where a.id = v_version.app_id
	for update;
	if not found then
		raise exception 'That version does not exist.';
	end if;
	if v_app.owner <> v_uid and not v_admin then
		raise exception 'That version does not exist.';
	end if;

	if v_app.hidden_at is not null and not v_admin then
		raise exception 'That app has been hidden by staff, so its builds are not yours to delete. Ask an instructor.';
	end if;

	-- THE APP ROW WAS READ *AS* THE LOCK WAS TAKEN, so this is the value that
	-- is true now and stays true for the rest of the transaction. That is the
	-- whole reason the lock is on the app rather than on the version: "is this
	-- the published one" is a fact about `student_apps.published_version_id`,
	-- and `foundry_set_published_version` takes this same lock before it moves
	-- that column.
	if v_app.published_version_id = p_version_id then
		raise exception 'That is the build your app publishes. Make another approved version live first, or delete the whole app.';
	end if;

	select count(*)::integer into v_files
	from public.student_app_files f
	where f.version_id = p_version_id;

	delete from public.student_app_versions v where v.id = p_version_id;

	-- THE VERSION ROW WAS READ BEFORE THE APP LOCK, so a concurrent caller
	-- deleting the same version could have got there first. Reporting a plan
	-- for a row this transaction did not remove would send the caller off to
	-- sweep objects a still-live version might depend on -- which is the one
	-- way this function could produce the broken-app state the whole ordering
	-- argument exists to avoid.
	get diagnostics v_deleted = row_count;
	if v_deleted <> 1 then
		raise exception 'That version does not exist.';
	end if;

	-- The app has changed, so it moves in every list ordered by updated_at.
	update public.student_apps a set updated_at = now() where a.id = v_app.id;

	return jsonb_build_object(
		'ok', true,
		'app_id', v_app.id,
		'slug', v_app.slug,
		'version_id', p_version_id,
		'ordinal', v_version.ordinal,
		'zip_path', v_version.zip_path,
		'files_deleted', coalesce(v_files, 0)
	);
end;
$$;

-- REVOKED FROM THE ROLES THAT ACTUALLY HOLD IT, NOT ONLY FROM `public`.
-- See the header section on default privileges: `revoke ... from public`
-- alone leaves `anon` a direct EXECUTE on a real Supabase project.
revoke all on function public.foundry_delete_version(uuid) from public, anon, authenticated, service_role;
grant execute on function public.foundry_delete_version(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 3. Report what landed, so the operator can check it rather than trusting
--    that the file ran. 0131's convention.
--
-- THE ARITY ASSERTION IS THE SIGNATURE TRAP'S OWN CHECK. Neither function
-- existed before this file, so there is no old arity to have been left
-- callable -- but asserting exactly one row in `pg_proc` per name is what
-- catches the day somebody adds a parameter with `create or replace` and
-- leaves a second overload behind.
-- ---------------------------------------------------------------------------

do $$
declare
	v_n integer;
	v_name text;
begin
	foreach v_name in array array['foundry_delete_app', 'foundry_delete_version'] loop
		select count(*)::integer into v_n
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = v_name;

		if v_n <> 1 then
			raise exception '0136: public.% has % overloads, expected exactly 1.', v_name, v_n;
		end if;

		select count(*)::integer into v_n
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = v_name
			and p.prosecdef
			and has_function_privilege('authenticated', p.oid, 'EXECUTE')
			and not has_function_privilege('anon', p.oid, 'EXECUTE');

		if v_n <> 1 then
			raise exception '0136: public.% is not a definer granted to authenticated and withheld from anon.', v_name;
		end if;
	end loop;

	raise notice '0136: both delete RPCs are present, SECURITY DEFINER, granted to authenticated only.';

	-- What the two are about to be able to remove, on THIS database, so the
	-- number in front of the operator is the real one.
	select count(*)::integer into v_n from public.student_apps;
	raise notice '0136: % apps currently exist.', v_n;
	select count(*)::integer into v_n from public.student_app_versions;
	raise notice '0136: % versions currently exist.', v_n;
	select count(*)::integer into v_n from public.student_app_files;
	raise notice '0136: % bundle file rows currently exist.', v_n;
end
$$;
