-- 0082_classroom.sql
-- Classroom module: the data layer of the Google Classroom replacement.
--
-- WHAT THIS IS. Courses (IDEA100, IDEA209H, ...), their sections (one class
-- period each, with a teacher of record), email-keyed student enrollments, and
-- two kinds of section-scoped content: posts (announcements) and assignments
-- (with linked resources). This bundle is CONTENT + ROSTER ONLY -- there are
-- deliberately no submission or response tables yet. The assignment engine and
-- file submission arrive in later bundles and attach by FK to
-- classroom_assignments (id) with no schema rework here: an assignment is one
-- row PER SECTION, so a student's submission naturally references their own
-- section's row, and group_id (below) correlates sibling rows of one
-- multi-section publish.
--
-- KEYING CONVENTION. Enrollment is keyed by LOWERCASED EMAIL, not user id --
-- the coin-ledger convention (0070 coin_transactions, 0073
-- coin_section_students): a roster can be imported before a student has ever
-- signed in, and the moment they do, their classes are already there. No
-- linking step exists because nothing was ever keyed by user id.
--
-- WHO IS A TEACHER HERE. Teacher authority is PER SECTION, by teacher of
-- record: classroom_sections.teacher_email matching current_user_email()
-- (0067). This is deliberately NOT the 0067 admin tier -- a teacher manages
-- exactly their own sections -- but is_admin() is the cross-section override,
-- which is what gives the pinned owner (apina@boscotech.edu, see
-- admin_owner_email()) visibility and control across all sections, per spec.
-- classroom_is_staff() (any @boscotech.edu account) gates only the
-- create-a-course / create-your-own-section paths, which grant nothing over
-- anyone else's data. NOTE THE 0067 NAMING TRAP: is_teacher() exists but
-- RETURNS is_admin(); nothing here calls it.
--
-- MULTI-SECTION PUBLISH. "Author once, publish to selected sections" is ONE
-- RPC call that inserts one row per selected section, all sharing a freshly
-- minted group_id. The caller must manage EVERY selected section or the whole
-- call is refused (one transaction, so nothing partial ever lands). Rows are
-- thereafter independent (edited/deleted per section); group_id exists so
-- later tooling can correlate siblings.
--
-- WHO SEES WHAT (RLS).
--   * Students: only PUBLISHED posts/assignments/resources of sections they
--     are ACTIVELY enrolled in, their own enrollment rows, and the
--     section/course rows of their own classes. Never another section's
--     content, never another student's roster row.
--   * Teachers: everything (drafts included) in sections where they are the
--     teacher of record. Nothing in anyone else's sections.
--   * Admins (0067; includes the pinned owner): everything.
--   * classroom_courses is a shared catalog, readable by any signed-in user
--     (the coin_categories precedent: a course list is not sensitive).
--
-- WRITES. ZERO client write grants or policies on any classroom table. Every
-- write goes through the SECURITY DEFINER RPCs below, which re-check
-- auth.uid() / current_user_email() inside the body (the 0041/0062/0069
-- platform pattern). Draft vs published is enforced in the student RLS
-- policies themselves, never left to application code.
--
-- Apply manually in the Supabase SQL editor, after 0081.

-- ---------------------------------------------------------------------------
-- 0. current_user_email() (0067) is referenced DIRECTLY from an RLS policy
-- below (the enrollments own-row read), which evaluates as the querying role.
-- 0070 hit exactly this and established the fix: an idempotent execute grant,
-- harmless because the function only ever returns the caller's own email.
-- ---------------------------------------------------------------------------

grant execute on function public.current_user_email() to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_courses (
	id uuid primary key default gen_random_uuid(),
	-- Normalized UPPER + trimmed by the RPC; the CHECK keeps a raw write from
	-- ever storing a differently-cased duplicate.
	code text not null unique check (code = upper(btrim(code)) and char_length(code) between 2 and 40),
	title text not null check (char_length(btrim(title)) between 1 and 200),
	active boolean not null default true,
	created_at timestamptz not null default now()
);

