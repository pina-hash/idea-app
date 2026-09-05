---
title: "Full auto: `supabase/roles/idea_migrator.sql` is a scoped role with an event-trigger guard, `tools/apply-migration.mjs` applies ONE named file through it, and the canned lane ending now lets a lane merge `integration` into `main` against a six-item reported checklist (`claude/full-auto-migration-deploy-w9w48f`, no migration)"
date: 2026-09-05
branches: [claude/full-auto-migration-deploy-w9w48f]
migrations: []
subsystems: ["Tooling", "Deploy", "Migrations", "Security", "Standards"]
---

Mr. Pina asked on 2026-09-05 for every remaining manual step to be automated. Two
were left that a session could take: applying a migration, and merging
`integration` into `main`. This bundle writes the mechanism for both. **It does
not use either one**: nothing was applied anywhere, nothing was merged to `main`,
and this session holds no production credential and asked for none.

## What Mr. Pina does, once

1. **Open `supabase/roles/idea_migrator.sql` and read its header.** It is about
   130 lines of prose before any SQL, and it is the whole account of what the
   credential can do, what the guard refuses, what the guard measurably CANNOT
   refuse, and what the role is deliberately not granted. It is written to be
   read before pasting rather than after.
2. **Replace `REPLACE_ME_WITH_A_REAL_PASSWORD` with a real password, in the
   Supabase SQL editor, and paste the file.** Not in a commit, not in a file on
   disk. The whole file is ONE transaction and ends in a self-check that RAISES,
   so a paste that cannot install the event triggers -- or that cannot make the
   role a member of `postgres` -- leaves NO role behind rather than an unguarded
   one.
3. **Put the connection string somewhere a session can read it, as
   `IDEA_MIGRATION_URL`.** Exactly one file in this repository reads that
   variable (`tools/apply-migration.mjs`) and it is never printed, not in a
   message, not in an error, not in `--json`.
4. **To remove all of it**, uncomment and paste the block at the bottom of the
   same file: two `drop event trigger`s, `drop schema idea_guard cascade`,
   `revoke postgres from idea_migrator`, `drop role idea_migrator`. Six lines,
   one paste, and the database is exactly as it was.

## Why the guard is an event trigger and not a set of grants

A role that can `alter table` on a table that already exists must OWN it, and
Postgres has no per-command owner privilege: ownership is all of it, and `drop`
is inside it. So the narrowing cannot be expressed as grants at all. The only
in-database mechanism that can express it is an event trigger, and the whole
design follows from that.

`idea_migrator` is a member of `postgres`, which is where the ownership comes
from. **Reassigning ownership of `public` to the new role was the rejected
alternative and the reason is not taste**: every SECURITY DEFINER function in
`public` would then run as `idea_migrator` instead of `postgres`, which changes
what a hundred-odd deployed RPCs execute as, in production, as a side effect of
creating a credential. `_notebook_email_for_user` reads `auth.users`; the storage
policies read `storage.objects`. Giving the new role that reach to keep them
working is the exact escalation the scoping exists to avoid.

Role ATTRIBUTES are not inherited through membership, which is what makes the
membership survivable: measured, a member of a superuser `postgres` still cannot
`create role`, `alter role`, `grant` a role, `alter system` or set
`session_replication_role`.

## What was measured, on PostgreSQL 17.10

Every claim below was produced by firing the command at a recording event trigger
and reading what it saw, not by reading the firing matrix.

**Tags that reach an event trigger:** `DROP TABLE`, `DROP SCHEMA`, `DROP INDEX`,
`DROP VIEW`, `DROP FUNCTION`, `DROP EXTENSION`, `DROP OWNED`, `CREATE EXTENSION`,
`ALTER TABLE`, `DROP POLICY`, `DROP TRIGGER`.

**Tags that NEVER reach one, so listing them would ship a refusal that never
runs:** `TRUNCATE`, `CREATE ROLE`, `ALTER ROLE`, `DROP ROLE`, `GRANT ROLE`,
`DROP EVENT TRIGGER`, `ALTER EVENT TRIGGER`, `ALTER SYSTEM`, `SECURITY LABEL`.
The recording trigger saw **nothing at all** for each of them. None of those is
in the shipped tag list.

