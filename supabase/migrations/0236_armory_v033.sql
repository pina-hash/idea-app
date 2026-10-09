-- 0236_armory_v033.sql
--
-- IDEA ARMORY: THE FOUR WEBSITE REQUESTS AFTER ARMORY 0.3.3 (ledger 0377,
-- pina-hash/idea-armory docs/agent/website-requests-v0.3.3.md). Armory 0.3.3
-- works without any of them; each follows what the server already says.
--
--   1. AN INSTRUCTOR CAN FORCE A CHECK IN. The role already exists (0231's
--      armory_member_role has 'instructor'); what it lacked is can_take_back.
--      armory_can_take_back(p_project) is now the ONE statement of who may:
--      a mentor, a CAD lead or an instructor of that project, or a site admin.
--      armory_my_projects (its can_take_back key) and armory_break_lock ask
--      it, and armory_break_locks (0234) calls armory_break_lock per file, so
--      the three cannot disagree. armory_break_lock's refusal text stays
--      0231's ('only a mentor or cad_lead may break a lock', P0001), because
--      the app reads it.
--      BECAUSE AN INSTRUCTOR NOW HOLDS A LEAD'S POWER, only a mentor may make
--      someone an instructor or change an instructor's role (42501 'only a
--      mentor may grant instructor' / 'only a mentor may change an
--      instructor'). Before this a CAD lead could, which would now let a CAD
--      lead hand out Force check in. That is the one narrowing in this file;
--      every refusal an existing caller could meet before keeps its text,
--      SQLSTATE and order.
--
--   2. A FILE WITH NO FIRST VERSION CAN BE REMOVED.
--      armory_remove_empty_file(p_file, p_operation) returns boolean: for a
--      caller armory_can_take_back admits; refused unless the file has no
--      current version and nobody holds a live lock on it; one tombstone row
--      and one 'tombstone' change, like any removal; replays by operation id.
--      False when the file was already removed. Refusals: 42501 (not a lead,
--      and a file id that names nothing, for anyone but a site admin), P0002
--      'file not found' (a site admin only), 55000 {reason: has_version},
--      55006 {reason: checked_out, names, total}.
--
--   3. A LEAD MAY ORGANIZE FILES SOMEONE ELSE HAS CHECKED OUT.
--      armory_move_file moves a file over another person's live lock when the
--      caller passes armory_can_take_back, and armory_rename_folder skips
--      armory_refuse_checked_out for that caller. The lock is never touched
--      (it belongs to the file id, so it survives the move, and the holder's
--      check in still lands). The change rows are the usual file_moved and
--      folder_renamed, each with one added key on this path only:
--      file_moved gains 'checked_out_by' (the holder's address) and
--      folder_renamed gains 'over_checkouts' (how many files someone else
--      had checked out). A student's answers are unchanged: a move still
--      needs their own lock, and a rename still refuses 55006. A lead moving a
--      file NOBODY has checked out still needs to check it out first, as
--      before.
--
--   4. MACHINES THAT SHARE A NAME. armory_app_incidents gains machine_id, a
--      STORED generated column read from the report's own "machineId"
--      (Armory 0.3.3; 16 hex characters, null off Windows), kept only when it
--      is a short word, so the console reads it without opening a report of
--      up to 1 MiB per row. The table's existing grant (select to
--      authenticated) and its admin-only RLS policy cover it; no policy and
--      no grant changes. The website shows "NAME (abcd)" for two devices that
--      share a name with no server change: the device ids are already in the
--      team and file reads.
--
-- BACKWARD COMPATIBLE. Same function names and arguments; every existing call
-- answers as before except the deliberate changes above: an instructor now
-- passes the take-back checks, a lead's move or rename over someone else's
-- checkout now goes through, and a CAD lead can no longer grant or change
-- the instructor role. tests/db/armory-v033.test.ts puts a corpus of calls to
-- the deployed functions before this file and again after it.
--
-- UNDO, before any client depends on it (a person's paste): drop
-- armory_remove_empty_file(uuid, uuid), re-run the 0233 bodies of
-- armory_my_projects, armory_break_lock, armory_move_file and
-- armory_add_member and the 0232 body of armory_rename_folder, then drop
-- armory_can_take_back(uuid) and the machine_id column.

-- ---------------------------------------------------------------------------
-- 0. The one take-back predicate, first, so the object the deploy probe
-- checks is new here. Granted to authenticated as well, so the website asks
-- the server's own answer rather than restating the role list.
-- ---------------------------------------------------------------------------

create or replace function public.armory_can_take_back(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $at$
	select coalesce(public.is_admin(), false)
		or exists(
			select 1 from public.armory_members m
			where m.project_id = p_project
				and m.email = public.current_user_email()
				and m.role in ('mentor', 'cad_lead', 'instructor'))
$at$;

-- ---------------------------------------------------------------------------
-- 1. The three readers of it. Each body is the 0233 body with only the lines
-- marked 0236 changed.
-- ---------------------------------------------------------------------------

-- Membership only: the app syncs exactly the projects this lists.
create or replace function public.armory_my_projects() returns jsonb
language plpgsql stable security definer set search_path = '' as $at$
declare e text := public.armory_current_email();
begin
	return coalesce((
		select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'season', p.season, 'role', m.role,
			'pinned_release', p.pinned_release, 'release_gate', p.release_gate,
			'archived', p.archived_at is not null, 'archived_at', p.archived_at,
			-- 0236: the one predicate (mentor, CAD lead, instructor, or a site admin).
			'can_take_back', public.armory_can_take_back(p.id)) order by lower(p.name), p.id)
		from public.armory_projects p join public.armory_members m on m.project_id = p.id and m.email = e
	), '[]'::jsonb);
