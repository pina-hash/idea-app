# 0163 The merged-tree suite gate has never returned a verdict: one missing `svelte-kit sync`

- Issued: 2026-09-11
- By: router chat
- Owns: `.github/workflows/integrate.yml`, `.github/workflows/README.md`,
  `tools/integrate-gate-proof.sh`, `tests/workflows.test.ts`, `CLAUDE.md` (the paragraphs
  named in the prompt only), `docs/decisions/entries/21-*`,
  `docs/prompt-ledger/entries/0163-*`, and its own `docs/history/` entry. NO MIGRATION.
  NO FILE UNDER `src/`.
- Migration permitted: no. Claims: none. Highest on origin/integration at issue: 0201
- Status: issued
- Branch: `claude/cool-cori-0vzwcz`, branched from `origin/integration` at `7c45d30c`
- Runs in parallel with: ledger 0160 (`src/lib/ideacad/**`) and ledger 0161
  (`supabase/migrations/0202_*`, `tests/db/ideacad-grants*`, `CLAUDE.md` ONE paragraph).
  The `CLAUDE.md` overlap with 0161 is deliberate and disjoint: 0161 measured the
  svelte-check baseline drift and explicitly did NOT fix it because it owned a different
  paragraph, and this prompt is the one that carries that correction. No other file is
  shared. Ledger 0162 is a landing bundle and 0160 owns `src/lib/ideacad/**`; neither was
  touched.
