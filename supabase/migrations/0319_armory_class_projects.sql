-- 0319_armory_class_projects.sql
--
-- IDEA ARMORY PROJECTS LINKED TO A CLASS (ledger 0463,
-- docs/feedback/2026-10-28/QUEUE-0463.md; Mr. Pina, 2026-10-28: "Do the
-- armory. Armory needs to be completely ready for tomorrow").
--
--   1. A LINK. armory_link_section(project, section) ties one Armory project
--      to one classroom section (armory_project_sections, one row per
--      project). The section's active roster becomes the project's members:
--      each student as student, the section's teacher of record as
--      instructor. A person who is already a member keeps the role they have,
--      always (an add is never a role change). A student the link added who
--      leaves the roster is taken off the project; their files stay. People
--      added by hand are never removed by the link. armory_section_members
--      records who the link added, so only those are ever removed.
--      armory_unlink_section stops following the roster and changes nobody.
--      A trigger on classroom_enrollments keeps a linked project following
--      its roster after the link; it can never fail an enrollment write (its
--      own failure is a warning, never a raise).
--
--   2. PERSONAL FOLDERS. Each linked student gets a top-level folder named
--      Last_First from the roster's display name ("Vanden Dries, Emma Maria"
--      is VandenDries_Emma); a clash on the roster adds the middle initial,
--      and a clash left after that adds a number. A folder, once made, keeps
--      its name. armory_folders records it, armory_folder_writers who may
--      write in it.
--
--   3. TEAM FOLDERS. armory_make_team_folders makes Teams/<team name> for each
--      team of the linked section's current draw. Its writers are the team's
--      members, replaced on every run; a folder never moves and no file is
--      ever moved or removed by it.
--
--   4. THE WRITE RULE, IN THE WRITE FUNCTIONS. A folder in armory_folders
--      governs everything under it. Only its writers may create a file there
--      (armory_create_file), check one out (armory_acquire_lock, and so
--      armory_lock_files), move a file into it (armory_move_file), or rename
--      or delete inside it (armory_rename_folder, armory_delete_folder); a
--      check in by anyone else becomes a side version, never the file's
--      version (armory_commit_version, and so the release-aware form).
--      Nobody but a lead may rename or delete a governed folder itself or a
--      folder holding one. A mentor, CAD lead, instructor or site admin
--      (armory_can_take_back, the one predicate) passes everywhere. Everyone
--      in the project still reads everything. The refusal is SQLSTATE PT403
--      (HTTP 403) with the words a student reads, "This is Ana's folder. Save
--      your work in your own folder.", and DETAIL {reason: not_your_folder,
--      folder, owner}; no address is in it.
--      A project with no row in armory_folders answers every call exactly as
--      before: each replaced body only adds a check that finds no rule.
--      Every signature is unchanged, so no deployed client is ordered
--      against this apply.
--
--   5. EMPTY FOLDERS THE DEPLOYED WINDOWS APP CAN SEE. Armory 0.5.1 knows a
--      folder only through a file in it that has a version: it makes local
--      folders as it downloads files, and a file with no version is listed as
--      "No first version" and never downloaded. So each folder made here gets
--      a small text file with a real version: "README - <folder>.txt", whose
--      bytes are one of two fixed texts (_armory_placeholder_hash names their
--      SHA-256). The website stores those bytes in file storage the first
--      time any computer asks for them (src/lib/server/armory/handlers.ts,
--      src/lib/armory/placeholders.ts). A file name is unique per project, so
--      the folder's name is in the file's name. The placeholder's version is
--      authored by whoever made the folder, never the student, and
--      armory_folders.placeholder_file_id marks it, so it is never counted as
--      a student's work.
--
-- WHAT UNDOES IT, a person's paste in this order:
--   drop trigger if exists armory_section_roster_follow on public.classroom_enrollments;
--   re-run the 0233 bodies of armory_create_file, armory_acquire_lock and
--   armory_commit_version, the 0236 bodies of armory_move_file and
--   armory_rename_folder, and the 0232 body of armory_delete_folder;
--   drop the functions this file creates (armory_link_section,
--   armory_unlink_section, armory_make_personal_folders,
--   armory_make_team_folders, armory_folder_list, armory_project_class and
--   every _armory_ helper named below). The four tables may stay; dropping
--   them is destructive DDL and is pasted by hand. Placeholder files stay as
--   ordinary files.

-- ---------------------------------------------------------------------------
-- 1. Tables. RLS on, no policy, no client grant: every read and write is a
--    definer function below.
-- ---------------------------------------------------------------------------

create table if not exists public.armory_project_sections (
	project_id uuid primary key references public.armory_projects on delete cascade,
	section_id uuid not null references public.classroom_sections (id) on delete cascade,
	linked_by text not null,
	linked_at timestamptz not null default now()
);

create table if not exists public.armory_section_members (
	project_id uuid not null references public.armory_projects on delete cascade,
	email text not null check (email = lower(btrim(email))),
	added_at timestamptz not null default now(),
	primary key (project_id, email)
);

