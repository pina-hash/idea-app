-- 0174_classroom_hall_pass_limits.sql
--
-- THE HALL PASS GETS A LIMIT, AND THE LIMIT IS THE DATABASE'S.
--
-- 0143 shipped the pass with this written into its own header: "NO AUTO-CLOSE
-- AND NO TIME LIMIT. Nothing in this file expires a pass ... A long absence is
-- a conversation an instructor has, not something the schema adjudicates." That
-- sentence is still true and this file does not touch it -- NOTHING HERE
-- EXPIRES OR AUTO-CLOSES A PASS, and no duration is adjudicated by anybody but
-- the instructor. What 0143 did not say, and what an instructor reported, is
-- that a student may take an UNBOUNDED NUMBER of passes and may take the next
-- one the instant the last one ends. That is a different question from how long
-- one trip lasts, and it is the one this file answers.
--
-- ---------------------------------------------------------------------------
-- THREE DEFECTS, WHICH ARE THREE DIFFERENT RULES. "Spam" is not one thing.
-- ---------------------------------------------------------------------------
--
--   1. HOLDING SEVERAL PASSES AT ONCE. 0143's partial unique index is on
--      `(section_id) where closed_at is null` -- ONE OPEN ROW PER SECTION, not
--      per student. So a student enrolled in two sections could hold an open
--      pass in each: marked out of two classes, counted twice in two histories,
--      and occupying a slot in a room they are not even in. The index cannot
--      see this, because it is per section by construction.
--      FIXED HERE by asking, before the insert, whether this student already
--      holds an open pass ANYWHERE. It reuses the existing `already_out`
--      refusal rather than inventing a word: the sentence a student reads
--      ("You are already signed out.") is exactly true, and it is about their
--      own row, so it discloses nothing new.
--
--   2. TAKING THE NEXT ONE IMMEDIATELY. Nothing stood between a close and the
--      next open. A student could sign back in and straight out again, all
--      period, and every row is well formed.
--      FIXED HERE by a COOLDOWN measured from the last pass's `closed_at` in
--      THIS section. The refusal carries `retry_at`, an absolute instant, so
--      the sentence on screen can name a clock time. A refusal with no time in
--      it gets asked again immediately, in person, which is the thing this is
--      meant to stop.
--
--   3. AN UNBOUNDED NUMBER ACROSS A PERIOD. Nothing counted.
--      FIXED HERE by a per-student, per-section cap on passes OPENED on the
--      current school day. The refusal carries `used` and `limit`.
--
-- WHY THE DAY AND NOT THE PERIOD. There is no period boundary anywhere in this
-- schema -- `classroom_sections.block` is a label, not a time window, and
-- nothing records when a class meets. The America/Los_Angeles CALENDAR DAY is
-- the window this codebase already adjudicates school time in (the 0140 rule),
-- a section meets at most once a day, and a day is a window a student and an
-- instructor can both count in their heads. UTC is refused for the reason 0140
-- gives: it runs seven or eight hours ahead, so a pass taken at 5pm Pacific
-- would land on tomorrow's tally.
--
-- ---------------------------------------------------------------------------
-- THE NUMBERS ARE WRITTEN DOWN ONCE, IN `_classroom_hall_pass_limits()`
-- ---------------------------------------------------------------------------
--
-- The `_foundry_play_window()` shape (0139): a resume window and a staleness
-- window spelled as two literals thirty lines apart is how they stop being the
-- same number. Here the same value is read by the OPEN path (which refuses on
-- it) and by the STATE path (which projects it so the surface can say "2 of 3
-- used today" BEFORE anybody taps). Two literals would be a button that
-- disagreed with the refusal behind it.
--
-- AND THE VALUES ARE PROJECTED, NOT MIRRORED. `classroom_hall_pass_state`
-- returns `limits` on both branches, so no client, component or constant
-- anywhere restates 10 or 3. A component that hardcoded either would be a
-- second statement of a rule this file owns.
--
-- NOT PER-SECTION CONFIGURABLE, DELIBERATELY, AND THAT IS THE SMALLER CHANGE.
-- A per-section override is a column, a settings control, a validation rule and
-- an answer for every section that has no value yet. The instructor override
-- below covers the case that actually arrives -- this student, right now, needs
-- to go -- without any of it. If the numbers themselves turn out wrong for a
-- room, that is a one-line change to this function in its own migration.
--
-- ---------------------------------------------------------------------------
-- THE OVERRIDE, AND WHY IT NEEDED A COLUMN
-- ---------------------------------------------------------------------------
--
-- A RULE WITH NO OVERRIDE BECOMES A RULE THE INSTRUCTOR WORKS AROUND, and a
-- bathroom is not a place to be rigid. `classroom_hall_pass_open_for` lets an
-- instructor of the section open a pass FOR a named student, bypassing the
-- cooldown and the cap.
--
-- IT BYPASSES EXACTLY TWO THINGS AND NOTHING ELSE. The capacity index still
-- holds (one out per section), the cross-section rule still holds (nobody is
-- out of two rooms at once), and the student must still be actively enrolled.
-- An override is permission to go now, not permission to be in two places.
--
-- `opened_by` IS THE ONE COLUMN THIS FILE ADDS, and it is what makes the
-- override auditable. Without it an overridden pass is byte-identical to a
-- self-opened one, so the history an instructor reads could not tell "this
-- student went four times" from "this student went once and I sent them three
-- times" -- and a limit whose overrides leave no trace is a limit nobody can
-- check. It is the exact mirror of `closed_by`, which 0143 added for the same
-- reason ("the only reason it is a column rather than derived is that it
-- genuinely cannot be derived").
--
-- NULL MEANS THE STUDENT THEMSELVES, and NOTHING IS BACKFILLED: every row
-- written before this file was self-opened, which is what null already says. A
-- backfill would be writing a value nobody knows.
--
-- AN OVERRIDDEN PASS STILL COUNTS TOWARD THE CAP. The instructor said yes to
-- ONE trip; it is not a licence for the rest of the day. So the next request
-- needs another override, which is the instructor deciding again -- which is
-- the point.
--
-- ---------------------------------------------------------------------------
-- DISCLOSURE IS UNCHANGED, WHICH IS THE PART TO CHECK
-- ---------------------------------------------------------------------------
--
-- 0143's whole argument is that an enrolled student learns ONE BIT about a pass
-- that is not theirs. Everything added to the student branch below is about the
-- CALLER THEMSELVES: how many passes THEY have taken today, when THEY may go
-- again, and the two numbers the rule uses. There is still no name, no email,
-- no pass id and no history on that branch, and `opened_by` is projected ONLY
-- into the manager history. `HallPassStudentState` still has no field capable
-- of naming anybody, which is swept for in tests/classroom-hall-pass.test.ts.
--
-- ---------------------------------------------------------------------------
-- SIGNATURES AND ORDERING
-- ---------------------------------------------------------------------------
--
-- NO SIGNATURE IS WIDENED, so the SIGNATURE TRAP does not arise and there is no
-- drop anywhere in this file. `classroom_hall_pass_state(uuid, integer)` and
-- `classroom_hall_pass_open(uuid)` keep their exact argument lists and are
-- replaced in place; `classroom_hall_pass_open_for(uuid, text)` and
-- `_classroom_hall_pass_limits()` are new names.
--
-- THE ORDERING IS THEREFORE FREE IN ONE DIRECTION AND NOT THE OTHER, and the
-- direction that matters is the safe one: apply this file FIRST and the
-- deployed client keeps working unchanged -- it simply renders the generic
-- "Something went wrong. Try again." for the two new refusal reasons it does
-- not know, which is a worse sentence for a limit that is now real. Deploy the
-- client first and the limit is not enforced yet and its surface says so
-- (`limits` is absent from the payload). Neither breaks. Prefer applying this
-- file first, so the enforcement and its explanation land in the same minute.
--
-- WHAT UNDOES IT. There is no destructive step to reverse. To turn the limit
-- off, re-apply 0143 section 3 and this file's section 3 with the two guards
-- removed; the `opened_by` column and the two new functions are inert without
-- them. To remove it entirely: `drop function public.classroom_hall_pass_open_for(uuid, text);`
-- `drop function public._classroom_hall_pass_limits();`
-- `alter table public.classroom_hall_passes drop column opened_by;` then
-- re-apply 0143's `classroom_hall_pass_open` and `classroom_hall_pass_state`
-- verbatim. No row is deleted by any of that.

-- ---------------------------------------------------------------------------
-- 1. The numbers, in one place.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_hall_pass_limits()
returns jsonb
language sql
immutable
set search_path = ''
as $$
	-- MINUTES between one pass closing and the next opening, and PASSES per
	-- student per section per school day. Read by the open path (which refuses
	-- on them) and by the state path (which projects them), so there is exactly
	-- one statement of each.
	select jsonb_build_object('cooldown_minutes', 10, 'daily_limit', 3);
$$;

comment on function public._classroom_hall_pass_limits() is
'The hall pass limits, written down once (0174): cooldown_minutes between a close and the next open, and daily_limit passes per student per section per America/Los_Angeles calendar day.

Read by classroom_hall_pass_open (which refuses on them) and projected by classroom_hall_pass_state (so a surface can explain the rule without restating the numbers). No client calls it and none needs to: the values ride on the state payload.';

revoke all on function public._classroom_hall_pass_limits()
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. `opened_by`: the override's trace. Mirrors `closed_by`.
-- ---------------------------------------------------------------------------

alter table public.classroom_hall_passes
	add column if not exists opened_by text;

comment on column public.classroom_hall_passes.opened_by is
'NULL when the student opened their own pass, which is every row written before 0174 and every ordinary pass since. An email is the instructor who used classroom_hall_pass_open_for to override the cooldown or the daily cap for this student.

Nothing is backfilled: null already says "the student themselves". Projected only into the manager branch of classroom_hall_pass_state -- a student is never told who opened anybody else''s pass, because a student is never told about anybody else''s pass at all.';

-- ---------------------------------------------------------------------------
-- 3. Opening: the same function, with the two guards and the cross-section one.
--
-- REPLACED IN PLACE at its exact 0143 signature. Every refusal 0143 could give
-- is still given, with the identical `reason` strings, in the identical order
-- for the cases it already covered.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_hall_pass_open(p_section_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_id uuid;
	v_opened timestamptz;
	v_holder text;
	v_limits jsonb := public._classroom_hall_pass_limits();
	v_cooldown interval;
	v_cap integer;
	v_used integer;
	v_last_closed timestamptz;
	v_retry timestamptz;
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;

	if p_section_id is null or not public.classroom_can_read_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;

	-- 0143's rule, unchanged and still asked first: an instructor does not take
	-- a hall pass even holding an enrollment row, which they routinely do (0138).
	if public.classroom_manages_section(p_section_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_a_student');
	end if;

	if not public.classroom_is_enrolled(p_section_id) then
		raise exception 'Only a student enrolled in this class can take the hall pass.';
	end if;

	-- DEFECT 1: ONE BODY, ONE CORRIDOR. The capacity index is per SECTION, so it
	-- cannot see a student holding an open pass in a different class. Asked
	-- before the cheaper counting so the answer is about what is true NOW rather
	-- than about a tally.
	if exists (
		select 1 from public.classroom_hall_passes h
		where h.student_email = v_email and h.closed_at is null
	) then
		return jsonb_build_object('ok', false, 'reason', 'already_out');
	end if;

	v_cap := (v_limits ->> 'daily_limit')::integer;
	v_cooldown := make_interval(mins => (v_limits ->> 'cooldown_minutes')::integer);

	-- DEFECT 3: THE DAILY CAP, on the America/Los_Angeles calendar day (0140's
	-- clock, which is the one school time is adjudicated in here). Counted per
	-- STUDENT per SECTION: another class's trips are another class's business.
	select count(*) into v_used
	from public.classroom_hall_passes h
	where h.section_id = p_section_id
		and h.student_email = v_email
		and (h.opened_at at time zone 'America/Los_Angeles')::date
			= (now() at time zone 'America/Los_Angeles')::date;

	-- ASKED BEFORE THE COOLDOWN, because at the cap the cooldown is irrelevant
	-- and naming it would offer a time that will not help.
	if v_used >= v_cap then
		return jsonb_build_object(
			'ok', false,
			'reason', 'limit_reached',
			'used', v_used,
			'limit', v_cap
		);
	end if;

	-- DEFECT 2: THE COOLDOWN, from the last pass CLOSING in this section. The
	-- instant is returned so the sentence on screen can name a clock time; a
	-- refusal with no time in it is asked again immediately, in person.
	select max(h.closed_at) into v_last_closed
	from public.classroom_hall_passes h
	where h.section_id = p_section_id and h.student_email = v_email;

	if v_last_closed is not null and now() < v_last_closed + v_cooldown then
		v_retry := v_last_closed + v_cooldown;
		return jsonb_build_object(
			'ok', false,
			'reason', 'cooldown',
			'retry_at', v_retry,
			'used', v_used,
			'limit', v_cap
		);
	end if;

	begin
		-- `opened_by` STAYS NULL HERE. This is the student opening their own.
		insert into public.classroom_hall_passes (section_id, student_email)
		values (p_section_id, v_email)
		returning id, opened_at into v_id, v_opened;
	exception when unique_violation then
		-- 0143's capacity refusal, unchanged: the state is re-asked rather than
		-- assumed, and the message never names the index, the table or the
		-- SQLSTATE.
		select h.student_email into v_holder
		from public.classroom_hall_passes h
		where h.section_id = p_section_id and h.closed_at is null;

		return jsonb_build_object(
			'ok', false,
			'reason', case when v_holder = v_email then 'already_out' else 'taken' end
		);
	end;

	return jsonb_build_object(
		'ok', true,
		'pass_id', v_id,
		'section_id', p_section_id,
		'opened_at', v_opened,
		'used', v_used + 1,
		'limit', v_cap
	);
end;
$$;

comment on function public.classroom_hall_pass_open(uuid) is
'Signs the CALLER out of one section. Takes no identity parameter: the student is current_user_email(), so acting as somebody else is not expressible.

Refusals, in the order they are asked: not_a_student (an instructor of the section, even with an enrollment row); already_out (this student already holds an open pass in ANY section -- 0174, one body, one corridor); limit_reached with used and limit (0174, the daily cap on the America/Los_Angeles calendar day); cooldown with retry_at, used and limit (0174, measured from the last close in this section); taken or already_out from the capacity index (0143).

Nothing here expires or auto-closes a pass. 0143''s "a long absence is a conversation an instructor has" is unchanged -- 0174 limits how OFTEN a pass may be taken, never how long one lasts.';

revoke all on function public.classroom_hall_pass_open(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_hall_pass_open(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The override.
-- ---------------------------------------------------------------------------
--
-- MANAGER ONLY, AND IT NAMES THE STUDENT -- which is the opposite of the open
-- path above and is correct for the same reason 0144 split the close: the
-- person acting is deciding ABOUT somebody, and the only honest way to carry
-- that intent is to say who. A manager's own state payload already hands them
-- the roster's names, so a student email costs them no disclosure whatever.
--
-- IT DOES NOT WIDEN WHO MAY BE SENT OUT. The student must be actively enrolled,
-- must not already be out anywhere, and the section's one-at-a-time capacity
-- index still applies. An override is permission to go NOW, not permission to
-- be in two places or to displace whoever is already in the corridor.
create or replace function public.classroom_hall_pass_open_for(
	p_section_id uuid,
	p_student_email text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_target text := lower(btrim(coalesce(p_student_email, '')));
	v_id uuid;
	v_opened timestamptz;
	v_name text;
	v_active boolean;
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;

	-- NOT FOUND AND NOT YOURS ANSWER IDENTICALLY. A section the caller does not
	-- manage and one that does not exist raise the same sentence, so neither an
	-- id nor a roster can be probed through this path.
	if p_section_id is null or not public.classroom_manages_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;

	if v_target = '' or v_target not like '%@%' then
		raise exception 'A student email is required.';
	end if;

	select e.active, e.display_name into v_active, v_name
	from public.classroom_enrollments e
	where e.section_id = p_section_id and e.student_email = v_target;

	-- A NAME THE ROSTER DOES NOT HOLD AND A DEACTIVATED ONE ANSWER THE SAME WAY.
	-- A refusal rather than a raise: picking the wrong row off a list is an
	-- ordinary mistake and the surface should say so where the instructor is
	-- working.
	if v_active is not true then
		return jsonb_build_object('ok', false, 'reason', 'not_enrolled');
	end if;

	-- The cross-section rule is NOT overridable: it is not a limit on how often
	-- somebody may go, it is the fact that a person is already gone.
	if exists (
		select 1 from public.classroom_hall_passes h
		where h.student_email = v_target and h.closed_at is null
	) then
		return jsonb_build_object('ok', false, 'reason', 'already_out');
	end if;

	begin
		-- `opened_by` IS THE WHOLE AUDIT TRAIL. Without it this row is
		-- indistinguishable from a self-opened one and the history cannot tell
		-- "went four times" from "was sent three of those times".
		insert into public.classroom_hall_passes (section_id, student_email, opened_by)
		values (p_section_id, v_target, v_email)
		returning id, opened_at into v_id, v_opened;
	exception when unique_violation then
		-- Somebody else is already out of this room. The capacity index is not
		-- overridable either, and 0143's refusal word is reused unchanged.
		return jsonb_build_object('ok', false, 'reason', 'taken');
	end;

	return jsonb_build_object(
		'ok', true,
		'pass_id', v_id,
		'section_id', p_section_id,
		'opened_at', v_opened,
		'student_email', v_target,
		'student_name', coalesce(v_name, v_target),
		'opened_by', v_email
	);
end;
$$;

comment on function public.classroom_hall_pass_open_for(uuid, text) is
'An instructor of the section opens a pass FOR a named student, overriding 0174''s cooldown and daily cap. Anyone who does not manage the section raises the same sentence a nonexistent section raises, so neither an id nor a roster is probeable here.

It overrides exactly two things. The student must still be ACTIVELY ENROLLED (not_enrolled), must not already hold an open pass in any section (already_out), and the section''s one-at-a-time capacity index still applies (taken).

The row records opened_by, so the history distinguishes a trip the student took from one the instructor authorized. An overridden pass still counts toward that day''s cap: the instructor said yes to one trip, not to the rest of the day.';

revoke all on function public.classroom_hall_pass_open_for(uuid, text)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_hall_pass_open_for(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The state, with the limit projected so the surface can explain itself.
--
-- REPLACED IN PLACE at its exact 0143 signature. THE TWO BRANCHES ARE STILL
-- BUILT SEPARATELY and still share no object -- everything added to the student
-- branch is about the CALLER THEMSELVES.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_hall_pass_state(
	p_section_id uuid,
	p_history_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_manages boolean;
	v_open_id uuid;
	v_open_email text;
	v_open_name text;
	v_open_at timestamptz;
	v_limit integer := least(greatest(coalesce(p_history_limit, 20), 0), 100);
	v_history jsonb;
	v_limits jsonb := public._classroom_hall_pass_limits();
	v_used integer;
	v_last_closed timestamptz;
	v_retry timestamptz;
	v_roster jsonb;
begin
	if v_email = '' or p_section_id is null then
		return null;
	end if;

	v_manages := public.classroom_manages_section(p_section_id);

	if not v_manages and not public.classroom_is_enrolled(p_section_id) then
		return null;
	end if;

	select h.id, h.student_email, h.opened_at
	into v_open_id, v_open_email, v_open_at
	from public.classroom_hall_passes h
	where h.section_id = p_section_id and h.closed_at is null;

	if v_manages then
		if v_open_email is not null then
			select e.display_name into v_open_name
			from public.classroom_enrollments e
			where e.section_id = p_section_id and e.student_email = v_open_email;
		end if;

		select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.opened_at desc), '[]'::jsonb)
		into v_history
		from (
			select
				h.id as pass_id,
				h.student_email,
				coalesce(e.display_name, h.student_email) as student_name,
				h.opened_at,
				h.closed_at,
				h.closed_by,
				-- 0174. NULL means the student opened it themselves; an email is
				-- the instructor who overrode the limit for them.
				h.opened_by
			from public.classroom_hall_passes h
			left join public.classroom_enrollments e
				on e.section_id = h.section_id and e.student_email = h.student_email
			where h.section_id = p_section_id
			order by h.opened_at desc
			limit v_limit
		) x;

		-- THE ROSTER RIDES ALONG, FOR THE OVERRIDE CONTROL AND NOTHING ELSE.
		-- `classroom_hall_pass_open_for` names a student, so the surface offering
		-- it has to be able to name one -- and an override control that made the
		-- instructor TYPE an email address is a control nobody uses correctly at
		-- the classroom door. It discloses nothing: this caller manages the
		-- section, so they read the identical rows on the People tab, and the
		-- STUDENT BRANCH BELOW NEVER EVALUATES THIS EXPRESSION.
		--
		-- ACTIVE ONLY, because `open_for` refuses anybody else -- offering a name
		-- whose only possible answer is a refusal is the thing this omits.
		select coalesce(jsonb_agg(jsonb_build_object(
			'student_email', e.student_email,
			'student_name', coalesce(nullif(btrim(e.display_name), ''), e.student_email)
		) order by coalesce(nullif(btrim(e.display_name), ''), e.student_email)), '[]'::jsonb)
		into v_roster
		from public.classroom_enrollments e
		where e.section_id = p_section_id and e.active;

		return jsonb_build_object(
			'scope', 'manager',
			'section_id', p_section_id,
			'taken', v_open_id is not null,
			'mine', false,
			-- The numbers, so the instructor surface states the rule it is
			-- overriding without writing either figure down a second time.
			'limits', v_limits,
			'roster', v_roster,
			'open', case
				when v_open_id is null then null
				else jsonb_build_object(
					'pass_id', v_open_id,
					'student_email', v_open_email,
					'student_name', coalesce(v_open_name, v_open_email),
					'opened_at', v_open_at
				)
			end,
			'history', v_history
		);
	end if;

	-- THE STUDENT PROJECTION. Every 0174 field below is about the CALLER: their
	-- own count today, their own next eligible instant, and the two numbers the
	-- rule uses. There is still no name, no email, no pass id and no history.
	select count(*) into v_used
	from public.classroom_hall_passes h
	where h.section_id = p_section_id
		and h.student_email = v_email
		and (h.opened_at at time zone 'America/Los_Angeles')::date
			= (now() at time zone 'America/Los_Angeles')::date;

	select max(h.closed_at) into v_last_closed
	from public.classroom_hall_passes h
	where h.section_id = p_section_id and h.student_email = v_email;

	-- RETURNED ONLY WHILE IT IS STILL IN THE FUTURE. Null means "not on
	-- cooldown", so the client asks one question (is this null) rather than
	-- holding a second copy of the comparison. It can be up to one poll stale,
	-- and the server refusal is what settles that case.
	if v_last_closed is not null
		and now() < v_last_closed + make_interval(mins => (v_limits ->> 'cooldown_minutes')::integer)
	then
		v_retry := v_last_closed + make_interval(mins => (v_limits ->> 'cooldown_minutes')::integer);
	end if;

	return jsonb_build_object(
		'scope', 'student',
		'section_id', p_section_id,
		'taken', v_open_id is not null,
		'mine', v_open_email is not distinct from v_email,
		'opened_at', case when v_open_email is not distinct from v_email then v_open_at end,
		'limits', v_limits,
		'used_today', v_used,
		'retry_at', v_retry
	);
end;
$$;

comment on function public.classroom_hall_pass_state(uuid, integer) is
'The hall pass state for one section, projected by what the caller is.

A MANAGER gets the name, email, opened_at and pass id of whoever is out, the recent history (including 0174''s opened_by, which is null for a self-opened pass and an instructor email for an override), the limits, and the ACTIVE roster -- the last of these only so the override control can name a student, and it is rows this caller already reads on the People tab. AN ENROLLED STUDENT gets whether the pass is taken, whether it is theirs, the limits, THEIR OWN count for today and THEIR OWN next eligible instant -- no name, no email, no pass id, no history, and no opened_at for anybody but themselves. Anyone else gets NULL, which is also what a section id that does not exist returns.

The two projections are built in separate branches on purpose: a field cannot leak by being forgotten in a strip step, because there is no strip step. Do not refactor them into one object.';

revoke all on function public.classroom_hall_pass_state(uuid, integer)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_hall_pass_state(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. What this deployment actually holds.
--
-- The catalog is READ BACK rather than assumed, 0143's rule: a self-check
-- reporting that a statement ran tells an operator only that it ran.
-- ---------------------------------------------------------------------------

do $$
declare
	v_col boolean;
	v_overridden integer;
	v_limits jsonb;
	v_fns integer;
	r record;
begin
	select exists (
		select 1 from information_schema.columns
		where table_schema = 'public'
			and table_name = 'classroom_hall_passes'
			and column_name = 'opened_by'
	) into v_col;
	if not v_col then
		raise exception '0174: classroom_hall_passes.opened_by is missing. The override has no audit trail.';
	end if;

	v_limits := public._classroom_hall_pass_limits();
	if (v_limits ->> 'cooldown_minutes') is null or (v_limits ->> 'daily_limit') is null then
		raise exception '0174: _classroom_hall_pass_limits() is not answering both numbers.';
	end if;

	-- Every hall pass function, read off the catalog. The private limits helper
	-- is the one that must be granted to NOBODY; the rest are authenticated-only.
	v_fns := 0;
	for r in
		select p.oid::regprocedure::text as sig,
			p.proname,
			has_function_privilege('anon', p.oid, 'execute') as anon_x,
			has_function_privilege('authenticated', p.oid, 'execute') as auth_x
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
			and (p.proname like 'classroom_hall_pass%' or p.proname = '_classroom_hall_pass_limits')
		order by 1
	loop
		v_fns := v_fns + 1;
		if r.anon_x then
			raise exception '0174: anon holds EXECUTE on %. A function created after 0137 must revoke for itself.', r.sig;
		end if;
		if r.proname = '_classroom_hall_pass_limits' and r.auth_x then
			raise exception '0174: % is granted to authenticated. It is private -- its values ride on the state payload.', r.sig;
		end if;
		if r.proname <> '_classroom_hall_pass_limits' and not r.auth_x then
			raise exception '0174: % is NOT granted to authenticated, so no client can call it.', r.sig;
		end if;
		raise notice '0174: % -- anon %, authenticated %.', r.sig, r.anon_x, r.auth_x;
	end loop;

	-- 7 = 0143's three + 0144's two + this file's open_for + the limits helper.
	-- A count rather than a list, so a function added later cannot slip past.
	if v_fns <> 7 then
		raise exception '0174: expected 7 hall pass functions, found %. Check 0143/0144 applied first.', v_fns;
	end if;

	select count(*) into v_overridden
	from public.classroom_hall_passes where opened_by is not null;

	raise notice '0174: limits are % -- % minute cooldown, % passes per student per section per America/Los_Angeles day. Nothing was backfilled; % existing pass row(s) carry an override marker (expected 0 on a first apply).',
		v_limits,
		v_limits ->> 'cooldown_minutes',
		v_limits ->> 'daily_limit',
		v_overridden;
	raise notice '0174: no pass is expired, auto-closed or shortened by this file. 0143''s "a long absence is a conversation an instructor has" is unchanged.';
end $$;
