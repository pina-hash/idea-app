-- 0083_classroom_management.sql
-- Classroom bundle 2: full management, attachments, and admin view-as-student.
--
-- WHAT THIS ADDS, and the one rule it does not bend. 0082 shipped content +
-- roster with ZERO client write grants: every write is a SECURITY DEFINER RPC
-- that re-checks the caller inside its own body. Nothing here changes that.
-- Every new capability below is another such RPC.
--
--   1. SECTION LIFECYCLE. A section gains `active` (archive, never delete) and
--      two RPCs: classroom_set_section_active and classroom_delete_section.
--      Delete is deliberately NOT a cascade: 0082 declared
--      classroom_posts/_assignments/_enrollments ON DELETE CASCADE, so a bare
--      delete would silently take a term's announcements, classwork and roster
--      with it. classroom_delete_section REFUSES the moment any of the three
--      exists, returns the counts so the caller can say what would be lost, and
--      points at deactivation instead -- so there is NO path, anywhere, from a
--      teacher's click to silent data loss. Only a genuinely empty section (a
--      mistyped label, a period that never ran) can actually be removed, and
--      even that requires the label typed back (the tournament_delete
--      server-side confirmation convention: putting it in the RPC means no
--      client bug or stray PostgREST call can destroy a section by id alone).
--
--   2. ENROLLMENT CORRECTIONS. classroom_update_enrollment fixes a typo'd email
--      or display name IN PLACE. The email is part of the enrollment PK, so a
--      correction is an UPDATE of that key rather than a new row -- the point is
--      that a typo does not leave a dead enrollment behind for a student who
--      never existed. Emails stay lowercased on write, the 0082/0070 keying
--      convention.
--
--   3. ATTACHMENTS. classroom_attachments carries file metadata only; the BYTES
--      live in the school's Google shared drive, reached through the existing
--      notebook Drive module (one OAuth egress point, supportsAllDrives=true),
--      and are served by an RLS-enforcing proxy route -- Drive-side sharing is
--      never relied on, exactly as for notebook photos. Visibility DELEGATES to
--      the parent post/assignment (classroom_can_read_post /
--      classroom_can_read_assignment) so an attachment can never outlive its
--      parent's draft state: unpublishing a post hides its attachments in the
--      same statement, with no second rule to keep in sync.
--
--      ONE DRIVE FILE, N ROWS. A multi-section publish makes one independent
--      row per section, so attaching a file to a 3-section announcement makes 3
--      attachment rows -- all pointing at ONE uploaded Drive file. That is why
--      classroom_delete_attachment reports whether the file is now ORPHANED:
--      the route deletes the Drive blob only when the last row referencing it
--      goes, so removing one section's copy never blanks the other two.
--
--   4. VIEW AS STUDENT (admin only). There is no way to obtain a
--      @boscotech.net session for testing, so an admin can render the student
--      experience for any enrolled email. The gate is IN THESE FUNCTIONS
--      (is_admin(), 0067), not in a page load: a load guard is convenience, and
--      "non-admins can never reach any form of it" has to be enforced where a
--      request cannot talk its way past it.
--
--      These are READS ONLY -- there is deliberately no view_as write RPC of
--      any kind, so "no write executes while impersonating" is a property of
--      the surface area rather than a discipline the UI has to keep. And they
--      only ever NARROW: an admin can already read every section, every draft
--      and every roster row through 0082's own policies, so filtering to one
--      student's active enrollments and published content can never reveal
--      anything the caller could not already see. It hides; it never widens.
--
-- Apply manually in the Supabase SQL editor, after 0082.

-- ---------------------------------------------------------------------------
-- 1. Section lifecycle: archive-not-delete.
-- ---------------------------------------------------------------------------

