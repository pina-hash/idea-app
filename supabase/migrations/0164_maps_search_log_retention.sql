-- 0164_maps_search_log_retention.sql
--
-- IDEA MAPS: BOUND THE SIZE OF THE ANONYMOUS SEARCH LOG. A statement-level
-- AFTER INSERT trigger prunes public.maps_search_log by AGE and by a ROW
-- CEILING. Based on 0162, which created the table, its two policies and its
-- grants, and on docs/standards/IDEA_MAPS_SPEC.md v1.1 section 5.4.
--
-- ---------------------------------------------------------------------------
-- THIS BOUNDS STORAGE. IT DOES NOT BOUND REQUEST RATE, AND THE SURFACE IS NOT
-- PROTECTED BY THIS FILE.
-- ---------------------------------------------------------------------------
-- `POST /rest/v1/maps_search_log` accepts anonymous writes from the open
-- internet, and after this migration it still does, at exactly the same rate,
-- from exactly the same callers. A script can still issue unlimited requests
-- and each one still does work: a row insert, an index insert, WAL, and now a
-- prune probe as well. What changes is only that the table stops growing
-- without limit -- the rows are removed behind the writer, not refused in front
-- of it.
--
-- RATE LIMITING IS NOT SOLVED HERE AND CANNOT BE SOLVED HERE. It needs a stable
-- key per caller, and 5.4 forbids storing one: "Every query is logged with its
-- result count and timestamp, no identity (readers are anonymous)." An address,
-- an address hash, a cookie or a token would each be that key, and each would
-- turn an anonymous log into a per-person one. That is a real constraint of the
-- spec rather than an oversight in it. Rate limiting belongs at the EDGE --
-- Vercel or Supabase in front of PostgREST, where a request can be counted and
-- dropped without anything about the requester reaching a table. Nothing in
-- this file substitutes for that, and anybody reading this file as "the log is
-- handled now" has read it wrong.
--
-- ---------------------------------------------------------------------------
-- WHAT IT DOES, AND THE NUMBERS
-- ---------------------------------------------------------------------------
-- Two prunes, both inside one trigger function, and they answer two different
-- questions:
--
--   * RETENTION BY AGE -- 90 DAYS -- bounds how far back the log is USEFUL, and
--     runs on every insert statement. 5.4's reason for the log is an admin
--     surface that "ranks zero-result and low-result queries by frequency", and
--     a frequency ranking needs enough history to tell a recurring gap from a
--     one-off. Ninety days is about a school term: within one term the miss a
--     class hits repeatedly is a pattern, and a query nobody has typed in a
--     whole term is not a gap worth authoring an alias for. Longer, and the
--     ranking starts weighing last term's vocabulary against this term's.
--     AGE RETENTION ALONE BOUNDS NOTHING AGAINST A FLOOD, which is why it is
--     not the whole answer: a script inserting ten million rows a day keeps
--     every one of them for ninety days.
--
--   * A ROW CEILING -- 200,000 ROWS -- is the half that actually bounds size,
--     and it is sampled (below). Real use does not approach it: a few hundred
--     students searching a handful of times a day accrues single-digit
--     thousands of rows a term, so the ceiling sits about two orders of
--     magnitude above genuine traffic and only a script ever reaches it. At the
--     column widths 0162 defines (a uuid, a text capped at 400 characters, an
--     integer, a timestamptz) 200,000 rows is roughly 90 MB including the
--     indexes -- bounded, and small enough that the prune never has to be the
--     thing an operator worries about.
--
--   * A PRUNE BATCH -- 5,000 ROWS -- caps the work any ONE insert can be made
--     to do. Without it, the first insert arriving after a long backlog (or
--     after this file is applied to a table that is already large) would carry
--     the whole delete on its own. With it, a backlog drains over successive
--     inserts instead of stalling one, and no single anonymous write can be
--     turned into an unbounded delete.
--
-- The three numbers, and the sampling rate, are written down ONCE, in
-- public._maps_search_log_limits(), and the trigger and the self-check below
-- both READ them from there. A number restated in two places is the pair that
-- stops agreeing, and this file's own header is a third place -- so the notice
-- at the bottom prints the values the trigger actually uses rather than the
-- values this comment claims. (0151 shipped a header saying a clock survived
-- while the statement five lines under it deleted the clock; nothing caught it
-- because nothing carried both.)
--
-- ---------------------------------------------------------------------------
-- SAMPLED, NOT EVERY INSERT, AND ONLY THE HALF THAT NEEDS IT
-- ---------------------------------------------------------------------------
-- The AGE prune runs on EVERY insert statement, because with the index this
-- file adds it is an index range scan that normally matches nothing: in steady
-- state there is no row older than ninety days, the scan returns zero rows, and
-- the delete does no work at all. Sampling it would buy nothing.
--
-- The CEILING prune is SAMPLED at 1 IN 100 statements (random() < 0.01),
-- because it cannot be cheap the same way: finding the rows beyond the newest
-- 200,000 means walking the index to that offset, and doing that on every
-- anonymous write would make each write do real work -- a small amplification
-- of exactly the thing being defended against. On a SMALL table it costs
-- nothing regardless (the scan runs out of rows long before the offset), so the
-- sampling matters only in the case the ceiling exists for.
--
-- WORST-CASE SIZE BETWEEN PRUNES, AS A NUMBER, AND HONESTLY: PostgREST inserts
-- one row per statement, so the expected number of rows accumulated between two
-- ceiling prunes is 100, and the expected steady-state maximum is therefore
-- about 200,100 rows. Random sampling gives no HARD maximum, and this file does
-- not claim one: the probability of a thousand consecutive statements without a
-- prune is 0.99^1000, about 4.3e-5, which puts the table near 201,000; a
-- ten-thousand-statement gap is about 2.2e-44. Under the flood the ceiling
-- exists for, statements arrive quickly, so a hundred of them is a short
-- interval in wall-clock terms. Under real use the ceiling is never approached
-- and the sampling rate is irrelevant.
--
-- ---------------------------------------------------------------------------
-- WHY IT CANNOT RECURSE
-- ---------------------------------------------------------------------------
-- Structurally: the trigger fires on INSERT, and the only statements in its
-- body are DELETEs. A DELETE does not fire an INSERT trigger, and this table
-- carries no DELETE trigger for the DELETE to fire either. There is no path
-- from the body back to the event.
--
-- The `pg_trigger_depth() > 1` guard at the top is therefore belt-and-braces
-- rather than the mechanism, and it is there for one future: somebody adding a
-- DELETE trigger that writes a row back. It is stated as defence in depth so
-- that nobody later reads it as the reason and removes the reasoning with it.
--
-- ---------------------------------------------------------------------------
-- LOCKING, AND WHY THE PRUNE DOES NOT STALL THE INSERT PATH
-- ---------------------------------------------------------------------------
--   * TABLE LEVEL: a DELETE takes ROW EXCLUSIVE, which is the same mode an
--     INSERT takes, and ROW EXCLUSIVE does not conflict with itself. So the
--     prune never blocks a concurrent insert at the table level, and a
--     concurrent insert never blocks the prune. Nothing here takes SHARE,
--     SHARE ROW EXCLUSIVE, EXCLUSIVE or ACCESS EXCLUSIVE; there is no table
--     rewrite, no `select ... for update`, and no advisory lock.
--   * ROW LEVEL: the prune locks only the rows it removes, which are OLD rows.
--     A concurrent INSERT creates a NEW row and touches no existing row, so
--     there is no row the two can contend for. This is the property that makes
--     the whole design safe on an append-only table: the writers and the pruner
--     work at opposite ends of it.
--   * TWO PRUNES AT ONCE: two concurrent statements can select overlapping
--     victims. The second waits on the row lock the first holds, then re-checks
--     its snapshot, finds the row already deleted and moves on. That wait is
--     bounded by one batch of at most 5,000 rows, not by the size of the table,
--     which is the second reason the batch cap is here.
--   * The index this file adds is what keeps both deletes to an index range
--     rather than a sequential scan, so "the delete is cheap" is a property of
--     the plan and not a hope.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY LEAVES ALONE
-- ---------------------------------------------------------------------------
--   * EVERY GRANT AND EVERY POLICY. `anon` keeps INSERT and nothing else;
--     `authenticated` keeps INSERT and SELECT; the two policies 0162 wrote
--     (`maps_search_log_public_write`, `maps_search_log_admin_read`) are not
--     dropped, recreated or altered, and no client role gains DELETE. The
--     prune deletes as the OWNER, through SECURITY DEFINER, which is the whole
--     reason the function is a definer function. tests/grant-surface.test.ts
--     declares that grant surface and its declaration is still true after this
--     applies.
--   * THE TABLE, ITS COLUMNS AND ITS CONSTRAINTS. Nothing here recreates
--     public.maps_search_log or touches `maps_search_log_query_len` or
--     `maps_search_log_count`. This file adds three objects -- a limits
--     function, an index and a trigger with its function -- and redefines
--     nothing 0162 defined.
--   * THE ROWS ALREADY IN THE TABLE. A migration refuses rather than destroys:
--     this one COUNTS the rows currently outside the retention window and
--     reports the number, and does not delete them at apply time. The trigger
--     drains them, 5,000 at a time, from the next insert onwards. An operator
--     who wants them gone immediately can say so with a statement of their own,
--     having read the count.
--   * ANY IDENTITY. No column is added, and none may be. See 5.4.
--
-- IDEMPOTENT. Every statement is `create or replace`, `create index if not
-- exists`, or a `drop trigger if exists` ahead of its create. Re-pasting this
-- file is ordinary and changes nothing on the second run; the self-check
-- reports what it found rather than what it expected to create.
--
-- UNDO:
--   drop trigger if exists maps_search_log_prune on public.maps_search_log;
--   drop function if exists public._maps_search_log_prune();
--   drop index if exists public.maps_search_log_created_at_id;
--   drop function if exists public._maps_search_log_limits();
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The limits, written down once. The trigger reads them and so does the
--    self-check, so this file's header cannot quietly disagree with what the
--    trigger does -- the notice at the bottom prints these values, not the
--    header's copy of them.
--
--    `immutable` and `language sql` so the call is inlined and costs nothing
--    on the insert path.
-- ---------------------------------------------------------------------------

