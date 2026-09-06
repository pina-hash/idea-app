# 0094 main is red because CI clones one commit
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `.github/workflows/ci.yml`, `.github/workflows/README.md`, `tests/apply-migration-guard.test.ts`, `tests/apply-migration-trace.test.ts`, `tests/migration-claims*`, the refusal message in `tools/apply-migration.mjs`, `docs/prompt-ledger/entries/0094-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0189
- Status: issued
- Branch: assigned by the harness
- Notes: `origin/main` at `e06ed58` is RED in CI with two failures, and green
  in every session that has run the suite locally, including prompt 0089's
  measurement of 311 files and 6,301 tests taken minutes before it pushed.
  
    tests/apply-migration-guard.test.ts:474
      control 3: a migration applied out of order is refused before it runs
      expected 'apply-migration: 0180_notebook_grid_a...' to match
      /REFUSING to apply 0180_notebook_grid_.../
  
    tests/apply-migration-trace.test.ts:714
      a real apply writes exactly one record, and a second run under the same
      ledger is refused -- "the CLI did not apply 0042"
  
  THE TOOL IS BEHAVING CORRECTLY AND MUST NOT BE CHANGED TO MAKE THEM PASS.
  Both tests need the applied set, `apply-migration.mjs` derives its probes
  from `git show origin/main:`, and `ci.yml` line 112 uses
  `actions/checkout@v4` with no `fetch-depth`, which defaults to a shallow
  clone of ONE commit. In that checkout `origin/main` does not exist, the
  applied-set read fails, and the tool refuses -- which is its designed
  fail-closed path and the only control standing between a session and the
  production database.
  
  Failure 2 is the clearer half: the tool printed its header, counted 15
  top-level statements, and stopped BEFORE the transaction. It did not
  half-apply anything.
  
  `ci.yml` already documents the shallow default at line 197, for a different
  script that tolerates it. Nothing carried that knowledge to these two.
  
  And neither test guards on `origin/main` being readable, so instead of
  failing with "the clone is shallow" they fail on a string comparison,
  which is why five sessions read this as a tool defect.
  
  Deliberately excluded: the tool's exit codes, refusals and fail-closed
  logic; `integrate.yml` and `deploy.yml`; and anything about applying a
  migration.
