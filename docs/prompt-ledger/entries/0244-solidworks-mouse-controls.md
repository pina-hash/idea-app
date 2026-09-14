# 0244 SolidWorks mouse controls

- Issued: 2026-09-14
- By: owner
- Owns: `src/lib/ideacad/viewport/controls.ts`,
  `src/lib/ideacad/viewport/camera-rig.ts`, their tests,
  `docs/prompt-ledger/entries/0244-*`, and its own `docs/history/` entry.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `codex/solidworks-mouse-controls-0244`, branched from the supplied working tree.
- Notes: pins the documented SolidWorks default mouse map, constrains ordinary
  orbit against roll and pole flips, clamps zoom, and keeps viewport wheel and
  context-menu events inside the viewport. No migration.
