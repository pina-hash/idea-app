-- 0144_classroom_hall_pass_close_by_id.sql
--
-- THE CLOSE IS SPLIT BY ROLE, BECAUSE ONE RPC SERVING BOTH CALLERS IS THE
-- DEFECT.
--
-- `classroom_hall_pass_close(p_section_id)` (0143) takes a SECTION and closes
-- whatever is open in it. That is a correct handle for a student and the wrong
-- one for an instructor, and the difference is a real, three-way race:
--
--   1. Student A is out. The instructor's screen says so.
--   2. Student A returns and signs themselves back in.
--   3. Student B signs out. The pass is legitimately theirs now.
--   4. The instructor, acting on what their screen said at step 1, presses
--      clear. The RPC re-resolves "whatever is open in this section" and closes
--      STUDENT B's pass.
--
-- B is then marked back in the room while standing in a corridor, and the pass
-- is free for a third student to take. Nothing anywhere reports it: every row
-- is well formed, the capacity index is satisfied, and the only trace is a
-- `closed_by` naming an instructor who never saw B leave.
--
-- THE RACE IS NOT WHAT `for update` PROTECTS AGAINST, which is why 0143 has
-- that lock and the defect survives it. The lock makes two callers agree about
-- one ROW. It cannot make a caller's INTENT survive the row underneath it being
-- replaced -- the instructor resolved a target at press time that their screen
-- had chosen at read time, and between those two instants the answer changed.
-- A lock taken after the target is re-resolved is a lock on the wrong pass.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS NOT A DISCLOSURE PROBLEM, WHICH IS WHAT MAKES THE FIX AVAILABLE
-- ---------------------------------------------------------------------------
--
-- The bundle that found this framed the only alternatives as living with the
-- race or putting a pass handle into a STUDENT's payload -- which would undo
-- the projection 0143 exists to get right. That framing assumes ONE function
-- serves both callers. It does not have to.
--
--   * A MANAGER CLOSES BY PASS ID. An instructor of the section is already
--     handed the pass id, the student's name, their email and the section's
--     history by `classroom_hall_pass_state`'s manager branch. A handle costs
--     them no disclosure whatever, because there is nothing here being kept
--     from them in the first place. Naming the pass is simply saying which one
--     they meant, and it is the only thing that can carry an intent across the
--     gap between reading a screen and pressing a control.
--   * A STUDENT CLOSES THEIR OWN AND NAMES NOTHING. `classroom_hall_pass_close_mine`
--     takes the SECTION and resolves the person from `current_user_email()`, so
--     there is still no handle anywhere in a student's payload and no argument
--     through which one could be supplied. `HallPassStudentState` keeps having
--     no field capable of naming anybody -- that property is load-bearing and is
--     swept for in tests/classroom-hall-pass.test.ts.
--
-- AND THE STUDENT PATH CANNOT HAVE THIS RACE AT ALL, structurally rather than
-- by being careful: it resolves the open pass and then requires the holder to
-- BE the caller. If A's pass closed and B's opened underneath, A's call finds
-- B's row, sees a holder who is not A, and answers `not_yours`. The worst
-- outcome available to it is a refusal, never a wrong close. That asymmetry is
-- the whole reason the two callers can be split rather than reconciled.
--
-- ---------------------------------------------------------------------------
-- ALREADY CLOSED IS A REFUSAL, NOT A SILENT SUCCESS
-- ---------------------------------------------------------------------------
--
-- `classroom_hall_pass_close_by_id` refuses a pass that is already closed with
-- `{ok:false, reason:'already_closed'}` rather than reporting a close it did
-- not perform. "The student signed themselves back in a moment ago" and "I
-- signed them back in" are different things that happened, and the instructor
-- is the person who needs to know which -- an interface that answered "signed
-- back in" to both would be telling them their press did something on exactly
-- the occasion it did nothing. It is also the ordinary outcome of the race
-- above once this file is applied: step 4 now finds A's pass closed and says
-- so, and B stays out.
--
-- ---------------------------------------------------------------------------
-- NOTHING IS DROPPED HERE, AND THAT IS THE DEPLOY ORDERING RATHER THAN AN
-- OVERSIGHT
-- ---------------------------------------------------------------------------
--
-- `classroom_hall_pass_close(uuid)` is LEFT EXACTLY AS 0143 CREATED IT. This
-- file is purely additive: two new function names, no signature widened, no
-- behaviour of an existing object changed. So there is no ordering between
-- applying it and deploying the client, and either may go first -- which is the
-- shape CLAUDE.md asks for on any RPC a deployed client already calls, and the
-- reason the SIGNATURE TRAP's mutually-blocking problem does not arise.
--
-- A drop in this file would create exactly that problem: applied before the
-- deploy it breaks every close on the live site, and applied after it breaks
-- every close until it lands. The precedent is 0124, which dropped the
-- classroom view-as functions in its OWN migration one bundle AFTER the routes
-- that called them were removed, for this reason.
--
-- SO THE RETIREMENT IS A CLIENT FACT FIRST. Once the client shipping alongside
-- this file is deployed, `classroom_hall_pass_close(uuid)` has NO CALLER: the
-- transports module names only the two functions below, and
-- tests/classroom-hall-pass.test.ts sweeps `src/` for the old name and reddens
-- if one comes back. Dropping the SQL object belongs in a later migration, on
-- its own, once that deploy is live -- and a `drop function` there must carry
-- its own caller guard, because Postgres records no dependency from one plpgsql
-- body to another.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DOES NOT RESTATE
-- ---------------------------------------------------------------------------
--
-- Every rule 0143 already states is 0143's. Nothing here re-implements the
-- capacity check (the partial unique index), re-decides who may open, re-states
-- the two projections, or touches the table, its grants, its RLS posture or its
-- comment. The conventions followed from that file, deliberately:
--
--   * SECURITY DEFINER with `set search_path = ''` and every reference schema
--     qualified.
--   * A REFUSAL A CALLER MUST DISPLAY IS `{ok:false, reason:...}` jsonb;
--     genuine misuse (no session, a pass the caller may not touch) RAISES.
--   * NO REFUSAL NAMES A DATABASE OBJECT -- no table, no index, no SQLSTATE.
--   * "NOT FOUND" AND "NOT YOURS" ANSWER IDENTICALLY, so an id cannot be
--     probed. A pass id that does not exist and one in a section the caller
--     does not manage raise the SAME sentence.
--   * THE NAME AND EMAIL RIDE BACK ONLY FOR A MANAGER, and the manager result
--     shape is byte-for-byte the one 0143's close already returned, so the
--     surface reading it needs no second shape.
--   * A NEW FUNCTION IS NOT COVERED BY 0137 and revokes for itself, naming
--     every role rather than `public` alone -- a hosted Supabase project writes
--     a DIRECT `anon` grant into every new function's `proacl` at creation.
--   * The self-check READS THE CATALOG back rather than reporting that a
--     statement ran.
--
-- `closed_by` KEEPS SAYING SOMETHING TRUE ON BOTH PATHS. It is the email of
-- whoever actually pressed the control: the instructor on the manager path, the
-- student themselves on their own. Neither path can write the other's, because
-- neither has an argument through which to name a person -- the manager path
-- names a PASS and the student path names a SECTION, and both take the actor
-- from `current_user_email()`.

