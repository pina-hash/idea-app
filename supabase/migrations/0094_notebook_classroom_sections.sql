-- 0094_notebook_classroom_sections.sql
--
-- The notebook stops keeping its own parallel idea of a class. Sections and
-- rosters are IDEA Classroom's (0082/0083), and the notebook reads them.
--
-- WHAT WAS WRONG. 0069 shipped `notebook_sections` because at the time this
-- repo had no sections table at all: a "section" was a free-form
-- curriculum.ts string in profiles.section_id, and instructor assignment had
-- no database representation anywhere. 0082 then built the real thing --
-- courses, per-period sections with a teacher of record, and email-keyed
-- enrollments -- and the notebook was left pointing at its own empty table
-- with its own roster rule (profiles.section_id matching a free-form
-- course_id) and its own instructor concept (notebook_sections.instructor_id).
-- Two answers to "who is in this class" is one too many, and the notebook's
-- was the one nobody could edit: `notebook_admin_upsert_section` was never
-- wired to a single UI surface, so no section could be created except by hand
-- in the SQL editor.
--
-- WHAT THIS DOES.
--   * notebook_sessions.section_id and notebook_entries.section_id now
--     reference classroom_sections.
--   * notebook_sections and notebook_admin_upsert_section are dropped.
--   * Every authorization site that asked notebook_is_section_instructor()
--     now asks classroom_manages_section() (0082) -- the SAME function
--     classroom's own policies use, never a parallel copy of the rule. That
--     function is `is_admin() or teacher of record`, so it already carries
--     the chair tier that used to be spelled out beside the old check.
--   * notebook_is_section_instructor is DROPPED rather than redefined. 0067
--     redefined is_teacher()'s body to mean something else and CLAUDE.md
--     calls that a trap by name; a function whose name says "instructor of a
--     notebook section" must not survive to mean "manages a classroom
--     section". Every caller is recreated below to name the real check.
--   * notebook_get_section_grid derives its roster from
--     classroom_enrollments, so a student added or removed in Classroom is
--     immediately right in the notebook grid.
--
-- THE IDENTITY BRIDGE, and why it is only a bridge. The notebook is keyed by
-- auth.uid() uuid end to end (notebook_entries.student_id, every RLS
-- predicate, the folders' composite FK); Classroom is keyed by lowercased
-- email (the 0070/0073 coin convention, so a roster can be imported before a
-- student has ever signed in). NOTHING HERE MIGRATES THE NOTEBOOK TO EMAIL
-- KEYS: `auth.uid() = student_id` is the predicate the whole feature's
-- isolation rests on and it is untouched. What is added is the narrowest
-- possible translation, in the two directions actually needed:
--
--   * uuid -> email for the CALLER is already `current_user_email()` (0067),
--     which reads auth.users authoritatively. No second copy is added; every
--     authorization site below goes through classroom_manages_section, which
--     goes through that.
--   * email -> uuid, and uuid -> email for someone who is NOT the caller, are
--     `_notebook_user_id_for_email` / `_notebook_email_for_user`. They exist
--     for exactly one job: matching a Classroom roster row to the notebook
--     rows that belong to it.
--
-- THEY ARE FUNCTIONS WITH NO GRANT, NOT A VIEW, and that is the point. A view
-- mapping emails to user ids would need a SELECT grant, and any grant on that
-- mapping hands every signed-in student the school's address book keyed to
-- account ids -- the same disclosure 0089 spent a whole migration refusing to
-- make. As no-grant SECURITY DEFINER helpers (the `_notebook_log` /
-- `_coin_public_roster` convention) they are reachable only from inside the
-- definer functions here, and no policy needs them at all.
--
-- A ROSTER ROW WITH NO ACCOUNT IS A NORMAL STATE, not an error: a teacher can
-- enroll a class before any of them has signed in. `_notebook_user_id_for_email`
-- answers null, the grid still gives that student a row, and every cell reads
-- 'missing'. That is why the grid's row key is the EMAIL and not the uuid.
--
-- IDEMPOTENT, and tested for it. 0088 shipped a drop-then-add on a constraint
-- another constraint depended on, and its second run in the live SQL editor
-- died with 2BP01 half way through. Every structural step here is either
-- `if exists` / `if not exists` or a catalog-guarded conditional, and
-- tests/notebook-classroom-sections.test.ts executes this file a second and
-- third time against an already-migrated database and re-checks the result.
--
-- Apply manually in the Supabase SQL editor, after 0093.

-- ---------------------------------------------------------------------------
-- 0. Refuse rather than destroy.
--
-- notebook_sections is expected to be empty: nothing has ever been able to
-- write it except a hand-run RPC, and no UI calls that RPC. But "expected" is
-- not "verified on YOUR database", and repointing the FKs would strand any
-- real check-in or entry that does reference one. So this stops, loudly, with
-- the counts and what to do -- rather than silently dropping a term of work.
-- A section row with no sessions and no entries has nothing to lose and is
-- simply dropped with the table.
-- ---------------------------------------------------------------------------

do $$
declare
	v_sessions bigint;
	v_entries bigint;
	v_orphans bigint;
begin
	-- Second run: the table is already gone, so there is nothing to check.
	if to_regclass('public.notebook_sections') is null then
		return;
	end if;

	select count(*) into v_sessions
	from public.notebook_sessions s
	where exists (select 1 from public.notebook_sections n where n.id = s.section_id);

	select count(*) into v_entries
	from public.notebook_entries e
	where e.section_id is not null
		and exists (select 1 from public.notebook_sections n where n.id = e.section_id);

	if v_sessions > 0 or v_entries > 0 then
		raise exception using
			errcode = 'raise_exception',
			message = format(
				'0094 will not run: %s notebook check-in(s) and %s entr(y/ies) still reference the old notebook_sections table.',
				v_sessions, v_entries),
			hint = 'Re-create those sections in IDEA Classroom, re-point the sessions and entries at the classroom_sections ids by hand, then re-run this migration.';
	end if;

	select count(*) into v_orphans from public.notebook_sections;
	if v_orphans > 0 then
		raise notice '0094: dropping % unused notebook_sections row(s) (no sessions, no entries).', v_orphans;
	end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. The identity bridge. No grants: see the header.
-- ---------------------------------------------------------------------------

-- The account behind a Classroom roster email, or null when that student has
-- never signed in. auth.users is the authority (profiles.email is a copy
-- written once at signup -- the reason current_user_email() reads auth.users
-- too). Both sides are lowercased and trimmed before comparing, because the
-- notebook must not care that classroom_enrollments enforces lowercase by
-- CHECK while auth.users does not.
create or replace function public._notebook_user_id_for_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
	select u.id
	from auth.users u
	where lower(btrim(u.email)) = lower(btrim(coalesce(p_email, '')))
		and btrim(coalesce(p_email, '')) <> ''
	order by u.id
	limit 1;
$$;

revoke all on function public._notebook_user_id_for_email(text) from public;

-- The reverse, for a student who is NOT the caller: used only to line a
-- notebook row (uuid-keyed) up against the Classroom roster (email-keyed).
-- For the caller's OWN email this is current_user_email() and this function is
-- deliberately not used there.
create or replace function public._notebook_email_for_user(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select nullif(lower(btrim(coalesce(u.email, ''))), '')
	from auth.users u
	where u.id = p_user_id;
$$;

revoke all on function public._notebook_email_for_user(uuid) from public;

-- ---------------------------------------------------------------------------
-- 2. Drop the policies and the function that named the old section concept.
--
-- Ordering matters in exactly one direction: a POLICY records a hard
-- dependency on every function it calls, so the two policies below must go
-- before notebook_is_section_instructor can be dropped. (Function bodies do
-- not: a `language sql` body written as a string literal is not parsed for
-- dependencies, which is why the callers can be recreated on either side.)
-- Both policies are recreated verbatim apart from the check, in section 5.
-- ---------------------------------------------------------------------------

drop policy if exists "section staff read notebook entries" on public.notebook_entries;
drop policy if exists "notebook excusals visible to subject and staff" on public.notebook_session_excusals;

-- Recreated first so that nothing is left calling the doomed function. Same
-- signature, so the 0078 notes policy and the 0088 folders policy that
-- delegate to it keep working untouched.
--
-- `classroom_manages_section` already returns is_admin() for any section
-- (including a null one), so the separate `or public.is_admin()` the 0069
-- version carried is gone rather than kept as a second, driftable statement
-- of the same tier.
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
			)
	);