**`sql_drop` closes the `ALTER TABLE ... DROP COLUMN` gap.** That statement's only
command tag is the perfectly ordinary `ALTER TABLE`, so a tag list cannot see it;
the dropped column arrives at a `sql_drop` trigger as `object_type` `table
column` and is refused there. **`type` is deliberately NOT in that object list**:
dropping a VIEW drops the view's own composite type, so including it would refuse
every `drop view` while appearing to be a rule about types.

**The guard keys on `session_user`, and that is load-bearing.** `SET ROLE` changes
`current_user` and leaves `session_user` alone. Measured: as `idea_migrator`,
`set role postgres` then `drop table` is still refused, and so is
`alter table ... drop column`. A SECURITY DEFINER function is the same shape, so a
migration cannot route a drop through one either.

**An abort is total.** `begin; create table t_mid; drop table t_keep; commit;` as
the scoped role leaves `t_mid` NULL and `t_keep` standing -- proved rather than
asserted, and again inside `tests/apply-migration-guard.test.ts` control 1, where
a `raise notice` from BEFORE the refusal still reaches the caller while the table
it announced does not exist.

## What the guard cannot catch, which is the part worth arguing about

A guard that looks total and is not is worse than a narrower one that is
understood, so this is stated in the role file's header, in `CLAUDE.md`, in
decision 15 and here.

1. **DML.** Event triggers do not fire on `delete`, `update` or `insert`. A
   top-level `delete from public.classroom_submissions` from this role succeeds.
2. **`TRUNCATE`.** Measured: no event fires for it, on any of the three event
   types. The `TRUNCATE` table privilege can be revoked from the role, but the
   role owns the table through `postgres` and can grant it straight back, and a
   table created afterwards has it implicitly again -- a control that covers the
   tables that existed on Tuesday, which is the kind this bundle refused to ship.
3. **The guard itself.** One statement --
   `create or replace function idea_guard.applier_guard() ... begin end` -- and it
   refuses nothing. A `ddl_command_end` self-check does NOT close this: it was
   written, fired, and the REPLACEMENT body ran instead of the original within the
   same statement, so it refused nothing while looking like a control. It is not
   shipped.

**So the guard stops an accident, not an intent.** That is the honest
characterisation and it matches the actual risk: a migration file with a
`drop table` in it, not a session trying to defeat a trigger.

The compensating controls are outside the database and are honest about being
bypassable by anyone with the credential and a `psql` prompt: `apply-migration.mjs`
refuses to SEND a file containing any of the three, and it fingerprints the guard
function before and after every apply, so a file that moved it is reported rather
than silent.

## `tools/apply-migration.mjs`

One file, by number or by path. There is no flag that takes a range or a
directory, and `parseArgs` throws on a second positional argument. It:

- **scans the file before connecting**, splitting top-level statements with
  dollar-quoting, comments and quoted strings respected, and refuses
  `drop table`, `drop schema`, `drop database`, `drop owned`, `truncate`,
  top-level `delete`, `create extension`, `alter table ... drop column`, event
  trigger and role management. Top-level `insert`/`update` are REPORTED and need
  `--allow-dml`, because the census says what they are in practice: 2 inserts and
  1 update in the last twenty migrations, every one against `storage.buckets`;
- **refuses anything that is not the lowest unapplied migration**, using
  `deploy-probe.mjs`'s exported `readProbes`/`prepare`/`buildSql`/`verdicts`
  rather than a second derivation, run over its own connection inside a read-only
  transaction;
- **collects every notice in order**, with severity, which is why it speaks the
  wire protocol through `pg` rather than shelling out to `psql`;
- **treats `P0001` and `42501` as REFUSALS** -- a migration's own self-check
  saying no, or the guard saying no -- and everything else as a failure, and
  rolls back either way;
