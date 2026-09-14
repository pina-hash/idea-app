# 0237 IdeaCAD CAD-solid viewport render

- Issued: 2026-09-14
- By: router chat
- Owns: `src/lib/ideacad/viewport/**`,
  `docs/prompt-ledger/entries/0237-*`, and its own `docs/history/` entry.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `codex/ideacad-cad-render-0237`, branched from the supplied working tree.
- Notes: replaces the flat viewport treatment with a three-point, tone-mapped
  machined-stock render, keeps shaded-with-edges as the default, grounds the
  solid with a quiet grid and contact patch, and removes the unexplained spin
  arrow. No geometry generation changed.
