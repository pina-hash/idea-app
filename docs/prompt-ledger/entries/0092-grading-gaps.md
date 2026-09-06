# 0092 Three things the grading surface cannot do
- Issued: 2026-09-06
- By: router chat for IDEA portal work
- Owns: `GradingConsole.svelte`, `GradesPanel.svelte`, `src/routes/classroom/[sectionId]/grades/**`, the grading modules, migration 0190 (conditional), `src/routes/dev/grading/**`, `tests/classroom-grading*`, `tests/db/classroom-grading*`, `tools/browser-verify/routes/grading*.mjs`, the generated regions of its README, `docs/prompt-ledger/entries/0092-*`, and its own `docs/history/` entry.
- Migration permitted: at most one, 0190, conditional. Claims: 0190. Highest on origin/main at issue: 0189
- Migration NOT taken: **0190 is unclaimed and stays free.** Phase A proved the schema needs nothing. Extra credit already has its column, its CHECK, its RPC parameter and its arity pair (0171); the post-grade comparison is answerable from `graded_at`, `submitted_at` and `classroom_responses.updated_at`, all 0086 columns, which 0171's own header records as measured before that file was written; and an ordering is a client-side comparator over rows the page already reads. Nothing in this bundle touches SQL.
- Status: pushed
- Branch: `claude/grading-surface-gaps-5r4w0j`, started from `origin/main` at `e06ed58`
- Built: item TWO only. Items ONE and THREE were ALREADY SHIPPED by `8dfc4e8` (2026-09-02), four days before this prompt was written, so the notes below are stale on both and the tree wins. What this bundle added for them is the ceiling boundary case extra credit's range never had.
- Left undone, and named: a student's own returned card shows `Returned: 21 / 18 pts` over a rubric summing to 18, with nothing saying where the extra three came from. `extra_credit` is already in that payload (the student engine calls the SAME `selectSubmissions` ladder), so it needs no migration and no new read -- one conditional line in `AssignmentEngine.svelte`, which this prompt does not own.
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
