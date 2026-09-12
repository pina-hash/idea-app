# 0166 Land `integration` into `main`: four branches, migrations `0200` and `0203`

- Issued: 2026-09-12
- By: a landing session, carrying no source change of its own beyond two
  regenerated generated regions. Successor to ledger 0162, which landed the
  previous round; `0200` and `0203` have since been applied by hand and are
  permitted here.
- Owns: the merges of `claude/hopeful-edison-pd3p6r`,
  `claude/inspiring-planck-gp601z`, `claude/cool-cori-0vzwcz` and
  `claude/awesome-cannon-83mfjf` into `integration`, the merge of `integration`
  into `main`, the reconciling merge of `main` into `integration`,
  `tools/browser-verify/README.md` where a merge conflicts inside its generated
  regions, `docs/prompt-ledger/entries/0166-*` and its own `docs/history/`
  entry. NO OTHER SOURCE FILE. NO MIGRATION.
- Migration permitted: `0193` through `0203`, all reported hand-applied to
  production, `0200` and `0203` on 2026-09-12. I verified none of those values
  myself, and two of the eleven were not verified by anyone in writing (see
  Notes).
- Claims: none.
- Lands on: `main`, moved from `8e834ba6e16483b45159c0e839b9175aeb7f08d0`.
- Status: pushed
- Branch: `claude/clever-ride-hw87m6`, branched from `origin/integration` at
  `ebf23dcdde0a620218771660b4ec0055621f754e`.
