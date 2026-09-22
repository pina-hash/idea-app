# 0290 Every open Foundry ask: boards, author profiles, gallery sections and search, mobile full screen
- Issued: 2026-09-22T00:00:00Z
- By: Lane D3, closing feedback reports 30 (Azad Arteaga, leaderboards), 31
  (publisher profiles), 32b (gallery sections and search) and 33b (Enrique
  Mercado, iPhone 607x320, full screen) in one bundle, because all four land on
  the same two surfaces and share one migration.
- Owns: `src/lib/foundry/` entirely, `src/routes/foundry/` plus one new route
  directory under it, `src/app.html` (report 33b only),
  `supabase/migrations/0221_*.sql`, matching `tests/`,
  `tools/browser-verify/routes/foundry-*.mjs`, `src/routes/dev/foundry-*/`,
  `docs/prompt-ledger/entries/0290-*` and its own `docs/history/` entry.
- Migration permitted: yes, exactly one. **Claimed: 0221.** Confirmed free with
  `node tools/migration-claims.mjs` at issue (highest landed 0217; 0218 held by
  two other lanes; 0219, 0220, 0221 unclaimed) and by the absence of any
  `supabase/migrations/0221*` file.
  Highest on origin/main at issue: 0217
- Status: pushed
- Branch: `claude/new-session-dsdncq`
- Notes: see `docs/history/new-session-dsdncq.md` for the audit, the two rung
  decisions the prompt required stated (what "trending" means as a formula, and
  how far "smart search" goes), the measurements, and the one half that cannot
  be verified on any engine in this container.
