-- 0200_classroom_presence.sql
--
-- WHO IS ACTUALLY WORKING: four presence states and an accumulating clock, per
-- student per assignment, readable by the instructors of that assignment and by
-- nobody else.
--
-- Asked for by Mr. Pina on 2026-09-11, in these terms: he wants to see which
-- students are working, which have the assignment open but are elsewhere, which
-- are not on the site, when each last worked, and how much time each actually
-- spent working rather than merely having it open. It is for making the class
-- better. The constraint arrived in the same breath -- "just keep the data
-- secure" -- and that clause is the design, not a footnote on it. THESE ARE
-- MINORS. Every decision below that looks conservative is this clause.
--
-- Ledger 0143 deferred exactly this and said why: "Telemetry of any kind. No
-- presence, no active time, no per-student status beyond the `state` column
-- that has existed since 0086. It is a separate design with its own retention
-- question about minors' data." This file is that separate design, and the
-- retention question is answered in section 6 rather than left open.
--
-- ===========================================================================
-- WHAT IS STORED, WHICH IS THE MINIMUM THAT ANSWERS THE QUESTION
-- ===========================================================================
--
-- ONE ROW PER (item, student). Not per session, not per visit, not per event.
-- The row carries five facts:
--
--     last_seen_at    the most recent heartbeat
--     last_input_at   the most recent heartbeat that reported input
--     page_visible    what the most recent heartbeat said about visibility
--     active_seconds  the accumulating counter (section 4)
--     first_seen_at   when this student first opened this assignment
--
-- THERE IS NO EVENT LOG AND THERE MUST NEVER BE ONE. "How much time did they
-- actually spend" is answered by an accumulating COUNTER, not by a history --
-- a counter answers the question exactly and cannot answer any other, where a
-- per-event table answers "what were they doing at 19:42 on the 3rd" for the
-- rest of the student's life. That is the whole difference between a teaching
-- tool and a surveillance record, and it is a schema decision rather than a
-- policy one: the second table does not exist, so no future read can be added
-- to it.
--
-- NO KEYSTROKES AND NO CONTENT. `classroom_presence_ping` takes two booleans
-- and an item id. There is no parameter through which a key, a word, a
-- selection, a scroll position, a URL or a duration can be sent, so none of
-- those can be stored by any caller, including a malicious one.
--
-- NOTHING IDENTIFIES A DEVICE. No user agent, no address, no session id, no
-- fingerprint of any kind. Two students on one shared classroom machine are two
-- rows because they are two accounts, and that is the only distinction this
-- table can make.
--
-- ===========================================================================
-- WHAT "ACTIVE" MEANS. THE FOUR STATES, DEFINED HERE SO NOBODY GUESSES LATER.
-- ===========================================================================
--
-- The windows are `_classroom_presence_input_window()` (60 seconds) and
-- `_classroom_presence_away_window()` (2 minutes). Both are FUNCTIONS rather
-- than literals, both are read by `_classroom_presence_state_of` below, and
-- both are RETURNED IN THE READ PAYLOAD so the browser is parameterised by this
-- deployment's own numbers instead of carrying a second copy of them. A client
-- that cannot reach them falls back to its own defaults, and
-- `tests/db/classroom-presence-state-mirror.test.ts` puts a corpus through the
-- SQL and through the TypeScript and compares case for case, which is the only
-- thing that keeps a fallback honest.
--
--   WORKING         an input event arrived within the last 60 seconds
--   VIEWING         the page is focused and visible, with no recent input
--   OPEN ELSEWHERE  the last heartbeat reported document.visibilityState hidden
--   AWAY            no heartbeat has arrived for 2 minutes
--
-- AWAY IS TESTED FIRST AND OUTRANKS THE OTHER THREE, and that ordering is
-- load-bearing rather than stylistic. Every other state is a claim the client
-- made at `last_seen_at`; once that stamp is stale the claim is stale with it,
-- so a row left at `page_visible = true` by a tab that was closed would
-- otherwise read as VIEWING forever. A stale claim must never outlive the
-- evidence for it.
--
-- A STUDENT WITH NO ROW HAS NEVER OPENED THE ASSIGNMENT, and that is a fifth
-- thing rather than a fifth state: there is no row to carry a state, so the
-- console renders it from the ROSTER side. `classroom_presence_state` returns
-- one entry per PRESENT ROW and invents nothing for anybody else, which is the
-- roster-shaped-list rule (a list takes its rows from the roster, never from
-- the payload) applied from the payload's end.
--
-- ===========================================================================
-- THE WRITE RATE IS THE DATABASE'S RULE, NOT THE CLIENT'S PROMISE
-- ===========================================================================
--
-- A write per keystroke would hammer the database, so the heartbeat is at most
-- once every `_classroom_presence_heartbeat()` (30 seconds) and only while the
-- page is visible. That is what the client does; it is not what makes it true.
--
-- `classroom_presence_ping` REFUSES TO WRITE a beat arriving less than
-- `_classroom_presence_min_gap()` (20 seconds) after the row's own
-- `last_seen_at`, answering `{ok:true, throttled:true}` and touching nothing.
-- So the ceiling on this table's write rate is a property of the function --
-- at most 3 writes per student per minute per assignment, whatever any client
-- does, including one written by somebody who wants to make it write more.
--
-- 20 AND NOT 30, AND THE DIFFERENCE IS JITTER. A 30-second browser timer
-- routinely fires at 29.6s after a round trip, and a floor of exactly 30 would
-- throttle honest beats into silence and manufacture AWAY for a student sitting
-- right there. 20 seconds leaves a third of an interval of slack and still
-- bounds the rate.
--
-- THE HIDE REPORT IS THE ONE BEAT SENT WHILE NOT VISIBLE, and it is a state
-- CHANGE rather than a heartbeat: exactly one on the transition to hidden,
-- which is what lets OPEN ELSEWHERE be told apart from AWAY at all. It is
-- subject to the same floor as every other beat.
--
-- ===========================================================================
-- DISCLOSURE, WHICH IS THE PART THIS FILE EXISTS TO GET RIGHT
-- ===========================================================================
--
-- A STUDENT NEVER SEES ANOTHER STUDENT'S PRESENCE. A student may read their own
-- row -- it is a record about them and they should be able to see it -- or
-- nothing at all. There is no payload, RPC, view, policy or grant anywhere in
-- this file through which one student learns whether another is at their desk.
--
-- ONLY THE ITEM'S TEACHERS OF RECORD AND SITE ADMINS read a section's presence,
-- and that is not a new rule: it is `classroom_can_review_submission(item,
-- student)`, 0086's own gate, which is true when the caller manages a section
-- the item is posted to AND the student is enrolled in it. A teacher of a
-- DIFFERENT section of the same course, carrying the same assignment, is
-- refused by it -- which is exactly the shape that is dangerous if the boundary
-- lives in the UI. `classroom_manages_section` folds `is_admin()` in already
-- (0138), so "and site admins" needs no second clause and no second definition.
--
-- `anon` CAN NEITHER READ NOR WRITE, by two independent refusals. The table's
-- grants name `authenticated` only and the select policy is `to authenticated`,
-- so a signed-out reader is stopped by the grant AND by the policy; the two
-- functions a client may call are revoked from `anon` explicitly, because a
-- hosted Supabase project's default privileges GRANT EXECUTE to `anon` on every
-- new function and `revoke ... from public` does not remove it (the 0137
-- lesson). 0137 is a one-time repair of what existed then and covers nothing
-- created after it, so every function below revokes for itself.
--
-- THIS TABLE HAS A POLICY WHERE `classroom_hall_passes` HAS NONE, AND THE
-- DIFFERENCE IS DELIBERATE. 0143 shut its table completely because NO client
-- had any business reading a raw pass row: a student may learn one bit and an
-- instructor reads a role-scoped projection. Here the subject of the row is
-- entitled to the row -- there is nothing in it they do not already know about
-- themselves -- so the own-row read is the ordinary RLS shape and the policy is
-- the boundary. What does not change is the WRITE side: there is no insert,
-- update or delete grant and no policy for any of them, so every write is still
-- a SECURITY DEFINER RPC that re-checks its caller.
--
-- `_classroom_presence_can_read` IS GRANTED TO `authenticated` ON PURPOSE and
-- is the one function here that is. A function named directly inside an RLS
-- `using` clause is evaluated as the QUERYING role, so revoking it does not
-- narrow the read, it breaks it -- the 0070 lesson 0109 writes down and 0137
-- carves `is_teacher` and `_classroom_item_live` out for. Its BODY is SECURITY
-- DEFINER, so the gates it delegates to need no grant of their own.
--
-- ===========================================================================
-- RETENTION: 90 DAYS. WHERE TO CHANGE IT, AND WHY IT IS NOT ZERO AND NOT NEVER
-- ===========================================================================
--
-- THE DEFAULT IS 90 DAYS AND IT IS WRITTEN DOWN IN EXACTLY ONE PLACE:
-- `_classroom_presence_retention()`, immediately below in section 1. Change
-- that function's returned interval and every purge path moves with it --
-- there is no second literal, no client copy and no environment variable.
--
-- A TELEMETRY TABLE WITH NO PURGE BECOMES A PERMANENT RECORD OF A CHILD'S
-- WORKING HABITS, AND NOBODY DECIDED THAT. 90 days is a bit more than a
-- semester, which is the longest span over which "how is this class going" is
-- still a live question; past it the row answers nothing anybody is asking and
-- is only a liability. It is not shorter because a teacher looking back at a
-- unit from six weeks ago is an ordinary thing to do, and not longer because
-- nothing about last spring improves this spring's class.
--
-- HOW THE PURGE ACTUALLY RUNS, given that this project has no cron and no
-- scheduler of any kind. Two paths, one implementation
-- (`_classroom_presence_purge_before`), because a purge nobody runs is a table
-- with no purge:
--
--   1. `classroom_presence_purge(p_days)` -- admin only, deliberate, reports
--      the count. This is the operator's lever and the one a shortened
--      retention is applied with.
--   2. A BOUNDED OPPORTUNISTIC SWEEP inside every heartbeat that actually
--      writes: at most `_classroom_presence_purge_batch()` (50) expired rows,
--      driven by the index on `last_seen_at`. It costs an index scan that
--      usually deletes nothing, it is bounded so it can never turn a student's
--      heartbeat into a table scan, and it means the table drains itself on
--      any deployment where the feature is in use at all.
--
-- THE SWEEP IS NOT SCOPED TO THE PINGING ITEM, and that is the point of it. A
-- sweep that only cleaned the row's own item would leave every assignment
-- nobody ever opens again as a permanent record, which is the failure this
-- section exists to prevent.
--
-- ===========================================================================
-- WHAT THIS FILE DOES NOT DO
-- ===========================================================================
--
-- IT DOES NOT TOUCH THE COIN ECONOMY, and a duration computed here must never
-- become an input to one. 0143 says this about the hall pass and the reason is
-- stronger here: the moment a clock pays or charges a student automatically,
-- presence stops being a teaching signal and becomes a meter, and a student
-- whose incentive is to look busy will look busy. Nothing here reads, writes or
-- references `coin_transactions`.
--
-- IT DOES NOT GRADE. `active_seconds` is not a score, is not exported by
-- `classroom_grade_submission`, and appears in no rubric, no FACTS CSV and no
-- grades tally. It is not in any payload a student's own grade is computed
-- from.
--
-- IT DOES NOT RE-SIGN A SINGLE EXISTING OBJECT. Every function and the one
-- table below are new, so there is no deploy ordering, no signature trap and
-- nothing for 0137's sweep to have to re-run over: a client deployed before
-- this migration simply never calls the two new RPCs.
--
-- IT DOES NOT BLOCK `classroom_remove_enrollment`. 0138 refuses to remove a
-- student who has responses, submissions, approvals or notebook entries,
-- because those are WORK. A presence row is telemetry about work, not the work,
-- and a class roster that cannot be corrected because somebody once opened a
-- worksheet is a worse outcome than a stranded row. The stranded row stops
-- being projected the moment the enrollment is gone (the read joins
-- enrollments) and is purged on the ordinary schedule.
--
-- WHAT UNDOES THIS MIGRATION, stated before it is pushed:
--
--   drop function if exists public.classroom_presence_purge(integer);
--   drop function if exists public.classroom_presence_state(uuid, uuid);
--   drop function if exists public.classroom_presence_ping(uuid, boolean, boolean);
--   drop function if exists public._classroom_presence_purge_before(timestamptz, integer);
--   drop function if exists public._classroom_presence_can_read(uuid, text);
--   drop function if exists public._classroom_presence_state_of(timestamptz, timestamptz, boolean, timestamptz);
--   drop table if exists public.classroom_presence;
--   drop function if exists public._classroom_presence_purge_batch();
--   drop function if exists public._classroom_presence_retention();
--   drop function if exists public._classroom_presence_credit_cap();
--   drop function if exists public._classroom_presence_min_gap();
--   drop function if exists public._classroom_presence_heartbeat();
--   drop function if exists public._classroom_presence_away_window();
--   drop function if exists public._classroom_presence_input_window();
--
-- Nothing else in the schema references any of them, and the table holds no
-- record anything else derives from -- so the undo loses telemetry and no work.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The numbers, each written down exactly once.
--
-- Immutable rather than stable: every one of them is a literal, so a planner
-- that folds them into a constant is folding in the right constant.
-- ---------------------------------------------------------------------------

