# 15 A scoped Postgres role a session applies one migration as
- Raised: 2026-09-05  By: session on `claude/full-auto-migration-deploy-w9w48f` (prompt 0055)
- Status: decided 2026-09-05, REOPENED-AND-REDECIDED the same day on narrower terms, and
  then NOT COMPLETED AT ALL -- which is also decided, and is where it rests.
  See "What actually happened" at the bottom, which is the part to read first: the guard
  this entry describes CANNOT BE INSTALLED, and Mr. Pina chose the weaker thing anyway.
  **And then the weaker thing was not built either.** `idea_migrator` exists on the
  production project with LOGIN and nothing else: `grant postgres to idea_migrator` was
  refused from the SQL editor on PostgreSQL 17.0.6, exactly as this entry's own "NOT
  verified" line said it might be, and finishing it needs a superuser, which needs a
  Supabase support ticket, which **Mr. Pina declined to raise on 2026-09-05.** That is a
  decision and not an outstanding task. What `tools/apply-migration.mjs` connects as is
  the project's own `postgres` connection string in `IDEA_MIGRATION_URL`.
  **Nothing was lost by not finishing it.** Membership in `postgres` IS `postgres`, so the
  privilege on the far side of that grant is identical to the privilege the connection
  string already carries; the role would have bought a separate USERNAME and nothing else,
  because the narrowing it was designed around was the event trigger Supabase does not
  permit. The controls that actually stand are all in the tool and all client-side: the
  statement scanner (0065), and since 0066 the ledger gate and the committed record under
  `docs/migrations-applied/`. Recorded by prompt 0066.
- Decision: YES, asked for. Mr. Pina asked on 2026-09-05 for every remaining manual step
  to be automated, and applying a migration was one of the two that were left. The role
  and its guard are written and committed as `supabase/roles/idea_migrator.sql`; nothing
  is live until he pastes it, and one commented-out paste at the bottom of that file
  removes all of it. This entry records what he is agreeing to, in the terms the file
  itself uses, so that "what can this credential do" is answerable without reading SQL.
- Default this assistant would pick: Create it. The alternative is that every migration
  keeps waiting on a person being at a keyboard, which is the bottleneck the request was
  about, and the worst case the guard leaves open is a migration to reverse rather than
  student work to restore.
- Why it is blocked on him: It is a credential on the production database, it carries a
  password, and only he can paste it and hold the connection string. It is also his to
  remove; nothing in this repository can create, alter or delete it.
- What it unblocks: `tools/apply-migration.mjs`, and with it the migration half of the
  canned lane ending in `IDEA_instructions.md` 4.20.
- What the role can do: everything the last twenty migrations issue at the top level --
  90 revoke, 80 create-function, 79 grant, 69 drop-policy, 69 create-policy, 32 do-blocks,
  23 comment-on, 19 alter-table, 18 create-index, 11 create-table, 11 create-trigger,
  11 drop-trigger, 7 drop-function, 2 storage-bucket inserts, 1 storage-bucket update.
  It is a member of `postgres`, because ownership is the only way Postgres lets a role
  `alter table` something that already exists and there is no per-command owner privilege
  to grant instead.
- WHAT THE GUARD REFUSES -- **NONE OF THIS IS TRUE ANY MORE. The paragraph below and
  the two after it describe a guard that does not exist.** They are left standing
  unedited because they are what was agreed to on 2026-09-05, and the entry has to show
  what was agreed as well as what was delivered. Read "What actually happened" first.
- What the guard refuses, measured on PostgreSQL 17.10: `drop table`, `drop schema`,
  `drop owned`, extension DDL, and any dropped table, column, schema, sequence,
  materialized view or foreign table. It keys on `session_user`, so `set role postgres`
  does not escape it -- measured in both directions.
- What the guard CANNOT refuse, which is the part that is actually being decided:
  `truncate` (an event trigger never fires for it at all -- measured, the recording
  trigger saw nothing); top-level `delete`/`update`/`insert` (event triggers do not fire
  on DML); and a deliberate one-statement replacement of the guard function by anything
  holding this credential. It stops an accident, not an intent. Outside the database,
  `tools/apply-migration.mjs` refuses to SEND a file containing any of those and
  fingerprints the guard before and after every apply, which is a real control on the
  intended path and no control at all on a `psql` prompt.
- What it is deliberately not granted: NOSUPERUSER, NOCREATEROLE, NOCREATEDB,
  NOBYPASSRLS, NOREPLICATION -- so it cannot mint a second credential, cannot create an
  event trigger of its own, cannot `alter system`, and cannot set
  `session_replication_role`, which would switch event triggers off wholesale. Role
  ATTRIBUTES are not inherited through membership, so being a member of `postgres` does
  not hand it any of them; measured. No service key, and nothing that reaches storage
  object BYTES, which live behind the storage API.
- Context: `supabase/roles/idea_migrator.sql` (its header is the full account),
  `tools/apply-migration.mjs`, `tests/apply-migration-guard.test.ts` (the four controls),
  `CLAUDE.md` "Migrations", `docs/history/full-auto-migration-deploy-w9w48f.md`.
