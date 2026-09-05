---
title: "A green CI run counts however it was triggered, and the last outstanding branch lands (`claude/land-item-images-ci-filter-9wqyn8`, no migration)"
date: 2026-09-05
branches: [claude/land-item-images-ci-filter-9wqyn8, claude/item-images-thumbnails-l3bhxp]
migrations: []
subsystems: ["CI and integration", "IDEA Classroom", "Rich text", "Browser harness"]
---

Prompt 0037. Two things, and the second is why the first was still outstanding.

## What was wrong

`integrate.yml` asks the Actions API for each `claude/**` branch's CI
conclusion, and the query passed `-f event=push`. So it only ever saw runs a
PUSH had started. On 2026-09-04 three finished branches were re-run green by
`workflow_dispatch` -- which is the obvious remedy for a branch that went red
for a reason since fixed -- the query came back empty for their shas, all three
read as `CI on <sha> is unknown` rather than as anything at all, the sweep
skipped every one, nothing merged, so the target push was discarded, so the
deploy stayed blocked. A person merged all three by pull request instead
(#73, #74, #75), which is visible in `integration`'s own history.

The shape of the failure is what makes it worth writing down: the remedy a
person reaches for FIRST when a branch is red is the one the sweep was written
not to see, and the sweep reported the branch as `unknown` rather than as
anything that reads like a problem.

## The audit, and where the prompt's claims did and did not hold

- The query did pass `-f event=push`, at `integrate.yml`'s per-branch loop,
  alongside `-f branch=`, `-f status=completed` and `-f per_page=30`.
- `ci.yml` declares more triggers than the prompt claimed. It has `push`,
  `schedule` and `workflow_dispatch` as stated, **and also `pull_request`
  (branches: [main]) and `workflow_call`**. The extra two matter: `workflow_call`
  is how `deploy.yml` runs the checks on `integration`'s tip, and
  `pull_request` is the shape a FORK's run takes in our Actions -- which turns
  out to be load-bearing, below.
- The test file conflict was as described, an add/add, and the counts README and
  `classroom-updates.json` were the other two.
- The counts block's outside-threshold rows were ZERO, as claimed
  (`"outside":0,"outsideRows":[]`).

## The fix, and the half that must not weaken

The `gh api` call drops `-f event=` and the selection becomes a function,
`ci_conclusion`, cut out of `integrate.yml` at `ci_gate_marker` and driven by
`tools/integrate-gate-proof.sh` the way `ledger_gate` and `auto_resolve` already
are. **The split between the fetch and the decision is the point**: the `gh api`
half needs a token, a network and a repository full of real runs, and the
DECISION half needs none of the three. The decision is the half that got this
wrong, so the decision is the half that is now drivable against fixture
payloads.

Widening WHICH TRIGGERS count must never widen WHICH COMMIT counts. `head_sha ==
$sha` is untouched, and two things replaced what `event=push` was doing by
accident:

- **A `head_repository` guard.** A fork's CI run lands in OUR Actions as a
  `pull_request` run, so the trigger filter had been excluding it as a side
  effect. The job-level `if` only ever covered the TRIGGERING branch, never the
  ones the sweep reads. Dropping the filter without this would newly admit one.
- **`sort_by(.run_number) | last` matters more than it did.** With one trigger, a
  sha had one run. With every trigger a sha can carry a red push run AND the
  green hand re-run that fixed it, and the answer is the LATER one -- in both
  directions.

`per_page` goes 30 to 50, because the window now has to hold a branch's runs from
every trigger and not just its pushes. `.workflow_runs // []` replaces
`.workflow_runs[]` so a 404 or rate-limit body reduces to `unknown` instead of
aborting the whole step under `pipefail`.

## What was measured

Fourteen new harness cases (51 total, all green), and **every one bites on its
own mutation**, with `integrate.yml` restored byte-identically after each
(md5 `c03c11dc0aa2fdc0a2dfbc68fddd74d4`):

| mutation | reddens |
| --- | --- |
| `event=push` put back inside the function | 36, 37, 41, 42, 43 |
| the `head_sha` match dropped | 39 alone |
| the `head_repository` guard dropped | 44 alone |
| `first` array element instead of newest | 41, 42 |
| `last` without the `sort_by` | 43 alone |

**Two of those are findings rather than confirmations.** The first mutation
reddens case 42 in the MERGE direction: under `event=push`, a green push run
followed by a red hand re-run of the same commit merged. That is a second defect
the old filter carried that nobody had noticed, and it is the opposite failure
from the one that was reported -- the reported one refused to merge something
green, this one merged something red. The second is that mutants B and C did not
apply on their first attempt (a shell-quoting slip put `\$sha` into the anchor)
and the harness came back `passed 51, failed 0` -- the "mutation suite that
suddenly all passes" tell that `CLAUDE.md` names, caught here only because
python printed a traceback above it. They were re-applied from a file and both
then reddened exactly one case.

Suite: **261 files, 5454 tests, all passing**, run 2026-09-04 18:09-18:13 PDT.
`svelte-check`: **0 errors, 37 warnings**, breakdown 31 `state_referenced_locally`
/ 5 `css_unused_selector` / 1 `perf_avoid_nested_class`, re-derived rather than
trusted, with the two placeholder `PUBLIC_SUPABASE_*` values exported before the
sync. Browser pass: **196 route/width runs, 2762 measurements, 0 outside
threshold, 453.1s, 70 selftest controls, 0 instrument failures**, on a clean tree
at commit `4dc9df8`. `tests/db/classroom-hall-pass-limits.test.ts` passed all 24
-- the run was at 18:13 Pacific, outside the 22:00-02:00 window prompt 0034
identified, so this bundle says nothing about whether that is fixed.

## The merge, and the file nobody was asked about

Two of the three conflicts were resolved **by the sweep's own code, not by a
hand edit that agrees with it**: `auto_resolve` was cut out of `integrate.yml`
at its markers and run against the real merge. It kept both appends in
`classroom-updates.json` (119 at the merge base, one entry from each side, 121
after) and took the target's side inside the counts README's generated markers,
regenerating the static region on the merged tree -- 97 specs to 98, 50 routes
to 51, 81 dev pages to 82, 194 runs to 196, which is the `/dev/item-images` page
and route spec the branch adds. It correctly REFUSED to do any of that while the
test file was still conflicted, which is the all-or-nothing property working.

`tests/db/classroom-item-image-gate.test.ts` resolves to the target's side
WHOLE, and the reason is stronger than "it is newer". The two sides differ in
exactly three places -- a header paragraph, one import, and Part 5's two `it()`
blocks -- and every other assertion is identical, so the branch contributes no
assertion the target lacks. What the branch's Part 5 has is a parity claim
between `docText` and the `body` column asserting an image projects the empty
string; that claim moved to `tests/db/classroom-doc-text-images.test.ts`, where
it is made over a whole corpus against the migration the shipped mirror actually
mirrors. And it is **no longer true in the branch's form**: putting the branch's
side back fails with `expected 'A bearing' to be ''`, measured, with the other
17 tests still passing. The resolved file passes 18 of 18.

**Then the suite found a fourth file, and it is the reason a merge is run rather
than only inspected.** `tests/classroom-item-images.test.ts` arrives with the
branch, does not exist on `integration`, and so was merged SILENTLY with no
conflict and nothing asking anybody about it -- carrying the identical pre-0178
assumption that the conflicting file had been resolved out of. It failed the
full suite on `expected 'A bearing' to be ''`. Both of its values are now
measured off the shipped module rather than re-derived from the migration, and
both bite: mutating `richDocText`'s `img` arm back to `''` fails it again.

## Not verified

- **The `gh api` call itself.** The harness proves the DECISION against fixture
  payloads; it cannot make the call, because that needs a token and a network.
  What parameters the query sends is asserted off the file in
  `tests/workflows.test.ts` instead, and the two halves together cover the path.
  Whether GitHub's real answer has the shape these fixtures claim is not proved
  here, and the fixtures were written from the documented workflow-run object.
- **The fix does not take effect until `integration` reaches `main`.** GitHub
  runs the DEFAULT-BRANCH copy of a `workflow_run` workflow, so the sweep that
  runs on the next push is still `main`'s, with the old filter in it. Until a
  person deploys, a branch re-run green by hand is still invisible.
- No migration was written and none was applied. Nothing here touched the live
  Supabase project.
- `prefers-reduced-motion` is `no-preference` in the browser harness and every
  non-loopback request is blocked, so text was measured in the fallback stack.

## Deferred

- **The three already-contained `claude/**` branches are still standing**
  (`idea-maps-public-viewer-hxz2cx`, `pipeline-automation-probe-ln83ek`,
  `unblock-pipeline-deadlock-j239zg`). Every commit on each is reachable from
  both `integration` and `main`, so the sweep's "Already contained, deleted"
  path should take them on its next run -- but that path is in `integration`'s
  copy of the workflow, and see the default-branch note above. They are not
  outstanding work; they are refs waiting for a sweep.
- The `event=push` filter at the JOB level, in `integrate.yml`'s `if:`, is
  UNCHANGED and deliberately so. It decides what STARTS a sweep, which is a
  different question from what a sweep COUNTS, and the two only ever had the
  same answer by accident. A scheduled or dispatched CI run still does not kick
  off a sweep; **Run workflow** on Integrate is how a person does that.
