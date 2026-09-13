# 0213 Read the seeded migration history first -- SUPERSEDED BY 0216, reduced to two fixes on it

- Issued: 2026-09-13
- By: router chat
- Owns: `tools/deploy-probe.mjs`, `CLAUDE.md` (three named paragraphs and no
  others), `tests/deploy-probe*`, `docs/prompt-ledger/entries/0213-*`, and its
  own `docs/history/` entry. **After the collision below, what this bundle
  actually changed is two things in `tools/deploy-probe.mjs` and three controls
  in `tests/db/deploy-probe-history-live.test.ts`.** Ledger 0211 owns the
  IdeaCAD timeline and 0207 the tournament files; neither was touched. NO FILE
  UNDER `src/`, no migration, no workflow.
- Migration permitted: no. **Claims: none.** Migration `0213` exists on ledger
  0212's branch `claude/sharp-einstein-cqrnx6`; this is the LEDGER number.
  Different namespace, checked three ways before any work started.
- Status: issued
- Branch: `claude/keen-davinci-xvhwdw`, branched from `origin/integration` at
  `8fe7a076`.
- Notes: **THIS BUNDLE COLLIDED WITH LEDGER 0216 AND LOST THE RACE, AND THE
  COLLISION IS THE THING WORTH RECORDING.** Both were issued by the router chat,
  hours apart, for the same job on the same files. The duplicate check here ran
  three ways and came back clean, correctly: `0216` did not exist yet. Its own
  entry records a three-way check that came back clean too, for the same reason
  in the other direction. **Neither check could have caught this**, which is
  exactly the limit `docs/prompt-ledger/README.md` states in its own words: two
  chats that both write a prompt before either records an entry.

  0216 branched from `9b010f53`, landed on `integration` first with
  `Status: pushed`, and reached the same design independently -- history first,
  object probes kept, the object deciding wherever it ran, status 3 preserved.
  It also independently found the `psql` command-tag defect and independently
  concluded that the third stale `CLAUDE.md` claim lives in `deploy.yml` and
  appears nowhere in `CLAUDE.md`. Three sessions agreeing is worth more than any
  one of them.

  **So every overlapping file was resolved in favour of `integration`**:
  `tools/deploy-probe.mjs`, `CLAUDE.md` and `tests/deploy-probe-history.test.ts`
  are 0216's, and this branch's own `tests/deploy-probe-cli.test.ts` was
  deleted. 0216 additionally carries a fix this bundle does not have at all --
  `set -uo pipefail` leaving the typed-confirmation fallback unreachable -- in a
  file this bundle does not own.

  **WHAT SURVIVES IS TWO DEFECTS IN THE LANDED VERSION, BOTH MEASURED.**

  1. `HISTORY_PRESENCE_SQL` used `to_regclass`, on the stated grounds that it
     answers null rather than raising. It does not, for the role this tool is
     built for: resolving a qualified name needs USAGE on its schema, and
     without it `to_regclass` RAISES. Measured on a real Postgres as a role
     holding CONNECT and nothing else, against a database where the table
     exists with 208 rows: `to_regclass` -> `ERROR: permission denied for
     schema supabase_migrations`; the `pg_class` lookup -> `present`. Through
     `to_regclass` the presence query fails, `readHistory` reports it, and the
     tool exits 1 -- **every deploy stopped, on a perfectly reachable
     database.** It asks `pg_catalog` now, which is filtered by neither
     privilege, and that is the same fact the file's own `information_schema`
     section already turns on.
  2. A table that is PRESENT and UNREADABLE was a query error and therefore
     `cannotRun`. It is now a third answer, `unreadable`, which degrades to the
     object probes -- the pre-seed behaviour, which is a working answer -- and
     says so on stderr and in the report. Otherwise the moment the seed is
     pasted, a read-only role missing one grant on one new table stops every
     deploy this repository can make. It is deliberately NOT collapsed into
     `absent`: that is a claim about the database rather than about the role's
     reach, and it is the sentence an operator would act on by pasting a seed
     that is already applied. `readable` is TWO privileges, because
     `has_table_privilege` says nothing about the schema.

  **NOT MERGED TO `main`, and the reason is this bundle's own subject.** Item 4
  of the six-item checklist is `node tools/deploy-probe.mjs --ref
  origin/integration` exiting 0; `DEPLOY_PROBE_URL` is unset in every cloud
  container, so it exits 1 -- cannot run, which is never a pass. Neither 0212
  nor 0213 is in range.

  **THE PRECONDITION IS UNVERIFIED AND SAYS SO.** No cloud session reaches the
  database. Everything here was measured against the embedded harness with
  `supabase/data/0209-seed-migration-history.sql` applied, through the real
  `psql`; production behaviour is unverified.