-- WORKING means input within this window.
create or replace function public._classroom_presence_input_window()
returns interval language sql immutable set search_path = '' as $fn$
	select interval '60 seconds';
$fn$;

-- AWAY means no heartbeat for this long. Outranks every other state.
create or replace function public._classroom_presence_away_window()
returns interval language sql immutable set search_path = '' as $fn$
	select interval '2 minutes';
$fn$;

-- The client's beat cadence. The two derived numbers below are stated in terms
-- of it in the comments and as literals in the bodies, because a function
-- calling a function to do arithmetic on an interval buys nothing readable.
create or replace function public._classroom_presence_heartbeat()
returns interval language sql immutable set search_path = '' as $fn$
	select interval '30 seconds';
$fn$;

-- The database's floor under that cadence: heartbeat minus a third, for jitter.
create or replace function public._classroom_presence_min_gap()
returns interval language sql immutable set search_path = '' as $fn$
	select interval '20 seconds';
$fn$;

-- The most one beat may credit: two heartbeats. See section 4.
create or replace function public._classroom_presence_credit_cap()
returns interval language sql immutable set search_path = '' as $fn$
	select interval '60 seconds';
$fn$;

-- RETENTION. THE ONE PLACE THE 90 DAYS LIVES. Change it here and every purge
-- path moves with it.
create or replace function public._classroom_presence_retention()
returns interval language sql immutable set search_path = '' as $fn$
	select interval '90 days';
