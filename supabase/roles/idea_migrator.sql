-- supabase/roles/idea_migrator.sql
--
-- THE SCOPED ROLE A SESSION APPLIES ONE MIGRATION AS.
--
-- THERE IS NO GUARD IN THE DATABASE. There was meant to be one, it was written,
-- it was measured, and it cannot be installed on Supabase. Read the section
-- "WHAT DOES NOT PROTECT YOU" below before pasting this. It is the most
-- important thing in this file.
--
-- THIS IS NOT A MIGRATION AND MUST NEVER BECOME ONE. It carries a password;
-- `supabase/migrations/` is committed to a public repository. Paste it once, by
-- hand, in the Supabase SQL editor, as `postgres`. Replace REPLACE_ME_WITH_A_REAL_PASSWORD
-- with a real one IN THE EDITOR. Do not commit the edited copy anywhere.
--
-- It is one transaction. If any part of it fails -- including the self-check at
-- the bottom -- NOTHING is created and there is no half-privileged credential
-- sitting behind a password somebody has already written down.
--
-- ===========================================================================
-- WHY THERE IS NO GUARD, AND WHY THAT IS NOT A CHOICE
-- ===========================================================================
--
-- The first version of this file created two event triggers and a guard
-- function that refused `drop table`, `drop schema`, `drop owned`, extension
-- DDL and any dropped table, column, schema, sequence, matview or foreign
-- table, keyed on `session_user` so `set role postgres` did not escape it.
-- Every one of those refusals was measured on a real PostgreSQL 17.10. The
-- measurements were right. The platform is different.
--
-- Mr. Pina pasted it on 2026-09-05 and it refused at its FIRST statement:
--
--     ERROR 42501: permission denied to alter role
--     DETAIL: Only roles with the SUPERUSER attribute may alter roles with
--             the SUPERUSER attribute.
--
-- The three attributes `nosuperuser`, `noreplication` and `nobypassrls` were
-- the cause. On PostgreSQL 16 and later, NAMING the SUPERUSER attribute at all
-- -- even to set it FALSE -- requires superuser. Supabase's `postgres` role is
-- not a superuser, by design and permanently.
--
-- STRIPPING THOSE THREE DOES NOT SAVE IT, which is the part worth knowing:
--
--     create event trigger  ->  ERROR 42501: permission denied to create
--                               event trigger "idea_applier_guard_start"
--
-- Measured here on PostgreSQL 17.10, as a non-superuser role holding
-- CREATEROLE, CREATEDB and OWNERSHIP OF THE DATABASE -- which is at least as
-- much privilege as Supabase's `postgres` has. The guard SCHEMA creates fine.
-- The guard FUNCTION creates fine. The event triggers that would make either of
-- them run do not, and without them the function is dead code that refuses
-- nothing while looking exactly like a control. So it is gone, not commented
-- out and not left standing "for later".
--
-- CREATE EVENT TRIGGER is superuser-only in PostgreSQL and there is no
-- privilege that can be granted instead. This is not a Supabase restriction
-- that support could lift; it is the server's.
--
-- ===========================================================================
-- WHAT DOES NOT PROTECT YOU. READ THIS PART TWICE.
-- ===========================================================================
--
-- NOTHING IN THE DATABASE REFUSES ANYTHING FROM THIS ROLE. There is no event
-- trigger, no guard function, no policy and no privilege check standing between
-- `idea_migrator` and any destructive statement. The role is a member of
-- `postgres`, so it OWNS every table in `public`, and ownership in PostgreSQL
-- is not divisible: there is no per-command owner privilege, so a role that can
-- `alter table` can also `drop` it. The previous version of this file bought
-- the narrowing with an event trigger. That purchase is not available here.
--
-- THE ONLY CONTROL IS `tools/apply-migration.mjs`. It parses a migration into
-- top-level statements -- respecting dollar-quoted bodies, quoted strings and
-- comments -- and refuses to SEND one containing a destructive statement. It is
-- CLIENT-SIDE. It is bypassable by anyone holding this password and a `psql`
-- prompt, in one line, with nothing anywhere recording that it happened.
--
-- So, concretely, a session or a person holding this password CAN:
--
--   1. `drop table public.classroom_submissions`. Nothing stops it. The old
--      guard refused this by command tag; there is no guard.
--   2. `truncate` any table. Nothing stops it, and nothing ever could have:
--      an event trigger NEVER FIRES for `truncate` -- measured -- so this one
--      was outside the guard even when the guard existed.
--   3. `delete from` or `update` any table at the top level. Event triggers do
--      not fire on DML at all, so this too was always outside it.
--   4. `alter table ... drop column`, taking the column's data with it.
--   5. `drop schema public cascade`.
--   6. Call any SECURITY DEFINER function in the database, including
--      `foundry_delete_app` and every other real deletion path, exactly as an
--      admin can.
--   7. Read every row in every table, including `auth.users`, because
--      membership in `postgres` bypasses RLS on tables `postgres` owns.
--   8. MINT A SECOND CREDENTIAL, in two statements: `set role postgres;` then
--      a `create role ... login` with a password of its choosing. NOCREATEROLE
--      does not stop
--      this and the previous version of this file was WRONG to say it did.
--      Its reasoning was that role ATTRIBUTES are not inherited through
--      membership, which is true and is not the whole story: `SET ROLE` does
--      not inherit anything, it CHANGES `current_user`, and the privilege check
--      for `create role` reads `current_user`. Measured on 17.10 against a
--      NON-superuser `postgres` holding CREATEROLE -- the real Supabase shape:
--      the DIRECT `create role` is refused 42501, `set role postgres` succeeds
--      because the role is a member of `postgres`, and a `create role sneaky2
--      login` with a password then succeeds and produces a working login. So the
--      credential this file creates is, with one extra statement, as
--      unconstrained as `postgres` itself.
--
-- Items 2, 3 and 6 were already true of the guarded design and were written
-- down in its header. Items 1, 4 and 5 are what the missing event triggers
-- cost. Items 7 and 8 were never true of any version and were simply stated
-- wrongly. The honest summary is that the difference between the design
-- Mr. Pina agreed to and the credential this file actually creates is: the
-- agreed one stopped an ACCIDENT and not an INTENT, and this one stops neither
-- inside the database, and stops an accident only on the ONE PATH that goes
-- through `tools/apply-migration.mjs`.
--
-- WHAT IT STILL CANNOT DO, and this is a short list on purpose:
--
--   NOCREATEROLE  -- it cannot mint a credential WITHOUT first saying
--                    `set role postgres`. That is the whole of what the
--                    attribute buys, and it is worth having only because it
--                    makes the act deliberate: a script that meant to create a
--                    table cannot create a role by accident. Read item 8 above
--                    for what it does not buy.
--   NOSUPERUSER   -- it is not a superuser. NOT because this file says so (it
--                    cannot say so; see above) but because a bare
--                    `create role` produces a non-superuser and nothing here
--                    changes that. Measured on PostgreSQL 17.10: a role made
--                    by a plain `create role` has rolsuper, rolreplication,
--                    rolbypassrls, rolcreatedb and rolcreaterole all FALSE and
--                    rolinherit TRUE. The self-check below READS those back
--                    and raises if any of them is true, which is the same
--                    guarantee the refused `alter role` was reaching for,
--                    obtained by asserting rather than by setting.
--   No service key, and nothing that reaches storage object BYTES: those live
--     behind the storage API and need SUPABASE_SERVICE_ROLE_KEY, which this
--     role is not and does not have. It reaches storage METADATA
--     (`storage.objects` rows, `storage.buckets`) because migrations write
--     storage policies.
--
-- INHERIT is set deliberately. With NOINHERIT the role would have to
-- `SET ROLE postgres` for every statement and `current_user` would then be
-- `postgres`, which makes every future check written against `current_user`
-- silently wrong.
--
-- ===========================================================================
-- WHAT THE ROLE IS FOR
-- ===========================================================================
--
-- Everything the last twenty migration files (0161..0180) actually issue at the
-- top level, which was counted rather than assumed:
--
--     90 revoke                     23 comment on
--     80 create [or replace] function (78 "or replace", 2 plain)
--     79 grant                      18 create index (13 plain, 5 unique)
--     69 drop policy                11 create table
--     69 create policy              11 create trigger / 11 drop trigger
--     32 do $$ ... $$ blocks         7 drop function
--     19 alter table                 2 insert into storage.buckets
--      1 update storage.buckets      1 create extension    1 drop index
--
--     ZERO `drop table`. ZERO `truncate`. ZERO top-level `delete`.
--
-- That census is what `tools/apply-migration.mjs`'s refusal list is derived
-- from: it refuses the categories with zero legitimate occurrences and reports
-- the ones with a handful.
--
-- To `alter table`, `create policy`, `comment on` or `create or replace` a
-- function that already exists, a role must be its OWNER, which is why this
-- file grants membership in `postgres` rather than a list of privileges.
-- Grants cannot express the narrowing. Neither, here, can anything else.
--
-- ===========================================================================
-- THE SERVER VERSION DECIDES WHETHER THIS PASTE CAN SUCCEED
-- ===========================================================================
--
-- `grant postgres to idea_migrator` is the statement everything else rests on:
-- without it the role owns nothing and every `alter table` in every migration
-- fails. Whether it can run is not a Supabase setting. It is a PostgreSQL
-- major-version question, and the answer probably makes this whole file
-- unusable.
--
-- PostgreSQL 16 changed GRANT on a role: the grantor must hold ADMIN OPTION on
-- the role being granted. Before 16, CREATEROLE alone was enough.
--
-- SO, ON POSTGRESQL 16 AND LATER, WITH A NON-SUPERUSER `postgres`:
--
--   * `postgres` cannot hold ADMIN OPTION on `postgres`, because admin option
--     comes from a membership and a role cannot be granted to itself:
--     `grant postgres to postgres` is refused 0LP01 "role postgres is a member
--     of role postgres". Measured on 17.10.
--   * therefore `grant postgres to idea_migrator`, run as `postgres`, is
--     refused 42501 "permission denied to grant role postgres". Measured on
--     17.10, against a `postgres` that is a non-superuser holding CREATEROLE,
--     CREATEDB and ownership of the database.
--   * and there is a SECOND, independent refusal underneath it. PostgreSQL 16+
--     automatically grants a CREATEROLE role ADMIN membership in every role it
--     creates, so `create role idea_migrator` above makes `postgres` a member
--     of `idea_migrator`, and the grant then closes a loop: 0LP01 "role
--     postgres is a member of role idea_migrator". Measured, and refused for a
--     SUPERUSER performing the grant too, because it is a structural check
--     rather than a privilege one. THIS ONE CANNOT BE UNDONE FROM THE SQL
--     EDITOR: the grantor recorded for that automatic membership is the
--     bootstrap superuser, so `revoke idea_migrator from postgres` silently
--     no-ops with a warning and `... granted by supabase_admin` is refused
--     42501. Both measured.
--
-- ON POSTGRESQL 15 AND EARLIER the first refusal does not apply (CREATEROLE was
-- sufficient) and the second does not exist (the automatic admin grant is a 16
-- feature), so the grant is expected to land. THAT HALF IS NOT MEASURED HERE --
-- the harness in this repository only supplies 17.10 -- and it is stated as the
-- documented behaviour of the version change, not as something this session
-- ran.
--
-- The file therefore REPORTS `server_version` at paste time and turns each
-- refusal into a sentence naming the cause, instead of letting a bare 42501
-- reach the editor with no explanation. If it raises, nothing is created and
-- migrations stay manual. The only ways forward from a 16+ refusal are for
-- Supabase support to run `grant postgres to idea_migrator` as a superuser, or
-- for this idea to be abandoned.
--
-- ===========================================================================
-- HOW TO REMOVE ALL OF IT
-- ===========================================================================
--
-- One paste, at the bottom of this file, commented out. It revokes the
-- membership and drops the role, and leaves the database exactly as it was
-- before this file was ever run. Nothing else in the database refers to it.
--
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The role.
-- ---------------------------------------------------------------------------
-- Re-pasteable: created if absent, and its attributes and password are set
-- either way, so a second paste corrects a role somebody edited by hand.

