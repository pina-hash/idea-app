-- 0069_notebook.sql
-- Digital engineering notebook: the data layer (schema + RLS + RPCs only; the
-- UI arrives in later sessions).
--
-- WHAT THIS IS. Students photograph notebook pages and upload them; each
-- upload is a notebook_entries row (one logical entry) holding one or more
-- notebook_entry_photos rows (multi-page entries, and client-corrected
-- 'enhanced' variants stored NEXT TO the 'original', never replacing it).
-- Instructors review entries against per-section sessions ("Unit 3, Oct 14:
-- bearing teardown"), flag problems, and read a section grid of who has
-- uploaded what, on time or late. Photo BYTES live in a Google Shared Drive
-- (see src/lib/server/notebook-drive.ts); Postgres stores only the Drive file
-- id, so nothing here serves image bytes.
--
-- HOW SECTIONS AND ENROLLMENT ALIGN WITH WHAT ALREADY EXISTS. This repo has
-- no sections table: sections are plain data in src/lib/curriculum.ts, and a
-- student's enrollment is the self-selected profiles.section_id (0003) -- a
-- free-form Section.id string, deliberately not a FK. notebook_sections
-- therefore carries course_id as that SAME free-form Section.id (not a FK, the
-- 0003 convention), and "enrolled in a notebook section" means
-- profiles.section_id = notebook_sections.course_id. Instructor assignment has
-- no DB representation anywhere today (curriculum.ts stores a display name),
-- so notebook_sections.instructor_id is the first one: a uuid referencing
-- auth.users like every other actor column in this schema. Two
-- notebook_sections rows may share one course_id (two lab periods of one
-- curriculum section); they then share the roster, which is inherent to the
-- loose enrollment model.
--
-- WHO SEES WHAT (RLS).
--   * Students: their own entries and photos only.
--   * Instructors: entries/photos of sections where THEY are instructor_id.
--   * The chair tier: this codebase's chair-level role is the ADMIN tier
--     (0067), checked with is_admin(). NOTE THE 0067 NAMING TRAP: is_teacher()
--     still exists but now RETURNS is_admin(); new code must never call it.
--     Admins read everything.
--   * notebook_sections / notebook_sessions are broadly readable (any signed-in
--     user; the notebook is a signed-in feature).
--
-- WRITES. There are ZERO client write grants or policies on any notebook
-- table. Every write goes through the SECURITY DEFINER RPCs below, which run
-- as the function owner (bypassing RLS) and do their own auth.uid() checks
-- inside the body -- the platform pattern since the VANGUARD/FRC hardening
-- (0041) and used by all of tournaments (0062+). upload_timestamp is server
-- set (column default now()) and no RPC accepts it as a parameter, so it is
-- never client-writable.
--
-- DECISIONS WORTH KNOWING BEFORE EXTENDING THIS:
--   * "Excused" is NOT an entry status. An excusal is the sanctioned ABSENCE
--     of an entry, so faking it as a notebook_entries row would mean entries
--     with no photos and a meaningless upload_timestamp. It lives in
--     notebook_session_excusals (one row per session per student), written by
--     notebook_admin_set_excusal (the excusal half of the admin override), and
--     the section grid reports those cells as status 'excused'.
--   * An entry's session implies its section AT THE DATABASE LEVEL: a CHECK
--     requires section_id whenever session_id is set, and a composite FK
--     (session_id, section_id) -> notebook_sessions (id, section_id) makes a
--     mismatched pair unrepresentable even through a buggy RPC.
--   * notebook_admin_delete_session detaches entries instead of deleting them:
--     session_id is nulled and custom_label is backfilled from the deleted
--     session's own label (the has-a-target CHECK would otherwise reject the
--     detach), so entries survive as free entries. The action is logged.
--   * notebook_admin_log is the lightweight audit table for admin actions
--     (session deletes, entry overrides, excusals, section upserts). Its
--     subject columns are BARE uuids, deliberately no FKs: a log row must
--     survive the deletion of the thing it describes.
--   * Three RPCs beyond the feature spec, each forced by the spec itself:
--     notebook_admin_upsert_section (sections have no client write path, so
--     WITHOUT this there would be no way to create one at all; admin-only
--     because it assigns instructor power), notebook_resolve_entry (flagging
--     flips resubmissions to 'pending_review'; someone must be able to close
--     the loop back to 'compliant', and notebook_admin_override_entry is
--     deliberately above instructors), and notebook_admin_set_excusal (see
--     above).
--
-- Apply manually in the Supabase SQL editor, after 0068.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.notebook_sections (
	id uuid primary key default gen_random_uuid(),
	-- A Section.id from src/lib/curriculum.ts (free-form, NOT a FK; the 0003
	-- profiles.section_id convention). Enrollment = profiles.section_id matches.
	course_id text not null check (char_length(btrim(course_id)) between 1 and 200),
	section_label text not null check (char_length(btrim(section_label)) between 1 and 200),
	instructor_id uuid not null references auth.users (id) on delete restrict,
	created_at timestamptz not null default now()
);

