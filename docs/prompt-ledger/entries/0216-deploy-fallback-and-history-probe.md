# 0216 The dead typed-confirmation fallback, and a probe that reads the seeded history

- Issued: 2026-09-13
- By: router chat
- Owns: `.github/workflows/deploy.yml`, `tools/deploy-probe.mjs`, three named
  paragraphs of `CLAUDE.md`, `tests/deploy-probe*`,
  `tests/db/deploy-probe-history-live.test.ts`,
  `docs/prompt-ledger/entries/0216-*`, and its own `docs/history/` entry. NO
  OTHER SOURCE FILE.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `claude/kind-euler-vlt4u7`, branched from `origin/integration` at
  `9b010f53` (level with `origin/main` at branch time).
- Notes: Two defects, both measured by ledger 0215 on real runs and both
  re-verified here before anything was built.

  **The duplicate check ran three ways and all three came back clean.**
  (1) `docs/prompt-ledger/entries/` holds no `0216-*` file; the highest entries
  present are `0214` and `0215`. (2) `git for-each-ref` over every local and
  remote ref and every tag matches nothing containing `0216`. (3)
  `git grep -il 0216 origin/integration -- docs/ .github/ tools/` matches no
  file, and `git log --all --grep=0216` matches no commit.
  `node tools/migration-claims.mjs` reports highest landed `0211`, next free
  `0214`, with `0212` held by `claude/busy-feynman-aupq55` (ledger 0207) and
  `0213` by `claude/sharp-einstein-cqrnx6` (ledger 0212). Neither branch was
  touched. This bundle claims no number, so it collides with none of it.

  **Defect one: the typed-confirmation fallback had never executed.** The probe
  step opened `set -uo pipefail`, which does not clear ERREXIT -- GitHub invokes
  a `run:` body as `bash --noprofile --norc -eo pipefail {0}`, so `-e` is on
  before the first line and `set -o` only turns options ON. The probe's own exit
  1 and exit 3 killed the step before `PROBE=$?` was read, making the whole
  `case` -- including the only escape hatch from gate 4 -- unreachable code.
  Reproduced locally with a positive control before the fix, then fixed with
  `set +e` and proven by extracting the step body from the parsed YAML and
  running it under `bash -e` against a stub probe, in all four directions the
  prompt asked for (exit 1 and exit 3, confirmation present and absent), plus
  exit 0 and exit 2 and a negative control that re-breaks the body and watches
  the run die before the `probe exit:` line.

  **Defect two: the probe now reads the seeded history table first.** It still
  runs every object probe and the object probe still decides wherever it ran;
  a history row decides only where no probe exists, and a row contradicted by a
  probe is exit 2, reported as a CONFLICT by name. Status 3 still exists and
  still means cannot confirm. On this tree 0202, 0203 and 0206 derive no probe
  at all, which is the silence that stopped six lanes.

  **A third defect was found by the work and fixed.** `psql` prints a command
  tag for `set transaction read only;` and `--tuples-only` does not suppress it,
  so the first version of the presence read took `SET` as the answer and
  reported `cannotRun` against a perfectly reachable database. Invisible to a
  stubbed transport; caught against a real Postgres. Both history reads now
  match a labelled row, which is the discipline `runSql` has always had. A
  fourth was caught by the step harness actually RUNNING the body: a summary
  sentence containing `production's` inside a single-quoted `jq` program made
  the whole step a syntax error, which no YAML parse or careful re-read reports.
  `bash -n` over every `run:` body in the file is now a standing check.

  **`DEPLOY_PROBE_URL` was unset as a repository secret** and the
  no-credential path is pinned: exit 1, with an assertion that the message is
  the tool's own refusal and not a crash.

  **Three `CLAUDE.md` claims were corrected and no more**, each named by ledger
  0209 and by `docs/history/beautiful-galileo-wllnhx.md` as going stale the
  moment the seed was pasted. Two of them are paragraphs in `CLAUDE.md` (the
  `supabase db push` rule, and the `$env` section's credential census); the
  third is `deploy.yml`'s own claim that no CI and no cloud session may hold a
  write credential, which is quoted in `deploy.yml` and appears nowhere in
  `CLAUDE.md` -- it was corrected where it lives, in a file this bundle owns.
  `node tools/claude-md-check.mjs` agrees with the tree.
