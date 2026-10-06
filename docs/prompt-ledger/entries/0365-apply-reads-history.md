# apply-migration: the ordering rule reads the migration history table

- Issued: 2026-10-06
- By: IDEA & FRC chat, run as a Claude Code session on `claude/elegant-hawking-l61p15`, pushed straight to `main` (Mode: solo). Approved by Mr. Pina 2026-10-06.
- Owns: `tools/apply-migration.mjs` (the ordering-rule read only), the `verdicts` doc comment in `tools/deploy-probe.mjs`, `tests/apply-migration.test.ts`, one sentence of `CLAUDE.md`, this entry, `docs/history/elegant-hawking-l61p15.md`.
- Does not touch: `supabase/**`, `materials/**`, `.github/workflows/**`, any historical ledger entry.
- Migration permitted: NO
- Status: pushed
- Notes: Migrate run 37484392652 refused 0231 because eight migrations below it (0153, 0177, 0181, 0183, 0202, 0203, 0204, 0206) have no derivable probe, and the apply tool called `verdicts` without the history record, so they could never be anything but CANNOT SAY there. The apply tool now reads the record with deploy-probe's own `readHistory` and passes it. 0231 is applied by the Migrate run this push triggers, under ledger 0363's authority.
