-- 0320_armory_class_projects_safeupdate.sql
--
-- THE CLASS LINK REFUSED ON PRODUCTION: "DELETE requires a WHERE clause"
-- (ledger 0463). 0319's _armory_sync_section empties its temporary roster
-- table with a bare `delete from pg_temp.armory_roster;`. The hosted project
-- loads pg-safeupdate for API requests, which refuses an UPDATE or DELETE
-- with no top-level WHERE (the same failure 0317 fixed for tournaments), so
-- armory_link_section, armory_make_personal_folders and the roster trigger
-- all refused through the site and the connector. Measured 2026-10-28 18:50
-- PT: a connector preview of armory_link_section answered 21000 with that
-- text. The test database does not load pg-safeupdate, so 0319's suite could
-- not see it; tests/db/armory-class-projects.test.ts now scans this body.
--
-- What this changes: one statement in _armory_sync_section gains `where
-- true`. Same signature, same grants (create or replace keeps the ACL).
--
-- DEPLOY ORDERING: none. Nothing had linked a project (0319's notice said 0).
--
-- WHAT UNDOES IT: re-run 0319's body of _armory_sync_section (a person's
-- paste); that body refuses on production, so there is no reason to.

create or replace function public._armory_sync_section(p_project uuid) returns jsonb
language plpgsql security definer set search_path = '' as $ac$
declare
	e text := coalesce(nullif(public.current_user_email(), ''), 'system');
	v_section uuid; v_teacher text;
	s record; old public.armory_member_role;
	n_added int := 0; n_kept int := 0; n_removed int := 0; n_instructor int := 0;
	n_folders int := 0; n_folders_kept int := 0; n_placeholders int := 0;
	v_base text; fname text; k int; kept_roles jsonb := '[]'::jsonb;
begin
	select section_id into v_section from public.armory_project_sections where project_id = p_project;
	if v_section is null then return jsonb_build_object('linked', false); end if;
	select teacher_email into v_teacher from public.classroom_sections where id = v_section;

	create temporary table if not exists pg_temp.armory_roster (email text primary key, display_name text, base text) on commit drop;
	-- 0320: the WHERE pg-safeupdate demands of an API request (0317's lesson).
	delete from pg_temp.armory_roster where true;
	insert into pg_temp.armory_roster (email, display_name, base)
	select ce.student_email, ce.display_name, lower(public._armory_person_folder(ce.display_name, ce.student_email, false))
	from public.classroom_enrollments ce
	where ce.section_id = v_section and ce.active
		and not public._classroom_manages_section_email(v_section, ce.student_email)
		and ce.student_email is distinct from v_teacher;

	-- The teacher of record, as instructor, unless already a member.
	if v_teacher is not null and not exists (select 1 from public.armory_members where project_id = p_project and email = v_teacher) then
		insert into public.armory_members(project_id, email, role) values (p_project, v_teacher, 'instructor');
		perform public.armory_add_change(p_project, 'member_added', p_project, jsonb_build_object('email', v_teacher, 'role', 'instructor', 'by', e, 'via', 'class'));
		n_instructor := 1;
	end if;

	-- Students: added as student; anyone already a member keeps their role.
	for s in select r.email, r.display_name, r.base from pg_temp.armory_roster r order by lower(r.display_name), r.email loop
		select role into old from public.armory_members where project_id = p_project and email = s.email;
		if old is null then
			insert into public.armory_members(project_id, email, role) values (p_project, s.email, 'student');
			insert into public.armory_section_members(project_id, email) values (p_project, s.email) on conflict do nothing;
			perform public.armory_add_change(p_project, 'member_added', p_project, jsonb_build_object('email', s.email, 'role', 'student', 'by', e, 'via', 'class'));
			n_added := n_added + 1;
		else
			n_kept := n_kept + 1;
			if old <> 'student' then kept_roles := kept_roles || jsonb_build_array(jsonb_build_object('email', s.email, 'role', old)); end if;
		end if;

		-- The student's own folder, made once and never renamed.
		if exists (select 1 from public.armory_folders where project_id = p_project and kind = 'personal' and owner_email = s.email) then
			n_folders_kept := n_folders_kept + 1;
		else
			v_base := public._armory_person_folder(s.display_name, s.email, false);
			if exists (select 1 from pg_temp.armory_roster o where o.base = lower(v_base) and o.email <> s.email)
				or exists (select 1 from public.armory_folders f where f.project_id = p_project and f.folder_key = lower(v_base)) then
				v_base := public._armory_person_folder(s.display_name, s.email, true);
			end if;
			fname := v_base; k := 1;
			while exists (select 1 from public.armory_folders f where f.project_id = p_project and f.folder_key = lower(fname)) loop
				k := k + 1;
				fname := v_base || k;
			end loop;
			insert into public.armory_folders(project_id, folder, kind, owner_email, label, created_by)
			values (p_project, fname, 'personal', s.email, coalesce(public._armory_first_name(s.display_name), fname), e);
			n_folders := n_folders + 1;
		end if;
		insert into public.armory_folder_writers(project_id, folder_key, email)
		select p_project, f.folder_key, s.email from public.armory_folders f
		where f.project_id = p_project and f.kind = 'personal' and f.owner_email = s.email
		on conflict do nothing;
	end loop;

	-- Every class folder keeps a placeholder, so the folder shows on every computer.
	for v_base in select f.folder_key from public.armory_folders f where f.project_id = p_project order by f.folder_key loop
		if public._armory_keep_placeholder(p_project, v_base) then n_placeholders := n_placeholders + 1; end if;
	end loop;

	-- A student the link added who is no longer on the roster leaves; their files stay.
	for s in select sm.email from public.armory_section_members sm
		where sm.project_id = p_project and not exists (select 1 from pg_temp.armory_roster r where r.email = sm.email) loop
		select role into old from public.armory_members where project_id = p_project and email = s.email;
		if old = 'student' then
			delete from public.armory_members where project_id = p_project and email = s.email;
			perform public.armory_add_change(p_project, 'member_removed', p_project, jsonb_build_object('email', s.email, 'role', old, 'by', e, 'via', 'class'));
			n_removed := n_removed + 1;
		end if;
		delete from public.armory_section_members where project_id = p_project and email = s.email;
	end loop;

	return jsonb_build_object('linked', true, 'section_id', v_section,
		'roster', (select count(*) from pg_temp.armory_roster),
		'students_added', n_added, 'already_members', n_kept, 'kept_their_role', kept_roles,
		'instructor_added', n_instructor, 'students_removed', n_removed,
		'folders_made', n_folders, 'folders_already_there', n_folders_kept, 'placeholders_made', n_placeholders,
		'folders', coalesce((select jsonb_agg(jsonb_build_object('folder', f.folder, 'owner', f.owner_email) order by f.folder_key)
			from public.armory_folders f where f.project_id = p_project and f.kind = 'personal'), '[]'::jsonb));
end $ac$;

revoke all on function public._armory_sync_section(uuid) from public, anon, authenticated;

do $ac$
begin
	if (select prosrc from pg_catalog.pg_proc where oid = 'public._armory_sync_section(uuid)'::regprocedure) !~ 'delete from pg_temp\.armory_roster where true' then
		raise exception '0320: _armory_sync_section still empties its roster with no WHERE';
	end if;
	if pg_catalog.has_function_privilege('authenticated', 'public._armory_sync_section(uuid)', 'execute') then
		raise exception '0320: authenticated can execute public._armory_sync_section';
	end if;
	raise notice '0320 armory class projects: the roster sync carries its WHERE';
end $ac$;
