-- 0143_classroom_hall_pass.sql
--
-- THE DIGITAL BATHROOM PASS: one student out of a class at a time, signed out
-- and back in by the student themselves.
--
-- NOTHING LIKE THIS EXISTED. An audit before this file found no attendance, no
-- in-class-presence and no sign-out concept anywhere in the schema -- the only
-- occurrence of the word "bathroom" in the repository is the
-- `long_bathroom_break` fine in `coin_categories` (0070), and see the coin note
-- below for why that stays exactly where it is. So there is no shape here to be
-- consistent with and no rows to migrate; every decision below is being made
-- for the first time.
--
-- ---------------------------------------------------------------------------
-- THE DECISIONS, AND WHAT ENFORCES EACH ONE
-- ---------------------------------------------------------------------------
--
-- SELF-SERVE. There is no approval step, no request state and no instructor
-- grant. `classroom_hall_pass_open` is called by the student and resolves the
-- student from `current_user_email()`; it takes NO identity parameter, so "can
-- only act as themselves" is a property of the SIGNATURE rather than a check
-- somebody could get wrong. That is the convention every other student-facing
-- classroom write here already follows.
--
-- STATE IS DERIVED, NEVER STORED. Being out IS an open row: `closed_at is
-- null`. There is no boolean, no status column and no enum, so there is nothing
-- to drift out of step with the rows and nothing for a trigger to fail to
-- maintain. Elapsed time is arithmetic over `opened_at` at read time and is
-- stored nowhere.
--
-- ONE STUDENT OUT AT A TIME, PER SECTION, AND THE INDEX IS THE ENFORCEMENT.
-- `classroom_hall_passes_one_open_per_section` is a PARTIAL UNIQUE INDEX on
-- `(section_id) where closed_at is null`. That is a real capacity check in the
-- database, not a hidden button: two students tapping in the same second are
-- serialized by the index itself, one row is created and the other caller gets
-- a structured refusal.
--
--   * A COUNT-THEN-INSERT WOULD BE WRONG HERE and the codebase already says so
--     (see "SQL traps" in CLAUDE.md): under READ COMMITTED each caller gets its
--     own snapshot, both count zero, both insert. The usual fix -- lock the
--     parent with `select ... for update` -- is available on this table (the
--     section row exists) but buys nothing the index does not already
--     guarantee, and it would leave the invariant resting on every future
--     caller remembering to take the lock. The index holds against a caller
--     that has not been written yet.
--   * IT IS NOT A VOLATILE PREDICATE. `closed_at is null` is a plain column
--     test, so unlike the Foundry play window (0139, which needed
--     `pg_advisory_xact_lock` because `now()` cannot appear in an index
--     predicate) this one can be an index and therefore does not need a lock
--     convention at all.
--   * THE REFUSAL NAMES NO DATABASE OBJECT. A bare unique violation would put
--     `duplicate key value violates unique constraint
--     "classroom_hall_passes_one_open_per_section"` in front of a student. The
--     open RPC catches `unique_violation` and answers
--     `{ok:false, reason:'taken'}` instead.
--
-- NO AUTO-CLOSE AND NO TIME LIMIT. Nothing in this file expires a pass, and
-- there is no cron, no trigger and no staleness window. A long absence is a
-- conversation an instructor has, not something the schema adjudicates.
--
-- NO LINK TO THE COIN ECONOMY. `coin_categories` prices a
-- `long_bathroom_break` fine (0070) and it stays a separate manual judgement.
-- Nothing here reads, writes or references `coin_transactions`, and a duration
-- computed by this feature must never become an input to one: the moment a
-- clock charges a student automatically, the pass stops being a pass and
-- becomes a meter. If that is ever wanted it is a deliberate bundle with its
-- own argument, not a join added here.
--
-- ---------------------------------------------------------------------------
-- DISCLOSURE, WHICH IS THE PART THIS FILE EXISTS TO GET RIGHT
-- ---------------------------------------------------------------------------
--
-- A PERMANENT PEER-VISIBLE RECORD OF WHO LEFT CLASS IS A BIGGER THING THAN
-- THIS FEATURE IS. An enrolled student may learn exactly one bit -- whether the
-- pass is TAKEN -- and never by whom, never for how long, and never anything
-- about any past pass. An instructor of the section sees the name, the time out
-- and the history, because that is the person the record is for.
--
-- THAT IS ENFORCED IN THREE INDEPENDENT PLACES, and no one of them is trusted
-- on its own:
--
--   1. THE TABLE IS SHUT. RLS is enabled with NO POLICY and NO GRANT to `anon`
--      or `authenticated` -- the `student_app_plays` shape (0139). Either the
--      missing grant or the missing policy alone denies every select, so a
--      student reading the raw table through PostgREST gets nothing whatever
--      their session says. There is no view over it, and there must never be
--      one: a view naming `student_email` beside a section is a list of who
--      left class.
--   2. THE READ FUNCTION PROJECTS BY ROLE, BY CONSTRUCTION. There is exactly
--      one read path, `classroom_hall_pass_state`, and it BUILDS two different
--      objects in two branches rather than building one and stripping fields
--      from it. A field cannot leak by being forgotten in a strip step that
--      does not exist. The student branch has no expression anywhere in it that
--      mentions another person's email, name or `opened_at`.
--   3. NOTHING ELSE PROJECTS A PASS AT ALL. The two write functions answer
--      about the caller's own action; the manager-only fields on the close
--      result are gated on the same `classroom_manages_section` the read uses.
--
-- WHAT A STUDENT CAN STILL INFER is that somebody is out, which they can also
-- see by looking at the empty chair. What they cannot obtain from this schema,
-- by any path, is a name or a history.
--
-- A NON-MEMBER GETS NULL, NOT A REFUSAL. `classroom_hall_pass_state` answers
-- NULL for a section the caller neither manages nor is enrolled in -- the same
-- answer a section id that does not exist gives, so an id cannot be probed.
--
-- ---------------------------------------------------------------------------
-- THE ENROLLMENT IS A COMPOSITE FOREIGN KEY, NOT AN RPC CHECK
-- ---------------------------------------------------------------------------
--
-- `(section_id, student_email)` references `classroom_enrollments` on its own
-- primary key, so a pass for somebody who is not on that section's roster is
-- UNREPRESENTABLE rather than merely refused. No RPC has to re-check it and no
-- future write path can route around it. (The open RPC still asks
-- `classroom_is_enrolled`, which is a stricter question -- it also requires the
-- enrollment to be ACTIVE, which the key cannot express.)
--
-- IT CASCADES, AND THAT IS A DELIBERATE ASYMMETRY WITH 0138.
-- `classroom_remove_enrollment` REFUSES to remove a student who has responses,
-- submissions, approvals or notebook entries, because those are WORK and
-- deleting the enrollment would strand them. A hall pass is not work: it is an
-- operational record of a few minutes of one period. So it cascades, and
-- removing an enrollment silently takes that student's pass history with it.
-- This is written down because it is the kind of thing that looks like an
-- oversight later: adding hall passes to 0138's stranding counts would make a
-- roster correction refusable because somebody once went to the bathroom.
--
-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_hall_passes (
	id uuid primary key default gen_random_uuid(),
	section_id uuid not null,
	-- Lowercased, exactly as `classroom_enrollments.student_email` is -- the
	-- composite key below cannot match otherwise, and `current_user_email()`
	-- already lowercases what it returns.
	student_email text not null
		check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	opened_at timestamptz not null default now(),
	-- NULL IS THE WHOLE STATE MODEL. Null means out; a stamp means back. There
	-- is no third value and no boolean beside it.
	closed_at timestamptz,
	-- Who pressed the button that closed it: the student themselves, or an
	-- instructor of the section. Informational, and the only reason it is a
	-- column rather than derived is that it genuinely cannot be derived.
	closed_by text,
	-- A pass that came back before it left is a clock or a caller fault, and it
	-- would make every duration in the history negative.
	constraint classroom_hall_passes_closed_after_open
		check (closed_at is null or closed_at >= opened_at),
	constraint classroom_hall_passes_enrollment_fk
		foreign key (section_id, student_email)
		references public.classroom_enrollments (section_id, student_email)
		on delete cascade
);