create table if not exists public.classroom_sections (
	id uuid primary key default gen_random_uuid(),
	course_id uuid not null references public.classroom_courses (id) on delete restrict,
	-- "Period 3", "A", ... Unique per course (case-insensitive) because the
	-- roster import resolves a section by (course code, section label).
	label text not null check (char_length(btrim(label)) between 1 and 100),
	-- Block / period display text, optional.
	block text check (block is null or char_length(btrim(block)) between 1 and 60),
	-- The teacher of record. Lowercased email, the enrollment keying convention
	-- applied to staff: a section can be assigned before that teacher has ever
	-- signed in.
	teacher_email text not null
		check (teacher_email = lower(btrim(teacher_email)) and teacher_email like '%@%'),
	created_at timestamptz not null default now()
);

create unique index if not exists classroom_sections_course_label_key
	on public.classroom_sections (course_id, lower(label));
create index if not exists classroom_sections_teacher_idx
	on public.classroom_sections (teacher_email);

create table if not exists public.classroom_enrollments (
	section_id uuid not null references public.classroom_sections (id) on delete cascade,
	-- Lowercased; may belong to an account that has never signed in.
	student_email text not null
		check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	display_name text not null check (char_length(btrim(display_name)) between 1 and 200),
	active boolean not null default true,
	-- Email of whoever enrolled them (teacher or import), informational.
	added_by text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- The PK is what makes the roster import idempotent: re-running the same
	-- file upserts onto these keys and can never duplicate an enrollment.
	primary key (section_id, student_email)
);

create index if not exists classroom_enrollments_student_idx
	on public.classroom_enrollments (student_email);

