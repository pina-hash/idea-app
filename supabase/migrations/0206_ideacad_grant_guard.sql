-- 0206_ideacad_grant_guard.sql
--
-- Apply manually in the Supabase SQL editor, AFTER 0205.
-- DO NOT APPLY FROM THE SESSION CONTAINER. This environment cannot reach
-- production and must not try.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE IS
-- ---------------------------------------------------------------------------
--
-- It is a GUARD and nothing else. It creates no table, no function, no policy,
-- no column, no constraint, and it moves no grant. Every statement below reads
-- the catalog and either raises or raises a notice. A second paste is a no-op
-- by construction, because there is nothing here to apply twice.
--
-- It exists because 0202's apply-time self-check cannot survive IdeaCAD
-- growing, and 0202 is an APPLIED migration whose text is never rewritten.
--
-- ---------------------------------------------------------------------------
-- WHAT 0202's CHECK ASSERTED, AND WHICH THIRD OF IT WAS ACTUALLY THE POINT
-- ---------------------------------------------------------------------------
--
-- 0202 section 4 swept every function matching the regex for an ideacad name
-- and asserted three things about what it found:
--
--   1. ZERO of them are executable by anon.
--   2. EXACTLY TEN of them exist.
--   3. EVERY one of them is executable by authenticated.
--
-- (1) IS THE PROPERTY THAT MATTERED. anon is the public internet, and a
-- SECURITY DEFINER function it can reach is a gate weakened from "refused at
-- the grant" to "refused in the body". That is the defect 0201 shipped, and it
-- is the reason 0202 was written at all.
--
-- (2) AND (3) WERE INCIDENTAL. They were true of 0201's world -- ten functions,
-- every one of them called from a browser -- and they stop being true the
-- moment IdeaCAD grows a PRIVATE definer-only helper, which is an ordinary
-- thing for a subsystem to grow. 0205 adds nine functions, four of them
-- predicates, two of which withhold the authenticated grant DELIBERATELY
-- because nothing but a definer body calls them. So on a re-paste, 0202 now
-- raises twice over:
--
--   0202: expected 10 ideacad functions in public, found 19.
--   0202: 2 ideacad function(s) LOST the authenticated grant:
--         _ideacad_can_write_document(uuid), _ideacad_document_role(uuid).
--
-- Neither is a defect. Both are 0202 describing a world that ended.
--
-- ---------------------------------------------------------------------------
-- THE LESSON, WHICH IS WHY THIS FILE IS SHAPED THE WAY IT IS
-- ---------------------------------------------------------------------------
--
-- 0205's own header states it and this file is built on it: AN APPLY-TIME
-- GUARD THAT SWEEPS A WHOLE SUBSYSTEM BY NAME PREFIX IS ASSERTING SOMETHING
-- ABOUT MIGRATIONS THAT DO NOT EXIST YET. A prefix sweep is the right
-- instrument for a UNIVERSAL property -- one every future ideacad migration
-- should uphold and which a future migration failing it is genuinely broken by.
-- It is the wrong instrument for a property that is a FACT ABOUT TODAY'S
-- POPULATION, because tomorrow's population is not this file's to predict.
--
-- So the three assertions are split by which kind they are:
--
--   * NO IDEACAD FUNCTION IS EXECUTABLE BY anon -- swept BY PREFIX, with NO
--     COUNT CEILING. Universal. A migration that adds an ideacad function and
--     forgets 0166's revoke shape SHOULD redden here, including one written
--     after this file.
--
--   * A CLIENT-CALLABLE FUNCTION HOLDS authenticated EXECUTE -- checked against
--     an EXPLICIT NAMED LIST, never a prefix match. That is the "the narrowing
--     went too far and the feature is down" check and it is worth keeping, but
--     it is only answerable about functions somebody has classified.
--
--   * THE COUNT IS GONE ENTIRELY. There is no number in this file that a later
--     migration has to come back and bump.
--
-- AN UNCLASSIFIED IDEACAD FUNCTION RAISES A NOTICE, NOT AN EXCEPTION, and that
-- is the whole of what stops this file becoming the next 0202. A future
-- migration's own helper is not this file's to have an opinion about; naming it
-- in the output is how the information survives without blocking a legitimate
-- apply. The strict half of that decision lives in
-- tests/db/ideacad-grants-anon-execute-surface.test.ts, which DOES fail on an
-- unclassified ideacad function -- a test is editable in the same commit that
-- adds the function, and an applied migration is not. That asymmetry is
-- deliberate and it is the point.
--
-- ---------------------------------------------------------------------------
-- WHAT IT DOES NOT DO
-- ---------------------------------------------------------------------------
--
-- IT DOES NOT REPAIR ANYTHING, because after 0202 and 0205 there is nothing to
-- repair: 0202 narrowed 0201's ten and its four tables, and 0205 narrowed its
-- own nine and its one table, both in 0166's shape (revoke from public, anon,
-- authenticated BY NAME, then grant back deliberately). Measured on the real
-- chain rather than assumed -- the guard below passes on a database that has
-- had both applied and nothing else. If a grant ever does have to move in a
-- later file, it moves in 0166's shape; this one has no grant statement to
-- copy the wrong thing from.
--
-- IT DOES NOT EDIT 0202. A migration is an immutable applied record. 0202 ran
-- cleanly, in order, and its section 2 and section 3 statements are still
-- exactly what the schema carries. What is superseded is its section 4 CHECK,
-- and the honest consequence is stated rather than hidden: ONCE 0205 IS
-- APPLIED, 0202 CAN NO LONGER BE RE-PASTED. Its repair has landed and this file
-- is the live guard over the same property. A rebuild from these files in order
-- still works, because 0202 runs at its own place in the chain where only
-- 0201's ten exist.
--
-- ---------------------------------------------------------------------------
-- ORDER
-- ---------------------------------------------------------------------------
--
-- 0205 FIRST, THEN THIS FILE. It is REPORTED rather than enforced, and the
-- choice between those two is the same judgement the rest of this header makes.
--
-- The first draft RAISED if any classified object was absent, on the reasoning
-- that a guard sweeping a population which is not there yet reports exactly what
-- a clean database reports. That reasoning is sound and the instrument was
-- wrong: it made THIS file un-appliable on a tree that does not carry 0205, and
-- a tree between two hand-applied migrations is an ordinary state in this repo
-- rather than a mistake -- 0205 and this file were written on two different
-- unmerged lanes. Measured: the raise took four otherwise-green test files down,
-- naming ten absent objects, on a chain that was perfectly legitimate. It is the
-- 0202 mistake in a milder costume -- a guard refusing to apply because of what
-- ANOTHER migration had or had not done.
--
-- So section 2 raises a NOTICE naming exactly what is absent, and sweeps
-- everything that IS there. What it cannot do is pass vacuously: the prefix
-- sweep for the anon property runs over whatever the catalog holds and does not
-- consult the list at all, and the guard refuses outright if that sweep finds no
-- ideacad function whatsoever.
--
-- WHY THE ORDER STILL MATTERS: pasted before 0205, this file guards 0201's ten
-- and says so; pasted after it, it guards all nineteen. 0205 carries its own
-- self-check over its own nine either way, so neither order leaves a gap -- but
-- only one of them leaves this guard covering the whole subsystem.
--
-- ---------------------------------------------------------------------------
-- UNDO
-- ---------------------------------------------------------------------------
--
-- There is nothing to undo. This file changes no state. Not applying it, or
-- applying it and ignoring the notices, leaves the database byte-identical.

