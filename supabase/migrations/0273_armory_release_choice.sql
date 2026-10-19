-- 0273_armory_release_choice.sql
--
-- IDEA ARMORY: ONE PROJECT, ONE SOLIDWORKS VERSION, CHOSEN ON PURPOSE (ledger
-- 0404, decision 41 item 7, Mr. Pina 2026-10-18: "an ordinary 2026 project as
-- an option"). Every project was created pinned to 2025 (0231's column
-- default) and the only way up was armory_raise_pinned_release, a mentor-only
-- RPC no surface called. This file adds the choice at creation and lets a site
-- admin raise a pin the way a site admin already acts as a mentor elsewhere.
--
--   1. _armory_release_ceiling() is the ONE statement of the newest SolidWorks
--      release a project may name: the Los Angeles calendar year plus one,
--      because SolidWorks names a release for the year after it ships (2027
--      comes out in the autumn of 2026). A pin only goes up and can never come
--      back down, so a typo of 2099 would strand a project forever; the
--      ceiling is what stops it. The website mirrors it (newestRelease in
--      src/lib/armory/view.ts) to choose what it offers, and the database is
--      the boundary. Private: only the two definer functions below call it.
--
--   2. armory_create_project gains a release, as an ADDITIVE PAIR (CLAUDE.md,
--      the signature trap's exception): the deployed Windows app and the
--      website before this bundle call the three-argument form, so it is never
--      dropped. The WIDE form, (p_name, p_season, p_release, p_operation),
--      declares no defaults; the NARROW form keeps its 0231/0232 signature
--      verbatim (it never had defaults) and becomes a thin wrapper that calls
--      the wide form with a null release, which means "the column's default"
--      (2025). No PostgREST payload can bind to both: the narrow key set has
--      no p_release and the wide form requires it. Every refusal the narrow
--      form gave before keeps its text, SQLSTATE and order, because the wide
--      body is the 0232 body with one check added AFTER all of them, and that
--      check cannot fire for a null release. The project_created change now
--      carries 'pinned_release'; an added key, which no reader refuses.
--
--   3. armory_raise_pinned_release: a site admin may raise any project's pin
--      (the 0233 armory_add_member shape: a site admin acts as a mentor, and a
--      project that does not exist says so, P0002 'project not found'). A
--      mentor's answers keep their text, SQLSTATE and order. THE ONE NARROWING:
--      a release above the ceiling is refused, 22023, after every refusal an
--      existing caller could meet before. Nothing is stored by this function
--      that a later call reads back, so the narrowing strands no row.
--
-- UNDO, before any client depends on it (a person's paste): re-run the 0232
-- body of armory_create_project(text, smallint, uuid) and the 0231 body of
-- armory_raise_pinned_release, then drop
-- armory_create_project(text, smallint, smallint, uuid) and
-- _armory_release_ceiling(). Projects created at 2026 keep their pin; that is
-- data, not schema, and lowering one would strand its files.

-- ---------------------------------------------------------------------------
-- 1. The ceiling, first, so the object the deploy probe checks is new here.
-- ---------------------------------------------------------------------------

create or replace function public._armory_release_ceiling() returns smallint
language sql stable set search_path = '' as $at$
	select (extract(year from (pg_catalog.now() at time zone 'America/Los_Angeles'))::int + 1)::smallint
$at$;

-- ---------------------------------------------------------------------------
-- 2. The wide create. Dropped at its own exact signature first, so the file
-- re-applies over a database that took an earlier draft.
-- ---------------------------------------------------------------------------

drop function if exists public.armory_create_project(text, smallint, smallint, uuid);

create function public.armory_create_project(p_name text, p_season smallint, p_release smallint, p_operation uuid) returns uuid
language plpgsql security definer set search_path = '' as $at$
declare e text := public.armory_current_email(); r jsonb; n text; v uuid; existing text; pinned smallint; newest smallint;
begin
	r := public.armory_replay(p_operation, 'armory_create_project');
	if r is not null then return (r->>'project_id')::uuid; end if;
	if not coalesce(public.is_admin(), false) then raise exception 'only a site admin may create an Armory project' using errcode = '42501'; end if;
	n := normalize(coalesce(p_name, ''), NFC);
	if not public.armory_valid_segment(n) then raise exception 'The project name "%" cannot be a Windows folder name.', n using errcode = '22023'; end if;
	if p_season is not null and p_season not between 2000 and 2100 then raise exception 'season must be a year from 2000 to 2100' using errcode = '22023'; end if;
	-- 0273: the release, checked after every refusal the 0232 body gave, so a null release answers exactly as before.
	if p_release is not null then
		newest := public._armory_release_ceiling();
		if p_release < 1995 or p_release > newest then
			raise exception 'The SolidWorks version must be a release from 1995 to %.', newest using errcode = '22023';
		end if;
	end if;
	-- Each project is a folder under the vault root, so names are unique without regard to case.
	perform pg_advisory_xact_lock(hashtextextended('armory_project_name:' || lower(n), 0));
	select name into existing from public.armory_projects where lower(normalize(name, NFC)) = lower(n) limit 1;
	if found then raise exception 'A project named "%" already exists.', existing using errcode = '23505', detail = jsonb_build_object('existing_name', existing)::text; end if;
	-- A null release takes the column's own default (0231: 2025), never a second copy of it.
	if p_release is null then
		insert into public.armory_projects(name, season) values (n, p_season) returning id, pinned_release into v, pinned;
	else
		insert into public.armory_projects(name, season, pinned_release) values (n, p_season, p_release) returning id, pinned_release into v, pinned;
	end if;
	insert into public.armory_members(project_id, email, role) values (v, e, 'mentor');
	perform public.armory_add_change(v, 'project_created', v, jsonb_build_object('name', n, 'season', p_season, 'pinned_release', pinned, 'by', e));
	perform public.armory_remember(p_operation, 'armory_create_project', jsonb_build_object('project_id', v));
	return v;
end $at$;

-- ---------------------------------------------------------------------------
-- 3. The narrow create: the deployed signature, a thin wrapper, so there is
-- one copy of the rule. Its refusals are the wide body's, which are the 0232
-- body's in the same order.
-- ---------------------------------------------------------------------------

create or replace function public.armory_create_project(p_name text, p_season smallint, p_operation uuid) returns uuid
language plpgsql security definer set search_path = '' as $at$
begin
	-- 0273: the three-argument form the Windows app calls; a null release is the column default.
	return public.armory_create_project(p_name, p_season, null::smallint, p_operation);
end $at$;

-- ---------------------------------------------------------------------------
-- 4. Raising the pin: a site admin as a mentor, and the ceiling.
-- ---------------------------------------------------------------------------

create or replace function public.armory_raise_pinned_release(p_project uuid, p_release smallint, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $at$
declare e text := public.armory_current_email(); r jsonb; old smallint; newest smallint;
begin
	r := public.armory_replay(p_operation, 'armory_raise_pinned_release');
	if r is not null then return (r->>'result')::boolean; end if;
	-- 0273: a site admin acts as a mentor of any project (the 0233 armory_add_member shape).
	if coalesce(public.is_admin(), false) then
		if not exists (select 1 from public.armory_projects where id = p_project) then
			raise exception 'project not found' using errcode = 'P0002';
		end if;
	else
		perform public.armory_require_role(p_project, array['mentor']::public.armory_member_role[], 'only a mentor may raise the pinned release');
	end if;
	select pinned_release into old from public.armory_projects where id = p_project for update;
	-- SolidWorksVersionGate.TryRaise: the pin must strictly increase from a valid release.
	if p_release is null or p_release <= old then raise exception 'The pinned release must increase from %.', old using errcode = '22023'; end if;
	-- 0273: never past the newest release there is, because a pin never comes back down.
	newest := public._armory_release_ceiling();
	if p_release > newest then
		raise exception 'SolidWorks % is not a release yet; the newest a project can move to is %.', p_release, newest using errcode = '22023';
	end if;
	update public.armory_projects set pinned_release = p_release where id = p_project;
	perform public.armory_add_change(p_project, 'pinned_release_raised', p_project, jsonb_build_object('release', p_release, 'previous', old, 'by', e));
	perform public.armory_remember(p_operation, 'armory_raise_pinned_release', jsonb_build_object('result', true));
	return true;
end $at$;

-- ---------------------------------------------------------------------------
-- 5. Grants. The 0166 shape: revoke from every client role BY NAME, then grant
-- back the one role that calls it. The two replaced functions keep their
-- grants (create or replace never touches an ACL); they are swept again anyway.
-- ---------------------------------------------------------------------------

revoke all on function public._armory_release_ceiling() from public, anon, authenticated;
revoke all on function public.armory_create_project(text, smallint, smallint, uuid) from public, anon, authenticated;
grant execute on function public.armory_create_project(text, smallint, smallint, uuid) to authenticated;
revoke all on function public.armory_create_project(text, smallint, uuid) from public, anon, authenticated;
grant execute on function public.armory_create_project(text, smallint, uuid) to authenticated;
revoke all on function public.armory_raise_pinned_release(uuid, smallint, uuid) from public, anon, authenticated;
grant execute on function public.armory_raise_pinned_release(uuid, smallint, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Self-check, BY NAME over this file's own objects and nothing else.
-- ---------------------------------------------------------------------------

do $at$
declare
	v_f text;
	v_n integer;
begin
	select count(*) into v_n from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'armory_create_project';
	if v_n <> 2 then
		raise exception '0273: expected exactly two public.armory_create_project (the deployed form and the wide one), found %', v_n;
	end if;
	-- The pair is unambiguous only while neither form carries a default.
	if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'armory_create_project' and p.pronargdefaults <> 0) then
		raise exception '0273: an armory_create_project form carries a default, so a call could bind to both';
	end if;
	select count(*) into v_n from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'armory_raise_pinned_release';
	if v_n <> 1 then
		raise exception '0273: expected exactly one public.armory_raise_pinned_release, found %', v_n;
	end if;
	foreach v_f in array array[
		'armory_create_project(text, smallint, smallint, uuid)',
		'armory_create_project(text, smallint, uuid)',
		'armory_raise_pinned_release(uuid, smallint, uuid)'] loop
		if not (select p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
			from pg_catalog.pg_proc p where p.oid = ('public.' || v_f)::regprocedure) then
			raise exception '0273: public.% must be security definer with search_path pinned', v_f;
		end if;
		if pg_catalog.has_function_privilege('anon', 'public.' || v_f, 'execute') then
			raise exception '0273: anon can execute public.%', v_f;
		end if;
		if not pg_catalog.has_function_privilege('authenticated', 'public.' || v_f, 'execute') then
			raise exception '0273: authenticated cannot execute public.%', v_f;
		end if;
	end loop;
	if pg_catalog.has_function_privilege('anon', 'public._armory_release_ceiling()', 'execute')
		or pg_catalog.has_function_privilege('authenticated', 'public._armory_release_ceiling()', 'execute') then
		raise exception '0273: a client role can execute public._armory_release_ceiling()';
	end if;
	raise notice '0273 armory-release-choice: armory_create_project has 2 forms with no defaults, raise admits a site admin, ceiling is %; 0 executable by anon',
		public._armory_release_ceiling();
end $at$;
