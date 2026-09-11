-- 0202_ideacad_anon_grant_repair.sql
--
-- Apply manually in the Supabase SQL editor, after 0201.
-- DO NOT APPLY FROM THE SESSION CONTAINER. This environment cannot reach
-- production and must not try.
--
-- ---------------------------------------------------------------------------
-- WHAT IS WRONG
-- ---------------------------------------------------------------------------
--
-- 0201 ended on
--
--   revoke all on function public.ideacad_... from public;
--   grant execute on function public.ideacad_... to authenticated;
--
-- and all ten of its functions came out EXECUTABLE BY anon. Measured on
-- production 2026-09-11: every ideacad function read anon true, while
-- classroom_save_response, classroom_save_instructor_response and
-- classroom_close_assignment -- written to 0166's shape -- all read anon false.
--
-- THE CAUSE IS THE ONE 0137 WROTE DOWN AND CLAUDE.md RESTATES. A hosted
-- Supabase project bootstraps
--
--   alter default privileges in schema public
--     grant execute on functions to anon, authenticated, service_role;
--
-- so every function a migration creates arrives holding a DIRECT grant to anon
-- in its own acl. The SQL default is a single grant to PUBLIC, which is what
-- `revoke all ... from public` removes; the direct anon entry it never touches.
-- 0166 is the shape that answers this -- revoke from `public, anon,
-- authenticated` BY NAME, then grant back deliberately -- and 0196 through 0199
-- all follow it. 0201 invented its own shape and lost the anon clause. It is
-- the first migration in this repo to depart from 0166.
--
-- THE SAME DEFECT HIT 0201's FOUR TABLES, which is why section 3 exists and
-- why this file is not only about functions. The identical bootstrap carries
--
--   alter default privileges in schema public
--     grant all on tables to anon, authenticated, service_role;
--
-- so ideacad_editors, ideacad_documents, ideacad_concepts and
-- ideacad_predictions each arrived holding SELECT, INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES and TRIGGER for both client roles. 0201 granted SELECT
-- to authenticated and revoked nothing, so the grant it wrote describes what
-- its author was thinking about rather than what the tables hold.
-- `tests/grant-surface.test.ts` is RED on `integration` for exactly this, and
-- names exactly these four tables and no others.
--
-- ---------------------------------------------------------------------------
-- HOW BAD IT IS, SAID PLAINLY RATHER THAN OVERSTATED
-- ---------------------------------------------------------------------------
--
--   * THE FUNCTIONS. Each opens on a permission check that reads the caller's
--     identity -- _classroom_manages_item, or current_user_email() compared to
--     a row's student_email. current_user_email() answers the empty string with
--     no session, so an anon caller reaches a function that refuses. It is a
--     gate weakened from "refused at the grant" to "refused in the body":
--     defence in depth with one layer missing, not an open door. 0137's header
--     says the same thing about the same defect and closed it anyway.
--
--   * THE TABLES. All four have RLS ENABLED and carry SELECT policies naming
--     `authenticated` only, so anon reads nothing and no client role can INSERT,
--     UPDATE or DELETE through a policy that does not exist. What RLS does NOT
--     cover is the rest: TRUNCATE is not subject to row-level security at all,
--     and REFERENCES and TRIGGER are not privileges any migration in this repo
--     grants a client role deliberately. Those three are real, and they are the
--     ones grant-surface's section C exists to catch.
--
-- Neither half is a breach report. Both should still be closed.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DOES, AND WHAT IT LEAVES ALONE
-- ---------------------------------------------------------------------------
--
-- Section 2 narrows the ten functions to 0166's end state. Section 3 narrows
-- the four tables to the end state 0201 meant to write: SELECT for
-- authenticated and nothing else for any client role.
--
-- IT LEAVES 0201's OWN TEXT ALONE. A migration is an immutable applied record
-- and 0201 applied cleanly; this is the follow-up file, not an edit.
--
-- IT DEFINES NOTHING. No table, no function, no policy, no column, no
-- constraint. Every statement below is a privilege statement. So there is no
-- signature trap here (nothing gains a parameter), no backfill, nothing to
-- strand, and nothing for a client deploy to be ordered against -- the RPC
-- signatures, the RLS policies and the row shapes are exactly as 0201 left them.
--
-- IT DOES NOT TOUCH service_role, which CLAUDE.md keeps out of every narrowing:
-- it bypasses RLS by design and a CHECK constraint's function runs as the
-- WRITING role (0131), so narrowing it breaks direct server writes. The one
-- thing this file says about it is a grant BACK on the functions, which is
-- 0166's own reasoning: a blanket revoke should leave that role holding what it
-- held, and stating it makes the end state independent of which default
-- privileges the database carries.
--
-- ---------------------------------------------------------------------------
-- APPLYING IT TWICE, AND APPLYING IT OVER THE HAND-APPLIED REPAIR
-- ---------------------------------------------------------------------------
--
-- Every statement is a revoke or a grant at a fixed end state, so a second
-- apply is a no-op and the self-check passes identically. That is proven rather
-- than asserted: `tests/db/ideacad-grants-anon-execute-surface.test.ts` boots a
-- chain with this file on the end TWICE and compares the acl of all ten
-- functions and all four tables across the two applies.
--
-- THE TWO HALVES REACH PRODUCTION DIFFERENTLY, and that is worth knowing before
-- pasting. Mr. Pina already repaired the FUNCTION half by hand and it is
-- verified: all ten read anon false, authenticated true. Section 2 is therefore
-- a genuine no-op on production today and exists so the repo carries the
-- repair -- a database rebuilt from these files would otherwise recreate the
-- hole. Section 3 was NOT hand-applied and IS a real change: it is the first
-- time the four tables lose the inherited privileges.
--
-- ---------------------------------------------------------------------------
-- UNDO
-- ---------------------------------------------------------------------------
--
--   grant execute on function public.ideacad_set_editor(uuid,text,jsonb),
--     ... to anon;
--   grant all on table public.ideacad_editors, public.ideacad_documents,
--     public.ideacad_concepts, public.ideacad_predictions to anon, authenticated;
--
-- That restores the pre-0202 acl exactly. It is written down because CLAUDE.md
-- asks what undoes a migration before it is pushed, not because anyone should
-- run it.