$fn$;

-- The opportunistic sweep's ceiling, so a heartbeat can never become a scan.
create or replace function public._classroom_presence_purge_batch()
returns integer language sql immutable set search_path = '' as $fn$
	select 50;
$fn$;

revoke all on function public._classroom_presence_input_window() from public, anon, authenticated, service_role;
revoke all on function public._classroom_presence_away_window() from public, anon, authenticated, service_role;
revoke all on function public._classroom_presence_heartbeat() from public, anon, authenticated, service_role;
revoke all on function public._classroom_presence_min_gap() from public, anon, authenticated, service_role;
revoke all on function public._classroom_presence_credit_cap() from public, anon, authenticated, service_role;
revoke all on function public._classroom_presence_retention() from public, anon, authenticated, service_role;
revoke all on function public._classroom_presence_purge_batch() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The one state rule, as a pure function of four values.
--
-- FOUR ARGUMENTS AND NO READS, so it is a total function over a corpus and the
-- TypeScript mirror can be compared against it case for case rather than
-- argued to agree with it. Nothing else in this file decides a state.
-- ---------------------------------------------------------------------------

create or replace function public._classroom_presence_state_of(
	p_last_seen_at timestamptz,
	p_last_input_at timestamptz,
	p_page_visible boolean,
	p_at timestamptz
)
returns text
language sql
immutable
set search_path = ''
as $fn$
	select case
		-- No row, or a row with no stamp, is somebody who is not here.
		when p_last_seen_at is null or p_at is null then 'away'
		-- AWAY FIRST. Every state below is a claim made at p_last_seen_at, and a
		-- stale claim must not outlive the evidence for it.
		when p_at - p_last_seen_at > public._classroom_presence_away_window() then 'away'
		when coalesce(p_page_visible, false) is false then 'open-elsewhere'
		when p_last_input_at is not null
			and p_at - p_last_input_at <= public._classroom_presence_input_window() then 'working'
		else 'viewing'
	end;