create or replace function public._maps_search_log_limits()
returns table (
	retention_days integer,
	row_ceiling integer,
	prune_batch integer,
	ceiling_sample_rate numeric
)
language sql
immutable
as $$
	select 90, 200000, 5000, 0.01::numeric;
$$;

-- ---------------------------------------------------------------------------
-- 2. The index both prunes read. (created_at, id) rather than (created_at)
--    alone: the ceiling prune orders by `created_at desc, id desc` so that its
--    OFFSET is taken over a TOTAL order. Ordering by a non-unique column alone
--    leaves ties in an unspecified order, which would make which rows fall
--    beyond the ceiling unspecified too -- and unspecified is not random, so it
--    would look stable right up until it was not.
--
--    NOTE FOR WHOEVER APPLIES THIS: a plain CREATE INDEX takes a SHARE lock
--    that blocks writes for the duration of the build. On today's table that is
--    milliseconds -- no client has shipped and the table is essentially empty.
--    If this is ever applied to a table that has grown large, build it with
--    CREATE INDEX CONCURRENTLY first (which cannot run inside a transaction
--    block) and then re-run this file, whose `if not exists` will find it.
-- ---------------------------------------------------------------------------

create index if not exists maps_search_log_created_at_id
	on public.maps_search_log (created_at, id);

