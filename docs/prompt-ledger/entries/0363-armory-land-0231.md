# IDEA Armory: land the schema as migration 0231

- Issued: 2026-10-06
- By: IDEA & FRC chat, run as a Claude Code session, pushed straight to `main` (Mode: solo)
- Owns: `supabase/migrations/0231_armory.sql` (moved from `docs/armory/proposed/NNNN_armory.sql`, header number only changed), `tests/db/armory-proposed.ts`, `tests/db/armory-proposed.test.ts`, `tests/short-link-redirect.test.ts`, `tests/short-link-reserved-names.test.ts`, `src/lib/short-links.ts` (comment), the "Where it runs now" section of `docs/ARMORY.md`, `docs/decisions/entries/46-armory-migration-number-and-approval.md`, this entry.
- Does not touch: `materials/**`, `.github/**`, any other migration.
- Migration permitted: yes, exactly one. Claims: 0231.
- Status: pushed
- Notes: Filed as 0363 (the next free ledger number) because migrate.yml only reads `NNNN-*.md` entries and uses that prefix as the bundle id. Approved by Mr. Pina 2026-10-06 (decision 46). `node tools/migration-claims.mjs` printed next free 0231 at `a495b1c`. migrate.yml applies it on the push. Undo before any client depends on it: drop the `armory_*` objects by hand and restore 0215's `_app_short_link_reserved`.
