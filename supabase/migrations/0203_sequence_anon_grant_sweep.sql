-- 0203_sequence_anon_grant_sweep.sql
--
-- Apply manually in the Supabase SQL editor, after 0202.
--
-- WHAT THIS DOES: narrows the three SEQUENCES in `public` that `anon` and
-- `authenticated` can currently `nextval`, `currval` and `setval`, to
-- `service_role` alone.
--
--     public.gauntlet_run_events_id_seq
--     public.tournament_match_events_id_seq
--     public.tournament_reward_ledger_id_seq
--
-- Each of them carries, measured on the full-chain fixture rather than
-- guessed:
--
--     postgres=rwU/postgres | anon=rwU/postgres
--   | authenticated=rwU/postgres | service_role=rwU/postgres
--
-- `r` is SELECT (currval, and reading last_value), `w` is UPDATE (setval),
-- `U` is USAGE (nextval). No migration in this repository ever granted any of
-- them, and nothing in this repository ever wanted them.
--
-- ---------------------------------------------------------------------------
-- THE ROOT CAUSE, WHICH IS THE ONE 0137 WROTE DOWN, ONE OBJECT CLASS OVER
-- ---------------------------------------------------------------------------
--
-- A hosted Supabase project bootstraps
--
--     alter default privileges in schema public
--       grant all on sequences to anon, authenticated, service_role;
--
-- which writes a DIRECT grant to each of those roles into every new sequence's
-- `relacl` AT CREATION TIME. That is not the SQL default. The SQL default is a
-- single grant to `PUBLIC`, which is why `revoke all on sequence s from public`
-- removes exactly one entry and leaves `anon` holding everything it had -- the
-- identical mechanism 0137 documented for FUNCTIONS and 0202 for TABLES.
--
-- `0137_anon_execute_sweep.sql` is a one-time repair of the FUNCTIONS that
-- existed when it ran. It swept no sequences, and every object created since
-- has had to revoke for itself. A `bigserial` column creates a sequence
-- silently, and so does the `id bigint generated always as identity primary
-- key` that all three of these actually use -- so the object needing the revoke
-- is one nobody wrote a line for, in a migration whose text never names it.
-- 0035, 0062 and 0063 created them, and the oldest predates 0137 itself: they
-- were open before the sweep written to close exactly this, because that sweep
-- looked at a different `relkind`.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS, AND WHAT IT IS NOT
-- ---------------------------------------------------------------------------
--
--   * IT IS A GRANT HOLE, NOT A REACHABLE ONE, AND THE DISTINCTION IS STATED
--     RATHER THAN QUIETLY RELIED ON. `nextval`, `currval` and `setval` are all
--     in `pg_catalog`, and PostgREST exposes only functions in the schema it is
--     configured for, so there is no route through which a browser holding the
--     anon key can call one today. What the grant costs is that the refusal
--     rests on a routing detail of somebody else's product rather than on this
--     database. If PostgREST ever exposed them, `setval` on
--     `tournament_match_events_id_seq` would hand an anonymous caller duplicate
--     key errors on a live bracket, with nothing to undo but a manual reset.
--
--   * IT IS NOT A CHANGE TO ANY TABLE, POLICY, FUNCTION OR VIEW. Not one
--     object other than the three sequences named above is touched. The
--     tournament tables stay anon-readable (that is the public bracket, a
--     decision 0062 through 0064 made explicitly) and `gauntlet_run_events`
--     keeps its `authenticated` SELECT.
--
--   * IT IS NOT 0202, AND DOES NOT OVERLAP IT. `0202_ideacad_anon_grant_repair`
--     narrows ten IdeaCAD functions and four IdeaCAD tables. None of them is a
--     sequence -- every IdeaCAD key is a uuid -- so the two files name no object
--     in common and may be applied in either order. 0202 first is the numbered
--     order and the one to use.
--
--   * IT DOES NOT TOUCH `service_role`, which is the role 0137 deliberately
--     left alone: it bypasses RLS by design and a CHECK constraint's function
--     runs as the WRITING role (0131), so narrowing it breaks a direct server
--     write rather than narrowing a client.
--
--   * IT DOES NOT TOUCH THE 31 `pg_trgm` FUNCTIONS `anon` CAN EXECUTE, and
--     that is a decision with a measurement behind it rather than an omission.
--     `public.maps_search` is `prosecdef = false` -- SECURITY INVOKER -- so an
--     anonymous caller evaluates its body as itself, and that body uses the
--     `<%` operator and `word_similarity()`. Revoking two of those functions
--     from `anon` in the fixture turns a working public IDEA Maps search into
--     `permission denied for function word_similarity`. They are also owned by
--     the extension, so `drop extension` / `create extension` would restore
--     whatever a migration removed. The right place for that decision, if it is
--     ever wanted, is `maps_search` becoming a definer function, which is a
--     different bundle with its own answer for what its body may then read.
--
-- ---------------------------------------------------------------------------
-- WHY NOTHING BREAKS, ESTABLISHED RATHER THAN ASSUMED
-- ---------------------------------------------------------------------------
--
-- A sequence grant matters to a role that INSERTS into the owning table. No
-- client role does, on any of the three, and every writer is a definer
-- function that runs as the owner. Measured on the full-chain fixture:
--
--   gauntlet_run_events        anon insert=false  authenticated insert=false
--   tournament_match_events    anon insert=false  authenticated insert=false
--   tournament_reward_ledger   anon insert=false  authenticated insert=false
--
--   public.gauntlet_run_events_insert(text,text,jsonb)  security definer
--   public._tournament_log(uuid,text,uuid,text,uuid,jsonb)  security definer
--   public._tournament_award(uuid,uuid,integer,text,uuid)   security definer
--
-- `gauntlet_run_events_insert` is granted to `anon` on purpose -- an
-- unauthenticated GAUNTLET run is one of 0137's eighteen deliberate public
-- surfaces -- and it keeps working, because a SECURITY DEFINER function
-- executes as `postgres`, which keeps `rwU` on the sequence. That is the whole
-- of why this narrowing is safe, and it is the thing to re-check before adding
-- a fourth sequence to the list.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENT. Applying this file twice changes nothing: `revoke` on a
-- privilege that is not held is a no-op and `grant` of one already held is a
-- no-op, so the second run reaches the identical end state and the self-check
-- passes identically. It is safe to re-paste after a partial apply.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. THE REPORT. Read-only: it selects and raises, and writes nothing. It runs
--    BEFORE the revoke so that whoever pastes this file sees the state it is
--    about to change, in the notice pane, rather than only the state it left.
--
--    It sweeps EVERY sequence in `public` rather than the three named below,
--    because the question a reader has is "is this file complete", and a report
--    that can only print its own list cannot answer it. A fourth sequence
--    holding a client grant prints here and is NOT narrowed by this file --
--    deliberately: a migration that silently widened its own scope at apply
--    time would be a different file on every database it ran against.
-- ---------------------------------------------------------------------------

