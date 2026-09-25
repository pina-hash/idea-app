---
title: The 2026-09-25 feedback round, and the feedback-round skill that makes the next one repeatable
date: 2026-09-25
branches: [claude/upbeat-pascal-p9krgk]
migrations: []
subsystems: [feedback, process, standards, deploy]
---

A router session took the feedback export of 2026-09-25 (35 reports, 8 screenshots,
exported from `abf070c`) and turned it into work. The session built nothing in `src/`.

**What landed.**
- `docs/feedback/2026-09-25/`: `TRIAGE.md` (nine read-only investigators, one per cluster,
  with file:line evidence), `QUEUE.md` (six sessions in order), `ROUND1_BRIEF.md` and
  `ROUND1_PROMPT.md` (ledger 0298, no migration, ships to `main` tier by tier), and
  `MARK_SEEN.sql`.
- Decisions 37 to 40, answered by Mr. Pina in one batch. Two of them reverse recorded
  rules: 38 reverses decision 29's "a class grant is always a viewer", and 39 reverses the
  Foundry ranked board sections.
- Shipping: Mr. Pina approved on 2026-09-25 that build sessions merge their own branch into
  `main` as each priority tier goes green, without waiting on the `integration` sweep.
- The repeatable procedure: `.claude/skills/feedback-round/` (`SKILL.md` and a parameterized
  `triage-workflow.js`), `tools/feedback_digest.py`, `tools/feedback_triage_md.py`,
  `docs/feedback/README.md`, and one CLAUDE.md bullet under Working conventions.

**What was measured.**
- The digest names 27 of 35 reports to the owner and none to anyone else, and finds 0
  student names in its output.
- The renderer wrote the real triage with 0 hits against 33 identities, and REFUSED a copy
  with one planted student first name, writing nothing (exit 1). That is the positive
  control.
- The scroll-lock root cause (R29) is a code reading with file:line, NOT a browser
  reproduction. Round 1's first P0 item reproduces it before fixing it.

**Found while setting up automatic migrations.**
- `migrate.yml` had never applied anything: `IDEA_MIGRATION_URL` was unset (run 61's log).
- The seed `supabase/data/0209-seed-migration-history.sql` was pasted and read `EQUAL`, with
  0211 recorded.
- The first dispatched run (62) went red with "password authentication failed for user
  postgres". The credential it used was `DEPLOY_PROBE_URL`, which the workflow prefers over
  the new secret. That secret has been stale since at least 2026-09-22 (the same error is
  recorded in `1ec2f64`'s merge message). Rotating it is Mr. Pina's step, in progress at the
  time of writing.

**Not verified.** No build ran and no browser pass ran. Whether the rotated secret works is
known only from the next Migrate run's log. The mark-seen SQL has not been pasted.
