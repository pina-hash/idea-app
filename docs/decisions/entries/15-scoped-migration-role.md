# 15 A scoped Postgres role a session applies one migration as
- Raised: 2026-09-05  By: session on `claude/full-auto-migration-deploy-w9w48f` (prompt 0055)
- Status: decided 2026-09-05
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