$$;

revoke all on function public.notebook_can_read_entry(uuid) from public;
grant execute on function public.notebook_can_read_entry(uuid) to authenticated;

drop function if exists public.notebook_is_section_instructor(uuid);

-- ---------------------------------------------------------------------------
-- 3. Re-point the foreign keys, then drop the old table.
--
-- The COMPOSITE FK is untouched and stays exactly as strong as it was:
-- notebook_entries (session_id, section_id) -> notebook_sessions
-- (id, section_id) references the SESSIONS table, not the sections table, so
-- repointing section_id changes nothing about it. An entry whose section
-- disagrees with its own session's section remains unrepresentable, and
-- notebook_entries_session_implies_section still forces a section whenever
-- there is a session.
--
-- There is deliberately no composite (id, teacher_email) style guarantee
-- reaching into classroom_sections: classroom_sections has no column the
-- notebook could pair against. Who may touch a section is a live question
-- (a teacher of record can be reassigned by classroom_upsert_section), so it
-- is answered by classroom_manages_section at every read and write rather
-- than frozen into a key. The cross-student guarantee that IS expressible --
-- 0088's notebook_entries (folder_id, student_id) -> notebook_folders
-- (id, student_id) -- is untouched.
-- ---------------------------------------------------------------------------

-- Drop whatever FK currently points either column at notebook_sections,
-- by catalog rather than by assumed name. On a re-run confrelid matches
-- nothing (the table is gone), so the loop simply does not run.
do $$
declare
	r record;
