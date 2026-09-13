# 0209 Close the migration gate: seed the history table, apply from a runner

- Issued: 2026-09-13
- By: router chat
- Owns: `.github/workflows/migrate.yml` (new), `tools/apply-migration.mjs`,
  `supabase/data/0209-seed-migration-history.sql` (new), `docs/MIGRATIONS.md` (new),
  `docs/prompt-ledger/entries/0209-*`, and its own `docs/history/` entry. Plus TWO
  test files declared rather than slipped in. `tests/workflows.test.ts` is SHARED
  and the new workflow forces it: its per-file push-shape map is an exact object
  equality that a fourth workflow necessarily breaks, and the map's own comment
  says a file that gains a push line needs a look, so the entry added is that
  look recorded. `tests/db/migration-history-seed.test.ts` is NEW and is this
  bundle's: it drives the seed and the tool's history-row plumbing against a real
  Postgres, in both directions with planted controls, because a verification
  query that reports EQUAL when it should not is a regression nothing on screen
  would report. NO FILE UNDER `src/`.
- Migration permitted: no. **Claims: none.** This bundle writes no file under
  `supabase/migrations/`. What it writes under `supabase/data/` is a one-time
  catalog seed, which is the same kind of artefact as
  `0191-material-density-verification.sql` and is not a migration.
- Status: pushed
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

  **THE SEED STOPS AT 0210 AND ASKS ABOUT 0211.** `docs/migrations-applied/` has a
  record for 0193 through 0210 and none for 0211, and ledger 0203 says 0211 was
  delivered and not applied; the prompt said it had since been pasted, and no
  cloud session can check. Over-seeding an unapplied migration is silent and
  permanent -- the row would make the workflow skip it forever -- so the file asks
  the database through the object 0211 creates and writes the row only on a yes.

  **`SUPABASE_ACCESS_TOKEN` IS NOT SET AND IS NOT NEEDED.** The prompt permitted
  one because the seed makes replay impossible. Nothing here runs the Supabase
  CLI, so the token has no use; `IDEA_MIGRATION_URL` is the one secret and it is
  Mr. Pina's to set. The workflow's header records both the permission and the
  refusal, so removing the seed later cannot leave a credential behind quietly.

  **`CLAUDE.md` IS NOT EDITED, AND THAT IS A DECISION.** Three of its paragraphs
  go stale the moment the seed is pasted; every one of them is still true today,
  and four ledgers are in flight in that file. The history entry names the exact
  three for the bundle that lands after the paste.

  Ledgers 0204, 0205, 0206 and 0207 were in flight and none of their files was
  touched. The tree branched from was ALREADY RED --
  `tests/db/migrations-applied-record.test.ts` wants a `0211` record that
  `docs/migrations-applied/` does not have, which is ledger 0204's to write --
  measured on a clean `git worktree` at the branch point before any work here.

  Verified: full suite, `svelte-check` at the baseline (0 errors, 37 warnings in
  20 files, 31/5/1, re-derived and needing no correction), the seed and the
  history-row plumbing against a real Postgres in both directions with planted
  controls, and every `run:` body of the new workflow extracted from the parsed
  YAML and executed under `bash` -- including the commit step against a real bare
  git remote. NOT verified: anything against production. There is no credential
  and no route; the workflow has never run and the seed has never been pasted.
