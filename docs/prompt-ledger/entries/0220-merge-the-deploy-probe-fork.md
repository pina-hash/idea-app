# 0220 One file, one fork: merging ledgers 0213 and 0216 by content

- Issued: 2026-09-13
- By: router chat
- Owns: `tools/deploy-probe.mjs`, `.github/workflows/deploy.yml`, `CLAUDE.md`,
  `tests/deploy-probe*`, the merges of `claude/keen-davinci-xvhwdw` and
  `claude/kind-euler-vlt4u7`, `docs/prompt-ledger/entries/0220-*`, and its own
  `docs/history/` entry. NO OTHER SOURCE FILE. Ledgers 0207, 0212 and 0218 have
  branches standing and none of their files were touched.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `claude/gracious-franklin-9idi64`, branched from `origin/integration`
  at `caef1c07`.
- Notes: The router issued two prompts for overlapping surfaces. This is the
  merge, and the fork is the router's, not either session's.

  **The duplicate check ran three ways and all three came back clean.**
  (1) `git ls-tree` over `docs/prompt-ledger/entries/` on all 59 local and
  remote refs matches no `0220-*` file; the highest entries present are `0215`
  and `0218`. (2) `git log --all --grep=0220` matches no commit. (3)
  `git grep -w 0220` over `docs/`, `tools/` and `.github/` on `origin/main`,
  `origin/integration` and `HEAD` matches nothing.
  `node tools/migration-claims.mjs` reports highest landed `0211`, next free
  `0215`, with `0212` held by `claude/busy-feynman-aupq55` (ledger 0207), `0213`
  by `claude/sharp-einstein-cqrnx6` (ledger 0212) and `0214` by
  `claude/youthful-lovelace-kg9482` (ledger 0218). This bundle claims no number
  and adds no file: `supabase/migrations/` is byte-identical between `HEAD` and
  `origin/main`.

  **The clone was unshallowed** (`git fetch --unshallow origin`, exit 0, 59
  refs) and `origin/integration` fetched. **The committer identity is
  `Claude <noreply@anthropic.com>`**, which matches every non-bot commit on
  `origin/main`; the bot commits there are `github-actions[bot]`, from
  `integrate.yml`.

  **`claude/kind-euler-vlt4u7` was already gone.** `integrate.yml` merged it
  into `origin/integration` on green CI and deleted the branch, so 0216's work
  WAS the integration tip and only 0213's was outstanding. The merge is
  therefore 0213 into a tree that already carries 0216, which neither prompt
  anticipated.

  **Merged section by section. What both got right is preserved:** the history
  table is read first, the object probes are kept and win when a row disagrees,
  status 3 survives and still means cannot confirm, and a row is a claim while a
  probe is evidence.

  **0216's labelled row was taken over 0213's `--quiet`**, and `--quiet` is now
  deliberately ABSENT rather than kept as well: with the flag on, the label
  guard has nothing to bite on and the live test's control goes vacuous. Also
  taken from 0216: the `deploy.yml` fallback fix and its extracted-step tests,
  the `bash -n` sweep, the additive third argument to `verdicts` asserted
  deep-equal, and CONFLICT as the name for a row a probe contradicts -- now the
  word in the data, the report and the job summary.

  **From 0213: `pg_class` over `to_regclass`; `readable` as the conjunction of
  the schema and table privileges; the two round trips**, because a `select` the
  role may not run aborts the transaction the object probes ride in -- the one
  the prompt flagged as easy to lose, and it is present; one `runSqlRaw` rather
  than a second `psql` spawn; `normalizeVersion`; the degrading ladder; and the
  SYNTHESISED no-probe fixture.

  **The one genuine design disagreement** is a read that fails after the
  preflight said readable: 0216 answers exit 1, 0213 degrades a rung. The ladder
  shipped, because the narrowest rung is the pre-seed answer and fails closed by
  construction; 0216's argument is written into the tool's header as the
  rejected alternative.

  **`CLAUDE.md` placement was VERIFIED, not assumed.** Neither `deploy.yml` nor
  `migrate.yml` is mentioned anywhere in `CLAUDE.md` on `origin/main`, so 0216's
  placement is correct and the third stale sentence stays fixed in
  `deploy.yml`. 0213's sentence pointing at that defect is dropped, being false
  after the merge. 0213's `IDEA_MIGRATION_URL` census correction is kept and
  verified against `migrate.yml:140`. The two forks' opposite dated claims about
  whether `DEPLOY_PROBE_URL` is set are replaced by a pointer, because a
  repository secret is not observable from a container in either direction.
  `node tools/claude-md-check.mjs` agrees with the tree.

  **Both mutation proofs were re-run against the merged file and three
  SURVIVED**, each on a load-bearing find: `has_table_privilege` untested in the
  dangerous direction; `to_regclass` not actually pinned, because the test that
  claimed it swapped the role NAME and not the executing role; and the
  `versionRow` label guard passing for the wrong reason. All three are repaired
  and **17 of 17 are killed**. Repairing the second corrected the mechanism on
  record: at the SQL layer `to_regclass` RAISES for such a role rather than
  answering NULL, which under `--single-transaction` takes the object probes
  with it.

  **`svelte-check`: 0 errors, 37 warnings in 20 files (31/5/1)**, re-derived
  first in a clean `git worktree` at `origin/integration` -- also 0/37/20 -- so
  the baseline in `CLAUDE.md` is currently correct and did not move.

  **THE MERGE TO `main` WAS NOT TAKEN, AND GATE 4 IS WHY -- THE NINTH LANE TO
  STOP THERE.** `node tools/deploy-probe.mjs --ref origin/integration` exits
  **1**, not 0: `DEPLOY_PROBE_URL` is a repository secret, which reaches an
  Actions runner and never a container, so the probe answers "cannot confirm",
  which is never a pass. **This bundle's own subject does not change that and it
  would be wrong to claim it does** -- reading the history table first removes
  the exit 3 that came from missing object probes; it cannot help when there is
  no connection to read anything over. The other five items were satisfied. The
  merge is Mr. Pina's, or a rerun from a runner that holds the secret.
