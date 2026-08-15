-- 0106_notebook_instructor_student_access.sql
--
-- AN INSTRUCTOR CAN SEE A STUDENT'S WHOLE NOTEBOOK, FREE-FORM ENTRIES INCLUDED.
--
-- WHAT WAS WRONG. Staff read access on notebook_entries has been section-scoped
-- since 0069 and stayed that way through 0094's rewiring:
--
--     using (public.classroom_manages_section(section_id))
--
-- which asks "does this ENTRY belong to a section I manage". A free-form entry
-- carries `section_id = null` (0075 made the free tier's photo optional, 0078
-- made a note an entry in its own right), and `classroom_manages_section(null)`
-- is `is_admin()` -- so an instructor could see a student's check-in work and
-- nothing else, while the chair tier saw everything. The student's own writing,
-- which is most of what a notebook IS, had no instructor surface at all.
--
-- THE FIX IS THE PREDICATE, NOT THE DATA. Nothing is back-filled onto entries
-- and no entry gains a section: the question simply changes from a fact about
-- the ENTRY to a fact about its AUTHOR --
--
--     "is this student enrolled in a section I manage"
--
-- which is answerable for a free-form entry precisely because it does not
-- depend on the entry at all.
--
-- COMPOSED, NOT REWRITTEN. Both halves of that question already exist and are
-- already the authority elsewhere: `classroom_enrollments` is the roster (0082,
-- and since 0094 the notebook's roster too) and `classroom_manages_section` is
-- who may touch a class -- the same function every notebook policy and RPC
-- already calls. `notebook_manages_student` below is those two composed and
-- nothing else. It deliberately does NOT spell out `teacher_email =
-- current_user_email()`, which would be a second copy of what managing a
-- section means, i.e. exactly the drift 0094 dropped
-- `notebook_is_section_instructor` to avoid.
--
-- IT IS A UNION WITH THE OLD PREDICATE, NOT A REPLACEMENT, and that is
-- load-bearing rather than caution. 0094's roster deliberately keeps a student
-- who has LEFT a class but filed work in it (`enrolled: false` on the grid) so
-- that already-reviewed work is not hidden; their enrollment row is inactive,
-- so an enrollment-only predicate would take away access this schema has
-- granted since 0069 and leave the grid showing a row whose cells could not be
-- opened. So the policy asks both, and the two answer for different things:
--
--   * `classroom_manages_section(section_id)` -- work filed in MY class, by
--     anyone, enrolled now or not. Unchanged, exactly as it was.
--   * `notebook_manages_student(student_id)` -- anything at all by someone
--     currently ON my roster. New, and the only part that reaches a free-form
--     entry.
--
-- `auth.uid() = student_id` for students is UNTOUCHED. It is a separate policy,
-- it is what this feature's isolation rests on, and nothing here goes near it.
-- A student gains no reach over a classmate: `notebook_manages_student` returns
-- false for anyone who is not an admin and not a teacher of record, because
-- `classroom_manages_section` does.
--
-- WHAT FOLLOWS FOR FREE. Photos (0069), notes (0078) and folders (0088) all
-- delegate their visibility to `notebook_can_read_entry` rather than restating
-- who staff are, and `notebook_entry_activity` (0091) is `security_invoker` over
-- notebook_entries. Widening the one function and the one policy therefore
-- widens all four consistently, which is the whole reason that delegation
-- exists. Excusals are NOT touched: an excusal is a fact about a session, which
-- always has a section, so the section-scoped question is the right one there.
--
-- Apply manually in the Supabase SQL editor, after 0105.

-- ---------------------------------------------------------------------------
-- 1. The predicate.
-- ---------------------------------------------------------------------------

-- EMAIL-KEYED CORE, because the roster is email-keyed. The notebook is uuid-
-- keyed end to end and stays that way (0094's rule); this is the same narrow
-- bridge, in the same direction, reusing the same no-grant helper.
--
-- NO GRANT (the `_notebook_` convention). It is reachable only from the two
-- SECURITY DEFINER functions below, which is deliberate: granted, it would be a
-- probe for "does this address exist on a roster I teach", and 0089 spent a
-- whole migration refusing to expose the school's address book.
--
-- `is_admin()` is spelled out here rather than left to classroom_manages_section
-- because the enrollment scan is what carries it, and a student with NO
-- enrollment at all -- one who filed free-form entries and was never rostered --
-- has nothing for that scan to find. The chair tier must still see them.
create or replace function public._notebook_manages_student_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public.is_admin() or exists (
		select 1
		from public.classroom_enrollments ce
		where ce.student_email = lower(btrim(coalesce(p_email, '')))
			and btrim(coalesce(p_email, '')) <> ''
			and ce.active
			and public.classroom_manages_section(ce.section_id)
	);
$$;

revoke all on function public._notebook_manages_student_email(text) from public;

-- UUID-KEYED, for the policies, which see `student_id`. Granted to
-- authenticated the same way classroom_manages_section and
-- notebook_can_read_entry are: a policy is evaluated as the QUERYING role, so
-- without the grant every staff read would fail with a permission error rather
-- than a denial (the 0070 lesson about current_user_email()).
create or replace function public.notebook_manages_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select p_student_id is not null
		and public._notebook_manages_student_email(
			public._notebook_email_for_user(p_student_id)
		);
$$;

revoke all on function public.notebook_manages_student(uuid) from public;
grant execute on function public.notebook_manages_student(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The two read sites. Both gain the same clause, so they cannot disagree
-- about who may read an entry -- which matters because the policy governs a
-- direct select and the function governs every delegated one.
-- ---------------------------------------------------------------------------

drop policy if exists "section staff read notebook entries" on public.notebook_entries;
create policy "section staff read notebook entries"
	on public.notebook_entries
	for select
	to authenticated
	using (
		public.classroom_manages_section(section_id)
		or public.notebook_manages_student(student_id)
	);

-- 0094's definition plus the same clause. The student's own branch is first and
-- untouched.
create or replace function public.notebook_can_read_entry(p_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.notebook_entries e
		where e.id = p_entry_id
			and (
				e.student_id = (select auth.uid())
				or public.classroom_manages_section(e.section_id)
				or public.notebook_manages_student(e.student_id)
			)
	);
$$;

revoke all on function public.notebook_can_read_entry(uuid) from public;
grant execute on function public.notebook_can_read_entry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. One student's notebook, as a payload.
--
-- 0099 built this to render a student's own notebook for an ADMIN. An
-- instructor opening a name on the compliance grid wants the identical screen,
-- so the SHAPE is extracted here and both callers share it -- one payload, two
-- guards. Rebuilding it beside 0099 would be two answers to "what is in this
-- student's notebook", which is how the two quietly stop matching.
--
-- NO GRANT: it carries no authorization of its own on purpose. Every caller
-- must decide who may run it BEFORE calling, and a helper that cannot be
-- reached from the client cannot be the one that forgot.
--
-- The body is 0099's, verbatim apart from taking the resolved email as a
-- parameter instead of guarding for it.
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
	-- of this migration. It matches what section 2's policy now allows either
	-- caller to select directly, so this payload can never be a wider door than
	-- the ordinary read.
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
	where e.student_id = v_uid;

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
		'folders', v_folders,
		'sessions', v_sessions,
		'activity', v_activity
	);
end;
$$;

revoke all on function public._notebook_student_payload(text) from public;

-- ---------------------------------------------------------------------------
-- 4. The two guarded readers.
-- ---------------------------------------------------------------------------

-- 0099's admin view-as, now delegating. Same name, same signature, same guard,
-- same payload -- and still the ONLY function in the `notebook_view_as%`
-- namespace, which tests/notebook-view-as.test.ts enumerates and asserts.
create or replace function public.notebook_view_as_notebook(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	-- Signed-in + is_admin() + email shape (0083). A `declare` INITIALIZER, so
	-- it runs before the first statement of the body and no branch can reach
	-- the data first.
	v_email text := public._classroom_view_as_guard(p_email);
begin
	return public._notebook_student_payload(v_email);
end;
$$;

revoke all on function public.notebook_view_as_notebook(text) from public;
grant execute on function public.notebook_view_as_notebook(text) to authenticated;

-- The instructor's read of one student's notebook, from the compliance grid.
--
-- A DIFFERENT GUARD, and that is the whole reason it is a different function.
-- `_classroom_view_as_guard` is `is_admin()`; this tier is "teacher of record of
-- a section this student is actively enrolled in, or the chair". Reusing that
-- guard would lock instructors out; reusing this one for view-as would hand an
-- admin's preview surface to every teacher. So the payload is shared and the
-- door is not.
--
-- It refuses in exactly the shape the policy would: a caller who may not read
-- this student's entries gets an error rather than an empty notebook, because
-- an empty notebook is a real state (0094: enrolled, never signed in) and the
-- two must not be confusable.
--
-- STABLE, and there is no write counterpart. Read-only is a property of the
-- surface area here as it is for view-as, not a discipline the UI has to keep.
create or replace function public.notebook_review_student_notebook(p_email text)
returns jsonb
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
	if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
		raise exception 'Pick a student.';
	end if;
	if not public._notebook_manages_student_email(v_email) then
		raise exception 'Only an instructor of one of this student''s classes, or a site admin, can open their notebook.';
	end if;

	return public._notebook_student_payload(v_email);
end;
$$;

revoke all on function public.notebook_review_student_notebook(text) from public;
grant execute on function public.notebook_review_student_notebook(text) to authenticated;