$fn$;

comment on function public._classroom_presence_state_of(timestamptz, timestamptz, boolean, timestamptz) is
'The ONE definition of a presence state: working, viewing, open-elsewhere, away.

Pure, total, and a function of its four arguments alone, so the TypeScript mirror in $lib/classroom/presence/state.ts can be compared against it over a corpus instead of being argued to agree with it.

AWAY IS TESTED FIRST AND THAT IS LOAD-BEARING. Every other state is a claim the client made at p_last_seen_at; once that stamp is older than the away window the claim is stale and the row is a closed tab, not a student.';

revoke all on function public._classroom_presence_state_of(timestamptz, timestamptz, boolean, timestamptz)
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The table.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_presence (
	item_id uuid not null references public.classroom_items(id) on delete cascade,
	-- Lowercased, exactly as classroom_enrollments spells it (0082), and set
	-- from current_user_email() rather than from anything a caller sends.
	student_email text not null
		check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	first_seen_at timestamptz not null default now(),
	last_seen_at timestamptz not null default now(),
	-- NULL is a real answer and the common one on a first beat: opened, not yet
	-- typed. It is never coalesced to first_seen_at, which would report work
	-- that did not happen.
	last_input_at timestamptz,
	-- What the LAST beat said about document.visibilityState. Not a history.
	page_visible boolean not null default true,
	-- Seconds credited in WORKING only. See section 4 for the credit rule.
	active_seconds integer not null default 0 check (active_seconds >= 0),
	primary key (item_id, student_email)
);

comment on table public.classroom_presence is
'One row per (assignment, student): last seen, last input, last reported visibility, and an accumulating count of seconds spent WORKING. Written only by classroom_presence_ping, read by the student themselves or by an instructor of the item through classroom_presence_state.

THERE IS NO EVENT LOG AND THERE MUST NEVER BE ONE. The counter answers "how much time did they actually spend" and can answer nothing else; a per-event table would answer "what were they doing at 19:42 on the 3rd" for the rest of a child''s life. Purged after 90 days -- see _classroom_presence_retention().';

-- The sweep's index. `last_seen_at` alone, because the purge asks one question
-- ("older than the cutoff, anywhere") and the two RPC reads are both keyed on
-- item_id, which the primary key already serves.
create index if not exists classroom_presence_last_seen_idx
	on public.classroom_presence (last_seen_at);

-- RLS ON, SELECT ONLY, `authenticated` ONLY. No insert, update or delete grant
-- and no policy for any of them: the write path is the definer RPC in section
-- 4 and there is no second way in. `anon` holds nothing, and the policy names
-- `authenticated` as well, so a signed-out reader is refused twice over.
alter table public.classroom_presence enable row level security;
revoke all on table public.classroom_presence from public, anon, authenticated;
grant select on table public.classroom_presence to authenticated;

