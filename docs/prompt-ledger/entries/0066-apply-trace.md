# 0066 A migration applies itself, so it had better leave a trace
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `tools/apply-migration.mjs`, `tests/apply-migration*`, `docs/migrations-applied/` (new), the migration clause of the canned ending with its REGISTER row, the header of `supabase/roles/idea_migrator.sql`, decision 15's Status line, `docs/prompt-ledger/entries/0066-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0184
- Status: pushed
- Branch: `claude/apply-trace-r4kd2p`
- Notes: Mr. Pina turned migration applies over to sessions on 2026-09-05,
  using the project's existing `postgres` connection string in
  `IDEA_MIGRATION_URL` rather than the `idea_migrator` role, which could not
  be completed: `grant postgres to idea_migrator` is unreachable on
  PostgreSQL 17.0.6 from the SQL editor and he declined to raise a support
  ticket for it. The privilege is identical either way -- membership in
  `postgres` IS `postgres` -- so the role bought a separate username and
  nothing else, because the narrowing it was designed around was an event
  trigger Supabase does not permit.

  So `tools/apply-migration.mjs` is now the only control between a session
  and the production database, and prompt 0065 hardened its parser for
  exactly that. Two gaps remain and both matter more now than they did when
  a person was in the loop.

  IT LEAVES NO TRACE. Its own header says it "writes no file, no ledger and
  no marker of any kind at any point". That was a virtue when a failure had
  to leave nothing behind; it is a hole when a success leaves nothing either.
  Nobody can answer what touched the database, when, or from which bundle.

  IT ASKS NOBODY'S PERMISSION. It applies any file it is pointed at. A
  bundle's ledger entry already declares `Migration permitted: yes` or `no`
  and a number, and nothing reads it. A session that wrote a migration it was
  never asked to write can apply it.

  Mr. Pina has pasted nearly two hundred migrations by hand and named the
  interruption, not the typing, as the cost. Neither of these puts him back
  in the loop; they make it possible to find out afterwards what happened.

  Deliberately excluded: `supabase db push`, forbidden and staying so
  because it replays every migration from 0001 over live student coin data;
  the role file beyond its header; and any attempt to use the credential.
