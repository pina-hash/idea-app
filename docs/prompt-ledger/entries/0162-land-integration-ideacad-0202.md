# 0162 Land `integration` into `main`: merge `0202` first, regenerate the measured counts

- Issued: 2026-09-11
- By: a landing session, carrying no source change of its own beyond one
  regenerated generated region. Successor to ledger 0159, which stopped on
  `0201` being unapplied and unlisted; `0201` has since been applied by hand and
  is permitted here.
- Owns: the merge of `claude/relaxed-goodall-lsudr8` into `integration`, the
  merge of `integration` into `main`, the reconciling merge of `main` into
  `integration`, `tools/browser-verify/README.md` in full,
  `docs/prompt-ledger/entries/0162-*` and its own `docs/history/` entry. NO
  OTHER SOURCE FILE. NO MIGRATION.
- Migration permitted: `0193` through `0199`, plus `0201` and `0202`, all
  reported hand-applied to production and verified; I verified none of those
  values myself (see Notes). `0200_classroom_presence.sql` is the named
  exclusion and is absent from the range.
- Claims: none.
- Lands on: `main`, moved from `dcbb741ef5c17de347be154daef88eed9cec9211`.
- Status: pushed
- Branch: `claude/adoring-hawking-n7cip4`, branched from `origin/integration`
  at `7c45d30cf41de8446f85236a76ce2b535afe5732`.
