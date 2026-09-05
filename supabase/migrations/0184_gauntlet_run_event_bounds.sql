-- 0184_gauntlet_run_event_bounds.sql
-- IDEA // GAUNTLET: bound what one run may write into gauntlet_run_events.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FIXES AND WHAT IT DELIBERATELY DOES NOT
-- ---------------------------------------------------------------------------
-- `gauntlet_run_events_insert` is granted to `anon` and that grant is CORRECT
-- and stays: a SolidWorks COM add-in and two VBA macros post with the public
-- anon key and the run CODE as the credential, because there is no session to
-- have (0035 section 4, 0016, 0137's own census). Nothing below asks for one.
--
-- What the grant was missing is any bound at all. Measured in the harness
-- against the deployed function, as `anon` with no claims:
--
--   * 100 sequential calls -> 100 rows, 0 refused.
--   * ONE call carrying 5,000 events -> 5,000 rows.
--   * ONE row carrying a 2 MB jsonb payload -> accepted.
--   * A token stamped expired 30 days ago, used AND locked -> STILL ACCEPTED,
--     while `gauntlet_macro_start` on that same token refuses with
--     "This code is no longer active."
--
-- So the write was unbounded in count, unbounded in size, and unbounded in
-- TIME: a code stayed a live write credential to its own run forever.
--
-- WHAT IS NOT FIXED, BECAUSE IT CANNOT BE. A student can still forge their own
-- run's trail, and 0152 already decided that and gave the reasoning: the forger
-- legitimately holds the credential, so no credential closes it, and a gate
-- would unrank two documented honest paths to impose one extra POST on a
-- forger. This file does not reopen that decision. It is about cost and about
-- the window, not about trust.
--
-- CROSS-PERSON FORGERY WAS ALREADY IMPOSSIBLE and stays so: the owner is
-- resolved from the token, never read from the client. Measured -- Ana's code
-- with Ben's run_id inserted 0 rows, and every row written under Ana's code was
-- attributed to Ana.
--
-- ---------------------------------------------------------------------------
-- THE THREE BOUNDS, AND WHY EACH ONE CANNOT REFUSE A LEGITIMATE FLUSH
-- ---------------------------------------------------------------------------
--   1. EXPIRY. Refuse once `now() > expires_at`. The token's whole life is 30
--      minutes (`gauntlet_speedrun_reveal`, measured: expires_at - reveal_at =
--      1800s), and BOTH `gauntlet_macro_start` and `gauntlet_macro_submit`
--      already refuse past that instant. So past expiry there is no run left to
--      start and no submit left to record, and nothing legitimate is lost.
--
--      IT KEYS ON `expires_at` ALONE, NEVER ON `used_at` OR `locked_at`, AND
--      THAT IS THE TRAP IN THIS FILE. A correct SOLO submit sets `locked_at`
--      (measured: after a correct submit, used=false, locked=true, expired=
--      false) and the add-in's GUARANTEED FINAL FLUSH -- the one carrying
--      `run_end` -- posts immediately AFTER that submit returns. A bound that
--      also refused a locked token would therefore drop the closing event of
--      every correct run, silently, on the happy path.
--
--   2. ROWS PER RUN (`_gauntlet_run_event_cap`, 20000). The pane ticks at
--      1000ms and emits at most one `snapshot` per tick, so the whole 30-minute
--      token window cannot hold 1,800 snapshots; 20,000 is more than ten times
--      the ceiling a real run can reach and still turns "a million rows" into a
--      bounded number. Rows already stored count toward it, so the cap bounds
--      the RUN and not the call.
--
--   3. BYTES PER CALL (`_gauntlet_event_bytes_cap`, 262144). The recorder
--      flushes at 12 buffered events of a few hundred bytes each, and a failed
--      post LOSES its batch rather than growing it (`MaybeFlush` clears the
--      buffer before posting), so a legitimate document is single-digit KiB.
--      256 KiB is ~100x that and refuses the 2 MB row measured above.
--
-- ---------------------------------------------------------------------------
-- IT STILL NEVER RAISES. 0035 section 4's contract is that telemetry is
-- best-effort and cannot affect a run's outcome; every refusal here returns 0
-- or a short count, exactly as an unparseable run_id and an unknown code
-- already do. A bound that raised would make the thing it protects able to
-- break a submit.
--
-- NO DEPLOY ORDERING, AND NO SIGNATURE TRAP. The signature is unchanged --
-- (text, text, jsonb) -- so this is a plain `create or replace` with no drop,
-- no second overload, and no client change anywhere. The add-in and both VBA
-- macros keep working against it before and after.
--
-- WHAT UNDOES THIS FILE: re-apply 0035's section 4 body verbatim, then
-- `drop function if exists public._gauntlet_run_event_cap();` and
-- `drop function if exists public._gauntlet_event_bytes_cap();`.
--
-- Apply manually in the Supabase SQL editor. Idempotent; re-appliable.

-- ---------------------------------------------------------------------------
-- 1. The two caps, each written down ONCE. Two literals in two branches is how
--    a cap and the count checked against it stop being the same number
--    (0150's `_gauntlet_class_stat_floor` is the same shape).
--
--    Neither is reachable by a client role: a cap a caller can read is a cap a
--    caller can aim just under, and neither is ever returned to one.
-- ---------------------------------------------------------------------------
create or replace function public._gauntlet_run_event_cap()
returns integer
language sql
immutable
set search_path = ''
as $$ select 20000 $$;

comment on function public._gauntlet_run_event_cap() is
	'Max gauntlet_run_events rows one run may hold. >10x what a 30-minute token window can emit (0184).';

revoke all on function public._gauntlet_run_event_cap()
	from public, anon, authenticated, service_role;

create or replace function public._gauntlet_event_bytes_cap()
returns integer
language sql
immutable
set search_path = ''
as $$ select 262144 $$;

comment on function public._gauntlet_event_bytes_cap() is
	'Max bytes of one gauntlet_run_events_insert p_events document. ~100x a real 12-event flush (0184).';

revoke all on function public._gauntlet_event_bytes_cap()
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The bounded insert. 0035's body verbatim except for the three bounds; the
--    owner still comes from the token, the duplicate (run_id, seq) is still
--    ignored so a retried flush is still safe, and it still never raises.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_run_events_insert(
	p_code text,
	p_run_id text,
	p_events jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_token public.gauntlet_run_tokens%rowtype;
	v_run_id uuid;
	v_inserted integer := 0;
	v_room integer;
begin
	if p_code is null or p_run_id is null or p_events is null then
		return 0;
	end if;

	-- BOUND 3: the whole document. Cheap, and taken before anything is expanded.
	if pg_column_size(p_events) > public._gauntlet_event_bytes_cap() then
		return 0;
	end if;

	begin
		v_run_id := trim(p_run_id)::uuid;
	exception when others then
		return 0;
	end;

	select * into v_token from public.gauntlet_run_tokens where code = upper(trim(p_code));
	if not found or v_token.run_id is null or v_token.run_id <> v_run_id then
		-- Not a valid, started run for this code: drop the batch (never raise).
		return 0;
	end if;

	-- BOUND 1: the window. `expires_at` ONLY -- see the header on why a
	-- `locked_at` test here would drop the final flush of every correct run.
	if now() > v_token.expires_at then
		return 0;
	end if;

	-- BOUND 2: what this run has room left for. Rows already stored count, so
	-- the cap bounds the run rather than the call.
	select public._gauntlet_run_event_cap()
		- count(*)::integer
		into v_room
	from public.gauntlet_run_events
	where run_id = v_run_id;

	if v_room is null or v_room <= 0 then
		return 0;
	end if;

	insert into public.gauntlet_run_events
		(run_id, user_id, challenge_id, room_id, seq, t_ms, event_type, payload)
	select
		v_run_id, v_token.user_id, v_token.challenge_id, v_token.room_id,
		e.seq,
		e.t_ms,
		e.event_type,
		e.payload
	from (
		select
			(x ->> 'seq')::integer as seq,
			coalesce((x ->> 't_ms')::bigint, 0) as t_ms,
			coalesce(nullif(trim(x ->> 'event_type'), ''), 'unknown') as event_type,
			coalesce(x -> 'payload', '{}'::jsonb) as payload
		from jsonb_array_elements(p_events) x
		where (x ->> 'seq') is not null
		order by (x ->> 'seq')::integer
		limit v_room
	) e
	on conflict (run_id, seq) do nothing;

	get diagnostics v_inserted = row_count;
	return v_inserted;
end;
$$;

comment on function public.gauntlet_run_events_insert(text, text, jsonb) is
	'Append-only Speedrun telemetry (0035), bounded by window, rows-per-run and bytes-per-call (0184). Anon + run code is the credential; never raises.';

-- `create or replace` under this project's default privileges hands a function
-- a fresh grant to every client role (the 0137 rule), so the grant is restated
-- BY NAME rather than assumed to have survived. The end state is 0035's.
revoke all on function public.gauntlet_run_events_insert(text, text, jsonb)
	from public, anon, authenticated, service_role;
grant execute on function public.gauntlet_run_events_insert(text, text, jsonb)
	to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Self-check. Reads the catalog back rather than trusting the statements
--    above, and REFUSES rather than leaving a half-bounded function standing.
-- ---------------------------------------------------------------------------
do $$
declare
	c_insert constant text := 'public.gauntlet_run_events_insert(text, text, jsonb)';
	v_problems text[] := '{}';
begin
	if not has_function_privilege('anon', c_insert, 'execute') then
		v_problems := v_problems || 'anon lost EXECUTE on gauntlet_run_events_insert (the add-in path)';
	end if;
	if not has_function_privilege('authenticated', c_insert, 'execute') then
		v_problems := v_problems || 'authenticated lost EXECUTE on gauntlet_run_events_insert';
	end if;
	if has_function_privilege('anon', 'public._gauntlet_run_event_cap()', 'execute')
		or has_function_privilege('authenticated', 'public._gauntlet_run_event_cap()', 'execute')
		or has_function_privilege('anon', 'public._gauntlet_event_bytes_cap()', 'execute')
		or has_function_privilege('authenticated', 'public._gauntlet_event_bytes_cap()', 'execute') then
		v_problems := v_problems || 'a cap helper is reachable by a client role';
	end if;
	if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'gauntlet_run_events_insert') <> 1 then
		v_problems := v_problems || 'gauntlet_run_events_insert is not exactly one overload';
	end if;

	if array_length(v_problems, 1) is not null then
		raise exception '0184 self-check failed: %', array_to_string(v_problems, '; ');
	end if;

	raise notice '0184: run-event bounds applied. rows/run=%, bytes/call=%, window=token expires_at.',
		public._gauntlet_run_event_cap(), public._gauntlet_event_bytes_cap();
end $$;
