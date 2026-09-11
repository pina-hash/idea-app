# 0141 The grading console can see a ported student's work, and a worksheet stops losing keystrokes

- Issued: 2026-09-11
- By: a session on the ported-HTML-assignment subsystem, four items and one
  sentence, all downstream of ledger 0140 landing that subsystem on `main`.
  The first item is why the bundle exists: `0140` made schema-3 assignments
  reachable and Mr. Pina immediately could not grade one.
- Owns: `src/lib/classroom/html-assignment/**`, the schema-3 branch of
  `ItemDetail.svelte`, the HTML regions of
  `src/routes/classroom/[sectionId]/item/[itemId]/**` including `grade/**`,
  the HTML branch of `GradingConsole.svelte`,
  `tools/validate-assignment-spec.py` (the runtime-mint check, plus the
  mirrored handshake refusal the prompt granted), `tests/html-assignment*`,
  `tests/dom/html-assignment*`, `tests/db/html-assignment*`,
  `tools/browser-verify/routes/html-assignment*.mjs`,
  `docs/prompt-ledger/entries/0141-*` and its own `docs/history/` entry.
  Also, outside that list and named here because each is required by a rule the
  repository states about itself: the `/dev/html-assignment-grading` harness
  (CLAUDE.md requires a dev harness for interactive UI), the
  `classroom-updates.json` entry (the standing directive), and one corrected
  measurement in `CLAUDE.md` (that file's own "a session that measures a
  different number CORRECTS THIS LINE" rule).
- Migration permitted: NONE, and none was written. `supabase/migrations/`
  is byte-identical to `origin/integration`. There is no `0198`.
- Claims: none.
- Lands on: `main`, after reporting the six-gate checklist.
- Status: pushed
- Branch: `claude/peaceful-albattani-f29kp1`, branched from `origin/integration`
  at `89b8154a`.
- Notes:

  **DUPLICATE CHECK, CLEAN, ALL THREE HALVES.** No
  `docs/prompt-ledger/entries/0141-*` existed on any ref: every
  `refs/remotes/origin` and `refs/heads` ref was swept with
  `git ls-tree -r --name-only <ref>` filtered to that path, and returned
  nothing. No standing `claude/**` branch therefore carried a 0141 ledger
  commit. `supabase/migrations/0198_*` likewise exists on no ref, swept the
  same way.

  **THE THREE OPENING CHECKS.** `git fetch --unshallow origin` exited 0 and
  `git rev-parse --is-shallow-repository` answered `false` (2047 commits on
  `origin/main`). `git fetch origin integration` succeeded. `git config
  user.name` is `Claude` and `user.email` is `noreply@anthropic.com`.

  **THE TEST DOCUMENT WAS NOT IN THE SESSION AND I STOPPED AND ASKED**, as the
  prompt required, rather than reconstructing it. Mr. Pina attached
  `IDEA100_D17_HXSmokeTest.html`; it is at `tests/fixtures/hx-smoke-test.html`
  byte for byte (md5 `dd10e811155c682af9aa0a9c51d76730`, `cmp` clean). It
  passes both validators before item THREE and after it.

  **NO TURN-IN BUTTON WAS BUILT, AND 0086 CONFIRMS NONE IS NEEDED.** Its own
  header, read rather than assumed: responses are "DELIBERATELY independent of
  the submissions table so autosave never has to create a submission row
  first", and the submission row "is created lazily by the first file attach,
  the first grade, or the submit itself". Grading creates what it needs.
  `classroom_submit_assignment` is untouched.

  **ITEM FOUR'S PREMISE IS HALF RIGHT AND THE OTHER HALF MATTERS.** The regex
  did match `querySelector(\`[data-field="${f}"]\`)`, a lookup, and that is
  fixed. But the ported Blade fixture ALSO carries four genuine mints
  (`data-field="mfg-${n}-p"`, literally the `addMfgRow` case the check's own
  comment names), so it is still refused by the python tool -- correctly, and
  both before and after this bundle. Fixing the regex does not change that
  file's verdict, and this is written down so nobody reads the fix as having
  made it pass.

  **`_TEMPLATE.html` IS NOW REFUSED BY BOTH VALIDATORS AND IS NOT FIXED HERE.**
  It is ledger 0137's file. Measured before: 0 errors, 0 warnings, manifest
  PARSED. Measured after: refused for never sending `idea:ready`, plus the
  `localStorage` warning. **Fixing it is a separate bundle** -- it needs bridge
  code written into it, which is an edit to the authoring template a teacher
  copies, not something to fold in here.

  **THE UNPUBLISHED-ITEM SENTENCE WAS BUILT, NOT ONLY SAID.** The prompt asked
  for one sentence where the frame would be; it is `HTML_ASSIGNMENT_NOT_LIVE`,
  rendered by both the grade page and `ItemDetail`'s schema-3 branch, keyed on
  `htmlAssignmentServed` -- the same condition
  `$lib/server/html-assignment-document.ts` uses. **The serving gate is not
  loosened**: the frame is simply not mounted where it is known it would 404.

  **A REAL FINDING IN CLAUDE.md, CORRECTED IN PLACE AS THAT FILE REQUIRES.** A
  checkout with no `.env` reports **14** phantom errors across **11** files,
  not the 13 across 10 recorded there. The eleventh file is
  `src/lib/server/html-assignment-document.ts`, which 0195 added after the
  figure was last measured.