do $$
declare
	r record;
	v_total integer := 0;
	v_open integer := 0;
	v_unnamed integer := 0;
	k_named constant text[] := array[
		'gauntlet_run_events_id_seq',
		'tournament_match_events_id_seq',
		'tournament_reward_ledger_id_seq'
	];
begin
	for r in
		select c.relname,
		       has_sequence_privilege('anon', c.oid, 'usage')           as anon_usage,
		       has_sequence_privilege('anon', c.oid, 'select')          as anon_select,
		       has_sequence_privilege('anon', c.oid, 'update')          as anon_update,
		       has_sequence_privilege('authenticated', c.oid, 'usage')  as auth_usage,
		       has_sequence_privilege('authenticated', c.oid, 'select') as auth_select,
		       has_sequence_privilege('authenticated', c.oid, 'update') as auth_update
		  from pg_class c
		  join pg_namespace n on n.oid = c.relnamespace
		 where n.nspname = 'public'
		   and c.relkind = 'S'
		 order by c.relname
	loop
		v_total := v_total + 1;

		if r.anon_usage or r.anon_select or r.anon_update
			or r.auth_usage or r.auth_select or r.auth_update then
			v_open := v_open + 1;

			raise notice '0203: BEFORE -- sequence "%" is open to a client role. anon usage=% select=% update=%; authenticated usage=% select=% update=%.',
				r.relname, r.anon_usage, r.anon_select, r.anon_update,
				r.auth_usage, r.auth_select, r.auth_update;

			if not (r.relname = any (k_named)) then
				v_unnamed := v_unnamed + 1;
				raise notice '0203: NOT NARROWED BY THIS FILE -- sequence "%" is open to a client role and is not one of the three this file names. It was created after this file was written. It needs its own migration, on this file''s shape.',
					r.relname;
			end if;
		end if;
	end loop;

	raise notice '0203: BEFORE -- % sequence(s) in public; % open to a client role; % of those not named by this file.',
		v_total, v_open, v_unnamed;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. THE NARROWING. 0166's shape: revoke from `public, anon, authenticated` BY
