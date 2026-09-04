# 0022 Grading at scale: mass grading and grading across classes
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: `src/lib/classroom/GradingConsole.svelte`, `GradesPanel.svelte`, `grading-export.ts`, `grading-bulk.ts` (new), the grading paths in `transports.ts`, `src/routes/classroom/grading/**`, `supabase/migrations/0175_*.sql` (conditional), `src/routes/dev/grading-bulk/**`, `tests/classroom-grading-bulk*`, `tests/db/classroom-grading-bulk*`, `tools/browser-verify/routes/grading-bulk*.mjs`, the generated regions in `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0022-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, 0175, only if proven necessary. Highest on origin/main at issue: 0174
- Migration written: `supabase/migrations/0175_classroom_bulk_grading.sql`, committed straight to `main` with its db test (`c5eb148`). The grade write is one student per call and a client loop is thirty transactions, so a batch that dies halfway leaves the record of what landed in a tab that has gone away.
- Status: pushed
- Branch: `claude/grading-at-scale-9vwzbm`, started from `origin/integration` at `a7cd032`
- Notes: Two instructor reports, both about time rather than capability.
  Grading is per student per assignment, so a class of thirty on one
  assignment is thirty separate passes through the console, and an
  instructor teaching the same course to three sections grades the same
  assignment three times over from three different places.

  Prompt 0011 landed extra credit and post-grade change detection on this
  surface, and both are live. This bundle builds on that shape rather than
  around it: whatever a bulk action does, a graded submission that the
  student later edits must still raise 0011's signal.

  Deliberately excluded: any change to what a student sees; the rubric
  itself; and auto-grading of any kind, which is a different conversation and
  not one this bundle opens.