-- THE CAPACITY CHECK. See the header: this is the enforcement, not the UI.
create unique index if not exists classroom_hall_passes_one_open_per_section
	on public.classroom_hall_passes (section_id)
	where closed_at is null;

-- The history read is "this section, newest first".
create index if not exists classroom_hall_passes_section_opened_idx
	on public.classroom_hall_passes (section_id, opened_at desc);

comment on table public.classroom_hall_passes is
'One row per hall pass. An OPEN row (closed_at is null) means that student is currently out of that class; there is no boolean anywhere and elapsed time is computed at read.

RLS is enabled with NO POLICY and NO GRANT to anon or authenticated, deliberately: every path is a SECURITY DEFINER RPC. A student may learn only WHETHER the pass is taken, never by whom -- do not add a policy, a grant or a view over this table.

One open row per section is enforced by the partial unique index classroom_hall_passes_one_open_per_section, which is the capacity check itself.

Nothing here is connected to the coin economy. The long_bathroom_break fine (0070) is a separate manual judgement by an instructor and must stay one.';

-- RLS ON, NO POLICY, NO GRANT. Both halves are load-bearing; either one alone
-- already denies every client read. Nothing is granted to `anon` or
-- `authenticated` here, and 0137's sweep is about FUNCTION grants, so a table
-- created after it is not covered by anything -- the absence below is the
-- whole mechanism.
alter table public.classroom_hall_passes enable row level security;
revoke all on table public.classroom_hall_passes from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Reading the pass: ONE function, two projections, built separately.
-- ---------------------------------------------------------------------------
--
-- ONE READ PATH RATHER THAN TWO, so "what can a student learn about a pass" is
-- answerable by reading one function straight through. The manager's history
-- rides on the same call because the alternative -- a second RPC a student can
-- also invoke and that answers empty -- is a surface whose emptiness somebody
-- has to keep true.
--
-- THE TWO BRANCHES SHARE NO OBJECT. The student branch never evaluates a name,
-- an email or another person's timestamp; it is not the manager object with
-- keys removed.
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
begin
	-- No session is not an error, it is simply nobody to answer about.
	if v_email = '' or p_section_id is null then
		return null;
	end if;

	v_manages := public.classroom_manages_section(p_section_id);

	-- A SECTION THE CALLER IS NEITHER IN NOR OVER IS INDISTINGUISHABLE FROM ONE
	-- THAT DOES NOT EXIST. Both are null; neither raises.
	if not v_manages and not public.classroom_is_enrolled(p_section_id) then
		return null;
	end if;

	select h.id, h.student_email, h.opened_at
	into v_open_id, v_open_email, v_open_at
	from public.classroom_hall_passes h
	where h.section_id = p_section_id and h.closed_at is null;

	if v_manages then
		-- The name is the ROSTER's `display_name`, which is what every other
		-- classroom surface shows. No profiles join and no email/uuid bridge: the
		-- enrollment row this pass is keyed to already carries the name.
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
				h.closed_by
			from public.classroom_hall_passes h
			left join public.classroom_enrollments e
				on e.section_id = h.section_id and e.student_email = h.student_email
			where h.section_id = p_section_id
			order by h.opened_at desc
			limit v_limit
		) x;

		return jsonb_build_object(
			'scope', 'manager',
			'section_id', p_section_id,
			'taken', v_open_id is not null,
			'mine', false,
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

	-- THE STUDENT PROJECTION. `taken` is one bit. `opened_at` is returned ONLY
	-- when the open pass is the caller's own, which is their own timestamp
	-- rather than a disclosure about anybody. There is no name, no email, no
	-- pass id and no history in this object at all, and nothing here reads
	-- `v_open_name` (which is never even populated on this path).
	return jsonb_build_object(
		'scope', 'student',
		'section_id', p_section_id,
		'taken', v_open_id is not null,
		'mine', v_open_email is not distinct from v_email,
		'opened_at', case when v_open_email is not distinct from v_email then v_open_at end
	);
end;
$$;

comment on function public.classroom_hall_pass_state(uuid, integer) is
'The hall pass state for one section, projected by what the caller is.

A MANAGER gets the name, email, opened_at and pass id of whoever is out, plus the recent history. AN ENROLLED STUDENT gets whether the pass is taken and whether it is theirs, and nothing else -- no name, no email, no pass id, no history, and no opened_at for anybody but themselves. Anyone else gets NULL, which is also what a section id that does not exist returns.

The two projections are built in separate branches on purpose: a field cannot leak by being forgotten in a strip step, because there is no strip step. Do not refactor them into one object.';

revoke all on function public.classroom_hall_pass_state(uuid, integer)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_hall_pass_state(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Signing out.
-- ---------------------------------------------------------------------------
--
-- NO IDENTITY PARAMETER. The student is `current_user_email()`, so this
-- function cannot be asked to sign somebody else out -- there is no argument
-- through which to name them.
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
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;

	-- A section this caller cannot see and one that does not exist answer the
	-- same way, so an id cannot be probed through the write path either.
	if p_section_id is null or not public.classroom_can_read_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;

	-- AN INSTRUCTOR DOES NOT TAKE A HALL PASS, and this is not covered by the
	-- enrollment check below: instructors do enroll themselves to see a class
	-- the way a student does, and roster imports sweep them in (0138). So the
	-- manage question is asked separately and first.
	if public.classroom_manages_section(p_section_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_a_student');
	end if;

	if not public.classroom_is_enrolled(p_section_id) then
		raise exception 'Only a student enrolled in this class can take the hall pass.';
	end if;

	begin
		insert into public.classroom_hall_passes (section_id, student_email)
		values (p_section_id, v_email)
		returning id, opened_at into v_id, v_opened;
	exception when unique_violation then
		-- THE CAPACITY REFUSAL, AND THE STATE IS RE-ASKED RATHER THAN ASSUMED.
		-- The winner committed between our snapshot and our insert, so the only
		-- honest answer comes from reading the row that beat us. It may already
		-- be closed again by the time we look, which still resolves to `taken`:
		-- it WAS taken at the moment this caller asked, and offering a different
		-- word for a race that has since resolved would be inventing detail.
		--
		-- The message a caller renders comes from `reason`, never from the
		-- SQLSTATE and never from the constraint name -- see the header.
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
		'opened_at', v_opened
	);
end;
$$;

comment on function public.classroom_hall_pass_open(uuid) is
'Signs the CALLER out of one section. Takes no identity parameter: the student is current_user_email(), so acting as somebody else is not expressible.

Refuses with {ok:false, reason:''taken''} when another student already holds the section''s pass, and reason ''already_out'' when the caller does. That refusal comes from catching the partial unique index''s violation, so two simultaneous callers resolve to one pass and one refusal -- and the message never names the index, the table or the SQLSTATE.

An instructor of the section is refused with reason ''not_a_student'' even when they hold an enrollment row, which they often do.';

revoke all on function public.classroom_hall_pass_open(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_hall_pass_open(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Signing back in.
-- ---------------------------------------------------------------------------
--
-- EITHER THE STUDENT OR ANY INSTRUCTOR OF THAT SECTION. It takes the SECTION
-- rather than a pass id, which matters for disclosure as well as for
-- ergonomics: a student's payload carries no pass id for a pass that is not
-- theirs (see `classroom_hall_pass_state`), so there is no handle to leak and
-- none to guess at.
create or replace function public.classroom_hall_pass_close(p_section_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_manages boolean;
	v_id uuid;
	v_holder text;
	v_name text;
	v_opened timestamptz;
	v_closed timestamptz;
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;
	if p_section_id is null or not public.classroom_can_read_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;

	v_manages := public.classroom_manages_section(p_section_id);

	-- `for update` so two people pressing at once do not both stamp the row and
	-- both report a close. The loser re-reads inside the lock and finds it
	-- already closed, which is the `not_open` refusal below.
	select h.id, h.student_email, h.opened_at
	into v_id, v_holder, v_opened
	from public.classroom_hall_passes h
	where h.section_id = p_section_id and h.closed_at is null
	for update;

	if v_id is null then
		-- A REFUSAL, NOT A RAISE. Two people pressing "back" a second apart is
		-- ordinary, and the second one is a no-op somebody should be told about
		-- rather than an error.
		return jsonb_build_object('ok', false, 'reason', 'not_open');
	end if;

	-- THE CLOSE GATE. A student may close only their OWN pass; an instructor of
	-- the section may close whichever one is open. `not_yours` discloses
	-- nothing: it tells a student the open pass is not theirs, which they knew
	-- before they asked, and names nobody.
	if not v_manages and v_holder is distinct from v_email then
		return jsonb_build_object('ok', false, 'reason', 'not_yours');
	end if;

	update public.classroom_hall_passes h
	set closed_at = now(), closed_by = v_email
	where h.id = v_id
	returning h.closed_at into v_closed;

	if v_manages then
		select e.display_name into v_name
		from public.classroom_enrollments e
		where e.section_id = p_section_id and e.student_email = v_holder;
	end if;

	-- THE NAME AND EMAIL RIDE BACK ONLY FOR A MANAGER, so the surface can say
	-- "signed in Ana Reyes" without a second read. A student closing their own
	-- pass is told about their own pass and nothing else -- and a student can
	-- only ever reach this line for their own, per the gate above.
	return jsonb_build_object(
		'ok', true,
		'pass_id', v_id,
		'section_id', p_section_id,
		'opened_at', v_opened,
		'closed_at', v_closed,
		'closed_by_manager', v_manages,
		'student_email', case when v_manages then v_holder end,
		'student_name', case when v_manages then coalesce(v_name, v_holder) end
	);
end;
$$;

comment on function public.classroom_hall_pass_close(uuid) is
'Signs the section''s open pass back in. The caller must be the student holding it, or an instructor of the section (classroom_manages_section); anyone else gets {ok:false, reason:''not_yours''}, which names nobody.

Takes the SECTION, not a pass id: a student''s state payload carries no id for a pass that is not theirs, so there is no handle to leak.

The student name and email are returned ONLY to a manager.';

revoke all on function public.classroom_hall_pass_close(uuid)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_hall_pass_close(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. What this deployment actually holds.
--
-- The ACL and the catalog are READ BACK rather than assumed: a self-check
-- reporting that a revoke statement ran tells an operator only that the
-- statement ran.
-- ---------------------------------------------------------------------------

do $$
declare
	v_policies integer;
	v_rls boolean;
	v_table_grants integer;
	v_index boolean;
	v_sections integer;
	v_enrollments integer;
	r record;
begin
	select relrowsecurity into v_rls
	from pg_class where oid = 'public.classroom_hall_passes'::regclass;

	select count(*) into v_policies
	from pg_policies where schemaname = 'public' and tablename = 'classroom_hall_passes';

	select count(*) into v_table_grants
	from information_schema.role_table_grants
	where table_schema = 'public'
		and table_name = 'classroom_hall_passes'
		and grantee in ('anon', 'authenticated', 'public');

	select exists (
		select 1 from pg_indexes
		where schemaname = 'public'
			and tablename = 'classroom_hall_passes'
			and indexname = 'classroom_hall_passes_one_open_per_section'
	) into v_index;

	if not v_rls then
		raise exception '0143: RLS is OFF on classroom_hall_passes. The table is open.';
	end if;
	if v_policies <> 0 then
		raise exception '0143: classroom_hall_passes has % policy/policies. It must have NONE -- every path is a definer RPC.', v_policies;
	end if;
	if v_table_grants <> 0 then
		raise exception '0143: classroom_hall_passes carries % grant(s) to anon/authenticated/public. It must carry none.', v_table_grants;
	end if;
	if not v_index then
		raise exception '0143: the partial unique index is missing. There is no capacity check.';
	end if;

	raise notice '0143: classroom_hall_passes -- RLS on, 0 policies, 0 client grants, capacity index present.';

	-- The three functions, read off the catalog rather than assumed.
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
			raise exception '0143: grant is wrong on % -- anon execute=%, authenticated execute=%. Expected false/true.',
				r.sig, r.anon_x, r.auth_x;
		end if;
		raise notice '0143: % -- anon %, authenticated %.', r.sig, r.anon_x, r.auth_x;
	end loop;

	select count(*) into v_sections from public.classroom_sections;
	select count(*) into v_enrollments from public.classroom_enrollments where active;
	raise notice '0143: the hall pass is now available in % section(s), to % active enrollment(s). No rows were created and nothing was backfilled -- there was no prior sign-out concept of any kind to migrate.',
		v_sections, v_enrollments;
end $$;
