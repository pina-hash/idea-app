# 0187 Notebook spreadsheet: the scoped formula evaluator, engine only

- Issued: 2026-09-12T18:00:00Z
- By: router chat
- Owns: `src/lib/notebook/formula/**` (new), `tests/notebook-formula*`,
  `docs/decisions/entries/08-*`, `docs/prompt-ledger/entries/0187-*`, and its own
  `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0203
- Status: pushed
- Branch: claude/amazing-hopper-gw5yhs (cut from origin/integration b0a8101d)
- Notes: THE EVALUATOR ALONE, deliberately. Ledger 0180 measured the blocker
  against real PostgreSQL 17.10: `_notebook_note_content_ok` (`0125:206`) answers
  FALSE for `sheet`, `table` and `grid`, so a spreadsheet cannot be stored in a
  note without a migration, and 0180 also found undo is ProseMirror's history
  plugin, so a grid beside the editor would have no undo. The surface is blocked;
  the engine is not. Mr. Pina decided 2026-09-12 to build a scoped evaluator and
  add no dependency: HyperFormula is the only maintained complete engine and is
  GPL-3.0-only against a genuinely public repo with no LICENSE file; Formula.js is
  MIT and maintained but a function library with no parser and no dependency
  graph; the two MIT parsers were last published 2020 and 2017.

  Scope: cell references, ranges, arithmetic, parentheses, comparison operators,
  and SUM, AVERAGE, MIN, MAX, COUNT, ROUND, IF, ABS. A dependency graph with
  topological evaluation. Four refusals, each a test: a circular reference reports
  the cycle, an empty cell is zero in arithmetic, division by zero is a cell error,
  a malformed formula is a cell error carrying the position of the problem.

  LOOKUP FUNCTIONS ARE OUT OF SCOPE and that is the accepted cost; Mr. Pina was
  told VLOOKUP will not exist on day one and accepted it. The function table is
  designed so adding one later is registration rather than surgery.

  NO `.svelte` FILE, NO STORAGE, NO MIGRATION, NO DEPENDENCY -- `package.json` is
  not in this bundle's surface. Ledgers 0181 through 0186 run in parallel; none of
  their files are touched, and `CLAUDE.md` is deliberately not edited (see the
  history entry's baseline note).

  **OUTCOME.** Built as scoped, engine only. `src/lib/notebook/formula/` is eight
  pure modules, 1,509 lines (1,084 excluding blank and comment-only), against
  ledger 0180's 400 to 700 estimate; `docs/history/amazing-hopper-gw5yhs.md` says
  what cost more. Six test files, 119 tests. Full suite 416 files / 8,054 tests,
  0 failures, against a 410 / 7,935 baseline read off `origin/integration` at
  `b0a8101d`. `svelte-check` 0 errors / 37 warnings in 20 files (31/5/1),
  identical before and after; `CLAUDE.md` states 38 in 21 and is stale by one
  `state_referenced_locally`, reported but NOT corrected here because that file is
  outside this bundle's surface with six lanes in flight. Thirteen mutants plus a
  positive control; the first mutation run was vacuous (`--reporter basic` does
  not exist in vitest 4) and the zero counts caught it. No migration, no
  dependency, no `.svelte` file, no storage.