do $$
begin
	if not exists (select 1 from pg_catalog.pg_roles where rolname = 'idea_migrator') then
		create role idea_migrator;
		raise notice 'idea_migrator: role created.';
	else
		raise notice 'idea_migrator: role already existed; its attributes and password are being reset.';
	end if;
end $$;

-- ONLY the clauses a non-superuser CREATEROLE role may set. `nosuperuser`,
-- `noreplication` and `nobypassrls` are NOT here and must never be added back:
-- naming the SUPERUSER attribute needs superuser (42501, measured), and all
-- three are already the state a bare `create role` produces (measured), so
-- naming them bought nothing and cost the whole paste. The self-check at the
-- bottom asserts what these clauses can no longer set.
alter role idea_migrator
	login
	nocreatedb
	nocreaterole
	inherit
	password 'REPLACE_ME_WITH_A_REAL_PASSWORD';

-- ---------------------------------------------------------------------------
-- 2. Ownership, through membership in `postgres`.
-- ---------------------------------------------------------------------------
-- REASSIGNING every object was the rejected alternative and the reason is not
-- taste: every SECURITY DEFINER function in `public` would then run as
-- `idea_migrator` instead of `postgres`, which changes what a hundred-odd
-- deployed RPCs execute as, in production, as a side effect of creating a
-- credential.
--
-- THIS IS THE STATEMENT THAT DECIDES WHETHER THIS FILE CAN WORK AT ALL, and on
-- PostgreSQL 16 and later it probably cannot. See the header, "THE SERVER
-- VERSION DECIDES WHETHER THIS PASTE CAN SUCCEED". It is wrapped so that the
-- two ways it fails arrive as an explanation rather than as a bare 42501.

