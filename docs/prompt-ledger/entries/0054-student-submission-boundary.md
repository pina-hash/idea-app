# 0054 The path a student's work takes has never faced a student
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `tests/db/classroom-submission-file*` (new), the PostgREST shim only if the audit proves it must change, at most one migration under a stated condition, `docs/prompt-ledger/entries/0054-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, conditional. Highest on origin/main at issue: 0180
- Status: pushed
- Branch: `claude/student-submission-boundary-4nke2j`
- Notes: `classroom_add_submission_file` was created in `0086` and the
  `submission-files` bucket in `0133`, private, 200 MiB, no mime list, with
  three storage policies. The instructor upload path is proven on production
  with a real `.SLDPRT`.

  THE STUDENT PATH IS NOT. As of 2026-08-30 the project's own record says the
  student route through `classroom_add_submission_file` and the owner policy
  on `submission-files` had never faced a real student JWT, and nothing since
  has changed that. There is no document naming the contract, the accepted
  types or the size ceiling.

  This is the highest-value untested boundary left in the repository. It is
  where a student's graded work lands. The failure modes are all quiet: a
  student uploads and it silently does not attach; a student can read another
  student's submission; a student can write into someone else's folder; a
  submission survives past the point the assignment closes.

  The `tests/db/` harness exists for exactly this. `postgrest-shim.ts` models
  PostgREST closely enough to drive a route load signed-in or anonymous, and
  prompt 0006 found it models `select` and `rpc` but NOT `insert`, so a test
  that needs an insert has to hand-roll a client. That limit is the first
  thing to establish rather than discover.

  Deliberately excluded: every file under `src/`, because this bundle
  measures a boundary rather than moving it; the instructor path, which is
  proven; and the Foundry and notebook buckets, which are other boundaries.