begin;

-- ---------------------------------------------------------------------------
-- 1. THE CLASSIFICATION.
--
--    Two lists, by SIGNATURE, so an overload cannot be waved through on a bare
--    name. Every entry carries the migration that created it and the reason it
--    is on the side of the line it is on.
--
--    CLIENT-CALLABLE means a browser reaches it -- either PostgREST calls it as
--    an RPC, or an RLS policy names it, which is the same requirement for a
--    different reason: a policy expression is evaluated as the QUERYING role,
--    so a predicate named in a `using` clause has to hold the grant or the read
--    fails with `permission denied for function` instead of returning the
--    caller's own rows. That is 0109's lesson about classroom_can_read_item and
--    it is why the two read predicates 0205 names in policies sit here rather
--    than with the other two.
--
--    DEFINER-ONLY means nothing but another SECURITY DEFINER body calls it. It
--    runs as the owner when it is reached, so a client grant on it buys the
--    client nothing it does not already have through the RPC that calls it, and
--    withholding it is the narrower end state. 0205 withholds it on purpose.
-- ---------------------------------------------------------------------------

create temporary table _guard_ideacad_fn(
	sig text primary key,
	kind text not null check (kind in ('client', 'definer')),
	note text not null
) on commit drop;

insert into _guard_ideacad_fn(sig, kind, note) values
	-- 0201's ten. Every one of them is an RPC a browser calls.
	('public.ideacad_set_editor(uuid,text,jsonb)',              'client',  '0201 RPC'),
	('public.ideacad_open_document(uuid)',                      'client',  '0201 RPC'),
	('public.ideacad_new_concept(uuid,text,jsonb)',             'client',  '0201 RPC'),
	('public.ideacad_save_concept(uuid,jsonb,integer)',         'client',  '0201 RPC'),
	('public.ideacad_update_concept_meta(uuid,text,integer)',   'client',  '0201 RPC'),
	('public.ideacad_delete_concept(uuid)',                     'client',  '0201 RPC'),
	('public.ideacad_set_active(uuid,uuid)',                    'client',  '0201 RPC'),
	('public.ideacad_set_prediction(uuid,uuid,text)',           'client',  '0201 RPC'),
	('public.ideacad_commit_concept(uuid)',                     'client',  '0201 RPC'),
	('public.ideacad_roster(uuid)',                             'client',  '0201 RPC'),
	-- 0205's five sharing RPCs.
	('public.ideacad_share_document(uuid,text,text)',           'client',  '0205 RPC'),
	('public.ideacad_unshare_document(uuid,text)',              'client',  '0205 RPC'),
	('public.ideacad_document_grants(uuid)',                    'client',  '0205 RPC'),
	('public.ideacad_open_shared_document(uuid)',               'client',  '0205 RPC'),
	('public.ideacad_shared_with_me(uuid)',                     'client',  '0205 RPC'),
	-- 0205's two POLICY-NAMED predicates. Evaluated as the querying role.
	('public._ideacad_can_read_document(uuid)',                 'client',  '0205 predicate, named in an RLS using clause'),
	('public._ideacad_manages_document(uuid)',                  'client',  '0205 predicate, named in an RLS using clause'),
	-- 0205's two DEFINER-ONLY predicates. Reached only from definer bodies.
	('public._ideacad_document_role(uuid)',                     'definer', '0205 predicate, no policy and no client names it'),
	('public._ideacad_can_write_document(uuid)',                'definer', '0205 predicate, no policy and no client names it');