-- ---------------------------------------------------------------------------
-- 3. The prune. SECURITY DEFINER because no client role holds DELETE on this
--    table and none is being given one: an invoker trigger would run as `anon`
--    and be refused, which is the correct refusal for a client and the wrong
--    one for the table's own housekeeping.
--
--    `set search_path = ''` and every name schema-qualified, per the standing
--    rule for definer functions.
-- ---------------------------------------------------------------------------

create or replace function public._maps_search_log_prune()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_retention_days integer;
	v_ceiling integer;
	v_batch integer;
	v_sample numeric;
	v_aged integer := 0;
	v_over integer := 0;
begin
	-- Defence in depth only. The structural reason this cannot recurse is that
	-- the trigger fires on INSERT and this body only DELETEs; see the header.
	if pg_trigger_depth() > 1 then
		return null;
	end if;

	select l.retention_days, l.row_ceiling, l.prune_batch, l.ceiling_sample_rate
	  into v_retention_days, v_ceiling, v_batch, v_sample
	  from public._maps_search_log_limits() l;

	-- AGE. Every statement. In steady state this matches nothing and the index
	-- range scan returns zero rows.
	delete from public.maps_search_log t
	 where t.id in (
		select o.id
		  from public.maps_search_log o
		 where o.created_at < now() - make_interval(days => v_retention_days)
		 order by o.created_at, o.id
		 limit v_batch
	 );
	get diagnostics v_aged = row_count;

	-- CEILING. Sampled, because unlike the age prune it cannot be made free:
	-- see the header for the rate, the expected overshoot and the fact that
	-- random sampling gives no hard maximum.
	if random() < v_sample then
		delete from public.maps_search_log t
		 where t.id in (
			select o.id
			  from public.maps_search_log o
			 order by o.created_at desc, o.id desc
			 offset v_ceiling
			 limit v_batch
		 );
		get diagnostics v_over = row_count;
	end if;

	-- A statement-level AFTER trigger's return value is ignored; null is the
	-- convention.
	if v_aged > 0 or v_over > 0 then
		raise notice 'maps_search_log prune: % row(s) past % days, % row(s) past the % row ceiling.',
			v_aged, v_retention_days, v_over, v_ceiling;
	end if;
	return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The trigger. FOR EACH STATEMENT, not FOR EACH ROW: the prune is about the
