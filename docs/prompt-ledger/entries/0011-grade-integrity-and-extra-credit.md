# 0011 Grading: post-grade change detection, extra credit, and rubric import on creation
- Issued: 2026-09-02
- By: router chat for IDEA portal work
- Owns: `src/lib/classroom/GradingConsole.svelte`, `GradesPanel.svelte`, `SpecImporter.svelte`, `RubricBuilder.svelte`, `grading-export.ts`, the grading reads in `transports.ts`, the grading page loads, `supabase/migrations/0171_*.sql` (conditional), `tests/classroom-grading-*`, `tests/db/classroom-grading-*`, `tools/browser-verify/routes/grading-*.mjs`, the generated counts block in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0011-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, 0171, only if proven necessary. Highest on origin/main at issue: 0170
- Status: pushed
- Branch: claude/grading-change-tracking-extra-credit-gkh9dx
- Notes: Three instructor reports, all on the grading surface.

  The one that matters: an instructor has no way to know whether a student
  changed an assignment AFTER it was graded, whether by resubmitting or by an
  autosave landing on top of a graded submission. That is a grade-integrity
  problem, not a convenience one, and it is silent today.

  Second: no way to award points beyond the rubric total, so extra credit
  cannot be recorded at all.

  Third: creating a new assignment cannot import the rubric spec out of the
  assignment spec, so the rubric is retyped.

  Deliberately excluded: mass grading and cross-class grading, which are
  their own bundle; anything under `src/lib/notebook/**`; and any change to
  what a student can see, which stays exactly as it is.