do $$
declare
	v_num integer := current_setting('server_version_num')::integer;
	v_cycle boolean;
begin
	raise notice 'idea_migrator: server_version %, server_version_num %.',
		current_setting('server_version'), v_num;

	select exists (
		select 1 from pg_catalog.pg_auth_members
		where roleid = 'idea_migrator'::regrole and member = 'postgres'::regrole
	) into v_cycle;

	if v_cycle then
		raise notice 'idea_migrator: postgres holds membership IN idea_migrator (PostgreSQL 16+ grants a CREATEROLE role admin on every role it creates). If the next statement reports a cycle, that is why, and it cannot be undone from this session: the grantor of that membership is the bootstrap superuser, and both `revoke idea_migrator from postgres` and its `granted by` form are refused or silently no-op for a non-superuser. Measured.';
	end if;

	begin
		execute 'grant postgres to idea_migrator';
		raise notice 'idea_migrator: membership in postgres granted.';
	exception
		when insufficient_privilege then
			raise exception
				'idea_migrator: `grant postgres to idea_migrator` was refused (42501). The grantor needs ADMIN OPTION on `postgres`, and on PostgreSQL 16 and later a non-superuser `postgres` can never hold it -- a role cannot be granted to itself (0LP01), so there is no way for `postgres` to acquire admin on `postgres` from the SQL editor. This server reports server_version_num %. Nothing has been created; the transaction is rolling back. THE ROLE CANNOT BE MADE THIS WAY ON THIS SERVER: either ask Supabase support to run `grant postgres to idea_migrator` as a superuser, or keep pasting migrations by hand.',
				v_num;
		when invalid_grant_operation then
			raise exception
				'idea_migrator: `grant postgres to idea_migrator` was refused as a membership CYCLE (0LP01), because `postgres` is already a member of `idea_migrator` -- PostgreSQL 16+ grants a CREATEROLE role admin on every role it creates, and the grantor of that membership is the bootstrap superuser, so this session cannot revoke it. This server reports server_version_num %. Nothing has been created. The fix is not in this file: a superuser must run `revoke idea_migrator from postgres;` and then `grant postgres to idea_migrator;`.',
				v_num;
	end;