begin
	for r in
		select con.conname, con.conrelid::regclass::text as tbl
		from pg_constraint con
		where con.contype = 'f'
			and con.conrelid in (
				'public.notebook_sessions'::regclass,
				'public.notebook_entries'::regclass
			)
			and con.confrelid = to_regclass('public.notebook_sections')
	loop
		execute format('alter table %s drop constraint %I', r.tbl, r.conname);
	end loop;
end
$$;

-- Conditional adds, never drop-then-add: the 0088 lesson. Nothing depends on
-- these two constraints today, but a drop-then-add is exactly the shape that
-- failed there on its second run, so it is not the shape used here.
do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conname = 'notebook_sessions_section_id_fkey'
			and conrelid = 'public.notebook_sessions'::regclass
	) then
		alter table public.notebook_sessions
			add constraint notebook_sessions_section_id_fkey
			foreign key (section_id) references public.classroom_sections (id)
			on delete cascade;
	end if;

	-- RESTRICT, as it was: a student's filed work must never disappear as a
	-- side effect of tidying up a class. classroom_delete_section (0083)
	-- already refuses a section that still has enrollments, so in practice its
	-- own structured refusal fires first; this is the backstop that makes the
	-- loss impossible rather than merely unlikely.
	if not exists (
		select 1 from pg_constraint
		where conname = 'notebook_entries_section_id_fkey'
			and conrelid = 'public.notebook_entries'::regclass
	) then
		alter table public.notebook_entries
			add constraint notebook_entries_section_id_fkey
			foreign key (section_id) references public.classroom_sections (id)
			on delete restrict;
	end if;
end
$$;

-- No CASCADE on purpose. If anything unexpected still depends on this table,
-- the right outcome is a loud failure, not a silent teardown of whatever it
-- was.
drop table if exists public.notebook_sections;

drop function if exists public.notebook_admin_upsert_section(text, text, uuid, uuid);

-- ---------------------------------------------------------------------------
-- 4. The roster.
--
-- ONE definition of "who is on this grid", as a no-grant helper rather than
-- the CTE 0069 spelled out twice (once for the student list, once for the
-- cells). Two copies of a roster rule is how the two quietly stop agreeing.
--
-- WHO IS ON IT:
--   * Every ACTIVE classroom_enrollments row for the section. This is the
--     whole point of the change: add a student in Classroom and they appear,
--     with a full row of 'missing' cells; remove one and they go.
--   * UNION anyone who actually holds entries or excusals in the section.
--     A student whose enrollment was deactivated mid-term has already filed
--     real work that was already reviewed, and dropping them from the grid
--     would hide it. They come back flagged `enrolled: false` so the UI can
--     say so, which is strictly more information than the old grid carried.
--
-- THE ROW KEY IS `student_key`, NOT the uuid. An enrolled student who has
-- never signed in has no uuid at all, and two of them would collide on a null
-- key. The key is the email where there is one and the uuid otherwise, so it
-- is always present and always stable.
--
-- THE NAME follows 0084's standing coalesce rule with the Classroom roster in
-- front of it: the roster's own display_name is what the teacher typed or
-- imported and what every Classroom surface shows, so the notebook agreeing
-- with Classroom is the point.
-- ---------------------------------------------------------------------------

