# 0006 Feedback form: capture a screenshot and what the reporter tried
- Issued: 2026-09-02
- By: closeout chat for "Managing multiple FRC platform projects"
- Owns: `src/lib/feedback/**`, `src/lib/classroom/FeedbackConsole.svelte`, `src/routes/classroom/feedback/**`, `supabase/migrations/0170_*.sql`, `tests/feedback-*.test.ts`, `tests/db/feedback-*.test.ts`, and its own `docs/history/` entry.
- Migration permitted: yes, exactly one, 0170. Highest on origin/main at issue: 0169
- Status: partly landed. Its MIGRATION is on `origin/main`; its client half is not
  on any ref this session can see.
- Branch: none on the remote. `git ls-remote --heads origin` at 2026-09-02 09:15 UTC
  lists only `main` and `integration`.
- Notes: Issued 2026-09-02 by the closeout chat for "Managing multiple FRC
  platform projects", in parallel with 0005 and to a different session. Its
  session writes no ledger entry of its own because this one does.

  The 2026-08-31 triage produced items that could not be specified because a
  reporter described a destination without describing where they were
  standing. The form already records the route and the build; this adds a
  screenshot and a "what did you try" field (`IDEA_instructions.md` 4.17,
  "The feedback form captures what the reporter saw and what they tried").

  **Confirmed against the tree on 2026-09-02, not from a report.** `main` moved from
  `e7ac4d5` to `a70c9ef` while 0005's session was running, and that commit is
  "Feedback reports can carry what you tried and a screenshot (0170)", carrying exactly
  two files: `supabase/migrations/0170_feedback_tried_and_screenshot.sql` and
  `tests/db/feedback-tried-screenshot.test.ts`. That is the migration going to `main`
  with the test that pins it, which is the rule for this repo, and it means 0170 is the
  number that was taken.

  What is NOT on `main` is the client half (`src/lib/feedback/**`,
  `FeedbackConsole.svelte`, the `/classroom/feedback` route, the `tests/feedback-*`
  files). No `claude/**` branch exists on the remote, so either that session had not
  pushed when this was read, or its branch was already swept into `integration` and
  deleted. This entry records what could be confirmed and does not guess between them;
  a later reader should check `integration` for the client commits before assuming the
  work is outstanding.

  **The migration being applied to production is a separate question and this entry
  cannot answer it.** Run `tools/idea-status.py` and paste its probe block.