--    NAME, then grant back deliberately.
--
--    NAMING THE ROLES IS THE WHOLE POINT AND `from public` ALONE WOULD BE A
--    NO-OP HERE. The grants being removed are DIRECT entries in each
--    sequence's `relacl`, written by the project's default privileges; the
--    PUBLIC entry the bare form removes does not exist on any of these three.
--
--    `service_role` is granted back explicitly rather than left to survive the
--    revoke. The revoke above does not name it, so on this database the grant
--    is a restatement -- but it makes the END STATE independent of how a given
--    database got here, which is the rule in CLAUDE.md and the reason 0166
--    does the same. A database rebuilt from these files under different
--    default privileges reaches the identical ACL.
-- ---------------------------------------------------------------------------

revoke all on sequence
	public.gauntlet_run_events_id_seq,
	public.tournament_match_events_id_seq,
	public.tournament_reward_ledger_id_seq
	from public, anon, authenticated;

grant usage, select, update on sequence
	public.gauntlet_run_events_id_seq,
	public.tournament_match_events_id_seq,
	public.tournament_reward_ledger_id_seq
	to service_role;

-- ---------------------------------------------------------------------------
-- 3. THE SELF-CHECK. 0131's convention: read the catalog back rather than
--    trust that the statements above ran. It raises, so a partial apply cannot
--    look like a clean one and the whole file rolls back.
--
--    IT CARRIES A POSITIVE CONTROL, because every assertion in it is an
--    ABSENCE and an absence assertion over a sweep that swept nothing is green
--    for the wrong reason. The control is `service_role`, which must still hold
--    all three privileges on all three sequences: if the sweep were reading the
--    wrong catalog, the wrong role or the wrong object, the control would come
--    back false and this file would refuse rather than report success.
-- ---------------------------------------------------------------------------

do $$
declare
	r record;
	v_checked integer := 0;
	v_control integer := 0;
	k_named constant text[] := array[
		'gauntlet_run_events_id_seq',
		'tournament_match_events_id_seq',
		'tournament_reward_ledger_id_seq'
	];