create or replace function public._notebook_section_roster(p_section_id uuid)
returns table (
	student_key text,
	student_id uuid,
	email text,
	name text,
	enrolled boolean
)
language sql
stable
security definer
set search_path = ''
as $$
	with enrolled as (
		select
			ce.student_email as email,
			ce.display_name as roster_name,
			public._notebook_user_id_for_email(ce.student_email) as student_id
		from public.classroom_enrollments ce
		where ce.section_id = p_section_id
			and ce.active
	),
	holders as (
		select
			p.id as student_id,
			public._notebook_email_for_user(p.id) as email
		from public.profiles p
		where exists (
				select 1 from public.notebook_entries e
				where e.student_id = p.id and e.section_id = p_section_id
			)
			or exists (
				select 1
				from public.notebook_session_excusals x
				join public.notebook_sessions ss on ss.id = x.session_id
				where x.student_id = p.id and ss.section_id = p_section_id
			)
	),
	combined as (
		select e.email, e.student_id, e.roster_name, true as enrolled
		from enrolled e
		union all
		select h.email, h.student_id, null::text as roster_name, false as enrolled
		from holders h
		where not exists (
			select 1 from enrolled e
			where e.student_id = h.student_id
				or (h.email is not null and e.email = h.email)
		)
	)
	select
		coalesce(c.email, c.student_id::text) as student_key,
		c.student_id,
		coalesce(c.email, p.email) as email,
		coalesce(
			nullif(btrim(c.roster_name), ''),
			nullif(btrim(p.display_name), ''),
			nullif(btrim(p.full_name), ''),
			c.email,
			p.email,
			'Student'
		) as name,
		c.enrolled
	from combined c
	left join public.profiles p on p.id = c.student_id;
$$;

revoke all on function public._notebook_section_roster(uuid) from public;

-- ---------------------------------------------------------------------------
-- 5. The policies, recreated. Identical apart from naming the real check.
-- ---------------------------------------------------------------------------

-- The student policy is NOT recreated: `student_id = auth.uid()` is the
-- predicate this feature's entire isolation rests on and this migration does
-- not touch it.
create policy "section staff read notebook entries"
	on public.notebook_entries
	for select
	to authenticated
	using (public.classroom_manages_section(section_id));

create policy "notebook excusals visible to subject and staff"
	on public.notebook_session_excusals
	for select
	to authenticated
	using (
		student_id = (select auth.uid())
		or exists (
			select 1
			from public.notebook_sessions ss
			where ss.id = notebook_session_excusals.session_id
				and public.classroom_manages_section(ss.section_id)
		)
	);

-- ---------------------------------------------------------------------------
-- 6. The RPCs, recreated against classroom_sections.
--
-- Each is byte-for-byte its latest prior definition apart from two swaps:
-- the section-existence check reads classroom_sections, and the authority
-- check is classroom_manages_section. No message, parameter, return shape or
-- rule changes, so nothing that calls these needs to know.
-- ---------------------------------------------------------------------------