begin;

-- ---------------------------------------------------------------------------
-- 1. THE REPORT. Read-only: it selects and raises, and writes nothing.
--
-- Printed BEFORE the change, so whoever pastes this sees the state they are
-- repairing rather than a claim about it. On a production project already
-- carrying the hand-applied function repair the first count is 0 and the second
-- is 8, which is the expected reading and not a sign the file did nothing.
-- ---------------------------------------------------------------------------

do $report$
declare
	r record;
	v_fn_anon integer := 0;
	v_fn_missing_authed integer := 0;
	v_tbl integer := 0;
begin
	for r in
		select p.oid::regprocedure as sig,
		       has_function_privilege('anon', p.oid, 'execute') as anon_x,
		       has_function_privilege('authenticated', p.oid, 'execute') as authed_x
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
		  and p.proname ~ '^_?ideacad'
		order by 1
	loop
		if r.anon_x then
			v_fn_anon := v_fn_anon + 1;
			raise notice '0202: BEFORE -- % is executable by anon.', r.sig;
		end if;
		if not r.authed_x then
			v_fn_missing_authed := v_fn_missing_authed + 1;
			raise notice '0202: BEFORE -- % is NOT executable by authenticated. Section 2 grants it back.', r.sig;
		end if;
	end loop;

	for r in
		select c.relname,
		       rp.role_name,
		       rp.priv
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
		  and c.relname in ('ideacad_editors', 'ideacad_documents',
		                    'ideacad_concepts', 'ideacad_predictions')
		  and has_table_privilege(rp.role_name, c.oid, rp.priv)
		  and not (rp.role_name = 'authenticated' and rp.priv = 'SELECT')
		order by c.relname, rp.role_name, rp.priv
	loop
		v_tbl := v_tbl + 1;
		raise notice '0202: BEFORE -- % holds % on table %.', r.role_name, r.priv, r.relname;
	end loop;

	raise notice '0202: BEFORE -- % ideacad function(s) executable by anon, % missing the authenticated grant, % client table privilege(s) beyond authenticated SELECT.',
		v_fn_anon, v_fn_missing_authed, v_tbl;
end;
$report$;

-- ---------------------------------------------------------------------------
-- 2. THE FUNCTIONS. 0166's shape: revoke from the roles BY NAME, then grant
--    back deliberately.
--
--    The ten signatures are 0201's own, copied from that file's revoke list
--    rather than retyped from the definitions, so an argument type cannot drift
--    between the two files. A signature that did drift would not silently miss:
--    `revoke` on a function that does not exist raises 42883, and the
--    self-check in section 4 sweeps by NAME PREFIX rather than by this list, so
--    a function these lines failed to name is still caught.
-- ---------------------------------------------------------------------------

revoke all on function
	public.ideacad_set_editor(uuid,text,jsonb),
	public.ideacad_open_document(uuid),
	public.ideacad_new_concept(uuid,text,jsonb),
	public.ideacad_save_concept(uuid,jsonb,integer),
	public.ideacad_update_concept_meta(uuid,text,integer),
	public.ideacad_delete_concept(uuid),
	public.ideacad_set_active(uuid,uuid),
	public.ideacad_set_prediction(uuid,uuid,text),
	public.ideacad_commit_concept(uuid),
	public.ideacad_roster(uuid)
	from public, anon, authenticated;

grant execute on function
	public.ideacad_set_editor(uuid,text,jsonb),
	public.ideacad_open_document(uuid),
	public.ideacad_new_concept(uuid,text,jsonb),
	public.ideacad_save_concept(uuid,jsonb,integer),
	public.ideacad_update_concept_meta(uuid,text,integer),
	public.ideacad_delete_concept(uuid),
	public.ideacad_set_active(uuid,uuid),
	public.ideacad_set_prediction(uuid,uuid,text),
	public.ideacad_commit_concept(uuid),
	public.ideacad_roster(uuid)
	to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. THE TABLES. The same narrowing, one object class over.