end $at$;

create or replace function public.armory_break_lock(p_file uuid, p_device uuid, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $at$
declare e text := public.armory_current_email(); p uuid; n int; r jsonb; answer boolean; old_email text; old_device uuid;
begin
	r := public.armory_replay(p_operation, 'armory_break_lock');
	if r is not null then return (r->>'result')::boolean; end if;
	-- 0233: the website has no computer, so a null device is allowed; a named device must still be the caller's.
	if p_device is not null then perform public.armory_require_device(p_device); end if;
	select project_id into p from public.armory_files where id = p_file;
	perform 1 from public.armory_projects where id = p for key share;
	-- 0236: the one predicate. The refusal text is 0231's, unchanged, because the app reads it.
	if not public.armory_can_take_back(p) then
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
end $at$;

-- ---------------------------------------------------------------------------
-- 2. Only a mentor makes or changes an instructor, now that the role carries
-- Force check in. 0233's body with only the two marked lines added.
-- ---------------------------------------------------------------------------

create or replace function public.armory_add_member(p_project uuid, p_email text, p_role public.armory_member_role, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $at$
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
	-- 0236: an instructor may force a check in, so only a mentor grants the role.
	if p_role = 'instructor' and caller <> 'mentor' then raise exception 'only a mentor may grant instructor' using errcode = '42501'; end if;
	select role into old from public.armory_members where project_id = p_project and email = target;
	if old in ('mentor', 'cad_lead') and caller <> 'mentor' then raise exception 'only a mentor may change a mentor or cad_lead' using errcode = '42501'; end if;
	-- 0236: and only a mentor changes an instructor.
	if old = 'instructor' and caller <> 'mentor' then raise exception 'only a mentor may change an instructor' using errcode = '42501'; end if;
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
end $at$;

-- ---------------------------------------------------------------------------
-- 3. A lead organizes files someone else has checked out. armory_move_file is
-- 0233's body and armory_rename_folder 0232's, with only the marked lines
-- changed. The lock is never read for update or written here: it belongs to
-- the file id, and a move changes only the folder and the name.
-- ---------------------------------------------------------------------------

create or replace function public.armory_move_file(p_file uuid, p_folder text, p_name text, p_device uuid, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $at$
declare e text := public.armory_current_email(); r jsonb; f public.armory_files; folder_n text; name_n text; answer boolean; p uuid;
	mine boolean; other text;
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
	mine := exists(select 1 from public.armory_locks where file_id = p_file and holder_email = e and holder_device_id = p_device and broken_at is null);
	-- 0236: a lead may move a file someone else holds; the lock stays theirs.
	if not mine and public.armory_can_take_back(f.project_id) then
		select holder_email into other from public.armory_locks where file_id = p_file and broken_at is null;
	end if;
	answer := f.deleted_at is null and (mine or other is not null);
	if answer and (f.folder <> folder_n or f.name <> name_n) then
		perform public.armory_name_taken(f.project_id, name_n, p_file);
		begin
			update public.armory_files set folder = folder_n, name = name_n where id = p_file;
		exception when unique_violation then
			perform public.armory_name_taken(f.project_id, name_n, p_file);
			raise;
		end;
		perform public.armory_add_change(f.project_id, 'file_moved', p_file,
			jsonb_build_object('old_folder', f.folder, 'old_name', f.name, 'folder', folder_n, 'name', name_n, 'device_id', p_device, 'by', e)
			-- 0236: said only when the move went over someone else's checkout.
			|| case when mine then '{}'::jsonb else jsonb_build_object('checked_out_by', other) end);
	end if;
	perform public.armory_remember(p_operation, 'armory_move_file', jsonb_build_object('result', answer));
	return answer;
end $at$;

create or replace function public.armory_rename_folder(p_project uuid, p_from text, p_to text, p_device uuid, p_operation uuid) returns int
language plpgsql security definer set search_path = '' as $at$
declare e text := public.armory_current_email(); r jsonb; from_n text; to_n text; ids uuid[]; names text[]; total int; moved int;
	lead boolean; held int := 0;
begin
	r := public.armory_replay(p_operation, 'armory_rename_folder');
	if r is not null then return (r->>'result')::int; end if;
	perform public.armory_require_device(p_device);
	if not public.armory_is_member(p_project) then raise exception 'not a project member' using errcode = '42501'; end if;
	from_n := normalize(coalesce(p_from, ''), NFC);
	to_n := normalize(coalesce(p_to, ''), NFC);
	if from_n = '' or not public.armory_valid_folder(from_n) then raise exception 'The folder "%" cannot be a Windows folder path.', from_n using errcode = '22023'; end if;
	if to_n = '' or not public.armory_valid_folder(to_n) then raise exception 'The folder "%" cannot be a Windows folder path.', to_n using errcode = '22023'; end if;
	if to_n = from_n then raise exception 'The folder already has that name.' using errcode = '22023'; end if;
	if left(lower(to_n), length(from_n) + 1) = lower(from_n) || '/' then raise exception 'A folder cannot move inside itself.' using errcode = '22023'; end if;
	-- One folder operation at a time in a project.
	perform 1 from public.armory_projects where id = p_project for update;
	select array_agg(f.id) into ids from public.armory_folder_files(p_project, from_n) f;
	if ids is null then
		moved := 0;
	else
		-- 0236: a lead renames over other people's checkouts; everyone else is refused as before.
		lead := public.armory_can_take_back(p_project);
		if lead then
			select count(*) into held from public.armory_locks l
			where l.file_id = any(ids) and l.broken_at is null and (l.holder_email <> e or l.holder_device_id <> p_device);
		else
			perform public.armory_refuse_checked_out(ids, p_device, from_n);
		end if;
		-- The target already holds live files that are not being moved (a case-only
		-- rename of the same folder moves every file in it, so it never trips this).
		select array_agg(x.name order by lower(x.name)), count(*) into names, total from (
			select f.name from public.armory_files f
			where f.project_id = p_project and f.deleted_at is null and not (f.id = any(ids))
				and (lower(f.folder) = lower(to_n) or left(lower(f.folder), length(to_n) + 1) = lower(to_n) || '/')
		) x;
		if total > 0 then
			raise exception 'The folder "%" already has % file(s) in it: %.', to_n, total, array_to_string(names[1:10], ', ')
				using errcode = '55006',
				detail = jsonb_build_object('reason', 'target_exists', 'names', to_jsonb(names[1:10]), 'total', total)::text,
				hint = 'Choose another folder name.';
		end if;
		update public.armory_files set folder = to_n || substr(folder, length(from_n) + 1) where id = any(ids);
		moved := cardinality(ids);
		perform public.armory_add_change(p_project, 'folder_renamed', p_project,
			jsonb_build_object('from', from_n, 'to', to_n, 'files', moved, 'device_id', p_device, 'by', e)
			-- 0236: said only when the rename went over someone else's checkouts.
			|| case when held > 0 then jsonb_build_object('over_checkouts', held) else '{}'::jsonb end);
	end if;
	perform public.armory_remember(p_operation, 'armory_rename_folder', jsonb_build_object('result', moved));
	return moved;
end $at$;

-- ---------------------------------------------------------------------------
-- 4. Remove a file that never got its first version. The project row first,
-- then the file, the order every Armory write keeps.
-- ---------------------------------------------------------------------------

create or replace function public.armory_remove_empty_file(p_file uuid, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $at$
declare e text := public.armory_current_email(); r jsonb; f public.armory_files; p uuid; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_remove_empty_file');
	if r is not null then return (r->>'result')::boolean; end if;
	select project_id into p from public.armory_files where id = p_file;
	perform 1 from public.armory_projects where id = p for key share;
	-- A file id that names nothing answers this refusal too, except to a site admin.
	if not public.armory_can_take_back(p) then
		raise exception 'only a mentor, CAD lead or instructor may remove a file with no first version' using errcode = '42501';
	end if;
	select * into f from public.armory_files where id = p_file for update;
	if not found then raise exception 'file not found' using errcode = 'P0002'; end if;
	if f.deleted_at is not null then
		answer := false;
	else
		if f.current_version_id is not null then
			raise exception 'The file "%" has a first version, so it is removed the usual way.', f.name
				using errcode = '55000',
				detail = jsonb_build_object('reason', 'has_version')::text;
		end if;
		if exists(select 1 from public.armory_locks where file_id = p_file and broken_at is null) then
			raise exception 'Someone has "%" checked out.', f.name
				using errcode = '55006',
				detail = jsonb_build_object('reason', 'checked_out', 'names', jsonb_build_array(f.name), 'total', 1)::text,
				hint = 'Force a check in first, then remove it.';
		end if;
		insert into public.armory_tombstones(file_id, version_id, author_email) values (p_file, null, e) on conflict do nothing;
		update public.armory_files set deleted_at = now() where id = p_file;
		perform public.armory_add_change(f.project_id, 'tombstone', p_file,
			jsonb_build_object('device_id', null, 'by', e, 'reason', 'no_first_version'));
		answer := true;
	end if;
	perform public.armory_remember(p_operation, 'armory_remove_empty_file', jsonb_build_object('result', answer));
	return answer;
end $at$;

-- ---------------------------------------------------------------------------
-- 5. The incident's own machine id, as a column the console can read cheaply.
-- ---------------------------------------------------------------------------

alter table public.armory_app_incidents
	add column if not exists machine_id text generated always as (
		case
			when jsonb_typeof(report -> 'machineId') = 'string' and (report ->> 'machineId') ~ '^[0-9A-Za-z_-]{1,64}$'
			then report ->> 'machineId'
		end
	) stored;

-- ---------------------------------------------------------------------------
-- 6. Grants. The 0166 shape: revoke from every client role BY NAME, then grant
-- back the one role that calls it. The replaced functions keep their grants
-- (create or replace never touches an ACL); they are swept again anyway.
-- ---------------------------------------------------------------------------

revoke all on function public.armory_can_take_back(uuid) from public, anon, authenticated;
grant execute on function public.armory_can_take_back(uuid) to authenticated;
revoke all on function public.armory_remove_empty_file(uuid, uuid) from public, anon, authenticated;
grant execute on function public.armory_remove_empty_file(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Self-check, BY NAME over this file's own objects and nothing else.
-- ---------------------------------------------------------------------------

do $at$
declare
	v_f text;
	v_n integer;
begin
	foreach v_f in array array[
		'armory_can_take_back(uuid)',
		'armory_remove_empty_file(uuid, uuid)',
		'armory_my_projects()',
		'armory_break_lock(uuid, uuid, uuid)',
		'armory_add_member(uuid, text, public.armory_member_role, uuid)',
		'armory_move_file(uuid, text, text, uuid, uuid)',
		'armory_rename_folder(uuid, text, text, uuid, uuid)'] loop
		select count(*) into v_n from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = split_part(v_f, '(', 1);
		if v_n <> 1 then
			raise exception '0236: expected exactly one public.%, found %', split_part(v_f, '(', 1), v_n;
		end if;
		if not (select p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
			from pg_catalog.pg_proc p where p.oid = ('public.' || v_f)::regprocedure) then
			raise exception '0236: public.% must be security definer with search_path pinned', v_f;
		end if;
		if pg_catalog.has_function_privilege('anon', 'public.' || v_f, 'execute') then
			raise exception '0236: anon can execute public.%', v_f;
		end if;
		if not pg_catalog.has_function_privilege('authenticated', 'public.' || v_f, 'execute') then
			raise exception '0236: authenticated cannot execute public.%', v_f;
		end if;
	end loop;
	if not exists (select 1 from pg_catalog.pg_attribute
		where attrelid = 'public.armory_app_incidents'::regclass and attname = 'machine_id' and attgenerated = 's' and not attisdropped) then
		raise exception '0236: expected the stored generated column armory_app_incidents.machine_id';
	end if;
	if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.armory_app_incidents'::regclass) then
		raise exception '0236: row level security is off on armory_app_incidents';
	end if;
	raise notice '0236 armory-v033: can_take_back and remove_empty_file added, 5 bodies replaced, 0 executable by anon; armory_app_incidents.machine_id stored, RLS on';
end $at$;
