---
title: "Feedback round 2026-09-28 revised: all eighteen reports go out in one session and one push, with one shared migration (`claude/sleepy-cannon-iobdf9`, docs only)"
date: 2026-09-28
branches: [claude/sleepy-cannon-iobdf9]
migrations: ["0230"]
subsystems: ["IDEA Classroom", "Feedback", "Documentation"]
---

This revises `docs/history/sleepy-cannon-iobdf9-feedback-2026-09-28.md`. That file stays as it was written.

Mr. Pina read the round's four-session queue and answered: "I want all of these fixes pushed in one go. Just directly to main." So `docs/feedback/2026-09-28/QUEUE.md`, `ROUND1_BRIEF.md` and `ROUND1_PROMPT.md` now describe one session under ledger 0347. That session covers all eighteen reports, the grading redesign, team edits and the class-theme vote, and it pushes to `main` once when everything is green. Decisions 42 to 45 now point their Build lines at 0347.

**One migration, not two.** `migrate.yml` applies only the lowest unapplied migration, one file per push. Two new files in a single push would leave the second one unapplied while the deployed client already calls it. So the teams SQL (decision 44) and the class-theme SQL (decision 45) share one additive file, 0230. The client falls back when an RPC is missing (`PGRST202`) for the short window where the apply and the deploy race. The earlier reservations of 0231 and 0232 are withdrawn. The 2026-09-25 proposals, 0228 and 0229, stay outside this session.

**MARK_SEEN.** Mr. Pina says he applied the SQL. That is read as `MARK_SEEN.sql`, the only paste this round asked of him. The 2026-09-25 proposals are marked in their own README as not to be pasted.
