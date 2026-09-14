# 0250 IdeaCAD direct-manipulation profile editor

- Issued: 2026-09-14
- By: Mr. Pina
- Owns: `src/lib/ideacad/ui/ProfileEditor.svelte`,
  `src/lib/ideacad/ui/profile-drag.ts`, their tests,
  `src/lib/ideacad/ui/PropertyManager.svelte`,
  `docs/prompt-ledger/entries/0250-*`, and its own `docs/history/` entry.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `codex/ideacad-profile-editor-0250`, branched from the supplied working tree.
- Notes: Replaces the Body Revolve station spreadsheet with a large direct-manipulation
  sketch. Handles drag with live preview, segment clicks insert, Delete removes, Escape
  restores an active drag, and only the selected station exposes precise r/z fields.