-- Deliberately NOT wired into any RLS policy: an archived section stays
-- readable to its members exactly as before, because last year's announcements
-- and classwork are the record of the class and hiding them is a second kind of
-- data loss. `active` is a lifecycle FLAG the UI surfaces (an "Archived" chip,
-- archived sections out of the composer's publish targets), the
-- coin_sections / classroom_enrollments archive convention applied to sections.
alter table public.classroom_sections
	add column if not exists active boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Attachments.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_attachments (
	id uuid primary key default gen_random_uuid(),
	-- Exactly one owner (the CHECK below). Both cascade, so removing a post or
	-- assignment takes its attachment ROWS with it; the Drive blobs are swept
	-- by the route that owns the deletion, never by the database.
	post_id uuid references public.classroom_posts (id) on delete cascade,
	assignment_id uuid references public.classroom_assignments (id) on delete cascade,
	-- The Drive file id, the only handle to the bytes (the notebook convention:
	-- Postgres never stores the image itself).
	drive_file_id text not null check (char_length(btrim(drive_file_id)) between 1 and 200),
	-- The browser-supplied name. Display + the Drive filename fallback only;
	-- never an access control input, never a path.
	filename text not null check (char_length(btrim(filename)) between 1 and 300),
	mime_type text not null check (char_length(btrim(mime_type)) between 1 and 200),
	size_bytes bigint check (size_bytes is null or size_bytes >= 0),
	uploaded_by text not null,
	sort_order integer not null default 1 check (sort_order >= 1),
	created_at timestamptz not null default now(),
	constraint classroom_attachments_one_owner check (
		(post_id is not null and assignment_id is null)
		or (post_id is null and assignment_id is not null)
	)
);

create index if not exists classroom_attachments_post_idx
	on public.classroom_attachments (post_id, sort_order);
create index if not exists classroom_attachments_assignment_idx
	on public.classroom_attachments (assignment_id, sort_order);
create index if not exists classroom_attachments_drive_idx
	on public.classroom_attachments (drive_file_id);

-- The post counterpart of 0082's classroom_can_read_assignment: the section's
-- manager sees everything, an enrolled student only what is published.
create or replace function public.classroom_can_read_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.classroom_posts p
		where p.id = p_post_id
			and (
				public.classroom_manages_section(p.section_id)
				or (p.published and public.classroom_is_enrolled(p.section_id))
			)
	);
$$;

revoke all on function public.classroom_can_read_post(uuid) from public;
grant execute on function public.classroom_can_read_post(uuid) to authenticated;

revoke all on public.classroom_attachments from anon, authenticated;
grant select on public.classroom_attachments to authenticated;
alter table public.classroom_attachments enable row level security;

-- Visibility is entirely the parent's. There is no `published` column here and
-- there must never be one: a second copy of the draft rule is a second thing to
-- keep in sync, and the one that drifts is the one nobody is looking at.
drop policy if exists "classroom attachments follow their owner" on public.classroom_attachments;
create policy "classroom attachments follow their owner"
	on public.classroom_attachments
	for select
	to authenticated
	using (
		(post_id is not null and public.classroom_can_read_post(post_id))
		or (assignment_id is not null and public.classroom_can_read_assignment(assignment_id))
	);

-- ---------------------------------------------------------------------------
-- 3. Section editing, archiving, deletion.
-- ---------------------------------------------------------------------------