--    table rather than about the row that arrived, so running it once per
--    statement is both correct and strictly less work than running it per row
--    on a multi-row insert.
-- ---------------------------------------------------------------------------

drop trigger if exists maps_search_log_prune on public.maps_search_log;
create trigger maps_search_log_prune
	after insert on public.maps_search_log
	for each statement
	execute function public._maps_search_log_prune();

-- ---------------------------------------------------------------------------
-- 5. Grants on the two functions this file creates, and NOTHING ELSE.
--
--    THE ANON GRANT TRAP: on a hosted Supabase project `alter default
--    privileges ... grant execute on functions to anon, authenticated,
--    service_role` writes a DIRECT grant into every new function's proacl at
--    creation time, so a `create or replace function` arrives already granted
--    to `anon`. `revoke ... from public` removes the one PUBLIC entry and
--    leaves that direct grant standing, which is why the roles are named here.
--
--    Neither function needs a client grant of any kind. The trigger function is
--    called by the trigger, which runs the function as its owner regardless of
--    who inserted; the limits function is called only from inside it, as the
--    same owner. A trigger's EXECUTE privilege is checked when the trigger is
--    CREATED, not when it fires, so revoking these breaks nothing.
--
--    NO TABLE GRANT AND NO POLICY IS TOUCHED ANYWHERE IN THIS FILE.
-- ---------------------------------------------------------------------------

revoke all on function public._maps_search_log_limits() from public, anon, authenticated;
revoke all on function public._maps_search_log_prune() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Self-check: read the end state off the catalog rather than off this
--    file's intentions, and report counts against the real table.
-- ---------------------------------------------------------------------------

do $$
declare
	v_days integer;
	v_ceiling integer;
	v_batch integer;
	v_sample numeric;
	v_rows bigint;
	v_stale bigint;
	v_excess bigint;
	r record;
