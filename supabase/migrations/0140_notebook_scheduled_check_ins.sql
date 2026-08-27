-- 0140_notebook_scheduled_check_ins.sql
--
-- A CHECK-IN DATED IN THE FUTURE IS NOT MISSING, AND THE TEACHER'S GRID WAS THE
-- HALF THAT STILL SAID IT WAS.
--
-- `notebook_get_section_grid` decided a cell in three arms: an entry, then an
-- excusal, then `missing`. A check-in a teacher scheduled for next month has
-- neither of the first two for any student, so every one of its cells came back
-- `missing` -- which `cellDisplay` renders with the dash glyph, `gridSummary`
-- adds to `outstanding`, and the class page's manager badge reports as work the
-- class is behind on. Schedule a unit's five check-ins on the first day of it
-- and a class of thirty is instantly 150 cells behind on work nobody could have
-- filed yet.
--
-- THE STUDENT'S SIDE OF THE SAME DEFECT IS ALREADY FIXED, DIFFERENTLY, AND THAT
-- ASYMMETRY IS DELIBERATE. The classroom section load bounds its check-in read
-- to today or earlier, so a student is never shown a future check-in at all and
-- can never be told they owe it. Bounding the teacher's read the same way would
-- be wrong: a teacher SCHEDULES ahead, and a grid that hid what they had just
-- scheduled would be hiding their own work from them. So the teacher's side
-- gets a STATUS instead of a filter -- the cell stays on the grid, in its
-- column, and simply stops counting.
--
-- THE COMPARISON IS THE AMERICA/LOS_ANGELES CALENDAR DAY, which is the calendar
-- `session_date` is already adjudicated in everywhere else in this function:
-- `on_time` is `(l.upload_timestamp at time zone 'America/Los_Angeles')::date <=
-- se.session_date` (0094/0098), and the student-side bound reads the same
-- calendar in the loader. UTC runs seven or eight hours ahead of it, so a UTC
-- comparison would call tomorrow's check-in due from 5pm Pacific onwards --
-- every evening, which is exactly when a teacher sets up the next day. That is
-- a smaller copy of the bug this file exists to remove, so it is not taken.
--
-- ADDITIVE, IN THE SENSE THAT MATTERS FOR A HAND-APPLIED CHAIN. The payload
-- gains no key and loses none; one existing key gains one more possible value.
-- A client deployed BEFORE this migration reads `scheduled` through the same
-- `switch (cell.status)` that already has a default arm, so the worst it can do
-- is render a future cell the way it renders one today. A client deployed AFTER
-- it, against a database without it, sees exactly what it sees now. There is
-- therefore NO DEPLOY ORDERING between this file and the client that goes with
-- it, and neither has to wait for the other.
--
-- SAME ARITY, so `create or replace` is correct and the signature trap does not
-- apply: no parameter is added, no old overload can survive, and nothing that
-- calls `notebook_get_section_grid(uuid, integer)` has to change.
--
-- WHAT UNDOES THIS MIGRATION: re-paste 0121's section 3 verbatim
-- (`supabase/migrations/0121_notebook_review_acknowledged.sql`, the
-- `create or replace function public.notebook_get_section_grid` block and the
-- two grant lines under it). It is the immediately preceding definition and it
-- differs from this one by the `v_today` declaration and one `case` arm.
--
-- ---------------------------------------------------------------------------
-- 1. The grid, with a seventh cell state.
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
	if not public.classroom_manages_section(p_section_id) then
		raise exception 'Only the section instructor or a site admin can view the notebook grid.';
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

-- THE ROLES ARE NAMED, not swept from `public`. A hosted Supabase project
-- bootstraps `alter default privileges ... grant execute on functions to anon,
-- authenticated, service_role`, so `revoke ... from public` alone removes one
-- ACL entry that was not the one doing the work and leaves `anon` holding
-- EXECUTE. 0137 repaired that across the whole schema; a function replaced
-- after it is not covered by that sweep and revokes for itself. The end state
-- is the one 0137 left this function in: `authenticated` only.
revoke all on function public.notebook_get_section_grid(uuid, integer)
	from public, anon, authenticated, service_role;
grant execute on function public.notebook_get_section_grid(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Self-check, and what it counts.
--
-- The count is the POINT of the migration, not decoration: it is how many cells
-- stopped being reported as missing the moment this ran. Taken through the same
-- expression the function now uses, against the real tables, so it cannot
-- report a number a second hand-written walk produced.
-- ---------------------------------------------------------------------------

do $$
declare
	v_today date := (pg_catalog.now() at time zone 'America/Los_Angeles')::date;
	v_future integer;
	v_postings integer;
	v_arity integer;
begin
	select count(*) into v_arity
	from pg_catalog.pg_proc p
	join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'notebook_get_section_grid';
	if v_arity <> 1 then
		raise exception 'Expected exactly one notebook_get_section_grid, found %.', v_arity;
	end if;

	select count(*) into v_future
	from public.notebook_sessions ss
	where ss.session_date > v_today;

	select count(*) into v_postings
	from public.notebook_session_postings pg
	join public.notebook_sessions ss on ss.id = pg.session_id
	where ss.session_date > v_today;

	raise notice 'Today (America/Los_Angeles) is %.', v_today;
	raise notice '% check-in(s) are dated ahead of it, across % class posting(s).', v_future, v_postings;
	raise notice 'Their cells now read `scheduled` instead of `missing`, for every student on those rosters.';
end
$$;