create index if not exists notebook_sections_instructor_idx
	on public.notebook_sections (instructor_id);
create index if not exists notebook_sections_course_idx
	on public.notebook_sections (course_id);

create table if not exists public.notebook_sessions (
	id uuid primary key default gen_random_uuid(),
	section_id uuid not null references public.notebook_sections (id) on delete cascade,
	unit_number integer not null check (unit_number between 0 and 1000),
	session_date date not null,
	session_label text not null check (char_length(btrim(session_label)) between 1 and 200),
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now()
);

-- Lets notebook_entries carry a composite FK proving its (session_id,
-- section_id) pair really is that session's own section.
alter table public.notebook_sessions
	drop constraint if exists notebook_sessions_id_section_key;
alter table public.notebook_sessions
	add constraint notebook_sessions_id_section_key unique (id, section_id);

create index if not exists notebook_sessions_section_idx
	on public.notebook_sessions (section_id, unit_number, session_date);

create table if not exists public.notebook_entries (
	id uuid primary key default gen_random_uuid(),
	student_id uuid not null references auth.users (id) on delete cascade,
	section_id uuid references public.notebook_sections (id) on delete restrict,
	session_id uuid,
	custom_label text check (custom_label is null or char_length(custom_label) between 1 and 200),
	-- Server-set on insert by the RPC's column default; no RPC takes it as a
	-- parameter, so it is never client-writable.
	upload_timestamp timestamptz not null default now(),
	status text not null default 'compliant'
		check (status in ('compliant', 'flagged', 'pending_review')),
	flag_reason text check (flag_reason is null or flag_reason in
		('not_dated', 'illegible', 'insufficient_detail', 'appears_reconstructed', 'other')),
	instructor_comment text check (instructor_comment is null or char_length(instructor_comment) <= 2000),
	reviewed_by uuid references auth.users (id) on delete set null,
	reviewed_at timestamptz,
	-- An entry always has a target: a session, or a custom label (free entry).
	constraint notebook_entries_has_target check (
		session_id is not null
		or (custom_label is not null and btrim(custom_label) <> '')
	),
	-- A session implies a section...
	constraint notebook_entries_session_implies_section check (
		session_id is null or section_id is not null
	)
);

-- ...and that section must be the session's own (unrepresentable otherwise:
-- MATCH SIMPLE skips null pairs, and the CHECK above rules those out whenever
-- session_id is set).
alter table public.notebook_entries
	drop constraint if exists notebook_entries_session_section_fkey;
alter table public.notebook_entries
	add constraint notebook_entries_session_section_fkey
	foreign key (session_id, section_id)
	references public.notebook_sessions (id, section_id);

create index if not exists notebook_entries_student_idx
	on public.notebook_entries (student_id, upload_timestamp desc);
create index if not exists notebook_entries_session_idx
	on public.notebook_entries (session_id, student_id, upload_timestamp desc);
