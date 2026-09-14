# 0236 Mutable IdeaCAD feature-tree model operations

- Issued: 2026-09-14
- By: user prompt
- Owns: `src/lib/ideacad/blade/tree.ts`, `src/lib/ideacad/blade/validate.ts`,
  `src/lib/ideacad/blade/ops.ts`, `tests/ideacad-tree-ops.test.ts`,
  `docs/prompt-ledger/entries/0236-*`, and its own `docs/history/` entry.
- Migration permitted: no. **Claims: none.**
- Status: issued
- Branch: `codex/ledger-0236-tree-ops`, branched from the supplied working tree.
- Notes: Adds pure add, delete, reorder, duplicate, rename, and suppress operations
  with student-readable value refusals, dependency-order enforcement, and randomized
  operation-sequence validation. The UI and geometry evaluator are explicitly deferred.
