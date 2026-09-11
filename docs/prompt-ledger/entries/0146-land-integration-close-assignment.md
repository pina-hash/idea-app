# 0146 Land `integration` into `main`: a teacher can close an assignment

- Issued: 2026-09-11
- By: a landing session, carrying no source change of its own. It found ledger
  0143 standing on `claude/serene-franklin-2zw56t` with five commits and
  migration `0198` that `integrate.yml` had not swept, so this bundle owns two
  merges rather than one: 0143 into `integration` first, then `integration`
  into `main` with 0144 already on it.
- Owns: the merge of `claude/serene-franklin-2zw56t` into `integration`, the
  merge of `integration` into `main`, the reconciling merge of `main` into
  `integration`, `tools/browser-verify/README.md` where the first merge
  conflicted inside its generated regions,
  `docs/prompt-ledger/entries/0146-*` and its own `docs/history/` entry. NO
  OTHER SOURCE FILE, and none was written: the one source file that conflicted
  (`src/lib/classroom/ItemDetail.svelte`) was resolved by keeping both sides
  and nothing else about it was touched.
- Migration permitted: `0193` through `0198`, all six hand-applied to
  production and reported verified; I verified none of the values myself (see
  Notes). Only `0198` was new on `integration` relative to `main`, confirmed by
  `git diff --name-status origin/main origin/integration -- supabase/migrations/`,
  which returned exactly one line:
  `A supabase/migrations/0198_classroom_close_assignment.sql`.
- Claims: none.
- Lands on: `main`, at `3d825b2bc0524cc474da1755906144ad7c1ea9da`.
- Status: pushed
- Branch: `claude/gallant-bell-stq5lb`, branched from `origin/integration` at
  `33f34412`.
