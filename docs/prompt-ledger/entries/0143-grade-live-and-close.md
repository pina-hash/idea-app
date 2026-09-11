# 0143 The grading console sees work as it lands, and a teacher can close an assignment

- Issued: 2026-09-11
- By: a session on the ported-HTML-assignment subsystem, three items, all three
  Mr. Pina's decisions of 2026-09-10 and none of them re-opened here. Downstream
  of ledger 0141, which it extends rather than replaces.
- Owns: the HTML regions of `GradingConsole.svelte` and the grade route,
  `src/lib/classroom/live.ts` (one new topic only),
  `src/lib/classroom/html-assignment/**` EXCEPT `Progress.svelte` and its
  module, `supabase/migrations/0198_*.sql`, `tests/html-assignment*` except
  `tests/html-assignment-progress*`, `tests/db/html-assignment*`,
  `tools/browser-verify/routes/html-assignment*.mjs`, the generated regions of
  `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0143-*` and its
  own `docs/history/` entry.
  **Outside that list, and each named here with the reason it was required:**
  `src/lib/classroom/AssignmentEngine.svelte` and one line of
  `src/lib/classroom/ItemDetail.svelte` (0198 makes existing sentences on both
  surfaces FALSE -- see the notes), `transports.ts` and `assignment-spec.ts`
  (the RPC needs a transport and a result type), one generalized assertion in
  `tests/classroom-live.test.ts` (a spelled-out list a third topic necessarily
  breaks, which CLAUDE.md says to generalize rather than delete), the
  `/dev/html-assignment-grading` harness (CLAUDE.md requires a dev harness for
  interactive UI), and the `classroom-updates.json` entry (the standing
  directive).
- Migration permitted: exactly one. Claims: 0198.
- Lands on: its own branch. **NOT merged to `main`**, because it carries a
  migration.
- Status: pushed
- Branch: `claude/serene-franklin-2zw56t`, branched from `origin/integration` at
  `ce871553`.
- Notes:

  **DUPLICATE CHECK, CLEAN, ALL THREE HALVES.** No
  `docs/prompt-ledger/entries/0143-*` exists on any ref: every
  `refs/remotes/origin` and `refs/heads` ref was swept with
  `git ls-tree -r --name-only <ref>` filtered to that path, and returned
  nothing, as did `git log --all --diff-filter=A` over it. No standing
  `claude/**` branch therefore carries a 0143 ledger commit. No ref carries
  `supabase/migrations/0198_*`, swept the same way; the highest migration on
  both `origin/main` and `origin/integration` is `0197`.
  **`origin/claude/serene-franklin-2zw56t` already existed and is not a
  duplicate**: it pointed at `ce871553`, the same commit as `origin/integration`
  and `origin/main`, carrying no commits of its own. It is the harness
  pre-creating this session's branch.

  **THE THREE OPENING CHECKS.** `git fetch --unshallow origin` exited 0 and
  `git rev-parse --is-shallow-repository` answered `false` (2054 commits on
  `origin/main`). `git fetch origin integration` succeeded. `git config
  user.name` is `Claude` and `user.email` is `noreply@anthropic.com`.

  **ITEM TWO WAS ALREADY TRUE AND IS NOW PINNED RATHER THAN CHANGED.** Measured
  against real Postgres through the real RPCs: `classroom_grade_submission`
  writes `returned` when released and `draft` otherwise, and NEVER `submitted`.
  The console already calls it with `p_return => true`. So no grading code
  changed. What changed is that 0198 introduces the first object in the schema
  that CAN write `submitted`, which is exactly the moment that invariant becomes
  able to regress silently -- so it is asserted in `tests/db/`, both directions,
  including that a student can still save after a returned grade.

  **ITEM THREE'S MEASUREMENT SAID NO PATH EXISTED, AND THE MIGRATION WAS
  WRITTEN.** A teacher calling `classroom_submit_assignment` is refused ("Only a
  student enrolled in this class can work on this assignment") because it
  resolves its subject through `_classroom_engine_student`, which is the caller;
  a direct UPDATE is refused (`permission denied for table
  classroom_submissions`). The catalog census is asserted in the test rather
  than asserted about, with a positive control on the predicate itself.

  **A HOLE IN THE DECIDED MECHANISM, FOUND BY MEASUREMENT AND CLOSED IN THE SAME
  FILE.** `classroom_unsubmit_assignment` refuses only a row that has already
  been graded, so a close placed on UNGRADED work -- which is most of what an
  end-of-unit close is for -- came straight back off: measured,
  `{"ok":true,"state":"draft"}`. The fix needed no new column: a student's own
  submit has always stamped `submitted_at`, so `state = 'submitted' AND
  submitted_at IS NULL` is an instructor's close and nothing else.
  **0198 therefore CREATES one object and RE-SIGNS one existing one**
  (`classroom_unsubmit_assignment`, 0086's body verbatim plus a single `if`).
  That is one more object touched than "ONE OBJECT" reads as permitting, and it
  is named here rather than buried: without it the feature does not work.
  The narrowing is inert over every stored row and the file COUNTS that at apply
  time rather than assuming it.

  **TWO FILES OUTSIDE THE OWNERSHIP LIST WERE EDITED BECAUSE 0198 MAKES THEIR
  EXISTING SENTENCES FALSE.** `AssignmentEngine.svelte` told a locked student to
  "Unsubmit to keep working" and offered the button; after 0198 a closed student
  never submitted and the RPC refuses them, so the sentence named a control
  whose only outcome would be a refusal. `ItemDetail.svelte` gained ONE
  expression (`lock={...}` on the frame mount) so the student is told at all.
  Both are minimal and neither is in the progress region ledger 0142 owns.

  **LEDGER 0142 HAD NOT LANDED WHEN THIS BUNDLE'S BROWSER PASS RAN.**
  `origin/integration` was still at `ce871553` and 0142's work was standing on
  `origin/claude/upbeat-feynman-pers14`. `origin/integration` was merged into
  this branch as instructed and was a no-op. **The two branches both touch
  `ItemDetail.svelte` and both regenerate the counts region of
  `tools/browser-verify/README.md`**, so whichever lands second regenerates that
  region; `derived-numbers` is what catches it.

  **NO TELEMETRY WAS BUILT.** No presence, no active time, no per-student
  status beyond the `state` column that has existed since 0086. The lock records
  who closed nothing and when nothing.

  **THE UNIT-WIDE LOCK IS NOT BUILT AND IS NOTED INSTEAD.** 0198 is PER ITEM.
  A unit-wide close needs its own answer for what a unit is, which
  `notebook_unit_items` and `classroom_items` spell differently.