-- The tables whose authenticated SELECT the feature depends on. 0201's four
-- plus 0205's one. SELECT here means "your own rows": the RLS policies are what
-- give it that meaning, so this grant is load-bearing and losing it takes the
-- feature down rather than narrowing it.

create temporary table _guard_ideacad_tbl(relname text primary key, note text not null)
	on commit drop;

insert into _guard_ideacad_tbl(relname, note) values
	('ideacad_editors',     '0201'),
	('ideacad_documents',   '0201'),
	('ideacad_concepts',    '0201'),
	('ideacad_predictions', '0201'),
	('ideacad_grants',      '0205');

-- ---------------------------------------------------------------------------
-- 2. THE GUARD.
--
--    Read in this order, because the order is the argument:
--
--      (a) PRECONDITION. Every classified object exists. A guard over a
--          population that has not been created yet reports exactly what a
--          clean database reports.
--      (b) THE UNIVERSAL PROPERTY, by prefix, no ceiling: nothing ideacad is
--          executable by anon, and nothing ideacad-shaped hands anon a table
--          privilege or hands authenticated one beyond SELECT.
--      (c) THE CLASSIFIED PROPERTY, by name: a client-callable function holds
--          authenticated EXECUTE and a named table holds authenticated SELECT.
--      (d) THE NOTICES. A definer-only helper that unexpectedly holds the grant
--          and an ideacad function on neither list are REPORTED, never raised.
--      (e) THE INSTRUMENT CONTROL. A sweep that cannot see a grant at all
--          reports the same clean result as a database that has none, so the
--          file asserts it can still read a deliberate anon grant.
--          app_short_link_target is granted to anon on purpose -- 0137 keeps it,
--          because printed handouts and QR codes resolve before any session
--          exists -- and it is the control 0202 used, for the same reason.
-- ---------------------------------------------------------------------------