-- Recreated from 0082 with ONE change, in the EDIT branch only: the teacher of
-- record may now hand their own section to another @boscotech.edu teacher
-- instead of that being admin-only.
--
-- Why that is safe, since it reads like a loosening: the caller must already
-- manage the section (classroom_manages_section), so the only thing this
-- permits is GIVING AWAY access you already hold -- never taking it. A teacher
-- still cannot touch a section that is not theirs, which is the assertion that
-- actually protects anyone. CREATING a section for someone else stays
-- admin-only, and the @boscotech.edu domain check is unchanged, so a section
-- can never land on a student or an outside address.
create or replace function public.classroom_upsert_section(
	p_course_id uuid,
	p_label text,
	p_block text default null,
	p_teacher_email text default null,
	p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_caller text := public.current_user_email();
	v_label text := btrim(coalesce(p_label, ''));
	v_block text := nullif(btrim(coalesce(p_block, '')), '');
	v_teacher text := lower(btrim(coalesce(p_teacher_email, '')));
	v_id uuid := p_id;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.classroom_is_staff() then
		raise exception 'Only staff can manage classroom sections.';
	end if;
	if v_teacher = '' then
		-- Editing with no teacher supplied keeps the section where it is; a new
		-- section defaults to its creator.
		if v_id is null then
			v_teacher := v_caller;
		else
			select s.teacher_email into v_teacher from public.classroom_sections s where s.id = v_id;
			v_teacher := coalesce(v_teacher, v_caller);
		end if;
	end if;
	if v_teacher not like '%@boscotech.edu' then
		raise exception 'The teacher of record must be a @boscotech.edu account (got "%").', v_teacher;
	end if;
	if v_label = '' then
		raise exception 'A section label is required.';
	end if;
	if p_course_id is null or not exists (
		select 1 from public.classroom_courses c where c.id = p_course_id
	) then
		raise exception 'That course does not exist.';
	end if;

	if v_id is null then
		if v_teacher <> v_caller and not public.is_admin() then
			raise exception 'Only a site admin can create a section for another teacher.';
		end if;
		insert into public.classroom_sections (course_id, label, block, teacher_email)
		values (p_course_id, v_label, v_block, v_teacher)
		returning id into v_id;
	else
		if not public.classroom_manages_section(v_id) then
			raise exception 'Only the section''s teacher of record or a site admin can edit it.';
		end if;
		update public.classroom_sections
		set course_id = p_course_id,
			label = v_label,
			block = v_block,
			teacher_email = v_teacher
		where id = v_id;
		if not found then
			raise exception 'That section does not exist.';
		end if;
	end if;

	return jsonb_build_object('section_id', v_id, 'teacher_email', v_teacher);
exception
	when unique_violation then
		raise exception 'That course already has a section labelled "%".', v_label;
end;
$$;

revoke all on function public.classroom_upsert_section(uuid, text, text, text, uuid) from public;
grant execute on function public.classroom_upsert_section(uuid, text, text, text, uuid) to authenticated;

-- Archive / reactivate. Soft state, never a delete: the roster, the stream and
-- every graded record stay exactly as they were.
create or replace function public.classroom_set_section_active(
	p_id uuid,
	p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_id is null or not exists (select 1 from public.classroom_sections s where s.id = p_id) then
		raise exception 'That section does not exist.';
	end if;
	if not public.classroom_manages_section(p_id) then
		raise exception 'Only the section''s teacher of record or a site admin can archive it.';
	end if;

	update public.classroom_sections
	set active = coalesce(p_active, true)
	where id = p_id;

	return jsonb_build_object('section_id', p_id, 'active', coalesce(p_active, true));
end;
$$;

revoke all on function public.classroom_set_section_active(uuid, boolean) from public;
grant execute on function public.classroom_set_section_active(uuid, boolean) to authenticated;

-- Delete a section -- ONLY when there is genuinely nothing to lose.
--
-- The refusal is a STRUCTURED RETURN, not an exception (the
-- greenline_purchase_item / coin_log_transaction convention), because "this
-- class has 3 announcements, 5 assignments and 22 students -- archive it
-- instead" is information the caller must render, not an error to swallow. A
-- genuine misuse (not your section, wrong name) still raises.
create or replace function public.classroom_delete_section(
	p_id uuid,
	p_confirm_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_label text;
	v_posts integer;
	v_assignments integer;
	v_enrollments integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select s.label into v_label from public.classroom_sections s where s.id = p_id for update;
	if v_label is null then
		raise exception 'That section does not exist.';
	end if;
	if not public.classroom_manages_section(p_id) then
		raise exception 'Only the section''s teacher of record or a site admin can delete it.';
	end if;

	select count(*) into v_posts from public.classroom_posts where section_id = p_id;
	select count(*) into v_assignments from public.classroom_assignments where section_id = p_id;
	select count(*) into v_enrollments from public.classroom_enrollments where section_id = p_id;

	if v_posts > 0 or v_assignments > 0 or v_enrollments > 0 then
		return jsonb_build_object(
			'ok', false,
			'reason', 'not_empty',
			'posts', v_posts,
			'assignments', v_assignments,
			'enrollments', v_enrollments
		);
	end if;

	-- Typing the label back is the confirmation, checked HERE so no client bug
	-- or hand-rolled call can delete a section by id alone. Case and surrounding
	-- whitespace are forgiven; internal spacing is not, since typing it is the
	-- point.
	if lower(btrim(coalesce(p_confirm_label, ''))) <> lower(btrim(v_label)) then
		raise exception 'Type the section label ("%") to confirm deletion.', v_label;
	end if;

	delete from public.classroom_sections where id = p_id;
	return jsonb_build_object('ok', true, 'deleted', true, 'label', v_label);
end;
$$;

revoke all on function public.classroom_delete_section(uuid, text) from public;
grant execute on function public.classroom_delete_section(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Enrollment corrections.
-- ---------------------------------------------------------------------------

-- Fix a mistyped email or display name in place. 0082's classroom_set_enrollment
-- can only ever ADD a row for a new email, which is exactly wrong for a typo: it
-- leaves the misspelled enrollment sitting on the roster forever.
create or replace function public.classroom_update_enrollment(
	p_section_id uuid,
	p_student_email text,
	p_new_email text default null,
	p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_old text := lower(btrim(coalesce(p_student_email, '')));
	v_new text := lower(btrim(coalesce(p_new_email, '')));
	v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_section_id is null or not exists (
		select 1 from public.classroom_sections s where s.id = p_section_id
	) then
		raise exception 'That section does not exist.';
	end if;
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'Only the section''s teacher of record or a site admin can manage its roster.';
	end if;
	if not exists (
		select 1 from public.classroom_enrollments e
		where e.section_id = p_section_id and e.student_email = v_old
	) then
		raise exception 'No enrollment for % in this section.', v_old;
	end if;

	if v_new = '' then
		v_new := v_old;
	end if;
	if v_new !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
		raise exception 'Enter a valid student email address.';
	end if;
	if v_new <> v_old and exists (
		select 1 from public.classroom_enrollments e
		where e.section_id = p_section_id and e.student_email = v_new
	) then
		return jsonb_build_object('ok', false, 'reason', 'already_enrolled', 'student_email', v_new);
	end if;

	-- The email is half the primary key, so the correction IS an update of that
	-- key; there is nothing left behind to clean up afterwards.
	update public.classroom_enrollments
	set student_email = v_new,
		display_name = coalesce(v_name, display_name),
		updated_at = now()
	where section_id = p_section_id and student_email = v_old;

	return jsonb_build_object('ok', true, 'student_email', v_new);
end;
$$;

revoke all on function public.classroom_update_enrollment(uuid, text, text, text) from public;
grant execute on function public.classroom_update_enrollment(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Attachment writes.
-- ---------------------------------------------------------------------------

-- Attach ONE already-uploaded Drive file to one or more posts (or one or more
-- assignments). Plural because a multi-section publish produced N independent
-- rows and the same file belongs on all of them -- uploaded once, referenced N
-- times.
--
-- All-or-nothing on authorization, the _classroom_check_publish_targets rule:
-- naming one owner the caller does not manage refuses the whole call, so a
-- partial attach can never land.
create or replace function public.classroom_add_attachment(
	p_owner_kind text,
	p_owner_ids uuid[],
	p_drive_file_id text,
	p_filename text,
	p_mime_type text,
	p_size_bytes bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_kind text := lower(btrim(coalesce(p_owner_kind, '')));
	v_ids uuid[];
	v_owner uuid;
	v_section uuid;
	v_file text := btrim(coalesce(p_drive_file_id, ''));
	v_name text := left(btrim(coalesce(p_filename, '')), 300);
	v_mime text := left(btrim(coalesce(p_mime_type, '')), 200);
	v_next integer;
	v_id uuid;
	v_rows jsonb := '[]'::jsonb;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if v_kind not in ('post', 'assignment') then
		raise exception 'Attachments belong to a post or an assignment.';
	end if;
	if v_file = '' then
		raise exception 'A Drive file id is required.';
	end if;
	if v_name = '' then
		v_name := 'attachment';
	end if;
	if v_mime = '' then
		v_mime := 'application/octet-stream';
	end if;

	select array_agg(distinct s) into v_ids
	from unnest(coalesce(p_owner_ids, '{}'::uuid[])) as s
	where s is not null;
	if v_ids is null or array_length(v_ids, 1) = 0 then
		raise exception 'Nothing to attach the file to.';
	end if;
	if array_length(v_ids, 1) > 50 then
		raise exception 'At most 50 targets per attachment.';
	end if;

	-- Authorize EVERY target before inserting anything.
	foreach v_owner in array v_ids loop
		if v_kind = 'post' then
			select p.section_id into v_section from public.classroom_posts p where p.id = v_owner;
		else
			select a.section_id into v_section from public.classroom_assignments a where a.id = v_owner;
		end if;
		if v_section is null then
			raise exception 'That % does not exist.', v_kind;
		end if;
		if not public.classroom_manages_section(v_section) then
			raise exception 'Only the section''s teacher of record or a site admin can attach files here.';
		end if;
	end loop;

	foreach v_owner in array v_ids loop
		if v_kind = 'post' then
			select coalesce(max(sort_order), 0) + 1 into v_next
			from public.classroom_attachments where post_id = v_owner;
			insert into public.classroom_attachments
				(post_id, drive_file_id, filename, mime_type, size_bytes, uploaded_by, sort_order)
			values (v_owner, v_file, v_name, v_mime, p_size_bytes,
				public.current_user_email(), v_next)
			returning id into v_id;
		else
			select coalesce(max(sort_order), 0) + 1 into v_next
			from public.classroom_attachments where assignment_id = v_owner;
			insert into public.classroom_attachments
				(assignment_id, drive_file_id, filename, mime_type, size_bytes, uploaded_by, sort_order)
			values (v_owner, v_file, v_name, v_mime, p_size_bytes,
				public.current_user_email(), v_next)
			returning id into v_id;
		end if;
		v_rows := v_rows || jsonb_build_array(jsonb_build_object(
			'id', v_id, 'owner_id', v_owner, 'sort_order', v_next));
	end loop;

	return jsonb_build_object('ok', true, 'attachments', v_rows, 'drive_file_id', v_file);
end;
$$;

revoke all on function public.classroom_add_attachment(text, uuid[], text, text, text, bigint) from public;
grant execute on function public.classroom_add_attachment(text, uuid[], text, text, text, bigint) to authenticated;

-- Removes one attachment ROW and reports whether the Drive blob is now
-- unreferenced. The route deletes the blob only on `orphaned` -- one upload can
-- back several rows (see the header), and blanking a sibling section's copy
-- because this one was removed would be exactly the silent loss this bundle is
-- meant to rule out.
create or replace function public.classroom_delete_attachment(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_row public.classroom_attachments%rowtype;
	v_section uuid;
	v_remaining integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select * into v_row from public.classroom_attachments where id = p_id for update;
	if not found then
		raise exception 'That attachment does not exist.';
	end if;

	if v_row.post_id is not null then
		select p.section_id into v_section from public.classroom_posts p where p.id = v_row.post_id;
	else
		select a.section_id into v_section from public.classroom_assignments a where a.id = v_row.assignment_id;
	end if;
	if v_section is null or not public.classroom_manages_section(v_section) then
		raise exception 'Only the section''s teacher of record or a site admin can remove this attachment.';
	end if;

	delete from public.classroom_attachments where id = p_id;

	select count(*) into v_remaining
	from public.classroom_attachments
	where drive_file_id = v_row.drive_file_id;

	return jsonb_build_object(
		'ok', true,
		'deleted', true,
		'drive_file_id', v_row.drive_file_id,
		'orphaned', v_remaining = 0
	);
end;
$$;

revoke all on function public.classroom_delete_attachment(uuid) from public;
grant execute on function public.classroom_delete_attachment(uuid) to authenticated;

-- Deleting a post or an assignment CASCADES its attachment rows away (0083's
-- FKs), which would strand their Drive blobs forever -- nothing else ever looks
-- at that file id again. Both delete RPCs are therefore recreated to report the
-- file ids that became ORPHANED, so the route that called them can sweep the
-- blobs. Same "only when the LAST row referencing it goes" rule
-- classroom_delete_attachment uses; the database still never talks to Drive.
create or replace function public.classroom_delete_post(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_section uuid;
	v_files text[];
	v_orphans text[];
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select p.section_id into v_section
	from public.classroom_posts p
	where p.id = p_id
	for update;
	if not found then
		raise exception 'That post does not exist.';
	end if;
	if not public.classroom_manages_section(v_section) then
		raise exception 'Only the section''s teacher of record or a site admin can delete this post.';
	end if;

	select coalesce(array_agg(distinct drive_file_id), '{}'::text[]) into v_files
	from public.classroom_attachments where post_id = p_id;

	delete from public.classroom_posts where id = p_id;

	select coalesce(array_agg(f), '{}'::text[]) into v_orphans
	from unnest(v_files) as f
	where not exists (
		select 1 from public.classroom_attachments t where t.drive_file_id = f
	);

	return jsonb_build_object('deleted', true, 'orphaned_drive_file_ids', to_jsonb(v_orphans));
end;
$$;

revoke all on function public.classroom_delete_post(uuid) from public;
grant execute on function public.classroom_delete_post(uuid) to authenticated;

create or replace function public.classroom_delete_assignment(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_section uuid;
	v_files text[];
	v_orphans text[];
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select a.section_id into v_section
	from public.classroom_assignments a
	where a.id = p_id
	for update;
	if not found then
		raise exception 'That assignment does not exist.';
	end if;
	if not public.classroom_manages_section(v_section) then
		raise exception 'Only the section''s teacher of record or a site admin can delete this assignment.';
	end if;

	select coalesce(array_agg(distinct drive_file_id), '{}'::text[]) into v_files
	from public.classroom_attachments where assignment_id = p_id;

	delete from public.classroom_assignments where id = p_id;

	select coalesce(array_agg(f), '{}'::text[]) into v_orphans
	from unnest(v_files) as f
	where not exists (
		select 1 from public.classroom_attachments t where t.drive_file_id = f
	);

	return jsonb_build_object('deleted', true, 'orphaned_drive_file_ids', to_jsonb(v_orphans));
end;
$$;

revoke all on function public.classroom_delete_assignment(uuid) from public;
grant execute on function public.classroom_delete_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. View as student (admin only). READS ONLY -- see the header.
-- ---------------------------------------------------------------------------

-- Internal: the attachment rows of one post/assignment as jsonb. No grant; only
-- the definer functions below reach it.
create or replace function public._classroom_attachments_json(
	p_post_id uuid,
	p_assignment_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(jsonb_agg(jsonb_build_object(
		'id', t.id,
		'filename', t.filename,
		'mime_type', t.mime_type,
		'size_bytes', t.size_bytes,
		'sort_order', t.sort_order
	) order by t.sort_order, t.created_at), '[]'::jsonb)
	from public.classroom_attachments t
	where (p_post_id is not null and t.post_id = p_post_id)
		or (p_assignment_id is not null and t.assignment_id = p_assignment_id);
$$;

revoke all on function public._classroom_attachments_json(uuid, uuid) from public;

-- Internal: the caller must be an admin, and the impersonated student must be
-- actively enrolled in the section in question. Every public view_as function
-- opens with this.
create or replace function public._classroom_view_as_guard(p_email text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can view the classroom as a student.';
	end if;
	if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
		raise exception 'Pick a student to view as.';
	end if;
	return v_email;
end;
$$;

revoke all on function public._classroom_view_as_guard(text) from public;

-- The pick-a-student list: every email with at least one ACTIVE enrollment,
-- with the sections they are in. Admin only.
create or replace function public.classroom_view_as_students()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can view the classroom as a student.';
	end if;

	return coalesce((
		select jsonb_agg(row_to_json(t)::jsonb order by t.display_name, t.student_email)
		from (
			select e.student_email,
				min(e.display_name) as display_name,
				count(*)::int as section_count
			from public.classroom_enrollments e
			where e.active
			group by e.student_email
		) t
	), '[]'::jsonb);
end;
$$;

revoke all on function public.classroom_view_as_students() from public;
grant execute on function public.classroom_view_as_students() to authenticated;

-- "My Classes" as that student: sections with an ACTIVE enrollment, nothing
-- else -- not the sections the admin teaches, not sections the student was
-- removed from.
create or replace function public.classroom_view_as_sections(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_view_as_guard(p_email);
begin
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', s.id,
			'course_id', s.course_id,
			'label', s.label,
			'block', s.block,
			'teacher_email', s.teacher_email,
			'active', s.active,
			'course', jsonb_build_object(
				'id', c.id, 'code', c.code, 'title', c.title, 'active', c.active)
		) order by c.code, s.label)
		from public.classroom_enrollments e
		join public.classroom_sections s on s.id = e.section_id
		join public.classroom_courses c on c.id = s.course_id
		where e.student_email = v_email and e.active
	), '[]'::jsonb);
end;
$$;

revoke all on function public.classroom_view_as_sections(text) from public;
grant execute on function public.classroom_view_as_sections(text) to authenticated;

-- One class as that student: the section plus PUBLISHED posts and assignments
-- only, with resources and attachments. Returns null when the student is not
-- actively enrolled -- indistinguishable from the section not existing, which
-- is what the student's own 404 would look like.
create or replace function public.classroom_view_as_section(p_email text, p_section_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_view_as_guard(p_email);
	v_section jsonb;
begin
	select jsonb_build_object(
		'id', s.id, 'course_id', s.course_id, 'label', s.label, 'block', s.block,
		'teacher_email', s.teacher_email, 'active', s.active,
		'course', jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title, 'active', c.active)
	) into v_section
	from public.classroom_enrollments e
	join public.classroom_sections s on s.id = e.section_id
	join public.classroom_courses c on c.id = s.course_id
	where e.student_email = v_email and e.active and s.id = p_section_id;

	if v_section is null then
		return null;
	end if;

	return jsonb_build_object(
		'section', v_section,
		'posts', coalesce((
			select jsonb_agg(jsonb_build_object(
				'id', p.id, 'section_id', p.section_id, 'group_id', p.group_id,
				'title', p.title, 'body', p.body, 'author_email', p.author_email,
				'author_name', p.author_name, 'published', p.published,
				'created_at', p.created_at, 'updated_at', p.updated_at,
				'attachments', public._classroom_attachments_json(p.id, null)
			) order by p.created_at desc)
			from public.classroom_posts p
			where p.section_id = p_section_id and p.published
		), '[]'::jsonb),
		'assignments', coalesce((
			select jsonb_agg(jsonb_build_object(
				'id', a.id, 'section_id', a.section_id, 'group_id', a.group_id,
				'title', a.title, 'description', a.description, 'points', a.points,
				'due_at', a.due_at, 'category', a.category, 'author_email', a.author_email,
				'author_name', a.author_name, 'published', a.published,
				'created_at', a.created_at, 'updated_at', a.updated_at,
				'attachments', public._classroom_attachments_json(null, a.id),
				'resources', coalesce((
					select jsonb_agg(jsonb_build_object(
						'id', r.id, 'label', r.label, 'url', r.url, 'sort_order', r.sort_order)
						order by r.sort_order)
					from public.classroom_assignment_resources r
					where r.assignment_id = a.id
				), '[]'::jsonb)
			) order by a.created_at desc)
			from public.classroom_assignments a
			where a.section_id = p_section_id and a.published
		), '[]'::jsonb)
	);
end;
$$;

revoke all on function public.classroom_view_as_section(text, uuid) from public;
grant execute on function public.classroom_view_as_section(text, uuid) to authenticated;

-- One assignment as that student. Null (not an error) when it is a draft, in a
-- foreign section, or under the wrong section path -- the same 404 the student
-- would get.
create or replace function public.classroom_view_as_assignment(
	p_email text,
	p_section_id uuid,
	p_assignment_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_view_as_guard(p_email);
	v_section jsonb;
	v_assignment jsonb;
begin
	select jsonb_build_object(
		'id', s.id, 'course_id', s.course_id, 'label', s.label, 'block', s.block,
		'teacher_email', s.teacher_email, 'active', s.active,
		'course', jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title, 'active', c.active)
	) into v_section
	from public.classroom_enrollments e
	join public.classroom_sections s on s.id = e.section_id
	join public.classroom_courses c on c.id = s.course_id
	where e.student_email = v_email and e.active and s.id = p_section_id;

	if v_section is null then
		return null;
	end if;

	select jsonb_build_object(
		'id', a.id, 'section_id', a.section_id, 'group_id', a.group_id,
		'title', a.title, 'description', a.description, 'points', a.points,
		'due_at', a.due_at, 'category', a.category, 'author_email', a.author_email,
		'author_name', a.author_name, 'published', a.published,
		'created_at', a.created_at, 'updated_at', a.updated_at,
		'attachments', public._classroom_attachments_json(null, a.id),
		'resources', coalesce((
			select jsonb_agg(jsonb_build_object(
				'id', r.id, 'label', r.label, 'url', r.url, 'sort_order', r.sort_order)
				order by r.sort_order)
			from public.classroom_assignment_resources r
			where r.assignment_id = a.id
		), '[]'::jsonb)
	) into v_assignment
	from public.classroom_assignments a
	where a.id = p_assignment_id and a.section_id = p_section_id and a.published;

	if v_assignment is null then
		return null;
	end if;

	return jsonb_build_object('section', v_section, 'assignment', v_assignment);
end;
$$;

revoke all on function public.classroom_view_as_assignment(text, uuid, uuid) from public;
grant execute on function public.classroom_view_as_assignment(text, uuid, uuid) to authenticated;

-- The attachment proxy's impersonation check: would THAT student be allowed to
-- fetch this attachment? The admin's own session could fetch it either way, so
-- this exists purely so an impersonated session behaves like the student it is
-- imitating rather than like the admin driving it.
create or replace function public.classroom_view_as_can_read_attachment(
	p_email text,
	p_attachment_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public._classroom_view_as_guard(p_email);
begin
	return exists (
		select 1
		from public.classroom_attachments t
		left join public.classroom_posts p on p.id = t.post_id
		left join public.classroom_assignments a on a.id = t.assignment_id
		join public.classroom_enrollments e
			on e.section_id = coalesce(p.section_id, a.section_id)
		where t.id = p_attachment_id
			and e.student_email = v_email
			and e.active
			and coalesce(p.published, a.published, false)
	);
end;
$$;

revoke all on function public.classroom_view_as_can_read_attachment(text, uuid) from public;
grant execute on function public.classroom_view_as_can_read_attachment(text, uuid) to authenticated;