create table if not exists public.armory_folders (
	project_id uuid not null references public.armory_projects on delete cascade,
	folder text not null,
	folder_key text generated always as (lower(folder)) stored,
	kind text not null check (kind in ('personal', 'team')),
	owner_email text check (owner_email is null or owner_email = lower(btrim(owner_email))),
	team_id uuid,
	label text not null,
	placeholder_file_id uuid references public.armory_files,
	created_by text not null,
	created_at timestamptz not null default now(),
	primary key (project_id, folder_key),
	check ((kind = 'personal') = (owner_email is not null))
);

create unique index if not exists armory_folders_owner_key
	on public.armory_folders (project_id, owner_email) where kind = 'personal';

create table if not exists public.armory_folder_writers (
	project_id uuid not null,
	folder_key text not null,
	email text not null check (email = lower(btrim(email))),
	primary key (project_id, folder_key, email),
	foreign key (project_id, folder_key) references public.armory_folders (project_id, folder_key) on delete cascade
);

alter table public.armory_project_sections enable row level security;
alter table public.armory_section_members enable row level security;
alter table public.armory_folders enable row level security;
alter table public.armory_folder_writers enable row level security;

revoke all on table public.armory_project_sections, public.armory_section_members,
	public.armory_folders, public.armory_folder_writers from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Names and the placeholder texts.
-- ---------------------------------------------------------------------------

-- Letters and digits only: spaces and punctuation removed.
create or replace function public._armory_name_part(p text) returns text
language sql immutable set search_path = '' as $ac$
	select regexp_replace(normalize(coalesce(p, ''), NFC), '[^[:alnum:]]', '', 'g')
$ac$;

