-- 0321_classroom_grading_due_late_teams_targets.sql
--
-- GRADING CATCH-UP, PART 2 (ledger 0457, queue items 15, 16, 18 and 20).
--
-- A. PER-STUDENT DUE DATES AND AN ABSENT STATUS (gap 12d29c40). His words:
--    "check attendance on facts to determine if students are eligible for
--    assignment extension via the syllabus. And if so, please adjust their late
--    date status appropriately. Or if I still have time to complete the
--    assignment and have not turned it in, you must put a A for absent." Both
--    syllabi: "An excused absence moves your due date by the school days you
--    were out." `classroom_student_due` holds one student's own due date on one
--    post and an `absent` flag that is NOT a grade (the A he puts in FACTS).
--    `classroom_set_student_due` sets many at once: a number of school days out
--    (weekends and the site's no-school days skipped), an exact date, absent on
--    or off, or clear. `_classroom_student_due_at` is the ONE answer to "when
--    is this student's work due", read by the late-credit trigger and the
--    needs-grading read.
--
-- B. THE ON-TIME VERSION OF EVERY ANSWER, FROM NOW ON (gap d8aded45). An
--    answer is one row per question, overwritten by every save, so an edit
--    after the due date erased the on-time version. A trigger now keeps, per
--    question, the last version saved on or before THAT STUDENT's due date,
--    the moment a later save would overwrite it
--    (`classroom_response_versions`). EDITS MADE BEFORE THIS FILE APPLIED
--    CANNOT BE RECOVERED: nothing kept them. An extension set after a student
--    has already saved past both dates keeps the version from before the old
--    date, because the saves in between were overwritten before anyone knew.
--
-- C. PARTIAL LATE CREDIT (gap d8aded45, Mr. Pina 2026-10-27: on-time items
--    full score, late items partial, he chose 50%). `classroom_item_grading`
--    holds a post's late rate (50% unless he changes it) and its Grade as
--    teams switch. `classroom_grade_late_credit` takes, per rubric line, the
--    on-time score and the final score, credits on time + rate x the late
--    improvement, writes it through `classroom_grade_submission` (so protection,
--    levels and the reviewer gate all hold, and a credit between two levels
--    carries its own note saying how it was made), and keeps the breakdown in
--    `classroom_late_credit`.
--
-- D. GRADE AS TEAMS FOR POSTS HANDED OUT AS INDIVIDUAL COPIES (report
--    62eded18). `classroom_item_team_draw` answers each class's posted team
--    draw with member addresses, for the grader. The grades themselves go
--    through the ordinary batch (`classroom_grade_submissions`), one score to
--    every teammate; nothing here writes a grade.
--
-- E. SYLLABUS POINT TARGETS (report c622b97a). `classroom_course_grade_targets`
--    holds each course's grading categories and their point targets, edited by
--    him on a class's Grades page (`classroom_set_grade_targets`). Seeded from
--    the two syllabi committed in the repo (materials/idea209h/syllabus and
--    materials/idea100), with their own numbers; a course with no syllabus in
--    the repo gets nothing and he adds its categories.
--
-- F. `classroom_needs_grading` (0315) re-created with the same signature: past
--    due is each student's own due date, and a student marked absent who still
--    has time is not waiting.
--
-- DEPLOY ORDERING: none. Every function the client calls is new, except
-- classroom_needs_grading, which keeps its signature. The client degrades on
-- PGRST202 alone.
--
-- WHAT UNDOES IT, a person's paste: re-run 0315's classroom_needs_grading, then
--   drop trigger if exists classroom_responses_keep_on_time on public.classroom_responses;
--   drop function if exists public._classroom_response_keep_on_time();
--   drop function if exists public.classroom_set_grade_targets(uuid, jsonb);
--   drop function if exists public.classroom_item_team_draw(uuid);
--   drop function if exists public.classroom_grade_late_credit(uuid, text, jsonb, jsonb, numeric, text, boolean);
--   drop function if exists public._classroom_late_criteria(uuid, text);
--   drop function if exists public.classroom_item_grading_settings(uuid);
--   drop function if exists public.classroom_set_item_grading(uuid, numeric, boolean, boolean);
--   drop function if exists public.classroom_student_due_dates(uuid);
--   drop function if exists public.classroom_set_student_due(uuid, jsonb);
--   drop function if exists public._classroom_student_due_at(uuid, text);
--   drop function if exists public._classroom_school_days_after(date, integer);
-- The tables stay (the migration role refuses a drop); a person drops them by hand.

do $pre$
begin
	if to_regprocedure('public.classroom_needs_grading(uuid[], uuid[])') is null
		or to_regprocedure('public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb, numeric)') is null
		or to_regclass('public.classroom_no_school_days') is null
		or to_regprocedure('public._classroom_section_team_set(uuid)') is null then
		raise exception '0321 cannot apply: 0315, 0303 or 0302 is missing. Apply them first.';
	end if;
end
$pre$;

-- ===== PART A: per-student due dates and the absent status =====

-- The first object is new, so the apply probe can see this landed.
create table if not exists public.classroom_student_due (
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	student_email text not null check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	-- Null keeps the post's own due date (an absent mark with no move).
	due_at timestamptz,
	-- How the date was set: school days out, when that is how he said it.
	days_out integer check (days_out is null or days_out between 0 and 60),
	-- "A" in FACTS: absent and still has time. Not a grade.
	absent boolean not null default false,
	note text check (note is null or char_length(note) <= 300),
	set_by text not null,
	set_at timestamptz not null default now(),
	primary key (item_id, student_email)
);
alter table public.classroom_student_due enable row level security;
revoke all on table public.classroom_student_due from public, anon, authenticated, service_role;
grant select on table public.classroom_student_due to authenticated;
drop policy if exists "classroom student due own or reviewer" on public.classroom_student_due;
create policy "classroom student due own or reviewer"
	on public.classroom_student_due
	for select
	to authenticated
	using (
		student_email = public.current_user_email()
		or public.classroom_can_review_submission(item_id, student_email)
	);

-- A school day N school days after `p_from`: weekends and the site's
-- no-school days (0303) do not count.
create or replace function public._classroom_school_days_after(p_from date, p_days integer)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_day date := p_from;
	v_left integer := greatest(coalesce(p_days, 0), 0);
	v_guard integer := 0;
begin
	while v_left > 0 and v_guard < 400 loop
		v_day := v_day + 1;
		v_guard := v_guard + 1;
		if extract(isodow from v_day) < 6
			and not exists (select 1 from public.classroom_no_school_days n where n.day = v_day) then
			v_left := v_left - 1;
		end if;
	end loop;
	return v_day;
end;
$f$;
revoke all on function public._classroom_school_days_after(date, integer) from public, anon, authenticated, service_role;

-- THE ONE ANSWER to "when is this student's work due": their own date when one
-- is set, otherwise the post's.
create or replace function public._classroom_student_due_at(p_item_id uuid, p_student_email text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce(
		(select d.due_at from public.classroom_student_due d
		 where d.item_id = p_item_id and d.student_email = lower(btrim(coalesce(p_student_email, '')))),
		(select i.due_at from public.classroom_items i where i.id = p_item_id)
	);
$f$;
revoke all on function public._classroom_student_due_at(uuid, text) from public, anon, authenticated, service_role;

-- MANY STUDENTS AT ONCE. Each entry: { student_email, days_out?, due_at?,
-- absent?, note?, clear? }. days_out moves the POST's due date by that many
-- school days, keeping its time of day; due_at sets one outright; absent is
-- the A; clear removes the student's own date and mark. Every row asks the
-- grading gate (a reviewer of that student) and one refusal never ends the
-- batch: the report is the bulk shape every batch here returns.
create or replace function public.classroom_set_student_due(p_item_id uuid, p_entries jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
	v_item public.classroom_items;
	v_row jsonb;
	v_email text;
	v_seen text[] := '{}';
	v_due timestamptz;
	v_days integer;
	v_absent boolean;
	v_note text;
	v_results jsonb := '[]'::jsonb;
	v_ok integer := 0;
	v_refused integer := 0;
	v_n integer;
	v_local timestamp;
	-- What puts every changed student back: their date and mark before, or clear.
	v_undo jsonb := '[]'::jsonb;
	v_prior public.classroom_student_due;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	select * into v_item from public.classroom_items i where i.id = p_item_id;
	if v_item.id is null or v_item.kind <> 'assignment' then
		raise exception 'That assignment does not exist.';
	end if;
	if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
		raise exception 'Name at least one student.';
	end if;
	if jsonb_array_length(p_entries) > 200 then
		raise exception 'At most 200 students in one change.';
	end if;
	for v_n in 0 .. jsonb_array_length(p_entries) - 1 loop
		v_row := p_entries -> v_n;
		v_email := lower(btrim(coalesce(v_row ->> 'student_email', '')));
		begin
			if v_email = '' or v_email not like '%@%' then
				raise exception 'Entry % has no student.', v_n + 1;
			end if;
			if v_email = any (v_seen) then
				raise exception 'This student is named twice.';
			end if;
			v_seen := v_seen || v_email;
			if not public.classroom_can_review_submission(p_item_id, v_email) then
				raise exception 'Only a teacher of record for this student''s class can change their due date.';
			end if;
			select * into v_prior from public.classroom_student_due d where d.item_id = p_item_id and d.student_email = v_email;
			v_undo := v_undo || jsonb_build_array(case when v_prior.item_id is null
				then jsonb_build_object('student_email', v_email, 'clear', true)
				else jsonb_build_object('student_email', v_email, 'due_at', coalesce(v_prior.due_at, v_item.due_at),
					'absent', v_prior.absent) end);
			if coalesce((v_row ->> 'clear')::boolean, false) then
				delete from public.classroom_student_due d where d.item_id = p_item_id and d.student_email = v_email;
				v_results := v_results || jsonb_build_array(jsonb_build_object('email', v_email, 'ok', true, 'cleared', true,
					'due_at', v_item.due_at));
				v_ok := v_ok + 1;
				continue;
			end if;
			v_days := null;
			v_due := null;
			if v_row ? 'days_out' and jsonb_typeof(v_row -> 'days_out') <> 'null' then
				v_days := (v_row ->> 'days_out')::integer;
				if v_days < 0 or v_days > 60 then
					raise exception 'Days out must be from 0 to 60.';
				end if;
				if v_item.due_at is null then
					raise exception 'This post has no due date to move.';
				end if;
				v_local := v_item.due_at at time zone 'America/Los_Angeles';
				v_due := (public._classroom_school_days_after(v_local::date, v_days) + v_local::time)
					at time zone 'America/Los_Angeles';
			elsif v_row ? 'due_at' and jsonb_typeof(v_row -> 'due_at') <> 'null' then
				v_due := (v_row ->> 'due_at')::timestamptz;
			end if;
			v_absent := case when v_row ? 'absent' and jsonb_typeof(v_row -> 'absent') = 'boolean'
				then (v_row ->> 'absent')::boolean else null end;
			v_note := nullif(btrim(coalesce(v_row ->> 'note', '')), '');
			if v_due is null and v_absent is null and v_note is null then
				raise exception 'Say days out, a due date, absent, or clear.';
			end if;
			insert into public.classroom_student_due as d (item_id, student_email, due_at, days_out, absent, note, set_by, set_at)
			values (p_item_id, v_email, v_due, v_days, coalesce(v_absent, false), v_note, public.current_user_email(), now())
			on conflict (item_id, student_email) do update
				set due_at = case when v_due is not null then excluded.due_at else d.due_at end,
					days_out = case when v_due is not null then excluded.days_out else d.days_out end,
					absent = coalesce(v_absent, d.absent),
					note = coalesce(v_note, d.note),
					set_by = excluded.set_by,
					set_at = now();
			v_results := v_results || jsonb_build_array((
				select jsonb_build_object('email', v_email, 'ok', true,
					'due_at', coalesce(d.due_at, v_item.due_at), 'days_out', d.days_out, 'absent', d.absent)
				from public.classroom_student_due d where d.item_id = p_item_id and d.student_email = v_email));
			v_ok := v_ok + 1;
		exception when others then
			v_results := v_results || jsonb_build_array(jsonb_build_object('email', v_email, 'ok', false, 'reason', 'error', 'message', sqlerrm));
			v_refused := v_refused + 1;
		end;
	end loop;
	return jsonb_build_object('ok', true, 'total', v_ok + v_refused, 'succeeded', v_ok, 'refused', v_refused,
		'post_due_at', v_item.due_at, 'results', v_results, 'undo', v_undo);
end;
$f$;
revoke all on function public.classroom_set_student_due(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.classroom_set_student_due(uuid, jsonb) to authenticated;

-- EVERY OWN DATE AND MARK ON A POST the caller may review, for the console.
create or replace function public.classroom_student_due_dates(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select coalesce(jsonb_agg(jsonb_build_object(
		'email', d.student_email, 'due_at', d.due_at, 'days_out', d.days_out, 'absent', d.absent,
		'note', d.note, 'set_by', d.set_by, 'set_at', d.set_at) order by d.student_email), '[]'::jsonb)
	from public.classroom_student_due d
	where d.item_id = p_item_id
		and (select auth.uid()) is not null
		and public.classroom_can_review_submission(d.item_id, d.student_email);
$f$;
revoke all on function public.classroom_student_due_dates(uuid) from public, anon, authenticated, service_role;
grant execute on function public.classroom_student_due_dates(uuid) to authenticated;

-- ===== PART B: the on-time version of every answer =====

create table if not exists public.classroom_response_versions (
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	student_email text not null,
	block_id text not null,
	-- The last version saved on or before the student's due date.
	value jsonb not null,
	saved_at timestamptz not null,
	-- The due date it was judged against.
	due_at timestamptz not null,
	recorded_at timestamptz not null default now(),
	primary key (item_id, student_email, block_id)
);
alter table public.classroom_response_versions enable row level security;
revoke all on table public.classroom_response_versions from public, anon, authenticated, service_role;
grant select on table public.classroom_response_versions to authenticated;
drop policy if exists "classroom response versions own or reviewer" on public.classroom_response_versions;
create policy "classroom response versions own or reviewer"
	on public.classroom_response_versions
	for select
	to authenticated
	using (
		student_email = public.current_user_email()
		or public.classroom_can_review_submission(item_id, student_email)
	);

-- KEEP THE ON-TIME VERSION before a later save overwrites it. Fires only when
-- the value changes. Best effort by construction: it never refuses a save.
create or replace function public._classroom_response_keep_on_time()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $f$
declare
	v_due timestamptz;
begin
	begin
		v_due := public._classroom_student_due_at(old.item_id, old.student_email);
		if v_due is not null and old.updated_at <= v_due and new.updated_at > v_due then
			insert into public.classroom_response_versions as v (item_id, student_email, block_id, value, saved_at, due_at)
			values (old.item_id, old.student_email, old.block_id, old.value, old.updated_at, v_due)
			on conflict (item_id, student_email, block_id) do update
				set value = excluded.value, saved_at = excluded.saved_at, due_at = excluded.due_at, recorded_at = now()
				where v.saved_at <= excluded.saved_at;
		end if;
	exception when others then
		raise warning 'on-time version not kept for %/%: %', old.item_id, old.block_id, sqlerrm;
	end;
	return new;
end;
$f$;
revoke all on function public._classroom_response_keep_on_time() from public, anon, authenticated, service_role;

drop trigger if exists classroom_responses_keep_on_time on public.classroom_responses;
create trigger classroom_responses_keep_on_time
	before update on public.classroom_responses
	for each row
	when (old.value is distinct from new.value)
	execute function public._classroom_response_keep_on_time();

-- ===== PART C: a post's grading settings and partial late credit =====

create table if not exists public.classroom_item_grading (
	item_id uuid primary key references public.classroom_items (id) on delete cascade,
	-- His choice on 2026-10-27: late work earns half.
	late_rate numeric not null default 0.5 check (late_rate >= 0 and late_rate <= 1),
	grade_as_teams boolean not null default false,
	-- Item 17: score the rubric out of the post's points (scaled), or not.
	scale_to_points boolean not null default false,
	updated_by text not null,
	updated_at timestamptz not null default now()
);
alter table public.classroom_item_grading enable row level security;
revoke all on table public.classroom_item_grading from public, anon, authenticated, service_role;

-- THE RUBRIC'S OWN TOTAL (a team post's maximum, 0305's rule), null with no rubric.
create or replace function public._classroom_item_rubric_total(p_item_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $f$
	select case when exists (select 1 from public.classroom_rubrics r where r.item_id = p_item_id
			and jsonb_typeof(r.criteria) = 'array' and jsonb_array_length(r.criteria) > 0)
		then public._classroom_item_out_of(p_item_id) end;
$f$;
revoke all on function public._classroom_item_rubric_total(uuid) from public, anon, authenticated, service_role;

-- THE POINTS A RUBRIC IS SCALED TO, or null when it is not scaled: the switch
-- is on, the post has points, and the rubric totals something else.
create or replace function public._classroom_item_scaled_points(p_item_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $f$
	select case when g.scale_to_points and i.points is not null and i.points > 0
			and public._classroom_item_rubric_total(p_item_id) is distinct from i.points::numeric
		then i.points::numeric end
	from public.classroom_items i
	left join public.classroom_item_grading g on g.item_id = i.id
	where i.id = p_item_id;
$f$;
revoke all on function public._classroom_item_scaled_points(uuid) from public, anon, authenticated, service_role;

create or replace function public.classroom_item_grading_settings(p_item_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
	select case when (select auth.uid()) is null or not exists (
			select 1 from public.classroom_postings pg
			where pg.item_id = p_item_id and public.classroom_manages_section(pg.section_id))
		then null
		else jsonb_build_object(
			'late_rate', coalesce((select g.late_rate from public.classroom_item_grading g where g.item_id = p_item_id), 0.5),
			'grade_as_teams', coalesce((select g.grade_as_teams from public.classroom_item_grading g where g.item_id = p_item_id), false),
			'scale_to_points', coalesce((select g.scale_to_points from public.classroom_item_grading g where g.item_id = p_item_id), false),
			'rubric_total', public._classroom_item_rubric_total(p_item_id),
			'points', (select i.points from public.classroom_items i where i.id = p_item_id))
	end;
$f$;
revoke all on function public.classroom_item_grading_settings(uuid) from public, anon, authenticated, service_role;
grant execute on function public.classroom_item_grading_settings(uuid) to authenticated;

-- Null leaves a setting as it is. A manager of every class the post is in,
-- the rubric's own rule, because the setting applies to every class.
create or replace function public.classroom_set_item_grading(p_item_id uuid, p_late_rate numeric, p_grade_as_teams boolean, p_scale_to_points boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
	v_before jsonb;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_items i where i.id = p_item_id and i.kind = 'assignment') then
		raise exception 'That assignment does not exist.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can change how it is graded.';
	end if;
	if p_late_rate is not null and (p_late_rate < 0 or p_late_rate > 1) then
		raise exception 'The late rate is a share from 0 to 1, like 0.5 for half.';
	end if;
	v_before := public.classroom_item_grading_settings(p_item_id);
	if p_scale_to_points and coalesce((select i.points from public.classroom_items i where i.id = p_item_id), 0) <= 0 then
		raise exception 'Give the post its points first; the rubric is scaled to them.';
	end if;
	insert into public.classroom_item_grading as g (item_id, late_rate, grade_as_teams, scale_to_points, updated_by)
	values (p_item_id, coalesce(p_late_rate, 0.5), coalesce(p_grade_as_teams, false), coalesce(p_scale_to_points, false), public.current_user_email())
	on conflict (item_id) do update
		set late_rate = coalesce(p_late_rate, g.late_rate),
			grade_as_teams = coalesce(p_grade_as_teams, g.grade_as_teams),
			scale_to_points = coalesce(p_scale_to_points, g.scale_to_points),
			updated_by = excluded.updated_by,
			updated_at = now();
	return jsonb_build_object('ok', true, 'before', v_before) || public.classroom_item_grading_settings(p_item_id);
end;
$f$;
revoke all on function public.classroom_set_item_grading(uuid, numeric, boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function public.classroom_set_item_grading(uuid, numeric, boolean, boolean) to authenticated;

create table if not exists public.classroom_late_credit (
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	student_email text not null,
	on_time_scores jsonb not null,
	final_scores jsonb not null,
	rate numeric not null,
	credited jsonb not null,
	graded_by text not null,
	graded_at timestamptz not null default now(),
	primary key (item_id, student_email)
);
alter table public.classroom_late_credit enable row level security;
revoke all on table public.classroom_late_credit from public, anon, authenticated, service_role;
grant select on table public.classroom_late_credit to authenticated;
drop policy if exists "classroom late credit own or reviewer" on public.classroom_late_credit;
create policy "classroom late credit own or reviewer"
	on public.classroom_late_credit
	for select
	to authenticated
	using (
		student_email = public.current_user_email()
		or public.classroom_can_review_submission(item_id, student_email)
	);

-- THE RUBRIC LINES WITH A LATE ANSWER BEHIND THEM, for one student: every
-- criterion of a worksheet step where an answer, or a picture, was saved after
-- that student's own due date. Stored ids, `<module id>-<criterion id>`, the
-- rubric's own spelling (0305). Empty for a post that is not a worksheet.
create or replace function public._classroom_late_criteria(p_item_id uuid, p_student_email text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $f$
	with due as (
		select public._classroom_student_due_at(p_item_id, p_student_email) as at
	),
	late_blocks as (
		select r.block_id from public.classroom_responses r, due
		where r.item_id = p_item_id and r.student_email = lower(btrim(coalesce(p_student_email, '')))
			and due.at is not null and r.updated_at > due.at
		union
		select f.block_id from public.classroom_submission_files f
		join public.classroom_submissions s on s.id = f.submission_id, due
		where s.item_id = p_item_id and s.student_email = lower(btrim(coalesce(p_student_email, '')))
			and f.block_id is not null and due.at is not null and f.created_at > due.at
	),
	manifest as (
		select h.manifest from public.classroom_html_assignments h
		join public.classroom_items i on i.id = h.item_id
		where h.item_id = p_item_id and i.assignment_schema_version = 3
	)
	select coalesce(array_agg(distinct (m->>'id') || '-' || btrim(c->>'id')), '{}')
	from manifest,
		jsonb_array_elements(case when jsonb_typeof(manifest.manifest->'modules') = 'array'
			then manifest.manifest->'modules' else '[]'::jsonb end) m
		cross join lateral jsonb_array_elements(case when jsonb_typeof(m->'criteria') = 'array'
			then m->'criteria' else '[]'::jsonb end) c
	where coalesce(btrim(c->>'id'), '') <> ''
		and exists (
			select 1 from jsonb_array_elements(case when jsonb_typeof(m->'blocks') = 'array'
				then m->'blocks' else '[]'::jsonb end) b
			where b->>'id' in (select lb.block_id from late_blocks lb)
		);
$f$;
revoke all on function public._classroom_late_criteria(uuid, text) from public, anon, authenticated, service_role;

-- PER RUBRIC LINE: on time + rate x (final - on time). A line with no on-time
-- score is all on time, EXCEPT a line `_classroom_late_criteria` names: that
-- one must carry an on-time score, so leaving it out can never score a
-- late-only change as on time. The credit goes through the ONE grading rule.
create or replace function public.classroom_grade_late_credit(
	p_item_id uuid,
	p_student_email text,
	p_on_time jsonb,
	p_final jsonb,
	p_rate numeric,
	p_comment text,
	p_return boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_rate numeric;
	v_key text;
	v_final numeric;
	v_on numeric;
	v_credit numeric;
	v_credited jsonb := '{}'::jsonb;
	v_notes jsonb := '{}'::jsonb;
	v_on_time jsonb := '{}'::jsonb;
	v_criteria jsonb;
	v_on_level boolean;
	v_out jsonb;
	v_late text[];
	v_missing text[];
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.classroom_can_review_submission(p_item_id, v_email) then
		raise exception 'Only a teacher of record for this student''s class can grade this.';
	end if;
	if p_final is null or jsonb_typeof(p_final) <> 'object' then
		raise exception 'Final scores must be an object keyed by rubric criterion id.';
	end if;
	if p_on_time is not null and jsonb_typeof(p_on_time) not in ('object', 'null') then
		raise exception 'On-time scores must be an object keyed by rubric criterion id.';
	end if;
	v_rate := coalesce(p_rate,
		(select g.late_rate from public.classroom_item_grading g where g.item_id = p_item_id), 0.5);
	if v_rate < 0 or v_rate > 1 then
		raise exception 'The late rate is a share from 0 to 1, like 0.5 for half.';
	end if;
	select r.criteria into v_criteria from public.classroom_rubrics r where r.item_id = p_item_id;

	-- A LATE LINE IS NEVER SCORED AS ON TIME BY LEAVING IT OUT. A line with no
	-- on-time score counts as all on time, so every line with an answer saved
	-- after this student's own due date must carry one.
	v_late := public._classroom_late_criteria(p_item_id, v_email);
	select coalesce(array_agg(k order by k), '{}') into v_missing
	from unnest(v_late) k
	where jsonb_typeof(p_final -> k) = 'number'
		and (p_on_time is null or jsonb_typeof(p_on_time -> k) is distinct from 'number');
	if cardinality(v_missing) > 0 then
		return jsonb_build_object('ok', false, 'reason', 'on_time_needed', 'missing', to_jsonb(v_missing),
			'message', format('Give the on-time score for %s: an answer behind it was saved after the due date. Nothing was saved.',
				array_to_string(v_missing, ', ')));
	end if;

	for v_key in select jsonb_object_keys(p_final) loop
		if jsonb_typeof(p_final -> v_key) = 'null' then
			continue;
		end if;
		v_final := (p_final ->> v_key)::numeric;
		v_on := case when p_on_time is not null and jsonb_typeof(p_on_time -> v_key) = 'number'
			then (p_on_time ->> v_key)::numeric else v_final end;
		if v_on > v_final then
			raise exception 'The on-time score for % is more than its final score. Late work never lowers a grade.', v_key;
		end if;
		v_credit := round(v_on + v_rate * (v_final - v_on), 2);
		v_credited := v_credited || jsonb_build_object(v_key, v_credit);
		v_on_time := v_on_time || jsonb_build_object(v_key, v_on);
		if v_on < v_final then
			-- A credit between two levels needs its note: it says how it was made.
			select exists (
				select 1 from jsonb_array_elements(case when jsonb_typeof(v_criteria) = 'array' then v_criteria else '[]'::jsonb end) c,
					jsonb_array_elements(case when jsonb_typeof(c -> 'levels') = 'array' then c -> 'levels' else '[]'::jsonb end) l
				where c ->> 'id' = v_key and jsonb_typeof(l -> 'points') = 'number' and (l ->> 'points')::numeric = v_credit
			) into v_on_level;
			v_notes := v_notes || jsonb_build_object(v_key, format('Late credit: %s on time, plus %s%% of the %s earned after the due date.',
				trim(to_char(v_on, 'FM999990.##'), '.'), trim(to_char(v_rate * 100, 'FM990.##'), '.'),
				trim(to_char(v_final - v_on, 'FM999990.##'), '.')));
		end if;
	end loop;

	v_out := public.classroom_grade_submission(p_item_id, v_email, v_credited, p_comment,
		coalesce(p_return, false), v_notes, null);
	if coalesce((v_out ->> 'ok')::boolean, false) then
		insert into public.classroom_late_credit as lc (item_id, student_email, on_time_scores, final_scores, rate, credited, graded_by)
		values (p_item_id, v_email, v_on_time, p_final, v_rate, v_credited, public.current_user_email())
		on conflict (item_id, student_email) do update
			set on_time_scores = excluded.on_time_scores, final_scores = excluded.final_scores, rate = excluded.rate,
				credited = excluded.credited, graded_by = excluded.graded_by, graded_at = now();
	end if;
	return v_out || jsonb_build_object('credited', v_credited, 'rate', v_rate);
end;
$f$;
revoke all on function public.classroom_grade_late_credit(uuid, text, jsonb, jsonb, numeric, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.classroom_grade_late_credit(uuid, text, jsonb, jsonb, numeric, text, boolean) to authenticated;

-- ===== PART D: the posted team draw of each class of a post =====

create or replace function public.classroom_item_team_draw(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_out jsonb := '[]'::jsonb;
	v_section record;
	v_set uuid;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	for v_section in
		select s.id, s.label, s.block
		from public.classroom_postings pg
		join public.classroom_sections s on s.id = pg.section_id
		where pg.item_id = p_item_id and public.classroom_manages_section(s.id)
		order by s.label
	loop
		v_set := public._classroom_section_team_set(v_section.id);
		v_out := v_out || jsonb_build_array(jsonb_build_object(
			'section_id', v_section.id,
			'label', v_section.label,
			'block', v_section.block,
			'team_set_id', v_set,
			'set_label', (select ts.label from public.classroom_team_sets ts where ts.id = v_set),
			'teams', coalesce((
				select jsonb_agg(jsonb_build_object(
					'id', t.id,
					'number', t.team_number,
					'name', coalesce(nullif(btrim(t.name), ''), 'Team ' || t.team_number),
					'members', (
						select coalesce(jsonb_agg(m.student_email order by m.student_email), '[]'::jsonb)
						from public.classroom_team_members m where m.team_id = t.id
					)
				) order by t.team_number)
				from public.classroom_teams t where t.team_set_id = v_set
			), '[]'::jsonb)
		));
	end loop;
	return jsonb_build_object('ok', true, 'sections', v_out);
end;
$f$;
revoke all on function public.classroom_item_team_draw(uuid) from public, anon, authenticated, service_role;
grant execute on function public.classroom_item_team_draw(uuid) to authenticated;

-- ===== PART E: syllabus point targets per course =====

create table if not exists public.classroom_course_grade_targets (
	id uuid primary key default gen_random_uuid(),
	course_id uuid not null references public.classroom_courses (id) on delete cascade,
	category text not null check (char_length(btrim(category)) between 1 and 100),
	-- Null is a category with no target yet: he sets it.
	target_points numeric check (target_points is null or (target_points >= 0 and target_points <= 100000)),
	sort integer not null default 0,
	-- Where the number came from, so a reader can check it.
	source text check (source is null or char_length(source) <= 200),
	updated_by text not null,
	updated_at timestamptz not null default now()
);
create unique index if not exists classroom_course_grade_targets_name_key
	on public.classroom_course_grade_targets (course_id, lower(btrim(category)));
alter table public.classroom_course_grade_targets enable row level security;
revoke all on table public.classroom_course_grade_targets from public, anon, authenticated, service_role;
grant select on table public.classroom_course_grade_targets to authenticated;
drop policy if exists "classroom grade targets for course managers" on public.classroom_course_grade_targets;
create policy "classroom grade targets for course managers"
	on public.classroom_course_grade_targets
	for select
	to authenticated
	using (public._classroom_manages_course(course_id));

-- THE WHOLE LIST AT ONCE: [{category, target_points, source?}] in order. A
-- category left out is removed. A manager of a class in the course.
create or replace function public.classroom_set_grade_targets(p_course_id uuid, p_targets jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $f$
declare
	v_row jsonb;
	v_n integer;
	v_names text[] := '{}';
	v_name text;
	v_target numeric;
	v_before jsonb;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public._classroom_manages_course(p_course_id) then
		raise exception 'Only a teacher of record for this course can change its grading categories.';
	end if;
	if p_targets is null or jsonb_typeof(p_targets) <> 'array' then
		raise exception 'Targets must be a list of categories.';
	end if;
	if jsonb_array_length(p_targets) > 30 then
		raise exception 'At most 30 categories.';
	end if;
	select coalesce(jsonb_agg(jsonb_build_object('category', t.category, 'target_points', t.target_points, 'source', t.source) order by t.sort, t.category), '[]'::jsonb)
	into v_before from public.classroom_course_grade_targets t where t.course_id = p_course_id;
	for v_n in 0 .. jsonb_array_length(p_targets) - 1 loop
		v_row := p_targets -> v_n;
		v_name := btrim(coalesce(v_row ->> 'category', ''));
		if v_name = '' then
			raise exception 'Category % has no name.', v_n + 1;
		end if;
		if lower(v_name) = any (v_names) then
			raise exception 'The category "%" is named twice.', v_name;
		end if;
		v_names := v_names || lower(v_name);
		v_target := case when jsonb_typeof(v_row -> 'target_points') = 'number' then (v_row ->> 'target_points')::numeric else null end;
		insert into public.classroom_course_grade_targets as t (course_id, category, target_points, sort, source, updated_by)
		values (p_course_id, v_name, v_target, v_n, nullif(btrim(coalesce(v_row ->> 'source', '')), ''), public.current_user_email())
		on conflict (course_id, lower(btrim(category))) do update
			set category = excluded.category, target_points = excluded.target_points, sort = excluded.sort,
				source = coalesce(excluded.source, t.source), updated_by = excluded.updated_by, updated_at = now();
	end loop;
	delete from public.classroom_course_grade_targets t
	where t.course_id = p_course_id and not (lower(btrim(t.category)) = any (v_names));
	return jsonb_build_object('ok', true, 'course_id', p_course_id, 'count', jsonb_array_length(p_targets), 'before', v_before);
end;
$f$;
revoke all on function public.classroom_set_grade_targets(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.classroom_set_grade_targets(uuid, jsonb) to authenticated;

-- THE SEED, FROM THE SYLLABI IN THE REPO, ONCE. Only for a course with no
-- categories yet, so a re-paste never overwrites what he edited.
do $seed$
declare
	v_course uuid;
	v_n integer := 0;
	v_rows jsonb;
	v_row jsonb;
	v_i integer;
	v_src text;
begin
	for v_course, v_rows, v_src in
		select c.id,
			case replace(upper(c.code), ' ', '')
				when 'IDEA209H' then '[
					{"category": "Unit Labs", "target_points": 200},
					{"category": "Unit Assignments", "target_points": 400},
					{"category": "Engineering Documentation", "target_points": 100},
					{"category": "Integrated Design Challenge", "target_points": 250},
					{"category": "Final Exam", "target_points": 100}]'::jsonb
				when 'IDEA100' then '[
					{"category": "Manufacturing and Assembly", "target_points": 60},
					{"category": "Dogtag", "target_points": 40},
					{"category": "Hook Competition", "target_points": 130},
					{"category": "IDEA-Blade", "target_points": 190},
					{"category": "Engineering Documentation", "target_points": 80}]'::jsonb
			end,
			case replace(upper(c.code), ' ', '')
				when 'IDEA209H' then 'IDEA209H Fall 2026 syllabus, Grading (semester total 1,050)'
				when 'IDEA100' then 'IDEA100 Fall 2026 syllabus, Grading (one rotation, total 500)'
			end
		from public.classroom_courses c
		where replace(upper(c.code), ' ', '') in ('IDEA209H', 'IDEA100')
			and not exists (select 1 from public.classroom_course_grade_targets t where t.course_id = c.id)
	loop
		for v_i in 0 .. jsonb_array_length(v_rows) - 1 loop
			v_row := v_rows -> v_i;
			insert into public.classroom_course_grade_targets (course_id, category, target_points, sort, source, updated_by)
			values (v_course, v_row ->> 'category', (v_row ->> 'target_points')::numeric, v_i, v_src, 'syllabus')
			on conflict do nothing;
			v_n := v_n + 1;
		end loop;
	end loop;
	raise notice '0321: % syllabus categories seeded', v_n;
end
$seed$;

-- ===== PART F: the needs-grading read, by each student's own due date =====


-- classroom_grade_submission: 0315's body whole, with the 0321 lines marked.
create or replace function public.classroom_grade_submission(
	p_item_id uuid,
	p_student_email text,
	p_scores jsonb,
	p_comment text,
	p_return boolean,
	p_criterion_comments jsonb,
	p_extra_credit numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_criteria jsonb;
	v_crit jsonb;
	v_score numeric := 0;
	v_value jsonb;
	v_missing text[] := '{}';
	v_uncommented text[] := '{}';
	v_key text;
	v_known text[] := '{}';
	v_given numeric;
	v_on_level boolean;
	v_note text;
	v_comments jsonb := '{}'::jsonb;
	v_n integer;
	v_k integer;
	v_now timestamptz := now();
	v_state text;
	v_extra numeric;
	v_direct numeric;
	v_sub_id uuid;
	v_bought numeric := 0;
	-- 0315: grade protection.
	v_blocked jsonb;
	-- 0321: rubric scaling.
	v_scale_to numeric;
	v_scale_from numeric;
	-- 0305: a team assignment.
	v_team uuid;
	v_role_of jsonb := '{}'::jsonb;
	v_roles text[] := '{}';
	v_crit_role text;
	v_role_sum numeric := 0;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'A student email is required.';
	end if;
	if not exists (
		select 1 from public.classroom_items i
		where i.id = p_item_id and i.kind = 'assignment'
	) then
		raise exception 'That assignment does not exist.';
	end if;
	if not public.classroom_can_review_submission(p_item_id, v_email) then
		raise exception 'Only a teacher of record for this student''s class can grade this.';
	end if;

	select s.id, s.direct_score into v_sub_id, v_direct
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;

	-- 0315: A PROTECTED CLASS ONLY FILLS EMPTY GRADES. Asked before anything is
	-- written, after the reviewer gate, so a refusal is recorded and nothing else.
	v_blocked := public._classroom_grade_protection_check(p_item_id, v_email, 'grade', p_scores);
	if v_blocked is not null then
		return v_blocked;
	end if;

	-- 0305: A TEAM ASSIGNMENT IS GRADED BY TEAM, and only through
	-- classroom_grade_team, which names the team for this transaction. Team
	-- criteria are therefore one score copied to every member, with no
	-- per-student path past them; a role criterion is scored only for the
	-- student who owns that role on the team plan, and a student holding two
	-- roles gets the mean of the two role blocks, so every member's maximum is
	-- the same (_classroom_item_out_of). A direct score does not apply.
	if public._classroom_html_team_manifest(p_item_id) is not null then
		select c.team_id into v_team from public._classroom_team_ctx(p_item_id, v_email) c;
		if v_team is null then
			raise exception 'This student is not on a team for this assignment.';
		end if;
		if coalesce(current_setting('idea.team_grade', true), '') <> v_team::text then
			raise exception 'Grade this assignment by team, from its Teams screen.';
		end if;
		v_direct := null;
		v_role_of := public._classroom_role_criteria(p_item_id);
		v_roles := public._classroom_owned_roles(p_item_id, v_team, v_email);
		if v_role_of <> '{}'::jsonb and cardinality(v_roles) = 0 then
			raise exception 'This student owns no role on this assignment. Set the roles on the team plan first.';
		end if;
	end if;

	select r.criteria into v_criteria from public.classroom_rubrics r where r.item_id = p_item_id;
	if v_criteria is null and v_direct is null then
		raise exception 'Create a rubric for this assignment before grading.';
	end if;
	if p_scores is null or jsonb_typeof(p_scores) <> 'object' then
		raise exception 'Scores must be an object keyed by rubric criterion id.';
	end if;
	if p_criterion_comments is not null and jsonb_typeof(p_criterion_comments) not in ('object', 'null') then
		raise exception 'Criterion comments must be an object keyed by rubric criterion id.';
	end if;

	if p_extra_credit is not null then
		if p_extra_credit < 0 then
			raise exception 'Extra credit cannot be negative. To lower a score, score the rubric criteria lower.';
		end if;
		if p_extra_credit > 10000 then
			raise exception 'Extra credit must be 10000 or less.';
		end if;
	end if;

	if v_criteria is not null then
		for v_n in 0 .. jsonb_array_length(v_criteria) - 1 loop
			v_crit := v_criteria->v_n;
			v_key := v_crit->>'id';
			v_known := v_known || v_key;
			-- 0305: another member's role criterion is not this student's.
			v_crit_role := v_role_of->>v_key;
			if v_crit_role is not null and v_crit_role <> all (v_roles) then
				if jsonb_typeof(p_scores->v_key) is distinct from 'null' and p_scores ? v_key then
					raise exception 'The score for "%" belongs to a role this student does not own.', v_crit->>'criterion';
				end if;
				continue;
			end if;
			v_value := p_scores->v_key;
			v_note := nullif(btrim(coalesce(p_criterion_comments->>v_key, '')), '');
			if char_length(coalesce(v_note, '')) > 1000 then
				raise exception 'The comment on "%" is too long (1000 characters max).', v_crit->>'criterion';
			end if;

			if v_value is null or jsonb_typeof(v_value) = 'null' then
				v_missing := v_missing || v_key;
				if v_note is not null then
					v_comments := v_comments || jsonb_build_object(v_key, v_note);
				end if;
				continue;
			end if;

			if jsonb_typeof(v_value) <> 'number' then
				raise exception 'The score for "%" must be a number.', v_crit->>'criterion';
			end if;
			v_given := (p_scores->>v_key)::numeric;
			if v_given < 0 or v_given > (v_crit->>'points')::numeric then
				raise exception 'The score for "%" must be between 0 and %.',
					v_crit->>'criterion', v_crit->>'points';
			end if;
			if v_crit_role is null then
				v_score := v_score + v_given;
			else
				v_role_sum := v_role_sum + v_given;
			end if;

			v_on_level := false;
			if jsonb_typeof(v_crit->'levels') = 'array' then
				for v_k in 0 .. jsonb_array_length(v_crit->'levels') - 1 loop
					if jsonb_typeof(v_crit->'levels'->v_k->'points') = 'number'
						and (v_crit->'levels'->v_k->>'points')::numeric = v_given then
						v_on_level := true;
						exit;
					end if;
				end loop;
			end if;
			if not v_on_level and v_note is null then
				v_uncommented := v_uncommented || v_key;
			end if;
			if v_note is not null then
				v_comments := v_comments || jsonb_build_object(v_key, v_note);
			end if;
		end loop;
	end if;

	for v_key in select jsonb_object_keys(p_scores) loop
		if v_key <> all (v_known) then
			raise exception 'Score key "%" is not a rubric criterion.', v_key;
		end if;
	end loop;
	if p_criterion_comments is not null and jsonb_typeof(p_criterion_comments) = 'object' then
		for v_key in select jsonb_object_keys(p_criterion_comments) loop
			if v_key <> all (v_known) then
				raise exception 'Comment key "%" is not a rubric criterion.', v_key;
			end if;
		end loop;
	end if;

	if array_length(v_uncommented, 1) is not null then
		return jsonb_build_object('ok', false, 'reason', 'override_needs_comment', 'missing', to_jsonb(v_uncommented));
	end if;
	-- A DIRECT SCORE IS A COMPLETE SCORE: the rubric need not be filled in.
	if p_return and v_direct is null and array_length(v_missing, 1) is not null then
		return jsonb_build_object('ok', false, 'reason', 'incomplete_scores', 'missing', to_jsonb(v_missing));
	end if;

	-- 0305: the role blocks this student owns, as their mean.
	if cardinality(v_roles) > 0 then
		v_score := v_score + v_role_sum / cardinality(v_roles);
	end if;

	-- 0321: A RUBRIC SCALED TO THE POST'S POINTS (report 5b1693c1). With the
	-- post's scale switch on, the rubric's points are scaled to the post's
	-- points (Hook 03: 70 rubric points on a 20 point post), to two places.
	-- A typed score is already out of the post's total and is not scaled.
	v_scale_to := public._classroom_item_scaled_points(p_item_id);
	if v_scale_to is not null and v_direct is null then
		v_scale_from := public._classroom_item_rubric_total(p_item_id);
		if v_scale_from is not null and v_scale_from > 0 then
			v_score := round(v_score * v_scale_to / v_scale_from, 2);
		end if;
	end if;

	if p_extra_credit is null then
		select s.extra_credit into v_extra
		from public.classroom_submissions s
		where s.item_id = p_item_id and s.student_email = v_email;
	else
		v_extra := p_extra_credit;
	end if;

	-- BOUGHT POINTS STAY. A grader's extra credit can raise them, never remove them.
	if v_sub_id is not null then
		v_bought := public._coin_purchased_extra_credit(v_sub_id);
		if v_bought > 0 and coalesce(v_extra, 0) < v_bought then
			v_extra := v_bought;
		end if;
	end if;

	if v_direct is not null then
		v_score := v_direct;
	end if;
	v_score := v_score + coalesce(v_extra, 0);

	insert into public.classroom_submissions
		(item_id, student_email, rubric_scores, criterion_comments, score, extra_credit,
		 teacher_comment, graded_by, graded_at, updated_at)
	values (p_item_id, v_email, p_scores, v_comments, v_score, v_extra,
		nullif(btrim(coalesce(p_comment, '')), ''), public.current_user_email(), v_now, v_now)
	on conflict (item_id, student_email) do update
		set rubric_scores = excluded.rubric_scores,
			criterion_comments = excluded.criterion_comments,
			score = excluded.score,
			extra_credit = excluded.extra_credit,
			teacher_comment = excluded.teacher_comment,
			graded_by = excluded.graded_by,
			graded_at = v_now,
			updated_at = v_now
	returning id into v_sub_id;

	if p_return then
		update public.classroom_submissions
		set state = 'returned', returned_at = v_now, updated_at = v_now
		where item_id = p_item_id and student_email = v_email;
	end if;

	select s.state into v_state
	from public.classroom_submissions s
	where s.item_id = p_item_id and s.student_email = v_email;

	-- PERFECT SCORE, BEST EFFORT. Instrumentation-grade: a coin failure can
	-- never undo a grade, and the nightly run settles anything missed here.
	begin
		perform public._coin_perfect_score_sync(v_sub_id);
	exception when others then
		raise warning 'perfect score sync failed for %: %', v_sub_id, sqlerrm;
	end;

	return jsonb_build_object(
		'ok', true, 'score', v_score, 'state', v_state, 'extra_credit', v_extra, 'direct_score', v_direct
	);
end;
$$;

revoke all on function public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb, numeric)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_grade_submission(uuid, text, jsonb, text, boolean, jsonb, numeric) to authenticated;

-- classroom_grade_direct: 0315's body whole, with the 0321 line marked.
create or replace function public.classroom_grade_direct(
	p_item_id uuid,
	p_student_email text,
	p_score numeric,
	p_comment text,
	p_return boolean,
	p_extra_credit numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_student_email, '')));
	v_out numeric;
	v_scores jsonb;
	v_comments jsonb;
	v_blocked jsonb;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_items i where i.id = p_item_id and i.kind = 'assignment') then
		raise exception 'That assignment does not exist.';
	end if;
	if not public.classroom_can_review_submission(p_item_id, v_email) then
		raise exception 'Only a teacher of record for this student''s class can grade this.';
	end if;
	-- 0315: refused before the typed score is stored, never after.
	v_blocked := public._classroom_grade_protection_check(p_item_id, v_email, 'typed score',
		jsonb_build_object('score', p_score));
	if v_blocked is not null then
		return v_blocked;
	end if;
	-- 0321: with the rubric scaled to the post's points, a typed score is out
	-- of the post's points too.
	v_out := coalesce(public._classroom_item_scaled_points(p_item_id), public._classroom_item_out_of(p_item_id));
	if p_score is not null then
		if v_out is null or v_out <= 0 then
			return jsonb_build_object('ok', false, 'reason', 'no_total');
		end if;
		if p_score < 0 or p_score > v_out then
			return jsonb_build_object('ok', false, 'reason', 'out_of_range', 'out_of', v_out);
		end if;
	end if;

	insert into public.classroom_submissions (item_id, student_email, direct_score, updated_at)
	values (p_item_id, v_email, p_score, now())
	on conflict (item_id, student_email) do update set direct_score = excluded.direct_score;

	select coalesce(s.rubric_scores, '{}'::jsonb), s.criterion_comments into v_scores, v_comments
	from public.classroom_submissions s where s.item_id = p_item_id and s.student_email = v_email;
	if not exists (select 1 from public.classroom_rubrics r where r.item_id = p_item_id) then
		v_scores := '{}'::jsonb;
		v_comments := null;
	end if;

	return public.classroom_grade_submission(p_item_id, v_email, v_scores, p_comment,
		coalesce(p_return, false), v_comments, p_extra_credit) || jsonb_build_object('out_of', v_out);
end;
$$;
revoke all on function public.classroom_grade_direct(uuid, text, numeric, text, boolean, numeric) from public, anon, authenticated, service_role;
grant execute on function public.classroom_grade_direct(uuid, text, numeric, text, boolean, numeric) to authenticated;

-- classroom_needs_grading: 0315's body, with each student's own due date (0321).
create or replace function public.classroom_needs_grading(
	p_sections uuid[] default null,
	p_exclude uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
	v_me text := lower(btrim(coalesce(public.current_user_email(), '')));
	v_out jsonb;
begin
	if (select auth.uid()) is null or v_me = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_sections is not null and exists (
		select 1 from unnest(p_sections) x(id) where not public.classroom_manages_section(x.id)
	) then
		raise exception 'Only a teacher of record for a class can see what it needs graded.';
	end if;

	with classes as (
		select s.id, s.label, s.block, c.code, c.title as course_title
		from public.classroom_sections s
		join public.classroom_courses c on c.id = s.course_id
		where (case when p_sections is null
				then s.teacher_email = v_me and s.active
				else s.id = any (p_sections) end)
			and not (s.id = any (coalesce(p_exclude, '{}'::uuid[])))
	),
	posts as (
		select cl.id as section_id, i.id as item_id, i.title, i.points, i.due_at, i.assignment_schema_version
		from classes cl
		join public.classroom_postings pg on pg.section_id = cl.id
		join public.classroom_items i on i.id = pg.item_id
		where i.kind = 'assignment'
			and i.published
			and (i.publish_at is null or i.publish_at <= now())
			and i.due_at is not null
	),
	waiting as (
		select p.section_id, p.item_id, e.student_email, e.display_name,
			sub.state, sub.submitted_at,
			-- 0321: this student's own due date and absent mark.
			coalesce(sd.due_at, p.due_at) as own_due,
			coalesce(sd.absent, false) as absent,
			(select count(*) from public.classroom_responses r
				where r.item_id = p.item_id and r.student_email = e.student_email) as answers,
			(select max(r.updated_at) from public.classroom_responses r
				where r.item_id = p.item_id and r.student_email = e.student_email) as last_answer,
			(select count(*) from public.classroom_submission_files f where f.submission_id = sub.id) as files
		from posts p
		join public.classroom_enrollments e on e.section_id = p.section_id and e.active
		left join public.classroom_submissions sub on sub.item_id = p.item_id and sub.student_email = e.student_email
		left join public.classroom_student_due sd on sd.item_id = p.item_id and sd.student_email = e.student_email
		where not public._classroom_manages_section_email(p.section_id, e.student_email)
			and e.student_email not in (select public._idea_test_emails())
			and (sub.id is null or (sub.graded_at is null and sub.returned_at is null))
	),
	ready as (
		select w.*, p.title, p.points, p.due_at as post_due, p.assignment_schema_version
		from waiting w join posts p on p.section_id = w.section_id and p.item_id = w.item_id
		where (w.answers > 0 or w.files > 0 or w.submitted_at is not null)
			-- Past THIS student's due date; absent and still in time is not waiting.
			and w.own_due < now()
	),
	per_item as (
		select r.section_id, r.item_id, r.title, r.points, r.post_due as due_at,
			r.assignment_schema_version = 3 as html,
			public._classroom_html_team_manifest(r.item_id) is not null as team,
			jsonb_agg(jsonb_build_object(
				'email', r.student_email,
				'name', r.display_name,
				'turned_in', r.submitted_at is not null,
				'answers', r.answers,
				'files', r.files,
				'last_saved', r.last_answer,
				'saved_after_due', r.last_answer is not null and r.last_answer > r.own_due,
				'due_at', case when r.own_due is distinct from r.post_due then r.own_due end,
				'absent', r.absent or null
			) order by r.display_name, r.student_email) as students,
			count(*) as n
		from ready r
		group by r.section_id, r.item_id, r.title, r.points, r.post_due, r.assignment_schema_version
	)
	select jsonb_build_object(
		'ok', true,
		'classes', coalesce(jsonb_agg(jsonb_build_object(
			'section_id', cl.id,
			'course', cl.code,
			'course_title', cl.course_title,
			'label', cl.label,
			'block', cl.block,
			'waiting', coalesce((select sum(pi.n) from per_item pi where pi.section_id = cl.id), 0),
			'items', coalesce((select jsonb_agg(jsonb_build_object(
					'item_id', pi.item_id, 'title', pi.title, 'points', pi.points, 'due_at', pi.due_at,
					'html', pi.html, 'team', pi.team, 'waiting', pi.n, 'students', pi.students
				) order by pi.due_at, pi.title) from per_item pi where pi.section_id = cl.id), '[]'::jsonb)
		) order by cl.code, cl.label), '[]'::jsonb),
		'excluded', coalesce((
			select jsonb_agg(jsonb_build_object('section_id', s.id, 'course', c.code, 'label', s.label, 'block', s.block) order by c.code, s.label)
			from public.classroom_sections s join public.classroom_courses c on c.id = s.course_id
			where s.id = any (coalesce(p_exclude, '{}'::uuid[])) and public.classroom_manages_section(s.id)
		), '[]'::jsonb)
	)
	into v_out
	from classes cl;
	return v_out;
end;
$f$;

revoke all on function public.classroom_needs_grading(uuid[], uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.classroom_needs_grading(uuid[], uuid[]) to authenticated;

-- ===== self-check =====
do $check$
declare
	v_fn text;
	v_n integer;
begin
	select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_grade_submission';
	if v_n <> 2 then
		raise exception '0321: expected exactly 2 arities of classroom_grade_submission, found %.', v_n;
	end if;
	foreach v_fn in array array[
		'public.classroom_set_student_due(uuid, jsonb)',
		'public.classroom_student_due_dates(uuid)',
		'public.classroom_item_grading_settings(uuid)',
		'public.classroom_set_item_grading(uuid, numeric, boolean, boolean)',
		'public.classroom_grade_late_credit(uuid, text, jsonb, jsonb, numeric, text, boolean)',
		'public.classroom_item_team_draw(uuid)',
		'public.classroom_set_grade_targets(uuid, jsonb)',
		'public._classroom_student_due_at(uuid, text)',
		'public._classroom_school_days_after(date, integer)',
		'public._classroom_item_scaled_points(uuid)',
		'public._classroom_item_rubric_total(uuid)'
	] loop
		if has_function_privilege('anon', v_fn, 'execute') then
			raise exception '0321: % is executable by anon.', v_fn;
		end if;
	end loop;
	if has_table_privilege('anon', 'public.classroom_response_versions', 'select')
		or has_table_privilege('anon', 'public.classroom_student_due', 'select')
		or has_table_privilege('authenticated', 'public.classroom_response_versions', 'insert') then
		raise exception '0321: a new table is open to a client it must not be.';
	end if;
	if not exists (select 1 from pg_trigger where tgname = 'classroom_responses_keep_on_time' and not tgisinternal) then
		raise exception '0321: the on-time version trigger is missing.';
	end if;
	if not exists (
		select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'classroom_grade_submission' and p.pronargs = 7
			and p.prosrc like '%_classroom_grade_protection_check%' and p.prosrc like '%_classroom_item_scaled_points%'
	) then
		raise exception '0321: the grading rule lost its protection or its scaling.';
	end if;
	raise notice '0321: per-student due dates, on-time answer versions (kept from now on; earlier edits cannot be recovered), late credit, team draws and % syllabus categories are in place.',
		(select count(*) from public.classroom_course_grade_targets);
end
$check$;
