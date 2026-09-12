# 0171 IdeaCAD: the FeatureManager, the PropertyManager, concept cards and undo

- Issued: 2026-09-12T13:50Z
- By: router chat (IdeaCAD lane, after 0167's viewport landed)
- Owns: `src/lib/ideacad/BladeEditor.svelte`, new components under `src/lib/ideacad/ui/**`,
  the IdeaCAD region of `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte` AND
  NOTHING ELSE IN THAT FILE, `src/routes/dev/ideacad/**`, `tests/dom/ideacad-ui*`,
  `tools/browser-verify/routes/ideacad*.mjs`, `docs/prompt-ledger/entries/0171-*`, and its
  own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0203
- Status: issued
- Branch: `claude/pensive-turing-inj1ih`
- Notes: `src/lib/ideacad/transports.ts` and a new `src/lib/ideacad/store.ts` belong to
  ledger 0170, running in Codex, and are NOT written here. `store.ts` was absent from
  `origin/integration` at branch time, so this lane builds against the transports' own
  shapes and hands no store down.

  DUPLICATE CHECK, THREE WAYS, ALL CLEAR. (1) `git log --oneline
  origin/main..origin/integration` at branch time: EMPTY -- `integration` and `main` are
  the same commit, `3728698`, so nothing is in flight between them. (2)
  `tools/idea-status.py` read the ledger across `origin/main`, `origin/integration` and
  every `claude/**` and `codex/**` branch: 149 entries in flight, **no 0169, no 0170 and
  no 0171 anywhere**, highest seen 0168; a live GitHub contents listing of
  `docs/prompt-ledger/entries?ref=main` returned 0168 as the highest and no 0171. (3) A
  sweep of EVERY remote ref for `src/lib/ideacad/ui/`, `src/lib/ideacad/store.ts` or any
  `docs/prompt-ledger/entries/017*` file: none exists on any branch, so neither this lane
  nor 0170 had written a byte when this branch was cut. `node tools/migration-claims.mjs`
  reports highest landed 0203, next free 0204, and this entry claims none.