- **asks `pg_catalog` about every object the file names**, afterwards, per object.

**It does not wrap a file that opens its own transaction.** Eight migrations carry
an explicit `begin;`/`commit;`. An inner `commit` would commit this tool's wrapper
early and every statement after it would run outside any transaction with the
rollback silently doing nothing.

**Two derivations, deliberately, and it is said out loud in the header.**
`idea-status.py` answers "did this migration land" with ONE marker object;
`claims()` answers "did every object this file names land" with all of them.
Folding them together would make one of the two questions unanswerable.

**A cloud container cannot open a TCP socket to port 5432.** Measured here:
outbound 5432 and 6543 both refused, 22 refused, only 443 open. The agent proxy
DOES answer `200 Connection Established` for a CONNECT to 5432, so `makeClient`
tunnels through `HTTPS_PROXY` when the host is not in `NO_PROXY` and hands the
already-connected socket to `pg`. That path has its own positive control in the
test file, with an in-process CONNECT proxy that also proves a 403 from the proxy
reads as a proxy refusing rather than a database that is down.

## The census, re-derived rather than taken from the prompt

Across 0161..0180, top level: 90 revoke, 80 create-function (78 `or replace` plus
2 plain), 79 grant, 69 drop-policy, 69 create-policy, 32 `do` blocks, 23
comment-on, 19 alter-table, 18 create-index (13 plain plus 5 unique), 11
create-table, 11 create-trigger, 11 drop-trigger, 7 drop-function, 2
storage-bucket inserts, 1 storage-bucket update, 1 create-extension, 1
drop-index, 1 begin/commit pair. **ZERO `drop table`, ZERO `truncate`, ZERO
top-level `delete`.**

The prompt's figures were right on every number it gave except two, both narrower
than the tree: its 78 excluded the 2 plain `create function`, and its 13 excluded
the 5 `create unique index`. What it omitted is the more interesting half -- the
32 `do` blocks especially, because **a `do` block runs as the CALLING role, not as
a definer**, so everything inside one is the applier's own privilege. Every
dynamic `execute` in those 32 was read: all of them are `select count(*)` or
`select name from`.

Put through the scanner, **138 of 180 committed migrations are clean, 7 are
refused and the rest carry only a DML note.** Every one of the 7 is historical
(0019, 0037, 0076, 0085, 0094, 0098, 0162) and every one is a file a person should
still paste.

## The probe floor, and the thing that bit twice in one afternoon

`idea-status.py` derives probes from `origin/main`, so **a migration sitting only
on `integration` gets no probe at all** and `apply-migration.mjs` refuses it --
correctly, since CANNOT SAY is never a pass. At 18:50 on 2026-09-05 that was
eleven files: `origin/main`'s highest was 0169 while `origin/integration` carried
through 0180. By 19:25 main had caught up and carried 0182. The *rule* is durable
even though that reading was not, and it is now in `CLAUDE.md`: land it on `main`
first, or paste it by hand, and do not widen the probe to guess. Three migrations
(0153, 0177, 0181) have no derivable probe at all for a separate reason and are
refused for the same one.

## The canned lane ending

`IDEA_instructions.md` 4.20. A lane may now apply its own migration through
`apply-migration.mjs` and by no other route, and may merge `integration` into
`main` after reporting six items with the command and the answer for each:
main-is-an-ancestor, branch-contained-and-CI-green-on-integration's-current-tip,
clean merge, `deploy-probe` exit 0, every migration this bundle added reported
APPLIED, and every newly-arrived ledger entry reading `Status: pushed`. Those
mirror `deploy.yml`'s guard job rather than inventing a second set.

It also names **three things a session cannot establish**: whether students are in
class right now (a session has a clock but not a timetable), whether the preview
renders (unreachable from a cloud container, established 2026-08-26 and
unchanged), and whether a migration's EFFECT on real data was what was intended --
the probe answers that an object exists, never that a backfill did the right
thing. An ending that grants a merge without naming its own blind spots is how the
preview check got negotiated away the first time.

