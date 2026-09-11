# 0142 A progress bar above every ported HTML assignment, weighted by points

- Issued: 2026-09-11
- By: a session on the ported-HTML-assignment subsystem, one visible feature,
  downstream of ledger 0141 and running in parallel with ledger 0143. Mr.
  Pina's brief, in his words: a progress bar at the top of every HTML
  assignment showing the student how far along they are, WEIGHTED BY POINTS
  rather than by count, color-coded red to green as it fills, with a
  percentage, gamified enough that finishing feels like something.
- Owns: `src/lib/classroom/html-assignment/Progress.svelte` and its module
  `src/lib/classroom/html-assignment/progress.ts` AND NOTHING ELSE IN THAT
  DIRECTORY, the progress region of the schema-3 branch of
  `src/lib/classroom/ItemDetail.svelte`, `src/routes/dev/html-progress/**`,
  `tests/html-assignment-progress*`,
  `tools/browser-verify/routes/html-progress*.mjs`, the generated regions of
  `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0142-*` and
  its own `docs/history/` entry. Also, because a rule the repository states
  about itself requires it: the `classroom-updates.json` entry (the standing
  directive), since a student will see this.
- Migration permitted: NONE. `0193` through `0197` are applied.
- Claims: none.
- Lands on: `main`, after reporting the six-gate checklist.
- Status: issued
- Branch: `claude/upbeat-feynman-pers14`, branched from `origin/integration`
  at `ce871553`.
- Notes:

  **LEDGER 0143 RUNS IN PARALLEL** and owns the rest of
  `src/lib/classroom/html-assignment/**`, the grading console, `live.ts` and
  migration 0198. This bundle reads those files and writes none of them.

  **DUPLICATE CHECK, CLEAN.** No `docs/prompt-ledger/entries/0142-*` existed
  on any ref: every `refs/remotes/origin` ref was swept with
  `git ls-tree -r --name-only <ref>` filtered to that path and returned
  nothing, and `git log --all --grep=0142` returned nothing, so no standing
  `claude/**` branch carried a 0142 ledger commit.

  **THE THREE OPENING CHECKS.** `git fetch --unshallow origin` was a no-op
  because `git rev-parse --is-shallow-repository` already answered `false`.
  `git fetch origin integration` succeeded, with `origin/integration` and
  `origin/main` both at `ce871553`. `git config user.name` is `Claude` and
  `user.email` is `noreply@anthropic.com`.
