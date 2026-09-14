# 0242 IdeaCAD chooser entry gate

- Issued: 2026-09-14
- By: router chat
- Owns: `src/routes/ideacad/**`, `src/lib/ideacad/app/**`,
  `docs/prompt-ledger/entries/0242-*`, and its own `docs/history/` entry.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `codex/ideacad-chooser-entry-0242`, branched from the supplied working tree.
- Notes: replaces the chooser's presentation-only initial flag with an explicit,
  per-mount document-choice gate; also makes the active document chrome a title and
  gives the zero-document state a primary `New document` action.