- Notes:

  **PRODUCTION IS NOT REACHABLE FROM THIS CONTAINER, AND IT WAS CHECKED
  FIRST.** `curl -sS -o /dev/null -w '%{http_code}' https://ideabosco.com/`
  answers `curl: (56) CONNECT tunnel failed, response 403` -- an organization
  egress policy denial, not a transport fault. This container is in ledger
  0140's and 0159's position, not 0141's and 0146's; the answer has now
  differed across five sessions. Nothing was routed around and no Vercel URL
  was substituted, because that answers a different question while looking
  like it answers this one. **The deploy is UNCONFIRMED and Mr. Pina must read
  the stamp on `ideabosco.com` himself.**

  **DUPLICATE CHECK, CLEAN, BOTH HALVES.** No
  `docs/prompt-ledger/entries/0162-*` existed on any ref: every ref under
  `refs/remotes` and `refs/heads` was swept with `git ls-tree -r --name-only`
  filtered to `docs/prompt-ledger/entries/0162-`, and the sweep returned
  nothing on any of them. `git log --all --oneline --diff-filter=A --
  'docs/prompt-ledger/entries/0162*'` returned nothing. No `claude/**` or
  `codex/**` branch carried a 0162 ledger commit: every such branch's
  `git log origin/integration..<branch>` was grepped for `0162` and none
  matched.

  **THE THREE OPENING CHECKS.** The repository was ALREADY a complete clone --
  no `.git/shallow`, 2127 commits reachable from `origin/main` back to a single
  root at `5c2bc96b` (2026-06-20) -- so `git fetch --unshallow origin` had
  nothing to do and the `|| git fetch origin` fallback covered it. `git fetch
  origin integration` succeeded. `git config user.name` -> `Claude`,
  `user.email` -> `noreply@anthropic.com`.

  **THE PROMPT'S STATED REDNESS DID NOT EXIST AND HAD ALREADY BEEN FIXED.** The
  prompt said `tests/derived-numbers.test.ts` fails because the IdeaCAD merge
  added `src/routes/dev/ideacad/+page.svelte` without regenerating the counts.
  Measured at the branch point, before anything was changed: the test passes 18
  of 18, and `npm run verify:counts -- --check` exits 0 with "the static counts
  region agrees with this tree". `7c45d30c`, the commit branched from, is
  titled "Regenerate the static browser-verify counts on the merged tree".
  Both halves were current, not just the static one: 191 route specs on disk
  against 191 covered by the recorded measured run, ZERO unmeasured and ZERO
  stale, `devPages` 107 against 107 `+page.svelte` files under
  `src/routes/dev`. Ledger 0159's report of this failure was accurate when
  written; a repair landed between the two sessions and nothing in the prompt
  chain carried it.

  **MERGE ORDER, AND IT IS LOAD-BEARING.**
  `claude/relaxed-goodall-lsudr8` went into `integration` FIRST.
  `git merge-tree --write-tree` emitted a single tree oid with zero conflict
  messages; the merge was `--no-ff` and clean. It carries
  `0202_ideacad_anon_grant_repair.sql`, which is what makes
  `tests/grant-surface.test.ts` green -- ledger 0159 measured `integration` red
  on exactly that file, with `anon` holding select, insert, update, delete,
  truncate, references and trigger on all four of `0201`'s tables.
  `integrate.yml` had not swept the branch. Merging `integration` into `main`
  before it would have deployed the hole.

  **THE MEASURED REGION WAS REGENERATED ONCE, ON A CLEAN COMMITTED TREE.** Vite
  started BY HAND on 5199 (`--strictPort`, placeholder env matching
  `PLACEHOLDER_ENV`), warmed across ten representative `/dev` routes to 200
  before the run, nothing else running; `startDevServer` reused it rather than
  spawning a second. The server was stopped by its own background task id --
  `pkill -f` was never used anywhere in this session. Results:

  > 382 route/width runs, 6682 measurements, 0 outside threshold
  > 70 selftest controls (36 negative, 34 positive), 0 instrument failures
  > 1009.9s wall clock, measured on 5813887

  **Measurements outside threshold: 0**, which is the expectation, so there is
  no row to name. The resulting diff is THREE LINES -- date, sha, wall clock --
  with every measured value byte-identical to the block before it, which is
  what a merge touching no file under `src/` should produce and is itself the
  check that the run measured what it claimed to.
  `npx vitest run tests/derived-numbers.test.ts` then passed 18 of 18.

  **BASELINES, READ OFF `integration` RATHER THAN OFF `CLAUDE.md`.**
  `svelte-check` reports **0 errors and 40 warnings in 22 files**, breakdown 34
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class` -- identical at the branch point and after the
  merge, so the merge moved neither number. `CLAUDE.md` still says 37 at
  31/5/1; it is stale by three warnings and two files, ledger 0161 measured the
  same 40 independently, and this lane owns no part of that file, so it is
  reported and not corrected. Full suite on the merged tree: **391 files, 7618
  tests, 370.77s, exit 0**, with the `grant-surface` failures ledger 0159
  recorded now gone.

  **THE MIGRATION RANGE WAS READ TWICE, THE SECOND TIME IMMEDIATELY BEFORE THE
  PUSH.** At branch time `git diff --name-status origin/main...origin/integration
  -- supabase/migrations/` returned `0199` and `0201`, with
  `claude/relaxed-goodall-lsudr8` adding `0202`. Re-read after the last fetch
  and before the push, the range was exactly `0199`, `0201`, `0202` -- all three
  permitted -- and `0200` was absent. This is ledger 0159's rule, earned when
  `0201` landed into a freshly-read clean range forty seconds later.

  **GATE 4 SUBSTITUTION, NAMED.** `tools/deploy-probe.mjs` cannot pass here:
  `DEPLOY_PROBE_URL` is unset, and its exit 1 is "cannot confirm", never
  "applied". Gate 4 rests instead on `0193` through `0199`, `0201` and `0202`
  being hand-applied and reported verified, with `0202`'s verification given as
  14 rows, every one `anon` false and `authenticated` true, over ten
  `ideacad_*` functions and four `ideacad_*` tables. **I VERIFIED NONE OF THOSE
  VALUES MYSELF.** What a container can answer is which migration files are in
  the range, which is the half answered above, twice.

  **CONFLICT POLICY.** Nothing was resolved on `main`. The merge into `main`
  was `--no-ff` and `main` was never force-pushed.