do $guard$
declare
	r record;
	v_missing text[] := '{}';
	v_anon_fn text[] := '{}';
	v_lost_authed text[] := '{}';
	v_bad_table text[] := '{}';
	v_lost_select text[] := '{}';
	v_wide_definer text[] := '{}';
	v_unclassified text[] := '{}';
	v_seen integer := 0;
	v_client integer := 0;
	v_definer integer := 0;
	v_control boolean;
begin
	-- (a) PRECONDITION.
	for r in
		select g.sig from _guard_ideacad_fn g
		where to_regprocedure(g.sig) is null
		order by 1
	loop
		v_missing := v_missing || r.sig;
	end loop;

	for r in
		select g.relname from _guard_ideacad_tbl g
		where to_regclass('public.' || g.relname) is null
		order by 1
	loop
		v_missing := v_missing || ('table ' || r.relname);
	end loop;

	if array_length(v_missing, 1) is not null then
		raise notice '0206: NOTE -- % classified ideacad object(s) are not on this database: %. Everything that IS here is still swept below. This is the expected reading if 0205 has not been applied yet; PASTE 0206 AFTER IT, so the guard covers 0205''s nine as well as 0201''s ten.',
			array_length(v_missing, 1), array_to_string(v_missing, ', ');
	end if;

	-- (b) and (c) and (d), functions. One sweep by PREFIX, classified by NAME.
	for r in
		select p.oid::regprocedure::text as sig,
		       has_function_privilege('anon', p.oid, 'execute') as anon_x,
		       has_function_privilege('authenticated', p.oid, 'execute') as authed_x,
		       g.kind
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		left join _guard_ideacad_fn g
		       on to_regprocedure(g.sig)::oid = p.oid
		where n.nspname = 'public'
		  and p.prokind = 'f'
		  and p.proname ~ '^_?ideacad'
		order by 1
	loop
		v_seen := v_seen + 1;

		-- Universal. No count, no list, no exemption.
		if r.anon_x then
			v_anon_fn := v_anon_fn || r.sig;
		end if;

		if r.kind = 'client' then
			v_client := v_client + 1;
			if not r.authed_x then
				v_lost_authed := v_lost_authed || r.sig;
			end if;
		elsif r.kind = 'definer' then
			v_definer := v_definer + 1;
			if r.authed_x then
				v_wide_definer := v_wide_definer || r.sig;
			end if;
		else
			v_unclassified := v_unclassified || r.sig;
		end if;
	end loop;

	-- (b) tables, by prefix: anon holds nothing at all, authenticated holds
	-- nothing beyond SELECT. TRUNCATE is the one of the other six that RLS does
	-- not cover at all; REFERENCES and TRIGGER are privileges no migration in
	-- this repo grants a client role deliberately.
	for r in
		select c.relname, rp.role_name, rp.priv
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		cross join (
			select roles.role_name, privs.priv
			from (values ('anon'), ('authenticated')) as roles(role_name)
			cross join (
				values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
				       ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
			) as privs(priv)
		) rp
		where n.nspname = 'public'
		  and c.relkind in ('r', 'p', 'v', 'm')
		  and c.relname ~ '^ideacad_'
		  and has_table_privilege(rp.role_name, c.oid, rp.priv)
		  and not (rp.role_name = 'authenticated' and rp.priv = 'SELECT')
		order by c.relname, rp.role_name, rp.priv
	loop
		v_bad_table := v_bad_table || format('%s on %s to %s', r.priv, r.relname, r.role_name);
	end loop;

	-- (c) tables, by name.
	for r in
		select g.relname
		from _guard_ideacad_tbl g
		where to_regclass('public.' || g.relname) is not null
		  and not has_table_privilege('authenticated', ('public.' || g.relname)::regclass, 'SELECT')
		order by 1
	loop
		v_lost_select := v_lost_select || r.relname;
	end loop;

	-- (e) THE INSTRUMENT CONTROL, read BEFORE the raises, so a broken sweep
	-- cannot be reported as a clean one.
	select has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute')
		into v_control;
	if v_control is distinct from true then
		raise exception '0206: the positive control failed -- app_short_link_target does not read as anon-executable, so this file cannot tell an anon grant from its absence and none of the checks below mean anything.';
	end if;

	if v_seen = 0 then
		raise exception '0206: the sweep found no ideacad function at all, which cannot be true on a database carrying 0201 and 0205. The prefix match is not matching.';
	end if;

	-- THE PROPERTY THAT MATTERED.
	if array_length(v_anon_fn, 1) is not null then
		raise exception '0206: % ideacad function(s) are executable by anon: %. Revoke in that function''s OWN migration, in 0166''s shape -- revoke all on function ... from public, anon, authenticated, then grant back by name. `revoke ... from public` alone does NOT close it on this project: the hosted default privileges write a DIRECT anon grant the public entry''s removal never touches.',
			array_length(v_anon_fn, 1), array_to_string(v_anon_fn, ', ');
	end if;

	if array_length(v_lost_authed, 1) is not null then
		raise exception '0206: % client-callable ideacad function(s) LOST the authenticated grant: %. The narrowing went too far and the feature is down. An RPC PostgREST calls and a predicate an RLS policy names both need it -- a policy expression is evaluated as the querying role.',
			array_length(v_lost_authed, 1), array_to_string(v_lost_authed, ', ');
	end if;

	if array_length(v_bad_table, 1) is not null then
		raise exception '0206: % client table privilege(s) on an ideacad table survive beyond authenticated SELECT: %.',
			array_length(v_bad_table, 1), array_to_string(v_bad_table, ', ');
	end if;

	if array_length(v_lost_select, 1) is not null then
		raise exception '0206: authenticated LOST select on: %. The four RLS policies are what make that grant mean "your own rows"; without it the feature is down rather than narrowed.',
			array_to_string(v_lost_select, ', ');
	end if;

	-- (d) THE NOTICES. Neither of these is this file's to have an opinion
	-- about, and neither blocks the apply. See the header.
	if array_length(v_wide_definer, 1) is not null then
		raise notice '0206: NOTE -- % definer-only ideacad helper(s) hold the authenticated grant: %. 0205 withholds it from these on purpose. Not refused: a later migration may have named one in a policy, which is a legitimate reason to grant it, and this file cannot tell that apart from an accident.',
			array_length(v_wide_definer, 1), array_to_string(v_wide_definer, ', ');
	end if;

	if array_length(v_unclassified, 1) is not null then
		raise notice '0206: NOTE -- % ideacad function(s) are on neither list: %. They are swept for anon above like everything else; their authenticated grant is not this file''s to judge. Classify them in the migration that adds them and in tests/db/ideacad-grants-anon-execute-surface.test.ts, which DOES fail on an unclassified one.',
			array_length(v_unclassified, 1), array_to_string(v_unclassified, ', ');
	end if;

	raise notice '0206: % ideacad function(s) swept -- 0 executable by anon, % client-callable and all holding authenticated, % definer-only, % unclassified. % ideacad table(s) -- anon holds nothing, authenticated holds SELECT and nothing else. Positive control (app_short_link_target anon-executable) reads true, so the sweep can see a grant when there is one.',
		v_seen, v_client, v_definer, coalesce(array_length(v_unclassified, 1), 0),
		(select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
		 where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and c.relname ~ '^ideacad_');
end;
$guard$;

commit;