- Notes:

  **DUPLICATE CHECK, CLEAN, THREE WAYS, WITH A POSITIVE CONTROL ON THE THIRD.**
  (1) `git log --oneline origin/main..origin/integration` is 12 commits -- the IdeaCAD
  merge, the HTML-assignment instructor key, two browser-verify count regenerations and
  ledger 0159's stop -- and `git log --name-only` over that same range filtered to
  `.github/workflows/`, `tools/integrate-gate-proof.sh` and `tests/workflows.test.ts`
  returns NOTHING, so no bundle already on `integration` did this. (2) Every one of the
  47 `refs/remotes/origin/*` refs was swept with `git ls-tree` for a
  `docs/prompt-ledger/entries/0163-*`: none exists anywhere; the entries in flight are
  0159 (on `integration`), 0160 (`claude/ecstatic-maxwell-juawx5`) and 0161
  (`claude/relaxed-goodall-lsudr8`), and the Owns intersection is the single deliberate
  `CLAUDE.md` one described above. (3) The same 47 refs were diffed against `origin/main`
  filtered to this bundle's four owned code paths and NONE touches any of them -- with a
  positive control on the same loop over `supabase/migrations/`, which correctly names
  five refs, so the empty answer is an observation rather than a broken sweep.
  `git log --all --grep=0163` returns three commits, all of which mean MIGRATION 0163
  (IDEA Maps) and none of which is a ledger entry.

  **THE THREE OPENING CHECKS.** `git fetch --unshallow origin` succeeded;
  `git rev-parse --is-shallow-repository` answers `false` with 2127 commits reachable.
  `git fetch origin integration` succeeded. `git config user.name` -> `Claude`,
  `user.email` -> `noreply@anthropic.com`, both already set.

  **THE DEFECT WAS REPRODUCED BEFORE ANYTHING WAS CHANGED**, on this container's own
  fresh checkout, which had no `node_modules` and no `.svelte-kit` at all. After
  `npm ci`, `npm test` exits 1 with `[RESOLVE_ERROR] Could not resolve 'node:module' ...
  Tsconfig not found`, **0 `FAIL` lines and 0 `Tests` summary lines** -- so
  `merged_suite`'s `findings` is empty and it takes the `unrun` branch unconditionally.
  One `npx svelte-kit sync` (2.5s) and the same tree runs.

  **AND IT WAS CONFIRMED IN PRODUCTION, VERBATIM**, from Integrate run 34626597503
  (2026-09-11 17:16Z), which emits BOTH `::error::` lines:
  `the suite could not be run on the merged tree -- the suite exited 1 without naming a
  failing test. Every merge above was still pushed and nothing was lost.` and
  `1 branch(es) conflicted with integration and were left untouched. integration ITSELF
  WAS PUSHED and is not blocked`.

  **THE FIX IS ONE LINE AND THE FUNCTION IS NOT RESTRUCTURED.**
  `npx svelte-kit sync >&2 || printf '...' >&2` between the `npm ci` guard and
  `npm test`. Its output goes to STDERR because this function's stdout is its verdict --
  the property `tools/integrate-gate-proof.sh` case 61 caught a `tee` violating. A sync
  that fails is left to the suite and answered by the `unrun` branch that already exists;
  the return code is 2 either way and case 72a proves it.

  **ALL THREE STATES PROVED, AND THE CONTROL IS THE REAL ONE.** The harness reported
  green, red and unrun BEFORE this bundle too, against a stub `npm test` that ran
  regardless of any generated directory -- so it was modelling a function the workflow did
  not have. The stub now mirrors the toolchain (`npm ci` REMOVES `.svelte-kit`, only
  `npx svelte-kit sync` creates it, `npm test` reproduces the startup error's shape), and
  cases 72c/72d re-cut the region with the sync line DELETED and show a green tree and a
  red tree both collapsing to `unrun`. 98 of 98 cases pass, exit 0.

  **A SECOND DEFECT, FOUND AND FIXED, SAME SPECIES, AND IT IS NOT WHAT THE PROMPT SENT
  ME FOR.** Cases 80 and 81 stood RED on `origin/integration` -- measured on a pristine
  worktree of it before anything was changed, 91 passed / 2 failed / 93 cases. The
  harness sources the cut cross-branch text under `set -u` and never supplied
  `AGENT_BRANCH_PREFIXES`, which the workflow declares once in its job-level `env:`, so
  the region aborted at its first use and the standards-version contest gate was UNPROVEN
  for as long as those cases were red. The harness now reads that value out of the
  workflow rather than writing down a second copy of it.

  **FOUR MUTANTS, ALL BITING**, against the three new `tests/workflows.test.ts`
  assertions: the sync line deleted, moved before `npm ci`, moved after `npm test`, and
  its redirect removed. The fourth initially did NOT bite -- the `||` fallback arm has a
  `>&2` of its own that satisfied a whole-line check -- so the assertion now reads only up
  to the `||`, and the mutant reddens. `.github/workflows/integrate.yml` was restored from
  a SAVED COPY each time and md5-verified, never `git checkout --`.

  **DECISION 21 (`integrate-tests-after-it-merges`) STAYS OPEN, DELIBERATELY.** It asks
  whether the merged-tree suite becomes a GATE on the push or stays a report, and what
  return code 2 should do; its own text says the sync fix is a PREREQUISITE for that and
  must go first. The entry gains a section recording that the prerequisite landed, how it
  differs from the proposal in mechanism, and what remains -- including that no Integrate
  run has yet reported a real verdict, because `workflow_run` runs the copy of the
  workflow on the DEFAULT BRANCH.

  **`CLAUDE.md`, TWO PARAGRAPHS AND NO MORE.** The svelte-check baseline was re-derived
  here rather than copied: 0 errors, **40 warnings in 22 files**, breakdown
  **34 `state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`**,
  which is ledger 0161's independent measurement to the number. The no-`.env` phantom
  figure was measured too and is STILL CORRECT at 14 errors across 11 files, so it was
  left alone. The `claude/red-merge-green-parents-ft3e57` sentence is corrected: that work
  landed on `main` in `21a21954` (2026-09-06) and the branch tip is contained in both
  `main` and `integration`. `node tools/claude-md-check.mjs` agrees with the tree.

  **REPORTED, NOT FIXED, AS INSTRUCTED: `claude/notebook-ui-theme-overhaul-0gnx0f` SHOULD
  BE ARCHIVED AS A TAG AND ITS BRANCH DELETED.** It conflicts with `integration` across
  TEN files (the prompt said nine), its CI is green on its tip `30adfd77` and its ledger
  reads `pushed`, so `integrate.yml` attempts it on every run and it is the "1 branch(es)
  conflicted" in the error above -- the only other conflicting branch,
  `claude/inspiring-planck-gp601z`, is red on its tip and never reaches the merge. Its
  work WAS harvested by ledger 0122 and that is verified against this tree rather than
  taken from the entry: all four items 0122 says it brought across by content are present.
  Nothing was deleted.

  **VERIFICATION, AGAINST BASELINES READ OFF `origin/integration` AT BRANCH TIME.**
  Gate proof 98/98, exit 0, against a 91/2/93 baseline on a pristine worktree of
  `origin/integration`. `npm test` 389 of 390 files, 7600 of 7604 tests, 382.52s -- the
  four failures are `tests/grant-surface.test.ts` and are INHERITED, measured on that same
  pristine worktree as 4 failed / 11 passed, identical, and structurally impossible to be
  mine (`git diff --name-only origin/integration...HEAD` touches 0 files under `supabase/`
  and 0 under `tests/` that file reads). They are `0201`'s grant hole, which ledger 0161's
  `0202` repairs. `svelte-check` 0 errors / 40 warnings / 22 files (34/5/1).
  `tools/claude-md-check.mjs` agrees. `npm run history:verify` lossless.
  `npm run verify:browser` deliberately not run: no `src/` file.

  **NOT MERGED TO `main`, AND THE STOP IS NOT THIS BUNDLE'S.** Gate 1 met (exit 0). Gate 2
  UNMET: this branch is not in `origin/integration` yet. Gate 4 CANNOT SAY, and ledger
  0114's substitution does not rescue it because the range carries TWO migrations (`0199`
  and `0201`). Gate 5 UNMET: `0201` is unapplied on production, its own header says "deploy
  migration first", and ledger 0161 established it should not be applied as written. This
  is ledger 0159's stop, still standing.

  **NOT VERIFIED, AND SAID RATHER THAN LEFT SILENT.** `https://ideabosco.com/` is
  UNREACHABLE from this container -- `curl: (56) CONNECT tunnel failed, response 403`, and
  the agent proxy records it as `connect_rejected`, "gateway answered 403 to CONNECT
  (policy denial or upstream failure)", which is an organization egress denial to report
  and not route around. So a deploy cannot be confirmed by reading the stamp from here.
  No Integrate run has yet exercised the fixed workflow, for the reason above. No
  migration, no `src/` file, no `classroom-updates.json` entry: nothing a student sees
  changes.
