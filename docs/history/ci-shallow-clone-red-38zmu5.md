---
title: "`main` was red because CI cloned one commit, and the two tests said it was the tool's fault (`claude/ci-shallow-clone-red-38zmu5`)"
date: 2026-09-06
branches: [claude/ci-shallow-clone-red-38zmu5]
migrations: []
subsystems: ["Operations", "Migration tooling"]
---

Prompt 0094. No migration written and none applied; no connection was opened to
production and `IDEA_MIGRATION_URL` was never read. A CI and test-harness
bundle: it changes one workflow line, two test files, one new shared test
module, and what `tools/apply-migration.mjs` PRINTS when it cannot read the
applied set. The tool's exit codes, refusals and fail-closed logic are
byte-identical.

## What was wrong

`origin/main` at `e06ed58` was red in CI (run 34060552250: 2 failed of 6301,
309 of 311 files passing) and green in every session that ran the suite
locally, including prompt 0089's 311/6301 measurement taken minutes before it
pushed. Both failures pointed at `tools/apply-migration.mjs`:

    tests/apply-migration-guard.test.ts:474
      expected 'apply-migration: 0180_notebook_grid_a…'
        to match /REFUSING to apply 0180_notebook_grid_…/

    tests/apply-migration-trace.test.ts:715
      the CLI did not apply 0042

The tool was right. Both suites drive the real CLI with `--ref
origin/integration`; that reaches `migrationsOnlyOn` in
`tools/deploy-probe.mjs`, which lists `supabase/migrations` on `origin/main`
and then on the ref it was given. `.github/workflows/ci.yml` used
`actions/checkout@v4` with no `fetch-depth`, whose default is one commit and a
refspec naming only the ref that triggered the run — so `origin/integration`
did not exist in the checkout, the applied-set read threw, and the tool
answered

    REFUSING: the applied set could not be read
    (could not list supabase/migrations on origin/integration).
    Cannot say is never a pass.

exit 2, nothing applied. That is its designed fail-closed path and the only
control standing between a session and the production database.

**The ledger's diagnosis named the wrong ref, and the CI log settles it.** The
issued entry says `origin/main` does not exist in that checkout. It does:
`checkout@v4` creates `refs/remotes/origin/<triggering ref>`, and the real
error names `origin/integration`. Reproduced here at `--depth 1`:
`git ls-tree origin/main -- supabase/migrations` succeeds, `origin/integration`
fails. The mechanism the entry describes — a narrow checkout, the applied-set
read failing, the tool refusing correctly — is right in every other respect.

## Reproduced before anything was changed

A `--depth 1` clone of `e06ed58`, `node_modules` symlinked, `svelte-kit sync`
run: both suites failed with the same messages at the same lines, 474:22 and
715:6. The FULL suite in that clone gave **2 failed of 6301, 309 of 311 files**
— the same two, and nothing else. That is the measured answer to "what else in
the tree is intolerant of a shallow clone": in the automated suite, nothing.

## What changed

**`fetch-depth: 0` on `ci.yml`'s checkout.**

**On the runner it costs nothing measurable, and that is the reading that
settles it.** Two `ubuntu-latest` runs of this job, three minutes apart, same
repository, same branch: the `actions/checkout@v4` step took **6s** under the
old default (run 34061189403, 21:28:51→21:28:57) and **6s** with `fetch-depth:
0` (run 34062080600, 21:46:46→21:46:52). `npm ci` alone is twice that and the
suite is thirty times it.

The shape was chosen before that confirmation, off-runner, against this
repository (1,702 commits) — three clones of each from github.com:

| shape | wall clock | `.git` |
| --- | --- | --- |
| `--depth 1` (the old default) | 9.80 / 7.77 / 7.73s | 161M |
| full (`fetch-depth: 0`) | 8.30 / 8.26 / 7.35s | 172M |
| `--depth 1` + targeted fetch of `integration` | 9.77 / 9.06 / 9.51s | 163M |

The first single-shot reading made the full clone look 1.3s dearer and the
targeted fetch look like a legitimate cheaper option. Three runs each say
otherwise: the two ranges overlap, the full clone's best is the fastest number
in the table, and the targeted fetch is the only shape that is consistently
slower — a second round trip costs more than the objects it saves. What is real
is 11M more `.git`. It also fixes one named ref where the full fetch cannot go
stale the next time a test names a different one. `deploy.yml` and
`integrate.yml` already both pinned `fetch-depth: 0`; `ci.yml` was the last one
that did not.

**A free upgrade fell out of it.** `npm run history:verify` used to print `git
byte compare : unavailable` in CI, because the pre-split tree was not reachable
from a shallow checkout. On a full clone it prints `IDENTICAL against
ea9f043b6c`, measured. The step got strictly stronger and its comment in
`ci.yml` was corrected in the same edit.

**The two suites now refuse to pass silently.** `tests/git-refs-precondition.ts`
is one new module both call from `beforeAll`, in the describes that spawn the
CLI. It asks the question with the tool's OWN reader — `migrationsOnlyOn`,
which is the exact function that throws on the real path and which covers both
refs in one call — rather than a hand-written `git ls-tree` that would be a
second implementation of "can this checkout see that ref", free to stop
agreeing with the one that actually refuses. It also exports `PROBE_REF`, so
the ref the precondition checks and the ref the spawn arguments pass cannot
drift apart; both files now use it instead of five string literals.

It FAILS rather than skips. A skip would let the suite go green in a checkout
where it proved nothing about the tool at all, which is the vacuity shape this
repository keeps finding (prompt 0082's inert `until`, prompt 0084's missing
controls).