--
--    SELECT for authenticated is 0201's own decision and is granted back
--    verbatim: the four RLS SELECT policies it wrote are what make that grant
--    mean "your own rows", and revoking it would take the feature down rather
--    than narrow it. Everything else any client role holds here arrived by
--    inheritance and no migration asked for it.
-- ---------------------------------------------------------------------------

revoke all on table
	public.ideacad_editors,
	public.ideacad_documents,
	public.ideacad_concepts,
	public.ideacad_predictions
	from public, anon, authenticated;

grant select on table
	public.ideacad_editors,
	public.ideacad_documents,
	public.ideacad_concepts,
	public.ideacad_predictions
	to authenticated;

-- ---------------------------------------------------------------------------
-- 4. THE SELF-CHECK. 0131's convention: read the catalog back rather than trust
--    that the statements above ran. It raises, so a partial apply cannot look
--    like a clean one, and the whole file rolls back.
--
--    IT SWEEPS BY NAME PREFIX, NOT BY THE LIST IN SECTION 2. The regex matches
--    an underscore-prefixed private helper too, so an eleventh ideacad function
--    added later -- by this file's own author forgetting one, or by a future
--    migration -- is caught here rather than passing because section 2's list
--    did not name it.
--
--    THE POSITIVE CONTROL IS THE POINT OF THE LAST BLOCK. A sweep that found
--    nothing because it was looking in the wrong place reports exactly what a
--    clean database reports, so the file also asserts it can still SEE a
--    deliberate anon grant: app_short_link_target is granted to anon on purpose
--    (0137 keeps it -- printed handouts and QR codes resolve before any session
--    exists), and if that read comes back false the instrument is broken and
--    every assertion above it is worthless.
-- ---------------------------------------------------------------------------

do $checks$
declare
	r record;
	v_total integer := 0;
	v_bad_anon text[] := '{}';
	v_bad_authed text[] := '{}';
	v_bad_table text[] := '{}';
	v_control boolean;
begin
	for r in
		select p.oid::regprocedure::text as sig,
		       has_function_privilege('anon', p.oid, 'execute') as anon_x,
		       has_function_privilege('authenticated', p.oid, 'execute') as authed_x
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
		  and p.proname ~ '^_?ideacad'
		order by 1
	loop
		v_total := v_total + 1;
		if r.anon_x then
			v_bad_anon := v_bad_anon || r.sig;
		end if;
		if not r.authed_x then
			v_bad_authed := v_bad_authed || r.sig;
		end if;
	end loop;

	if v_total <> 10 then
		raise exception '0202: expected 10 ideacad functions in public, found %. Section 2 names ten by signature; if a later migration added another, revoke it there and update this count deliberately.', v_total;
	end if;

	if array_length(v_bad_anon, 1) is not null then
		raise exception '0202: % ideacad function(s) are STILL executable by anon: %. The revoke did not name the roles it needed to.',
			array_length(v_bad_anon, 1), array_to_string(v_bad_anon, ', ');
	end if;

	if array_length(v_bad_authed, 1) is not null then
		raise exception '0202: % ideacad function(s) LOST the authenticated grant: %. The narrowing went too far and the feature is down.',
			array_length(v_bad_authed, 1), array_to_string(v_bad_authed, ', ');
	end if;

	for r in
		select c.relname,
		       rp.role_name,
		       rp.priv
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
		  and c.relname in ('ideacad_editors', 'ideacad_documents',
		                    'ideacad_concepts', 'ideacad_predictions')
		  and has_table_privilege(rp.role_name, c.oid, rp.priv)
		  and not (rp.role_name = 'authenticated' and rp.priv = 'SELECT')
		order by c.relname, rp.role_name, rp.priv
	loop
		v_bad_table := v_bad_table || format('%s on %s to %s', r.priv, r.relname, r.role_name);
	end loop;

	if array_length(v_bad_table, 1) is not null then
		raise exception '0202: % client table privilege(s) survive beyond authenticated SELECT: %.',
			array_length(v_bad_table, 1), array_to_string(v_bad_table, ', ');
	end if;

	-- The four SELECT grants the feature needs must still be there.
	for r in
		select c.relname
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public'
		  and c.relname in ('ideacad_editors', 'ideacad_documents',
		                    'ideacad_concepts', 'ideacad_predictions')
		  and not has_table_privilege('authenticated', c.oid, 'SELECT')
	loop
		raise exception '0202: authenticated LOST select on %. The regrant in section 3 did not run.', r.relname;
	end loop;

	-- The instrument control. See the header block above.
	select has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute')
		into v_control;
	if not v_control then
		raise exception '0202: the positive control failed -- app_short_link_target is not readable as anon-executable, so this file cannot tell an anon grant from its absence and none of the checks above mean anything.';
	end if;

	raise notice '0202: 10 ideacad functions -- anon false, authenticated true, on all ten. 4 ideacad tables -- authenticated holds SELECT and nothing else; anon holds nothing. Positive control (app_short_link_target anon-executable) reads true, so the sweep can see a grant when there is one.';
end;
$checks$;

commit;
