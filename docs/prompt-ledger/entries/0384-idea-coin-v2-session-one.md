# 0384 IDEA Coin V2, session one

- Issued: 2026-10-14
- By: Mr. Pina, via the router chat ("IDEA Coin V2, session one"; Mode: solo; Mr. Pina asleep while it runs).
- Repo: `pina-hash/idea-app`
- Branch: `claude/loving-dijkstra-lfhjie`, rebased onto `origin/main` and pushed straight to `main` (solo mode).
- Owns: the IDEA Coin V2 surfaces in the prompt's section 3 (one digital balance, fractional coins, debt rules, the student action seam, `/coin-desk/settings`, rosters from IDEA Classroom, the fine screen at `/coin-desk/fine` and in the Live tab, no shop today, the hall pass warning and fine, direct score entry and the Perfect Score toggle in grading, autopay, the student coin page at `/coin-balance`, the public Ledger including the frozen `src/lib/legacy/coins/index.html` (authorized by this prompt), tournaments no longer minting, the Coin Desk debt list, cash purchases and payouts), `src/routes/api/coin/autopay/+server.ts`, `.github/workflows/autopay.yml`, the `crons` key of `vercel.json`, `docs/coin-economy/IDEA_COIN_V2.md`, `docs/decisions/entries/67-hall-pass-warns-at-10-and-fines-at-20.md`, its `docs/history/` entry, the coin and hall pass rules of `CLAUDE.md` (in place), `classroom-updates.json`, this entry, and migrations 0239 through 0243.
- Does not touch: `materials/**`, any migration below 0239.
- Migration permitted: yes. Claims: 0239, 0240, 0241, 0242, 0243.
- Decision allocated: 67 (written as answered).
- Status: pushed
- Notes: ISSUED AS 0383 AND RENUMBERED 0384. The router allocated 0383 to this bundle while another session pushed `0383-frc-announcements-tool.md` to `main` about twenty minutes before this push; `tools/apply-migration.mjs` refuses when two entries share a number, so the first Migrate run (181) refused 0239 with nothing sent and nothing applied. This entry moved to the next free number; the FRC entry is untouched. Five migrations, each additive over the tree and applied in order by `migrate.yml`. Every client surface that reads a new function degrades on PGRST202 or 42883 until its migration is applied. Numbers 0244 through 0248 were allocated and not used, and stay free.