create index if not exists notebook_entries_section_idx
	on public.notebook_entries (section_id);

create table if not exists public.notebook_entry_photos (
	id uuid primary key default gen_random_uuid(),
	entry_id uuid not null references public.notebook_entries (id) on delete cascade,
	drive_file_id text not null check (char_length(btrim(drive_file_id)) between 1 and 256),
	variant text not null default 'original' check (variant in ('original', 'enhanced')),
	sequence_order integer not null check (sequence_order >= 1),
	created_at timestamptz not null default now(),
	unique (entry_id, sequence_order)
);

create table if not exists public.notebook_session_excusals (
	session_id uuid not null references public.notebook_sessions (id) on delete cascade,
	student_id uuid not null references auth.users (id) on delete cascade,
	excused_by uuid references auth.users (id) on delete set null,
	excused_at timestamptz not null default now(),
	note text check (note is null or char_length(note) <= 500),
	primary key (session_id, student_id)
);

-- Admin audit log. Subject columns are bare uuids ON PURPOSE (no FKs): a log
-- row must survive the deletion of what it describes.
create table if not exists public.notebook_admin_log (
	id uuid primary key default gen_random_uuid(),
	actor_id uuid,
	action text not null,
	section_id uuid,
	session_id uuid,
	entry_id uuid,
	student_id uuid,
	details jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now()
);

create index if not exists notebook_admin_log_created_idx
	on public.notebook_admin_log (created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Privileges + RLS. SELECT only, and only what each role may see; there is
-- no client write grant or policy on any notebook table.
-- ---------------------------------------------------------------------------

-- Is the caller the instructor of this section? SECURITY DEFINER so policies
-- and RPCs can ask without recursive RLS evaluation (the 0001 is_teacher()
-- rationale).
create or replace function public.notebook_is_section_instructor(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select p_section_id is not null and exists (
		select 1 from public.notebook_sections s
		where s.id = p_section_id and s.instructor_id = (select auth.uid())
	);
$$;

revoke all on function public.notebook_is_section_instructor(uuid) from public;
grant execute on function public.notebook_is_section_instructor(uuid) to authenticated;

-- Who may read an entry (and therefore its photos): the owning student, the
-- entry's section instructor, or an admin. Must stay in step with the
-- notebook_entries policies below; notebook_entry_photos delegates to this so
-- photo visibility can never diverge from entry visibility.
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
				or public.is_admin()
				or public.notebook_is_section_instructor(e.section_id)
			)
	);
$$;

revoke all on function public.notebook_can_read_entry(uuid) from public;
grant execute on function public.notebook_can_read_entry(uuid) to authenticated;

revoke all on public.notebook_sections from anon, authenticated;
grant select on public.notebook_sections to authenticated;
alter table public.notebook_sections enable row level security;

drop policy if exists "notebook sections readable" on public.notebook_sections;
create policy "notebook sections readable"
	on public.notebook_sections
	for select
	to authenticated
	using (true);

revoke all on public.notebook_sessions from anon, authenticated;
grant select on public.notebook_sessions to authenticated;
alter table public.notebook_sessions enable row level security;

drop policy if exists "notebook sessions readable" on public.notebook_sessions;
create policy "notebook sessions readable"
	on public.notebook_sessions
	for select
	to authenticated
	using (true);

revoke all on public.notebook_entries from anon, authenticated;
grant select on public.notebook_entries to authenticated;
alter table public.notebook_entries enable row level security;

drop policy if exists "students read own notebook entries" on public.notebook_entries;
create policy "students read own notebook entries"
	on public.notebook_entries
	for select
	to authenticated
	using (student_id = (select auth.uid()));

drop policy if exists "section staff read notebook entries" on public.notebook_entries;
create policy "section staff read notebook entries"
	on public.notebook_entries
	for select
	to authenticated
	using (public.is_admin() or public.notebook_is_section_instructor(section_id));

revoke all on public.notebook_entry_photos from anon, authenticated;
grant select on public.notebook_entry_photos to authenticated;
alter table public.notebook_entry_photos enable row level security;

