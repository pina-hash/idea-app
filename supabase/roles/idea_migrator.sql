-- supabase/roles/idea_migrator.sql
--
-- THE SCOPED ROLE A SESSION APPLIES ONE MIGRATION AS, AND THE EVENT-TRIGGER
-- GUARD THAT REFUSES DESTRUCTIVE DDL FROM IT.
--
-- THIS IS NOT A MIGRATION AND MUST NEVER BECOME ONE. It carries a password;
-- `supabase/migrations/` is committed to a public repository. Paste it once, by
-- hand, in the Supabase SQL editor, as `postgres`. Replace REPLACE_ME_WITH_A_REAL_PASSWORD
-- with a real one IN THE EDITOR. Do not commit the edited copy anywhere.
--
-- It is one transaction. If any part of it fails -- including the self-check at
-- the bottom, and including the event triggers being refused -- NOTHING is
-- created and there is no half-installed role sitting unguarded.
--
-- ===========================================================================
-- WHAT THE ROLE MAY DO
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
-- The 32 `do` blocks matter more than their count suggests: a `do` block runs as
-- the CALLING role, not as a definer, so everything inside one is the applier's
-- own privilege. Every dynamic `execute` in those 32 is a `select count(*)` or a
-- `select name from` -- read-only -- which was checked, not assumed.
--
-- To `alter table`, `create policy`, `comment on` or `create or replace` a
-- function that already exists, a role must be its OWNER. Postgres has no
-- per-command owner privilege: ownership is all of it, and `drop` is inside it.
-- That is why this file grants membership in `postgres` and then puts a guard in
-- front, rather than granting a list of privileges. Grants cannot express the
-- narrowing; an event trigger can.
--
-- ===========================================================================
-- WHAT THE GUARD REFUSES -- measured on PostgreSQL 17.10, not assumed
-- ===========================================================================
--
--   drop table                  refused by command tag
--   drop schema                 refused by command tag
--   drop owned                  refused by command tag
--   create/drop/alter extension refused by command tag (see below)
--   alter table ... drop column refused by `sql_drop` object type `table column`
--   drop sequence / matview /   refused by `sql_drop` object type
--     foreign table
--
-- and it holds through `set role`: the guard keys on `session_user`, which
-- `SET ROLE` does not change. Measured: as `idea_migrator`, `set role postgres`
-- then `drop table` is still refused, and so is `alter table ... drop column`.
--
-- WHAT IT DELIBERATELY DOES NOT REFUSE, because migrations need them and none of
-- them destroys anything a migration file cannot recreate: `drop policy`,
-- `drop trigger`, `drop index`, `drop function`, `drop view`, `alter table` in
-- every other form.
--
-- ===========================================================================
-- WHAT THE GUARD CANNOT CATCH. READ THIS PART TWICE.
-- ===========================================================================
--
-- A guard that looks total and is not is worse than a narrower one that is
-- understood. Every line here was measured on a real Postgres by firing the
-- command and reading what the trigger saw.
--
-- 1. DML. Event triggers do not fire on `delete`, `update` or `insert` at all.
--    A top-level `delete from public.classroom_submissions` from this role
--    SUCCEEDS. Nothing in the database stops it.
--
-- 2. TRUNCATE. An event trigger NEVER FIRES for it -- not on
--    `ddl_command_start`, not on `sql_drop`. Measured directly: the recording
--    trigger saw nothing at all. `truncate` from this role SUCCEEDS.
--    (The `TRUNCATE` table privilege can be revoked from a role, but the role
--    owns the table through `postgres` and can grant it straight back, and a
--    table created after the revoke has it implicitly again. A control that
--    covers the tables that existed on Tuesday is the kind this file refuses to
--    ship.)
--
-- 3. THE GUARD ITSELF. Event triggers do not fire on event-trigger commands,
--    and they do not fire on role commands. Measured: `drop event trigger` from
--    this role runs with NO trigger firing. So does
--    `create or replace function idea_guard.applier_guard() ... begin end`,
--    because the role is a member of `postgres` and `postgres` owns it.
--    A `ddl_command_end` self-check does NOT close this: it was written, fired,
--    and the REPLACEMENT body ran instead of the original within the same
--    statement, so it refused nothing. It is not shipped, because dead guard
--    code is the thing this section exists to prevent.
--
--    THEREFORE: this guard stops an ACCIDENT -- a `drop table` that should not
--    be in a migration file -- and it does not stop INTENT. A session that
--    means to defeat it does so in one statement. The compensating control is
--    outside the database: `tools/apply-migration.mjs` fingerprints this
--    function before and after every apply and refuses to report success if it
--    moved, and it refuses to SEND a file containing destructive DDL or
--    top-level DML in the first place. That is a client-side control and is
--    bypassable by anyone holding this password and a `psql` prompt.
--
-- 4. A DEFINER FUNCTION THAT ALREADY EXISTS. The role can call any function in
--    the database. `foundry_delete_app` and friends do real deletion and are
--    invisible to an event trigger, exactly as they are to any admin.
--
-- ===========================================================================
-- WHAT IT IS DELIBERATELY NOT GRANTED
-- ===========================================================================
--
--   NOSUPERUSER    -- so it cannot create an event trigger of its own, cannot
--                     `alter system`, and cannot `set session_replication_role`
--                     (which would switch event triggers off wholesale). All
--                     three measured as refused for a non-superuser.
--   NOCREATEROLE   -- so it cannot mint a second credential. Role attributes are
--                     NOT inherited through membership, so `grant postgres to
--                     idea_migrator` does not hand it CREATEROLE even if
--                     `postgres` has it. Measured: `create role`, `alter role`
--                     and `grant <role> to <role>` are all refused.
--   NOCREATEDB, NOREPLICATION, NOBYPASSRLS  -- same reasoning.
--   No service key, no storage API credential. It reaches storage METADATA
--     (`storage.objects` rows, `storage.buckets`) because five of the last
--     twenty migrations write storage policies and one updates a bucket row.
--     It does not reach object BYTES: those live behind the storage API and
--     need SUPABASE_SERVICE_ROLE_KEY, which this role is not and does not have.
--   Nothing is granted on `auth.users` beyond what membership in `postgres`
--     already implies. No migration in the chain touches an `auth` table.
--
-- INHERIT is set deliberately. With NOINHERIT the role would have to
-- `SET ROLE postgres` for every statement, and `current_user` would then be
-- `postgres` -- which is fine for THIS guard (it keys on `session_user`) but
-- makes every future check written against `current_user` silently wrong.
--
-- ===========================================================================
-- HOW TO REMOVE ALL OF IT
-- ===========================================================================
--
-- One paste, at the bottom of this file, commented out. It drops the two event
-- triggers, the guard schema and the role, and leaves the database exactly as it
-- was before this file was ever run. Nothing else in the database refers to any
-- of these objects.
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

