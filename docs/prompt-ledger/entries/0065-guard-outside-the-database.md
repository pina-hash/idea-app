# 0065 The guard cannot live in the database, so move it and say so
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `supabase/roles/idea_migrator.sql` and its README, `tools/apply-migration.mjs`, `tests/apply-migration*`, decision entries 15 and 16 including a numbering collision, `docs/prompt-ledger/entries/0065-*`, and its own `docs/history/` entry.
- Migration permitted: no. The role file carries a password and is not a migration.
- Status: issued
- Branch: assigned by the harness
- Notes: Mr. Pina pasted `supabase/roles/idea_migrator.sql` into the Supabase
  SQL editor on 2026-09-05 and it refused at its FIRST statement:

    ERROR 42501: permission denied to alter role
    DETAIL: Only roles with the SUPERUSER attribute may alter roles with
            the SUPERUSER attribute.

  Line 166 names `nosuperuser`, `noreplication` and `nobypassrls`. On
  PostgreSQL 16 and later, naming the SUPERUSER attribute AT ALL, even to set
  it false, requires superuser. Supabase's `postgres` role is not one, by
  design and permanently. Nothing was created; the file is one transaction.

  AND STRIPPING THOSE THREE DOES NOT SAVE IT. `create event trigger` at line
  268 also requires superuser and Supabase does not grant it. The file's own
  self-check anticipates that and raises rather than leaving an unguarded
  role behind, which is why nothing is half-installed today.

  So the event-trigger guard cannot exist on this platform. Prompt 0055 built
  it against a real PostgreSQL 17.10 and measured every claim; the
  measurements are right and the platform is different.

  WHAT MAKES THIS SURVIVABLE IS ALREADY IN THE FILE'S OWN HEADER. It records
  that the guard stops an ACCIDENT and not INTENT, because a session holding
  the password can replace the guard function's body in one statement, and
  that a `ddl_command_end` self-check was written, fired, and refused
  nothing. It names the compensating control as `tools/apply-migration.mjs`,
  which already fingerprints the guard and already refuses to SEND a file
  containing destructive DDL or top-level DML.

  So the database half was doing less than its design implied, and the client
  half already exists. This bundle removes what cannot be installed, keeps
  what can, and rewrites the header so nobody reads a protection that is not
  there.

  Mr. Pina chose this over leaving migrations manual, on 2026-09-05, knowing
  it is weaker than what he agreed to an hour earlier.

  Also: decision entry 15 EXISTS TWICE. `15-scoped-migration-role.md` and
  `15-tournament-thumbs-stay-public.md` were both written on 2026-09-05 by
  prompts that each verified 15 was free. Same failure as migration 0177, one
  directory over.

  Deliberately excluded: the canned lane ending, already correct; and any
  attempt to obtain superuser on Supabase, which is not available.
