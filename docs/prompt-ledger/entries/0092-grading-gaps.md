# 0092 Three things the grading surface cannot do
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `GradingConsole.svelte`, `GradesPanel.svelte`, `src/routes/classroom/[sectionId]/grades/**`, the grading modules, migration 0190 (conditional), `src/routes/dev/grading/**`, `tests/classroom-grading*`, `tests/db/classroom-grading*`, `tools/browser-verify/routes/grading*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0092-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, 0190, conditional. Claims: 0190. Highest on origin/main at issue: 0189
- Status: issued
- Branch: assigned by the harness
- Notes: Three instructor reports from the September feedback pull, all on
  the grading surface, all still open.
  
  ONE. "in the grading interface, a function add some points for extra credit
  would be helpful". `classroom_submissions.extra_credit` EXISTS -- migration
  0171 added the column -- so the question is whether anything reads or
  writes it, and if not, why the column landed without a surface.
  
  TWO. "the sorting on this page should be by date. currently its kinda
  random." Prompt 0069 declined this for want of knowing which page, and the
  answer was in the report all along: the feedback card records the path as
  `/classroom/[sectionId]/grades`. So it is the grades page, and prompt 0069
  measured it sorted by NAME. "By date" there means a different key, not a
  direction toggle.
  
  THREE. "i need to know if a student made any changes to their assignment
  after i had graded it. even if they resubmitted it or just made the changes
  and the teacher never knew." This is the sharpest of the three: a grade
  recorded against work that has since moved is a grade nobody can trust, and
  nothing on screen says so. Prompt 0056 established that a student CAN edit
  after a grade is released -- `returned` deliberately reopens the work -- so
  the state is reachable by design and simply invisible.
  
  Deliberately excluded: the bulk grading path, which prompt 0022 built; the
  submission lock, settled by 0056; and anything about what a grade means.