-- Latest definition: 0088 (the folder parameter). Same signature, so no
-- overload can be left behind and no `drop function` is needed.
create or replace function public.notebook_create_entry(
	p_student_id uuid,
	p_drive_file_id text default null,
	p_session_id uuid default null,
	p_section_id uuid default null,
	p_custom_label text default null,
	p_original_filename text default null,
	p_folder_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_file text := btrim(coalesce(p_drive_file_id, ''));
	v_label text := nullif(btrim(coalesce(p_custom_label, '')), '');
	v_original text := nullif(btrim(coalesce(p_original_filename, '')), '');
	v_section uuid;
	v_session_section uuid;
	v_entry_id uuid;
	v_photo_id uuid;
	v_uploaded timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_student_id is null or p_student_id <> v_uid then
		raise exception 'You can only create notebook entries for your own account.';
	end if;

	if p_folder_id is not null and not exists (
		select 1 from public.notebook_folders f
		where f.id = p_folder_id and f.student_id = v_uid
	) then
		raise exception 'That folder does not exist or is not yours.';
	end if;

	if p_session_id is not null then
		if v_file = '' then
			raise exception 'A Drive file id is required.';
		end if;

		select ss.section_id into v_session_section
		from public.notebook_sessions ss
		where ss.id = p_session_id;
		if not found then
			raise exception 'That session does not exist.';
		end if;
		if p_section_id is not null and p_section_id <> v_session_section then
			raise exception 'That session belongs to a different section.';
		end if;
		v_section := v_session_section;
	else
		if v_file = '' and v_label is null then
			raise exception 'A free-form entry needs a photo or a label.';
		end if;
		v_section := p_section_id;
		-- The only change: the section is a Classroom section now.
		--
		-- DELIBERATELY STILL NOT AN ENROLLMENT CHECK. 0069 asked only that the
		-- section exist, and filing your own entry against a class you are not
		-- in discloses your own work to that teacher and nobody else's to
		-- anyone. Tightening it here would be a behaviour change smuggled into
		-- a wiring change; it belongs in its own pass if it is wanted.
		if v_section is not null and not exists (
			select 1 from public.classroom_sections s where s.id = v_section
		) then
			raise exception 'That section does not exist.';
		end if;
	end if;

	insert into public.notebook_entries (student_id, section_id, session_id, custom_label, folder_id)
	values (v_uid, v_section, p_session_id, v_label, p_folder_id)
	returning id, upload_timestamp into v_entry_id, v_uploaded;

	if v_file <> '' then
		insert into public.notebook_entry_photos
			(entry_id, drive_file_id, variant, sequence_order, original_filename)
		values (v_entry_id, v_file, 'original', 1, left(v_original, 300))
		returning id into v_photo_id;
	end if;

	return jsonb_build_object(
		'entry_id', v_entry_id,
		'photo_id', v_photo_id,
		'folder_id', p_folder_id,
		'status', 'compliant',
		'upload_timestamp', v_uploaded
	);
end;
$$;

revoke all on function public.notebook_create_entry(uuid, text, uuid, uuid, text, text, uuid) from public;
grant execute on function public.notebook_create_entry(uuid, text, uuid, uuid, text, text, uuid) to authenticated;

-- Latest definition: 0088.
create or replace function public.notebook_create_note_entry(
	p_content jsonb,
	p_custom_label text default null,
	p_section_id uuid default null,
	p_folder_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_label text := nullif(btrim(coalesce(p_custom_label, '')), '');
	v_entry_id uuid;
	v_note_id uuid := gen_random_uuid();
	v_uploaded timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public._notebook_note_content_ok(p_content) then
		raise exception 'That note could not be saved: its content is not a valid note.';
	end if;
	if p_section_id is not null and not exists (
		select 1 from public.classroom_sections s where s.id = p_section_id
	) then
		raise exception 'That section does not exist.';
	end if;
	if p_folder_id is not null and not exists (
		select 1 from public.notebook_folders f
		where f.id = p_folder_id and f.student_id = v_uid
	) then
		raise exception 'That folder does not exist or is not yours.';
	end if;

	insert into public.notebook_entries (student_id, section_id, session_id, custom_label, folder_id)
	values (v_uid, p_section_id, null, v_label, p_folder_id)
	returning id, upload_timestamp into v_entry_id, v_uploaded;

	insert into public.notebook_entry_notes
		(id, entry_id, note_id, revision, supersedes_id, content, author_id)
	values (v_note_id, v_entry_id, v_note_id, 1, null, p_content, v_uid);

	return jsonb_build_object(
		'entry_id', v_entry_id,
		'note_id', v_note_id,
		'folder_id', p_folder_id,
		'status', 'compliant',
		'upload_timestamp', v_uploaded
	);
end;
$$;

revoke all on function public.notebook_create_note_entry(jsonb, text, uuid, uuid) from public;
grant execute on function public.notebook_create_note_entry(jsonb, text, uuid, uuid) to authenticated;

-- Latest definition: 0069.
create or replace function public.notebook_flag_entry(
	p_entry_id uuid,
	p_flag_reason text,
	p_instructor_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_section uuid;
	v_comment text := nullif(btrim(coalesce(p_instructor_comment, '')), '');
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_flag_reason is null or p_flag_reason not in
		('not_dated', 'illegible', 'insufficient_detail', 'appears_reconstructed', 'other')
	then
		raise exception 'Flag reason must be one of: not_dated, illegible, insufficient_detail, appears_reconstructed, other.';
	end if;

	select e.section_id into v_section
	from public.notebook_entries e
	where e.id = p_entry_id
	for update;
	if not found then
		raise exception 'That entry does not exist.';
	end if;
	if not public.classroom_manages_section(v_section) then
		raise exception 'Only the section instructor or a site admin can flag notebook entries.';
	end if;

	update public.notebook_entries
	set status = 'flagged',
		flag_reason = p_flag_reason,
		instructor_comment = v_comment,
		reviewed_by = v_uid,
		reviewed_at = now()
	where id = p_entry_id;

	return jsonb_build_object('entry_id', p_entry_id, 'status', 'flagged', 'flag_reason', p_flag_reason);
end;
$$;

revoke all on function public.notebook_flag_entry(uuid, text, text) from public;
grant execute on function public.notebook_flag_entry(uuid, text, text) to authenticated;

-- Latest definition: 0069.
create or replace function public.notebook_resolve_entry(
	p_entry_id uuid,
	p_instructor_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_section uuid;
	v_comment text := nullif(btrim(coalesce(p_instructor_comment, '')), '');
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select e.section_id into v_section
	from public.notebook_entries e
	where e.id = p_entry_id
	for update;
	if not found then
		raise exception 'That entry does not exist.';
	end if;
	if not public.classroom_manages_section(v_section) then
		raise exception 'Only the section instructor or a site admin can resolve notebook entries.';
	end if;

	update public.notebook_entries
	set status = 'compliant',
		flag_reason = null,
		instructor_comment = coalesce(v_comment, instructor_comment),
		reviewed_by = v_uid,
		reviewed_at = now()
	where id = p_entry_id;

	return jsonb_build_object('entry_id', p_entry_id, 'status', 'compliant');
end;
$$;

revoke all on function public.notebook_resolve_entry(uuid, text) from public;
grant execute on function public.notebook_resolve_entry(uuid, text) to authenticated;

-- Latest definition: 0069. A check-in belongs to a Classroom section now, so
-- the teacher of record schedules it (and an admin still can).
create or replace function public.notebook_admin_upsert_session(
	p_section_id uuid,
	p_unit_number integer,
	p_session_date date,
	p_session_label text,
	p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_label text := btrim(coalesce(p_session_label, ''));
	v_id uuid := p_id;
	v_old_section uuid;
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
		raise exception 'Only the section instructor or a site admin can manage notebook sessions.';
	end if;
	if p_unit_number is null or p_unit_number < 0 or p_unit_number > 1000 then
		raise exception 'Unit number must be between 0 and 1000.';
	end if;
	if p_session_date is null then
		raise exception 'A session date is required.';
	end if;
	if v_label = '' then
		raise exception 'A session label is required.';
	end if;

	if v_id is null then
		insert into public.notebook_sessions (section_id, unit_number, session_date, session_label, created_by)
		values (p_section_id, p_unit_number, p_session_date, v_label, v_uid)
		returning id into v_id;
	else
		select ss.section_id into v_old_section
		from public.notebook_sessions ss
		where ss.id = v_id
		for update;
		if not found then
			raise exception 'That session does not exist.';
		end if;
		if v_old_section <> p_section_id then
			if not public.classroom_manages_section(v_old_section) then
				raise exception 'Only the session''s own instructor or a site admin can move it.';
			end if;
			if exists (select 1 from public.notebook_entries e where e.session_id = v_id) then
				raise exception 'This session already has entries; move each entry with notebook_admin_override_entry first.';
			end if;
		end if;

		update public.notebook_sessions
		set section_id = p_section_id,
			unit_number = p_unit_number,
			session_date = p_session_date,
			session_label = v_label
		where id = v_id;
	end if;

	return jsonb_build_object('session_id', v_id);
end;
$$;

revoke all on function public.notebook_admin_upsert_session(uuid, integer, date, text, uuid) from public;
grant execute on function public.notebook_admin_upsert_session(uuid, integer, date, text, uuid) to authenticated;

-- Latest definition: 0069.
create or replace function public.notebook_admin_delete_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_session public.notebook_sessions%rowtype;
	v_fallback text;
	v_detached integer;
	v_excused integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select ss.* into v_session
	from public.notebook_sessions ss
	where ss.id = p_session_id
	for update;
	if not found then
		raise exception 'That session does not exist.';
	end if;
	if not public.classroom_manages_section(v_session.section_id) then
		raise exception 'Only the section instructor or a site admin can delete notebook sessions.';
	end if;

	v_fallback := left(coalesce(
		nullif(btrim(v_session.session_label), ''),
		'Unit ' || v_session.unit_number || ' session (deleted)'
	), 200);

	update public.notebook_entries
	set session_id = null,
		custom_label = coalesce(nullif(btrim(custom_label), ''), v_fallback)
	where session_id = p_session_id;
	get diagnostics v_detached = row_count;

	select count(*) into v_excused
	from public.notebook_session_excusals x
	where x.session_id = p_session_id;

	delete from public.notebook_sessions where id = p_session_id;

	perform public._notebook_log('delete_session', v_session.section_id, p_session_id, null, null,
		jsonb_build_object(
			'unit_number', v_session.unit_number,
			'session_date', v_session.session_date,
			'session_label', v_session.session_label,
			'detached_entries', v_detached,
			'removed_excusals', v_excused
		));

	return jsonb_build_object('deleted', true, 'detached_entries', v_detached);
end;
$$;

revoke all on function public.notebook_admin_delete_session(uuid) from public;
grant execute on function public.notebook_admin_delete_session(uuid) to authenticated;

-- Latest definition: 0071.
create or replace function public.notebook_admin_override_entry(
	p_entry_id uuid,
	p_set_session boolean default false,
	p_session_id uuid default null,
	p_set_section boolean default false,
	p_section_id uuid default null,
	p_custom_label text default null,
	p_status text default null,
	p_flag_reason text default null,
	p_instructor_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_old public.notebook_entries%rowtype;
	v_session uuid;
	v_section uuid;
	v_label text;
	v_status text;
	v_reason text;
	v_comment text;
	v_reviewed_by uuid;
	v_reviewed_at timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can override notebook entries.';
	end if;

	select e.* into v_old
	from public.notebook_entries e
	where e.id = p_entry_id
	for update;
	if not found then
		raise exception 'That entry does not exist.';
	end if;

	v_session := case when p_set_session then p_session_id else v_old.session_id end;
	v_label := case
		when p_custom_label is not null then nullif(btrim(p_custom_label), '')
		else v_old.custom_label
	end;

	if v_session is not null then
		select ss.section_id into v_section
		from public.notebook_sessions ss
		where ss.id = v_session;
		if not found then
			raise exception 'That session does not exist.';
		end if;
		if p_set_section and p_section_id is distinct from v_section then
			raise exception 'That session belongs to a different section; the entry''s section follows its session.';
		end if;
	else
		v_section := case when p_set_section then p_section_id else v_old.section_id end;
		if v_section is not null and not exists (
			select 1 from public.classroom_sections s where s.id = v_section
		) then
			raise exception 'That section does not exist.';
		end if;
	end if;

	v_status := coalesce(p_status, v_old.status);
	if v_status not in ('compliant', 'flagged', 'pending_review') then
		raise exception 'Status must be one of: compliant, flagged, pending_review.';
	end if;
	if p_flag_reason is not null and p_flag_reason not in
		('not_dated', 'illegible', 'insufficient_detail', 'appears_reconstructed', 'other')
	then
		raise exception 'Flag reason must be one of: not_dated, illegible, insufficient_detail, appears_reconstructed, other.';
	end if;
	if p_flag_reason is not null and v_status <> 'flagged' then
		raise exception 'A flag reason only applies when the status is flagged.';
	end if;
	if v_status = 'flagged' then
		v_reason := coalesce(p_flag_reason, v_old.flag_reason, 'other');
	else
		v_reason := null;
	end if;

	v_comment := case
		when p_instructor_comment is not null then nullif(btrim(p_instructor_comment), '')
		else v_old.instructor_comment
	end;

	if p_status is not null then
		v_reviewed_by := v_uid;
		v_reviewed_at := now();
	else
		v_reviewed_by := v_old.reviewed_by;
		v_reviewed_at := v_old.reviewed_at;
	end if;

	update public.notebook_entries
	set session_id = v_session,
		section_id = v_section,
		custom_label = v_label,
		status = v_status,
		flag_reason = v_reason,
		instructor_comment = v_comment,
		reviewed_by = v_reviewed_by,
		reviewed_at = v_reviewed_at
	where id = p_entry_id;

	perform public._notebook_log('override_entry', v_section, v_session, p_entry_id, v_old.student_id,
		jsonb_build_object(
			'before', jsonb_build_object(
				'session_id', v_old.session_id, 'section_id', v_old.section_id,
				'custom_label', v_old.custom_label, 'status', v_old.status,
				'flag_reason', v_old.flag_reason),
			'after', jsonb_build_object(
				'session_id', v_session, 'section_id', v_section,
				'custom_label', v_label, 'status', v_status,
				'flag_reason', v_reason)
		));

	return jsonb_build_object(
		'entry_id', p_entry_id,
		'session_id', v_session,
		'section_id', v_section,
		'custom_label', v_label,
		'status', v_status
	);
end;
$$;

revoke all on function public.notebook_admin_override_entry(uuid, boolean, uuid, boolean, uuid, text, text, text, text) from public;
grant execute on function public.notebook_admin_override_entry(uuid, boolean, uuid, boolean, uuid, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The section grid.
--
-- Same payload shape as 0069 apart from what the roster change forces:
--
--   * `section` describes a CLASSROOM section now
--     ({ id, course_code, course_title, label, block, teacher_email }).
--   * each student carries `student_key` (the stable row key), a NULLABLE
--     `id` (null = enrolled but never signed in) and `enrolled`.
--   * each cell carries `student_key` alongside `student_id`.
--
-- Everything else is untouched: latest-entry-wins per cell, entry_count,
-- on_time compared in America/Los_Angeles against session_date, an entry
-- outranking an excusal while `excused` still reports it, and free_entries.
-- ---------------------------------------------------------------------------

create or replace function public.notebook_get_section_grid(
	p_section_id uuid,
	p_unit_number integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_section record;
	v_sessions jsonb;
	v_students jsonb;
	v_cells jsonb;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select s.id, s.label, s.block, s.teacher_email, c.code as course_code, c.title as course_title
	into v_section
	from public.classroom_sections s
	join public.classroom_courses c on c.id = s.course_id
	where s.id = p_section_id;
	if not found then
		raise exception 'That section does not exist.';
	end if;
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'Only the section instructor or a site admin can view the notebook grid.';
	end if;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', ss.id,
			'unit_number', ss.unit_number,
			'session_date', ss.session_date,
			'session_label', ss.session_label
		) order by ss.session_date, ss.unit_number, ss.session_label, ss.id), '[]'::jsonb)
	into v_sessions
	from public.notebook_sessions ss
	where ss.section_id = p_section_id
		and (p_unit_number is null or ss.unit_number = p_unit_number);

	select coalesce(jsonb_agg(jsonb_build_object(
			'student_key', r.student_key,
			'id', r.student_id,
			'name', r.name,
			'email', r.email,
			'enrolled', r.enrolled,
			'free_entries', (
				select count(*)
				from public.notebook_entries e
				where e.student_id = r.student_id
					and e.section_id = p_section_id
					and e.session_id is null
			)
		) order by r.name, r.student_key), '[]'::jsonb)
	into v_students
	from public._notebook_section_roster(p_section_id) r;

	with roster as (
		select * from public._notebook_section_roster(p_section_id)
	),
	sess as (
		select ss.id, ss.session_date, ss.unit_number, ss.session_label
		from public.notebook_sessions ss
		where ss.section_id = p_section_id
			and (p_unit_number is null or ss.unit_number = p_unit_number)
	),
	latest as (
		select distinct on (e.session_id, e.student_id)
			e.session_id, e.student_id, e.id, e.status, e.flag_reason, e.upload_timestamp
		from public.notebook_entries e
		where e.session_id in (select id from sess)
		order by e.session_id, e.student_id, e.upload_timestamp desc, e.id desc
	),
	counts as (
		select e.session_id, e.student_id, count(*) as n
		from public.notebook_entries e
		where e.session_id in (select id from sess)
		group by e.session_id, e.student_id
	)
	select coalesce(jsonb_agg(jsonb_build_object(
			'student_key', r.student_key,
			'student_id', r.student_id,
			'session_id', se.id,
			'status', case
				when l.id is not null then l.status
				when x.session_id is not null then 'excused'
				else 'missing'
			end,
			'entry_id', l.id,
			'entry_count', coalesce(c.n, 0),
			'upload_timestamp', l.upload_timestamp,
			'on_time', case
				when l.id is null then null
				else ((l.upload_timestamp at time zone 'America/Los_Angeles')::date <= se.session_date)
			end,
			'excused', (x.session_id is not null),
			'flag_reason', l.flag_reason
		) order by r.name, r.student_key, se.session_date, se.unit_number, se.session_label, se.id), '[]'::jsonb)
	into v_cells
	from roster r
	cross join sess se
	-- A roster row with no account (enrolled, never signed in) has a null
	-- student_id, so every one of these joins simply finds nothing and each
	-- cell reads 'missing'. That is the intended outcome, not an edge case.
	left join latest l on l.session_id = se.id and l.student_id = r.student_id
	left join counts c on c.session_id = se.id and c.student_id = r.student_id
	left join public.notebook_session_excusals x
		on x.session_id = se.id and x.student_id = r.student_id;

	return jsonb_build_object(
		'section', jsonb_build_object(
			'id', v_section.id,
			'course_code', v_section.course_code,
			'course_title', v_section.course_title,
			'label', v_section.label,
			'block', v_section.block,
			'teacher_email', v_section.teacher_email
		),
		'unit_number', p_unit_number,
		'generated_at', now(),
		'sessions', v_sessions,
		'students', v_students,
		'cells', v_cells
	);
end;
$$;

revoke all on function public.notebook_get_section_grid(uuid, integer) from public;
grant execute on function public.notebook_get_section_grid(uuid, integer) to authenticated;
