# 0239 IdeaCAD viewport black-frame regression

- Issued: 2026-09-14
- By: router chat
- Owns: `src/lib/ideacad/viewport/**`,
  `docs/prompt-ledger/entries/0239-*`, and its own `docs/history/` entry.
- Migration permitted: no. **Claims: none.**
- Status: issued
- Branch: `codex/ideacad-viewport-black-regression-0239`, branched from the supplied working tree.
- Notes: restores an environment-independent minimum response to the machined-stock
  materials and adds a real framebuffer readback assertion so draw calls over a
  clear-colour-only canvas cannot pass again.