- Tree check (2026-09-05): the census above was re-derived from the files rather than
  taken from the prompt, and two of the prompt's figures were narrower than the tree:
  "78 create-or-replace-function" excludes 2 plain `create function` (80 in total) and
  "13 create-index" excludes 5 `create unique index` (18 in total). Every other figure
  matched exactly, including ZERO `drop table` and ZERO `truncate`. The prompt's census
  omitted the 32 `do` blocks, 23 `comment on`, 11 `create trigger` / 11 `drop trigger`,
  7 `drop function`, 1 `drop index` and 1 `create extension` -- the last of which the role
  cannot run and which is why 0162 would have to be pasted by hand.
- NOT verified: nothing here has been run against the live Supabase project. This session
  holds no production credential and asked for none. Whether Supabase's `postgres` role
  can create an event trigger at all, and whether it holds ADMIN OPTION on itself so
  `grant postgres to idea_migrator` lands, are properties of that project that the file's
  own self-check raises on -- which is why the whole file is one transaction and a paste
  that cannot install the guard leaves no role behind.

## What actually happened, 2026-09-05, recorded by prompt 0065

**The guard was correct and is unavailable.** Mr. Pina pasted
`supabase/roles/idea_migrator.sql` and it refused at its FIRST statement:
`ERROR 42501: permission denied to alter role -- Only roles with the SUPERUSER attribute
may alter roles with the SUPERUSER attribute.` Naming `nosuperuser`, `noreplication` or
`nobypassrls` needs superuser on PostgreSQL 16 and later, even to set them false, and
Supabase's `postgres` is not a superuser. Nothing was created; the file is one
transaction, which is the one part of the design that worked exactly as intended.

**And stripping those three would not have saved it.** `create event trigger` also needs
superuser and there is no privilege that can be granted instead. Measured on 17.10
against a non-superuser holding CREATEROLE, CREATEDB and ownership of the database: the
guard schema creates, the guard function creates, and both event triggers are refused
42501. So the function would have been dead code that reads as a control.

**The guard therefore moved to the tool**, which is where this entry already said the
compensating control lived. `tools/apply-migration.mjs` refuses to SEND a file
containing a destructive statement, and prompt 0065 hardened it, because it is now the
only control rather than the outer half of a pair: its statement scanner stripped
comments only from the FRONT of a statement, so `drop /* x */ table public.t;` and
`drop -- x` + newline + `table public.t;` were both SENT. Measured before and after; all
180 committed migrations still refuse exactly the same seven files.

**Mr. Pina chose this over leaving migrations manual, on 2026-09-05, knowing it is
weaker than what he agreed to an hour earlier.** What he is now holding is a credential
whose only restraint is a client-side scanner that anyone with the password and a `psql`
prompt bypasses in one line.

**Two claims in this entry were WRONG when it was written, independently of the guard,
and are corrected here rather than edited above:**

1. "No service key, and nothing that reaches storage object BYTES" stands. But this
   entry did not say that membership in `postgres` means the role READS EVERY ROW IN
   EVERY TABLE, `auth.users` included, because it owns them and ownership bypasses RLS.
   That was true of the guarded design too -- an event trigger never fires on a select.
2. "NOCREATEROLE ... so it cannot mint a second credential ... Measured" is **false**.
   The inheritance half is right: attributes are not inherited through membership. The
   conclusion is not: `SET ROLE postgres` does not inherit anything, it changes
   `current_user`, and the privilege check for `create role` reads `current_user`.
   Measured on 17.10 against a NON-superuser `postgres` holding CREATEROLE -- the real
   Supabase shape -- the direct `create role` is refused 42501, `set role postgres`
   succeeds, and `create role sneaky2 login password '...'` then succeeds and produces a
   working login. `tests/apply-migration-guard.test.ts` now asserts that as a passing
   test, so it is a recorded fact rather than an absence.

**AND THE PASTE MAY STILL NOT SUCCEED, for a reason this entry's own "NOT verified"
section named.** `grant postgres to idea_migrator` needs ADMIN OPTION on `postgres`. On
PostgreSQL 16+ a non-superuser `postgres` can never hold it: admin option comes from a
membership, and a role cannot be granted to itself (`grant postgres to postgres` is
refused 0LP01). Measured: the grant is refused 42501. There is a second, independent
refusal underneath it -- PostgreSQL 16+ auto-grants a CREATEROLE role admin membership
in every role it creates, so `create role idea_migrator` makes `postgres` a member of
`idea_migrator` and the grant closes a loop (0LP01, refused even for a superuser), and
that membership cannot be revoked from the SQL editor because its recorded grantor is
the bootstrap superuser. On PostgreSQL 15 and earlier neither applies; that half is
**not measured** here, because the repository's harness only supplies 17.10. The file
now reports `server_version` at paste time and turns each refusal into a sentence naming
the cause.

- Context added 2026-09-05: `docs/prompt-ledger/entries/0065-guard-outside-the-database.md`,
  `docs/history/guard-outside-database-0uczmi.md`.