drop policy if exists "notebook photos follow entry visibility" on public.notebook_entry_photos;
create policy "notebook photos follow entry visibility"
	on public.notebook_entry_photos
	for select
	to authenticated
	using (public.notebook_can_read_entry(entry_id));

revoke all on public.notebook_session_excusals from anon, authenticated;
grant select on public.notebook_session_excusals to authenticated;
alter table public.notebook_session_excusals enable row level security;

drop policy if exists "notebook excusals visible to subject and staff" on public.notebook_session_excusals;
create policy "notebook excusals visible to subject and staff"
	on public.notebook_session_excusals
	for select
	to authenticated
	using (
		student_id = (select auth.uid())
		or public.is_admin()
		or exists (
			select 1
			from public.notebook_sessions ss
			where ss.id = notebook_session_excusals.session_id
				and public.notebook_is_section_instructor(ss.section_id)
		)
	);

revoke all on public.notebook_admin_log from anon, authenticated;
grant select on public.notebook_admin_log to authenticated;
alter table public.notebook_admin_log enable row level security;

drop policy if exists "admins read the notebook log" on public.notebook_admin_log;
create policy "admins read the notebook log"
	on public.notebook_admin_log
	for select
	to authenticated
	using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Internal log helper. No grants at all: only the SECURITY DEFINER RPCs
-- (running as the function owner) can call it -- the _tournament_log pattern.
-- ---------------------------------------------------------------------------