-- ---------------------------------------------------------------------------
-- 1. The manager's close: by pass id, refusing one already closed.
-- ---------------------------------------------------------------------------
--
-- MANAGER ONLY. There is no student branch in this function at all: a student
-- reaching it, with any id, is refused by the same raise a nonexistent pass
-- gets. Their own close is the next function, which needs no id.
create or replace function public.classroom_hall_pass_close_by_id(p_pass_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_section uuid;
	v_holder text;
	v_name text;
	v_opened timestamptz;
	v_already timestamptz;
	v_closed timestamptz;
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_pass_id is null then
		raise exception 'That pass does not exist.';
	end if;

	-- THE ROW IS LOCKED BEFORE ANYTHING IS DECIDED ABOUT IT, and it is looked up
	-- by ID -- so the row this function locks is the row the caller named, not
	-- whatever happens to be open in some section at this instant. That is the
	-- entire fix. `closed_at` is read INSIDE the lock, because whether it is
	-- already stamped is the question this function exists to answer honestly.
	select h.section_id, h.student_email, h.opened_at, h.closed_at
	into v_section, v_holder, v_opened, v_already
	from public.classroom_hall_passes h
	where h.id = p_pass_id
	for update;

	-- A PASS THAT DOES NOT EXIST AND A PASS THE CALLER MAY NOT TOUCH ARE THE
	-- SAME SENTENCE. Both raise, and both raise identically, so a pass id cannot
	-- be probed by comparing answers. The manage check is what makes this
	-- manager-only: a student holding their own pass id gets this raise too,
	-- because their close is the function below and takes no id.
	if v_section is null or not public.classroom_manages_section(v_section) then
		raise exception 'That pass does not exist.';
	end if;

	-- ALREADY CLOSED IS A REFUSAL, NOT A SILENT SUCCESS -- see the header. This
	-- is the branch the three-way race lands in once this file is applied: the
	-- student signed themselves back in, so the instructor's press finds a
	-- closed pass and says so, and whoever is out NOW is untouched.
	if v_already is not null then
		return jsonb_build_object('ok', false, 'reason', 'already_closed');
	end if;

	update public.classroom_hall_passes h
	set closed_at = now(), closed_by = v_email
	where h.id = p_pass_id
	returning h.closed_at into v_closed;

	select e.display_name into v_name
	from public.classroom_enrollments e
	where e.section_id = v_section and e.student_email = v_holder;

	-- THE SHAPE IS 0143'S CLOSE RESULT, UNCHANGED, so the surface reading it
	-- needs no second shape and no branch. `closed_by_manager` is constant true
	-- here because only a manager can reach this line.
	return jsonb_build_object(
		'ok', true,
		'pass_id', p_pass_id,
		'section_id', v_section,
		'opened_at', v_opened,
		'closed_at', v_closed,
		'closed_by_manager', true,
		'student_email', v_holder,
		'student_name', coalesce(v_name, v_holder)
	);
end;
$$;

comment on function public.classroom_hall_pass_close_by_id(uuid) is
'Signs ONE NAMED PASS back in, on behalf of an instructor of its section.

Takes the PASS, not the section, and that is the whole point: classroom_hall_pass_close(uuid) re-resolves "whatever is open in this section" at press time, so an instructor clearing a pass in the same instant one student returns and another leaves closes the SECOND student''s pass and marks them back in the room while they are in a corridor. A pass id is what carries the instructor''s intent across the gap between reading the screen and pressing the control.

It costs no disclosure: classroom_hall_pass_state already hands a manager the pass id, the name, the email and the history. A STUDENT still names nothing -- their close is classroom_hall_pass_close_mine(uuid), which takes a section and resolves the person from current_user_email().

A pass that is already closed is REFUSED with {ok:false, reason:''already_closed''} rather than reported as a close, because "the student signed themselves back in" and "I signed them back in" are different outcomes.

A pass id that does not exist and one whose section the caller does not manage raise the SAME sentence, so an id cannot be probed.';

revoke all on function public.classroom_hall_pass_close_by_id(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_hall_pass_close_by_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The student's close: their own, naming nobody.
-- ---------------------------------------------------------------------------
--
-- NO IDENTITY PARAMETER AND NO PASS PARAMETER. The student is
-- `current_user_email()` and the pass is whichever open one in this section is
-- theirs, so there is no argument through which to close somebody else's and
-- nothing for a student's payload to have to carry. This is 0143's own rule for
-- `classroom_hall_pass_open` applied to the other half of the pair.
create or replace function public.classroom_hall_pass_close_mine(p_section_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_id uuid;
	v_holder text;
	v_opened timestamptz;
	v_closed timestamptz;
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;
	-- A section this caller cannot see and one that does not exist answer the
	-- same way, exactly as 0143's two writes do.
	if p_section_id is null or not public.classroom_can_read_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;

	select h.id, h.student_email, h.opened_at
	into v_id, v_holder, v_opened
	from public.classroom_hall_passes h
	where h.section_id = p_section_id and h.closed_at is null
	for update;

	if v_id is null then
		-- A REFUSAL, NOT A RAISE: pressing "back" when a pass has already been
		-- closed a second earlier is ordinary, and the second press is a no-op
		-- somebody should be told about rather than an error.
		return jsonb_build_object('ok', false, 'reason', 'not_open');
	end if;

	-- THE OWNERSHIP TEST IS WHAT MAKES THIS PATH RACE-FREE, and it is why the
	-- section is a safe handle here where it is not for a manager. If this
	-- caller's own pass was closed and somebody ELSE has since signed out, the
	-- row found above is that other student's, the holder is not this caller,
	-- and the answer is a refusal. The worst outcome reachable from here is
	-- `not_yours`; a wrong close is not expressible.
	--
	-- `not_yours` discloses nothing: it tells a student the open pass is not
	-- theirs, which they knew before they asked, and names nobody.
	if v_holder is distinct from v_email then
		return jsonb_build_object('ok', false, 'reason', 'not_yours');
	end if;

	update public.classroom_hall_passes h
	set closed_at = now(), closed_by = v_email
	where h.id = v_id
	returning h.closed_at into v_closed;

	-- A STUDENT IS TOLD ABOUT THEIR OWN PASS AND NOTHING ELSE. There is no name
	-- and no email in this object, and there is no branch here that could put
	-- one in -- the manager fields of 0143's close result are absent rather than
	-- nulled by a condition, which is the same reason its two read projections
	-- are built separately instead of stripped.
	return jsonb_build_object(
		'ok', true,
		'pass_id', v_id,
		'section_id', p_section_id,
		'opened_at', v_opened,
		'closed_at', v_closed,
		'closed_by_manager', false,
		'student_email', null,
		'student_name', null
	);
end;
$$;

comment on function public.classroom_hall_pass_close_mine(uuid) is
'Signs the CALLER''S OWN pass back in. Takes no identity parameter and no pass id: the student is current_user_email() and the pass is whichever open one in this section belongs to them, so closing somebody else''s is not expressible.

Refuses with {ok:false, reason:''not_open''} when nothing is open, and ''not_yours'' when the open pass belongs to another student -- which is also what makes this path race-free. If the caller''s pass closed and another student signed out in between, this finds that student''s row, sees a holder who is not the caller, and refuses. A wrong close is not reachable.

An instructor clearing somebody else''s pass uses classroom_hall_pass_close_by_id(uuid), which names the pass.

The result carries no name and no email: student_email and student_name are constant null here.';

revoke all on function public.classroom_hall_pass_close_mine(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_hall_pass_close_mine(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. What this deployment actually holds.
--
-- The ACL and the catalog are READ BACK rather than assumed, 0143's rule: a
-- self-check reporting that a revoke statement ran tells an operator only that
-- the statement ran.
-- ---------------------------------------------------------------------------

do $$
declare
	v_new integer;
	v_old integer;
	v_open_now integer;
	r record;
begin
	-- BOTH NEW FUNCTIONS EXIST AT EXACTLY ONE ARITY EACH. A second overload of
	-- either would make PostgREST unable to resolve the call at all (the
	-- SIGNATURE TRAP), so the count is asserted rather than the mere existence.
	select count(*) into v_new
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public'
		and p.proname in ('classroom_hall_pass_close_by_id', 'classroom_hall_pass_close_mine');
	if v_new <> 2 then
		raise exception '0144: expected exactly 2 new close functions, found %. An extra overload would make PostgREST unable to resolve the call.', v_new;
	end if;

	-- AND 0143'S CLOSE IS STILL HERE, DELIBERATELY. This file is additive so
	-- that applying it and deploying the client have no ordering between them;
	-- see the header. If this ever reports 0, something dropped it early and
	-- every close on a not-yet-deployed client is broken.
	select count(*) into v_old
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_hall_pass_close';
	if v_old <> 1 then
		raise exception '0144: classroom_hall_pass_close is not present exactly once (found %). This file must not drop it -- the drop belongs in a later migration, after the client that stops calling it is deployed.', v_old;
	end if;

	-- The grants, read off the catalog. Every hall-pass function, old and new,
	-- must be closed to anon and open to authenticated.
	for r in
		select p.oid::regprocedure::text as sig,
			has_function_privilege('anon', p.oid, 'execute') as anon_x,
			has_function_privilege('authenticated', p.oid, 'execute') as auth_x
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname like 'classroom_hall_pass%'
		order by 1
	loop
		if r.anon_x or not r.auth_x then
			raise exception '0144: grant is wrong on % -- anon execute=%, authenticated execute=%. Expected false/true.',
				r.sig, r.anon_x, r.auth_x;
		end if;
		raise notice '0144: % -- anon %, authenticated %.', r.sig, r.anon_x, r.auth_x;
	end loop;

	-- NOTHING IS BACKFILLED AND NO ROW IS TOUCHED. The count is reported so an
	-- operator applying this mid-period can see that whoever was out before is
	-- still out after -- this file changes how a pass is CLOSED, never the state
	-- of one already open.
	select count(*) into v_open_now
	from public.classroom_hall_passes where closed_at is null;
	raise notice '0144: the close is now split by role -- a manager names the pass, a student names nothing. % pass(es) currently open; none were altered.', v_open_now;
end $$;