alter role idea_migrator
	login
	nosuperuser
	nocreatedb
	nocreaterole
	noreplication
	nobypassrls
	inherit
	password 'REPLACE_ME_WITH_A_REAL_PASSWORD';

-- Ownership is the only way to `alter table` something that already exists, and
-- membership in `postgres` is how this role gets it without every object in the
-- database being reassigned to it. REASSIGNING was the rejected alternative and
-- the reason is not taste: every SECURITY DEFINER function in `public` would
-- then run as `idea_migrator` instead of `postgres`, which changes what a
-- hundred-odd deployed RPCs execute as, in production, as a side effect of
-- creating a credential.
grant postgres to idea_migrator;

comment on role idea_migrator is
	'Applies ONE named migration file at a time, through tools/apply-migration.mjs. Member of postgres for ownership; the idea_applier_guard_* event triggers refuse destructive DDL from it by session_user. See supabase/roles/idea_migrator.sql for what the guard cannot catch.';

-- ---------------------------------------------------------------------------
-- 2. The guard.
-- ---------------------------------------------------------------------------
-- Its own schema, so that "what is the guard" is answerable by listing one
-- schema rather than by knowing which function in `public` is special.

create schema if not exists idea_guard;
revoke all on schema idea_guard from public;
comment on schema idea_guard is
	'Holds the event-trigger guard on idea_migrator and nothing else. No migration may create anything here.';

create or replace function idea_guard.applier_guard()
returns event_trigger
language plpgsql
as $guard$
declare
	r record;