-- THE RLS PREDICATE. Own row, or an instructor of this item for this student.
-- SECURITY DEFINER so the gates it delegates to need no grant; GRANTED TO
-- `authenticated` because a function named in a `using` clause is evaluated as
-- the querying role and revoking it would break the read rather than narrow it.
create or replace function public._classroom_presence_can_read(
	p_item_id uuid,
	p_student_email text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
	select case
		when coalesce(public.current_user_email(), '') = '' then false
		-- The subject of the row is entitled to the row. There is nothing in it
		-- they do not already know about themselves.
		when p_student_email = public.current_user_email() then true
		-- 0086's gate, unchanged and not restated: the caller manages a section
		-- this item is posted to AND this student is enrolled in it. A teacher of
		-- a different section is false here. is_admin() is folded into
		-- classroom_manages_section by 0138, so admins need no second clause.
		else public.classroom_can_review_submission(p_item_id, p_student_email)
	end;
$fn$;

comment on function public._classroom_presence_can_read(uuid, text) is
'The classroom_presence select policy''s predicate: the caller''s own row, or a row an instructor of this item may review for this student (classroom_can_review_submission, which folds in is_admin via classroom_manages_section).

GRANTED TO authenticated DELIBERATELY. It is named directly inside an RLS using clause, where a function is evaluated as the querying role -- revoking it breaks the read instead of narrowing it (the 0070 lesson, which 0109 writes down and 0137 carves is_teacher out for).';

revoke all on function public._classroom_presence_can_read(uuid, text)
	from public, anon, authenticated, service_role;
grant execute on function public._classroom_presence_can_read(uuid, text) to authenticated;

drop policy if exists "classroom presence own row or instructor" on public.classroom_presence;
create policy "classroom presence own row or instructor"
	on public.classroom_presence
	for select
	to authenticated
	using (public._classroom_presence_can_read(item_id, student_email));

-- ---------------------------------------------------------------------------
-- 4. The heartbeat. The ONE write path.
--
-- NO IDENTITY PARAMETER. The student is `_classroom_engine_student`'s answer,
-- which is `current_user_email()` after 0086's own eligibility gate -- signed
-- in, the item is a published assignment, and the caller is ACTIVELY enrolled
-- in a section it is posted to. So "can only beat for themselves" is a property
-- of the SIGNATURE rather than a check somebody could get wrong, and a
-- non-student caller is refused by a rule this file does not restate.
--
-- IT RAISES RATHER THAN RETURNING A STRUCTURED REFUSAL, which is the right half
-- of that convention here: a beat from somebody not enrolled is genuine misuse,
-- not a refusal a caller has to display gracefully. The client fires and
-- forgets, exactly as it does with a live notice.
--
-- THE CREDIT RULE, STATED ONCE:
--
--   credit = least(now() - last_seen_at, _classroom_presence_credit_cap())
--            when this beat reports input AND reports the page visible
--          = 0 otherwise
--
-- and the first beat on a fresh row credits nothing, because there is no
-- interval behind it to credit.
--
-- WHY THE CAP IS TWO HEARTBEATS. The client beats every 30 seconds while
-- visible, so a gap longer than 60 seconds means at least one beat did not
-- happen -- the tab was hidden, the machine slept, the network went. Crediting
-- the whole gap would count exactly the time the student was NOT working, which
-- is the one number this feature exists to get right. Capping at two beats
-- bounds the over-credit to a single missed interval.
--
-- WHY INPUT ALONE IS NOT ENOUGH. A beat can report input and report hidden --
-- a student types, then switches tabs, and the hide report goes out. Crediting
-- that interval would pay for the switch. Both flags are required.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_presence_ping(
	p_item_id uuid,
	p_typed boolean default false,
	p_page_visible boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
	v_email text := public._classroom_engine_student(p_item_id);
	v_now timestamptz := now();
	v_typed boolean := coalesce(p_typed, false);
	v_visible boolean := coalesce(p_page_visible, true);
	v_last_seen timestamptz;
	v_credit integer := 0;
	v_active integer;
	v_purged integer := 0;
begin
	select p.last_seen_at into v_last_seen
	from public.classroom_presence p
	where p.item_id = p_item_id and p.student_email = v_email;

	-- THE RATE LIMIT IS HERE AND NOT IN THE BROWSER. Nothing is written and
	-- nothing is credited; the caller is told it was heard and ignored.
	if v_last_seen is not null
		and v_now - v_last_seen < public._classroom_presence_min_gap() then
		return jsonb_build_object('ok', true, 'throttled', true);
	end if;

	if v_last_seen is not null and v_typed and v_visible then
		v_credit := greatest(
			0,
			floor(extract(epoch from least(
				v_now - v_last_seen,
				public._classroom_presence_credit_cap()
			)))::integer
		);
	end if;

	-- ON CONFLICT PLUS THE RETURNING, NOT SELECT-THEN-INSERT. Two tabs of one
	-- student beating in the same second are serialized by the primary key
	-- rather than racing a read (the 0134 lesson): the loser's insert becomes
	-- the update arm and credits against whatever the winner just wrote.
	insert into public.classroom_presence as p (
		item_id, student_email, first_seen_at, last_seen_at, last_input_at,
		page_visible, active_seconds
	)
	values (
		p_item_id, v_email, v_now, v_now,
		case when v_typed then v_now end,
		v_visible, 0
	)
	on conflict (item_id, student_email) do update set
		last_seen_at = v_now,
		last_input_at = case when v_typed then v_now else p.last_input_at end,
		page_visible = v_visible,
		active_seconds = p.active_seconds + v_credit
	returning p.active_seconds into v_active;

	-- THE OPPORTUNISTIC SWEEP, BOUNDED, ON THE PATH THAT ALREADY WROTE. A
	-- throttled beat returns above and never reaches this, so the sweep runs at
	-- most once per student per 20 seconds per assignment and deletes at most 50
	-- rows when it does.
	v_purged := public._classroom_presence_purge_before(
		v_now - public._classroom_presence_retention(),
		public._classroom_presence_purge_batch()
	);

	return jsonb_build_object(
		'ok', true,
		'throttled', false,
		'credited_seconds', v_credit,
		'active_seconds', v_active,
		'purged', v_purged
	);
end;
$fn$;

comment on function public.classroom_presence_ping(uuid, boolean, boolean) is
'One presence heartbeat for the CALLING student on one assignment. No identity parameter: the subject is _classroom_engine_student(p_item_id), so a caller cannot beat for anybody else and a caller who is not actively enrolled is refused by 0086''s own gate.

Takes TWO BOOLEANS and an item id, and there is no parameter through which a keystroke, a word, a URL, a device or a duration could be sent.

WRITES AT MOST ONCE EVERY 20 SECONDS PER (student, item). A beat inside that window returns {ok:true, throttled:true} and touches nothing, so the table''s write ceiling is this function''s property rather than a promise made by a browser.

Credits active_seconds only for an interval this beat reports as both typed-in and visible, capped at two heartbeats.';

revoke all on function public.classroom_presence_ping(uuid, boolean, boolean)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_presence_ping(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The instructor's read. ONE projection, and it never answers a student.
--
-- A STUDENT READING THEIR OWN ROW USES THE TABLE, THROUGH RLS. That is the
-- whole of the student read path and it is why this function does not need a
-- student branch: there is no projection here to get wrong, because there is
-- only one audience.
--
-- A SECTION THE CALLER DOES NOT MANAGE IS NULL, NOT A REFUSAL -- the same
-- answer an item id that does not exist gives, so an id cannot be probed.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_presence_state(
	p_item_id uuid,
	p_section_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
	v_email text := public.current_user_email();
	v_now timestamptz := now();
	v_rows jsonb;
begin
	if v_email = '' or p_item_id is null then
		return null;
	end if;

	-- NAMED SECTION: the caller must manage it. NULL section: every section of
	-- this item the caller manages, which is what a cross-section console needs
	-- and is the shape classroom_section_roster already uses.
	if p_section_id is not null and not public.classroom_manages_section(p_section_id) then
		return null;
	end if;

	if not exists (
		select 1 from public.classroom_postings pg
		where pg.item_id = p_item_id
			and (p_section_id is null or pg.section_id = p_section_id)
			and public.classroom_manages_section(pg.section_id)
	) then
		return null;
	end if;

	-- THE ROWS ARE REACHED THROUGH THE ROSTER, never listed from the table and
	-- filtered afterwards: the join to classroom_enrollments under a managed
	-- posting is what scopes a teacher to their own students, and a presence row
	-- whose enrollment is gone simply has nothing to join to.
	select coalesce(jsonb_agg(x order by x->>'student_email'), '[]'::jsonb)
	into v_rows
	from (
		select distinct on (p.student_email) jsonb_build_object(
			'student_email', p.student_email,
			'state', public._classroom_presence_state_of(
				p.last_seen_at, p.last_input_at, p.page_visible, v_now
			),
			'last_seen_at', p.last_seen_at,
			'last_input_at', p.last_input_at,
			-- THE THIRD ARGUMENT `_classroom_presence_state_of` TAKES, sent so the
			-- browser's mirror is the SAME function of the SAME facts rather than a
			-- different one that mostly agrees. It is strictly less about a student
			-- than the `state` derived from it, which is already here.
			'page_visible', p.page_visible,
			'active_seconds', p.active_seconds,
			'first_seen_at', p.first_seen_at
		) as x, p.student_email
		from public.classroom_presence p
		join public.classroom_postings pg on pg.item_id = p.item_id
		join public.classroom_enrollments e
			on e.section_id = pg.section_id and e.student_email = p.student_email
		where p.item_id = p_item_id
			and (p_section_id is null or pg.section_id = p_section_id)
			and public.classroom_manages_section(pg.section_id)
		order by p.student_email
	) rows;

	return jsonb_build_object(
		'item_id', p_item_id,
		'section_id', p_section_id,
		'at', v_now,
		-- THE WINDOWS TRAVEL WITH THE PAYLOAD, so the browser derives a state
		-- from THIS deployment's numbers rather than from a second copy of them.
		'limits', jsonb_build_object(
			'input_window_seconds', extract(epoch from public._classroom_presence_input_window())::integer,
			'away_window_seconds', extract(epoch from public._classroom_presence_away_window())::integer,
			'heartbeat_seconds', extract(epoch from public._classroom_presence_heartbeat())::integer,
			'min_gap_seconds', extract(epoch from public._classroom_presence_min_gap())::integer,
			'retention_days', extract(day from public._classroom_presence_retention())::integer
		),
		'students', v_rows
	);
end;
$fn$;

comment on function public.classroom_presence_state(uuid, uuid) is
'Presence for one assignment, for an INSTRUCTOR of it. One entry per student who has a presence row AND an enrollment in a section of this item the caller manages -- so a teacher of a different section of the same course gets nothing, and an admin is admitted by classroom_manages_section folding in is_admin (0138).

NULL for a caller who manages no section this item is posted to, which is the same answer an item id that does not exist gives.

There is no student branch and no student projection: a student reads their OWN row off the table through RLS, and this function is never the path by which anybody learns about anybody else.

Carries the deployment''s own windows in `limits`, so a client derives a state from these numbers instead of carrying a second copy of them.';

revoke all on function public.classroom_presence_state(uuid, uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_presence_state(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Retention. ONE implementation, two callers.
-- ---------------------------------------------------------------------------

-- The private one. Bounded by construction: a caller must say how many rows at
-- most, so no path through this can become an unbounded delete.
create or replace function public._classroom_presence_purge_before(
	p_cutoff timestamptz,
	p_limit integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
	v_deleted integer := 0;
begin
	if p_cutoff is null or coalesce(p_limit, 0) <= 0 then
		return 0;
	end if;
	with doomed as (
		select p.ctid
		from public.classroom_presence p
		where p.last_seen_at < p_cutoff
		order by p.last_seen_at
		limit p_limit
	)
	delete from public.classroom_presence t
	using doomed d
	where t.ctid = d.ctid;
	get diagnostics v_deleted = row_count;
	return v_deleted;
end;
$fn$;

revoke all on function public._classroom_presence_purge_before(timestamptz, integer)
	from public, anon, authenticated, service_role;

-- The operator's lever. ADMIN ONLY: retention is a decision about other
-- people's children, and a teacher of one section has no business shortening or
-- running it across a table that spans every class.
create or replace function public.classroom_presence_purge(p_days integer default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
	v_days integer := p_days;
	v_cutoff timestamptz;
	v_deleted integer := 0;
	v_batch integer;
	v_total integer := 0;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can purge classroom presence.';
	end if;
	if v_days is null then
		v_cutoff := now() - public._classroom_presence_retention();
	elsif v_days < 0 then
		raise exception 'A retention window cannot be negative.';
	else
		v_cutoff := now() - make_interval(days => v_days);
	end if;

	-- Loops the bounded delete rather than issuing one unbounded statement, so
	-- the private helper stays the only implementation and a very large purge is
	-- still a series of small deletes.
	loop
		v_batch := public._classroom_presence_purge_before(v_cutoff, 1000);
		v_total := v_total + v_batch;
		exit when v_batch = 0;
	end loop;
	v_deleted := v_total;

	return jsonb_build_object(
		'ok', true,
		'deleted', v_deleted,
		'cutoff', v_cutoff,
		'retention_days', coalesce(v_days, extract(day from public._classroom_presence_retention())::integer)
	);
end;
$fn$;

comment on function public.classroom_presence_purge(integer) is
'Deletes presence rows last seen before the cutoff. ADMIN ONLY.

p_days null means the default retention, which is written down in exactly one place: _classroom_presence_retention(), currently 90 days. Change that function and every purge path moves with it.

This is the deliberate lever. The ordinary drain is the bounded sweep inside classroom_presence_ping, so a deployment where the feature is in use cleans itself without anybody running this.';

revoke all on function public.classroom_presence_purge(integer)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_presence_purge(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. What this deployment actually holds.
--
-- The ACL, the policy set and the catalog are READ BACK rather than assumed: a
-- self-check reporting that a revoke statement ran tells an operator only that
-- the statement ran.
-- ---------------------------------------------------------------------------

do $chk$
declare
	v_rls boolean;
	v_policies integer;
	v_write_policies integer;
	v_anon_grants integer;
	v_write_grants integer;
	v_select_grants integer;
	v_index boolean;
	v_states text;
	r record;
begin
	select relrowsecurity into v_rls
	from pg_class where oid = 'public.classroom_presence'::regclass;
	if not v_rls then
		raise exception '0200: RLS is OFF on classroom_presence. The table is open.';
	end if;

	select count(*) into v_policies
	from pg_policies where schemaname = 'public' and tablename = 'classroom_presence';
	select count(*) into v_write_policies
	from pg_policies
	where schemaname = 'public' and tablename = 'classroom_presence' and cmd <> 'SELECT';
	if v_policies <> 1 or v_write_policies <> 0 then
		raise exception '0200: classroom_presence has % policy/policies (% of them write policies). Expected exactly 1, SELECT only.',
			v_policies, v_write_policies;
	end if;

	select count(*) into v_anon_grants
	from information_schema.role_table_grants
	where table_schema = 'public' and table_name = 'classroom_presence'
		and grantee in ('anon', 'PUBLIC');
	if v_anon_grants <> 0 then
		raise exception '0200: classroom_presence carries % grant(s) to anon/PUBLIC. It must carry none.', v_anon_grants;
	end if;

	select count(*) into v_write_grants
	from information_schema.role_table_grants
	where table_schema = 'public' and table_name = 'classroom_presence'
		and grantee = 'authenticated' and privilege_type <> 'SELECT';
	select count(*) into v_select_grants
	from information_schema.role_table_grants
	where table_schema = 'public' and table_name = 'classroom_presence'
		and grantee = 'authenticated' and privilege_type = 'SELECT';
	if v_write_grants <> 0 or v_select_grants <> 1 then
		raise exception '0200: authenticated holds % write grant(s) and % select grant(s) on classroom_presence. Expected 0 and 1.',
			v_write_grants, v_select_grants;
	end if;

	select exists (
		select 1 from pg_indexes
		where schemaname = 'public' and tablename = 'classroom_presence'
			and indexname = 'classroom_presence_last_seen_idx'
	) into v_index;
	if not v_index then
		raise exception '0200: the last_seen_at index is missing. The purge has nothing to drive it.';
	end if;

	raise notice '0200: classroom_presence -- RLS on, 1 SELECT policy, 0 write policies, 0 anon grants, 1 authenticated SELECT grant, purge index present.';

	-- THE FOUR STATES, PUT TO THE REAL FUNCTION rather than described. A fifth
	-- answer or a missing one reddens here at apply time.
	select string_agg(s, ',' order by ord) into v_states from (
		select 1 as ord, public._classroom_presence_state_of(now() - interval '10 seconds', now() - interval '5 seconds', true, now()) as s
		union all select 2, public._classroom_presence_state_of(now() - interval '10 seconds', now() - interval '5 minutes', true, now())
		union all select 3, public._classroom_presence_state_of(now() - interval '10 seconds', now() - interval '5 seconds', false, now())
		union all select 4, public._classroom_presence_state_of(now() - interval '10 minutes', now() - interval '5 seconds', true, now())
	) t;
	if v_states <> 'working,viewing,open-elsewhere,away' then
		raise exception '0200: the four states answered %, expected working,viewing,open-elsewhere,away.', v_states;
	end if;
	raise notice '0200: states -- %. AWAY outranks a stale visible claim, which is the fourth case above.', v_states;

	-- The function grants, read off the catalog rather than assumed. Exactly
	-- three functions here may be executed by a client: the two RPCs and the RLS
	-- predicate. Everything else must be reachable only from inside a definer.
	for r in
		select p.oid::regprocedure::text as sig,
			p.proname,
			has_function_privilege('anon', p.oid, 'execute') as anon_x,
			has_function_privilege('authenticated', p.oid, 'execute') as auth_x
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname like '%classroom_presence%'
		order by 1
	loop
		if r.anon_x then
			raise exception '0200: % is executable by anon. Every function in this file must be revoked from anon.', r.sig;
		end if;
		if r.proname in ('classroom_presence_ping', 'classroom_presence_state',
			'classroom_presence_purge', '_classroom_presence_can_read') then
			if not r.auth_x then
				raise exception '0200: % must be executable by authenticated and is not.', r.sig;
			end if;
		elsif r.auth_x then
			raise exception '0200: % is executable by authenticated and must not be -- it is reachable only from inside a definer.', r.sig;
		end if;
		raise notice '0200: % -- anon %, authenticated %.', r.sig, r.anon_x, r.auth_x;
	end loop;

	raise notice '0200: retention is % and is written down in _classroom_presence_retention() alone. The heartbeat sweeps at most % expired row(s) per write; classroom_presence_purge() is the deliberate admin lever.',
		public._classroom_presence_retention(), public._classroom_presence_purge_batch();
	raise notice '0200: no rows were created and nothing was backfilled -- there was no presence concept of any kind to migrate.';
end $chk$;
