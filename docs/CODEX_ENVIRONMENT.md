# Codex environment

This repository's Codex cloud environment should start from `integration`, because
migrations reach `main` first and `integration` falls behind by design. Its canonical
agent branch-prefix registry is `AGENT_BRANCH_PREFIXES` in
`.github/workflows/integrate.yml`; today it contains `claude/` and `codex/`.

The measured 2026-09-11 container was Ubuntu 24.04.4 LTS on x86-64. Its initial shell
selected Node 20.20.2 and npm 11.4.2; NVM also had Node 24.15.0 cached, matching CI's
pinned major, and the setup script selected it. The local branch inside a Codex container
is `work` and carries no prefix; the pushed branch is `codex/<slug>`; a prompt that checks
the local branch name to learn the prefix will always be wrong.

Run `tools/codex-setup.sh` during the network-enabled setup phase. It writes `.env` with
`PUBLIC_SUPABASE_URL=https://ci-placeholder.supabase.co` and
`PUBLIC_SUPABASE_ANON_KEY=ci-placeholder-anon-key`, requires Node 24, runs `npm ci`, and
installs Playwright's pinned Chromium. `tools/codex-maintenance.sh` reruns `npm ci` only
when `package-lock.json` changes.

The agent phase has no network. No secrets are configured or needed, ever, for this
repository. In particular, a task cannot reach the production database, exactly as a
Claude Code cloud session cannot.

## Measurements

- `node_modules` was present and `npm ls --depth=0` found the complete top-level tree,
  including `embedded-postgres` 17.10.0-beta.17, its installed
  `@embedded-postgres/linux-x64` binary package, and `playwright-core` 1.56.1.
- One database file, `tests/db/bucket-limits-probe.test.ts`, first failed before reaching
  Postgres under Node 20 because Vitest could not resolve `node:module`. After selecting
  cached Node 24.15.0 it passed 6 tests in 1.35 seconds. Nothing was fetched during either
  test run. The Postgres 17 binary came from the installed
  `node_modules/@embedded-postgres/linux-x64/native/bin` package.
- Chromium did not resolve, and the existing harness already checks Playwright's managed install location first, so no harness code change was needed. The order is Playwright's
  `chromium.executablePath()`, `CHROMIUM_PATH`, the pinned `/opt/pw-browsers` build,
  its unversioned path, `/usr/bin/chromium`, then `/usr/bin/google-chrome`.
  A route attempt reached Vite, then failed with every candidate missing; setup must install Chromium while network is available.
- The setup script selected cached Node 24.15.0 and `npm ci` installed 333 packages in
  7 seconds, including the platform Postgres package whose postinstall hydrates its
  symlinks. Its Chromium step then failed: the agent phase could not fetch
  `playwright@1.56.1` from `registry.npmjs.org` (HTTP 403). The network-enabled setup phase
  must run that step successfully; without it the browser pass cannot launch.
