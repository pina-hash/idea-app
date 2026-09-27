---
title: "Ledger 0335: CI is four jobs, sharded five ways, fetches two branches instead of a hundred, and runs only the document-reading tests on a docs-only push (`claude/upbeat-pascal-p9krgk`, no migration)"
date: 2026-09-27
branches: [claude/upbeat-pascal-p9krgk]
migrations: []
subsystems: [CI, Tooling, Testing]
---

CI on a push took a median of 19.4 minutes (the router's figure). On run
36343240552, the job took 19m47s and its "Test suite" step took 1,103 s. That was
625 files, one after another, on one runner. The prompt asked for under 6 minutes
on a code push and under 2 on a docs-only push, with nothing less tested.

## The cost was mostly not the serial run

Per-file wall times came from the timestamps on the CI log's own per-file
lines (run 36343240552, job 108687291509). Three files were 596 s of the
1,102 s suite:

| file | CI | local, `main` + `integration` only |
|---|---|---|
| `tests/deploy-probe-cli.test.ts` | 490 s | 40 s |
| `tests/apply-migration-trace.test.ts` | 72 s | 13 s |
| `tests/apply-migration-guard.test.ts` | 34 s | 4 s |

All three drive `tools/deploy-probe.mjs`, which runs `tools/idea-status.py`.
Its `prompts()` does one `git show` per ledger entry per remote ref
(`ledger_refs` lists every `claude/**` and `codex/**` branch). `ci.yml`'s
`fetch-depth: 0`, added by prompt 0094, fetched all of them: 98 on the day,
102 refs in all. The controlled comparison, same machine, same file:

- `idea-status.py --json --since 205`, one call: 2.5 s with 3 refs, 42.5 s with
  102 refs.
- `tests/deploy-probe-cli.test.ts`: 40.0 s with 3 refs, 647.5 s with 102 refs.

No test reads an agent branch. `tests/idea-status.test.ts` and
`tests/migration-claims.test.ts` build their own fixture repositories. What
the tests do need is the full history of `origin/main` and `origin/integration`:

- the apply-migration and probe suites pass `--ref origin/integration`;
- `idea-status.py` dates migrations from `git log origin/main`;
- `tests/identity-style-shared.test.ts` reads `git show f9d43b49^:…`;
- `history:verify` compares against a pre-split commit.

So every job now checks out at depth 1, then runs
`git fetch --unshallow` for `main` and a plain fetch for `integration`. The
`--unshallow` also completes the checked-out tip's own history. Measured with
a depth-1 clone of `integration`'s tip, which is not on `main`: 3,202 commits
afterwards, the same as the source.

## The shape

- **`scope`** always runs. It decides `full` or `docs`, then runs the VANGUARD
  changelog check and `history:verify`. On a docs-only push it also runs the
  document-reading tests. It has a gate step in the old pattern.
- **`check`** runs `npm run check`, shallow. A depth-1 clone (one commit) gave
  0 errors, 37 warnings in 20 files, the baseline.
- **`test`** runs `npm test -- --shard=i/N` over a 5-entry matrix, with
  `fail-fast: false`. N is `strategy.job-total`, so the count is written once.
  It runs `npx svelte-kit sync` first, which it used to get from
  `npm run check` in the same job.
- **`ci`** needs all three. It fails unless `scope` passed and `check` and
  `test` both passed, or both were skipped on a docs run. What it catches
  beyond a red shard: a full run whose suite was skipped.
- `check` and `test` run on `!cancelled() && mode != 'docs'`. An empty mode,
  from a `scope` that died, runs everything. `always()` would have kept a
  cancelled run's shards going.
- **The docs-only diff base is the merge base with `origin/main`** for
  every ref but `main`. The first draft used the push's own `before`, and a
  self-review found the hole in it. A session pushes code, then a ledger
  entry a minute later. The cancel below kills the code push's run. A
  `before` diff then calls the second push docs-only, and the tip reads green
  over code nothing tested, which `integrate.yml` would merge. Only `main`,
  whose runs are never cancelled, diffs from `before`.
- **`concurrency`** cancels in progress for pushes to any branch but `main`.
  Every other trigger gets a group with its run id, so nothing cancels it. A
  called run's group starts `ci-`, so it can never equal `deploy.yml`'s
  `deploy` and deadlock.
- **`cache: npm`** on the two jobs that always install.

## Phase A: the audit, with the commands

1. **Does the sequencer encode an order that matters?** Yes, one: the isolation
   pair. `db-isolation-a` leaves a database behind; `db-isolation-b`'s positive
   control reads it off the same cluster. Every other file must pass in any
   order.
2. **Do DB files share state across files?** Only through the cluster: roles,
   which the stub creates with `if not exists` and a few tests create by name,
   plus that pair's deliberate leak. Each file gets its own database
   (`grep -rln "pg_database\|pg_roles\|create role" tests`). Sharding only
   reduces what shares a cluster.
3. **Does `--shard` work with the sequencer?** Mechanically yes: `shard()` is
   inherited from `BaseSequencer`, and `sort()` runs on its output. But vitest
   cuts contiguous slices of a sha1-of-path order, and the pair split at every N
   from 3 to 10 (computed from vitest 4.1.10's own `calculateShardRange`).
   Proven by running it: with `origin/main`'s sequencer, `npm test --
   --shard=5/5` failed `db-isolation-b` with `expected 0 to be greater than 0`.
   The new `shard()` takes B out, lets vitest cut the rest as before, and puts
   B back beside A. With it, all 5 shards passed and the pair ran in shard 4.
4. **Could non-DB node files run file-parallel?** Not proven, so not built.
   213 files use the DB harness, most of them outside `tests/db/`. Separating
   them safely would need an audit of every file's writes to the working tree.
   Sharding reached the target without it. The same count is why "boot Postgres
   only when a `tests/db/` file is in the run" was not built: a `tests/db/`
   path test would miss 134 DB files, and a boot costs about 5 s per shard.

## The docs-only path, and what the prompt's version would have lost

The prompt named three checks for a docs-only push. An fs-tracing run over
the whole suite recorded every working-tree read of `docs/**` or `*.md`, per
test file and per child process. The tracer was a `NODE_OPTIONS` preload,
not committed. It found 31 test files that read a document. Running only the
three named checks would have dropped the rest. So the fast path runs every
test file whose own source (comments stripped) names a document or a tool:
`docsReaderTests` in `tools/run-tests.mjs`, reached by `npm test --
--docs-only`. It selects 42 files. It covers every traced reader except
three groups:

- **13 files that only `stat` a README or PROVENANCE file under `src/` or
  `tests/`** during a directory walk. A change there is never docs-only, so
  the gap cannot be reached.
- **`tests/coin-transaction-types.test.ts`**, which reads
  `docs/coin-economy/archive/2026-08-11-transactions.csv` through a constant
  in `src/lib/coin-desk/transaction-types.ts`.
- **Vitest's main process, reading `mdm-content-seed.md`**, because
  `src/lib/frc/mdm-content.ts` imports it `?raw` as FRC page content. A root
  `*.md` file that is not documentation.

The second and third are why `--names-in-src` exists: a changed path that a
string literal in `src/` names is never docs-only. The literal can be the
path itself, or end in `/<path>` once any query is dropped. It names
exactly five files today: both seed files, that CSV, a `docs/policy/`
HTML the dev reference route imports, and the root `README.md`. All 11
import/export lines in `src/` that name a document survive the comment
stripping, which was checked because a `/*` inside a string could otherwise
swallow code.

The trace cannot see a Python child's reads. The tool-literal half of the rule
covers the tests that drive Python tools.

## Verified

- **Planted failures.** A failing test placed in shard 3 turned that shard red,
  and `npm test` exited 1 while vitest's own status was 0. A failing test the
  docs selector picks up, run through the docs step body cut out of `ci.yml`,
  turned the step red (exit 1).
- **Docs-only decisions.** `tests/workflows.test.ts` cuts `docs_only_paths`,
  `scope_mode` and `ci_result` out of `ci.yml` and runs them.
  - Path lists: 4 docs, 13 full, including `src/lib/profile.ts` alone and
    beside a ledger entry.
  - A fixture repository covering these cases:
    - a push to `main` diffing from `before`;
    - a branch whose ledger push follows a code push, which is full;
    - a new branch;
    - a force-push;
    - every non-push trigger, and a called ref;
    - no merge base;
    - a `?raw`-imported root `*.md`;
    - a `src`-named `docs/` file;
    - a comment-only citation, which stays docs.
  - The `ci_result` truth table: 2 green, 11 red.
- **Mutation checks.** Every mutant was killed, with the files restored from
  copies and md5-verified:
  - the `main`-only condition on the `before` base dropped (the branch hole
    reopened);
  - `src/*` dropped from the refusal;
  - the catch-all made docs;
  - an empty diff made docs;
  - `ci_result`'s docs arm or scope check made permissive;
  - non-push made eligible;
  - the shard denominator or the literal changed;
  - one fetch copy made depth-1;
  - `fail-fast` switched on;
  - no cancel;
  - an uncached test job;
  - the `src`-named check dropped, naming nothing, or ignoring relative
    imports;
  - comments counted, in the selector or in the `src` scan;
  - the doc or tool literal ignored;
  - everything selected.

  The first pass let three survive, and each test was tightened:
  - The `ci_result` docs arm: added `docs` rows where a job that should
    have been skipped failed.
  - The shard pin: a `toContain` still matched with a suffix; it is now an
    exact line.
  - `fail-fast`: the mutant hit a comment first; the pin is now the YAML line.
- **Shards.** Five of them, run locally three at a time under the tracer, all
  passed: 125 + 125 + 125 + 126 + 124 = 625 files, each file exactly once.
  Their per-file test counts match the serial baseline except where this
  bundle changed things:
  - `workflows.test.ts` went from 63 tests to 106 (108 by the end of the
    session).
  - Two files that failed in the serial baseline passed, because the fetch
    shape supplied their refs.
- **`npm run check`.** 0 errors and 37 warnings in 20 files, which is 31
  `state_referenced_locally`, 5 `css_unused_selector` and 1
  `perf_avoid_nested_class`. The first run gave 13 errors: importing
  `tools/run-tests.mjs` from a test pulls it into type-checking. It now
  carries JSDoc types, as `deploy-probe.mjs` does.

## Measured before and after

Every figure below was measured on 2026-09-27.

- **Before, CI:** run 36343240552 took 19m47s. Checkout 7 s, `npm ci` 12 s,
  check 60 s, "Test suite" 1,103 s.
- **Before, local:** a serial `vitest run` in this container took 696 s wall,
  with 3 remote refs, so the probe files were already cheap there.
- **After, local:** vitest wall per shard was 175, 136, 162, 141 and 198 s,
  three processes at a time under the fs tracer, so slower than an idle
  runner. The docs-only path's three processes took 19, 21 and 81 s (one
  process: 105 s).
- **After, CI:** not measured in this session before the push. The first
  run's figures are in the session's report. The projection from the numbers
  above: `scope` about 25 s, then the slowest shard at about 3 min, then
  `ci`, for about 4 minutes on a code push. A docs-only push should take
  about 2 minutes, most of it the one 42 s file. Treat both as projections
  until a run says otherwise.

## Not done, and for whom

- **`integrate.yml`'s merged-suite job** still checks out with
  `fetch-depth: 0`, so its own `npm test` pays the same ~490 s. Not this
  ledger's file.
- **`tests/git-refs-precondition.ts`'s refusal message** still says
  `ci.yml` uses `fetch-depth: 0`. The advice is still sound for a single job.
  The file is outside this ledger's list.
- **`idea-status.py`'s per-ref `git show`** is the root cost, and batching it
  (one `git cat-file --batch`) would make the checkout shape matter less.
  Not this ledger's file.
- **The docs-only path's floor** is `tests/deploy-probe-cli.test.ts` at about
  42 s. It reads `docs/migrations-applied/`, so it stays on the path.
