-- 0169_notebook_section_reviewer_tier.sql
-- IDEA Notebook: a SECTION REVIEWER tier -- an explicit, SECTION-SCOPED
-- allowlist that grants reading and reviewing one named section's notebooks
-- (the compliance grid, submitted entries with their notes and photos, the
-- review verdicts, the per-student notebook read) and nothing else.
--
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS
--
-- `classroom_sections.teacher_email` is a single text column, and
-- `_classroom_manages_section_email` (0138) resolves manage-ness to
-- admin-or-that-one-address. There is no co-teacher concept anywhere in the
-- schema, so a second instructor who genuinely teaches a section can be given
-- its notebook review console only by either replacing `teacher_email` (taking
-- the section away from the teacher of record) or granting `app_admins` --
-- the full 0067 tier: role editing, the coin desk, every student's graded
-- work, moderation and permanent deletion. Both are wrong. This file gives
-- "may review this section's notebooks" its own grant.
--
-- SECTION-SCOPED, NOT GLOBAL, unlike 0155 (gauntlet_authors) and 0167
-- (frc_reviewers), and deliberately: a notebook reviewer reads student work,
-- so a global list would hand one grant every section's students -- a wider
-- disclosure than the problem needs. The key is (section_id, email) and the
-- predicate takes the section.
--
-- AN ALLOWLIST, NOT AN INFERENCE -- 0155's shape, for 0155's two reasons:
--   1. Inferring review rights from some other fact about a person (an
--      enrollment row, the domain role) would grant them for a population
--      nobody enumerated. 0138 exists precisely because instructors turn up
--      in rosters they do not manage.
--   2. A capability must arrive because somebody granted it, never as a side
--      effect of unrelated data.
--
-- WHAT IS MIRRORED FROM `app_admins` / `gauntlet_authors` (0155) /
-- `frc_reviewers` (0167), deliberately, rather than invented:
--   * IDENTITY IS THE LOWERCASED EMAIL, not a user id, with the same
--     `email = lower(btrim(email)) and email like '%@%'` CHECK. An account
--     can be authorized before it has ever signed in.
--   * The same column set: `granted_by`, `granted_at`, `note` (<= 200 chars).
--   * SECURITY DEFINER + `set search_path = ''` on every function.
--   * THE ROSTER IS ADMIN-ONLY TO READ (staff emails) and has NO CLIENT
--     WRITE PATH at all: only the definer RPCs in section 3.
--   * Grant / revoke / roster RPCs, admin-gated (not owner-gated: reviewing
--     does not propagate, and every capability in this tier is one the
--     granting admin already holds). NOT teacher-of-record-gated: letting a
--     manager grant their own section is a delegation design with its own
--     questions, deferred and named rather than slipped in.
--   * `notebook_reviews_section()` FOLDS IN `classroom_manages_section()`
--     (which itself folds `is_admin()` via 0138), which is what makes every
--     re-gate in section 5 a pure widening: no admin and no teacher of
--     record can lose a gate by this file.
--   * NO SEED: an empty roster degrades to exactly the world 0140 left
--     behind. Grants are made by hand (section 8).
--
-- ONE DELIBERATE DIVERGENCE FROM 0167: grants are limited to
-- `@boscotech.edu`, 0155's rule, NOT 0167's both-domains rule. 0167 admitted
-- `@boscotech.net` because its decided reviewer population included .net
-- accounts; no such population exists here, and a .net grant would put a
-- student account over classmates' notebooks. If that need ever becomes
-- real, widening the CHECK in `notebook_reviewer_grant` is one migration.
--
-- ---------------------------------------------------------------------------
-- THE SEAM, AND WHY `_classroom_manages_section_email` IS NOT TOUCHED
--
-- The notebook and the classroom share one manage rule (0138), and this file
-- must not widen it: that predicate reaches classroom grading, deletion and
-- posting, which is a much larger decision than notebook review. The notebook
-- path IS separable, and the catalog says so: every notebook review gate is
-- either a direct `classroom_manages_section(section_id)` call inside a
-- notebook function or policy, or one of two notebook-side helpers
-- (`_notebook_manages_session`, `_notebook_manages_student_email`). So this
-- file introduces `notebook_reviews_section(uuid)` beside the manage rule and
-- re-gates the REVIEW sites onto it, per-site, 0167's instrument. Nothing
-- classroom-side resolves differently afterwards, and section 7 asserts that
-- from the catalog rather than trusting this paragraph.
--
-- `_notebook_manages_student_email` IS ALSO NOT REDEFINED, and that is a
-- census decision, not an accident: it feeds `notebook_manages_student`,
-- which gates the four staff delete/restore RPCs. Widening it would hand a
-- reviewer soft-deletion of student work as a side effect of the per-student
-- read. Instead the student-notebook RPC moves to a NEW private helper,
-- `_notebook_reviews_student_email`, which folds the old rule in.
--
-- ---------------------------------------------------------------------------
-- APPLY MANUALLY in the Supabase SQL editor, after 0168. Idempotent: every
-- statement is create-or-replace, `if not exists`, or drop-then-create.
-- Re-pasting it is ordinary and safe. PURELY ADDITIVE: no signature changes
-- and no drops, so the migration and the app deploy are independent events
-- and either may go first (the app's helper degrades on PGRST202 until this
-- is applied).
--
-- NOTE ON GRANTS (the 0137 rule, as corrected by 0167's header): on a hosted
-- Supabase project a NEW function arrives with a direct EXECUTE grant to
-- anon/authenticated/service_role from the bootstrap default privileges, and
-- `revoke ... from public` alone leaves those standing. `create or replace`
-- over an EXISTING function instead PRESERVES its current ACL -- a replace
-- does not re-mint the default grants. Every revoke below names the roles
-- anyway, because that pins one end state on any database this file lands
-- on, whichever history it carries.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The roster. Keyed (section_id, email): one row is one person's licence
-- over one section. The FK cascades, so deleting a section takes its grants
-- with it and no orphaned licence survives to match a reused id.
-- ---------------------------------------------------------------------------

create table if not exists public.notebook_section_reviewers (
	section_id uuid not null references public.classroom_sections(id) on delete cascade,
	-- Lowercased. The account need not exist yet. Same CHECK as app_admins.
	email text not null check (email = lower(btrim(email)) and email like '%@%'),
	-- Email of whoever granted it; every row is hand-granted, so no seed rows.
	granted_by text,
	granted_at timestamptz not null default now(),
	note text check (note is null or char_length(note) <= 200),
	primary key (section_id, email)
);

comment on table public.notebook_section_reviewers is
	'Notebook section reviewer tier (0169). Section-scoped allowlist mirroring app_admins/gauntlet_authors/frc_reviewers. Grants reading and reviewing ONE section''s notebooks -- never manage, never delete, never admin. Read notebook_reviews_section(), never this table.';

-- Reads are admin-only: this is a list of staff emails, app_admins' own
-- reason. Writes have no client path -- section 3 only.
revoke all on public.notebook_section_reviewers from public, anon, authenticated, service_role;
grant select on public.notebook_section_reviewers to authenticated;
alter table public.notebook_section_reviewers enable row level security;

drop policy if exists "admins read the section reviewer roster" on public.notebook_section_reviewers;
create policy "admins read the section reviewer roster"
	on public.notebook_section_reviewers
	for select
	to authenticated
	using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. The predicates.
-- ---------------------------------------------------------------------------

-- May the CALLER review this section's notebooks? Manage folded in first --
-- teacher of record and admin both pass through the one 0138 rule -- so this
-- can only ever WIDEN a gate, never narrow one. No email-scoped twin, per
-- 0138's own rule: nothing here asks about a third party.
create or replace function public.notebook_reviews_section(p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select case
		when (select auth.uid()) is null then false
		when p_section_id is null then false
		when public.classroom_manages_section(p_section_id) then true
		else exists (
			select 1 from public.notebook_section_reviewers r
			where r.section_id = p_section_id
				and r.email = public.current_user_email()
		)
	end;
$$;

comment on function public.notebook_reviews_section(uuid) is
	'True for an admin, the section''s teacher of record, OR an address holding a notebook_section_reviewers row for this section (0169). Notebook REVIEW only. NEVER a substitute for classroom_manages_section() or is_admin().';

-- Named in RLS policies below, where a function is evaluated as the QUERYING
-- role -- so `authenticated` must hold EXECUTE (the 0070/0109 lesson).
revoke all on function public.notebook_reviews_section(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.notebook_reviews_section(uuid) to authenticated;

-- May the CALLER open this student's whole notebook? The 0106 manage rule
-- folded in, plus: the caller reviews a section this student is ACTIVELY
-- enrolled in. Same active-enrollment scope as the manage rule, deliberately
-- -- a reviewer's reach over a student ends when the enrollment does.
-- `current_user_email()` returns '' with no session; '' can never match a
-- roster row (the CHECK requires an @), so this fails closed the same way
-- the manage helper does.
create or replace function public._notebook_reviews_student_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select public._notebook_manages_student_email(p_email) or exists (
		select 1
		from public.classroom_enrollments ce
		join public.notebook_section_reviewers r on r.section_id = ce.section_id
		where ce.student_email = lower(btrim(coalesce(p_email, '')))
			and btrim(coalesce(p_email, '')) <> ''
			and ce.active
			and r.email = public.current_user_email()
	);
$$;

-- GRANTED TO NOBODY: its one caller is notebook_review_student_notebook,
-- which is SECURITY DEFINER. A grant to `authenticated` would hand any
-- signed-in caller a way to probe whether an arbitrary address is reviewable.
revoke all on function public._notebook_reviews_student_email(text)
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Managing the roster. Admin-gated inside the function bodies.
-- ---------------------------------------------------------------------------

create or replace function public.notebook_reviewer_grant(
	p_section_id uuid,
	p_email text,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
begin
	if not public.is_admin() then
		raise exception 'Only site admins can grant notebook section review.';
	end if;
	if p_section_id is null or not exists (
		select 1 from public.classroom_sections s where s.id = p_section_id
	) then
		raise exception 'That section does not exist.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid email address.';
	end if;
	-- 0155's rule, not 0167's: reviewing student notebooks is a STAFF act,
	-- and a .net grant would put a student account over classmates' work.
	if v_email not like '%@boscotech.edu' then
		raise exception 'Notebook section review is limited to @boscotech.edu accounts (got "%").', v_email;
	end if;

	insert into public.notebook_section_reviewers (section_id, email, granted_by, note)
	values (p_section_id, v_email, public.current_user_email(), nullif(btrim(coalesce(p_note, '')), ''))
	on conflict (section_id, email) do update
		set granted_by = excluded.granted_by,
			granted_at = now(),
			note = coalesce(excluded.note, public.notebook_section_reviewers.note);

	return jsonb_build_object('section_id', p_section_id, 'email', v_email, 'granted', true);
end;
$$;

create or replace function public.notebook_reviewer_revoke(p_section_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
begin
	if not public.is_admin() then
		raise exception 'Only site admins can revoke notebook section review.';
	end if;
	-- An admin's or teacher of record's reviewing comes from
	-- classroom_manages_section() inside notebook_reviews_section(), never
	-- from a row, so emptying this table cannot remove either's access.
	delete from public.notebook_section_reviewers
	where section_id = p_section_id and email = v_email;
	return jsonb_build_object('section_id', p_section_id, 'email', v_email, 'revoked', true);
end;
$$;

-- The roster, for an admin surface. The gate is a WHERE clause inside the
-- definer body, so a non-admin gets an empty set rather than an error, which
-- is the same answer an empty roster gives. Null section = every section.
create or replace function public.notebook_reviewer_roster(p_section_id uuid default null)
returns table (section_id uuid, email text, granted_by text, granted_at timestamptz, note text)
language sql
stable
security definer
set search_path = ''
as $$
	select r.section_id, r.email, r.granted_by, r.granted_at, r.note
	from public.notebook_section_reviewers r
	where public.is_admin()
		and (p_section_id is null or r.section_id = p_section_id)
	order by r.section_id, r.email;
$$;

revoke all on function public.notebook_reviewer_grant(uuid, text, text)
	from public, anon, authenticated, service_role;
revoke all on function public.notebook_reviewer_revoke(uuid, text)
	from public, anon, authenticated, service_role;
revoke all on function public.notebook_reviewer_roster(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.notebook_reviewer_grant(uuid, text, text) to authenticated;
grant execute on function public.notebook_reviewer_revoke(uuid, text) to authenticated;
grant execute on function public.notebook_reviewer_roster(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The CALLER's own reviewed sections, with the labels the review page
-- needs. This exists because classroom_sections is readable only to members
-- and managers (0082), and a reviewer is neither -- without it the review
-- page could authorize a section it could not NAME. Takes NO identity
-- parameter (the signature rule: "only their own grants" is a property of
-- the signature, not a check). A caller with no grants, or no session,
-- gets an empty set. Projects section METADATA only -- label, block, teacher
-- of record, course -- never a roster and never student work; those stay
-- behind the per-site gates in section 5.
-- ---------------------------------------------------------------------------

create or replace function public.notebook_reviewed_sections()
returns table (section_id uuid, label text, block text, teacher_email text, course_code text, course_title text)
language sql
stable
security definer
set search_path = ''
as $$
	select s.id, s.label, s.block, s.teacher_email, c.code, c.title
	from public.notebook_section_reviewers r
	join public.classroom_sections s on s.id = r.section_id
	join public.classroom_courses c on c.id = s.course_id
	where (select auth.uid()) is not null
		and r.email = public.current_user_email()
	order by s.label;
$$;

comment on function public.notebook_reviewed_sections() is
	'The CALLER''s own notebook reviewer grants with section labels (0169). Deliberately parameterless; empty set for everyone else. Section metadata only, never student data.';

revoke all on function public.notebook_reviewed_sections()
	from public, anon, authenticated, service_role;
grant execute on function public.notebook_reviewed_sections() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. THE RE-GATE. Exactly nine live sites, each recreated from its LATEST
-- applied definition with ONE predicate call swapped -- and, where the old
-- refusal sentence named the tiers, the sentence extended to name this one,
-- because a refused co-teacher must learn what grant would fix it. Section 6
-- is the census. Every block below was extracted mechanically from its
-- source file (0140, 0118, 0121, 0106, 0098) with the substitution asserted
-- to occur exactly once, and the test diffs prosrc before/after to prove the
-- transcription byte-faithful.
--
-- NO SIGNATURE TRAP HERE: every function keeps its exact signature, so
-- `create or replace` is the correct instrument and no overload can survive.
-- The self-check asserts pg_proc holds exactly one row per name anyway.
-- ---------------------------------------------------------------------------

-- 5a. 0140's grid, the review console's one section read.
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
	-- TODAY, ON THE CALENDAR `session_date` IS WRITTEN IN. Read ONCE, so every
	-- cell in one payload is adjudicated against the same day -- a per-cell
	-- `now()` is stable inside a transaction anyway, but a single value is what
	-- makes that a property of the code rather than of the isolation level.
	v_today date := (pg_catalog.now() at time zone 'America/Los_Angeles')::date;
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
	if not public.notebook_reviews_section(p_section_id) then
		raise exception 'Only the section instructor, a section reviewer, or a site admin can view the notebook grid.';
	end if;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', ss.id,
			'unit_number', ss.unit_number,
			'session_date', ss.session_date,
			'session_label', ss.session_label,
			'section_ids', to_jsonb(public._notebook_session_sections(ss.id))
		) order by ss.session_date, ss.unit_number, ss.session_label, ss.id), '[]'::jsonb)
	into v_sessions
	from public.notebook_sessions ss
	join public.notebook_session_postings pg on pg.session_id = ss.id
	where pg.section_id = p_section_id
		and (p_unit_number is null or ss.unit_number = p_unit_number);

	-- READ 1: the free-entry count, now beside the number that is ACTIONABLE.
	-- `free_entries_unreviewed` is a second count over the same rows rather than
	-- a subtraction the caller performs, so the two can never be computed from
	-- different snapshots.
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
					and e.deleted_at is null
					and e.submitted_at is not null
			),
			'free_entries_unreviewed', (
				select count(*)
				from public.notebook_entries e
				where e.student_id = r.student_id
					and e.section_id = p_section_id
					and e.session_id is null
					and e.deleted_at is null
					and e.submitted_at is not null
					and e.reviewed_at is null
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
		join public.notebook_session_postings pg on pg.session_id = ss.id
		where pg.section_id = p_section_id
			and (p_unit_number is null or ss.unit_number = p_unit_number)
	),
	latest as (
		-- READ 2. SCOPED TO THIS SECTION, which the single-section model got for
		-- free: a check-in shared with another class also holds that class's
		-- entries, and they belong on that class's grid, not this one.
		--
		-- `reviewed_at` joins the projection; the ORDER BY is untouched, so which
		-- entry wins the cell is exactly what it was. Picking the reviewed one
		-- over the newest would hide the student's latest work behind an older
		-- acknowledgement.
		select distinct on (e.session_id, e.student_id)
			e.session_id, e.student_id, e.id, e.status, e.flag_reason, e.upload_timestamp,
			e.reviewed_at
		from public.notebook_entries e
		where e.session_id in (select id from sess)
			and e.section_id = p_section_id
			and e.deleted_at is null
			and e.submitted_at is not null
		order by e.session_id, e.student_id, e.upload_timestamp desc, e.id desc
	),
	counts as (
		-- READ 3: the multi-entry badge, and how much of it is still outstanding.
		select e.session_id, e.student_id,
			count(*) as n,
			count(*) filter (where e.reviewed_at is null) as n_unreviewed
		from public.notebook_entries e
		where e.session_id in (select id from sess)
			and e.section_id = p_section_id
			and e.deleted_at is null
			and e.submitted_at is not null
		group by e.session_id, e.student_id
	)
	select coalesce(jsonb_agg(jsonb_build_object(
			'student_key', r.student_key,
			'student_id', r.student_id,
			'session_id', se.id,
			-- THE ORDER IS THE RULE, AND EVERY ARM ABOVE `scheduled` OUTRANKS IT
			-- FOR A STATED REASON.
			--
			-- An ENTRY wins, because a student who filed early has filed it, and
			-- reporting "not due yet" over their own work would be telling them
			-- the page did not count -- the same argument that already puts an
			-- entry above an excusal on this cell.
			--
			-- An EXCUSAL wins, because it is a decision an instructor made about
			-- this student on this day; a field trip excused three weeks ahead is
			-- a record worth keeping on screen, and neither state counts against
			-- anybody, so nothing is lost by showing the one somebody chose.
			--
			-- Everything left is a cell with nothing in it, and the date decides:
			-- a day that has not arrived is `scheduled`, and only a day that HAS
			-- arrived with nothing filed is `missing`.
			'status', case
				when l.id is not null then l.status
				when x.session_id is not null then 'excused'
				when se.session_date > v_today then 'scheduled'
				else 'missing'
			end,
			'entry_id', l.id,
			'entry_count', coalesce(c.n, 0),
			'unreviewed_count', coalesce(c.n_unreviewed, 0),
			'upload_timestamp', l.upload_timestamp,
			'on_time', case
				when l.id is null then null
				else ((l.upload_timestamp at time zone 'America/Los_Angeles')::date <= se.session_date)
			end,
			'reviewed', case
				when l.id is null then null
				else (l.reviewed_at is not null)
			end,
			'reviewed_at', l.reviewed_at,
			'excused', (x.session_id is not null),
			'flag_reason', l.flag_reason
		) order by r.name, r.student_key, se.session_date, se.unit_number, se.session_label, se.id), '[]'::jsonb)
	into v_cells
	from roster r
	cross join sess se
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

revoke all on function public.notebook_get_section_grid(uuid, int)
	from public, anon, authenticated, service_role;
grant execute on function public.notebook_get_section_grid(uuid, int) to authenticated;

-- 5b. 0118's flag verdict.
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
	v_submitted timestamptz;
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

	select e.section_id, e.submitted_at into v_section, v_submitted
	from public.notebook_entries e
	where e.id = p_entry_id
	for update;
	if not found then
		raise exception 'That entry does not exist.';
	end if;
	if not public.notebook_reviews_section(v_section) then
		raise exception 'Only the section instructor, a section reviewer, or a site admin can flag notebook entries.';
	end if;
	if v_submitted is null then
		raise exception 'That entry has not been turned in yet, so there is nothing to review.';
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

revoke all on function public.notebook_flag_entry(uuid, text, text)
	from public, anon, authenticated, service_role;
grant execute on function public.notebook_flag_entry(uuid, text, text) to authenticated;

-- 5c. 0118's resolve verdict.
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
	v_submitted timestamptz;
	v_comment text := nullif(btrim(coalesce(p_instructor_comment, '')), '');
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select e.section_id, e.submitted_at into v_section, v_submitted
	from public.notebook_entries e
	where e.id = p_entry_id
	for update;
	if not found then
		raise exception 'That entry does not exist.';
	end if;
	if not public.notebook_reviews_section(v_section) then
		raise exception 'Only the section instructor, a section reviewer, or a site admin can resolve notebook entries.';
	end if;
	if v_submitted is null then
		raise exception 'That entry has not been turned in yet, so there is nothing to review.';
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

revoke all on function public.notebook_resolve_entry(uuid, text)
	from public, anon, authenticated, service_role;
grant execute on function public.notebook_resolve_entry(uuid, text) to authenticated;

-- 5d. 0121's acknowledgement.
create or replace function public.notebook_accept_entry(p_entry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_entry public.notebook_entries%rowtype;
	v_reviewed_at timestamptz;
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
	if not found then
		raise exception 'That entry does not exist.';
	end if;
	if not public.notebook_reviews_section(v_entry.section_id) then
		raise exception 'Only the section instructor, a section reviewer, or a site admin can review notebook entries.';
	end if;
	if v_entry.deleted_at is not null then
		raise exception 'That entry has been deleted, so there is nothing to review.';
	end if;
	if v_entry.submitted_at is null then
		raise exception 'That entry has not been turned in yet, so there is nothing to review.';
	end if;

	-- TWO COLUMNS, AND ONLY TWO. status, flag_reason and instructor_comment are
	-- not named here and must never be: accepting a flagged entry records that
	-- the flag was looked at again, it does not withdraw the flag.
	-- notebook_resolve_entry is what withdraws a flag.
	update public.notebook_entries e
	set reviewed_by = v_uid,
		reviewed_at = now()
	where e.id = p_entry_id
	returning e.reviewed_at into v_reviewed_at;

	return jsonb_build_object(
		'ok', true,
		'entry_id', p_entry_id,
		'status', v_entry.status,
		'reviewed_at', v_reviewed_at
	);
end;
$$;

revoke all on function public.notebook_accept_entry(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.notebook_accept_entry(uuid) to authenticated;

-- 5e. 0121's take-it-back.
create or replace function public.notebook_unaccept_entry(p_entry_id uuid)
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
	where e.id = p_entry_id
	for update;
	if not found then
		raise exception 'That entry does not exist.';
	end if;
	if not public.notebook_reviews_section(v_entry.section_id) then
		raise exception 'Only the section instructor, a section reviewer, or a site admin can review notebook entries.';
	end if;
	if v_entry.deleted_at is not null then
		raise exception 'That entry has been deleted, so there is nothing to review.';
	end if;
	if v_entry.submitted_at is null then
		raise exception 'That entry has not been turned in yet, so there is nothing to review.';
	end if;
	if v_entry.status = 'flagged' then
		raise exception 'That entry is flagged, so it cannot be marked unreviewed. Resolve the flag instead.';
	end if;

	update public.notebook_entries e
	set reviewed_by = null,
		reviewed_at = null
	where e.id = p_entry_id;

	return jsonb_build_object(
		'ok', true,
		'entry_id', p_entry_id,
		'status', v_entry.status,
		'reviewed_at', null
	);
end;
$$;

revoke all on function public.notebook_unaccept_entry(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.notebook_unaccept_entry(uuid) to authenticated;

-- 5f. 0118's entry-visibility predicate. Notes, photos and folders all
-- delegate to it (their policies call it by name), so this ONE swap is what
-- lets a reviewer read a submitted entry's notes and photos -- the
-- delegation rule doing its job. The student's own branch and the
-- notebook_manages_student branch are untouched, and drafts stay invisible:
-- the staff arm still requires `submitted_at is not null`.
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
				or (
					e.submitted_at is not null
					and (
						public.notebook_reviews_section(e.section_id)
						or public.notebook_manages_student(e.student_id)
					)
				)
			)
	);
$$;

revoke all on function public.notebook_can_read_entry(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.notebook_can_read_entry(uuid) to authenticated;

-- 5g. 0106's per-student notebook read, onto the new student-scoped helper
-- (section 2). The payload helper `_notebook_student_payload` is untouched.
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
	if not public._notebook_reviews_student_email(v_email) then
		raise exception 'Only an instructor or reviewer of one of this student''s classes, or a site admin, can open their notebook.';
	end if;

	return public._notebook_student_payload(v_email);
end;
$$;

revoke all on function public.notebook_review_student_notebook(text)
	from public, anon, authenticated, service_role;
grant execute on function public.notebook_review_student_notebook(text) to authenticated;

-- 5h. 0118's staff read of entries. The `notebook_manages_student` arm is
-- untouched (and deliberately NOT widened -- see the header); the
-- `submitted_at is not null` draft boundary is untouched.
drop policy if exists "section staff read notebook entries" on public.notebook_entries;
create policy "section staff read notebook entries"
	on public.notebook_entries
	for select
	to authenticated
	using (
		submitted_at is not null
		and (
			public.notebook_reviews_section(section_id)
			or public.notebook_manages_student(student_id)
		)
	);

-- 5i. 0098's excusal read. A reviewer may KNOW who is excused -- the grid
-- already tells them, through the definer RPC -- so this keeps the detail
-- read from disagreeing with the grid. SETTING an excusal stays admin-only
-- (notebook_admin_set_excusal, untouched).
drop policy if exists "notebook excusals visible to subject and staff" on public.notebook_session_excusals;
create policy "notebook excusals visible to subject and staff"
	on public.notebook_session_excusals
	for select
	to authenticated
	using (
		student_id = (select auth.uid())
		or exists (
			select 1
			from public.notebook_session_postings pg
			where pg.session_id = notebook_session_excusals.session_id
				and public.notebook_reviews_section(pg.section_id)
		)
	);

-- ---------------------------------------------------------------------------
-- 6. THE CENSUS. Every notebook staff gate, and whether this tier passes it.
-- The SHUT list is as load-bearing as the open one.
--
-- OPEN (section 5, nine sites):
--   0140  notebook_get_section_grid            the compliance grid
--   0118  notebook_flag_entry                  flag verdict
--   0118  notebook_resolve_entry               resolve verdict
--   0121  notebook_accept_entry                acknowledgement
--   0121  notebook_unaccept_entry              its undo
--   0118  notebook_can_read_entry              entry visibility (notes,
--         photos and folders follow by delegation)
--   0106  notebook_review_student_notebook     one student's whole notebook
--   0118  "section staff read notebook entries"   the entry select
--   0098  "notebook excusals visible to subject and staff"   excusal READS
--
-- SHUT, and why each one stays shut:
--
--   CHECK-IN MANAGEMENT: notebook_admin_upsert_session,
--   notebook_admin_delete_session, notebook_add_session_postings,
--   notebook_remove_session_posting, notebook_set_session_guidance, and the
--   helpers _notebook_manages_session / _notebook_check_session_targets.
--         Authoring the section's requirements -- what every student owes and
--         when -- is the teacher of record's, not a reviewer's. Review reads
--         and judges work; it does not define it.
--
--   DOCUMENTATION CHECK LINKS: notebook_link_unit_item,
--   notebook_unlink_unit_item, notebook_link_session_item,
--   notebook_unlink_session_item, and the notebook_unit_items read policy.
--         The linking writes section structure and the panel exists to GRADE
--         (classroom_set_rubric / classroom_grade_submission sit behind it),
--         and classroom grading is exactly what this bundle must not widen.
--
--   STAFF DELETION AND RESTORE: notebook_staff_delete_entry,
--   notebook_staff_delete_note, notebook_staff_restore_entry,
--   notebook_staff_restore_note -- and therefore
--   _notebook_manages_student_email / notebook_manages_student, which gate
--   them and are NOT redefined.
--         Removing student work is moderation, not review. Deletion is on
--         0067's list of what the admin narrowing was FOR, and the tier
--         below may not reach an item on that list as a side effect.
--
--   ADMIN-ONLY, UNCHANGED: notebook_admin_set_excusal,
--   notebook_admin_override_entry, the notebook_admin_log read policy,
--   notebook_view_as_notebook.
--         All four were admin-only before this file -- the teacher of record
--         does not hold them either -- and a tier below the teacher of
--         record cannot hold what the teacher of record does not.
--
--   EVERYTHING CLASSROOM: _classroom_manages_section_email,
--   classroom_manages_section, classroom_section_roster, every classroom
--   policy and RPC.
--         The task boundary. A notebook reviewer gains no classroom surface:
--         not grading, not posting, not the People tab, not enrollment
--         removal. The self-check asserts the shared predicate is unchanged.
--
--   THE ROSTER PROJECTION: _notebook_section_roster still asks "manages"
--   for its exclusion flag, so a reviewer who is ALSO swept onto the
--   section's roster as a student still shows as a student row in the grid.
--         Named limitation, not an accident: teaching the exclusion rule
--         about reviewers is a 0138-shaped decision for a bundle that has a
--         real case in front of it.
--
-- ---------------------------------------------------------------------------
-- 7. Self-check. Reads the catalog back rather than trusting the statements
-- above: the ACL, pg_proc and pg_policy, not the verdict.
-- ---------------------------------------------------------------------------

do $chk$
declare
	v_anon boolean;
	v_auth boolean;
	v_n int;
	v_rows int;
begin
	-- The predicate is reachable by a signed-in caller and by nobody else.
	select has_function_privilege('anon', 'public.notebook_reviews_section(uuid)', 'execute'),
		has_function_privilege('authenticated', 'public.notebook_reviews_section(uuid)', 'execute')
		into v_anon, v_auth;
	if v_anon then
		raise exception '0169: notebook_reviews_section() is executable by anon. The revoke did not name the roles (the 0137 rule).';
	end if;
	if not v_auth then
		raise exception '0169: notebook_reviews_section() is NOT executable by authenticated; both re-gated policies would fail closed for everyone.';
	end if;

	-- The student-scoped helper is granted to NOBODY.
	if has_function_privilege('anon', 'public._notebook_reviews_student_email(text)', 'execute')
		or has_function_privilege('authenticated', 'public._notebook_reviews_student_email(text)', 'execute') then
		raise exception '0169: _notebook_reviews_student_email() is client-executable -- it must be reachable only through the definer RPC.';
	end if;

	-- The roster RPCs and the caller's-own-sections read: authenticated only.
	if has_function_privilege('anon', 'public.notebook_reviewer_grant(uuid, text, text)', 'execute')
		or has_function_privilege('anon', 'public.notebook_reviewer_revoke(uuid, text)', 'execute')
		or has_function_privilege('anon', 'public.notebook_reviewer_roster(uuid)', 'execute')
		or has_function_privilege('anon', 'public.notebook_reviewed_sections()', 'execute') then
		raise exception '0169: a reviewer-tier function is executable by anon -- a revoke did not land.';
	end if;

	-- NO OVERLOADS: exactly one pg_proc row per touched function name.
	select count(*) into v_n
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname in (
		'notebook_get_section_grid', 'notebook_flag_entry', 'notebook_resolve_entry',
		'notebook_accept_entry', 'notebook_unaccept_entry', 'notebook_can_read_entry',
		'notebook_review_student_notebook', 'notebook_reviews_section',
		'_notebook_reviews_student_email', 'notebook_reviewer_grant',
		'notebook_reviewer_revoke', 'notebook_reviewer_roster', 'notebook_reviewed_sections');
	if v_n <> 13 then
		raise exception '0169: expected exactly 13 pg_proc rows across the touched names, found % -- an overload survived and the wrong arity may still answer.', v_n;
	end if;

	-- The six directly re-gated functions carry the new predicate and no
	-- longer name the old one.
	select count(*) into v_n
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
		and p.proname in ('notebook_get_section_grid', 'notebook_flag_entry',
			'notebook_resolve_entry', 'notebook_accept_entry', 'notebook_unaccept_entry',
			'notebook_can_read_entry')
		and p.prosrc like '%notebook_reviews_section(%'
		and p.prosrc not like '%classroom_manages_section(%';
	if v_n <> 6 then
		raise exception '0169: expected all 6 re-gated functions on notebook_reviews_section() with classroom_manages_section() gone, found % qualifying.', v_n;
	end if;

	-- notebook_can_read_entry kept its second staff arm: the widening must
	-- not have COST anything (a transcription that dropped a term would still
	-- pass the check above).
	select count(*) into v_n
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'notebook_can_read_entry'
		and p.prosrc like '%notebook_manages_student(%';
	if v_n <> 1 then
		raise exception '0169: notebook_can_read_entry lost its notebook_manages_student arm.';
	end if;

	-- The student-notebook read moved to the new helper and off the old one.
	select count(*) into v_n
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'notebook_review_student_notebook'
		and p.prosrc like '%_notebook_reviews_student_email(%'
		and p.prosrc not like '%_notebook_manages_student_email(%';
	if v_n <> 1 then
		raise exception '0169: notebook_review_student_notebook is not gated on _notebook_reviews_student_email().';
	end if;

	-- The two re-created policies carry the new predicate, and the entries
	-- policy kept BOTH its draft boundary and its manages-student arm.
	select count(*) into v_n
	from pg_policy pol
	where pol.polname = 'section staff read notebook entries'
		and pg_get_expr(pol.polqual, pol.polrelid) like '%notebook_reviews_section%'
		and pg_get_expr(pol.polqual, pol.polrelid) like '%notebook_manages_student%'
		and pg_get_expr(pol.polqual, pol.polrelid) like '%submitted_at IS NOT NULL%';
	if v_n <> 1 then
		raise exception '0169: the notebook_entries staff read policy is not in its expected re-gated state.';
	end if;
	select count(*) into v_n
	from pg_policy pol
	where pol.polname = 'notebook excusals visible to subject and staff'
		and pg_get_expr(pol.polqual, pol.polrelid) like '%notebook_reviews_section%';
	if v_n <> 1 then
		raise exception '0169: the excusal read policy does not carry notebook_reviews_section().';
	end if;

	-- THE NEGATIVE HALF, which is the point of the census.
	-- The shared classroom predicate is untouched by this file.
	select count(*) into v_n
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
		and p.proname in ('_classroom_manages_section_email', 'classroom_manages_section')
		and p.prosrc like '%notebook_section_reviewers%';
	if v_n <> 0 then
		raise exception '0169: the shared classroom manage predicate names the reviewer table. That widening is exactly what this file must not do.';
	end if;

	-- The unwidened student-manage helper does not know the table either.
	select count(*) into v_n
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
		and p.proname in ('_notebook_manages_student_email', 'notebook_manages_student')
		and (p.prosrc like '%notebook_section_reviewers%' or p.prosrc like '%notebook_reviews_section%');
	if v_n <> 0 then
		raise exception '0169: the manage-a-student helper has been widened -- staff deletion would follow. It must stay on the 0106 rule.';
	end if;

	-- No shut site picked up the reviewer predicate. The positive controls
	-- above prove the LIKE patterns genuinely match, so a zero here is a
	-- real absence rather than a misspelled sweep.
	select count(*) into v_n
	from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
		and p.proname in ('notebook_admin_upsert_session', 'notebook_admin_delete_session',
			'notebook_add_session_postings', 'notebook_remove_session_posting',
			'notebook_set_session_guidance', '_notebook_manages_session',
			'notebook_link_unit_item', 'notebook_unlink_unit_item',
			'notebook_link_session_item', 'notebook_unlink_session_item',
			'notebook_staff_delete_entry', 'notebook_staff_delete_note',
			'notebook_staff_restore_entry', 'notebook_staff_restore_note',
			'notebook_admin_set_excusal', 'notebook_admin_override_entry')
		and (p.prosrc like '%notebook_reviews_section%' or p.prosrc like '%notebook_section_reviewers%');
	if v_n <> 0 then
		raise exception '0169: % shut site(s) now name the reviewer tier. The tier has widened a gate it must not reach.', v_n;
	end if;

	-- The roster table itself: no client write path of any kind.
	if has_table_privilege('authenticated', 'public.notebook_section_reviewers', 'insert')
		or has_table_privilege('authenticated', 'public.notebook_section_reviewers', 'update')
		or has_table_privilege('authenticated', 'public.notebook_section_reviewers', 'delete')
		or has_table_privilege('anon', 'public.notebook_section_reviewers', 'select') then
		raise exception '0169: notebook_section_reviewers carries a client grant it must not.';
	end if;

	select count(*) into v_rows from public.notebook_section_reviewers;
	raise notice '0169 APPLIED: notebook_section_reviewers holds % row(s) (no seed -- grant by hand via notebook_reviewer_grant); 7 functions and 2 policies re-gated onto the reviewer tier; the classroom manage predicate, the student-manage helper, check-in management, doc-check links, staff deletion and the admin-only actions verified unchanged.', v_rows;
end;
$chk$;

-- ---------------------------------------------------------------------------
-- 8. GRANTING A REVIEWER (for whoever applies this). The RPCs check
-- `is_admin()`, which reads the session's JWT claims -- so in the SQL editor,
-- where there is no JWT, `notebook_reviewer_grant` RAISES ('Only site
-- admins...'). Same state 0155 and 0167 shipped in. Two working paths:
--
--   * From the SQL editor (the editor role owns the table and bypasses RLS),
--     write the row directly, normalized the way the RPC would. Find the
--     section id first:
--       select s.id, s.label, s.block, c.code, s.teacher_email
--       from public.classroom_sections s
--       join public.classroom_courses c on c.id = s.course_id
--       order by c.code, s.label;
--     then:
--       insert into public.notebook_section_reviewers (section_id, email, note)
--       values ('<section uuid>', lower(btrim('Someone@boscotech.edu')), 'co-teacher')
--       on conflict (section_id, email) do nothing;
--     and to undo one grant:
--       delete from public.notebook_section_reviewers
--       where section_id = '<section uuid>' and email = 'someone@boscotech.edu';
--   * From the app, a signed-in ADMIN can call the RPCs through PostgREST
--     (supabase.rpc('notebook_reviewer_grant', ...)); no UI surface calls
--     them yet.
--
-- ---------------------------------------------------------------------------
-- 9. WHAT UNDOES THIS.
--
-- Fast revert: `delete from public.notebook_section_reviewers;` empties the
-- tier in one statement -- notebook_reviews_section() then answers exactly as
-- classroom_manages_section() does, every re-gated site behaves as it did
-- before this file, and the roster is re-grantable later.
--
-- Full revert, in this order (the policies first: an applied policy records
-- a real dependency on every function its expression names, so the function
-- drops would otherwise be refused):
--   1. Re-paste 0118's "section staff read notebook entries" policy and
--      0098's "notebook excusals visible to subject and staff" policy
--      (their latest statements).
--   2. Re-paste 0118's notebook_flag_entry, notebook_resolve_entry and
--      notebook_can_read_entry; 0121's notebook_accept_entry and
--      notebook_unaccept_entry; 0140's notebook_get_section_grid; 0106's
--      notebook_review_student_notebook. (Each replace preserves this
--      file's authenticated-only ACL, so anon does not come back.)
--   3. drop function public.notebook_reviewed_sections();
--      drop function public.notebook_reviewer_roster(uuid);
--      drop function public.notebook_reviewer_revoke(uuid, text);
--      drop function public.notebook_reviewer_grant(uuid, text, text);
--      drop function public._notebook_reviews_student_email(text);
--      drop function public.notebook_reviews_section(uuid);
--      drop table public.notebook_section_reviewers;
-- ---------------------------------------------------------------------------