begin
	select l.retention_days, l.row_ceiling, l.prune_batch, l.ceiling_sample_rate
	  into v_days, v_ceiling, v_batch, v_sample
	  from public._maps_search_log_limits() l;

	if not exists (
		select 1 from pg_trigger t
		 where t.tgrelid = 'public.maps_search_log'::regclass
		   and t.tgname = 'maps_search_log_prune'
		   and not t.tgisinternal
	) then
		raise exception '0164: the maps_search_log_prune trigger is not on the table.';
	end if;
	if not exists (
		select 1 from pg_indexes
		 where schemaname = 'public' and indexname = 'maps_search_log_created_at_id'
	) then
		raise exception '0164: the maps_search_log_created_at_id index is missing; both prunes would seq scan.';
	end if;

	-- The values the TRIGGER uses, printed from the same function the trigger
	-- reads. If these disagree with this file's header, the header is wrong.
	raise notice '0164: effective limits -- retention % days, ceiling % rows, batch % rows, ceiling sampled at % of insert statements.',
		v_days, v_ceiling, v_batch, v_sample;

	-- Counts against the real table, so an operator can compare them with what
	-- the deployed app actually holds. NOTHING IS DELETED HERE.
	select count(*) into v_rows from public.maps_search_log;
	select count(*) into v_stale from public.maps_search_log
	 where created_at < now() - make_interval(days => v_days);
	v_excess := greatest(v_rows - v_ceiling, 0);
	raise notice '0164: maps_search_log holds % row(s); % past the retention window, % past the ceiling. None deleted by this migration -- the trigger drains them % row(s) per insert from the next insert onwards.',
		v_rows, v_stale, v_excess, v_batch;

	-- The grant surface, asserted UNCHANGED. This file must not have moved it.
	if not has_table_privilege('anon', 'public.maps_search_log', 'insert') then
		raise exception '0164: anon lost INSERT on maps_search_log -- 5.4 logging is broken for the readers it exists for.';
	end if;
	if has_table_privilege('anon', 'public.maps_search_log', 'select')
		or has_table_privilege('anon', 'public.maps_search_log', 'update')
		or has_table_privilege('anon', 'public.maps_search_log', 'delete')
		or has_table_privilege('authenticated', 'public.maps_search_log', 'update')
		or has_table_privilege('authenticated', 'public.maps_search_log', 'delete') then
		raise exception '0164: the maps_search_log grant surface moved. This file must change no grant.';
	end if;
	select count(*) into v_rows from pg_policies
	 where schemaname = 'public' and tablename = 'maps_search_log';
	if v_rows <> 2 then
		raise exception '0164: maps_search_log has % policies, expected the 2 that 0162 created.', v_rows;
	end if;
	raise notice '0164: grants and policies unchanged -- anon insert %, anon select %, 2 policies.',
		has_table_privilege('anon', 'public.maps_search_log', 'insert'),
		has_table_privilege('anon', 'public.maps_search_log', 'select');

	-- Neither new function is client-callable.
	for r in
		select p.oid::regprocedure::text as sig,
			has_function_privilege('anon', p.oid, 'execute') as anon_x,
			has_function_privilege('authenticated', p.oid, 'execute') as auth_x
		  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		 where n.nspname = 'public'
		   and p.proname in ('_maps_search_log_limits', '_maps_search_log_prune')
		 order by 1
	loop
		if r.anon_x or r.auth_x then
			raise exception '0164: % is client-callable (anon %, authenticated %). Neither function needs a client grant; a trigger checks EXECUTE at creation, not at fire time.',
				r.sig, r.anon_x, r.auth_x;
		end if;
		raise notice '0164: % -- anon %, authenticated %.', r.sig, r.anon_x, r.auth_x;
	end loop;

	raise notice '0164: the search log is bounded by SIZE. Request RATE is unchanged and is not addressed here -- that belongs at the edge.';
end $$;
