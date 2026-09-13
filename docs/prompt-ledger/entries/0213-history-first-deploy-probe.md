# 0213 Read the seeded migration history first, and keep the object probes as evidence

- Issued: 2026-09-13
- By: router chat
- Owns: `tools/deploy-probe.mjs`, `CLAUDE.md` (three named paragraphs and no
  others), `tests/deploy-probe*`, `docs/prompt-ledger/entries/0213-*`, and its own
  `docs/history/` entry. Ledger 0211 owns the IdeaCAD timeline and 0207 owns the
  tournament files; neither was touched. NO FILE UNDER `src/`, no migration, no
  workflow.
- Migration permitted: no. **Claims: none.** Migration `0213` exists, on ledger
  0212's branch `claude/sharp-einstein-cqrnx6`, and this is the LEDGER number.
  Different namespace, checked three ways before any work started.
- Status: issued
- Branch: `claude/keen-davinci-xvhwdw`, branched from `origin/integration` at
  `8fe7a076`.
- Notes: `tools/deploy-probe.mjs` inferred an apply from ONE catalog object per
  migration, derived by `tools/idea-status.py` -- so a migration it could derive
  nothing from answered status 3, CANNOT SAY, and that silence stopped five lanes
  at the deploy gate in one week. Ledger 0209 named ending it as the obvious next
  bundle once `supabase/data/0209-seed-migration-history.sql` gave the database a
  record of its own.

  The probe reads `supabase_migrations.schema_migrations` FIRST and falls back to
  the object probes when the table is missing, unreadable, or carries no row. The
  object probes are NOT deleted: they are the only thing that catches a history
  row claiming an apply that did not happen, which is the failure the seed
  introduces as a possibility.

  **A ROW IS A CLAIM, THE OBJECT IS EVIDENCE, AND THE OBJECT WINS**, stated in the
  tool's own header as the prompt required. A row with a false probe is NOT
  APPLIED (status 2) and the disagreement is printed by name. An ABSENT row is
  silence rather than a denial -- the table is not exhaustive by construction --
  so a missing row with a true probe is APPLIED with the gap reported. **Status 3
  still exists and still means cannot confirm**: no row AND no probe is 3, and a
  database with no history table answers exactly as it did before.

  **NOT MERGED TO `main`, and the reason is this bundle's own subject.** Item 4 of
  the six-item checklist is `node tools/deploy-probe.mjs --ref origin/integration`
  exiting 0, and `DEPLOY_PROBE_URL` is unset in every cloud container, so the
  probe answers exit 1 -- cannot run, which is never a pass. Neither 0212 nor 0213
  is in range; `0211_ideacad_realtime_policy.sql` is, sitting on `integration` and
  not on `main`.

  **THE PRECONDITION IS UNVERIFIED AND SAYS SO.** The prompt made the seed's paste
  a stop. No cloud session reaches the database -- `IDEA_MIGRATION_URL`,
  `DEPLOY_PROBE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are all unset and there is no
  `.env` -- so it was built and measured against the embedded harness with the
  seed applied, in both directions, and production behaviour is unverified.

  Verified: full suite, `svelte-check` at the baseline re-derived on a clean
  worktree at the branch point, a mutation proof judged by the summary line and
  never by vitest's exit code, and the whole CLI driven through real `psql`
  against a real Postgres. Three defects were found by that and fixed:
  `to_regclass` needs schema USAGE and misreported a present table as absent for
  exactly the role this tool runs as; `readable` needs the schema privilege as
  well as the table's; and psql prints a bare `SET` command tag that was landing
  in the version set as a 209th "version".
