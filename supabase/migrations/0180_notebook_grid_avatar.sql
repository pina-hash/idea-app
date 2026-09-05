-- 0180_notebook_grid_avatar.sql
-- Digital notebook, INSTRUCTOR review: the section grid's roster projects a
-- person's AVATAR beside the name it already returns, so a face can be
-- rendered wherever that name is -- the check-in grid's row header, the
-- entry review panel, and the empty-cell panel beside it.
--
-- Apply manually in the Supabase SQL editor.
--
-- ---------------------------------------------------------------------------
-- WHY A MIGRATION AT ALL, AND WHY 0179 DID NOT ALREADY DO THIS
--
-- 0179 widened `classroom_section_roster`, which is the CLASSROOM roster read.
-- The notebook review console does not call it and never has: since 0094 its
-- roster is `_notebook_section_roster`, a different function with a different
-- population (the section's active enrollments UNION anyone holding submitted
-- entries or excusals in it, so a student who left mid-term keeps the work
-- they filed). `notebook_get_section_grid` is its only caller and builds the
-- `students` array the three surfaces render. So the two are a second RPC
-- family, not a second call to the first, and 0179's projection is genuinely
-- unreachable from here. Measured in tests/db/avatar-notebook-grid.test.ts.
--
-- THE JOIN IS ALREADY THERE, which is what makes this small.
-- `_notebook_section_roster` already `left join public.profiles p on
-- p.id = c.student_id` -- that is where the roster's `name` and `email`
-- fallbacks come from. This adds two columns off a row the function already
-- has in hand; it opens no new table, adds no join and asks no new predicate.
--
-- WHAT THIS DISCLOSES, STATED AS A DISCLOSURE AND NOT AS A FIELD ADDITION
-- (CLAUDE.md: widening a payload is a disclosure decision):
--
--   * TO WHOM: exactly the callers who already read this grid, and the
--     predicate is UNCHANGED -- `notebook_reviews_section(p_section_id)`
--     raises at the top of `notebook_get_section_grid` for anybody else. That
--     is the section instructor, a section REVIEWER (0169, which
--     `notebook_reviewer_grant` locks to @boscotech.edu, the STAFF domain by
--     `role_for_email`), or a site admin. No new gate, no widened gate, no
--     second authorization model. A student calling this still raises.
--   * WHAT: two columns, `avatar` and `avatar_url`, and nothing else off
--     `profiles`. NOT `pathway`, NOT `role`, NOT `section_id`, NOT
--     `preferences`, NOT `tour_completed_at`, NOT `email` beyond the address
--     the roster already coalesces. A face and a fallback photo are what the
--     surfaces asked for; every other column on that table is a separate
--     decision and none of them is made here.
--   * AGAINST WHAT IT IS MEASURED: the same audience already reads `name` and
--     `email` out of this very function. An avatar is no wider than the name
--     it sits beside, which is the only test this projection is meant to pass.
--
-- THE BUCKET BEING PUBLIC IS THE FACT THAT MAKES THIS SMALL AND IT IS THE ONE
-- WORTH REPEATING. `avatars` is a PUBLIC bucket (0020) and `avatarUploadUrl`
-- builds an unsigned, unexpiring URL from a stored path, so the BYTES need
-- nothing from the database and anyone holding a path can already fetch them
-- with no session at all. What is not reachable is the PATH: it lives in
-- `profiles.avatar`, and `profiles` is own-row-or-admin -- "teachers select
-- all profiles" (0001) reads `is_teacher()`, which 0067 redefined to
-- `is_admin()`. So an instructor of record, who is not an admin, genuinely
-- cannot read one student's `avatar` column, and no client-side rearrangement
-- changes that. If the bucket is ever made private this projection keeps
-- working (the path is still the path) and it is `avatarUploadUrl` that has
-- to learn to sign -- one place, not this one.
--
-- A NULL IS AN ORDINARY ANSWER AT EVERY STEP, and there are three ways to get
-- one: the student is on the roster and has never signed in (no `auth.users`
-- row, so `_notebook_user_id_for_email` answers null and the LEFT join to
-- `profiles` finds nothing); they have signed in but chose no picture and
-- Google gave none; or the address on the roster is not the one on the
-- account. Every one renders as an initials tile, which is the COMMON case
-- rather than an error state -- so nothing here raises, and nothing filters a
-- row out for want of a face.
--
-- ---------------------------------------------------------------------------
-- THE SIGNATURE TRAP: THE DROP IS REQUIRED ON THE HELPER AND FORBIDDEN ON THE
-- GRID, AND THE DIFFERENCE IS THE RETURN TYPE
--
--   * `_notebook_section_roster` changes its RETURNS TABLE, which
--     `create or replace` cannot do (Postgres refuses with "cannot change
--     return type of existing function"), so it is dropped at its exact
--     argument list first. That also keeps this file re-appliable over a
--     database that took an earlier draft.
--   * `notebook_get_section_grid` returns `jsonb` before and after -- only the
--     KEYS inside it move -- so `create or replace` is correct there and a
--     drop would only put its grants at risk for no reason.
--
-- DROPPING THE HELPER UNDER ITS CALLER IS SAFE AND IS CHECKED RATHER THAN
-- ASSUMED. Postgres records no dependency from one plpgsql body to another, so
-- the drop succeeds silently and the caller resolves the name again at its
-- next invocation -- which is exactly why CLAUDE.md says a migration that
-- drops a plpgsql function carries its own caller guard. The sweep at the
-- bottom of this file is that guard: it re-creates BOTH halves, so every
-- caller of the helper is re-signed in the same statement, and then reads
-- `pg_proc.prosrc` back to confirm no OTHER body still calls it.
--
-- IT IS NOT THE DEPLOY-ORDERING CASE. Neither ARGUMENT list changes
-- (`_notebook_section_roster(uuid)`, `notebook_get_section_grid(uuid, int)`),
-- so every deployed client keeps calling the same signature; the grid returns
-- jsonb and a client that does not know the two new keys simply does not read
-- them. `GridStudent` marks both optional for the same reason every other
-- migration-dependent field on it is optional: absent means "this database
-- cannot answer that", which renders as an initials tile -- the identical
-- pixels as "chose no picture". So the migration and the deploy are
-- independent events and either may go first.
--
-- WHY THERE IS NO CAPABILITY FLAG. Every select ladder in this repository
-- reports itself (`notesReady`, `foldersReady`) because a missing column costs
-- a feature. Here it costs nothing a viewer can see: absent columns and "chose
-- no picture" render the identical tile, so a flag would turn off a control
-- that does not exist and would say "unavailable" about the state most people
-- are in anyway.
--
-- WHAT UNDOES IT: re-apply the 0138 definition of
-- `_notebook_section_roster` verbatim (that file's section 2), then the 0169
-- definition of `notebook_get_section_grid` verbatim (that file's section 5),
-- then re-apply `0137_anon_execute_sweep.sql`. Nothing else in this file has
-- any other effect; no table, column, policy or grant is otherwise touched.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The grid's roster, 0138's definition VERBATIM apart from two columns in
--    the RETURNS TABLE and two expressions in the final select, both read off
--    the `profiles` row the function already left-joins. The base was diffed
--    against 0138 to confirm nothing else moved.
-- ---------------------------------------------------------------------------

drop function if exists public._notebook_section_roster(uuid);

create or replace function public._notebook_section_roster(p_section_id uuid)
returns table (
	student_key text,
	student_id uuid,
	email text,
	name text,
	enrolled boolean,
	-- 0180. Read off the `profiles` row the final select already
	-- left-joins for `name` and `email`; null wherever that join found
	-- nothing, which is the ordinary case.
	avatar text,
	avatar_url text
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
			and not public._classroom_manages_section_email(p_section_id, ce.student_email)
	),
	holders as (
		select
			p.id as student_id,
			public._notebook_email_for_user(p.id) as email
		from public.profiles p
		where exists (
				select 1 from public.notebook_entries e
				where e.student_id = p.id
					and e.section_id = p_section_id
					and e.deleted_at is null
					and e.submitted_at is not null
			)
			or exists (
				select 1
				from public.notebook_session_excusals x
				join public.notebook_session_postings pg on pg.session_id = x.session_id
				where x.student_id = p.id and pg.section_id = p_section_id
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
			and not public._classroom_manages_section_email(p_section_id, h.email)
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
		c.enrolled,
		p.avatar,
		p.avatar_url
	from combined c
	left join public.profiles p on p.id = c.student_id;
$$;

-- GRANTED TO NOBODY, exactly as 0138 left it. Its only caller is
-- `notebook_get_section_grid`, which is SECURITY DEFINER, so a grant to
-- `authenticated` here would hand any signed-in student a way to read an
-- arbitrary section's roster straight through PostgREST. The roles are NAMED
-- rather than only `public`, because a drop/create pair takes fresh default
-- privileges -- which on a hosted Supabase project include a direct grant to
-- `anon`, so `revoke ... from public` alone would silently leave it open.
-- 0137's sweep repaired what existed when it ran and does not cover a function
-- created after it, so this file closes its own.
revoke all on function public._notebook_section_roster(uuid)
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The grid, 0169's definition VERBATIM apart from two keys in the
--    `students` object. `create or replace` and NOT a drop: the return type is
--    `jsonb` before and after, so nothing forces one and a drop would only put
--    the grants below at risk. The base was diffed against 0169 to confirm
--    nothing else moved -- in particular `v_today`, the status `case` ladder
--    and the whole cells read are untouched.
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
			),
			-- 0180. THE FACE, BESIDE THE NAME THIS OBJECT ALREADY CARRIES, and
			-- to nobody the `name` and `email` keys above are not already
			-- handed to: `notebook_reviews_section` raised at the top of this
			-- function for anybody else. Read straight off the roster helper,
			-- which reads them off the `profiles` row it already left-joins.
			'avatar', r.avatar,
			'avatar_url', r.avatar_url
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


-- RESTATED FOR THE SAME REASON THE HELPER'S REVOKE IS, even though this half
-- is a `create or replace` that keeps its existing ACL: writing them down
-- makes the end state independent of whatever privilege configuration the
-- database carries, which is the whole point of naming the roles.
revoke all on function public.notebook_get_section_grid(uuid, int)
	from public, anon, authenticated, service_role;
grant execute on function public.notebook_get_section_grid(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Self-check. Reads the catalog back rather than trusting that the
--    statements above ran: the ACL and the caller sweep are the two things
--    that silently come out wrong here, and a migration's own guard passing
--    only says the guard ran.
-- ---------------------------------------------------------------------------
do $$
declare
	v_count integer;
	v_cols integer;
	v_anon boolean;
	v_authed boolean;
	v_roster_anon boolean;
	v_stale text;
begin
	-- Exactly one arity of each, which is what the signature trap costs when
	-- it is got wrong: a surviving old arity silently ignores the new columns.
	select count(*) into v_count
	from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
	where n.nspname = 'public' and pr.proname = '_notebook_section_roster';
	if v_count <> 1 then
		raise exception '0180: expected exactly one _notebook_section_roster, found % (an old arity survived)', v_count;
	end if;

	select count(*) into v_count
	from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
	where n.nspname = 'public' and pr.proname = 'notebook_get_section_grid';
	if v_count <> 1 then
		raise exception '0180: expected exactly one notebook_get_section_grid, found %', v_count;
	end if;

	-- The two columns are actually on the RETURNS TABLE, read off the catalog
	-- rather than inferred from the create having not raised.
	select count(*) into v_cols
	from pg_proc pr
	join pg_namespace n on n.oid = pr.pronamespace
	cross join lateral unnest(pr.proargnames) as a(nm)
	where n.nspname = 'public' and pr.proname = '_notebook_section_roster'
		and a.nm in ('avatar', 'avatar_url');
	if v_cols <> 2 then
		raise exception '0180: _notebook_section_roster does not project avatar + avatar_url (found % of 2)', v_cols;
	end if;

	-- THE CALLER GUARD CLAUDE.md REQUIRES OF A plpgsql DROP, run the other way
	-- round: the helper was re-created above, so what this looks for is a body
	-- that calls it and was NOT re-signed here and might therefore have been
	-- written against the old column list. `notebook_get_section_grid` is the
	-- only legitimate caller and is excluded by name.
	select string_agg(pr.proname, ', ') into v_stale
	from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
	where n.nspname = 'public'
		and pr.prosrc like '%_notebook_section_roster(%'
		and pr.proname not in ('_notebook_section_roster', 'notebook_get_section_grid');
	if v_stale is not null then
		raise exception '0180: these functions also call _notebook_section_roster and were not re-signed: %', v_stale;
	end if;

	v_anon := has_function_privilege('anon', 'public.notebook_get_section_grid(uuid, int)', 'execute');
	v_authed := has_function_privilege('authenticated', 'public.notebook_get_section_grid(uuid, int)', 'execute');
	v_roster_anon := has_function_privilege('anon', 'public._notebook_section_roster(uuid)', 'execute');
	if v_anon then
		raise exception '0180: anon holds EXECUTE on notebook_get_section_grid; the revoke did not name every role';
	end if;
	if v_roster_anon then
		raise exception '0180: anon holds EXECUTE on _notebook_section_roster; the drop/create took the project default grants';
	end if;
	if not v_authed then
		raise exception '0180: authenticated lost EXECUTE on notebook_get_section_grid; the review console is broken';
	end if;

	raise notice '0180: the notebook grid roster projects avatar + avatar_url; grid anon=% authenticated=%, roster anon=%',
		v_anon, v_authed, v_roster_anon;
end;
$$;