- Notes:

  **DUPLICATE CHECK, CLEAN, BOTH HALVES.** No
  `docs/prompt-ledger/entries/0146-*` existed on any ref before this bundle
  wrote one: every `refs/remotes/origin/*` was swept individually with
  `git ls-tree -r --name-only <ref> -- docs/prompt-ledger/entries/` filtered to
  `/0146-`, and the sweep returned nothing on any of them. The standing
  `claude/**` and `codex/**` branches were then swept a second way, by
  `git log --oneline origin/main..<branch>` grepped for `0146`, in case a
  branch carried the commit under a differently-named path; zero hits. So
  nothing was carrying a 0146 ledger commit and nothing else.

  **THE THREE OPENING CHECKS, REPORTED AS ASKED.** `git fetch --unshallow
  origin` succeeded -- `git rev-parse --is-shallow-repository` answers `false`
  and 2060 commits are reachable from `origin/main`. `git fetch origin
  integration` succeeded. `git config user.name` -> `Claude`, `user.email` ->
  `noreply@anthropic.com`.

  **THE FIRST FETCH REPORTED `origin/main` AS A FORCED UPDATE**
  (`+ 336e82f...04693df main -> origin/main`). That is the remote-tracking ref
  being repointed in a cloud clone that arrived shallow, not a force-push on
  `main`: `04693dfb` has `336e82f`'s content in its history and `main` moved
  forward normally. It is recorded because a reader seeing `+` in a fetch line
  on a repository whose rules forbid force-pushing `main` should not have to
  re-derive that.

  **MERGING LEDGER 0143 FIRST, AND THE TWO CONFLICTS IT PRODUCED.**
  `claude/serene-franklin-2zw56t` was five commits ahead of `integration` from
  a branch point of `ce871553`, carrying exactly one migration file. Its ledger
  read `Status: pushed` and `Lands on: its own branch. NOT merged to main,
  because it carries a migration` -- which is the state `integrate.yml` sweeps,
  and it had not. `git merge-tree --write-tree --messages` predicted both
  conflicts before the merge was attempted and both arrived:

  * **`src/lib/classroom/ItemDetail.svelte`, two hunks, both in DIFFERENT
    REGIONS, resolved by keeping both.** Hunk one is the import block: 0142
    added `Progress` and `htmlManifestShaped`, 0143 added `assignmentLockState`,
    and the sides touch no line in common. Hunk two sits between the
    `{:else}` of the not-live branch and `<HtmlAssignmentFrame>`: 0142 inserts
    the `{#if htmlAnswers && htmlProgressManifest}` progress-rail block, 0143
    inserts the comment explaining why the worksheet is shut. Neither deletes
    or rewrites a line of the other, so the resolution is 0142's block followed
    by 0143's comment followed by the frame -- which is also the reading order
    the two comments themselves assume. **Had the two sides edited the same
    lines that would have been a genuine content conflict and a stop**; they did
    not, and this is recorded so nobody reads "kept both" as a shortcut past a
    real disagreement.
  * **`tools/browser-verify/README.md`, both generated regions, resolved by
    REGENERATING rather than by taking a side.** See the next note.

  **NEITHER SIDE OF THE README WAS RIGHT, WHICH IS THE WHOLE ARGUMENT FOR
  REGENERATING IT.** The `integration` side said 185 specs / 75 routes / 103
  `/dev` pages / 370 runs, measured at `e508157`; the `claude/serene-franklin`
  side said 186 / 74 / 102 / 372, measured at `afd5a27`. The merged tree is
  **187 specs / 75 routes / 103 `/dev` pages / 374 runs**, which is neither --
  0142's `html-progress.mjs` plus the two specs 0143 added
  (`html-assignment-grading-live-stalled.mjs`,
  `html-assignment-grading-state-closed.mjs`). Taking either side would have
  left a measured region claiming `Measurements outside threshold: 0` over a
  set of routes this tree does not have, which is exactly the shape
  `readme-counts.mjs`'s own header says a reader consults and is misled by.

  The static half was regenerated first with `npm run verify:counts` -- a tree
  read, no browser -- and committed alone, so the measured run had a clean
  committed tree under it and recorded a real sha rather than a dirty one. The
  measured half then came from a single full run of
  `tools/browser-verify/run.mjs`, on a Vite dev server started by hand on 5199
  and warmed, with nothing else running: **374 route/width runs, 6538
  measurements, 0 outside threshold, 983.4s wall clock, 70 selftest controls
  (36 negative, 34 positive), 0 instrument failures, measured on `74757ef`**.
  `Route specs the run covered` is 187 and matches `Route specs` in the static
  region, so that zero is a zero for this tree. Regenerated ONCE, at the end,
  as asked.

  **THE README WAS THE ONLY THING BETWEEN THE MERGE AND GREEN, AND IT WAS
  MEASURED IN BOTH DIRECTIONS.** `npm test` over the merged tree BEFORE the
  regeneration: 377 of 378 files pass, 7447 of 7454 tests, with
  `tests/derived-numbers.test.ts` red on 7 assertions, every one of them the
  measured region not covering `html-progress.mjs`. AFTER: **378 of 378 files,
  7454 of 7454 tests, zero failures.** `npx svelte-check` over the same tree is
  **0 errors and 37 warnings in 20 files**, the documented baseline, re-derived
  rather than read off `CLAUDE.md` -- with `PUBLIC_SUPABASE_URL` and
  `PUBLIC_SUPABASE_ANON_KEY` exported before `svelte-kit sync`, without which a
  fresh cloud checkout reports the phantom `$env/static/public` errors that
  section warns about.

  **NO RECONCILING MERGE OF `main` INTO `integration` WAS NEEDED, ON EITHER
  PASS.** `git merge-base --is-ancestor origin/main origin/integration`
  answered yes at the branch point (`origin/main` `04693dfb`,
  `origin/integration` `33f34412`), again immediately before the push to
  `integration`, and again before the merge to `main`. Step 1 of the loop was a
  no-op because it was true, not because it was skipped.

  **CI DISPATCHED ON THE FULL FORTY-CHARACTER SHA, AND THE AGGREGATOR'S FOUR
  OUTCOMES WERE READ RATHER THAN THE ROLLED-UP CONCLUSION.** `ci.yml` was
  dispatched with `inputs.ref` set to
  `a6022784c39709bb2e757e927533bcf355a4ab6f`, `integration`'s tip after the
  0143 merge and the two regeneration commits. Run **34576131896** ran
  07:48:41 to 07:53:59 UTC -- **5m18s**, with the `Test suite` step alone
  taking 07:49:33 to 07:53:55 (**4m22s**). That duration is itself the
  discriminator: a run under a minute is `actions/checkout` failing on a short
  sha with the later `if: always()` steps reporting success against an empty
  workspace, and this is nothing like it. `ci.yml` sets
  `continue-on-error: true` on all four checks, so the "Fail the job if any
  step failed" step's own echoed lines were read out of the job log:

  > ref tested:         a6022784c39709bb2e757e927533bcf355a4ab6f (HEAD)
  > check:              success
  > test:               success
  > vanguard-changelog: success
  > history-verify:     success

  The `ref tested:` line is what confirms the checkout resolved the full sha
  rather than silently testing something else.

  **BOTH LEDGER ENTRIES NEW ON `integration` READ `pushed`**, read out of
  `origin/integration` itself rather than from a working copy: 0143
  (grade-live-and-close) and 0144 (two-agents-one-repository).
  `git merge-tree --write-tree --messages origin/main origin/integration`
  exited 0 and emitted a single tree oid (`8f54eec3`) with zero conflict
  messages, so the second merge was known clean before it was attempted, and it
  merged clean in fact. `classroom-updates.json` -- which is AT THE REPO ROOT,
  not under `static/` -- auto-merged in the FIRST merge and did not conflict in
  the second, so its keep-both-textually rule was not exercised either time.
  Pushed non-force, `04693dfb..3d825b2b`.

  **GATE 4 SUBSTITUTION, NAMED, AND THE PROBE REPORTED VERBATIM.**
  `node tools/deploy-probe.mjs` cannot pass here -- `DEPLOY_PROBE_URL` is
  unset, confirmed empty in this shell -- and its exit 1 is not treated as a
  stop, per ledger 0115's substitution:

  > deploy-probe: DEPLOY_PROBE_URL is not set, so production's applied set
  > cannot be read. This is "cannot confirm", never "applied".
  > (exit 1)

  Gate 4 rests instead on `0193` through `0198` being hand-applied to
  production and reported verified, with `0198`'s verification given as:
  `close_arities` 1, `close_defaults` 2, `auth_can_close` true, `anon_can_close`
  false, `service_can_close` false, `unsubmit_guarded` true, `closed_rows` 0 --
  every value matching the migration's own expected set. **I VERIFIED NONE OF
  THOSE VALUES MYSELF.** No session in this container can reach the production
  database, and the local `.env` is a placeholder project (`example-ref`). What
  I did verify is the shape of the file those values describe:
  `0198_classroom_close_assignment.sql` is the one migration new on
  `integration` relative to `main`, and it is the only migration this bundle
  carried in either direction.

  **STEP 5 PERFORMED, AND THIS IS THE GAP LEDGER 0140 LEFT OPEN.** 0140 could
  not reach `ideabosco.com` at all -- its egress proxy answered 403 to CONNECT
  -- so it landed with Gate 5 unmet on its own terms and asked a later session
  to read the stamp. **This container reaches production.**
  `https://ideabosco.com/assignments/IDEA-Blade_Rulebook_v2_2` answered 200
  with a 596,725-byte body BEFORE the landing, stamped
  `Assignments v1.15 · 04693df · Sep 11, 2026` -- `04693df` being `main`'s tip
  at that moment, which is the positive control that the stamp tracks `main`
  and is not a cached constant. After the push it was polled to terminal and
  came back:

  > Assignments v1.15 · 3d825b2 · Sep 11, 2026

  `3d825b2` is this bundle's own merge commit, so the deploy was confirmed by
  READING production and not from push output, which is what 0140 asked a later
  session to do and this is it.

  **CONFLICT POLICY.** Both conflicts arose on the FIRST merge and were
  resolved on `integration`, never on `main`. The second merge had none.
