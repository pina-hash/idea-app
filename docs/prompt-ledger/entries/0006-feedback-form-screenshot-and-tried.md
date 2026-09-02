# 0006 Feedback form: capture a screenshot and what the reporter tried
- Issued: 2026-09-02
- By: closeout chat for "Managing multiple FRC platform projects"
- Owns: `src/lib/feedback/**`, `src/lib/classroom/FeedbackConsole.svelte`, `src/routes/classroom/feedback/**`, `supabase/migrations/0170_*.sql`, `tests/feedback-*.test.ts`, `tests/db/feedback-*.test.ts`, and its own `docs/history/` entry.
- Migration permitted: yes, exactly one, 0170. Highest on origin/main at issue: 0169
- Status: issued
- Branch: pending
- Notes: Issued 2026-09-02 by the closeout chat for "Managing multiple FRC
  platform projects", in parallel with 0005 and to a different session. Its
  session writes no ledger entry of its own because this one does.

  The 2026-08-31 triage produced items that could not be specified because a
  reporter described a destination without describing where they were
  standing. The form already records the route and the build; this adds a
  screenshot and a "what did you try" field (`IDEA_instructions.md` 4.17,
  "The feedback form captures what the reporter saw and what they tried").
