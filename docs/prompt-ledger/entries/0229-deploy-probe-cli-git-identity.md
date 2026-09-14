# 0229 Make the deploy-probe CLI fixture independent of ambient Git identity
- Issued: 2026-09-14
- By: Codex cloud task
- Owns: `tests/deploy-probe-cli.test.ts`, the CI workflow file if strictly needed, `docs/prompt-ledger/entries/0229-*`, `docs/history/<yours>`
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0214
- Status: pushed
- Branch: codex/deploy-probe-cli-git-identity
- Notes: No migration. Prefer identity scoped to the test's own Git invocation; prove the test with no global Git configuration visible. Do not weaken or skip the test.
