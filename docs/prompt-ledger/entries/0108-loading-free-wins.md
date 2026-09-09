# 0108 Five things that are slow for no reason

- Issued: 2026-09-09
- By: Mr. Pina, from the ledger 0107 read-only loading audit.
- Owns: `src/routes/+layout.server.ts`, `vite.config.ts`, `src/site-versions.d.ts`,
  the changelog import in `src/routes/+page.svelte`, `ChangelogFooter.svelte`,
  `ThemeRoot.svelte`, `src/lib/profile.ts`,
  `src/routes/assignments/[slug]/+server.ts`, their tests,
  `docs/prompt-ledger/entries/0108-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none.
- Lands on: `integration`, then `main` against the six-item checklist.
- Status: issued
- Branch: `claude/loading-perf-audit-0108-ynczwk`.
- Notes: audit findings 1, 2, 8, 10, 11. Finding 3's `transports.ts` item is
  excluded because ledger 0106 owns that file. The audit could not run a build,
  so finding 1's effect on routes other than `/` is unconfirmed.