Everything the ending already carried is kept: never force-push, no remote branch
deletion, resolve conflicts on the branch, the final commit flips the ledger
status, report the preview URL and its checks.

**The paragraph immediately beneath the ending was corrected in the same pass**,
which is one line outside this bundle's stated ownership and is reported rather
than hidden: it read "Merging is now Mr. Pina's, after he opens the preview
himself", which the new ending contradicts. A standards document that contradicts
itself in two adjacent paragraphs is worse than either version of the rule.

## Verification

- `tests/apply-migration.test.ts` -- 34 assertions, no database: the splitter,
  the refusal list, the object derivation, the ordering verdict, the proxy bypass
  list, and a sweep over all 182 committed migrations.
  **The corpus assertions are rules, not pinned lists.** A pinned list of refused
  files is a ratchet: every future migration reddens it and the fix offered each
  time is to write down the new set. What is asserted instead is that every
  refusal is corroborated INDEPENDENTLY of the scanner by the destructive keyword
  appearing at column 0 in the file, plus three named anchors so the sweep cannot
  pass by finding nothing. Two migrations landed mid-session (0181, 0182) and the
  file stayed green, which is the property being bought.
- `tests/apply-migration-guard.test.ts` -- 18 assertions against a real Postgres
  with the REAL role file applied, unmodified except for the password
  placeholder. The four controls, plus the guard's own positive control (it does
  NOT refuse the same statements from another `session_user`, or the tests would
  pass equally against a database nobody could use), plus a sixteen-statement
  fixture covering every shape the last twenty migrations issue.
- `tests/workflows.test.ts` -- extended with the seam: `apply-migration` imports
  its derivation from `deploy-probe` and every imported name is genuinely exported
  there; neither tool reads the other's variable or the service key; nothing
  invokes the `supabase` CLI; `supabase/roles/` numbers no file, carries no real
  password and keeps its reversal commented out; and the canned ending names the
  one tool, still forbids `supabase db push`, no longer says "Do NOT merge to
  `main`", and keeps all four of its prior guarantees.

## NOT verified, and this is the important list

- **Nothing was run against the live Supabase project.** No credential was held
  and none was asked for. The production path is entirely unexercised.
- **Whether Supabase's `postgres` role can `CREATE EVENT TRIGGER` at all** is
  unknown. It normally requires superuser and Supabase's `postgres` is not one.
  The role file raises and rolls back if the triggers are not there afterwards,
  which is the whole reason it is one transaction, but whether that raise fires on
  the real project will be discovered by pasting it.
- **Whether `grant postgres to idea_migrator` lands** is unknown for the same
  kind of reason: it needs ADMIN OPTION on `postgres`. The self-check raises if
  the membership is absent.
- **Whether the role can write a storage policy** is unknown. `storage.objects`
  is owned by `supabase_storage_admin` on a real project, and whatever membership
  lets the SQL editor create a storage policy today is what this role would
  inherit through `postgres`. The self-check REPORTS both facts at paste time
  rather than assuming either.
- The embedded cluster's `postgres` IS a superuser and Supabase's is not. That
  cannot change what the guard refuses -- event triggers fire for superusers too
  -- but it does mean the two `raise exception` rungs above were measured only in
  the direction where they pass.
- No browser pass. This bundle renders nothing.

## Deferred, and named

- **`CLAUDE.md` still carries an unconditional "push the branch, do not merge to
  `main`"** in its `claude/**`-branch paragraph, which decision 16 contradicts.
  That paragraph was outside this bundle's ownership and is left standing; it is a
  one-line correction for a later bundle.
- **`.github/workflows/**` is untouched by rule.** Mr. Pina has ruled GitHub
  Actions out as a path he will use, so `deploy.yml` still exists and still works
  and this bundle neither extends nor retires it.
- **A migration with no derivable probe** (0153, 0177, 0181 today) can never be
  applied by this tool. Widening `idea-status.py`'s derivation is its own bundle
  with its own answer for what a probe may guess at.
