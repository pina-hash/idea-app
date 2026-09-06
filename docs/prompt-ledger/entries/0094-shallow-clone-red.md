# 0094 main is red because CI clones one commit
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `.github/workflows/ci.yml`, `.github/workflows/README.md`, `tests/apply-migration-guard.test.ts`, `tests/apply-migration-trace.test.ts`, `tests/migration-claims*`, the refusal message in `tools/apply-migration.mjs`, `docs/prompt-ledger/entries/0094-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0189
- Status: pushed
- Branch: `claude/ci-shallow-clone-red-38zmu5`
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

  ## Closed (0094)

  REPRODUCED at `--depth 1` before anything changed: the same two failures, the
  same messages, the same lines (474:22 and 715:6). The full suite in that
  clone gives 2 failed of 6301 -- the same two and nothing else.

  ONE CORRECTION TO THE DIAGNOSIS ABOVE. The missing ref is
  `origin/integration`, not `origin/main`. `actions/checkout@v4` creates
  `refs/remotes/origin/<the triggering ref>`, so `origin/main` IS readable in a
  push-to-main checkout; what is absent is every sibling, and both suites pass
  `--ref origin/integration`. CI run 34060552250's own text says so:
  "could not list supabase/migrations on origin/integration". Everything else
  in the entry -- the narrow checkout, the applied-set read failing, the tool
  refusing correctly, `ci.yml` line 112 -- holds.

  FIXED with `fetch-depth: 0` on `ci.yml`'s checkout (measured: the full
  history is free here; three clones each, and the "cheaper" targeted fetch of
  one ref is the only shape consistently slower), a shared
  `tests/git-refs-precondition.ts` both suites call from `beforeAll`, and a
  cause block under the tool's unchanged refusal sentence.

  ONE FILE BEYOND THE OWNED SET: `tests/git-refs-precondition.ts` is new. It is
  referenced only by the two owned suites, and the alternative was two copies
  of the same precondition in two files, which is the shape CLAUDE.md's
  "do not duplicate a rule" exists to refuse.

  THE TOOL'S BEHAVIOUR IS UNCHANGED. Driven end to end against a real embedded
  Postgres with a nonexistent `--ref`, before and after: exit 2 both times, the
  refusal sentence byte-identical both times, `redact()` applied to the same
  string, `return EXIT.refused` untouched. Only added print lines.