-- Last_First from a roster display name, "Last, First Middle" (or "First
-- Middle Last" with no comma, the splitLastFirst reading). With p_middle the
-- middle initial follows the first name.
create or replace function public._armory_person_folder(p_display text, p_email text, p_middle boolean) returns text
language plpgsql immutable set search_path = '' as $ac$
declare d text := regexp_replace(coalesce(p_display, ''), '^\s+|\s+$', '', 'g'); last_part text; rest text; words text[]; l text; f text; m text;
begin
	if position(',' in d) > 0 then
		last_part := split_part(d, ',', 1);
		rest := regexp_replace(substr(d, position(',' in d) + 1), '^\s+|\s+$', '', 'g');
	else
		words := regexp_split_to_array(d, '\s+');
		last_part := words[cardinality(words)];
		rest := array_to_string(words[1:cardinality(words) - 1], ' ');
	end if;
	words := regexp_split_to_array(coalesce(rest, ''), '\s+');
	l := public._armory_name_part(last_part);
	f := public._armory_name_part(words[1]);
	m := left(public._armory_name_part(words[2]), 1);
	if l = '' then l := public._armory_name_part(split_part(coalesce(p_email, ''), '@', 1)); end if;
	if l = '' then l := 'Student'; end if;
	return left(l || case when f <> '' then '_' || f else '' end || case when p_middle and coalesce(m, '') <> '' then m else '' end, 100);
end $ac$;

-- The first name a refusal says ("This is Ana's folder").
create or replace function public._armory_first_name(p_display text) returns text
language plpgsql immutable set search_path = '' as $ac$
declare d text := regexp_replace(coalesce(p_display, ''), '^\s+|\s+$', '', 'g'); rest text;
begin
	if position(',' in d) > 0 then
		rest := regexp_replace(substr(d, position(',' in d) + 1), '^\s+|\s+$', '', 'g');
	else
		rest := d;
	end if;
	return nullif(split_part(rest, ' ', 1), '');
end $ac$;

-- A team's folder segment: its own name with the characters Windows refuses
-- taken out, else "Team <n>".
create or replace function public._armory_team_segment(p_name text, p_number integer) returns text
language plpgsql immutable set search_path = '' as $ac$
declare s text := regexp_replace(regexp_replace(normalize(coalesce(p_name, ''), NFC), '[\u0001-\u001f<>:"/\\|?*]', '', 'g'), '^\s+|[\s.]+$', '', 'g');
begin
	s := left(s, 60);
	if s = '' or not public.armory_valid_segment(s) then s := 'Team ' || p_number; end if;
	return s;
end $ac$;

-- The SHA-256 and length of the two placeholder texts, which
-- src/lib/armory/placeholders.ts holds byte for byte (tests/armory-class-placeholders.test.ts).
create or replace function public._armory_placeholder_hash(p_kind text) returns text
language sql immutable set search_path = '' as $ac$
	select case p_kind
		when 'personal' then '20af567f0310d646f19774ba42f935151c06a94a8c77ca51b063ec24d3eeeb90'
		when 'team' then '56298a48a5f9cd873d3aa3a5071c5fd8dca4061dbe985b55a14eccbaea09bfe4'
	end
$ac$;

create or replace function public._armory_placeholder_bytes(p_kind text) returns bigint
language sql immutable set search_path = '' as $ac$
	select case p_kind when 'personal' then 238::bigint when 'team' then 254::bigint end
$ac$;

-- ---------------------------------------------------------------------------
-- 3. The write rule: the folder that governs a path, and whether the caller
--    may write under it.
-- ---------------------------------------------------------------------------

create or replace function public._armory_folder_rule(p_project uuid, p_folder text) returns public.armory_folders
language sql stable security definer set search_path = '' as $ac$
	select f.* from public.armory_folders f
	where f.project_id = p_project
		and (lower(coalesce(p_folder, '')) = f.folder_key or left(lower(coalesce(p_folder, '')), length(f.folder_key) + 1) = f.folder_key || '/')
	order by length(f.folder_key) desc
	limit 1
$ac$;

-- True where no folder governs the path, for a lead, and for the folder's writers.
create or replace function public._armory_may_write_folder(p_project uuid, p_folder text) returns boolean
language plpgsql stable security definer set search_path = '' as $ac$
declare r public.armory_folders;
begin
	r := public._armory_folder_rule(p_project, p_folder);
	if r.project_id is null then return true; end if;
	if public.armory_can_take_back(p_project) then return true; end if;
	return exists (select 1 from public.armory_folder_writers w
		where w.project_id = p_project and w.folder_key = r.folder_key and w.email = public.current_user_email());
end $ac$;

create or replace function public._armory_refuse_folder_write(p_project uuid, p_folder text) returns void
language plpgsql stable security definer set search_path = '' as $ac$
declare r public.armory_folders;
begin
	if public._armory_may_write_folder(p_project, p_folder) then return; end if;
	r := public._armory_folder_rule(p_project, p_folder);
	raise exception '%', case when r.kind = 'team'
			then 'This folder is for team ' || r.label || '. Save your work in your own folder.'
			else 'This is ' || r.label || '''s folder. Save your work in your own folder.' end
		using errcode = 'PT403',
		detail = jsonb_build_object('reason', 'not_your_folder', 'folder', r.folder, 'kind', r.kind, 'owner', r.label)::text;
end $ac$;

-- Renaming or deleting a governed folder, or a folder holding one, is a lead's.
create or replace function public._armory_refuse_folder_reshape(p_project uuid, p_folder text) returns void
language plpgsql stable security definer set search_path = '' as $ac$
declare k text := lower(coalesce(p_folder, '')); r public.armory_folders;
begin
	if public.armory_can_take_back(p_project) then return; end if;
	select f.* into r from public.armory_folders f
	where f.project_id = p_project and (f.folder_key = k or left(f.folder_key, length(k) + 1) = k || '/')
	order by f.folder_key limit 1;
	if found then
		raise exception 'The folder "%" belongs to the class. Only your teacher can rename or remove it.', r.folder
			using errcode = 'PT403',
			detail = jsonb_build_object('reason', 'class_folder', 'folder', r.folder, 'kind', r.kind, 'owner', r.label)::text;
	end if;
	perform public._armory_refuse_folder_write(p_project, p_folder);
end $ac$;

-- ---------------------------------------------------------------------------
-- 4. Making a folder and its placeholder.
-- ---------------------------------------------------------------------------

-- A file name nobody in the project holds, alive or removed (the unique key covers both).
create or replace function public._armory_free_name(p_project uuid, p_name text) returns text
language plpgsql stable security definer set search_path = '' as $ac$
declare n int := 1; candidate text := p_name; stem text := regexp_replace(p_name, '\.txt$', '');
begin
	while exists (select 1 from public.armory_files f where f.project_id = p_project
		and lower(normalize(f.name, NFC)) = lower(normalize(candidate, NFC))) loop
		n := n + 1;
		candidate := stem || ' (' || n || ').txt';
	end loop;
	return candidate;
end $ac$;

-- The placeholder: a file with one real version whose bytes are the kind's
-- fixed text. Returns its id. The caller holds the project row.
create or replace function public._armory_make_placeholder(p_project uuid, p_folder text, p_kind text) returns uuid
language plpgsql security definer set search_path = '' as $ac$
declare e text := coalesce(nullif(public.current_user_email(), ''), 'system'); n text; f uuid; v uuid; h text := public._armory_placeholder_hash(p_kind);
begin
	n := public._armory_free_name(p_project, 'README - ' || replace(p_folder, '/', ' ') || '.txt');
	insert into public.armory_files(project_id, folder, name) values (p_project, p_folder, n) returning id into f;
	perform public.armory_add_change(p_project, 'file_created', f, jsonb_build_object('folder', p_folder, 'name', n, 'device_id', null, 'by', e));
	insert into public.armory_versions(file_id, parent_version_id, object_key, content_sha256, byte_length, author_email)
	values (f, null, 'blobs/sha256/' || substr(h, 1, 2) || '/' || substr(h, 3, 2) || '/' || h, h, public._armory_placeholder_bytes(p_kind), e)
	returning id into v;
	update public.armory_files set current_version_id = v where id = f;
	perform public.armory_add_change(p_project, 'version', v, jsonb_build_object('file_id', f, 'device_id', null));
	return f;
end $ac$;

-- A folder's placeholder, made again when it was removed. The caller holds the project row.
create or replace function public._armory_keep_placeholder(p_project uuid, p_folder_key text) returns boolean
language plpgsql security definer set search_path = '' as $ac$
declare r public.armory_folders; alive boolean;
begin
	select * into r from public.armory_folders where project_id = p_project and folder_key = p_folder_key;
	select exists (select 1 from public.armory_files f where f.id = r.placeholder_file_id and f.deleted_at is null and f.current_version_id is not null)
		into alive;
	if alive then return false; end if;
	update public.armory_folders set placeholder_file_id = public._armory_make_placeholder(p_project, r.folder, r.kind)
	where project_id = p_project and folder_key = p_folder_key;
	return true;
end $ac$;

-- ---------------------------------------------------------------------------
-- 5. Following the roster. The caller holds the project row FOR UPDATE.
-- ---------------------------------------------------------------------------

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
	delete from pg_temp.armory_roster;
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

-- Who may link, unlink and make folders: a site admin, or the section's
-- teacher who is a mentor or instructor of the project.
create or replace function public._armory_class_staff(p_project uuid, p_section uuid) returns boolean
language sql stable security definer set search_path = '' as $ac$
	select coalesce(public.is_admin(), false)
		or (p_section is not null and public.classroom_manages_section(p_section)
			and exists (select 1 from public.armory_members m where m.project_id = p_project
				and m.email = public.current_user_email() and m.role in ('mentor', 'instructor')))
$ac$;

-- ---------------------------------------------------------------------------
-- 6. The actions.
-- ---------------------------------------------------------------------------

create or replace function public.armory_link_section(p_project uuid, p_section_id uuid, p_operation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); r jsonb; cur uuid; result jsonb;
begin
	r := public.armory_replay(p_operation, 'armory_link_section');
	if r is not null then return r; end if;
	perform 1 from public.armory_projects where id = p_project for update;
	if not found then raise exception 'project not found' using errcode = 'P0002'; end if;
	if not exists (select 1 from public.classroom_sections where id = p_section_id) then
		raise exception 'class not found' using errcode = 'P0002';
	end if;
	if not public._armory_class_staff(p_project, p_section_id) then
		raise exception 'only a site admin, or the class''s teacher who is a mentor or instructor of the project, may link it to a class' using errcode = '42501';
	end if;
	select section_id into cur from public.armory_project_sections where project_id = p_project;
	if cur is not null and cur <> p_section_id then
		raise exception 'This project already follows another class. Unlink it first.' using errcode = '55000',
			detail = jsonb_build_object('reason', 'linked_elsewhere', 'section_id', cur)::text;
	end if;
	if cur is null then
		insert into public.armory_project_sections(project_id, section_id, linked_by) values (p_project, p_section_id, e);
		perform public.armory_add_change(p_project, 'class_linked', p_project, jsonb_build_object('section_id', p_section_id, 'by', e));
	end if;
	result := public._armory_sync_section(p_project) || jsonb_build_object('newly_linked', cur is null);
	return public.armory_remember(p_operation, 'armory_link_section', result);
end $ac$;

create or replace function public.armory_unlink_section(p_project uuid, p_operation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); r jsonb; cur uuid;
begin
	r := public.armory_replay(p_operation, 'armory_unlink_section');
	if r is not null then return r; end if;
	perform 1 from public.armory_projects where id = p_project for update;
	if not found then raise exception 'project not found' using errcode = 'P0002'; end if;
	select section_id into cur from public.armory_project_sections where project_id = p_project;
	if not public._armory_class_staff(p_project, cur) then
		raise exception 'only a site admin, or the class''s teacher who is a mentor or instructor of the project, may unlink it' using errcode = '42501';
	end if;
	if cur is not null then
		delete from public.armory_project_sections where project_id = p_project;
		delete from public.armory_section_members where project_id = p_project;
		perform public.armory_add_change(p_project, 'class_unlinked', p_project, jsonb_build_object('section_id', cur, 'by', e));
	end if;
	return public.armory_remember(p_operation, 'armory_unlink_section',
		jsonb_build_object('unlinked', cur is not null, 'section_id', cur, 'members_changed', 0, 'folders_kept', true));
end $ac$;

create or replace function public.armory_make_personal_folders(p_project uuid, p_operation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $ac$
declare r jsonb; cur uuid;
begin
	r := public.armory_replay(p_operation, 'armory_make_personal_folders');
	if r is not null then return r; end if;
	perform 1 from public.armory_projects where id = p_project for update;
	if not found then raise exception 'project not found' using errcode = 'P0002'; end if;
	select section_id into cur from public.armory_project_sections where project_id = p_project;
	if not public._armory_class_staff(p_project, cur) then
		raise exception 'only a site admin, or the class''s teacher who is a mentor or instructor of the project, may make its folders' using errcode = '42501';
	end if;
	if cur is null then
		raise exception 'This project is not linked to a class yet. Link it to a class first.' using errcode = '55000',
			detail = jsonb_build_object('reason', 'not_linked')::text;
	end if;
	return public.armory_remember(p_operation, 'armory_make_personal_folders', public._armory_sync_section(p_project));
end $ac$;

create or replace function public.armory_make_team_folders(p_project uuid, p_operation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $ac$
declare
	e text := public.armory_current_email(); r jsonb; cur uuid; v_set uuid; t record; seg text; fpath text; k int;
	row_key text; n_made int := 0; n_kept int := 0; v_out jsonb := '[]'::jsonb;
begin
	r := public.armory_replay(p_operation, 'armory_make_team_folders');
	if r is not null then return r; end if;
	perform 1 from public.armory_projects where id = p_project for update;
	if not found then raise exception 'project not found' using errcode = 'P0002'; end if;
	select section_id into cur from public.armory_project_sections where project_id = p_project;
	if not public._armory_class_staff(p_project, cur) then
		raise exception 'only a site admin, or the class''s teacher who is a mentor or instructor of the project, may make its folders' using errcode = '42501';
	end if;
	if cur is null then
		raise exception 'This project is not linked to a class yet. Link it to a class first.' using errcode = '55000',
			detail = jsonb_build_object('reason', 'not_linked')::text;
	end if;
	v_set := public._classroom_section_team_set(cur);
	if v_set is null then
		raise exception 'The class has no teams posted. Post the class teams first.' using errcode = '55000',
			detail = jsonb_build_object('reason', 'no_teams')::text;
	end if;
	for t in select ct.id, ct.team_number, ct.name from public.classroom_teams ct where ct.team_set_id = v_set order by ct.team_number loop
		seg := public._armory_team_segment(t.name, t.team_number);
		select folder_key into row_key from public.armory_folders where project_id = p_project and kind = 'team' and team_id = t.id;
		if row_key is null then
			-- A folder of this name from an earlier draw is taken over, never moved.
			select folder_key into row_key from public.armory_folders
			where project_id = p_project and kind = 'team' and folder_key = lower('Teams/' || seg);
			if row_key is not null then
				update public.armory_folders set team_id = t.id, label = seg where project_id = p_project and folder_key = row_key;
				n_kept := n_kept + 1;
			else
				fpath := 'Teams/' || seg; k := 1;
				while exists (select 1 from public.armory_folders f where f.project_id = p_project and f.folder_key = lower(fpath)) loop
					k := k + 1;
					fpath := 'Teams/' || seg || ' ' || k;
				end loop;
				insert into public.armory_folders(project_id, folder, kind, team_id, label, created_by)
				values (p_project, fpath, 'team', t.id, seg, e);
				row_key := lower(fpath);
				n_made := n_made + 1;
			end if;
		else
			n_kept := n_kept + 1;
		end if;
		delete from public.armory_folder_writers where project_id = p_project and folder_key = row_key;
		insert into public.armory_folder_writers(project_id, folder_key, email)
		select p_project, row_key, tm.student_email from public.classroom_team_members tm where tm.team_id = t.id
		on conflict do nothing;
		perform public._armory_keep_placeholder(p_project, row_key);
		v_out := v_out || jsonb_build_array(jsonb_build_object('folder', (select folder from public.armory_folders where project_id = p_project and folder_key = row_key),
			'writers', (select count(*) from public.armory_folder_writers w where w.project_id = p_project and w.folder_key = row_key)));
	end loop;
	perform public.armory_add_change(p_project, 'team_folders_made', p_project, jsonb_build_object('made', n_made, 'kept', n_kept, 'by', e));
	return public.armory_remember(p_operation, 'armory_make_team_folders',
		jsonb_build_object('folders_made', n_made, 'folders_already_there', n_kept, 'files_moved', 0, 'teams', v_out));
end $ac$;

-- Every class folder of a project, with who may write in it. For anyone who
-- may read the project; addresses are what the Team view already shows.
create or replace function public.armory_folder_list(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $ac$
begin
	if not public.armory_can_view(p_project) then raise exception 'not a project member' using errcode = '42501'; end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object('folder', f.folder, 'kind', f.kind, 'owner', f.owner_email, 'label', f.label,
			'team_id', f.team_id, 'placeholder_file_id', f.placeholder_file_id, 'created_at', f.created_at,
			'writers', coalesce((select jsonb_agg(w.email order by w.email) from public.armory_folder_writers w
				where w.project_id = f.project_id and w.folder_key = f.folder_key), '[]'::jsonb),
			'files', (select count(*) from public.armory_files x where x.project_id = f.project_id and x.deleted_at is null
				and x.id is distinct from f.placeholder_file_id
				and (lower(x.folder) = f.folder_key or left(lower(x.folder), length(f.folder_key) + 1) = f.folder_key || '/')))
			order by f.kind, f.folder_key)
		from public.armory_folders f where f.project_id = p_project
	), '[]'::jsonb);
end $ac$;

-- The class a project follows, or null.
create or replace function public.armory_project_class(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $ac$
begin
	if not public.armory_can_view(p_project) then raise exception 'not a project member' using errcode = '42501'; end if;
	return (select jsonb_build_object('section_id', s.id, 'label', s.label, 'course_code', c.code, 'course_title', c.title,
			'linked_at', ps.linked_at, 'linked_by', ps.linked_by,
			'roster', (select count(*) from public.classroom_enrollments ce where ce.section_id = s.id and ce.active),
			'folders', (select count(*) from public.armory_folders f where f.project_id = p_project))
		from public.armory_project_sections ps
		join public.classroom_sections s on s.id = ps.section_id
		join public.classroom_courses c on c.id = s.course_id
		where ps.project_id = p_project);
end $ac$;

-- ---------------------------------------------------------------------------
-- 7. The roster trigger. Never fails the enrollment write.
-- ---------------------------------------------------------------------------

create or replace function public._armory_follow_roster() returns trigger
language plpgsql security definer set search_path = '' as $ac$
declare v_section uuid := coalesce(new.section_id, old.section_id); p uuid;
begin
	for p in select ps.project_id from public.armory_project_sections ps where ps.section_id = v_section order by ps.project_id loop
		begin
			perform 1 from public.armory_projects where id = p for update;
			perform public._armory_sync_section(p);
		exception when others then
			raise warning 'armory: the class project % did not follow its roster: % %', p, sqlstate, sqlerrm;
		end;
	end loop;
	return null;
end $ac$;

drop trigger if exists armory_section_roster_follow on public.classroom_enrollments;
create trigger armory_section_roster_follow
	after insert or update of active, display_name or delete on public.classroom_enrollments
	for each row execute function public._armory_follow_roster();

-- ---------------------------------------------------------------------------
-- 8. The write functions, each the deployed body with only the lines marked
--    0319 added. Same signatures, same refusals where no folder rule applies.
-- ---------------------------------------------------------------------------

-- 0233's body.
create or replace function public.armory_create_file(p_project uuid, p_folder text, p_name text, p_device uuid, p_operation uuid) returns uuid
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); r jsonb; folder_n text; name_n text; v uuid; dead public.armory_files; holder text;
begin
	r := public.armory_replay(p_operation, 'armory_create_file');
	if r is not null then return (r->>'file_id')::uuid; end if;
	perform public.armory_require_device(p_device);
	if not public.armory_is_member(p_project) then raise exception 'not a project member' using errcode = '42501'; end if;
	-- 0233: the project row before the revival path locks a removed file (which a folder purge also locks).
	perform 1 from public.armory_projects where id = p_project for key share;
	folder_n := normalize(coalesce(p_folder, ''), NFC);
	name_n := normalize(coalesce(p_name, ''), NFC);
	if not public.armory_valid_folder(folder_n) then raise exception 'The folder "%" cannot be a Windows folder path.', folder_n using errcode = '22023'; end if;
	if not public.armory_valid_segment(name_n) then raise exception 'The name "%" cannot be a Windows file name.', name_n using errcode = '22023'; end if;
	-- 0319: only a class folder's writers add files under it.
	perform public._armory_refuse_folder_write(p_project, folder_n);
	-- Serialize creators of one name, so a revival and a concurrent create cannot both win.
	perform pg_advisory_xact_lock(hashtextextended('armory_file_name:' || p_project::text || ':' || lower(name_n), 0));
	perform public.armory_live_name_taken(p_project, name_n, null);
	select * into dead from public.armory_files
	where project_id = p_project and lower(normalize(name, NFC)) = lower(name_n) and deleted_at is not null
	for update;
	if found then
		select holder_email into holder from public.armory_locks where file_id = dead.id and broken_at is null;
		delete from public.armory_locks where file_id = dead.id;
		delete from public.armory_tombstones where file_id = dead.id;
		update public.armory_files set deleted_at = null, folder = folder_n, name = name_n where id = dead.id;
		v := dead.id;
		perform public.armory_add_change(p_project, 'file_revived', v, jsonb_build_object('folder', folder_n, 'name', name_n,
			'old_folder', dead.folder, 'old_name', dead.name, 'released_checkout_of', holder, 'device_id', p_device, 'by', e));
	else
		begin
			insert into public.armory_files(project_id, folder, name) values (p_project, folder_n, name_n) returning id into v;
		exception when unique_violation then
			-- A concurrent creator won; name the folder where its file now lives.
			perform public.armory_name_taken(p_project, name_n, null);
			raise;
		end;
		perform public.armory_add_change(p_project, 'file_created', v, jsonb_build_object('folder', folder_n, 'name', name_n, 'device_id', p_device, 'by', e));
	end if;
	perform public.armory_remember(p_operation, 'armory_create_file', jsonb_build_object('file_id', v));
	return v;
end $ac$;

-- 0233's body.
create or replace function public.armory_acquire_lock(p_file uuid, p_device uuid, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); p uuid; r jsonb; answer boolean;
begin
	r := public.armory_replay(p_operation, 'armory_acquire_lock');
	if r is not null then return (r->>'result')::boolean; end if;
	perform public.armory_require_device(p_device);
	select project_id into p from public.armory_files where id = p_file;
	-- 0233: the project row first, then the file again, in case a purge removed it while this waited.
	perform 1 from public.armory_projects where id = p for key share;
	select project_id into p from public.armory_files where id = p_file;
	if e = '' or not public.armory_is_member(p) then raise exception 'not a project member'; end if;
	-- 0319: only a class folder's writers check out a file in it.
	perform public._armory_refuse_folder_write(p, (select folder from public.armory_files where id = p_file));
	insert into public.armory_locks(file_id, holder_email, holder_device_id) values (p_file, e, p_device)
	on conflict (file_id) do update set holder_email = excluded.holder_email, holder_device_id = excluded.holder_device_id,
		acquired_at = now(), broken_at = null, broken_by = null, broken_holder_email = null, broken_holder_device_id = null
	where public.armory_locks.broken_at is not null;
	answer := exists(select 1 from public.armory_locks where file_id = p_file and holder_email = e and holder_device_id = p_device and broken_at is null);
	if answer then perform public.armory_add_change(p, 'lock_acquired', p_file, jsonb_build_object('holder', e, 'device_id', p_device)); end if;
	perform public.armory_remember(p_operation, 'armory_acquire_lock', jsonb_build_object('result', answer));
	return answer;
end $ac$;

-- 0233's body.
create or replace function public.armory_commit_version(p_file uuid, p_parent uuid, p_key text, p_hash text, p_bytes bigint, p_device uuid, p_operation uuid)
returns table(version_id uuid, advanced boolean)
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); f public.armory_files; v uuid; a boolean; r jsonb; p uuid;
begin
	r := public.armory_replay(p_operation, 'armory_commit_version');
	if r is not null then return query select (r->>'version_id')::uuid, (r->>'advanced')::boolean; return; end if;
	perform public.armory_require_device(p_device);
	-- 0233: the project row before the file row.
	select project_id into p from public.armory_files where id = p_file;
	perform 1 from public.armory_projects where id = p for key share;
	select * into f from public.armory_files where id = p_file for update;
	if not found then raise exception 'file not found'; end if;
	if not exists(select 1 from public.armory_locks where file_id = p_file and holder_email = e and holder_device_id = p_device and broken_at is null) then
		insert into public.armory_side_versions(file_id, parent_version_id, object_key, content_sha256, byte_length, author_email, reason)
		values (p_file, p_parent, p_key, p_hash, p_bytes, e, 'caller does not hold lock') returning id into v;
		a := false;
		perform public.armory_add_change(f.project_id, 'side_version', v, jsonb_build_object('file_id', p_file, 'device_id', p_device));
	-- 0319: a check in under a class folder the caller may not write in is kept as their copy, never the file's version.
	elsif not public._armory_may_write_folder(f.project_id, f.folder) then
		insert into public.armory_side_versions(file_id, parent_version_id, object_key, content_sha256, byte_length, author_email, reason)
		values (p_file, p_parent, p_key, p_hash, p_bytes, e, 'not your folder') returning id into v;
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
end $ac$;

-- 0236's body.
create or replace function public.armory_move_file(p_file uuid, p_folder text, p_name text, p_device uuid, p_operation uuid) returns boolean
language plpgsql security definer set search_path = '' as $ac$
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
		-- 0319: a file moves out of a class folder and into one only for that folder's writers.
		perform public._armory_refuse_folder_write(f.project_id, f.folder);
		perform public._armory_refuse_folder_write(f.project_id, folder_n);
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
end $ac$;

-- 0236's body.
create or replace function public.armory_rename_folder(p_project uuid, p_from text, p_to text, p_device uuid, p_operation uuid) returns int
language plpgsql security definer set search_path = '' as $ac$
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
	-- 0319: a class folder, or a folder holding one, is renamed only by a lead; inside one, only by its writers.
	perform public._armory_refuse_folder_reshape(p_project, from_n);
	perform public._armory_refuse_folder_write(p_project, to_n);
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
end $ac$;

-- 0232's body.
create or replace function public.armory_delete_folder(p_project uuid, p_folder text, p_device uuid, p_operation uuid) returns int
language plpgsql security definer set search_path = '' as $ac$
declare e text := public.armory_current_email(); r jsonb; folder_n text; ids uuid[]; removed int;
begin
	r := public.armory_replay(p_operation, 'armory_delete_folder');
	if r is not null then return (r->>'result')::int; end if;
	perform public.armory_require_device(p_device);
	if not public.armory_is_member(p_project) then raise exception 'not a project member' using errcode = '42501'; end if;
	folder_n := normalize(coalesce(p_folder, ''), NFC);
	if folder_n = '' or not public.armory_valid_folder(folder_n) then raise exception 'The folder "%" cannot be a Windows folder path.', folder_n using errcode = '22023'; end if;
	perform 1 from public.armory_projects where id = p_project for update;
	-- 0319: a class folder, or a folder holding one, is removed only by a lead; inside one, only by its writers.
	perform public._armory_refuse_folder_reshape(p_project, folder_n);
	select array_agg(f.id) into ids from public.armory_folder_files(p_project, folder_n) f;
	if ids is null then
		removed := 0;
	else
		perform public.armory_refuse_checked_out(ids, p_device, folder_n);
		insert into public.armory_tombstones(file_id, version_id, author_email)
		select f.id, f.current_version_id, e from public.armory_files f where f.id = any(ids)
		on conflict do nothing;
		update public.armory_files set deleted_at = now() where id = any(ids);
		removed := cardinality(ids);
		perform public.armory_add_change(p_project, 'folder_deleted', p_project,
			jsonb_build_object('folder', folder_n, 'files', removed, 'device_id', p_device, 'by', e));
	end if;
	perform public.armory_remember(p_operation, 'armory_delete_folder', jsonb_build_object('result', removed));
	return removed;
end $ac$;

-- ---------------------------------------------------------------------------
-- 9. Grants, the 0166 shape. The replaced functions keep their ACLs (create
--    or replace never touches one).
-- ---------------------------------------------------------------------------

revoke all on function
	public._armory_name_part(text),
	public._armory_person_folder(text, text, boolean),
	public._armory_first_name(text),
	public._armory_team_segment(text, integer),
	public._armory_placeholder_hash(text),
	public._armory_placeholder_bytes(text),
	public._armory_folder_rule(uuid, text),
	public._armory_may_write_folder(uuid, text),
	public._armory_refuse_folder_write(uuid, text),
	public._armory_refuse_folder_reshape(uuid, text),
	public._armory_free_name(uuid, text),
	public._armory_make_placeholder(uuid, text, text),
	public._armory_keep_placeholder(uuid, text),
	public._armory_sync_section(uuid),
	public._armory_class_staff(uuid, uuid),
	public._armory_follow_roster()
from public, anon, authenticated;

revoke all on function
	public.armory_link_section(uuid, uuid, uuid),
	public.armory_unlink_section(uuid, uuid),
	public.armory_make_personal_folders(uuid, uuid),
	public.armory_make_team_folders(uuid, uuid),
	public.armory_folder_list(uuid),
	public.armory_project_class(uuid)
from public, anon, authenticated;
grant execute on function
	public.armory_link_section(uuid, uuid, uuid),
	public.armory_unlink_section(uuid, uuid),
	public.armory_make_personal_folders(uuid, uuid),
	public.armory_make_team_folders(uuid, uuid),
	public.armory_folder_list(uuid),
	public.armory_project_class(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Self-check, by name over this file's own objects.
-- ---------------------------------------------------------------------------

do $ac$
declare
	v_f text;
	v_n integer;
begin
	foreach v_f in array array[
		'armory_link_section(uuid, uuid, uuid)', 'armory_unlink_section(uuid, uuid)',
		'armory_make_personal_folders(uuid, uuid)', 'armory_make_team_folders(uuid, uuid)',
		'armory_folder_list(uuid)', 'armory_project_class(uuid)',
		'armory_create_file(uuid, text, text, uuid, uuid)', 'armory_acquire_lock(uuid, uuid, uuid)',
		'armory_commit_version(uuid, uuid, text, text, bigint, uuid, uuid)', 'armory_move_file(uuid, text, text, uuid, uuid)',
		'armory_rename_folder(uuid, text, text, uuid, uuid)', 'armory_delete_folder(uuid, text, uuid, uuid)'] loop
		select count(*) into v_n from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = split_part(v_f, '(', 1);
		if v_n <> 1 then raise exception '0319: expected exactly one public.%, found %', split_part(v_f, '(', 1), v_n; end if;
		if pg_catalog.has_function_privilege('anon', 'public.' || v_f, 'execute') then raise exception '0319: anon can execute public.%', v_f; end if;
		if not pg_catalog.has_function_privilege('authenticated', 'public.' || v_f, 'execute') then raise exception '0319: authenticated cannot execute public.%', v_f; end if;
	end loop;
	foreach v_f in array array['_armory_may_write_folder(uuid, text)', '_armory_sync_section(uuid)', '_armory_make_placeholder(uuid, text, text)'] loop
		if pg_catalog.has_function_privilege('authenticated', 'public.' || v_f, 'execute') then raise exception '0319: authenticated can execute the helper public.%', v_f; end if;
	end loop;
	if public._armory_person_folder('Vanden Dries, Emma Maria', 'e@x', false) <> 'VandenDries_Emma'
		or public._armory_person_folder('Vanden Dries, Emma Maria', 'e@x', true) <> 'VandenDries_EmmaM' then
		raise exception '0319: the folder name rule does not read Vanden Dries, Emma Maria as VandenDries_Emma';
	end if;
	raise notice '0319 armory class projects: 4 tables, 6 new RPCs, 6 write functions guarded; % projects linked', (select count(*) from public.armory_project_sections);
end $ac$;
