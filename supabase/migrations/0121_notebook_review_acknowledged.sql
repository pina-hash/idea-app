-- 0121 -- Reviewing an entry that is FINE leaves a mark, and the notebook goes live.
--
-- THE PROBLEM. Until now the only verdict an instructor could record was
-- `notebook_flag_entry`. Opening a compliant entry, reading it and approving it
-- wrote nothing at all, so the grid could not tell an entry somebody had looked
-- at from one nobody had opened. The work an instructor does on the entries that
-- are RIGHT -- which is most of them -- left no trace, and there was no way to
-- pick up where they stopped.
--
-- WHAT ACCEPTANCE IS, AND WHAT IT IS NOT. It stamps `reviewed_at` /
-- `reviewed_by` and nothing else. It does NOT change `status`, does NOT clear
-- `flag_reason`, and does NOT touch `instructor_comment`. That distinction is
-- the whole design: `status` is a JUDGEMENT about the work, `reviewed_at` is a
-- fact about the INSTRUCTOR ("I have seen this"). Folding the second into the
-- first is how "I looked at it" quietly becomes "I graded it well", which is a
-- second scoring path on work that is already graded once through
-- notebook_unit_items (0097).
--
-- A BEHAVIOUR CHANGE THAT IS NOT LOCAL TO THIS FILE, and it is the reason
-- `notebook_unaccept_entry` ships in the same migration rather than later:
-- two existing student-facing refusals key on `reviewed_at is not null`.
--
--   * notebook_delete_entry (0116) refuses once reviewed.
--   * notebook_unsubmit_entry (0118) refuses once reviewed.
--
-- Both were written when only flagging and resolving could set the stamp -- rare
-- events, and both of them the kind of act that genuinely makes an instructor a
-- party to the entry. Acceptance is the ORDINARY case and will be applied in
-- bulk, so from this migration on, accepting an entry ALSO closes a student's
-- own delete and their own take-it-back. That is correct (the record an
-- instructor keeps is the same record either way), but it is a door that used to
-- be open, and a misclick must not be what closes it forever. Un-accepting
-- reopens both, because it clears the stamp they read.
--
-- WHAT THE GRID GAINS. `reviewed` across all three of its reads of
-- notebook_entries -- the free-entry count beside a name, the distinct-on that
-- picks which entry a cell shows, and the multi-entry counts badge -- so a cell
-- resolves to one of: missing, filed and unreviewed, filed and accepted,
-- flagged, excused. A DRAFT IS STILL `missing`, deliberately and unchanged; see
-- section 3.
--
-- REALTIME. notebook_entries, notebook_entry_photos and notebook_entry_notes
-- join the supabase_realtime publication, so a review console and the student's
-- own notebook stop being snapshots. Section 4.

-- ---------------------------------------------------------------------------
-- 1. Acknowledging an entry.
--
-- THE SHAPE AND THE GATE ARE notebook_flag_entry's (0118), on purpose: the two
-- are the same act with different verdicts, and a reviewer who may record one
-- may record the other. Refusal ORDER is 0118's rule -- authorization FIRST, so
-- an outsider learns only that they are an outsider, and only somebody who
-- genuinely manages the class is told anything about the row.
--
-- Then deleted before draft, which is 0116's rule and for 0116's reason: both
-- can be true of one row (a deleted draft), and "that entry is gone" is the more
-- useful of the two answers.
--
-- A FREE ENTRY WITH NO SECTION is reachable only by an admin, because
-- classroom_manages_section(null) is `is_admin()` and nothing else. That is
-- exactly what flagging one has always done; it is not new here.
-- ---------------------------------------------------------------------------

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
	if not public.classroom_manages_section(v_entry.section_id) then
		raise exception 'Only the section instructor or a site admin can review notebook entries.';
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

revoke all on function public.notebook_accept_entry(uuid) from public;
grant execute on function public.notebook_accept_entry(uuid) to authenticated;

comment on function public.notebook_accept_entry(uuid) is
	'Records that the section instructor or an admin has looked at a turned-in entry. Stamps reviewed_by/reviewed_at and nothing else -- status, flag_reason and instructor_comment are untouched. Refuses a draft and a deleted entry.';

-- ---------------------------------------------------------------------------
-- 2. Taking the acknowledgement back.
--
-- REVIEWING IS NOT A COMMITMENT. Acceptance will be applied fast, in bulk, down
-- a grid, and it now closes two doors on the student's side (see the header). A
-- one-way stamp under those conditions is a trap, and the shape of trap that
-- makes people stop using the feature rather than use it carefully.
--
-- SAME GATE, and the same refusal order.
--
-- IT REFUSES A FLAGGED ENTRY, which is the one rule this function has that
-- section 1 does not. Clearing the stamp off a flagged row would leave
-- `status = 'flagged'` with `reviewed_at` null: a verdict with nobody attached
-- to it, which the grid would then render as filed-and-unreviewed while still
-- carrying a flag reason. The way back from a flag is notebook_resolve_entry,
-- which is the function that owns the flag.
--
-- ALREADY-NOT-REVIEWED IS SUCCESS, NOT MISUSE. A second click on Undo asks for a
-- state that already holds; raising there would report an error for the outcome
-- the caller wanted.
--
-- instructor_comment SURVIVES. If a comment is there, an instructor wrote it,
-- and it is theirs; withdrawing an acknowledgement is not a reason to destroy
-- somebody else's writing.
-- ---------------------------------------------------------------------------

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
	if not public.classroom_manages_section(v_entry.section_id) then
		raise exception 'Only the section instructor or a site admin can review notebook entries.';
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

