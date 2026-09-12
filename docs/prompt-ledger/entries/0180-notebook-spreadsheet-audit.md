# 0180 Notebook spreadsheet: audit and recommendation for decision 08

- Issued: 2026-09-12T15:30:00Z
- By: router chat
- Owns: `src/lib/notebook/**` spreadsheet surfaces, `tests/dom/notebook-sheet*`,
  `tools/browser-verify/routes/notebook*.mjs` and its measured store entries,
  `docs/decisions/entries/08-*`, `docs/prompt-ledger/entries/0180-*`, and its own
  `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0203
- Status: issued
- Branch: claude/kind-mayer-c2sn88 (cut from origin/integration 6a71eff4)
- Notes: AUDIT AND RECOMMENDATION, not a build. Mr. Pina decided 08 on 2026-09-12:
  a real spreadsheet inside a note, with a working formula engine, explicitly not
  a Google-Docs-shaped table. The formula engine is a dependency decision reserved
  to Mr. Pina; this bundle names candidates and adds none. The non-formula half is
  built only if the audit shows a grid stores and renders with no new dependency
  and no migration. Ledgers 0175/0177 own Foundry and 0178/0179 own IdeaCAD; none
  of their files are touched.
