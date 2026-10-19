---
id: 2026-10-18-migration-chain-repair
repo: pina-hash/idea-app
chat: Knowledge restructure and dispatcher
ledger: 0407
migration: 0273
model: opus-5.5
effort: high
size: M
owns: supabase/migrations/0273_*.sql, supabase/migrations/0285_*.sql, tools/apply-migration.mjs, tools/migration-*, tests/apply-migration*.test.ts, tests/db/migration-0177-tombstone.test.ts, tests/db/armory*.test.ts, tests/db/migrations-applied-record.test.ts, docs/migrations-applied/**, .github/workflows/migrate.yml, docs/prompt-ledger/entries/0271-*, docs/prompt-ledger/entries/0400-*, docs/prompt-ledger/entries/0404-*, the migration rules in CLAUDE.md, docs/standards/**migration*, docs/skills/idea-code-prompt/SKILL.md, docs/dispatch/queue/2026-10-18-coin-later-features.md, docs/dispatch/queue/2026-10-18-armory-part-numbers.md, docs/prompt-ledger/entries/0407-*, its own docs/history/ entry, db:idea-supabase
after:
needs_go: no
go: no
status: running
started_at: 2026-10-19T00:52:07Z
queued_at: 2026-10-18T17:50:00-07:00
---
Before doing anything else: `git fetch origin main`, check out `origin/main` on a working branch, and confirm the committer identity is `Claude <noreply@anthropic.com>` (set it if empty). Solo mode: rebase on `origin/main` and push `HEAD:main` once at the end, with the ledger entry in the same push.

Every statement below about the repo is a claim; check each one in the tree before relying on it.

You are building ledger 0407 in pina-hash/idea-app: get the migration chain applying again, and stop it from breaking the same way. Read CLAUDE.md first (migration rules, migrate.yml, how ledger entries claim migration numbers, the tombstone rule).

OWNS: supabase/migrations/0273_*.sql, supabase/migrations/0285_*.sql, tools/apply-migration.mjs, tools/migration-*, tests/apply-migration*.test.ts, tests/db/migration-0177-tombstone.test.ts, tests/db/armory*.test.ts, tests/db/migrations-applied-record.test.ts, docs/migrations-applied/**, .github/workflows/migrate.yml, docs/prompt-ledger/entries/0271-*, docs/prompt-ledger/entries/0400-*, docs/prompt-ledger/entries/0404-*, the migration rules in CLAUDE.md, docs/standards/**migration*, docs/skills/idea-code-prompt/SKILL.md, the NUMBERS lines of docs/dispatch/queue/2026-10-18-coin-later-features.md and docs/dispatch/queue/2026-10-18-armory-part-numbers.md, docs/prompt-ledger/entries/0407-*, its own docs/history/ entry. Nothing else.

NUMBERS: ledger 0407. Migration: the existing 0285 file, renamed to 0273. No new schema.

WHAT IS BROKEN (reported 2026-10-18 by the ledger 0404 session; verify each):
1. The Migrate run on dada89ed failed at 0271 because two ledger entries claim that number. Candidates: `docs/prompt-ledger/entries/0271-viewport-feature-edges.md` (a ledger number, possibly read as a migration claim) and `0400-website-connector-slice-1.md` (which claims 0270 to 0272). Production shows 0271 and 0272 unapplied.
2. `tests/db/migration-0177-tombstone.test.ts` requires contiguous migration numbers. On main the files run 0270, 0271, 0272, then 0285. 0273 was permitted to ledger 0401 and not used; 0274 to 0284 were reserved ahead of time for the coin market (queued, not started) and are not files.
3. `tests/db/migrations-applied-record.test.ts`: `docs/migrations-applied/` holds a record for 0270 and none for 0269 (reported by ledger 0401).

AUDIT FIRST and write the answers in your history entry: exactly which two claims collide on 0271 and how `parsePermitted` (or whatever reads claims) produces the collision; whether 0285 is applied in production (the failed run says it is not; confirm from the Migrate run log or the applied record, never by guessing); and what the 0269 record gap really is.

THE BUILD
- Resolve the 0271 double claim at its root, in the claim reader or in the entry text, so that a ledger entry's own number is never read as a migration claim. Test the reader on both shapes.
- Rename `supabase/migrations/0285_armory_release_choice.sql` to `0273_armory_release_choice.sql` only if the audit shows 0285 was never applied. If it was applied, stop and report instead. Update 0404's ledger entry and every test or doc that names 0285 for it.
- Fix the 0269 applied-record gap only if the audit shows what the true record is; never invent one.
- Replace reserved migration ranges with one rule, written into CLAUDE.md's migration rules and the idea-code-prompt skill (docs/skills/idea-code-prompt/SKILL.md): a session never reserves numbers ahead of time; it takes the next free number when it rebases to land, renames its file if someone landed first, and states the final number in its ledger entry. Prompts name "the next free migration number at landing", not a fixed number.
- Rewrite the NUMBERS lines of the two waiting queue entries (coin-later-features and armory-part-numbers) to that rule. Change nothing else in them.

CHECKS: the apply-migration tests, the tombstone test, the applied-record test, `tests/db/armory*.test.ts`, `npm run check` (with placeholder PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY exported before the sync), then one full `npm test`; read the summary line and stderr, never the exit code. Mutation proof on the claim reader's fix against its test, restored byte-identically (md5).

LANDING: rebase on origin/main, push HEAD:main once; migrate.yml applies on push. Never force-push. A content conflict is a stop.

REPORT: the pushed sha; the audit answers; whether the Migrate run on your push applied 0271, 0272 and 0273 (read its log if you can reach it; say so if you cannot); the full-suite summary line.

LEDGER ENTRY: docs/prompt-ledger/entries/0407-migration-chain-repair.md, in the shape of its neighbors. Title: The migration chain applies again: one claim per number, no reserved ranges. Mode solo. Owns copied from above. Migration permitted: renames 0285 to 0273 only.