- Notes:

  **PRODUCTION IS REACHABLE FROM THIS CONTAINER, AND IT WAS CHECKED FIRST.**
  `curl -sS -o /dev/null -w '%{http_code}' https://ideabosco.com/` answered
  **200**. This container is in ledger 0141's and 0146's position rather than
  0140's, 0159's and 0162's; the answer has now differed across six sessions,
  which is why it is checked and never assumed. No Vercel URL was substituted
  for it at any point.

  **DUPLICATE CHECK, CLEAN, BOTH HALVES.** No
  `docs/prompt-ledger/entries/0166-*` existed on any ref: every ref under
  `refs/remotes/origin` and `refs/heads` was swept with
  `git ls-tree -r --name-only` filtered to `docs/prompt-ledger/entries/0166-`
  and the sweep returned nothing on any of them.
  `git log --all --oneline --diff-filter=A -- 'docs/prompt-ledger/entries/0166-*'`
  returned nothing, so no branch under `claude/` or `codex/` carries a 0166
  ledger commit either.

  **THE THREE OPENING CHECKS.** The repository was ALREADY a complete clone --
  `git rev-parse --is-shallow-repository` answered `false`, 2155 commits
  reachable from `origin/integration` -- so `git fetch --unshallow origin` had
  nothing to do and the `|| git fetch origin` fallback covered it.
  `git fetch origin integration` succeeded. `git config user.name` -> `Claude`,
  `user.email` -> `noreply@anthropic.com`.

  **MERGE ORDER, AS ISSUED, ALL FOUR CLEAN.** `hopeful-edison` (ledger 0164,
  migration `0203`), then `inspiring-planck` (ledger 0152, migration `0200`),
  then `cool-cori` (ledger 0163, no migration), then `awesome-cannon` (ledger
  0165, no migration). All `--no-ff`. `git merge-tree --write-tree` predicted a
  single conflict and that is exactly what happened: `inspiring-planck` against
  `tools/browser-verify/README.md`, **entirely inside the `counts:static` and
  `counts:measured` generated regions**, both sides carrying stale numbers.
  Resolved by taking `HEAD` and regenerating both regions on the merged tree
  afterwards, which is the resolution that file's own header prescribes. The
  full diff of that file between `integration` and `inspiring-planck` was read
  first to confirm nothing outside the generated regions was being discarded;
  nothing was.

  **`cool-cori` CARRIES THE `merged_suite()` FIX AND ITS FIRST REAL VERDICT IS
  REPORTED BELOW.** Its one line is an `npx svelte-kit sync` before the
  merged-tree suite in `integrate.yml`: a runner's checkout has no
  `.svelte-kit`, so vitest died in dependency optimisation before any test
  body, named no failing test, and `merged_suite()` answered `unrun` on every
  tree it was ever handed.

  **BOTH COUNTS REGIONS WERE REGENERATED ON THE MERGED TREE, THE MEASURED ONE
  ONCE.** Static first (`npm run verify:counts`, a tree read): **196 specs over
  80 routes, 108 `/dev` pages, 2 widths, 392 route/width runs**, committed on
  its own. Then the measured half, on that clean committed tree (`80aae10`,
  `dirty: false`), with vite started BY HAND on 5199 (`--strictPort`,
  placeholder env matching `PLACEHOLDER_ENV`), warmed across five `/dev` routes
  to 200 before the run, and nothing else running; `startDevServer` reused it
  rather than spawning a second, and it was stopped afterwards by its own
  background task id. **`pkill -f` was never used anywhere in this session.**
  Results:

  > 392 route/width runs over 196 specs, 6838 measurements, 0 outside threshold
  > 70 selftest controls (36 negative, 34 positive), 0 instrument failures
  > 991.6s wall clock, measured on 80aae10

  **Measurements outside threshold: 0**, which is the expectation, so there is
  no row to name. The two `presence-*` specs `inspiring-planck` added are now
  covered -- the static and measured spec counts agree at 196, which is the
  comparison that file tells a reader to make. `npx vitest run
  tests/derived-numbers.test.ts` then passed **18 of 18**.

  **BASELINES, READ OFF `integration` RATHER THAN OFF `CLAUDE.md`, AND THE
  PROMPT'S FIGURE IS STALE TOO.** `svelte-check` reports **0 errors and 38
  warnings in 21 files**, breakdown **32** `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`. Measured twice on this
  container -- once at the branch point on `origin/integration` and once on the
  merged tree, after `rm -rf .svelte-kit && npx svelte-kit sync` with the two
  public variables exported -- and both readings are identical, so the four
  merges moved neither number. `CLAUDE.md` says **40 in 22 files** at 34/5/1
  (`cool-cori` itself corrected it from 37 to that in this very round) and the
  prompt repeated the same figure. Both are now stale by two
  `state_referenced_locally` warnings and one file, in the DOWNWARD direction:
  something between ledger 0161's measurement and this one fixed two. This lane
  owns no part of `CLAUDE.md`, so it is reported and not corrected -- which is
  ledger 0162's position on the same sentence, one round later and in the
  opposite direction. Full suite on the merged tree: **398 files, 7717 tests,
  331.77s, exit 0.**

  **THE MIGRATION RANGE WAS READ TWICE, THE SECOND TIME IMMEDIATELY BEFORE THE
  MERGE INTO `main` RATHER THAN AT BRANCH TIME.** This is ledger 0159's rule,
  earned when a migration landed into a freshly-read clean range forty seconds
  later. At branch time `integration` carried `0193` through `0199` plus `0201`
  and `0202`, with `hopeful-edison` bringing `0203` and `inspiring-planck`
  bringing `0200`. Re-read after the last fetch and before the push,
  `git diff --name-only origin/main...HEAD -- supabase/migrations/` was exactly
  `0200_classroom_presence.sql` and `0203_sequence_anon_grant_sweep.sql` --
  both permitted, nothing else in the range, no migration outside `0193`
  through `0203` anywhere in it.

  **GATE 4 SUBSTITUTION, NAMED, AND WEAKER THIS ROUND THAN LAST.**
  `tools/deploy-probe.mjs` cannot pass here. Run at `--since 193`, verbatim:

  > deploy-probe: DEPLOY_PROBE_URL is not set, so production's applied set
  > cannot be read. This is "cannot confirm", never "applied".

  It exited **1**, which the prompt instructed me not to treat as a stop, and
  which is "cannot confirm" and never "applied". Gate 4 therefore rests on
  Mr. Pina's report that `0193` through `0203` are hand-applied. **I VERIFIED
  NONE OF THOSE DATABASE VALUES MYSELF.** And **two of the eleven -- `0200` and
  `0203` -- were not verified by anyone in writing**: Mr. Pina states in the
  prompt that he has not seen their verification output, so their applied state
  rests on his report of having applied them and on nothing else. `0203` is a
  grant sweep and `0200` creates the presence tables; a client shipped against
  either one that is not actually applied fails at its first call. What a
  container can answer is which migration files are in the range, which is the
  half answered above, twice.

  **THE DEPLOY IS CONFIRMED, WHICH THE PROMPT WARNED IT MIGHT NOT BE.**
  Production was polled from the moment `main` moved and the stamp went
  `dcbb741` -> `870e063` -- this lane's own merge commit -- confirmed by a live
  read afterwards. The fourteen-hour stall was specific to `8e834ba6`, for which
  Vercel created no deployment at all, and is not a standing fault. The merge
  and the deploy are still separate facts and were confirmed separately.

  **THE FIRST INTEGRATE RUN WITH `cool-cori`'s FIX SAYS NOTHING ABOUT THE
  SUITE.** Run 827, the first to execute the fixed workflow, is red on a
  CONFLICT: "1 branch(es) conflicted with integration and were left untouched.
  integration did not move this run." A notebook-theme branch conflicts across
  ten paths. Nothing merged, so there was no merged tree and `merged_suite()`
  returned no verdict -- the fix is in place and still unexercised. The
  conflict predates it: runs 823 and 825 failed identically under the old
  workflow. Resolving that branch is outside this lane.

  **CONFLICT POLICY.** Nothing was resolved on `main`. The merge into `main`
  was `--no-ff` and `main` was never force-pushed, with `--force`,
  `--force-with-lease` or otherwise.
