# IDEA Armory lane B: the ideabosco.com side

- Issued: 2026-10-06
- By: IDEA & FRC chat, run as a Claude Code session on `claude/trusting-bardeen-buv6f8`, pushed to `main` (Mode: solo)
- Owns: `src/routes/armory/**`, `src/routes/api/armory/**`, `src/routes/dev/armory/**`, `src/lib/armory/**`, `src/lib/server/armory/**`, `src/lib/server/rate-limit.ts`, `docs/armory/**` (the proposed migration, the screenshots, the report), `tests/armory-*.test.ts`, `tests/db/armory-proposed*.ts`, `tools/browser-verify/routes/armory.mjs`, `tools/browser-verify/_armory-shots.mjs`, `docs/decisions/entries/46-armory-migration-number-and-approval.md`, `docs/history/trusting-bardeen-buv6f8.md`, the "Where it runs now" section of `docs/ARMORY.md`; one line each in `src/lib/shell/site-plate.ts`, `tests/theme-tokens.test.ts`, `.env.example` and `CLAUDE.md`'s environment and access sections.
- Does not touch: `supabase/**`, `materials/**`, `.github/**`, the home-page launcher, any shared navigation file.
- Migration permitted: NO. The schema is `docs/armory/proposed/NNNN_armory.sql`; `git diff --name-only origin/main...HEAD -- supabase/` printed nothing before the push.
- Status: pushed
- Notes: Read-only on pina-hash/idea-armory at `b18791d`. The slug, not a number, so it cannot collide with a number a parallel chat holds. Decision 46 was free on `origin/main` at `d9cfaa2`.