**Positive control, in the `--depth 1` clone, required and demonstrated.** Both
suites now fail with

    THIS CHECKOUT CANNOT SEE THE REFS THE APPLIED-SET PROBE NEEDS, so this
    suite cannot say anything about tools/apply-migration.mjs. git said:
    could not list supabase/migrations on origin/integration
      This is a SHALLOW OR SINGLE-REF CHECKOUT, not a defect in the tool. …

and they fail in **1.43s instead of 5.61s**, because the precondition runs
before the migration chain is built.

**The tool's message, and only its message.** Under the unchanged refusal
sentence it now prints a cause block. Driven end to end against a real embedded
Postgres with a `--ref` that does not exist, before and after: the exit code is
**2 in both**, the refusal sentence is byte-identical in both, and `redact()`
is applied to the same string. The whole diff to `tools/apply-migration.mjs` is
one added function and three lines at the call site that print its output; the
`return EXIT.refused` beneath it is untouched.

## Measured

- **Full suite, normal clone: 311 files, 6301 tests, 0 failures, exit 0.**
  `npm test`, started 14:40:24 and ended 14:45:15 America/Los_Angeles on
  2026-09-06, 290.05s reported by vitest. The same tree in a `--depth 1` clone
  gives 2 failed of 6301.
- **`svelte-check`: 0 errors, 37 warnings in 20 files**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class` — the baseline, unmoved. Re-derived with
  `svelte-kit sync` first and the two `PUBLIC_SUPABASE_*` placeholders
  exported.
- **`tests/derived-numbers.test.ts`: 18 passed.** This bundle adds no route
  spec, so no counts region is regenerated and none needed to be.
- **`npm run history:verify`: 168 entries, sha256 IDENTICAL, and the git byte
  compare now IDENTICAL** rather than unavailable.
- **CI IS GREEN, measured on the runner.** Run 34062080600 on `5073db38` (the
  commit carrying every substantive change): job `test` conclusion **success**,
  every step green, suite 21:47:42 to 21:51:24 = **3m42s**, against 3m30s for
  the same branch's last shallow run. The full history costs the suite nothing
  either.
  - **AND THE ACTIONS API LIED ABOUT IT FOR AN HOUR, WHICH IS WORTH KNOWING
    BEFORE SOMEBODY ELSE DIAGNOSES A STALL THAT IS NOT THERE.** Read through
    the GitHub MCP tools from this container, the job reported `Test suite:
    in_progress` with a frozen `updated_at` for more than sixty minutes after
    it had in fact completed, on two runs at once, and the in-progress job's
    logs answer HTTP 404. Two independent runs appearing stuck at the same step
    reads exactly like a real hang. The discriminator is to re-read the JOB
    (not the run) later, or open the run in a browser; a cached snapshot never
    corrects itself on the timescale you are watching.

## What was NOT verified

- **Nothing about production.** No migration applied, no `IDEA_MIGRATION_URL`
  connection, no Supabase project reached. Prompt 0073 already proved a cloud
  container cannot reach that host and this bundle did not test the claim
  again.
- **`integration` and `main` have not been run under `fetch-depth: 0`.** CI is
  green on this branch (below), which is the same job over the same tree; the
  other two refs get their runs when this lands.
- **No browser pass.** This bundle renders nothing.
- **`tools/idea-status.py` was not exercised against a shallow clone on its
  own.** It survives one — the reproduction shows it producing a probe list at
  `--depth 1`, with `migrationsOnlyOn` the only thing that threw — but its
  behaviour with `origin/main` genuinely absent was not measured.

## Deferred, and why

**`ci.yml` is the only workflow this touches.** `integrate.yml` and
`deploy.yml` already pin `fetch-depth: 0` and were left alone.

**Nothing was done about the other git readers, because nothing needs it.**
Classified, with the shallow full-suite run as the evidence for the tests:

| reader | tolerant of a shallow, single-ref checkout? |
| --- | --- |
| `tests/apply-migration-guard.test.ts` | **no** — fixed here |
| `tests/apply-migration-trace.test.ts` | **no** — fixed here |
| `tests/idea-status.test.ts` | yes — builds its own fixture repo and `update-ref`s its own `origin/main` and `origin/integration` |
| `tests/migration-claims.test.ts` | yes — imports pure functions, reads ledger files from disk, shells out to nothing |
| `tests/workflows.test.ts` | yes — parses the workflow YAML as text |
| `tests/derived-numbers.test.ts` | yes — reads the counts regions from disk; `origin/main` appears only in a comment |
| `tests/db/bucket-limits-probe.test.ts` | yes — deliberately skips the git plumbing and calls `first_object` on the shipped bytes |
| `docs/history/_tools/verify-split.mjs` (a CI step) | yes — catches the failed `git show` and falls back to sha256; now does the real compare |
| `tools/check-vanguard-changelog.mjs` (a CI step) | yes — reads no git at all |
| `tools/migration-claims.mjs` | yes — says in words that no `origin/claude/**` ref is visible and prints the fetch command |
| `tools/browser-verify/readme-counts.mjs` | yes — `rev-parse HEAD` and `status --porcelain` only |
| `tools/browser-verify/routes/_tools/split-routes.mjs` | **no** — `git show <pinned rev>`; not run by CI, and a generator a person runs |
| `tools/standards-sweep.py` | yes — makes its own `--depth 1` clone and says so |
| `vite.config.ts` | yes, deliberately — detects the shallow clone and emits no version rather than one that slides backwards |
| `tools/idea-status.py`, `tools/deploy-probe.mjs`, `tools/apply-migration.mjs` | **no**, by design — fail-closed; not run by CI except through the two suites above |

`split-routes.mjs` is the one intolerant reader left standing. It is a
one-shot generator, it is not on any CI path, and it already fails loudly
rather than silently; giving it a precondition would be inventing a caller for
it. Named here so the next reader does not have to find it the way these two
were found.
