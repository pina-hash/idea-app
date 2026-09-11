# 0160 IdeaCAD: the first look at a visual surface nobody has ever seen

- Issued: 2026-09-11
- By: router chat
- Owns: `src/lib/ideacad/**`, `src/routes/dev/ideacad/**`, `tests/ideacad*`,
  `tests/dom/ideacad*`, `tools/browser-verify/routes/ideacad*.mjs` and the generated
  regions of its README, `docs/prompt-ledger/entries/0160-*`, and its own
  `docs/history/` entry
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0201
- Status: issued
- Branch: `claude/ecstatic-maxwell-juawx5`, branched from `origin/integration` at `87ba98a`
- Notes: Ledger 0145 built the IdeaCAD subsystem in a Codex container with no Chromium and
  a Vite that would not stay up, and said so: screenshots, the 375 and 1440 measurements
  and a frame-time p95 could not be established. The data model and the arithmetic are
  proven by `tests/`; the ENTIRE VISUAL SURFACE has never been looked at. This bundle is
  the first look: audit what exists against `docs/prompts/0145-ideacad.md`, drive
  `/dev/ideacad` in real Chromium at 375 and 1440, report what is broken rather than
  assuming it works because tests pass, then fix and cover what it finds.
  **NO MIGRATION**, and no `supabase/` file: `0201` is applied and verified on production,
  and ledger 0161 is in flight carrying the hand-applied grant repair as `0202`. A grant
  problem found here is REPORTED to that lane, never fixed here.
