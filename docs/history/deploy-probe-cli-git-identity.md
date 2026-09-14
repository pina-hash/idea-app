---
title: "Ledger 0229: the deploy-probe CLI's synthetic commit carries its own Git identity (`codex/deploy-probe-cli-git-identity`, no migration)"
date: 2026-09-14
branches: [codex/deploy-probe-cli-git-identity]
migrations: []
subsystems: ["Deploy probe", "Testing", "CI"]
---

`tests/deploy-probe-cli.test.ts` builds a commit that is deliberately not attached
to any ref. Its `git commit-tree` call previously inherited author and committer
identity from the machine running Vitest. GitHub Actions provides no such ambient
identity, so the fixture stopped at `Author identity unknown` before it could test
the deploy probe. Local machines with a configured identity concealed the dependency.

The fixture's existing Git helper now supplies `user.name` and `user.email` with
Git's invocation-scoped `-c` options. The configuration applies only to those
synthetic-object commands; no workflow, repository config, global config, working
tree, index or ref is changed. The address uses the reserved `.invalid` top-level
domain because it is fixture data, not a real identity.

A focused assertion now proves the fixture produces a commit object. Run with a
fresh empty `HOME`, an empty `XDG_CONFIG_HOME` and `GIT_CONFIG_GLOBAL=/dev/null`, it
reported **1 passed, 8 skipped, 0 failed**. This directly exercises the failure seam
without weakening or skipping the eight end-to-end deploy-probe cases.

The full `npm test` run reported **9,069 passed, 19 failed and 6 skipped across 475
files**. The environment has no `psql`, which accounts for the deploy-probe CLI/live
failures and the real apply-path skips; it also has no configured remote and therefore
cannot supply `origin/integration` to two apply suites. The same run carried pre-existing
failures in the workflow schedule and reserved short-link route checks. These are
environment/baseline findings outside ledger 0229's owned files, not changes to the
test. `svelte-check` remained at **0 errors and 37 warnings in 20 files**.

No migration and no workflow change were made.