revoke all on function public.notebook_unaccept_entry(uuid) from public;
grant execute on function public.notebook_unaccept_entry(uuid) to authenticated;

comment on function public.notebook_unaccept_entry(uuid) is
	'Clears reviewed_by/reviewed_at, reopening the student''s own delete and take-it-back. Refuses a flagged entry: resolving the flag is what withdraws that verdict.';

-- ---------------------------------------------------------------------------
-- 3. The compliance grid gains a REVIEWED dimension.
--
-- 0118's body, unchanged except where noted. It reads notebook_entries three
-- times -- the free-entry count beside a name, the distinct-on that picks WHICH
-- entry a cell shows, and the counts badge -- and all three gain the dimension,
-- because a number the instructor reads must not be able to disagree with the
-- cell beside it. A reviewed count that came only from the picked entry would
-- say "reviewed" over a student's four entries when three of them are untouched.
--
-- FIVE STATES A CELL RESOLVES TO, and what each is made of:
--
--   missing               entry_id null, entry_count 0, status 'missing'
--   filed and unreviewed  entry_id set, reviewed false
--   filed and accepted    entry_id set, reviewed true, status 'compliant'
--   flagged               status 'flagged' (always reviewed: only a reviewer
--                         can set it, and section 2 refuses to unstamp one)
--   excused               no entry, an excusal row -- 0069's state, untouched
--
-- A DRAFT IS STILL `missing`, AND THAT IS NOT AN OVERSIGHT. 0118's headline is
-- that a draft is not presence: `submitted_at` null means work the student has
-- not handed over, invisible to staff on every read, and a cell reporting one
-- would report a status for work the instructor has never been shown. So the
-- `submitted_at is not null` filter stays on all three reads and a
-- draft-only student falls through the same branch as a student who filed
-- nothing. Distinguishing the two on this grid would mean showing staff that a
-- student is holding unfiled work, which is the boundary 0118 exists to draw.
--
-- `reviewed` IS COMPUTED ONCE, HERE. The boolean and the timestamp both ship so
-- that no consumer has to re-derive "has this been looked at" from the stamp and
-- get it subtly different; the projection is the same expression in one place.
-- It is NULL, not false, where there is no entry -- the `on_time` convention on
-- the same cell, and the honest answer for a cell with nothing in it.
--
-- SAME ARITY, so `create or replace` is correct and the signature trap does not
-- apply: no parameter is added, nothing needs dropping, and no old overload can
-- survive. The payload only GAINS keys, so a client deployed before this
-- migration keeps working against it unchanged.
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
			'status', case
				when l.id is not null then l.status
				when x.session_id is not null then 'excused'
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

revoke all on function public.notebook_get_section_grid(uuid, integer) from public;
grant execute on function public.notebook_get_section_grid(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Realtime.
--
-- A review console is two people looking at the same rows: a student adding
-- pages to an entry while an instructor reads it, and increasingly a second
-- instructor accepting down the same grid. Polling is what makes the second one
-- overwrite the first with a stale snapshot.
--
-- THREE TABLES, AND NOT THE FOURTH. notebook_entry_activity is a VIEW
-- (0091, security_invoker over the entries), and a publication takes tables
-- only -- `alter publication ... add table` on a view raises. The view's rows
-- are these tables' rows, so a subscriber gets everything it would have carried
-- anyway; it just has to read the view again to see it shaped.
--
-- RLS STILL APPLIES to the stream: Realtime evaluates the subscriber's own
-- policies per row, which is what keeps a draft (0118) and a soft-deleted entry
-- (0116) off somebody else's channel. Publishing a table grants nobody a read
-- they did not already have.
--
-- REPLICA IDENTITY IS LEFT AT THE DEFAULT (the primary key) DELIBERATELY. The
-- full-row setting exists so DELETE events can carry more than a key, and this
-- subsystem does not hard-delete: entries, photos and notes are all soft-deleted
-- (0116, 0119), which reaches a subscriber as an UPDATE with the whole new row
-- on it. Paying full-row WAL on every photo insert to improve an event that
-- effectively never fires is not a trade worth making.
--
-- IDEMPOTENT ON BOTH AXES, which matters more here than usual. The publication
-- itself is a PLATFORM object, not one of ours: it exists on a real Supabase
-- project and does not exist in the test fixture, and its membership is editable
-- from the dashboard, so this file cannot assume either. The outer guard is 0062's
-- shape (skip the whole block if the publication is absent); the inner one skips
-- any table already published, which is what makes a re-paste ordinary rather
-- than a `42710`.
-- ---------------------------------------------------------------------------

do $$
declare
	v_table text;
	v_added text[] := array[]::text[];
begin
	if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
		raise notice '0121: no supabase_realtime publication on this database; skipped.';
		return;
	end if;

	foreach v_table in array array[
		'notebook_entries', 'notebook_entry_photos', 'notebook_entry_notes'
	] loop
		if not exists (
			select 1 from pg_publication_tables
			where pubname = 'supabase_realtime'
				and schemaname = 'public'
				and tablename = v_table
		) then
			execute format('alter publication supabase_realtime add table public.%I', v_table);
			v_added := v_added || v_table;
		end if;
	end loop;

	raise notice '0121: realtime added % of 3 notebook tables (%); the rest were already published.',
		coalesce(array_length(v_added, 1), 0), coalesce(array_to_string(v_added, ', '), 'none');
end
$$;
