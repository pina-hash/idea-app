# 0133 Land four finished branches into `integration`, then `integration` into `main`

- Issued: 2026-09-10
- By: a landing session, carrying ledger 0130's finding forward: the measured
  region of `tools/browser-verify/README.md` is regenerated per lane, so two
  lanes that both regenerate it merge into a silent lie with no conflict to
  warn anyone. `integration` was red on `tests/derived-numbers.test.ts` for
  exactly that reason again at this bundle's start (`541e00a1`): 0129 added
  three `html-rubric-*` route specs the last regeneration never covered.
- Owns: `tools/browser-verify/README.md` in full (both generated regions), the
  merge of `integration` into `main`, the reconciling merge of `main` into
  `integration`, the merges of the four named branches into `integration`,
  `docs/prompt-ledger/entries/0133-*`, and its own `docs/history/` entry. No
  other source file. No source change was needed.
- Migration permitted: `0195`, `0196` (newly landed by this bundle's merges),
  plus `0194` (already on `integration` at the branch point, from an earlier
  cycle). All three are hand-applied to production; I verified none of the
  reported values myself (see Notes).
- Lands on: `main`, at `a3e6576e` (deploy read back from production).
- Status: pushed
- Branch: `claude/prompt-ledger-0133-merge-e5oos7`, branched from
  `origin/integration` at `541e00a1`.
- Notes:

  **DUPLICATE CHECK, CLEAN.** No `docs/prompt-ledger/entries/0133-*` existed on
  any ref before this bundle wrote one, and no standing `claude/**` branch
  carried a 0133 ledger commit and nothing else (swept every remote
  `claude/**` branch's commits ahead of `origin/main` for the string "0133";
  zero hits).

  **FOUR MERGES, IN ORDER, ALL CLEAN OR CLEANLY RESOLVED.**
  1. `claude/gauntlet-timing-flake-fix-i5kzst` (0132) -- clean, no conflict.
  2. `claude/reserve-hx-slug-8zq09j` (0131, migration `0196`) -- clean, no
     conflict.
  3. `claude/html-assignment-manifest-contract-gye4f7` (0127, migration
     `0195`) -- clean, no conflict.
  4. `claude/html-assignment-manifest-contract-8xazmp` (0128, no migration) --
     conflicted in exactly one file, `tools/browser-verify/README.md`, both
     hunks entirely inside the `<!-- counts:static:begin -->` /
     `counts:static:end` markers (one side's tree had 175/70/98/350, the other
     179/72/99/358). No prose conflict anywhere in the file. Resolved by
     `npm run verify:counts` on the merged tree, never by taking a side, per
     the standing rule that a conflict fully inside the generated markers is
     resolved by regenerating.

  **`claude/html-assignment-manifest-contract-tpr7eg` (0126) WAS DELIBERATELY
  NOT MERGED**, per the prompt: it adds `src/routes/hx/`, and with
  `PUBLIC_HX_SANDBOX_ORIGIN` unset that route would answer on the
  cookie-carrying production host with no `sandbox` CSP directive, placing a
  direct navigation outside an opaque origin. Confirmed `src/routes/hx/` was
  NOT already present on `integration` at the branch point, so nothing needed
  to be undone.

  **THE MEASURED REGION WAS REGENERATED EXACTLY ONCE, AFTER ALL FOUR MERGES**,
  which is the whole point of this bundle existing rather than being folded
  into one of the four lanes. Vite was started manually on port 5199 (never
  `pkill -f`, which matches the shell running it) and warmed before the pass;
  nothing else ran concurrently. `npm run verify:readme` reported **358
  route/width run(s), 6246 measurement(s), 0 outside threshold**, wall clock
  923.8s, measured on `82ea7e2` (the tip after the fourth merge, before this
  regeneration's own commit). Coverage grew from 176 to 179 route specs and
  now includes `html-rubric-state-graded.mjs`, `html-rubric-state-single.mjs`
  and `html-rubric.mjs` -- the three specs 0129 added and the prior
  regeneration never saw, which is exactly the defect this bundle exists to
  close. `tests/derived-numbers.test.ts`: 18/18 green afterward. Full suite,
  run once at the end: **363 files, 7166 tests, all passed.**

  **CI DISPATCHED ON THE FULL FORTY-CHARACTER SHA, AND THE AGGREGATOR STEP'S
  OWN FOUR OUTCOMES WERE READ, NOT THE ROLLED-UP CONCLUSION.** After pushing
  this bundle's work to `origin/integration` (fast-forward, `541e00a1` ->
  `7fff63f5c27b0e9e47bc833d0253c51e67b648b9`), `ci.yml` was dispatched via
  `workflow_dispatch` with `inputs.ref` set to the full sha
  `7fff63f5c27b0e9e47bc833d0253c51e67b648b9`. Run 34443424572 ran 06:01:34 to
  06:07:14 (about 5.5 minutes, `Test suite` step alone taking 06:02:33 to
  06:07:09) -- not the sub-minute `actions/checkout` failure pattern a short
  sha produces. The "Fail the job if any step failed" step's own echoed
  values, read from its log output: `check: success`, `test: success`,
  `vanguard-changelog: success`, `history-verify: success`; `ref tested:` line
  confirms the exact sha. All four green.

  **`main` WAS ALREADY AN ANCESTOR OF THIS BUNDLE'S `integration` TIP**, so no
  reconciling merge of `main` into `integration` was needed beyond what was
  already true (`origin/main` at `d4001065` was already reachable from
  `origin/integration` at the branch point). `integration` into `main` merged
  clean with `--no-ff`, no conflicts anywhere (`classroom-updates.json`
  included) -- because `integration` had accumulated substantially more than
  this bundle's four branches since `main`'s last landing (ledger 0130's
  cycle), this merge carries that accumulated work too (GAUNTLET
  verification-floor fixes, the notebook theme reconciliation, an earlier
  HTML-assignment bundle, etc.), which is the correct behaviour of a
  reconciling merge and not scope creep by this bundle. Pushed
  non-force: `d4001065` -> `a3e6576e`.

  **GATE 4 SUBSTITUTION, NAMED.** `node tools/deploy-probe.mjs` cannot pass
  here -- `DEPLOY_PROBE_URL` is unset -- and its output is reported verbatim
  and not treated as a stop:

  > deploy-probe: DEPLOY_PROBE_URL is not set, so production's applied set
  > cannot be read. This is "cannot confirm", never "applied".
  > (exit 1)

  This bundle's Gate 4 rests instead on three migrations already hand-applied
  to production and reported verified, per the prompt: `0194` (`floor_ms`
  30000 at apply, `held_with_a_seat` 0), `0195` (1, 1, 2, 1, true, false,
  false, true, 0), `0196` (true, true, false, 34, false, false, true). **I
  verified none of those values myself** -- no session in this container can
  reach the production database. Only `0195` and `0196` were newly landed by
  this bundle's own merges (confirmed via `git diff --name-only` between the
  branch point and the fourth merge's tip, restricted to
  `supabase/migrations/`); `0194` was already on `integration` from an earlier
  cycle.

  **DEPLOY CONFIRMED BY READING PRODUCTION, TWICE.** Fetched
  `https://ideabosco.com/assignments/IDEA-Blade_Rulebook_v2_2` in a poll loop
  after the push (never trusting push output alone): the footer stamp read
  `Assignments v1.14 · d400106 · Sep 9, 2026` (the pre-push sha) for the first
  several checks, then updated to `Assignments v1.14 · a3e6576 · Sep 10, 2026`,
  matching the pushed sha `a3e6576e1690b1b7b3ce6ee02f0aee89124d0686`. Re-fetched
  once more independently after the poll exited to confirm the stamp held.

  **CONFLICT POLICY.** All conflicts (the one in `tools/browser-verify/
  README.md`) resolved on `integration`, never on `main`. No
  `classroom-updates.json` conflict arose in either merge, so its
  keep-both-textually rule was not exercised this time.
