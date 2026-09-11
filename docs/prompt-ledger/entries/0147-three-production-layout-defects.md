# 0147 Three production layout defects: a chip over every student's name, a dead column down the class page, a clipped link popover

- Issued: 2026-09-11
- By: a defect-fixing session carrying three reports from production, all of
  which shipped past every check this repository has.
- Owns: `src/lib/classroom/ClassView.svelte`,
  `src/lib/classroom/RichTextEditor.svelte`,
  `src/lib/notebook/SectionGrid.svelte`, the CSS those three use,
  `src/routes/dev/classroom-stream/**` (new),
  `tools/browser-verify/routes/classroom-stream-manage-1.mjs` (new),
  `tools/browser-verify/routes/notebook-review.mjs`,
  `tools/browser-verify/routes/item-images.mjs` and the generated regions of
  `tools/browser-verify/README.md`, `classroom-updates.json`, `CLAUDE.md`,
  `docs/prompt-ledger/entries/0147-*` and its own `docs/history/` entry. ONE
  file outside that list was touched and is named below.
- Migration permitted: NONE, and none was written.
- Claims: none.
- Lands on: `main`.
- Status: pushed
- Branch: `claude/charming-bell-msr4rl`, branched from `origin/integration` at
  `7be051f6`.
- Notes:

  **DUPLICATE CHECK, CLEAN, BOTH HALVES.** No `docs/prompt-ledger/entries/0147-*`
  existed on any ref: every `refs/remotes/origin/*` and `refs/heads/*` was swept
  individually with `git ls-tree -r --name-only <ref> -- docs/prompt-ledger/entries/`
  filtered to `/0147-`, and the sweep returned nothing on any of them.
  `git log --all --oneline --grep=0147` returned two commits, `7d848d7` and
  `74be202`; both were read and both mention MIGRATION 0147
  (`gauntlet_macro_submit`'s live definition), not a ledger. So no branch under
  `claude/` or `codex/` carries a 0147 ledger commit and nothing else.

  **THE THREE OPENING CHECKS, REPORTED AS ASKED.** `git fetch --unshallow origin`
  exited 0 and left no `.git/shallow`; 2074 commits are reachable from `HEAD`.
  `git fetch origin integration` reported
  `* branch integration -> FETCH_HEAD`. `git config user.name` -> `Claude`,
  `user.email` -> `noreply@anthropic.com`. `origin/main` and
  `origin/integration` were identical at `7be051f6` at branch time (0 commits
  ahead either way).

  **THE FIRST FETCH REPORTED `origin/main` AS A FORCED UPDATE**
  (`+ 336e82f...7be051f main -> origin/main`), which is the remote-tracking ref
  being repointed in a clone that arrived shallow, not a force-push on `main` --
  the same thing ledger 0146 recorded and for the same reason.

  **ALL THREE DEFECTS WERE REPRODUCED AND MEASURED BEFORE ANYTHING WAS EDITED,
  and the numbers are in the history entry.** Headline figures: 28.3% of
  "Newcomer, Dana" under a status chip with 3 of 13 hit-test points across the
  name landing on a `button.cell`; 713.3px of dead left column at Mr. Pina's own
  1196x1304, its full 529px width; and the link popover 104.2px past its
  editor's right edge at 520px and 26.2px past it at 700px, inside an
  `overflow: hidden`. Each was rasterised and LOOKED AT, before and after.

  **THE CLASS-PAGE DEFECT NEEDED A NEW FIXTURE, AND THAT IS ITSELF THE FINDING.**
  `/dev/classroom-split`'s three units are of comparable height, which is the
  shape the grid always handled -- driven at 1196x1304 it lays out cleanly and
  reproduces nothing. A real class is one unit with a term of posts beside one
  with three, and that difference IS the defect. `/dev/classroom-stream` mounts
  the identical `ClassView` inside the identical `ClassSplit` and differs only in
  the data.

  **ONE FILE OUTSIDE THE OWNED LIST WAS TOUCHED, AND IT IS A COMMENT.**
  `src/lib/shell/anchored.ts`'s header said RichTextEditor's popover "is
  deliberately NOT converted in this pass". This bundle converts it, so that
  sentence became false the moment the change landed. The correction is to that
  paragraph only -- no code in the module was changed -- and the file is owned by
  no parallel ledger (0148/0149/0150 own `src/lib/foundry/**`,
  `ContentComposer.svelte` and `src/lib/legacy/**`, none of which this bundle
  touched).

  **EVERY GUARD WAS MUTATION-PROVED, AND TWO OF THE THREE WERE VACUOUS UNTIL
  THEY CREATED THE REGIME THEY MEASURE.** The harness drives 375 and 1440 only,
  and for the popover those are precisely the two widths that were never broken
  (the clipped band was 481 to about 740). A geometry-only row there would have
  been green on the shipped defect. Details, including the two absolute px
  figures written into an expectation and taken back out, are in the history
  entry. Every mutated file was restored from a copy taken beforehand and
  md5-checked identical; `git checkout --` was never used.

  **VERIFICATION.** `npx svelte-check`: **0 errors, 37 warnings in 20 files**, the
  baseline, with the 31/5/1 breakdown re-derived from its own output rather than
  read off `CLAUDE.md`. `npm test`: **378 files, 7454 tests**, matching the
  stated baseline exactly -- no test file was added. Before the README
  regeneration, `tests/derived-numbers.test.ts` was red on 7 assertions, every
  one of them the generated counts region not covering the route spec this
  bundle adds; green after. `node tools/claude-md-check.mjs` agrees with the
  tree. `npm run history:verify` reports the split lossless.

  **THE BROWSER PASS.** One `npm run verify:readme` at the end, on a clean
  committed tree, with Vite started by hand on 5199 and warmed and nothing else
  running; `pkill -f` was never used, and the two stray dev servers this session
  started early were killed by pid. Figures are in the report and in the
  README's own generated region.

  **GATE 4 SUBSTITUTION, NAMED.** `node tools/deploy-probe.mjs` cannot pass here
  -- `DEPLOY_PROBE_URL` is unset -- and ledger 0114's substitution applies. This
  bundle carries NO MIGRATION, so there is no applied state for the probe to
  speak for: the gate rests on that, not on a value I could not read. Nothing in
  this container reaches the production database and nothing tried.

  **DEPLOY CONFIRMED BY READING PRODUCTION**, not from push output. The figures
  are in the report.