begin
	-- session_user AND NOT current_user. `SET ROLE` changes current_user and
	-- leaves session_user alone, so keying on session_user is what makes
	-- `set role postgres; drop table ...` refuse rather than pass. Measured.
	-- A SECURITY DEFINER function does the same thing, which means a migration
	-- cannot route a drop through one either.
	if session_user <> 'idea_migrator' then
		return;
	end if;

	if tg_event = 'ddl_command_start' then
		-- ONLY TAGS THAT WERE MEASURED TO ACTUALLY REACH AN EVENT TRIGGER.
		-- 'TRUNCATE', 'CREATE ROLE', 'ALTER ROLE', 'DROP ROLE', 'GRANT ROLE',
		-- 'DROP EVENT TRIGGER', 'ALTER EVENT TRIGGER', 'ALTER SYSTEM' and
		-- 'SECURITY LABEL' were each fired at a recording trigger and NONE of
		-- them fired it. Listing one here would be a refusal that never runs.
		if tg_tag in (
			'DROP TABLE',
			'DROP SCHEMA',
			'DROP OWNED',
			'CREATE EXTENSION',
			'DROP EXTENSION',
			'ALTER EXTENSION'
		) then
			raise exception
				'idea_migrator may not run %. Apply this file by hand in the SQL editor instead. (idea_guard.applier_guard)',
				tg_tag
				using errcode = '42501';
		end if;
		return;
	end if;

	-- sql_drop. This is what catches `alter table ... drop column`, whose only
	-- command tag is the perfectly ordinary 'ALTER TABLE'. Measured: the dropped
	-- column arrives here as object_type 'table column'.
	--
	-- 'type' is NOT in this list and must not be added: dropping a VIEW drops
	-- the view's own composite type, so listing it would refuse every
	-- `drop view` while appearing to be about types.
	for r in select * from pg_event_trigger_dropped_objects() loop
		if r.object_type in (
			'table',
			'table column',
			'schema',
			'sequence',
			'materialized view',
			'foreign table'
		) then
			raise exception
				'idea_migrator may not drop a % (%). (idea_guard.applier_guard)',
				r.object_type, coalesce(r.object_identity, '?')
				using errcode = '42501';
		end if;
	end loop;
end
$guard$;

comment on function idea_guard.applier_guard() is
	'Refuses destructive DDL from session_user idea_migrator. Stops an accident, not an intent: see supabase/roles/idea_migrator.sql section "WHAT THE GUARD CANNOT CATCH".';

drop event trigger if exists idea_applier_guard_start;
drop event trigger if exists idea_applier_guard_drop;

create event trigger idea_applier_guard_start
	on ddl_command_start
	execute function idea_guard.applier_guard();

create event trigger idea_applier_guard_drop
	on sql_drop
	execute function idea_guard.applier_guard();

-- ---------------------------------------------------------------------------
-- 3. Self-check. It RAISES rather than reporting, so a paste that could not
--    install the guard does not leave the role behind.
-- ---------------------------------------------------------------------------

do $$
declare
	v_triggers integer;
	v_enabled integer;
	v_pw boolean;
begin
	select count(*) into v_triggers
	from pg_catalog.pg_event_trigger
	where evtname in ('idea_applier_guard_start', 'idea_applier_guard_drop');

	if v_triggers <> 2 then
		raise exception
			'idea_migrator: expected 2 event triggers, found %. CREATE EVENT TRIGGER needs superuser; if this project''s postgres role cannot create one, the role must NOT be created either -- which is why this whole file is one transaction.',
			v_triggers;
	end if;

	select count(*) into v_enabled
	from pg_catalog.pg_event_trigger
	where evtname in ('idea_applier_guard_start', 'idea_applier_guard_drop')
		and evtenabled <> 'D';
	if v_enabled <> 2 then
		raise exception 'idea_migrator: an event trigger exists but is DISABLED. The guard would not fire.';
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

	-- `pg_roles` and NOT `pg_authid`, for the same reason.
	if exists (
		select 1 from pg_catalog.pg_roles
		where rolname = 'idea_migrator'
			and (rolsuper or rolcreaterole or rolcreatedb or rolbypassrls or rolreplication)
	) then
		raise exception 'idea_migrator: the role carries an attribute it must not have (superuser/createrole/createdb/bypassrls/replication).';
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

	raise notice 'idea_migrator: role and guard installed. The guard refuses drop table, drop schema, drop owned, extension DDL, and any dropped table/column/schema/sequence/matview/foreign table, from session_user idea_migrator only.';
	raise notice 'idea_migrator: it does NOT refuse truncate, delete, update or a deliberate replacement of idea_guard.applier_guard(). Read the header.';
	raise notice 'idea_migrator: hand the connection string to a session as IDEA_MIGRATION_URL. Nothing else in this repository may read it.';
end $$;

commit;

-- ===========================================================================
-- THE REVERSAL. Uncomment and paste to remove every object this file created.
-- ===========================================================================
--
-- begin;
-- drop event trigger if exists idea_applier_guard_start;
-- drop event trigger if exists idea_applier_guard_drop;
-- drop schema if exists idea_guard cascade;
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