create or replace function public._notebook_log(
	p_action text,
	p_section_id uuid,
	p_session_id uuid,
	p_entry_id uuid,
	p_student_id uuid,
	p_details jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
	insert into public.notebook_admin_log
		(actor_id, action, section_id, session_id, entry_id, student_id, details)
	values
		((select auth.uid()), p_action, p_section_id, p_session_id, p_entry_id,
			p_student_id, coalesce(p_details, '{}'::jsonb));
$$;

revoke all on function public._notebook_log(text, uuid, uuid, uuid, uuid, jsonb) from public;

-- ---------------------------------------------------------------------------
-- 4. Student RPCs: creating entries and adding photos.
-- ---------------------------------------------------------------------------

-- Creates one entry plus its first photo row (variant 'original'). The photo's
-- drive_file_id must already be uploaded to Drive -- the API route in
-- src/routes/api/notebook/upload does that, then calls this under the
-- caller's own cookie session.
create or replace function public.notebook_create_entry(
	p_student_id uuid,
	p_drive_file_id text,
	p_session_id uuid default null,
	p_section_id uuid default null,
	p_custom_label text default null
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
	if v_file = '' then
		raise exception 'A Drive file id is required.';
	end if;

	if p_session_id is not null then
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
		if v_label is null then
			raise exception 'An entry needs a session or a custom label.';
		end if;
		v_section := p_section_id;
		if v_section is not null and not exists (
			select 1 from public.notebook_sections s where s.id = v_section
		) then
			raise exception 'That section does not exist.';
		end if;
	end if;

	insert into public.notebook_entries (student_id, section_id, session_id, custom_label)
	values (v_uid, v_section, p_session_id, v_label)
	returning id, upload_timestamp into v_entry_id, v_uploaded;

	insert into public.notebook_entry_photos (entry_id, drive_file_id, variant, sequence_order)
	values (v_entry_id, v_file, 'original', 1)
	returning id into v_photo_id;

	return jsonb_build_object(
		'entry_id', v_entry_id,
		'photo_id', v_photo_id,
		'status', 'compliant',
		'upload_timestamp', v_uploaded
	);
end;
$$;

revoke all on function public.notebook_create_entry(uuid, text, uuid, uuid, text) from public;
grant execute on function public.notebook_create_entry(uuid, text, uuid, uuid, text) to authenticated;

-- Adds another photo row to an existing entry (multi-page uploads, and
-- 'enhanced' variants stored next to the 'original'). Entry owner only. Never
-- replaces or deletes an existing photo row. A resubmission onto a FLAGGED
-- entry flips it to 'pending_review' -- it can never silently clear a flag
-- (flag_reason and instructor_comment are retained for the reviewer).
create or replace function public.notebook_add_photo(
	p_entry_id uuid,
	p_drive_file_id text,
	p_variant text default 'original'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_file text := btrim(coalesce(p_drive_file_id, ''));
	v_status text;
	v_seq integer;
	v_photo_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if v_file = '' then
		raise exception 'A Drive file id is required.';
	end if;
	if p_variant is null or p_variant not in ('original', 'enhanced') then
		raise exception 'Variant must be ''original'' or ''enhanced''.';
	end if;

	-- FOR UPDATE serializes concurrent adds on one entry, so sequence_order
	-- can never collide.
	select e.status into v_status
	from public.notebook_entries e
	where e.id = p_entry_id and e.student_id = v_uid
	for update;
	if not found then
		raise exception 'That entry does not exist or is not yours.';
	end if;

	select coalesce(max(ph.sequence_order), 0) + 1 into v_seq
	from public.notebook_entry_photos ph
	where ph.entry_id = p_entry_id;

	if v_status = 'flagged' then
		update public.notebook_entries
		set status = 'pending_review'
		where id = p_entry_id;
		v_status := 'pending_review';
	end if;

	insert into public.notebook_entry_photos (entry_id, drive_file_id, variant, sequence_order)
	values (p_entry_id, v_file, p_variant, v_seq)
	returning id into v_photo_id;

	return jsonb_build_object(
		'photo_id', v_photo_id,
		'sequence_order', v_seq,
		'status', v_status
	);
end;
$$;

revoke all on function public.notebook_add_photo(uuid, text, text) from public;
grant execute on function public.notebook_add_photo(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Review RPCs: flagging and resolving. Instructor-of-section or admin.
-- ---------------------------------------------------------------------------

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
	if not (public.is_admin() or public.notebook_is_section_instructor(v_section)) then
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

-- The counterpart that closes the review loop: after a flagged entry is
-- resubmitted (status 'pending_review'), the instructor accepts it back to
-- 'compliant'. Same permission tier as flagging. Passing a comment replaces
-- the stored one; omitting it leaves the existing comment as history.
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
	if not (public.is_admin() or public.notebook_is_section_instructor(v_section)) then
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

-- ---------------------------------------------------------------------------
-- 6. Section + session administration.
-- ---------------------------------------------------------------------------

-- Admin-only: creating a section assigns instructor power over its entries,
-- which is the same trust level as role assignment (0067). The instructor must
-- be a staff ('teacher') account -- post-0067 that role is the staff marker,
-- not a privilege grant.
create or replace function public.notebook_admin_upsert_section(
	p_course_id text,
	p_section_label text,
	p_instructor_id uuid,
	p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_course text := btrim(coalesce(p_course_id, ''));
	v_label text := btrim(coalesce(p_section_label, ''));
	v_id uuid := p_id;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can create or edit notebook sections.';
	end if;
	if v_course = '' then
		raise exception 'A course id is required (a Section.id from the curriculum).';
	end if;
	if v_label = '' then
		raise exception 'A section label is required.';
	end if;
	if p_instructor_id is null or not exists (
		select 1 from public.profiles p where p.id = p_instructor_id and p.role = 'teacher'
	) then
		raise exception 'The instructor must be a staff (teacher) account that has signed in.';
	end if;

	if v_id is null then
		insert into public.notebook_sections (course_id, section_label, instructor_id)
		values (v_course, v_label, p_instructor_id)
		returning id into v_id;
	else
		update public.notebook_sections
		set course_id = v_course,
			section_label = v_label,
			instructor_id = p_instructor_id
		where id = v_id;
		if not found then
			raise exception 'That section does not exist.';
		end if;
	end if;

	perform public._notebook_log('upsert_section', v_id, null, null, null,
		jsonb_build_object('course_id', v_course, 'section_label', v_label, 'instructor_id', p_instructor_id));

	return jsonb_build_object('section_id', v_id);
end;
$$;

revoke all on function public.notebook_admin_upsert_section(text, text, uuid, uuid) from public;
grant execute on function public.notebook_admin_upsert_section(text, text, uuid, uuid) to authenticated;

-- Instructor-of-section or admin. Creating (p_id null) or updating a session.
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
		select 1 from public.notebook_sections s where s.id = p_section_id
	) then
		raise exception 'That section does not exist.';
	end if;
	if not (public.is_admin() or public.notebook_is_section_instructor(p_section_id)) then
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
		-- Moving a session between sections needs authority over BOTH, and is
		-- refused outright while entries point at it (their composite FK pins
		-- them to the old section; move each entry first via
		-- notebook_admin_override_entry).
		if v_old_section <> p_section_id then
			if not (public.is_admin() or public.notebook_is_section_instructor(v_old_section)) then
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

-- Instructor-of-section or admin. Deletes the session WITHOUT destroying or
-- orphaning entries: they are detached first (session_id nulled, custom_label
-- backfilled from the deleted session's own label so the has-a-target CHECK
-- holds) and survive as free entries still attached to the section. Logged.
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
	if not (public.is_admin() or public.notebook_is_section_instructor(v_session.section_id)) then
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

-- ---------------------------------------------------------------------------
-- 7. Admin overrides. Deliberately a BROADER tier than notebook_flag_entry:
-- admin only, never the instructor.
-- ---------------------------------------------------------------------------

-- Fix an existing entry: re-point its session (section auto-aligns to the
-- session's own), correct its section, relabel it, or force a status. The
-- p_set_* booleans distinguish "change to this value (possibly null)" from
-- "leave untouched", since null is a meaningful target for session/section.
-- Every change is logged with a before/after snapshot.
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
		-- The section follows the session; an explicit conflicting section is
		-- a mistake, not a preference.
		if p_set_section and p_section_id is distinct from v_section then
			raise exception 'That session belongs to a different section; the entry''s section follows its session.';
		end if;
	else
		v_section := case when p_set_section then p_section_id else v_old.section_id end;
		if v_section is not null and not exists (
			select 1 from public.notebook_sections s where s.id = v_section
		) then
			raise exception 'That section does not exist.';
		end if;
		if v_label is null then
			raise exception 'An entry with no session needs a custom label.';
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

-- The excusal half of the admin override: mark (or unmark) one student excused
-- for one session. An excusal is the sanctioned absence of an entry, so it is
-- its own row, never a fake entry; the section grid reports the cell as
-- 'excused'. Logged.
create or replace function public.notebook_admin_set_excusal(
	p_session_id uuid,
	p_student_id uuid,
	p_excused boolean default true,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_section uuid;
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can excuse notebook sessions.';
	end if;

	select ss.section_id into v_section
	from public.notebook_sessions ss
	where ss.id = p_session_id;
	if not found then
		raise exception 'That session does not exist.';
	end if;
	if p_student_id is null or not exists (
		select 1 from public.profiles p where p.id = p_student_id
	) then
		raise exception 'That student does not exist.';
	end if;

	if coalesce(p_excused, true) then
		insert into public.notebook_session_excusals (session_id, student_id, excused_by, note)
		values (p_session_id, p_student_id, v_uid, v_note)
		on conflict (session_id, student_id) do update
			set excused_by = excluded.excused_by,
				excused_at = now(),
				note = excluded.note;
	else
		delete from public.notebook_session_excusals
		where session_id = p_session_id and student_id = p_student_id;
	end if;

	perform public._notebook_log(
		case when coalesce(p_excused, true) then 'set_excusal' else 'clear_excusal' end,
		v_section, p_session_id, null, p_student_id,
		jsonb_build_object('note', v_note));

	return jsonb_build_object(
		'session_id', p_session_id,
		'student_id', p_student_id,
		'excused', coalesce(p_excused, true)
	);
end;
$$;

revoke all on function public.notebook_admin_set_excusal(uuid, uuid, boolean, text) from public;
grant execute on function public.notebook_admin_set_excusal(uuid, uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. The section grid: the read model the review UI renders. Instructor-of-
-- section or admin only.
--
-- Shape (stable; the UI session should not need to touch this again):
--   {
--     section: { id, course_id, section_label, instructor_id },
--     unit_number: N | null,            -- null = all units
--     generated_at: timestamptz,
--     sessions: [ { id, unit_number, session_date, session_label } ... ],
--     students: [ { id, name, email, free_entries } ... ],
--     cells: [ {
--       student_id, session_id,
--       status: 'missing' | 'excused' | 'compliant' | 'flagged' | 'pending_review',
--       entry_id, entry_count, upload_timestamp,
--       on_time,                        -- null when there is no entry
--       excused, flag_reason
--     } ... one per student x session ]
--   }
--
-- Semantics:
--   * Enrollment = profiles.section_id matching the section's course_id (the
--     0003 self-selected class), UNION anyone holding entries or excusals in
--     the section, so a transferred student's work stays visible.
--   * With several entries for one (student, session) the LATEST upload is the
--     cell (entry_count says how many exist).
--   * on_time compares the upload's date IN AMERICA/LOS_ANGELES (the school
--     day, the gauntlet_progression convention) against session_date:
--     uploaded on or before the session date = true.
--   * An entry outranks an excusal for the cell status; `excused` still
--     reports the excusal so the UI can show both.
--   * free_entries counts the student's session-less entries in this section;
--     they have no column in the grid but should not be invisible.
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
	v_section public.notebook_sections%rowtype;
	v_sessions jsonb;
	v_students jsonb;
	v_cells jsonb;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select s.* into v_section
	from public.notebook_sections s
	where s.id = p_section_id;
	if not found then
		raise exception 'That section does not exist.';
	end if;
	if not (public.is_admin() or public.notebook_is_section_instructor(p_section_id)) then
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

	with roster as (
		select p.id,
			coalesce(
				nullif(btrim(p.display_name), ''),
				nullif(btrim(p.full_name), ''),
				p.email,
				'Student'
			) as name,
			p.email
		from public.profiles p
		where (p.section_id = v_section.course_id and p.role = 'student')
			or exists (
				select 1 from public.notebook_entries e
				where e.student_id = p.id and e.section_id = p_section_id
			)
			or exists (
				select 1
				from public.notebook_session_excusals x
				join public.notebook_sessions ss on ss.id = x.session_id
				where x.student_id = p.id and ss.section_id = p_section_id
			)
	)
	select coalesce(jsonb_agg(jsonb_build_object(
			'id', r.id,
			'name', r.name,
			'email', r.email,
			'free_entries', (
				select count(*)
				from public.notebook_entries e
				where e.student_id = r.id
					and e.section_id = p_section_id
					and e.session_id is null
			)
		) order by r.name, r.id), '[]'::jsonb)
	into v_students
	from roster r;

	with roster as (
		select p.id,
			coalesce(
				nullif(btrim(p.display_name), ''),
				nullif(btrim(p.full_name), ''),
				p.email,
				'Student'
			) as name
		from public.profiles p
		where (p.section_id = v_section.course_id and p.role = 'student')
			or exists (
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
			'student_id', r.id,
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
		) order by r.name, r.id, se.session_date, se.unit_number, se.session_label, se.id), '[]'::jsonb)
	into v_cells
	from roster r
	cross join sess se
	left join latest l on l.session_id = se.id and l.student_id = r.id
	left join counts c on c.session_id = se.id and c.student_id = r.id
	left join public.notebook_session_excusals x
		on x.session_id = se.id and x.student_id = r.id;

	return jsonb_build_object(
		'section', jsonb_build_object(
			'id', v_section.id,
			'course_id', v_section.course_id,
			'section_label', v_section.section_label,
			'instructor_id', v_section.instructor_id
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