create table if not exists public.classroom_posts (
	id uuid primary key default gen_random_uuid(),
	section_id uuid not null references public.classroom_sections (id) on delete cascade,
	-- Shared across the sibling rows of one multi-section publish.
	group_id uuid,
	title text check (title is null or char_length(btrim(title)) between 1 and 300),
	body text not null check (char_length(btrim(body)) between 1 and 20000),
	author_email text not null,
	-- Display snapshot at publish time (profiles display_name -> full_name),
	-- the greenline author_name convention; null falls back to the email.
	author_name text,
	published boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists classroom_posts_section_idx
	on public.classroom_posts (section_id, created_at desc);
create index if not exists classroom_posts_group_idx
	on public.classroom_posts (group_id);

create table if not exists public.classroom_assignments (
	id uuid primary key default gen_random_uuid(),
	section_id uuid not null references public.classroom_sections (id) on delete cascade,
	group_id uuid,
	title text not null check (char_length(btrim(title)) between 1 and 300),
	-- Plain text for now; the interactive engine bundle decides its own
	-- content model later and attaches by FK, never by reshaping this row.
	description text not null default '' check (char_length(description) <= 20000),
	-- Null = ungraded.
	points integer check (points is null or (points >= 0 and points <= 10000)),
	due_at timestamptz,
	-- Grading category, free text ("Unit Labs", "Documentation", ...).
	category text check (category is null or char_length(btrim(category)) between 1 and 100),
	author_email text not null,
	author_name text,
	published boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists classroom_assignments_section_due_idx
	on public.classroom_assignments (section_id, due_at);
create index if not exists classroom_assignments_section_created_idx
	on public.classroom_assignments (section_id, created_at desc);
create index if not exists classroom_assignments_group_idx
	on public.classroom_assignments (group_id);

create table if not exists public.classroom_assignment_resources (
	id uuid primary key default gen_random_uuid(),
	assignment_id uuid not null references public.classroom_assignments (id) on delete cascade,
	label text not null check (char_length(btrim(label)) between 1 and 200),
	url text not null check (url ~* '^https?://' and char_length(url) <= 2000),
	sort_order integer not null default 1 check (sort_order >= 1),
	created_at timestamptz not null default now()
);

create index if not exists classroom_assignment_resources_assignment_idx
	on public.classroom_assignment_resources (assignment_id, sort_order);

-- ---------------------------------------------------------------------------
-- 2. Helper checks. SECURITY DEFINER so policies and RPCs can ask without
-- recursive RLS evaluation (the notebook_is_section_instructor rationale).
-- ---------------------------------------------------------------------------

-- Any staff account (@boscotech.edu) or admin. Gates only self-scoped setup
-- actions (create a course, create your own section); it grants no authority
-- over anyone else's sections.
create or replace function public.classroom_is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public.is_admin() or public.current_user_email() like '%@boscotech.edu';
$$;

revoke all on function public.classroom_is_staff() from public;
grant execute on function public.classroom_is_staff() to authenticated;

-- The per-section authority check: teacher of record, or admin (which is what
-- gives the pinned owner cross-section reach).
create or replace function public.classroom_manages_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public.is_admin() or (
		p_section_id is not null and exists (
			select 1 from public.classroom_sections s
			where s.id = p_section_id and s.teacher_email = public.current_user_email()
		)
	);
$$;

revoke all on function public.classroom_manages_section(uuid) from public;
grant execute on function public.classroom_manages_section(uuid) to authenticated;

-- Actively enrolled in this section (by the caller's own email).
create or replace function public.classroom_is_enrolled(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select p_section_id is not null and exists (
		select 1 from public.classroom_enrollments e
		where e.section_id = p_section_id
			and e.student_email = public.current_user_email()
			and e.active
	);
$$;

revoke all on function public.classroom_is_enrolled(uuid) from public;
grant execute on function public.classroom_is_enrolled(uuid) to authenticated;

-- Who may see a section row at all: its manager, or an active enrollee.
create or replace function public.classroom_can_read_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public.classroom_manages_section(p_section_id)
		or public.classroom_is_enrolled(p_section_id);
$$;

revoke all on function public.classroom_can_read_section(uuid) from public;
grant execute on function public.classroom_can_read_section(uuid) to authenticated;

-- Who may read an assignment (and therefore its resources): the section's
-- manager sees everything, an enrolled student only what is published. The
-- resources policy delegates to this so resource visibility can never diverge
-- from assignment visibility (the notebook_can_read_entry pattern).
create or replace function public.classroom_can_read_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.classroom_assignments a
		where a.id = p_assignment_id
			and (
				public.classroom_manages_section(a.section_id)
				or (a.published and public.classroom_is_enrolled(a.section_id))
			)
	);
$$;

revoke all on function public.classroom_can_read_assignment(uuid) from public;
grant execute on function public.classroom_can_read_assignment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Privileges + RLS. SELECT only; there is no client write grant or policy
-- on any classroom table.
-- ---------------------------------------------------------------------------

revoke all on public.classroom_courses from anon, authenticated;
grant select on public.classroom_courses to authenticated;
alter table public.classroom_courses enable row level security;

drop policy if exists "classroom courses readable" on public.classroom_courses;
create policy "classroom courses readable"
	on public.classroom_courses
	for select
	to authenticated
	using (true);

revoke all on public.classroom_sections from anon, authenticated;
grant select on public.classroom_sections to authenticated;
alter table public.classroom_sections enable row level security;

drop policy if exists "classroom sections readable to members" on public.classroom_sections;
create policy "classroom sections readable to members"
	on public.classroom_sections
	for select
	to authenticated
	using (public.classroom_can_read_section(id));

revoke all on public.classroom_enrollments from anon, authenticated;
grant select on public.classroom_enrollments to authenticated;
alter table public.classroom_enrollments enable row level security;

-- A student reads their OWN enrollment rows and nothing else of the roster;
-- the section's manager reads all of it.
drop policy if exists "classroom enrollments own or managed" on public.classroom_enrollments;
create policy "classroom enrollments own or managed"
	on public.classroom_enrollments
	for select
	to authenticated
	using (
		student_email = public.current_user_email()
		or public.classroom_manages_section(section_id)
	);

revoke all on public.classroom_posts from anon, authenticated;
grant select on public.classroom_posts to authenticated;
alter table public.classroom_posts enable row level security;

-- Draft/published is enforced HERE, not in application code: an enrolled
-- student's policy carries `published`, the manager's does not.
drop policy if exists "classroom posts readable to enrolled" on public.classroom_posts;
create policy "classroom posts readable to enrolled"
	on public.classroom_posts
	for select
	to authenticated
	using (published and public.classroom_is_enrolled(section_id));

drop policy if exists "classroom posts readable to managers" on public.classroom_posts;
create policy "classroom posts readable to managers"
	on public.classroom_posts
	for select
	to authenticated
	using (public.classroom_manages_section(section_id));

revoke all on public.classroom_assignments from anon, authenticated;
grant select on public.classroom_assignments to authenticated;
alter table public.classroom_assignments enable row level security;

drop policy if exists "classroom assignments readable to enrolled" on public.classroom_assignments;
create policy "classroom assignments readable to enrolled"
	on public.classroom_assignments
	for select
	to authenticated
	using (published and public.classroom_is_enrolled(section_id));

drop policy if exists "classroom assignments readable to managers" on public.classroom_assignments;
create policy "classroom assignments readable to managers"
	on public.classroom_assignments
	for select
	to authenticated
	using (public.classroom_manages_section(section_id));

revoke all on public.classroom_assignment_resources from anon, authenticated;
grant select on public.classroom_assignment_resources to authenticated;
alter table public.classroom_assignment_resources enable row level security;

drop policy if exists "classroom resources follow assignment visibility" on public.classroom_assignment_resources;
create policy "classroom resources follow assignment visibility"
	on public.classroom_assignment_resources
	for select
	to authenticated
	using (public.classroom_can_read_assignment(assignment_id));

-- ---------------------------------------------------------------------------
-- 4. Internal helpers for the RPCs. No grants at all: only the SECURITY
-- DEFINER RPCs (running as the function owner) reach them -- the
-- _notebook_log convention.
-- ---------------------------------------------------------------------------

-- Validates and normalizes a resources payload ([{label, url}, ...]) into the
-- canonical array the RPCs insert from. A blank label falls back to the URL.
create or replace function public._classroom_validate_resources(p_resources jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_out jsonb := '[]'::jsonb;
	v_item jsonb;
	v_label text;
	v_url text;
	v_count integer := 0;
begin
	if p_resources is null or p_resources = 'null'::jsonb then
		return v_out;
	end if;
	if jsonb_typeof(p_resources) <> 'array' then
		raise exception 'Resources must be a list of {label, url} pairs.';
	end if;
	for v_item in select * from jsonb_array_elements(p_resources) loop
		v_count := v_count + 1;
		if v_count > 20 then
			raise exception 'At most 20 resources per assignment.';
		end if;
		v_url := btrim(coalesce(v_item->>'url', ''));
		if v_url = '' then
			raise exception 'Resource % is missing its URL.', v_count;
		end if;
		if v_url !~* '^https?://' then
			raise exception 'Resource URLs must start with http:// or https:// (resource %).', v_count;
		end if;
		if char_length(v_url) > 2000 then
			raise exception 'Resource % has a URL longer than 2000 characters.', v_count;
		end if;
		v_label := left(coalesce(nullif(btrim(coalesce(v_item->>'label', '')), ''), v_url), 200);
		v_out := v_out || jsonb_build_array(jsonb_build_object('label', v_label, 'url', v_url));
	end loop;
	return v_out;
end;
$$;

revoke all on function public._classroom_validate_resources(jsonb) from public;

-- The caller's display-name snapshot for author_name (display_name ->
-- full_name -> null; the UI falls back to the email local part).
create or replace function public._classroom_author_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''))
	from public.profiles p
	where p.id = (select auth.uid());
$$;

revoke all on function public._classroom_author_name() from public;

-- Resolves + authorizes a publish target list: distinct, non-null, existing,
-- and EVERY one managed by the caller. Raising here aborts the whole publish
-- call, which is the point -- nothing partial ever lands.
create or replace function public._classroom_check_publish_targets(p_section_ids uuid[])
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_sections uuid[];
	v_section uuid;
begin
	select array_agg(distinct s) into v_sections
	from unnest(coalesce(p_section_ids, '{}'::uuid[])) as s
	where s is not null;

	if v_sections is null or array_length(v_sections, 1) = 0 then
		raise exception 'Select at least one section to publish to.';
	end if;
	if array_length(v_sections, 1) > 50 then
		raise exception 'At most 50 sections per publish.';
	end if;

	foreach v_section in array v_sections loop
		if not exists (select 1 from public.classroom_sections s where s.id = v_section) then
			raise exception 'One of the selected sections does not exist.';
		end if;
		if not public.classroom_manages_section(v_section) then
			raise exception 'You are not the teacher of record for one of the selected sections.';
		end if;
	end loop;

	return v_sections;
end;
$$;

revoke all on function public._classroom_check_publish_targets(uuid[]) from public;

-- ---------------------------------------------------------------------------
-- 5. Course + section administration.
-- ---------------------------------------------------------------------------

-- Create-or-get a course (any staff), or explicitly edit one (admin only:
-- courses are shared catalog metadata with no per-teacher owner, so letting
-- any staff account rename or retire one would be authority over everyone
-- else's classes).
create or replace function public.classroom_upsert_course(
	p_code text,
	p_title text,
	p_active boolean default true,
	p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_code text := upper(btrim(coalesce(p_code, '')));
	v_title text := btrim(coalesce(p_title, ''));
	v_id uuid := p_id;
	v_existing uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.classroom_is_staff() then
		raise exception 'Only staff can manage classroom courses.';
	end if;
	if char_length(v_code) < 2 or char_length(v_code) > 40 then
		raise exception 'A course code (2-40 characters) is required.';
	end if;

	if v_id is null then
		-- Create-or-get: an existing code returns the existing course untouched,
		-- so two teachers setting up sections of IDEA100 converge on one row.
		select c.id into v_existing from public.classroom_courses c where c.code = v_code;
		if v_existing is not null then
			return jsonb_build_object('course_id', v_existing, 'created', false);
		end if;
		if v_title = '' then
			raise exception 'A course title is required.';
		end if;
		insert into public.classroom_courses (code, title, active)
		values (v_code, v_title, coalesce(p_active, true))
		returning id into v_id;
		return jsonb_build_object('course_id', v_id, 'created', true);
	end if;

	if not public.is_admin() then
		raise exception 'Only a site admin can edit an existing course.';
	end if;
	if v_title = '' then
		raise exception 'A course title is required.';
	end if;
	update public.classroom_courses
	set code = v_code,
		title = v_title,
		active = coalesce(p_active, true)
	where id = v_id;
	if not found then
		raise exception 'That course does not exist.';
	end if;
	return jsonb_build_object('course_id', v_id, 'created', false);
exception
	when unique_violation then
		raise exception 'A different course already uses the code %.', v_code;
end;
$$;

revoke all on function public.classroom_upsert_course(text, text, boolean, uuid) from public;
grant execute on function public.classroom_upsert_course(text, text, boolean, uuid) to authenticated;

-- Create a section (staff, for THEMSELVES unless admin) or edit one the
-- caller manages. Reassigning a section to a different teacher is admin-only.
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
		v_teacher := v_caller;
	end if;
	if v_teacher not like '%@boscotech.edu' then
		raise exception 'The teacher of record must be a @boscotech.edu account (got "%").', v_teacher;
	end if;
	if v_teacher <> v_caller and not public.is_admin() then
		raise exception 'Only a site admin can assign a section to another teacher.';
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

	return jsonb_build_object('section_id', v_id);
exception
	when unique_violation then
		raise exception 'That course already has a section labelled "%".', v_label;
end;
$$;

revoke all on function public.classroom_upsert_section(uuid, text, text, text, uuid) from public;
grant execute on function public.classroom_upsert_section(uuid, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Roster management. Enrollment rows are never deleted from the app:
-- `active = false` removes a student from the live roster while keeping the
-- record (the sections.ts archive-not-delete convention).
-- ---------------------------------------------------------------------------

create or replace function public.classroom_set_enrollment(
	p_section_id uuid,
	p_student_email text,
	p_display_name text default null,
	p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
	v_existing boolean;
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
	if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
		raise exception 'Enter a valid student email address.';
	end if;

	v_existing := exists (
		select 1 from public.classroom_enrollments e
		where e.section_id = p_section_id and e.student_email = v_email
	);

	insert into public.classroom_enrollments as ce
		(section_id, student_email, display_name, active, added_by)
	values (
		p_section_id,
		v_email,
		coalesce(v_name, left(split_part(v_email, '@', 1), 200)),
		coalesce(p_active, true),
		public.current_user_email()
	)
	on conflict (section_id, student_email) do update
		set display_name = coalesce(v_name, ce.display_name),
			active = coalesce(p_active, true),
			updated_at = now();

	return jsonb_build_object(
		'section_id', p_section_id,
		'student_email', v_email,
		'active', coalesce(p_active, true),
		'action', case when v_existing then 'updated' else 'created' end
	);
end;
$$;

revoke all on function public.classroom_set_enrollment(uuid, text, text, boolean) from public;
grant execute on function public.classroom_set_enrollment(uuid, text, text, boolean) to authenticated;

-- Bulk roster import: rows of {email, name, course_code, section_label}. ONE
-- round trip, one transaction, structured per-row results (the
-- coin_bulk_log_section convention) -- a refusal on row 7 never obscures
-- whether the other rows landed, and a per-row exception can never abort the
-- rest. Idempotent by construction: the enrollment PK upserts, so re-running
-- the same file never duplicates anything.
create or replace function public.classroom_import_roster(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_row jsonb;
	v_idx integer := 0;
	v_ok integer := 0;
	v_bad integer := 0;
	v_results jsonb := '[]'::jsonb;
	v_email text;
	v_name text;
	v_code text;
	v_label text;
	v_course uuid;
	v_section uuid;
	v_reason text;
	v_existing boolean;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.classroom_is_staff() then
		raise exception 'Only staff can import a classroom roster.';
	end if;
	if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
		raise exception 'Rows must be a JSON array.';
	end if;
	if jsonb_array_length(p_rows) = 0 then
		raise exception 'No rows to import.';
	end if;
	if jsonb_array_length(p_rows) > 2000 then
		raise exception 'At most 2000 rows per import.';
	end if;

	for v_row in select * from jsonb_array_elements(p_rows) loop
		v_idx := v_idx + 1;
		begin
			v_email := lower(btrim(coalesce(v_row->>'email', '')));
			v_name := nullif(btrim(coalesce(v_row->>'name', '')), '');
			v_code := upper(btrim(coalesce(v_row->>'course_code', '')));
			v_label := btrim(coalesce(v_row->>'section_label', ''));
			v_reason := null;
			v_course := null;
			v_section := null;

			if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
				v_reason := 'bad_email';
			else
				select c.id into v_course from public.classroom_courses c where c.code = v_code;
				if v_course is null then
					v_reason := 'course_not_found';
				else
					select s.id into v_section
					from public.classroom_sections s
					where s.course_id = v_course and lower(s.label) = lower(v_label);
					if v_section is null then
						v_reason := 'section_not_found';
					elsif not public.classroom_manages_section(v_section) then
						v_reason := 'not_your_section';
					end if;
				end if;
			end if;

			if v_reason is not null then
				v_bad := v_bad + 1;
				v_results := v_results || jsonb_build_array(jsonb_build_object(
					'row', v_idx, 'email', v_email, 'ok', false, 'reason', v_reason));
			else
				v_existing := exists (
					select 1 from public.classroom_enrollments e
					where e.section_id = v_section and e.student_email = v_email
				);
				insert into public.classroom_enrollments as ce
					(section_id, student_email, display_name, active, added_by)
				values (
					v_section,
					v_email,
					coalesce(v_name, left(split_part(v_email, '@', 1), 200)),
					true,
					public.current_user_email()
				)
				on conflict (section_id, student_email) do update
					set display_name = coalesce(v_name, ce.display_name),
						active = true,
						added_by = excluded.added_by,
						updated_at = now();
				v_ok := v_ok + 1;
				v_results := v_results || jsonb_build_array(jsonb_build_object(
					'row', v_idx, 'email', v_email, 'ok', true,
					'action', case when v_existing then 'updated' else 'created' end,
					'section_id', v_section));
			end if;
		exception when others then
			v_bad := v_bad + 1;
			v_results := v_results || jsonb_build_array(jsonb_build_object(
				'row', v_idx, 'email', coalesce(v_email, ''), 'ok', false,
				'reason', 'error', 'message', sqlerrm));
		end;
	end loop;

	return jsonb_build_object(
		'total', v_idx,
		'succeeded', v_ok,
		'refused', v_bad,
		'results', v_results
	);
end;
$$;

revoke all on function public.classroom_import_roster(jsonb) from public;
grant execute on function public.classroom_import_roster(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Posts (announcements).
-- ---------------------------------------------------------------------------

create or replace function public.classroom_create_post(
	p_section_ids uuid[],
	p_body text,
	p_title text default null,
	p_published boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_sections uuid[];
	v_section uuid;
	v_group uuid := gen_random_uuid();
	v_title text := nullif(btrim(coalesce(p_title, '')), '');
	v_body text := btrim(coalesce(p_body, ''));
	v_author text;
	v_id uuid;
	v_ids uuid[] := '{}'::uuid[];
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if v_body = '' then
		raise exception 'The post needs a body.';
	end if;
	if char_length(v_body) > 20000 then
		raise exception 'The post body is limited to 20000 characters.';
	end if;

	v_sections := public._classroom_check_publish_targets(p_section_ids);
	v_author := public._classroom_author_name();

	foreach v_section in array v_sections loop
		insert into public.classroom_posts
			(section_id, group_id, title, body, author_email, author_name, published)
		values (v_section, v_group, v_title, v_body,
			public.current_user_email(), v_author, coalesce(p_published, true))
		returning id into v_id;
		v_ids := array_append(v_ids, v_id);
	end loop;

	return jsonb_build_object(
		'group_id', v_group,
		'post_ids', to_jsonb(v_ids),
		'published', coalesce(p_published, true)
	);
end;
$$;

revoke all on function public.classroom_create_post(uuid[], text, text, boolean) from public;
grant execute on function public.classroom_create_post(uuid[], text, text, boolean) to authenticated;

-- Edits take the FULL new state (the edit form always has the row loaded):
-- title null clears it, p_published null leaves the current state.
create or replace function public.classroom_update_post(
	p_id uuid,
	p_body text,
	p_title text default null,
	p_published boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_old public.classroom_posts%rowtype;
	v_title text := nullif(btrim(coalesce(p_title, '')), '');
	v_body text := btrim(coalesce(p_body, ''));
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select p.* into v_old
	from public.classroom_posts p
	where p.id = p_id
	for update;
	if not found then
		raise exception 'That post does not exist.';
	end if;
	if not public.classroom_manages_section(v_old.section_id) then
		raise exception 'Only the section''s teacher of record or a site admin can edit this post.';
	end if;
	if v_body = '' then
		raise exception 'The post needs a body.';
	end if;
	if char_length(v_body) > 20000 then
		raise exception 'The post body is limited to 20000 characters.';
	end if;

	update public.classroom_posts
	set title = v_title,
		body = v_body,
		published = coalesce(p_published, v_old.published),
		updated_at = now()
	where id = p_id;

	return jsonb_build_object(
		'post_id', p_id,
		'published', coalesce(p_published, v_old.published)
	);
end;
$$;

revoke all on function public.classroom_update_post(uuid, text, text, boolean) from public;
grant execute on function public.classroom_update_post(uuid, text, text, boolean) to authenticated;

create or replace function public.classroom_delete_post(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_section uuid;
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

	delete from public.classroom_posts where id = p_id;
	return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.classroom_delete_post(uuid) from public;
grant execute on function public.classroom_delete_post(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Assignments + resources.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_create_assignment(
	p_section_ids uuid[],
	p_title text,
	p_description text default '',
	p_points integer default null,
	p_due_at timestamptz default null,
	p_category text default null,
	p_published boolean default true,
	p_resources jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_sections uuid[];
	v_section uuid;
	v_group uuid := gen_random_uuid();
	v_title text := btrim(coalesce(p_title, ''));
	v_description text := coalesce(p_description, '');
	v_category text := nullif(btrim(coalesce(p_category, '')), '');
	v_resources jsonb;
	v_res jsonb;
	v_author text;
	v_id uuid;
	v_ids uuid[] := '{}'::uuid[];
	v_i integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if v_title = '' or char_length(v_title) > 300 then
		raise exception 'An assignment title (1-300 characters) is required.';
	end if;
	if char_length(v_description) > 20000 then
		raise exception 'The description is limited to 20000 characters.';
	end if;
	if p_points is not null and (p_points < 0 or p_points > 10000) then
		raise exception 'Points must be between 0 and 10000.';
	end if;
	if v_category is not null and char_length(v_category) > 100 then
		raise exception 'The grading category is limited to 100 characters.';
	end if;

	v_resources := public._classroom_validate_resources(p_resources);
	v_sections := public._classroom_check_publish_targets(p_section_ids);
	v_author := public._classroom_author_name();

	foreach v_section in array v_sections loop
		insert into public.classroom_assignments
			(section_id, group_id, title, description, points, due_at, category,
				author_email, author_name, published)
		values (v_section, v_group, v_title, v_description, p_points, p_due_at,
			v_category, public.current_user_email(), v_author, coalesce(p_published, true))
		returning id into v_id;
		v_ids := array_append(v_ids, v_id);

		v_i := 0;
		for v_res in select * from jsonb_array_elements(v_resources) loop
			v_i := v_i + 1;
			insert into public.classroom_assignment_resources
				(assignment_id, label, url, sort_order)
			values (v_id, v_res->>'label', v_res->>'url', v_i);
		end loop;
	end loop;

	return jsonb_build_object(
		'group_id', v_group,
		'assignment_ids', to_jsonb(v_ids),
		'published', coalesce(p_published, true)
	);
end;
$$;

revoke all on function public.classroom_create_assignment(uuid[], text, text, integer, timestamptz, text, boolean, jsonb) from public;
grant execute on function public.classroom_create_assignment(uuid[], text, text, integer, timestamptz, text, boolean, jsonb) to authenticated;

-- Full-state edit like classroom_update_post. p_resources null leaves the
-- existing resources untouched; anything else is a FULL REPLACEMENT (the
-- tournament_set_reward_rules convention).
create or replace function public.classroom_update_assignment(
	p_id uuid,
	p_title text,
	p_description text default '',
	p_points integer default null,
	p_due_at timestamptz default null,
	p_category text default null,
	p_published boolean default null,
	p_resources jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_old public.classroom_assignments%rowtype;
	v_title text := btrim(coalesce(p_title, ''));
	v_description text := coalesce(p_description, '');
	v_category text := nullif(btrim(coalesce(p_category, '')), '');
	v_resources jsonb;
	v_res jsonb;
	v_i integer;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select a.* into v_old
	from public.classroom_assignments a
	where a.id = p_id
	for update;
	if not found then
		raise exception 'That assignment does not exist.';
	end if;
	if not public.classroom_manages_section(v_old.section_id) then
		raise exception 'Only the section''s teacher of record or a site admin can edit this assignment.';
	end if;
	if v_title = '' or char_length(v_title) > 300 then
		raise exception 'An assignment title (1-300 characters) is required.';
	end if;
	if char_length(v_description) > 20000 then
		raise exception 'The description is limited to 20000 characters.';
	end if;
	if p_points is not null and (p_points < 0 or p_points > 10000) then
		raise exception 'Points must be between 0 and 10000.';
	end if;
	if v_category is not null and char_length(v_category) > 100 then
		raise exception 'The grading category is limited to 100 characters.';
	end if;

	update public.classroom_assignments
	set title = v_title,
		description = v_description,
		points = p_points,
		due_at = p_due_at,
		category = v_category,
		published = coalesce(p_published, v_old.published),
		updated_at = now()
	where id = p_id;

	if p_resources is not null then
		v_resources := public._classroom_validate_resources(p_resources);
		delete from public.classroom_assignment_resources where assignment_id = p_id;
		v_i := 0;
		for v_res in select * from jsonb_array_elements(v_resources) loop
			v_i := v_i + 1;
			insert into public.classroom_assignment_resources
				(assignment_id, label, url, sort_order)
			values (p_id, v_res->>'label', v_res->>'url', v_i);
		end loop;
	end if;

	return jsonb_build_object(
		'assignment_id', p_id,
		'published', coalesce(p_published, v_old.published)
	);
end;
$$;

revoke all on function public.classroom_update_assignment(uuid, text, text, integer, timestamptz, text, boolean, jsonb) from public;
grant execute on function public.classroom_update_assignment(uuid, text, text, integer, timestamptz, text, boolean, jsonb) to authenticated;

-- Hard delete (resources cascade). NOTE FOR THE SUBMISSION BUNDLE: once
-- submissions exist and reference an assignment, this should archive instead
-- of destroying student work -- the gauntlet_author_delete lesson. Revisit in
-- that bundle, not before.
create or replace function public.classroom_delete_assignment(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_section uuid;
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

	delete from public.classroom_assignments where id = p_id;
	return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.classroom_delete_assignment(uuid) from public;
grant execute on function public.classroom_delete_assignment(uuid) to authenticated;