begin
	for r in
		select c.oid, c.relname
		  from pg_class c
		  join pg_namespace n on n.oid = c.relnamespace
		 where n.nspname = 'public'
		   and c.relkind = 'S'
		   and c.relname = any (k_named)
		 order by c.relname
	loop
		v_checked := v_checked + 1;

		if has_sequence_privilege('anon', r.oid, 'usage')
			or has_sequence_privilege('anon', r.oid, 'select')
			or has_sequence_privilege('anon', r.oid, 'update') then
			raise exception '0203: sequence "%" is still reachable by anon after the revoke -- the statement did not name the roles it needed to.', r.relname;
		end if;

		if has_sequence_privilege('authenticated', r.oid, 'usage')
			or has_sequence_privilege('authenticated', r.oid, 'select')
			or has_sequence_privilege('authenticated', r.oid, 'update') then
			raise exception '0203: sequence "%" is still reachable by authenticated after the revoke.', r.relname;
		end if;

		-- The positive control.
		if has_sequence_privilege('service_role', r.oid, 'usage')
			and has_sequence_privilege('service_role', r.oid, 'select')
			and has_sequence_privilege('service_role', r.oid, 'update') then
			v_control := v_control + 1;
		else
			raise exception '0203: sequence "%" lost its service_role grant. The revoke took more than it was meant to, and a direct server write into the owning table will now fail.', r.relname;
		end if;
	end loop;

	if v_checked <> 3 then
		raise exception '0203: expected to check 3 named sequences and checked % -- one of them does not exist in public under the name this file uses, so its grants were never narrowed.', v_checked;
	end if;

	if v_control <> 3 then
		raise exception '0203: the positive control answered for % of 3 sequences. An absence assertion over a sweep that swept nothing is green for the wrong reason.', v_control;
	end if;

	raise notice '0203: AFTER -- 3 sequences narrowed. anon and authenticated hold no USAGE, SELECT or UPDATE on any of them; service_role holds all three on all three (positive control, 3 of 3).';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. THE VERIFICATION QUERY. Entirely inside comments: it is not run by this
--    file. Paste it on its own, AFTER this file has applied, to read the end
--    state back out of the live catalog rather than off the notice pane.
--
--    It sweeps every sequence in `public`, not the three, for the same reason
--    the report in section 1 does.
--
--    select c.relname as sequence_name,
--           has_sequence_privilege('anon', c.oid, 'usage')            as anon_usage,
--           has_sequence_privilege('anon', c.oid, 'select')           as anon_select,
--           has_sequence_privilege('anon', c.oid, 'update')           as anon_update,
--           has_sequence_privilege('authenticated', c.oid, 'usage')   as auth_usage,
--           has_sequence_privilege('authenticated', c.oid, 'select')  as auth_select,
--           has_sequence_privilege('authenticated', c.oid, 'update')  as auth_update,
--           has_sequence_privilege('service_role', c.oid, 'usage')    as svc_usage,
--           has_sequence_privilege('service_role', c.oid, 'select')   as svc_select,
--           has_sequence_privilege('service_role', c.oid, 'update')   as svc_update,
--           array_to_string(c.relacl, ' | ')                          as acl
--      from pg_class c
--      join pg_namespace n on n.oid = c.relnamespace
--     where n.nspname = 'public'
--       and c.relkind = 'S'
--     order by c.relname;
--
--    EXPECTED: exactly three rows, in this order, with every anon_* and every
--    auth_* column FALSE and every svc_* column TRUE:
--
--      gauntlet_run_events_id_seq       f f f  f f f  t t t
--        acl = postgres=rwU/postgres | service_role=rwU/postgres
--      tournament_match_events_id_seq   f f f  f f f  t t t
--        acl = postgres=rwU/postgres | service_role=rwU/postgres
--      tournament_reward_ledger_id_seq  f f f  f f f  t t t
--        acl = postgres=rwU/postgres | service_role=rwU/postgres
--
--    A FOURTH ROW is not a failure of this file and is not an error: it is a
--    sequence created after this file was written. Read its anon_* and auth_*
--    columns. If any is TRUE it needs its own migration on this file's shape --
--    and `tests/grant-surface.test.ts` section D will already be red about it.
--
--    The `acl` column is the same answer read a second way, and is the one to
--    quote in a report: `rwU` is UPDATE, SELECT and USAGE together, and the
--    absence of an `anon=` and an `authenticated=` entry is what this file did.
-- ---------------------------------------------------------------------------
