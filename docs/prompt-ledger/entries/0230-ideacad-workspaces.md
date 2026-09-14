# 0230 Versioned IdeaCAD workspace contract

- Issued: 2026-09-14
- By: router chat
- Owns: `src/lib/ideacad/workspaces.ts`,
  `src/lib/ideacad/blade/workspace.ts`, `tests/ideacad-workspaces.test.ts`,
  `docs/prompt-ledger/entries/0230-*`, its own `docs/history/` entry, and the
  default Blade attach-config selection in `src/lib/ideacad/transports.ts`.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `codex/ideacad-workspaces-0230`, branched from the supplied working tree.
- Notes: adds the first explicit workspace registry and a versioned Blade adapter.
  Unknown workspace ids and unsupported context versions refuse rather than
  selecting or rewriting Blade data.
