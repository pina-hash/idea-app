---
title: "Ledger 0144: two agents, one repository, and one canonical branch-prefix registry (`codex/two-agents-one-repository`, no migration)"
date: 2026-09-11
branches: [codex/two-agents-one-repository]
migrations: []
subsystems: ["Workflow", "Tooling", "Standards"]
---

Claude Code and Codex cloud tasks now share the same repository controls. The canonical
list is `AGENT_BRANCH_PREFIXES` in `.github/workflows/integrate.yml`; the workflow reads
it at all three candidate-branch sites, while the status and migration tools mirror it
under the same name and tests pin their parity. The list currently contains `claude/`
and `codex/` so adding a future trigger prefix is one registry change plus its mirrors,
not another repository-wide discovery exercise.

`AGENTS.md` points every agent to the one rulebook. The standards record the routing
choice and second-agent parity. Codex setup and maintenance scripts establish Node 24,
dependencies, placeholder public Supabase values, and a Playwright-managed Chromium.

### Measured environment and contradictions

The snapshot and supplied clone evidence agreed: HEAD was `ce87155315f3ad9fbec98db4709e13f235c2d28a`,
and the local duplicate sweep found no prior bundle or environment files. The prompt's
three workflow locations, status filter, migration-holder filter, and exact
`playwright-core` 1.56.1 claim all matched the tree. The claim that mattered and was
wrong for this container was the browser README's older-container measurement: no
Chromium candidate exists here. The local Codex branch is `work`, not the pushed
`codex/<slug>` name, so local branch inspection cannot discover the remote prefix.

The initial shell selected Node 20.20.2 although cached Node 24.15.0 was available.
`npm ls --depth=0` found all top-level dependencies. The database control failed before
Postgres under Node 20, then passed 6 tests in 1.35 seconds under cached Node 24 without
fetching. Its Postgres binary was the installed
`@embedded-postgres/linux-x64/native/bin/postgres`. Setup selected Node 24 and `npm ci`
installed 333 packages in 7 seconds, but the browser-install step could not fetch
`playwright@1.56.1` from the npm registry in the network-disabled agent phase (HTTP 403).
A route run reached Vite and then failed because every Chromium candidate was missing.

### Mr. Pina must act

1. Configure the Codex setup phase to run `tools/codex-setup.sh` with network access, and
   ensure its `npx --yes playwright@1.56.1 install chromium` step succeeds before the
   network-disabled agent phase begins.
2. Keep secrets out of this environment. The placeholder public Supabase values are all
   tests need; Codex cannot and must not reach the production database.
3. After this PR merges, re-upload `docs/standards/IDEA_instructions.md`,
   `docs/standards/IDEA_REPO_WORKFLOW_STANDARD.md`, and `docs/standards/REGISTER.md` to
   project knowledge.
4. Merge the pull request into `integration` by hand. Do not merge it into `main` from
   this task.
