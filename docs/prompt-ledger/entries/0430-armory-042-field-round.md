# 0430 Armory 0.4.2: the field round of 2026-10-22

- Issued: 2026-10-22
- By: Mr. Pina, through the IDEA & FRC chat (docs/feedback/2026-10-22-armory/QUEUE.md)
- Owns: everything in pina-hash/idea-armory. In idea-app: `src/lib/armory/**`, `src/lib/server/armory/**`, `src/routes/armory/**`, `src/routes/api/armory/**`, `src/routes/dev/armory*/**`, `src/lib/feedback/armory-reports.ts` and the two Armory consoles, `tools/browser-verify/routes/armory*.mjs`, `tests/armory*.test.ts`, `tests/db/armory*.test.ts`, at most one `supabase/migrations/NNNN_*.sql` (NNNN = the next free number when you land; take it again after the rebase that lands, rename if someone landed first, state the final number on the ledger entry's Claims line; never reserve one), the connector schema regeneration if a migration requires it, `docs/ARMORY.md`, `docs/feedback/2026-10-22-armory/**` (only to add a RESULTS.md), `docs/prompt-ledger/entries/0430-*`, and your own `docs/history/0430-*` entry. Nothing else.
- Migration permitted: at most one, the next free number at landing, only if proven necessary. Claims: none (no server change was needed).
- Status: pushed (deployed only once v0.4.2 is published and the site is live)
- Mode: solo
- Branch: main (solo)
- Notes: idea-armory main 0f8d0dcf52946ee1590790e34e57bb0533066160 (1314758, da88913, 8b6b2d6, bcb3467, 0f8d0dc on 83ea2fa; version 0.4.2, not published). idea-app main a5860e2d (code) and the record commit after it, pushed together. Windows tests ran through CI-only draft pull request idea-armory #7, closed, never merged (its branch claude/ci-0430-armory-042 is left standing). The record is docs/history/0430-armory-042-field-round.md and docs/feedback/2026-10-22-armory/RESULTS.md.