end $$;

comment on role idea_migrator is
	'Applies ONE named migration file at a time, through tools/apply-migration.mjs. Member of postgres for ownership. THERE IS NO GUARD IN THE DATABASE: CREATE EVENT TRIGGER needs superuser and Supabase does not grant it. The only control is client-side and bypassable. See supabase/roles/idea_migrator.sql, section "WHAT DOES NOT PROTECT YOU".';

-- ---------------------------------------------------------------------------
-- 3. Self-check. It RAISES rather than reporting, so a paste that could not
--    produce the credential it describes does not leave one behind.
-- ---------------------------------------------------------------------------
-- It asserts everything that CAN still be asserted. What it can no longer do is
-- assert the presence of a guard, because there is none; it says so out loud
-- instead, every time, so nobody pastes this believing otherwise.

do $$
declare
	v_pw boolean;
	v_rec record;
begin
	select rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, rolinherit
		into v_rec
	from pg_catalog.pg_roles where rolname = 'idea_migrator';

	if v_rec is null then
		raise exception 'idea_migrator: the role does not exist after this file created it. Nothing further in this file is meaningful.';
	end if;

	if not v_rec.rolcanlogin then
		raise exception 'idea_migrator: the role cannot log in, so nothing can connect as it.';
	end if;

	-- THIS IS THE ASSERTION THAT REPLACED THE REFUSED `alter role ... nosuperuser
	-- noreplication nobypassrls`. Those clauses could not be SET here, so the
	-- attributes are READ BACK instead: a bare `create role` produces all of them
	-- false, and if this database somehow produced a role with one of them true,
	-- that is a credential nobody agreed to and the whole paste rolls back.
	if v_rec.rolsuper or v_rec.rolcreaterole or v_rec.rolcreatedb
		or v_rec.rolbypassrls or v_rec.rolreplication then
		raise exception 'idea_migrator: the role carries an attribute it must not have (superuser %, createrole %, createdb %, bypassrls %, replication %). This file cannot clear superuser/bypassrls/replication -- naming them needs superuser -- so a role that has one must be dropped and recreated by somebody who can.',
			v_rec.rolsuper, v_rec.rolcreaterole, v_rec.rolcreatedb, v_rec.rolbypassrls, v_rec.rolreplication;
	end if;

	if not v_rec.rolinherit then
		raise exception 'idea_migrator: the role is NOINHERIT, so it would have to SET ROLE for every statement and current_user would then be postgres.';
	end if;

	-- MEMBERSHIP IS NOT ASSUMED TO HAVE LANDED. `grant postgres to ...` needs
	-- ADMIN OPTION on `postgres`, and whether THIS project's `postgres` role
	-- holds that is a property of the project rather than of this file. Without
	-- the membership the role owns nothing and every `alter table` in every
	-- migration fails -- so it is checked here and the whole paste is rolled
	-- back rather than leaving a credential that cannot do its job.
	if not pg_has_role('idea_migrator', 'postgres', 'usage') then
		raise exception 'idea_migrator: the role is NOT a member of postgres, so it owns nothing and cannot alter an existing table. `grant postgres to idea_migrator` needs ADMIN OPTION on postgres; ask Supabase support, or paste migrations by hand.';
	end if;

	-- `pg_authid` is superuser-only and Supabase's `postgres` is not one, so a
	-- password check that reads it would turn this whole file into a permission
	-- error on the one database it is written for. It is asked for, and its
	-- absence is REPORTED rather than raised: "cannot tell" must never read as
	-- either answer.
	begin
		select rolpassword is not null into v_pw
		from pg_catalog.pg_authid where rolname = 'idea_migrator';
		if not v_pw then
			raise exception 'idea_migrator: the role has no password, so nothing can log in as it.';
		end if;
	exception when insufficient_privilege then
		raise notice 'idea_migrator: pg_authid is not readable here, so whether the password is set is UNVERIFIED. Confirm by connecting as the role.';
	end;

	-- THE GUARD IS ABSENT AND THAT IS THE DESIGN, so this asserts its ABSENCE
	-- rather than its presence. A leftover `idea_guard` schema from an earlier
	-- attempt is dead code that reads as a control, which is the one thing the
	-- header says must not be left standing.
	if exists (select 1 from pg_catalog.pg_namespace where nspname = 'idea_guard') then
		raise notice 'idea_migrator: an `idea_guard` schema is present. It is NOT a control -- CREATE EVENT TRIGGER needs superuser, so nothing calls whatever is in it. Drop it: `drop schema idea_guard cascade;`';
	end if;
	if exists (select 1 from pg_catalog.pg_event_trigger where evtname like 'idea_applier_guard%') then
		raise notice 'idea_migrator: an idea_applier_guard event trigger EXISTS. That means this project can create one after all, which contradicts this file''s header -- read it, and say so, before relying on either.';
	end if;

	-- Storage is the one reach this file cannot assert from the file alone.
	-- Five of the last twenty migrations write policies on `storage.objects`,
	-- which needs OWNERSHIP of it, and on this project `storage.objects` is
	-- owned by `supabase_storage_admin` rather than by `postgres`. Whatever
	-- membership lets the SQL editor create a storage policy today is what this
	-- role inherits through `postgres`; that is a claim about THIS project's
	-- role graph, so it is REPORTED at paste time rather than assumed.
	if to_regclass('storage.objects') is null then
		raise notice 'idea_migrator: there is no storage.objects here, so nothing can be said about storage reach. On a real Supabase project this line should not appear.';
	else
		raise notice 'idea_migrator: storage.objects reach -- select %, and pg_has_role(supabase_storage_admin) %. A migration that writes a storage policy needs the second to be true; if it is false, that migration is one a person still pastes.',
			has_table_privilege('idea_migrator', 'storage.objects', 'select'),
			(exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_storage_admin')
				and pg_has_role('idea_migrator', 'supabase_storage_admin', 'usage'));
	end if;

	raise notice 'idea_migrator: role created. It is not a superuser, cannot DIRECTLY create a role, and is a member of postgres -- which means `set role postgres` then `create role` DOES work. Read item 8 of "WHAT DOES NOT PROTECT YOU".';
	raise notice 'idea_migrator: THERE IS NO GUARD IN THE DATABASE. Nothing here refuses drop table, truncate, delete, update, drop schema or drop column from this role. CREATE EVENT TRIGGER needs superuser and Supabase does not grant it.';
	raise notice 'idea_migrator: the ONLY control is tools/apply-migration.mjs, which is client-side and is bypassed by any psql prompt holding this password. Read the file header section "WHAT DOES NOT PROTECT YOU".';
	raise notice 'idea_migrator: hand the connection string to a session as IDEA_MIGRATION_URL. Nothing else in this repository may read it.';
end $$;

commit;

-- ===========================================================================
-- THE REVERSAL. Uncomment and paste to remove every object this file created.
-- ===========================================================================
--
-- begin;
-- revoke postgres from idea_migrator;
-- drop role if exists idea_migrator;
-- commit;
--
-- `drop role` fails if the role still owns something. It should own nothing:
-- everything it created while applying a migration is owned by `postgres`,
-- because ownership came from membership rather than from the login role. If it
-- does fail, `reassign owned by idea_migrator to postgres;` first, and treat the
-- output as a finding worth reading -- it names what this role created in its
-- own name, which nothing in the migration chain should do.
--
-- If an earlier paste of the GUARDED version of this file got far enough to
-- create them (it should not have -- it was one transaction and it raised),
-- these remove the leftovers:
--
-- drop event trigger if exists idea_applier_guard_start;
-- drop event trigger if exists idea_applier_guard_drop;
-- drop schema if exists idea_guard cascade;
