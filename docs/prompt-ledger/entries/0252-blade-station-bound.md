# 0252 Blade station bound and segment design

- Issued: 2026-09-14
- By: router chat
- Owns: `src/lib/ideacad/blade/tree.ts`, `src/lib/ideacad/blade/validate.ts`, `src/lib/ideacad/blade/ops.ts`, their tests, `docs/prompt-ledger/entries/0252-*`, and its own `docs/history/` entry.
- Migration permitted: no. **Claims: none.**
- Status: pushed
- Branch: `codex/ledger-0252-blade-station-bound`.
- Notes: Establishes the existing 3-to-8 station rule as one model constant and enforces it in model-layer station additions; does not rewrite existing geometry or add a segment schema.
