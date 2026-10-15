# 0386 IDEA Coin V2, session two (finish the system)

- Issued: 2026-10-15
- By: Mr. Pina, via the router chat ("Ledger 0385: IDEA Coin V2, session two (finish the system)"; Mode: solo; Mr. Pina not watching).
- Repo: `pina-hash/idea-app`
- Branch: `claude/gracious-volta-7sakek`, rebased onto `origin/main` and pushed straight to `main` (solo mode).
- Owns: the IDEA Coin V2 session two surfaces (coin staff scope, the queue, split payment, payday, roles as evidence jobs, desktop backgrounds, donations, contracts through the queue, the tournament transfer screen, reported physical balances and the Student Auditor, fine disputes, deep debt relief, the weekly digest and its push, telemetry and exports, editing a past number, spools, the Ledger fixes in the frozen `src/lib/legacy/coins/index.html` (authorized by item 2.17), and removing the old coin system); `src/lib/coin-desk/**`, `src/lib/coin-balance/**`, `src/routes/coin-desk/**`, `src/routes/coin-balance/**`, `src/routes/api/coin/digest-push/+server.ts`, the coin harnesses and specs, the tournament rewards settlement note, the class People role badges, the `coin-uploads` upload-limits row, `docs/coin-economy/IDEA_COIN_V2.md`, `docs/decisions/entries/68-coin-staff-have-two-tiers.md`, its `docs/history/` entry, the coin rules of `CLAUDE.md` (in place), `classroom-updates.json`, this entry, and migrations 0244 through 0251.
- Does not touch: `materials/**`, any migration below 0244, the certification portal's files.
- Migration permitted: yes. Claims: 0244, 0245, 0246, 0247, 0248, 0249, 0250, 0251.
- Decision allocated: 68 (written as answered).
- Status: pushed
- Notes: ISSUED AS 0385 AND RENUMBERED 0386. `0385-armory-closeout-open-items.md` was already on `main`; this entry took the next free number, 0386 (0390 and 0391 belong to the certification portal). Eight migrations, each applied alone and in order by `migrate.yml`; every client surface that reads a new function degrades on PGRST202 or 42883 until its migration is applied. Numbers 0252 through 0255 were permitted and not used, and stay free.
