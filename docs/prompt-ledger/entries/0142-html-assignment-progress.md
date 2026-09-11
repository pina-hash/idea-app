# 0142 A progress bar above every ported HTML assignment, weighted by points

- Issued: 2026-09-11
- By: a session on the ported-HTML-assignment subsystem, one visible feature,
  downstream of ledger 0141 and running in parallel with ledger 0143. Mr.
  Pina's brief, in his words: a progress bar at the top of every HTML
  assignment showing the student how far along they are, WEIGHTED BY POINTS
  rather than by count, color-coded red to green as it fills, with a
  percentage, gamified enough that finishing feels like something.
- Owns: `src/lib/classroom/html-assignment/Progress.svelte` and its module
  `src/lib/classroom/html-assignment/progress.ts` AND NOTHING ELSE IN THAT
  DIRECTORY, the progress region of the schema-3 branch of
  `src/lib/classroom/ItemDetail.svelte`, `src/routes/dev/html-progress/**`,
  `tests/html-assignment-progress*`,
  `tools/browser-verify/routes/html-progress*.mjs`, the generated regions of
  `tools/browser-verify/README.md`, `docs/prompt-ledger/entries/0142-*` and
  its own `docs/history/` entry. Also, because a rule the repository states
  about itself requires it: the `classroom-updates.json` entry (the standing
  directive), since a student will see this.
- Migration permitted: NONE. `0193` through `0197` are applied.
- Claims: none.
- Lands on: `main`, after reporting the six-gate checklist.
- Status: pushed
- Branch: `claude/upbeat-feynman-pers14`, branched from `origin/integration`
  at `ce871553`.
- Notes:

  **LEDGER 0143 RUNS IN PARALLEL** and owns the rest of
  `src/lib/classroom/html-assignment/**`, the grading console, `live.ts` and
  migration 0198. This bundle reads those files and writes none of them.

  **DUPLICATE CHECK, CLEAN.** No `docs/prompt-ledger/entries/0142-*` existed
  on any ref: every `refs/remotes/origin` ref was swept with
  `git ls-tree -r --name-only <ref>` filtered to that path and returned
  nothing, and `git log --all --grep=0142` returned nothing, so no standing
  `claude/**` branch carried a 0142 ledger commit.

  **THE THREE OPENING CHECKS.** `git fetch --unshallow origin` was a no-op
  because `git rev-parse --is-shallow-repository` already answered `false`.
  `git fetch origin integration` succeeded, with `origin/integration` and
  `origin/main` both at `ce871553`. `git config user.name` is `Claude` and
  `user.email` is `noreply@anthropic.com`.

  **WHAT WAS CHOSEN AND WHAT WAS REJECTED**, since the visual call was the
  work. Chosen: a large percentage in the mono face with a stage word and a
  filling-circle glyph; one track split into MODULE SEGMENTS whose widths are
  the modules' point shares, so the weighting is visible and not merely
  applied; a chip per module counting ANSWERS left, never points; a line
  naming the next module and what it wants; and at every value the sentence
  "This measures how much you have filled in, not how well. Grades come from
  your teacher." The fill is one `color-mix()` between two register tokens,
  `--crimson` to `--amber` below fifty and `--amber` to `--green` above, so
  the colour on screen is always on the line between two tokens. Rejected:
  any point value on screen (a grade to a student however labelled), confetti
  at 100% (celebrates a mark, cannot be made silent under reduced motion),
  streaks and levels (no storage, a second gamification), a ring (cannot be
  segmented, cramped at 375), a single bar (hides the weighting), per-block
  dots (400 blocks), a disclosure of unmet blocks (a second worksheet above
  the first). `docs/history/upbeat-feynman-pers14.md` carries the reasoning.

  **THE NUMBER.** `hxProgress` in `progress.ts`: points spread evenly over a
  module's blocks; the header judged and never counted; a block met when it
  has a stored response (a file for an image, any boolean for a checkbox, a
  table with a non-empty cell) AND is not in `hxIncompleteBlocks`, which is
  the Submit gate's own sentence count called rather than copied, its first
  caller outside its own file. Clamped to 1..99 while partial. Basis falls to
  count only when every module is worth zero, and says so.

  **MEASURED.** `svelte-check` 0 errors / 37 warnings at 31/5/1 after every
  edit. 28 unit tests; four permissive mutants redden 10, 1, 2 and 1 of them
  (count weighting, floor ignored, image judged by value, clamp removed),
  restored from a copy and md5-identical. Browser: `/dev/html-progress`
  measured 114 at 375 and 114 at 1440, 0 outside threshold; bar 14px tall,
  segments 530/108/424 at 1440 and 142/30/114 at 375 (ratios 5 and 4); fill
  vs track 4.96 / 5.27 / 5.70 / 7.05 / 7.44 from painted pixels; oklab `a`
  strictly falling from positive to negative; eleven word rows at or above
  4.5:1; three controls at 44px; the interactive card driven 0 to 100 in six
  presses; the real `ItemDetail` mount driven 0 to 50 to 100 by two synthetic
  messages through the real gate, controller and store, with a save recorded
  under each block id. `--break tiny-taps`, `overflow` and `low-contrast`
  each reddened their rows here; `blank-text` and `motion` name selectors
  this page lacks. Looking found what the checks did not: a chip ellipsised
  its count at 375 on the first render; it wraps now and a row pins 0 clipped.

  **NOT VERIFIED.** No production database, no signed-in session, no real
  ported document from a real class; the harness's real `ItemDetail` mount
  over `/hx/worksheet` is the closest this container reaches.
