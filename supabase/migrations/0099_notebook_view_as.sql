-- 0099_notebook_view_as.sql
--
-- VIEW THE DIGITAL NOTEBOOK AS A STUDENT (admin only, READ ONLY).
--
-- WHY IT EXISTS, and it is the same reason 0083 gave for the classroom side:
-- there is no way to obtain a @boscotech.net session for testing, so nobody
-- can otherwise check what a student's own notebook actually looks like --
-- whether their entries are all there, whether their folders read the way they
-- filed them, whether a pinned entry sits where they put it. This renders the
-- ordinary student notebook for any enrolled email.
--
-- IT MIRRORS 0083/0085 EXACTLY, and reuses rather than restates:
--
--   * THE GUARD IS `_classroom_view_as_guard` (0083), CALLED, NOT COPIED. That
--     function is signed-in + `is_admin()` + an email-shape check, returning
--     the normalized address -- which is precisely the question this feature
--     asks too. A `_notebook_view_as_guard` would be a second copy of one
--     permission rule, and this schema's own history (the `is_teacher()`
--     naming trap of 0067) is what a second copy costs. Note the shape: it is
--     a `declare` INITIALIZER, so `is_admin()` runs before the first statement
--     of the body and there is no branch that can reach the data first.
--
--   * THE PICKER IS `classroom_view_as_students()` (0083), UNCHANGED. There is
--     deliberately no notebook-side "list the students" RPC: it would answer
--     the same question over the same roster, and two lists is how one of them
--     quietly stops matching.
--
--   * READ-ONLY IS STRUCTURAL. This migration ships exactly ONE function and
--     it is STABLE. There is no notebook view_as write RPC of any kind, so
--     there is nothing to accidentally execute while impersonating -- a
--     property of the surface area, not a discipline the UI has to keep.
--     tests/notebook-view-as.test.ts enumerates the `notebook_view_as%`
--     namespace out of pg_proc and asserts both facts, so adding a second one
--     fails a test rather than passing review.
--
--   * IT CAN ONLY EVER NARROW. The chair tier already reads every notebook
--     entry, photo, note and folder in the school through 0069/0088's own
--     staff policies. Scoping to ONE student's rows -- and to what THEY would
--     be shown -- reveals nothing new; it only rearranges what an admin can
--     already reach into the shape the student sees it in.
--
-- WHAT "AS THAT STUDENT SEES IT" MEANS HERE, concretely. The student's own
-- /notebook load is a set of plain RLS-scoped selects with no student filter
-- anywhere: their entries (own-row policy), their photos and notes (delegated
-- through notebook_can_read_entry), their folders, their activity view, and
-- the check-ins posted to sections they are ACTIVELY enrolled in. Every query
-- below is that same read with the policy's implicit filter written out
-- explicitly against the resolved student -- so it is their own entries,
-- their own folders and their own pins, never an instructor-shaped view of
-- their data. There is no status filter, no section filter and no
-- "reviewable" filter of any kind: a student sees all of their own work.
--
-- A ROSTER ROW WITH NO ACCOUNT IS A NORMAL STATE (0094's rule). A student
-- enrolled but never signed in has no auth.users row, so
-- `_notebook_user_id_for_email` answers null and the payload comes back with
-- an empty notebook and their real check-ins -- which is exactly what that
-- student would see on their first sign-in, and an honest answer rather than
-- an error.
--
-- NO PHOTO-PROXY CHANGE, deliberately, and this is where the notebook differs
-- from the classroom. 0083 needed `classroom_view_as_can_read_attachment`
-- because a class attachment an ADMIN may read is not always one the STUDENT
-- may read (a draft, another section), so the proxy had to be able to answer
-- as the student. Here the two sets are identical by construction: every
-- photo in this payload hangs off an entry belonging to the student whose
-- notebook it is, and a student always reads their own. An `?as=` parameter on
-- /api/notebook/photo would narrow nothing and add a surface for nothing.
--
-- Apply manually in the Supabase SQL editor, after 0098.

-- ---------------------------------------------------------------------------
-- The one function.
-- ---------------------------------------------------------------------------

create or replace function public.notebook_view_as_notebook(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	-- Signed-in + is_admin() + email shape, from 0083. Runs before anything
	-- below it and returns the lowercased, trimmed address.
	v_email text := public._classroom_view_as_guard(p_email);
	v_uid uuid := public._notebook_user_id_for_email(v_email);
	v_name text;
	v_sections uuid[];
	v_section_label text;
	v_entries jsonb;
	v_folders jsonb;
	v_sessions jsonb;
	v_activity jsonb;
begin
	-- The display name the roster carries, matching how every other surface
	-- names a student (0084's standing coalesce rule, roster first).
	select min(e.display_name) into v_name
	from public.classroom_enrollments e
	where e.student_email = v_email and e.active;

	-- Their ACTIVE enrollments. This is the set 0082's own
	-- "classroom sections readable to members" policy would hand the student,
	-- written out because we are not running as them.
	select coalesce(array_agg(e.section_id), '{}'::uuid[]) into v_sections
	from public.classroom_enrollments e
	where e.student_email = v_email and e.active;

	-- The header chip: their classes, exactly as /notebook derives it.
	select case
			when count(*) = 0 then null
			when count(*) = 1 then min(nullif(concat_ws(' · ', c.code, s.label), ''))
			else count(*)::text || ' classes'
		end
	into v_section_label
	from public.classroom_sections s
	join public.classroom_courses c on c.id = s.course_id
	where s.id = any(v_sections);

	-- Their entries, newest first, with the photos, notes and check-in the
	-- feed renders. student_id = their account, which IS 0069's own own-row
	-- policy predicate.
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
				from public.notebook_entry_photos p where p.entry_id = e.id
			), '[]'::jsonb),
			-- EVERY revision, not just the current one: which revision counts
			-- is derived client-side (noteThreads) and the feed shows the
			-- history, exactly as the student's own load selects it.
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
	where e.student_id = v_uid;

	-- Their folders (0088). Organization only; nothing about who may read an
	-- entry depends on it.
	select coalesce(jsonb_agg(jsonb_build_object(
			'id', f.id, 'name', f.name, 'color', f.color, 'created_at', f.created_at
		) order by f.name), '[]'::jsonb)
	into v_folders
	from public.notebook_folders f
	where f.student_id = v_uid;

	-- Their scheduled check-ins, through the POSTING (0098) -- so a check-in
	-- shared with a class they are not in still arrives named for one of
	-- theirs, and a check-in running in two of their classes appears once per
	-- class, which is what the student's own load produces.
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

	-- When each entry was last touched (0091), read from the SAME view the
	-- student's own load reads rather than re-deriving `greatest(...)` here.
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
			-- null = on a roster, no account yet. The page says so rather than
			-- showing an empty notebook with no explanation.
			'user_id', v_uid
		),
		'section_label', v_section_label,
		'entries', v_entries,
		'folders', v_folders,
		'sessions', v_sessions,
		'activity', v_activity
	);
end;
$$;

revoke all on function public.notebook_view_as_notebook(text) from public;
grant execute on function public.notebook_view_as_notebook(text) to authenticated;
