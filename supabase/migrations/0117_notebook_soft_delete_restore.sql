-- 0117_notebook_soft_delete_restore.sql
--
-- THE WAY BACK IN. 0116 made deletion soft and said out loud that it shipped
-- no restore path: the row survives, so a reversal was a one-line SQL-editor
-- update, but nothing a student or an instructor could reach put an entry or a
-- photo back. This file closes that, and widens one gate that was narrower
-- than the read predicate it should have matched.
--
-- THREE RESTORE RPCs, on the EXACT shape 0116's four write RPCs already use:
-- SECURITY DEFINER, `set search_path = ''`, revoked from public, granted to
-- authenticated, returning jsonb. No new table grant and no new policy -- there
-- is still no direct client write path to `deleted_at` / `deleted_by` /
-- `removed_at` / `removed_by`, restore included.
--
-- Apply manually in the Supabase SQL editor, after 0116.

-- ---------------------------------------------------------------------------
-- 1. A student restores their own entry.
--
-- ORDER: not found -> not deleted -> deleted by someone else -> restore. The
-- middle check comes before the ownership-of-the-deletion one on purpose: an
-- entry that is not deleted has `deleted_by` null, and judging that against
-- "is it you" first would report a confusing "someone else removed it" for a
-- row nobody removed at all.
--
-- deleted_by IS DISTINCT FROM v_uid, not `<>`: a departed actor's account
-- nulls deleted_by (0116's `on delete set null`), and a null actor can never
-- be resolved as "you", so it correctly falls into the refusal rather than
-- being treated as a NULL-propagated non-match that silently allows it.
-- ---------------------------------------------------------------------------

create or replace function public.notebook_restore_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_entry public.notebook_entries%rowtype;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_entry_id is null then
		raise exception 'Which entry?';
	end if;

	select e.* into v_entry
	from public.notebook_entries e
	where e.id = p_entry_id and e.student_id = v_uid
	for update;
	if not found then
		raise exception 'That entry does not exist or is not yours.';
	end if;

	if v_entry.deleted_at is null then
		raise exception 'That entry has not been deleted.';
	end if;
	if v_entry.deleted_by is distinct from v_uid then
		raise exception 'Your instructor removed that entry, so you cannot restore it yourself. Ask them to restore it for you.';
	end if;

	update public.notebook_entries e
	set deleted_at = null, deleted_by = null
	where e.id = p_entry_id;

	return jsonb_build_object('ok', true, 'entry_id', p_entry_id);
end;
$$;

revoke all on function public.notebook_restore_entry(uuid) from public;
grant execute on function public.notebook_restore_entry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. An instructor (or the chair) restores a student's entry, on the SAME
-- widened gate as notebook_staff_delete_entry below -- reversing something is
-- never narrower than doing it. Writes the same audit log the delete side does,
-- because "who put this back, and when" is exactly the kind of question the
-- log exists to answer.
-- ---------------------------------------------------------------------------

create or replace function public.notebook_staff_restore_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_entry public.notebook_entries%rowtype;
	v_found boolean;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_entry_id is null then
		raise exception 'Which entry?';
	end if;

	select e.* into v_entry
	from public.notebook_entries e
	where e.id = p_entry_id
	for update;
	v_found := found;

	-- Authorization BEFORE state, and the two failures share one message (the
	-- 0102 claim convention): probing an id here tells a non-manager nothing.
	if not v_found or not (
		public.classroom_manages_section(v_entry.section_id)
		or public.notebook_manages_student(v_entry.student_id)
	) then
		raise exception 'That entry does not exist, or is not one you manage.';
	end if;

	if v_entry.deleted_at is null then
		raise exception 'That entry has not been deleted.';
	end if;

	update public.notebook_entries e
	set deleted_at = null, deleted_by = null
	where e.id = p_entry_id;

	perform public._notebook_log(
		'restore_entry',
		v_entry.section_id,
		v_entry.session_id,
		p_entry_id,
		v_entry.student_id,
		jsonb_build_object(
			'custom_label', v_entry.custom_label,
			'status', v_entry.status,
			'deleted_at', v_entry.deleted_at,
			'deleted_by', v_entry.deleted_by
		)
	);

	return jsonb_build_object('ok', true, 'entry_id', p_entry_id, 'student_id', v_entry.student_id);
end;
$$;

revoke all on function public.notebook_staff_restore_entry(uuid) from public;
grant execute on function public.notebook_staff_restore_entry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A student restores one removed photo, mirroring notebook_remove_photo's
-- own resolve-through-the-parent-entry shape.
--
-- REFUSES WHEN THE PARENT ENTRY IS ITSELF DELETED: restoring a photo onto a
-- deleted entry would put live content back into a row the student cannot even
-- see in their normal feed, which is a confusing state with no surface that
-- shows it. The message says what to do instead, the same way every other
-- refusal in this schema is written to be read aloud.
-- ---------------------------------------------------------------------------

create or replace function public.notebook_restore_photo(p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_photo public.notebook_entry_photos%rowtype;
	v_entry public.notebook_entries%rowtype;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_photo_id is null then
		raise exception 'Which photo?';
	end if;

	select p.* into v_photo
	from public.notebook_entry_photos p
	where p.id = p_photo_id
	for update;
	if not found then
		raise exception 'That photo does not exist or is not yours.';
	end if;

	select e.* into v_entry
	from public.notebook_entries e
	where e.id = v_photo.entry_id
	for update;

	if v_entry.student_id is distinct from v_uid then
		raise exception 'That photo does not exist or is not yours.';
	end if;
	if v_entry.deleted_at is not null then
		raise exception 'This entry has been deleted, so its photos cannot be restored on their own. Restore the entry first.';
	end if;
	if v_photo.removed_at is null then
		raise exception 'That photo has not been removed.';
	end if;

	update public.notebook_entry_photos p
	set removed_at = null, removed_by = null
	where p.id = p_photo_id;

	return jsonb_build_object('ok', true, 'photo_id', p_photo_id, 'entry_id', v_photo.entry_id);
end;
$$;

revoke all on function public.notebook_restore_photo(uuid) from public;
grant execute on function public.notebook_restore_photo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. notebook_staff_delete_entry's gate, widened to match the READ predicate
-- (0106's notebook_manages_student) it fell short of.
--
-- THE GAP THIS CLOSES: classroom_manages_section(null) is is_admin() (0067),
-- so on a FREE-FORM entry (section_id null) a teacher of record could already
-- READ it -- 0106 widened notebook_can_read_entry to notebook_manages_student
-- specifically so a free-form entry reaches its own student's instructor -- but
-- could not REMOVE it; only the chair tier could. Soft deletion is reversible
-- and logged (section 2 above, and 0116's own log write), so the ability to
-- remove a student's entry should never be narrower than the ability to see
-- it. Same signature, so this is a plain `create or replace`: no drop, no
-- second overload, no deploy-ordering problem.
-- ---------------------------------------------------------------------------

create or replace function public.notebook_staff_delete_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_entry public.notebook_entries%rowtype;
	v_found boolean;
	v_deleted_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_entry_id is null then
		raise exception 'Which entry?';
	end if;

	select e.* into v_entry
	from public.notebook_entries e
	where e.id = p_entry_id
	for update;
	v_found := found;

	-- Authorization BEFORE state, and the two failures share one message.
	if not v_found or not (
		public.classroom_manages_section(v_entry.section_id)
		or public.notebook_manages_student(v_entry.student_id)
	) then
		raise exception 'That entry does not exist, or is not in a class you manage.';
	end if;

	if v_entry.deleted_at is not null then
		raise exception 'That entry has already been deleted.';
	end if;

	update public.notebook_entries e
	set deleted_at = now(), deleted_by = v_uid
	where e.id = p_entry_id
	returning e.deleted_at into v_deleted_at;

	-- The audit row, which is why this is a separate function rather than a
	-- branch of the student's own path: a student tidying their own notebook is
	-- not an event anyone reviews, and staff removing somebody else's work is.
	perform public._notebook_log(
		'delete_entry',
		v_entry.section_id,
		v_entry.session_id,
		p_entry_id,
		v_entry.student_id,
		jsonb_build_object(
			'custom_label', v_entry.custom_label,
			'status', v_entry.status,
			'reviewed_at', v_entry.reviewed_at,
			'upload_timestamp', v_entry.upload_timestamp
		)
	);

	return jsonb_build_object(
		'ok', true,
		'entry_id', p_entry_id,
		'student_id', v_entry.student_id,
		'deleted_at', v_deleted_at
	);
end;
$$;

revoke all on function public.notebook_staff_delete_entry(uuid) from public;
grant execute on function public.notebook_staff_delete_entry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. One student's whole notebook, as a payload -- gains a `deleted_entries`
-- key, and the existing `entries` key is untouched.
--
-- A SEPARATE KEY, NEVER MERGED IN. `entries` already filters `deleted_at is
-- null` (0116) and stays exactly that; a caller that wants to see what was
-- removed reads `deleted_entries` instead. Feeds BOTH
-- notebook_review_student_notebook (an instructor opening a name) and
-- notebook_view_as_notebook (an admin's student-view preview) -- one payload,
-- so the two can never disagree about what a student's deleted work looks
-- like. Deliberately narrow: no photos, no notes, no folder -- the two surfaces
-- that render this show a title, when it was deleted, and a Restore control,
-- nothing else.
-- ---------------------------------------------------------------------------

create or replace function public._notebook_student_payload(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_uid uuid := public._notebook_user_id_for_email(v_email);
	v_name text;
	v_sections uuid[];
	v_section_label text;
	v_entries jsonb;
	v_deleted_entries jsonb;
	v_folders jsonb;
	v_sessions jsonb;
	v_activity jsonb;
begin
	select min(e.display_name) into v_name
	from public.classroom_enrollments e
	where e.student_email = v_email and e.active;

	select coalesce(array_agg(e.section_id), '{}'::uuid[]) into v_sections
	from public.classroom_enrollments e
	where e.student_email = v_email and e.active;

	select case
			when count(*) = 0 then null
			when count(*) = 1 then min(nullif(concat_ws(' · ', c.code, s.label), ''))
			else count(*)::text || ' classes'
		end
	into v_section_label
	from public.classroom_sections s
	join public.classroom_courses c on c.id = s.course_id
	where s.id = any(v_sections);

	-- THEIR ENTRIES, ALL OF THEM -- every section and none, which is the point
	-- of 0106. It matches what the staff policy allows either caller to select
	-- directly, so this payload can never be a wider door than the ordinary
	-- read; the deleted ones are the one thing it is now narrower by.
	select coalesce(jsonb_agg(jsonb_build_object(
			'id', e.id,
			'session_id', e.session_id,
			'section_id', e.section_id,
			'folder_id', e.folder_id,
			'pinned_at', e.pinned_at,
			'custom_label', e.custom_label,
			'upload_timestamp', e.upload_timestamp,
			'status', e.status,
			'flag_reason', e.flag_reason,
			'instructor_comment', e.instructor_comment,
			'session', (
				select jsonb_build_object(
					'session_label', ss.session_label,
					'unit_number', ss.unit_number,
					'session_date', ss.session_date
				)
				from public.notebook_sessions ss where ss.id = e.session_id
			),
			'photos', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', p.id,
					'drive_file_id', p.drive_file_id,
					'variant', p.variant,
					'sequence_order', p.sequence_order,
					'original_filename', p.original_filename
				) order by p.sequence_order)
				from public.notebook_entry_photos p
				where p.entry_id = e.id and p.removed_at is null
			), '[]'::jsonb),
			-- EVERY revision: which one is current is derived client-side
			-- (noteThreads) and the feed shows the history.
			'notes', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', n.id,
					'entry_id', n.entry_id,
					'note_id', n.note_id,
					'revision', n.revision,
					'content', n.content,
					'created_at', n.created_at
				) order by n.created_at, n.revision)
				from public.notebook_entry_notes n where n.entry_id = e.id
			), '[]'::jsonb)
		) order by e.upload_timestamp desc), '[]'::jsonb)
	into v_entries
	from public.notebook_entries e
	where e.student_id = v_uid
		and e.deleted_at is null;

	-- THEIR DELETED ENTRIES (0117), separately -- newest-removed first, and
	-- deliberately shallow (see the migration header).
	select coalesce(jsonb_agg(jsonb_build_object(
			'id', e.id,
			'custom_label', e.custom_label,
			'session', (
				select jsonb_build_object(
					'session_label', ss.session_label,
					'unit_number', ss.unit_number,
					'session_date', ss.session_date
				)
				from public.notebook_sessions ss where ss.id = e.session_id
			),
			'upload_timestamp', e.upload_timestamp,
			'deleted_at', e.deleted_at,
			'deleted_by', e.deleted_by
		) order by e.deleted_at desc), '[]'::jsonb)
	into v_deleted_entries
	from public.notebook_entries e
	where e.student_id = v_uid
		and e.deleted_at is not null;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', f.id, 'name', f.name, 'color', f.color, 'created_at', f.created_at
		) order by f.name), '[]'::jsonb)
	into v_folders
	from public.notebook_folders f
	where f.student_id = v_uid;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', ss.id,
			'section_id', pg.section_id,
			'unit_number', ss.unit_number,
			'session_date', ss.session_date,
			'session_label', ss.session_label
		) order by ss.session_date desc, ss.id), '[]'::jsonb)
	into v_sessions
	from public.notebook_session_postings pg
	join public.notebook_sessions ss on ss.id = pg.session_id
	where pg.section_id = any(v_sections);

	-- The view already excludes deleted entries (4a of 0116), so this needs no
	-- clause of its own.
	select coalesce(jsonb_agg(jsonb_build_object(
			'id', a.id, 'last_activity_at', a.last_activity_at
		)), '[]'::jsonb)
	into v_activity
	from public.notebook_entry_activity a
	where a.student_id = v_uid;

	return jsonb_build_object(
		'student', jsonb_build_object(
			'email', v_email,
			'display_name', v_name,
			-- null = on a roster, no account yet.
			'user_id', v_uid
		),
		'section_label', v_section_label,
		'entries', v_entries,
		'deleted_entries', v_deleted_entries,
		'folders', v_folders,
		'sessions', v_sessions,
		'activity', v_activity
	);
end;
$$;

revoke all on function public._notebook_student_payload(text) from public;
