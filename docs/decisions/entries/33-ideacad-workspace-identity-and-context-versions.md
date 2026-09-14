# 33 Can a document's workspace or context meaning change after work exists?

- Raised: 2026-09-14  By: ledger 0235
- Status: DECIDED 2026-09-14 by Mr. Pina. Context refusal exists in the client
  workspace contract; persisted document workspace identity and explicit
  cross-workspace copy do not exist in the current schema.
- Decision: A document's workspace is **IMMUTABLE once it has work**. Moving
  work between workspaces is an explicit **copy**, never an in-place change.
- Decision: Workspace contexts are **VERSIONED**. A workspace update must never
  lose existing work; an unknown or higher context version is refused loudly,
  never coerced.
- Context: `docs/IDEACAD.md`; `src/lib/ideacad/workspaces.ts`;
  `src/lib/ideacad/blade/workspace.ts`;
  `docs/history/ideacad-workspaces-0230.md`.

## Open questions

- What database fields persist a document's workspace id and context version?
- What exact event makes a document count as having work?
- What is copied during an explicit cross-workspace copy: concepts, history,
  prediction, sharing, archive state, assignment association, or some smaller set?
- Who may make that copy, and who owns the resulting document?
- How are supported older contexts migrated without mutating or losing the
  original work?
- What recovery or export is offered after an unknown or higher version is
  refused?

No storage shape, migration algorithm, or permission is decided here.
