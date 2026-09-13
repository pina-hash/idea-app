# 0209 Close the migration gate: seed the history table, apply from a runner

- Issued: 2026-09-13
- By: router chat
- Owns: `.github/workflows/migrate.yml` (new), `tools/apply-migration.mjs`,
  `supabase/data/0209-seed-migration-history.sql` (new), `docs/MIGRATIONS.md` (new),
  `docs/prompt-ledger/entries/0209-*`, and its own `docs/history/` entry. Plus ONE
  shared test file the new workflow forces: `tests/workflows.test.ts`, whose
  per-file push-shape map is an exact object equality that a fourth workflow
  necessarily breaks. NO FILE UNDER `src/`.
- Migration permitted: no. **Claims: none.** This bundle writes no file under
  `supabase/migrations/`. What it writes under `supabase/data/` is a one-time
  catalog seed, which is the same kind of artefact as
  `0191-material-density-verification.sql` and is not a migration.
- Status: issued
- Branch: `claude/beautiful-galileo-wllnhx`, branched from `origin/integration` at
  `78516fa2`.
- Notes: Every migration on this project is pasted by hand because the remote has
  no `supabase_migrations.schema_migrations` table, so `supabase db push` plans the
  whole chain from `0001` and would replay `0084_coin_legacy_import.sql` and
  `0100_coin_legacy_reimport.sql` over live student coin data. That refusal was
  right. It was then read as "migrations cannot be automated", and five lanes
  stopped at the applied-state gate in one week because nothing in the repository
  knows what is live.

  Three things: a one-time seed that makes the remote's history match reality, a
  workflow that applies the lowest unapplied migration on a merge to `main`
  through `tools/apply-migration.mjs` and nothing else, and the numbered steps
  Mr. Pina follows to paste the seed and set one secret.
